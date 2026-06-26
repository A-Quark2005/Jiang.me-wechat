const demands = require('../../services/demands');
const loginGuard = require('../../services/login-guard');
const refreshState = require('../../services/refresh-state');
const share = require('../../services/share');

const SHARE_CANVAS_ID = 'demandShareCanvas';
const SHARE_IMAGE_WIDTH = 500;
const SHARE_IMAGE_HEIGHT = 400;

Page({
  data: {
    id: '',
    demand: null,
    expandedApplicationId: '',
    shareImagePath: '',
    loading: true,
    errorMessage: '',
    operating: false,
  },

  onLoad(options) {
    if (!loginGuard.guardPage('/pages/demands/detail', { requireRegistration: true })) return;
    const id = decodeURIComponent(options.id || '');
    this.setData({ id });
    this.loadDemand(true);
  },

  onPullDownRefresh() {
    this.loadDemand(true).finally(() => wx.stopPullDownRefresh());
  },

  async loadDemand(forceRefresh) {
    if (!this.data.id) return;
    this.setData({ loading: true, errorMessage: '' });
    try {
      const demand = await demands.getDemand(this.data.id, { forceRefresh });
      this.setData({
        demand: decorateDemand(demand, this.data.expandedApplicationId),
        loading: false,
      }, () => {
        this.prepareShareImage();
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '需求读取失败',
      });
    }
  },

  openApply() {
    wx.navigateTo({ url: `/pages/demands/apply?id=${encodeURIComponent(this.data.id)}` });
  },

  toggleApplicationDetail(event) {
    const id = String(event.currentTarget.dataset.id || '');
    const expandedApplicationId = this.data.expandedApplicationId === id ? '' : id;
    this.setData({
      expandedApplicationId,
      demand: decorateDemand(this.data.demand, expandedApplicationId),
    });
  },

  async selectApplication(event) {
    if (this.data.operating) return;
    const applicationId = String(event.currentTarget.dataset.id || '');
    if (!applicationId) return;
    const result = await confirmDialog('确认选择', '选择后将展示对方手机号，其他投递会自动标记为未选中。', {
      cancelText: '再想想',
      confirmText: '知道了',
    });
    if (!result) return;
    this.setData({ operating: true });
    try {
      const demand = await demands.selectApplication(this.data.id, applicationId);
      this.setData({
        demand: decorateDemand(demand, applicationId),
        expandedApplicationId: applicationId,
      });
      refreshState.mark(['entitlements']);
      wx.showToast({ title: '已选择', icon: 'success' });
    } catch (error) {
      wx.showModal({
        title: '选择失败',
        content: error && error.message ? error.message : '请稍后重试',
        showCancel: false,
      });
    } finally {
      this.setData({ operating: false });
    }
  },

  async cancelDemand() {
    if (this.data.operating) return;
    const confirmed = await confirmDialog('取消需求', '未选人前可取消并退款。确认取消该需求吗？');
    if (!confirmed) return;
    this.setData({ operating: true });
    try {
      const demand = await demands.cancelDemand(this.data.id);
      this.setData({
        demand: decorateDemand(demand, ''),
        expandedApplicationId: '',
      });
      refreshState.mark(['entitlements']);
      wx.showToast({ title: demand.status === 'refunded' ? '已退款' : '已取消', icon: 'success' });
    } catch (error) {
      wx.showModal({
        title: '取消失败',
        content: error && error.message ? error.message : '请稍后重试',
        showCancel: false,
      });
    } finally {
      this.setData({ operating: false });
    }
  },

  copyPhone(event) {
    const phone = String(event.currentTarget.dataset.phone || '');
    if (!phone) return;
    wx.setClipboardData({ data: phone });
  },

  showReferralRewardRule() {
    wx.showModal({
      title: '推荐奖励',
      content: '有人通过你的转发进入页面并投递简历，且最终被发单者选中后，你可获得推荐奖励。\n\n奖励会直接进入你的微信零钱。金额会根据实际支付的试讲定金计算，具体到账以微信支付分账结果为准。',
      confirmText: '知道了',
      showCancel: false,
    });
  },
  onShareAppMessage() {
    const demand = this.data.demand || {};
    return share.defaultShareAppMessage({
      title: shareTitleOf(demand),
      path: `/pages/demands/detail?id=${encodeURIComponent(this.data.id || demand.id || '')}`,
      imageUrl: this.data.shareImagePath || share.DEFAULT_IMAGE_URL,
    });
  },

  onShareTimeline() {
    const demand = this.data.demand || {};
    return share.defaultShareTimeline({
      title: shareTitleOf(demand),
      query: `id=${encodeURIComponent(this.data.id || demand.id || '')}`,
      imageUrl: this.data.shareImagePath || share.DEFAULT_IMAGE_URL,
    });
  },

  async prepareShareImage() {
    const demand = this.data.demand;
    if (!demand) return;
    try {
      const imagePath = await drawShareImage(this, demand);
      this.setData({ shareImagePath: imagePath });
    } catch {
      this.setData({ shareImagePath: '' });
    }
  },
});

function shareTitleOf(demand) {
  return `${demand.title}，${demand.feePerHourText}`;
}

function confirmDialog(title, content, options) {
  const buttonText = options || {};
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      cancelText: buttonText.cancelText || '取消',
      confirmText: buttonText.confirmText || '确定',
      success(result) {
        resolve(Boolean(result.confirm));
      },
      fail() {
        resolve(false);
      },
    });
  });
}

function decorateDemand(rawDemand, expandedApplicationId) {
  if (!rawDemand) return null;
  const applications = Array.isArray(rawDemand.applications)
    ? rawDemand.applications.map((item) => decorateApplication(item, expandedApplicationId))
    : [];
  const selectedApplication = rawDemand.selectedApplication
    ? decorateApplication(rawDemand.selectedApplication, expandedApplicationId || rawDemand.selectedApplication.id)
    : null;
  const myApplication = rawDemand.myApplication ? decorateApplication(rawDemand.myApplication, '') : null;
  const organizationNames = Array.isArray(rawDemand.organizations)
    ? rawDemand.organizations.map((item) => String(item.name || '').trim()).filter(Boolean)
    : [];
  const organizationText = organizationNames.join('、');
  const hasApplications = applications.length > 0;
  const candidateCountText = hasApplications ? `${applications.length} 位投递人` : '暂无投递';
  const isOpen = rawDemand.status === 'open';
  const isPendingPayment = rawDemand.status === 'pending_payment';
  const isPoster = Boolean(rawDemand.isPoster);
  const showCandidateList = Boolean(rawDemand.isPoster);
  const showCancelAction = Boolean(rawDemand.isPoster && (isOpen || isPendingPayment) && !rawDemand.selectedApplication);
  const showMyApplication = Boolean(myApplication && !rawDemand.isPoster);
  const showApplyControl = Boolean(!isPoster && (isOpen || showMyApplication));
  const showShareAction = Boolean(isOpen);
  const applyActionEnabled = Boolean(rawDemand.canApply);
  return {
    ...rawDemand,
    applications,
    selectedApplication,
    myApplication,
    organizationText,
    hasOrganizations: organizationNames.length > 0,
    requirementText: organizationText || '无认证要求，所有人都可以投递简历',
    hasDescription: Boolean(rawDemand.description),
    hasApplications,
    candidateCountText,
    overviewMetaText: rawDemand.isPoster
      ? `试讲定金 ${rawDemand.amountText} · ${candidateCountText}`
      : `介绍费已由对方代缴 · 2 小时免费试讲，第 3 小时起按 ${rawDemand.feePerHourText}继续付费`,
    showCandidateList,
    showSelectedContact: Boolean(rawDemand.isPoster && selectedApplication && selectedApplication.phone),
    showCancelAction,
    showBottomBar: Boolean(showApplyControl || showShareAction),
    showApplyControl,
    showShareAction,
    applyActionEnabled,
    applyActionText: applyActionEnabled ? '我想试试' : (myApplication ? myApplication.statusText : '暂不符合要求'),
    showMyApplication,
  };
}

function decorateApplication(application, expandedApplicationId) {
  const resume = application.resume || {};
  const credentials = Array.isArray(resume.credentials) ? resume.credentials.map(decorateCredential) : [];
  const engagements = Array.isArray(resume.engagements) ? resume.engagements.map(decorateEngagement) : [];
  const serviceEngagements = engagements.filter((item) => item.role === 'provider');
  const consumptionEngagements = engagements.filter((item) => item.role === 'receiver');
  const expanded = application.id === expandedApplicationId;
  const credentialCount = credentials.length;
  const engagementCount = engagements.length;
  return {
    ...application,
    expanded,
    detailButtonText: expanded ? '关闭详情' : '查看详情',
    isSelected: application.status === 'selected',
    isRejected: application.status === 'rejected',
    canSelect: application.status === 'submitted',
    showSelectAction: application.status === 'submitted',
    showMessage: Boolean(application.message),
    showPhone: Boolean(application.phoneMasked),
    summaryText: `${credentialCount} 个认证，${engagementCount} 条履历`,
    resume: {
      ...resume,
      avatarUrlResolved: resume.avatarUrl || '/assets/ui/avatar-home.svg',
      displayNameText: resume.displayName || '未命名用户',
      selfIntroductionText: resume.selfIntroduction || '暂无自我介绍',
      credentials,
      serviceEngagements,
      consumptionEngagements,
      hasCredentials: credentialCount > 0,
      hasServiceEngagements: serviceEngagements.length > 0,
      hasConsumptionEngagements: consumptionEngagements.length > 0,
    },
  };
}

function decorateCredential(item) {
  return {
    ...item,
    titleText: item.title || item.organizationName || '',
    metaText: item.emailMasked || item.typeLabel || '',
  };
}

function decorateEngagement(item) {
  const role = item.role === 'receiver' ? 'receiver' : 'provider';
  return {
    ...item,
    role,
    titleText: item.title || '服务履历',
    metaText: [item.counterpartName, item.confirmedAt ? String(item.confirmedAt).slice(0, 10) : ''].filter(Boolean).join(' · '),
    descriptionText: item.description || '',
  };
}

function drawShareImage(page, demand) {
  return new Promise((resolve, reject) => {
    const ctx = wx.createCanvasContext(SHARE_CANVAS_ID, page);
    ctx.setFillStyle('#f7f8fa');
    ctx.fillRect(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);
    drawRoundRect(ctx, 30, 30, 440, 340, 24, '#ffffff');
    ctx.setFillStyle('#0071fe');
    ctx.fillRect(30, 30, 440, 10);
    ctx.setFillStyle('#0071fe');
    ctx.setFontSize(22);
    ctx.fillText('主动发单', 58, 82);
    ctx.setFillStyle('#111827');
    ctx.setFontSize(32);
    drawWrappedText(ctx, demand.title, 58, 128, 384, 40, 2);
    ctx.setFillStyle('#0071fe');
    ctx.setFontSize(24);
    ctx.fillText(`${demand.feePerHourText}  定金 ${demand.amountText}`, 58, 218);
    ctx.setFillStyle('#4b5563');
    ctx.setFontSize(20);
    drawWrappedText(ctx, demand.requirementText || '无认证要求，所有人都可以投递简历', 58, 260, 384, 30, 2);
    ctx.setFillStyle('#9ca3af');
    ctx.setFontSize(18);
    ctx.fillText('讲了么——腾讯会议，会开会', 58, 338);
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

function ellipsis(text, maxLength) {
  const value = String(text || '');
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
