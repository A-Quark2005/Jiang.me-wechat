const service = require('../../services/meeting-entitlements');
const refreshState = require('../../services/refresh-state');
const displayFormatters = require('../../services/display-formatters');
const loginGuard = require('../../services/login-guard');
const avatar = require('../../services/avatar');

const PAGE_KEY = 'orders';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;
const MEETING_SOURCE_TYPES = ['hour_pass', 'single', 'duration', 'recording_pack'];
const CONTACT_DEPOSIT_SOURCE_TYPES = ['contact_deposit'];
const REFERRAL_TAB = 'referral_commission';

function normalizeList(raw) {
  if (Array.isArray(raw)) return raw;
  return (raw && (raw.items || raw.orders || raw.paymentOrders)) || [];
}

function statusTextOf(item) {
  return String(item.status || item.orderStatus || '').toLowerCase();
}

function entitlementStatusOf(item) {
  return String(
    item.entitlementStatus ||
      (item.entitlement && item.entitlement.status) ||
      '',
  ).toLowerCase();
}

function entitlementExpiresAtOf(item) {
  return (
    item.entitlementExpiresAt ||
    item.expiresAt ||
    item.validUntil ||
    (item.entitlement && (item.entitlement.expiresAt || item.entitlement.validUntil)) ||
    ''
  );
}

function isExpiredEntitlement(item) {
  const entitlementStatus = entitlementStatusOf(item);
  if (['expired', 'used', 'cancelled', 'canceled'].includes(entitlementStatus)) {
    return true;
  }
  const expiresAt = entitlementExpiresAtOf(item);
  if (!expiresAt) {
    return false;
  }
  const timestamp = Date.parse(expiresAt);
  return Number.isFinite(timestamp) && timestamp < Date.now();
}

/**
 * Normalize price fields into fixed unit/value fragments for card rendering.
 *
 * @param {object} item Order item.
 * @returns {{amountUnitText: string, amountValueText: string}} Split price fragments.
 */
function buildAmountFragments(item) {
  const product = item.extraData && item.extraData.product ? item.extraData.product : null;
  const raw = String(
    item.amountText ||
      (product && product.priceText) ||
      item.amount ||
      '',
  ).trim();
  const normalized = raw.replace(/^[¥￥]\s*/, '');
  return {
    amountUnitText: '¥',
    amountValueText: normalized || '--',
  };
}

function normalizeOrder(item) {
  const expired = isExpiredEntitlement(item);
  const sourceType = String(item.sourceType || '').toLowerCase();
  const contactDeposit = item.contactDeposit || null;
  const target = contactDeposit && contactDeposit.target ? contactDeposit.target : {};
  const contactDepositAvatarUrl = sourceType === 'contact_deposit'
    ? avatar.resolveAvatarUrl(target.avatarUrl)
    : '';
  const friendlyTitle =
    sourceType === 'contact_deposit' ? '试讲定金' :
    (item.extraData && item.extraData.product && item.extraData.product.name) ||
    (item.extraData && item.extraData.product && item.extraData.product.title) ||
    displayFormatters.normalizeMeetingProductTitle(item.productName) ||
    displayFormatters.normalizeMeetingProductTitle(item.title) ||
    displayFormatters.normalizeMeetingProductTitle(item.sourceId) ||
    displayFormatters.normalizeMeetingProductTitle(item.sourceType) ||
    '支付订单';
  const timeText =
    displayFormatters.formatDateText(item.createdAt || item.submittedAt, {
      fallback: '暂无创建时间',
    }) || '暂无创建时间';
  return {
    ...item,
    ...buildAmountFragments(item),
    statusText: statusTextOf(item),
    entitlementStatusText: entitlementStatusOf(item),
    entitlementExpired: expired,
    isExpired: expired,
    iconClass: expired ? 'ticket-icon-expired' : '',
    usesAvatarIcon: sourceType === 'contact_deposit',
    avatarIconUrl: contactDepositAvatarUrl,
    statusClass: expired ? 'order-status-expired' : '',
    titleText: friendlyTitle,
    timeText,
    statusDisplayText: sourceType === 'contact_deposit'
      ? (contactDeposit && contactDeposit.statusText ? contactDeposit.statusText : '--')
      : displayFormatters.normalizeOrderStatusText(item.status || item.orderStatus),
    chevronText: '›',
  };
}

function splitMoneyText(value) {
  const raw = String(value || '').trim().replace(/^¥\s*/, '');
  return {
    amountUnitText: '¥',
    amountValueText: raw || '--',
  };
}

function normalizeReferralCommission(item) {
  const target = item && item.target ? item.target : {};
  const demand = item && item.demand ? item.demand : {};
  const trial = item && item.trial ? item.trial : {};
  const money = splitMoneyText(item.commissionText);
  const timeText = displayFormatters.formatDateText(
    item.settledAt || item.payableAt || item.createdAt,
    { fallback: '暂无时间' },
  ) || '暂无时间';
  const title = demand.title || '需求转介绍';
  const subtitleParts = [];
  if (target.displayName) subtitleParts.push(`被选中：${target.displayName}`);
  if (item.payableAt && item.status !== 'paid') {
    subtitleParts.push(`预计结算：${displayFormatters.formatDateText(item.payableAt, { includeTime: true })}`);
  }
  if (trial.completed) subtitleParts.push('试课已完成');
  return {
    id: `referral-${item.id}`,
    rawId: item.id,
    isReferralCommission: true,
    titleText: title,
    timeText,
    statusDisplayText: item.statusText || '--',
    statusClass: item.status === 'paid' ? '' : 'order-status-pending',
    iconClass: '',
    usesAvatarIcon: true,
    avatarIconUrl: avatar.resolveAvatarUrl(target.avatarUrl),
    chevronText: '',
    amountUnitText: money.amountUnitText,
    amountValueText: money.amountValueText,
    referralSubtitleText: subtitleParts.join(' · '),
  };
}

function cachedOrdersPage() {
  return wx.getStorageSync('jiangleme.page.orders.summary.v2') || null;
}

function saveCachedOrdersPage(payload) {
  wx.setStorageSync('jiangleme.page.orders.summary.v2', {
    savedAt: Date.now(),
    data: payload,
  });
}

function recentCache(record, maxAgeMs) {
  if (!record || typeof record !== 'object') return null;
  const savedAt = Number(record.savedAt || 0);
  if (!savedAt || Date.now() - savedAt > maxAgeMs) return null;
  return record.data || null;
}

function tabClassState(activeTab) {
  return {
    activeMeetingTabClass: activeTab === 'meeting' ? 'tab-chip-active' : 'muted-chip',
    activeContactDepositTabClass: activeTab === 'contact_deposit' ? 'tab-chip-active' : 'muted-chip',
    activeReferralTabClass: activeTab === REFERRAL_TAB ? 'tab-chip-active' : 'muted-chip',
  };
}

function orderBelongsToTab(item, tab) {
  if (tab === REFERRAL_TAB) {
    return Boolean(item.isReferralCommission);
  }
  if (item.isReferralCommission) {
    return false;
  }
  const sourceType = String(item.sourceType || '').toLowerCase();
  if (tab === 'contact_deposit') {
    return CONTACT_DEPOSIT_SOURCE_TYPES.includes(sourceType);
  }
  return MEETING_SOURCE_TYPES.includes(sourceType);
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    errorMessage: '',
    activeTab: 'meeting',
    ...tabClassState('meeting'),
    orders: [],
    visibleOrders: [],
  },

  onLoad() {
    const cached = recentCache(cachedOrdersPage(), CACHE_MAX_AGE_MS);
    if (cached) {
      this.setData({
        loading: false,
        hasLoaded: true,
        errorMessage: '',
        ...cached,
        ...tabClassState(cached.activeTab || 'meeting'),
      });
    }
  },

  onShow() {
    if (!loginGuard.guardPage('/pages/orders/index', { requireRegistration: true })) {
      return;
    }
    if (!this.data.hasLoaded || refreshState.consume(PAGE_KEY) || refreshState.isExpired(PAGE_KEY, CACHE_MAX_AGE_MS)) {
      this.loadOrders(true);
    }
  },

  async loadOrders(forceRefresh) {
    if (!this.data.hasLoaded) {
      this.setData({ loading: true, errorMessage: '' });
    } else {
      this.setData({ errorMessage: '' });
    }
    try {
      const [raw, referralRaw] = await Promise.all([
        service.getOrders({ forceRefresh }),
        service.getReferralCommissions({ forceRefresh }),
      ]);
      const orders = normalizeList(raw).map(normalizeOrder);
      const referralCommissions = normalizeList(referralRaw).map(normalizeReferralCommission);
      const allOrders = orders.concat(referralCommissions);
      this.setData({ loading: false, hasLoaded: true, orders: allOrders }, () => {
        this.applyFilter();
        saveCachedOrdersPage({
          activeTab: this.data.activeTab,
          orders: this.data.orders,
          visibleOrders: this.data.visibleOrders,
        });
      });
      refreshState.touch(PAGE_KEY);
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '订单加载失败',
      });
    }
  },

  goBack() {
    wx.navigateBack({
      fail() {
        wx.switchTab({ url: '/pages/meeting_entitlements/index' });
      },
    });
  },

  switchTab(event) {
    const activeTab = event.currentTarget.dataset.tab || 'meeting';
    this.setData({
      activeTab,
      ...tabClassState(activeTab),
    }, () => this.applyFilter());
  },

  applyFilter() {
    const tab = this.data.activeTab;
    const visibleOrders = this.data.orders.filter((item) => orderBelongsToTab(item, tab));
    this.setData({ visibleOrders });
  },

  openDetail(event) {
    const orderId = String(event.currentTarget.dataset.id || '');
    if (!orderId) {
      return;
    }
    const item = this.data.visibleOrders.find((order) => String(order.id) === orderId);
    if (item && item.isReferralCommission) {
      return;
    }
    wx.navigateTo({
      url: `/pages/orders/detail/index?id=${encodeURIComponent(orderId)}`,
    });
  },

  previewAvatar(event) {
    avatar.previewAvatar(event.currentTarget.dataset.url);
  },
});
