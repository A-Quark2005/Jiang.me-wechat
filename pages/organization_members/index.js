const profileService = require('../../services/profile');
const displayFormatters = require('../../services/display-formatters');
const loginGuard = require('../../services/login-guard');

const PAGE_SIZE = 50;

function normalizeMembers(raw) {
  const items = Array.isArray(raw) ? raw : (raw && raw.items) || [];
  return items.map((item) => {
    const name = String(item.displayName || '').trim() || '未命名用户';
    return {
      ...item,
      displayName: name,
      initial: name.slice(0, 1),
      verifiedText: item.verifiedAt
        ? `${displayFormatters.formatDateText(item.verifiedAt, { includeTime: false, fallback: item.verifiedAt })} 完成认证`
        : '已完成认证',
    };
  });
}

Page({
  data: {
    organizationId: '',
    organization: null,
    organizationInitial: '',
    members: [],
    loading: true,
    loadingMore: false,
    errorMessage: '',
    hasMore: false,
    offset: 0,
  },

  onLoad(options) {
    if (!loginGuard.guardPage('/pages/organization_members/index')) {
      return;
    }
    const organizationId = decodeURIComponent(options.id || '');
    this.setData({ organizationId });
    this.loadMembers(true);
  },

  reload() {
    this.loadMembers(true);
  },

  async loadMembers(reset) {
    const offset = reset ? 0 : this.data.offset;
    this.setData({
      loading: reset,
      loadingMore: !reset,
      errorMessage: '',
    });
    try {
      const data = await profileService.getCertificationOrganizationMembers(this.data.organizationId, {
        limit: PAGE_SIZE,
        offset,
        forceRefresh: true,
      });
      const organization = data && data.organization ? data.organization : null;
      const nextMembers = normalizeMembers(data);
      this.setData({
        loading: false,
        loadingMore: false,
        organization,
        organizationInitial: organization && organization.name ? String(organization.name).slice(0, 1) : '组',
        members: reset ? nextMembers : this.data.members.concat(nextMembers),
        offset: offset + nextMembers.length,
        hasMore: Boolean(data && data.paging && data.paging.hasMore),
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadingMore: false,
        errorMessage: error && error.message ? error.message : '成员加载失败',
      });
    }
  },

  loadMore() {
    if (!this.data.hasMore || this.data.loadingMore) {
      return;
    }
    this.loadMembers(false);
  },

  openPublicResume(event) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!id) return;
    wx.navigateTo({ url: `/pages/public_resume/index?id=${encodeURIComponent(id)}` });
  },
});
