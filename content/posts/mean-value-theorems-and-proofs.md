---
slug: "mean-value-theorems-and-proofs"
title: "中值定理及证明"
subtitle: ""
summary: "罗尔定理、拉格朗日中值定理与柯西中值定理的条件、讨论、例子和证明。"
kind: "article"
module: "math-analysis"
tags: ["中值定理","定理条件限制"]
cover: ""
order: 0
draft: false
images: []
attachments: []
date: "2026-10-22"
updated: "2026-10-22"
uploaded_at: "2026-10-22T04:46:43.747Z"
published_at: "2026-10-22T04:46:44.392Z"
updated_at: "2026-10-22T04:46:44.392Z"
publication_id: "346ce52b-fca4-4a91-8220-0c831f4c63d0"
author: "oslemoncat"
author_id: "github:313387258"
---
# 第一部分　微分中值定理

**记号**（以下区间均为实数区间，且 $a<b$）：

- $C[a,b]$：在 $[a,b]$ 连续；$D(a,b)$：在 $(a,b)$ 内可导。
- $\overline{\mathbb R}=\mathbb R\cup\{-\infty,+\infty\}$。
- $f^{(0)}=f$；$f^{(k)}$ 为 $k$ 阶导数；$o(\cdot),O(\cdot)$ 均相对于指定极限过程。

---

## 1. 罗尔定理（Rolle's Theorem）

**条件**

$$
\boxed{f\in C[a,b],\quad f\in D(a,b),\quad f(a)=f(b).}
$$

**结论**

$$
\boxed{\exists\,\xi\in(a,b):\quad f'(\xi)=0.}
$$

## 2. 拉格朗日中值定理（Lagrange Mean Value Theorem）

**条件**

$$
\boxed{f\in C[a,b],\qquad f\in D(a,b).}
$$

**结论**

$$
\boxed{\exists\,\xi\in(a,b):\quad
f'(\xi)=\frac{f(b)-f(a)}{b-a}.}
$$

或

$$
\boxed{f(b)-f(a)=f'(\xi)(b-a).}
$$

### 2.1 导数无界、导数倒数无界

**两种情况均不影响定理成立**：定理不要求 $f'$ 连续、有界、处处非零，亦不要求 $1/f'$ 有界。

**$f'$ 无界：**

$$
f(x)=\sqrt{x},\quad x\in[0,1],\qquad
f'(x)=\frac1{2\sqrt{x}}\xrightarrow[x\to0^+]{}+\infty.
$$

$$
\frac{f(1)-f(0)}{1-0}=1=f'\!\left(\frac14\right).
$$

**$1/f'$ 无界（在 $f'\neq0$ 处定义）：**

$$
f(x)=x^3,\quad x\in[-1,1],\qquad
\frac1{f'(x)}=\frac1{3x^2}\xrightarrow[x\to0,\ x\neq0]{}+\infty.
$$

$$
\frac{f(1)-f(-1)}{2}=1=f'\!\left(\pm\frac1{\sqrt3}\right).
$$

$$
\boxed{\text{关键条件是 }f\in C[a,b]\cap D(a,b),\ \text{不是 }f'\text{ 有界。}}
$$

## 3. 柯西中值定理（Cauchy Mean Value Theorem）

**条件**

$$
\boxed{f,g\in C[a,b],\qquad f,g\in D(a,b).}
$$

**始终有效的形式**

$$
\boxed{\exists\,\xi\in(a,b):\quad
[f(b)-f(a)]g'(\xi)=[g(b)-g(a)]f'(\xi).}
$$

**比值形式的充分条件**

$$
g'(t)\neq0\quad(\forall t\in(a,b))
\ \Longrightarrow\ g(b)\neq g(a)
$$

从而

$$
\boxed{\exists\,\xi\in(a,b):\quad
\frac{f(b)-f(a)}{g(b)-g(a)}=\frac{f'(\xi)}{g'(\xi)}.}
$$

### 3.1 $g(a)=g(b)$

此时

$$
[f(b)-f(a)]g'(\xi)=0.
$$

- 若 $f(a)\neq f(b)$，则 $\boxed{g'(\xi)=0}$。
- 若 $f(a)=f(b)$，则等式为 $0=0$；交叉相乘形式仍成立，但不提供额外的导数比例。

由罗尔定理

$$
\boxed{g(a)=g(b)\Longrightarrow\exists\,\eta\in(a,b):\ g'(\eta)=0.}
$$

因此 $g(a)=g(b)$ 时，左侧比值的分母为零，**不能写为比值形式**。

### 3.2 $g(a)\neq g(b)$ 仍不足以保证比值形式

$$
\boxed{g(a)\neq g(b)\not\Longrightarrow g'(\xi)\neq0.}
$$

反例：在 $[-1,1]$ 上取 $f(t)=t^2,\ g(t)=t^3$，则

$$
\frac{f(1)-f(-1)}{g(1)-g(-1)}=0,
\qquad \frac{f'(t)}{g'(t)}=\frac{2}{3t}\quad(t\neq0).
$$

右侧在 $t\neq0$ 时不等于 $0$，在 $t=0$ 时无定义；交叉相乘形式仍成立（取 $\xi=0$）。

---

## 证明 1：罗尔定理

由 $f\in C[a,b]$，存在

$$
m=\min_{[a,b]}f,\qquad M=\max_{[a,b]}f.
$$

若 $M=m$，则 $f$ 恒定，$f'\equiv0$。

若 $M>m$，由 $f(a)=f(b)$，$M$ 或 $m$ 必在内部某点 $\xi$ 取得。以内部极大值为例：

$$
\frac{f(\xi+h)-f(\xi)}h
\begin{cases}\le0,&h>0,\\\ge0,&h<0.\end{cases}
$$

由于左右导数存在且相等，

$$
0\le f'_-(\xi)=f'(\xi)=f'_+(\xi)\le0
\Longrightarrow\boxed{f'(\xi)=0}.
$$

内部极小值同理。$\square$

## 证明 2：拉格朗日中值定理

令

$$
F(t)=f(t)-f(a)-\frac{f(b)-f(a)}{b-a}(t-a).
$$

则 $F\in C[a,b]\cap D(a,b)$，且 $F(a)=F(b)=0$。由罗尔定理，

$$
\exists\,\xi\in(a,b):\quad
0=F'(\xi)=f'(\xi)-\frac{f(b)-f(a)}{b-a}.
$$

故

$$
\boxed{f'(\xi)=\frac{f(b)-f(a)}{b-a}}.\qquad\square
$$

## 证明 3：柯西中值定理

令

$$
F(t)=[f(b)-f(a)][g(t)-g(a)]-[g(b)-g(a)][f(t)-f(a)].
$$

$$
F\in C[a,b]\cap D(a,b),\qquad F(a)=F(b)=0.
$$

由罗尔定理，

$$
\exists\,\xi\in(a,b):\quad
0=F'(\xi)=[f(b)-f(a)]g'(\xi)-[g(b)-g(a)]f'(\xi).
$$

即交叉相乘形式。若 $g'\neq0$ 于 $(a,b)$，则由罗尔定理的逆否命题得 $g(b)\neq g(a)$，故可除以两者。$\square$
