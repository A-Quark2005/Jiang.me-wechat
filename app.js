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
  },

  onLaunch() {
    resetLocalStateIfNeeded();
  },
});
