const profileService = require('../../../services/profile');
const refreshState = require('../../../services/refresh-state');
const dashboardCache = require('../../../services/dashboard-cache');
const loginGuard = require('../../../services/login-guard');

/**
 * Load and edit the current user's self introduction profile section.
 */
Page({
  data: {
    loading: true,
    saving: false,
    errorMessage: '',
    saveButtonDisabled: true,
    form: {
      selfIntroduction: '',
      visible: true,
    },
  },

  /**
   * Load resume data when the page initializes.
   *
   * @returns {Promise<void>} Promise resolved after the initial fetch.
   */
  onLoad() {
    if (!loginGuard.guardPage('/pages/resume/edit_self/index')) {
      return;
    }
    this.loadResume();
  },

  /**
   * Re-check login state whenever the page becomes visible.
   *
   * @returns {void}
   */
  onShow() {
    loginGuard.guardPage('/pages/resume/edit_self/index');
  },

  /**
   * Fetch the latest self introduction data from the profile service.
   *
   * @returns {Promise<void>} Promise resolved after state updates complete.
   */
  async loadResume() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const resume = await profileService.getResume();
      this.setData({
        loading: false,
        saveButtonDisabled: false,
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

  /**
   * Update a text field inside the edit form.
   *
   * @param {WechatMiniprogram.Input} event Input event.
   * @returns {void}
   */
  updateField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  /**
   * Update the public visibility switch value.
   *
   * @param {WechatMiniprogram.SwitchChange} event Switch change event.
   * @returns {void}
   */
  updateVisible(event) {
    this.setData({ 'form.visible': event.detail.value });
  },

  /**
   * Persist the edited self introduction and resume visibility settings.
   *
   * @returns {Promise<void>} Promise resolved after save completes.
   */
  async save() {
    const form = this.data.form;
    this.setData({ saving: true, errorMessage: '', saveButtonDisabled: true });
    try {
      const resume = await profileService.updateSelfIntroduction({
        selfIntroduction: form.selfIntroduction,
        visible: form.visible,
      });
      dashboardCache.patchResume(() => resume);
      wx.showToast({ title: '已保存', icon: 'success' });
      this.setData({ saving: false, saveButtonDisabled: false });
      refreshState.mark(['home', 'resume', 'credentials']);
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      this.setData({
        saving: false,
        saveButtonDisabled: false,
        errorMessage: error && error.message ? error.message : '保存失败',
      });
    }
  },

  /**
   * Return to the previous page, or fall back to the resume tab.
   *
   * @returns {void}
   */
  navigateBack() {
    wx.navigateBack({
      fail() {
        wx.switchTab({ url: '/pages/resume/index' });
      },
    });
  },
});
