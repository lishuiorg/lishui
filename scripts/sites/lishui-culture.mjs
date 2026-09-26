/* 溧水文化 · 分站专属校验规则
 *
 * 通用校验由共享底座 lishui-kit 提供，本模块只声明本站特有的五项（分站计划 8.1）：
 *   1. item 必须有 item_type / level / guardian；填了 level 就必须带 batch（公布批次与年份）；
 *   2. item 的 item_type 与 level 必须有英文译法——引擎只查古迹类型、体裁、文保级别与朝代，
 *      非遗类别与级别是本分站新增的枚举，漏译不会自动报错，故在此补一道门禁；
 *   3. place 的 place_type / era 必填，文保级别与公布批次配套，坐标须落在溧水境内；
 *   4. article 的 genre 必填，引文原文只能取自公有领域来源；
 *   5. 年代合理性——落在置县（591）至今区间之外的要说明依据。
 *
 * 由 scripts/validate.mjs 编排调用；单独跑用
 *   node scripts/validate.mjs --site lishui-culture
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent, BASE_ALLOWED, CJK } from 'lishui-kit/validate/engine.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** 内容库根目录：scripts/sites/ 上溯两级。 */
export const REPO = resolve(HERE, '..', '..');

export const siteId = 'lishui-culture';

/** 置县之年：早于此的年份是置县之前的年代。 */
const COUNTY_FOUNDED = 591;

/* 非遗项目新增四个字段，其余沿用底座的字段白名单。 */
const ALLOWED = new Set([...BASE_ALLOWED, 'item_type', 'level', 'batch', 'guardian']);

/* 专名一致性只校验这些类别的词条：它们是可以直接对译的专名。
   朝代、年号、职官、制度、通名、非遗项目名有固定的行文规则，
   不要求逐字出现在标题里。 */
const GLOSSARY_TITLE_CATEGORIES = new Set([
  '地名', '行政区划', '水系', '湖泊', '山体', '古迹', '寺庙',
  '遗址', '墓葬', '文献', '机构', '纪念地', '事件', '人名',
]);

/** 溧水区的大致范围，用于拦截坐标填错。 */
const BOUNDS = { lat: [31, 32], lng: [118.5, 119.5] };

/** 级别越高，公布批次越不该缺：区级同样有公布文件，故一律要求。 */
const LEVELS = ['国家级', '省级', '市级', '区级'];

export function run({ repo = REPO, quiet = false } = {}) {
  const thisYear = new Date().getFullYear();

  return validateContent({
    repo,
    siteId,
    allowedFields: ALLOWED,
    glossaryTitleCategories: GLOSSARY_TITLE_CATEGORIES,
    quiet,
    extra({ entry, data: d, file: f, sources, byId, enums, terms, err, warn, oneOf }) {
      /* 年代合理性：置县之前或未来年份须在正文单列一节说明依据。 */
      const start = d.time?.start;
      if (typeof start === 'number' && (start < COUNTY_FOUNDED || start > thisYear)) {
        const hasGrounds = /^#{2,4}\s*(年代依据|Dating basis|Basis for the date)\s*$/im.test(entry.body);
        if (!hasGrounds) {
          warn(f, `年代 ${start} 落在置县（${COUNTY_FOUNDED}）至今的区间之外，正文须有「## 年代依据」一节说明`);
        }
      }

      /* 非遗类别与级别是本分站新增的枚举，补一道译法门禁。 */
      const translatable = (v) => Boolean(v) && terms[v] !== undefined;
      for (const key of ['item_type', 'level']) {
        const v = d[key];
        if (typeof v === 'string' && v && CJK.test(v) && !translatable(v)) {
          err(f, `取值「${v}」没有英文译法，英文页会漏出中文（补 schema/terms.en.json）`);
        }
      }

      if (entry.type === 'item') {
        if (!d.item_type) err(f, 'item 必须有 item_type');
        else if (!oneOf(enums.itemType, d.item_type)) {
          err(f, `item_type 取值不在取值表内：${d.item_type}`);
        }
        if (!d.level) err(f, 'item 必须有 level');
        else if (!oneOf(LEVELS, d.level)) {
          err(f, `level 取值不在取值表内：${d.level}`);
        }
        if (d.level && !d.batch) {
          err(f, '填了 level 就必须填 batch（公布批次与年份）');
        }
        if (!d.guardian) err(f, 'item 必须有 guardian（保护单位）');
        /* batch 与 guardian 是分站新增的展示字段，引擎的英文稿漏译检查不认它们：
           batch 是自由文本、无从对译，guardian 的机构译名要写进英文稿本身，故在此补门禁。 */
        if (d.lang === 'en') {
          for (const key of ['batch', 'guardian']) {
            if (typeof d[key] === 'string' && CJK.test(d[key])) {
              err(f, `${key} 在英文稿里不得含中文：${d[key]}`);
            }
          }
        }
        if (d.place_ref !== undefined) {
          if (!Array.isArray(d.place_ref)) err(f, 'place_ref 需为数组');
          else for (const p of d.place_ref) {
            if (!/^ls:place:[a-z0-9]+(-[a-z0-9]+)*$/.test(p)) err(f, `place_ref 格式不合规：${p}`);
            else if (!byId.has(p)) err(f, `place_ref 指向的地点条目不存在：${p}`);
          }
        }
      }

      if (entry.type === 'place') {
        if (!d.place_type) err(f, 'place 必须有 place_type');
        else if (!oneOf(enums.placeType, d.place_type)) {
          err(f, `place_type 取值不在取值表内：${d.place_type}`);
        }
        if (!d.era) err(f, 'place 必须有 era');
        if (d.protection_level !== undefined) {
          if (!oneOf(enums.protectionLevel, d.protection_level)) {
            err(f, `protection_level 取值不在取值表内：${d.protection_level}`);
          }
          if (!d.protection_batch) {
            err(f, '填了 protection_level 就必须填 protection_batch（公布批次与年份）');
          }
        } else if (d.protection_batch) {
          warn(f, '填了 protection_batch 却没有 protection_level');
        }
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
      }

      if (entry.type === 'article') {
        if (!d.genre) err(f, 'article 必须有 genre');
        else if (!oneOf(enums.genre, d.genre)) err(f, `genre 取值不在取值表内：${d.genre}`);
        if (d.citations !== undefined) {
          if (!Array.isArray(d.citations)) err(f, 'citations 需为数组');
          else for (const c of d.citations) {
            if (!c || !c.ref || !c.locator) { err(f, 'citations 每条需有 ref 与 locator'); continue; }
            const src = sources.get(c.ref);
            if (!src) { err(f, `citations 引用了不存在的来源：${c.ref}`); continue; }
            if (c.quote && src.rights !== 'public-domain') {
              err(f, `引文原文只能取自公有领域来源，${c.ref} 的 rights 是 ${src.rights}`);
            }
          }
        }
      }
    },
  });
}
