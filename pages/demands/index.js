const demands = require('../../services/demands');
const loginGuard = require('../../services/login-guard');

function listFrom(raw) {
  return Array.isArray(raw) ? raw : (raw && raw.items) || [];
}

function decorateDemand(item) {
  const organizations = Array.isArray(item.organizations) ? item.organizations : [];
  return {
    ...item,
    organizations,
    descriptionText: item.description || '暂无补充说明',
    hasOrganizations: organizations.length > 0,
    requirementText: organizations.length > 0 ? '需满足组织认证' : '无认证要求',
    applyStatusText: item.canApply ? '可投稿' : item.statusText,
  };
}

Page({
  data: {
    activeTab: 'feed',
    feed: [],
    mine: [],
    loading: true,
    errorMessage: '',
  },

  onLoad() {
    if (!loginGuard.guardPage('/pages/demands/index', { requireRegistration: true })) return;
    this.loadData(true);
  },

  onShow() {
    if (!loginGuard.guardPage('/pages/demands/index', { requireRegistration: true })) return;
    this.loadData(true);
  },

  onPullDownRefresh() {
    this.loadData(true).finally(() => wx.stopPullDownRefresh());
  },

  async loadData(forceRefresh) {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const [feed, mine] = await Promise.all([
        demands.listFeed({ forceRefresh }),
        demands.listMine({ forceRefresh }),
      ]);
      this.setData({
        loading: false,
        feed: listFrom(feed).map(decorateDemand),
        mine: listFrom(mine).map(decorateDemand),
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '需求加载失败',
      });
    }
  },

  switchTab(event) {
    const tab = String(event.currentTarget.dataset.tab || 'feed');
    this.setData({ activeTab: tab });
  },

  openCreate() {
    wx.navigateTo({ url: '/pages/demands/create' });
  },

  openDemand(event) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!id) return;
    wx.navigateTo({ url: `/pages/demands/detail?id=${encodeURIComponent(id)}` });
  },
});
