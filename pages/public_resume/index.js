const profileService = require('../../services/profile');
const loginGuard = require('../../services/login-guard');
const paymentService = require('../../services/meeting-entitlements');
const share = require('../../services/share');

const SHARE_CANVAS_ID = 'publicResumeShareCanvas';
const SHARE_IMAGE_WIDTH = 500;
const SHARE_IMAGE_HEIGHT = 400;

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
    shareImagePath: '',
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
      this.prepareShareImage();
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

  onShareAppMessage() {
    return share.defaultShareAppMessage({
      title: this.shareTitle(),
      path: `/pages/public_resume/index?id=${encodeURIComponent(this.data.userId || '')}`,
      imageUrl: this.data.shareImagePath || share.DEFAULT_IMAGE_URL,
    });
  },

  onShareTimeline() {
    return share.defaultShareTimeline({
      title: this.shareTitle(),
      query: `id=${encodeURIComponent(this.data.userId || '')}`,
      imageUrl: this.data.shareImagePath || share.DEFAULT_IMAGE_URL,
    });
  },

  shareTitle() {
    const resume = this.data.resume || {};
    const displayName = String(resume.displayName || '').trim() || '这位朋友';
    return `推荐你认识${displayName}`;
  },

  async prepareShareImage() {
    const resume = this.data.resume;
    if (!resume) return;
    try {
      const avatarPath = await downloadImage(resume.avatarUrl);
      const imagePath = await drawShareImage(this, {
        avatarPath,
        avatarText: this.data.avatarText,
        displayName: resume.displayName,
        accountTierText: resume.accountTierText,
        consultingFeeText: this.data.consultingFeeText,
        selfIntroductionText: this.data.selfIntroductionText,
        credentials: this.data.credentials,
      });
      this.setData({ shareImagePath: imagePath });
    } catch {
      this.setData({ shareImagePath: '' });
    }
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

function downloadImage(url) {
  const value = String(url || '').trim();
  if (!/^https?:\/\//i.test(value)) return Promise.resolve('');
  return new Promise((resolve) => {
    wx.downloadFile({
      url: value,
      success(result) {
        resolve(result.statusCode >= 200 && result.statusCode < 300 ? result.tempFilePath : '');
      },
      fail() {
        resolve('');
      },
    });
  });
}

function drawShareImage(page, input) {
  return new Promise((resolve, reject) => {
    const ctx = wx.createCanvasContext(SHARE_CANVAS_ID, page);
    ctx.setFillStyle('#f7f8fa');
    ctx.fillRect(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);
    drawRoundRect(ctx, 30, 30, 440, 340, 24, '#ffffff');
    ctx.setFillStyle('#0071fe');
    ctx.fillRect(30, 30, 440, 10);
    drawAvatar(ctx, input.avatarPath, input.avatarText);
    ctx.setFillStyle('#111827');
    ctx.setFontSize(30);
    ctx.fillText(ellipsis(input.displayName || '未命名用户', 10), 150, 108);
    ctx.setFillStyle('#6b7280');
    ctx.setFontSize(19);
    ctx.fillText(input.accountTierText || '普通账号', 150, 140);
    ctx.setFillStyle('#374151');
    ctx.setFontSize(21);
    ctx.fillText(input.consultingFeeText || '咨询费：¥250.00/小时', 150, 178);
    const credential = firstCredentialText(input.credentials);
    if (credential) {
      ctx.setFillStyle('#eef5ff');
      ctx.fillRect(150, 198, 250, 36);
      ctx.setFillStyle('#0071fe');
      ctx.setFontSize(18);
      ctx.fillText(ellipsis(credential, 16), 164, 222);
    }
    ctx.setFillStyle('#4b5563');
    ctx.setFontSize(20);
    drawWrappedText(ctx, input.selfIntroductionText || '暂无自我介绍', 58, 274, 384, 30, 2);
    ctx.setFillStyle('#9ca3af');
    ctx.setFontSize(18);
    ctx.fillText('讲了么 · 腾讯会议，会开会', 58, 338);
    ctx.draw(false, () => {
      wx.canvasToTempFilePath({
        canvasId: SHARE_CANVAS_ID,
        width: SHARE_IMAGE_WIDTH,
        height: SHARE_IMAGE_HEIGHT,
        destWidth: SHARE_IMAGE_WIDTH * 2,
        destHeight: SHARE_IMAGE_HEIGHT * 2,
        success(result) {
          resolve(result.tempFilePath);
        },
        fail: reject,
      }, page);
    });
  });
}

function drawAvatar(ctx, avatarPath, avatarText) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(90, 116, 44, 0, Math.PI * 2);
  ctx.clip();
  if (avatarPath) {
    ctx.drawImage(avatarPath, 46, 72, 88, 88);
  } else {
    ctx.setFillStyle('#eef5ff');
    ctx.fillRect(46, 72, 88, 88);
    ctx.setFillStyle('#0071fe');
    ctx.setFontSize(34);
    ctx.fillText(String(avatarText || '讲').slice(0, 1), 74, 128);
  }
  ctx.restore();
}

function drawRoundRect(ctx, x, y, width, height, radius, fillStyle) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.setFillStyle(fillStyle);
  ctx.fill();
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  let line = '';
  let lineCount = 0;
  for (let index = 0; index < source.length; index += 1) {
    const next = line + source[index];
    if (ctx.measureText(next).width > maxWidth && line) {
      lineCount += 1;
      ctx.fillText(lineCount >= maxLines ? `${ellipsis(line, 18)}...` : line, x, y);
      if (lineCount >= maxLines) return;
      line = source[index];
      y += lineHeight;
    } else {
      line = next;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

function firstCredentialText(credentials) {
  const item = Array.isArray(credentials) && credentials.length ? credentials[0] : null;
  return item ? String(item.title || item.organizationName || '').trim() : '';
}

function ellipsis(text, maxLength) {
  const value = String(text || '');
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
