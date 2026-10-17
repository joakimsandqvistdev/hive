import asyncio
import multiprocessing
import os
import time


class GenerationProcessError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


class _PersistentSender:
    def __init__(self, connection):
        self.connection = connection

    def send(self, message):
        self.connection.send(message)

    def close(self):
        pass


def _persistent_worker_loop(connection, worker):
    try:
        while True:
            try:
                arguments = connection.recv()
            except EOFError:
                return
            if arguments is None:
                return
            try:
                worker(_PersistentSender(connection), *arguments)
            except BaseException:
                connection.send(("error", "generation_failed"))
    finally:
        connection.close()


class PersistentGenerationProcess:
    """Serialize jobs through one spawned worker, retaining its process state on success."""

    def __init__(self, worker):
        self.worker = worker
        self.process = None
        self.connection = None
        self.pipeline_loaded = False

    def _start(self):
        context = multiprocessing.get_context("spawn")
        parent, child = context.Pipe(duplex=True)
        process = context.Process(target=_persistent_worker_loop, args=(child, self.worker), daemon=True)
        process.start()
        child.close()
        self.connection = parent
        self.process = process

    async def stop(self, *, terminate=False):
        process, connection = self.process, self.connection
        self.process = None
        self.connection = None
        self.pipeline_loaded = False
        if process is None:
            return
        if process.is_alive() and not terminate:
            try:
                connection.send(None)
            except (BrokenPipeError, EOFError, OSError):
                terminate = True
        if process.is_alive() and terminate:
            process.terminate()
        await asyncio.to_thread(process.join, 5)
        if process.is_alive():
            process.kill()
            await asyncio.to_thread(process.join)
        connection.close()
        process.close()

    async def run(self, arguments, disconnected, timeout_seconds=3600):
        if self.process is None or not self.process.is_alive():
            await self.stop(terminate=True)
            self._start()
        deadline = time.monotonic() + timeout_seconds
        try:
            await asyncio.to_thread(self.connection.send, arguments)
            while True:
                if await disconnected():
                    raise GenerationProcessError("request_cancelled")
                if time.monotonic() >= deadline:
                    raise GenerationProcessError("generation_timeout")
                try:
                    has_message = self.connection.poll()
                except (BrokenPipeError, EOFError, OSError):
                    raise GenerationProcessError("generation_failed") from None
                if has_message:
                    try:
                        message = await asyncio.to_thread(self.connection.recv)
                    except (EOFError, OSError):
                        raise GenerationProcessError("generation_failed") from None
                    if message[0] == "error":
                        raise GenerationProcessError(message[1])
                    if message[0] == "result" and isinstance(message[1], (bytes, str)):
                        self.pipeline_loaded = True
                        return message[1]
                    raise GenerationProcessError("generation_failed")
                if not self.process.is_alive():
                    raise GenerationProcessError("generation_failed")
                await asyncio.sleep(0.1)
        except BaseException:
            await self.stop(terminate=True)
            raise


async def run_generation_process(target, arguments, disconnected, timeout_seconds=3600, environment=None):
    # Spawn rather than fork: CUDA contexts must not be inherited by children.
    context = multiprocessing.get_context("spawn")
    receiver, sender = context.Pipe(duplex=False)
    process = context.Process(target=target, args=(sender, *arguments), daemon=True)
    started = False
    deadline = time.monotonic() + timeout_seconds
    try:
        previous_environment = {key: os.environ.get(key) for key in (environment or {})}
        try:
            os.environ.update(environment or {})
            process.start()
        finally:
            for key, value in previous_environment.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
        started = True
        sender.close()
        while True:
            if await disconnected():
                raise GenerationProcessError("request_cancelled")
            if time.monotonic() >= deadline:
                raise GenerationProcessError("generation_timeout")
            try:
                has_message = receiver.poll()
            except (BrokenPipeError, EOFError, OSError):
                raise GenerationProcessError("generation_failed") from None
            if has_message:
                try:
                    message = await asyncio.to_thread(receiver.recv)
                except EOFError:
                    raise GenerationProcessError("generation_failed") from None
                if message[0] == "error":
                    raise GenerationProcessError(message[1])
                if message[0] == "result" and isinstance(message[1], (bytes, str)):
                    return message[1]
                raise GenerationProcessError("generation_failed")
            if not process.is_alive():
                raise GenerationProcessError("generation_failed")
            await asyncio.sleep(0.1)
    finally:
        # No request leaves model weights or CUDA allocations in a surviving child.
        if started:
            if process.is_alive():
                process.terminate()
            await asyncio.to_thread(process.join, 5)
            if process.is_alive():
                process.kill()
                await asyncio.to_thread(process.join)
        receiver.close()
        sender.close()
        process.close()
