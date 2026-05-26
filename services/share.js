const DEFAULT_TITLE = '讲了么';
const DEFAULT_PATH = '/pages/home/index';
const DEFAULT_IMAGE_URL = '/assets/ui/share-cover.jpg';

const PAGE_SHARE_COPY = {
  '/pages/home/index': {
    title: '讲了么，腾讯会议，会开会',
    timelineTitle: '讲了么',
  },
  '/pages/meeting_activation/index': {
    title: '激活讲了么账号',
    timelineTitle: '讲了么账号服务',
  },
  '/pages/meeting_create/index': {
    title: '用讲了么预定腾讯会议',
    timelineTitle: '讲了么会议预定',
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
    title: '讲了么会议卡',
    timelineTitle: '讲了么会议卡',
  },
  '/pages/referral_invite/index': {
    title: '邀请好友使用讲了么',
    timelineTitle: '讲了么邀请好友',
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

function copyForPath(path) {
  return PAGE_SHARE_COPY[normalizePath(path)] || {};
}

function defaultShareAppMessage(options) {
  const config = options || {};
  const path = config.path || buildCurrentPath();
  const copy = copyForPath(path);
  return {
    title: config.title || copy.title || DEFAULT_TITLE,
    path,
    imageUrl: config.imageUrl || copy.imageUrl || DEFAULT_IMAGE_URL,
  };
}

function defaultShareTimeline(options) {
  const config = options || {};
  const path = config.path || currentPagePath();
  const copy = copyForPath(path);
  const query = String(config.query || currentPageQuery() || '').replace(/^\?/, '');
  return {
    title: config.title || copy.timelineTitle || copy.title || DEFAULT_TITLE,
    query,
    imageUrl: config.imageUrl || copy.imageUrl || DEFAULT_IMAGE_URL,
  };
}

function enableShareMenu() {
  if (typeof wx === 'undefined' || typeof wx.showShareMenu !== 'function') return;
  wx.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage', 'shareTimeline'],
  });
}

function installDefaultPageShare() {
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
  installDefaultPageShare,
};

