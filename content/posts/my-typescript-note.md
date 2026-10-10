---
slug: "my-typescript-note"
title: "Learn TypeScript"
summary: "关于typescript的学习笔记"
module: "programming"
date: "2026-10-10"
updated: "2026-10-10"
tags: ["typescript","网站编写","基础"]
cover: ""
order: 0
draft: false
images: []
attachments: []
author: "LJH1011-07"
author_id: "github:330442261"
---
# TypeScript 基础学习笔记

> 学习链接：[B 站视频](https://www.bilibili.com/video/BV1VZaz6UEMG/?spm_id_from=333.1391.0.0&vd_source=b17d5957e57cdb00e7ea13ec412c67b8)  
> 原视频：[YouTube](https://www.youtube.com/watch?v=30LWjhZzg50)

本文是 TypeScript 入门学习笔记。为了方便阅读，原代码中的注释已经整理为正文，示例代码统一放在代码块中。

## 目录

- [1. 变量与基础类型](#1-变量与基础类型)
- [2. 函数参数与返回类型](#2-函数参数与返回类型)
- [3. 空函数、默认参数与箭头函数](#3-空函数默认参数与箭头函数)
- [4. 类型保护示例](#4-类型保护示例)
- [5. const 与 let 定义函数](#5-const-与-let-定义函数)
- [6. map](#6-map)
- [7. map 与 forEach](#7-map-与-foreach)
- [8. throw、Error 与 never](#8-throwerror-与-never)
- [9. 对象类型与 type](#9-对象类型与-type)
- [10. 数组类型](#10-数组类型)
- [11. 二维数组](#11-二维数组)
- [12. 联合类型与类型收窄](#12-联合类型与类型收窄)
- [13. 数组中的联合类型](#13-数组中的联合类型)
- [14. 字面量联合类型](#14-字面量联合类型)
- [15. 元组](#15-元组)
- [16. 核心记忆](#16-核心记忆)

## 1. 变量与基础类型

```ts
let a: string;
let c: number;
let d: boolean;

let b = {
  name: "李四",
  age: 18,
};

a = "hello";
a = a.toUpperCase();

console.log(a);
console.log(`我是${b.name}，我今年${b.age}岁`);
```

变量声明的基本格式：

```ts
let 变量名: 类型 = 变量值;
```

常用基础类型：

```text
string    字符串
number    数字
boolean   布尔值
```

TypeScript 可以自动推断类型。例如 `b` 会被推断为具有 `name: string` 和 `age: number` 的对象。

模板字符串使用反引号，而不是单引号或双引号。

输出结果：

```text
HELLO
我是李四，我今年18岁
```

## 2. 函数参数与返回类型

```ts
function addTwo(num: number) {
  return num + 2;
}

console.log(addTwo(5));

function getUp(val: string) {
  return val.toUpperCase();
}

console.log(getUp("ljh"));
```

函数参数建议显式标注类型。返回值可以由 TypeScript 自动推断，但为了可读性和检查效果，也可以显式写明返回类型。

```ts
function addTwo(num: number): number {
  return num + 2;
}

function getUp(val: string): string {
  return val.toUpperCase();
}
```

## 3. 空函数、默认参数与箭头函数

```ts
function uploadUser(
  name: string,
  email: string,
  isPaid: boolean
): void {}

let loginUser = (
  name: string,
  email: string,
  isPaid: boolean = false
): void => {};

loginUser("h", "h@h.com");
```

`isPaid: boolean = false` 表示默认值。调用时可以省略第三个参数：

```ts
loginUser("张三", "zhangsan@example.com");
```

箭头函数语法：

```ts
const 函数名 = (参数: 类型): 返回类型 => {
  return 返回值;
};
```

如果函数体只有一条表达式，可以省略花括号和 `return`：

```ts
const double = (num: number): number => num * 2;
```

返回对象时，对象外面需要括号：

```ts
const createUser = (name: string) => ({
  name,
  age: 18,
});
```

## 4. 类型保护示例

下面这个函数本意是返回布尔值，但其中一条分支返回了字符串：

```ts
// function getValue(myVal: number): boolean {
//   if (myVal > 5) {
//     return true;
//   }
//
//   return "200 Ok";
// }
```

TypeScript 会阻止这种写法，因为函数声明返回 `boolean`，但实际可能返回 `string`。

## 5. const 与 let 定义函数

```ts
const getHello = (s: string): string => {
  return `Hello, ${s}`;
};

console.log(getHello("张三"));
```

上面代码等价于：

```ts
function getHello(s: string): string {
  return `Hello, ${s}`;
}
```

使用 `const` 时，不能重新给变量赋值：

```ts
const getHello = (s: string): string => {
  return `Hello, ${s}`;
};

// getHello = (s: string): string => `Hi, ${s}`; // 报错
```

如果确实需要替换函数，可以使用 `let`：

```ts
let getHello2 = (s: string): string => {
  return `Hello, ${s}`;
};

getHello2 = (s: string): string => {
  return `Hi, ${s}`;
};

console.log(getHello2("张三")); // Hi, 张三
```

实际开发中优先使用 `const`，因为这样可以防止函数被意外替换。

## 6. map

```ts
const heros = ["ironman", "batman", "spiderman"];

const heroMessages = heros.map((hero) => {
  return `hero is ${hero}`;
});

console.log(heroMessages);
```

`map` 的作用是遍历数组，把每个元素转换成新元素，最后返回一个新数组。

也可以显式标注回调函数的返回类型：

```ts
const heroMessages = heros.map((hero): string => {
  return `hero is ${hero}`;
});
```

需要注意，方法名是 `map`，不是 `Map`。

## 7. map 与 forEach

```ts
const numbers = [1, 2, 3];

const doubled = numbers.map((number) => number * 2);
console.log(doubled); // [2, 4, 6]

const result = numbers.forEach((number) => {
  console.log(number);
});

console.log(result); // undefined
```

两者区别：

| 方法 | 用途 | 返回值 |
|---|---|---|
| `map` | 转换每个元素 | 新数组 |
| `forEach` | 遍历并执行操作 | `undefined` |

在 `forEach` 中使用 `return`，只会跳过当前一次回调：

```ts
numbers.forEach((number) => {
  if (number === 2) {
    return;
  }

  console.log(number);
});
```

`forEach` 不能直接使用 `break`。需要提前停止时，可以使用 `for...of`、`some` 或 `every`。

## 8. throw、Error 与 never

```ts
function printError(errmsg: string): never {
  throw new Error(errmsg);
}

// printError("404 not found");
```

`throw` 会立即中断当前执行流程，并抛出一个错误。`never` 表示这个函数永远不会正常返回。

如果需要在抛出错误后继续执行，可以使用 `try...catch`：

```ts
try {
  printError("404 not found");
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  }
}
```

注意：如果在文件顶层直接调用一个返回 `never` 并且必然抛错的函数，它后面的代码会被 TypeScript 视为不可达代码。因此测试时最好注释掉，或者使用 `try...catch` 捕获。

## 9. 对象类型与 type

```ts
type User = {
  name: string;
  email: string;
  isActive: boolean;
};

type MyUser = User;

function createUser(user: MyUser): User {
  return {
    name: "",
    email: "",
    isActive: true,
  };
}
```

对象类型字段之间可以使用分号或逗号，推荐使用分号：

```ts
type User = {
  name: string;
  email: string;
  isActive: boolean;
};
```

函数参数列表使用逗号：

```ts
function createUser(
  name: string,
  email: string,
  isActive: boolean
): User {
  return {
    name,
    email,
    isActive,
  };
}
```

也支持直接写返回对象类型：

```ts
function createCourse(): { name: string; price: number } {
  return {
    name: "ljh",
    price: 1011,
  };
}
```

## 10. 数组类型

```ts
const superHeros: string[] = [];
const heroPower: Array<number> = [];

superHeros.push("spiderMan");
```

两种数组类型写法：

```ts
const names: string[] = [];
const scores: Array<number> = [];
```

数组常用方法：

```ts
superHeros.push("ironman"); // 添加元素
superHeros.pop();           // 删除末尾元素
```

`const` 数组不能被重新赋值，但可以修改数组内部：

```ts
const superHeros: string[] = [];

superHeros.push("spiderMan"); // 可以
superHeros[0] = "batman";     // 可以

// superHeros = ["ironman"];  // 报错
```

如果想禁止修改数组内部，可以使用 `readonly`：

```ts
const superHeros: readonly string[] = ["spiderMan"];

// superHeros.push("ironman"); // 报错
```

也可以使用 `as const`：

```ts
const superHeros = ["spiderMan"] as const;

// superHeros.push("ironman"); // 报错
```

## 11. 二维数组

```ts
const arr: number[][] = [
  [1, 2, 3],
  [1, 3, 4],
];
```

`number[][]` 表示“数字数组组成的数组”，也就是二维数组。

## 12. 联合类型与类型收窄

```ts
let score: number | string;

score = 22;
score = "A";

if (typeof score === "string") {
  score.toLowerCase();
}
```

联合类型表示一个变量可能有多种类型：

```ts
let 变量名: 类型1 | 类型2 = 变量值;
```

`typeof score === "string"` 会在当前代码块内把 `score` 收窄为 `string`，所以可以安全调用 `toLowerCase()`。

## 13. 数组中的联合类型

```ts
const data: (number | string)[] = ["1", "2", "3", 1, 2, 3];
```

`(number | string)[]` 表示数组中的每个元素都可以是数字或字符串。

## 14. 字面量联合类型

```ts
let rate: "A" | "B" | "C";

rate = "A";
rate = "B";

// rate = "D"; // 报错
```

字面量联合类型可以限制变量只能使用指定值，可以用它表示固定状态、等级或模式。

## 15. 元组

```ts
let lst: [string, number, boolean];

lst = ["a", 0, true];

lst.push(true);
lst.push(0);
lst.push("a");

// lst = ["a", true, 0]; // 报错
```

元组要求元素的数量和类型顺序一一对应。

常见应用：

```ts
let rgb: [number, number, number] = [255, 255, 255];
```

需要注意，普通元组的 `push` 仍然可以添加元组中允许的元素类型，可能破坏原本的结构。如果希望元组完全固定，可以使用 `readonly` 或 `as const`。

## 16. 核心记忆

```text
let 变量名: 类型 = 值;             声明变量
let 变量名: 类型1 | 类型2;         联合类型
function 函数名(参数: 类型): 返回类型 {}
const 函数名 = (参数: 类型): 返回类型 => {}
map                                 转换并返回新数组
forEach                             遍历并执行操作，返回 undefined
throw new Error(...)               抛出错误并中断当前流程
type User = { ... }                定义对象类型
[string, number]                   元组，顺序和类型固定
```
## 未完待续
