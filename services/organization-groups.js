const GROUPS = [
  { key: 'all', label: '全部' },
  { key: 'platform', label: '平台/企业' },
  { key: 'school', label: '高校' },
];

const DEFAULT_GROUP_KEY = GROUPS[0].key;

function listFrom(raw) {
  return Array.isArray(raw) ? raw : (raw && raw.items) || [];
}

function normalizeOrganization(item, extras) {
  const name = String(item && item.name ? item.name : '').trim() || '认证组织';
  const domains = Array.isArray(item && item.emailDomains) ? item.emailDomains : [];
  const typeLabel = String((item && (item.typeLabel || item.type_label)) || '').trim();
  return {
    ...item,
    ...(extras || {}),
    name,
    typeLabel,
    typeLabelText: typeLabel,
    groupKey: groupKeyOf(typeLabel),
    initial: name.slice(0, 1),
    description: item && item.description ? item.description : '查看已通过该组织认证的人',
    domainText: domains.length ? domains.map((domain) => `@${domain}`).join('、') : '',
  };
}

function normalizeOrganizations(raw, mapExtras) {
  return listFrom(raw).map((item) => normalizeOrganization(item, mapExtras ? mapExtras(item) : null));
}

function decorateGroups(activeKey) {
  const key = activeKey || DEFAULT_GROUP_KEY;
  return GROUPS.map((item) => ({
    ...item,
    className: item.key === key ? 'segment-chip-active' : '',
  }));
}

function filterOrganizations(items, groupKey) {
  const key = groupKey || DEFAULT_GROUP_KEY;
  if (key === 'all') return items || [];
  return (items || []).filter((item) => item.groupKey === key);
}

function groupKeyOf(typeLabel) {
  const value = String(typeLabel || '').trim();
  if (value.indexOf('大学') >= 0 || value.indexOf('高校') >= 0 || value.indexOf('学校') >= 0 || value.indexOf('学院') >= 0) {
    return 'school';
  }
  if (value.indexOf('互联网') >= 0 || value.indexOf('企业') >= 0 || value.indexOf('平台') >= 0 || value.indexOf('公司') >= 0) {
    return 'platform';
  }
  return 'platform';
}

module.exports = {
  DEFAULT_GROUP_KEY,
  GROUPS,
  decorateGroups,
  filterOrganizations,
  normalizeOrganization,
  normalizeOrganizations,
};
