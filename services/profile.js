const { request } = require('./api-client');

function getResume() {
  return request({ path: '/api/me/resume' });
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

function getCredentials() {
  return request({ path: '/api/me/resume/credentials' });
}

function getEngagements() {
  return request({ path: '/api/me/resume/engagements' });
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
  updateEngagementVisibility,
  updateResume,
  updateSelfIntroduction,
};
