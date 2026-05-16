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
  confirmEngagement,
  getCredentials,
  getEngagements,
  getResume,
  rejectEngagement,
  updateEngagementVisibility,
  updateResume,
  updateSelfIntroduction,
};
