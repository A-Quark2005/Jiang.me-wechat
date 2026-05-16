const profileService = require('../../../services/profile');
const refreshState = require('../../../services/refresh-state');

const PAGE_KEY = 'credentials';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

function normalizeList(raw) {
  if (Array.isArray(raw)) return raw;
  return (raw && (raw.items || raw.credentials)) || [];
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    errorMessage: '',
    credentials: [],
  },

  onShow() {
    if (!this.data.hasLoaded || refreshState.consume(PAGE_KEY) || refreshState.isExpired(PAGE_KEY, CACHE_MAX_AGE_MS)) {
      this.loadCredentials();
    }
  },

  async loadCredentials() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const raw = await profileService.getCredentials();
      this.setData({ loading: false, hasLoaded: true, credentials: normalizeList(raw) });
      refreshState.touch(PAGE_KEY);
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '官方认证加载失败',
      });
    }
  },
});
