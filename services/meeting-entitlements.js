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

function getPasswordlessContractStatus() {
  return request({ path: '/api/payments/wechat-mini-program/passwordless-contract' });
}

function preparePasswordlessContract() {
  return request({
    path: '/api/payments/wechat-mini-program/passwordless-contract/prepare',
    method: 'POST',
  });
}

function confirmPasswordlessContract(contractId, rawPayload) {
  return request({
    path: '/api/payments/wechat-mini-program/passwordless-contract/confirm',
    method: 'POST',
    data: { contractId, rawPayload },
  });
}

function createPayPerUseDeduction() {
  return request({
    path: '/api/payments/wechat-mini-program/pay-per-use/deductions',
    method: 'POST',
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

function openPasswordlessSign(signParams) {
  return new Promise((resolve, reject) => {
    const appId = String(signParams.signMiniProgramAppId || signParams.sign_mp_appid || '');
    const path = String(signParams.signMiniProgramPath || signParams.sign_mp_path || '');
    if (!appId || !path) {
      reject(new Error('微信支付免密签约跳转参数缺失'));
      return;
    }
    wx.navigateToMiniProgram({
      appId,
      path,
      envVersion: 'release',
      success: resolve,
      fail(error) {
        reject(new Error(error && error.errMsg ? error.errMsg : '打开微信支付免密签约失败'));
      },
    });
  });
}

module.exports = {
  createWechatMiniProgramOrder,
  createPayPerUseDeduction,
  confirmPasswordlessContract,
  getCapabilities,
  getEntitlements,
  getOrder,
  getOrders,
  getPasswordlessContractStatus,
  getProducts,
  openPasswordlessSign,
  preparePasswordlessContract,
  requestPayment,
};
