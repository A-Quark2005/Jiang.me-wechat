const service = require('../../services/meeting-entitlements');
const refreshState = require('../../services/refresh-state');

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
  return product.name || product.title || product.label || '会议权益套餐';
}

function productIdOf(product) {
  return String(product.id || product.productId || '');
}

function billingModeOf(product) {
  const value = String(product.billingMode || product.mode || product.type || product.code || productIdOf(product) || productLabel(product)).toLowerCase();
  if (value.includes('week') || value.includes('周')) return 'week_pass';
  if (value.includes('month') || value.includes('月')) return 'month_pass';
  if (value.includes('single') || value.includes('per') || value.includes('次')) return 'pay_per_use';
  return '';
}

function findProductByMode(products, billingMode) {
  return products.find((product) => billingModeOf(product) === billingMode) || null;
}

function buildPlanCards(products, selectedPlanId) {
  const payPerUseProduct = findProductByMode(products, 'pay_per_use');
  const weekProduct = findProductByMode(products, 'week_pass');
  const monthProduct = findProductByMode(products, 'month_pass');
  const plans = [
    {
      id: productIdOf(payPerUseProduct) || 'meeting-pay-per-use',
      billingMode: 'pay_per_use',
      title: '按次付费',
      badge: '默认',
      description: '开通免密支付后，每次使用会议能力按次扣费。',
      price: payPerUseProduct ? payPerUseProduct.priceText || payPerUseProduct.amountText || '按次计费' : '按次计费',
      actionText: '开通免密',
      requiresPasswordlessPayment: true,
      product: payPerUseProduct,
    },
    {
      id: productIdOf(weekProduct) || 'meeting-week-pass',
      billingMode: 'week_pass',
      title: '周卡',
      badge: '单周不限量',
      description: weekProduct ? weekProduct.description || weekProduct.summary || '单周不限量使用会议能力。' : '单周不限量使用会议能力。',
      price: weekProduct ? weekProduct.priceText || weekProduct.amountText || weekProduct.price || '¥--' : '暂未上架',
      actionText: '购买周卡',
      product: weekProduct,
    },
    {
      id: productIdOf(monthProduct) || 'meeting-month-pass',
      billingMode: 'month_pass',
      title: '月卡',
      badge: '单月不限量',
      description: monthProduct ? monthProduct.description || monthProduct.summary || '单月不限量使用会议能力。' : '单月不限量使用会议能力。',
      price: monthProduct ? monthProduct.priceText || monthProduct.amountText || monthProduct.price || '¥--' : '暂未上架',
      actionText: '购买月卡',
      product: monthProduct,
    },
  ];
  return plans.map((plan) => ({
    ...plan,
    selected: plan.id === selectedPlanId,
    disabled: plan.billingMode !== 'pay_per_use' && !plan.product,
  }));
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
    selectedPlanId: 'meeting-pay-per-use',
    selectedPlan: null,
    passwordlessContract: null,
  },

  onShow() {
    if (!this.data.hasLoaded || refreshState.consume(PAGE_KEY) || refreshState.isExpired(PAGE_KEY, CACHE_MAX_AGE_MS)) {
      this.loadPage();
    }
  },

  async loadPage() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const [entitlementsRaw, productsRaw, contractRaw] = await Promise.all([
        service.getEntitlements(),
        service.getProducts(),
        service.getPasswordlessContractStatus(),
      ]);
      const rawProducts = normalizeList(productsRaw, ['items', 'products']);
      const payPerUseProduct = findProductByMode(rawProducts, 'pay_per_use');
      const selectedPlanId = productIdOf(payPerUseProduct) || 'meeting-pay-per-use';
      const planCards = buildPlanCards(rawProducts, selectedPlanId);
      this.setData({
        loading: false,
        hasLoaded: true,
        entitlements: normalizeList(entitlementsRaw, ['items', 'entitlements']),
        products: rawProducts,
        planCards,
        selectedPlanId,
        selectedPlan: planCards.find((plan) => plan.id === selectedPlanId) || planCards[0] || null,
        passwordlessContract: contractRaw,
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
    });
  },

  async ensureTencentMeetingActivated() {
    const activation = await service.getTencentMeetingActivation();
    if (!activation || activation.status !== 'active') {
      wx.navigateTo({ url: '/pages/meeting_activation/index' });
      return false;
    }
    return true;
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
    if (selectedPlan.requiresPasswordlessPayment) {
      await this.openPasswordlessContract(true);
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
      if (!order || !order.paymentParams) {
        throw new Error('支付参数异常，请稍后重试');
      }
      await service.requestPayment(order.paymentParams);
      if (order.orderId) {
        await service.getOrder(order.orderId);
      }
      wx.showToast({ title: '支付成功', icon: 'success' });
      this.setData({ paying: false });
      refreshState.mark(['home', 'orders']);
      this.loadPage();
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

  openOrders() {
    wx.navigateTo({ url: '/pages/orders/index' });
  },

  async openPasswordlessContract(skipActivationCheck) {
    if (!skipActivationCheck) {
      const activated = await this.ensureTencentMeetingActivated();
      if (!activated) {
        return;
      }
    }
    this.setData({ paying: true, errorMessage: '' });
    try {
      const result = await service.preparePasswordlessContract();
      if (!result || result.status === 'not_configured' || result.configured === false) {
        this.setData({ paying: false });
        wx.showModal({
          title: '暂未开通',
          content: result && result.message ? result.message : '微信支付免密签约参数尚未配置。',
          showCancel: false,
        });
        return;
      }
      this.setData({ passwordlessContract: result });
      await service.openPasswordlessSign(result);
      this.setData({ paying: false });
      wx.showModal({
        title: '等待签约结果',
        content: '已打开微信支付免密签约。完成签约后，系统会根据微信支付通知自动生效。',
        confirmText: '知道了',
        showCancel: false,
      });
      refreshState.mark(['entitlements', 'home']);
    } catch (error) {
      this.setData({
        paying: false,
        errorMessage: error && error.message ? error.message : '免密签约准备失败',
      });
      wx.showModal({
        title: '免密签约失败',
        content: error && error.message ? error.message : '免密签约准备失败',
        showCancel: false,
      });
    }
  },

  productLabel,
});
