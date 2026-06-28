const CANVAS_ID = 'demandShareCanvas';
const IMAGE_WIDTH = 500;
const IMAGE_HEIGHT = 400;

function titleOf(demand) {
  return `${demand.title}，${demand.feePerHourText}`;
}

function drawImage(page, demand) {
  return new Promise((resolve, reject) => {
    const ctx = wx.createCanvasContext(CANVAS_ID, page);
    ctx.setFillStyle('#f7f8fa');
    ctx.fillRect(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);
    drawRoundRect(ctx, 30, 30, 440, 340, 24, '#ffffff');
    ctx.setFillStyle('#0071fe');
    ctx.fillRect(30, 30, 440, 10);
    ctx.setFillStyle('#0071fe');
    ctx.setFontSize(22);
    ctx.fillText('需求广场', 58, 82);
    ctx.setFillStyle('#111827');
    ctx.setFontSize(32);
    drawWrappedText(ctx, demand.title, 58, 128, 384, 40, 2);
    ctx.setFillStyle('#0071fe');
    ctx.setFontSize(24);
    ctx.fillText(`${demand.feePerHourText}  ${demand.candidateCountText || ''}`, 58, 218);
    ctx.setFillStyle('#4b5563');
    ctx.setFontSize(20);
    drawWrappedText(ctx, demand.requirementText || '无认证要求，所有人都可以投递简历', 58, 260, 384, 30, 2);
    ctx.setFillStyle('#9ca3af');
    ctx.setFontSize(18);
    ctx.fillText('讲了么 - 腾讯会议，会开会', 58, 338);
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
