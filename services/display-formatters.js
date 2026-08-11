/**
 * Pad a numeric value to two digits.
 *
 * @param {number} value Numeric fragment.
 * @returns {string} Two-digit text.
 */
function pad2(value) {
  const numeric = Number(value || 0);
  return numeric < 10 ? `0${numeric}` : String(numeric);
}

/**
 * Convert a supported raw date value into a Date instance.
 *
 * @param {string|number|Date} value Raw date source.
 * @returns {Date|null} Parsed date or null when parsing fails.
 */
function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const normalized = String(value).trim();
  if (!normalized) return null;
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }
  const simpleMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!simpleMatch) return null;
  return new Date(
    Number(simpleMatch[1]),
    Number(simpleMatch[2]) - 1,
    Number(simpleMatch[3]),
    Number(simpleMatch[4] || 0),
    Number(simpleMatch[5] || 0),
  );
}

/**
 * Render a Date instance as a Chinese date label.
 *
 * @param {Date} date Parsed date object.
 * @param {boolean} includeTime Whether to include hours and minutes.
 * @returns {string} Formatted Chinese date string.
 */
function formatChineseDate(date, includeTime) {
  const base = `${date.getFullYear()}年${pad2(date.getMonth() + 1)}月${pad2(date.getDate())}日`;
  if (!includeTime) return base;
  return `${base} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/**
 * Format raw date-like text into a stable Chinese display string.
 *
 * @param {string|number|Date} value Raw date source.
 * @param {{ includeTime?: boolean, fallback?: string }} options Format options.
 * @returns {string} Display-safe date string.
 */
function formatDateText(value, options) {
  const settings = options || {};
  if (!value) return settings.fallback || '';
  const text = String(value).trim();
  if (!text) return settings.fallback || '';
  if (text.includes('年') && text.includes('月')) {
    return text;
  }
  const parsed = parseDateValue(value);
  if (!parsed) return text || settings.fallback || '';
  return formatChineseDate(parsed, settings.includeTime === true);
}

/**
 * Format a month label from a date-like source.
 *
 * @param {string|number|Date} value Raw month source.
 * @returns {string} Month label for compact list cards.
 */
function formatMonthText(value) {
  if (!value) return '暂无时间';
  const text = String(value).trim();
  if (!text) return '暂无时间';
  if (text.includes('年') && text.includes('月')) {
    const match = text.match(/(\d{4}年\d{1,2}月)/);
    return match ? match[1] : text;
  }
  const parsed = parseDateValue(value);
  if (!parsed) return text;
  return `${parsed.getFullYear()}年${pad2(parsed.getMonth() + 1)}月`;
}

/**
 * Format an engagement time range for detail cards.
 *
 * @param {object} item Engagement item.
 * @returns {string} Time range label.
 */
function formatEngagementRange(item) {
  if (!item) return '暂无时间';
  const display = item.timeText || item.startedAtText;
  if (display && String(display).includes('年') && String(display).includes('月')) {
    return String(display);
  }
  const startValue = item.startedAt || item.startAt || item.createdAt;
  const endValue = item.endedAt || item.endAt;
  const startDate = parseDateValue(startValue);
  const endDate = parseDateValue(endValue);
  if (!startDate && !display) {
    return '暂无时间';
  }
  if (startDate && endDate) {
    const sameDay =
      startDate.getFullYear() === endDate.getFullYear() &&
      startDate.getMonth() === endDate.getMonth() &&
      startDate.getDate() === endDate.getDate();
    if (sameDay) {
      return `${formatChineseDate(startDate, false)} ${pad2(startDate.getHours())}:${pad2(startDate.getMinutes())}-${pad2(endDate.getHours())}:${pad2(endDate.getMinutes())}`;
    }
    return `${formatChineseDate(startDate, true)} - ${formatChineseDate(endDate, true)}`;
  }
  if (startDate) {
    return formatChineseDate(startDate, true);
  }
  return formatDateText(display, { includeTime: true, fallback: '暂无时间' });
}

/**
 * Normalize product and order names to user-facing Chinese titles.
 *
 * @param {string} value Raw title value.
 * @returns {string} Friendly display title.
 */
function normalizeMeetingProductTitle(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text === 'tencent_meeting_entitlement_product') return '权益卡券';
  if (text === 'meeting_hour_pass') return '1小时权益卡';
  if (text === 'meeting_twelve_hour_pass') return '12小时权益卡';
  return text;
}

/**
 * Normalize raw order status values into product-facing Chinese labels.
 *
 * @param {string} value Raw backend status.
 * @returns {string} Friendly status label.
 */
function normalizeOrderStatusText(value) {
  const text = String(value || '').trim();
  const key = text.toLowerCase();
  if (!key) return '未知';
  if (['paid', 'completed', 'success', 'succeeded', 'active'].includes(key)) return '已完成';
  if (['pending', 'created', 'processing', 'unpaid'].includes(key)) return '待支付';
  if (['refund_requested', 'submitted'].includes(key)) return '退款审核中';
  if (['refunding', 'refund_approved', 'approved'].includes(key)) return '退款处理中';
  if (['refunded'].includes(key)) return '已退款';
  if (['refund_rejected', 'rejected'].includes(key)) return '退款未通过';
  if (['expired', 'invalid', 'closed', 'cancelled', 'canceled', 'failed'].includes(key)) return '已失效';
  return text;
}

/**
 * Normalize Tencent Meeting access status values into one shared Chinese label set.
 *
 * @param {string} value Raw backend activation status.
 * @returns {string} Friendly access status label.
 */
function normalizeMeetingActivationStatusText(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '待确认';
  if (text === 'active') return '已启用';
  if (text === 'pending_activation') return '待激活';
  if (text === 'inactive') return '待启用';
  if (text === 'not_registered') return '待创建';
  if (text === 'disabled') return '未启用';
  if (text === 'not_logged_in') return '暂时无法读取账号';
  return String(value || '').trim() || '待确认';
}

/**
 * Normalize phone-like text into a stable mainland-China display string.
 *
 * @param {string} value Raw phone source.
 * @param {{ masked?: boolean, fallback?: string }} options Display options.
 * @returns {string} Display-safe phone text.
 */
function formatPhoneText(value, options) {
  const settings = options || {};
  const raw = String(value || '').trim();
  if (!raw) return settings.fallback || '';
  const digits = raw.replace(/\D+/g, '');
  let normalized = raw;
  if (digits.length === 13 && digits.startsWith('86')) {
    normalized = digits.slice(2);
  } else if (digits.length === 14 && digits.startsWith('0086')) {
    normalized = digits.slice(4);
  } else if (digits.length === 11 && digits.startsWith('1')) {
    normalized = digits;
  }
  if (settings.masked && /^1\d{10}$/.test(normalized)) {
    return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
  }
  return normalized;
}

/**
 * Build one stable Tencent Meeting activation view model for page consumption.
 *
 * @param {object} activation Raw backend activation payload.
 * @returns {object} Normalized activation view model.
 */
function normalizeMeetingActivationState(activation) {
  const raw = activation || {};
  const status = String(raw.status || '').trim().toLowerCase();
  const isLoggedIn = status !== 'not_logged_in';
  const isActive = status === 'active';
  const needsPhone = Boolean(raw.needsPhone);
  const needsActivation =
    status === 'pending_activation' ||
    status === 'inactive' ||
    (!isActive && !needsPhone && Boolean(raw.needsActivation));
  const isDisabled = status === 'disabled' || raw.configured === false;
  return {
    ...raw,
    status,
    isLoggedIn,
    isActive,
    isInactive: status === 'inactive',
    isPendingActivation: status === 'pending_activation',
    isDisabled,
    needsPhone,
    needsActivation,
    statusText: normalizeMeetingActivationStatusText(status),
    configuredText: raw.configured ? '已启用' : '未启用',
    phoneText: formatPhoneText(raw.phoneMasked || raw.phone || '', {
      masked: Boolean(raw.phoneMasked || raw.needsPhone || raw.needsActivation),
      fallback: '当前暂无手机号',
    }),
    userIdText: raw.tencentMeetingUserId || '待创建',
  };
}

module.exports = {
  formatDateText,
  formatPhoneText,
  formatMonthText,
  formatEngagementRange,
  normalizeMeetingActivationState,
  normalizeMeetingActivationStatusText,
  normalizeMeetingProductTitle,
  normalizeOrderStatusText,
};
