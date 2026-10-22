---
slug: "taylor-formula"
title: "泰勒公式细节性问题讨论"
subtitle: ""
summary: "这是适用性最强的公式，但是条件也比较严苛"
kind: "article"
module: "math-analysis"
tags: ["定理条件限制"]
cover: ""
order: 0
draft: false
images: []
attachments: []
date: "2026-10-22"
updated: "2026-10-22"
uploaded_at: "2026-10-22T14:02:33.285Z"
published_at: "2026-10-22T14:02:33.951Z"
updated_at: "2026-10-22T14:02:33.951Z"
publication_id: "98063c27-ba87-41c0-9834-276b409aa0e3"
author: "oslemoncat"
author_id: "github:313387258"
---
# 第三部分　泰勒公式

**记号**（以下区间均为实数区间，且 $a<b$）：

- $C[a,b]$：在 $[a,b]$ 连续；$D(a,b)$：在 $(a,b)$ 内可导。
- $\overline{\mathbb R}=\mathbb R\cup\{-\infty,+\infty\}$。
- $f^{(0)}=f$；$f^{(k)}$ 为 $k$ 阶导数；$o(\cdot),O(\cdot)$ 均相对于指定极限过程。

---

## 6. 皮亚诺余项（Peano Remainder）

**条件**：$n\ge1$，$f^{(n-1)}$ 在 $a$ 的某邻域内存在，且 $f^{(n-1)}$ 在 $a$ 可导；即 $f^{(n)}(a)$ 存在（$n=1$ 时仅需 $f'(a)$ 存在）。**不要求 $f^{(n)}$ 在邻域处处存在或连续。**

**结论**（$x\to a$）

$$
\boxed{
f(x)=\sum_{k=0}^{n}\frac{f^{(k)}(a)}{k!}(x-a)^k+o((x-a)^n).
}
$$

$$
R_n(x)=o((x-a)^n)
\quad\Longleftrightarrow\quad
\lim_{x\to a}\frac{R_n(x)}{(x-a)^n}=0.
$$

麦克劳林形式（$a=0$）：

$$
\boxed{f(x)=\sum_{k=0}^{n}\frac{f^{(k)}(0)}{k!}x^k+o(x^n).}
$$

## 7. 拉格朗日余项（Lagrange Remainder）

令 $I=[\min(a,x),\max(a,x)]$，$x\neq a$。

**条件**

$$
\boxed{
\begin{cases}
f,f',\ldots,f^{(n)}\text{ 在 }I\text{ 上连续（端点取相应单侧延拓）},\\
f^{(n+1)}\text{ 在 }I^\circ\text{ 内存在}.
\end{cases}}
$$

**结论**：存在 $\xi\in I^\circ$，使

$$
\boxed{
f(x)=\sum_{k=0}^{n}\frac{f^{(k)}(a)}{k!}(x-a)^k
+\frac{f^{(n+1)}(\xi)}{(n+1)!}(x-a)^{n+1}.
}
$$

$$
\boxed{R_n(x)=\frac{f^{(n+1)}(\xi)}{(n+1)!}(x-a)^{n+1}.}
$$

若 $|f^{(n+1)}(t)|\le M$（$t\in I^\circ$），则

$$
\boxed{|R_n(x)|\le\frac{M}{(n+1)!}|x-a|^{n+1}.}
$$

麦克劳林形式（$a=0$）：

$$
\boxed{f(x)=\sum_{k=0}^{n}\frac{f^{(k)}(0)}{k!}x^k
+\frac{f^{(n+1)}(\xi)}{(n+1)!}x^{n+1}.}
$$

### 7.1 两类余项的区别

| 项目 | 皮亚诺余项 | 拉格朗日余项 |
|---|---|---|
| 基本导数条件 | $f^{(n)}(a)$ 存在 | 适当的 $n+1$ 阶可导性 |
| 余项 | $o((x-a)^n)$ | $\frac{f^{(n+1)}(\xi)}{(n+1)!}(x-a)^{n+1}$ |
| 用途 | 局部渐近、求极限 | 具体截断误差 |

若 $f^{(n+1)}$ 在 $a$ 附近有界，则

$$
R_n(x)=O((x-a)^{n+1})=o((x-a)^n).
$$

---
## 证明 6：泰勒公式（皮亚诺余项）

数学归纳。$n=1$ 由导数定义：

$$
f(a+h)=f(a)+f'(a)h+o(h).
$$

假设结论对 $n-1$ 阶成立。由 $f^{(n)}(a)$ 存在，可将归纳假设应用于 $f'$：

$$
f'(t)=\sum_{k=1}^{n}\frac{f^{(k)}(a)}{(k-1)!}(t-a)^{k-1}
+o((t-a)^{n-1}).
$$

令

$$
R_n(x)=f(x)-\sum_{k=0}^{n}\frac{f^{(k)}(a)}{k!}(x-a)^k.
$$

则 $R_n(a)=0$，且

$$
R_n'(t)=o((t-a)^{n-1}).
$$

由拉格朗日中值定理，存在严格位于 $a,x$ 之间的 $\xi_x$，使

$$
R_n(x)=R_n'(\xi_x)(x-a).
$$

因 $|\xi_x-a|<|x-a|$，

$$
\left|\frac{R_n(x)}{(x-a)^n}\right|
=\left|\frac{R_n'(\xi_x)}{(\xi_x-a)^{n-1}}\right|
\left|\frac{\xi_x-a}{x-a}\right|^{n-1}
\longrightarrow0.
$$

故 $R_n(x)=o((x-a)^n)$。$\square$

## 证明 7：泰勒公式（拉格朗日余项）

不妨设 $x>a$。记

$$
T_n(t)=\sum_{k=0}^{n}\frac{f^{(k)}(a)}{k!}(t-a)^k,
\qquad K=\frac{f(x)-T_n(x)}{(x-a)^{n+1}}.
$$

构造

$$
F(t)=f(t)-T_n(t)-K(t-a)^{n+1}.
$$

由条件，

$$
F(a)=F(x)=0,\qquad F^{(k)}(a)=0\quad(k=1,\ldots,n).
$$

连续 $n+1$ 次应用罗尔定理，得到

$$
\exists\,\xi\in(a,x):\quad F^{(n+1)}(\xi)=0.
$$

而

$$
F^{(n+1)}(t)=f^{(n+1)}(t)-(n+1)!K.
$$

因此

$$
K=\frac{f^{(n+1)}(\xi)}{(n+1)!},
$$

代回 $K$ 得

$$
\boxed{f(x)=T_n(x)+\frac{f^{(n+1)}(\xi)}{(n+1)!}(x-a)^{n+1}}.
$$

$x<a$ 同理。$\square$
