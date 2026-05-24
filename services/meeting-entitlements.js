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

async function confirmPaidOrder(orderId) {
  if (!orderId) {
    return null;
  }
  const synced = await syncPaymentStatus(orderId);
  const order = synced && (synced.order || synced.paymentOrder || synced);
  if (order && String(order.status || order.orderStatus || '').toLowerCase() === 'paid') {
    return order;
  }
  const latest = await getOrder(orderId);
  const latestOrder = latest && (latest.order || latest.paymentOrder || latest);
  if (latestOrder && String(latestOrder.status || latestOrder.orderStatus || '').toLowerCase() === 'paid') {
    return latestOrder;
  }
  throw new Error('支付已提交，系统正在确认权益，请稍后刷新');
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
  createTencentMeeting,
  createWechatMiniProgramOrder,
  getCapabilities,
  getEntitlements,
  getOrder,
  getOrders,
  confirmPaidOrder,
  getTencentMeetingActivation,
  getProducts,
  requestPayment,
  sendTencentMeetingActivationInvite,
  syncPaymentStatus,
};
