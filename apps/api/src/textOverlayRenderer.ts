import sharp from "sharp";
import { Resvg, type ResvgRenderOptions } from "@resvg/resvg-js";
import type { TextOverlaySettings } from "./processingNodes.js";
import { getGoogleFontFile, googleFontVariationSettings, resolveGoogleFont } from "./googleFonts.js";

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

function wrapText(text: string, maxCharacters: number) {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    if (!paragraph) { lines.push(""); continue; }
    let line = "";
    for (const rawWord of paragraph.split(/\s+/)) {
      let word = rawWord;
      while (word.length > maxCharacters) {
        if (line) { lines.push(line); line = ""; }
        lines.push(word.slice(0, maxCharacters));
        word = word.slice(maxCharacters);
      }
      const next = line ? `${line} ${word}` : word;
      if (line && next.length > maxCharacters) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function renderTextOverlay(source: Buffer, text: string, settings: TextOverlaySettings): Promise<Buffer> {
  const image = sharp(source, { limitInputPixels: 40_000_000 }).rotate();
  const metadata = await image.metadata();
  const swapsDimensions = metadata.orientation !== undefined && [5, 6, 7, 8].includes(metadata.orientation);
  const width = swapsDimensions ? metadata.height : metadata.width;
  const height = swapsDimensions ? metadata.width : metadata.height;
  if (!width || !height || !metadata.format || !["png", "jpeg", "webp"].includes(metadata.format)) throw new Error("Text Overlay requires a PNG, JPEG, or WebP image.");
  if (!text.trim() || text.length > 8000) throw new Error("Connect nonempty text of at most 8000 characters to Text Overlay.");

  const margin = Math.round(Math.min(width, height) * settings.margin / 100);
  const maxWidth = Math.max(1, width - margin * 2);
  const maxCharacters = Math.max(1, Math.floor(maxWidth / (settings.fontSize * 0.58)));
  const lines = wrapText(text, maxCharacters);
  const lineHeight = Math.round(settings.fontSize * settings.lineSpacing);
  const blockHeight = lines.length * lineHeight;
  const horizontalPlacement = settings.backgroundEnabled ? "center" : settings.placement.endsWith("left") ? "left" : settings.placement.endsWith("right") ? "right" : "center";
  const boxLeft = horizontalPlacement === "left" ? margin : horizontalPlacement === "right" ? width - margin - maxWidth : Math.round((width - maxWidth) / 2);
  const x = settings.backgroundEnabled
    ? settings.alignment === "left" ? margin : settings.alignment === "right" ? width - margin : Math.round(width / 2)
    : settings.alignment === "left" ? boxLeft : settings.alignment === "right" ? boxLeft + maxWidth : boxLeft + maxWidth / 2;
  const y = settings.placement.startsWith("top") ? margin + settings.fontSize : settings.placement.startsWith("bottom") ? height - margin - blockHeight + settings.fontSize : Math.round((height - blockHeight) / 2) + settings.fontSize;
  const anchor = settings.alignment === "left" ? "start" : settings.alignment === "right" ? "end" : "middle";
  const tspans = lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`).join("");
  const font = resolveGoogleFont(settings.fontFamily);
  if (!font) throw new Error("Selected Google Font is unavailable.");
  const fontFile = await getGoogleFontFile(font, settings);
  const variations = googleFontVariationSettings(font, settings);
  const outline = settings.outlineWidth > 0 && settings.outlineOpacity > 0
    ? `stroke="${settings.outlineColor}" stroke-opacity="${settings.outlineOpacity}" stroke-width="${settings.outlineWidth}" stroke-linejoin="round" paint-order="stroke"`
    : "";
  const shadow = settings.shadowOpacity > 0
    ? `<filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="${settings.shadowBlur}" result="blur"/><feOffset in="blur" dx="${settings.shadowOffsetX}" dy="${settings.shadowOffsetY}" result="offset"/><feFlood flood-color="${settings.shadowColor}" flood-opacity="${settings.shadowOpacity}"/><feComposite in2="offset" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
    : "";
  const background = settings.backgroundEnabled
    ? (() => {
      const padding = Math.round(Math.min(width, height) * settings.backgroundPadding / 100);
      const stripHeight = Math.min(height, blockHeight + padding * 2);
      const blockTop = y - settings.fontSize;
      const stripTop = Math.max(0, Math.min(height - stripHeight, blockTop - padding));
      return `<rect x="0" y="${stripTop}" width="${width}" height="${stripHeight}" fill="${settings.backgroundColor}" fill-opacity="${settings.backgroundOpacity}"/>`;
    })()
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs>${shadow}</defs>${background}<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${escapeXml(font.family)}" font-size="${settings.fontSize}" font-weight="${settings.fontWeight}" font-style="${settings.fontStyle}" font-variation-settings="${escapeXml(variations)}" letter-spacing="${settings.letterSpacing}" text-decoration="${settings.textDecoration}" fill="${settings.color}" ${outline} ${shadow ? 'filter="url(#shadow)"' : ""}>${tspans}</text></svg>`;
  const renderOptions = { font: { fontFiles: [fontFile], loadSystemFonts: false }, fitTo: { mode: "original" } } as unknown as ResvgRenderOptions;
  const overlay = new Resvg(svg, renderOptions).render().asPng();
  return image.composite([{ input: overlay, blend: "over" }]).png().toBuffer();
}

export async function prepareTextOverlayPreviewSource(source: Buffer): Promise<{ source: Buffer; scale: number }> {
  const metadata = await sharp(source, { limitInputPixels: 40_000_000 }).metadata();
  const swapsDimensions = metadata.orientation !== undefined && [5, 6, 7, 8].includes(metadata.orientation);
  const width = swapsDimensions ? metadata.height : metadata.width;
  const height = swapsDimensions ? metadata.width : metadata.height;
  if (!width || !height) throw new Error("Text Overlay preview requires a readable image.");

  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const previewSource = await sharp(source, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  return { source: previewSource, scale };
}

export async function renderPreparedTextOverlayPreview(prepared: { source: Buffer; scale: number }, text: string, settings: TextOverlaySettings): Promise<Buffer> {
  const previewSettings: TextOverlaySettings = {
    ...settings,
    fontSize: Math.max(1, settings.fontSize * prepared.scale),
    letterSpacing: settings.letterSpacing * prepared.scale,
    outlineWidth: settings.outlineWidth * prepared.scale,
    shadowBlur: settings.shadowBlur * prepared.scale,
    shadowOffsetX: settings.shadowOffsetX * prepared.scale,
    shadowOffsetY: settings.shadowOffsetY * prepared.scale,
  };
  return renderTextOverlay(prepared.source, text, previewSettings);
}
