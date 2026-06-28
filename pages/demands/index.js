const demands = require('../../services/demands');
const loginGuard = require('../../services/login-guard');

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
        feed: presentDemandCards(feed),
        mine: presentDemandCards(mine),
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

function presentDemandCards(raw) {
  const items = Array.isArray(raw) ? raw : (raw && raw.items) || [];
  return items.map((rawDemand) => {
    const organizations = Array.isArray(rawDemand.organizations) ? rawDemand.organizations : [];
    const totalApplicationCount = Number(rawDemand.totalApplicationCount || 0);
    const applicationLimit = Number(rawDemand.applicationLimit || 1);
    const isApplicationFull = Boolean(rawDemand.isApplicationFull);
    return {
      ...rawDemand,
      organizations,
      descriptionText: rawDemand.description || '暂无补充说明',
      hasOrganizations: organizations.length > 0,
      requirementText: organizations.length > 0 ? '需满足组织认证' : '无认证要求',
      applicationProgressText: `已收到 ${totalApplicationCount}/${applicationLimit} 份简历`,
      applyStatusText: isApplicationFull ? '简历已收满' : (rawDemand.canApply ? '可投递' : rawDemand.statusText),
    };
  });
}
