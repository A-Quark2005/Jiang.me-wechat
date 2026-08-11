const demands = require('../../services/demands');
const avatar = require('../../services/avatar');
const contactDeposit = require('../../services/contact-deposit');
const loginGuard = require('../../services/login-guard');
const refreshState = require('../../services/refresh-state');
const share = require('../../services/share');
const presenter = require('./detail.presenter');
const demandShare = require('./detail.share');

Page({
  data: {
    id: '',
    demand: null,
    expandedApplicationId: '',
    shareImagePath: '',
    loading: true,
    closing: false,
    contactTargetUserId: '',
    contactAccessByUserId: {},
    demandShareRef: '',
    errorMessage: '',
    countdownTimer: null,
  },

  onLoad(options) {
    if (!loginGuard.guardPage('/pages/demands/detail', { requireRegistration: true })) return;
    const id = decodeURIComponent(options.id || '');
    this.setData({
      id,
      demandShareRef: normalizeShareRef(options.sr || options.shareRef || ''),
    });
    this.loadDemand(true);
  },

  onPullDownRefresh() {
    this.loadDemand(true).finally(() => wx.stopPullDownRefresh());
  },

  onShow() {
    this.scheduleCountdown();
  },

  onHide() {
    this.stopCountdown();
  },

  onUnload() {
    this.stopCountdown();
  },

  async loadDemand(forceRefresh) {
    if (!this.data.id) return;
    this.setData({ loading: true, errorMessage: '' });
    try {
      const demand = await demands.getDemand(this.data.id, { forceRefresh });
      this.setData({
        demand: this.presentDemand(demand),
        loading: false,
      }, () => {
        this.scheduleCountdown();
        this.prepareShareImage();
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '需求读取失败',
      });
    }
  },

  scheduleCountdown() {
    this.stopCountdown();
    const decision = this.data.demand && this.data.demand.filledDecision;
    if (!decision || !decision.showCountdown || !decision.remainingSeconds) return;
    const countdownTimer = setInterval(() => {
      const currentDemand = this.data.demand || {};
      const currentDecision = currentDemand.filledDecision || {};
      const remainingSeconds = Math.max(0, Number(currentDecision.remainingSeconds || 0) - 1);
      const nextDemand = this.presentDemand({
        ...currentDemand,
        filledDecision: {
          ...currentDecision,
          remainingSeconds,
          showCountdown: remainingSeconds > 0,
        },
      });
      this.setData({ demand: nextDemand });
      if (remainingSeconds <= 0) {
        this.stopCountdown();
        this.loadDemand(true);
      }
    }, 1000);
    this.setData({ countdownTimer });
  },

  stopCountdown() {
    if (!this.data.countdownTimer) return;
    clearInterval(this.data.countdownTimer);
    this.setData({ countdownTimer: null });
  },

  openApply() {
    const query = [`id=${encodeURIComponent(this.data.id)}`];
    if (this.data.demandShareRef) query.push(`sr=${encodeURIComponent(this.data.demandShareRef)}`);
    wx.navigateTo({ url: `/pages/demands/apply?${query.join('&')}` });
  },

  editDemand() {
    const hasApplications = Number(this.data.demand && this.data.demand.totalApplicationCount || 0) > 0;
    if (!hasApplications) {
      this.navigateToDemandEditor('edit');
      return;
    }
    wx.showActionSheet({
      itemList: ['保留简历修改', '清空简历重新收集'],
      success: (result) => {
        const mode = result.tapIndex === 1 ? 'recollect' : 'edit';
        this.navigateToDemandEditor(mode);
      },
    });
  },

  navigateToDemandEditor(mode) {
    wx.navigateTo({ url: `/pages/demands/create?id=${encodeURIComponent(this.data.id)}&mode=${mode}` });
  },

  toggleApplicationDetail(event) {
    const id = String(event.currentTarget.dataset.id || '');
    const expandedApplicationId = this.data.expandedApplicationId === id ? '' : id;
    this.setData({
      expandedApplicationId,
      demand: this.presentDemand(this.data.demand, expandedApplicationId),
    });
  },

  previewAvatar(event) {
    avatar.previewAvatar(event.currentTarget.dataset.url);
  },

  async addCandidateFriend(event) {
    if (!loginGuard.guardPage('/pages/demands/detail', { requireRegistration: true })) return;
    const userId = String(event.currentTarget.dataset.userId || '').trim();
    const item = this.findApplicationByUserId(userId);
    if (!item || !userId) {
      wx.showToast({ title: '无法读取用户', icon: 'none' });
      return;
    }
    await contactDeposit.payAndRevealContact({
      targetUserId: userId,
      demandId: this.data.id,
      applicationId: item.id,
      contactDepositAmountCents: (this.data.demand && this.data.demand.amountCents) || 0,
      consultingFeeCentsPerHour: (this.data.demand && this.data.demand.feeCentsPerHour) || 0,
      setLoading: (loading) => this.setData({ contactTargetUserId: loading ? userId : '' }),
      onAccessChange: (access) => this.updateContactAccess(userId, access),
    });
  },

  presentDemand(demand, expandedApplicationId) {
    const currentExpandedApplicationId = typeof expandedApplicationId === 'undefined'
      ? this.data.expandedApplicationId
      : expandedApplicationId;
    return presenter.presentDemand(
      demand,
      currentExpandedApplicationId,
      this.data.contactAccessByUserId
    );
  },

  updateContactAccess(userId, access) {
    if (!access) return;
    const contactAccessByUserId = {
      ...this.data.contactAccessByUserId,
      [String(userId)]: access,
    };
    this.setData({
      contactAccessByUserId,
      demand: presenter.presentDemand(this.data.demand, this.data.expandedApplicationId, contactAccessByUserId),
    });
  },

  editMyApplicationMessage() {
    const demand = this.data.demand || {};
    if (!demand.canEditMyApplicationMessage) return;
    wx.showModal({
      title: demand.myApplicationMessageEmpty ? '补充留言' : '修改留言',
      editable: true,
      placeholderText: '简单说明你为什么适合这个需求',
      content: demand.myApplicationMessageEmpty ? '' : (demand.myApplicationMessageText || ''),
      confirmText: '保存',
      success: async (result) => {
        if (!result.confirm) return;
        const message = String(result.content || '').trim();
        try {
          const latestDemand = await demands.updateApplicationMessage(this.data.id, message);
          this.setData({
            demand: this.presentDemand(latestDemand),
          });
          wx.showToast({ title: '已保存', icon: 'success' });
        } catch (error) {
          wx.showModal({
            title: '保存失败',
            content: error && error.message ? error.message : '请稍后重试',
            showCancel: false,
          });
        }
      },
    });
  },

  findApplicationByUserId(userId) {
    const applications = this.data.demand && Array.isArray(this.data.demand.applications)
      ? this.data.demand.applications
      : [];
    return applications.find((item) => String(item.publicUserId || '') === String(userId || ''));
  },

  closeDemand() {
    if (this.data.closing) return;
    const currentDemand = this.data.demand || {};
    wx.showModal({
      title: currentDemand.closeModalTitle || '撤下需求',
      content: currentDemand.closeModalContent || '撤下后将不再出现在公域需求列表中，也不能继续接收新的简历。已投递的简历仍可在详情页查看。',
      confirmText: currentDemand.closeModalConfirmText || '撤下',
      confirmColor: '#d92d20',
      success: async (result) => {
        if (!result.confirm) return;
        this.setData({ closing: true });
        try {
          const latestDemand = await demands.closeDemand(this.data.id);
          refreshState.mark(['entitlements']);
          this.setData({
            demand: this.presentDemand(latestDemand),
            closing: false,
          });
          wx.showToast({ title: currentDemand.closeSuccessText || '已撤下', icon: 'success' });
        } catch (error) {
          this.setData({ closing: false });
          wx.showModal({
            title: currentDemand.closeFailureTitle || '撤下失败',
            content: error && error.message ? error.message : '请稍后重试',
            showCancel: false,
          });
        }
      },
    });
  },

  showReferralRewardRule() {
    const demand = this.data.demand || {};
    wx.showModal({
      title: '推荐奖励',
      content: `有人通过你的转发进入页面并投递简历，且最终被选中后，你可获得本单介绍费 ${demand.referralRewardText || '¥0.00'}。\n\n介绍费按实际支付的试讲定金 25% 计算，具体到账以微信支付分账结果为准。`,
      confirmText: '知道了',
      showCancel: false,
    });
  },

  onShareAppMessage() {
    const demand = this.data.demand || {};
    return share.defaultShareAppMessage({
      title: demandShare.titleOf(demand),
      path: `/pages/demands/detail?id=${encodeURIComponent(this.data.id || demand.id || '')}`,
      imageUrl: this.data.shareImagePath || share.DEFAULT_IMAGE_URL,
    });
  },

  onShareTimeline() {
    const demand = this.data.demand || {};
    return share.defaultShareTimeline({
      title: demandShare.titleOf(demand),
      query: `id=${encodeURIComponent(this.data.id || demand.id || '')}`,
      imageUrl: this.data.shareImagePath || share.DEFAULT_IMAGE_URL,
    });
  },

  async prepareShareImage() {
    const demand = this.data.demand;
    if (!demand) return;
    try {
      const imagePath = await demandShare.drawImage(this, demand);
      this.setData({ shareImagePath: imagePath });
    } catch {
      this.setData({ shareImagePath: '' });
    }
  },
});

function normalizeShareRef(input) {
  const value = String(input || '').trim().toLowerCase();
  return /^u_[0-9a-z]{3,30}$/.test(value) ? value : '';
}
