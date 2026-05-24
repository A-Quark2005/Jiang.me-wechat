const displayFormatters = require('./display-formatters');
const loginGuard = require('./login-guard');
const meetingEntitlements = require('./meeting-entitlements');

/**
 * Ensure Tencent Meeting related actions have the required account state.
 *
 * The runtime order is:
 * 1. Auto-login to the mini-program account.
 * 2. If phone binding is required, show the activation page to request phone authorization.
 * 3. If Tencent Meeting is not active yet, show the activation page with resend-invite action.
 *
 * @param {object} options Guard options.
 * @param {string} options.targetUrl Route that initiated the action.
 * @returns {Promise<boolean>} True when the action may continue.
 */
async function ensureReady(options) {
  const config = options || {};
  const loggedIn = await loginGuard.ensureLoggedInAsync({
    targetUrl: config.targetUrl,
    navigateAfterLogin: false,
    requireRegistration: true,
  });
  if (!loggedIn) {
    return false;
  }

  const activation = displayFormatters.normalizeMeetingActivationState(
    await meetingEntitlements.getTencentMeetingActivation({ forceRefresh: true }),
  );
  if (
    activation.needsPhone ||
    activation.needsActivation ||
    activation.isPendingActivation ||
    !activation.isActive
  ) {
    wx.navigateTo({ url: '/pages/meeting_activation/index' });
    return false;
  }
  return true;
}

module.exports = {
  ensureReady,
};
