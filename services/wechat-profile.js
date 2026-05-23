const PROFILE_KEY = 'jiangleme.wechat.profile';

function normalizeNickname(value) {
  const text = String(value || '').trim();
  return text && text !== '微信用户' ? text : '';
}

function normalizeAvatarUrl(value) {
  return String(value || '').trim();
}

function readProfile() {
  return wx.getStorageSync(PROFILE_KEY) || null;
}

function writeProfile(nextProfile) {
  wx.setStorageSync(PROFILE_KEY, nextProfile);
  getApp().globalData.wechatProfile = nextProfile;
  return nextProfile;
}

function getProfile() {
  const appProfile = getApp().globalData.wechatProfile;
  if (appProfile) {
    return appProfile;
  }
  const stored = readProfile();
  if (stored) {
    getApp().globalData.wechatProfile = stored;
  }
  return stored;
}

function saveNickname(value) {
  const nickname = normalizeNickname(value);
  if (!nickname) {
    return getProfile();
  }
  return writeProfile({
    ...(getProfile() || {}),
    nickname,
  });
}

function saveAvatarUrl(value) {
  const avatarUrl = normalizeAvatarUrl(value);
  if (!avatarUrl) {
    return getProfile();
  }
  return writeProfile({
    ...(getProfile() || {}),
    avatarUrl,
  });
}

module.exports = {
  getProfile,
  saveAvatarUrl,
  saveNickname,
};
