---
slug: "lhospital-rule-remark"
title: "洛必达法则使用注意事项"
subtitle: "洛必达的条件是最严格的"
summary: "洛必达两种情形的不同条件"
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
uploaded_at: "2026-10-22T05:08:08.472Z"
published_at: "2026-10-22T05:08:09.048Z"
updated_at: "2026-10-22T05:08:09.048Z"
publication_id: "1543fd28-4db0-4a0a-b986-d4c8804b1864"
author: "oslemoncat"
author_id: "github:313387258"
---
# 第二部分　洛必达法则

**记号**（以下区间均为实数区间，且 $a<b$）：

- $C[a,b]$：在 $[a,b]$ 连续；$D(a,b)$：在 $(a,b)$ 内可导。
- $\overline{\mathbb R}=\mathbb R\cup\{-\infty,+\infty\}$。
- $f^{(0)}=f$；$f^{(k)}$ 为 $k$ 阶导数；$o(\cdot),O(\cdot)$ 均相对于指定极限过程。

---

以下先以 $x\to a^+$、$a\in\mathbb R$ 为准；$x\to a^-$、$x\to\pm\infty$ 有相应形式。$g'\neq0$ 的要求总是在考察的去心邻域或无穷区间内成立。

## 4. $\boldsymbol{0/0}$ 型

**条件**：存在 $\delta>0$，使

$$
\begin{cases}
f,g\in D(a,a+\delta),\\[2pt]
\displaystyle\lim_{x\to a^+}f(x)=\lim_{x\to a^+}g(x)=0,\\[3pt]
g'(x)\neq0\quad (a<x<a+\delta),\\[3pt]
\displaystyle\lim_{x\to a^+}\frac{f'(x)}{g'(x)}=L\in\overline{\mathbb R}.
\end{cases}
$$

**结论**

$$
\boxed{\lim_{x\to a^+}\frac{f(x)}{g(x)}=L.}
$$

同理适用于单侧及无穷远点；双侧结论还要求左右所得极限一致。

## 5. 分母趋于无穷型（不要求分子趋于无穷）

**条件**：存在 $\delta>0$，使

$$
\begin{cases}
f,g\in D(a,a+\delta),\\[2pt]
\displaystyle\lim_{x\to a^+}|g(x)|=+\infty,\\[3pt]
g'(x)\neq0\quad(a<x<a+\delta),\\[3pt]
\displaystyle\lim_{x\to a^+}\frac{f'(x)}{g'(x)}=L\in\overline{\mathbb R}.
\end{cases}
$$

**结论**

$$
\boxed{\lim_{x\to a^+}\frac{f(x)}{g(x)}=L.}
$$

特别地，**不要求** $\lim|f(x)|=+\infty$，也不要求 $\lim f(x)$ 存在。

例：

$$
f(x)=1+x,\quad g(x)=\frac1x,\quad x\to0^+;
\qquad \frac{f'(x)}{g'(x)}=-x^2\to0,
\qquad \frac{f(x)}{g(x)}=x+x^2\to0.
$$

---

## 证明 4：洛必达 $0/0$ 型

**有限端点，右侧极限。** 补定义 $f(a)=g(a)=0$，则对充分接近 $a$ 的 $x>a$，

$$
f,g\in C[a,x]\cap D(a,x).
$$

由柯西中值定理及 $g'\neq0$，

$$
\exists\,\xi_x\in(a,x):\qquad
\frac{f(x)}{g(x)}=\frac{f'(\xi_x)}{g'(\xi_x)}.
$$

$$
a<\xi_x<x\xrightarrow[x\to a^+]{}a
\quad\Longrightarrow\quad \xi_x\to a^+.
$$

由导数之比极限（含 $\pm\infty$），

$$
\boxed{\lim_{x\to a^+}\frac{f(x)}{g(x)}=L}.
$$

**当 $x\to+\infty$。** 给定足够大的 $x$，对任意 $y>x$ 应用柯西中值定理：

$$
\frac{f(y)-f(x)}{g(y)-g(x)}=\frac{f'(\xi)}{g'(\xi)},\qquad x<\xi<y.
$$

导数之比的极限保证：当 $x$ 充分大时，上式右侧对所有 $y>x$ 一致接近 $L$（若 $L=\pm\infty$，则满足对应的任意阈值不等式）。固定 $x$，令 $y\to+\infty$，由 $f(y),g(y)\to0$，

$$
\frac{f(y)-f(x)}{g(y)-g(x)}\to\frac{-f(x)}{-g(x)}=\frac{f(x)}{g(x)}.
$$

因此 $f(x)/g(x)\to L$。$x\to-\infty$ 及左侧端点同理。$\square$

## 证明 5：洛必达分母趋于无穷型

先设 $L\in\mathbb R$。任取 $\varepsilon>0$，选 $\delta>0$，使

$$
a<t<a+\delta\quad\Longrightarrow\quad
\left|\frac{f'(t)}{g'(t)}-L\right|<\varepsilon.
$$

固定 $b\in(a,a+\delta)$。对 $a<x<b$，由柯西中值定理，令

$$
Q(x)=\frac{f(x)-f(b)}{g(x)-g(b)}=\frac{f'(\xi_x)}{g'(\xi_x)},
\qquad \xi_x\in(x,b),
$$

得

$$
|Q(x)-L|<\varepsilon,\qquad |Q(x)|\le|L|+\varepsilon.
$$

恒等变形：

$$
\frac{f(x)}{g(x)}
=Q(x)\left(1-\frac{g(b)}{g(x)}\right)+\frac{f(b)}{g(x)}.
$$

因 $|g(x)|\to\infty$，

$$
\frac{g(b)}{g(x)}\to0,\qquad \frac{f(b)}{g(x)}\to0.
$$

故

$$
\limsup_{x\to a^+}\left|\frac{f(x)}{g(x)}-L\right|\le\varepsilon.
$$

令 $\varepsilon\downarrow0$：

$$
\boxed{\frac{f(x)}{g(x)}\to L}.
$$

若 $L=+\infty$：对任意 $M>0$，选 $b$ 使得 $Q(x)>4M$（$a<x<b$）。再由 $|g(x)|\to\infty$，取 $x$ 充分靠近 $a$，使

$$
1-\frac{g(b)}{g(x)}>\frac12,
\qquad \frac{f(b)}{g(x)}>-M.
$$

则

$$
\frac{f(x)}{g(x)}>4M\cdot\frac12-M=M.
$$

故 $f/g\to+\infty$；$L=-\infty$ 可对 $-f$ 应用上述结论。对 $x\to\pm\infty$ 固定尾部一点 $b$，使用同一恒等式。全过程不需 $|f(x)|\to\infty$。$\square$
