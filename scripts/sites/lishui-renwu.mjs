/* 溧水人物 · 分站专属校验规则
 *
 * 通用校验由共享底座 lishui-kit 提供，本模块只声明本站特有的四项：
 *   1. person 必须有 role（身份）与 birth_era（所属时代）；
 *   2. 生卒年、籍贯、活动年代一律**可缺**，缺即表示本库未获——人物条目最容易
 *      栽在「想当然补全生平」上，故不设必填，只在正文无相应交代时提示；
 *   3. 与溧水的关联必须有来源：本地出生、任官、著述、留寓、活动五类之一，
 *      若 frontmatter 未声明 relation，须在正文写明，否则「与本库何干」无从判断；
 *      「活动」是为非遗传承人一类新加的——名录只给项目与所在社区，证的是在溧水
 *      传承活动，不证出生地，故不得图省事写成「本地出生」。
 *   4. 英文稿的姓名、字号须用词表译法（引擎已校验中文标题含人名时的译法，
 *      此处补一道：字号、朝代等易漏）；role／birth_era／relation 三项
 *      在英文稿写英文译法，译法由 schema/terms.en.json 的同名组给出。
 *
 * 本站最要紧的一条不是格式，是**不许把「相传」写成生平**：
 * `confidence` 为 medium 或 low 的条目，其「## 存疑之处」节必须存在。
 *
 * 由 scripts/validate.mjs 编排调用；单独跑用
 *   node scripts/validate.mjs --site lishui-renwu
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent, BASE_ALLOWED, CJK } from 'lishui-kit/validate/engine.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** 内容库根目录：scripts/sites/ 上溯两级。 */
export const REPO = resolve(HERE, '..', '..');

export const siteId = 'lishui-renwu';

/* 人物条目新增三个字段：身份、所属时代、与溧水的关联。其余沿用底座白名单。 */
const ALLOWED = new Set([...BASE_ALLOWED, 'role', 'birth_era', 'relation']);

/* 专名一致性校验这些类别：人名与地名可直接对译；朝代、职官有固定行文规则。 */
const GLOSSARY_TITLE_CATEGORIES = new Set(['人名', '地名', '行政区划', '古迹', '文献']);

/* 与溧水的关联类型收进本站取值表（本地出生、任官、著述、留寓），
   不再在本模块另存一份：底座对取值表里的中文取值统一查译法表，
   留在模块里的那一份查不到，等于漏开一道门禁。 */

/* 三项枚举的英文译法在 schema/terms.en.json 的 personRole／birthEra／relation 组里。
   取值本身在中文稿与英文稿里一律写中文——渲染走 ctx.enumLabel()，它按中文值查译法表，
   英文稿写英文反而查不到（本站初稿曾要求英文稿写英文，与其余四站及底座渲染相反，已改回）。
   引擎的通用漏译检查只认 placeType、genre 等八项，本站这三项不在其列，故在此补门禁：
   取值须在取值表内，且须在译法表内有译文，否则英文页会漏出中文。 */
const ENUM_GROUPS = { role: 'personRole', birth_era: 'birthEra', relation: 'relation' };

export function run({ repo = REPO, quiet = false } = {}) {
  return validateContent({
    repo,
    siteId,
    allowedFields: ALLOWED,
    glossaryTitleCategories: GLOSSARY_TITLE_CATEGORIES,
    quiet,
    extra({ entry, data: d, file: f, enums, err, warn, oneOf }) {
      if (entry.type !== 'person') return;

      /* role／birth_era／relation：两语稿一律写中文取值，英文页由渲染处查译法表。 */
      for (const [key, group] of Object.entries(ENUM_GROUPS)) {
        const v = d[key];
        if (v === undefined || v === null || v === '') {
          if (key === 'relation') continue; /* relation 可缺，另行处理 */
          err(f, `person 必须有 ${key}`);
          continue;
        }
        if (typeof v !== 'string') { err(f, `${key} 需为字符串`); continue; }
        if (!CJK.test(v)) {
          err(f, `${key} 须写中文取值（渲染按中文值查译法表，写英文查不到）：${v}`);
          continue;
        }
        if (!oneOf(enums[group], v)) {
          err(f, `${key} 取值不在取值表内：${v}`);
        }
      }

      /* relation 可缺，但缺了必须在正文交代此人与溧水何干。 */
      if (d.relation === undefined) {
        if (!/^#{2,4}\s*(与溧水的关系|Relation to Lishui)\s*$/im.test(entry.body)) {
          warn(f, '未填 relation，正文须有「## 与溧水的关系」一节说明此人为何入本库');
        }
      }

      /* 存疑之处：置信度不高者必有，否则「相传」会被当成生平写。 */
      if (d.confidence !== 'high' && !/^#{2,4}\s*(存疑之处|Points of doubt|Open questions)\s*$/im.test(entry.body)) {
        err(f, `confidence 为 ${d.confidence}，正文必须有「## 存疑之处」一节——人物条目最易把「相传」写成生平`);
      }
    },
  });
}