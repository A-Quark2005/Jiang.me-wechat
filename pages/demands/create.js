const demands = require('../../services/demands');
const loginGuard = require('../../services/login-guard');
const phoneBinding = require('../../services/phone-binding');
const refreshState = require('../../services/refresh-state');
const subscribeMessage = require('../../services/subscribe-message');
const organizationGroups = require('../../services/organization-groups');

function centsToYuan(value) {
  return (Number(value || 0) / 100).toFixed(2);
}

function yuanToCents(value) {
  const text = String(value || '').replace(/[¥￥,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return NaN;
  return Math.round(Number(text) * 100);
}

Page({
  data: {
    title: '',
    description: '',
    feeCentsPerHour: 0,
    feeText: '0.00',
    organizations: [],
    visibleOrganizations: [],
    activeGroup: organizationGroups.DEFAULT_GROUP_KEY,
    groups: organizationGroups.decorateGroups(),
    hasOrganizations: false,
    selectedIds: [],
    minRequiredCents: 0,
    minRequiredText: '0.00',
    amountText: '0.00',
    applicationLimit: 1,
    applicationLimitOptions: [
      { value: 1, label: '1份', active: true },
      { value: 2, label: '2份', active: false },
      { value: 3, label: '3份', active: false },
    ],
    hasSelectedOrganizations: false,
    organizationScopeText: '所有用户都可以投递简历',
    canSubmit: false,
    settlementHint: '发布后先收集简历，添加好友时再缴纳定金',
    submitting: false,
    bindingPhone: false,
    needsPhone: false,
    loading: true,
  },

  onLoad() {
    if (!loginGuard.guardPage('/pages/demands/create', { requireRegistration: true })) return;
    this.loadOrganizations();
  },

  async loadOrganizations() {
    this.setData({ loading: true });
    try {
      const raw = await demands.listOrganizationRateRanges({ forceRefresh: true });
      const organizations = organizationGroups.normalizeOrganizations(raw, () => ({ selected: false }));
      this.setData({
        organizations,
        visibleOrganizations: organizationGroups.filterOrganizations(organizations, this.data.activeGroup),
        hasOrganizations: organizations.length > 0,
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showModal({
        title: '读取失败',
        content: error && error.message ? error.message : '组织信息读取失败',
        showCancel: false,
      });
    }
  },

  switchGroup(event) {
    const group = String(event.currentTarget.dataset.group || organizationGroups.DEFAULT_GROUP_KEY);
    this.setData({
      activeGroup: group,
      groups: organizationGroups.decorateGroups(group),
      visibleOrganizations: organizationGroups.filterOrganizations(this.data.organizations, group),
    });
  },

  clearOrganizationScope() {
    const organizations = this.data.organizations.map((item) => ({ ...item, selected: false }));
    const fee = Number(this.data.feeCentsPerHour || 0);
    this.setData({
      selectedIds: [],
      organizations,
      visibleOrganizations: organizationGroups.filterOrganizations(organizations, this.data.activeGroup),
      minRequiredCents: 0,
      minRequiredText: '0.00',
      hasSelectedOrganizations: false,
      organizationScopeText: '所有用户都可以投递简历',
      canSubmit: this.canSubmitWithFee(fee, 0),
      settlementHint: this.data.needsPhone ? '请先授权手机号后继续发布' : '发布后先收集简历，添加好友时再缴纳定金',
    });
  },

  onTitleInput(event) {
    this.setData({ title: event.detail.value });
  },

  onDescriptionInput(event) {
    this.setData({ description: event.detail.value });
  },

  selectApplicationLimit(event) {
    const value = Math.min(Math.max(Number(event.currentTarget.dataset.value || 1), 1), 3);
    this.setData({
      applicationLimit: value,
      applicationLimitOptions: this.data.applicationLimitOptions.map((item) => ({
        ...item,
        active: Number(item.value) === value,
      })),
    });
  },

  updateFee(value) {
    const min = Number(this.data.minRequiredCents || 0);
    let fee = Math.round(Number(value || 0));
    if (!Number.isFinite(fee)) fee = 0;
    if (min > 0) fee = Math.max(min, fee);
    this.setData({
      feeCentsPerHour: fee,
      feeText: centsToYuan(fee),
      amountText: centsToYuan(fee * 2),
      canSubmit: this.canSubmitWithFee(fee),
    });
  },

  editFee() {
    const hasLimit = this.data.hasSelectedOrganizations;
    wx.showModal({
      title: '手动输入时薪',
      editable: true,
      placeholderText: hasLimit ? `不低于 ¥${this.data.minRequiredText}/小时` : '请输入时薪',
      content: this.data.feeText,
      success: (result) => {
        if (!result.confirm) return;
        const value = yuanToCents(result.content);
        if (!Number.isFinite(value)) {
          wx.showToast({ title: '请输入正确的报价', icon: 'none' });
          return;
        }
        if (hasLimit && value < Number(this.data.minRequiredCents || 0)) {
          wx.showToast({ title: `不能低于 ¥${this.data.minRequiredText}/小时`, icon: 'none' });
          this.updateFee(this.data.minRequiredCents);
          return;
        }
        this.updateFee(value);
      },
    });
  },

  toggleOrganization(event) {
    const id = String(event.currentTarget.dataset.id || '');
    const selected = this.data.selectedIds.slice();
    const index = selected.indexOf(id);
    if (index >= 0) selected.splice(index, 1);
    else selected.push(id);
    const selectedOrgs = this.data.organizations.filter((item) => selected.indexOf(item.id) >= 0);
    const minRequired = selectedOrgs.reduce((max, item) => Math.max(max, Number(item.minFeeCentsPerHour || 0)), 0);
    const currentFee = Number(this.data.feeCentsPerHour || 0);
    const nextFee = minRequired > 0
      ? Math.max(currentFee || minRequired, minRequired)
      : currentFee;
    const organizations = this.data.organizations.map((item) => ({
      ...item,
      selected: selected.indexOf(item.id) >= 0,
    }));
    this.setData({
      selectedIds: selected,
      organizations,
      visibleOrganizations: organizationGroups.filterOrganizations(organizations, this.data.activeGroup),
      minRequiredCents: minRequired,
      minRequiredText: centsToYuan(minRequired),
      feeCentsPerHour: nextFee,
      feeText: centsToYuan(nextFee),
      amountText: centsToYuan(nextFee * 2),
      hasSelectedOrganizations: selected.length > 0,
      organizationScopeText: selected.length > 0 ? `仅所选组织认证用户可投递（已选 ${selected.length} 个）` : '所有用户都可以投递简历',
      canSubmit: this.canSubmitWithFee(nextFee, minRequired),
      settlementHint: this.data.needsPhone
        ? '请先授权手机号后继续发布'
        : (minRequired > 0 ? `所选组织建议报价不低于 ¥${centsToYuan(minRequired)}/小时` : '发布后先收集简历，添加好友时再缴纳定金'),
    });
  },

  canSubmitWithFee(fee, minRequiredCents) {
    const minRequired = minRequiredCents === undefined ? this.data.minRequiredCents : minRequiredCents;
    return Number(fee || 0) >= 100 && Number(fee || 0) >= Number(minRequired || 0);
  },

  async submit() {
    if (this.data.submitting) return;
    const title = String(this.data.title || '').trim();
    const feeCentsPerHour = Number(this.data.feeCentsPerHour || 0);
    if (!title) {
      wx.showToast({ title: '请填写标题', icon: 'none' });
      return;
    }
    if (!this.data.canSubmit) {
      wx.showToast({ title: '请填写时薪', icon: 'none' });
      return;
    }
    if (feeCentsPerHour < Number(this.data.minRequiredCents || 0)) {
      wx.showToast({ title: `报价不能低于 ¥${centsToYuan(this.data.minRequiredCents)}/小时`, icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const applicationNoticeQuota = await this.requestApplicationNotices();
      const demand = await demands.createDemand({
        title,
        description: this.data.description,
        organizationIds: this.data.selectedIds,
        feeCentsPerHour,
        applicationLimit: this.data.applicationLimit,
        applicationNoticeQuota,
      });
      refreshState.mark(['entitlements']);
      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/demands/detail?id=${encodeURIComponent(demand.id)}` });
      }, 500);
    } catch (error) {
      if (phoneBinding.isPhoneRequiredError(error)) {
        this.setData({
          needsPhone: true,
          settlementHint: '请先授权手机号后继续发布',
        });
        wx.showToast({ title: '请先授权手机号', icon: 'none' });
        return;
      }
      wx.showModal({
        title: '发布失败',
        content: error && error.message ? error.message : '请稍后重试',
        showCancel: false,
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async handleGetPhoneNumber(event) {
    if (this.data.bindingPhone || this.data.submitting) return;
    this.setData({ bindingPhone: true });
    try {
      await phoneBinding.bindFromEvent(event);
      this.setData({
        bindingPhone: false,
        needsPhone: false,
        settlementHint: this.data.minRequiredCents > 0
          ? `所选组织建议报价不低于 ¥${this.data.minRequiredText}/小时`
          : '发布后先收集简历，添加好友时再缴纳定金',
      });
      wx.showToast({ title: '手机号已授权', icon: 'success' });
      await this.submit();
    } catch (error) {
      this.setData({ bindingPhone: false });
      wx.showToast({
        title: error && error.message ? error.message : '手机号授权失败',
        icon: 'none',
      });
    }
  },

  async requestApplicationNotices() {
    const count = Number(this.data.applicationLimit || 1);
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '简历投递提醒',
        content: `你将最多接收 ${count} 份简历。授权后，有人投递简历时会通过微信服务通知提醒你。`,
        showCancel: false,
        confirmText: '好的',
        success: () => resolve(true),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return 0;
    return subscribeMessage.requestDemandApplicationNotices(count);
  },
});
