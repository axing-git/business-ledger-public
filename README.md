# 生意账本公开发布版

不包含个人账目或旧仓库历史。Supabase publishable key 是公开客户端配置，数据库通过登录和 RLS 控制访问。

发布：GitHub Desktop 添加本目录，发布为 business-ledger-public 公开仓库；仓库 Settings → Pages → Source 选择 GitHub Actions。

Supabase Authentication → URL Configuration：Site URL 和 Redirect URLs 设置为 https://axing-git.github.io/business-ledger-public/ 。邮箱登录需验证实际送达；默认邮件服务有收件人限制，如不能发送需配置 SMTP。

首次使用：在原本地版导出完整 JSON 备份；在正式网站登录并加载成功后，选择恢复账本备份。不要将备份提交到仓库。

编辑自动上传；失败草稿按账号保存在浏览器。多设备冲突会阻止覆盖，先导出备份，再刷新加载云端。退出会清空屏幕但保留未同步草稿供同账号恢复。

