export async function fetchJson(url, attempts = 2, delayMs = 300) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let retryable = true;
    try {
      const options = { cache: 'no-cache' };
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') options.signal = AbortSignal.timeout(6000);
      const response = await fetch(url, options);
      if (!response.ok) {
        retryable = response.status === 429 || response.status >= 500;
        throw new Error(`${url}: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (!retryable || attempt + 1 >= attempts) break;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError ?? new Error(url);
}
