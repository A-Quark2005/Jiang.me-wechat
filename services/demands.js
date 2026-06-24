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

function getDemand(id, options) {
  const requestOptions = options || {};
  return request({
    path: `/api/demands/${encodeURIComponent(id)}`,
    cacheKey: `demand_${id}`,
    maxAgeMs: 10 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function syncPayment(id) {
  return request({
    path: `/api/me/demands/${encodeURIComponent(id)}/sync-payment`,
    method: 'POST',
  });
}

function cancelDemand(id) {
  return request({
    path: `/api/me/demands/${encodeURIComponent(id)}/cancel`,
    method: 'POST',
  });
}

function previewApplication(id) {
  return request({
    path: `/api/demands/${encodeURIComponent(id)}/application-preview`,
  });
}

function applyDemand(id, payload) {
  return request({
    path: `/api/demands/${encodeURIComponent(id)}/applications`,
    method: 'POST',
    data: payload || {},
  });
}

function selectApplication(demandId, applicationId) {
  return request({
    path: `/api/me/demands/${encodeURIComponent(demandId)}/applications/${encodeURIComponent(applicationId)}/select`,
    method: 'POST',
  });
}

module.exports = {
  listOrganizationRateRanges,
  listFeed,
  listMine,
  createDemand,
  getDemand,
  syncPayment,
  cancelDemand,
  previewApplication,
  applyDemand,
  selectApplication,
};
