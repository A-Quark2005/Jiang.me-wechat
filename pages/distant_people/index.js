const profileService = require('../../services/profile');
const loginGuard = require('../../services/login-guard');
const organizationGroups = require('../../services/organization-groups');

Page({
  data: {
    loading: true,
    errorMessage: '',
    activeGroup: organizationGroups.DEFAULT_GROUP_KEY,
    groups: organizationGroups.decorateGroups(),
    organizations: [],
    visibleOrganizations: [],
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
      const organizations = organizationGroups.normalizeOrganizations(raw);
      this.setData({
        loading: false,
        organizations,
        visibleOrganizations: organizationGroups.filterOrganizations(organizations, this.data.activeGroup),
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '组织加载失败',
      });
    }
  },

  switchGroup(event) {
    const group = String(event.currentTarget.dataset.group || organizationGroups.DEFAULT_GROUP_KEY);
    this.setData({
      activeGroup: group,
      groups: organizationGroups.decorateGroups(group),
      visibleOrganizations: organizationGroups.filterOrganizations(this.data.organizations, group),
    });
  },

  openOrganization(event) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!id) return;
    wx.navigateTo({ url: `/pages/organization_members/index?id=${encodeURIComponent(id)}` });
  },

  openDemandEntry() {
    wx.navigateTo({ url: '/pages/demands/index' });
  },

  openSearch() {
    wx.navigateTo({ url: '/pages/search/index' });
  },
});
