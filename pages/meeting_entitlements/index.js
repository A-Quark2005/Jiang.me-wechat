const service = require('../../services/meeting-entitlements');
const dashboardCache = require('../../services/dashboard-cache');
const refreshState = require('../../services/refresh-state');
const displayFormatters = require('../../services/display-formatters');
const loginGuard = require('../../services/login-guard');
const tencentMeetingAccess = require('../../services/tencent-meeting-access');

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

function productLabel(product) {
  return (
    displayFormatters.normalizeMeetingProductTitle(product.name) ||
    displayFormatters.normalizeMeetingProductTitle(product.title) ||
    product.label ||
    '会议权益套餐'
  );
}

function productIdOf(product) {
  return String(product.id || product.productId || '');
}

function catalogProducts(products) {
  return products.filter((product) => product && product.visibleInCatalog !== false);
}

function billingModeOf(product) {
  const productId = productIdOf(product);
  if (productId === 'meeting_single') return 'single';
  if (productId === 'meeting_week_pass') return 'week_pass';
  if (productId === 'meeting_half_pass') return 'half_month_pass';
  if (productId === 'meeting_month_pass') return 'month_pass';
  if (productId === 'meeting-recording-pack') return 'recording_pack';
  return String(product.billingMode || product.mode || product.type || product.code || productLabel(product)).toLowerCase();
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

/**
 * Build sellable plan cards directly from backend product definitions.
 *
 * @param products Raw product list returned by backend.
 * @param selectedPlanId Currently selected product id.
 * @returns Plan card view models for the entitlement page.
 */
function buildPlanCards(products, selectedPlanId) {
  const badgeByMode = {
    single: '按次',
    week_pass: '7 天',
    half_month_pass: '15 天',
    month_pass: '30 天',
    recording_pack: '资料',
  };
  const actionTextByMode = {
    single: '购买单次券',
    week_pass: '购买 7 天卡',
    half_month_pass: '购买 15 天卡',
    month_pass: '购买 30 天卡',
    recording_pack: '购买资料包',
  };
  const plans = products.map((product) => {
    const mode = billingModeOf(product);
    return {
      id: productIdOf(product),
      billingMode: mode,
      title: productLabel(product),
      badge: badgeByMode[mode] || '权益',
      description: product.description || product.summary || '用于腾讯会议相关能力。',
      price: product.priceText || product.amountText || product.price || '暂未定价',
      actionText: actionTextByMode[mode] || '立即购买',
      product,
      disabled: !productIdOf(product),
    };
  });
  return plans.map((plan) => ({
    ...plan,
    selected: plan.id === selectedPlanId,
  }));
}

function entitlementTypeLabel(entitlement) {
  const type = String(entitlement && entitlement.type ? entitlement.type : '').toLowerCase();
  const sourceId = String(entitlement && entitlement.sourceId ? entitlement.sourceId : '').toLowerCase();
  if (type === 'hour_pass' || sourceId === 'meeting_hour_pass') {
    return '小时会员';
  }
  if (type === 'duration') {
    return '不限次会议卡';
  }
  if (sourceId === 'meeting_single') {
    return '高级账号';
  }
  if (type === 'recording_pack') {
    return '资料包';
  }
  return '会议权益';
}

function buildEntitlementCards(entitlements) {
  return entitlements.map((entitlement) => {
    const expiresAt = entitlement.expiresAt || entitlement.validUntil || '';
    const status = String(entitlement.status || '').toLowerCase();
    const active = status === 'active';
    const summaryParts = [];
    if (expiresAt) {
      summaryParts.push(
        `高级账号有效期至 ${displayFormatters.formatDateText(expiresAt, { includeTime: true, fallback: expiresAt })}`,
      );
    } else {
      summaryParts.push('高级账号已开通');
    }
    return {
      id: String(entitlement.id || entitlement.orderId || entitlement.sourceId || Math.random()),
      title: productLabel(entitlement),
      badge: entitlementTypeLabel(entitlement),
      summary: summaryParts.join(' · ') || '已生效',
      statusText: active ? '生效中' : '已使用',
      active,
    };
  });
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    paying: false,
    errorMessage: '',
    entitlements: [],
    products: [],
    planCards: [],
    entitlementCards: [],
    selectedPlanId: '',
    selectedPlan: null,

    sleepImageUrl: '/assets/ui/sleep.png',
    emptyStateText: '暂无可用卡',
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
    if (!this.data.hasLoaded || refreshState.consume(PAGE_KEY) || refreshState.isExpired(PAGE_KEY, CACHE_MAX_AGE_MS)) {
      this.loadPage(true);
    }
  },

  async loadPage(forceRefresh) {
    if (!this.data.hasLoaded) {
      this.setData({ loading: true, errorMessage: '' });
    } else {
      this.setData({ errorMessage: '' });
    }
    try {
      const [entitlementsRaw, productsRaw, activationRaw] = await Promise.all([
        service.getEntitlements({ forceRefresh }),
        service.getProducts({ forceRefresh }),
        service.getTencentMeetingActivation({ forceRefresh }),
      ]);
      const rawProducts = catalogProducts(normalizeList(productsRaw, ['items', 'products']));
      const entitlements = normalizeList(entitlementsRaw, ['items', 'entitlements']);
      const activationState = buildPendingActivationState(activationRaw);
      const selectedPlanId = productIdOf(rawProducts[0]) || '';
      const planCards = buildPlanCards(rawProducts, selectedPlanId);
      const entitlementCards = buildEntitlementCards(entitlements);
      const selectedPlan = planCards.find((plan) => plan.id === selectedPlanId) || planCards[0] || null;
      this.setData({
        loading: false,
        hasLoaded: true,
        entitlements,
        entitlementCards,
        products: rawProducts,
        planCards,
        selectedPlanId,
        selectedPlan,
        emptyStateText: '暂无可用卡',
        recommendPlanTitle: '高级会议卡',
        ...activationState,
      });
      refreshState.touch(PAGE_KEY);
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '会议权益加载失败',
      });
    }
  },

  selectPlan(event) {
    const planId = String(event.currentTarget.dataset.id || '');
    const planCards = buildPlanCards(this.data.products, planId);
    const selectedPlan = planCards.find((item) => item.id === planId) || null;
    if (selectedPlan && selectedPlan.disabled) {
      wx.showToast({ title: '该权益暂未上架', icon: 'none' });
      return;
    }
    this.setData({
      selectedPlanId: planId,
      selectedPlan,
      planCards,
      recommendPlanTitle: '高级会议卡',
    });
  },

  async ensureTencentMeetingActivated() {
    return tencentMeetingAccess.ensureReady({ targetUrl: '/pages/meeting_entitlements/index' });
  },

  async buySelected() {
    if (this.data.paying) {
      return;
    }
    const selectedPlan = this.data.selectedPlan;
    if (!selectedPlan) {
      wx.showToast({ title: '请选择权益', icon: 'none' });
      return;
    }
    const activated = await this.ensureTencentMeetingActivated();
    if (!activated) {
      return;
    }
    const productId = selectedPlan.product ? productIdOf(selectedPlan.product) : '';
    if (!productId) {
      wx.showToast({ title: '该权益暂未上架', icon: 'none' });
      return;
    }
    this.setData({ paying: true, errorMessage: '' });
    try {
      const order = await service.createWechatMiniProgramOrder(productId);
      if (!order || (!order.paymentParams && !order.virtualPaymentParams)) {
        throw new Error('支付参数异常，请稍后重试');
      }
      await service.payOrder(order);
      if (order.orderId) {
        const orderDetail = await service.confirmPaidOrder(order.orderId);
        dashboardCache.invalidateDashboardRelated();
        dashboardCache.primeOrders([orderDetail]);
      }
      wx.showToast({ title: '支付成功', icon: 'success' });
      this.setData({ paying: false });
      refreshState.mark(['home', 'orders']);
      this.loadPage(true);
    } catch (error) {
      const message = error && error.message ? error.message : '支付失败';
      wx.showModal({
        title: '支付失败',
        content: message,
        showCancel: false,
      });
      this.setData({
        paying: false,
        errorMessage: error && error.message ? error.message : '支付失败',
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
      const result = await service.sendTencentMeetingActivationInvite();
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

  openProducts() {
    wx.navigateTo({ url: '/pages/meeting_products/index' });
  },

  openHourPurchase() {
    wx.navigateTo({ url: '/pages/meeting_hour_purchase/index' });
  },

  openReferralInvite() {
    wx.navigateTo({ url: '/pages/referral_invite/index' });
  },

  productLabel,
});
