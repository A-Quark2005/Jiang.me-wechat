const profileService = require('../../services/profile');
const loginGuard = require('../../services/login-guard');

const FILTERS = [
  { key: 'tutoring', label: '线上家教' },
  { key: 'career', label: '大厂求职' },
];
const DEFAULT_FILTER = FILTERS[0].key;

function normalizeOrganizations(raw) {
  const items = Array.isArray(raw) ? raw : (raw && raw.items) || [];
  return items.map((item) => {
    const name = String(item.name || '').trim() || '认证组织';
    const domains = Array.isArray(item.emailDomains) ? item.emailDomains : [];
    const typeLabel = String(item.typeLabel || item.type_label || '').trim();
    return {
      ...item,
      name,
      typeLabel,
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
    activeFilter: DEFAULT_FILTER,
    filters: decorateFilters(DEFAULT_FILTER),
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
      const organizations = normalizeOrganizations(raw);
      this.setData({
        loading: false,
        organizations,
        visibleOrganizations: filterOrganizations(organizations, this.data.activeFilter),
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '组织加载失败',
      });
    }
  },

  switchFilter(event) {
    const filter = String(event.currentTarget.dataset.filter || DEFAULT_FILTER);
    this.setData({
      activeFilter: filter,
      filters: decorateFilters(filter),
      visibleOrganizations: filterOrganizations(this.data.organizations, filter),
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
});

function decorateFilters(activeFilter) {
  return FILTERS.map((item) => ({
    ...item,
    className: item.key === activeFilter ? 'segment-chip-active' : '',
  }));
}

function filterOrganizations(items, filter) {
  if (filter === 'tutoring') {
    return items.filter((item) => item.typeLabel === '大学');
  }
  if (filter === 'career') {
    return items.filter((item) => item.typeLabel === '互联网');
  }
  return items;
}
