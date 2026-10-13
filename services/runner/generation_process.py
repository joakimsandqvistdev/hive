import asyncio
import multiprocessing
import time


class GenerationProcessError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


async def run_generation_process(target, arguments, disconnected, timeout_seconds=3600):
    # Spawn rather than fork: CUDA contexts must not be inherited by children.
    context = multiprocessing.get_context("spawn")
    receiver, sender = context.Pipe(duplex=False)
    process = context.Process(target=target, args=(sender, *arguments), daemon=True)
    started = False
    deadline = time.monotonic() + timeout_seconds
    try:
        process.start()
        started = True
        sender.close()
        while True:
            if await disconnected():
                raise GenerationProcessError("request_cancelled")
            if time.monotonic() >= deadline:
                raise GenerationProcessError("generation_timeout")
            if receiver.poll():
                try:
                    message = await asyncio.to_thread(receiver.recv)
                except EOFError:
                    raise GenerationProcessError("generation_failed") from None
                if message[0] == "error":
                    raise GenerationProcessError(message[1])
                if message[0] == "result" and isinstance(message[1], bytes):
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
