const CANVAS_ID = 'demandShareCanvas';
const IMAGE_WIDTH = 500;
const IMAGE_HEIGHT = 400;

function titleOf(demand) {
  return `${demand.title}，${demand.feePerHourText}`;
}

function drawImage(page, demand) {
  return new Promise((resolve, reject) => {
    const applicationLimit = Number(demand.applicationLimit || 1);
    const referralRewardText = demand.referralRewardText || '¥0.00';
    const ctx = wx.createCanvasContext(CANVAS_ID, page);
    ctx.setFillStyle('#f7f8fa');
    ctx.fillRect(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);
    drawRoundRect(ctx, 30, 30, 440, 340, 24, '#ffffff');

    drawRoundRect(ctx, 58, 58, 122, 34, 17, '#e8f2ff');
    ctx.setFillStyle('#0071fe');
    ctx.setFontSize(18);
    ctx.fillText('需求转介绍', 74, 81);

    ctx.setFillStyle('#111827');
    ctx.setFontSize(26);
    drawWrappedText(ctx, demand.description || '有人发布了新的单子，欢迎查看并投递简历。', 58, 128, 384, 34, 3);

    drawRoundRect(ctx, 58, 238, 384, 82, 16, '#f7f8fa');
    ctx.setFillStyle('#4b5563');
    ctx.setFontSize(18);
    ctx.fillText('认证要求', 78, 267);
    ctx.setFillStyle('#111827');
    ctx.setFontSize(18);
    drawWrappedText(ctx, demand.requirementText || '无认证要求，所有人都可以投递简历', 160, 267, 260, 24, 1);
    ctx.setFillStyle('#6b7280');
    ctx.setFontSize(18);
    ctx.fillText('接收规则', 78, 300);
    ctx.setFillStyle('#111827');
    ctx.setFontSize(18);
    ctx.fillText(`最多 ${applicationLimit} 份，收满后停止接收`, 160, 300);

    ctx.setFillStyle('#0071fe');
    ctx.setFontSize(20);
    ctx.fillText(`允许转介绍，介绍费 ${referralRewardText}`, 58, 346);
    ctx.setFillStyle('#9ca3af');
    ctx.setFontSize(18);
    ctx.fillText('讲了么', 386, 346);
    ctx.draw(false, () => {
      wx.canvasToTempFilePath({
        canvasId: CANVAS_ID,
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        destWidth: IMAGE_WIDTH * 2,
        destHeight: IMAGE_HEIGHT * 2,
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

module.exports = {
  drawImage,
  titleOf,
};
