import asyncio
import multiprocessing
import os
import time
import unittest
from generation_process import GenerationProcessError, run_generation_process


def successful_worker(sender):
    sender.send(("result", b"test output"))
    sender.close()


def failing_worker(sender):
    sender.send(("error", "out_of_memory"))
    sender.close()


def large_output_worker(sender):
    sender.send(("result", b"x" * (4 * 1024 * 1024)))
    sender.close()


def stalled_worker(sender):
    time.sleep(60)


def crashed_worker(sender):
    os._exit(1)


async def connected():
    return False


async def disconnected():
    return True


class ProcessCleanupTests(unittest.IsolatedAsyncioTestCase):
    async def test_crashed_child_is_reaped_without_hanging(self):
        with self.assertRaises(GenerationProcessError) as caught:
            await run_generation_process(crashed_worker, (), connected, 10)
        self.assertEqual(caught.exception.code, "generation_failed")
        self.assertEqual(multiprocessing.active_children(), [])

    async def test_output_larger_than_pipe_buffer_is_returned_before_cleanup(self):
        output = await run_generation_process(large_output_worker, (), connected, 10)
        self.assertEqual(len(output), 4 * 1024 * 1024)
        self.assertEqual(multiprocessing.active_children(), [])

    async def test_real_child_exits_after_success_and_error(self):
        self.assertEqual(await run_generation_process(successful_worker, (), connected, 10), b"test output")
        self.assertEqual(multiprocessing.active_children(), [])
        with self.assertRaises(GenerationProcessError) as caught:
            await run_generation_process(failing_worker, (), connected, 10)
        self.assertEqual(caught.exception.code, "out_of_memory")
        self.assertEqual(multiprocessing.active_children(), [])

    async def test_disconnected_and_timed_out_requests_leave_no_process(self):
        for probe, timeout, expected in ((disconnected, 10, "request_cancelled"), (connected, 0.2, "generation_timeout")):
            with self.subTest(expected=expected), self.assertRaises(GenerationProcessError) as caught:
                await run_generation_process(stalled_worker, (), probe, timeout)
            self.assertEqual(caught.exception.code, expected)
            self.assertEqual(multiprocessing.active_children(), [])

    async def test_task_cancellation_also_terminates_child(self):
        task = asyncio.create_task(run_generation_process(stalled_worker, (), connected, 10))
        await asyncio.sleep(0.2)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertEqual(multiprocessing.active_children(), [])
