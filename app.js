const apiClient = require('./services/api-client');
const sessionStore = require('./services/session-store');
const share = require('./services/share');
const LOCAL_RESET_STAMP_KEY = 'jiangleme.local-reset-stamp';
const LOCAL_RESET_VERSION = '2026-05-23-full-reset-v2';

share.installDefaultPageShare();

/**
 * Perform a one-time local state reset across all mini-program environments.
 *
 * @returns {void}
 */
function resetLocalStateIfNeeded() {
  const currentStamp = wx.getStorageSync(LOCAL_RESET_STAMP_KEY);
  if (currentStamp === LOCAL_RESET_VERSION) {
    return;
  }
  wx.clearStorageSync();
  sessionStore.clearSession();
  apiClient.resetCacheState();
  wx.setStorageSync(LOCAL_RESET_STAMP_KEY, LOCAL_RESET_VERSION);
}

App({
  globalData: {
    backendBaseUrl: 'https://api.whkerdb.top',
    pendingEngagementInviteToken: '',
    pendingReferralCode: '',
    sessionShareRef: '',
  },

  onLaunch(options) {
    resetLocalStateIfNeeded();
    this.captureReferralCode(options);
    this.captureSessionShareRef(options);
  },

  onShow(options) {
    this.captureReferralCode(options);
    this.captureSessionShareRef(options);
  },

  captureReferralCode(options) {
    const query = (options && options.query) || {};
    const code = query.ref || query.referral || '';
    if (!code) return;
    this.globalData.pendingReferralCode = String(code);
    wx.setStorageSync('jiangleme.pending-referral-code', String(code));
  },

  captureSessionShareRef(options) {
    const query = (options && options.query) || {};
    const direct = query.sr || query.shareRef || '';
    const target = parseTargetQuery(query.target || '');
    const targetRef = target.sr || target.shareRef || '';
    const scene = decodeScene(query.scene || '');
    const sceneRef = scene.sr || scene.shareRef || '';
    const ref = normalizeShareRef(direct || targetRef || sceneRef || (typeof scene === 'string' ? scene : ''));
    if (!ref) return;
    this.globalData.sessionShareRef = ref;
  },
});

function decodeScene(raw) {
  const value = String(raw || '').trim();
  if (!value) return {};
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  if (/^u_[0-9a-z]+$/i.test(decoded)) return decoded.toLowerCase();
  return parseQueryString(decoded);
}

function normalizeShareRef(input) {
  const value = String(input || '').trim().toLowerCase();
  return /^u_[0-9a-z]{3,30}$/.test(value) ? value : '';
}

function parseQueryString(input) {
  return String(input || '')
    .replace(/^\?/, '')
    .split('&')
    .filter(Boolean)
    .reduce((result, pair) => {
      const splitIndex = pair.indexOf('=');
      const key = splitIndex >= 0 ? pair.slice(0, splitIndex) : pair;
      const value = splitIndex >= 0 ? pair.slice(splitIndex + 1) : '';
      try {
        result[decodeURIComponent(key)] = decodeURIComponent(value);
      } catch {
        result[key] = value;
      }
      return result;
    }, {});
}

function parseTargetQuery(input) {
  const value = String(input || '').trim();
  if (!value) return {};
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  const queryIndex = decoded.indexOf('?');
  return queryIndex >= 0 ? parseQueryString(decoded.slice(queryIndex + 1)) : {};
}
