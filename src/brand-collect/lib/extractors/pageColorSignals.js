/**
 * Browser-side color signal extraction.
 * Must remain self-contained — no external imports (used via page.evaluate).
 */
export function extractPageColorSignals() {
  const CSS_VAR_PATTERNS = [
    /--primary/i,
    /--brand/i,
    /--color-primary/i,
    /--theme-color/i,
    /--accent/i,
    /--secondary/i,
    /--main/i,
    /--highlight/i,
  ];

  const CTA_SELECTORS = [
    'button:not([type="hidden"])',
    'a.btn',
    'a.button',
    'a[class*="btn"]',
    'a[class*="cta"]',
    '[class*="cta"]',
    '.buy',
    '.shop',
    '.cta',
    '[role="button"]',
  ];

  const HEADER_SELECTORS = ['header', 'nav', '[role="banner"]', '[role="navigation"]'];

  const LOGO_SELECTORS = [
    'header img[src*="logo" i]',
    'header img[alt*="logo" i]',
    'header svg',
    '[class*="logo" i] img',
    '[class*="logo" i] svg',
    'img[src*="logo" i]',
    'img[alt*="logo" i]',
  ];

  function normalizeHex(hex) {
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

  function rgbToHex(r, g, b) {
    const toHex = (n) =>
      Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
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

  function parseColorValue(value) {
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
      return rgbToHex(
        parseFloat(rgbMatch[1]),
        parseFloat(rgbMatch[2]),
        parseFloat(rgbMatch[3])
      );
    }

    const hslMatch = trimmed.match(
      /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)$/i
    );
    if (hslMatch) {
      const alpha = hslMatch[4] !== undefined ? parseFloat(hslMatch[4]) : 1;
      if (alpha < 0.1) return null;
      return hslToHex(
        parseFloat(hslMatch[1]),
        parseFloat(hslMatch[2]),
        parseFloat(hslMatch[3])
      );
    }

    return null;
  }

  function isNearWhiteOrBlack(hex) {
    const normalized = normalizeHex(hex);
    if (!normalized) return true;

    const r = parseInt(normalized.slice(1, 3), 16);
    const g = parseInt(normalized.slice(3, 5), 16);
    const b = parseInt(normalized.slice(5, 7), 16);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;

    if (max < 30) return true;
    if (min > 240 && saturation < 0.08) return true;
    return false;
  }

  function addCandidate(list, color, source, detail) {
    const hex = parseColorValue(color);
    if (!hex || isNearWhiteOrBlack(hex)) return;
    list.push({ color: hex, source, detail });
  }

  function extractCssVariables() {
    const candidates = [];
    const seenVars = new Set();

    function collectFromStyleText(text, origin) {
      if (!text) return;
      const varRegex = /(--[\w-]+)\s*:\s*([^;}{]+)/g;
      let match;
      while ((match = varRegex.exec(text)) !== null) {
        const varName = match[1];
        const varValue = match[2].trim();
        if (seenVars.has(varName)) continue;

        const isRelevant = CSS_VAR_PATTERNS.some((pattern) => pattern.test(varName));
        if (!isRelevant) continue;

        seenVars.add(varName);
        const resolved = parseColorValue(varValue) ?? parseColorValue(
          getComputedStyle(document.documentElement).getPropertyValue(varName)
        );
        if (resolved) {
          addCandidate(candidates, resolved, 'css-var', `${origin} ${varName}: ${varValue}`);
        }
      }
    }

    for (const sheet of document.styleSheets) {
      try {
        const rules = sheet.cssRules ?? sheet.rules;
        if (!rules) continue;
        for (const rule of rules) {
          if (rule.selectorText === ':root' || rule.selectorText?.includes(':root')) {
            collectFromStyleText(rule.cssText, ':root');
          }
          if (rule.cssText?.includes('--')) {
            collectFromStyleText(rule.cssText, rule.selectorText ?? 'stylesheet');
          }
        }
      } catch {
        // Cross-origin stylesheets
      }
    }

    document.querySelectorAll('style').forEach((styleEl, index) => {
      collectFromStyleText(styleEl.textContent, `style[${index}]`);
    });

    const rootStyle = getComputedStyle(document.documentElement);
    for (const pattern of CSS_VAR_PATTERNS) {
      for (let i = 0; i < rootStyle.length; i++) {
        const prop = rootStyle[i];
        if (!pattern.test(prop)) continue;
        const value = rootStyle.getPropertyValue(prop).trim();
        if (!value || seenVars.has(prop)) continue;
        seenVars.add(prop);
        addCandidate(candidates, value, 'css-var', `:root computed ${prop}`);
      }
    }

    const themeColor = document
      .querySelector('meta[name="theme-color"]')
      ?.getAttribute('content');
    if (themeColor) {
      addCandidate(candidates, themeColor, 'css-var', 'meta theme-color');
    }

    return candidates;
  }

  function extractElementColors(selectors, source, properties) {
    const candidates = [];
    const seen = new Set();

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (seen.has(el)) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width < 4 || rect.height < 4) continue;
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

        seen.add(el);
        const computed = getComputedStyle(el);

        for (const prop of properties) {
          const value = computed.getPropertyValue(prop);
          if (value) {
            addCandidate(candidates, value, source, `${selector} ${prop}`);
          }
        }

        const inlineStyle = el.getAttribute('style');
        if (inlineStyle) {
          for (const prop of properties) {
            const match = inlineStyle.match(new RegExp(`${prop}\\s*:\\s*([^;]+)`, 'i'));
            if (match) {
              addCandidate(candidates, match[1], source, `${selector} inline ${prop}`);
            }
          }
        }
      }
    }

    return candidates;
  }

  function extractSvgColors(svgEl) {
    const candidates = [];
    const elements = [svgEl, ...svgEl.querySelectorAll('*')];

    for (const el of elements) {
      for (const attr of ['fill', 'stroke']) {
        const attrVal = el.getAttribute(attr);
        if (attrVal && attrVal !== 'none' && !attrVal.startsWith('url(')) {
          addCandidate(candidates, attrVal, 'logo_svg', `svg ${attr} attribute`);
        }
        const computed = getComputedStyle(el)[attr];
        if (computed && computed !== 'none' && !computed.startsWith('url(')) {
          addCandidate(candidates, computed, 'logo_svg', `svg computed ${attr}`);
        }
      }
    }

    return candidates;
  }

  function extractLogoColors() {
    const candidates = [];

    for (const selector of LOGO_SELECTORS) {
      const el = document.querySelector(selector);
      if (!el) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      if (rect.width > 600 || rect.height > 300) continue;

      if (el.tagName.toLowerCase() === 'svg') {
        candidates.push(...extractSvgColors(el));
      } else {
        const computed = getComputedStyle(el);
        addCandidate(candidates, computed.backgroundColor, 'logo_img', `${selector} background`);
        addCandidate(candidates, computed.borderColor, 'logo_img', `${selector} border`);
      }
      break;
    }

    return candidates;
  }

  const cssVarCandidates = extractCssVariables();
  const ctaCandidates = extractElementColors(
    CTA_SELECTORS,
    'cta',
    ['background-color', 'border-color', 'color']
  );
  const headerCandidates = extractElementColors(
    HEADER_SELECTORS,
    'header',
    ['background-color', 'border-color', 'color']
  );
  const logoCandidates = extractLogoColors();

  return {
    cssVar: cssVarCandidates,
    cta: ctaCandidates,
    header: headerCandidates,
    logo: logoCandidates,
  };
}

export async function collectPageColorSignals(page) {
  return page.evaluate(extractPageColorSignals);
}
