const profileService = require('./profile');
const paymentService = require('./meeting-entitlements');

function moneyText(cents) {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`;
}

function confirmDialog(options) {
  return new Promise((resolve) => {
    wx.showModal({
      title: options.title,
      content: options.content,
      confirmText: '继续支付',
      cancelText: '取消',
      success(result) {
        resolve(Boolean(result.confirm));
      },
      fail() {
        resolve(false);
      },
    });
  });
}

function showPhone(access) {
  const phone = access && access.phone;
  if (!phone) {
    wx.showToast({ title: '暂无手机号', icon: 'none' });
    return;
  }
  wx.showModal({
    title: '联系方式',
    content: `${access.targetDisplayName || '对方'}：${phone}`,
    confirmText: '复制',
    cancelText: '关闭',
    success(result) {
      if (result.confirm) {
        wx.setClipboardData({ data: phone });
      }
    },
  });
}

async function payAndRevealContact(options) {
  const settings = options || {};
  const targetUserId = String(settings.targetUserId || '').trim();
  if (!targetUserId) {
    wx.showToast({ title: '无法读取用户', icon: 'none' });
    return null;
  }

  if (typeof settings.setLoading === 'function') settings.setLoading(true);
  try {
    let currentAccess = settings.access || null;
    if (!currentAccess || !currentAccess.amountText || !currentAccess.feePerHourText) {
      currentAccess = await profileService.getContactDepositAccess(targetUserId, { forceRefresh: true });
      if (typeof settings.onAccessChange === 'function') settings.onAccessChange(currentAccess);
    }

    if (currentAccess && currentAccess.hasPaid && currentAccess.phone) {
      showPhone(currentAccess);
      return currentAccess;
    }

    const amountText = currentAccess && currentAccess.amountText
      ? currentAccess.amountText
      : moneyText(settings.contactDepositAmountCents);
    const feeText = currentAccess && currentAccess.feePerHourText
      ? currentAccess.feePerHourText
      : moneyText(settings.consultingFeeCentsPerHour);

    const confirmed = await confirmDialog({
      title: '确认缴纳',
      content: `为减少无效打扰，平台会先收取 2 小时试讲定金。按 ${feeText}/小时计算，本次需支付 ${amountText}。\n\n支付后将展示对方微信绑定的手机号，可通过微信搜索手机号与对方建立联系。\n\n该定金可抵扣 2 小时试讲服务，期间无需另行付费。\n\n若试讲满意，从第 3 小时起，双方可自行协商后续服务，平台不再收取其它费用。`,
    });
    if (!confirmed) return null;

    const order = await profileService.createContactDepositOrder(targetUserId);
    if (order && order.hasPaid && order.phone) {
      showPhone(order);
      if (typeof settings.onAccessChange === 'function') settings.onAccessChange(order);
      return order;
    }

    await paymentService.payOrder(order);
    const synced = await profileService.syncContactDepositStatus(order.depositId || order.orderNo || order.orderId);
    if (typeof settings.onAccessChange === 'function') settings.onAccessChange(synced);
    if (synced && synced.phone) {
      showPhone(synced);
    } else {
      wx.showToast({ title: '支付确认中', icon: 'none' });
    }
    return synced;
  } catch (error) {
    if (!paymentService.isPaymentCancelled(error)) {
      wx.showModal({
        title: '操作失败',
        content: error && error.message ? error.message : '请稍后重试',
        showCancel: false,
      });
    }
    return null;
  } finally {
    if (typeof settings.setLoading === 'function') settings.setLoading(false);
  }
}

module.exports = {
  moneyText,
  payAndRevealContact,
  showPhone,
};
