"""Shared exclusion lock for inference and operations that require model-cache safety."""

import asyncio

GENERATION_LOCK = asyncio.Semaphore(1)
