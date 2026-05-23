const service = require('../../services/meeting-entitlements');
const refreshState = require('../../services/refresh-state');
const sessionStore = require('../../services/session-store');
const displayFormatters = require('../../services/display-formatters');
const heroLayout = require('../../services/hero-layout');
const loginGuard = require('../../services/login-guard');
const tencentMeetingAccess = require('../../services/tencent-meeting-access');
const wechatProfile = require('../../services/wechat-profile');

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
 * @param start Meeting start time.
 * @param end Meeting end time.
 * @returns Integer duration in minutes with a minimum of 1 minute.
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

/**
 * Normalize list-shaped API payloads.
 *
 * @param {any} raw Raw API response.
 * @param {string[]} keys Candidate list field names.
 * @returns {Array<object>} Normalized list.
 */
function normalizeList(raw, keys) {
  if (Array.isArray(raw)) return raw;
  const source = raw || {};
  for (let index = 0; index < keys.length; index += 1) {
    if (Array.isArray(source[keys[index]])) {
      return source[keys[index]];
    }
  }
  return [];
}

/**
 * Normalize display name and phone fragments for the meeting create hero.
 *
 * @returns {{displayNameText: string, phoneText: string, avatarText: string}} User-facing profile labels.
 */
function buildProfileSummary() {
  const record = sessionStore.getSessionRecord() || {};
  const session = sessionStore.getSession() || {};
  const user = record.user || {};
  const profile = record.profile || {};
  const localWechatProfile = wechatProfile.getProfile() || {};
  const displayName =
    localWechatProfile.nickname ||
    profile.displayName ||
    user.displayName ||
    session.displayName ||
    user.nickname ||
    '用户昵称';
  const phone =
    user.phone ||
    user.phoneMasked ||
    user.mobile ||
    profile.phone ||
    profile.phoneMasked ||
    '未授权手机号';
  return {
    displayNameText: displayName,
    phoneText: phone,
    avatarText: String(displayName || '讲').trim().slice(0, 1) || '讲',
    avatarUrl: localWechatProfile.avatarUrl || profile.avatarUrl || user.avatarUrl || '',
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
    subject: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    startDateLabel: '',
    endDateLabel: '',
    submitting: false,
    errorMessage: '',
    submitButtonText: '立即预定',
    scheduleHintText: '',
    displayNameText: '用户昵称',
    phoneText: '未授权手机号',
    avatarText: '讲',
    avatarUrl: '',
    mascotUrl: '/assets/ui/jlm-figma-home.png',
    entitlementSummaryTitle: '当前会议权益',
    entitlementSummaryDetail: '未开通 · 可按需购买',
    entitlementActionText: '去开通',
    heroSafeTopPx: 0,
  },

  onLoad() {
    if (!loginGuard.guardPage('/pages/meeting_create/index', { requireRegistration: true })) {
      return;
    }
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
      ...nextData,
      ...buildLabels(nextData),
      ...buildProfileSummary(),
      ...heroLayout.buildHeroLayoutData(),
    });
    this.loadEntitlementSummary();
  },

  onSubjectInput(event) {
    this.setData({ subject: event.detail.value });
  },

  onShow() {
    loginGuard.guardPage('/pages/meeting_create/index', { requireRegistration: true });
  },

  onStartDateChange(event) {
    this.setData({
      startDate: event.detail.value,
      startDateLabel: formatDateLabel(event.detail.value),
    });
    this.ensureEndAfterStart();
  },

  onStartTimeChange(event) {
    this.setData({ startTime: event.detail.value });
    this.ensureEndAfterStart();
  },

  onEndDateChange(event) {
    this.setData({
      endDate: event.detail.value,
      endDateLabel: formatDateLabel(event.detail.value),
    });
  },

  onEndTimeChange(event) {
    this.setData({ endTime: event.detail.value });
  },

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
   * Load entitlement summary for the top card shown above the scheduler.
   *
   * @returns {Promise<void>} Promise resolved after summary state is updated.
   */
  async loadEntitlementSummary() {
    try {
      const entitlementsRaw = await service.getEntitlements();
      const entitlements = normalizeList(entitlementsRaw, ['items', 'entitlements']);
      const active = entitlements.find((item) => String(item.status || '').toLowerCase() === 'active') || entitlements[0];
      if (!active) {
        this.setData({
          entitlementSummaryTitle: '当前会议权益',
          entitlementSummaryDetail: '未开通 · 可按需购买',
          entitlementActionText: '去开通',
        });
        return;
      }
      this.setData({
        entitlementSummaryTitle: active.name || active.title || '当前会议权益',
        entitlementSummaryDetail:
          active.expiresAt
            ? `${active.durationHours ? `${active.durationHours}小时会员 · ` : ''}有效期至 ${displayFormatters.formatDateText(active.expiresAt, { fallback: active.expiresAt })}`
            : '已开通 · 可直接使用',
        entitlementActionText: '去查看',
      });
    } catch (error) {
      this.setData({
        entitlementSummaryTitle: '当前会议权益',
        entitlementSummaryDetail: '未开通 · 可按需购买',
        entitlementActionText: '去开通',
      });
    }
  },

  /**
   * Open the entitlement page from the top summary card.
   *
   * @returns {void}
   */
  openEntitlements() {
    wx.switchTab({ url: '/pages/meeting_entitlements/index' });
  },

  noop() {},

  async submit() {
    const fallbackDisplayName = String(this.data.displayNameText || '用户昵称').trim() || '用户昵称';
    const subject = this.data.subject.trim() || `${fallbackDisplayName} 预定的会议`;
    const start = toTimestamp(this.data.startDate, this.data.startTime);
    const end = toTimestamp(this.data.endDate, this.data.endTime);
    if (end.getTime() <= start.getTime()) {
      this.setData({ errorMessage: '结束时间需要晚于开始时间' });
      return;
    }

    this.setData({ submitting: true, errorMessage: '', submitButtonText: '正在预定' });
    try {
      const ready = await tencentMeetingAccess.ensureReady({ targetUrl: '/pages/meeting_create/index' });
      if (!ready) {
        this.setData({ submitting: false, submitButtonText: '立即预定' });
        return;
      }
      this.setData({ submitButtonText: '正在创建会议' });
      const meeting = await service.createTencentMeeting({
        subject,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        startTimeIso: start.toISOString(),
        endTimeIso: end.toISOString(),
        durationMinutes: durationMinutesBetween(start, end),
        timeZone: 'Asia/Shanghai',
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
        errorMessage: activationPending
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

});
