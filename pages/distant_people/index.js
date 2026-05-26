const profileService = require('../../services/profile');
const loginGuard = require('../../services/login-guard');

function normalizeOrganizations(raw) {
  const items = Array.isArray(raw) ? raw : (raw && raw.items) || [];
  return items.map((item) => {
    const name = String(item.name || '').trim() || '认证组织';
    const domains = Array.isArray(item.emailDomains) ? item.emailDomains : [];
    return {
      ...item,
      name,
      initial: name.slice(0, 1),
      description: item.description || '查看已通过该组织认证的人',
      domainText: domains.length ? domains.map((domain) => `@${domain}`).join('、') : '',
    };
  });
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    organizations: [],
  },

  onLoad() {
    if (!loginGuard.guardPage('/pages/distant_people/index')) {
      return;
    }
    this.loadOrganizations(true);
  },

  async loadOrganizations(forceRefresh) {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const raw = await profileService.getCertificationOrganizations({ forceRefresh });
      this.setData({
        loading: false,
        organizations: normalizeOrganizations(raw),
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '组织加载失败',
      });
    }
  },

  openOrganization(event) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!id) return;
    wx.navigateTo({ url: `/pages/organization_members/index?id=${encodeURIComponent(id)}` });
  },
});
