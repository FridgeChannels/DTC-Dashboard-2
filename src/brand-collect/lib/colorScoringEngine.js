import {
  areColorsSimilar,
  isNearWhiteOrBlack,
  normalizeHex,
} from './colorUtils.js';

export const SOURCE_WEIGHTS = {
  'css-var': 10,
  cta: 9,
  logo_svg: 8,
  header: 7,
  logo_img: 6,
  hero: 3,
  screenshot: 1,
};

const SOURCE_GROUPS = {
  css: ['css-var'],
  cta: ['cta'],
  logo: ['logo_svg', 'logo_img'],
  image: ['hero', 'screenshot'],
};

const FALLBACK_COLORS = {
  primary: '#000000',
  secondary: '#333333',
  accent: '#FFFFFF',
};

function getSourceWeight(source) {
  return SOURCE_WEIGHTS[source] ?? 1;
}

function mergeCandidates(rawCandidates) {
  const merged = new Map();

  for (const candidate of rawCandidates) {
    const color = normalizeHex(candidate.color);
    if (!color || isNearWhiteOrBlack(color)) continue;

    const weight = getSourceWeight(candidate.source);
    const existing = merged.get(color);

    if (existing) {
      existing.score += weight;
      existing.hits += 1;
      existing.sources.push({
        source: candidate.source,
        weight,
        detail: candidate.detail ?? null,
      });
    } else {
      merged.set(color, {
        color,
        score: weight,
        hits: 1,
        sources: [
          {
            source: candidate.source,
            weight,
            detail: candidate.detail ?? null,
          },
        ],
      });
    }
  }

  return [...merged.values()].sort((a, b) => b.score - a.score || b.hits - a.hits);
}

function pickDistinctColors(ranked, count = 3, minDistance = 30) {
  const picked = [];

  for (const entry of ranked) {
    if (picked.length >= count) break;

    const tooSimilar = picked.some((item) => areColorsSimilar(item.color, entry.color, minDistance));
    if (tooSimilar) continue;

    picked.push(entry);
  }

  return picked;
}

function computeSourceBreakdown(ranked) {
  const totals = { css: 0, cta: 0, logo: 0, image: 0 };

  for (const entry of ranked) {
    for (const hit of entry.sources) {
      for (const [group, sources] of Object.entries(SOURCE_GROUPS)) {
        if (sources.includes(hit.source)) {
          totals[group] += hit.weight;
        }
      }
    }
  }

  const sum = Object.values(totals).reduce((acc, value) => acc + value, 0);
  if (sum === 0) {
    return { css: 0, cta: 0, logo: 0, image: 0 };
  }

  return {
    css: Math.round((totals.css / sum) * 100) / 100,
    cta: Math.round((totals.cta / sum) * 100) / 100,
    logo: Math.round((totals.logo / sum) * 100) / 100,
    image: Math.round((totals.image / sum) * 100) / 100,
  };
}

function computeConfidence(ranked, topPicks) {
  if (ranked.length === 0 || topPicks.length === 0) return 0;

  const totalScore = ranked.reduce((sum, entry) => sum + entry.score, 0);
  const topScore = topPicks[0].score;
  const dominance = topScore / Math.max(totalScore, 1);

  const sourceVariety = new Set(
    topPicks[0].sources.map((item) => item.source)
  ).size;
  const varietyBonus = Math.min(sourceVariety * 0.05, 0.15);

  return Math.round(Math.min(dominance + varietyBonus, 1) * 100) / 100;
}

export function scoreBrandColors(rawCandidates) {
  const ranked = mergeCandidates(rawCandidates);
  const topPicks = pickDistinctColors(ranked, 3);

  const colors = {
    primary: topPicks[0]?.color ?? FALLBACK_COLORS.primary,
    secondary: topPicks[1]?.color ?? FALLBACK_COLORS.secondary,
    accent: topPicks[2]?.color ?? FALLBACK_COLORS.accent,
  };

  const sources = computeSourceBreakdown(ranked);
  const confidence = computeConfidence(ranked, topPicks);

  return {
    colors,
    confidence,
    sources,
    candidates: ranked,
    selection: {
      primary: topPicks[0] ?? null,
      secondary: topPicks[1] ?? null,
      accent: topPicks[2] ?? null,
    },
    weights: SOURCE_WEIGHTS,
  };
}

export function flattenSignalGroups(signalGroups) {
  const all = [];

  for (const [group, items] of Object.entries(signalGroups)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      all.push({
        color: item.color,
        source: item.source ?? group,
        detail: item.detail ?? null,
      });
    }
  }

  return all;
}
