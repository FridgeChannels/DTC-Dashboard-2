import { sendDifyChatMessage } from './difyClient.js';
import { normalizeHex } from './colorUtils.js';

const FALLBACK_COLORS = {
  primary: '#000000',
  secondary: '#333333',
  accent: '#FFFFFF',
};

function buildDifyQuery(pageInfo) {
  const header = [
    '请根据以下网站 HTML，分析品牌主色和强调色。',
    `URL: ${pageInfo.url}`,
    pageInfo.brandName ? `品牌: ${pageInfo.brandName}` : '',
    '',
  ]
    .filter(Boolean)
    .join('\n');

  return `${header}${pageInfo.html ?? ''}`;
}

function extractJsonObject(text) {
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const trimmed = candidate.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(trimmed.slice(start, end + 1));
        } catch {
          // continue
        }
      }
    }
  }

  return null;
}

function extractHexColors(text) {
  const matches = text.match(/#[0-9A-Fa-f]{6}\b/g) ?? [];
  return [...new Set(matches.map((hex) => normalizeHex(hex)).filter(Boolean))];
}

function resolveColorValue(value) {
  if (!value) return null;
  if (typeof value === 'string') return normalizeHex(value);
  if (typeof value === 'object' && value.hex) return normalizeHex(value.hex);
  return null;
}

function pickColor(parsed, keys) {
  for (const key of keys) {
    const resolved = resolveColorValue(parsed?.[key]);
    if (resolved) return resolved;
  }
  return null;
}

function pickColorMeta(parsed, keys) {
  for (const key of keys) {
    const entry = parsed?.[key];
    if (!entry || typeof entry !== 'object') continue;
    const hex = resolveColorValue(entry);
    if (!hex) continue;
    return { hex, rgb: entry.rgb ?? null };
  }
  return null;
}

function deriveSecondaryFromPrimary(primaryHex) {
  const rgb = hexToRgb(primaryHex);
  if (!rgb) return FALLBACK_COLORS.secondary;

  const factor = 0.65;
  return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const value = normalized.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function parseBrandColorsFromDifyAnswer(answer) {
  const parsed = extractJsonObject(answer);

  const primaryMeta = pickColorMeta(parsed, [
    'primary_color',
    'primaryColor',
    'primary',
  ]);
  const secondaryMeta = pickColorMeta(parsed, [
    'secondary_color',
    'secondaryColor',
    'secondary',
  ]);
  const accentMeta = pickColorMeta(parsed, [
    'accent_color',
    'accentColor',
    'accent',
    'highlight_color',
    'highlight',
  ]);

  const colors = {
    primary:
      primaryMeta?.hex ||
      pickColor(parsed, ['primary_color', 'primaryColor', 'primary', 'main']) ||
      null,
    secondary:
      secondaryMeta?.hex ||
      pickColor(parsed, ['secondary_color', 'secondaryColor', 'secondary', 'sub']) ||
      null,
    accent:
      accentMeta?.hex ||
      pickColor(parsed, ['accent_color', 'accentColor', 'accent', 'highlight']) ||
      null,
  };

  const hexFallback = extractHexColors(answer);
  if (!colors.primary && hexFallback[0]) colors.primary = hexFallback[0];
  if (!colors.accent) {
    const accentCandidate = hexFallback.find((hex) => hex !== colors.primary);
    if (accentCandidate) colors.accent = accentCandidate;
  }

  if (!colors.secondary && colors.primary) {
    colors.secondary = deriveSecondaryFromPrimary(colors.primary);
  }

  return {
    primary: colors.primary ?? FALLBACK_COLORS.primary,
    secondary: colors.secondary ?? FALLBACK_COLORS.secondary,
    accent: colors.accent ?? FALLBACK_COLORS.accent,
    meta: {
      primary: primaryMeta,
      secondary: secondaryMeta,
      accent: accentMeta,
    },
    parsedFromJson: Boolean(parsed),
    rawAnswer: answer,
  };
}

export async function analyzeBrandColorsWithDify(pageInfo, options = {}) {
  const { conversationId = '' } = options;
  const query = buildDifyQuery(pageInfo);

  const difyResponse = await sendDifyChatMessage({
    query,
    inputs: options.inputs ?? {},
    conversationId,
  });

  const answer = difyResponse.answer ?? '';
  const colorResult = parseBrandColorsFromDifyAnswer(answer);

  return {
    colors: {
      primary: colorResult.primary,
      secondary: colorResult.secondary,
      accent: colorResult.accent,
    },
    colorMeta: colorResult.meta,
    dify: {
      answer,
      conversationId: difyResponse.conversation_id ?? conversationId,
      messageId: difyResponse.message_id ?? null,
      mode: difyResponse.mode ?? 'blocking',
      parsedFromJson: colorResult.parsedFromJson,
      queryLength: query.length,
    },
  };
}

export { buildDifyQuery };
