import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { artifactPath } from "./artifactStore.js";
import type { StillImageVideoSettings } from "./processingNodes.js";

type FileInput = { storageKey: string; mediaType: string; bytes: Buffer };

export async function renderStillImageVideo(image: FileInput, audio: FileInput | undefined, settings: StillImageVideoSettings, signal: AbortSignal) {
  const directory = await mkdtemp(join(tmpdir(), "hive-still-video-"));
  const imagePath = join(directory, `source${extname(image.storageKey)}`);
  const outputPath = join(directory, "output.mp4");
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-framerate", "24", "-i", imagePath];
  if (audio) args.push("-i", join(directory, `soundtrack${extname(audio.storageKey)}`));
  args.push("-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,fps=24,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-r", "24", "-t", String(settings.durationSeconds));
  if (audio) args.push("-filter_complex", `[1:a]volume=${settings.audioVolume / 100},apad,atrim=duration=${settings.durationSeconds}[sound]`, "-map", "0:v:0", "-map", "[sound]", "-c:a", "aac", "-b:a", "128k");
  else args.push("-an");
  args.push("-movflags", "+faststart", "-pix_fmt", "yuv420p", outputPath);
  try {
    await writeFile(imagePath, image.bytes, { mode: 0o600 });
    if (audio) await writeFile(join(directory, `soundtrack${extname(audio.storageKey)}`), audio.bytes, { mode: 0o600 });
    await new Promise<void>((resolve, reject) => {
      const process = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"], signal });
      let detail = "";
      process.stderr.setEncoding("utf8");
      process.stderr.on("data", (chunk: string) => { detail = (detail + chunk).slice(-4000); });
      process.once("error", reject);
      process.once("close", (code) => code === 0 ? resolve() : reject(new Error(signal.aborted ? "Video processing was cancelled." : `FFmpeg could not create the MP4 video. ${detail.trim()}`)));
    });
    const bytes = await readFile(outputPath);
    if (bytes.length > 50 * 1024 * 1024) throw new Error("Generated MP4 exceeds the 50 MB limit. Reduce the duration or use a smaller image.");
    return bytes;
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export function mediaPath(storageKey: string) { return artifactPath(storageKey); }
