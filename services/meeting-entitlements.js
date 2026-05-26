const { request } = require('./api-client');
const auth = require('./auth');
const sessionStore = require('./session-store');

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

function isWechatSessionKeyError(error) {
  const message = error && error.message ? String(error.message) : '';
  return message.includes('缺少微信会话信息') || message.includes('session_key') || message.includes('重新登录');
}

function requestWechatMiniProgramOrder(productId, purchaseOptions) {
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function confirmPaidOrder(orderId) {
  if (!orderId) {
    return null;
  }
  let lastOrder = null;
  for (let index = 0; index < 6; index += 1) {
    const synced = await syncPaymentStatus(orderId);
    const order = synced && (synced.order || synced.paymentOrder || synced);
    if (order && String(order.status || order.orderStatus || '').toLowerCase() === 'paid') {
      return order;
    }
    const latest = await getOrder(orderId);
    lastOrder = latest && (latest.order || latest.paymentOrder || latest);
    if (lastOrder && String(lastOrder.status || lastOrder.orderStatus || '').toLowerCase() === 'paid') {
      return lastOrder;
    }
    await delay(index < 2 ? 700 : 1200);
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

async function createWechatMiniProgramOrder(productId, purchaseOptions) {
  try {
    return await requestWechatMiniProgramOrder(productId, purchaseOptions);
  } catch (error) {
    if (!isWechatSessionKeyError(error)) {
      throw error;
    }
  }
  sessionStore.clearSession();
  await auth.loginWithMiniProgram();
  return requestWechatMiniProgramOrder(productId, purchaseOptions);
}

function requestVirtualPayment(paymentParams) {
  return new Promise((resolve, reject) => {
    const params = paymentParams || {};
    wx.requestVirtualPayment({
      mode: params.mode,
      signData: params.signData,
      paySig: params.paySig,
      signature: params.signature,
      success: resolve,
      fail(error) {
        reject(new Error(error && error.errMsg ? error.errMsg : '微信虚拟支付失败'));
      },
    });
  });
}

function payOrder(order) {
  if (order && order.virtualPaymentParams) {
    return requestVirtualPayment(order.virtualPaymentParams);
  }
  return requestPayment(order && order.paymentParams);
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
  payOrder,
  requestPayment,
  requestVirtualPayment,
  sendTencentMeetingActivationInvite,
  syncPaymentStatus,
};
