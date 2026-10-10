---
title: 用 python-docx 批量生成 Word 文档
summary: 把数据表和模板拼成一批 .docx：段落样式、表格、图片插入的常用写法，以及中文字体、页边距和批量重命名上的几个坑。
module: python
date: 2026-09-08
updated: 2026-09-08
tags:
  - Python
  - python-docx
  - 批处理
  - 自动化
cover: assets/images/python-batch-docx/cover.svg
order: 10
slug: python-batch-docx
draft: false
uploaded_at: "2026-10-08T13:59:55Z"
published_at: "2026-10-08T13:59:55Z"
---
# 需求：从一张表生成一批文档

场景很常见：手里有一份名单或成绩表（Excel / CSV），需要按统一模板
给每一行生成一份 Word 文档，最后打包提交。手工复制粘贴既慢又容易错，
这一节记录用 `python-docx` 自动化的完整写法。

## 基本骨架

```python
from pathlib import Path
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

def build_doc(record: dict, out_dir: Path) -> Path:
    doc = Document()                       # 以空白文档为基础

    h = doc.add_heading(record["title"], level=1)
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER

    p = doc.add_paragraph()
    run = p.add_run(f"作者：{record['author']}")
    run.font.size = Pt(10.5)
    run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

    doc.add_paragraph(record["body"])

    table = doc.add_table(rows=1, cols=2)
    table.style = "Table Grid"
    cells = table.rows[0].cells
    cells[0].text = "字段"
    cells[1].text = "取值"
    for key, value in record["fields"].items():
        row = table.add_row().cells
        row[0].text = str(key)
        row[1].text = str(value)

    path = out_dir / f"{record['id']}.docx"
    doc.save(path)
    return path
```

::: note 三个对象的层级
`Document` → `Paragraph` / `Table` → `Run`。
**样式只能加在 Run 上**（字号、颜色、加粗），段落级属性（对齐、缩进）加在 Paragraph 上。
搞混这两个层级是「设置了没反应」的最常见原因。
:::

## 中文字体：必须设置 eastasia

只设 `run.font.name` 对中文常常不生效，因为 Word 区分西方字体和东亚字体：

```python
from docx.oxml.ns import qn

def set_cjk_font(run, name="宋体", size=12):
    run.font.name = name                       # 西方字体
    run.font.size = Pt(size)
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)   # 东亚字体
```

页边距与默认字号可以在文档级统一设置：

```python
section = doc.sections[0]
section.top_margin = Cm(2.54)
section.bottom_margin = Cm(2.54)
section.left_margin = Cm(3.17)
section.right_margin = Cm(3.17)

style = doc.styles["Normal"]
style.font.size = Pt(12)
```

## 插入图片

```python
doc.add_picture("assets/logo.png", width=Cm(6))
last = doc.paragraphs[-1]
last.alignment = WD_ALIGN_PARAGRAPH.CENTER
```

::: tip 单位换算
`Cm`、`Pt`、`Inches`、`Emu` 都在 `docx.shared` 里。
图片不写 `width` 时会按原始像素尺寸插入，往往大得离谱，建议总是显式指定宽度。
:::

## 批处理：先读表，再循环

```python
import csv
from pathlib import Path

out_dir = Path("out")
out_dir.mkdir(exist_ok=True)

with open("data.csv", encoding="utf-8-sig", newline="") as fp:
    for record in csv.DictReader(fp):
        path = build_doc(record, out_dir)
        print("已生成", path)
```

`encoding="utf-8-sig"` 用来吃掉 Excel 导出 CSV 时带的 BOM，
否则第一列的表头会多出一个看不见的 `\ufeff`，导致按列名取值失败。

## 常见问题排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 中文变成方框或字体没变 | 只设了 `font.name` | 补设 `w:eastAsia` |
| `KeyError: 'xxx'` | CSV 表头带 BOM 或空格 | 用 `utf-8-sig`，并 `strip()` 表头 |
| 表格边框丢失 | 未指定 `table.style` | 用 `"Table Grid"` |
| 文件名含 `/` `:` 保存失败 | 非法字符 | 用正则替换为 `_` |
| 内存暴涨 | 循环里反复 `Document()` 未释放 | 每份用完即 `doc.save()` 并让变量离开作用域 |

::: example 文件名清洗
```python
import re
def safe_name(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', "_", name).strip() or "untitled"
```
:::

::: warn 不要用 python-docx 打开 .doc
它只支持 `.docx`（OOXML）。老式 `.doc` 是二进制格式，需要先另存为 `.docx`，
或改用 LibreOffice 命令行转换：

```bash
soffice --headless --convert-to docx 旧文件.doc
```
:::
