const service = require('../../services/meeting-entitlements');
const refreshState = require('../../services/refresh-state');

const PAGE_KEY = 'orders';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

function normalizeList(raw) {
  if (Array.isArray(raw)) return raw;
  return (raw && (raw.items || raw.orders || raw.paymentOrders)) || [];
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    errorMessage: '',
    orders: [],
  },

  onShow() {
    if (!this.data.hasLoaded || refreshState.consume(PAGE_KEY) || refreshState.isExpired(PAGE_KEY, CACHE_MAX_AGE_MS)) {
      this.loadOrders();
    }
  },

  async loadOrders() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const raw = await service.getOrders();
      this.setData({ loading: false, hasLoaded: true, orders: normalizeList(raw) });
      refreshState.touch(PAGE_KEY);
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '订单加载失败',
      });
    }
  },
});
