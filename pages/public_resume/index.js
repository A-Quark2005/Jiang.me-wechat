const profileService = require('../../services/profile');
const loginGuard = require('../../services/login-guard');
const contactDeposit = require('../../services/contact-deposit');
const share = require('../../services/share');
const displayFormatters = require('../../services/display-formatters');
const avatar = require('../../services/avatar');

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

function decorateCredentials(items) {
  return listFrom(items, ['items', 'credentials']).map((item) => {
    const organizationId = String(item.organizationId || '').trim();
    return {
      ...item,
      organizationId,
      canOpenMembers: Boolean(organizationId),
    };
  });
}

Page({
  data: {
    userId: '',
    loading: true,
    errorMessage: '',
    resume: null,
    selfIntroductionText: '暂无自我介绍',
    credentials: [],
    serviceEngagements: [],
    consumptionEngagements: [],
    contactAccess: null,
    contactButtonText: '缴纳定金，添加好友',
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
          avatarUrlResolved: avatar.resolveAvatarUrl(resume.avatarUrl),
        },
        selfIntroductionText: resume.selfIntroduction || '暂无自我介绍',
        consultingFeeText: `价格：${contactDeposit.moneyText(resume.consultingFeeCentsPerHour)}/小时`,
        credentials: decorateCredentials(resume.certifiedQualifications || resume.credentials),
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

  openOrganizationMembers(event) {
    const id = String(event.currentTarget.dataset.id || '');
    if (!id) return;
    wx.navigateTo({ url: `/pages/organization_members/index?id=${encodeURIComponent(id)}` });
  },

  async loadContactAccess(forceRefresh) {
    if (!loginGuard.isLoggedIn || !loginGuard.isLoggedIn()) {
      this.setData({ contactAccess: null, contactButtonText: '缴纳定金，添加好友' });
      return;
    }
    try {
      const access = await profileService.getContactDepositAccess(this.data.userId, { forceRefresh });
      this.setData({
        contactAccess: access,
        contactButtonText: access && access.hasPaid ? '查看手机号' : '缴纳定金，添加好友',
      });
    } catch {
      this.setData({ contactAccess: null, contactButtonText: '缴纳定金，添加好友' });
    }
  },

  async handleContactDeposit() {
    if (!loginGuard.guardPage('/pages/public_resume/index', { requireRegistration: true })) {
      return;
    }
    await contactDeposit.payAndRevealContact({
      targetUserId: this.data.userId,
      access: this.data.contactAccess,
      contactDepositAmountCents: this.data.resume && this.data.resume.contactDepositAmountCents,
      consultingFeeCentsPerHour: this.data.resume && this.data.resume.consultingFeeCentsPerHour,
      setLoading: (contactActionLoading) => this.setData({ contactActionLoading }),
      onAccessChange: (contactAccess) => {
        this.setData({
          contactAccess,
          contactButtonText: contactAccess && contactAccess.hasPaid ? '查看手机号' : '缴纳定金，添加好友',
        });
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
      const avatarPath = await resolveShareAvatarPath(resume.avatarUrl);
      const imagePath = await drawShareImage(this, {
        avatarPath,
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

function resolveShareAvatarPath(url) {
  const value = String(url || '').trim();
  if (!value) return Promise.resolve(avatar.DEFAULT_AVATAR_URL);
  return downloadImage(value).then((path) => path || avatar.DEFAULT_AVATAR_URL);
}

function drawShareImage(page, input) {
  return new Promise((resolve, reject) => {
    const ctx = wx.createCanvasContext(SHARE_CANVAS_ID, page);
    ctx.setFillStyle('#f7f8fa');
    ctx.fillRect(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);
    drawRoundRect(ctx, 30, 30, 440, 340, 24, '#ffffff');
    ctx.setFillStyle('#0071fe');
    ctx.fillRect(30, 30, 440, 10);
    drawAvatar(ctx, input.avatarPath);
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

function drawAvatar(ctx, avatarPath) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(90, 116, 44, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(avatarPath || avatar.DEFAULT_AVATAR_URL, 46, 72, 88, 88);
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
