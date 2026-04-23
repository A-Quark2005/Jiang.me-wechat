# 微信手机号授权小程序

这个目录承载安卓原生登录流程配套的小程序授权页。

## 目标

- 接收 App 拉起时带入的 `bindingTicket`
- 在小程序内执行 `wx.login`
- 使用 `getPhoneNumber` 获取一次性 `code`
- 调用后端 `POST /api/auth/phone/direct-bind`
- 让 App 侧继续轮询 `bindingTicket`，完成登录闭环

## 目录

- `app.js`：小程序入口
- `app.json`：页面注册
- `pages/auth/bind_phone/`：手机号授权页
- `utils/request.js`：后端请求封装

## 当前约定

- 小程序页面路径固定为 `pages/auth/bind_phone/index`
- 安卓端会按这个路径拉起小程序
- 后端默认请求域名为 `https://api.whkerdb.top`

## 发布前检查

1. 小程序后台把 `https://api.whkerdb.top` 配到合法 request 域名
2. 小程序与 App 登录使用的微信开放平台账号属于同一主体
3. 页面路径保持为 `pages/auth/bind_phone/index`
4. 发布正式版后，安卓端 `WECHAT_MINI_PROGRAM_TYPE` 保持 `0`

## 调试

- 微信开发者工具导入 `wechat_mini_program/`
- `project.config.json` 已写入小程序 `appid`
- 开发者工具里可以直接打开页面：
  - `pages/auth/bind_phone/index?bindingTicket=xxx&backendBaseUrl=https%3A%2F%2Fapi.whkerdb.top`
