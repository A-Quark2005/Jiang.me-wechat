const apiClient = require('../../services/api-client');
const sessionStore = require('../../services/session-store');
const entitlementsService = require('../../services/meeting-entitlements');
const refreshState = require('../../services/refresh-state');
const heroLayout = require('../../services/hero-layout');
const loginGuard = require('../../services/login-guard');
const displayFormatters = require('../../services/display-formatters');
const tencentMeetingAccess = require('../../services/tencent-meeting-access');
const profileService = require('../../services/profile');

const PAGE_KEY = 'home';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Left-pad numeric date and time fragments.
 *
 * @param {number|string} value Numeric value to pad.
 * @returns {string} Two-digit string.
 */
function pad(value) {
  return String(value).padStart(2, '0');
}

/**
 * Convert a Date instance into the picker date format.
 *
 * @param {Date} date Source date.
 * @returns {string} Date string in YYYY-MM-DD format.
 */
function toDateValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Convert a Date instance into the picker time format.
 *
 * @param {Date} date Source date.
 * @returns {string} Time string in HH:mm format.
 */
function toTimeValue(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Build a Date instance from picker date and time values.
 *
 * @param {string} dateValue Date string in YYYY-MM-DD format.
 * @param {string} timeValue Time string in HH:mm format.
 * @returns {Date} Combined local date.
 */
function toTimestamp(dateValue, timeValue) {
  const [year, month, day] = String(dateValue).split('-').map((item) => Number(item));
  const [hour, minute] = String(timeValue).split(':').map((item) => Number(item));
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

/**
 * Calculate the meeting duration in minutes from start and end time.
 *
 * @param {Date} start Meeting start time.
 * @param {Date} end Meeting end time.
 * @returns {number} Integer duration in minutes with a minimum of 1 minute.
 */
function durationMinutesBetween(start, end) {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
}

/**
 * Format picker date values into the Chinese date label used by the design.
 *
 * @param {string} value Date string in YYYY-MM-DD format.
 * @returns {string} Human-readable Chinese date label.
 */
function formatDateLabel(value) {
  const [year, month, day] = String(value).split('-');
  return `${year}年${month}月${day}日`;
}

/**
 * Build display labels from meeting form data.
 *
 * @param {object} data Meeting form data.
 * @returns {{startDateLabel: string, endDateLabel: string}} Date labels.
 */
function buildLabels(data) {
  return {
    startDateLabel: formatDateLabel(data.startDate),
    endDateLabel: formatDateLabel(data.endDate),
  };
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatPhone(user, profile) {
  const phone =
    (user && (user.phone || user.phoneMasked || user.mobile)) ||
    (profile && (profile.phone || profile.phoneMasked)) ||
    '';
  return displayFormatters.formatPhoneText(phone, { fallback: '未授权手机号' });
}

function mergeDisplayProfile(user, profile) {
  const displayName =
    profile.displayName ||
    user.displayName ||
    (sessionStore.getSession() && sessionStore.getSession().displayName) ||
    '';
  return {
    displayName,
    avatarUrl: profile.avatarUrl || user.avatarUrl || '',
  };
}

function isOwnUploadedAvatarUrl(value) {
  return String(value || '').startsWith(`${apiClient.backendBaseUrl()}/uploads/`);
}

function resolveEntitlementSummary(entitlements, rawActivation) {
  const activation = displayFormatters.normalizeMeetingActivationState(rawActivation);
  if (rawActivation && activation.status && !activation.isActive) {
    return {
      title: '账号未激活',
      detail: '激活后可使用完整会议功能',
      detailLines: ['激活后可使用完整会议功能'],
      tone: 'activation',
      targetUrl: '/pages/meeting_activation/index',
    };
  }
  const list = safeArray(entitlements && (entitlements.items || entitlements.entitlements || entitlements));
  const active = list.find((item) => String(item.status || '').toLowerCase() === 'active');
  if (!active) {
    return {
      title: '当前会议权益',
      detail: '2人不限时会议，3-100人40分钟会议',
      detailLines: ['2人不限时会议，3-100人40分钟会议'],
      tone: 'warn',
      targetUrl: '/pages/meeting_entitlements/index',
    };
  }
  const expiresAt = active.expiresAt || active.validUntil || '';
  const expiresText = expiresAt
    ? `有效期至 ${displayFormatters.formatDateText(expiresAt, { includeTime: true, fallback: expiresAt })}`
    : '';
  return {
    title: active.name || active.title || '高级账号',
    detail: expiresAt
      ? `500人不限时会议 · ${expiresText}`
      : '500人不限时会议',
    detailLines: expiresText
      ? [`500人不限时会议 · ${expiresText}`]
      : ['500人不限时会议'],
    tone: 'ok',
    targetUrl: '/pages/meeting_entitlements/index',
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

function cachedDashboard() {
  return wx.getStorageSync('jiangleme.page.home.dashboard') || null;
}

function saveCachedDashboard(payload) {
  wx.setStorageSync('jiangleme.page.home.dashboard', {
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

function primeDerivedCaches(dashboard) {
  if (!dashboard) return;
  apiClient.primeCache('mini_program_dashboard', dashboard);
  apiClient.primeCache('bootstrap', dashboard.bootstrap);
  apiClient.primeCache('meeting_entitlements', dashboard.entitlements);
  apiClient.primeCache('resume_portfolio', dashboard.resume);
  apiClient.primeCache('meeting_activation', dashboard.activation);
}

function warmSecondaryCaches() {
  setTimeout(() => {
    entitlementsService.getProducts().catch(() => {});
    entitlementsService.getOrders().catch(() => {});
  }, 120);
}

/**
 * Build a small pending-activation view model for the current page.
 *
 * @param {object} rawActivation Raw activation payload from backend.
 * @returns {{activation: object|null, showPendingActivationNotice: boolean, pendingActivationText: string}} Page state fragment.
 */
function buildPendingActivationState(rawActivation) {
  const activation = displayFormatters.normalizeMeetingActivationState(rawActivation);
  const showPendingActivationNotice = Boolean(activation && activation.isPendingActivation);
  return {
    activation,
    showPendingActivationNotice,
    pendingActivationText: showPendingActivationNotice ? '待激活' : '',
  };
}

/**
 * Convert raw date-like values into Date objects for invite rendering.
 *
 * @param {string|Date} value Raw date source.
 * @returns {Date|null} Parsed date or null.
 */
function toDisplayDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Return the fixed timezone label used by current meeting scheduling.
 *
 * @returns {string} Timezone label text.
 */
function buildTimezoneLabel() {
  return '(GMT+08:00) 中国标准时间 - 北京';
}

/**
 * Format a meeting time range for the Tencent Meeting invite copy.
 *
 * @param {string|Date} startValue Meeting start time.
 * @param {string|Date} endValue Meeting end time.
 * @returns {string} Time range text.
 */
function formatMeetingInviteTimeRange(startValue, endValue) {
  const startDate = toDisplayDate(startValue);
  const endDate = toDisplayDate(endValue);
  if (!startDate || !endDate) {
    return '';
  }
  const sameDay =
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getDate() === endDate.getDate();
  const startDateText = `${startDate.getFullYear()}/${pad(startDate.getMonth() + 1)}/${pad(startDate.getDate())}`;
  const startTimeText = `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`;
  const endDateText = `${endDate.getFullYear()}/${pad(endDate.getMonth() + 1)}/${pad(endDate.getDate())}`;
  const endTimeText = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
  if (sameDay) {
    return `${startDateText} ${startTimeText}-${endTimeText} ${buildTimezoneLabel()}`;
  }
  return `${startDateText} ${startTimeText} - ${endDateText} ${endTimeText} ${buildTimezoneLabel()}`;
}

/**
 * Build Tencent Meeting invite copy for clipboard sharing.
 *
 * @param {object} options Invite options.
 * @param {string} options.displayName Inviter display name.
 * @param {string} options.subject Meeting subject.
 * @param {string} options.meetingCode Meeting code.
 * @param {string} options.meetingLink Meeting join link.
 * @param {string|Date} options.startTime Meeting start time.
 * @param {string|Date} options.endTime Meeting end time.
 * @returns {string} Clipboard share content.
 */
function buildMeetingInviteCopy(options) {
  const displayName = String(options.displayName || '用户昵称').trim() || '用户昵称';
  const subject = String(options.subject || '腾讯会议').trim() || '腾讯会议';
  const meetingCode = String(options.meetingCode || '').trim();
  const meetingLink = String(options.meetingLink || '').trim();
  const timeText = formatMeetingInviteTimeRange(options.startTime, options.endTime);
  return [
    `${displayName} 邀请您参加腾讯会议`,
    `会议主题：${subject}`,
    timeText ? `会议时间：${timeText}` : '',
    '',
    '点击链接入会，或添加至会议列表：',
    meetingLink,
    '',
    meetingCode ? `#腾讯会议：${meetingCode}` : '',
    '',
    '复制该信息，打开腾讯会议即可参与',
  ].join('\n');
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    submitErrorMessage: '',
    session: null,
    user: null,
    profile: null,
    phoneText: '',
    avatarText: '讲',
    avatarUrl: '',
    needsWechatProfile: true,
    showWechatProfileModal: false,
    profileDraftNickname: '',
    profileDraftAvatarUrl: '',
    entitlementSummary: null,
    resumeSummary: null,
    backendBaseUrl: '',
    mascotUrl: '/assets/ui/jlm-figma-home.png',
    displayNameText: '用户昵称',
    entitlementActionText: '去开通',
    heroSafeTopPx: 0,
    guestMode: true,
    activation: null,
    showPendingActivationNotice: false,
    pendingActivationText: '',
    sendingActivationInvite: false,
    subject: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    startDateLabel: '',
    endDateLabel: '',
    submitting: false,
    submitButtonText: '立即预定',
    savingWechatProfile: false,
  },

  onLoad() {
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 10) * 10, 0, 0);
    const end = new Date(now.getTime() + 30 * 60 * 1000);
    const nextData = {
      startDate: toDateValue(now),
      startTime: toTimeValue(now),
      endDate: toDateValue(end),
      endTime: toTimeValue(end),
    };
    this.setData({
      backendBaseUrl: apiClient.backendBaseUrl(),
      ...nextData,
      ...buildLabels(nextData),
      ...heroLayout.buildHeroLayoutData(),
    });
    const cached = recentCache(cachedDashboard(), CACHE_MAX_AGE_MS);
    if (cached) {
      this.setData({
        loading: false,
        errorMessage: '',
        submitErrorMessage: '',
        ...cached,
      });
    }
  },

  async onShow() {
    const loggedIn = await loginGuard.ensureLoggedInAsync({
      targetUrl: '/pages/home/index',
      navigateAfterLogin: false,
      showError: false,
    });
    if (!loggedIn) {
      this.enterGuestMode();
      return;
    }
    if (!this.data.session || refreshState.consume(PAGE_KEY) || refreshState.isExpired(PAGE_KEY, CACHE_MAX_AGE_MS)) {
      this.loadAuthenticatedDashboard();
    }
  },

  enterGuestMode() {
    this.setData({
      loading: false,
      errorMessage: '',
      submitErrorMessage: '',
      session: null,
      user: null,
      profile: null,
      phoneText: '点击登录后授权手机号',
      avatarText: '讲',
      avatarUrl: '',
      displayNameText: '用户昵称',
      needsWechatProfile: true,
      entitlementSummary: {
        title: '当前会议权益',
        detail: '暂时无法读取账号 · 请稍后刷新',
        tone: 'warn',
      },
      entitlementActionText: '刷新',
      resumeSummary: null,
      guestMode: true,
      activation: null,
      showPendingActivationNotice: false,
      pendingActivationText: '',
      sendingActivationInvite: false,
    });
  },

  async loadAuthenticatedDashboard() {
    if (!loginGuard.isLoggedIn()) {
      this.enterGuestMode();
      return;
    }
    if (!this.data.session) {
      this.setData({ loading: true, errorMessage: '', submitErrorMessage: '' });
    } else {
      this.setData({ errorMessage: '', submitErrorMessage: '' });
    }
    try {
      const app = getApp();
      const pendingReferralCode =
        (app && app.globalData && app.globalData.pendingReferralCode) ||
        wx.getStorageSync('jiangleme.pending-referral-code') ||
        '';
      if (pendingReferralCode) {
        try {
          await entitlementsService.acceptReferral(pendingReferralCode);
          if (app && app.globalData) {
            app.globalData.pendingReferralCode = '';
          }
          wx.removeStorageSync('jiangleme.pending-referral-code');
          refreshState.mark(['entitlements']);
        } catch {
          // Do not block the home page when the referral has already been claimed or expired.
        }
      }
      const pendingInviteToken =
        app && app.globalData ? app.globalData.pendingEngagementInviteToken : '';
      if (pendingInviteToken) {
        wx.redirectTo({
          url: `/pages/resume/engagement_detail/index?inviteToken=${encodeURIComponent(pendingInviteToken)}`,
        });
        return;
      }
      const sessionRecord = sessionStore.getSessionRecord();
      await this.loadDashboard(sessionRecord, true);
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '服务中心加载失败',
      });
    }
  },

  async loadDashboard(sessionRecord, forceRefresh) {
    const dashboard = await apiClient.request({
      path: '/api/mini-program/dashboard',
      cacheKey: 'mini_program_dashboard',
      maxAgeMs: 60 * 1000,
      forceRefresh: Boolean(forceRefresh),
    });
    const bootstrap = dashboard && dashboard.bootstrap;
    const entitlements = dashboard && dashboard.entitlements;
    const resume = dashboard && dashboard.resume;
    const activationViewState = buildPendingActivationState(
      dashboard && dashboard.activation,
    );
    primeDerivedCaches(dashboard);
    const user = (bootstrap && bootstrap.me) || (sessionRecord && sessionRecord.user) || {};
    const profile = (bootstrap && bootstrap.profile) || (sessionRecord && sessionRecord.profile) || {};
    const displayProfile = mergeDisplayProfile(user, profile);
    const displayName = displayProfile.displayName;
    const entitlementSummary = resolveEntitlementSummary(entitlements, dashboard && dashboard.activation);
    const nextViewState = {
      session: sessionStore.getSession(),
      user,
      profile,
      phoneText: formatPhone(user, profile),
      avatarText: String(displayName || '讲').trim().slice(0, 1) || '讲',
      avatarUrl: displayProfile.avatarUrl,
      needsWechatProfile: !displayName || !displayProfile.avatarUrl,
      displayNameText: displayName || '用户昵称',
      entitlementSummary,
      entitlementActionText: entitlementSummary.tone === 'activation'
        ? '去激活'
        : (entitlementSummary.tone === 'ok' ? '去查看' : '去升级'),
      guestMode: false,
      ...activationViewState,
      resumeSummary: resolveResumeSummary(
        resume,
        resume && (resume.certifiedQualifications || resume.credentials),
        resume && (resume.relatedExperiences || resume.engagements),
      ),
    };
    this.setData({
      loading: false,
      ...nextViewState,
    });
    this.promptWechatProfileIfNeeded();
    saveCachedDashboard(nextViewState);
    warmSecondaryCaches();
    refreshState.touch(PAGE_KEY);
  },

  openResume() {
    loginGuard.guardAction('/pages/resume/index', () => {
      wx.switchTab({ url: '/pages/resume/index' });
    }, { viaTab: true });
  },

  promptWechatProfileIfNeeded() {
    if (!this.data.needsWechatProfile) {
      return;
    }
    this.setData({
      showWechatProfileModal: true,
      profileDraftNickname: this.data.displayNameText === '用户昵称' ? '' : this.data.displayNameText,
      profileDraftAvatarUrl: this.data.avatarUrl || '',
    });
  },

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
      await profileService.updateResume({
        displayName: nickname,
        avatarUrl: finalAvatarUrl,
      });
      this.setData({
        displayNameText: nickname,
        avatarUrl: finalAvatarUrl,
        avatarText: String(nickname || '讲').trim().slice(0, 1) || '讲',
        needsWechatProfile: false,
        showWechatProfileModal: false,
        savingWechatProfile: false,
      });
      refreshState.mark(['home', 'resume']);
      this.loadAuthenticatedDashboard();
    } catch (error) {
      wx.showToast({ title: error && error.message ? error.message : '保存失败', icon: 'none' });
      this.setData({ savingWechatProfile: false });
    }
  },

  openEntitlements() {
    const summary = this.data.entitlementSummary || {};
    const targetUrl = summary.targetUrl || '/pages/meeting_entitlements/index';
    loginGuard.guardAction(targetUrl, () => {
      if (targetUrl === '/pages/meeting_activation/index') {
        wx.navigateTo({ url: targetUrl });
        return;
      }
      wx.switchTab({ url: targetUrl });
    }, { viaTab: true, requireRegistration: true });
  },

  createMeeting() {
    this.submit();
  },

  /**
   * Update the meeting subject input on the home page.
   *
   * @param {WechatMiniprogram.CustomEvent} event Input event.
   * @returns {void}
   */
  onSubjectInput(event) {
    this.setData({ subject: event.detail.value });
  },

  /**
   * Handle meeting start-date changes.
   *
   * @param {WechatMiniprogram.CustomEvent} event Picker event.
   * @returns {void}
   */
  onStartDateChange(event) {
    this.setData({
      startDate: event.detail.value,
      startDateLabel: formatDateLabel(event.detail.value),
    });
    this.ensureEndAfterStart();
  },

  /**
   * Handle meeting start-time changes.
   *
   * @param {WechatMiniprogram.CustomEvent} event Picker event.
   * @returns {void}
   */
  onStartTimeChange(event) {
    this.setData({ startTime: event.detail.value });
    this.ensureEndAfterStart();
  },

  /**
   * Handle meeting end-date changes.
   *
   * @param {WechatMiniprogram.CustomEvent} event Picker event.
   * @returns {void}
   */
  onEndDateChange(event) {
    this.setData({
      endDate: event.detail.value,
      endDateLabel: formatDateLabel(event.detail.value),
    });
  },

  /**
   * Handle meeting end-time changes.
   *
   * @param {WechatMiniprogram.CustomEvent} event Picker event.
   * @returns {void}
   */
  onEndTimeChange(event) {
    this.setData({ endTime: event.detail.value });
  },

  /**
   * Keep the end time at least 30 minutes after the current start time.
   *
   * @returns {void}
   */
  ensureEndAfterStart() {
    const start = toTimestamp(this.data.startDate, this.data.startTime);
    const end = toTimestamp(this.data.endDate, this.data.endTime);
    if (end.getTime() > start.getTime()) {
      return;
    }
    const nextEnd = new Date(start.getTime() + 30 * 60 * 1000);
    this.setData({
      endDate: toDateValue(nextEnd),
      endTime: toTimeValue(nextEnd),
      endDateLabel: formatDateLabel(toDateValue(nextEnd)),
    });
  },

  /**
   * Submit a Tencent Meeting reservation directly from the home page.
   *
   * @returns {Promise<void>} Resolves after the booking flow completes.
   */
  async submit() {
    const fallbackDisplayName = String(this.data.displayNameText || '用户昵称').trim() || '用户昵称';
    const subject = this.data.subject.trim() || `${fallbackDisplayName} 预定的会议`;
    const start = toTimestamp(this.data.startDate, this.data.startTime);
    const end = toTimestamp(this.data.endDate, this.data.endTime);
    if (end.getTime() <= start.getTime()) {
      this.setData({ submitErrorMessage: '结束时间需要晚于开始时间' });
      return;
    }

    this.setData({ submitting: true, submitErrorMessage: '', submitButtonText: '正在预定' });
    try {
      const ready = await tencentMeetingAccess.ensureReady({ targetUrl: '/pages/home/index' });
      if (!ready) {
        this.setData({ submitting: false, submitButtonText: '立即预定' });
        return;
      }
      this.setData({ submitButtonText: '正在创建会议' });
      const meeting = await entitlementsService.createTencentMeeting({
        subject,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        durationMinutes: durationMinutesBetween(start, end),
      });
      const meetingCode = meeting.meetingCode || meeting.roomId || meeting.meetingId || meeting.id || '';
      const meetingLink = meeting.meetingLink || meeting.joinUrl || meeting.link || '';
      const modalSubject = meeting.subject || subject;
      const modalTimeText = formatMeetingInviteTimeRange(
        meeting.startTime || start.toISOString(),
        meeting.endTime || end.toISOString(),
      );
      const inviteCopy = buildMeetingInviteCopy({
        displayName: this.data.displayNameText,
        subject: modalSubject,
        meetingCode,
        meetingLink,
        startTime: meeting.startTime || start.toISOString(),
        endTime: meeting.endTime || end.toISOString(),
      });
      this.setData({ submitting: false, submitButtonText: '立即预定' });
      refreshState.mark(['home', 'entitlements', 'orders']);
      wx.showModal({
        title: '会议已预定',
        content: [
          `主题：${modalSubject}`,
          meetingCode ? `会议号：${meetingCode}` : '',
          modalTimeText ? `日期时间时区：${modalTimeText}` : '',
        ].filter(Boolean).join('\n'),
        confirmText: inviteCopy ? '复制邀约' : '知道了',
        cancelText: '关闭',
        showCancel: Boolean(inviteCopy),
        success(result) {
          if (result.confirm && inviteCopy) {
            wx.setClipboardData({ data: inviteCopy });
          }
        },
      });
    } catch (error) {
      const rawMessage = error && error.message ? error.message : '预定会议失败';
      const activationPending =
        rawMessage.includes('待激活') ||
        rawMessage.includes('未激活') ||
        rawMessage.includes('激活');
      this.setData({
        submitting: false,
        submitButtonText: '立即预定',
        submitErrorMessage: activationPending
          ? '腾讯会议账号待激活，请查看短信或激活链接后再预定会议。'
          : rawMessage,
      });
      if (activationPending) {
        wx.showModal({
          title: '请先完成激活',
          content: '腾讯会议账号待激活，请查看短信或激活链接完成启用后，再继续预定会议。',
          confirmText: '知道了',
          showCancel: false,
        });
      }
    }
  },

  noop() {},

  /**
   * Re-send Tencent Meeting activation invite for pending enterprise accounts.
   *
   * @returns {Promise<void>} Resolves after the invite flow finishes.
   */
  async resendActivationInvite() {
    if (this.data.sendingActivationInvite) {
      return;
    }
    this.setData({ sendingActivationInvite: true });
    try {
      const result = await entitlementsService.sendTencentMeetingActivationInvite();
      wx.showToast({
        title: result && result.inviteMessage ? result.inviteMessage : '激活链接已重发',
        icon: 'none',
      });
      refreshState.mark(['home', 'entitlements', 'resume']);
      await this.loadAuthenticatedDashboard();
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

  openEngagements() {
    loginGuard.guardAction('/pages/resume/engagements/index?tab=pending', () => {
      wx.navigateTo({ url: '/pages/resume/engagements/index?tab=pending' });
    });
  },

  openOrders() {
    loginGuard.guardAction('/pages/orders/index', () => {
      wx.navigateTo({ url: '/pages/orders/index' });
    }, { requireRegistration: true });
  },

  refresh() {
    if (!loginGuard.isLoggedIn()) {
      loginGuard.redirectToLogin({ targetUrl: '/pages/home/index' });
      return;
    }
    refreshState.mark(PAGE_KEY);
    this.loadAuthenticatedDashboard();
  },
});
