import { chromium } from 'playwright';

export const VIEWPORT = { width: 1440, height: 900 };
export const GOTO_TIMEOUT = 60000;
export const SETTLE_MS = 2500;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function launchBrowserPage() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent: USER_AGENT,
  });
  const page = await context.newPage();
  return { browser, page };
}

export async function navigateToPage(page, url) {
  try {
    await page.goto(url, { waitUntil: 'load', timeout: GOTO_TIMEOUT });
  } catch (error) {
    const message = error?.message ?? '';
    const retriable = message.includes('Timeout') || message.includes('net::ERR');
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
