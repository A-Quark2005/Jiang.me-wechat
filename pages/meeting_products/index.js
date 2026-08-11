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

function productPriceText(product) {
  return (Number(product.amountCents) / 100).toFixed(2);
}

function catalogProducts(products) {
  return products.filter((product) => product && product.visibleInCatalog !== false);
}

function productTitleOf(product) {
  const title =
    displayFormatters.normalizeMeetingProductTitle(product.name) ||
    displayFormatters.normalizeMeetingProductTitle(product.title) ||
    '\u4f1a\u5458\u5361\u5238';
  return String(title).replace(/\u6743\u76ca\u5361/g, '\u4f1a\u5458\u5361');
}

function buildProductCards(products) {
  return products.map((product) => ({
    id: productIdOf(product),
    title: productTitleOf(product),
    priceText: productPriceText(product),
    features: [
      '300\u4eba\u4e0d\u9650\u65f6 \u00b7 AI\u5c0f\u52a9\u624bPro',
      '\u65e0\u9650\u4e91\u5f55\u5236\u7a7a\u95f4',
    ],
    product,
  }));
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    paying: false,
    payingId: '',
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
        errorMessage: error && error.message ? error.message : '浼樻儬鍗″埜鍔犺浇澶辫触',
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
      wx.showToast({ title: '璇ュ崱鍒告殏涓嶅彲璐拱', icon: 'none' });
      return;
    }
    this.setData({ paying: true, payingId: productId, errorMessage: '' });
    try {
      if (productId === 'meeting_hour_pass') {
        this.setData({ paying: false, payingId: '' });
        wx.navigateTo({ url: '/pages/meeting_hour_purchase/index' });
        return;
      }
      const ready = await tencentMeetingAccess.ensureReady({ targetUrl: '/pages/meeting_products/index' });
      if (!ready) {
        this.setData({ paying: false, payingId: '' });
        return;
      }
      const order = await service.createWechatMiniProgramOrder(productId, null, { paymentChannel: 'wechat_mini_program' });
      if (!order || (!order.paymentParams && !order.virtualPaymentParams)) {
        throw new Error('鏀粯鍙傛暟寮傚父锛岃绋嶅悗閲嶈瘯');
      }
      await service.payOrder(order);
      if (order.orderId) {
        const orderDetail = await service.confirmPaidOrder(order.orderId);
        dashboardCache.invalidateDashboardRelated();
        dashboardCache.primeOrders([orderDetail]);
      }
      this.setData({ paying: false, payingId: '' });
      wx.showToast({ title: '鏀粯鎴愬姛', icon: 'success' });
      refreshState.mark(['home', 'entitlements', 'orders']);
    } catch (error) {
      if (service.isPaymentCancelled(error)) {
        this.setData({ paying: false, payingId: '' });
        return;
      }
      this.setData({
        paying: false,
        payingId: '',
        errorMessage: error && error.message ? error.message : '璐拱澶辫触',
      });
      wx.showModal({
        title: '璐拱澶辫触',
        content: error && error.message ? error.message : '璐拱澶辫触',
        showCancel: false,
      });
    }
  },
});
