# 来源层说明

`sources/` 存放的是**来源**，不是内容。这里的每一份文件都只做一件事：把一条外部资料著录清楚，让成果层的条目能挂上一个可追溯、可复核、可判定授权的引用目标。

内容合库后 `sources/` 是**全站群共享**的一层：同一份资料只有一张卡片、一个 `rights` 判定，历史、文化、街镇三站的条目都挂到同一张卡上。来源是「关于世界的证据」，不归任何一站。本文件由原先三库的三份合并而来，差异只在举例，硬规则本就一致。

## 三层目录

| 目录 | 放什么 | 对应 `archive` 取值 |
| --- | --- | --- |
| `fulltext/` | 公有领域旧志的全文或影印本归档。历代《溧水县志》属此类 | `fulltext` / `link-registered` / `catalogued-only` |
| `excerpts/` | 受版权保护资料的摘录卡：只记必要片段与出处，不整篇转录。非遗名录、报刊与学术文章多归此类 | `excerpt` |
| `records/` | 政府页面、区划批复、文保与非遗名录、传统村落名录的链接档案。只记链接、访问日期与关键表述 | `link` |

## 来源记录的字段

每份来源是一张 `.md` 卡片，front-matter 字段如下：

```yaml
id: src:njls-xzqh                      # 唯一标识，格式 src:<短名>，全局不重复
type: gov                              # 取值见 lishui-kit/schema/enums.common.json 的 sourceType
title: 溧水区人民政府网站「行政区划」
titleEn: Administrative Divisions — Lishui District People's Government
rights: gov-open                       # public-domain / gov-open / excerpt-only / link-only / permission-required
archive: link                          # fulltext / link-registered / catalogued-only / excerpt / link
publisher: 南京市溧水区人民政府          # 出版者、版本或发布机构
publisherEn: People's Government of Lishui District, Nanjing   # publisher 为中文时必填
url: http://www.njls.gov.cn/zjls/xzqh/ # 可访问地址；无在线版本的写 null 并在 note 说明
accessed: 2026-09-26                   # 访问日期，链接类来源必填
locator_hint: 页面段落与「名称/面积/政府驻地」表    # 该来源通常怎么标注位置，供条目引用时参照
note: 说明                             # 授权判断依据、存疑之处、归档状态
```

## 硬规则

1. **`rights` 必须填，且必须是取值表里的取值之一。** 站群共用的八项取值在 `lishui-kit/schema/enums.common.json`，分站特有的在 `schema/sites/<siteId>.json`。判不准就填 `permission-required`，宁可不引。
2. **无来源的事实不进 `published`。** 条目引用的每一个 `ref` 都必须在本目录下存在对应卡片。
3. **摘录不越界。** `rights` 为 `excerpt-only` 或 `link-only` 的来源，正文里只能引用事实与必要短句，不得整段转录；旧志原文属公有领域的，引用也需标卷次页码，不整篇搬运。
4. **链接要复核。** 政府页面会改版、名录会调整批次、行政区划会调整，`accessed` 字段用于记录核对日期；链接失效时先降级 `confidence`，再找替代来源。
5. **弱来源要显形。** 来源为资料整理页面、地方文史页、论坛、自媒体或二手转述的，`rights` 照填，但在 `note` 里写明权威性不足，并在条目里相应降低 `confidence`。主流媒体与政务融媒体的二手报道不属此类，`note` 写明「二手报道，权威性中等」即可，条目 `confidence` 不超过 `medium`。
6. **名录口径优先。** 文保单位、非遗项目、传统村落的级别、批次与公布年份，一律以官方名录页与公布文件为准；地方介绍页、答复件与新闻报道的累计数与之不一致时，正文并列呈现，不做加总改写，差异写入「存疑之处」。
7. **行政区划事实以政府公开文件为准。** 面积、驻地、下辖村社区数、撤镇设街道的时点，一律以区政府页面与省政府批复为准；地方文史页与论坛的说法只能作地名由来的线索，且必须标为传说。
