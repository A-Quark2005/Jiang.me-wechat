const { request } = require('./api-client');

function getProducts() {
  return request({ path: '/api/tencent-meeting/entitlement-products' });
}

function getEntitlements() {
  return request({ path: '/api/me/meeting-entitlements' });
}

function getCapabilities() {
  return request({ path: '/api/me/capabilities' });
}

function createWechatMiniProgramOrder(productId) {
  return request({
    path: '/api/payments/wechat-mini-program/orders',
    method: 'POST',
    data: { productId },
  });
}

function getOrders() {
  return request({ path: '/api/payments' });
}

function getOrder(orderId) {
  return request({ path: `/api/payments/${encodeURIComponent(orderId)}` });
}

function requestPayment(paymentParams) {
  return new Promise((resolve, reject) => {
    wx.requestPayment({
      ...paymentParams,
      success: resolve,
      fail(error) {
        reject(new Error(error && error.errMsg ? error.errMsg : '微信支付失败'));
      },
    });
  });
}

module.exports = {
  createWechatMiniProgramOrder,
  getCapabilities,
  getEntitlements,
  getOrder,
  getOrders,
  getProducts,
  requestPayment,
};
