# 发布进度、预审区、只读日期与附件预览（2026-10-10）

## 本次需要设置什么

保留原有 Worker、OAuth 设置和 COMMENTS_DB 绑定。没有新增变量名称。

1. 在 GitHub 的 fine-grained personal access token 设置中，找到现有内容服务令牌；只选择 oslemoncat/oslemoncat.github.io 一个仓库。
2. Repository permissions 设置为 Contents: Read and write、Pull requests: Read and write。Metadata: Read 是 GitHub 的基础读取权限；不要为本功能增加 Actions 写入或 workflow 写入权限。
3. 如果更改权限后需要重新生成令牌，将新值填回 Cloudflare 现有 Secret GITHUB_CONTENT_TOKEN；不要写进源码或聊天。
4. Cloudflare → lemoncat-cms-auth → Edit code，选择实际入口 worker.js，用本地 auth/worker.mjs 全文覆盖，点击 Deploy。若页面带锁，返回 Worker 详情，从最新可编辑版本进入 Edit code。
5. 保留 Production 的原有变量、Secret 和 COMMENTS_DB。GitHub Pages 的部署不会自动替换 Cloudflare 的代码。

## 日常发布

- 普通用户上传后，文章与附件保存在本仓库的 lemoncat/review-数字账号ID-随机编号 分支，创建待审 PR。主站索引不会包含待审稿件。
- 作者数字 ID 和预审分支绑定在服务器签名记录中；普通用户不能编辑或撤回别人的稿件。旧 fork 投稿仍可审核。
- 管理员打开稿件，核对正文与附件，勾选“我已阅读这版稿件，确认审核通过”；指定版本的构建检查也必须通过。
- 审核时读取这个确切版本，只写入允许的文章和新增附件。文章、所有权与发布记录一次性提交到 main，避免原先合并稿件后再写作者记录的两次部署。
- PR 会关闭；这里采用核对后写入主分支的流程，GitHub 会显示 closed 而不是 merged。批准记录保存在 content/publications.json。
- 本站“审核通过”页显示已保存、检查构建、部署上线。网页 build-info.json 出现本次发布编号后才显示已上线。Github 构建成功但网页仍未更新时，继续显示等待资源更新。
- 重复审核同一个版本不会重复写入 main；仓库并发变化会拒绝本次写入，刷新后重新审核。
- 新预审投稿来自同仓库，通常不属于 fork 的人工批准检查；旧 fork 的待批运行仍要按 GitHub 的实际提示批准。没有关闭自动检查，也没有自动授予 Actions 批准权限。
- 已上线的文章仍可在“已发布文章”管理；管理员可删所有文章，普通用户可删本人文章。评论权限和登录规则保留。

## 日期与时分

date 和首次 uploaded_at、published_at 由服务端记录。写作区的首次发布日期只读，编辑文章保留首次日期与上传时间，更新时另写 updated_at。时间显示使用 Asia/Shanghai，格式为 YYYY-MM-DD HH:mm。

本次旧文章 uploaded_at/published_at 按 GitHub 主分支最早的文章保存提交补齐；保留原 date、正文和附件。旧的首次保存时间不是已经丢失的 fork 上传或浏览器到达时间，不虚构更早时间。

## 附件预览

在编辑、审核和阅读文章时展开同一个“预览”框，不打开新标签页。

| 类型 | 方式与范围 |
| --- | --- |
| PDF | 页内画布分页，可前后翻页；按需加载 PDF.js |
| Markdown / TXT | 页内正文 / 纯文本 |
| DOCX | 本地解析文字、图片和表格；内容转换为网页，复杂版式可能与 Word 不完全一致 |
| XLSX / XLS / CSV / ODS | 可选工作表，最多显示 500 行、50 列；单元格为安全文本，不执行宏或公式 |
| DOC / PPT / PPTX | 公共 HTTPS 附件使用微软联网查看器；未上传的本地文件需先上传或转成 PDF / DOCX |
| 图片、音视频、ZIP | 原有图片/音视频显示；ZIP 保留下载 |

每次文件总量最多 20 MB、最多 12 个，图片单张最多 10 MB。PDF、DOCX、表格解析器放在 assets/vendor，打开预览时加载，不依赖运行时 CDN。vendor/manifest.json 记录版本、上游来源与文件哈希，随附许可证。

## 验证范围

后台测试覆盖真实身份、跨用户拒绝、明确审核版本、检查阻止条件、首次日期保护、并发防覆盖、重复发布和页面真实上线证据。浏览器验证使用隔离账号/API 模拟，真实文章只读取；不提交测试稿件到线上。

Cloudflare 更新及扩大内容令牌权限需要在控制台完成，网页部署成功不代表这两步已经完成。DOC/PPT 在线查看器是否能从微软网络读取你的附件，也需要实际联网环境验证。

参考：[GitHub PR 接口](https://docs.github.com/en/rest/pulls/pulls)、[PDF.js](https://github.com/mozilla/pdf.js/wiki/setup-pdf.js-in-a-website)、[Mammoth](https://github.com/mwilliamson/mammoth.js)、[SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/standalone/)。
