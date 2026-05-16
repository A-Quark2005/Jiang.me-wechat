const auth = require('../../../services/auth');
const apiClient = require('../../../services/api-client');

Page({
  data: {
    submitting: false,
    errorMessage: '',
    successMessage: '',
    backendBaseUrl: '',
  },

  onLoad() {
    this.setData({ backendBaseUrl: apiClient.backendBaseUrl() });
  },

  async handleGetPhoneNumber(event) {
    const detail = event.detail || {};
    if (detail.errMsg && !String(detail.errMsg).includes('ok')) {
      this.setData({ errorMessage: '需要授权手机号后才能完成注册' });
      return;
    }
    const phoneCode = detail.code || '';
    if (!phoneCode) {
      this.setData({ errorMessage: '微信未返回手机号授权 code，请重试' });
      return;
    }
    this.setData({ submitting: true, errorMessage: '', successMessage: '' });
    try {
      const result = await auth.registerWithPhoneCode(phoneCode);
      this.setData({
        submitting: false,
        successMessage: result && result.inviteSmsSent ? '注册成功，邀请短信已发送' : '注册成功',
      });
      wx.showToast({ title: '注册成功', icon: 'success' });
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/home/index' });
      }, 800);
    } catch (error) {
      this.setData({
        submitting: false,
        errorMessage: error && error.message ? error.message : '注册失败',
      });
    }
  },

  goHome() {
    wx.reLaunch({ url: '/pages/home/index' });
  },
});
