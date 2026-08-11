const { request } = require('./api-client');
const sessionStore = require('./session-store');
const localReset = require('./local-reset');

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

function pendingReferralCode() {
  return wx.getStorageSync('jiangleme.pending-referral-code') || undefined;
}

function clearPendingReferralCode() {
  const app = getApp();
  if (app && app.globalData) {
    app.globalData.pendingReferralCode = '';
  }
  wx.removeStorageSync('jiangleme.pending-referral-code');
}

function showReferralRewardResult(granted) {
  wx.showModal({
    title: granted ? '已领取邀请奖励' : '仅新用户可领取',
    content: granted
      ? '激活账号后，可在“权益”页使用24小时会员卡'
      : '如有需要，可在“权益”页邀请新用户，或付费购买',
    showCancel: false,
    confirmText: '知道了',
  });
}

function handleReferralRewardResult(result, hadReferralCode) {
  if (!hadReferralCode || !result || typeof result.referralRewardGranted !== 'boolean') {
    return;
  }
  showReferralRewardResult(result.referralRewardGranted);
}

function handlePendingReferralForExistingSession() {
  const referralCode = pendingReferralCode();
  if (!referralCode) {
    return false;
  }
  showReferralRewardResult(false);
  clearPendingReferralCode();
  return true;
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
  const referralCode = pendingReferralCode();
  const sessionRecord = sessionStore.getSessionRecord();
  const existingSession = sessionRecord && sessionRecord.session;
  if (existingSession && existingSession.accessToken) {
    if (referralCode) {
      showReferralRewardResult(false);
    }
    clearPendingReferralCode();
    return {
      result: 'logged_in',
      token: existingSession.accessToken,
      accessToken: existingSession.accessToken,
      session: existingSession,
      user: sessionRecord.user || null,
      profile: sessionRecord.profile || null,
    };
  }

  const result = await requestWithFreshMiniLoginCode((miniLoginCode) => request({
    path: '/api/auth/wechat-mini-program/login',
    method: 'POST',
    auth: false,
    data: {
      miniLoginCode,
      referralCode,
    },
  }));
  if (result && (result.session || result.token || result.accessToken)) {
    sessionStore.saveSession(result);
    handleReferralRewardResult(result, Boolean(referralCode));
    clearPendingReferralCode();
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
  const referralCode = pendingReferralCode();
  if (sessionStore.getAccessToken()) {
    const result = await request({
      path: '/api/me/phone/wechat-mini-program',
      method: 'POST',
      data: { phoneCode },
    });
    if (result && (result.session || result.token || result.accessToken)) {
      sessionStore.saveSession(result);
    }
    return result;
  }
  const result = await requestWithFreshMiniLoginCode((miniLoginCode) => request({
    path: '/api/auth/wechat-mini-program/register',
    method: 'POST',
    auth: false,
    data: {
      miniLoginCode,
      phoneCode,
      referralCode,
    },
  }));
  if (result && (result.session || result.token || result.accessToken)) {
    sessionStore.saveSession(result);
    handleReferralRewardResult(result, Boolean(referralCode));
    clearPendingReferralCode();
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
  handlePendingReferralForExistingSession,
  loginWithMiniProgram,
  logout,
  wxLogin,
};
