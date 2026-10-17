import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { googleFontsCatalog, type GoogleFontDefinition } from "./googleFontsCatalog.js";

const cacheRoot = resolve(process.env.GOOGLE_FONTS_CACHE_DIR ?? ".data/google-fonts");
const legacyAliases: Record<string, string> = {
  "Liberation Sans": "arimo",
  "Liberation Sans Narrow": "roboto-condensed",
  "Liberation Serif": "tinos",
  "Liberation Mono": "cousine",
  "DejaVu Sans": "noto-sans",
  "DejaVu Serif": "noto-serif",
  "DejaVu Sans Mono": "roboto-mono",
};

export function resolveGoogleFont(value: string): GoogleFontDefinition | undefined {
  const normalized = value.trim().toLocaleLowerCase();
  const id = legacyAliases[value] ?? value;
  return googleFontsCatalog.find((font) => font.id === id || font.family.toLocaleLowerCase() === normalized);
}

export function publicGoogleFont(font: GoogleFontDefinition) {
  return { id: font.id, family: font.family, category: font.category, weights: font.weights, styles: font.styles, axes: font.axes ?? {} };
}

function staticFontUrl(font: GoogleFontDefinition, settings: { fontWeight: number; fontStyle: string; fontAxes?: Record<string, number> }) {
  const variants = Object.keys(font.files).map((key) => {
    const [weight, style] = key.split(":");
    return { key, weight: Number(weight), style };
  });
  const desiredStyle = settings.fontStyle === "italic" ? "italic" : "normal";
  const matchingStyle = variants.filter((variant) => variant.style === desiredStyle);
  const candidates = matchingStyle.length ? matchingStyle : variants.filter((variant) => variant.style === "normal");
  const desiredWeight = settings.fontAxes?.wght ?? settings.fontWeight;
  const chosen = candidates.sort((a, b) => Math.abs(a.weight - desiredWeight) - Math.abs(b.weight - desiredWeight))[0];
  return chosen ? font.files[chosen.key] : undefined;
}

function pickerFontUrl(font: GoogleFontDefinition, settings: { fontWeight: number; fontStyle: string }) {
  if (font.variableUrl) return settings.fontStyle === "italic" ? font.variableItalicUrl ?? font.variableUrl : font.variableUrl;
  return staticFontUrl(font, settings);
}

async function ensureGoogleFontCached(url: string): Promise<string> {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "fonts.gstatic.com") throw new Error("The font catalog contains an invalid download URL.");
  const cachePath = resolve(cacheRoot, `${createHash("sha256").update(url).digest("hex")}${url.endsWith(".woff2") ? ".woff2" : ".ttf"}`);
  try { await readFile(cachePath); return cachePath; } catch { /* first use or cache refresh */ }
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Google Font download failed (${response.status}).`);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > 40 * 1024 * 1024) throw new Error("The requested font file is too large.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 40 * 1024 * 1024) throw new Error("The requested font file is empty or too large.");
  const validHeader = bytes.subarray(0, 4).toString("ascii") === "wOF2" || bytes.subarray(0, 4).toString("ascii") === "OTTO" || bytes.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0]));
  if (!validHeader) throw new Error("Google returned an invalid font file.");
  await mkdir(cacheRoot, { recursive: true });
  const tempPath = `${cachePath}.${randomUUID()}.tmp`;
  await writeFile(tempPath, bytes, { flag: "wx", mode: 0o600 });
  try { await rename(tempPath, cachePath); } catch (error) {
    await rm(tempPath, { force: true });
    try { await readFile(cachePath); return cachePath; } catch { throw error; }
  }
  return cachePath;
}

export async function getGoogleFontBuffer(font: GoogleFontDefinition, settings: { fontWeight: number; fontStyle: string }): Promise<Buffer> {
  const url = pickerFontUrl(font, settings);
  if (!url) throw new Error(`No downloadable font style is available for ${font.family}.`);
  return readFile(await ensureGoogleFontCached(url));
}

export async function getGoogleFontFile(font: GoogleFontDefinition, settings: { fontWeight: number; fontStyle: string; fontAxes?: Record<string, number> }): Promise<string> {
  const url = staticFontUrl(font, settings);
  if (!url) throw new Error(`No downloadable font style is available for ${font.family}.`);
  return ensureGoogleFontCached(url);
}

export function googleFontVariationSettings(font: GoogleFontDefinition, settings: { fontWeight: number; fontStyle: string; fontAxes?: Record<string, number> }) {
  if (!font.axes) return "";
  return Object.entries(font.axes).map(([tag, axis]) => {
    const defaultValue = tag === "wght" ? settings.fontWeight : tag === "ital" ? (settings.fontStyle === "italic" ? 1 : 0) : axis.default;
    const value = settings.fontAxes?.[tag] ?? defaultValue;
    return `"${tag}" ${value}`;
  }).join(", ");
}

export function listGoogleFonts() {
  return googleFontsCatalog.map(publicGoogleFont);
}
