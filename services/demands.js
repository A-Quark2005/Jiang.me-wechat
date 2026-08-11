const { request } = require('./api-client');

function listOrganizationRateRanges(options) {
  const requestOptions = options || {};
  return request({
    path: '/api/demands/organization-rate-ranges',
    cacheKey: 'demand_organization_rate_ranges',
    maxAgeMs: 60 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function listFeed(options) {
  const requestOptions = options || {};
  return request({
    path: '/api/demands/feed',
    cacheKey: 'demand_feed',
    maxAgeMs: 15 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function getCreateEntry(options) {
  const requestOptions = options || {};
  return request({
    path: '/api/demands/create-entry',
    cacheKey: 'demand_create_entry',
    maxAgeMs: 15 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function getNewDemandNoticeSubscription() {
  return request({
    path: '/api/me/demands/new-notice-subscription',
  });
}

function addNewDemandNoticeSubscription() {
  return request({
    path: '/api/me/demands/new-notice-subscription',
    method: 'POST',
  });
}

function listMine(options) {
  const requestOptions = options || {};
  return request({
    path: '/api/me/demands',
    cacheKey: 'my_demands',
    maxAgeMs: 15 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function createDemand(payload) {
  return request({
    path: '/api/me/demands',
    method: 'POST',
    data: payload,
  });
}

function updateDemand(id, payload) {
  return request({
    path: `/api/me/demands/${encodeURIComponent(id)}`,
    method: 'PUT',
    data: payload || {},
  });
}

function getDemand(id, options) {
  const requestOptions = options || {};
  return request({
    path: `/api/demands/${encodeURIComponent(id)}`,
    cacheKey: `demand_${id}`,
    maxAgeMs: 10 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function previewApplication(id) {
  return request({
    path: `/api/demands/${encodeURIComponent(id)}/application-preview`,
  });
}

function applyDemand(id, payload) {
  const shareRef = payload && payload.shareRef ? String(payload.shareRef || '') : '';
  return request({
    path: `/api/demands/${encodeURIComponent(id)}/applications`,
    method: 'POST',
    data: shareRef ? { ...(payload || {}), shareRef } : (payload || {}),
  });
}

function updateApplicationMessage(id, message) {
  return request({
    path: `/api/demands/${encodeURIComponent(id)}/applications/me/message`,
    method: 'PATCH',
    data: { message: String(message || '') },
  });
}

function closeDemand(id) {
  return request({
    path: `/api/me/demands/${encodeURIComponent(id)}/close`,
    method: 'POST',
  });
}

module.exports = {
  listOrganizationRateRanges,
  listFeed,
  getCreateEntry,
  getNewDemandNoticeSubscription,
  addNewDemandNoticeSubscription,
  listMine,
  createDemand,
  updateDemand,
  getDemand,
  previewApplication,
  applyDemand,
  updateApplicationMessage,
  closeDemand,
};
