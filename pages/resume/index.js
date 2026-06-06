const profileService = require('../../services/profile');
const refreshState = require('../../services/refresh-state');
const apiClient = require('../../services/api-client');
const loginGuard = require('../../services/login-guard');
const sessionStore = require('../../services/session-store');
const tencentMeetingAccess = require('../../services/tencent-meeting-access');

const PAGE_KEY = 'resume';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

function arrayFrom(value, keys) {
  if (Array.isArray(value)) {
    return value;
  }
  const source = value || {};
  for (let index = 0; index < keys.length; index += 1) {
    const item = source[keys[index]];
    if (Array.isArray(item)) {
      return item;
    }
  }
  return [];
}

function splitEngagements(raw) {
  const items = arrayFrom(raw, ['items', 'engagements']);
  const pending = items.filter((item) =>
    String(item.status || item.confirmationStatus || '').toLowerCase().includes('pending') ||
    item.requiresMyConfirmation === true ||
    item.waitingForOtherConfirmation === true ||
    Boolean(item.pendingChange),
  );
  return {
    provided: items.filter((item) => String(item.side || item.kind || '').includes('provider') || String(item.kind || '').includes('provided')),
    received: items.filter((item) => String(item.side || item.kind || '').includes('receiver') || String(item.kind || '').includes('received') || String(item.kind || '').includes('purchased')),
    pending,
  };
}

function cachedResumePage() {
  return wx.getStorageSync('jiangleme.page.resume.summary') || null;
}

function saveCachedResumePage(payload) {
  wx.setStorageSync('jiangleme.page.resume.summary', {
    savedAt: Date.now(),
    data: payload,
  });
}

function recentCache(record, maxAgeMs) {
  if (!record || typeof record !== 'object') return null;
  const savedAt = Number(record.savedAt || 0);
  if (!savedAt || Date.now() - savedAt > maxAgeMs) return null;
  return record.data || null;
}

function buildAccountInfo(resume) {
  const session = sessionStore.getSession() || {};
  const source = resume || {};
  const displayName =
    source.displayName ||
    session.displayName ||
    '用户昵称';
  const avatarUrl = source.avatarUrl || '';
  const accountTier = source.accountTier || 'standard';
  const accountTierText = source.accountTierText || (accountTier === 'premium' ? '高级账号' : '普通账号');
  return {
    displayNameText: displayName,
    avatarUrl,
    avatarText: String(displayName || '讲').trim().slice(0, 1) || '讲',
    accountTier,
    accountTierText,
    accountTierClass: accountTier === 'premium' ? 'account-tier-premium' : 'account-tier-standard',
  };
}

function isOwnUploadedAvatarUrl(value) {
  return String(value || '').startsWith(`${apiClient.backendBaseUrl()}/uploads/`);
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    errorMessage: '',
    resume: null,
    credentials: [],
    engagementGroups: {
      provided: [],
      received: [],
      pending: [],
    },
    selfIntroductionText: '暂无自我介绍',
    displayNameText: '用户昵称',
    avatarUrl: '',
    avatarText: '讲',
    accountTier: 'standard',
    accountTierText: '普通账号',
    accountTierClass: 'account-tier-standard',
    showWechatProfileModal: false,
    savingWechatProfile: false,
    profileDraftNickname: '',
    profileDraftAvatarUrl: '',
  },

  onLoad() {
    if (!loginGuard.guardPage('/pages/resume/index', { viaTab: true })) {
      return;
    }
    const dashboard = apiClient.request
      ? wx.getStorageSync('jiangleme.api-cache.mini_program_dashboard')
      : null;
    if (dashboard && dashboard.data && dashboard.data.resume) {
      saveCachedResumePage({
        resume: dashboard.data.resume,
        credentials: arrayFrom(
          dashboard.data.resume.certifiedQualifications || dashboard.data.resume.credentials,
          ['items', 'credentials'],
        ).slice(0, 3),
        engagementGroups: splitEngagements(
          dashboard.data.resume.relatedExperiences || dashboard.data.resume.engagements,
        ),
        selfIntroductionText: dashboard.data.resume.selfIntroduction || '暂无自我介绍',
        ...buildAccountInfo(dashboard.data.resume),
      });
    }
    const cached = recentCache(cachedResumePage(), CACHE_MAX_AGE_MS);
    if (cached) {
      this.setData({
        loading: false,
        hasLoaded: true,
        errorMessage: '',
        ...cached,
      });
    }
  },

  onShow() {
    if (!loginGuard.guardPage('/pages/resume/index', { viaTab: true })) {
      return;
    }
    if (!this.data.hasLoaded || refreshState.consume(PAGE_KEY) || refreshState.isExpired(PAGE_KEY, CACHE_MAX_AGE_MS)) {
      this.loadResume(true);
    }
  },

  async loadResume(forceRefresh) {
    if (!this.data.hasLoaded) {
      this.setData({ loading: true, errorMessage: '' });
    } else {
      this.setData({ errorMessage: '' });
    }
    try {
      const resume = await profileService.getResume({ forceRefresh });
      const nextState = {
        resume,
        credentials: arrayFrom(
          resume && (resume.certifiedQualifications || resume.credentials),
          ['items', 'credentials'],
        ).slice(0, 3),
        engagementGroups: splitEngagements(
          resume && (resume.relatedExperiences || resume.engagements),
        ),
        selfIntroductionText: resume.selfIntroduction || '暂无自我介绍',
        ...buildAccountInfo(resume),
      };
      this.setData({
        loading: false,
        hasLoaded: true,
        ...nextState,
      });
      saveCachedResumePage(nextState);
      refreshState.touch(PAGE_KEY);
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '资料加载失败',
      });
    }
  },

  openEditSelf() {
    wx.navigateTo({ url: '/pages/resume/edit_self/index' });
  },

  async openCredentials() {
    const ready = await tencentMeetingAccess.ensureReady({ targetUrl: '/pages/resume/credentials/index' });
    if (!ready) return;
    wx.navigateTo({ url: '/pages/resume/credentials/index' });
  },

  openEngagements(event) {
    const tab = event.currentTarget.dataset.tab || 'all';
    wx.navigateTo({ url: `/pages/resume/engagements/index?tab=${tab}` });
  },

  createEngagement() {
    wx.navigateTo({ url: '/pages/resume/engagement_create/index' });
  },

  openDistantPeople() {
    wx.navigateTo({ url: '/pages/distant_people/index' });
  },

  openOwnPublicResume() {
    const session = sessionStore.getSession() || {};
    const userId = session.userId || '';
    if (!userId) {
      wx.showToast({ title: '暂时无法读取账号', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/public_resume/index?id=${encodeURIComponent(userId)}` });
  },

  openWechatProfileEditor() {
    this.setData({
      showWechatProfileModal: true,
      profileDraftNickname: this.data.displayNameText === '用户昵称' ? '' : this.data.displayNameText || '',
      profileDraftAvatarUrl: this.data.avatarUrl || '',
    });
  },

  closeWechatProfileEditor() {
    if (this.data.savingWechatProfile) return;
    this.setData({ showWechatProfileModal: false });
  },

  noop() {},

  onProfileModalChooseAvatar(event) {
    const avatarUrl = event.detail && event.detail.avatarUrl;
    if (!avatarUrl) return;
    this.setData({ profileDraftAvatarUrl: avatarUrl });
  },

  onProfileModalNicknameInput(event) {
    this.setData({ profileDraftNickname: event.detail.value });
  },

  async confirmWechatProfile() {
    const nickname = String(this.data.profileDraftNickname || '').trim();
    const avatarUrl = String(this.data.profileDraftAvatarUrl || '').trim();
    if (!nickname || !avatarUrl) {
      wx.showToast({ title: '请填写昵称并选择头像', icon: 'none' });
      return;
    }
    if (this.data.savingWechatProfile) return;
    this.setData({ savingWechatProfile: true });
    try {
      let finalAvatarUrl = avatarUrl;
      if (!isOwnUploadedAvatarUrl(finalAvatarUrl)) {
        const uploaded = await profileService.uploadAvatar(finalAvatarUrl);
        finalAvatarUrl = uploaded.avatarUrl || uploaded.url || finalAvatarUrl;
      }
      const resume = await profileService.updateResume({
        displayName: nickname,
        avatarUrl: finalAvatarUrl,
      });
      const nextState = {
        resume,
        credentials: arrayFrom(
          resume && (resume.certifiedQualifications || resume.credentials),
          ['items', 'credentials'],
        ).slice(0, 3),
        engagementGroups: splitEngagements(
          resume && (resume.relatedExperiences || resume.engagements),
        ),
        selfIntroductionText: resume.selfIntroduction || '暂无自我介绍',
        ...buildAccountInfo(resume),
      };
      this.setData({
        ...nextState,
        showWechatProfileModal: false,
        savingWechatProfile: false,
      });
      saveCachedResumePage(nextState);
      apiClient.primeCache('resume_portfolio', resume);
      refreshState.mark(['home']);
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (error) {
      this.setData({ savingWechatProfile: false });
      wx.showToast({
        title: error && error.message ? error.message : '保存失败',
        icon: 'none',
      });
    }
  },
});
