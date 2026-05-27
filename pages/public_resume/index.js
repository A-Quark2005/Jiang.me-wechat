const profileService = require('../../services/profile');
const loginGuard = require('../../services/login-guard');
const paymentService = require('../../services/meeting-entitlements');

function listFrom(raw, keys) {
  if (Array.isArray(raw)) return raw;
  const source = raw || {};
  for (let index = 0; index < keys.length; index += 1) {
    if (Array.isArray(source[keys[index]])) {
      return source[keys[index]];
    }
  }
  return [];
}

Page({
  data: {
    userId: '',
    loading: true,
    errorMessage: '',
    resume: null,
    avatarText: '人',
    selfIntroductionText: '暂无自我介绍',
    credentials: [],
    engagements: [],
    contactAccess: null,
    contactButtonText: '缴纳定金，认识一下',
    contactActionLoading: false,
    consultingFeeText: '',
  },

  onLoad(options) {
    const userId = decodeURIComponent(options.id || '');
    this.setData({ userId });
    this.loadResume(true);
  },

  async loadResume(forceRefresh) {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const resume = await profileService.getPublicResume(this.data.userId, { forceRefresh });
      const displayName = String(resume.displayName || '未命名用户').trim() || '未命名用户';
      this.setData({
        loading: false,
        resume: {
          ...resume,
          displayName,
        },
        avatarText: displayName.slice(0, 1),
        selfIntroductionText: resume.selfIntroduction || '暂无自我介绍',
        consultingFeeText: `咨询费：${moneyText(resume.consultingFeeCentsPerHour)}/小时`,
        credentials: listFrom(resume.certifiedQualifications || resume.credentials, ['items', 'credentials']),
        engagements: listFrom(resume.relatedExperiences || resume.engagements, ['items', 'engagements']),
      });
      this.loadContactAccess(true);
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '资料加载失败',
      });
    }
  },

  async loadContactAccess(forceRefresh) {
    if (!loginGuard.isLoggedIn || !loginGuard.isLoggedIn()) {
      this.setData({ contactAccess: null, contactButtonText: '缴纳定金，认识一下' });
      return;
    }
    try {
      const access = await profileService.getContactDepositAccess(this.data.userId, { forceRefresh });
      this.setData({
        contactAccess: access,
        contactButtonText: access && access.hasPaid ? '查看手机号' : '缴纳定金，认识一下',
      });
    } catch {
      this.setData({ contactAccess: null, contactButtonText: '缴纳定金，认识一下' });
    }
  },

  async handleContactDeposit() {
    if (!loginGuard.guardPage('/pages/public_resume/index', { requireRegistration: true })) {
      return;
    }
    const access = this.data.contactAccess;
    if (access && access.hasPaid && access.phone) {
      this.showPhone(access);
      return;
    }
    const amountText = access && access.amountText ? access.amountText : moneyText(this.data.resume && this.data.resume.contactDepositAmountCents);
    const feeText = access && access.feePerHourText
      ? access.feePerHourText
      : moneyText(this.data.resume && this.data.resume.consultingFeeCentsPerHour);
    const confirmed = await confirmDialog({
      title: '确认缴纳',
      content: `需支付 ${amountText}，按 ${feeText}/小时计算，共 2 小时。支付后将展示对方手机号。\n\n缴费后您有权要求对方提供 2 小时试讲服务，中途无需二次付费。第三个小时开始继续付费即可。`,
    });
    if (!confirmed) return;
    this.setData({ contactActionLoading: true });
    try {
      const order = await profileService.createContactDepositOrder(this.data.userId);
      if (order && order.hasPaid && order.phone) {
        this.showPhone(order);
        this.setData({ contactAccess: order, contactButtonText: '查看手机号', contactActionLoading: false });
        return;
      }
      await paymentService.payOrder(order);
      const synced = await profileService.syncContactDepositStatus(order.depositId || order.orderNo || order.orderId);
      this.setData({
        contactAccess: synced,
        contactButtonText: synced && synced.hasPaid ? '查看手机号' : '缴纳定金，认识一下',
        contactActionLoading: false,
      });
      if (synced && synced.phone) {
        this.showPhone(synced);
      } else {
        wx.showToast({ title: '支付确认中', icon: 'none' });
      }
    } catch (error) {
      this.setData({ contactActionLoading: false });
      wx.showModal({
        title: '操作失败',
        content: error && error.message ? error.message : '请稍后重试',
        showCancel: false,
      });
    }
  },

  showPhone(access) {
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
  },
});

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
