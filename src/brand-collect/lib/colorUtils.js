export function normalizeHex(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const trimmed = hex.trim();
  if (!trimmed || trimmed === 'transparent' || trimmed === 'none' || trimmed === 'inherit') {
    return null;
  }

  const value = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (/^#[0-9A-Fa-f]{3}$/.test(value)) {
    const [, r, g, b] = value;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
    return value.toUpperCase();
  }
  return null;
}

export function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;

  const value = normalized.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

export function rgbToHex(r, g, b) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function parseColorValue(value) {
  if (!value || typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed === 'transparent' || trimmed === 'none' || trimmed === 'inherit') {
    return null;
  }

  const hex = normalizeHex(trimmed);
  if (hex) return hex;

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i
  );
  if (rgbMatch) {
    const alpha = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;
    if (alpha < 0.1) return null;
    return rgbToHex(parseFloat(rgbMatch[1]), parseFloat(rgbMatch[2]), parseFloat(rgbMatch[3]));
  }

  const hslMatch = trimmed.match(
    /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)$/i
  );
  if (hslMatch) {
    const alpha = hslMatch[4] !== undefined ? parseFloat(hslMatch[4]) : 1;
    if (alpha < 0.1) return null;
    return hslToHex(parseFloat(hslMatch[1]), parseFloat(hslMatch[2]), parseFloat(hslMatch[3]));
  }

  return null;
}

function hslToHex(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function isNearWhiteOrBlack(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return true;

  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;

  if (max < 30) return true;
  if (min > 240 && saturation < 0.08) return true;
  return false;
}

export function colorDistance(hex1, hex2) {
  const a = hexToRgb(hex1);
  const b = hexToRgb(hex2);
  if (!a || !b) return Infinity;

  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

export function areColorsSimilar(hex1, hex2, threshold = 30) {
  return colorDistance(hex1, hex2) < threshold;
}
