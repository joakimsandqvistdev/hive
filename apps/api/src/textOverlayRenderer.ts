import sharp from "sharp";
import type { TextOverlaySettings } from "./processingNodes.js";

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
  const horizontalPlacement = settings.placement.endsWith("left") ? "left" : settings.placement.endsWith("right") ? "right" : "center";
  const boxLeft = horizontalPlacement === "left" ? margin : horizontalPlacement === "right" ? width - margin - maxWidth : Math.round((width - maxWidth) / 2);
  const x = settings.alignment === "left" ? boxLeft : settings.alignment === "right" ? boxLeft + maxWidth : boxLeft + maxWidth / 2;
  const y = settings.placement.startsWith("top") ? margin + settings.fontSize : settings.placement.startsWith("bottom") ? height - margin - blockHeight + settings.fontSize : Math.round((height - blockHeight) / 2) + settings.fontSize;
  const anchor = settings.alignment === "left" ? "start" : settings.alignment === "right" ? "end" : "middle";
  const tspans = lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${settings.fontFamily}" font-size="${settings.fontSize}" font-weight="${settings.fontWeight}" fill="${settings.color}" stroke="#000000" stroke-opacity="0.45" stroke-width="${Math.max(1, settings.fontSize / 16)}" stroke-linejoin="round" paint-order="stroke">${tspans}</text></svg>`;
  return image.composite([{ input: Buffer.from(svg), blend: "over" }]).png().toBuffer();
}
