const sessionStore = require('./session-store');
const apiClient = require('./api-client');
const RESET_VERSION = 'local-reset-v3';

/**
 * Read the current local storage keys.
 *
 * @returns {string[]} Current storage keys.
 */
function currentStorageKeys() {
  try {
    const info = wx.getStorageInfoSync();
    return Array.isArray(info && info.keys) ? info.keys : [];
  } catch {
    return [];
  }
}

/**
 * Remove every currently known storage key one by one.
 *
 * @returns {void}
 */
function removeAllStorageKeys() {
  currentStorageKeys().forEach((key) => {
    wx.removeStorageSync(key);
  });
}

/**
 * Clear every local mini-program state bucket used by the app.
 *
 * @returns {void}
 */
function clearAllLocalState() {
  removeAllStorageKeys();
  wx.clearStorageSync();
  sessionStore.clearSession();
  apiClient.resetCacheState();
  try {
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.pendingEngagementInviteToken = '';
    }
  } catch {}
}

/**
 * Clear local state with an async storage flush confirmation.
 *
 * @returns {Promise<void>} Resolves once the storage clear flow finishes.
 */
function clearAllLocalStateAsync() {
  clearAllLocalState();
  return new Promise((resolve) => {
    wx.clearStorage({
      complete() {
        clearAllLocalState();
        resolve();
      },
    });
  });
}

/**
 * Clear local state and relaunch to the home tab.
 *
 * @returns {Promise<void>} Resolves after relaunch is scheduled.
 */
async function resetAndRelaunchHome() {
  await clearAllLocalStateAsync();
  wx.reLaunch({ url: '/pages/home/index' });
}

module.exports = {
  clearAllLocalState,
  clearAllLocalStateAsync,
  currentStorageKeys,
  RESET_VERSION,
  resetAndRelaunchHome,
};
