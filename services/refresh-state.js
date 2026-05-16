const dirtyPages = {};
const loadedAt = {};

function mark(pageKeys) {
  const keys = Array.isArray(pageKeys) ? pageKeys : [pageKeys];
  keys.filter(Boolean).forEach((key) => {
    dirtyPages[key] = true;
  });
}

function consume(pageKey) {
  if (!dirtyPages[pageKey]) {
    return false;
  }
  dirtyPages[pageKey] = false;
  return true;
}

function touch(pageKey) {
  loadedAt[pageKey] = Date.now();
  dirtyPages[pageKey] = false;
}

function isExpired(pageKey, maxAgeMs) {
  const lastLoadedAt = loadedAt[pageKey] || 0;
  return !lastLoadedAt || Date.now() - lastLoadedAt > maxAgeMs;
}

module.exports = {
  consume,
  isExpired,
  mark,
  touch,
};
