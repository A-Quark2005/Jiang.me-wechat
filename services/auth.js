const { request } = require('./api-client');
const sessionStore = require('./session-store');
const localReset = require('./local-reset');

/**
 * Determine whether the current backend base URL points to a local developer host.
 *
 * @param {string} url Backend base URL.
 * @returns {boolean} True when the URL targets localhost-style environments.
 */
function isLocalBackendUrl(url) {
  const value = String(url || '').toLowerCase();
  return (
    value.includes('127.0.0.1') ||
    value.includes('localhost') ||
    value.includes('0.0.0.0')
  );
}

/**
 * Read the current mini-program runtime environment version.
 *
 * @returns {string} Environment version such as develop, trial, or release.
 */
function getEnvVersion() {
  try {
    const info = wx.getAccountInfoSync();
    return (info && info.miniProgram && info.miniProgram.envVersion) || '';
  } catch {
    return '';
  }
}

/**
 * Request a fresh mini-program login code from WeChat.
 *
 * @returns {Promise<string>} Resolved login code.
 */
function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(result) {
        if (result.code) {
          resolve(result.code);
          return;
        }
        reject(new Error('微信登录未返回 code'));
      },
      fail(error) {
        reject(new Error(error && error.errMsg ? error.errMsg : '微信登录失败'));
      },
    });
  });
}

/**
 * Check whether a thrown error came from the backend's one-time WeChat code validation.
 *
 * @param {unknown} error Error thrown by the request layer.
 * @returns {boolean} True when the error means the login code must be refreshed.
 */
function isWechatInvalidCodeError(error) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message || '').trim()
      : '';
  return message === 'wechat_invalid_code';
}

/**
 * Execute one auth request with a freshly issued `wx.login` code and retry once when that
 * code was already consumed or rejected upstream.
 *
 * @param {(miniLoginCode: string) => Promise<any>} requestBuilder Auth request factory.
 * @returns {Promise<any>} Backend auth payload.
 */
async function requestWithFreshMiniLoginCode(requestBuilder) {
  let miniLoginCode = await wxLogin();
  try {
    return await requestBuilder(miniLoginCode);
  } catch (error) {
    if (!isWechatInvalidCodeError(error)) {
      throw error;
    }
  }
  miniLoginCode = await wxLogin();
  return requestBuilder(miniLoginCode);
}

/**
 * Log in with the mini-program code exchange flow and cache the returned session.
 *
 * @returns {Promise<object>} Auth result or registration-required payload.
 */
async function loginWithMiniProgram() {
  const sessionRecord = sessionStore.getSessionRecord();
  const existingSession = sessionRecord && sessionRecord.session;
  if (existingSession && existingSession.accessToken) {
    return {
      result: 'logged_in',
      token: existingSession.accessToken,
      accessToken: existingSession.accessToken,
      session: existingSession,
      user: sessionRecord.user || null,
      profile: sessionRecord.profile || null,
    };
  }

  const baseUrl = require('./api-client').backendBaseUrl();
  const envVersion = getEnvVersion();

  // Local dev convenience:
  // - The repo-local backend currently exposes the WeChat Open Platform flow at
  //   `/api/auth/wechat/mobile-login` (mock code supported), not the historical
  //   mini-program login route.
  // - When pointing to localhost, prefer a stable mock user so you can run the
  //   mini-program UI without touching any cloud/server config.
  if (isLocalBackendUrl(baseUrl) && envVersion !== 'release') {
    const result = await request({
      path: '/api/auth/wechat/mobile-login',
      method: 'POST',
      auth: false,
      data: {
        code: 'mock:user_local_teacher',
        clientPlatform: 'wechat_mini_program',
      },
    });
    if (result && result.result === 'logged_in' && (result.token || result.accessToken)) {
      sessionStore.saveSession(result);
    }
    return result;
  }

  // Default behavior (non-local): keep the mini-program login route as the
  // primary integration contract.
  const result = await requestWithFreshMiniLoginCode((miniLoginCode) => request({
    path: '/api/auth/wechat-mini-program/login',
    method: 'POST',
    auth: false,
    data: { miniLoginCode },
  }));
  if (result && (result.session || result.token || result.accessToken)) {
    sessionStore.saveSession(result);
  }
  return result;
}

/**
 * Register or bind the current mini-program account after phone authorization.
 *
 * @param {string} phoneCode Phone authorization code returned by `getPhoneNumber`.
 * @returns {Promise<object>} Backend registration result.
 */
async function bindPhoneWithCode(phoneCode) {
  const baseUrl = require('./api-client').backendBaseUrl();
  const envVersion = getEnvVersion();

  if (isLocalBackendUrl(baseUrl) && envVersion !== 'release') {
    // In local dev mock-login mode, phone binding is intentionally skipped.
    // If this gets called, surface a clear message rather than a confusing 404.
    throw new Error('本地调试模式：已使用 mock 用户登录，不需要手机号授权。');
  }

  const result = await requestWithFreshMiniLoginCode((miniLoginCode) => request({
    path: '/api/auth/wechat-mini-program/register',
    method: 'POST',
    auth: false,
    data: {
      miniLoginCode,
      phoneCode,
    },
  }));
  if (result && (result.session || result.token || result.accessToken)) {
    sessionStore.saveSession(result);
  }
  return result;
}

/**
 * Clear the cached auth session and return to the home tab.
 *
 * @returns {void}
 */
function logout() {
  localReset.resetAndRelaunchHome();
}

module.exports = {
  bindPhoneWithCode,
  loginWithMiniProgram,
  logout,
  wxLogin,
};
