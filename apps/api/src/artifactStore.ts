import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.env.ARTIFACT_ROOT ?? resolve(import.meta.dirname, "../../../.data/artifacts"));
const MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

async function saveGenerated(bytes: Buffer, extension: "png" | "jpg" | "mp4" | "wav", maxBytes: number, minimumBytes: number, formatIsValid: (data: Buffer) => boolean, sizeError: string, formatError: string) {
  if (bytes.length < minimumBytes || bytes.length > maxBytes) throw new Error(sizeError);
  if (!formatIsValid(bytes)) throw new Error(formatError);
  const id = randomUUID();
  const storageKey = `${id}.${extension}`;
  await mkdir(root, { recursive: true });
  await writeFile(resolve(root, storageKey), bytes, { flag: "wx", mode: 0o600 });
  return { id, storageKey, byteSize: bytes.length, checksum: createHash("sha256").update(bytes).digest("hex") };
}

export async function saveJpeg(bytes: Buffer) {
  return saveGenerated(bytes, "jpg", MAX_ARTIFACT_BYTES, 4, (data) => data.subarray(0, 3).toString("hex") === "ffd8ff", "Image output is empty or exceeds the 25 MB limit.", "Image conversion returned an invalid JPEG.");
}

export function artifactPath(storageKey: string): string {
  if (!/^[0-9a-f-]{36}\.(?:png|mp4|jpg|webp|wav|mp3|ogg|flac)$/.test(storageKey)) throw new Error("Invalid artifact key.");
  return resolve(root, storageKey);
}

export async function savePng(bytes: Buffer): Promise<{ id: string; storageKey: string; byteSize: number; checksum: string }> {
  return saveGenerated(bytes, "png", MAX_ARTIFACT_BYTES, 1, (data) => data.subarray(0, 8).toString("hex") === "89504e470d0a1a0a", "Image output is empty or exceeds the 25 MB limit.", "Image runner returned an invalid PNG.");
}

export async function saveMp4(bytes: Buffer): Promise<{ id: string; storageKey: string; byteSize: number; checksum: string }> {
  return saveGenerated(bytes, "mp4", MAX_VIDEO_BYTES, 12, (data) => data.subarray(4, 8).toString("ascii") === "ftyp", "Video output is empty or exceeds the 50 MB limit.", "Video runner returned an invalid MP4.");
}

export async function saveWav(bytes: Buffer): Promise<{ id: string; storageKey: string; byteSize: number; checksum: string }> {
  return saveGenerated(bytes, "wav", MAX_ARTIFACT_BYTES, 44, (data) => data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WAVE", "Audio output is empty or exceeds the 25 MB limit.", "Audio runner returned an invalid WAV.");
}

export async function readArtifact(storageKey: string): Promise<Buffer> {
  return readFile(artifactPath(storageKey));
}

export async function removeArtifact(storageKey: string): Promise<void> {
  if (/^[0-9a-f-]{36}\.(?:png|mp4|jpg|webp|wav|mp3|ogg|flac)$/.test(storageKey)) await rm(resolve(root, storageKey), { force: true });
}

export function detectUpload(bytes: Buffer, dataTypeId: string) {
  if (!bytes.length || bytes.length > (dataTypeId === "image" ? 10 : 25) * 1024 * 1024) throw new Error("Upload is empty or exceeds its size limit.");
  const ascii = (start: number, end: number) => bytes.subarray(start, end).toString("ascii");
  if (dataTypeId === "image") {
    if (bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return { mediaType: "image/png", extension: "png" };
    if (bytes.subarray(0, 3).toString("hex") === "ffd8ff") return { mediaType: "image/jpeg", extension: "jpg" };
    if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { mediaType: "image/webp", extension: "webp" };
  } else if (dataTypeId === "audio") {
    if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return { mediaType: "audio/wav", extension: "wav" };
    if (ascii(0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1]! & 224) === 224)) return { mediaType: "audio/mpeg", extension: "mp3" };
    if (ascii(0, 4) === "OggS") return { mediaType: "audio/ogg", extension: "ogg" };
    if (ascii(0, 4) === "fLaC") return { mediaType: "audio/flac", extension: "flac" };
  }
  throw new Error("Unsupported file content. Use PNG, JPEG, WebP, WAV, MP3, Ogg, or FLAC.");
}

export async function saveUpload(bytes: Buffer, dataTypeId: string) {
  const detected = detectUpload(bytes, dataTypeId);
  const id = randomUUID();
  const storageKey = `${id}.${detected.extension}`;
  await mkdir(root, { recursive: true });
  await writeFile(resolve(root, storageKey), bytes, { flag: "wx", mode: 0o600 });
  return { id, storageKey, byteSize: bytes.length, checksum: createHash("sha256").update(bytes).digest("hex"), mediaType: detected.mediaType };
}
