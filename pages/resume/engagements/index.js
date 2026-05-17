const profileService = require('../../../services/profile');
const refreshState = require('../../../services/refresh-state');

const PAGE_KEY = 'engagements';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

function normalizeList(raw) {
  if (Array.isArray(raw)) return raw;
  return (raw && (raw.items || raw.engagements)) || [];
}

function sideOf(item) {
  const value = String(item.side || item.kind || '').toLowerCase();
  if (value.includes('provider') || value.includes('provided')) return 'provided';
  if (value.includes('receiver') || value.includes('received') || value.includes('purchased')) return 'received';
  return '';
}

function isPending(item) {
  return (
    String(item.status || item.confirmationStatus || '').toLowerCase().includes('pending') ||
    item.requiresMyConfirmation === true ||
    item.waitingForOtherConfirmation === true ||
    Boolean(item.pendingChange)
  );
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    errorMessage: '',
    activeTab: 'all',
    allItems: [],
    visibleItems: [],
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'pending', label: '待确认' },
      { key: 'provided', label: '我服务过' },
      { key: 'received', label: '我被服务过' },
    ],
  },

  onLoad(options) {
    this.setData({ activeTab: options.tab || 'all' });
  },

  onShow() {
    if (!this.data.hasLoaded || refreshState.consume(PAGE_KEY) || refreshState.isExpired(PAGE_KEY, CACHE_MAX_AGE_MS)) {
      this.loadEngagements();
    }
  },

  async loadEngagements() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const raw = await profileService.getEngagements();
      const allItems = normalizeList(raw);
      this.setData({ loading: false, hasLoaded: true, allItems }, () => this.applyFilter());
      refreshState.touch(PAGE_KEY);
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '履历加载失败',
      });
    }
  },

  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.tab }, () => this.applyFilter());
  },

  applyFilter() {
    const tab = this.data.activeTab;
    const visibleItems = this.data.allItems.filter((item) => {
      if (tab === 'all') return true;
      if (tab === 'pending') return isPending(item);
      return sideOf(item) === tab;
    });
    this.setData({ visibleItems });
  },

  openDetail(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/resume/engagement_detail/index?id=${encodeURIComponent(id)}` });
  },

  createEngagement() {
    wx.navigateTo({ url: '/pages/resume/engagement_create/index' });
  },
});
