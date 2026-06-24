const profileService = require('../../../services/profile');
const refreshState = require('../../../services/refresh-state');
const dashboardCache = require('../../../services/dashboard-cache');
const displayFormatters = require('../../../services/display-formatters');
const loginGuard = require('../../../services/login-guard');
const share = require('../../../services/share');

/**
 * Normalize engagement payloads from profile APIs into a flat list.
 *
 * @param {any} raw Raw API response.
 * @returns {Array<object>} Engagement items.
 */
function normalizeList(raw) {
  if (Array.isArray(raw)) return raw;
  return (raw && (raw.items || raw.engagements)) || [];
}

/**
 * Determine whether the engagement remains in a pending state.
 *
 * @param {object} item Engagement item.
 * @returns {boolean} Pending status flag.
 */
function isPending(item) {
  return String(item.status || item.confirmationStatus || '').toLowerCase().includes('pending');
}

/**
 * Determine whether the current user still needs to confirm the engagement.
 *
 * @param {object} item Engagement item.
 * @returns {boolean} True when my confirmation is required.
 */
function needsMyConfirmation(item) {
  if (!item) return false;
  if (item.requiresMyConfirmation === true) return true;
  if (item.pendingChange) {
    return item.pendingChange.waitingForOtherConfirmation !== true;
  }
  return false;
}

/**
 * Determine whether the engagement is waiting on the other party.
 *
 * @param {object} item Engagement item.
 * @returns {boolean} True when another user must confirm.
 */
function waitingForOtherConfirmation(item) {
  if (!item) return false;
  if (item.waitingForOtherConfirmation === true) return true;
  if (item.pendingChange) {
    return item.pendingChange.waitingForOtherConfirmation === true;
  }
  return isPending(item) && item.requiresMyConfirmation !== true;
}

/**
 * Resolve the counterpart name for the engagement detail card.
 *
 * @param {object} item Engagement item.
 * @returns {string} Counterpart display name.
 */
function counterpartNameOf(item) {
  return item.counterpartName || item.counterpartProfileName || item.counterpartProfileId || item.counterpartUserId || '未知';
}

/**
 * Resolve the main time label for the engagement detail card.
 *
 * @param {object} item Engagement item.
 * @returns {string} Display time text.
 */
function timeTextOf(item) {
  return displayFormatters.formatEngagementRange(item);
}

/**
 * Resolve the engagement type label shown in the fact card.
 *
 * @param {object} item Engagement item.
 * @returns {string} Type label.
 */
function typeLabelOf(item) {
  const side = String(item.side || item.kind || item.role || '').toLowerCase();
  if (side.includes('receive') || side.includes('receiver') || side.includes('purchased')) {
    return '被服务方';
  }
  return '服务方';
}

Page({
  data: {
    id: '',
    inviteToken: '',
    loading: true,
    submitting: false,
    errorMessage: '',
    item: null,
    invite: null,
    needsMyConfirmation: false,
    waitingForOtherConfirmation: false,
    heroSubtitle: '',
    visible: true,
    inviteMode: false,
    editing: false,
    detailText: '',
    detailTitleText: '服务履历',
    detailStatusText: '已确认',
    detailStatusClass: 'status-ok',
    typeLabelText: '服务方',
    counterpartNameText: '未知',
    startedAtDisplayText: '暂无时间',
    disableEditActions: false,
    bottomActionDisabled: false,
    editForm: {
      title: '',
      detailText: '',
    },
  },

  onLoad(options) {
    const inviteToken = decodeURIComponent(options.inviteToken || '');
    if (!inviteToken && !loginGuard.guardPage('/pages/resume/engagement_detail/index')) {
      return;
    }
    this.setData({
      id: decodeURIComponent(options.id || ''),
      inviteToken,
      inviteMode: Boolean(inviteToken),
    });
    if (inviteToken) {
      const app = getApp();
      if (app && app.globalData) {
        app.globalData.pendingEngagementInviteToken = inviteToken;
      }
      this.loadInvite();
    } else {
      this.loadDetail();
    }
  },

  onShow() {
    if (!this.data.inviteMode) {
      loginGuard.guardPage('/pages/resume/engagement_detail/index');
    }
  },

  async loadDetail() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const raw = await profileService.getEngagements();
      const item = normalizeList(raw).find((entry) => String(entry.id) === this.data.id);
      if (!item) {
        throw new Error('未找到该履历');
      }
      this.setData({
        loading: false,
        item,
        invite: item.invite || null,
        needsMyConfirmation: needsMyConfirmation(item),
        waitingForOtherConfirmation: waitingForOtherConfirmation(item),
        heroSubtitle: this.buildHeroSubtitle(item, false),
        visible: item.visible !== false,
        detailText: this.buildDetailText(item),
        detailTitleText: item.title || '服务履历',
        detailStatusText: needsMyConfirmation(item) ? '待确认' : '已确认',
        detailStatusClass: needsMyConfirmation(item) ? 'status-warn' : 'status-ok',
        typeLabelText: typeLabelOf(item),
        counterpartNameText: counterpartNameOf(item),
        startedAtDisplayText: timeTextOf(item),
        disableEditActions: Boolean(this.data.inviteMode || waitingForOtherConfirmation(item) || needsMyConfirmation(item)),
        bottomActionDisabled: Boolean(this.data.submitting || this.data.inviteMode || waitingForOtherConfirmation(item) || needsMyConfirmation(item)),
        editForm: {
          title: item.title || '',
          detailText: Array.isArray(item.detailLines)
            ? item.detailLines.join('\n')
            : this.buildDetailText(item),
        },
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '履历详情加载失败',
      });
    }
  },

  async loadInvite() {
    this.setData({ loading: true, errorMessage: '' });
    try {
      const raw = await profileService.previewEngagementInvite(this.data.inviteToken);
      const item = raw && raw.engagement ? raw.engagement : null;
      if (!item) {
        throw new Error('未找到该履历邀请');
      }
      this.setData({
        loading: false,
        item,
        invite: raw.invite || null,
        needsMyConfirmation: true,
        waitingForOtherConfirmation: false,
        heroSubtitle: this.buildHeroSubtitle(item, true),
        detailText: this.buildDetailText(item),
        detailTitleText: item.title || '服务履历',
        detailStatusText: '待确认',
        detailStatusClass: 'status-warn',
        typeLabelText: typeLabelOf(item),
        counterpartNameText: counterpartNameOf(item),
        startedAtDisplayText: timeTextOf(item),
        disableEditActions: true,
        bottomActionDisabled: true,
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '履历邀请加载失败',
      });
    }
  },

  async confirm() {
    if (this.data.inviteMode) {
      await this.submitAction(
        () => profileService.acceptEngagementInvite(this.data.inviteToken),
        '已确认',
      );
      return;
    }
    await this.submitAction(() => profileService.confirmEngagement(this.data.id), '已确认');
  },

  async reject() {
    await this.submitAction(() => profileService.rejectEngagement(this.data.id), '已拒绝');
  },

  buildHeroSubtitle(item, inviteMode) {
    if (item && item.pendingChange) {
      return item.pendingChange.type === 'delete'
        ? '对方邀请你确认删除这条服务履历。'
        : '对方邀请你确认这条服务履历的修改内容。';
    }
    return inviteMode
      ? '对方邀请你确认这条服务履历。确认后，它会进入双方资料。'
      : '确认后，这条服务记录会进入双方资料。';
  },

  buildDetailText(item) {
    if (!item) return '暂无服务内容';
    if (Array.isArray(item.detailLines) && item.detailLines.length) {
      return item.detailLines.join('\n');
    }
    return item.summary || item.description || item.detailText || '暂无服务内容';
  },

  onShareAppMessage() {
    const invite = this.data.invite;
    if (invite && invite.token) {
      return share.defaultShareAppMessage({
        title: invite.title || '邀请你确认服务履历',
        path: invite.path,
      });
    }
    const item = this.data.item || {};
    return share.defaultShareAppMessage({
      title: item.pendingChange ? '邀请你确认履历变更' : '邀请你确认服务履历',
      path: `/pages/resume/engagement_detail/index?id=${encodeURIComponent(this.data.id || item.id || '')}`,
    });
  },

  onShareTimeline() {
    const invite = this.data.invite;
    if (invite && invite.token) {
      const path = String(invite.path || '').replace(/^\//, '');
      return share.defaultShareTimeline({
        title: invite.title || '邀请你确认服务履历',
        query: path.includes('?') ? path.split('?').slice(1).join('?') : '',
      });
    }
    const item = this.data.item || {};
    return share.defaultShareTimeline({
      title: item.pendingChange ? '邀请你确认履历变更' : '讲了么服务履历',
      query: `id=${encodeURIComponent(this.data.id || item.id || '')}`,
    });
  },

  async shareConfirmation() {
    if (this.data.invite && this.data.invite.token) {
      return;
    }
    if (!this.data.item || this.data.item.invite) {
      this.setData({ invite: this.data.item ? this.data.item.invite || null : null });
      return;
    }
    try {
      const invite = await profileService.getEngagementInvite(this.data.id);
      this.setData({ invite: invite || null });
    } catch (error) {
      this.setData({
        errorMessage: error && error.message ? error.message : '邀请加载失败',
      });
    }
  },

  startEdit() {
    if (!this.data.item || this.data.inviteMode || this.data.waitingForOtherConfirmation || this.data.needsMyConfirmation) return;
    this.setData({
      editing: true,
      editForm: {
        title: this.data.item.title || '',
        detailText: Array.isArray(this.data.item.detailLines)
          ? this.data.item.detailLines.join('\n')
          : '',
      },
    });
  },

  cancelEdit() {
    this.setData({ editing: false, errorMessage: '' });
  },

  updateEditField(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`editForm.${field}`]: event.detail.value });
  },

  async submitEdit() {
    const form = this.data.editForm;
    const title = String(form.title || '').trim();
    if (!title) {
      this.setData({ errorMessage: '请填写标题' });
      return;
    }
    const detailLines = String(form.detailText || '')
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    await this.submitAction(
      () => profileService.requestEngagementUpdate(this.data.id, { title, detailLines }),
      '修改已提交',
    );
    this.setData({ editing: false });
  },

  requestDelete() {
    if (!this.data.item || this.data.inviteMode || this.data.waitingForOtherConfirmation || this.data.needsMyConfirmation) return;
    const confirmed = String(this.data.item.status || '').toLowerCase() === 'confirmed';
    wx.showModal({
      title: '删除履历',
      content: confirmed ? '删除已确认履历需要对方确认。确认提交删除申请吗？' : '这条履历尚未确认，删除后不会再展示。确认删除吗？',
      confirmText: confirmed ? '提交删除申请' : '删除',
      confirmColor: '#d92d20',
      success: async (result) => {
        if (!result.confirm) return;
        await this.submitAction(
          () => profileService.requestEngagementDelete(this.data.id),
          confirmed ? '删除申请已提交' : '已删除',
        );
      },
    });
  },

  async toggleVisible(event) {
    const visible = event.detail.value;
    await this.submitAction(() => profileService.updateEngagementVisibility(this.data.id, visible), visible ? '已公开' : '已隐藏');
  },

  async submitAction(action, toastTitle) {
    this.setData({ submitting: true, errorMessage: '', bottomActionDisabled: true });
    try {
      const result = await action();
      dashboardCache.invalidateDashboardRelated();
      wx.showToast({ title: toastTitle, icon: 'success' });
      this.setData({ submitting: false, bottomActionDisabled: false });
      refreshState.mark(['home', 'resume', 'engagements']);
      if (this.data.inviteMode) {
        wx.redirectTo({ url: '/pages/resume/engagements/index?tab=pending' });
        const app = getApp();
        if (app && app.globalData) {
          app.globalData.pendingEngagementInviteToken = '';
        }
        return;
      }
      if (result && result.status === 'archived') {
        wx.redirectTo({ url: '/pages/resume/engagements/index?tab=all' });
        return;
      }
      await this.loadDetail();
    } catch (error) {
      this.setData({
        submitting: false,
        bottomActionDisabled: false,
        errorMessage: error && error.message ? error.message : '操作失败',
      });
    }
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({ url: '/pages/resume/engagements/index' });
      },
    });
  },
});
