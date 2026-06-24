const demands = require('../../services/demands');
const paymentService = require('../../services/meeting-entitlements');
const loginGuard = require('../../services/login-guard');
const phoneBinding = require('../../services/phone-binding');
const refreshState = require('../../services/refresh-state');

function centsToYuan(value) {
  return (Number(value || 0) / 100).toFixed(2);
}

function yuanToCents(value) {
  const text = String(value || '').replace(/[¥￥,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return NaN;
  return Math.round(Number(text) * 100);
}

function listFrom(raw) {
  return Array.isArray(raw) ? raw : (raw && raw.items) || [];
}

function normalizeOrganization(item) {
  return {
    ...item,
    typeLabelText: item.typeLabel || item.type_label || '',
    selected: false,
  };
}

Page({
  data: {
    title: '',
    description: '',
    feeCentsPerHour: 0,
    feeText: '0.00',
    organizations: [],
    selectedIds: [],
    minRequiredCents: 0,
    minRequiredText: '0.00',
    maxFeeCents: 0,
    maxFeeText: '0.00',
    amountText: '0.00',
    hasSelectedOrganizations: false,
    canSubmit: false,
    settlementHint: '不设置组织要求时，所有人都可以投稿',
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
      this.setData({
        organizations: listFrom(raw).map(normalizeOrganization),
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

  onTitleInput(event) {
    this.setData({ title: event.detail.value });
  },

  onDescriptionInput(event) {
    this.setData({ description: event.detail.value });
  },

  updateFee(value) {
    const min = Number(this.data.minRequiredCents || 0);
    const max = Number(this.data.maxFeeCents || 0);
    let fee = Math.round(Number(value || 0));
    if (!Number.isFinite(fee)) fee = 0;
    if (min > 0) fee = Math.max(min, fee);
    if (max > 0) fee = Math.min(max, fee);
    this.setData({
      feeCentsPerHour: fee,
      feeText: centsToYuan(fee),
      amountText: centsToYuan(fee * 2),
      canSubmit: this.canSubmitWithFee(fee),
    });
  },

  onFeeSliderChange(event) {
    this.updateFee(event.detail.value);
  },

  editFee() {
    const hasLimit = this.data.hasSelectedOrganizations;
    wx.showModal({
      title: '手动输入时薪',
      editable: true,
      placeholderText: hasLimit ? `¥${this.data.minRequiredText} - ¥${this.data.maxFeeText}` : '请输入时薪',
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
        if (hasLimit && value > Number(this.data.maxFeeCents || 0)) {
          wx.showToast({ title: `不能高于 ¥${this.data.maxFeeText}/小时`, icon: 'none' });
          this.updateFee(this.data.maxFeeCents);
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
    const maxFee = minRequired > 0 ? minRequired * 10 : 0;
    const currentFee = Number(this.data.feeCentsPerHour || 0);
    const nextFee = minRequired > 0
      ? Math.min(Math.max(currentFee || minRequired, minRequired), maxFee)
      : currentFee;
    this.setData({
      selectedIds: selected,
      organizations: this.data.organizations.map((item) => ({
        ...item,
        selected: selected.indexOf(item.id) >= 0,
      })),
      minRequiredCents: minRequired,
      minRequiredText: centsToYuan(minRequired),
      maxFeeCents: maxFee,
      maxFeeText: centsToYuan(maxFee),
      feeCentsPerHour: nextFee,
      feeText: centsToYuan(nextFee),
      amountText: centsToYuan(nextFee * 2),
      hasSelectedOrganizations: selected.length > 0,
      canSubmit: this.canSubmitWithFee(nextFee, selected.length, minRequired),
      settlementHint: this.data.needsPhone
        ? '请先授权手机号后继续发布'
        : (selected.length > 0 ? '满足任一组织认证即可投稿' : '不设置组织要求时，所有人都可以投稿'),
    });
  },

  canSubmitWithFee(fee, selectedCount, minRequiredCents) {
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
      const order = await demands.createDemand({
        title,
        description: this.data.description,
        organizationIds: this.data.selectedIds,
        feeCentsPerHour,
      });
      await paymentService.payOrder(order);
      if (order.demand && order.demand.id) {
        await demands.syncPayment(order.demand.id);
        refreshState.mark(['entitlements']);
        wx.showToast({ title: '发布成功', icon: 'success' });
        setTimeout(() => {
          wx.redirectTo({ url: `/pages/demands/detail?id=${encodeURIComponent(order.demand.id)}` });
        }, 500);
      } else {
        wx.navigateBack();
      }
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
        settlementHint: this.data.hasSelectedOrganizations ? '满足任一组织认证即可投稿' : '不设置组织要求时，所有人都可以投稿',
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
});
