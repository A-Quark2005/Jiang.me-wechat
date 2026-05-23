const { request } = require('./api-client');

function getProducts(options) {
  const requestOptions = options || {};
  return request({
    path: '/api/tencent-meeting/entitlement-products',
    cacheKey: 'meeting_products',
    maxAgeMs: 10 * 60 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function getEntitlements(options) {
  const requestOptions = options || {};
  return request({
    path: '/api/me/meeting-entitlements',
    cacheKey: 'meeting_entitlements',
    maxAgeMs: 60 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function getCapabilities(options) {
  const requestOptions = options || {};
  return request({
    path: '/api/me/capabilities',
    cacheKey: 'me_capabilities',
    maxAgeMs: 60 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function getTencentMeetingActivation(options) {
  const requestOptions = options || {};
  return request({
    path: '/api/tencent-meeting/activation',
    cacheKey: 'meeting_activation',
    maxAgeMs: 60 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function sendTencentMeetingActivationInvite() {
  return request({
    path: '/api/tencent-meeting/activation/invite',
    method: 'POST',
  });
}

function createTencentMeeting(input) {
  const payload = typeof input === 'string' ? { subject: input } : (input || {});
  return request({
    path: '/api/tencent-meeting/meetings',
    method: 'POST',
    data: payload,
  });
}

function createWechatMiniProgramOrder(productId, purchaseOptions) {
  return request({
    path: '/api/payments/wechat-mini-program/orders',
    method: 'POST',
    data: {
      productId,
      purchaseOptions: purchaseOptions || undefined,
    },
  });
}

function getPasswordlessContractStatus(options) {
  const requestOptions = options || {};
  return request({
    path: '/api/payments/wechat-mini-program/passwordless-contract',
    cacheKey: 'passwordless_contract',
    maxAgeMs: 60 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
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

function syncPaymentStatus(orderId) {
  return request({
    path: `/api/payments/${encodeURIComponent(orderId)}/sync-status`,
    method: 'POST',
  });
}

function getOrders(options) {
  const requestOptions = options || {};
  return request({
    path: '/api/payments',
    cacheKey: 'payment_orders',
    maxAgeMs: 60 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
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
  createTencentMeeting,
  createWechatMiniProgramOrder,
  createPayPerUseDeduction,
  confirmPasswordlessContract,
  getCapabilities,
  getEntitlements,
  getOrder,
  getOrders,
  getTencentMeetingActivation,
  getPasswordlessContractStatus,
  getProducts,
  openPasswordlessSign,
  preparePasswordlessContract,
  requestPayment,
  sendTencentMeetingActivationInvite,
  syncPaymentStatus,
};
