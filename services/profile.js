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
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${apiClient.backendBaseUrl()}/api/me/avatar`,
      filePath,
      name: 'file',
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success(response) {
        const statusCode = response.statusCode || 0;
        let body = {};
        try {
          body = response.data ? JSON.parse(response.data) : {};
        } catch (error) {
          reject(new Error('头像上传响应格式异常'));
          return;
        }
        if (statusCode >= 200 && statusCode < 300 && body.ok === true) {
          resolve(body.data || {});
          return;
        }
        reject(new Error(body.message || body.error || '头像上传失败'));
      },
      fail(error) {
        reject(new Error(error && error.errMsg ? `头像上传失败：${error.errMsg}` : '头像上传失败'));
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
  uploadAvatar,
  updateSelfIntroduction,
};
