const auth = require('../../services/auth');
const service = require('../../services/meeting-entitlements');
const refreshState = require('../../services/refresh-state');

function statusText(status) {
  if (status === 'active') return '已激活';
  if (status === 'inactive') return '待激活';
  if (status === 'not_registered') return '未创建';
  if (status === 'disabled') return '已停用';
  return '待确认';
}

Page({
  data: {
    loading: true,
    sending: false,
    bindingPhone: false,
    activation: null,
    errorMessage: '',
    successMessage: '',
  },

  onShow() {
    this.loadActivation();
  },

  async loadActivation() {
    this.setData({ loading: true, errorMessage: '', successMessage: '' });
    try {
      const activation = await service.getTencentMeetingActivation();
      this.setData({
        loading: false,
        activation: {
          ...activation,
          statusText: statusText(activation && activation.status),
        },
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '腾讯会议激活状态加载失败',
      });
    }
  },

  async handleGetPhoneNumber(event) {
    const detail = event.detail || {};
    if (detail.errMsg && !String(detail.errMsg).includes('ok')) {
      this.setData({ errorMessage: '需要授权手机号后才能发送腾讯会议激活短信' });
      return;
    }
    const phoneCode = detail.code || '';
    if (!phoneCode) {
      this.setData({ errorMessage: '未获取到手机号授权信息，请重试' });
      return;
    }
    this.setData({ bindingPhone: true, errorMessage: '', successMessage: '' });
    try {
      await auth.bindPhoneWithCode(phoneCode);
      const result = await service.sendTencentMeetingActivationInvite();
      this.setData({
        bindingPhone: false,
        successMessage: result.inviteMessage || '激活短信已发送',
      });
      refreshState.mark(['home', 'entitlements']);
      await this.loadActivation();
    } catch (error) {
      this.setData({
        bindingPhone: false,
        errorMessage: error && error.message ? error.message : '手机号授权或激活短信发送失败',
      });
    }
  },

  async resendInvite() {
    if (this.data.sending) return;
    this.setData({ sending: true, errorMessage: '', successMessage: '' });
    try {
      const result = await service.sendTencentMeetingActivationInvite();
      this.setData({
        sending: false,
        successMessage: result.inviteMessage || '激活短信已发送',
      });
      await this.loadActivation();
    } catch (error) {
      this.setData({
        sending: false,
        errorMessage: error && error.message ? error.message : '激活短信发送失败',
      });
    }
  },

  goBack() {
    wx.navigateBack({
      fail() {
        wx.switchTab({ url: '/pages/home/index' });
      },
    });
  },
});
