# Decision 0020: Add Kokoro-82M as a local text-to-speech model

## Status

Accepted — 2026-10-14

## Context

Hive already supports canonical audio inputs and artifact previews, but the model catalog only covered image and video generation. A small local speech model can use the existing typed workflow and artifact paths without introducing a cloud API or a separate audio storage system.

## Decision

- Add `audio` to the model modality enum and register Kokoro-82M in the model catalog.
- Model I/O contract: one required `text` input on the `prompt` port and one `audio` output.
- Download model weights on demand through the existing allow-listed runner model manager.
- Run inference in an isolated temporary runner process; emit WAV audio and store it as a normal owner-scoped audio artifact.
- Expose a curated English voice selector and speech-speed control. The connected text prompt is the model input; workflow node settings do not concatenate another prompt.
- Add the Kokoro package and its `espeak-ng` runtime dependency to the runner image. Download the compatible spaCy `en_core_web_sm` pipeline alongside Kokoro weights into the persistent model cache, and add it to the isolated inference process's module path. This avoids Misaki's runtime network install and keeps model data out of the runner image. List licenses independently. eSpeak NG is GPL-3.0-or-later and its upstream project includes files under other licenses; preserve its notices in the distributed runner image.
- Replace the enum type with one containing `audio`, then seed the model catalog in the following migration. PostgreSQL disallows using an enum value added by `ALTER TYPE ... ADD VALUE` until transaction commit, and Drizzle applies pending migrations transactionally.

## Consequences

Kokoro output can connect to existing audio-capable ports and uses existing WAV playback in run previews. Runner images gain a Python package and system speech-engine dependency. This change adds a new runner build requirement; it does not apply database migrations, download weights, or refresh running containers.
