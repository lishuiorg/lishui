# lishui · 溧水一方统一内容库

溧水一方站群的**唯一内容库**。全部知识性内容与来源都放在这里，站点代码在各自的 `site-*` 库，共享底座在 `lishui-kit`。

本库取代此前的 `lishui-history`、`lishui-culture`、`lishui-towns` 三个内容库（三库已归档为只读，历史仍可查）。合并的理由与取舍见《三层结构集中方案》。

三层分工一句话：**全站一致 → `lishui-kit`；本站特有 → `site-*`；知识性内容与来源 → 本库。**

## 两层结构

| 目录 | 放什么 |
| --- | --- |
| `sources/` | **来源层。** 每条外部资料的著录卡：`fulltext/` 公有领域旧志全文，`excerpts/` 受版权保护资料的摘录卡，`records/` 政府页面与名录的链接档案。字段与硬规则见 `sources/rights.md` |
| `content/` | **成果层。** 各站自撰的条目，按站分区；英文稿在 `content/en/<siteId>/` 的对称路径 |

来源层**全局共享**：来源是「关于世界的证据」，不归任何一站。同一份资料只有一张卡片、一个 `rights` 判定，三个分站的条目都挂到同一张卡上。

成果层文字采用 [CC BY 4.0](LICENSE) 授权。来源层各条目的授权状态见其 `rights` 字段，不随本库授权一并转移。

## 按站分区

```
content/
├── lishui-history/{events,places,articles}/*.md     # 溧水历史
├── lishui-culture/{items,places,articles}/*.md      # 溧水文化
├── lishui-towns/{towns,villages,articles}/*.md      # 溧水街镇
└── en/<siteId>/{同上}/*.md                          # 与中文完全对称
```

三站都有 `articles/`，历史与文化都有 `places/`，扁平目录必然撞车。按站分目录后，**每站构建只读自己的子树**，构建成本不随分站数增长。

条目所属分站由 front-matter 的 `site` 字段与所在目录共同确定，两者必须一致。

## 内容模型

每站有自己的实体类型，登记在 `schema/sites.json`。当前三站：

| 分站 | 实体类型 | 实体目录 |
| --- | --- | --- |
| `lishui-history` | `event` / `place` / `article` | `events` / `places` / `articles` |
| `lishui-culture` | `item` / `place` / `article` | `items` / `places` / `articles` |
| `lishui-towns` | `place` / `article` | `towns` / `villages` / `articles` |

`place` 类型可由多个目录承载（街镇的镇街与村落都是 `place`）。

各站必填字段与取值表：

- 历史：`event` 必须有 `time`（含 `start` 与 `precision`）与 `outcome`；`place` 必须有 `place_type` 与 `era`，填 `protection_level` 就必须带 `protection_batch`；`article` 必须有 `genre`。
- 文化：`item` 必须有 `item_type`、`level`、`guardian`，填 `level` 就必须带 `batch`；`place` 必须有 `place_type` 与 `era`；`article` 必须有 `genre`。
- 街镇：`place` 必须有 `unit_type` 与 `place_type`（取值限「行政区划」「村落」）；`unit_type` 为街道或镇时 `seat`／`area_km2`／`communities`／`villages` 四项必填，为村或社区时 `parent` 必填且须指向本库的街道或镇条目；`article` 必须有 `genre`。

各站专属规则在各站计划里；校验规则实现见 `scripts/sites/<siteId>.mjs`。

人物不单独建条，只在 `related` 里引用人物分站的条目 ID。**跨站引用不支持**：内容合库后 `related` 只在本站范围内解析，指向他站条目会报错，确需跨站请改用绝对 URL。

## 取值表

| 文件 | 放什么 |
| --- | --- |
| `schema/sites.json` | 内容侧站点登记：`siteId` → `types` / `typeDirs` |
| `schema/sites/<siteId>.json` | 本站特有的取值表与 `idPattern` |
| `schema/tags.json` | 站群标签表，三库三份合并去重 |
| `schema/terms.en.json` | 分站枚举取值的英文译法 |

站群共用的八项取值（`dynasty`／`precision`／`depth`／`status`／`confidence`／`rights`／`archive`／`sourceType`）与 `sourceIdPattern` 在底座 `lishui-kit/schema/enums.common.json`。专名词表 `glossary.csv` 也在底座，全站唯一一份。

**同一个中文词不得同时住在 `glossary.csv` 与 `terms.en.json`**：前者优先，后者那份改不生效。校验会拦，出现即报错。

`content/` 与 `content/en/` 下的条目**共用同一个 ID**（靠 `lang` 区分语言），英文稿放在对称路径上。`published` 条目必须中英成对，缺任一份则两份都不得发布。

## 校验

```bash
npm install                          # 首次；lishui-kit 以 file: 依赖装在 node_modules 下
node scripts/validate.mjs            # 全部站点
node scripts/validate.mjs --site lishui-towns   # 只校验本站
node scripts/validate.mjs --json     # 输出 JSON，供 CI 使用
```

校验引擎在共享底座 `lishui-kit/validate/engine.mjs`，本库只写各站特有的规则。引擎本身零依赖，但本库要能解析到 `lishui-kit`，所以仍需 `npm install` 一次。

**通用六项**（引擎提供，全站群一致）：

1. **来源层**——id 与文件名一致、授权状态入表、链接类来源必须有访问日期、出版者为中文时必须补 `publisherEn`；
2. **成果层**——必填字段、schema 之外的字段、ID 与路径一致、取值入表、来源 `ref` 可解析、`related` 可解析；
3. **英文稿**——展示字段不得残留中文，纪年必须能查到译法；
4. **词表覆盖**——取值表里的中文取值必须都能翻成英文；
5. **双语配对**——`published` 条目缺英文稿即阻断；
6. **专名一致性**——英文稿标题中的专名必须与 `glossary.csv` 一致。

**三项扩展性加固**（合库后新增）：

- **译法表重叠即报错**——同一个中文词不得同时住在两张译法表里；
- **跨站关联显式识别**——指向他站条目的 `related` 单独提示，不混作「ID 写错」；
- **缺站点声明即报错**——`content/<siteId>/` 存在但 `schema/sites/<siteId>.json` 缺失时校验失败，不静默放行全部取值。

推送到 `main` 或提交 PR 时由 `.github/workflows/validate.yml` 自动执行。

## 写一条新条目的顺序

1. 在 `sources/` 建或复用来源卡，填好 `rights`、版本与 `locator_hint`；
2. 定年份与精度，旧志纪年换算成公元年份，换算不确定时把 `precision` 降一档并在正文写明依据；
3. 正文按本站骨架写（见 `CONTRIBUTING.md`）；
4. 把本站相关条目的 ID 填进 `related`；
5. 写英文稿，年号、朝代、职官、旧志引文按 `glossary.csv` 的规则处理；
6. 定 `depth`，状态置 `review`，提交 PR；校验通过后改 `published`。

详见 `CONTRIBUTING.md`。

## 新增一个分站

新增分站已从「照着旧站复制二十多个文件、再逐处改站名」变成「跑一条命令，再填本站特有的分类体系」。

### 一条命令生成骨架

```bash
node lishui-kit/scripts/scaffold-site.mjs \
  --id lishui-shan-shui \
  --name 溧水山水 \
  --name-en "Lishui Nature" \
  --host shanshui.lishui.org \
  --sections places:place,articles:article
```

`--sections` 是本站板块清单，形如 `<目录名>:<实体类型>`，目录名即 URL 段也是内容子树名；默认 `articles:article`。`--repo` 覆盖站点库名（默认由域名首段推出），`--dry-run` 只列将生成的文件而不写盘。**已存在的站点一律不覆盖**——站点库目录非空、取值表已存在、或已在 `schema/sites.json` 登记，任一条命中即报错退出。

生成的四处：

| 落点 | 内容 |
| --- | --- |
| `site-<简写>/` | 站点库骨架：页面薄包装（中英各一套）、五个视图包装、`config.mjs`／`content.mjs`／`model.mjs`／`context.mjs`、界面串、`package.json`、`astro.config.mjs`、约 20 行的 `deploy.yml`、`CNAME`／`robots.txt` |
| `schema/sites/<siteId>.json` | 本站取值表骨架：`idPattern` + 待填枚举 |
| `schema/sites.json` | 登记本站（`types` / `typeDirs`） |
| `content/<siteId>/`、`content/en/<siteId>/` | 本站内容子树，每个板块一个带 `.gitkeep` 的目录 |

### 生成后

1. **站点库**：`cd site-<简写> && npm install`，把 `package-lock.json` 提交进库（CI 用 `npm ci`，缺锁文件直接失败）；`npm run check` 应全绿。生成时填的都是占位文字，按站点库 `README.md` 的「生成后待办」逐条替换。
2. **取值表**：填 `schema/sites/<siteId>.json` 的本站枚举。填了中文取值就要补英文译法——专名进底座 `glossary.csv`，枚举进本库 `schema/terms.en.json`，否则校验报错（英文页会漏出中文）。
3. **标签**：新标签入 `schema/tags.json`。
4. **本站规则**（可选）：新建 `scripts/sites/<siteId>.mjs` 声明本站附加规则；不写也照样用通用六项跑。反过来，写了规则模块却没在 `schema/sites.json` 登记，校验会直接报错。
5. **门户**：在 `site-portal/sites.json` 的 `sites` 数组加一条，`status` 由 `building` 改 `live`。
6. **域名**：配 CNAME 与 HTTPS。

第 5 步一改，两件事自动发生，都不必再改代码：各分站顶部导航带上新站（站群清单是唯一数据源，分站不硬编码兄弟站点）；底座 `verify-sites` 回归把新站纳入覆盖（它从门户清单动态取 `status: live` 的站点）。
