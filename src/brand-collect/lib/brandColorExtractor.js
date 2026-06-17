import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { launchBrowserPage, navigateToPage } from './pageBrowser.js';
import { ensureOutputDir } from './screenshot.js';
import { collectPageHtmlInfo } from './extractors/extractPageHtmlInfo.js';
import { extractLogo } from './logoExtractor.js';
import { analyzeBrandColorsWithDify, buildDifyQuery } from './difyBrandColorAnalyzer.js';
import { isDifyConfigured } from './difyClient.js';

export function buildPageInfoPayload(pageInfo) {
  return {
    url: pageInfo.url,
    brandName: pageInfo.brandName,
    html: pageInfo.html,
    stats: pageInfo.stats,
  };
}

function validateUrl(url) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('URL must use http or https');
  }

  return parsedUrl;
}

function attachDebug(result, debugPayload) {
  if (!debugPayload) return result;
  return { ...result, debug: debugPayload };
}

export async function extractPageHtml(url, options = {}) {
  const { saveOutput = false, includeRawHtml = false } = options;
  const parsedUrl = validateUrl(url);

  const runId = Date.now().toString();
  const outputDir = saveOutput
    ? path.join(process.cwd(), 'output', runId)
    : await fs.mkdtemp(path.join(os.tmpdir(), 'brand-html-'));

  await ensureOutputDir(outputDir);

  let browser;
  try {
    const { browser: launchedBrowser, page } = await launchBrowserPage();
    browser = launchedBrowser;

    await navigateToPage(page, parsedUrl.href);

    const pageInfo = await collectPageHtmlInfo(page);
    const payload = buildPageInfoPayload(pageInfo);

    let rawHtmlPath = null;
    if (includeRawHtml || saveOutput) {
      rawHtmlPath = path.join(outputDir, 'page.html');
      await fs.writeFile(rawHtmlPath, pageInfo.html, 'utf8');
    }

    if (saveOutput) {
      const jsonPath = path.join(outputDir, 'page-info.json');
      await fs.writeFile(
        jsonPath,
        JSON.stringify(
          {
            url: payload.url,
            brandName: payload.brandName,
            stats: payload.stats,
          },
          null,
          2
        ),
        'utf8'
      );
    }

    return {
      runId,
      requestedUrl: parsedUrl.href,
      ...payload,
      rawHtmlPath: rawHtmlPath ? path.relative(process.cwd(), rawHtmlPath) : null,
      outputDir: saveOutput ? path.join(process.cwd(), 'output', runId) : null,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
    if (!saveOutput) {
      await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export async function extractBrandColors(url, options = {}) {
  if (!isDifyConfigured()) {
    throw new Error('DIFY_API_URL and DIFY_API_KEY must be configured in environment');
  }

  const { format = 'standard', saveOutput = false, debug = false, conversationId = '' } =
    options;
  const persistOutput = Boolean(saveOutput || debug);
  const parsedUrl = validateUrl(url);

  const runId = Date.now().toString();
  const outputDir = persistOutput
    ? path.join(process.cwd(), 'output', runId)
    : await fs.mkdtemp(path.join(os.tmpdir(), 'brand-color-'));

  await ensureOutputDir(outputDir);

  let browser;
  try {
    const { browser: launchedBrowser, page } = await launchBrowserPage();
    browser = launchedBrowser;

    await navigateToPage(page, parsedUrl.href);

    const pageInfo = await collectPageHtmlInfo(page);
    const pagePayload = buildPageInfoPayload(pageInfo);
    const { logoPath, logoBase64 } = await extractLogo(page, outputDir);

    const screenshotPath = path.join(outputDir, 'homepage.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const difyResult = await analyzeBrandColorsWithDify(pagePayload, { conversationId });
    const colors = difyResult.colors;
    const brandName = pageInfo.brandName;
    const industry = null;

    if (persistOutput) {
      await fs.writeFile(path.join(outputDir, 'page.html'), pageInfo.html, 'utf8');
      await fs.writeFile(
        path.join(outputDir, 'page-info.json'),
        JSON.stringify(
          {
            url: pagePayload.url,
            brandName: pagePayload.brandName,
            stats: pagePayload.stats,
          },
          null,
          2
        ),
        'utf8'
      );
      await fs.writeFile(
        path.join(outputDir, 'dify-response.json'),
        JSON.stringify(difyResult.dify, null, 2),
        'utf8'
      );
    }

    const debugPayload = debug
      ? {
          runId,
          url: parsedUrl.href,
          logoFound: Boolean(logoPath),
          pageInfo: pagePayload,
          difyQueryPreview: buildDifyQuery(pagePayload).slice(0, 2000),
          dify: difyResult.dify,
          colors,
          assets: {
            homepage: `/debug-output/${runId}/homepage.png`,
            logo: logoPath ? `/debug-output/${runId}/logo.png` : null,
          },
          outputDir: path.join(process.cwd(), 'output', runId),
        }
      : null;

    if (format === 'fc') {
      return attachDebug(
        {
          brandName,
          primaryColor: colors.primary,
          secondaryColor: colors.secondary,
          accentColor: colors.accent,
          logo: logoBase64 ? `data:image/png;base64,${logoBase64}` : null,
          industry,
          source: 'dify',
          conversationId: difyResult.dify.conversationId,
        },
        debugPayload
      );
    }

    if (format === 'standard') {
      return attachDebug(
        {
          brandName,
          colors,
          logo: logoBase64 ? `data:image/png;base64,${logoBase64}` : null,
          industry,
          source: 'dify',
          conversationId: difyResult.dify.conversationId,
        },
        debugPayload
      );
    }

    return attachDebug(
      {
        brandName,
        colors,
        meta: {
          url: parsedUrl.href,
          logoFound: Boolean(logoPath),
          source: 'dify',
          conversationId: difyResult.dify.conversationId,
        },
      },
      debugPayload
    );
  } finally {
    if (browser) {
      await browser.close();
    }
    if (!persistOutput) {
      await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
