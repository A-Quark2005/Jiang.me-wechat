# 将了么小程序

这是独立业务小程序，不再作为安卓 `bindingTicket` 手机号绑定页使用。

## 当前能力

- 微信手机号授权注册：调用真实后端 `/api/auth/wechat-mini-program/login` 和 `/api/auth/wechat-mini-program/register`。
- 首页：读取 `/api/bootstrap`、`/api/me/capabilities`、`/api/me/meeting-entitlements`。
- 会议权益：读取商品、创建小程序支付订单、调用 `wx.requestPayment`。
- 简历：管理官方认证、自我介绍、孪生服务履历。

## 约定

- 默认后端地址：`https://api.whkerdb.top`，集中配置在 `app.js`。
- 除注册登录外，请求都会携带 `Authorization: Bearer <token>`。
- 成功响应只接受 `{ ok: true, data }`。
- 不使用本地模拟业务数据；后端接口未就绪时页面直接展示真实错误。
