const service = require('../../services/meeting-entitlements');
const loginGuard = require('../../services/login-guard');

const PAGE_SIZE = 20;
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatMeetingCode(value) {
  const digits = String(value || '').replace(/\s+/g, '');
  return digits ? digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim() : '--';
}

function normalizeMeeting(item) {
  const start = toDate(item.startTime);
  const end = toDate(item.endTime);
  const dateKey = start
    ? `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`
    : 'unknown';
  const dateText = start
    ? `${start.getMonth() + 1}月${start.getDate()}日 ${WEEKDAYS[start.getDay()]}`
    : '日期未知';
  const timeText = start
    ? `${pad(start.getHours())}:${pad(start.getMinutes())}${end ? `-${pad(end.getHours())}:${pad(end.getMinutes())}` : ''}`
    : '--';
  return {
    ...item,
    id: String(item.meetingId || item.meetingCode || Math.random()),
    dateKey,
    dateText,
    yearText: start ? `${start.getFullYear()}年` : '',
    meetingCodeText: formatMeetingCode(item.meetingCode),
    subjectText: item.subject || '未命名会议',
    timeText,
  };
}

function groupMeetings(items) {
  const groups = [];
  const byKey = {};
  items.forEach((meeting) => {
    if (!byKey[meeting.dateKey]) {
      byKey[meeting.dateKey] = {
        dateKey: meeting.dateKey,
        dateText: meeting.dateText,
        yearText: meeting.yearText,
        items: [],
      };
      groups.push(byKey[meeting.dateKey]);
    }
    byKey[meeting.dateKey].items.push(meeting);
  });
  return groups;
}

Page({
  data: {
    loading: false,
    errorMessage: '',
    meetingCode: '',
    page: 1,
    hasMore: true,
    items: [],
    groups: [],
  },

  onLoad() {
    if (!loginGuard.guardPage('/pages/meeting_history/index', { requireRegistration: true })) {
      return;
    }
    this.loadFirstPage();
  },

  onPullDownRefresh() {
    this.loadFirstPage(true).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadNextPage();
    }
  },

  onMeetingCodeInput(event) {
    this.setData({ meetingCode: event.detail.value || '' });
  },

  search() {
    this.loadFirstPage(true);
  },

  reload() {
    this.loadFirstPage(true);
  },

  openMeetingDetail(event) {
    const meetingId = event.currentTarget.dataset.meetingId || '';
    if (!meetingId) {
      return;
    }
    const meeting = this.data.items.find((item) => item.meetingId === meetingId) || {};
    wx.setStorageSync('meeting_detail_seed', meeting);
    wx.navigateTo({
      url: `/pages/meeting_detail/index?meetingId=${encodeURIComponent(meetingId)}&meetingCode=${encodeURIComponent(meeting.meetingCode || '')}`,
    });
  },

  async loadFirstPage(forceRefresh) {
    this.setData({ page: 1, hasMore: true, items: [], groups: [] });
    await this.loadPage(1, Boolean(forceRefresh));
  },

  async loadNextPage() {
    await this.loadPage(this.data.page + 1, false);
  },

  async loadPage(page, forceRefresh) {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const result = await service.getTencentMeetingHistory({
        page,
        pageSize: PAGE_SIZE,
        meetingCode: this.data.meetingCode.trim(),
        forceRefresh,
      });
      const nextItems = (result.items || result.meetings || []).map(normalizeMeeting);
      const items = page === 1 ? nextItems : this.data.items.concat(nextItems);
      const totalPage = Number(result.totalPage || result.total_page || 0);
      const hasMore = totalPage ? page < totalPage : Boolean(result.hasMore);
      this.setData({
        loading: false,
        page,
        hasMore,
        items,
        groups: groupMeetings(items),
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '历史会议加载失败',
      });
    }
  },
});
