const demands = require('../../services/demands');
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
    errorMessage: '',
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
        demand: this.presentDemand(demand),
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
      contactDepositAmountCents: (item.resume && item.resume.contactDepositAmountCents) || (this.data.demand && this.data.demand.amountCents) || 0,
      consultingFeeCentsPerHour: (item.resume && item.resume.consultingFeeCentsPerHour) || (this.data.demand && this.data.demand.feeCentsPerHour) || 0,
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
    wx.showModal({
      title: '转发需求',
      content: '需求收满后会从公域列表撤下，但仍可通过分享链接访问。你可以继续转发给合适的人查看投递简历。',
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
