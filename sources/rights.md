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

## 来源台账

台账由 `scripts/ledger.mjs` 现场生成，把本目录每张卡片与 `content/` 下四个分站的实际引用交叉起来，回答四个问题：有哪些来源、每份是什么性质与授权、被哪些条目用着、哪些建了还没用上。

```powershell
npm run ledger --prefix lishui          # 生成三份到 sources/
node scripts/ledger.mjs --csv           # 只出 CSV
node scripts/ledger.mjs --quiet         # 不打印统计摘要
LISHUI_LEDGER_DIR=<目录> node scripts/ledger.mjs   # 输出到别处
```

产出三份，均为派生产物、不进版本库（`.gitignore` 已排除，理由同 `dist/`）：

| 文件 | 用途 |
| --- | --- |
| `ledger.csv` | 一行一张卡片，UTF-8 带 BOM，Excel 与 pandas 直开 |
| `ledger.json` | 同数据加汇总块，供脚本与页面消费 |
| `ledger.html` | 可读视图：KPI、分层结构、机构层级、四站依赖、被引排行、未被引用清单、无链接清单、全量清单（可搜索与多维筛选，跟随系统深浅色） |

站点清单取自 `schema/sites.json`，新增分站后重跑即自动纳入。统计口径以**成果层的 `ref` 出现次数**为准；中英两稿引用同一张卡，故每站数字是条目数而非条目数×2。

## 采集面与存量推进

`collection-plan.md` 定两件事：**每条内容采集时要扫的七层来源**（官方网页、公布文件与名录、地方志系统、学术论文、古籍全文、媒体报道、地图实测），以及**266 个存有条目的五批审计安排**（A 历史站 stub 14 条、B 文化站单引 19 条、C 历史站单引 38 条、D 历史站 standard 90 条、其余三站 122 条）。

要点三条：先查权威层再查媒体层；学术文献未取得原刊时只记著录、正文不取数据；某层查过没有要在条目存疑节写明「本库检索××未获」。台账是它的量测工具——单引条目数、stub 数、`confidence` 分布三项都从台账读。

## 硬规则

1. **`rights` 必须填，且必须是取值表里的取值之一。** 站群共用的八项取值在 `lishui-kit/schema/enums.common.json`，分站特有的在 `schema/sites/<siteId>.json`。判不准就填 `permission-required`，宁可不引。
2. **无来源的事实不进 `published`。** 条目引用的每一个 `ref` 都必须在本目录下存在对应卡片。
3. **摘录不越界。** `rights` 为 `excerpt-only` 或 `link-only` 的来源，正文里只能引用事实与必要短句，不得整段转录；旧志原文属公有领域的，引用也需标卷次页码，不整篇搬运。
4. **链接要复核。** 政府页面会改版、名录会调整批次、行政区划会调整，`accessed` 字段用于记录核对日期；链接失效时先降级 `confidence`，再找替代来源。
5. **弱来源要显形。** 来源为资料整理页面、地方文史页、论坛、自媒体或二手转述的，`rights` 照填，但在 `note` 里写明权威性不足，并在条目里相应降低 `confidence`。主流媒体与政务融媒体的二手报道不属此类，`note` 写明「二手报道，权威性中等」即可，条目 `confidence` 不超过 `medium`。
6. **名录口径优先。** 文保单位、非遗项目、传统村落的级别、批次与公布年份，一律以官方名录页与公布文件为准；地方介绍页、答复件与新闻报道的累计数与之不一致时，正文并列呈现，不做加总改写，差异写入「存疑之处」。
7. **行政区划事实以政府公开文件为准。** 面积、驻地、下辖村社区数、撤镇设街道的时点，一律以区政府页面与省政府批复为准；地方文史页与论坛的说法只能作地名由来的线索，且必须标为传说。
