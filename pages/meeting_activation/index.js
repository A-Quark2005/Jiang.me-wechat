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
    showPanelCopy: !activation.isLoggedIn,
  };
}

/**
 * Build the guest registration prompt shown after mini-program login says the account is not registered yet.
 *
 * @returns {object} Page state for the registration prompt.
 */
function buildRegistrationPromptState() {
  const guestActivation = displayFormatters.normalizeMeetingActivationState({
    status: 'registration_required',
    needsPhone: true,
    needsActivation: false,
  });
  return {
    activation: {
      ...guestActivation,
      statusMeta: {
        title: '请先授权手机号完成注册',
        detail: '当前账号还未完成手机号注册，请先授权手机号再继续。',
        actionText: '授权手机号并注册',
        tone: 'warn',
      },
    },
    loading: false,
    hasLoaded: false,
    loggedIn: false,
    registrationRequired: true,
    primaryButtonText: '授权手机号并注册',
    panelTitleText: '授权手机号完成注册',
    panelSubtitleText: '当前账号还未注册，请先授权手机号继续。',
    brandTaglineText: '腾讯会议，会开会',
    showPanelCopy: true,
    activationConfiguredText: '待注册',
    activationPhoneText: '注册时获取',
    activationUserIdText: '待创建',
    successMessage: '',
    errorMessage: '',
  };
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    redirectTarget: '',
    loggedIn: false,
    registrationRequired: false,
    sending: false,
    bindingPhone: false,
    submittingLogin: false,
    activation: null,
    errorMessage: '',
    successMessage: '',
    agreed: false,
    mascotUrl: '/assets/ui/jlm-transparent.png',
    primaryButtonText: '登录',
    panelTitleText: '登录讲了么账号',
    panelSubtitleText: '登录后即可继续查看权益、资料和预定会议。',
    brandTaglineText: '腾讯会议，会开会',
    showPanelCopy: false,
    agreementCheckedClass: '',
    agreementCheckmark: '',
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

  onShow() {
    const loggedIn = loginGuard.isLoggedIn();
    this.setData({ loggedIn });
    if (!loggedIn) {
      const guestActivation = displayFormatters.normalizeMeetingActivationState({
        status: 'not_logged_in',
        needsPhone: false,
        needsActivation: false,
      });
      this.setData({
        loading: false,
        hasLoaded: false,
        activation: {
          ...guestActivation,
          statusMeta: {
            title: '请先登录讲了么账号',
            detail: '未登录时仅可浏览首页，进入权益、资料、预定等页面前需要先完成登录。',
            actionText: '登录讲了么账号',
            tone: 'warn',
          },
        },
        primaryButtonText: '登录',
        panelTitleText: '登录讲了么账号',
        panelSubtitleText: '',
        brandTaglineText: '腾讯会议，会开会',
        showPanelCopy: false,
        registrationRequired: false,
        activationConfiguredText: '待登录',
        activationPhoneText: '登录后获取',
        activationUserIdText: '待创建',
        successMessage: '',
        errorMessage: '',
        submittingLogin: false,
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
    if (!this.data.loggedIn) {
      if (!this.data.agreed) {
        this.setData({ errorMessage: '请先勾选并同意相关协议' });
        return;
      }
      this.setData({ submittingLogin: true, errorMessage: '', successMessage: '' });
      try {
        const loginResult = await auth.loginWithMiniProgram();
        const hasSession =
          loginResult &&
          (loginResult.session || loginResult.token || loginResult.accessToken);
        if (!hasSession) {
          if (loginResult && (loginResult.registrationRequired || loginResult.result === 'registration_required')) {
            this.setData({
              ...buildRegistrationPromptState(),
              submittingLogin: false,
            });
            return;
          }
          throw new Error('登录未返回有效会话');
        }
        this.setData({ loggedIn: true, registrationRequired: false, submittingLogin: false });
        refreshState.mark(['home', 'entitlements', 'resume', 'orders', 'meeting_products', 'engagements']);
        const targetUrl = loginGuard.normalizeUrl(this.data.redirectTarget);
        if (targetUrl && targetUrl !== loginGuard.LOGIN_PAGE) {
          if (loginGuard.isTabPage(targetUrl)) {
            wx.switchTab({ url: targetUrl });
          } else {
            wx.redirectTo({ url: targetUrl });
          }
          return;
        }
        await this.loadActivation(true);
      } catch (error) {
        this.setData({
          submittingLogin: false,
          errorMessage: error && error.message ? error.message : '登录失败，请稍后重试',
        });
      }
      return;
    }
    const activation = this.data.activation || {};
    if (!this.data.agreed) {
      this.setData({ errorMessage: '请先勾选并同意相关协议' });
      return;
    }
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

  async handleRegisterPhoneNumber(event) {
    const detail = event.detail || {};
    if (detail.errMsg && !String(detail.errMsg).includes('ok')) {
      this.setData({ errorMessage: '需要授权手机号后才能继续注册' });
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
      this.setData({ bindingPhone: false, loggedIn: true, registrationRequired: false });
      refreshState.mark(['home', 'entitlements', 'resume', 'orders', 'meeting_products', 'engagements']);
      const targetUrl = loginGuard.normalizeUrl(this.data.redirectTarget);
      if (targetUrl && targetUrl !== loginGuard.LOGIN_PAGE) {
        if (loginGuard.isTabPage(targetUrl)) {
          wx.switchTab({ url: targetUrl });
        } else {
          wx.redirectTo({ url: targetUrl });
        }
        return;
      }
      await this.loadActivation(true);
    } catch (error) {
      this.setData({
        bindingPhone: false,
        errorMessage: error && error.message ? error.message : '手机号注册失败，请稍后重试',
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

  toggleAgreement() {
    const agreed = !this.data.agreed;
    this.setData({
      agreed,
      agreementCheckedClass: agreed ? 'agreement-checkbox-on' : '',
      agreementCheckmark: agreed ? '✓' : '',
      errorMessage: '',
    });
  },
});
