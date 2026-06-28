const DEFAULT_AVATAR_URL = '/assets/ui/jlm.jpg';

function resolveAvatarUrl(value) {
  return String(value || '').trim() || DEFAULT_AVATAR_URL;
}

module.exports = {
  DEFAULT_AVATAR_URL,
  resolveAvatarUrl,
};
