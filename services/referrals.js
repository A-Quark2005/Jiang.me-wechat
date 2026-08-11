const { request } = require('./api-client');

const REFERRALS_CACHE_KEY = 'meeting_referrals';
const REFERRALS_CACHE_MAX_AGE_MS = 30 * 1000;

function getReferralDashboard(options) {
  const requestOptions = options || {};
  return request({
    path: '/api/me/referrals',
    cacheKey: REFERRALS_CACHE_KEY,
    maxAgeMs: REFERRALS_CACHE_MAX_AGE_MS,
    forceRefresh: Boolean(requestOptions.forceRefresh),
  });
}

function redeemReferralCard(cardId) {
  return request({
    path: '/api/me/referrals/redeem',
    method: 'POST',
    data: { cardId },
  });
}

function createReferralInviteMiniProgramCode() {
  return request({
    path: '/api/me/referrals/mini-program-code',
    method: 'POST',
  });
}

function createReferralInviteUrlLink() {
  return request({
    path: '/api/me/referrals/url-link',
    method: 'POST',
  });
}

module.exports = {
  REFERRALS_CACHE_MAX_AGE_MS,
  createReferralInviteMiniProgramCode,
  createReferralInviteUrlLink,
  getReferralDashboard,
  redeemReferralCard,
};
