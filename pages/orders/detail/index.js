const service = require('../../../services/meeting-entitlements');
const displayFormatters = require('../../../services/display-formatters');
const loginGuard = require('../../../services/login-guard');

function statusTextOf(item) {
  return String(item.status || item.orderStatus || '').toLowerCase();
}

function statusMetaOf(item) {
  const statusText = statusTextOf(item);
  if (['paid', 'completed', 'success', 'succeeded', 'active'].includes(statusText)) {
    return {
      title: '支付成功',
      className: 'detail-status-success',
      description: '权益已生效，可直接在首页或权益页查看。',
    };
  }
  if (['pending', 'created', 'processing', 'unpaid'].includes(statusText)) {
    return {
      title: '等待支付',
      className: 'detail-status-pending',
      description: '订单已创建，等待微信支付完成确认。',
    };
  }
  return {
    title: '订单已失效',
    className: 'detail-status-expired',
    description: '该订单当前不可继续使用，可重新购买新的权益。',
  };
}

function formatDateTimeWithSeconds(value, fallback) {
  return displayFormatters.formatDateText(value, {
    includeTime: true,
    fallback: fallback || '',
  });
}

function formatDateTimeText(value, fallback) {
  const raw = formatDateTimeWithSeconds(value, fallback);
  if (!raw) {
    return fallback || '';
  }
  if (/^\d{4}年\d{2}月\d{2}日 \d{2}:\d{2}$/.test(raw)) {
    return `${raw}:00`;
  }
  return raw;
}

function resolveDerivedExpiresAt(item) {
  const product = item.extraData && item.extraData.product ? item.extraData.product : null;
  const purchaseOptions = item.extraData && item.extraData.purchaseOptions ? item.extraData.purchaseOptions : null;
  const paidAt = item.paidAt || item.createdAt || item.submittedAt || '';
  if (!paidAt || !product) {
    return '';
  }
  const baseTimestamp = Date.parse(paidAt);
  if (Number.isNaN(baseTimestamp)) {
    return '';
  }
  const requestedHours = Number(purchaseOptions && purchaseOptions.hours ? purchaseOptions.hours : 0);
  if (requestedHours > 0) {
    return new Date(baseTimestamp + requestedHours * 60 * 60 * 1000).toISOString();
  }
  const durationHours = Number(product.durationHours || 0);
  if (durationHours > 0) {
    return new Date(baseTimestamp + durationHours * 60 * 60 * 1000).toISOString();
  }
  const durationDays = Number(product.durationDays || 0);
  if (durationDays > 0) {
    return new Date(baseTimestamp + durationDays * 24 * 60 * 60 * 1000).toISOString();
  }
  return '';
}

function amountTextOf(item) {
  const product = item.extraData && item.extraData.product ? item.extraData.product : null;
  const raw = String(
    item.amountText ||
    (product && product.priceText) ||
    item.amount ||
    '',
  ).trim();
  if (!raw) {
    return '--';
  }
  return raw.startsWith('¥') || raw.startsWith('￥') ? raw : `¥${raw}`;
}

function titleOf(item) {
  return (
    (item.extraData && item.extraData.product && item.extraData.product.name) ||
    (item.extraData && item.extraData.product && item.extraData.product.title) ||
    displayFormatters.normalizeMeetingProductTitle(item.productName) ||
    displayFormatters.normalizeMeetingProductTitle(item.title) ||
    displayFormatters.normalizeMeetingProductTitle(item.sourceId) ||
    displayFormatters.normalizeMeetingProductTitle(item.sourceType) ||
    '支付订单'
  );
}

function buildTimeline(item) {
  const lines = [];
  const createdAt = formatDateTimeText(item.createdAt || item.submittedAt, '');
  const paidAt = formatDateTimeText(item.paidAt, '');
  const transactionId =
    (item.extraData && (item.extraData.wechatPayTransactionId || item.extraData.transactionId)) || '';
  if (createdAt) {
    lines.push({ label: '创建时间', value: createdAt });
  }
  if (paidAt) {
    lines.push({ label: '支付时间', value: paidAt });
  }
  if (transactionId) {
    lines.push({ label: '微信流水号', value: String(transactionId) });
  }
  return lines;
}

function buildFacts(item) {
  const product = item.extraData && item.extraData.product ? item.extraData.product : null;
  const purchaseOptions = item.extraData && item.extraData.purchaseOptions ? item.extraData.purchaseOptions : null;
  const effectiveStartAt = item.paidAt || item.createdAt || item.submittedAt || '';
  const expiresAt =
    item.expiresAt ||
    (item.extraData && (item.extraData.expiresAt || item.extraData.validUntil)) ||
    resolveDerivedExpiresAt(item) ||
    '';
  const facts = [
    { label: '订单编号', value: item.id || '--', copyable: true },
    { label: '订单状态', value: displayFormatters.normalizeOrderStatusText(item.status || item.orderStatus) },
    { label: '支付金额', value: amountTextOf(item) },
    { label: '支付渠道', value: '微信支付' },
    { label: '生效开始时间', value: formatDateTimeText(effectiveStartAt, '--') },
    { label: '过期时间', value: formatDateTimeText(expiresAt, '--') },
  ];
  if (product && product.id) {
    facts.push({ label: '商品编号', value: product.id, copyable: true });
  }
  if (item.sourceType) {
    facts.push({ label: '订单类型', value: displayFormatters.normalizeMeetingProductTitle(item.sourceType) || item.sourceType });
  }
  if (purchaseOptions && purchaseOptions.hours) {
    facts.push({ label: '购买时长', value: `${purchaseOptions.hours}小时` });
  }
  if (product && product.durationDays) {
    facts.push({ label: '权益周期', value: `${product.durationDays}天` });
  }
  if (product && product.description) {
    facts.push({ label: '权益说明', value: product.description });
  }
  return facts;
}

function buildPageState(order) {
  const statusMeta = statusMetaOf(order);
  return {
    order,
    titleText: titleOf(order),
    amountText: amountTextOf(order),
    statusText: statusMeta.title,
    statusClassName: statusMeta.className,
    statusDescriptionText: statusMeta.description,
    facts: buildFacts(order),
    timeline: buildTimeline(order),
  };
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    orderId: '',
    order: null,
    titleText: '订单详情',
    amountText: '--',
    statusText: '',
    statusClassName: '',
    statusDescriptionText: '',
    facts: [],
    timeline: [],
  },

  onLoad(options) {
    if (!loginGuard.guardPage('/pages/orders/detail/index')) {
      return;
    }
    const orderId = decodeURIComponent((options && options.id) || '');
    this.setData({ orderId });
    this.loadDetail();
  },

  onShow() {
    loginGuard.guardPage('/pages/orders/detail/index');
  },

  async loadDetail() {
    if (!this.data.orderId) {
      this.setData({
        loading: false,
        errorMessage: '缺少订单编号',
      });
      return;
    }
    this.setData({ loading: true, errorMessage: '' });
    try {
      const order = await service.getOrder(this.data.orderId);
      this.setData({
        loading: false,
        ...buildPageState(order),
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '订单详情加载失败',
      });
    }
  },

  copyField(event) {
    const value = String(event.currentTarget.dataset.value || '');
    if (!value) {
      return;
    }
    wx.setClipboardData({ data: value });
  },
});
