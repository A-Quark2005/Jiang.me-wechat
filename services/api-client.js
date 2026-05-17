const sessionStore = require('./session-store');

function backendBaseUrl() {
  const app = getApp();
  const configured = app && app.globalData && app.globalData.backendBaseUrl;
  return String(configured || 'https://api.whkerdb.top').replace(/\/+$/, '');
}

function buildUrl(path) {
  const normalizedPath = String(path || '');
  return `${backendBaseUrl()}${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`;
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
  const { path, method = 'GET', data, auth = true } = options || {};
  const hasBody = data !== undefined && data !== null;
  const header = {
    'content-type': hasBody ? 'application/json' : 'application/x-www-form-urlencoded',
  };
  const token = sessionStore.getAccessToken();
  if (auth && token) {
    header.Authorization = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    const requestOptions = {
      url: buildUrl(path),
      method,
      header,
      success(response) {
        const statusCode = response.statusCode || 0;
        if (statusCode >= 200 && statusCode < 300) {
          const body = response.data || {};
          if (body.ok === true) {
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
    if (hasBody) {
      requestOptions.data = data;
    }
    wx.request(requestOptions);
  });
}

module.exports = {
  backendBaseUrl,
  request,
};
