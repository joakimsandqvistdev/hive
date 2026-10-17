import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const sources = [
  ["https://raw.githubusercontent.com/fontsource/google-font-metadata/main/data/google-fonts-v2.json", process.argv[2]],
  ["https://raw.githubusercontent.com/fontsource/google-font-metadata/main/data/variable.json", process.argv[3]],
];

async function loadJson([url, path]) {
  if (path) return JSON.parse(await readFile(resolve(path), "utf8"));
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download Google Fonts metadata (${response.status}).`);
  return response.json();
}

const [staticCatalog, variableCatalog] = await Promise.all(sources.map(loadJson));
const catalog = new Map();

for (const entry of Object.values(staticCatalog)) {
  const files = {};
  for (const [weight, styles] of Object.entries(entry.variants ?? {})) {
    for (const [style, subsets] of Object.entries(styles ?? {})) {
      const urls = subsets?.latin?.url ?? Object.values(subsets ?? {}).find((subset) => subset?.url)?.url;
      const url = urls?.truetype ?? urls?.opentype;
      if (url) files[`${weight}:${style}`] = url;
    }
  }
  if (Object.keys(files).length) catalog.set(entry.id, {
    id: entry.id,
    family: entry.family,
    category: entry.category,
    weights: entry.weights,
    styles: entry.styles,
    files,
  });
}

for (const entry of Object.values(variableCatalog)) {
  const variants = entry.variants ?? {};
  const selected = variants.full ?? variants.standard ?? variants.wght ?? Object.values(variants)[0];
  const fontUrl = selected?.normal?.latin ?? selected?.italic?.latin ?? Object.values(selected?.normal ?? {})[0];
  const italicFontUrl = selected?.italic?.latin;
  if (!fontUrl) continue;
  const current = catalog.get(entry.id) ?? { id: entry.id, family: entry.family, category: "sans-serif", weights: [], styles: ["normal"], files: {} };
  current.axes = Object.fromEntries(Object.entries(entry.axes ?? {}).map(([tag, axis]) => [tag, {
    min: Number(axis.min),
    max: Number(axis.max),
    default: Number(axis.default),
    step: Number(axis.step),
  }]));
  current.variableUrl = fontUrl;
  if (italicFontUrl) current.variableItalicUrl = italicFontUrl;
  catalog.set(entry.id, current);
}

const output = [...catalog.values()].sort((a, b) => a.family.localeCompare(b.family));
const generated = `// Snapshot from fontsource/google-font-metadata (Google Fonts API v2 + variable-font metadata).\n// Regenerate with: node scripts/updateGoogleFontsCatalog.mjs [static-json-path] [variable-json-path]\nexport type GoogleFontAxis = { min: number; max: number; default: number; step: number };\nexport type GoogleFontDefinition = { id: string; family: string; category: string; weights: number[]; styles: string[]; axes?: Record<string, GoogleFontAxis>; files: Record<string, string>; variableUrl?: string; variableItalicUrl?: string };\nexport const googleFontsCatalog: GoogleFontDefinition[] = ${JSON.stringify(output)};\n`;
await writeFile(resolve("apps/api/src/googleFontsCatalog.ts"), generated);
console.log(`Wrote ${output.length} font families to apps/api/src/googleFontsCatalog.ts.`);
