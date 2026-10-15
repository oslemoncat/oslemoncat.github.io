> 2026-10-15：新增管理员禁言、20 秒倒计时和 Turnstile 人机验证。上线需执行 0003、配置两项 Turnstile Key 并更新 Worker，详见 [COMMENT_PROTECTION_SETUP.md](COMMENT_PROTECTION_SETUP.md)。

> 2026-10-12：评论已加入回复功能。已有数据库请按 [COMMENT_REPLIES_SETUP.md](COMMENT_REPLIES_SETUP.md) 执行 0002 并更新 Worker；不需要删除或重建数据库。

# 文章评论上线设置

日期：2026-10-09。评论直接显示；普通用户可以编辑、删除自己的评论，管理员可以删除所有评论。评论在文章正文下方，沿用本站 GitHub 登录。

前端代码可以先上线。只有创建数据库、初始化表、绑定并更新 Worker 后，真实评论才可使用。配置前页面显示“评论尚未开放”，正文及其他功能不受影响。

## 1. 创建并初始化 D1 数据库

1. 打开 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2. 左侧 **Storage & databases → D1 SQL database**，点击 **Create database**。
3. 名称填写 **lemoncat-comments**，创建数据库。
4. 打开该数据库的 **Console**，将本地 **auth/migrations/0001_comments.sql** 的完整内容粘贴进去，点击 **Execute**。
5. 在 **Tables** 中确认存在 **comments** 和 **comment_rate_limits** 两个表。表为空是正常的；第一次发表评论后会有记录。

初始化文件只创建缺少的表和索引，没有删除语句，可以重复执行。

如果控制台报 Requests without any query，请确认粘贴内容从 CREATE TABLE 开始，不要带开头的 -- 注释。控制台可能把多行合成一行，导致整段 SQL 被注释。看到 This query successfully executed 才表示执行成功。

本地文件完整路径：D:\lemoncat_hub\auth\migrations\0001_comments.sql。

## 2. 为现有 Worker 绑定数据库

1. 进入 **Workers & Pages → lemoncat-cms-auth → Bindings**。
2. 点击 **Add binding → D1 database**。
3. **Variable name** 填 **COMMENTS_DB**，大小写必须完全一致。
4. 数据库选择刚创建的 **lemoncat-comments**，保存绑定。

这是数据库绑定，不是 Secret，也不是在“Add variable”里填写一段文字。现有 GitHub、删除授权与 DeepSeek 配置保持原值。

如果界面将 Bindings 放在 Settings 里，从 **Settings → Bindings → Add binding** 进入即可。

## 3. 更新实际 Worker 入口并 Deploy

打开该 Worker 的 **Edit code**。用下列文件的完整代码替换实际入口 **worker.js** 的内容，然后 **Deploy**：

D:\lemoncat_hub\auth\worker.mjs

不要只额外新建一个 worker.mjs 文件；必须让当前实际入口执行这份代码。

## 4. 实际验证

1. 登录网站，打开一篇文章，滚动到底部的“评论”。
2. 发表评论，刷新文章，确认仍能看到。
3. 普通用户只能对本人评论看到编辑、删除按钮；另一个账号无法删除其评论。
4. 管理员可删除所有评论；评论删除即时更新页面。
5. 每条最多 2000 字，连续发表需间隔 20 秒。发送失败会保留输入，再次发送不会重复创建已保存的评论。
6. 发表评论不写入文章仓库，不触发 Pages 构建或外部投稿检查批准。

本地已运行完整后台测试 56/56，其中评论新增 19 项；界面验证 27/27，覆盖发表、编辑、取消、删除权限、刷新保留草稿、加载更多、安全文本、网络重试、配置缺失、登录失效、390/320px 手机和深色模式。测试使用真实 Worker 处理函数、内存 SQLite 和模拟 GitHub 身份，未在正式数据库写入评论。真实 D1 部署与账号验证仍须完成。

## 数据与扩展

表保存评论 ID、文章 slug、稳定 GitHub 数字身份、发表时的用户名、纯文本、创建/更新时间。分页采用时间和 ID 游标，不依靠不稳定的偏移量。服务端校验真实身份和文章已发布状态，所有 SQL 使用参数绑定。

管理员可以删除他人评论，只有原作者可以修改文字。评论数据由 D1 保存，前端只显示安全的纯文本，支持换行。本版已提供评论回复；图片附件、点赞和邮箱账号仍未提供。

删除文章不主动清空 D1 评论；文章不存在时 API 不再显示它的评论，后续重新使用同一 slug 会关联原评论。

当前正常部署路径是 Cloudflare 网页编辑器。若改用 Wrangler CLI，部署前在 auth/wrangler.jsonc 中补上真实 d1_databases 配置；keep_vars 不会代替数据库绑定：

~~~json
{
  "d1_databases": [{
    "binding": "COMMENTS_DB",
    "database_name": "lemoncat-comments",
    "database_id": "填写实际数据库 ID",
    "migrations_dir": "migrations"
  }]
}
~~~

参考：[Cloudflare D1 创建、控制台和绑定步骤](https://developers.cloudflare.com/d1/get-started/)、[参数化查询](https://developers.cloudflare.com/d1/worker-api/prepared-statements/)。

本项目后台验证使用 Node.js 24（含内置 SQLite），无需安装额外数据库测试依赖；现有 GitHub Actions 已使用 Node.js 24。
