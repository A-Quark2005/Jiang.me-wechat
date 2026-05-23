const sessionStore = require('./session-store');

const LOGIN_PAGE = '/pages/meeting_activation/index';
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
  if (!normalizedTarget || normalizedTarget === LOGIN_PAGE) {
    return LOGIN_PAGE;
  }
  return `${LOGIN_PAGE}?redirect=${encodeURIComponent(normalizedTarget)}`;
}

/**
 * Navigate unauthenticated users to the login/activation page.
 *
 * @param {object} options Redirect options.
 * @param {string} options.targetUrl Route to return to after login.
 * @param {boolean} options.viaTab Whether the guard was triggered from a tab page.
 * @returns {boolean} Always false so callers can short-circuit.
 */
function redirectToLogin(options) {
  const config = options || {};
  const targetUrl = config.targetUrl || currentRouteUrl() || HOME_PAGE;
  const loginUrl = buildLoginUrl(targetUrl);
  if (config.viaTab) {
    wx.navigateTo({ url: loginUrl });
  } else {
    wx.redirectTo({ url: loginUrl });
  }
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
  return redirectToLogin(options);
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
  HOME_PAGE,
  LOGIN_PAGE,
  buildLoginUrl,
  currentRouteUrl,
  ensureLoggedIn,
  guardAction,
  guardPage,
  isLoggedIn,
  isTabPage,
  normalizeUrl,
  redirectToLogin,
};
