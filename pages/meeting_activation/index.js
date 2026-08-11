const auth = require('../../services/auth');
const service = require('../../services/meeting-entitlements');
const refreshState = require('../../services/refresh-state');
const loginGuard = require('../../services/login-guard');
const displayFormatters = require('../../services/display-formatters');

/**
 * Map backend activation state into user-facing copy and primary action metadata.
 *
 * @param activation Current activation payload from backend.
 * @returns UI metadata used by the activation page.
 */
function resolveStatusMeta(activation) {
  if (activation && activation.isActive) {
    return {
      title: '\u817e\u8baf\u4f1a\u8bae\u80fd\u529b\u5df2\u53ef\u7528',
      detail: '\u5f53\u524d\u8d26\u53f7\u5df2\u7ecf\u5177\u5907\u817e\u8baf\u4f1a\u8bae\u80fd\u529b\uff0c\u53ef\u4ee5\u76f4\u63a5\u56de\u5230\u670d\u52a1\u4e2d\u5fc3\u7ee7\u7eed\u4f7f\u7528\u3002',
      actionText: '\u8fd4\u56de\u7ee7\u7eed\u4f7f\u7528',
      tone: 'ok',
    };
  }
  if (activation && activation.isPendingActivation) {
    return {
      title: '\u8bf7\u5b8c\u6210\u817e\u8baf\u4f1a\u8bae\u6fc0\u6d3b',
      detail: '\u4f01\u4e1a\u8d26\u53f7\u5df2\u521b\u5efa\uff0c\u817e\u8baf\u4f1a\u8bae\u6fc0\u6d3b\u9080\u8bf7\u4f1a\u53d1\u9001\u5230\u4f60\u7684\u624b\u673a\u53f7\u3002\u5b8c\u6210\u786e\u8ba4\u540e\u5373\u53ef\u6b63\u5e38\u4f7f\u7528\u3002',
      actionText: '\u91cd\u65b0\u53d1\u9001\u6fc0\u6d3b\u9080\u8bf7',
      tone: 'warn',
    };
  }
  if (activation && activation.needsActivation) {
    return {
      title: '\u8fd8\u5dee\u4e00\u6b65\u5b8c\u6210\u542f\u7528',
      detail: activation.hasEnterpriseUser
        ? '\u5f53\u524d\u8d26\u53f7\u4fe1\u606f\u5df2\u5c31\u7eea\uff0c\u9700\u8981\u7ee7\u7eed\u5b8c\u6210\u817e\u8baf\u4f1a\u8bae\u80fd\u529b\u542f\u7528\u3002'
        : '\u6b63\u5728\u521b\u5efa\u817e\u8baf\u4f1a\u8bae\u4f01\u4e1a\u8d26\u53f7\uff0c\u5b8c\u6210\u540e\u5373\u53ef\u7ee7\u7eed\u542f\u7528\u3002',
      actionText: '\u7ee7\u7eed\u542f\u7528',
      tone: 'warn',
    };
  }
  if (activation && activation.needsPhone) {
    return {
      title: '\u9700\u8981\u5148\u8865\u5145\u624b\u673a\u53f7\u6388\u6743',
      detail: '\u53ea\u6709\u5728\u9700\u8981\u817e\u8baf\u4f1a\u8bae\u76f8\u5173\u529f\u80fd\u65f6\uff0c\u624d\u9700\u8981\u8865\u5145\u624b\u673a\u53f7\u4ee5\u7ee7\u7eed\u5b8c\u6210\u817e\u8baf\u4f1a\u8bae\u8eab\u4efd\u7ed1\u5b9a\u3002',
      actionText: '\u6388\u6743\u624b\u673a\u53f7\u5e76\u7ee7\u7eed',
      tone: 'warn',
    };
  }
  if (activation && activation.isDisabled) {
    return {
      title: '\u5f53\u524d\u73af\u5883\u672a\u542f\u7528\u817e\u8baf\u4f1a\u8bae\u80fd\u529b',
      detail: '\u8fd9\u662f\u73af\u5883\u914d\u7f6e\u72b6\u6001\uff0c\u4e0d\u662f\u4f60\u7684\u8d26\u53f7\u5f02\u5e38\u3002\u7b49\u540e\u7aef\u542f\u7528\u540e\uff0c\u8fd9\u91cc\u4f1a\u81ea\u52a8\u66f4\u65b0\u3002',
      actionText: '\u5237\u65b0\u72b6\u6001',
      tone: 'warn',
    };
  }
  return {
    title: '\u6b63\u5728\u68c0\u67e5\u817e\u8baf\u4f1a\u8bae\u72b6\u6001',
    detail: '\u8bf7\u5237\u65b0\u72b6\u6001\uff0c\u786e\u8ba4\u5f53\u524d\u73af\u5883\u548c\u8d26\u53f7\u662f\u5426\u5df2\u7ecf\u540c\u6b65\u5b8c\u6210\u3002',
    actionText: '\u5237\u65b0\u72b6\u6001',
    tone: 'warn',
  };
}

/**
 * Build normalized activation page state from raw backend activation data.
 *
 * @param {object} rawActivation Raw backend activation payload.
 * @returns {object} Page-ready activation view state.
 */
function buildActivationViewState(rawActivation) {
  const activation = displayFormatters.normalizeMeetingActivationState(rawActivation);
  const statusMeta = resolveStatusMeta(activation);
  return {
    activation: {
      ...activation,
      statusMeta,
    },
    primaryButtonText: activation.isActive
      ? '返回继续使用'
      : activation.needsActivation
        ? (activation.isPendingActivation ? '重新发送激活邀请' : '激活讲了么账号')
        : activation.needsPhone
          ? '授权手机号并继续'
          : '检查腾讯会议状态',
    panelTitleText: activation.isActive
      ? '腾讯会议能力已可用'
      : '您的账号暂未开通讲了么',
    panelSubtitleText: activation.isActive
      ? (statusMeta.detail || '请确认当前账号接入状态。')
      : '激活后才可使用完整功能',
    brandTaglineText: activation.isActive
      ? '已完成账号接入，可继续使用'
      : '腾讯会议，会开会',
    activationConfiguredText: activation.configuredText,
    activationPhoneText: activation.phoneText,
    activationUserIdText: activation.userIdText,
    showPanelCopy: true,
  };
}

function showActivationSmsNotice() {
  wx.showModal({
    title: '请留意腾讯会议短信',
    content: '激活短信由“腾讯”发送。如果暂时没有看到，请检查短信拦截、垃圾短信或骚扰短信列表。',
    showCancel: false,
    confirmText: '知道了',
  });
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    redirectTarget: '',
    sending: false,
    bindingPhone: false,
    activationAuthLinkLoading: false,
    activation: null,
    errorMessage: '',
    successMessage: '',
    mascotUrl: '/assets/ui/jlm-transparent.png',
    primaryButtonText: '检查腾讯会议状态',
    panelTitleText: '检查腾讯会议状态',
    panelSubtitleText: '请确认当前账号接入状态。',
    brandTaglineText: '腾讯会议，会开会',
    showPanelCopy: true,
    activationConfiguredText: '未启用',
    activationPhoneText: '当前无需提供',
    activationUserIdText: '待创建',
  },

  onLoad() {
    const pages = getCurrentPages();
    const currentPage = pages[pages.length - 1];
    const options = (currentPage && currentPage.options) || {};
    const redirectTarget = decodeURIComponent(options.redirect || '');
    this.setData({
      redirectTarget,
    });
  },

  async onShow() {
    const loggedIn = await loginGuard.ensureLoggedInAsync({
      targetUrl: '/pages/meeting_activation/index',
      navigateAfterLogin: false,
    });
    if (!loggedIn) {
      this.setData({
        loading: false,
        hasLoaded: true,
        errorMessage: '',
        ...buildActivationViewState({
          configured: true,
          status: 'inactive',
          needsPhone: true,
          needsActivation: true,
        }),
      });
      return;
    }
    this.loadActivation(true);
  },

  async loadActivation(forceRefresh) {
    if (!this.data.hasLoaded) {
      this.setData({ loading: true, errorMessage: '', successMessage: '' });
    } else {
      this.setData({ errorMessage: '', successMessage: '' });
    }
    try {
      const rawActivation = await service.getTencentMeetingActivation({ forceRefresh });
      const viewState = buildActivationViewState(rawActivation);
      this.setData({
        loading: false,
        hasLoaded: true,
        ...viewState,
      });
      if (viewState.activation && viewState.activation.isActive) {
        refreshState.mark(['home', 'entitlements', 'referrals']);
      }
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '腾讯会议状态加载失败',
      });
    }
  },

  async handleGetPhoneNumber(event) {
    const detail = event.detail || {};
    if (detail.errMsg && !String(detail.errMsg).includes('ok')) {
      this.setData({ errorMessage: '需要授权手机号后才能激活讲了么账号' });
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
        successMessage: result.inviteMessage || '启用通知已发送',
      });
      showActivationSmsNotice();
      refreshState.mark(['home', 'entitlements', 'referrals']);
      await this.loadActivation(true);
    } catch (error) {
      this.setData({
        bindingPhone: false,
        errorMessage: error && error.message ? error.message : '手机号授权或启用通知发送失败',
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
        successMessage: result.inviteMessage || '启用通知已发送',
      });
      showActivationSmsNotice();
      await this.loadActivation(true);
    } catch (error) {
      this.setData({
        sending: false,
        errorMessage: error && error.message ? error.message : '启用通知发送失败',
      });
    }
  },

  async handlePrimaryAction() {
    const activation = this.data.activation || {};
    if (activation.needsPhone) {
      this.setData({ errorMessage: '请使用手机号授权按钮继续。' });
      return;
    }
    if (activation.needsActivation) {
      await this.resendInvite();
      return;
    }
    if (activation.isActive) {
      this.goBack();
      return;
    }
    await this.loadActivation(true);
  },

  async openBrowserActivation() {
    if (this.data.activationAuthLinkLoading) return;
    this.setData({ activationAuthLinkLoading: true });
    try {
      const result = await service.createTencentMeetingActivationAuthLink();
      const authUrl = String(result && (result.authUrl || result.url) || '').trim();
      if (!authUrl) {
        throw new Error('暂时没有获取到激活链接，请稍后重试。');
      }
      wx.showModal({
        title: '去浏览器中激活',
        content: '请复制链接到手机浏览器中打开，按提示完成腾讯会议功能激活。\n链接48小时内有效。',
        cancelText: '取消',
        confirmText: '复制链接',
        success: (modalResult) => {
          if (!modalResult.confirm) return;
          wx.setClipboardData({
            data: authUrl,
            success: () => {
              wx.showToast({ title: '已复制链接', icon: 'success' });
            },
          });
        },
      });
    } catch (error) {
      this.setData({
        errorMessage: error && error.message ? error.message : '激活链接获取失败，请稍后重试。',
      });
    } finally {
      this.setData({ activationAuthLinkLoading: false });
    }
  },

  goBack() {
    const redirectTarget = loginGuard.normalizeUrl(this.data.redirectTarget);
    if (redirectTarget && redirectTarget !== '/pages/meeting_activation/index') {
      if (loginGuard.isTabPage(redirectTarget)) {
        wx.switchTab({ url: redirectTarget });
        return;
      }
      wx.redirectTo({ url: redirectTarget });
      return;
    }
    wx.navigateBack({
      fail() {
        wx.switchTab({ url: '/pages/home/index' });
      },
    });
  },

});
