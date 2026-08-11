const apiClient = require('../../services/api-client');
const refreshState = require('../../services/refresh-state');

function decodeTargetUrl(value) {
  const target = decodeURIComponent(String(value || '').trim());
  if (!/^https:\/\/whkerdb\.top\/meeting(?:\/|\?|$)/.test(target)) {
    return '';
  }
  return target;
}

function markHomeMeetingsRefresh() {
  refreshState.mark('home');
  apiClient.invalidateCaches([
    'tencent_meeting_current_meetings',
    'mini_program_dashboard',
  ]);
}

Page({
  data: {
    url: '',
  },

  onLoad(options) {
    const url = decodeTargetUrl(options && options.url);
    if (!url) {
      wx.showToast({ title: '链接无效', icon: 'none' });
      return;
    }
    this.setData({ url });
  },

  handleWebMessage(event) {
    const messages = (event && event.detail && event.detail.data) || [];
    const list = Array.isArray(messages) ? messages : [messages];
    const hasScheduleSuccess = list.some((item) => item && item.type === 'tencent_meeting_schedule_success');
    if (hasScheduleSuccess) {
      markHomeMeetingsRefresh();
    }
  },

  onUnload() {
    markHomeMeetingsRefresh();
  },
});
