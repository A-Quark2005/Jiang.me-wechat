const service = require('../../services/meeting-entitlements');

function normalizeList(raw) {
  if (Array.isArray(raw)) return raw;
  return (raw && (raw.items || raw.orders || raw.paymentOrders)) || [];
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    orders: [],
  },

  onShow() {
    this.loadOrders();
  },

  async loadOrders() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const raw = await service.getOrders();
      this.setData({ loading: false, orders: normalizeList(raw) });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '订单加载失败',
      });
    }
  },
});
