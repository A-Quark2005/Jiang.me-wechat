function backendBaseUrl() {
  const app = getApp();
  return String((app.globalData && app.globalData.backendBaseUrl) || 'https://api.whkerdb.top').replace(/\/+$/, '');
}

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (res && res.code) {
          resolve(res.code);
          return;
        }
        reject(new Error('微信登录失败'));
      },
      fail(error) {
        reject(new Error(error && error.errMsg ? error.errMsg : '微信登录失败'));
      },
    });
  });
}

function requestPrepay(ticket, code) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${backendBaseUrl()}/api/wechat-mini-pay/prepay`,
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: { ticket, code },
      success(response) {
        const body = response.data || {};
        if (response.statusCode >= 200 && response.statusCode < 300 && (body.success === true || body.message === 'success')) {
          resolve(body.data || {});
          return;
        }
        reject(new Error(body.message || '微信支付下单失败'));
      },
      fail(error) {
        reject(new Error(error && error.errMsg ? error.errMsg : '网络请求失败'));
      },
    });
  });
}

function requestPayment(params) {
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      ...params,
      success: resolve,
      fail(error) {
        reject(new Error(error && error.errMsg ? error.errMsg : '支付失败'));
      },
    });
  });
}

Page({
  data: {
    ticket: '',
    title: '准备支付',
    message: '正在拉起微信支付',
    status: 'loading',
    money: '',
    paying: false,
    canRetry: false,
    paid: false,
  },

  onLoad(options) {
    const ticket = String((options && options.ticket) || '').trim();
    this.setData({ ticket });
    if (!ticket) {
      this.showError('支付二维码无效，请回到网页重新生成');
      return;
    }
    this.startPay();
  },

  async startPay() {
    if (this.data.paying) return;
    if (!this.data.ticket) {
      this.showError('支付二维码无效，请回到网页重新生成');
      return;
    }
    this.setData({
      title: '准备支付',
      message: '正在拉起微信支付',
      status: 'loading',
      paying: true,
      canRetry: false,
      paid: false,
    });
    try {
      const code = await wxLogin();
      const result = await requestPrepay(this.data.ticket, code);
      const params = result.payment_params || result.paymentParams;
      if (!params) throw new Error('后端未返回支付参数');
      this.setData({ money: result.money || '' });
      await requestPayment(params);
      this.setData({
        title: '支付已提交',
        message: '余额会在微信支付通知确认后自动到账，请回到网页刷新余额。',
        status: 'paid',
        paying: false,
        canRetry: false,
        paid: true,
      });
    } catch (error) {
      const message = String((error && error.message) || error || '支付失败');
      this.showError(message.includes('cancel') ? '已取消支付' : message);
    }
  },

  showError(message) {
    this.setData({
      title: '支付未完成',
      message,
      status: 'error',
      paying: false,
      canRetry: true,
      paid: false,
    });
  },

  backHome() {
    wx.switchTab({ url: '/pages/home/index' });
  },
});
