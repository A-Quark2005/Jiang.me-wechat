const auth = require('../../services/auth');
const apiClient = require('../../services/api-client');
const sessionStore = require('../../services/session-store');
const entitlementsService = require('../../services/meeting-entitlements');
const profileService = require('../../services/profile');
const refreshState = require('../../services/refresh-state');

const PAGE_KEY = 'home';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatPhone(user, profile) {
  const phone =
    (user && (user.phone || user.phoneMasked || user.mobile)) ||
    (profile && (profile.phone || profile.phoneMasked)) ||
    '';
  return phone || '手机号已绑定';
}

function resolveEntitlementSummary(entitlements) {
  const list = safeArray(entitlements && (entitlements.items || entitlements.entitlements || entitlements));
  const active = list.find((item) => String(item.status || '').toLowerCase() === 'active') || list[0];
  if (!active) {
    return {
      title: '未开通会议权益',
      detail: '可按需购买会议权益，并同步到安卓 APP',
      tone: 'warn',
    };
  }
  const expiresAt = active.expiresAt || active.validUntil || '';
  const remaining = active.remainingCount || active.remainingUses || '';
  return {
    title: active.name || active.title || '会议权益可用',
    detail: expiresAt ? `有效期至 ${expiresAt}` : remaining ? `剩余 ${remaining} 次` : '权益已生效',
    tone: 'ok',
  };
}

function resolveResumeSummary(resume, credentials, engagements) {
  const credentialCount = safeArray(credentials && (credentials.items || credentials.credentials || credentials)).length;
  const engagementItems = safeArray(engagements && (engagements.items || engagements.engagements || engagements));
  const confirmedCount = engagementItems.filter((item) => {
    const status = String(item.status || item.confirmationStatus || '').toLowerCase();
    return status === 'confirmed' || status === 'active';
  }).length;
  const pendingCount = engagementItems.filter((item) => {
    const status = String(item.status || item.confirmationStatus || '').toLowerCase();
    return status.includes('pending');
  }).length;
  const intro = resume && (resume.selfIntroduction || '');
  const completion = resume && (resume.completionPercent || (resume.completion && resume.completion.percent));
  return {
    completion: completion || (intro ? 60 : 25),
    credentialCount,
    confirmedCount,
    pendingCount,
    needsSelfIntro: !intro,
  };
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    session: null,
    user: null,
    profile: null,
    phoneText: '',
    entitlementSummary: null,
    resumeSummary: null,
    backendBaseUrl: '',
  },

  onLoad() {
    this.setData({ backendBaseUrl: apiClient.backendBaseUrl() });
  },

  onShow() {
    if (!this.data.session || refreshState.consume(PAGE_KEY) || refreshState.isExpired(PAGE_KEY, CACHE_MAX_AGE_MS)) {
      this.ensureRegisteredAndLoad();
    }
  },

  async ensureRegisteredAndLoad() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const loginResult = await auth.loginWithMiniProgram();
      if (!loginResult || !loginResult.registered) {
        wx.redirectTo({ url: '/pages/auth/register/index' });
        return;
      }
      const app = getApp();
      const pendingInviteToken =
        app && app.globalData ? app.globalData.pendingEngagementInviteToken : '';
      if (pendingInviteToken) {
        wx.redirectTo({
          url: `/pages/resume/engagement_detail/index?inviteToken=${encodeURIComponent(pendingInviteToken)}`,
        });
        return;
      }
      const sessionRecord = sessionStore.getSessionRecord();
      await this.loadDashboard(sessionRecord);
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '服务中心加载失败',
      });
    }
  },

  async loadDashboard(sessionRecord) {
    const [bootstrap, capabilities, entitlements, resume, credentials, engagements] = await Promise.all([
      apiClient.request({ path: '/api/bootstrap' }),
      entitlementsService.getCapabilities(),
      entitlementsService.getEntitlements(),
      profileService.getResume(),
      profileService.getCredentials(),
      profileService.getEngagements(),
    ]);
    const user = (bootstrap && bootstrap.me) || (sessionRecord && sessionRecord.user) || {};
    const profile = (bootstrap && bootstrap.profile) || (sessionRecord && sessionRecord.profile) || {};
    this.setData({
      loading: false,
      session: sessionStore.getSession(),
      user,
      profile,
      phoneText: formatPhone(user, profile),
      entitlementSummary: resolveEntitlementSummary(entitlements || capabilities),
      resumeSummary: resolveResumeSummary(resume, credentials, engagements),
    });
    refreshState.touch(PAGE_KEY);
  },

  openRegister() {
    wx.navigateTo({ url: '/pages/auth/register/index' });
  },

  openResume() {
    wx.switchTab({ url: '/pages/resume/index' });
  },

  openEntitlements() {
    wx.switchTab({ url: '/pages/meeting_entitlements/index' });
  },

  openEngagements() {
    wx.navigateTo({ url: '/pages/resume/engagements/index?tab=pending' });
  },

  openOrders() {
    wx.navigateTo({ url: '/pages/orders/index' });
  },

  refresh() {
    refreshState.mark(PAGE_KEY);
    this.ensureRegisteredAndLoad();
  },
});
