const { readCachedPayload, request } = require('./api-client');
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

function createTencentMeetingActivationAuthLink() {
  return request({
    path: '/api/tencent-meeting/activation/auth-link',
    method: 'POST',
  });
}

function getTencentMeetingWebScheduleUrl() {
  return request({
    path: '/api/tencent-meeting/web-schedule-url',
    cacheKey: '',
    forceRefresh: true,
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

function getTencentMeetingMeetings(options) {
  const requestOptions = options || {};
  return request({
    path: '/api/tencent-meeting/meetings',
    cacheKey: 'tencent_meeting_current_meetings',
    maxAgeMs: 30 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function getTencentMeetingHistory(options) {
  const requestOptions = options || {};
  const params = [];
  const meetingCode = String(requestOptions.meetingCode || '').replace(/\D/g, '');
  if (requestOptions.page) params.push(`page=${encodeURIComponent(String(requestOptions.page))}`);
  if (requestOptions.pageSize) params.push(`pageSize=${encodeURIComponent(String(requestOptions.pageSize))}`);
  if (meetingCode) params.push(`meetingCode=${encodeURIComponent(meetingCode)}`);
  return request({
    path: `/api/tencent-meeting/history-meetings${params.length ? `?${params.join('&')}` : ''}`,
    cacheKey: meetingCode ? '' : `meeting_history_${requestOptions.page || 1}_${requestOptions.pageSize || 20}`,
    maxAgeMs: 30 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function getTencentMeetingHistorySection(meetingId, section, options) {
  const requestOptions = options || {};
  const params = [];
  const sectionPath = section ? `/${encodeURIComponent(String(section))}` : '';
  const sectionKey = section || 'detail';
  if (requestOptions.meetingCode) params.push(`meetingCode=${encodeURIComponent(String(requestOptions.meetingCode))}`);
  return request({
    path: `/api/tencent-meeting/history-meetings/${encodeURIComponent(String(meetingId || ''))}${sectionPath}${params.length ? `?${params.join('&')}` : ''}`,
    cacheKey: `meeting_history_${sectionKey}_${meetingId || ''}_${requestOptions.meetingCode || ''}`,
    maxAgeMs: 30 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function meetingHistorySectionCacheKey(meetingId, section, options) {
  const requestOptions = options || {};
  return `meeting_history_${section || 'detail'}_${meetingId || ''}_${requestOptions.meetingCode || ''}`;
}

function getCachedTencentMeetingHistorySection(meetingId, section, options) {
  return readCachedPayload(meetingHistorySectionCacheKey(meetingId, section, options), 30 * 1000);
}

function isWechatSessionKeyError(error) {
  const message = error && error.message ? String(error.message) : '';
  return message.includes('缺少微信会话信息') || message.includes('session_key') || message.includes('重新登录');
}

function requestWechatMiniProgramOrder(productId, purchaseOptions, options) {
  const requestOptions = options || {};
  return request({
    path: '/api/payments/wechat-mini-program/orders',
    method: 'POST',
    data: {
      productId,
      purchaseOptions: purchaseOptions || undefined,
      paymentChannel: requestOptions.paymentChannel || undefined,
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

function getReferralCommissions(options) {
  const requestOptions = options || {};
  return request({
    path: '/api/payments/referral-commissions',
    cacheKey: 'payment_referral_commissions',
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

function isPaymentCancelled(error) {
  const message = String(error && (error.errMsg || error.message) || error || '').toLowerCase();
  return message.includes('cancel') || message.includes('取消');
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

async function createWechatMiniProgramOrder(productId, purchaseOptions, options) {
  try {
    return await requestWechatMiniProgramOrder(productId, purchaseOptions, options);
  } catch (error) {
    if (!isWechatSessionKeyError(error)) {
      throw error;
    }
  }
  sessionStore.clearSession();
  await auth.loginWithMiniProgram();
  return requestWechatMiniProgramOrder(productId, purchaseOptions, options);
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
  createTencentMeetingActivationAuthLink,
  getCapabilities,
  getEntitlements,
  getOrder,
  getOrders,
  getReferralCommissions,
  getCachedTencentMeetingHistorySection,
  getTencentMeetingHistorySection,
  getTencentMeetingHistory,
  getTencentMeetingMeetings,
  getTencentMeetingWebScheduleUrl,
  confirmPaidOrder,
  getTencentMeetingActivation,
  getProducts,
  isPaymentCancelled,
  payOrder,
  requestPayment,
  requestVirtualPayment,
  sendTencentMeetingActivationInvite,
  syncPaymentStatus,
};
