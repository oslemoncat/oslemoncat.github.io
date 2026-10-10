# Lemoncat的喵喵屋

个人学习笔记与投稿站，托管在 GitHub Pages。新版使用柠檬猫背景、奶油色与绿色界面、独立页面路径和无文字互动桌宠。保留六个知识模块和全部现有文章。

网站：<https://oslemoncat.github.io/>。本次日期、预审与附件预览更新说明：[PUBLICATION_PREVIEW_SETUP.md](PUBLICATION_PREVIEW_SETUP.md)。部署与使用说明：[PORTAL_SETUP.md](PORTAL_SETUP.md)。旧版 Decap 接入说明：[CMS_SETUP.md](CMS_SETUP.md)。**先更新 Cloudflare Worker，再部署新版网站。**

所有人使用同一个 GitHub 登录入口。普通用户编辑并提交审核，管理员审核、发布和删除文章。DeepSeek 助手可选，由管理员在 Cloudflare Secret 配置密钥。

## 目录

- `index.html`、`app.js`、`js/`：页面与路径路由；构建为各页面生成独立的 HTML 入口。
- `assets/css/`：样式；`assets/images/lemoncat-background.png`：柠檬猫背景。
- `assets/js/auth.js`、`auth/worker.mjs`：前端登录与服务端权限/投稿接口。
- `lemon-cat/`：网页桌宠的脚本与透明素材，无外部依赖。
- `content/site.json`、`content/modules.json`：网站信息和知识模块。
- `content/posts/<slug>.md`：文章编辑源，包含 YAML 元信息和 Markdown 正文。
- `assets/images/uploads/`、`assets/files/uploads/`：上传资源。
- `scripts/cms-build.mjs`：生成 `dist/` 文章、索引、页面与媒体文件。
- `.github/workflows/pages.yml`：验证、构建并发布 GitHub Pages。
- `admin/`：保留的旧版管理员编辑器。

## 开发与验证

需要 Node.js 24 或以上。安装依赖后运行：

```sh
npm ci --ignore-scripts
npm run cms:test
npm run cms:build
```

构建要求 `dist/` 尚不存在，以免删除文章后留下旧的发布内容；再次本地构建前只清理这个生成目录。生产 workflow 在干净的 checkout 中运行。用静态服务器预览 `dist/`，不要双击网站 HTML。

本地 OAuth 不能替代线上登录验证，因为登录结果固定发回 `https://oslemoncat.github.io`。Worker 不包含任何密钥；命令行部署使用已授权的 Cloudflare 账号以及 `auth/wrangler.jsonc`，保留现有变量和 Secret。

文章日常维护使用写作区。直接修改源文件时保持 `slug` 与文件名一致、知识模块有效、日期有效；不要手工维护 `dist/`、生成索引或 `content/articles/`。新增模块可修改 `content/modules.json`，构建会同步后台选项。

旧的 `scripts/import_tex.py` 可粗转 LaTeX 讲义；输出是旧式正文/JSON，需人工校对后迁移成 `content/posts/<slug>.md` 的 YAML 与正文格式再发布。
## 正文支持的写法

| 语法 | 效果 |
| --- | --- |
| `## 标题` / `### 标题` | 节标题，自动进入右侧目录（`#` 与 `##` 都按节标题渲染，避免重复 h1） |
| `$x^2$`、`$$\int_a^b f(x)\,dx$$` | 行内 / 块级数学公式（KaTeX） |
| ` ```c … ``` ` | 代码块 |
| `> 引用` | 引用块 |
| `**粗体**`、`*斜体*`、`~~删除线~~` | 行内强调 |
| `[文字](链接)`、`![图注](路径)` | 链接（当前标签页）、图片 |
| 空行分隔的 `\|` 表格 | 表格 |
| `::: note/tip/warn/key 标题` … `:::` | 提示块 |
| `::: definition/theorem/example/proof 标题` … `:::` | 定理块 |
| `::: video 标题` + `url:` / `source:` / `duration:` | 视频外链卡片 |

示例：

````markdown
::: theorem 定理 2.1（单调有界定理）
单调有界数列必收敛。
:::

::: video 第 3 讲：数列极限的 ε-N 语言
url: https://www.bilibili.com/video/BVxxxx
source: Bilibili
duration: 24:10
:::
````

---

文章评论的 D1 初始化、绑定和 Worker 上线步骤见 [COMMENTS_SETUP.md](COMMENTS_SETUP.md)。
