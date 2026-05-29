const sessionStore = require('./session-store');

const API_CACHE_PREFIX = 'jiangleme.api-cache.';
const PAGE_CACHE_PREFIX = 'jiangleme.page.';
const memoryCache = {};
const inFlightRequests = {};

function backendBaseUrl() {
  const app = getApp();
  const configured = app && app.globalData && app.globalData.backendBaseUrl;
  return String(configured || 'https://api.whkerdb.top').replace(/\/+$/, '');
}

function buildUrl(path) {
  const normalizedPath = String(path || '');
  return `${backendBaseUrl()}${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`;
}

/**
 * Build a stable cache storage key for one API payload bucket.
 *
 * @param cacheKey Logical cache key.
 * @returns Namespaced storage key string.
 */
function buildCacheStorageKey(cacheKey) {
  return `${API_CACHE_PREFIX}${String(cacheKey || '').trim()}`;
}

/**
 * Read a cached API payload from memory/storage if it is still fresh.
 *
 * @param cacheKey Logical cache key.
 * @param maxAgeMs Freshness window in milliseconds.
 * @returns Cached payload or null.
 */
function readCachedPayload(cacheKey, maxAgeMs) {
  const normalizedKey = String(cacheKey || '').trim();
  if (!normalizedKey || !maxAgeMs || maxAgeMs <= 0) {
    return null;
  }
  const now = Date.now();
  const memoryEntry = memoryCache[normalizedKey];
  if (memoryEntry && now - memoryEntry.savedAt <= maxAgeMs) {
    return memoryEntry.data;
  }
  const storageKey = buildCacheStorageKey(normalizedKey);
  const stored = wx.getStorageSync(storageKey);
  if (!stored || typeof stored !== 'object') {
    return null;
  }
  const savedAt = Number(stored.savedAt || 0);
  if (!savedAt || now - savedAt > maxAgeMs) {
    return null;
  }
  memoryCache[normalizedKey] = {
    savedAt,
    data: stored.data,
  };
  return stored.data;
}

/**
 * Persist a successful GET payload into memory/storage cache.
 *
 * @param cacheKey Logical cache key.
 * @param data Response payload to cache.
 */
function writeCachedPayload(cacheKey, data) {
  const normalizedKey = String(cacheKey || '').trim();
  if (!normalizedKey) {
    return;
  }
  const entry = {
    savedAt: Date.now(),
    data,
  };
  memoryCache[normalizedKey] = entry;
  wx.setStorageSync(buildCacheStorageKey(normalizedKey), entry);
}

/**
 * Prime one cache bucket with already available payload data.
 *
 * @param cacheKey Logical cache key.
 * @param data Payload to write into cache.
 */
function primeCache(cacheKey, data) {
  if (data === undefined) {
    return;
  }
  writeCachedPayload(cacheKey, data);
}

/**
 * Remove one or more cached API payloads.
 *
 * @param cacheKeys Cache key or cache key list to clear.
 */
function invalidateCaches(cacheKeys) {
  const keys = Array.isArray(cacheKeys) ? cacheKeys : [cacheKeys];
  keys
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .forEach((key) => {
      delete memoryCache[key];
      wx.removeStorageSync(buildCacheStorageKey(key));
    });
}

/**
 * Clear all in-memory and persistent API caches.
 *
 * @returns {void}
 */
function resetCacheState() {
  Object.keys(memoryCache).forEach((key) => {
    delete memoryCache[key];
  });
  Object.keys(inFlightRequests).forEach((key) => {
    delete inFlightRequests[key];
  });
  const storageInfo = wx.getStorageInfoSync();
  const keys = Array.isArray(storageInfo && storageInfo.keys) ? storageInfo.keys : [];
  keys
    .filter((key) => {
      const normalizedKey = String(key || '');
      return normalizedKey.startsWith(API_CACHE_PREFIX) || normalizedKey.startsWith(PAGE_CACHE_PREFIX);
    })
    .forEach((key) => wx.removeStorageSync(key));
}

function parseError(response) {
  const body = response.data || {};
  if (typeof body.message === 'string' && body.message.trim()) {
    return body.message.trim();
  }
  if (Array.isArray(body.message) && body.message.length) {
    return String(body.message[0]);
  }
  if (typeof body.error === 'string' && body.error.trim()) {
    return body.error.trim();
  }
  return `请求失败：HTTP ${response.statusCode || 0}`;
}

function handleUnauthorized(statusCode) {
  if (statusCode !== 401 && statusCode !== 403) {
    return;
  }
  sessionStore.clearSession();
  wx.reLaunch({ url: '/pages/home/index' });
}

function request(options) {
  const {
    path,
    method = 'GET',
    data,
    auth = true,
    cacheKey = '',
    maxAgeMs = 0,
    forceRefresh = false,
  } = options || {};
  const hasBody = data !== undefined && data !== null;
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const normalizedCacheKey = String(cacheKey || '').trim();
  const requestKey = JSON.stringify({
    path: buildUrl(path),
    method: normalizedMethod,
    auth: Boolean(auth),
    data: hasBody ? data : null,
  });
  if (
    normalizedMethod === 'GET' &&
    normalizedCacheKey &&
    !forceRefresh
  ) {
    const cached = readCachedPayload(normalizedCacheKey, maxAgeMs);
    if (cached !== null) {
      return Promise.resolve(cached);
    }
  }
  if (inFlightRequests[requestKey]) {
    return inFlightRequests[requestKey];
  }
  const shouldSendJsonBody = normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD';
  const header = {
    'content-type': shouldSendJsonBody ? 'application/json' : 'application/x-www-form-urlencoded',
  };
  const token = sessionStore.getAccessToken();
  if (auth && token) {
    header.Authorization = `Bearer ${token}`;
  }

  const pendingRequest = new Promise((resolve, reject) => {
    const requestOptions = {
      url: buildUrl(path),
      method: normalizedMethod,
      header,
      success(response) {
        const statusCode = response.statusCode || 0;
        if (statusCode >= 200 && statusCode < 300) {
          const body = response.data || {};
          if (body.ok === true) {
            if (normalizedMethod === 'GET' && normalizedCacheKey) {
              writeCachedPayload(normalizedCacheKey, body.data);
            }
            resolve(body.data);
            return;
          }
          reject(new Error('后端响应格式异常'));
          return;
        }
        handleUnauthorized(statusCode);
        reject(new Error(parseError(response)));
      },
      fail(error) {
        reject(new Error(error && error.errMsg ? `网络请求失败：${error.errMsg}` : '网络请求失败'));
      },
    };
    if (shouldSendJsonBody) {
      requestOptions.data = hasBody ? data : {};
    }
    wx.request(requestOptions);
  }).finally(() => {
    delete inFlightRequests[requestKey];
  });
  inFlightRequests[requestKey] = pendingRequest;
  return pendingRequest;
}

module.exports = {
  backendBaseUrl,
  invalidateCaches,
  primeCache,
  readCachedPayload,
  resetCacheState,
  request,
};
