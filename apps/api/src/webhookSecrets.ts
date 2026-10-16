import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey(): Buffer {
  const decoded = Buffer.from(process.env.WEBHOOK_SECRET_ENCRYPTION_KEY ?? "", "base64");
  if (decoded.length !== 32) throw new Error("Webhook secret encryption is not configured.");
  return decoded;
}

export function webhookSecretEncryptionConfigured(): boolean {
  return Buffer.from(process.env.WEBHOOK_SECRET_ENCRYPTION_KEY ?? "", "base64").length === 32;
}

export function encryptWebhookSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptWebhookSecret(value: string): string {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("Stored webhook secret is invalid.");
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url"));
  if (iv?.length !== 12 || tag?.length !== 16 || !ciphertext?.length) throw new Error("Stored webhook secret is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
