#!/usr/bin/env node
/* 溧水内容库 · 来源台账
 *
 * 把来源层三层目录的每一张卡片，与成果层四个分站的实际引用，交叉成一张台账。
 * 台账回答四个问题：有哪些来源、每份是什么性质、被哪些条目用着、哪些还没用上。
 *
 * 产出三份，均写到 sources/ 下：
 *   ledger.csv   机器可读，一行一张卡片，UTF-8 带 BOM，Excel 与 pandas 直开
 *   ledger.json  同上数据加汇总，供页面与脚本消费
 *   ledger.html  可读视图，带筛选与统计，可直接双击打开
 *
 * 用法：
 *   node scripts/ledger.mjs            生成三份
 *   node scripts/ledger.mjs --csv      只生成 CSV
 *   node scripts/ledger.mjs --quiet    不打印统计摘要
 *
 * 零依赖：只用 node 内置模块，与 scripts/validate.mjs 同风格，CI 无需安装依赖。
 * 站点清单来自 schema/sites.json，新增分站自动纳入，不在此处硬编码。
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSiteRegistry } from 'lishui-kit/schema/read.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** 内容库根目录：scripts/ 上溯一级。 */
const REPO = resolve(HERE, '..');
const SOURCES = join(REPO, 'sources');

/** 来源层三层目录，与 rights.md 的约定一致。 */
const LAYERS = ['records', 'excerpts', 'fulltext'];

/* 取值表的中文名，用于台账可读列。取值与 lishui-kit/schema/enums.common.json 同步。 */
const TYPE_CN = { gov: '政府文件', media: '媒体报道', 'heritage-list': '名录公布', academic: '学术文献', gazetteer: '旧志', epigraphy: '金石碑刻', archive: '档案', fieldwork: '实地调查' };
const RIGHTS_CN = { 'public-domain': '公有领域', 'gov-open': '政务公开', 'excerpt-only': '仅摘录', 'link-only': '仅链接', 'permission-required': '需授权' };
/* 可信度与授权是两个独立维度：rights 管能不能引，reliability 管可不可信。取值同步 enums.common.json。 */
const RELIABILITY_CN = { primary: '一手', secondary: '二手转述', tertiary: '弱来源' };
const ARCHIVE_CN = { fulltext: '全文', 'link-registered': '登记链接', 'catalogued-only': '仅著录', excerpt: '摘录', link: '链接档案' };

/** 机构层级：省级 / 市级 / 区级 / 邻区外 / 其他。区级来源极少，是因为区政府页面多以「南京市溧水区人民政府」名义发布。 */
function levelOf(publisher) {
  if (/江苏省|省人民|省林业|省水利|省自然|省文化|省民政|省地方志|省发改|省交通|省农业|省生态环境|省住房|省住房和城乡|省退役军人|省民族|省宗教|省应急|省交通运/.test(publisher)) return '省级';
  if (/南京市|市人民|市规划|市水务|市文化|市园林|市文旅|市生态环境|市名城|市绿化|市教育|市民族|市宗教|市国防|市机关|市公证|市档案|市地方志|市史志|市税务|市统计|市气象/.test(publisher)) return '市级';
  if (/溧水区|区人民|区文化|区水务|区融媒体|区政协|区人大|区政协|区农业农村/.test(publisher)) return '区级';
  if (/高淳|江宁|句容|当涂|溧水经开|开发区|柘塘|洪蓝|东屏|晶桥|白马|和凤|石湫|永阳/.test(publisher)) return '区级';
  return '其他';
}

/**
 * 解析 front-matter。零依赖，故手写而不引 yaml 包：
 * 只取顶层 `key: value`，并把后续缩进行折叠到上一个标量（支持 note: >- 这类块标量）。
 * 嵌套结构（列表、引号块）本脚本用不到，遇到即按原样拼接。
 */
function parseFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const fm = {};
  let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (kv) { key = kv[1]; fm[key] = kv[2]; continue; }
    const cont = /^\s+(.*)$/.exec(line);
    if (cont && key !== null && fm[key] !== undefined) fm[key] = `${fm[key]} ${cont[1].trim()}`.trim();
  }
  return fm;
}

/** 读来源层三层目录，返回卡片数组。文件名不参与解析，只作定位。 */
function loadCards() {
  const cards = [];
  for (const layer of LAYERS) {
    const dir = join(SOURCES, layer);
    let files;
    try { files = readdirSync(dir); } catch { continue; }
    for (const name of files.filter((f) => f.endsWith('.md')).sort()) {
      const text = readFileSync(join(dir, name), 'utf8');
      const fm = parseFrontMatter(text);
      if (!fm) { warn(`${layer}/${name} 没有 front-matter，已跳过`); continue; }
      let host = '';
      if (fm.url && fm.url !== 'null') {
        try { host = new URL(fm.url).host; } catch { host = '(非 URL)'; }
      }
      cards.push({
        id: fm.id ?? '', layer, file: `${layer}/${name}`,
        type: fm.type ?? '', rights: fm.rights ?? '', reliability: fm.reliability ?? '', archive: fm.archive ?? '',
        title: fm.title ?? '', titleEn: fm.titleEn ?? '',
        publisher: fm.publisher ?? '', publisherEn: fm.publisherEn ?? '',
        url: fm.url ?? '', host, accessed: fm.accessed ?? '',
        locator: fm.locator_hint ?? '', note: fm.note ?? '',
      });
    }
  }
  return cards;
}

/**
 * 扫成果层，统计 (站 → 来源 → 引用条目数)。
 * 站点清单取自 schema/sites.json，新增分站自动纳入。
 */
function countUsage(siteIds) {
  const usage = new Map();
  for (const siteId of siteIds) usage.set(siteId, new Map());
  for (const siteId of siteIds) {
    const dir = join(REPO, 'content', siteId);
    let subs;
    try { subs = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const sub of subs.filter((d) => d.isDirectory())) {
      for (const name of readdirSync(join(dir, sub.name)).filter((f) => f.endsWith('.md'))) {
        const text = readFileSync(join(dir, sub.name, name), 'utf8');
        const m = usage.get(siteId);
        /* 一张卡可能被同一条目引多次（不同 locator），按出现次数计。 */
        for (const ref of text.matchAll(/^[ \t]*-[ \t]*ref:[ \t]*(src:[a-z0-9-]+)/gm)) {
          m.set(ref[1], (m.get(ref[1]) ?? 0) + 1);
        }
      }
    }
  }
  return usage;
}

/** 计数表 → 降序数组。 */
function tally(list, key) {
  const m = new Map();
  for (const x of list) { const k = x[key] || '(空)'; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** CSV 字段转义：含逗号、引号、换行时加引号。 */
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function warn(msg) { process.stderr.write(`  提示：${msg}\n`); }

const args = process.argv.slice(2);
const onlyCsv = args.includes('--csv');
const quiet = args.includes('--quiet');
const outDir = process.env.LISHUI_LEDGER_DIR || SOURCES;

/* 站点清单取自 schema/sites.json 的键，新增分站自动纳入。 */
const registry = readSiteRegistry(REPO);
const siteIds = Object.keys(registry);
const siteName = new Map(siteIds.map((id) => [id, id.replace(/^lishui-/, '')]));

const cards = loadCards();
const usage = countUsage(siteIds);

const ledger = cards.map((c) => {
  const per = {};
  let total = 0;
  for (const s of siteIds) { const n = usage.get(s).get(c.id) ?? 0; per[s] = n; total += n; }
  return {
    ...c,
    level: levelOf(c.publisher),
    typeCn: TYPE_CN[c.type] ?? c.type,
    rightsCn: RIGHTS_CN[c.rights] ?? c.rights,
    reliabilityCn: RELIABILITY_CN[c.reliability] ?? c.reliability,
    archiveCn: ARCHIVE_CN[c.archive] ?? c.archive,
    refTotal: total,
    refPerSite: per,
    refSites: siteIds.filter((s) => per[s] > 0).length,
  };
}).sort((a, b) => b.refTotal - a.refTotal || a.id.localeCompare(b.id));

const used = ledger.filter((r) => r.refTotal > 0);
const unused = ledger.filter((r) => r.refTotal === 0);
const noUrl = ledger.filter((r) => !r.url || r.url === 'null');

/* 同一 URL 建了两张卡：来源是一份资料一卡，重复会让同一页面产生两个 rights 判定，
   并让条目引用分散到两张卡上。这里只报出，不自动合并——合并要人判断保留哪张、
   把引用改指过去，且引用不只在 content/ 下（sources/ 自身的卡、docs/、Plan/ 也会引）。 */
const dupUrlGroups = [...ledger
  .filter((r) => r.url && r.url !== 'null')
  .reduce((m, r) => m.set(r.url, [...(m.get(r.url) ?? []), r]), new Map())]
  .filter(([, rs]) => rs.length > 1)
  .map(([url, rs]) => ({ url, ids: rs.map((r) => r.id), refTotals: rs.map((r) => r.refTotal) }));

const summary = {
  generatedFrom: siteIds,
  total: ledger.length,
  used: used.length,
  unused: unused.length,
  byLayer: tally(ledger, 'layer'),
  byType: tally(ledger, 'typeCn'),
  byRights: tally(ledger, 'rightsCn'),
  byReliability: tally(ledger, 'reliabilityCn'),
  byArchive: tally(ledger, 'archiveCn'),
  byLevel: tally(ledger, 'level'),
  byHost: tally(ledger, 'host').filter(([h]) => h && h !== '(空)'),
  byAccessed: tally(ledger, 'accessed'),
  refTotalAll: ledger.reduce((a, r) => a + r.refTotal, 0),
  perSite: siteIds.map((s) => ({
    id: s, name: siteName.get(s) ?? s,
    sourcesUsed: usage.get(s).size,
    citations: [...usage.get(s).values()].reduce((a, b) => a + b, 0),
    onceUsed: [...usage.get(s).values()].filter((v) => v === 1).length,
  })),
  noUrlIds: noUrl.map((r) => r.id),
  unusedIds: unused.map((r) => r.id),
  dupUrlGroups,
};

/* ---------- 输出 CSV ---------- */
const COLUMNS = [
  ['id', '来源 ID'], ['level', '发布层级'], ['typeCn', '来源类型'], ['rightsCn', '权利状态'], ['reliabilityCn', '可信度'], ['archiveCn', '归档形态'],
  ['publisher', '发布机构'], ['publisherEn', '发布机构（英）'], ['title', '题名'], ['titleEn', '题名（英）'],
  ['host', '域名'], ['accessed', '访问日期'], ['locator', '定位方式'],
  ['refTotal', '被引总数'],
  ...siteIds.map((s) => [`ref.${s}`, `${siteName.get(s) ?? s}引用`]),
  ['refSites', '覆盖站数'], ['file', '卡片文件'], ['url', '链接'], ['note', '著录说明'],
];
const csv = [COLUMNS.map(([, label]) => csvCell(label)).join(',')];
for (const r of ledger) {
  const cells = COLUMNS.map(([k]) => (k.startsWith('ref.') ? r.refPerSite[k.slice(4)] : r[k]));
  csv.push(cells.map(csvCell).join(','));
}
writeFileSync(join(outDir, 'ledger.csv'), '﻿' + csv.join('\r\n'), 'utf8');

/* ---------- 输出 JSON ---------- */
writeFileSync(join(outDir, 'ledger.json'), JSON.stringify({ summary, ledger }, null, 2), 'utf8');

/* ---------- 输出 HTML ---------- */
function renderHtml() {
  const opt = (pairs, current) => pairs.map(([v, n]) => `<option value="${escapeHtml(v)}"${v === current ? ' selected' : ''}>${escapeHtml(v)}（${n}）</option>`).join('');
  const rowsHtml = ledger.map((r) => {
    const perSite = siteIds.map((s) => r.refPerSite[s] || 0).join(',');
    const titleCell = r.url && r.url !== 'null'
      ? `<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a>`
      : escapeHtml(r.title);
    return `<tr data-level="${escapeHtml(r.level)}" data-type="${escapeHtml(r.type)}" data-rights="${escapeHtml(r.rights)}" data-layer="${escapeHtml(r.layer)}" data-used="${r.refTotal > 0 ? '1' : '0'}" data-host="${escapeHtml(r.host)}" data-sites="${perSite}" data-q="${escapeHtml([r.id, r.title, r.titleEn, r.publisher, r.publisherEn, r.note].join(' ')).toLowerCase()}">
<td><code>${escapeHtml(r.id)}</code></td>
<td>${escapeHtml(r.level)}</td>
<td>${escapeHtml(r.typeCn)}</td>
<td>${escapeHtml(r.rightsCn)}</td>
<td>${titleCell}<div class="sub">${escapeHtml(r.publisher)}${r.publisherEn ? ' / ' + escapeHtml(r.publisherEn) : ''}</div></td>
<td>${r.host ? escapeHtml(r.host) : '<span class="muted">无</span>'}</td>
<td>${siteIds.map((s) => r.refPerSite[s] ? `<span class="pill">${escapeHtml(siteName.get(s) ?? s)} ${r.refPerSite[s]}</span>` : '').join(' ')}</td>
<td class="num">${r.refTotal || '<span class="muted">0</span>'}</td>
</tr>`;
  }).join('\n');

  const top = ledger.slice(0, 20);
  const maxRef = top[0]?.refTotal || 1;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>溧水一方 · 来源台账</title>
<style>
:root{
  --bg:#fff; --surface:#F7F9F9; --muted-surface:#EFF4F3; --ink:#1B2422; --ink2:#3C4A47; --muted:#64756F;
  --rule:#D6E0DD; --brand:#0E9C74; --brand-soft:#EAF8F3; --brand-ink:#07503B;
  --warn:#FAAD14; --danger:#FF4D4F;
}
@media (prefers-color-scheme:dark){
  :root{ --bg:#0F1513; --surface:#16201D; --muted-surface:#1D2A26; --ink:#E7EFEC; --ink2:#C2D1CC; --muted:#8FA39C;
    --rule:#263430; --brand:#2FBE92; --brand-soft:#123028; --brand-ink:#7FDCBB; }
}
*{box-sizing:border-box;margin:0;padding:0}
body{font:14px/1.7 'Instrument Sans','PingFang SC','Microsoft YaHei',sans-serif;background:var(--bg);color:var(--ink);padding:32px 16px 64px}
.wrap{max-width:1280px;margin:0 auto}
h1{font-size:24px;letter-spacing:-.01em}
h2{font-size:17px;margin:40px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--rule)}
h3{font-size:14px;margin:20px 0 8px;color:var(--ink2)}
.lede{color:var(--muted);margin:6px 0 24px;max-width:76ch}
a{color:var(--brand);text-decoration:none}
a:hover{text-decoration:underline}
code{font-family:'JetBrains Mono',Consolas,monospace;font-size:12px;background:var(--muted-surface);padding:1px 5px;border-radius:3px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:1px;background:var(--rule);border:1px solid var(--rule);border-radius:8px;overflow:hidden}
.kpi{background:var(--bg);padding:12px 14px}
.kpi b{display:block;font-size:22px;font-weight:600;letter-spacing:-.02em}
.kpi span{color:var(--muted);font-size:12px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--rule);vertical-align:top}
th{color:var(--muted);font-weight:500;font-size:12px;white-space:nowrap}
td.num{text-align:right;font-variant-numeric:tabular-nums}
.bar{display:flex;align-items:center;gap:8px}
.bar i{display:block;height:8px;background:var(--brand-soft);border-radius:2px}
.bar i.on{background:var(--brand)}
.bar span{color:var(--muted);font-size:12px;white-space:nowrap}
.controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}
input,select{font:inherit;font-size:13px;padding:5px 8px;border:1px solid var(--rule);border-radius:6px;background:var(--bg);color:var(--ink)}
input{min-width:230px}
.count{color:var(--muted);font-size:12px;margin-left:auto}
.tbl{overflow-x:auto;border:1px solid var(--rule);border-radius:8px}
.tbl table{min-width:900px}
.tbl thead th{position:sticky;top:0;background:var(--surface);z-index:1}
.sub{color:var(--muted);font-size:12px;margin-top:2px}
.pill{display:inline-block;background:var(--brand-soft);color:var(--brand-ink);border-radius:999px;padding:1px 8px;font-size:11px;margin:1px 3px 1px 0;white-space:nowrap}
.muted{color:var(--muted)}
.callout{border-left:3px solid var(--warn);background:var(--surface);padding:10px 14px;border-radius:0 6px 6px 0;margin:10px 0}
.callout b{color:var(--ink)}
ol,ul{padding-left:22px}
li{margin:3px 0}
</style>
</head>
<body>
<div class="wrap">
<h1>溧水一方 · 来源台账</h1>
<p class="lede">全站群来源层 ${summary.total} 张卡片的完整清单，交叉成果层四个分站的实际引用。数据由 <code>lishui/scripts/ledger.mjs</code> 从 <code>sources/</code> 与 <code>content/</code> 现场生成，可随内容增长重跑。</p>

<div class="kpis">
  <div class="kpi"><b>${summary.total}</b><span>来源卡片</span></div>
  <div class="kpi"><b>${summary.used}</b><span>已被条目引用</span></div>
  <div class="kpi"><b>${summary.unused}</b><span>尚未被引用</span></div>
  <div class="kpi"><b>${summary.refTotalAll}</b><span>引用总次数</span></div>
  <div class="kpi"><b>${summary.byHost.length}</b><span>来源域名</span></div>
  <div class="kpi"><b>${summary.byLevel.find((x) => x[0] === '省级')?.[1] ?? 0}</b><span>省级来源</span></div>
  <div class="kpi"><b>${summary.byLevel.find((x) => x[0] === '市级')?.[1] ?? 0}</b><span>市级来源</span></div>
  <div class="kpi"><b>${summary.byLevel.find((x) => x[0] === '区级')?.[1] ?? 0}</b><span>区级来源</span></div>
</div>

<h2>1 分层结构</h2>
<p class="lede">来源分三层：<code>records/</code> 是链接档案，<code>excerpts/</code> 是受版权保护资料的摘录卡，<code>fulltext/</code> 是公有领域旧志。三层对应不同的 <code>archive</code> 取值，引用规则也不同。</p>
<div class="grid2">
<div>
<table><thead><tr><th>目录</th><th>放什么</th><th class="num">份数</th></tr></thead><tbody>
<tr><td><code>records/</code></td><td>政府页面、批复、名录的链接档案</td><td class="num">${summary.byLayer.find((x) => x[0] === 'records')?.[1] ?? 0}</td></tr>
<tr><td><code>excerpts/</code></td><td>受版权保护资料的摘录卡</td><td class="num">${summary.byLayer.find((x) => x[0] === 'excerpts')?.[1] ?? 0}</td></tr>
<tr><td><code>fulltext/</code></td><td>公有领域旧志全文或著录</td><td class="num">${summary.byLayer.find((x) => x[0] === 'fulltext')?.[1] ?? 0}</td></tr>
</tbody></table>
</div>
<div>
<table><thead><tr><th>权利状态</th><th>引用限制</th><th class="num">份数</th></tr></thead><tbody>
${summary.byRights.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td class="muted">${{ '公有领域': '可引原文，须标卷次', '政务公开': '可引事实与必要短句', '仅摘录': '只摘事实，不整段转录', '仅链接': '只作存在性佐证', '需授权': '判不准即不引' }[k] ?? ''}</td><td class="num">${v}</td></tr>`).join('')}
</tbody></table>
</div>
</div>

<h2>2 发布机构层级与域名</h2>
<div class="grid2">
<div>
<h3>按层级</h3>
<table><thead><tr><th>层级</th><th class="num">份数</th></tr></thead><tbody>
${summary.byLevel.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td class="num">${v}</td></tr>`).join('')}
</tbody></table>
<p class="sub" style="margin-top:8px">区级来源少，是因为区政府各部门的文件多以「南京市溧水区人民政府」名义发布，已计入市级。</p>
</div>
<div>
<h3>按域名（前 12）</h3>
<table><thead><tr><th>域名</th><th class="num">份数</th></tr></thead><tbody>
${summary.byHost.slice(0, 12).map(([k, v]) => `<tr><td><code>${escapeHtml(k)}</code></td><td class="num">${v}</td></tr>`).join('')}
</tbody></table>
</div>
</div>

<h2>3 四个分站的来源依赖</h2>
<table><thead><tr><th>分站</th><th class="num">用到来源</th><th class="num">引用次数</th><th class="num">只用一次</th><th>高频依赖</th></tr></thead><tbody>
${summary.perSite.map((s) => {
  const top = [...usage.get(s.id).entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  return `<tr><td>${escapeHtml(s.name)}<div class="sub"><code>${escapeHtml(s.id)}</code></div></td><td class="num">${s.sourcesUsed}</td><td class="num">${s.citations}</td><td class="num">${s.onceUsed}</td><td>${top.map(([r, c]) => `<span class="pill">${escapeHtml(r.replace('src:', ''))} ×${c}</span>`).join(' ')}</td></tr>`;
}).join('')}
</tbody></table>

<h2>4 引用最多的来源</h2>
<table><thead><tr><th>来源</th><th>题名</th><th class="num">被引</th><th style="width:200px">分布</th></tr></thead><tbody>
${top.map((r) => `<tr><td><code>${escapeHtml(r.id)}</code></td><td>${escapeHtml(r.title.slice(0, 40))}</td><td class="num">${r.refTotal}</td><td><div class="bar"><i class="on" style="width:${Math.round(r.refTotal / maxRef * 150)}px"></i><span>${siteIds.filter((s) => r.refPerSite[s]).map((s) => `${siteName.get(s) ?? s} ${r.refPerSite[s]}`).join('，')}</span></div></td></tr>`).join('')}
</tbody></table>

<h2>5 尚未被引用的 ${summary.unused} 份</h2>
<div class="callout"><b>这些卡片已建但没有任何条目挂上去。</b>多数是第 2 期扩量预留的线索，或是与某条结论相关但正文暂未使用。留着不影响校验（校验只查「引的来源是否存在」，不查「来源是否被引」），但值得定期清理或转为条目。</div>
<table><thead><tr><th>来源 ID</th><th>类型</th><th>题名</th><th>著录说明首句</th></tr></thead><tbody>
${unused.map((r) => `<tr><td><code>${escapeHtml(r.id)}</code></td><td>${escapeHtml(r.typeCn)}</td><td>${escapeHtml(r.title.slice(0, 46))}</td><td class="muted">${escapeHtml(r.note.replace(/[>|-]/g, ' ').trim().slice(0, 90))}</td></tr>`).join('')}
</tbody></table>

<h2>6 无在线链接的 ${noUrl.length} 份</h2>
<p class="lede">这些卡片 <code>url</code> 为 <code>null</code>，归档状态是「仅著录」。它们的价值在于书目著录（纂修者、卷数、成书年份），引用时只作文献依据，不作数据来源。</p>
<table><thead><tr><th>来源 ID</th><th>题名</th><th>归档形态</th></tr></thead><tbody>
${noUrl.map((r) => `<tr><td><code>${escapeHtml(r.id)}</code></td><td>${escapeHtml(r.title)}</td><td>${escapeHtml(r.archiveCn)}</td></tr>`).join('')}
</tbody></table>

<h2>7 全量清单</h2>
<div class="controls">
  <input id="q" type="search" placeholder="搜来源 ID、题名、发布机构、著录说明…" aria-label="搜索">
  <select id="level" aria-label="发布层级"><option value="">全部层级</option>${opt(summary.byLevel, '')}</select>
  <select id="type" aria-label="来源类型"><option value="">全部类型</option>${opt(summary.byType, '')}</select>
  <select id="rights" aria-label="权利状态"><option value="">全部权利状态</option>${opt(summary.byRights, '')}</select>
  <select id="layer" aria-label="归档层"><option value="">全部层</option>${opt(summary.byLayer, '')}</select>
  <select id="used" aria-label="是否被引"><option value="">全部</option><option value="1">已被引用</option><option value="0">未被引用</option></select>
  <span class="count" id="count"></span>
</div>
<div class="tbl">
<table>
<thead><tr><th>来源 ID</th><th>层级</th><th>类型</th><th>权利</th><th>题名与发布机构</th><th>域名</th><th>各站引用</th><th class="num">被引</th></tr></thead>
<tbody id="rows">
${rowsHtml}
</tbody>
</table>
</div>

<p class="sub" style="margin-top:28px">生成自 <code>lishui/scripts/ledger.mjs</code>。机器可读版本：<code>sources/ledger.csv</code>（UTF-8 BOM，Excel 直开）与 <code>sources/ledger.json</code>。重跑：<code>npm run ledger --prefix lishui</code>。</p>
</div>
<script>
(function(){
  var q=document.getElementById('q'),sel=['level','type','rights','layer','used'].map(function(id){return document.getElementById(id)});
  var rows=[].slice.call(document.querySelectorAll('#rows tr')),count=document.getElementById('count');
  function apply(){
    var kw=q.value.trim().toLowerCase(),f=sel.map(function(s){return s.value}),n=0;
    rows.forEach(function(tr){
      var ok=!kw||tr.dataset.q.indexOf(kw)>-1;
      for(var i=0;i<f.length;i++){ if(f[i]&&tr.dataset[['level','type','rights','layer','used'][i]]!==f[i]){ok=false;break} }
      tr.style.display=ok?'':'none'; if(ok)n++;
    });
    count.textContent=n+' / '+rows.length+' 条';
  }
  [q].concat(sel).forEach(function(el){el.addEventListener('input',apply);el.addEventListener('change',apply)});
  apply();
})();
</script>
</body>
</html>`;
}

if (!onlyCsv) writeFileSync(join(outDir, 'ledger.html'), renderHtml(), 'utf8');

if (!quiet) {
  const out = process.stdout;
  out.write(`来源卡片 ${summary.total} 张：records ${summary.byLayer.find((x) => x[0] === 'records')?.[1] ?? 0}、excerpts ${summary.byLayer.find((x) => x[0] === 'excerpts')?.[1] ?? 0}、fulltext ${summary.byLayer.find((x) => x[0] === 'fulltext')?.[1] ?? 0}\n`);
  out.write(`权利状态：${summary.byRights.map(([k, v]) => `${k} ${v}`).join('、')}\n`);
  out.write(`可信度：${summary.byReliability.map(([k, v]) => `${k} ${v}`).join('、')}\n`);
  out.write(`发布层级：${summary.byLevel.map(([k, v]) => `${k} ${v}`).join('、')}\n`);
  out.write(`来源域名 ${summary.byHost.length} 个；访问日期集中在 ${summary.byAccessed.slice(0, 3).map(([k, v]) => `${k}（${v}）`).join('、')}\n`);
  for (const s of summary.perSite) {
    out.write(`  ${s.name}（${s.id}）：用到 ${s.sourcesUsed} 份来源，引用 ${s.citations} 次，其中只引一次 ${s.onceUsed} 份\n`);
  }
  out.write(`已被引用 ${summary.used} 份，未被引用 ${summary.unused} 份${unused.length ? '：' + unused.map((r) => r.id).join('、') : ''}\n`);
  out.write(`无在线链接 ${noUrl.length} 份：${noUrl.map((r) => r.id).join('、')}\n`);
  if (dupUrlGroups.length) {
    out.write(`\n警告：${dupUrlGroups.length} 组同一 URL 建了两张卡，须合并（保留一张、改指引用、删另一张）：\n`);
    for (const g of dupUrlGroups) {
      out.write(`  ${g.url}\n`);
      g.ids.forEach((id, i) => out.write(`    - ${id}（被引 ${g.refTotals[i]} 次）\n`));
    }
  }
  out.write(`引用总次数 ${summary.refTotalAll}\n`);
  out.write(`\n已生成：\n  ${join(outDir, 'ledger.csv')}\n  ${join(outDir, 'ledger.json')}\n${onlyCsv ? '' : `  ${join(outDir, 'ledger.html')}\n`}`);
}
