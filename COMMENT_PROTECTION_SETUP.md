# 评论防刷与标签折叠（2026-10-15）

本次标签控件在模块、搜索和写作区共用：历史标签默认收起，点击展开后在固定高度内上下滚动；可以搜索历史标签。已选标签始终在收纳区外显示。

评论及回复共用每账号 20 秒发送间隔，跨文章、刷新网页、删除后仍生效；界面显示倒计时，后台使用 D1 原子写入校验。管理员在评论下点击“禁言”，再次确认后生效；在“禁言管理”中解除。禁言绑定 GitHub 数字 ID，修改用户名不会解除。被禁言者可以阅读、删除自己的评论，但不能新增、回复或编辑；管理员不能禁言自己。

## Cloudflare 需要完成的设置

1. 打开现有 **lemoncat-comments → Console**，执行 **D:\\lemoncat_hub\\auth\\migrations\\0003_comment_protection.sql** 全文。看到执行成功即可。它只增加禁言表，可重复执行，已有评论和回复保留。0001 和 0002 已执行过则无需重做；不要删库重建。
2. 打开 **Cloudflare → Turnstile**，创建一个 widget，名称可用 **lemoncat-comments**，选择 **Managed**，允许的主机名填写 **oslemoncat.github.io**（不带 https、斜杠或路径）。无需更换网站域名或托管方式。
3. 在 **lemoncat-cms-auth → Settings → Runtime variables and secrets** 添加：

| 名称 | 类型 | 内容 |
| --- | --- | --- |
| TURNSTILE_SITE_KEY | 普通 Variable | 创建 widget 后的 Site key |
| TURNSTILE_SECRET_KEY | Secret | 同一 widget 的 Secret key |

不要使用官方演示/测试 Key 上线。Secret 只保存在 Cloudflare，不放仓库、聊天或前端。
4. 在 **Edit code** 用 **D:\\lemoncat_hub\\auth\\worker.mjs** 全文替换实际入口 **worker.js**，点击 **Deploy**；保留现有 GitHub 变量、Secret 和 COMMENTS_DB 绑定。不要仅新增一个不执行的 worker.mjs。
5. 刷新网站后检查评论区：完成人机验证才可提交；发表成功后显示 20 秒倒计时；普通账号被禁言后不能发送，管理员解除后恢复。

如果配置未完成，已有评论仍可阅读，新发言和编辑会暂停，并显示配置提示；不会自动跳过防护。旧 Worker 没有返回防护配置时，新前端也会暂停提交。网站文件上传、Pages 成功、D1 初始化及 Worker 部署是不同步骤。

## 实现与边界

- 人机验证用于新增评论、回复和编辑；查看评论、删除本人评论及管理员解除禁言不要求验证码。
- 后台调用 Cloudflare Siteverify，核对 success、本站 hostname、comment action 及真实账号 cdata。令牌最长 2048 字、一次使用；过期、网络失败或配置错误均拒绝写入。前端加载失败可重新验证，失败保留草稿。
- 同一次已保存的发表请求可以安全重试，后台返回已有评论，不重复写入、不再次兑换令牌。
- 禁言管理接口只对经 GitHub 验证的管理员开放。目标来自实际评论作者，客户端提交的角色/作者字段不能改变目标。
- 禁言和评论插入/编辑都检查数字身份；并发禁言不能仅靠已有网页按钮绕过。
- 这三项是应用层防刷。分布式请求洪泛的入口限流、小时/日配额和广告重复检测尚未加入，本次没有扩大任务范围。
- 本地浏览器的人机验证使用隔离模拟适配器，验证界面和服务端处理；正式 Turnstile 域名、Key 和真实账号仍需上述上线验证。

参考：[服务端验证](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)、[创建 widget](https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/)、[测试与正式 Key 区别](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)。
