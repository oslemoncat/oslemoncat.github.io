---
slug: "daily"
title: "codex换源Deepseek问题解决"
subtitle: ""
summary: "记录了最近codex更新导致deepseek源无法使用的解决方案，建议还是充Chat GPT账号，减少性能阉割"
kind: "article"
tags: ["codex","更新维护问题"]
cover: ""
order: 0
draft: false
images: []
attachments: []
module: "forum"
date: "2026-10-19"
updated: "2026-10-19"
uploaded_at: "2026-10-18T06:25:18.436Z"
published_at: "2026-10-19T01:37:59.793Z"
updated_at: "2026-10-19T01:37:59.793Z"
publication_id: "6b14f34f-5eb4-4267-826c-23f40663c538"
author: "LJH1011-07"
author_id: "github:330442261"
---
# Codex 报错修复说明

## 一句话总结

之前用 Codex 时弹的 `Work browser access requires an authenticated account`，是因为一个「对话展示模式」选错了，改回默认就好了。

---

## 打个比方

Codex 桌面端有几种「怎么显示对话过程」的模式：

| 模式 | 说明 | 谁能用 |
|---|---|---|
| **Steps + Commands**（步骤 + 命令） | 普通模式，一步步列命令 | ✅ 所有人 |
| **Steps + Prose**（步骤 + 叙述） | 豪华模式，带 ChatGPT 那种大段叙述文字 | ❗ 要绑定 ChatGPT 账号 |

你的模型接的是 **DeepSeek**（只用 API Key，**没有 ChatGPT 账号**）。但你的展示模式被设成了 **Steps + Prose**。

于是每次 Codex 要渲染叙述时都去找 ChatGPT 账号 → 找不到 → 报错。就像拿着一张普通门票，却去排了「VIP 专属通道」的队，被拦在门口。

---

## 改了什么

就一处关键改动，在配置文件 `config.toml` 第 14 行：

```
conversationDetailMode = "STEPS_PROSE"    ← 之前（豪华叙述模式）
conversationDetailMode = "STEPS_COMMANDS" ← 现在（普通命令模式）
```

一句话：**把「豪华叙述模式」切回了「普通命令模式」。**

另外顺手把三个本来就为 ChatGPT 账号准备的插件也关掉了（浏览器、计算机操作等），你 DeepSeek 用不上，关了更干净，不影响正常使用。

---

## 你需要做的

1. 重新打开 Codex。
2. 正常回复 / 提交一条消息。
3. 看看还有没有那条报错。
   - 没了 → 搞定 ✅
   - 还有 → 把新报错发我，我继续查。

---

## 会有啥不一样

- 对话过程从「步骤 + 大段叙述文字」变成「步骤 + 命令列表」。
- **功能完全不受影响**，只是显示风格变了。

## 小提醒

如果你就是喜欢那种「带叙述文字」的漂亮样式，那必须登录一个 ChatGPT 账号才能用——DeepSeek 纯 API Key 这条路走不了，两者只能二选一。

---

## 以后想自己手动改（不用我）

以后又遇到同样的问题，或者想自己切换显示模式，照下面做就行：

### 第 1 步：完全退出 Codex

桌面端、CLI 全部退出，**包括右下角系统托盘里的小图标**（右键 → 退出）。

> 不退出就改的话，Codex 退出时会把你的修改覆盖回去，等于白改。

### 第 2 步：打开配置文件

用记事本或 VS Code 打开这个文件：

```
C:\Users\李葭晖\.codex\config.toml
```

### 第 3 步：找到这一行（大约第 14 行）

```toml
conversationDetailMode = "STEPS_PROSE"
```

### 第 4 步：改成下面任意一个值

| 改成 | 效果 |
|---|---|
| `STEPS_COMMANDS` | 普通命令模式（默认，推荐 ✅） |
| `STEPS_EXECUTION` | 更精简，只显示执行步骤 |
| `STEPS_PROSE` | 豪华叙述模式（要 ChatGPT 账号，DeepSeek 用不了） |

例如改成：

```toml
conversationDetailMode = "STEPS_COMMANDS"
```

### 第 5 步：保存 → 重新打开 Codex

搞定。以后想换回来，照同样方法把值改回去即可。
