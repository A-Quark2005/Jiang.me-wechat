const contactDeposit = require('../../../services/contact-deposit');
const refreshState = require('../../../services/refresh-state');
const loginGuard = require('../../../services/login-guard');

const MAX_IMAGE_COUNT = 6;

function chooseMedia(count) {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success(result) {
        const files = Array.isArray(result.tempFiles) ? result.tempFiles : [];
        resolve(files.map((item) => item.tempFilePath).filter(Boolean));
      },
      fail(error) {
        reject(error);
      },
    });
  });
}

function isUserCancel(error) {
  const message = String(
    (error && (error.errMsg || error.message)) ||
      error ||
      '',
  ).toLowerCase();
  return message.includes('cancel') || message.includes('取消');
}

Page({
  data: {
    orderId: '',
    reason: '',
    evidenceImages: [],
    canAddImage: true,
    uploading: false,
    submitting: false,
  },

  onLoad(options) {
    if (!loginGuard.guardPage('/pages/orders/refund-request/index', { requireRegistration: true })) {
      return;
    }
    const orderId = decodeURIComponent((options && options.id) || '');
    this.setData({ orderId });
    this.updateCanAddImage();
  },

  onReasonInput(event) {
    this.setData({ reason: event.detail.value || '' });
  },

  async chooseImages() {
    if (this.data.uploading) return;
    const remaining = MAX_IMAGE_COUNT - this.data.evidenceImages.length;
    if (remaining <= 0) return;
    try {
      const paths = await chooseMedia(remaining);
      if (!paths.length) return;
      this.setData({ uploading: true });
      const uploaded = [];
      for (let index = 0; index < paths.length; index += 1) {
        const result = await contactDeposit.uploadRefundEvidence(paths[index]);
        const url = result && (result.imageUrl || result.url);
        if (url) uploaded.push({ url });
      }
      this.setData({
        evidenceImages: this.data.evidenceImages.concat(uploaded).slice(0, MAX_IMAGE_COUNT),
      }, () => this.updateCanAddImage());
    } catch (error) {
      if (isUserCancel(error)) return;
      wx.showModal({
        title: '上传失败',
        content: error && error.message ? error.message : '请稍后重试',
        showCancel: false,
      });
    } finally {
      this.setData({ uploading: false });
    }
  },

  removeImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;
    const evidenceImages = this.data.evidenceImages.filter((_, itemIndex) => itemIndex !== index);
    this.setData({ evidenceImages }, () => this.updateCanAddImage());
  },

  previewImage(event) {
    const url = String(event.currentTarget.dataset.url || '');
    if (!url) return;
    wx.previewImage({
      current: url,
      urls: this.data.evidenceImages.map((item) => item.url),
    });
  },

  async submit() {
    if (this.data.submitting || this.data.uploading) return;
    if (!this.data.orderId) {
      wx.showToast({ title: '订单不存在', icon: 'none' });
      return;
    }
    const reason = String(this.data.reason || '').trim();
    const evidenceImageUrls = this.data.evidenceImages.map((item) => item.url).filter(Boolean);
    if (reason.length < 10) {
      wx.showToast({ title: '请填写至少 10 个字的退款说明', icon: 'none' });
      return;
    }
    if (!evidenceImageUrls.length) {
      wx.showToast({ title: '请上传沟通记录截图', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      await contactDeposit.submitRefundRequest(this.data.orderId, {
        reason,
        evidenceImageUrls,
      });
      refreshState.mark(['orders']);
      wx.showModal({
        title: '已提交',
        content: '退款申请已提交，平台会根据说明和沟通记录截图进行审核。',
        showCancel: false,
        success() {
          wx.navigateBack();
        },
      });
    } catch (error) {
      wx.showModal({
        title: '提交失败',
        content: error && error.message ? error.message : '请稍后重试',
        showCancel: false,
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  updateCanAddImage() {
    this.setData({
      canAddImage: this.data.evidenceImages.length < MAX_IMAGE_COUNT,
    });
  },
});
