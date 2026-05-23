const profileService = require('../../../services/profile');
const refreshState = require('../../../services/refresh-state');
const loginGuard = require('../../../services/login-guard');

const PAGE_KEY = 'credentials';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Normalize credentials payloads from the profile service into a flat list.
 *
 * @param {any} raw Raw API response.
 * @returns {Array<object>} Credential items.
 */
function normalizeList(raw) {
  if (Array.isArray(raw)) return raw;
  return (raw && (raw.items || raw.credentials)) || [];
}

/**
 * Build the short badge text shown on the credential list card.
 *
 * @param {object} item Credential item.
 * @returns {string} Short badge text.
 */
function buildBadgeText(item) {
  if (item.shortName) return String(item.shortName);
  if (item.code) return String(item.code);
  return String(item.title || item.name || '认证').slice(0, 2);
}

/**
 * Build a stable tint class for credential badges based on list position.
 *
 * @param {number} index Zero-based item index.
 * @returns {string} CSS class name.
 */
function buildBadgeClass(index) {
  return index % 2 === 0 ? 'credentials-badge-red' : 'credentials-badge-green';
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    errorMessage: '',
    credentials: [],
  },

  onShow() {
    if (!loginGuard.guardPage('/pages/resume/credentials/index')) {
      return;
    }
    if (!this.data.hasLoaded || refreshState.consume(PAGE_KEY) || refreshState.isExpired(PAGE_KEY, CACHE_MAX_AGE_MS)) {
      this.loadCredentials();
    }
  },

  async loadCredentials() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const raw = await profileService.getCredentials();
      const credentials = normalizeList(raw).map((item, index) => ({
        ...item,
        badgeText: buildBadgeText(item),
        titleText: item.title || item.name || '官方认证',
        badgeClass: buildBadgeClass(index),
      }));
      this.setData({ loading: false, hasLoaded: true, credentials });
      refreshState.touch(PAGE_KEY);
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '官方认证加载失败',
      });
    }
  },

  navigateBack() {
    wx.navigateBack({
      fail() {
        wx.switchTab({ url: '/pages/resume/index' });
      },
    });
  },
});
