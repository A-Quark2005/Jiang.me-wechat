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

function getCertificationOrganizationMembers(organizationId, options) {
  const requestOptions = options || {};
  const limit = Number(requestOptions.limit || 50);
  const offset = Number(requestOptions.offset || 0);
  const seed = String(requestOptions.seed || '').trim();
  const seedQuery = seed ? `&seed=${encodeURIComponent(seed)}` : '';
  return request({
    path: `/api/certification/organizations/${encodeURIComponent(organizationId)}/members?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}${seedQuery}`,
    cacheKey: `certification_members_${organizationId}_${limit}_${offset}_${seed}`,
    maxAgeMs: 30 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function getPublicResume(userId, options) {
  const requestOptions = options || {};
  return request({
    path: `/api/resume/public/${encodeURIComponent(userId)}`,
    auth: false,
    cacheKey: `public_resume_${userId}`,
    maxAgeMs: 30 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function getContactDepositAccess(userId, options) {
  const requestOptions = options || {};
  return request({
    path: `/api/me/contact-deposits/access/${encodeURIComponent(userId)}`,
    cacheKey: `contact_deposit_access_${userId}`,
    maxAgeMs: 10 * 1000,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function createContactDepositOrder(userId, options) {
  const requestOptions = options || {};
  const data = {
    targetUserId: userId,
  };
  if (requestOptions.demandId) data.demandId = requestOptions.demandId;
  if (requestOptions.applicationId) data.applicationId = requestOptions.applicationId;
  return request({
    path: '/api/me/contact-deposits/orders',
    method: 'POST',
    data,
  });
}

function createContactDepositMiniProgramPayTicket(userId, options) {
  const requestOptions = options || {};
  const data = {
    targetUserId: userId,
  };
  if (requestOptions.demandId) data.demandId = requestOptions.demandId;
  if (requestOptions.applicationId) data.applicationId = requestOptions.applicationId;
  return request({
    path: '/api/me/contact-deposits/mini-program-pay-tickets',
    method: 'POST',
    data,
  });
}

function consumeContactDepositMiniProgramPayTicket(ticket) {
  return request({
    path: `/api/me/contact-deposits/mini-program-pay-tickets/${encodeURIComponent(String(ticket || ''))}/orders`,
    method: 'POST',
  });
}

function createPublicResumeMiniProgramCode(userId) {
  return request({
    path: `/api/me/resume/public/${encodeURIComponent(userId)}/mini-program-code`,
    method: 'POST',
  });
}

function resolvePublicResumeMiniProgramScene(scene) {
  return request({
    path: `/api/resume/public-share-scenes/${encodeURIComponent(scene)}`,
    auth: false,
  });
}

function createOrganizationMembersMiniProgramCode(organizationId) {
  return request({
    path: `/api/me/certification/organizations/${encodeURIComponent(organizationId)}/members/mini-program-code`,
    method: 'POST',
  });
}

function resolveOrganizationMembersMiniProgramScene(scene) {
  return request({
    path: `/api/certification/organization-member-share-scenes/${encodeURIComponent(scene)}`,
    auth: false,
  });
}

function syncContactDepositStatus(id) {
  return request({
    path: `/api/me/contact-deposits/${encodeURIComponent(id)}/sync-status`,
    method: 'POST',
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
  getCertificationOrganizationMembers,
  getContactDepositAccess,
  getEngagements,
  getEngagementInvite,
  getPublicResume,
  getResume,
  previewEngagementInvite,
  rejectEngagement,
  requestEngagementDelete,
  requestEngagementUpdate,
  sendCertificationEmailCode,
  createContactDepositOrder,
  createContactDepositMiniProgramPayTicket,
  consumeContactDepositMiniProgramPayTicket,
  createOrganizationMembersMiniProgramCode,
  createPublicResumeMiniProgramCode,
  updateEngagementVisibility,
  resolveOrganizationMembersMiniProgramScene,
  resolvePublicResumeMiniProgramScene,
  updateResume,
  verifyCertificationEmail,
  uploadAvatar,
  updateSelfIntroduction,
  syncContactDepositStatus,
};
