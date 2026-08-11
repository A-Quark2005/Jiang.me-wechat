const referrals = require('../../services/referrals');
const refreshState = require('../../services/refresh-state');
const loginGuard = require('../../services/login-guard');
const share = require('../../services/share');
const avatar = require('../../services/avatar');
const tencentMeetingAccess = require('../../services/tencent-meeting-access');

const PAGE_KEY = 'referrals';
const INVITE_LINK_TITLE = '送你一张腾讯会议24小时会员卡，开通讲了么后即可使用';
const INVITE_PAGE_TITLE = '送你一张腾讯会议24小时会员卡，开通讲了么后即可使用';
const INVITE_PAGE_PATH = '/pages/referral_invite/index';
const INVITE_SHARE_IMAGE_URL = '/assets/ui/referral-share-cover.jpg';

function buildInviteCopy(invite) {
  const data = invite || {};
  const link = String(data.link || data.urlLink || '').trim();
  const title = '邀请好友得奖励';
  const bodyLines = [
    '送你一张腾讯会议24小时会员卡，开通讲了么后即可使用。',
  ];
  if (link) {
    bodyLines.push('', '点击链接领取：', link);
  }
  const body = bodyLines.join('\n');
  return {
    title,
    body,
    text: [title, body].filter(Boolean).join('\n'),
  };
}

function normalizeCards(cards) {
  return (Array.isArray(cards) ? cards : []).map((card) => {
    const counterpartName = String(card.counterpartName || '微信好友').trim() || '微信好友';
    const statusClass = String(card.status || '').trim();
    return {
      ...card,
      counterpartName,
      statusClass,
      showRedeemButton: Boolean(card.canRedeem),
      counterpartAvatarUrlResolved: avatar.resolveAvatarUrl(card.counterpartAvatarUrl),
    };
  });
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    errorMessage: '',
    invite: null,
    cards: [],
    redeemingId: '',
    inviteCopyModalVisible: false,
    inviteCopyTitle: '',
    inviteCopyText: '',
    inviteToolLoading: false,
  },

  onLoad() {
    if (!loginGuard.guardPage('/pages/referral_invite/index', { requireRegistration: true })) {
      return;
    }
    this.loadReferrals(true);
  },

  onShow() {
    if (!loginGuard.isLoggedIn()) {
      return;
    }
    if (
      this.data.hasLoaded &&
      (refreshState.consume(PAGE_KEY) || refreshState.isExpired(PAGE_KEY, referrals.REFERRALS_CACHE_MAX_AGE_MS))
    ) {
      this.loadReferrals(true);
    }
  },

  async loadReferrals(forceRefresh) {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const data = await referrals.getReferralDashboard({ forceRefresh });
      this.setData({
        loading: false,
        hasLoaded: true,
        invite: data && data.invite ? data.invite : null,
        cards: normalizeCards(data && data.cards),
      });
      refreshState.touch(PAGE_KEY);
    } catch (error) {
      this.setData({
        loading: false,
        hasLoaded: true,
        errorMessage: error && error.message ? error.message : '邀请权益加载失败',
      });
      wx.showToast({ title: '邀请权益加载失败', icon: 'none' });
    }
  },

  async redeemCard(event) {
    const cardId = String(event.currentTarget.dataset.id || '');
    if (!cardId || this.data.redeemingId) {
      return;
    }
    this.setData({ redeemingId: cardId, errorMessage: '' });
    try {
      const ready = await tencentMeetingAccess.ensureReady({ targetUrl: '/pages/referral_invite/index' });
      if (!ready) return;
      await referrals.redeemReferralCard(cardId);
      wx.showToast({ title: '已使用', icon: 'success' });
      refreshState.mark(['home', 'entitlements', 'orders', PAGE_KEY]);
      await this.loadReferrals(true);
    } catch (error) {
      wx.showModal({
        title: '使用失败',
        content: error && error.message ? error.message : '请稍后重试',
        showCancel: false,
      });
    } finally {
      this.setData({ redeemingId: '' });
    }
  },

  previewAvatar(event) {
    avatar.previewAvatar(event.currentTarget.dataset.url);
  },

  noop() {},

  showInviteTools() {
    wx.showActionSheet({
      itemList: ['复制邀请文案', '获取小程序码'],
      success: (result) => {
        if (result.tapIndex === 0) {
          this.copyInviteText();
          return;
        }
        if (result.tapIndex === 1) {
          this.handleMiniProgramCode();
        }
      },
      fail: () => {},
    });
  },

  async copyInviteText() {
    if (this.data.inviteToolLoading) return;
    this.setData({ inviteToolLoading: true });
    try {
      const result = await referrals.createReferralInviteUrlLink();
      const inviteCopy = buildInviteCopy({
        ...this.data.invite,
        link: result && (result.urlLink || result.link),
      });
      this.setData({
        inviteCopyTitle: inviteCopy.title,
        inviteCopyText: inviteCopy.body,
        inviteCopyModalVisible: true,
      });
    } catch (error) {
      wx.showModal({
        title: '复制失败',
        content: error && error.message ? error.message : '请稍后重试',
        showCancel: false,
      });
    } finally {
      this.setData({ inviteToolLoading: false });
    }
  },

  hideInviteCopyModal() {
    this.setData({ inviteCopyModalVisible: false });
  },

  confirmCopyInviteText() {
    const title = String(this.data.inviteCopyTitle || '').trim();
    const body = String(this.data.inviteCopyText || '').trim();
    const inviteCopy = [title, body].filter(Boolean).join('\n');
    if (!inviteCopy) {
      this.hideInviteCopyModal();
      return;
    }
    wx.setClipboardData({
      data: inviteCopy,
      success: () => {
        this.hideInviteCopyModal();
        wx.showToast({ title: '已复制', icon: 'success' });
      },
    });
  },

  async handleMiniProgramCode() {
    if (this.data.inviteToolLoading) return;
    this.setData({ inviteToolLoading: true });
    try {
      const result = await referrals.createReferralInviteMiniProgramCode();
      const imageUrl = result && (result.imageUrl || result.url);
      if (!imageUrl) {
        wx.showToast({ title: '小程序码生成失败', icon: 'none' });
        return;
      }
      wx.previewImage({
        urls: [imageUrl],
        current: imageUrl,
      });
    } catch (error) {
      wx.showModal({
        title: '生成失败',
        content: error && error.message ? error.message : '请稍后重试',
        showCancel: false,
      });
    } finally {
      this.setData({ inviteToolLoading: false });
    }
  },

  onShareAppMessage(event) {
    const invite = this.data.invite || {};
    const isInviteButton = event && event.from === 'button';
    return share.defaultShareAppMessage({
      title: isInviteButton ? INVITE_LINK_TITLE : INVITE_PAGE_TITLE,
      path: isInviteButton ? (invite.path || '/pages/home/index') : INVITE_PAGE_PATH,
      imageUrl: INVITE_SHARE_IMAGE_URL,
    });
  },

  onShareTimeline() {
    return share.defaultShareTimeline({
      title: INVITE_PAGE_TITLE,
      path: INVITE_PAGE_PATH,
      query: '',
      imageUrl: INVITE_SHARE_IMAGE_URL,
    });
  },
});
