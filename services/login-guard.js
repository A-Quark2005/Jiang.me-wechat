const auth = require('./auth');
const sessionStore = require('./session-store');

const ACTIVATION_PAGE = '/pages/meeting_activation/index';
const LOGIN_PAGE = ACTIVATION_PAGE;
const HOME_PAGE = '/pages/home/index';
const TAB_PAGES = [
  '/pages/home/index',
  '/pages/meeting_entitlements/index',
  '/pages/resume/index',
];

/**
 * Return whether the current mini-program session is authenticated.
 *
 * @returns {boolean} True when a valid access token exists locally.
 */
function isLoggedIn() {
  const session = sessionStore.getSession();
  return Boolean(session && session.accessToken);
}

/**
 * Normalize a route path so it always starts with a slash.
 *
 * @param {string} url Raw page route.
 * @returns {string} Normalized route path.
 */
function normalizeUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  return value.startsWith('/') ? value : `/${value}`;
}

/**
 * Serialize the current route including query parameters for post-login return.
 *
 * @returns {string} Encoded route string or empty string.
 */
function currentRouteUrl() {
  try {
    const page = getCurrentPages().slice(-1)[0];
    if (!page || !page.route) return '';
    const route = normalizeUrl(page.route);
    const options = page.options || {};
    const query = Object.keys(options)
      .filter((key) => options[key] !== undefined && options[key] !== null && String(options[key]) !== '')
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(options[key]))}`)
      .join('&');
    return query ? `${route}?${query}` : route;
  } catch {
    return '';
  }
}

/**
 * Build the login page URL with an optional encoded redirect target.
 *
 * @param {string} targetUrl Route to return to after login.
 * @returns {string} Login page URL.
 */
function buildLoginUrl(targetUrl) {
  const normalizedTarget = normalizeUrl(targetUrl);
  if (!normalizedTarget || normalizedTarget === ACTIVATION_PAGE) {
    return ACTIVATION_PAGE;
  }
  return `${ACTIVATION_PAGE}?redirect=${encodeURIComponent(normalizedTarget)}`;
}

function hasUsableSession(result) {
  return Boolean(
    isLoggedIn() ||
    (result && (result.session || result.token || result.accessToken))
  );
}

function needsRegistration(result) {
  return Boolean(
    result &&
    (
      result.result === 'registration_required' ||
      result.needsPhone === true
    )
  );
}

function navigateToTarget(targetUrl, viaTab) {
  const normalizedTarget = normalizeUrl(targetUrl) || HOME_PAGE;
  if (normalizedTarget === ACTIVATION_PAGE) {
    wx.navigateTo({ url: ACTIVATION_PAGE });
    return;
  }
  if (isTabPage(normalizedTarget)) {
    wx.switchTab({ url: normalizedTarget });
    return;
  }
  if (viaTab) {
    wx.navigateTo({ url: normalizedTarget });
    return;
  }
  wx.redirectTo({ url: normalizedTarget });
}

function showAutoLoginError(error) {
  wx.showModal({
    title: '账号读取失败',
    content: error && error.message ? error.message : '暂时无法读取账号，请稍后重试。',
    showCancel: false,
  });
}

/**
 * Ensure a mini-program session exists by automatically running the WeChat login flow.
 *
 * @param {object} options Guard options.
 * @param {string} options.targetUrl Route to return to after login.
 * @param {boolean} options.viaTab Whether the guard was triggered from a tab page.
 * @param {boolean} options.navigateAfterLogin Whether to navigate to target after login.
 * @param {boolean} options.showError Whether to show a modal on login failure.
 * @returns {Promise<boolean>} True when logged in.
 */
async function ensureLoggedInAsync(options) {
  const config = options || {};
  const targetUrl = config.targetUrl || currentRouteUrl() || HOME_PAGE;
  if (isLoggedIn()) {
    return true;
  }
  try {
    const result = await auth.loginWithMiniProgram();
    if (needsRegistration(result)) {
      if (config.requireRegistration === true && normalizeUrl(targetUrl) !== ACTIVATION_PAGE) {
        wx.navigateTo({ url: buildLoginUrl(targetUrl) });
      }
      return false;
    }
    if (!hasUsableSession(result)) {
      throw new Error('暂时无法读取账号。');
    }
    if (config.navigateAfterLogin !== false) {
      navigateToTarget(targetUrl, Boolean(config.viaTab));
    }
    return true;
  } catch (error) {
    if (config.showError !== false) {
      showAutoLoginError(error);
    }
    return false;
  }
}

/**
 * Automatically log in unauthenticated users.
 *
 * @param {object} options Redirect options.
 * @returns {boolean} Always false so legacy callers can short-circuit while login continues.
 */
function redirectToLogin(options) {
  ensureLoggedInAsync({
    ...(options || {}),
    requireRegistration: true,
  });
  return false;
}

/**
 * Ensure the current operation only continues for authenticated users.
 *
 * @param {object} options Guard options.
 * @param {string} options.targetUrl Route to return to after login.
 * @param {boolean} options.viaTab Whether the current page is a tab page.
 * @returns {boolean} True when logged in, otherwise false after redirecting.
 */
function ensureLoggedIn(options) {
  if (isLoggedIn()) {
    return true;
  }
  ensureLoggedInAsync(options);
  return false;
}

/**
 * Run a page-level guard for `onShow` / `onLoad`.
 *
 * @param {string} pageUrl Current page route.
 * @param {object} options Guard options.
 * @param {boolean} options.viaTab Whether the page is a tab page.
 * @returns {boolean} True when the page may continue rendering/loading.
 */
function guardPage(pageUrl, options) {
  return ensureLoggedIn({
    targetUrl: normalizeUrl(pageUrl),
    viaTab: Boolean(options && options.viaTab),
  });
}

/**
 * Wrap a button/navigation action with login enforcement.
 *
 * @param {string} targetUrl Target page route for post-login return.
 * @param {Function} action Callback to run when authenticated.
 * @param {object} options Additional guard options.
 * @returns {any} Callback result when logged in, otherwise false.
 */
function guardAction(targetUrl, action, options) {
  if (!ensureLoggedIn({
    targetUrl,
    viaTab: Boolean(options && options.viaTab),
  })) {
    return false;
  }
  if (typeof action === 'function') {
    return action();
  }
  return true;
}

/**
 * Whether the given route belongs to the tab bar.
 *
 * @param {string} url Route path to test.
 * @returns {boolean} True when the route is a tab page.
 */
function isTabPage(url) {
  return TAB_PAGES.includes(normalizeUrl(url));
}

module.exports = {
  ACTIVATION_PAGE,
  HOME_PAGE,
  LOGIN_PAGE,
  buildLoginUrl,
  currentRouteUrl,
  ensureLoggedInAsync,
  ensureLoggedIn,
  guardAction,
  guardPage,
  isLoggedIn,
  isTabPage,
  needsRegistration,
  normalizeUrl,
  redirectToLogin,
};
