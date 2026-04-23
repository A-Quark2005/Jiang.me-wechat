function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim();
  if (!trimmed) {
    return 'https://api.whkerdb.top';
  }
  return trimmed.replace(/\/+$/, '');
}

function buildApiUrl(baseUrl, pathname) {
  return `${normalizeBaseUrl(baseUrl)}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
}

function parseResponseError(response) {
  const body = response.data || {};
  if (typeof body.message === 'string' && body.message.trim()) {
    return body.message.trim();
  }
  if (Array.isArray(body.message) && body.message.length > 0) {
    return String(body.message[0]);
  }
  if (typeof body.error === 'string' && body.error.trim()) {
    return body.error.trim();
  }
  return `请求失败（HTTP ${response.statusCode || 0}）`;
}

function request({ baseUrl, path, method = 'GET', data }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: buildApiUrl(baseUrl, path),
      method,
      data,
      header: {
        'content-type': 'application/json',
      },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          const body = response.data || {};
          if (body.ok === true) {
            resolve(body.data);
            return;
          }
        }
        reject(new Error(parseResponseError(response)));
      },
      fail(error) {
        reject(
          new Error(
            error && error.errMsg
              ? `网络请求失败：${error.errMsg}`
              : '网络请求失败',
          ),
        );
      },
    });
  });
}

module.exports = {
  normalizeBaseUrl,
  request,
};
