const profileService = require('../../../services/profile');

Page({
  data: {
    loading: true,
    saving: false,
    errorMessage: '',
    form: {
      displayName: '',
      avatar: '',
      bio: '',
      tagsText: '',
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
          displayName: resume.displayName || '',
          avatar: resume.avatar || '',
          bio: resume.bio || resume.summary || '',
          tagsText: Array.isArray(resume.tags) ? resume.tags.join('，') : '',
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
        displayName: form.displayName,
        avatar: form.avatar,
        bio: form.bio,
        tags: String(form.tagsText || '')
          .split(/[，,]/)
          .map((item) => item.trim())
          .filter(Boolean),
        selfIntroduction: form.selfIntroduction,
        visible: form.visible,
      });
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ saving: false });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      this.setData({
        saving: false,
        errorMessage: error && error.message ? error.message : '保存失败',
      });
    }
  },
});
