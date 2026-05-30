const profileService = require('../../../services/profile');
const refreshState = require('../../../services/refresh-state');
const displayFormatters = require('../../../services/display-formatters');
const loginGuard = require('../../../services/login-guard');

const PAGE_KEY = 'engagements';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Normalize engagement payloads from the profile service into a flat list.
 *
 * @param {any} raw Raw API response.
 * @returns {Array<object>} Engagement items.
 */
function normalizeList(raw) {
  if (Array.isArray(raw)) return raw;
  return (raw && (raw.items || raw.engagements)) || [];
}

/**
 * Resolve which side of the engagement belongs to the current user.
 *
 * @param {object} item Engagement item.
 * @returns {string} One of provided, received, or empty string.
 */
function sideOf(item) {
  const value = String(item.side || item.kind || '').toLowerCase();
  if (value.includes('provider') || value.includes('provided')) return 'provided';
  if (value.includes('receiver') || value.includes('received') || value.includes('purchased')) return 'received';
  return '';
}

/**
 * Determine whether an engagement still needs confirmation.
 *
 * @param {object} item Engagement item.
 * @returns {boolean} True when the engagement is still pending.
 */
function isPending(item) {
  return (
    String(item.status || item.confirmationStatus || '').toLowerCase().includes('pending') ||
    item.requiresMyConfirmation === true ||
    item.waitingForOtherConfirmation === true ||
    Boolean(item.pendingChange)
  );
}

/**
 * Convert engagement time fields into the month label used by the list card.
 *
 * @param {object} item Engagement item.
 * @returns {string} Month label for display.
 */
function formatMonthLabel(item) {
  return displayFormatters.formatMonthText(
    item.monthText || item.startMonth || item.createdMonth || item.createdAt || item.startedAt || '',
  );
}

function counterpartNameOf(item) {
  return item.counterpartName || item.counterpartProfileName || item.counterpartProfileId || item.counterpartUserId || '未知';
}

function summaryTextOf(item) {
  if (item.summary) return item.summary;
  if (Array.isArray(item.detailLines) && item.detailLines.length) {
    return item.detailLines.join('，');
  }
  return item.description || item.detailText || '';
}

/**
 * Ensure only visible segment tabs can become active.
 *
 * @param {string} value Requested tab key.
 * @returns {string} Supported tab key.
 */
function resolveActiveTab(value) {
  return ['provided', 'received', 'pending'].includes(value) ? value : 'provided';
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    errorMessage: '',
    activeTab: 'provided',
    allItems: [],
    visibleItems: [],
    tabs: [
      { key: 'provided', label: '我服务过', className: '' },
      { key: 'received', label: '我被服务过', className: '' },
      { key: 'pending', label: '待确认', className: '' },
    ],
  },

  onLoad(options) {
    if (!loginGuard.guardPage('/pages/resume/engagements/index')) {
      return;
    }
    this.setActiveTab(options.tab || 'provided');
  },

  onShow() {
    if (!loginGuard.guardPage('/pages/resume/engagements/index')) {
      return;
    }
    if (!this.data.hasLoaded || refreshState.consume(PAGE_KEY) || refreshState.isExpired(PAGE_KEY, CACHE_MAX_AGE_MS)) {
      this.loadEngagements();
    }
  },

  async loadEngagements() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const raw = await profileService.getEngagements();
      const allItems = normalizeList(raw).map((item) => ({
        ...item,
        monthText: formatMonthLabel(item),
        statusLabel: isPending(item) ? '待确认' : '已确认',
        statusClass: isPending(item) ? 'engagement-status-pending' : 'status-ok',
        titleText: item.title || '服务履历',
        metaPrefixText: sideOf(item) === 'received' ? '被服务方' : '服务方',
        counterpartNameText: counterpartNameOf(item),
        summaryText: summaryTextOf(item),
        arrowText: '›',
      }));
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
    const activeTab = event.currentTarget.dataset.tab;
    this.setActiveTab(activeTab, () => this.applyFilter());
  },

  setActiveTab(activeTab, callback) {
    const nextActiveTab = resolveActiveTab(activeTab);
    const tabs = this.data.tabs.map((item) => ({
      ...item,
      className: item.key === nextActiveTab ? 'segment-chip-active' : '',
    }));
    this.setData({ activeTab: nextActiveTab, tabs }, callback);
  },

  applyFilter() {
    const tab = this.data.activeTab;
    const visibleItems = this.data.allItems.filter((item) => {
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

  goBack() {
    wx.navigateBack({
      fail() {
        wx.switchTab({ url: '/pages/resume/index' });
      },
    });
  },
});
