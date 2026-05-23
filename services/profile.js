const { request } = require('./api-client');

function getResume(options) {
  const requestOptions = options || {};
  return request({
    path: '/api/me/resume',
    cacheKey: 'resume_portfolio',
    maxAgeMs: 60 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function updateResume(payload) {
  return request({
    path: '/api/me/resume',
    method: 'PUT',
    data: payload,
  });
}

function updateSelfIntroduction(payload) {
  return request({
    path: '/api/me/resume/self-introduction',
    method: 'PATCH',
    data: payload,
  });
}

function getCredentials(options) {
  const requestOptions = options || {};
  return request({
    path: '/api/me/resume/credentials',
    cacheKey: 'resume_credentials',
    maxAgeMs: 60 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function getEngagements(options) {
  const requestOptions = options || {};
  return request({
    path: '/api/me/resume/engagements',
    cacheKey: 'resume_engagements',
    maxAgeMs: 60 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function createEngagement(payload) {
  return request({
    path: '/api/me/resume/engagements',
    method: 'POST',
    data: payload,
  });
}

function getEngagementInvite(id) {
  return request({
    path: `/api/me/resume/engagements/${encodeURIComponent(id)}/invite`,
  });
}

function previewEngagementInvite(token) {
  return request({
    path: `/api/resume/engagement-invites/${encodeURIComponent(token)}`,
    auth: false,
  });
}

function acceptEngagementInvite(token) {
  return request({
    path: '/api/me/resume/engagement-invites/accept',
    method: 'POST',
    data: { token },
  });
}

function confirmEngagement(id) {
  return request({
    path: `/api/me/resume/engagements/${encodeURIComponent(id)}/confirm`,
    method: 'POST',
  });
}

function rejectEngagement(id) {
  return request({
    path: `/api/me/resume/engagements/${encodeURIComponent(id)}/reject`,
    method: 'POST',
  });
}

function updateEngagementVisibility(id, visible) {
  return request({
    path: `/api/me/resume/engagements/${encodeURIComponent(id)}/visibility`,
    method: 'PATCH',
    data: { visible: Boolean(visible) },
  });
}

function requestEngagementUpdate(id, payload) {
  return request({
    path: `/api/me/resume/engagements/${encodeURIComponent(id)}`,
    method: 'PATCH',
    data: payload,
  });
}

function requestEngagementDelete(id) {
  return request({
    path: `/api/me/resume/engagements/${encodeURIComponent(id)}`,
    method: 'DELETE',
  });
}

module.exports = {
  acceptEngagementInvite,
  confirmEngagement,
  createEngagement,
  getCredentials,
  getEngagements,
  getEngagementInvite,
  getResume,
  previewEngagementInvite,
  rejectEngagement,
  requestEngagementDelete,
  requestEngagementUpdate,
  updateEngagementVisibility,
  updateResume,
  updateSelfIntroduction,
};
