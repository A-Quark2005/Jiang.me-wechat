const profileService = require('../../services/profile');
const refreshState = require('../../services/refresh-state');
const apiClient = require('../../services/api-client');
const loginGuard = require('../../services/login-guard');
const meetingEntitlementsService = require('../../services/meeting-entitlements');
const displayFormatters = require('../../services/display-formatters');

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

function profileDisplayUrl(resume) {
  const candidates = [
    resume && resume.publicProfileUrl,
    resume && resume.profileUrl,
    resume && resume.shareUrl,
    resume && resume.externalProfileUrl,
  ];
  return candidates.find((item) => typeof item === 'string' && item.trim()) || '';
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

/**
 * Build the pending-activation notice block state for the resume page.
 *
 * @param {object} rawActivation Raw activation payload from backend.
 * @returns {{activation: object, showPendingActivationNotice: boolean, pendingActivationText: string}} Page state fragment.
 */
function buildPendingActivationState(rawActivation) {
  const activation = displayFormatters.normalizeMeetingActivationState(rawActivation);
  const showPendingActivationNotice = Boolean(activation && activation.isPendingActivation);
  return {
    activation,
    showPendingActivationNotice,
    pendingActivationText: showPendingActivationNotice
      ? '腾讯会议企业号待激活，请先查看短信或激活链接。'
      : '',
  };
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
    publicProfileUrl: '',
    selfIntroductionText: '暂无自我介绍',
    activation: null,
    showPendingActivationNotice: false,
    pendingActivationText: '',
    sendingActivationInvite: false,
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
        publicProfileUrl: profileDisplayUrl(dashboard.data.resume),
        selfIntroductionText: dashboard.data.resume.selfIntroduction || '暂无自我介绍',
        ...buildPendingActivationState(dashboard.data.activation),
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
      const [resume, rawActivation] = await Promise.all([
        profileService.getResume({ forceRefresh }),
        meetingEntitlementsService.getTencentMeetingActivation({ forceRefresh }),
      ]);
      const nextState = {
        resume,
        credentials: arrayFrom(
          resume && (resume.certifiedQualifications || resume.credentials),
          ['items', 'credentials'],
        ).slice(0, 3),
        engagementGroups: splitEngagements(
          resume && (resume.relatedExperiences || resume.engagements),
        ),
        publicProfileUrl: profileDisplayUrl(resume),
        selfIntroductionText: resume.selfIntroduction || '暂无自我介绍',
        ...buildPendingActivationState(rawActivation),
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

  openCredentials() {
    wx.navigateTo({ url: '/pages/resume/credentials/index' });
  },

  openEngagements(event) {
    const tab = event.currentTarget.dataset.tab || 'all';
    wx.navigateTo({ url: `/pages/resume/engagements/index?tab=${tab}` });
  },

  createEngagement() {
    wx.navigateTo({ url: '/pages/resume/engagement_create/index' });
  },

  openPublicProfile() {
    const url = this.data.publicProfileUrl;
    if (!url) {
      wx.showToast({ title: '暂无对外主页', icon: 'none' });
      return;
    }
    wx.setClipboardData({ data: url });
  },

  /**
   * Re-send Tencent Meeting activation invite from the resume page.
   *
   * @returns {Promise<void>} Resolves after the invite request completes.
   */
  async resendActivationInvite() {
    if (this.data.sendingActivationInvite) {
      return;
    }
    this.setData({ sendingActivationInvite: true, errorMessage: '' });
    try {
      const result = await meetingEntitlementsService.sendTencentMeetingActivationInvite();
      wx.showToast({
        title: result && result.inviteMessage ? result.inviteMessage : '激活链接已重发',
        icon: 'none',
      });
      refreshState.mark(['home', 'entitlements', 'resume']);
      await this.loadResume(true);
    } catch (error) {
      wx.showModal({
        title: '发送失败',
        content: error && error.message ? error.message : '激活链接发送失败',
        showCancel: false,
      });
    } finally {
      this.setData({ sendingActivationInvite: false });
    }
  },
});
