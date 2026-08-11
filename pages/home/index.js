const apiClient = require('../../services/api-client');
const sessionStore = require('../../services/session-store');
const entitlementsService = require('../../services/meeting-entitlements');
const refreshState = require('../../services/refresh-state');
const heroLayout = require('../../services/hero-layout');
const loginGuard = require('../../services/login-guard');
const displayFormatters = require('../../services/display-formatters');
const profileService = require('../../services/profile');

const PAGE_KEY = 'home';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const ACTIVATION_PAGE = '/pages/meeting_activation/index';
const MEETING_SCHEDULE_WEBVIEW_PAGE = '/pages/meeting_schedule_webview/index';
const TENCENT_MEETING_MINI_PROGRAM_APP_ID = 'wx33fd6cdc62520063';
const TENCENT_MEETING_JOIN_CHANNEL = 'Jiangleme';

function shareLandingTargetOf(input) {
  const rawValue = String(input || '').trim();
  if (!rawValue) return '';
  const value = decodeURIComponent(rawValue);
  if (!value.startsWith('/pages/')) return '';
  const route = value.split('?')[0];
  if (loginGuard.isTabPage(route)) return '';
  return value;
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
    title: '当前会议权益',
    detail: expiresAt
      ? `300人不限时会议 · ${expiresText}`
      : '300人不限时会议',
    detailLines: expiresText
      ? [`300人不限时会议 · ${expiresText}`]
      : ['300人不限时会议'],
    tone: 'ok',
    targetUrl: '/pages/meeting_entitlements/index',
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

function needsMeetingActivation(activation) {
  if (!activation || !activation.status) {
    return false;
  }
  return Boolean(
    activation.needsPhone ||
    activation.needsActivation ||
    activation.isPendingActivation ||
    !activation.isActive
  );
}

function padMeetingTimePart(value) {
  const numeric = Number(value || 0);
  return numeric < 10 ? `0${numeric}` : String(numeric);
}

function parseMeetingDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameMeetingDay(left, right) {
  return Boolean(
    left &&
    right &&
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatMeetingTimePart(date, options) {
  const settings = options || {};
  const timeText = `${padMeetingTimePart(date.getHours())}:${padMeetingTimePart(date.getMinutes())}`;
  if (settings.omitDate) {
    return timeText;
  }
  if (settings.omitRepeatedDate) {
    return timeText;
  }
  const dayText = `${padMeetingTimePart(date.getMonth() + 1)}月${padMeetingTimePart(date.getDate())}日`;
  const dateText = settings.omitYear ? dayText : `${date.getFullYear()}年${dayText}`;
  return `${dateText} ${timeText}`;
}

function formatMeetingTimeRange(startValue, endValue) {
  const startDate = parseMeetingDate(startValue);
  const endDate = parseMeetingDate(endValue);
  if (!startDate) {
    return displayFormatters.formatDateText(startValue, {
      includeTime: true,
      fallback: '暂无时间',
    });
  }
  const now = new Date();
  const omitDate = endDate
    ? isSameMeetingDay(startDate, now) && isSameMeetingDay(endDate, now)
    : isSameMeetingDay(startDate, now);
  const omitYear = endDate
    ? startDate.getFullYear() === now.getFullYear() && endDate.getFullYear() === now.getFullYear()
    : startDate.getFullYear() === now.getFullYear();
  const startText = formatMeetingTimePart(startDate, { omitDate, omitYear });
  if (!endDate) {
    return startText;
  }
  const endText = formatMeetingTimePart(endDate, {
    omitDate,
    omitYear,
    omitRepeatedDate: !omitDate && isSameMeetingDay(startDate, endDate),
  });
  return `${startText} - ${endText}`;
}

function formatMeetingInviteDateTime(date) {
  return [
    date.getFullYear(),
    padMeetingTimePart(date.getMonth() + 1),
    padMeetingTimePart(date.getDate()),
  ].join('/') + ` ${padMeetingTimePart(date.getHours())}:${padMeetingTimePart(date.getMinutes())}`;
}

function formatMeetingInviteTimeRange(startValue, endValue) {
  const startDate = parseMeetingDate(startValue);
  const endDate = parseMeetingDate(endValue);
  if (!startDate) {
    return '暂无时间';
  }
  const startText = formatMeetingInviteDateTime(startDate);
  if (!endDate) {
    return `${startText} (GMT+08:00) 中国标准时间 - 北京`;
  }
  const endText = isSameMeetingDay(startDate, endDate)
    ? `${padMeetingTimePart(endDate.getHours())}:${padMeetingTimePart(endDate.getMinutes())}`
    : formatMeetingInviteDateTime(endDate);
  return `${startText}-${endText} (GMT+08:00) 中国标准时间 - 北京`;
}

function formatHomeMeeting(item) {
  const source = item || {};
  const subjectText = source.subject || '腾讯会议';
  const creatorText = source.creator || source.hostName || source.host || '创建人';
  const meetingCodeText = source.meetingCode || '暂无会议号';
  const timeRangeText = formatMeetingTimeRange(source.startTime || source.startAt, source.endTime || source.endAt);
  const inviteTimeText = formatMeetingInviteTimeRange(source.startTime || source.startAt, source.endTime || source.endAt);
  const joinUrl = source.joinUrl || source.inviteUrl || '';
  return {
    id: source.id || source.meetingId || source.meetingCode || '',
    meetingId: source.meetingId || '',
    subjectText,
    creatorText,
    meetingCode: source.meetingCode || '',
    meetingCodeText,
    timeRangeText,
    inviteTimeText,
    password: source.password || '',
    joinUrl,
    inviteText: buildMeetingInviteText({
      subjectText,
      creatorText,
      meetingCodeText,
      inviteTimeText,
      password: source.password || '',
      joinUrl,
    }),
  };
}

function buildMeetingInviteText(meeting) {
  const inviter = meeting.creatorText && meeting.creatorText !== '创建人'
    ? meeting.creatorText
    : '讲了么';
  const lines = [
    `${inviter} 邀请您参加腾讯会议`,
    `会议主题：${meeting.subjectText}`,
    `会议时间：${meeting.inviteTimeText}`,
    '',
    '点击链接直接加入会议：',
    meeting.joinUrl,
    `#腾讯会议：${meeting.meetingCodeText}`,
    '复制该信息，打开手机腾讯会议即可参与',
  ];
  if (meeting.password) {
    lines.splice(3, 0, `会议密码：${meeting.password}`);
  }
  return lines.filter((line) => line !== undefined && line !== null).join('\n');
}

Page({
  data: {
    loading: true,
    errorMessage: '',
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
    mascotUrl: '/assets/ui/jlm-figma-home.png',
    displayNameText: '用户昵称',
    entitlementActionText: '去开通',
    heroSafeTopPx: 0,
    activation: null,
    currentMeetings: [],
    showPendingActivationNotice: false,
    pendingActivationText: '',
    savingWechatProfile: false,
    shareLandingTarget: '',
    shareLandingNavigated: false,
  },

  onLoad(options) {
    const shareLandingTarget = shareLandingTargetOf(options && options.target);
    this.setData({
      shareLandingTarget,
      ...heroLayout.buildHeroLayoutData(),
    });
    const cached = recentCache(cachedDashboard(), CACHE_MAX_AGE_MS);
    if (cached) {
      this.setData({
        loading: false,
        errorMessage: '',
        ...cached,
      });
    }
  },

  async onShow() {
    if (this.openShareLandingTarget()) {
      return;
    }
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
      return;
    }
    this.loadCurrentMeetings(false);
  },

  openShareLandingTarget() {
    if (!this.data.shareLandingTarget || this.data.shareLandingNavigated) {
      return false;
    }
    this.setData({ shareLandingNavigated: true });
    wx.navigateTo({
      url: this.data.shareLandingTarget,
    });
    return true;
  },

  enterGuestMode() {
    this.setData({
      loading: false,
      errorMessage: '',
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
      activation: null,
      currentMeetings: [],
      showPendingActivationNotice: false,
      pendingActivationText: '',
    });
  },

  async loadAuthenticatedDashboard() {
    if (!loginGuard.isLoggedIn()) {
      this.enterGuestMode();
      return;
    }
    if (!this.data.session) {
      this.setData({ loading: true, errorMessage: '' });
    } else {
      this.setData({ errorMessage: '' });
    }
    try {
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
        : (entitlementSummary.tone === 'ok' ? '去加购' : '去升级'),
      ...activationViewState,
    };
    this.setData({
      loading: false,
      ...nextViewState,
    });
    this.promptWechatProfileIfNeeded();
    saveCachedDashboard(nextViewState);
    warmSecondaryCaches();
    this.loadCurrentMeetings(Boolean(forceRefresh));
    refreshState.touch(PAGE_KEY);
  },

  async loadCurrentMeetings(forceRefresh) {
    if (needsMeetingActivation(this.data.activation)) {
      this.setData({ currentMeetings: [] });
      return;
    }
    try {
      const result = await entitlementsService.getTencentMeetingMeetings({
        forceRefresh: Boolean(forceRefresh),
      });
      const list = safeArray(result && (result.items || result.meetings || result))
        .slice(0, 3)
        .map(formatHomeMeeting);
      this.setData({ currentMeetings: list });
    } catch (error) {
      this.setData({ currentMeetings: [] });
    }
  },

  showMeetingInfoModal(event) {
    const dataset =
      (event.currentTarget && event.currentTarget.dataset) ||
      (event.target && event.target.dataset) ||
      {};
    const index = Number(dataset.index);
    const meetingId = String(dataset.meetingId || '');
    const meeting = this.data.currentMeetings[index] ||
      safeArray(this.data.currentMeetings).find((item) => String(item.id || '') === meetingId);
    if (!meeting) {
      wx.showToast({ title: '会议信息加载中', icon: 'none' });
      return;
    }
    wx.showModal({
      title: meeting.subjectText,
      content: `${meeting.meetingCodeText} · ${meeting.creatorText}\n${meeting.timeRangeText}`,
      cancelText: '直接入会',
      confirmText: '复制邀请',
      success: (result) => {
        if (result.confirm) {
          this.copyMeetingInvite(meeting);
          return;
        }
        if (result.cancel) {
          this.joinMeetingInMiniProgram(meeting);
        }
      },
      fail: () => {
        wx.showToast({ title: '弹窗打开失败', icon: 'none' });
      },
    });
  },

  joinMeetingInMiniProgram(meeting) {
    const source = meeting || {};
    const meetingCode = String(source.meetingCode || '').replace(/\D/g, '');
    if (!meetingCode) {
      wx.showToast({ title: '暂无会议号', icon: 'none' });
      return;
    }
    const nickname = this.data.displayNameText && this.data.displayNameText !== '用户昵称'
      ? this.data.displayNameText
      : '讲了么用户';
    const params = [
      `chn=${encodeURIComponent(TENCENT_MEETING_JOIN_CHANNEL)}`,
      `code=${encodeURIComponent(meetingCode)}`,
      `nm=${encodeURIComponent(nickname)}`,
    ];
    if (source.password) {
      params.push(`pwd=${encodeURIComponent(String(source.password))}`);
    }
    wx.navigateToMiniProgram({
      appId: TENCENT_MEETING_MINI_PROGRAM_APP_ID,
      path: `pages/index/index?${params.join('&')}`,
      envVersion: 'release',
    });
  },

  copyMeetingInvite(meeting) {
    const source = meeting || {};
    const text = source.inviteText || source.joinUrl || source.meetingCodeText || '';
    if (!text) {
      wx.showToast({ title: '暂无可复制内容', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: text,
      success() {
        wx.showToast({ title: '已复制', icon: 'success' });
      },
    });
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
      if (targetUrl === ACTIVATION_PAGE) {
        wx.navigateTo({ url: targetUrl });
        return;
      }
      wx.switchTab({ url: targetUrl });
    }, { viaTab: true, requireRegistration: true });
  },

  async showWechatWebScheduleGuide() {
    await this.startWechatWebScheduleGuide();
  },

  async startWechatWebScheduleGuide() {
    const loggedIn = await loginGuard.ensureLoggedInAsync({
      targetUrl: '/pages/home/index',
      navigateAfterLogin: false,
      requireRegistration: true,
    });
    if (!loggedIn) {
      return;
    }
    if (needsMeetingActivation(this.data.activation)) {
      wx.navigateTo({ url: ACTIVATION_PAGE });
      return;
    }
    await this.openWechatWebSchedulePage();
  },

  async openWechatWebSchedulePage() {
    wx.showLoading({ title: '正在打开', mask: true });
    try {
      const result = await entitlementsService.getTencentMeetingWebScheduleUrl();
      const h5Url = String((result && result.url) || '').trim();
      if (!/^https:\/\/whkerdb\.top\/meeting(?:\/|\?|$)/.test(h5Url)) {
        throw new Error('会议预定链接无效');
      }
      wx.navigateTo({
        url: `${MEETING_SCHEDULE_WEBVIEW_PAGE}?url=${encodeURIComponent(h5Url)}`,
      });
    } catch (error) {
      const code = error && (error.code || (error.response && error.response.error));
      if (code === 'phone_required') {
        wx.navigateTo({ url: ACTIVATION_PAGE });
        return;
      }
      wx.showToast({
        title: error && error.message ? error.message : '打开失败',
        icon: 'none',
      });
    } finally {
      wx.hideLoading();
    }
  },

  noop() {},

  refresh() {
    if (!loginGuard.isLoggedIn()) {
      loginGuard.redirectToLogin({ targetUrl: '/pages/home/index' });
      return;
    }
    refreshState.mark(PAGE_KEY);
    this.loadAuthenticatedDashboard();
  },
});
