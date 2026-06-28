const demands = require('../../services/demands');
const loginGuard = require('../../services/login-guard');
const phoneBinding = require('../../services/phone-binding');

Page({
  data: {
    id: '',
    demand: null,
    resume: null,
    message: '',
    loading: true,
    submitting: false,
    bindingPhone: false,
    needsPhone: false,
  },

  onLoad(options) {
    if (!loginGuard.guardPage('/pages/demands/apply', { requireRegistration: true })) return;
    const id = decodeURIComponent(options.id || '');
    this.setData({ id });
    this.loadPreview();
  },

  async loadPreview() {
    this.setData({ loading: true });
    try {
      const preview = await demands.previewApplication(this.data.id);
      const resume = decorateResume(preview.resume || {});
      this.setData({
        demand: preview.demand,
        resume,
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showModal({
        title: '读取失败',
        content: error && error.message ? error.message : '无法读取投递信息',
        showCancel: false,
        success: () => wx.navigateBack(),
      });
    }
  },

  onMessageInput(event) {
    this.setData({ message: event.detail.value });
  },

  async submit() {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      await demands.applyDemand(this.data.id, {
        message: this.data.message,
      });
      wx.showToast({ title: '已投递', icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/demands/detail?id=${encodeURIComponent(this.data.id)}` });
      }, 500);
    } catch (error) {
      if (phoneBinding.isPhoneRequiredError(error)) {
        this.setData({ needsPhone: true });
        wx.showToast({ title: '请先授权手机号', icon: 'none' });
        return;
      }
      wx.showModal({
        title: '投递失败',
        content: error && error.message ? error.message : '请稍后重试',
        showCancel: false,
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async handleGetPhoneNumber(event) {
    if (this.data.bindingPhone || this.data.submitting) return;
    this.setData({ bindingPhone: true });
    try {
      await phoneBinding.bindFromEvent(event);
      this.setData({
        bindingPhone: false,
        needsPhone: false,
      });
      wx.showToast({ title: '手机号已授权', icon: 'success' });
      await this.submit();
    } catch (error) {
      this.setData({ bindingPhone: false });
      wx.showToast({
        title: error && error.message ? error.message : '手机号授权失败',
        icon: 'none',
      });
    }
  },

});

function decorateResume(resume) {
  const credentials = Array.isArray(resume.credentials) ? resume.credentials : [];
  const engagements = Array.isArray(resume.engagements) ? resume.engagements : [];
  return {
    ...resume,
    credentials,
    engagements,
    avatarUrlResolved: resume.avatarUrl || '/assets/ui/avatar-home.svg',
    displayNameText: resume.displayName || '未命名用户',
    selfIntroductionText: resume.selfIntroduction || '暂无自我介绍',
    credentialCount: credentials.length,
    engagementCount: engagements.length,
  };
}
