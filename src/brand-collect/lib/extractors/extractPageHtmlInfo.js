/**
 * Extract rendered page HTML for Dify analysis.
 * Only removes <script> tags; everything else is kept as-is.
 * Must remain self-contained — no external imports (used via page.evaluate).
 */
export function extractPageHtmlInfo() {
  function getMetaContent(selector) {
    return document.querySelector(selector)?.getAttribute('content')?.trim() ?? null;
  }

  function extractBrandName() {
    const ogSiteName = getMetaContent('meta[property="og:site_name"]');
    if (ogSiteName) return ogSiteName;

    const ogTitle = getMetaContent('meta[property="og:title"]');
    if (ogTitle) {
      const part = ogTitle.split(/[|\-–—]/)[0].trim();
      if (part) return part;
    }

    const title = document.title?.trim();
    if (title) {
      const part = title.split(/[|\-–—]/)[0].trim();
      if (part) return part;
    }

    return new URL(location.href).hostname.replace(/^www\./, '').split('.')[0];
  }

  const clone = document.documentElement.cloneNode(true);
  clone.querySelectorAll('script').forEach((el) => el.remove());

  const html = `<!DOCTYPE html>\n${clone.outerHTML}`;
  const removedScriptCount = document.querySelectorAll('script').length;

  return {
    url: location.href,
    brandName: extractBrandName(),
    html,
    stats: {
      htmlLength: html.length,
      removedScriptCount,
      title: document.title?.trim() ?? null,
    },
  };
}

export async function collectPageHtmlInfo(page) {
  return page.evaluate(extractPageHtmlInfo);
}
