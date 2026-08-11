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

function pageTitleForMode(mode) {
  if (mode === 'recollect') return '重新收集';
  if (mode === 'edit') return '修改需求';
  return '发布需求';
}

function submitTextForMode(mode) {
  if (mode === 'recollect') return '重新收集';
  if (mode === 'edit') return '保存修改';
  return '发布需求';
}

Page({
  data: {
    demandId: '',
    mode: 'create',
    resetApplications: false,
    submitText: '发布需求',
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
    feeFloorCents: 0,
    feeFloorText: '0.00',
    amountText: '0.00',
    applicationLimit: 1,
    applicationLimitExpanded: false,
    applicationLimitText: '1份',
    applicationLimitOptions: [
      { value: 1, label: '1份', active: true },
      { value: 2, label: '2份', active: false },
      { value: 3, label: '3份', active: false },
    ],
    organizationScopeExpanded: false,
    hasSelectedOrganizations: false,
    organizationScopeText: '不限制',
    canSubmit: false,
    settlementHint: '发布后先收集简历，添加好友时再缴纳定金',
    submitting: false,
    bindingPhone: false,
    needsPhone: false,
    entryChecking: true,
    loading: true,
  },

  async onLoad(options) {
    const id = decodeURIComponent((options && options.id) || '');
    const mode = id ? (options && options.mode === 'recollect' ? 'recollect' : 'edit') : 'create';
    const guardPath = id
      ? `/pages/demands/create?id=${encodeURIComponent(id)}&mode=${mode}`
      : '/pages/demands/create';
    if (!loginGuard.guardPage(guardPath, { requireRegistration: true })) return;
    this.setData({
      demandId: id,
      mode,
      resetApplications: mode === 'recollect',
      submitText: submitTextForMode(mode),
    });
    wx.setNavigationBarTitle({ title: pageTitleForMode(mode) });
    if (mode === 'create') {
      const createEntry = await demands.getCreateEntry({ forceRefresh: true }).catch(() => null);
      if (Number(createEntry && createEntry.hidden) === 1) {
        wx.switchTab({ url: '/pages/home/index' });
        return;
      }
    }
    this.setData({ entryChecking: false });
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
      if (this.data.demandId) await this.loadDemandForEdit();
    } catch (error) {
      this.setData({ loading: false });
      wx.showModal({
        title: '读取失败',
        content: error && error.message ? error.message : '组织信息读取失败',
        showCancel: false,
      });
    }
  },

  async loadDemandForEdit() {
    this.setData({ loading: true });
    try {
      const demand = await demands.getDemand(this.data.demandId, { forceRefresh: true });
      if (!demand || !demand.isPoster) {
        wx.showModal({ title: '无法修改', content: '只能修改自己发布的需求', showCancel: false });
        this.setData({ loading: false });
        return;
      }

      const selectedIds = Array.isArray(demand.organizations)
        ? demand.organizations.map((item) => String(item.id || '')).filter(Boolean)
        : [];
      const selectedOrgs = this.data.organizations.filter((item) => selectedIds.indexOf(item.id) >= 0);
      const minRequired = selectedOrgs.reduce((max, item) => Math.max(max, Number(item.minFeeCentsPerHour || 0)), 0);
      const hasApplications = Number(demand.totalApplicationCount || 0) > 0;
      const feeFloor = this.data.mode === 'edit' && hasApplications ? Number(demand.feeCentsPerHour || 0) : 0;
      const fee = Math.max(Number(demand.feeCentsPerHour || 0), minRequired, feeFloor);
      const organizations = this.data.organizations.map((item) => ({
        ...item,
        selected: selectedIds.indexOf(item.id) >= 0,
      }));

      this.setData({
        title: demand.title || '',
        description: demand.description || '',
        organizations,
        visibleOrganizations: organizationGroups.filterOrganizations(organizations, this.data.activeGroup),
        selectedIds,
        minRequiredCents: minRequired,
        minRequiredText: centsToYuan(minRequired),
        feeFloorCents: feeFloor,
        feeFloorText: centsToYuan(feeFloor),
        feeCentsPerHour: fee,
        feeText: centsToYuan(fee),
        amountText: centsToYuan(fee * 2),
        applicationLimit: Number(demand.applicationLimit || 1),
        applicationLimitText: `${Number(demand.applicationLimit || 1)}份`,
        applicationLimitOptions: this.data.applicationLimitOptions.map((item) => ({
          ...item,
          active: Number(item.value) === Number(demand.applicationLimit || 1),
        })),
        hasSelectedOrganizations: selectedIds.length > 0,
        organizationScopeText: selectedIds.length > 0 ? `已选 ${selectedIds.length} 个组织` : '不限制',
        canSubmit: this.canSubmitWithFee(fee, minRequired, feeFloor),
        settlementHint: this.settlementHintText(minRequired, feeFloor),
        loading: false,
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showModal({
        title: '读取失败',
        content: error && error.message ? error.message : '需求信息读取失败',
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

  toggleOrganizationScope() {
    this.setData({ organizationScopeExpanded: !this.data.organizationScopeExpanded });
  },

  toggleApplicationLimit() {
    this.setData({ applicationLimitExpanded: !this.data.applicationLimitExpanded });
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
      organizationScopeText: '不限制',
      canSubmit: this.canSubmitWithFee(fee, 0),
      settlementHint: this.settlementHintText(0),
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
      applicationLimitText: `${value}份`,
      applicationLimitOptions: this.data.applicationLimitOptions.map((item) => ({
        ...item,
        active: Number(item.value) === value,
      })),
    });
  },

  updateFee(value) {
    const floor = this.feeFloor();
    let fee = Math.round(Number(value || 0));
    if (!Number.isFinite(fee)) fee = 0;
    if (floor > 0) fee = Math.max(floor, fee);
    this.setData({
      feeCentsPerHour: fee,
      feeText: centsToYuan(fee),
      amountText: centsToYuan(fee * 2),
      canSubmit: this.canSubmitWithFee(fee),
    });
  },

  editFee() {
    const floor = this.feeFloor();
    wx.showModal({
      title: '手动输入报价',
      editable: true,
      placeholderText: floor > 0 ? `不低于 ¥${centsToYuan(floor)}/小时` : '请输入报价',
      content: this.data.feeText,
      success: (result) => {
        if (!result.confirm) return;
        const value = yuanToCents(result.content);
        if (!Number.isFinite(value)) {
          wx.showToast({ title: '请输入正确的报价', icon: 'none' });
          return;
        }
        if (floor > 0 && value < floor) {
          wx.showToast({ title: `不能低于 ¥${centsToYuan(floor)}/小时`, icon: 'none' });
          this.updateFee(floor);
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
    const nextFee = Math.max(currentFee, minRequired, Number(this.data.feeFloorCents || 0));
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
      organizationScopeText: selected.length > 0 ? `已选 ${selected.length} 个组织` : '不限制',
      canSubmit: this.canSubmitWithFee(nextFee, minRequired),
      settlementHint: this.settlementHintText(minRequired),
    });
  },

  feeFloor(minRequiredCents, feeFloorCents) {
    const minRequired = minRequiredCents === undefined ? this.data.minRequiredCents : minRequiredCents;
    const feeFloor = feeFloorCents === undefined ? this.data.feeFloorCents : feeFloorCents;
    return Math.max(Number(minRequired || 0), Number(feeFloor || 0));
  },

  canSubmitWithFee(fee, minRequiredCents, feeFloorCents) {
    return Number(fee || 0) >= 100 && Number(fee || 0) >= this.feeFloor(minRequiredCents, feeFloorCents);
  },

  settlementHintText(minRequiredCents, feeFloorCents) {
    if (this.data.needsPhone) return '请先授权手机号后继续发布';
    const minRequired = minRequiredCents === undefined ? Number(this.data.minRequiredCents || 0) : Number(minRequiredCents || 0);
    const feeFloor = feeFloorCents === undefined ? Number(this.data.feeFloorCents || 0) : Number(feeFloorCents || 0);
    if (feeFloor > 0) return `已收到简历，保留简历时报价不能低于 ¥${centsToYuan(feeFloor)}/小时`;
    if (minRequired > 0) return `所选组织建议报价不低于 ¥${centsToYuan(minRequired)}/小时`;
    if (this.data.mode === 'recollect') return '重新收集后，旧简历不再显示在当前需求中';
    if (this.data.mode === 'edit') return '保存后，需求内容会立即更新';
    return '发布后先收集简历，添加好友时再缴纳定金';
  },

  async submit() {
    if (this.data.submitting) return;
    const title = String(this.data.title || '').trim();
    const feeCentsPerHour = Number(this.data.feeCentsPerHour || 0);
    const floor = this.feeFloor();
    if (!title) {
      wx.showToast({ title: '请填写标题', icon: 'none' });
      return;
    }
    if (!this.data.canSubmit) {
      wx.showToast({ title: '请填写报价', icon: 'none' });
      return;
    }
    if (feeCentsPerHour < floor) {
      wx.showToast({ title: `报价不能低于 ¥${centsToYuan(floor)}/小时`, icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const applicationNoticeQuota = this.shouldRequestNotices() ? await this.requestApplicationNotices() : 0;
      const demand = await this.saveDemand(applicationNoticeQuota);
      refreshState.mark(['entitlements']);
      wx.showToast({ title: this.successToastText(), icon: 'success' });
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
        title: this.errorTitleText(),
        content: error && error.message ? error.message : '请稍后重试',
        showCancel: false,
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async saveDemand(applicationNoticeQuota) {
    const payload = {
      title: String(this.data.title || '').trim(),
      description: this.data.description,
      organizationIds: this.data.selectedIds,
      feeCentsPerHour: Number(this.data.feeCentsPerHour || 0),
      applicationLimit: this.data.applicationLimit,
      applicationNoticeQuota,
      resetApplications: this.data.resetApplications,
    };
    if (this.data.mode === 'create') return demands.createDemand(payload);
    return demands.updateDemand(this.data.demandId, payload);
  },

  shouldRequestNotices() {
    return this.data.mode === 'create' || this.data.resetApplications;
  },

  successToastText() {
    if (this.data.mode === 'recollect') return '已重新收集';
    if (this.data.mode === 'edit') return '已保存';
    return '发布成功';
  },

  errorTitleText() {
    if (this.data.mode === 'recollect') return '重新收集失败';
    if (this.data.mode === 'edit') return '保存失败';
    return '发布失败';
  },

  async handleGetPhoneNumber(event) {
    if (this.data.bindingPhone || this.data.submitting) return;
    this.setData({ bindingPhone: true });
    try {
      await phoneBinding.bindFromEvent(event);
      this.setData({
        bindingPhone: false,
        needsPhone: false,
        settlementHint: this.settlementHintText(),
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
