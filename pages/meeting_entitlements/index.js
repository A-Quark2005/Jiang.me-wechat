const meetingService = require('../../services/meeting-entitlements');
const demands = require('../../services/demands');
const refreshState = require('../../services/refresh-state');
const displayFormatters = require('../../services/display-formatters');
const loginGuard = require('../../services/login-guard');

const PAGE_KEY = 'entitlements';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

function normalizeList(raw, keys) {
  if (Array.isArray(raw)) return raw;
  const source = raw || {};
  for (let index = 0; index < keys.length; index += 1) {
    if (Array.isArray(source[keys[index]])) {
      return source[keys[index]];
    }
  }
  return [];
}

/**
 * Build the pending-activation notice block state for the entitlement page.
 *
 * @param {object} rawActivation Raw activation payload from backend.
 * @returns {{activation: object, showPendingActivationNotice: boolean, pendingActivationText: string}} Page state fragment.
 */
function buildPendingActivationState(rawActivation) {
  const activation = displayFormatters.normalizeMeetingActivationState(rawActivation);
  const showPendingActivationNotice = Boolean(activation && activation.isPendingActivation);
  return {
    activation,
    showPendingActivationNotice,
    pendingActivationText: showPendingActivationNotice
      ? '腾讯会议企业号待激活，请先查看短信或激活链接。'
      : '',
  };
}

function organizationTextOf(demand) {
  const organizations = Array.isArray(demand.organizations) ? demand.organizations : [];
  return organizations
    .map((item) => item && item.name)
    .filter(Boolean)
    .join('、');
}

function buildUnfinishedDemandCards(items) {
  return items
    .filter((item) => String(item.status || '').toLowerCase() === 'open')
    .map((item) => {
      const createdText = displayFormatters.formatDateText(item.createdAt, {
        includeTime: true,
        fallback: '',
      });
      return {
        id: String(item.id || ''),
        title: item.title || '我发出的需求',
        summary: [item.feePerHourText, item.amountText ? `定金 ${item.amountText}` : '']
          .filter(Boolean)
          .join('，'),
        meta: [organizationTextOf(item), createdText].filter(Boolean).join(' · '),
        badge: '待选人',
        statusText: item.statusText || '征集中',
      };
    });
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    errorMessage: '',
    unfinishedDemandCards: [],

    sleepImageUrl: '/assets/ui/sleep.png',
    emptyStateText: '暂无未匹配的需求，再去认识一些...?',
    recommendPlanTitle: '高级会议卡',

    activation: null,
    showPendingActivationNotice: false,
    pendingActivationText: '',
    sendingActivationInvite: false,
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

  async loadPage(forceRefresh) {
    if (!this.data.hasLoaded) {
      this.setData({ loading: true, errorMessage: '' });
    } else {
      this.setData({ errorMessage: '' });
    }
    try {
      const [demandsRaw, activationRaw] = await Promise.all([
        demands.listMine({ forceRefresh }),
        meetingService.getTencentMeetingActivation({ forceRefresh }),
      ]);
      const unfinishedDemandCards = buildUnfinishedDemandCards(normalizeList(demandsRaw, ['items', 'demands']));
      this.setData({
        loading: false,
        hasLoaded: true,
        unfinishedDemandCards,
        emptyStateText: '暂无未匹配的需求，再去认识一些...?',
        recommendPlanTitle: '高级会议卡',
        ...buildPendingActivationState(activationRaw),
      });
      refreshState.touch(PAGE_KEY);
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '权益页加载失败',
      });
    }
  },

  /**
   * Re-send Tencent Meeting activation invite from the entitlement page.
   *
   * @returns {Promise<void>} Resolves after the request completes.
   */
  async resendActivationInvite() {
    if (this.data.sendingActivationInvite) {
      return;
    }
    this.setData({ sendingActivationInvite: true, errorMessage: '' });
    try {
      const result = await meetingService.sendTencentMeetingActivationInvite();
      wx.showToast({
        title: result && result.inviteMessage ? result.inviteMessage : '激活链接已重发',
        icon: 'none',
      });
      refreshState.mark(['home', 'entitlements', 'resume']);
      await this.loadPage(true);
    } catch (error) {
      wx.showModal({
        title: '发送失败',
        content: error && error.message ? error.message : '激活链接发送失败',
        showCancel: false,
      });
    } finally {
      this.setData({ sendingActivationInvite: false });
    }
  },

  openOrders() {
    wx.navigateTo({ url: '/pages/orders/index' });
  },

  openDemandDetail(event) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!id) return;
    wx.navigateTo({ url: `/pages/demands/detail?id=${encodeURIComponent(id)}` });
  },

  openDistantPeople() {
    wx.navigateTo({ url: '/pages/distant_people/index' });
  },

  openHistory() {
    wx.navigateTo({ url: '/pages/meeting_history/index' });
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
