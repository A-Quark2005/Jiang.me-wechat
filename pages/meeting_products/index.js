const service = require('../../services/meeting-entitlements');
const dashboardCache = require('../../services/dashboard-cache');
const refreshState = require('../../services/refresh-state');
const displayFormatters = require('../../services/display-formatters');
const loginGuard = require('../../services/login-guard');
const tencentMeetingAccess = require('../../services/tencent-meeting-access');

const PAGE_KEY = 'meeting_products';
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

function productIdOf(product) {
  return String(product.id || product.productId || '');
}

function productPriceOf(product) {
  const raw = product.priceText || product.amountText || product.price || '';
  return String(raw || '').replace(/^[￥¥\s]*/, '').trim();
}

/**
 * Build split price fields for tighter visual control in the card layout.
 *
 * @param {object} product Product record.
 * @returns {{priceUnitText: string, priceValueText: string}} Split price fragments.
 */
function buildPriceFragments(product) {
  return {
    priceUnitText: '¥',
    priceValueText: productPriceOf(product) || '--',
  };
}

function catalogProducts(products) {
  return products.filter((product) => product && product.visibleInCatalog !== false);
}

function buildProductCards(products) {
  return products.map((product) => ({
    id: productIdOf(product),
    title:
      displayFormatters.normalizeMeetingProductTitle(product.name) ||
      displayFormatters.normalizeMeetingProductTitle(product.title) ||
      '会议卡券',
    ...buildPriceFragments(product),
    features: [
      product.capacityText || '500人会议规模',
      product.assistantText || 'AI小助手pro',
      product.storageText || '无限云录制空间',
    ].filter(Boolean),
    product,
  }));
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    paying: false,
    errorMessage: '',
    products: [],
    productCards: [],
  },

  onShow() {
    if (!loginGuard.guardPage('/pages/meeting_products/index', { requireRegistration: true })) {
      return;
    }
    if (!this.data.hasLoaded || refreshState.consume(PAGE_KEY) || refreshState.isExpired(PAGE_KEY, CACHE_MAX_AGE_MS)) {
      this.loadProducts(true);
    }
  },

  async loadProducts(forceRefresh) {
    if (!this.data.hasLoaded) {
      this.setData({ loading: true, errorMessage: '' });
    } else {
      this.setData({ errorMessage: '' });
    }
    try {
      const productsRaw = await service.getProducts({ forceRefresh });
      const products = catalogProducts(normalizeList(productsRaw, ['items', 'products']));
      this.setData({
        loading: false,
        hasLoaded: true,
        products,
        productCards: buildProductCards(products),
      });
      refreshState.touch(PAGE_KEY);
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '优惠卡券加载失败',
      });
    }
  },

  goBack() {
    wx.navigateBack({
      fail() {
        wx.switchTab({ url: '/pages/meeting_entitlements/index' });
      },
    });
  },

  async buyProduct(event) {
    if (this.data.paying) return;
    const productId = String(event.currentTarget.dataset.id || '');
    if (!productId) {
      wx.showToast({ title: '该卡券暂不可购买', icon: 'none' });
      return;
    }
    this.setData({ paying: true, errorMessage: '' });
    try {
      if (productId === 'meeting_hour_pass') {
        this.setData({ paying: false });
        wx.navigateTo({ url: '/pages/meeting_hour_purchase/index' });
        return;
      }
      const ready = await tencentMeetingAccess.ensureReady({ targetUrl: '/pages/meeting_products/index' });
      if (!ready) {
        this.setData({ paying: false });
        return;
      }
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
      this.setData({ paying: false });
      wx.showToast({ title: '支付成功', icon: 'success' });
      refreshState.mark(['home', 'entitlements', 'orders']);
    } catch (error) {
      this.setData({
        paying: false,
        errorMessage: error && error.message ? error.message : '购买失败',
      });
      wx.showModal({
        title: '购买失败',
        content: error && error.message ? error.message : '购买失败',
        showCancel: false,
      });
    }
  },
});
