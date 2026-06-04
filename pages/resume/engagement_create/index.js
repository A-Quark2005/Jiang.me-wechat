const profileService = require('../../../services/profile');
const refreshState = require('../../../services/refresh-state');
const dashboardCache = require('../../../services/dashboard-cache');
const loginGuard = require('../../../services/login-guard');
const share = require('../../../services/share');

Page({
  data: {
    loading: false,
    saving: false,
    errorMessage: '',
    invite: null,
    createdEngagementId: '',
    kindProvidedClass: 'segment-chip-active',
    kindReceivedClass: '',
    kindProvidedChecked: true,
    kindReceivedChecked: false,
    saveButtonDisabled: false,
    helperTitleText: '填写服务事实并邀请对方确认',
    helperBodyText: '确认后的履历会进入双方资料，可作为正式服务记录展示。',
    inviteReadyText: '微信邀请已生成，发送给对方后即可确认这条履历。',
    submitLabelText: '生成微信邀请',
    form: {
      kind: 'provided_service',
      title: '',
      detailText: '',
    },
  },

  onShareAppMessage() {
    const invite = this.data.invite;
    if (invite && invite.token) {
      return share.defaultShareAppMessage({
        title: invite.title || '邀请你确认服务履历',
        path: invite.path,
      });
    }
    return share.defaultShareAppMessage({
      title: '邀请你确认服务履历',
      path: '/pages/resume/index',
    });
  },

  onShareTimeline() {
    const invite = this.data.invite;
    if (invite && invite.token) {
      const path = String(invite.path || '').replace(/^\//, '');
      return share.defaultShareTimeline({
        title: invite.title || '邀请你确认服务履历',
        query: path.includes('?') ? path.split('?').slice(1).join('?') : '',
      });
    }
    return share.defaultShareTimeline({
      title: '创建讲了么服务履历',
      query: '',
    });
  },

  onLoad() {
    loginGuard.guardPage('/pages/resume/engagement_create/index', { requireRegistration: true });
  },

  /**
   * Guard the page again after foreground restores.
   *
   * @returns {void}
   */
  onShow() {
    loginGuard.guardPage('/pages/resume/engagement_create/index', { requireRegistration: true });
  },

  /**
   * Return to the previous resume-related page.
   *
   * @returns {void}
   */
  goBack() {
    wx.navigateBack({
      fail() {
        wx.redirectTo({ url: '/pages/resume/engagements/index?tab=provided' });
      },
    });
  },

  changeKind(event) {
    const kind = event.detail.value === 'received' ? 'purchased_service' : 'provided_service';
    this.setData({
      'form.kind': kind,
      kindProvidedClass: kind === 'provided_service' ? 'segment-chip-active' : '',
      kindReceivedClass: kind === 'purchased_service' ? 'segment-chip-active' : '',
      kindProvidedChecked: kind === 'provided_service',
      kindReceivedChecked: kind === 'purchased_service',
      helperTitleText: kind === 'provided_service' ? '填写你提供过的服务事实' : '填写你接受过的服务事实',
      helperBodyText:
        kind === 'provided_service'
          ? '邀请对方确认后，这条服务记录会展示在双方资料中。'
          : '邀请服务方确认后，这条被服务记录会展示在双方资料中。',
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
      dashboardCache.invalidateDashboardRelated();
      const invite = created && created.invite ? created.invite : null;
      wx.showToast({ title: '已生成邀请', icon: 'success' });
      refreshState.mark(['resume', 'engagements', 'home']);
      this.setData({
        saving: false,
        invite,
        createdEngagementId: created && created.id ? created.id : '',
        saveButtonDisabled: true,
        submitLabelText: '邀请已生成',
      });
    } catch (error) {
      this.setData({
        saving: false,
        saveButtonDisabled: false,
        submitLabelText: '生成微信邀请',
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
