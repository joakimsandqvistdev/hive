# Superseded decision 0023: Integrate AnyText2 through an isolated runner

This integration was removed by [decision 0024](0024-remove-anytext2.md).

**Status:** Accepted

## Decision

Add AnyText2 as an image workflow model for exact text rendering on a source image. Its node takes four required connections: an image prompt, text to render, a source image, and a text-placement mask. The text input contains one line per separate white mask region, up to 20 characters per line. The output is one PNG.

Run upstream AnyText2 in its own Compose service and dependency image. The upstream code pins Python 3.10, PyTorch 2.1, and CUDA 11.8 and hardcodes CUDA in inference. The service is included only in the NVIDIA GPU Compose overlay, pins the upstream source commit, downloads weights from ModelScope on demand, and keeps its cache separate from the main runner.

Do not download the optional Chinese-to-English translation model. Hive supports multilingual text glyphs while requiring an English scene description, avoiding the translator's extra model download and GPU memory use.

## Rationale

Installing AnyText2 into Hive's main runner would replace or conflict with the existing PyTorch, CUDA, Diffusers, Transformers, and NumPy versions. Its source also assumes CUDA and expects both exact text strings and manually marked placement regions. Typed workflow inputs expose those requirements without changing the generic run API or weakening port validation.

## Consequences

- GPU users build an additional image and download a separate model cache before use.
- CPU-only launches do not build the AnyText2 image; the model appears unavailable in download status.
- Workflow authors must provide a mask with the same placement count as the text lines.
- Cancelling downloads preserves partial files to avoid deleting unrelated cache data.
- The source commit and dependencies must be reviewed and deliberately updated together.
