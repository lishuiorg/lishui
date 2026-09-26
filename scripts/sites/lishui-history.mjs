/* 溧水历史 · 分站专属校验规则
 *
 * 通用校验（字段完整性、取值表、来源与关联可解析、英文稿漏译、词表覆盖、
 * 双语配对、专名一致性）由共享底座 lishui-kit 提供，本模块只声明本站特有的四项
 * （分站计划 8.1）：
 *   1. event 必须有完整时间字段与 outcome；
 *   2. place 的 place_type / era 必填，文保级别与公布批次配套，坐标须落在溧水境内；
 *   3. article 的 genre 必填，引文原文只能取自公有领域来源；
 *   4. 年代合理性——落在置县（591）至今区间之外的要说明依据。
 *
 * 由 scripts/validate.mjs 编排调用；单独跑用
 *   node scripts/validate.mjs --site lishui-history
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent } from 'lishui-kit/validate/engine.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** 内容库根目录：scripts/sites/ 上溯两级。 */
export const REPO = resolve(HERE, '..', '..');

export const siteId = 'lishui-history';

/** 建站之年：早于此的年份是置县之前的史前或传说年代。 */
const COUNTY_FOUNDED = 591;

/* 专名一致性只校验这些类别的词条：它们是可以直接对译的专名。
   朝代、年号、职官、制度、通名有固定的行文规则（见 glossary.csv 的「规则」行），
   不要求逐字出现在标题里。 */
const GLOSSARY_TITLE_CATEGORIES = new Set([
  '地名', '行政区划', '水系', '湖泊', '山体', '古迹', '寺庙',
  '遗址', '墓葬', '文献', '机构', '纪念地', '事件', '人名',
]);

/** 溧水区的大致范围，用于拦截坐标填错。 */
const BOUNDS = { lat: [31, 32], lng: [118.5, 119.5] };

export function run({ repo = REPO, quiet = false } = {}) {
  const thisYear = new Date().getFullYear();

  return validateContent({
    repo,
    siteId,
    glossaryTitleCategories: GLOSSARY_TITLE_CATEGORIES,
    quiet,
    extra({ entry, data: d, file: f, sources, byId, enums, err, warn, oneOf }) {
      /* 年代合理性：置县之前或未来年份须在正文单列一节说明依据。
         条目普遍已有「## 年代依据」/「## Dating basis」一节，故只在缺该节时告警，
         否则每条置县前的条目都会重复报同一句，警告失去指示作用。 */
      const start = d.time?.start;
      if (typeof start === 'number' && (start < COUNTY_FOUNDED || start > thisYear)) {
        const hasGrounds = /^#{2,4}\s*(年代依据|Dating basis|Basis for the date)\s*$/im.test(entry.body);
        if (!hasGrounds) {
          warn(f, `年代 ${start} 落在置县（${COUNTY_FOUNDED}）至今的区间之外，正文须有「## 年代依据」一节说明`);
        }
      }

      if (entry.type === 'event') {
        if (!d.time) err(f, 'event 必须有 time');
        else if (typeof d.time.start !== 'number' || !d.time.precision) {
          err(f, 'event 必须有 time.start 与 time.precision');
        }
        if (!d.outcome) err(f, 'event 必须有 outcome');
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
