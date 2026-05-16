const profileService = require('../../../services/profile');
const refreshState = require('../../../services/refresh-state');

Page({
  data: {
    loading: true,
    saving: false,
    errorMessage: '',
    form: {
      selfIntroduction: '',
      visible: true,
    },
  },

  onLoad() {
    this.loadResume();
  },

  async loadResume() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const resume = await profileService.getResume();
      this.setData({
        loading: false,
        form: {
          selfIntroduction: resume.selfIntroduction || '',
          visible: resume.visible !== false,
        },
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '读取失败',
      });
    }
  },

  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  updateVisible(event) {
    this.setData({ 'form.visible': event.detail.value });
  },

  async save() {
    const form = this.data.form;
    this.setData({ saving: true, errorMessage: '' });
    try {
      await profileService.updateSelfIntroduction({
        selfIntroduction: form.selfIntroduction,
        visible: form.visible,
      });
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ saving: false });
      refreshState.mark(['home', 'resume', 'credentials']);
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      this.setData({
        saving: false,
        errorMessage: error && error.message ? error.message : '保存失败',
      });
    }
  },
});
