/* 溧水街镇 · 分站专属校验规则
 *
 * 通用校验由共享底座 lishui-kit 提供，本模块只声明本站特有的八项（分站计划 8.1）：
 *   1. unit_type 为街道或镇时，seat / area_km2 / communities / villages 四项必填；
 *   2. unit_type 为村或社区时，parent 必填且必须指向本库已存在的街道或镇条目；
 *   3. unit_type 与 place_type 的取值门禁；
 *   4. 填了 traditional_village 就必须在正文里有对应段落，且批次与年份不得为空；
 *   5. 填了 surnames 的条目，正文须有说明姓氏依据的句子；
 *   6. 英文稿的 seat / address / traditional_village 不得含中文，surnames 用拼音；
 *   7. 坐标须落在溧水境内；
 *   8. unit_type 是本分站新增的枚举，引擎不查译法，故补一道门禁。
 *
 * 由 scripts/validate.mjs 编排调用；单独跑用
 *   node scripts/validate.mjs --site lishui-towns
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent, BASE_ALLOWED, CJK } from 'lishui-kit/validate/engine.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** 内容库根目录：scripts/sites/ 上溯两级。 */
export const REPO = resolve(HERE, '..', '..');

export const siteId = 'lishui-towns';

/* 行政区划新增九个字段，其余沿用底座的字段白名单。 */
const ALLOWED = new Set([
  ...BASE_ALLOWED,
  'unit_type', 'seat', 'area_km2', 'communities', 'villages',
  'admin_code', 'traditional_village', 'surnames', 'parent',
]);

/* 专名一致性只校验这些类别的词条：它们是可以直接对译的专名。
   通名（村、社区、街道、镇）与制度名有固定的行文规则，不要求逐字出现在标题里。 */
const GLOSSARY_TITLE_CATEGORIES = new Set([
  '地名', '行政区划', '水系', '湖泊', '山体', '古迹', '寺庙',
  '遗址', '墓葬', '文献', '机构', '纪念地', '事件', '人名',
]);

/** 溧水区的大致范围，用于拦截坐标填错。 */
const BOUNDS = { lat: [31, 32], lng: [118.5, 119.5] };

const UNIT_TYPES = ['街道', '镇', '村', '社区'];
const TOWN_UNITS = ['街道', '镇'];
const VILLAGE_UNITS = ['村', '社区'];
const PLACE_TYPES = ['行政区划', '村落'];

/** 传统村落字段里必须同时出现批次与四位年份。
    中文稿写「第六批」，英文稿按分站计划 4.1 写 "sixth batch"，两者都算数。 */
const BATCH_YEAR = /(第[一二三四五六七八九十]+批|第\s*[0-9]+\s*批|\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+batch\b)/i;
const ANY_YEAR = /(1[89]\d{2}|20\d{2})/;

export function run({ repo = REPO, quiet = false } = {}) {
  return validateContent({
    repo,
    siteId,
    allowedFields: ALLOWED,
    glossaryTitleCategories: GLOSSARY_TITLE_CATEGORIES,
    quiet,
    extra({ entry, data: d, file: f, sources, byId, enums, terms, err, warn, oneOf }) {
      /* unit_type 是本分站新增的枚举，引擎不查译法，补一道门禁。 */
      const translatable = (v) => Boolean(v) && terms[v] !== undefined;
      if (typeof d.unit_type === 'string' && CJK.test(d.unit_type) && !translatable(d.unit_type)) {
        err(f, `取值「${d.unit_type}」没有英文译法，英文页会漏出中文（补 schema/terms.en.json）`);
      }

      if (entry.type === 'article') {
        if (!d.genre) err(f, 'article 必须有 genre');
        else if (!oneOf(enums.genre, d.genre)) err(f, `genre 取值不在取值表内：${d.genre}`);
      }

      if (entry.type !== 'place') return;

      /* --- 取值门禁 --- */
      if (!d.unit_type) err(f, 'place 必须有 unit_type');
      else if (!oneOf(UNIT_TYPES, d.unit_type)) err(f, `unit_type 取值不在取值表内：${d.unit_type}`);
      if (!d.place_type) err(f, 'place 必须有 place_type');
      else if (!oneOf(PLACE_TYPES, d.place_type)) err(f, `place_type 取值不在取值表内：${d.place_type}`);

      /* --- 镇街四项必填 --- */
      if (TOWN_UNITS.includes(d.unit_type)) {
        for (const k of ['seat', 'area_km2', 'communities', 'villages']) {
          if (d[k] === undefined || d[k] === null || d[k] === '') err(f, `镇街必须有 ${k}`);
        }
        if (typeof d.area_km2 === 'number' && (d.area_km2 <= 0 || d.area_km2 > 1100)) {
          err(f, `area_km2 超出合理范围：${d.area_km2}`);
        }
        for (const k of ['communities', 'villages']) {
          if (d[k] !== undefined && (!Number.isInteger(d[k]) || d[k] < 0)) err(f, `${k} 需为非负整数`);
        }
      }

      /* --- 村落必须有归属 --- */
      if (VILLAGE_UNITS.includes(d.unit_type)) {
        if (!d.parent) err(f, '村落条目必须有 parent（所属镇街）');
        else {
          const p = byId.get(d.parent)?.zh?.data;
          if (!p) err(f, `parent 指向的条目不存在：${d.parent}`);
          else if (!TOWN_UNITS.includes(p.unit_type)) {
            err(f, `parent 必须指向街道或镇条目：${d.parent} 的 unit_type 是 ${p.unit_type || '未填'}`);
          }
        }
      } else if (d.parent) {
        warn(f, '填了 parent 却不是村或社区，parent 会被忽略');
      }

      /* --- 传统村落配套 --- */
      if (d.traditional_village !== undefined) {
        const v = String(d.traditional_village);
        if (!BATCH_YEAR.test(v) || !ANY_YEAR.test(v)) {
          err(f, `traditional_village 须写明批次与年份：${v}`);
        }
        if (!/^#{2,4}\s*.*(传统村落|Traditional [Vv]illage)/m.test(entry.body)) {
          err(f, '填了 traditional_village，正文须有「传统村落」一节');
        }
      }

      /* --- 姓氏有据 --- */
      if (d.surnames !== undefined) {
        if (!Array.isArray(d.surnames) || d.surnames.length === 0) err(f, 'surnames 需为非空数组');
        else if (!/姓氏|族谱|聚居|宗祠|surnamed|surname/i.test(entry.body)) {
          err(f, '填了 surnames，正文须有说明姓氏依据的句子');
        }
      }

      /* --- 英文稿的行政区划字段不得含中文 --- */
      if (d.lang === 'en') {
        for (const key of ['seat', 'traditional_village']) {
          if (typeof d[key] === 'string' && CJK.test(d[key])) {
            err(f, `${key} 在英文稿里不得含中文：${d[key]}`);
          }
        }
        if (Array.isArray(d.surnames)) {
          for (const s of d.surnames) {
            if (typeof s === 'string' && CJK.test(s)) err(f, `surnames 在英文稿里须用拼音：${s}`);
          }
        }
        if (d.seat === undefined && TOWN_UNITS.includes(d.unit_type)) {
          err(f, '英文稿缺少 seat');
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
