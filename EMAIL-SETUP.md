# 邮件验证与密码找回

## 先发布代码

GitHub Desktop 选择 business-ledger-public → Push origin，等待 Actions 成功。

## Supabase 登录设置

Authentication → Sign In / Providers：开启 Allow new users to sign up、Email 和 Confirm email，保存。

Authentication → URL Configuration：

- Site URL：`https://axing-git.github.io/business-ledger-public/`
- Redirect URLs 添加以下两个准确地址：
  - `https://axing-git.github.io/business-ledger-public/`
  - `https://axing-git.github.io/business-ledger-public/?reset=1`

## QQ 邮箱作为发件邮箱（可选）

登录 QQ 邮箱网页版，在设置中找到 POP3/IMAP/SMTP 服务或授权码管理，开启 SMTP 并按页面要求完成本人验证，获得授权码。该授权码仅在 Supabase 后台填写，不要发送到聊天或提交到代码仓库。

Supabase Authentication → Emails → SMTP Settings → Enable custom SMTP：

| 字段 | 填写内容 |
| --- | --- |
| Sender email | 已开启 SMTP 的完整 QQ 邮箱地址 |
| Sender name | 生意账本 |
| Host | smtp.qq.com |
| Port | 465 |
| Username | 与 Sender email 相同的完整邮箱地址 |
| Password | QQ 邮箱生成的授权码，不是邮箱登录密码 |

保存后测试实际送达；个人邮箱可能有发送频率或风控限制。服务商拒绝发送时按其提示处理。

Templates 保留默认链接 `{{ .ConfirmationURL }}`，不要替换成网站首页。注册使用 Confirm sign up，找回密码使用 Reset password。

## 验证流程

现有账号无需重新注册：输入邮箱 → 忘记密码 → 打开最新邮件链接 → 设置新密码 → 退出并用新密码登录。不要删除用户。

新账号：注册 → 收验证邮件 → 点击确认 → 密码登录。

代码逻辑已通过模拟测试；SMTP 送达和真实邮箱链接需要配置后实际验证，不能以代码测试代替。

参考：[Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp)、[密码找回](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)、[腾讯 SMTP 参数](https://main.qcloudimg.com/raw/document/product/pdf/1270_46586_cn.pdf)。
