#!/usr/bin/env node
/* 溧水内容库 · 内容校验编排
 *
 * 一次跑完全部站点，每站只套本站规则：
 *   · 站点清单来自 schema/sites.json（内容侧登记），新增分站登记即纳入校验；
 *   · 本站专属规则在 scripts/sites/<siteId>.mjs，没有也照样校验——通用规则先行；
 *   · 通用规则（字段、取值表、来源、双语配对、专名一致、译法重叠、跨站隔离）
 *     在共享底座 lishui-kit/validate/engine.mjs。
 *
 * 用法：
 *   node scripts/validate.mjs                  全部站点
 *   node scripts/validate.mjs --site lishui-towns   只校验本站
 *   node scripts/validate.mjs --json           输出问题清单（JSON）
 *
 * 零依赖：只用 node:fs，CI 无需 npm install 就能跑通用规则。
 */

import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateAll, validateContent } from 'lishui-kit/validate/engine.mjs';
import { readSiteRegistry } from 'lishui-kit/schema/read.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** 内容库根目录：scripts/ 上溯一级。 */
export const REPO = resolve(HERE, '..');

const SITES_DIR = join(HERE, 'sites');

/** 扫描 scripts/sites/，得到 siteId → 规则模块。文件名即默认 siteId，模块可显式导出 siteId。 */
async function loadRuleModules() {
  const modules = new Map();
  for (const name of readdirSync(SITES_DIR)) {
    if (!name.endsWith('.mjs')) continue;
    const mod = await import(pathToFileURL(join(SITES_DIR, name)).href);
    const siteId = mod.siteId || name.replace(/\.mjs$/, '');
    modules.set(siteId, { ...mod, siteId });
  }
  return modules;
}

/**
 * 拼出本站要跑的站点清单：以 schema/sites.json 为准。
 * 已登记但没有规则模块的站点，用通用规则跑（不静默跳过）。
 */
function buildSiteList(registry, modules) {
  return Object.keys(registry).map((siteId) => modules.get(siteId) || {
    siteId,
    run: ({ repo, quiet }) => validateContent({ repo, siteId, quiet }),
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const onlyIdx = argv.indexOf('--site');
  const only = onlyIdx !== -1 ? argv[onlyIdx + 1] : null;

  const registry = readSiteRegistry(REPO);
  const modules = await loadRuleModules();

  /* 规则模块必须对应一个已登记的站点，否则是维护者漏登记，直接拦下。
     反向不拦：登记了但没写规则模块，用通用规则跑即可（新站初期就是这种状态）。 */
  const orphans = [...modules.keys()].filter((siteId) => !registry[siteId]);

  let sites = buildSiteList(registry, modules);
  if (only) {
    const hit = sites.filter((m) => m.siteId === only);
    if (hit.length === 0) {
      console.error(`--site ${only} 未在 schema/sites.json 登记。已登记：${Object.keys(registry).join('、')}`);
      process.exit(2);
    }
    sites = hit;
  }

  const result = validateAll({ repo: REPO, sites, quiet: json });

  if (orphans.length > 0) {
    for (const siteId of orphans) {
      console.error(`错误  scripts/sites/${siteId}.mjs 有规则模块，但 schema/sites.json 未登记本站点`);
    }
    result.errors.push(...orphans.map((siteId) => ({
      level: 'error', siteId, file: `scripts/sites/${siteId}.mjs`, msg: 'schema/sites.json 未登记本站点',
    })));
  }

  if (json) console.log(JSON.stringify(result.problems, null, 2));
  process.exit(result.errors.length > 0 ? 1 : 0);
}

main();
