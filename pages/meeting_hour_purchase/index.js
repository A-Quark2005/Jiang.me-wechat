const service = require('../../services/meeting-entitlements');
const dashboardCache = require('../../services/dashboard-cache');
const refreshState = require('../../services/refresh-state');
const loginGuard = require('../../services/login-guard');
const tencentMeetingAccess = require('../../services/tencent-meeting-access');

const PRICE_CENTS_PER_HOUR = 250;

function normalizeHours(value) {
  const numeric = Math.floor(Number(value || 1));
  if (!Number.isFinite(numeric) || numeric < 1) return 1;
  return Math.min(numeric, 240);
}

function amountText(hours) {
  return ((normalizeHours(hours) * PRICE_CENTS_PER_HOUR) / 100).toFixed(2);
}

Page({
  data: {
    hours: 1,
    amountText: amountText(1),
    paying: false,
  },

  onLoad() {
    loginGuard.guardPage('/pages/meeting_hour_purchase/index', { requireRegistration: true });
  },

  onShow() {
    loginGuard.guardPage('/pages/meeting_hour_purchase/index', { requireRegistration: true });
  },

  setHours(value) {
    const hours = normalizeHours(value);
    this.setData({
      hours,
      amountText: amountText(hours),
    });
  },

  onHoursInput(event) {
    this.setHours(event.detail.value);
  },

  decreaseHours() {
    this.setHours(this.data.hours - 1);
  },

  increaseHours() {
    this.setHours(this.data.hours + 1);
  },

  async buyHours() {
    if (this.data.paying) return;
    const ready = await tencentMeetingAccess.ensureReady({ targetUrl: '/pages/meeting_hour_purchase/index' });
    if (!ready) return;
    const hours = normalizeHours(this.data.hours);
    this.setData({ paying: true });
    try {
      const order = await service.createWechatMiniProgramOrder('meeting-hour-pass', { hours });
      if (!order || !order.paymentParams) {
        throw new Error('支付参数异常，请稍后重试');
      }
      await service.requestPayment(order.paymentParams);
      if (order.orderId) {
        const orderDetail = await service.confirmPaidOrder(order.orderId);
        dashboardCache.invalidateDashboardRelated();
        dashboardCache.primeOrders([orderDetail]);
      }
      wx.showToast({ title: '支付成功', icon: 'success' });
      refreshState.mark(['home', 'entitlements', 'orders']);
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      wx.showModal({
        title: '购买失败',
        content: error && error.message ? error.message : '购买失败',
        showCancel: false,
      });
    } finally {
      this.setData({ paying: false });
    }
  },
});
