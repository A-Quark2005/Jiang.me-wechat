const { request } = require('./api-client');
const apiClient = require('./api-client');
const sessionStore = require('./session-store');

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

function uploadAvatar(filePath) {
  const token = sessionStore.getAccessToken();
  const uploadUrl = `${apiClient.backendBaseUrl()}/api/me/avatar`;
  if (!/^https:\/\/[^/]+\/.+/i.test(uploadUrl)) {
    return Promise.reject(new Error(`\u5934\u50cf\u4e0a\u4f20\u5730\u5740\u65e0\u6548\uff1a${uploadUrl}`));
  }
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: uploadUrl,
      filePath,
      name: 'file',
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success(response) {
        const statusCode = response.statusCode || 0;
        let body = {};
        try {
          body = response.data ? JSON.parse(response.data) : {};
        } catch (error) {
          reject(new Error('\u5934\u50cf\u4e0a\u4f20\u54cd\u5e94\u683c\u5f0f\u5f02\u5e38'));
          return;
        }
        if (statusCode >= 200 && statusCode < 300 && body.ok === true) {
          resolve(body.data || {});
          return;
        }
        reject(new Error(body.message || body.error || '\u5934\u50cf\u4e0a\u4f20\u5931\u8d25'));
      },
      fail(error) {
        const message = error && error.errMsg ? error.errMsg : '';
        if (message.includes('url not in domain list') || message.includes('domain list')) {
          reject(new Error(`\u5934\u50cf\u4e0a\u4f20\u5931\u8d25\uff1a\u8bf7\u5728\u5fae\u4fe1\u5c0f\u7a0b\u5e8f\u540e\u53f0\u628a ${apiClient.backendBaseUrl()} \u52a0\u5165 uploadFile \u5408\u6cd5\u57df\u540d`));
          return;
        }
        reject(new Error(message ? `\u5934\u50cf\u4e0a\u4f20\u5931\u8d25\uff1a${message}` : '\u5934\u50cf\u4e0a\u4f20\u5931\u8d25'));
      },
    });
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

function getCertificationOrganizations(options) {
  const requestOptions = options || {};
  return request({
    path: '/api/certification/organizations',
    cacheKey: 'certification_organizations',
    maxAgeMs: 60 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function sendCertificationEmailCode(payload) {
  return request({
    path: '/api/me/certification/email-code',
    method: 'POST',
    data: payload,
  });
}

function verifyCertificationEmail(payload) {
  return request({
    path: '/api/me/certification/verify-email',
    method: 'POST',
    data: payload,
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
  getCertificationOrganizations,
  getEngagements,
  getEngagementInvite,
  getResume,
  previewEngagementInvite,
  rejectEngagement,
  requestEngagementDelete,
  requestEngagementUpdate,
  sendCertificationEmailCode,
  updateEngagementVisibility,
  updateResume,
  verifyCertificationEmail,
  uploadAvatar,
  updateSelfIntroduction,
};
