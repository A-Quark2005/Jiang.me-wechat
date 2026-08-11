const DEFAULT_AVATAR_URL = '/assets/ui/jlm.jpg';

function resolveAvatarUrl(value) {
  return String(value || '').trim() || DEFAULT_AVATAR_URL;
}

function previewAvatar(url) {
  const value = String(url || '').trim();
  if (!value || value === DEFAULT_AVATAR_URL) return;
  wx.previewImage({
    urls: [value],
    current: value,
  });
}

module.exports = {
  DEFAULT_AVATAR_URL,
  previewAvatar,
  resolveAvatarUrl,
};
