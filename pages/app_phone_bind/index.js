const auth = require('../../services/auth');
const refreshState = require('../../services/refresh-state');

Page({
  data: {
    binding: false,
    bound: false,
    status: 'waiting',
    iconText: '!',
    title: '需要绑定手机号',
    message: '请授权手机号后返回 APP，刚才的操作会自动继续。',
  },

  async handleGetPhoneNumber(event) {
    if (this.data.binding) return;
    const detail = event && event.detail ? event.detail : {};
    if (detail.errMsg && !String(detail.errMsg).includes('ok')) {
      this.showError('需要授权手机号后才能继续。');
      return;
    }
    const phoneCode = detail.code || '';
    if (!phoneCode) {
      this.showError('未获取到手机号授权信息，请重试。');
      return;
    }

    this.setData({ binding: true });
    try {
      await auth.bindPhoneWithCode(phoneCode);
      refreshState.mark(['home', 'resume', 'credentials', 'entitlements']);
      this.setData({
        binding: false,
        bound: true,
        status: 'success',
        iconText: '✓',
        title: '手机号已绑定',
        message: '现在可以返回 APP，刚才的操作会自动继续。',
      });
    } catch (error) {
      this.setData({ binding: false });
      this.showError(error && error.message ? error.message : '手机号授权失败，请稍后重试。');
    }
  },

  showError(message) {
    this.setData({
      status: 'error',
      iconText: '!',
      title: '绑定失败',
      message,
    });
  },

  returnToApp() {
    wx.navigateBackMiniProgram({
      extraData: {
        source: 'android_phone_bind',
        phoneBound: this.data.bound,
      },
      fail() {
        wx.showModal({
          title: '请手动返回 APP',
          content: '微信暂时无法自动回到 APP，请从系统任务切换回讲了么 APP 继续。',
          showCancel: false,
        });
      },
    });
  },
});
