const DEFAULT_TITLE = '讲了么';
const DEFAULT_PATH = '/pages/home/index';
const DEFAULT_IMAGE_URL = '/assets/ui/share-cover.jpg';
const sessionStore = require('./session-store');
const loginGuard = require('./login-guard');
let copyUrlHandlerInstalled = false;

const PAGE_SHARE_COPY = {
  '/pages/home/index': {
    title: '讲了么——腾讯会议，会开会',
    timelineTitle: '讲了么',
  },
  '/pages/meeting_activation/index': {
    title: '激活讲了么账号',
    timelineTitle: '讲了么账号服务',
  },
  '/pages/meeting_entitlements/index': {
    title: '讲了么会议权益',
    timelineTitle: '讲了么会议权益',
  },
  '/pages/meeting_hour_purchase/index': {
    title: '讲了么小时卡',
    timelineTitle: '讲了么小时卡',
  },
  '/pages/meeting_products/index': {
    title: '讲了么权益卡',
    timelineTitle: '讲了么权益卡',
  },
  '/pages/referral_invite/index': {
    title: '送你一张腾讯会议24小时会员卡，开通讲了么后即可使用',
    timelineTitle: '送你一张腾讯会议24小时会员卡',
  },
  '/pages/orders/index': {
    title: '讲了么订单',
    timelineTitle: '讲了么订单',
  },
  '/pages/resume/index': {
    title: '讲了么资料',
    timelineTitle: '讲了么资料',
  },
  '/pages/resume/credentials/index': {
    title: '讲了么认证',
    timelineTitle: '讲了么认证',
  },
  '/pages/distant_people/index': {
    title: '远方的人',
    timelineTitle: '远方的人',
  },
  '/pages/demands/index': {
    title: '讲了么——需求广场',
    timelineTitle: '讲了么需求广场',
  },
  '/pages/demands/create': {
    title: '来发布你的需求',
    timelineTitle: '发布你的需求',
  },
  '/pages/organization_members/index': {
    title: '远方的人',
    timelineTitle: '远方的人',
  },
  '/pages/public_resume/index': {
    title: '讲了么个人资料',
    timelineTitle: '讲了么个人资料',
  },
  '/pages/resume/edit_self/index': {
    title: '完善讲了么资料',
    timelineTitle: '讲了么资料',
  },
  '/pages/resume/engagements/index': {
    title: '讲了么服务履历',
    timelineTitle: '讲了么服务履历',
  },
  '/pages/resume/engagement_create/index': {
    title: '创建讲了么服务履历',
    timelineTitle: '讲了么服务履历',
  },
  '/pages/resume/engagement_detail/index': {
    title: '讲了么服务履历',
    timelineTitle: '讲了么服务履历',
  },
};

function normalizePath(path) {
  const value = String(path || '').trim();
  if (!value) return DEFAULT_PATH;
  return value.startsWith('/') ? value : `/${value}`;
}

function routeOnly(path) {
  return normalizePath(String(path || '').split('?')[0]);
}

function buildShareLandingPath(path) {
  const normalizedPath = normalizePath(path);
  if (loginGuard.isTabPage(routeOnly(normalizedPath))) return normalizedPath;
  return `${DEFAULT_PATH}?target=${encodeURIComponent(normalizedPath)}`;
}

function currentPagePath() {
  try {
    const page = getCurrentPages().slice(-1)[0];
    if (!page || !page.route) return DEFAULT_PATH;
    return normalizePath(page.route);
  } catch {
    return DEFAULT_PATH;
  }
}

function currentPageQuery() {
  try {
    const page = getCurrentPages().slice(-1)[0];
    if (!page || !page.options) return '';
    return Object.keys(page.options)
      .filter((key) => page.options[key] !== undefined && page.options[key] !== null && String(page.options[key]) !== '')
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(page.options[key]))}`)
      .join('&');
  } catch {
    return '';
  }
}

function buildCurrentPath() {
  const path = currentPagePath();
  const query = currentPageQuery();
  return query ? `${path}?${query}` : path;
}

function currentUserShareRef() {
  const record = sessionStore.getSessionRecord() || {};
  const session = record.session || {};
  const user = record.user || {};
  const value = String(user.public_id || user.publicId || user.id || session.publicId || session.userId || '').trim().toLowerCase();
  return /^u_[0-9a-z]{3,30}$/.test(value) ? value : '';
}

function setQueryParam(query, key, value) {
  const normalizedValue = String(value || '').trim();
  const parts = String(query || '').replace(/^\?/, '').split('&').filter(Boolean);
  const filtered = parts.filter((part) => {
    const splitIndex = part.indexOf('=');
    const currentKey = splitIndex >= 0 ? part.slice(0, splitIndex) : part;
    return decodeURIComponentSafe(currentKey) !== key;
  });
  if (normalizedValue) {
    filtered.push(`${encodeURIComponent(key)}=${encodeURIComponent(normalizedValue)}`);
  }
  return filtered.join('&');
}

function appendShareRefToPath(path) {
  const normalizedPath = normalizePath(path);
  const splitIndex = normalizedPath.indexOf('?');
  const route = splitIndex >= 0 ? normalizedPath.slice(0, splitIndex) : normalizedPath;
  const rawQuery = splitIndex >= 0 ? normalizedPath.slice(splitIndex + 1) : '';
  const query = setQueryParam(rawQuery, 'sr', currentUserShareRef());
  return query ? `${route}?${query}` : route;
}

function appendShareRefToQuery(query) {
  return setQueryParam(query, 'sr', currentUserShareRef());
}

function copyUrlQuery() {
  try {
    const page = getCurrentPages().slice(-1)[0];
    if (page && page.route === 'pages/public_resume/index' && page.data && page.data.userId) {
      return `id=${encodeURIComponent(String(page.data.userId))}`;
    }
    if (page && page.route === 'pages/organization_members/index' && page.data && page.data.organizationId) {
      return `id=${encodeURIComponent(String(page.data.organizationId))}`;
    }
  } catch {
    return currentPageQuery();
  }
  return currentPageQuery();
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function copyForPath(path) {
  return PAGE_SHARE_COPY[routeOnly(path)] || {};
}

function defaultShareAppMessage(options) {
  const config = options || {};
  const directPath = appendShareRefToPath(config.path || buildCurrentPath());
  const copy = copyForPath(directPath);
  return {
    title: config.title || copy.title || DEFAULT_TITLE,
    path: buildShareLandingPath(directPath),
    imageUrl: config.imageUrl || copy.imageUrl || DEFAULT_IMAGE_URL,
  };
}

function defaultShareTimeline(options) {
  const config = options || {};
  const path = config.path || currentPagePath();
  const copy = copyForPath(path);
  const query = appendShareRefToQuery(config.query || currentPageQuery() || '');
  return {
    title: config.title || copy.timelineTitle || copy.title || DEFAULT_TITLE,
    query,
    imageUrl: config.imageUrl || copy.imageUrl || DEFAULT_IMAGE_URL,
  };
}

function copyUrlShareParams() {
  return {
    query: appendShareRefToQuery(copyUrlQuery()),
  };
}

function installCopyUrlShareRef() {
  if (copyUrlHandlerInstalled) return;
  if (typeof wx === 'undefined' || typeof wx.onCopyUrl !== 'function') return;
  wx.onCopyUrl(copyUrlShareParams);
  copyUrlHandlerInstalled = true;
}

function enableShareMenu() {
  if (typeof wx === 'undefined' || typeof wx.showShareMenu !== 'function') return;
  wx.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage', 'shareTimeline'],
  });
}

function installDefaultPageShare() {
  installCopyUrlShareRef();
  const originalPage = Page;
  Page = function withDefaultShare(options) {
    const definition = options || {};
    const originalOnLoad = definition.onLoad;
    const originalOnShow = definition.onShow;
    if (!definition.onShareAppMessage) {
      definition.onShareAppMessage = function onShareAppMessage() {
        return defaultShareAppMessage();
      };
    }
    if (!definition.onShareTimeline) {
      definition.onShareTimeline = function onShareTimeline() {
        return defaultShareTimeline();
      };
    }
    definition.onLoad = function onLoadWithShare(...args) {
      enableShareMenu();
      if (typeof originalOnLoad === 'function') {
        return originalOnLoad.apply(this, args);
      }
      return undefined;
    };
    definition.onShow = function onShowWithShare(...args) {
      enableShareMenu();
      if (typeof originalOnShow === 'function') {
        return originalOnShow.apply(this, args);
      }
      return undefined;
    };
    return originalPage(definition);
  };
}

module.exports = {
  DEFAULT_IMAGE_URL,
  buildCurrentPath,
  defaultShareAppMessage,
  defaultShareTimeline,
  enableShareMenu,
  installCopyUrlShareRef,
  installDefaultPageShare,
};

