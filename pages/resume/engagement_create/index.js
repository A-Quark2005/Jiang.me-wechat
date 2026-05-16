const profileService = require('../../../services/profile');
const refreshState = require('../../../services/refresh-state');

Page({
  data: {
    loading: false,
    saving: false,
    errorMessage: '',
    invite: null,
    createdEngagementId: '',
    form: {
      kind: 'provided_service',
      title: '',
      detailText: '',
    },
  },

  onShareAppMessage() {
    const invite = this.data.invite;
    if (invite && invite.token) {
      return {
        title: invite.title || '邀请你确认服务履历',
        path: invite.path,
      };
    }
    return {
      title: '邀请你确认服务履历',
      path: '/pages/resume/index',
    };
  },

  changeKind(event) {
    this.setData({
      'form.kind': event.detail.value === 'received' ? 'purchased_service' : 'provided_service',
    });
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  async save() {
    if (this.data.saving) return;
    const form = this.data.form;
    const detailLines = String(form.detailText || '')
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!form.title.trim()) {
      this.setData({ errorMessage: '请填写标题' });
      return;
    }
    this.setData({ saving: true, errorMessage: '' });
    try {
      const created = await profileService.createEngagement({
        kind: form.kind,
        title: form.title,
        detailLines,
      });
      const invite = created && created.invite ? created.invite : null;
      wx.showToast({ title: '已生成邀请', icon: 'success' });
      refreshState.mark(['resume', 'engagements', 'home']);
      this.setData({
        saving: false,
        invite,
        createdEngagementId: created && created.id ? created.id : '',
      });
    } catch (error) {
      this.setData({
        saving: false,
        errorMessage: error && error.message ? error.message : '履历创建失败',
      });
    }
  },

  openShare() {
    if (!this.data.invite) {
      wx.showToast({ title: '请先生成邀请', icon: 'none' });
    }
  },

  openDetail() {
    if (!this.data.createdEngagementId) return;
    wx.redirectTo({
      url: `/pages/resume/engagement_detail/index?id=${encodeURIComponent(this.data.createdEngagementId)}`,
    });
  },
});
