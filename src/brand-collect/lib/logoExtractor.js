import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const LOGO_SELECTORS = [
  'header a[href="/"]',
  'header a[href="./"]',
  'header img[alt*="logo" i]',
  'header img[src*="logo" i]',
  'header img[class*="logo" i]',
  'header img[id*="logo" i]',
  'header a[href="/"] img',
  'header a[href="./"] img',
  'header svg',
  '.logo img',
  '.logo svg',
  '[class*="logo" i] img',
  '[class*="logo" i] svg',
  '[id*="logo" i] img',
  '[id*="logo" i] svg',
  'img[alt*="logo" i]',
  'img[src*="logo" i]',
  'header img',
  'nav img',
];

export async function extractLogo(page, outputDir) {
  const logoInfo = await findLogoElement(page);

  if (!logoInfo) {
    return { logoPath: null, logoBase64: null, logoType: null, svgColors: [] };
  }

  const logoPath = path.join(outputDir, 'logo.png');

  if (logoInfo.type === 'element') {
    const tagName = await logoInfo.locator
      .evaluate((el) => el.tagName.toLowerCase())
      .catch(() => '');
    const svgColors =
      tagName === 'svg'
        ? await extractSvgColorsFromElement(logoInfo.locator)
        : [];

    await logoInfo.locator.screenshot({ path: logoPath });
    const buffer = await fs.readFile(logoPath);
    return {
      logoPath,
      logoBase64: buffer.toString('base64'),
      logoType: tagName === 'svg' ? 'svg' : 'element',
      svgColors,
    };
  }

  const absoluteUrl = new URL(logoInfo.src, page.url()).href;
  const response = await page.request.get(absoluteUrl);
  if (!response.ok()) {
    return { logoPath: null, logoBase64: null, logoType: null, svgColors: [] };
  }

  const buffer = Buffer.from(await response.body());
  const contentType = response.headers()['content-type'] ?? '';

  if (contentType.includes('svg') || logoInfo.src.endsWith('.svg')) {
    const svgColors = parseSvgColorsFromText(buffer.toString('utf8'));
    await sharp(buffer).png().toFile(logoPath);
    const pngBuffer = await fs.readFile(logoPath);
    return {
      logoPath,
      logoBase64: pngBuffer.toString('base64'),
      logoType: 'svg',
      svgColors,
    };
  }

  await fs.writeFile(logoPath, buffer);
  return {
    logoPath,
    logoBase64: buffer.toString('base64'),
    logoType: 'img',
    svgColors: [],
  };
}

async function extractSvgColorsFromElement(locator) {
  return locator.evaluate((svgEl) => {
    const results = [];
    const seen = new Set();

    function add(color, detail) {
      if (!color || color === 'none' || color === 'transparent' || color.startsWith('url(')) {
        return;
      }
      const key = `${color}|${detail}`;
      if (seen.has(key)) return;
      seen.add(key);
      results.push({ color, detail });
    }

    const elements = [svgEl, ...svgEl.querySelectorAll('*')];
    for (const el of elements) {
      for (const attr of ['fill', 'stroke']) {
        const attrVal = el.getAttribute(attr);
        if (attrVal) add(attrVal, `svg ${attr} attribute`);
        const computed = getComputedStyle(el)[attr];
        if (computed) add(computed, `svg computed ${attr}`);
      }
    }

    return results;
  });
}

function parseSvgColorsFromText(svgText) {
  const results = [];
  const seen = new Set();
  const attrRegex = /\b(fill|stroke)\s*=\s*["']([^"']+)["']/gi;
  let match;

  while ((match = attrRegex.exec(svgText)) !== null) {
    const color = match[2];
    if (!color || color === 'none' || color === 'transparent' || color.startsWith('url(')) {
      continue;
    }
    const key = `${color}|${match[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ color, detail: `svg ${match[1]} attribute` });
  }

  return results;
}

async function findLogoElement(page) {
  for (const selector of LOGO_SELECTORS) {
    const locator = page.locator(selector).first();
    const count = await locator.count();
    if (count === 0) continue;

    const visible = await locator.isVisible().catch(() => false);
    if (!visible) continue;

    const box = await locator.boundingBox().catch(() => null);
    if (!box || box.width < 8 || box.height < 8) continue;
    if (box.width > 600 || box.height > 300) continue;

    const tagName = await locator.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
    if (tagName === 'img') {
      const src = await resolveImageSrc(locator);
      if (src && !src.startsWith('data:')) {
        return { type: 'url', src };
      }
    }

    if (tagName === 'svg' || tagName === 'a') {
      return { type: 'element', locator };
    }

    return { type: 'element', locator };
  }

  return null;
}

async function resolveImageSrc(locator) {
  const src = await locator.getAttribute('src').catch(() => null);
  if (src) return src;

  const srcset = await locator.getAttribute('srcset').catch(() => null);
  if (!srcset) return null;

  const candidates = srcset
    .split(',')
    .map((part) => part.trim().split(/\s+/))
    .map(([url, size]) => ({
      url,
      width: size?.endsWith('w') ? parseInt(size, 10) : 0,
    }))
    .filter((item) => item.url);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.width - a.width);
  return candidates[0].url;
}
