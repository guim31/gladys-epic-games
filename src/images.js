// -----------------------------------------------------------------------------
// Posters of the dashboard widget.
//
// A widget content never carries an image, only a KEY: the core asks the
// integration for the bytes (onWidgetGetImage) and caches a validated image
// one hour by key. So the key is derived from the image URL (a new poster is
// a new key), and a registry remembers which URL a key stands for.
//
// The core refuses, never recompresses, an image over 300 KB or 4096 px.
// Epic's CDN serves 1200×1600 posters of 1 to 3 MB, but resizes on demand
// with the parameters the store's own pages use (`resize=1&w=…&h=…`): the
// poster is asked at the width a grid renders it, then smaller, and checked
// with the SDK's own validator before it leaves the container.
//
// Only Epic's own hosts are fetched, over https: the URLs come from a
// third-party answer, and the container fetches nothing else on its behalf.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { createLogger, validateWidgetImage } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'images' });

export const IMAGE_KEY_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

// Width × height asked to the CDN: a grid poster renders under 300 px wide.
export const IMAGE_SIZES = [
  { w: 360, h: 480, quality: 'medium' },
  { w: 240, h: 320, quality: 'low' },
];

const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
// URLs remembered: the posters of a few lineups, not the whole store.
const MAX_REGISTERED = 64;
// Images kept ready: the core asks again past its one-hour cache.
const MAX_CACHED = 24;

/** Whether a URL is one the container may fetch: https, on an Epic host. */
export function isAllowedImageUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.username === '' &&
      parsed.password === '' &&
      (parsed.hostname === 'epicgames.com' || parsed.hostname.endsWith('.epicgames.com'))
    );
  } catch {
    return false;
  }
}

/** The image key of a poster URL: `poster-` and 16 hex characters of its sha1. */
export function imageKey(url) {
  return `poster-${createHash('sha1').update(String(url)).digest('hex').slice(0, 16)}`;
}

/** The URL asked to the CDN for one size. */
export function sizedUrl(url, { w, h, quality }) {
  const parsed = new URL(url);
  parsed.searchParams.set('h', String(h));
  parsed.searchParams.set('quality', quality);
  parsed.searchParams.set('resize', '1');
  parsed.searchParams.set('w', String(w));
  return parsed.toString();
}

async function download(doFetch, url) {
  const response = await doFetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > MAX_DOWNLOAD_BYTES) {
    await response.body?.cancel?.().catch(() => {});
    throw new Error(`${declared} bytes announced`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_DOWNLOAD_BYTES) {
    throw new Error(`${bytes.length} bytes received`);
  }
  return bytes;
}

/**
 * The poster registry and its small download cache.
 * @param {{ fetch?: typeof fetch }} [options]
 */
export function createImageRegistry({ fetch: doFetch = fetch } = {}) {
  const urls = new Map();
  const cache = new Map();

  const remember = (map, key, value, max) => {
    map.delete(key);
    map.set(key, value);
    while (map.size > max) {
      map.delete(map.keys().next().value);
    }
  };

  return {
    /**
     * Record a poster URL and return its key; null for a URL the container
     * will not fetch (the item is then shown without image).
     */
    register(url) {
      if (!url || !isAllowedImageUrl(url)) {
        return null;
      }
      const key = imageKey(url);
      remember(urls, key, url, MAX_REGISTERED);
      return key;
    },

    lookup(key) {
      return urls.get(key);
    },

    /**
     * The raw base64 of a registered poster, small enough for the core.
     * @throws when the key is unknown or no size fits
     */
    async resolve(key) {
      if (typeof key !== 'string' || !IMAGE_KEY_REGEX.test(key)) {
        throw new Error(`Invalid image key ${key}`);
      }
      if (cache.has(key)) {
        const base64 = cache.get(key);
        remember(cache, key, base64, MAX_CACHED);
        return base64;
      }
      const url = urls.get(key);
      if (url === undefined) {
        // Asked after a restart for a content built before it: the core
        // re-pulls the content, which registers the poster again.
        throw new Error(`Unknown image ${key}`);
      }
      let reason = 'no size tried';
      for (const size of IMAGE_SIZES) {
        try {
          const base64 = (await download(doFetch, sizedUrl(url, size))).toString('base64');
          const problems = validateWidgetImage(base64);
          if (problems.length === 0) {
            remember(cache, key, base64, MAX_CACHED);
            return base64;
          }
          reason = problems.join('; ');
        } catch (err) {
          reason = err.message;
        }
        logger.debug(`Poster ${key} at ${size.w}px refused (${reason})`);
      }
      throw new Error(`Poster ${key} unusable: ${reason}`);
    },
  };
}
