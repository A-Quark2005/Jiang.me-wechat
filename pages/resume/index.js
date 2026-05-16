const profileService = require('../../services/profile');

function arrayFrom(value, keys) {
  if (Array.isArray(value)) {
    return value;
  }
  const source = value || {};
  for (let index = 0; index < keys.length; index += 1) {
    const item = source[keys[index]];
    if (Array.isArray(item)) {
      return item;
    }
  }
  return [];
}

function splitEngagements(raw) {
  const items = arrayFrom(raw, ['items', 'engagements']);
  return {
    provided: items.filter((item) => String(item.side || item.kind || '').includes('provider') || String(item.kind || '').includes('provided')),
    received: items.filter((item) => String(item.side || item.kind || '').includes('receiver') || String(item.kind || '').includes('received') || String(item.kind || '').includes('purchased')),
    pending: items.filter((item) => String(item.status || item.confirmationStatus || '').toLowerCase().includes('pending')),
  };
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    resume: null,
    credentials: [],
    engagementGroups: {
      provided: [],
      received: [],
      pending: [],
    },
  },

  onShow() {
    this.loadResume();
  },

  async loadResume() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const [resume, credentialsRaw, engagementsRaw] = await Promise.all([
        profileService.getResume(),
        profileService.getCredentials(),
        profileService.getEngagements(),
      ]);
      this.setData({
        loading: false,
        resume,
        credentials: arrayFrom(credentialsRaw, ['items', 'credentials']).slice(0, 3),
        engagementGroups: splitEngagements(engagementsRaw),
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '简历加载失败',
      });
    }
  },

  openEditSelf() {
    wx.navigateTo({ url: '/pages/resume/edit_self/index' });
  },

  openCredentials() {
    wx.navigateTo({ url: '/pages/resume/credentials/index' });
  },

  openEngagements(event) {
    const tab = event.currentTarget.dataset.tab || 'all';
    wx.navigateTo({ url: `/pages/resume/engagements/index?tab=${tab}` });
  },
});
