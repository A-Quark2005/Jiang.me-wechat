const demands = require('../../services/demands');
const avatar = require('../../services/avatar');
const loginGuard = require('../../services/login-guard');
const subscribeMessage = require('../../services/subscribe-message');

Page({
  data: {
    activeTab: 'feed',
    feed: [],
    mine: [],
    loading: true,
    errorMessage: '',
    createEntryHidden: 1,
  },

  onLoad(options) {
    if (!loginGuard.guardPage('/pages/demands/index', { requireRegistration: true })) return;
    const tab = normalizeTab(options && options.tab);
    if (tab !== this.data.activeTab) {
      this.setData({ activeTab: tab });
    }
    this.loadData(true);
  },

  onShow() {
    if (!loginGuard.guardPage('/pages/demands/index', { requireRegistration: true })) return;
    void this.requestNewDemandNotice();
    this.loadData(true);
  },

  onPullDownRefresh() {
    this.loadData(true).finally(() => wx.stopPullDownRefresh());
  },

  async loadData(forceRefresh) {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const [feed, mine, createEntry] = await Promise.all([
        demands.listFeed({ forceRefresh }),
        demands.listMine({ forceRefresh }),
        demands.getCreateEntry({ forceRefresh }),
      ]);
      this.setData({
        loading: false,
        feed: presentDemandCards(feed),
        mine: presentDemandCards(mine),
        createEntryHidden: Number(createEntry && createEntry.hidden) === 1 ? 1 : 0,
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

  previewPosterAvatar(event) {
    avatar.previewAvatar(event.currentTarget.dataset.url);
  },

  async requestNewDemandNotice() {
    try {
      const subscription = await demands.getNewDemandNoticeSubscription();
      if (!subscription || !subscription.eligible) return;
      const accepted = await subscribeMessage.requestNewDemandNotice();
      if (!accepted) return;
      await demands.addNewDemandNoticeSubscription();
    } catch {
      // Notification consent must not block demand browsing.
    }
  },
});

function presentDemandCards(raw) {
  const items = Array.isArray(raw) ? raw : (raw && raw.items) || [];
  return items.map((rawDemand) => {
    const organizations = Array.isArray(rawDemand.organizations) ? rawDemand.organizations : [];
    const totalApplicationCount = Number(rawDemand.totalApplicationCount || 0);
    const applicationLimit = Number(rawDemand.applicationLimit || 1);
    const isApplicationFull = Boolean(rawDemand.isApplicationFull);
    const poster = rawDemand.poster || {};
    return {
      ...rawDemand,
      organizations,
      poster: {
        ...poster,
        avatarUrlResolved: avatar.resolveAvatarUrl(poster.avatarUrl),
        displayNameText: poster.displayName || '发布人',
      },
      showPoster: Boolean(!rawDemand.isPoster),
      descriptionText: rawDemand.description || '暂无补充说明',
      hasOrganizations: organizations.length > 0,
      requirementText: organizations.length > 0 ? '需满足组织认证' : '无认证要求',
      applicationProgressText: `已收到 ${totalApplicationCount}/${applicationLimit} 份简历`,
      applyStatusText: isApplicationFull ? '简历已收满' : (rawDemand.canApply ? '可投递' : rawDemand.statusText),
    };
  });
}

function normalizeTab(tab) {
  return tab === 'mine' ? 'mine' : 'feed';
}
