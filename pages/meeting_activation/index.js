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
      title: '腾讯会议能力已可用',
      detail: '当前账号已经具备腾讯会议能力，可以直接回到服务中心继续使用。',
      actionText: '返回继续使用',
      tone: 'ok',
    };
  }
  if (activation && activation.isPendingActivation) {
    return {
      title: '请完成腾讯会议激活',
      detail: '企业账号已创建，腾讯会议激活邀请会发送到你的手机号。完成确认后即可正常使用。',
      actionText: '重新发送激活邀请',
      tone: 'warn',
    };
  }
  if (activation && activation.needsActivation) {
    return {
      title: '还差一步完成启用',
      detail: activation.hasEnterpriseUser
        ? '当前账号信息已就绪，需要继续完成腾讯会议能力启用。'
        : '正在创建腾讯会议企业账号，完成后即可继续启用。',
      actionText: '继续启用',
      tone: 'warn',
    };
  }
  if (activation?.needsPhone) {
    return {
      title: '需要先补充手机号授权',
      detail: '只有在后端要求时，才需要补充手机号以继续完成腾讯会议身份绑定。',
      actionText: '授权手机号并继续',
      tone: 'warn',
    };
  }
  if (activation && activation.isDisabled) {
    return {
      title: activation.reason === 'membership_inactive' ? '当前暂无有效会议会员' : '当前环境未启用腾讯会议能力',
      detail: activation.reason === 'membership_inactive'
        ? '你的腾讯会议企业账号已存在，但当前没有有效会议会员，权限暂未开启。购买有效会员后会自动恢复。'
        : '这是环境配置状态，不是你的账号异常。等后端启用后，这里会自动更新。',
      actionText: activation.reason === 'membership_inactive' ? '刷新状态' : '刷新状态',
      tone: 'warn',
    };
  }
  return {
    title: '正在检查腾讯会议状态',
    detail: '请刷新状态，确认当前环境和账号是否已经同步完成。',
    actionText: '刷新状态',
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
        ? (activation.isPendingActivation ? '重新发送激活邀请' : '继续启用腾讯会议')
        : activation.needsPhone
          ? '授权手机号并继续'
          : '检查腾讯会议状态',
    panelTitleText: activation.isActive
      ? '腾讯会议能力已可用'
      : activation.needsActivation
        ? (activation.isPendingActivation ? '完成腾讯会议激活' : '继续启用腾讯会议')
        : activation.needsPhone
          ? '补充手机号后继续'
          : '检查腾讯会议状态',
    panelSubtitleText: statusMeta.detail || '请确认当前账号接入状态。',
    brandTaglineText: activation.isActive
      ? '已完成账号接入，可继续使用'
      : '腾讯会议，会开会',
    activationConfiguredText: activation.configuredText,
    activationPhoneText: activation.phoneText,
    activationUserIdText: activation.userIdText,
    showPanelCopy: true,
  };
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    redirectTarget: '',
    sending: false,
    bindingPhone: false,
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
      this.setData({ errorMessage: '需要授权手机号后才能继续启用腾讯会议' });
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
      refreshState.mark(['home', 'entitlements']);
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

  goBack() {
    wx.navigateBack({
      fail() {
        wx.switchTab({ url: '/pages/home/index' });
      },
    });
  },

});
