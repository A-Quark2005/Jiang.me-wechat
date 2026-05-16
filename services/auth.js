const { request } = require('./api-client');
const sessionStore = require('./session-store');

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(result) {
        if (result.code) {
          resolve(result.code);
          return;
        }
        reject(new Error('微信登录未返回 code'));
      },
      fail(error) {
        reject(new Error(error && error.errMsg ? error.errMsg : '微信登录失败'));
      },
    });
  });
}

async function loginWithMiniProgram() {
  const miniLoginCode = await wxLogin();
  const result = await request({
    path: '/api/auth/wechat-mini-program/login',
    method: 'POST',
    auth: false,
    data: { miniLoginCode },
  });
  if (result && result.registered && result.session) {
    sessionStore.saveSession(result);
  }
  return result;
}

async function registerWithPhoneCode(phoneCode) {
  const miniLoginCode = await wxLogin();
  const result = await request({
    path: '/api/auth/wechat-mini-program/register',
    method: 'POST',
    auth: false,
    data: {
      miniLoginCode,
      phoneCode,
    },
  });
  sessionStore.saveSession(result);
  return result;
}

function logout() {
  sessionStore.clearSession();
  wx.reLaunch({ url: '/pages/home/index' });
}

module.exports = {
  loginWithMiniProgram,
  logout,
  registerWithPhoneCode,
  wxLogin,
};
