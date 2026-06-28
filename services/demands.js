const { request } = require('./api-client');

function currentShareRef() {
  const app = typeof getApp === 'function' ? getApp() : null;
  const value = app && app.globalData ? String(app.globalData.sessionShareRef || '') : '';
  return /^u_[0-9a-z]{3,30}$/.test(value) ? value : '';
}

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
  const shareRef = currentShareRef();
  return request({
    path: '/api/me/demands',
    method: 'POST',
    data: shareRef ? { ...(payload || {}), shareRef } : payload,
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
  const shareRef = currentShareRef();
  return request({
    path: `/api/demands/${encodeURIComponent(id)}/applications`,
    method: 'POST',
    data: shareRef ? { ...(payload || {}), shareRef } : (payload || {}),
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
  listMine,
  createDemand,
  updateDemand,
  getDemand,
  previewApplication,
  applyDemand,
  closeDemand,
};
