const profileService = require('../../../services/profile');

function normalizeList(raw) {
  if (Array.isArray(raw)) return raw;
  return (raw && (raw.items || raw.credentials)) || [];
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    credentials: [],
  },

  onShow() {
    this.loadCredentials();
  },

  async loadCredentials() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const raw = await profileService.getCredentials();
      this.setData({ loading: false, credentials: normalizeList(raw) });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '官方认证加载失败',
      });
    }
  },
});
