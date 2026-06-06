const profileService = require('../../../services/profile');
const refreshState = require('../../../services/refresh-state');
const loginGuard = require('../../../services/login-guard');
const tencentMeetingAccess = require('../../../services/tencent-meeting-access');

const PAGE_KEY = 'credentials';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

function arrayFrom(raw, keys) {
  if (Array.isArray(raw)) return raw;
  const source = raw || {};
  for (let index = 0; index < keys.length; index += 1) {
    const item = source[keys[index]];
    if (Array.isArray(item)) return item;
  }
  return [];
}

function normalizeEmailDomains(item) {
  return arrayFrom(item.emailDomains || item.domains, ['items', 'domains'])
    .map((domain) => String(domain || '').replace(/^@+/, '').trim().toLowerCase())
    .filter(Boolean);
}

function normalizeCredential(item) {
  const organizationSlug = item.organizationSlug || item.partitionCode || item.slug || '';
  const title = item.title || item.titleText || item.name || '我的认证';
  return {
    ...item,
    organizationSlug,
    titleText: title,
    emailMaskedText: item.emailMasked || '',
    verifiedAtText: item.verifiedAt ? String(item.verifiedAt).slice(0, 10) : '',
    logoUrl: item.logoUrl || '',
    logoFrameClass: organizationSlug ? `cert-logo-${organizationSlug}` : '',
    badgeText: String(title).slice(0, 2),
  };
}

function normalizeOrganization(item) {
  const domains = normalizeEmailDomains(item);
  const slug = item.slug || item.organizationSlug || item.partitionCode || '';
  return {
    ...item,
    id: item.id || item.organizationId || '',
    slug,
    nameText: item.name || item.title || '第三方组织',
    descriptionText: item.description || (domains.length ? `支持 ${domains.map((domain) => `@${domain}`).join('、')}` : '使用组织邮箱完成认证'),
    domainText: domains.map((domain) => `@${domain}`).join('、'),
    emailDomains: domains,
    logoUrl: item.logoUrl || '',
    logoFrameClass: slug ? `cert-logo-${slug}` : '',
    logoFallbackText: String(item.name || item.title || '组').slice(0, 1),
    certified: Boolean(item.certified),
    credential: item.credential ? normalizeCredential(item.credential) : null,
  };
}

function isEmailAllowed(email, organization) {
  const value = String(email || '').trim().toLowerCase();
  const domain = value.split('@').pop() || '';
  return Boolean(value && organization.emailDomains.includes(domain));
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    errorMessage: '',
    credentials: [],
    organizations: [],
    showVerifyModal: false,
    activeOrganization: null,
    emailInput: '',
    codeInput: '',
    challengeId: '',
    emailMaskedText: '',
    sendingCode: false,
    verifying: false,
    canSendCode: false,
  },

  async onShow() {
    if (!loginGuard.guardPage('/pages/resume/credentials/index')) {
      return;
    }
    const ready = await tencentMeetingAccess.ensureReady({ targetUrl: '/pages/resume/credentials/index' });
    if (!ready) return;
    if (!this.data.hasLoaded || refreshState.consume(PAGE_KEY) || refreshState.isExpired(PAGE_KEY, CACHE_MAX_AGE_MS)) {
      this.loadCredentials(true);
    }
  },

  async loadCredentials(forceRefresh) {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const [credentialsRaw, organizationsRaw] = await Promise.all([
        profileService.getCredentials({ forceRefresh }),
        profileService.getCertificationOrganizations({ forceRefresh }),
      ]);
      const credentials = arrayFrom(credentialsRaw, ['items', 'credentials']).map(normalizeCredential);
      const organizations = arrayFrom(organizationsRaw, ['items', 'organizations']).map(normalizeOrganization);
      this.setData({
        loading: false,
        hasLoaded: true,
        credentials,
        organizations,
      });
      refreshState.touch(PAGE_KEY);
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '我的认证加载失败',
      });
    }
  },

  openOrganization(event) {
    const organizationId = event.currentTarget.dataset.id;
    const organization = this.data.organizations.find((item) => item.id === organizationId);
    if (!organization) return;
    if (organization.certified) {
      wx.showToast({ title: '已完成认证', icon: 'none' });
      return;
    }
    this.setData({
      showVerifyModal: true,
      activeOrganization: organization,
      emailInput: '',
      codeInput: '',
      challengeId: '',
      emailMaskedText: '',
      canSendCode: false,
    });
  },

  closeVerifyModal() {
    if (this.data.sendingCode || this.data.verifying) return;
    this.setData({ showVerifyModal: false });
  },

  noop() {},

  onEmailInput(event) {
    const emailInput = event.detail.value;
    this.setData({
      emailInput,
      canSendCode: isEmailAllowed(emailInput, this.data.activeOrganization || {}),
    });
  },

  onCodeInput(event) {
    this.setData({ codeInput: event.detail.value });
  },

  async sendCode() {
    const organization = this.data.activeOrganization;
    const email = String(this.data.emailInput || '').trim();
    if (!organization || !email) return;
    if (!isEmailAllowed(email, organization)) {
      wx.showToast({ title: '邮箱后缀不属于该组织', icon: 'none' });
      return;
    }
    if (this.data.sendingCode) return;
    this.setData({ sendingCode: true });
    try {
      const result = await profileService.sendCertificationEmailCode({
        organizationId: organization.id,
        email,
      });
      this.setData({
        sendingCode: false,
        challengeId: result.challengeId || '',
        emailMaskedText: result.emailMasked || '',
      });
      wx.showToast({ title: '验证码已发送', icon: 'success' });
    } catch (error) {
      this.setData({ sendingCode: false });
      wx.showToast({ title: error && error.message ? error.message : '验证码发送失败', icon: 'none' });
    }
  },

  async verifyCode() {
    const organization = this.data.activeOrganization;
    const email = String(this.data.emailInput || '').trim();
    const code = String(this.data.codeInput || '').trim();
    if (!organization || !email || !this.data.challengeId) {
      wx.showToast({ title: '请先获取验证码', icon: 'none' });
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      wx.showToast({ title: '请输入 6 位验证码', icon: 'none' });
      return;
    }
    if (this.data.verifying) return;
    this.setData({ verifying: true });
    try {
      await profileService.verifyCertificationEmail({
        organizationId: organization.id,
        email,
        challengeId: this.data.challengeId,
        code,
      });
      wx.showToast({ title: '认证成功', icon: 'success' });
      this.setData({ verifying: false, showVerifyModal: false });
      refreshState.mark(['resume', 'credentials', 'home']);
      await this.loadCredentials(true);
    } catch (error) {
      this.setData({ verifying: false });
      wx.showToast({ title: error && error.message ? error.message : '认证失败', icon: 'none' });
    }
  },

  refresh() {
    this.loadCredentials(true);
  },
});
