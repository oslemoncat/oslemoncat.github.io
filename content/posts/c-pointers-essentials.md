---
title: C 语言指针要点：从内存模型到考试易错点
summary: 把指针讲成「地址 + 类型」两件事，梳理指针与数组的关系、函数参数的值传递陷阱、字符串操作，以及 free 之后的悬空指针问题。
module: programming
date: 2026-09-21
updated: 2026-09-21
tags:
  - C 语言
  - 指针
  - 内存
  - 期中复习
cover: assets/images/c-pointers-essentials/cover.svg
order: 10
slug: c-pointers-essentials
draft: false
uploaded_at: "2026-10-08T13:59:55Z"
published_at: "2026-10-08T13:59:55Z"
---
# 指针就是「地址 + 类型」

考试里指针题出错，绝大多数不是因为不会语法，而是因为漏了其中一半：
只记住「指针存地址」，忘了「指针有类型」。类型决定了三件事——
解引用时读几个字节、`+1` 前进多少、以及和其它指针比较运算时的行为。

```c
int    a = 42;
int   *p = &a;        /* p 的类型是 int*，*p 是 int */

printf("%p\n", (void *)p);   /* 地址 */
printf("%d\n", *p);          /* 解引用：读 4 个字节并按 int 解释 */
```

::: definition 定义
指针是一个变量，其值是某个对象的内存地址。指针的类型（如 `int *`）说明
这个地址指向的对象是什么类型。
:::

::: key & 与 * 是互逆操作
`&a` 取出 a 的地址，`*p` 取出 p 指向的对象。因此 `*&a` 就是 `a`，
而 `&*p` 就是 `p`（前提是 p 有效）。
:::

## 指针与数组：退化与等价写法

在表达式中，数组名会**退化**为指向首元素的指针，因此下面几种写法等价：

```c
int arr[5] = {1, 2, 3, 4, 5};
int *p = arr;          /* 等价于 &arr[0] */

arr[i]  ==  *(arr + i)
p[i]    ==  *(p + i)
```

但两者并不完全相同，这是最常考的区分点：

| 比较项 | 数组 `int arr[5]` | 指针 `int *p` |
| --- | --- | --- |
| `sizeof` | 20（整个数组） | 8（64 位下指针本身） |
| 可否赋值 | 不能 `arr = ...` | 可以 `p = ...` |
| 作为函数参数 | 退化为指针 | 本来就是指针 |

::: warn sizeof 陷阱
在函数内部 `sizeof(arr)` 得到的是**指针大小**而不是数组大小。
如果函数需要知道长度，必须额外传一个参数：

```c
void print_all(const int *arr, size_t n) {
    for (size_t i = 0; i < n; ++i) printf("%d ", arr[i]);
}
```
:::

## 值传递：为什么交换函数不生效

C 的函数参数一律是值传递。传指针时，复制的是地址值，
所以「能改指向的内容，不能改指针自身」。

```c
void swap_wrong(int a, int b)  { int t = a; a = b; b = t; }   /* 无效 */

void swap_ok(int *a, int *b)   { int t = *a; *a = *b; *b = t; } /* 有效 */

void swap_still_wrong(int *a, int *b) { int *t = a; a = b; b = t; } /* 只换了副本 */
```

::: example 例题
指出下面代码的问题：

```c
char *get_name(void) {
    char buf[32];
    strcpy(buf, "oslemoncat");
    return buf;
}
```
:::

::: solution 解答
`buf` 是**局部数组**，函数返回时它的生命周期结束，返回的地址变成悬空指针。
调用方使用它属于未定义行为。三种正确做法：

1. 由调用方提供缓冲区：`void get_name(char *out, size_t n)`；
2. 返回动态内存，并明确由调用方 `free`：`char *buf = malloc(32);`；
3. 返回字符串字面量（只读）：`return "oslemoncat";` —— 此时类型最好写 `const char *`。
   $\blacksquare$
:::

## 字符串：不要写进只读区

```c
char s1[] = "hello";   /* 栈上数组，可修改 */
char *s2  = "hello";   /* 指向字符串字面量，通常是只读段 */

s1[0] = 'H';   /* 合法 */
s2[0] = 'H';   /* 未定义行为，很多平台直接段错误 */
```

处理字符串的函数原型里经常出现 `const char *`，意思正是「我只看，不改」：

```c
size_t strlen(const char *s);
```

## 内存管理：malloc / free 的配对与次序

```c
int *p = malloc(n * sizeof *p);   /* sizeof *p 比写 sizeof(int) 更抗改动 */
if (!p) { /* 处理分配失败 */ }

/* ... 使用 p ... */

free(p);
p = NULL;      /* 关键：避免悬空指针与二次释放 */
```

::: warn 四类经典内存错误
- **内存泄漏**：`malloc` 之后忘记 `free`；
- **悬空指针**：`free` 之后继续使用（或返回局部数组的地址）；
- **二次释放**：同一块内存 `free` 两次；
- **越界写**：分配了 n 个元素却写第 n+1 个，破坏堆结构。
:::

## 指针与 const 的三种组合

| 写法 | 含义 |
| --- | --- |
| `const int *p` | 不能通过 `*p` 改内容；p 本身可改 |
| `int *const p` | p 本身不能改；可以通过 `*p` 改内容 |
| `const int *const p` | 两者都不能改 |

读法技巧：从右往左读，`const` 紧跟谁就修饰谁。

::: note 复习清单
- 能否不看笔记写出 `swap` 的正确版本，并解释为什么传指针有用？
- 能否说清 `arr` 与 `p` 的三点区别？
- 悬空指针的三种成因分别是什么？
- `const int *p` 与 `int *const p` 分别限制了什么？
:::
