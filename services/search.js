const { request } = require('./api-client');

function search(options) {
  const requestOptions = options || {};
  const type = String(requestOptions.type || 'people');
  const keyword = String(requestOptions.keyword || '').trim();
  const limit = Number(requestOptions.limit || 20);
  const offset = Number(requestOptions.offset || 0);
  const seed = String(requestOptions.seed || '').trim();
  const seedQuery = seed ? `&seed=${encodeURIComponent(seed)}` : '';
  return request({
    path: `/api/search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(keyword)}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}${seedQuery}`,
    maxAgeMs: 0,
    forceRefresh: true,
  });
}

module.exports = {
  search,
};
