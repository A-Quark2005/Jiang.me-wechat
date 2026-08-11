const loginGuard = require('../../services/login-guard');
const profileService = require('../../services/profile');
const paymentService = require('../../services/meeting-entitlements');

Page({
  data: {
    ticket: '',
    order: null,
    paying: false,
    status: 'loading',
    iconText: '…',
    title: '正在准备支付',
    message: '请稍候，正在读取 APP 发起的支付请求。',
    canRetry: false,
    showBackButton: false,
  },

  onLoad(options) {
    const ticket = String((options && options.ticket) || '').trim();
    this.setData({ ticket });
    if (!ticket) {
      this.showError('支付入口无效', '缺少支付凭证，请返回 APP 重新发起。', false);
      return;
    }
    this.startPay();
  },

  async startPay() {
    if (this.data.paying) return;
    const ticket = this.data.ticket;
    if (!ticket) {
      this.showError('支付入口无效', '缺少支付凭证，请返回 APP 重新发起。', false);
      return;
    }

    this.setData({
      paying: true,
      status: 'loading',
      iconText: '…',
      title: '正在准备支付',
      message: '请稍候，正在读取 APP 发起的支付请求。',
      canRetry: false,
      showBackButton: false,
    });

    try {
      const loggedIn = await loginGuard.ensureLoggedInAsync({
        targetUrl: `/pages/app_contact_pay/index?ticket=${encodeURIComponent(ticket)}`,
        navigateAfterLogin: false,
        showError: false,
        requireRegistration: true,
      });
      if (!loggedIn) {
        this.showError('需要登录', '请先完成小程序账号登录和手机号绑定后，再返回 APP 重新发起支付。', false);
        return;
      }

      const order = this.data.order || await profileService.consumeContactDepositMiniProgramPayTicket(ticket);
      this.setData({
        order,
        title: '确认支付',
        message: `即将拉起微信支付，金额 ${order.amountText || ''}`,
      });

      if (order && order.alreadyPaid && order.phone) {
        this.showSuccess('已经支付', '你已经拥有对方联系方式，可以返回 APP 查看。');
        return;
      }

      await paymentService.payOrder(order);
      const syncId = order.depositId || order.orderNo || order.orderId;
      const synced = await profileService.syncContactDepositStatus(syncId);
      if (synced && synced.phone) {
        this.showSuccess('支付成功', '已解锁联系方式，可以返回 APP 查看。');
      } else {
        this.showSuccess('支付已提交', '系统正在确认支付结果，请稍后返回 APP 刷新。');
      }
    } catch (error) {
      if (paymentService.isPaymentCancelled(error)) {
        this.showError('支付已取消', '你可以重新支付，或返回 APP 稍后再试。', true);
        return;
      }
      this.showError('支付失败', error && error.message ? error.message : '请返回 APP 重新发起支付。', true);
    } finally {
      this.setData({ paying: false });
    }
  },

  showSuccess(title, message) {
    this.setData({
      status: 'success',
      iconText: '✓',
      title,
      message,
      canRetry: false,
      showBackButton: true,
    });
  },

  showError(title, message, canRetry) {
    this.setData({
      status: 'error',
      iconText: '!',
      title,
      message,
      canRetry: Boolean(canRetry),
      showBackButton: true,
    });
  },

  returnToApp() {
    wx.navigateBackMiniProgram({
      extraData: {
        source: 'android_contact_pay',
        paid: this.data.status === 'success',
      },
      fail() {
        wx.showModal({
          title: '请手动返回 APP',
          content: '微信暂时无法自动回到 APP，请从系统任务切换回讲了么 APP 查看结果。',
          showCancel: false,
        });
      },
    });
  },
});
