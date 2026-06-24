const profileService = require('../../services/profile');
const loginGuard = require('../../services/login-guard');
const paymentService = require('../../services/meeting-entitlements');
const share = require('../../services/share');
const displayFormatters = require('../../services/display-formatters');

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

function engagementSide(item) {
  const value = String(item && (item.side || item.kind) || '').toLowerCase();
  if (value.includes('provider') || value.includes('provided')) return 'provider';
  if (value.includes('receiver') || value.includes('received') || value.includes('purchased')) return 'receiver';
  return '';
}

function numberEngagements(items) {
  return items.map((item, index) => {
    const dateText = displayFormatters.formatDateText(item.confirmedAt || item.createdAt || item.startedAt, {
      includeTime: false,
    });
    return {
      ...item,
      displayNumber: index + 1,
      dateText,
      metaText: [item.counterpartName, dateText].filter(Boolean).join(' · '),
    };
  });
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
    serviceEngagements: [],
    consumptionEngagements: [],
    contactAccess: null,
    contactButtonText: '缴纳定金，认识一下',
    contactActionLoading: false,
    consultingFeeText: '',
    shareImagePath: '',
    sharePanelVisible: false,
    miniProgramCodeLoading: false,
    miniProgramCodeUrl: '',
    shareMenuText: {
      friend: '\u8f6c\u53d1\u5f53\u524d\u9875\u9762\u5230\u804a\u5929',
      code: '\u83b7\u53d6\u5f53\u524d\u9875\u9762\u5c0f\u7a0b\u5e8f\u7801',
      cancel: '\u53d6\u6d88',
    },
  },

  async onLoad(options) {
    const rawScene = String(options.scene || '').trim();
    const scene = decodeScene(rawScene);
    const directUserId = decodeURIComponent(options.id || scene.id || '');
    const directShareRef = String(options.sr || options.shareRef || '').trim().toLowerCase();
    const hasDirectShareRef = /^u_[0-9a-z]{3,30}$/.test(directShareRef);
    if (directUserId) {
      this.setData({ userId: directUserId });
      this.loadResume(true);
      return;
    }
    if (/^sc[0-9a-z]{3,30}$/i.test(rawScene)) {
      try {
        const resolved = await profileService.resolvePublicResumeMiniProgramScene(rawScene);
        const app = getApp();
        if (app && app.globalData && resolved.shareRef && !hasDirectShareRef) {
          app.globalData.sessionShareRef = String(resolved.shareRef || '').toLowerCase();
        }
        this.setData({ userId: resolved.targetUserId || '' });
        this.loadResume(true);
      } catch (error) {
        this.setData({
          loading: false,
          errorMessage: error && error.message ? error.message : '分享码无效',
        });
      }
      return;
    }
    this.setData({ loading: false, errorMessage: '资料不存在' });
  },

  async loadResume(forceRefresh) {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const resume = await profileService.getPublicResume(this.data.userId, { forceRefresh });
      const displayName = String(resume.displayName || '未命名用户').trim() || '未命名用户';
      const engagements = listFrom(resume.relatedExperiences || resume.engagements, ['items', 'engagements']);
      this.setData({
        loading: false,
        resume: {
          ...resume,
          displayName,
        },
        avatarText: displayName.slice(0, 1),
        selfIntroductionText: resume.selfIntroduction || '暂无自我介绍',
        consultingFeeText: `价格：${moneyText(resume.consultingFeeCentsPerHour)}/小时`,
        credentials: listFrom(resume.certifiedQualifications || resume.credentials, ['items', 'credentials']),
        serviceEngagements: numberEngagements(engagements.filter((item) => engagementSide(item) === 'provider')),
        consumptionEngagements: numberEngagements(engagements.filter((item) => engagementSide(item) === 'receiver')),
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
      content: `为减少对对方的打扰，平台会先收取 2 小时试讲定金。按 ${feeText}/小时计算，本次需支付 ${amountText}。\n\n支付后将展示对方（与微信号绑定的）手机号。对方会提供 2 小时试讲服务，期间无需另行付费。\n\n若试讲满意，从第 3 小时起，双方可自行交易，平台不再收取其它费用。\n\n如有录屏、AI纪要等需求，可于小程序“权益”页自行购买会议权益。`,
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

  showShareOptions() {
    this.setData({ sharePanelVisible: true });
  },

  hideShareOptions() {
    this.setData({ sharePanelVisible: false });
  },

  noop() {},

  async handleMiniProgramCode() {
    if (!loginGuard.guardPage('/pages/public_resume/index', { requireRegistration: true })) {
      return;
    }
    this.setData({ miniProgramCodeLoading: true });
    try {
      const result = await profileService.createPublicResumeMiniProgramCode(this.data.userId);
      const imageUrl = result && (result.imageUrl || result.url);
      this.setData({
        miniProgramCodeUrl: imageUrl || '',
        miniProgramCodeLoading: false,
        sharePanelVisible: false,
      });
      if (imageUrl) {
        wx.previewImage({
          urls: [imageUrl],
          current: imageUrl,
        });
      } else {
        wx.showToast({ title: '小程序码生成失败', icon: 'none' });
      }
    } catch (error) {
      this.setData({ miniProgramCodeLoading: false });
      wx.showModal({
        title: '生成失败',
        content: error && error.message ? error.message : '请稍后重试',
        showCancel: false,
      });
    }
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
    const organizationNames = (this.data.credentials || [])
      .map((item) => String(item.title || '').trim())
      .filter(Boolean)
      .filter((name, index, list) => list.indexOf(name) === index);
    return organizationNames.length
      ? `推荐你认识${displayName}（${organizationNames.join('、')}）`
      : `推荐你认识${displayName}`;
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

function decodeScene(raw) {
  const value = String(raw || '').trim();
  if (!value) return {};
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  return decoded
    .replace(/^\?/, '')
    .split('&')
    .filter(Boolean)
    .reduce((result, pair) => {
      const splitIndex = pair.indexOf('=');
      const key = splitIndex >= 0 ? pair.slice(0, splitIndex) : pair;
      const itemValue = splitIndex >= 0 ? pair.slice(splitIndex + 1) : '';
      try {
        result[decodeURIComponent(key)] = decodeURIComponent(itemValue);
      } catch {
        result[key] = itemValue;
      }
      return result;
    }, {});
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
    ctx.fillText(input.consultingFeeText || '价格：¥250.00/小时', 150, 178);
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
