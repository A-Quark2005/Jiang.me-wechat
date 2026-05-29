const service = require('../../services/meeting-entitlements');
const loginGuard = require('../../services/login-guard');

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return '--';
  return `${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTime(value) {
  const date = toDate(value);
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : '--';
}

function formatTimeRange(startValue, endValue) {
  const start = toDate(startValue);
  const end = toDate(endValue);
  if (!start) return '--';
  const sameDay = end
    && start.getFullYear() === end.getFullYear()
    && start.getMonth() === end.getMonth()
    && start.getDate() === end.getDate();
  const startText = `${pad(start.getMonth() + 1)}月${pad(start.getDate())}日 ${pad(start.getHours())}:${pad(start.getMinutes())}`;
  return sameDay ? `${startText}-${pad(end.getHours())}:${pad(end.getMinutes())}` : `${startText}-${formatDateTime(endValue)}`;
}

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds || 0)));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}

function parseDurationSeconds(value) {
  const seconds = Math.max(0, Math.floor(Number(value || 0)));
  return Number.isFinite(seconds) ? seconds : 0;
}

function calcDurationSeconds(startValue, endValue) {
  const start = toDate(startValue);
  const end = toDate(endValue);
  if (!start || !end || end <= start) return 0;
  return Math.round((end.getTime() - start.getTime()) / 1000);
}

function normalizeRecordFile(file, index) {
  const start = toDate(file.startTime);
  const end = toDate(file.endTime);
  const duration = calcDurationSeconds(file.startTime, file.endTime);
  const playableUrl = file.viewAddress || file.downloadAddress || file.audioAddress || file.playableUrl || '';
  return {
    ...file,
    key: file.recordFileId || `${file.meetingRecordId || 'record'}_${index}`,
    playable: Boolean(playableUrl),
    playableUrl,
    timeText: start ? `${pad(start.getMonth() + 1)}/${pad(start.getDate())} ${formatTime(start)}` : '--',
    durationText: duration ? formatDuration(duration) : '--',
    sizeText: file.size ? `${(Number(file.size) / 1024 / 1024).toFixed(1)} MB` : '',
    summaryCount: Array.isArray(file.summaries) ? file.summaries.length : 0,
  };
}

function normalizeDetail(payload) {
  const meeting = payload.meeting || {};
  const participants = payload.participants || { available: false, reason: '正在读取参会记录', items: [], totalCount: 0 };
  const records = payload.records || { available: true, reason: '', items: [], totalCount: 0 };
  const docs = payload.docs || { available: true, reason: '', items: [], totalCount: 0 };
  const participantItems = Array.isArray(participants.items) ? participants.items : [];
  const participantSummary = participants.summary || {};
  const durationSeconds = parseDurationSeconds(
    participantSummary.currentUserDurationSeconds || participantSummary.totalDurationSeconds || 0,
  );
  const rawRecordFiles = Array.isArray(records.items)
    ? records.items
    : (Array.isArray(records.recordFiles) ? records.recordFiles : []);
  const recordFiles = rawRecordFiles.map(normalizeRecordFile);
  const docItems = (Array.isArray(docs.items) ? docs.items : []).map((item, index) => ({
    ...item,
    key: item.id || item.doc_id || item.file_id || index,
    titleText: item.title || item.name || item.doc_name || item.file_name || '会议文档',
  }));
  return {
    meeting: {
      ...meeting,
      titleText: meeting.subject || '未命名会议',
      timeText: formatTimeRange(meeting.startTime, meeting.endTime),
      codeText: meeting.meetingCodeText || meeting.meetingCode || '--',
      statusText: '会议已结束',
    },
    participants: {
      ...participants,
      totalCount: Number(participants.totalCount || participantItems.length || 0),
      items: participantItems,
      countText: participants.available ? `共${Number(participants.totalCount || participantItems.length || 0)}人` : '',
      latestJoinText: participantSummary.latestJoinTime ? formatDateTime(participantSummary.latestJoinTime) : '--',
      durationText: durationSeconds ? formatDuration(durationSeconds) : '--',
      durationSource: participantSummary.durationSource || 'none',
    },
    records: {
      ...records,
      totalCount: Number(records.totalCount || recordFiles.length || 0),
      recordFiles,
      hasRecords: recordFiles.length > 0,
      hasPlayableRecords: recordFiles.some((item) => item.playable),
    },
    docs: {
      ...docs,
      totalCount: Number(docs.totalCount || docItems.length || 0),
      hasDocs: docItems.length > 0,
      items: docItems,
    },
  };
}

function mergeDetailPayload(current, patch) {
  return normalizeDetail({
    ...(current || {}),
    ...(patch || {}),
  });
}

Page({
  data: {
    meetingId: '',
    meetingCode: '',
    navHeight: 88,
    navTop: 0,
    capsuleRight: 16,
    loading: true,
    errorMessage: '',
    detail: null,
    recordsLoading: false,
    docsLoading: false,
    recordsLoaded: false,
    docsLoaded: false,
  },

  onLoad(options) {
    this.setupNavigation();
    const meetingId = decodeURIComponent(options && options.meetingId ? options.meetingId : '');
    const meetingCode = decodeURIComponent(options && options.meetingCode ? options.meetingCode : '');
    const guardUrl = `/pages/meeting_detail/index?meetingId=${encodeURIComponent(meetingId)}&meetingCode=${encodeURIComponent(meetingCode)}`;
    if (!loginGuard.guardPage(guardUrl, { requireRegistration: true })) {
      return;
    }
    const seed = wx.getStorageSync('meeting_detail_seed') || null;
    const seedMatches = seed && seed.meetingId === meetingId;
    const sectionOptions = { meetingCode };
    const cachedDetail = service.getCachedTencentMeetingHistorySection(meetingId, '', sectionOptions);
    const cachedParticipants = service.getCachedTencentMeetingHistorySection(meetingId, 'participants', sectionOptions);
    const cachedRecords = service.getCachedTencentMeetingHistorySection(meetingId, 'records', sectionOptions);
    const cachedDocs = service.getCachedTencentMeetingHistorySection(meetingId, 'docs', sectionOptions);
    const seedMeeting = seedMatches ? {
      meetingId,
      meetingCode: seed.meetingCode || meetingCode,
      meetingCodeText: seed.meetingCodeText,
      subject: seed.subject || seed.subjectText,
      startTime: seed.startTime,
      endTime: seed.endTime,
    } : null;
    const initialMeeting = cachedDetail && cachedDetail.meeting ? cachedDetail.meeting : seedMeeting;
    this.setData({
      meetingId,
      meetingCode,
      loading: !initialMeeting,
      detail: initialMeeting ? normalizeDetail({
        meeting: initialMeeting,
        participants: cachedParticipants || { available: false, reason: '正在读取参会记录', items: [], totalCount: 0 },
        records: cachedRecords || { available: true, reason: '', items: [], totalCount: 0 },
        docs: cachedDocs || { available: true, reason: '', items: [], totalCount: 0 },
      }) : null,
      recordsLoaded: Boolean(cachedRecords),
      docsLoaded: Boolean(cachedDocs),
    });
    this.loadDetail();
    this.loadParticipants();
    this.loadRecords();
    this.loadDocs();
  },

  onPullDownRefresh() {
    Promise.all([
      this.loadDetail(true),
      this.loadParticipants(true),
      this.loadRecords(true),
      this.loadDocs(true),
    ]).finally(() => wx.stopPullDownRefresh());
  },

  reload() {
    this.loadDetail(true);
    this.loadParticipants(true);
    this.loadRecords(true);
    this.loadDocs(true);
  },

  setupNavigation() {
    const systemInfo = wx.getSystemInfoSync();
    const capsule = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const statusBarHeight = Number(systemInfo.statusBarHeight || 0);
    const navTop = capsule ? Number(capsule.top || statusBarHeight) : statusBarHeight;
    const navHeight = capsule
      ? Number(capsule.bottom || navTop + 32) + 8
      : statusBarHeight + 44;
    const capsuleRight = capsule
      ? Math.max(16, Number(systemInfo.windowWidth || 0) - Number(capsule.left || 0))
      : 16;
    this.setData({
      navHeight,
      navTop,
      capsuleRight,
    });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: '/pages/meeting_entitlements/index' });
  },

  async loadDetail(forceRefresh) {
    if (!this.data.meetingId) {
      this.setData({ loading: false, errorMessage: '会议不存在' });
      return;
    }
    this.setData({ loading: !this.data.detail, errorMessage: '' });
    try {
      const result = await service.getTencentMeetingHistorySection(this.data.meetingId, '', {
        meetingCode: this.data.meetingCode,
        forceRefresh,
      });
      this.setData({
        loading: false,
        detail: mergeDetailPayload(this.data.detail, { meeting: result && result.meeting }),
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error && error.message ? error.message : '会议详情加载失败',
      });
    }
  },

  sectionOptions(forceRefresh) {
    return {
      meetingCode: this.data.meetingCode,
      forceRefresh,
    };
  },

  async loadParticipants(forceRefresh) {
    if (!this.data.meetingId) return;
    const options = {
      ...this.sectionOptions(forceRefresh),
    };
    try {
      const participants = await service.getTencentMeetingHistorySection(this.data.meetingId, 'participants', options);
      this.setData({
        detail: mergeDetailPayload(this.data.detail, { participants }),
      });
    } catch (error) {
      this.setData({
        detail: mergeDetailPayload(this.data.detail, {
          participants: {
            available: false,
            reason: error && error.message ? error.message : '参会记录加载失败',
            items: [],
            totalCount: 0,
          },
        }),
      });
    }
  },

  async loadRecords(forceRefresh) {
    if (!this.data.meetingId) return;
    this.setData({ recordsLoading: !this.data.recordsLoaded });
    try {
      const records = await service.getTencentMeetingHistorySection(this.data.meetingId, 'records', this.sectionOptions(forceRefresh));
      this.setData({
        recordsLoading: false,
        recordsLoaded: true,
        detail: mergeDetailPayload(this.data.detail, { records }),
      });
    } catch (error) {
      this.setData({
        recordsLoading: false,
        recordsLoaded: true,
        detail: mergeDetailPayload(this.data.detail, {
          records: {
            available: false,
            reason: error && error.message ? error.message : '录制加载失败',
            items: [],
            totalCount: 0,
          },
        }),
      });
    }
  },

  async loadDocs(forceRefresh) {
    if (!this.data.meetingId) return;
    this.setData({ docsLoading: !this.data.docsLoaded });
    try {
      const docs = await service.getTencentMeetingHistorySection(this.data.meetingId, 'docs', this.sectionOptions(forceRefresh));
      this.setData({
        docsLoading: false,
        docsLoaded: true,
        detail: mergeDetailPayload(this.data.detail, { docs }),
      });
    } catch (error) {
      this.setData({
        docsLoading: false,
        docsLoaded: true,
        detail: mergeDetailPayload(this.data.detail, {
          docs: {
            available: false,
            reason: error && error.message ? error.message : '会议文档加载失败',
            items: [],
            totalCount: 0,
          },
        }),
      });
    }
  },

  copyMeetingCode() {
    const code = this.data.detail && this.data.detail.meeting && this.data.detail.meeting.meetingCode;
    if (!code) return;
    wx.setClipboardData({
      data: String(code),
      success() {
        wx.showToast({ title: '会议号已复制', icon: 'none' });
      },
    });
  },

  openRecord(event) {
    const url = event.currentTarget.dataset.url || '';
    if (!url) {
      wx.showModal({
        title: '无法查看录制',
        content: '会议创建者未使用讲了么账号，无法在小程序中查看',
        showCancel: false,
        confirmText: '知道了',
      });
      return;
    }
    wx.setClipboardData({
      data: url,
      success() {
        wx.showToast({ title: '录制链接已复制，可于浏览器中打开', icon: 'none' });
      },
    });
  },
});

