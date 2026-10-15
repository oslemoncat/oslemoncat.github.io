> 2026-10-15：新增管理员禁言、20 秒倒计时和 Turnstile 人机验证。上线需执行 0003、配置两项 Turnstile Key 并更新 Worker，详见 [COMMENT_PROTECTION_SETUP.md](COMMENT_PROTECTION_SETUP.md)。

# 评论回复更新（2026-10-12）

欢迎登录页已去掉右上角重复的“登录”；登录后的头像与写作区入口保留。

## 启用回复的两步

1. 打开现有 Cloudflare D1 数据库 lemoncat-comments → Console，执行 D:/lemoncat_hub/auth/migrations/0002_comment_replies.sql 的全文。看到 This query successfully executed 才表示成功。
2. 在 lemoncat-cms-auth → Edit code，用 D:/lemoncat_hub/auth/worker.mjs 全文覆盖实际入口 worker.js，然后 Deploy。保留原变量、Secret 与 COMMENTS_DB 数据库绑定，不需要新建数据库或增加变量。

0002 仅新增 comment_links、comment_deletions 和索引，保留旧 comments 表及数据，可以重复执行。不要删除旧表、清空数据库，或重新导入评论。控制台粘贴从 CREATE TABLE 开始，不加 -- 行注释。先执行 SQL 再部署 Worker，最后刷新文章。

前端会根据后台实际支持情况显示回复按钮。旧 Worker 或尚未升级的数据库仍可普通评论，界面不会把“回复”误发成一条独立评论。

## 使用方法

打开文章，找到评论下的“回复”，输入框会显示回复对象，点“发送回复”。回复也可以继续回复，统一收在原讨论下面，并标明回复给谁。取消回复会恢复普通评论的草稿；发送失败保留当前回复草稿和重试标识。每条最多 2000 字，评论和回复共用 20 秒发言间隔。

只有原作者能编辑评论或回复；管理员可删除所有，普通用户只删自己的。删除原评论不会删除他人的回复；原文被擦除，留下“该评论已删除”位置。删除回复也会保留别人已有的后续发言。不能回复已经删除的具体评论，不能通过客户端更改作者或所属文章。

根评论按新到旧分页；每段讨论先显示三条回复，可加载更多，回复按先后顺序排列。数量统计不包括已删除内容。发回复只写 D1，不触发 GitHub Pages 部署。

## 验证

后台候选完整测试 91 项通过；其中回复新增 16 项，覆盖同文章约束、真身份、权限、同时间分页、删除留存、重试、并发不改变回复对象和事务回滚。真实 D1 和 Worker 部署需完成上述两步；隔离测试不会向正式评论库写入数据。

[D1 参数化查询与事务批次](https://developers.cloudflare.com/d1/worker-api/d1-database/)。

## 已部署后仍不能评论：先区分原因（2026-10-15）

本次将旧版评论与回复合并为同一套处理逻辑，保留旧数据库普通评论。后台完整回归 95 项通过；页面路由 75 项通过。本地浏览器已验证回复提交、缺表、未绑定及旧版提示；这些结果不等于正式数据库已验证。

使用当前 auth/worker.mjs 更新实际 worker.js 入口并 Deploy 后，管理员会看到具体原因：

- “评论未连接数据库”：检查 Worker 的 Production → Bindings，确认类型是 D1、绑定名 COMMENTS_DB、数据库是现有 lemoncat-comments。
- “评论表未初始化”：在上述绑定的数据库执行 0001_comments.sql，再执行 0002_comment_replies.sql。
- “回复表未完整创建”：在同一个绑定的数据库重新执行 0002_comment_replies.sql。
- “回复功能暂未开放”：后台返回旧版能力，核对实际部署入口和绑定数据库中的 0002 迁移。
- “评论暂时不可用”：还不能确定原因，需要对应时间的 Worker 错误和文章底部完整提示；不要反复重建数据库。
- “登录已失效”：从网站重新登录后刷新文章。

两份迁移均可重复执行，保留现有数据。不要删除数据库或旧表。不需要新增变量、Secret 或扩大权限。

可在绑定数据库的 Console 执行以下只读查询，完整升级后应返回四行：

```sql
SELECT name FROM sqlite_master
WHERE type='table'
AND name IN ('comments','comment_rate_limits','comment_links','comment_deletions')
ORDER BY name;
```

确认查询的是 Worker 当前绑定的数据库。另一个数据库里存在同名表不能证明当前绑定正确。后台健康页 ok 只表示 Worker 能响应，不能证明评论库和登录后操作正常。
