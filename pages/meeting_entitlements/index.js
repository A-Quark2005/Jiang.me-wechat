const service = require('../../services/meeting-entitlements');

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

function decorateProducts(products, selectedProductId) {
  return products.map((product) => ({
    ...product,
    viewId: productIdOf(product),
    viewName: productLabel(product),
    viewDescription: product.description || product.summary || '灵活购买腾讯会议能力',
    viewPrice: product.priceText || product.amountText || product.price || '¥--',
    selected: productIdOf(product) === selectedProductId,
  }));
}

Page({
  data: {
    loading: true,
    paying: false,
    errorMessage: '',
    entitlements: [],
    products: [],
    selectedProductId: '',
    selectedProduct: null,
  },

  onShow() {
    this.loadPage();
  },

  async loadPage() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const [entitlementsRaw, productsRaw] = await Promise.all([
        service.getEntitlements(),
        service.getProducts(),
      ]);
      const rawProducts = normalizeList(productsRaw, ['items', 'products']);
      const selectedProductId = rawProducts[0] ? productIdOf(rawProducts[0]) : '';
      this.setData({
        loading: false,
        entitlements: normalizeList(entitlementsRaw, ['items', 'entitlements']),
        products: decorateProducts(rawProducts, selectedProductId),
        selectedProductId,
        selectedProduct: rawProducts[0] || null,
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '会议权益加载失败',
      });
    }
  },

  selectProduct(event) {
    const productId = String(event.currentTarget.dataset.id || '');
    const selectedProduct = this.data.products.find((item) => item.viewId === productId) || null;
    this.setData({
      selectedProductId: productId,
      selectedProduct,
      products: decorateProducts(this.data.products, productId),
    });
  },

  async buySelected() {
    if (this.data.paying) {
      return;
    }
    const productId = this.data.selectedProductId;
    if (!productId) {
      wx.showToast({ title: '请选择套餐', icon: 'none' });
      return;
    }
    this.setData({ paying: true, errorMessage: '' });
    try {
      const order = await service.createWechatMiniProgramOrder(productId);
      if (!order || !order.paymentParams) {
        throw new Error('后端未返回微信支付参数');
      }
      await service.requestPayment(order.paymentParams);
      if (order.orderId) {
        await service.getOrder(order.orderId);
      }
      wx.showToast({ title: '支付成功', icon: 'success' });
      this.setData({ paying: false });
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

  productLabel,
});
