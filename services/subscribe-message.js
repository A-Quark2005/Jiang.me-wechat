const DEMAND_APPLICATION_TEMPLATE_ID = '9ttNJs3tDcUmZmRhMO_Ho7g6uoZSCfwLkSRxqejmwUc';
const DEMAND_SELECTION_TEMPLATE_ID = 'AOrQv-fs67sDpaHNDpRkhrE-gP5fGB5m1kE3cjauZqk';

async function requestDemandApplicationNotices(count) {
  const templateId = DEMAND_APPLICATION_TEMPLATE_ID;
  const total = Math.min(Math.max(Number(count || 0), 0), 3);
  if (!templateId || total <= 0 || typeof wx === 'undefined' || typeof wx.requestSubscribeMessage !== 'function') {
    return 0;
  }
  let accepted = 0;
  for (let index = 0; index < total; index += 1) {
    const ok = await requestOnce(templateId);
    if (ok) accepted += 1;
  }
  return accepted;
}

function requestOnce(templateId) {
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success(result) {
        resolve(result && result[templateId] === 'accept');
      },
      fail() {
        resolve(false);
      },
    });
  });
}

module.exports = {
  requestDemandApplicationNotices,
  requestDemandSelectionNotice() {
    return requestOnce(DEMAND_SELECTION_TEMPLATE_ID);
  },
};
