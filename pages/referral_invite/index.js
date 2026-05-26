const service = require('../../services/meeting-entitlements');
const refreshState = require('../../services/refresh-state');
const loginGuard = require('../../services/login-guard');
const share = require('../../services/share');

function normalizeItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const name = String(item.inviteeDisplayName || '微信好友').trim() || '微信好友';
    return {
      ...item,
      inviteeDisplayName: name,
      initial: name.slice(0, 1),
    };
  });
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    invite: null,
    items: [],
    redeemingId: '',
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
    if (!this.data.loading) {
      this.loadReferrals(true);
    }
  },

  async loadReferrals(forceRefresh) {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const data = await service.getReferralDashboard({ forceRefresh });
      this.setData({
        loading: false,
        invite: data && data.invite ? data.invite : null,
        items: normalizeItems(data && data.items),
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '邀请记录加载失败',
      });
      wx.showToast({ title: '邀请记录加载失败', icon: 'none' });
    }
  },

  async redeemReward(event) {
    const inviteeUserId = String(event.currentTarget.dataset.id || '');
    if (!inviteeUserId || this.data.redeemingId) {
      return;
    }
    this.setData({ redeemingId: inviteeUserId, errorMessage: '' });
    try {
      await service.redeemReferralReward(inviteeUserId);
      wx.showToast({ title: '已兑现24小时权益', icon: 'success' });
      refreshState.mark(['home', 'entitlements', 'orders']);
      await this.loadReferrals(true);
    } catch (error) {
      wx.showModal({
        title: '兑现失败',
        content: error && error.message ? error.message : '请稍后重试',
        showCancel: false,
      });
    } finally {
      this.setData({ redeemingId: '' });
    }
  },

  onShareAppMessage() {
    const invite = this.data.invite || {};
    return share.defaultShareAppMessage({
      title: invite.title || '邀请你使用讲了么',
      path: invite.path || '/pages/home/index',
    });
  },

  onShareTimeline() {
    const invite = this.data.invite || {};
    const path = String(invite.path || '').replace(/^\/?pages\/home\/index\??/, '');
    return share.defaultShareTimeline({
      title: invite.title || '邀请你使用讲了么',
      query: path,
    });
  },
});
