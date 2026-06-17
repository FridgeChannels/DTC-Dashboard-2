import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const VIEWPORT = { width: 1440, height: 900 };
const GOTO_TIMEOUT = 60000;
const SETTLE_MS = 2500;

async function navigateToPage(page, url) {
  try {
    await page.goto(url, { waitUntil: 'load', timeout: GOTO_TIMEOUT });
  } catch (error) {
    const message = error?.message ?? '';
    const retriable =
      message.includes('Timeout') || message.includes('net::ERR');

    if (!retriable) throw error;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT });
  }

  await page
    .waitForSelector('header, main, [role="main"], body', { timeout: 15000 })
    .catch(() => {});

  await dismissOverlays(page);
  await page.waitForTimeout(SETTLE_MS);
}

async function dismissOverlays(page) {
  const dismissSelectors = [
    'button:has-text("Accept")',
    'button:has-text("Accept All")',
    'button:has-text("I Agree")',
    'button:has-text("Got it")',
    '[aria-label="Close"]',
    '.cookie-banner button',
  ];

  for (const selector of dismissSelectors) {
    const button = page.locator(selector).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(300);
      break;
    }
  }
}

export async function captureHomepage(url, outputDir) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await navigateToPage(page, url);

    const screenshotPath = path.join(outputDir, 'homepage.png');
    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
    });

    const brandName = await extractBrandName(page);
    const industry = await extractIndustry(page);

    return { page, browser, screenshotPath, brandName, industry };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function extractBrandName(page) {
  return page.evaluate(() => {
    const ogSiteName = document
      .querySelector('meta[property="og:site_name"]')
      ?.getAttribute('content');
    if (ogSiteName?.trim()) return ogSiteName.trim();

    const ogTitle = document
      .querySelector('meta[property="og:title"]')
      ?.getAttribute('content');
    if (ogTitle?.trim()) {
      const part = ogTitle.split(/[|\-–—]/)[0].trim();
      if (part) return part;
    }

    const title = document.title?.trim();
    if (title) {
      const part = title.split(/[|\-–—]/)[0].trim();
      if (part) return part;
    }

    return new URL(location.href).hostname.replace(/^www\./, '').split('.')[0];
  });
}

async function extractIndustry(page) {
  return page.evaluate(() => {
    const industryMeta = document
      .querySelector('meta[name="industry"], meta[property="business:industry"]')
      ?.getAttribute('content');
    if (industryMeta?.trim()) return industryMeta.trim();

    const keywords = document
      .querySelector('meta[name="keywords"]')
      ?.getAttribute('content');
    if (keywords?.trim()) {
      const first = keywords.split(',')[0]?.trim();
      if (first) return first;
    }

    return null;
  });
}

export async function ensureOutputDir(baseDir) {
  await fs.mkdir(baseDir, { recursive: true });
  return baseDir;
}
