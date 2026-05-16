const SESSION_KEY = 'jiangleme.mini.session';

function normalizeSession(raw) {
  const source = raw || {};
  const nested = source.session || source.authSession || source;
  return {
    accessToken: nested.accessToken || nested.token || source.accessToken || source.token || '',
    tokenType: nested.tokenType || source.tokenType || 'Bearer',
    issuedAt: nested.issuedAt || source.issuedAt || '',
    expiresAt: nested.expiresAt || source.expiresAt || '',
    userId: nested.userId || source.userId || (source.user && source.user.id) || '',
    displayName:
      nested.displayName ||
      source.displayName ||
      (source.user && source.user.displayName) ||
      (source.profile && source.profile.displayName) ||
      '',
  };
}

function saveSession(payload) {
  const session = normalizeSession(payload);
  if (!session.accessToken) {
    throw new Error('后端未返回有效登录态');
  }
  wx.setStorageSync(SESSION_KEY, {
    session,
    user: payload.user || null,
    profile: payload.profile || null,
    savedAt: new Date().toISOString(),
  });
  return session;
}

function getSessionRecord() {
  return wx.getStorageSync(SESSION_KEY) || null;
}

function getSession() {
  const record = getSessionRecord();
  return record ? record.session : null;
}

function getAccessToken() {
  const session = getSession();
  return session ? session.accessToken : '';
}

function clearSession() {
  wx.removeStorageSync(SESSION_KEY);
}

module.exports = {
  clearSession,
  getAccessToken,
  getSession,
  getSessionRecord,
  saveSession,
};
