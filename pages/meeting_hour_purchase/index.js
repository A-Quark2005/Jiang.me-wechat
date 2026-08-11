const service = require('../../services/meeting-entitlements');
const dashboardCache = require('../../services/dashboard-cache');
const refreshState = require('../../services/refresh-state');
const loginGuard = require('../../services/login-guard');
const tencentMeetingAccess = require('../../services/tencent-meeting-access');

const UNIT_HOURS = 1;
const PRICE_CENTS_PER_UNIT = 250;

function normalizeHours(value) {
  const numeric = Math.floor(Number(value || UNIT_HOURS));
  if (!Number.isFinite(numeric) || numeric < UNIT_HOURS) return UNIT_HOURS;
  return numeric;
}

function amountText(hours) {
  return ((normalizeHours(hours) / UNIT_HOURS) * PRICE_CENTS_PER_UNIT / 100).toFixed(2);
}

Page({
  data: {
    hours: UNIT_HOURS,
    amountText: amountText(UNIT_HOURS),
    presetHours: [1, 3, 6, 12],
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

  choosePreset(event) {
    if (this.data.paying) return;
    this.setHours(event.currentTarget.dataset.hours);
  },

  decreaseHours() {
    this.setHours(this.data.hours - UNIT_HOURS);
  },

  increaseHours() {
    this.setHours(this.data.hours + UNIT_HOURS);
  },

  async buyHours() {
    if (this.data.paying) return;
    const ready = await tencentMeetingAccess.ensureReady({ targetUrl: '/pages/meeting_hour_purchase/index' });
    if (!ready) return;
    const hours = normalizeHours(this.data.hours);
    this.setData({ paying: true });
    try {
      const order = await service.createWechatMiniProgramOrder('meeting_hour_pass', { hours }, { paymentChannel: 'wechat_mini_program' });
      if (!order || (!order.paymentParams && !order.virtualPaymentParams)) {
        throw new Error('支付参数异常，请稍后重试');
      }
      await service.payOrder(order);
      if (order.orderId) {
        const orderDetail = await service.confirmPaidOrder(order.orderId);
        dashboardCache.invalidateDashboardRelated();
        dashboardCache.primeOrders([orderDetail]);
      }
      wx.showToast({ title: '支付成功', icon: 'success' });
      refreshState.mark(['home', 'entitlements', 'orders']);
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      if (service.isPaymentCancelled(error)) {
        return;
      }
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
