function summarizeImageUrl(url) {
  if (!url) return '(empty)';
  if (url.startsWith('data:')) {
    const mime = url.slice(5, url.indexOf(';')) || 'image';
    return `base64:${mime} (${url.length} chars)`;
  }
  return url.length > 100 ? `${url.slice(0, 100)}...` : url;
}

export function productLog(step, detail = {}) {
  const safe = { ...detail };
  if ('imageUrl' in safe) {
    safe.imageUrl = summarizeImageUrl(safe.imageUrl);
  }
  console.log(`[api/products] ${step}`, safe);
}

export function productLogError(step, error, detail = {}) {
  console.error(`[api/products] ${step}`, {
    ...detail,
    error: error?.message || String(error),
    stack: error?.stack,
  });
}

export { summarizeImageUrl };
