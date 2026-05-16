const profileService = require('../../../services/profile');

function normalizeList(raw) {
  if (Array.isArray(raw)) return raw;
  return (raw && (raw.items || raw.engagements)) || [];
}

function isPending(item) {
  return String(item.status || item.confirmationStatus || '').toLowerCase().includes('pending');
}

Page({
  data: {
    id: '',
    loading: true,
    submitting: false,
    errorMessage: '',
    item: null,
    pending: false,
    visible: true,
  },

  onLoad(options) {
    this.setData({ id: decodeURIComponent(options.id || '') });
    this.loadDetail();
  },

  async loadDetail() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const raw = await profileService.getEngagements();
      const item = normalizeList(raw).find((entry) => String(entry.id) === this.data.id);
      if (!item) {
        throw new Error('未找到该履历');
      }
      this.setData({
        loading: false,
        item,
        pending: isPending(item),
        visible: item.visible !== false,
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '履历详情加载失败',
      });
    }
  },

  async confirm() {
    await this.submitAction(() => profileService.confirmEngagement(this.data.id), '已确认');
  },

  async reject() {
    await this.submitAction(() => profileService.rejectEngagement(this.data.id), '已拒绝');
  },

  async toggleVisible(event) {
    const visible = event.detail.value;
    await this.submitAction(() => profileService.updateEngagementVisibility(this.data.id, visible), visible ? '已公开' : '已隐藏');
  },

  async submitAction(action, toastTitle) {
    this.setData({ submitting: true, errorMessage: '' });
    try {
      await action();
      wx.showToast({ title: toastTitle, icon: 'success' });
      this.setData({ submitting: false });
      await this.loadDetail();
    } catch (error) {
      this.setData({
        submitting: false,
        errorMessage: error && error.message ? error.message : '操作失败',
      });
    }
  },
});
