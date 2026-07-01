const searchService = require('../../services/search');
const loginGuard = require('../../services/login-guard');
const displayFormatters = require('../../services/display-formatters');
const avatar = require('../../services/avatar');
const organizationGroups = require('../../services/organization-groups');

const PAGE_SIZE = 20;
const TABS = [
  { key: 'people', label: '人' },
  { key: 'organizations', label: '组织' },
  { key: 'demands', label: '需求' },
];

Page({
  data: {
    keyword: '',
    activeType: 'people',
    tabs: decorateTabs('people'),
    items: [],
    loading: false,
    loadingMore: false,
    searched: false,
    errorMessage: '',
    hasMore: false,
    offset: 0,
  },

  onLoad(options) {
    if (!loginGuard.guardPage('/pages/search/index')) return;
    const keyword = String(options.q || '').trim();
    const type = normalizeType(options.type);
    this.setData({
      keyword,
      activeType: type,
      tabs: decorateTabs(type),
    });
    if (keyword) {
      this.searchFirstPage();
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading && !this.data.loadingMore) {
      this.searchNextPage();
    }
  },

  onKeywordInput(event) {
    this.setData({ keyword: event.detail.value || '' });
  },

  clearKeyword() {
    this.setData({
      keyword: '',
      items: [],
      searched: false,
      errorMessage: '',
      hasMore: false,
      offset: 0,
    });
  },

  submitSearch() {
    this.searchFirstPage();
  },

  switchTab(event) {
    const type = normalizeType(event.currentTarget.dataset.type);
    if (type === this.data.activeType) return;
    this.setData({
      activeType: type,
      tabs: decorateTabs(type),
      items: [],
      searched: false,
      errorMessage: '',
      hasMore: false,
      offset: 0,
    });
    if (String(this.data.keyword || '').trim()) {
      this.searchFirstPage();
    }
  },

  async searchFirstPage() {
    await this.searchPage(true);
  },

  async searchNextPage() {
    await this.searchPage(false);
  },

  async searchPage(reset) {
    const keyword = String(this.data.keyword || '').trim();
    if (!keyword) {
      this.clearKeyword();
      return;
    }
    const offset = reset ? 0 : this.data.offset;
    this.setData({
      loading: reset,
      loadingMore: !reset,
      searched: true,
      errorMessage: '',
    });
    try {
      const result = await searchService.search({
        type: this.data.activeType,
        keyword,
        limit: PAGE_SIZE,
        offset,
      });
      const nextItems = presentItems(this.data.activeType, result);
      this.setData({
        loading: false,
        loadingMore: false,
        items: reset ? nextItems : this.data.items.concat(nextItems),
        offset: offset + nextItems.length,
        hasMore: Boolean(result && result.paging && result.paging.hasMore),
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadingMore: false,
        errorMessage: error && error.message ? error.message : '搜索失败',
      });
    }
  },

  openItem(event) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!id) return;
    if (this.data.activeType === 'people') {
      wx.navigateTo({ url: `/pages/public_resume/index?id=${encodeURIComponent(id)}` });
      return;
    }
    if (this.data.activeType === 'organizations') {
      wx.navigateTo({ url: `/pages/organization_members/index?id=${encodeURIComponent(id)}` });
      return;
    }
    wx.navigateTo({ url: `/pages/demands/detail?id=${encodeURIComponent(id)}` });
  },
});

function normalizeType(value) {
  const type = String(value || '');
  return TABS.some((item) => item.key === type) ? type : 'people';
}

function decorateTabs(activeType) {
  return TABS.map((item) => ({
    ...item,
    className: item.key === activeType ? 'active' : '',
  }));
}

function listFrom(raw) {
  return Array.isArray(raw) ? raw : (raw && raw.items) || [];
}

function presentItems(type, raw) {
  const items = listFrom(raw);
  if (type === 'people') return items.map(presentPerson);
  if (type === 'organizations') return organizationGroups.normalizeOrganizations(items);
  return items.map(presentDemand);
}

function presentPerson(item) {
  const name = String(item.displayName || '').trim() || '未命名用户';
  const selfIntroduction = String(item.selfIntroduction || '').trim();
  return {
    ...item,
    displayName: name,
    avatarUrlResolved: avatar.resolveAvatarUrl(item.avatarUrl),
    selfIntroductionText: selfIntroduction || '暂无自我介绍',
    metaText: item.organizationText || (
      item.verifiedAt
        ? `${displayFormatters.formatDateText(item.verifiedAt, { includeTime: false, fallback: item.verifiedAt })} 完成认证`
        : '已完成认证'
    ),
  };
}

function presentDemand(item) {
  return {
    ...item,
    descriptionText: item.description || '暂无补充说明',
    metaText: item.organizationText || '无认证要求',
  };
}
