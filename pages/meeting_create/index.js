const service = require('../../services/meeting-entitlements');
const refreshState = require('../../services/refresh-state');

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDateValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeValue(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toTimestamp(dateValue, timeValue) {
  const [year, month, day] = String(dateValue).split('-').map((item) => Number(item));
  const [hour, minute] = String(timeValue).split(':').map((item) => Number(item));
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function formatDateLabel(value) {
  const [year, month, day] = String(value).split('-');
  return `${year}年${month}月${day}日`;
}

function buildLabels(data) {
  return {
    startDateLabel: formatDateLabel(data.startDate),
    endDateLabel: formatDateLabel(data.endDate),
  };
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
      ...nextData,
      ...buildLabels(nextData),
    });
  },

  onSubjectInput(event) {
    this.setData({ subject: event.detail.value });
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

  async submit() {
    const subject = this.data.subject.trim();
    if (!subject) {
      this.setData({ errorMessage: '请输入会议主题' });
      return;
    }
    const start = toTimestamp(this.data.startDate, this.data.startTime);
    const end = toTimestamp(this.data.endDate, this.data.endTime);
    if (end.getTime() <= start.getTime()) {
      this.setData({ errorMessage: '结束时间需要晚于开始时间' });
      return;
    }

    this.setData({ submitting: true, errorMessage: '' });
    try {
      const activation = await service.getTencentMeetingActivation();
      if (!activation || activation.status !== 'active') {
        this.setData({ submitting: false });
        wx.navigateTo({ url: '/pages/meeting_activation/index' });
        return;
      }
      const meeting = await service.createTencentMeeting({
        subject,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });
      const meetingId = meeting.meetingId || meeting.id || meeting.roomId || '';
      const meetingLink = meeting.meetingLink || meeting.joinUrl || meeting.link || '';
      this.setData({ submitting: false });
      refreshState.mark(['home']);
      wx.showModal({
        title: '会议已预定',
        content: meetingId ? `会议号：${meetingId}` : '腾讯会议已预定。',
        confirmText: meetingLink ? '复制链接' : '知道了',
        cancelText: '关闭',
        showCancel: Boolean(meetingLink),
        success(result) {
          if (result.confirm && meetingLink) {
            wx.setClipboardData({ data: meetingLink });
          }
        },
      });
    } catch (error) {
      this.setData({
        submitting: false,
        errorMessage: error && error.message ? error.message : '预定会议失败',
      });
    }
  },
});
