const refreshState = require('../../services/refresh-state');
const loginGuard = require('../../services/login-guard');

const PAGE_KEY = 'entitlements';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

Page({
  data: {
    loading: true,
    hasLoaded: false,
    errorMessage: '',
    sleepImageUrl: '/assets/ui/meeting-search-empty.png',
    emptyStateText: '搜索想见的人，发起一场会议',
    recommendPlanTitle: '高级会议卡',
  },

  onShow() {
    if (!loginGuard.guardPage('/pages/meeting_entitlements/index', { viaTab: true, requireRegistration: true })) {
      return;
    }
    const shouldRefresh = !this.data.hasLoaded || refreshState.consume(PAGE_KEY) || refreshState.isExpired(PAGE_KEY, CACHE_MAX_AGE_MS);
    if (shouldRefresh) {
      this.loadPage(this.data.hasLoaded);
    }
  },

  async loadPage() {
    if (!this.data.hasLoaded) {
      this.setData({ loading: true, errorMessage: '' });
    } else {
      this.setData({ errorMessage: '' });
    }
    try {
      this.setData({
        loading: false,
        hasLoaded: true,
        emptyStateText: '搜索想见的人，发起一场会议',
        recommendPlanTitle: '高级会议卡',
      });
      refreshState.touch(PAGE_KEY);
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '“权益”页加载失败',
      });
    }
  },

  openOrders() {
    wx.navigateTo({ url: '/pages/orders/index' });
  },

  openHistory() {
    wx.navigateTo({ url: '/pages/meeting_history/index' });
  },

  openSearch() {
    wx.navigateTo({ url: '/pages/search/index' });
  },

  openProducts() {
    wx.navigateTo({ url: '/pages/meeting_products/index' });
  },

  openHourPurchase() {
    wx.navigateTo({ url: '/pages/meeting_hour_purchase/index' });
  },

  openReferralInvite() {
    wx.navigateTo({ url: '/pages/referral_invite/index' });
  },
});
