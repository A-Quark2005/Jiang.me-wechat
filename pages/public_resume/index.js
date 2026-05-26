const profileService = require('../../services/profile');

function listFrom(raw, keys) {
  if (Array.isArray(raw)) return raw;
  const source = raw || {};
  for (let index = 0; index < keys.length; index += 1) {
    if (Array.isArray(source[keys[index]])) {
      return source[keys[index]];
    }
  }
  return [];
}

Page({
  data: {
    userId: '',
    loading: true,
    errorMessage: '',
    resume: null,
    avatarText: '人',
    selfIntroductionText: '暂无自我介绍',
    credentials: [],
    engagements: [],
  },

  onLoad(options) {
    const userId = decodeURIComponent(options.id || '');
    this.setData({ userId });
    this.loadResume(true);
  },

  async loadResume(forceRefresh) {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const resume = await profileService.getPublicResume(this.data.userId, { forceRefresh });
      const displayName = String(resume.displayName || '未命名用户').trim() || '未命名用户';
      this.setData({
        loading: false,
        resume: {
          ...resume,
          displayName,
        },
        avatarText: displayName.slice(0, 1),
        selfIntroductionText: resume.selfIntroduction || '暂无自我介绍',
        credentials: listFrom(resume.certifiedQualifications || resume.credentials, ['items', 'credentials']),
        engagements: listFrom(resume.relatedExperiences || resume.engagements, ['items', 'engagements']),
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '资料加载失败',
      });
    }
  },
});
