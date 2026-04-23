const { normalizeBaseUrl, request } = require('../../../utils/request');

function getLaunchQuery() {
  const enterOptions = wx.getEnterOptionsSync ? wx.getEnterOptionsSync() : null;
  if (enterOptions && enterOptions.query) {
    return enterOptions.query;
  }
  const launchOptions = wx.getLaunchOptionsSync ? wx.getLaunchOptionsSync() : null;
  return (launchOptions && launchOptions.query) || {};
}

Page({
  data: {
    bindingTicket: '',
    backendBaseUrl: 'https://api.whkerdb.top',
    phoneNumber: '',
    submitting: false,
    completed: false,
    canAuthorize: false,
    errorMessage: '',
    successMessage: '',
    subtitleText: '请输入要绑定的手机号，提交成功后返回 APP，登录会自动继续。',
    authStage: '',
    debugMessage: '',
  },

  onLoad(options) {
    this.applyLaunchOptions(options || {});
  },

  onShow() {
    if (!this.data.bindingTicket) {
      this.applyLaunchOptions(getLaunchQuery());
    }
  },

  applyLaunchOptions(rawOptions) {
    const bindingTicket = decodeURIComponent(rawOptions.bindingTicket || '').trim();
    const backendBaseUrl = normalizeBaseUrl(
      decodeURIComponent(rawOptions.backendBaseUrl || ''),
    );
    this.setData({
      bindingTicket,
      backendBaseUrl,
      canAuthorize: Boolean(bindingTicket),
      errorMessage: bindingTicket
        ? ''
        : '未收到 bindingTicket，请回到 APP 重新发起微信登录。',
      successMessage: '',
      completed: false,
      authStage: bindingTicket ? 'ready' : 'missing_ticket',
      debugMessage: bindingTicket ? '' : '当前页面缺少登录票据，无法继续绑定手机号。',
      subtitleText: bindingTicket
        ? '请输入要绑定的手机号，提交成功后返回 APP。'
        : '当前页面缺少登录上下文，无法继续绑定手机号。',
    });
  },

  handlePhoneInput(event) {
    const value = String(event.detail && event.detail.value ? event.detail.value : '');
    this.setData({
      phoneNumber: value.replace(/[^\d]/g, '').slice(0, 11),
      errorMessage: '',
    });
  },

  async handleDirectBind() {
    if (!this.data.bindingTicket) {
      this.setData({
        authStage: 'missing_ticket',
        errorMessage: '缺少 bindingTicket，请回到 APP 重新发起登录。',
        debugMessage: '请不要直接打开本页面，必须由 APP 拉起并传入 bindingTicket。',
      });
      return;
    }

    const phoneNumber = String(this.data.phoneNumber || '').trim();
    if (!/^1\d{10}$/.test(phoneNumber)) {
      this.setData({
        authStage: 'invalid_phone',
        errorMessage: '请输入正确的 11 位手机号。',
        debugMessage: `当前输入：${phoneNumber || '空'}`,
      });
      return;
    }

    this.setData({
      submitting: true,
      authStage: 'submitting',
      errorMessage: '',
      successMessage: '',
      debugMessage: [
        `提交方式：direct_bind`,
        `绑定票据：${this.data.bindingTicket}`,
        `手机号：${phoneNumber}`,
      ].join('\n'),
    });

    try {
      const result = await request({
        baseUrl: this.data.backendBaseUrl,
        path: '/api/auth/phone/direct-bind',
        method: 'POST',
        data: {
          bindingTicket: this.data.bindingTicket,
          phone: phoneNumber,
        },
      });

      const resolvedPhone =
        (result && result.user && result.user.phone) || phoneNumber;
      this.setData({
        completed: true,
        authStage: 'completed',
        successMessage: `手机号绑定成功（${resolvedPhone}），请返回 APP 继续登录。`,
        subtitleText: 'APP 正在轮询登录状态，现在可以直接返回。',
        debugMessage: [
          `提交方式：direct_bind`,
          `后端绑定结果：成功`,
          `返回手机号：${resolvedPhone}`,
        ].join('\n'),
      });
      wx.showToast({
        title: '绑定成功',
        icon: 'success',
      });
    } catch (error) {
      this.setData({
        authStage: 'bind_failed',
        errorMessage: error && error.message ? error.message : '手机号绑定失败，请稍后重试。',
        debugMessage: [
          `提交方式：direct_bind`,
          `失败原因：${error && error.message ? error.message : 'unknown'}`,
          `提交手机号：${phoneNumber}`,
        ].join('\n'),
      });
    } finally {
      this.setData({
        submitting: false,
      });
    }
  },

  handleReloadFromLaunchOptions() {
    this.applyLaunchOptions(getLaunchQuery());
  },

  handleExitMiniProgram() {
    if (wx.exitMiniProgram) {
      wx.exitMiniProgram({});
      return;
    }
    wx.showToast({
      title: '请手动返回 APP',
      icon: 'none',
    });
  },
});
