/* 溧水山水 · 分站专属校验规则
 *
 * 通用校验由共享底座 lishui-kit 提供，本模块只声明本站特有的十二项（分站计划 8.1）：
 *   1. feature_type / basin / district_towns 三项必填；
 *   2. 按 feature_type 必填：山丘填 elevation_m，河流填 length_km，湖库填 area_km2，
 *      圩区堤闸填 area_km2 或 length_km（圩与堤防记面积、闸与撇洪沟记长度）；
 *   3. 湖库且题名含「水库」者，reservoir_class 必填；
 *   4. feature_type / basin / reservoir_class / route_mode 的取值门禁；
 *   5. district_towns 的每个取值都必须是街镇分站已存在的镇街名；
 *   6. designation 的每一项都要带年份，且正文里能见到该称号；
 *   7. scenery_grade 须写明评定年份，正文须有「景观与游赏」一节；
 *   8. 正文固定节次：place 四节；文章按体裁三节（分站计划 3.5）；
 *   9. 英文稿的 designation / scenery_grade / district_towns / address 不得含中文；
 *  10. 中英两份的数值字段必须完全相同；
 *  11. 坐标须落在溧水境内；
 *  12. 本站新增的枚举引擎不查译法，故补一道门禁。
 *
 * 由 scripts/validate.mjs 编排调用；单独跑用
 *   node scripts/validate.mjs --site lishui-shanshui
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent, BASE_ALLOWED, CJK } from 'lishui-kit/validate/engine.mjs';
import { listMarkdown, loadMarkdown } from 'lishui-kit/content/frontmatter.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** 内容库根目录：scripts/sites/ 上溯两级。 */
export const REPO = resolve(HERE, '..', '..');

export const siteId = 'lishui-shanshui';

/* 自然地理新增十五个字段，其余沿用底座的字段白名单。 */
const ALLOWED = new Set([
  ...BASE_ALLOWED,
  'feature_type', 'basin', 'district_towns',
  'elevation_m', 'length_km', 'area_km2',
  'reservoir_class', 'capacity_10k_m3',
  'designation', 'scenery_grade', 'water_quality',
  'route_km', 'route_mode', 'route_nodes', 'held_month', 'host',
  'gaps',
]);

/* 专名一致性只校验这些类别的词条：它们是可以直接对译的专名。
   通名（山、河、湖、水库、圩）与制度名有固定的行文规则，不要求逐字出现在标题里。 */
const GLOSSARY_TITLE_CATEGORIES = new Set([
  '地名', '行政区划', '水系', '湖泊', '山体', '古迹', '寺庙', '保护地',
  '遗址', '墓葬', '文献', '机构', '纪念地', '事件', '人名', '水利', '制度',
]);

/** 溧水区的大致范围，用于拦截坐标填错。 */
const BOUNDS = { lat: [31, 32], lng: [118.5, 119.5] };

const FEATURE_TYPES = ['山丘', '河流', '湖库', '圩区堤闸'];
/* 「分水岭」用于脊线本身即两大水系分水岭的山体（如西横山）；「待考」用于官方文件
   未直接点名流域归属的实体。两者都是如实标注，不用推测的归属代替缺考。 */
const BASINS = ['秦淮河', '石臼湖', '太湖湖西', '分水岭', '待考'];
const RESERVOIR_CLASSES = ['中型', '小（一）型', '小（二）型'];
const ROUTE_MODES = ['自驾', '骑行', '徒步', '水上游览'];

/** 按类型必填的规模字段：只有单一字段的类型。 */
const SCALE_FIELD = {
  山丘: 'elevation_m',
  河流: 'length_km',
  湖库: 'area_km2',
};

/* 圩区堤闸另算：圩与堤防记面积、闸与撇洪沟记长度。闸与撇洪沟本身没有面积，
   不强填 area_km2；两个字段至少填一项，官方都没有时在 gaps 里声明。 */
const SCALE_ANY = {
  圩区堤闸: ['area_km2', 'length_km'],
};

/* 正文固定节次（分站计划 3.5），中英各一套标题写法。
   节次名以汉字开头时不能用 \b 收尾：\b 按 \w（[A-Za-z0-9_]）判词界，
   汉字属非词字符，其后无论接换行还是冒号都不成词界，规则会永远判缺失。
   故改用「标题名后紧跟空白、冒号或行尾」的先行断言，中英通用。 */
const head = (...names) =>
  new RegExp(`^#{2,3}[ \\t]*(?:${names.join('|')})(?=[\\s:：]|$)`, 'm');

const PLACE_SECTIONS = [
  head('概况', 'Overview', 'Summary'),
  head('形成与变迁', 'Formation and change', 'Formation'),
  head('景观与游赏', 'Landscape and visiting', 'Visiting'),
  head('存疑之处', 'Open questions', 'Points of doubt'),
];
const ARTICLE_SECTIONS = {
  游线: [head('线路概况', 'Route overview'), head('沿途看点', 'Along the way'), head('实用信息', 'Practical information')],
  节事: [head('节事概况', 'Festival overview'), head('历年情况', 'Past editions', 'Past years'), head('实用信息', 'Practical information')],
  综述: [head('综述', 'Survey'), head('分期与分区', 'Periods and areas'), head('存疑之处', 'Open questions', 'Points of doubt')],
  生态: [head('综述', 'Survey'), head('分期与分区', 'Periods and areas'), head('存疑之处', 'Open questions', 'Points of doubt')],
};

/** 中英两份必须完全一致的数值字段。 */
const NUMERIC_FIELDS = ['elevation_m', 'length_km', 'area_km2', 'capacity_10k_m3', 'route_km'];

/* 「存疑之处」一节的正文，用于检查声明了缺口的条目是否真的把缺口写出来了。 */
const GAP_SECTION = /^#{2,3}[ \t]*(?:存疑之处|Open questions|Points of doubt)[ \t]*\n+([\s\S]*?)(?=\n#{1,3}[ \t]|$)/m;
const gapFilled = (body) => {
  const m = GAP_SECTION.exec(body);
  return Boolean(m && m[1].trim());
};

const ANY_YEAR = /(1[89]\d{2}|20\d{2})/;

/** 称号与景区等级里的年份括注：「国家森林公园（2015 年 1 月）」→ 名目。 */
const stripYear = (v) => String(v).replace(/[（(][^）)]*[）)]\s*$/, '').trim();

/** 街镇分站现有的镇街名：跨涉镇街必须取自此表，不得自造。 */
let townNames = null;
function townsOf(repo) {
  if (townNames) return townNames;
  const dir = join(repo, 'content', 'lishui-towns', 'towns');
  townNames = new Set();
  for (const file of listMarkdown(dir)) {
    try {
      const { data } = loadMarkdown(file);
      if (data?.title) townNames.add(data.title);
    } catch (e) { /* 街镇站的解析问题由该站自己报出 */ }
  }
  return townNames;
}

export function run({ repo = REPO, quiet = false } = {}) {
  townNames = null;
  const towns = townsOf(repo);

  return validateContent({
    repo,
    siteId,
    allowedFields: ALLOWED,
    glossaryTitleCategories: GLOSSARY_TITLE_CATEGORIES,
    quiet,
    extra({ entry, data: d, file: f, sources, byId, enums, glossary, terms, err, warn, oneOf }) {
      /* --- 本站新增枚举：引擎不查译法，补一道门禁 --- */
      /* 译法可能住在两处：glossary.csv（秦淮河、石臼湖这类专名）与 schema/terms.en.json
         （山丘、中型、自驾这类通名与制度名），故两处都要查，只查后者会误报。 */
      const glossaryZh = new Set(glossary.map((g) => g.zh));
      const translatable = (v) => Boolean(v) && (terms[v] !== undefined || glossaryZh.has(v));
      for (const [group, value] of [
        ['featureType', d.feature_type], ['basin', d.basin],
        ['reservoirClass', d.reservoir_class], ['routeMode', d.route_mode],
      ]) {
        if (typeof value === 'string' && CJK.test(value) && !translatable(value)) {
          err(f, `取值「${value}」没有英文译法，英文页会漏出中文（补 schema/terms.en.json）`);
        }
      }

      /* --- 文章：体裁与固定节次 --- */
      if (entry.type === 'article') {
        if (!d.genre) err(f, 'article 必须有 genre');
        else if (!oneOf(enums.genre, d.genre)) err(f, `genre 取值不在取值表内：${d.genre}`);
        else {
          for (const re of ARTICLE_SECTIONS[d.genre] || []) {
            if (!re.test(entry.body)) err(f, `正文缺少「${d.genre}」体裁的固定节次：${re}`);
          }
        }
        if (d.route_mode !== undefined && !oneOf(ROUTE_MODES, d.route_mode)) {
          err(f, `route_mode 取值不在取值表内：${d.route_mode}`);
        }
        return;
      }

      /* --- place：三项必填与取值门禁 --- */
      for (const k of ['feature_type', 'basin', 'district_towns']) {
        if (d[k] === undefined || d[k] === null || d[k] === '') err(f, `place 必须有 ${k}`);
      }
      if (d.feature_type && !oneOf(FEATURE_TYPES, d.feature_type)) {
        err(f, `feature_type 取值不在取值表内：${d.feature_type}`);
      }
      if (d.basin && !oneOf(BASINS, d.basin)) err(f, `basin 取值不在取值表内：${d.basin}`);
      if (d.reservoir_class && !oneOf(RESERVOIR_CLASSES, d.reservoir_class)) {
        err(f, `reservoir_class 取值不在取值表内：${d.reservoir_class}`);
      }

      /* --- 按类型必填的规模字段 --- */
      /* 官方文件确实没有该数字时，可在 gaps 里声明该字段，正文「存疑之处」须写明缺口；
         声明与填值不得同时出现。这是本站唯一允许「必填字段空着」的途径。 */
      const gaps = d.gaps;
      if (gaps !== undefined) {
        if (!Array.isArray(gaps) || gaps.length === 0) err(f, 'gaps 需为非空数组');
        else {
          for (const g of gaps) {
            if (!ALLOWED.has(g)) err(f, `gaps 的「${g}」不是本站字段`);
            else if (d[g] !== undefined && d[g] !== null) err(f, `gaps 声明了「${g}」缺口，却填了值`);
          }
          if (!gapFilled(entry.body)) err(f, 'gaps 声明了缺口，正文「存疑之处」一节须写明');
        }
      }
      const declared = (k) => Array.isArray(gaps) && gaps.includes(k);
      const scale = SCALE_FIELD[d.feature_type];
      if (scale && !declared(scale) && (d[scale] === undefined || d[scale] === null)) {
        err(f, `feature_type 为${d.feature_type}时必须填 ${scale}（官方无此数字时在 gaps 里声明）`);
      }
      const anyOf = SCALE_ANY[d.feature_type];
      if (anyOf) {
        const filled = anyOf.some((k) => d[k] !== undefined && d[k] !== null);
        if (!filled && !anyOf.every(declared)) {
          err(f, `feature_type 为${d.feature_type}时必须填 ${anyOf.join(' 或 ')}（官方无此数字时在 gaps 里声明）`);
        }
      }
      for (const k of NUMERIC_FIELDS) {
        if (d[k] !== undefined && (typeof d[k] !== 'number' || !Number.isFinite(d[k]) || d[k] <= 0)) {
          err(f, `${k} 需为正数：${d[k]}`);
        }
      }
      if (d.feature_type === '湖库' && /水库/.test(String(d.title)) && !d.reservoir_class) {
        err(f, '题名含「水库」，必须有 reservoir_class');
      }

      /* --- 跨涉镇街有据 --- */
      /* 中文稿是镇街名的正本，逐项对照街镇分站的镇街名；英文稿存英文名（展示字段），
         只校条数与语言，英文名是否合译法另由人工核对。 */
      if (d.district_towns !== undefined) {
        if (!Array.isArray(d.district_towns) || d.district_towns.length === 0) {
          err(f, 'district_towns 需为非空数组');
        } else if (d.lang !== 'en') {
          for (const t of d.district_towns) {
            if (!towns.has(t)) err(f, `district_towns 的「${t}」不是街镇分站现有的镇街名`);
          }
        }
      }

      /* --- 称号与景区等级 --- */
      if (d.designation !== undefined) {
        if (!Array.isArray(d.designation) || d.designation.length === 0) {
          err(f, 'designation 需为非空数组');
        } else {
          for (const v of d.designation) {
            if (!ANY_YEAR.test(String(v))) err(f, `称号须带年份：${v}`);
            const name = stripYear(v);
            if (name && !entry.body.includes(name)) {
              err(f, `称号「${name}」在正文里没有对应段落`);
            }
          }
        }
      }
      if (d.scenery_grade !== undefined) {
        if (!ANY_YEAR.test(String(d.scenery_grade))) err(f, `scenery_grade 须写明评定年份：${d.scenery_grade}`);
        if (!/景观与游赏|Landscape and visiting|Visiting/.test(entry.body)) {
          err(f, '填了 scenery_grade，正文须有「景观与游赏」一节');
        }
      }

      /* --- 正文固定节次 --- */
      for (const re of PLACE_SECTIONS) {
        if (!re.test(entry.body)) err(f, `正文缺少固定节次：${re}`);
      }

      /* --- 英文稿的展示字段不得含中文 --- */
      if (d.lang === 'en') {
        const fields = [].concat(
          d.designation || [], d.scenery_grade || [], d.district_towns || [],
          d.address || [], d.route_nodes || [],
        );
        for (const v of fields) {
          if (typeof v === 'string' && CJK.test(v)) err(f, `英文稿不得含中文：${v}`);
        }
      }

      /* --- 中英数值一致 --- */
      const zh = byId.get(d.id)?.zh?.data;
      if (d.lang === 'en' && zh) {
        for (const k of NUMERIC_FIELDS) {
          if (zh[k] !== undefined && d[k] !== undefined && zh[k] !== d[k]) {
            err(f, `${k} 中英不一致：中 ${zh[k]} ≠ 英 ${d[k]}`);
          }
        }
        if (Array.isArray(zh.designation) && Array.isArray(d.designation)
          && zh.designation.length !== d.designation.length) {
          warn(f, `designation 中英条数不一致：中 ${zh.designation.length} 条 ≠ 英 ${d.designation.length} 条`);
        }
        if (Array.isArray(zh.district_towns) && Array.isArray(d.district_towns)
          && zh.district_towns.length !== d.district_towns.length) {
          warn(f, `district_towns 中英条数不一致：中 ${zh.district_towns.length} 项 ≠ 英 ${d.district_towns.length} 项`);
        }
      }

      /* --- 坐标范围 --- */
      if (d.coordinates !== undefined) {
        const c = d.coordinates;
        if (!c || typeof c !== 'object' || typeof c.lat !== 'number' || typeof c.lng !== 'number') {
          err(f, 'coordinates 需为 { lat, lng } 数值对象');
        } else if (
          c.lat < BOUNDS.lat[0] || c.lat > BOUNDS.lat[1]
          || c.lng < BOUNDS.lng[0] || c.lng > BOUNDS.lng[1]
        ) {
          err(f, `coordinates 超出溧水范围：${c.lat}, ${c.lng}`);
        }
      }
    },
  });
}
