const auth = require('./auth');
const refreshState = require('./refresh-state');

function isPhoneRequiredError(error) {
  const code = error && error.code ? String(error.code) : '';
  if (code === 'phone_required') return true;
  const message = error && error.message ? String(error.message) : '';
  return message.includes('绑定手机号') || message.includes('授权手机号');
}

function phoneCodeFromEvent(event) {
  const detail = event && event.detail ? event.detail : {};
  if (detail.errMsg && !String(detail.errMsg).includes('ok')) {
    throw new Error('需要授权手机号后才能继续');
  }
  const phoneCode = detail.code || '';
  if (!phoneCode) {
    throw new Error('未获取到手机号授权信息，请重试');
  }
  return phoneCode;
}

async function bindFromEvent(event) {
  const phoneCode = phoneCodeFromEvent(event);
  const result = await auth.bindPhoneWithCode(phoneCode);
  refreshState.mark(['home', 'resume', 'credentials', 'entitlements']);
  return result;
}

module.exports = {
  bindFromEvent,
  isPhoneRequiredError,
};
