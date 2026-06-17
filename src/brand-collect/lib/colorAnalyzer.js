import { Vibrant } from 'node-vibrant/node';
import sharp from 'sharp';
import { isNearWhiteOrBlack, normalizeHex } from './colorUtils.js';

const IMAGE_SWATCH_PRIORITY = [
  'Vibrant',
  'DarkVibrant',
  'LightVibrant',
  'Muted',
  'DarkMuted',
  'LightMuted',
];

export async function prepareImageForAnalysis(imagePath) {
  const optimizedPath = `${imagePath}.optimized.png`;
  await sharp(imagePath)
    .resize({ width: 800, withoutEnlargement: true })
    .png()
    .toFile(optimizedPath);
  return optimizedPath;
}

export async function analyzeImageColors(imagePath) {
  const optimizedPath = await prepareImageForAnalysis(imagePath);
  const palette = await Vibrant.from(optimizedPath).getPalette();
  return palette;
}

export function paletteToCandidates(palette, source) {
  if (!palette) return [];

  const candidates = [];
  const totalPopulation = Object.values(palette).reduce(
    (sum, swatch) => sum + (swatch?.population ?? 0),
    0
  );

  for (const name of IMAGE_SWATCH_PRIORITY) {
    const swatch = palette[name];
    if (!swatch?.hex) continue;

    const hex = normalizeHex(swatch.hex);
    if (!hex || isNearWhiteOrBlack(hex)) continue;

    const population = swatch.population ?? 1;
    const populationRatio = totalPopulation > 0 ? population / totalPopulation : 0.1;
    const vibrancyBonus = name.includes('Vibrant') ? 1.2 : 1;

    candidates.push({
      color: hex,
      source,
      detail: `${name} (pop ${population}, ratio ${populationRatio.toFixed(2)})`,
      population,
      populationRatio,
      vibrancyBonus,
      swatch: name,
    });
  }

  return candidates;
}

export function paletteToSimpleObject(palette) {
  if (!palette) return {};

  const result = {};
  for (const [name, swatch] of Object.entries(palette)) {
    if (swatch?.hex) {
      result[name] = normalizeHex(swatch.hex);
    }
  }
  return result;
}
