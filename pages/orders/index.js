const service = require('../../services/meeting-entitlements');
const refreshState = require('../../services/refresh-state');
const displayFormatters = require('../../services/display-formatters');
const loginGuard = require('../../services/login-guard');

const PAGE_KEY = 'orders';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

function normalizeList(raw) {
  if (Array.isArray(raw)) return raw;
  return (raw && (raw.items || raw.orders || raw.paymentOrders)) || [];
}

function statusTextOf(item) {
  return String(item.status || item.orderStatus || '').toLowerCase();
}

/**
 * Normalize price fields into fixed unit/value fragments for card rendering.
 *
 * @param {object} item Order item.
 * @returns {{amountUnitText: string, amountValueText: string}} Split price fragments.
 */
function buildAmountFragments(item) {
  const product = item.extraData && item.extraData.product ? item.extraData.product : null;
  const raw = String(
    item.amountText ||
      (product && product.priceText) ||
      item.amount ||
      '',
  ).trim();
  const normalized = raw.replace(/^[¥￥]\s*/, '');
  return {
    amountUnitText: '¥',
    amountValueText: normalized || '--',
  };
}

function normalizeOrder(item) {
  const statusText = statusTextOf(item);
  const expired = ['expired', 'invalid', 'closed', 'cancelled'].includes(statusText);
  const friendlyTitle =
    (item.extraData && item.extraData.product && item.extraData.product.name) ||
    (item.extraData && item.extraData.product && item.extraData.product.title) ||
    displayFormatters.normalizeMeetingProductTitle(item.productName) ||
    displayFormatters.normalizeMeetingProductTitle(item.title) ||
    displayFormatters.normalizeMeetingProductTitle(item.sourceId) ||
    displayFormatters.normalizeMeetingProductTitle(item.sourceType) ||
    '支付订单';
  const timeText =
    displayFormatters.formatDateText(item.createdAt || item.submittedAt, {
      fallback: '暂无创建时间',
    }) || '暂无创建时间';
  return {
    ...item,
    ...buildAmountFragments(item),
    statusText,
    isExpired: expired,
    iconClass: expired ? 'ticket-icon-expired' : '',
    statusClass: expired ? 'order-status-expired' : '',
    titleText: friendlyTitle,
    timeText,
    statusDisplayText: displayFormatters.normalizeOrderStatusText(item.status || item.orderStatus),
    chevronText: '›',
  };
}

function cachedOrdersPage() {
  return wx.getStorageSync('jiangleme.page.orders.summary') || null;
}

function saveCachedOrdersPage(payload) {
  wx.setStorageSync('jiangleme.page.orders.summary', {
    savedAt: Date.now(),
    data: payload,
  });
}

function recentCache(record, maxAgeMs) {
  if (!record || typeof record !== 'object') return null;
  const savedAt = Number(record.savedAt || 0);
  if (!savedAt || Date.now() - savedAt > maxAgeMs) return null;
  return record.data || null;
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    errorMessage: '',
    activeTab: 'all',
    activeAllTabClass: 'tab-chip-active',
    activeExpiredTabClass: 'muted-chip',
    orders: [],
    visibleOrders: [],
  },

  onLoad() {
    const cached = recentCache(cachedOrdersPage(), CACHE_MAX_AGE_MS);
    if (cached) {
      this.setData({
        loading: false,
        hasLoaded: true,
        errorMessage: '',
        ...cached,
      });
    }
  },

  onShow() {
    if (!loginGuard.guardPage('/pages/orders/index')) {
      return;
    }
    if (!this.data.hasLoaded || refreshState.consume(PAGE_KEY) || refreshState.isExpired(PAGE_KEY, CACHE_MAX_AGE_MS)) {
      this.loadOrders(true);
    }
  },

  async loadOrders(forceRefresh) {
    if (!this.data.hasLoaded) {
      this.setData({ loading: true, errorMessage: '' });
    } else {
      this.setData({ errorMessage: '' });
    }
    try {
      const raw = await service.getOrders({ forceRefresh });
      const orders = normalizeList(raw).map(normalizeOrder);
      this.setData({ loading: false, hasLoaded: true, orders }, () => {
        this.applyFilter();
        saveCachedOrdersPage({
          activeTab: this.data.activeTab,
          activeAllTabClass: this.data.activeAllTabClass,
          activeExpiredTabClass: this.data.activeExpiredTabClass,
          orders: this.data.orders,
          visibleOrders: this.data.visibleOrders,
        });
      });
      refreshState.touch(PAGE_KEY);
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '订单加载失败',
      });
    }
  },

  goBack() {
    wx.navigateBack({
      fail() {
        wx.switchTab({ url: '/pages/meeting_entitlements/index' });
      },
    });
  },

  switchTab(event) {
    const activeTab = event.currentTarget.dataset.tab || 'all';
    this.setData({
      activeTab,
      activeAllTabClass: activeTab === 'all' ? 'tab-chip-active' : '',
      activeExpiredTabClass: activeTab === 'expired' ? 'tab-chip-active muted-chip' : 'muted-chip',
    }, () => this.applyFilter());
  },

  applyFilter() {
    const tab = this.data.activeTab;
    const visibleOrders = this.data.orders.filter((item) => {
      if (tab === 'all') return true;
      return ['expired', 'invalid', 'closed', 'cancelled'].includes(statusTextOf(item));
    });
    this.setData({ visibleOrders });
  },

  openDetail(event) {
    const orderId = String(event.currentTarget.dataset.id || '');
    if (!orderId) {
      return;
    }
    wx.navigateTo({
      url: `/pages/orders/detail/index?id=${encodeURIComponent(orderId)}`,
    });
  },
});
