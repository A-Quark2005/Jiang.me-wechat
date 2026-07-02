const service = require('../../../services/meeting-entitlements');
const contactDeposit = require('../../../services/contact-deposit');
const displayFormatters = require('../../../services/display-formatters');
const loginGuard = require('../../../services/login-guard');

function statusTextOf(item) {
  return String(item.status || item.orderStatus || '').toLowerCase();
}

function statusMetaOf(item) {
  const contactDeposit = contactDepositOf(item);
  if (contactDeposit) {
    return {
      title: contactDeposit.statusText || '--',
      className: contactDeposit.statusClassName || 'detail-status-pending',
      description: contactDeposit.descriptionText || '',
    };
  }
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

function isContactDepositOrder(item) {
  return Boolean(contactDepositOf(item)) || String(item && item.sourceType || '').toLowerCase() === 'contact_deposit';
}

function contactDepositOf(item) {
  return item && item.contactDeposit ? item.contactDeposit : null;
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
  if (isContactDepositOrder(item)) {
    return '试讲定金';
  }
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
  const contactDeposit = contactDepositOf(item);
  if (contactDeposit) {
    const paidAt = item.paidAt ? formatDateTimeText(item.paidAt, '--') : '--';
    return [
      { label: '订单编号', value: item.id || '--', copyable: true },
      { label: '订单状态', value: contactDeposit.statusText || '--' },
      { label: '支付金额', value: amountTextOf(item) },
      { label: '支付渠道', value: '微信支付' },
      { label: '支付时间', value: paidAt },
      { label: '用途说明', value: '抵扣 2 小时试讲服务' },
    ];
  }
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
  const contactDeposit = contactDepositOf(order);
  const refundRequest = contactDeposit && contactDeposit.refundRequest ? contactDeposit.refundRequest : null;
  const trialCompletionConfirmed = Boolean(contactDeposit && contactDeposit.trialCompleted);
  const autoSettlementText = buildAutoSettlementText(order);
  return {
    order,
    isContactDeposit: isContactDepositOrder(order),
    trialCompletionConfirmed,
    titleText: titleOf(order),
    amountText: amountTextOf(order),
    statusText: statusMeta.title,
    statusClassName: statusMeta.className,
    statusDescriptionText: statusMeta.description,
    autoSettlementText,
    showAutoSettlementText: Boolean(autoSettlementText),
    facts: buildFacts(order),
    timeline: buildTimeline(order),
    canConfirmTrialCompletion: Boolean(contactDeposit && contactDeposit.canConfirmCompletion),
    refundInfo: contactDeposit || null,
    canRequestRefund: Boolean(contactDeposit && contactDeposit.canRequestRefund),
    hasRefundRequest: Boolean(refundRequest),
    refundStatusText: refundRequest ? refundRequest.statusText : '',
    refundReasonText: refundRequest && refundRequest.reason ? refundRequest.reason : '',
    refundReviewerNote: refundRequest && refundRequest.reviewerNote ? refundRequest.reviewerNote : '',
  };
}

function buildAutoSettlementText(order) {
  const contactDeposit = contactDepositOf(order);
  const autoSettlementAt = String(contactDeposit && contactDeposit.autoSettlementAt || '').trim();
  if (!autoSettlementAt) return '';
  const timestamp = Date.parse(autoSettlementAt);
  if (!Number.isFinite(timestamp)) return '';
  const remainingMs = timestamp - Date.now();
  if (remainingMs <= 0) return '已到自动结算时间，平台将尽快完成结算。';
  const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
  const days = Math.floor(remainingHours / 24);
  const hours = remainingHours % 24;
  const remainingText = days > 0
    ? `${days}天${hours > 0 ? `${hours}小时` : ''}`
    : `${hours || 1}小时`;
  const dateText = formatDateTimeText(autoSettlementAt, '');
  return `${remainingText}后自动完成结算${dateText ? `（预计 ${dateText}）` : ''}`;
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    errorMessage: '',
    orderId: '',
    order: null,
    titleText: '订单详情',
    amountText: '--',
    statusText: '',
    statusClassName: '',
    statusDescriptionText: '',
    autoSettlementText: '',
    showAutoSettlementText: false,
    facts: [],
    timeline: [],
    isContactDeposit: false,
    canConfirmTrialCompletion: false,
    confirmingTrialCompletion: false,
    trialCompletionConfirmed: false,
    refundInfo: null,
    canRequestRefund: false,
    hasRefundRequest: false,
    afterSaleExpanded: false,
    refundStatusText: '',
    refundReasonText: '',
    refundReviewerNote: '',
  },

  onLoad(options) {
    if (!loginGuard.guardPage('/pages/orders/detail/index', { requireRegistration: true })) {
      return;
    }
    const orderId = decodeURIComponent((options && options.id) || '');
    this.setData({ orderId });
    this.loadDetail();
  },

  onShow() {
    loginGuard.guardPage('/pages/orders/detail/index', { requireRegistration: true });
    if (this.data.orderId && this.data.hasLoaded) {
      this.loadDetail();
    }
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
        hasLoaded: true,
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

  toggleAfterSale() {
    if (!this.data.isContactDeposit) return;
    this.setData({ afterSaleExpanded: !this.data.afterSaleExpanded });
  },

  openRefundRequest() {
    if (!this.data.canRequestRefund || !this.data.orderId) {
      return;
    }
    wx.navigateTo({
      url: `/pages/orders/refund-request/index?id=${encodeURIComponent(this.data.orderId)}`,
    });
  },

  confirmTrialCompletion() {
    if (!this.data.canConfirmTrialCompletion || this.data.confirmingTrialCompletion) return;
    wx.showModal({
      title: '确认完成试讲',
      content: '确认后，此单试讲定金将结束冻结并完成结算；如已有退款申请，也会自动关闭。',
      confirmText: '确认完成',
      cancelText: '再想想',
      success: async (result) => {
        if (!result.confirm) return;
        this.setData({ confirmingTrialCompletion: true });
        try {
          await contactDeposit.confirmTrialCompletion(this.data.orderId);
          wx.showToast({ title: '已确认完成', icon: 'success' });
          await this.loadDetail();
        } catch (error) {
          wx.showModal({
            title: '确认失败',
            content: error && error.message ? error.message : '请稍后重试',
            showCancel: false,
          });
        } finally {
          this.setData({ confirmingTrialCompletion: false });
        }
      },
    });
  },
});
