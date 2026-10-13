import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.env.ARTIFACT_ROOT ?? resolve(import.meta.dirname, "../../../.data/artifacts"));
const MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;

export async function savePng(bytes: Buffer): Promise<{ id: string; storageKey: string; byteSize: number; checksum: string }> {
  if (bytes.length === 0 || bytes.length > MAX_ARTIFACT_BYTES) throw new Error("Image output is empty or exceeds the 25 MB limit.");
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Image runner returned an invalid PNG.");
  const id = randomUUID();
  const storageKey = `${id}.png`;
  await mkdir(root, { recursive: true });
  await writeFile(resolve(root, storageKey), bytes, { flag: "wx", mode: 0o600 });
  return { id, storageKey, byteSize: bytes.length, checksum: createHash("sha256").update(bytes).digest("hex") };
}

export async function readArtifact(storageKey: string): Promise<Buffer> {
  if (!/^[0-9a-f-]{36}\.png$/.test(storageKey)) throw new Error("Invalid artifact key.");
  return readFile(resolve(root, storageKey));
}

export async function removeArtifact(storageKey: string): Promise<void> {
  if (/^[0-9a-f-]{36}\.png$/.test(storageKey)) await rm(resolve(root, storageKey), { force: true });
}
