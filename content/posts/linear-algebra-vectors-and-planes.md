---
title: 向量、平面与直线：空间解析几何的代数化
summary: 从向量的两种定义出发，推导平面的点法式与一般式、直线的参数式与对称式，并把「夹角、距离、位置关系」三类问题归约为一次计算。
module: linear-algebra
date: 2026-09-22
updated: 2026-09-22
tags:
  - 向量
  - 平面方程
  - 空间直线
  - 数量积
cover: assets/images/linear-algebra-vectors-and-planes/cover.svg
order: 10
slug: linear-algebra-vectors-and-planes
draft: false
uploaded_at: "2026-10-08T13:59:55Z"
published_at: "2026-10-08T13:59:55Z"
---
# 为什么先讲向量

空间解析几何的核心操作只有一句话：**把几何关系翻译成方程**。
翻译的工具是向量，翻译的产物是平面与直线的方程。一旦方程写出来，
「两条直线是否垂直」「点到平面有多远」这类问题就不再需要画图，而变成代入与计算。

## 向量：几何对象与代数数组

同一个对象有两种描述方式，做题时要能随时切换：

- **几何描述**：有大小、有方向的量，用有向线段表示，可以自由平移。
- **代数描述**：选定坐标系后写成 $\vec a=(a_1,a_2,a_3)$，运算按分量进行。

$$\vec a\pm\vec b=(a_1\pm b_1,\ a_2\pm b_2,\ a_3\pm b_3),\qquad
\lambda\vec a=(\lambda a_1,\lambda a_2,\lambda a_3)$$

**长度**与**方向余弦**由分量直接给出：

$$|\vec a|=\sqrt{a_1^2+a_2^2+a_3^2},\qquad
\cos\alpha=\frac{a_1}{|\vec a|},\quad \cos\beta=\frac{a_2}{|\vec a|},\quad \cos\gamma=\frac{a_3}{|\vec a|},
\qquad \cos^2\alpha+\cos^2\beta+\cos^2\gamma=1 .$$

## 两种乘法，两种用途

::: definition 数量积（内积）
$\vec a\cdot\vec b=|\vec a||\vec b|\cos\theta=a_1b_1+a_2b_2+a_3b_3$。
:::

内积的作用是**判断垂直与求夹角**：$\vec a\perp\vec b\iff\vec a\cdot\vec b=0$。

::: definition 向量积（外积）
$\vec a\times\vec b$ 是一个向量，方向由右手法则确定，模为 $|\vec a||\vec b|\sin\theta$，
即两向量张成的平行四边形面积；分量形式为

$$
\vec a\times\vec b=
\begin{vmatrix}
\vec i & \vec j & \vec k\\
a_1 & a_2 & a_3\\
b_1 & b_2 & b_3
\end{vmatrix}.
$$
:::

外积的作用是**制造垂直**：结果同时垂直于两个因子，所以求平面法向量、判定共面都靠它。

::: key 用哪个乘法，看你要什么
要夹角或投影 → 内积；要法向量或面积 → 外积；要体积或判定共面 → 混合积
$(\vec a\times\vec b)\cdot\vec c$，其绝对值等于平行六面体体积，为零即三向量共面。
:::

## 平面的点法式：一个点和一条法线足够

平面由「一个点 $M_0(x_0,y_0,z_0)$」与「一个法向量 $\vec n=(A,B,C)$」唯一确定。
设 $M(x,y,z)$ 是平面上任意点，则 $\overrightarrow{M_0M}\perp\vec n$，于是

$$
A(x-x_0)+B(y-y_0)+C(z-z_0)=0 .
$$

展开即得**一般式** $Ax+By+Cz+D=0$，其中 $(A,B,C)$ 就是法向量。反过来，
看到一般式应当立刻读出法向量——这是解空间几何题的第一反应。

::: note 特例速查
$D=0$：平面过原点；$A=0$：平面平行于 $x$ 轴；$A=B=0$：平面平行于 $xOy$ 平面。
:::

## 直线的参数式与对称式

直线由一点 $M_0$ 与一个方向向量 $\vec s=(m,n,p)$ 确定。用参数 $t$ 刻画：

$$
\begin{cases}
x=x_0+mt,\\ y=y_0+nt,\\ z=z_0+pt,
\end{cases}
\qquad\text{消去 }t\text{ 得}\qquad
\frac{x-x_0}{m}=\frac{y-y_0}{n}=\frac{z-z_0}{p}.
$$

右式称为**对称式（点向式）**。当某个分量为 $0$ 时要单独处理，例如 $m=0$ 时写成

$$
x=x_0,\qquad \frac{y-y_0}{n}=\frac{z-z_0}{p},
$$

不能真的把 $0$ 放进分母。

## 位置关系：三类问题，一个思路

| 问题类型 | 判断依据 | 计算量 |
| --- | --- | --- |
| 平面与平面 | 法向量平行 $\Rightarrow$ 平行或重合；点积为 $0$ $\Rightarrow$ 垂直 | 比较法向量 |
| 直线与平面 | 方向向量与法向量点积为 $0$ $\Rightarrow$ 平行或在平面内；平行 $\Rightarrow$ 垂直 | 一次内积 |
| 直线与直线 | 方向向量外积为零 $\Rightarrow$ 平行；否则用混合积判断共面 | 一次外积 + 混合积 |

**夹角**公式统一为「用两个方向（或法向）向量的夹角」，注意线面角取的是余角：

$$
\sin\varphi=\frac{|\vec s\cdot\vec n|}{|\vec s||\vec n|}.
$$

**距离**公式里最常用的是点到平面：

$$
d=\frac{|Ax_0+By_0+Cz_0+D|}{\sqrt{A^2+B^2+C^2}} .
$$

## 几何直观：一次分解

下面这张图把 $\vec a$ 沿平面法向 $\vec n$ 与平面内方向拆开，
这正是「点到平面距离」的几何来源：法向分量的长度就是距离。

![向量沿法向与平面内方向的分解](assets/images/linear-algebra-vectors-and-planes/vector-decomposition.svg)

把 $\vec a$ 分解为 $\vec a_{\parallel}+\vec a_{\perp}$，其中

$$
\vec a_{\perp}=\left(\frac{\vec a\cdot\vec n}{\vec n\cdot\vec n}\right)\vec n
$$

就是 $\vec a$ 在 $\vec n$ 上的**投影向量**，它的长度

$$
|\vec a_{\perp}|=\frac{|\vec a\cdot\vec n|}{|\vec n|}
$$

与上面点到平面的距离公式是同一个式子。理解这一点后，距离公式就不必死记了。

::: example 例题
求点 $P(1,2,3)$ 到平面 $2x-y+2z-6=0$ 的距离。
:::

::: solution 解答
法向量 $\vec n=(2,-1,2)$，$|\vec n|=\sqrt{4+1+4}=3$。代入公式：

$$
d=\frac{|2\cdot1-1\cdot2+2\cdot3-6|}{3}=\frac{|2-2+6-6|}{3}=0 .
$$

距离为 $0$，说明点 $P$ 在平面上。**先代入再判断**是一个好习惯：
距离算出来为 $0$ 时，往往提示题目有更简单的做法。$\blacksquare$
:::

::: warn 常见错误
- 把对称式里为 $0$ 的分量写成 $\dfrac{x-x_0}{0}$，得到无意义的分式；
- 求线面角时直接用 $\cos\varphi$，忘记线面角对应的是 $\sin\varphi$；
- 用法向量判断直线之间的关系——直线要看方向向量。
:::

::: proof 待补
本文尚未展开混合积判定异面直线、平面束方程、以及距离公式的严格推导，
计划在下一篇中补充完整推导与更多例题。
:::
