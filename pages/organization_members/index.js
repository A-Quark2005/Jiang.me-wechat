const profileService = require('../../services/profile');
const displayFormatters = require('../../services/display-formatters');
const loginGuard = require('../../services/login-guard');
const share = require('../../services/share');
const avatar = require('../../services/avatar');
const listSeed = require('../../services/list-seed');

const PAGE_SIZE = 20;

function normalizeMembers(raw) {
  const items = Array.isArray(raw) ? raw : (raw && raw.items) || [];
  return items.map((item) => {
    const name = String(item.displayName || '').trim() || '未命名用户';
    const selfIntroduction = String(item.selfIntroduction || '').trim();
    return {
      ...item,
      displayName: name,
      avatarUrlResolved: avatar.resolveAvatarUrl(item.avatarUrl),
      selfIntroduction,
      selfIntroductionText: selfIntroduction || '暂无自我介绍',
      resumeExpanded: false,
      resumeButtonText: '简历',
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
    listSeed: '',
    sharePanelVisible: false,
    miniProgramCodeLoading: false,
    miniProgramCodeUrl: '',
    shareMenuText: {
      friend: '\u8f6c\u53d1\u5f53\u524d\u9875\u9762\u5230\u804a\u5929',
      code: '\u83b7\u53d6\u5f53\u524d\u9875\u9762\u5c0f\u7a0b\u5e8f\u7801',
      cancel: '\u53d6\u6d88',
    },
  },

  async onLoad(options) {
    const rawScene = String(options.scene || '').trim();
    const scene = decodeScene(rawScene);
    const organizationId = decodeURIComponent(options.id || scene.id || '');
    const directShareRef = String(options.sr || options.shareRef || scene.sr || scene.shareRef || '').trim().toLowerCase();
    setSessionShareRef(directShareRef);
    const guardTarget = buildCurrentUrl(options);
    if (!loginGuard.guardPage(guardTarget)) {
      return;
    }
    if (organizationId) {
      this.setData({ organizationId });
      this.loadMembers(true);
      return;
    }
    if (/^sc[0-9a-z]{3,30}$/i.test(rawScene)) {
      try {
        const resolved = await profileService.resolveOrganizationMembersMiniProgramScene(rawScene);
        setSessionShareRef(resolved.shareRef);
        this.setData({ organizationId: resolved.organizationId || '' });
        this.loadMembers(true);
      } catch (error) {
        this.setData({
          loading: false,
          errorMessage: error && error.message ? error.message : '分享码无效',
        });
      }
      return;
    }
    this.setData({ organizationId });
    this.loadMembers(true);
  },

  reload() {
    this.loadMembers(true);
  },

  async loadMembers(reset) {
    const seed = reset ? listSeed.createListSeed() : this.data.listSeed;
    const offset = reset ? 0 : this.data.offset;
    this.setData({
      loading: reset,
      loadingMore: !reset,
      listSeed: seed,
      errorMessage: '',
    });
    try {
      const data = await profileService.getCertificationOrganizationMembers(this.data.organizationId, {
        limit: PAGE_SIZE,
        offset,
        seed,
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

  previewAvatar(event) {
    avatar.previewAvatar(event.currentTarget.dataset.url);
  },

  toggleMemberResume(event) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!id) return;
    const members = this.data.members.map((item) => {
      if (item.id !== id) return item;
      const resumeExpanded = !item.resumeExpanded;
      return {
        ...item,
        resumeExpanded,
        resumeButtonText: resumeExpanded ? '关闭简历' : '简历',
      };
    });
    this.setData({ members });
  },

  showShareOptions() {
    this.setData({ sharePanelVisible: true });
  },

  hideShareOptions() {
    this.setData({ sharePanelVisible: false });
  },

  noop() {},

  async handleMiniProgramCode() {
    if (!loginGuard.guardPage(buildCurrentUrl({ id: this.data.organizationId }), { requireRegistration: true })) {
      return;
    }
    this.setData({ miniProgramCodeLoading: true });
    try {
      const result = await profileService.createOrganizationMembersMiniProgramCode(this.data.organizationId);
      const imageUrl = result && (result.imageUrl || result.url);
      this.setData({
        miniProgramCodeUrl: imageUrl || '',
        miniProgramCodeLoading: false,
        sharePanelVisible: false,
      });
      if (imageUrl) {
        wx.previewImage({
          urls: [imageUrl],
          current: imageUrl,
        });
      } else {
        wx.showToast({ title: '小程序码生成失败', icon: 'none' });
      }
    } catch (error) {
      this.setData({ miniProgramCodeLoading: false });
      wx.showModal({
        title: '生成失败',
        content: error && error.message ? error.message : '请稍后重试',
        showCancel: false,
      });
    }
  },

  onShareAppMessage() {
    this.hideShareOptions();
    return share.defaultShareAppMessage({
      title: this.shareTitle(),
      path: `/pages/organization_members/index?id=${encodeURIComponent(this.data.organizationId || '')}`,
      imageUrl: this.organizationShareImage(),
    });
  },

  onShareTimeline() {
    return share.defaultShareTimeline({
      title: this.shareTitle(),
      query: `id=${encodeURIComponent(this.data.organizationId || '')}`,
      imageUrl: this.organizationShareImage(),
    });
  },

  shareTitle() {
    const organization = this.data.organization || {};
    const name = String(organization.name || '').trim();
    return name ? `推荐你看看${name}的人` : '推荐你看看远方的人';
  },

  organizationShareImage() {
    const organization = this.data.organization || {};
    return organization.logoUrl || share.DEFAULT_IMAGE_URL;
  },
});

function buildCurrentUrl(options) {
  const query = Object.keys(options || {})
    .filter((key) => options[key] !== undefined && options[key] !== null && String(options[key]) !== '')
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(options[key]))}`)
    .join('&');
  return query ? `/pages/organization_members/index?${query}` : '/pages/organization_members/index';
}

function setSessionShareRef(value) {
  const shareRef = String(value || '').trim().toLowerCase();
  if (!/^u_[0-9a-z]{3,30}$/.test(shareRef)) return;
  const app = getApp();
  if (app && app.globalData) {
    app.globalData.sessionShareRef = shareRef;
  }
}

function decodeScene(raw) {
  const value = String(raw || '').trim();
  if (!value) return {};
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  return decoded
    .replace(/^\?/, '')
    .split('&')
    .filter(Boolean)
    .reduce((result, pair) => {
      const splitIndex = pair.indexOf('=');
      const key = splitIndex >= 0 ? pair.slice(0, splitIndex) : pair;
      const itemValue = splitIndex >= 0 ? pair.slice(splitIndex + 1) : '';
      try {
        result[decodeURIComponent(key)] = decodeURIComponent(itemValue);
      } catch {
        result[key] = itemValue;
      }
      return result;
    }, {});
}
