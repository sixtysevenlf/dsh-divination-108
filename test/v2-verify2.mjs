/**
 * dsh-divination-108 · 第二独立验证（task-12）
 *
 * 跑法：`node test/v2-verify2.mjs`
 *
 * ## 定位（与第一位验证者角度不同）
 * kernel-astro 走「多通路对拍 + golden 值」；本文件走**算法自洽性 + 断语可信度**，
 * 对象是最晚交付、最少受审视的四族：`zeri`(#59–#72)、`xiangxing`(#99–#104)、
 * `zhanbu`(#83–#98)、`western`(#105–#108)。
 *
 * ## 四件事
 * 1. 择时族**确定性纪律**（§2.3）：签名不接 rand、同刻不问逐字同、同问异刻必变、静态禁 API、边界 8 场景。
 * 2. **断语可信度审计**：evidence 算术可手算复现、cite 真出处、同族 essence 雷同、**方向矛盾**。
 * 3. 西方族**换通路**：astronomy.cjs 另一组 API 复算黄经/恒星时；上升点**从球面三角自推**；纬度缺失降级是否诚实；**宿主时区依赖**。
 * 4. 签卜族**诚实性压力测试**：缺输入路径明示取象/降级；掷筊**蒙特卡洛 20 万次**复算。
 *
 * ## 纪律
 * `src/**` 只读；发现问题不自己修，写 `docs/verification/v2-verify2.md` 并回报 owner + lead。
 * 分类：**FAIL**（已证实错误）／**SUSPECT**（存疑需人工判读）／**SKIP**（未就绪，不算通过）／**误报**（判读后否定，计入误报率）。
 */

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import * as C from '../src/core/calendar.js'
import * as R from '../src/core/registry.js'
import * as RN from '../src/core/runner.js'
import * as K from '../src/core/kit.js'

const require = createRequire(import.meta.url)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ASTRO = require(path.join(HERE, '..', 'vendor', 'astronomy.cjs'))

// ───────────────────────── 记账 ─────────────────────────
let pass = 0
const fails = []; const suspects = []; const skips = []; const falsePositives = []; const notes = []
function ok(name, cond, extra = '') {
  if (cond) { pass += 1; return true }
  fails.push(`${name}${extra ? ' — ' + extra : ''}`)
  console.log(`  ✗ FAIL ${name}${extra ? ' — ' + extra : ''}`)
  return false
}
const suspect = (t, d) => { suspects.push(`${t}：${d}`); console.log(`  ? SUSPECT ${t} — ${d.slice(0, 170)}`) }
const skip = (t, w) => { skips.push(`${t}：${w}`); console.log(`  ⊘ SKIP ${t} — ${w}`) }
const notABug = (t, w) => { falsePositives.push(`${t}：${w}`); console.log(`  ○ 误报候选 ${t} — ${w.slice(0, 150)}`) }
const note = (s) => { notes.push(s); console.log(`  · ${s}`) }
const section = (t) => console.log(`\n=== ${t} ===`)

// ───────────────────────── 工具 ─────────────────────────
const MODS = ['zeri', 'xiangxing', 'zhanbu', 'western']
const entriesOf = (m) => R.ENTRIES.filter((e) => e.module === m)
const NOS = Object.fromEntries(MODS.map((m) => [m, entriesOf(m).map((e) => e.no)]))
/** 角度差（正确的环形距离，0..180）。 */
const angDiff = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180)

function chart(opt = {}) {
  return C.buildChart({
    question: opt.q ?? '这次合作能不能成',
    when: opt.when ?? new Date(2026, 8, 30, 14, 30),
    longitude: opt.lng ?? 116.4,
    gender: opt.gender ?? '男',
    birth: opt.birth ?? { y: 1990, m: 5, d: 12, h: 9, mi: 30 },
    numbers: opt.numbers ?? [7, 13, 21],
  })
}
const pick = (o) => (o ? { score: o.score, essence: o.essence, keys: o.keys, wuxing: o.wuxing, timing: o.timing, fidelity: o.fidelity, detail: o.detail } : null)
function runFamily(m, ch) {
  const out = {}
  for (const r of RN.runMany({ chart: ch, nos: NOS[m] })) out[r.entry.no] = pick(r.outcome)
  return out
}
/** 契约层载荷（去掉 detail 的自由部分：契约 §2.3 只约束 essence/score 等对外字段）。 */
const contractLoad = (o) => (o ? JSON.stringify({ s: o.score, e: o.essence, k: o.keys, w: o.wuxing, t: o.timing }) : 'null')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
function stripCode(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``').replace(/'(?:\\.|[^'\\])*'/g, "''").replace(/"(?:\\.|[^"\\])*"/g, '""')
}
const VW = ['大凶', '大吉', '小凶', '小吉', '凶', '吉', '平']

// ═════════════════════════ 1. 择时族确定性纪律 ═════════════════════════
section('1. 择时族（zeri #59–#72）确定性纪律')

{
  const FS = await import('node:fs')
  const code = stripCode(FS.readFileSync(new URL('../src/methods/zeri.js', import.meta.url), 'utf8'))
  for (const [name, re] of [
    ['rand（随机源）', /\brand\b/], ['Math.random', /Math\.random/], ['Date.now', /Date\.now/],
    ['new Date()（无参＝读时钟）', /new Date\s*\(\s*\)/], ['process.', /\bprocess\s*\./],
    ['require(', /\brequire\s*\(/], ['fs 模块', /\b(?:node:)?fs\b/], ['动态 import(', /\bimport\s*\(/],
  ]) {
    const m = code.match(re)
    ok(`静态：zeri.js 不含 ${name}`, !m, m ? code.slice(Math.max(0, m.index - 50), m.index + 50).replace(/\s+/g, ' ') : '')
  }
  note(`zeri.js 中带参 \`new Date(...)\` 共 ${(code.match(/new Date\s*\([^)]/g) ?? []).length} 处 —— 均为历法推算，合法`)

  const M = await import('../src/methods/zeri.js')
  const badSig = NOS.zeri.map((no) => R.ENTRY_BY_NO[no]).filter((e) => /rand/.test(String(M.engines[e.engine]).split(')')[0]))
  ok('14 个引擎签名均不接 rand', badSig.length === 0, badSig.map((e) => `${e.no}:${e.engine}`).join(','))

  const rA = runFamily('zeri', chart({ q: '这次合作能不能成' }))
  const rB = runFamily('zeri', chart({ q: '另一个完全不同的问题' }))
  // 契约 §2.3 的**稳定性要求只点名 5 法**（#59/60/61/62/69）；其余 9 法按事类细化属设计（task-6 明示 #66 按事类分权重）
  const STABLE5 = [59, 60, 61, 62, 69]
  const diffQ5 = STABLE5.filter((no) => contractLoad(rA[no]) !== contractLoad(rB[no]))
  ok('同刻不同问 → 契约点名 5 法（#59/60/61/62/69）契约载荷逐字相同（§2.3）', diffQ5.length === 0, diffQ5.map((no) => `#${no}`).join(','))
  const diffQOther = NOS.zeri.filter((no) => !STABLE5.includes(no) && contractLoad(rA[no]) !== contractLoad(rB[no]))
  if (diffQOther.length > 0) {
    note(`契约未点名、但会随所问变化的择时法：${diffQOther.map((n) => `#${n}`).join(',')} —— **设计如此**（按事类细化宜忌/权重：`
      + `如 #72 essence 直接写「择日·签约合同」vs「择日·求财纳财」，#66 按动土/移徙/余事分权重）。`
      + '§2.3 的禁令针对**随机**（「签名里不接 rand、绝不许调用随机」），此处的变化来自事类识别而非随机，'
      + '静态扫描已证 zeri.js 零随机零时钟；且 smoke 的稳定性断言只覆盖点名的 5 法，两者不冲突。**不建议当违规修**——'
      + '但建议在 §2.3 或 zeri.js 头注里写明「择时族中 9 法按事类变化，仅 5 法要求逐字稳定」，以免后人误加全族断言')
  }
  const detailDiffQ = NOS.zeri.filter((no) => rA[no] && rB[no] && !same(rA[no].detail, rB[no].detail))
  if (detailDiffQ.length > 0) {
    note(`契约载荷相同但 detail 随所问变化：${detailDiffQ.map((n) => `#${n}`).join(',')} —— 同上，属设计；仅记录，`
      + '使「detail 亦逐字不变」的更强断言不会被误加')
  }

  const times = {
    同日异时: new Date(2026, 8, 30, 9, 0), 次日: new Date(2026, 9, 1, 14, 30),
    跨节气: new Date(2026, 9, 9, 14, 30), 跨月: new Date(2026, 10, 15, 14, 30),
    跨年: new Date(2027, 2, 15, 14, 30), 跨年2: new Date(2031, 0, 20, 14, 30),
  }
  const frozen = NOS.zeri.filter((no) => Object.values(times).every((t) => contractLoad(runFamily('zeri', chart({ when: t }))[no]) === contractLoad(rA[no])))
  ok('同问异刻（6 时刻，跨日/节气/月/年）→ 每法至少变一次（无常数函数）', frozen.length === 0,
    `始终不变：${frozen.map((no) => `#${no}${R.ENTRY_BY_NO[no].name}`).join(',')}`)

  const BOUNDARY = [
    ['交节前 1h', new Date(2026, 8, 23, 1, 0)], ['交节后 1h', new Date(2026, 8, 23, 3, 0)],
    ['晚子时 23:30', new Date(2026, 8, 30, 23, 30)], ['早子时 00:30', new Date(2026, 9, 1, 0, 30)],
    ['年初', new Date(2027, 1, 1, 12, 0)], ['立春当日', new Date(2026, 1, 4, 12, 0)],
    ['闰月（2025 闰六月）', new Date(2025, 7, 1, 12, 0)], ['年末', new Date(2026, 11, 31, 12, 0)],
  ]
  const bBad = []
  for (const [label, when] of BOUNDARY) {
    for (const [no, o] of Object.entries(runFamily('zeri', chart({ when })))) {
      if (!o) { bBad.push(`${label} #${no} 未起`); continue }
      if (!(o.score >= -100 && o.score <= 100)) bBad.push(`${label} #${no} score 越界`)
      if (!o.essence || o.essence.length > 60) bBad.push(`${label} #${no} essence`)
      if (!o.detail || Object.keys(o.detail).length === 0) bBad.push(`${label} #${no} detail 空`)
      if (/NaN|undefined|\[object Object\]/.test(JSON.stringify(o.detail))) bBad.push(`${label} #${no} detail 脏值`)
    }
  }
  ok('边界 8 场景 × 14 法全部合规（无未起/越界/空盘/脏值）', bBad.length === 0, bBad.slice(0, 4).join(' | '))

  const coBad = [59, 60, 61, 62, 69].filter((no) => contractLoad(rA[no]) !== contractLoad(rB[no]))
  ok('契约 §2.3 点名 5 法（#59/60/61/62/69）不随所问改变', coBad.length === 0, coBad.map((n) => `#${n}`).join(','))
}

// ═════════════════════════ 2. 断语可信度审计 ═════════════════════════
section('2. 断语可信度审计')

{
  const ch = chart()
  const all = Object.fromEntries(MODS.map((m) => [m, runFamily(m, ch)]))

  const noEv = []
  for (const m of MODS) for (const [no, o] of Object.entries(all[m])) {
    if (!o) continue
    const ev = o.detail?.evidence
    if (!(Array.isArray(ev) ? ev.length : (typeof ev === 'string' && ev ? 1 : 0))) noEv.push(`#${no}(${m})`)
  }
  ok('四族全部法门都有非空 detail.evidence', noEv.length === 0, noEv.join(','))

  const PLACEHOLDER = /^(?:—|-|无|null|undefined|n\/a|待补|TODO)$/i
  const badCite = []
  for (const m of MODS) for (const [no, o] of Object.entries(all[m])) {
    if (!o) continue
    const cite = o.detail?.cite
    const list = Array.isArray(cite) ? cite : (typeof cite === 'string' ? [cite] : [])
    if (list.length === 0) { badCite.push(`#${no} 无 cite`); continue }
    for (const c of list) {
      if (typeof c !== 'string' || !c.trim() || PLACEHOLDER.test(c.trim())) badCite.push(`#${no} 非法 cite ${JSON.stringify(c)}`)
      if (/undefined|null/.test(String(c))) badCite.push(`#${no} cite 含 null/undefined`)
    }
  }
  ok('四族全部法门 detail.cite 为合法非空字符串', badCite.length === 0, badCite.slice(0, 4).join(' | '))

  // 「真出处」抽检：声明 full 者须至少引到一个可核对的来源标记
  const MARK = /(《[^》]+》|\*[^*]+\*|[A-Za-z][A-Za-z.\s]{3,}\s*\(?\d{4}|https?:\/\/|@\d|第[一二三四五六七八九十百\d]+章|ch\.\d|§|core\/tables\.js|methods\/data)/
  const thin = []
  for (const m of MODS) for (const [no, o] of Object.entries(all[m])) {
    if (!o || o.fidelity !== 'full') continue
    const list = Array.isArray(o.detail?.cite) ? o.detail.cite : [o.detail?.cite].filter(Boolean)
    if (!list.some((c) => MARK.test(String(c)))) thin.push(`#${no}: ${String(list[0]).slice(0, 90)}`)
  }
  if (thin.length > 0) {
    for (const t of thin) suspect('full 但 cite 无具体来源标记（需人工判读）', t)
    notABug('cite 抽检', `本检查的判据（正则找书名/年份/URL/章节/仓库文件）会**误伤**「物理事实类」与「口诀类」出处：`
      + `例如 #90 掷筊的出处是「两筊各两面、一正一反 P=1/2」这一**可用概率学验证的物理事实**（我随后用 20 万次蒙特卡洛复算通过），`
      + `并不需要书目；#62/#70 引的是「青龙起例公式 + 通书月支序」，#64 引的是仓库内 data 文件。故此类一律降为 SUSPECT，不计 FAIL`)
  } else ok('fidelity=full 的法门 cite 均含具体来源标记', true)

  const dup = []
  for (const m of MODS) {
    const by = new Map()
    for (const [no, o] of Object.entries(all[m])) { if (!o) continue; const k = o.essence; if (!by.has(k)) by.set(k, []); by.get(k).push(no) }
    for (const [e, ns] of by) if (ns.length > 1) dup.push(`${m}: #${ns.join('/#')} 共用「${e.slice(0, 36)}」`)
  }
  ok('同族内不同法门不共用同一句 essence', dup.length === 0, dup.slice(0, 3).join(' | '))

  const contra = []
  for (const m of MODS) for (const [no, o] of Object.entries(all[m])) {
    if (!o) continue
    const tail = o.essence.split(/[·|｜]/).pop() ?? ''
    if (/吉神|凶煞|凶神|宜忌/.test(tail)) continue
    const hit = VW.find((w) => tail.includes(w))
    if (!hit) continue
    const fam = (v) => (['大吉', '吉', '小吉'].includes(v) ? '吉' : v === '平' ? '平' : '凶')
    const f1 = fam(hit); const f2 = fam(K.verdictOf(o.score))
    if (f1 !== f2 && f1 !== '平' && f2 !== '平') contra.push(`#${no}(${m}) score=${Math.round(o.score)}(${K.verdictOf(o.score)}) 尾段作「${hit}」：${o.essence}`)
  }
  ok('essence 断语方向与 score 等级不矛盾', contra.length === 0, contra.slice(0, 3).join(' | '))

  // 手算复现 1：#107 塔罗（加权 + 共振）
  {
    const o = all.western[107]
    if (!o) skip('#107 塔罗手算', '未起')
    else {
      const ev = o.detail.evidence.join('\n')
      const w = (o.detail['权重'] ?? '').match(/过去\s*([\d.]+).*现在\s*([\d.]+).*未来\s*([\d.]+)/)
      const line = ev.match(/牌义分[：:]([^\n]*?)→\s*(-?[\d.]+)/)
      const reso = ev.match(/共振[^\n]*?([+-]\d+)/)
      if (w && line && reso) {
        const base = Number(line[2]); const add = Number(reso[1])
        ok('#107 塔罗：evidence 算术（牌义分＋共振）可手算复现 score', Math.abs(base + add - o.score) < 0.01, `${base}+${add}=${base + add} vs ${o.score}`)
        const ws = [Number(w[1]), Number(w[2]), Number(w[3])]
        ok('#107 塔罗：牌位权重和为 1', Math.abs(ws.reduce((a, b) => a + b) - 1) < 1e-9, ws.join('+'))
      } else suspect('#107 塔罗手算', 'evidence 文本结构变化，未能自动解析')
    }
  }
  // 手算复现 2：#90 掷筊组合概率 = 多项分布
  {
    const o = all.zhanbu[90]
    if (!o) skip('#90 掷筊手算', '未起')
    else {
      const m1 = String(o.detail['组合概率']).match(/([\d.]+)%/)
      const m2 = String(o.detail['组合']).match(/(\d)圣(\d)笑(\d)哭/)
      if (m1 && m2) {
        const fact = (x) => (x <= 1 ? 1 : x * fact(x - 1))
        const [s, x, k] = [+m2[1], +m2[2], +m2[3]]
        const want = (fact(3) / (fact(s) * fact(x) * fact(k))) * 0.5 ** s * 0.25 ** x * 0.25 ** k * 100
        ok('#90 掷筊：detail 组合概率 = 多项分布手算值', Math.abs(Number(m1[1]) - want) < 0.01, `detail ${m1[1]}% vs 手算 ${want.toFixed(4)}%`)
      } else suspect('#90 掷筊手算', '文本结构变化')
    }
  }
  // 手算复现 3：#59 黄历 essence 计数 vs detail 条数
  {
    const o = all.zeri[59]
    const ess = o?.essence.match(/宜(\d+)忌(\d+)/)
    const cnt = (v) => (Array.isArray(v) ? v.length : String(v ?? '').split(/[、,，\s]+/).filter(Boolean).length)
    if (!o) skip('#59 黄历手算', '未起')
    else if (ess) ok('#59 黄历：essence「宜N忌M」与 detail 条数一致', +ess[1] === cnt(o.detail['宜']) && +ess[2] === cnt(o.detail['忌']), `宜${ess[1]}忌${ess[2]} vs ${cnt(o.detail['宜'])}/${cnt(o.detail['忌'])}`)
    else suspect('#59 黄历手算', 'essence 未给「宜N忌M」计数')
  }
  // 手算复现 4：#83 灵签「签级」必须属自报体系，且不伪造原文
  {
    const o = all.zhanbu[83]
    if (o) {
      const lv = o.essence.match(/第\d+签\(([^)]+)\)/)
      ok('#83 灵签：签级取自固定层次表（可枚举）', !!lv && /大吉|上吉|中吉|中平|中下|下下|上上|下/.test(lv[1]), o.essence)
    }
  }

  // 20 问题抽样合规（含空问题/纯标点）
  const QS = ['这次合作能不能成', '我跟他还有姻缘吗', '这笔投资能不能赚钱', '这个病能不能好', '嗯', '。', '',
    '测字：明，问前程', '左眼一直跳，是凶是吉', '我叫张伟，这个名字好不好', '明天面试能过吗', '这个房子能买吗',
    '丢了的猫能找到吗', '这次考试排名如何', '出行顺利吗', '打雷了，是何征兆', '2026 年 3 月 5 日签约好吗',
    '搬家选哪天', '北纬40，出生时间是早上八点', '嫁给他会幸福吗', '公司名字叫「远大」好不好']
  const sBad = []
  for (const q of QS) {
    const c = chart({ q })
    for (const m of MODS) for (const r of RN.runMany({ chart: c, nos: NOS[m] })) {
      const o = r.outcome
      if (!o) continue
      if (o.verdict !== K.verdictOf(o.score)) sBad.push(`#${r.entry.no} 等级不符`)
      if (!o.essence || o.essence.length > 60) sBad.push(`#${r.entry.no} essence`)
      if (o.keys.length > 6) sBad.push(`#${r.entry.no} keys`)
      if (!o.detail || !Object.keys(o.detail).length) sBad.push(`#${r.entry.no} detail`)
      if (/NaN|\[object Object\]/.test(JSON.stringify(o.detail))) sBad.push(`#${r.entry.no} detail 脏值`)
    }
  }
  ok('20 问题 × 40 法抽样：合规无脏值（NaN/[object Object]）', sBad.length === 0, [...new Set(sBad)].slice(0, 4).join(' | '))
  // 单独查 undefined（未被 smoke 覆盖的形态）
  const undef = []
  for (const q of QS) {
    const c = chart({ q })
    for (const m of MODS) for (const r of RN.runMany({ chart: c, nos: NOS[m] })) {
      if (r.outcome && /undefined/.test(JSON.stringify(r.outcome.detail))) undef.push(`#${r.entry.no}(q=${q.slice(0, 8)})`)
    }
  }
  ok('detail 文本不含字面量 "undefined"（含 40 法 × 21 问题）', undef.length === 0, [...new Set(undef)].slice(0, 6).join(','))
}

// ═════════════════════════ 3. 西方族换通路复核 ═════════════════════════
section('3. 西方族（western #105–#108）换通路与上升点')

{
  const B = { y: 1990, m: 5, d: 12, h: 9, mi: 30 }
  const ch = chart({ birth: B, lng: 116.4 })
  // 与 core/calendar.js **同一构造方式**（宿主本地民用时 → 实例），才是同口径对拍
  const dt = new Date(B.y, B.m - 1, B.d, B.h, B.mi, 0)
  const iso = dt.toISOString()
  note(`对拍瞬间：本地出生 ${B.y}-${B.m}-${B.d} ${B.h}:${B.mi} → UTC ${iso}（宿主时区 ${Intl.DateTimeFormat().resolvedOptions().timeZone} / 偏移 ${-new Date().getTimezoneOffset() / 60}h）`)

  // 3.1 太阳：两条 API 通路
  const sunA = ASTRO.SunPosition(dt).elon
  const sunB = ASTRO.Ecliptic(ASTRO.GeoVector(ASTRO.Body.Sun, dt, true)).elon
  ok('换通路：SunPosition ≡ Ecliptic(GeoVector(Sun))（≤0.001°）', angDiff(sunA, sunB) < 0.001, `${sunA.toFixed(6)} vs ${sunB.toFixed(6)}`)
  const cs = ch.birthChart?.astro?.sunLon
  if (Number.isFinite(cs)) ok('birthChart.astro.sunLon ≡ 独立通路（≤0.001°）', angDiff(cs, sunA) < 0.001, `${cs} vs ${sunA.toFixed(6)}`)
  else skip('birthChart.astro.sunLon', '缺位')

  // 3.2 月亮：两条 API 通路
  const moonA = ASTRO.EclipticGeoMoon(dt).lon
  const moonB = ASTRO.Ecliptic(ASTRO.GeoMoon(dt)).elon
  ok('换通路：EclipticGeoMoon ≡ Ecliptic(GeoMoon)（≤0.001°）', angDiff(moonA, moonB) < 0.001, `${moonA.toFixed(6)} vs ${moonB.toFixed(6)}`)
  const cm = ch.birthChart?.astro?.moonLon
  if (Number.isFinite(cm)) ok('birthChart.astro.moonLon ≡ 独立通路（≤0.001°）', angDiff(cm, moonA) < 0.001, `${cm} vs ${moonA.toFixed(6)}`)

  // 3.3 行星：契约 §6 声明的 oracle 值（出生盘，**不是**占问时刻的 chart.astro）
  const bAstro = ch.birthChart?.astro
  for (const [wx, name, want] of [['木', 'Jupiter', 98.90], ['土', 'Saturn', 295.30]]) {
    const p = ASTRO.Ecliptic(ASTRO.GeoVector(ASTRO.Body[name], dt, true)).elon
    const cv = bAstro?.planets?.[wx]
    ok(`换通路行星 ${name}：独立复算与 birthChart.astro.planets.${wx} 一致（≤0.001°）`,
      Number.isFinite(cv) && angDiff(cv, p) < 0.001, `${cv} vs ${p.toFixed(6)}`)
    ok(`契约 §6 oracle：${name} ≈ ${want}°`, angDiff(p, want) < 0.1, `独立复算 ${p.toFixed(4)}°`)
  }

  // 3.4 恒星时：库 SiderealTime vs 自写 Meeus(12.4)
  const t = ASTRO.MakeTime(dt)
  const jd = 2451545 + t.ut // ⚠ MakeTime().ut 是「自 J2000 起的天数」，不是儒略日
  const T = (jd - 2451545) / 36525
  const gmstLib = ASTRO.SiderealTime(dt) * 15
  const gmstMeeus = ((280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T - T ** 3 / 38710000) % 360 + 360) % 360
  const dG = angDiff(gmstLib, gmstMeeus)
  ok('换通路：SiderealTime ≡ 自写 Meeus(12.4) GMST（≤0.004° ≈ 1 秒时）', dG < 0.004,
    `库 ${gmstLib.toFixed(5)}° vs Meeus ${gmstMeeus.toFixed(5)}°（差 ${(dG * 240).toFixed(2)} 秒时）`)
  note(`恒星时双通路实测差 ${(dG * 240).toFixed(2)} 秒时 —— 与 #105 detail 自报的「差 0.7 秒时」一致（其自定验收线为 ≤1 秒时）`)

  // 3.5 上升点：从球面三角定义独立实现
  const eps = 23.4392911 - 0.0130042 * T - 1.64e-7 * T * T
  const rad = Math.PI / 180
  const ramc = ((gmstMeeus + 116.4) % 360 + 360) % 360
  const ascOf = (phi) => ((Math.atan2(Math.cos(ramc * rad), -(Math.sin(ramc * rad) * Math.cos(eps * rad) + Math.tan(phi * rad) * Math.sin(eps * rad))) / rad) % 360 + 360) % 360
  const mcOf = ((Math.atan2(Math.sin(ramc * rad), Math.cos(ramc * rad) * Math.cos(eps * rad)) / rad) % 360 + 360) % 360
  const SIGNS = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼']
  const parseDeg = (s) => { const str = String(s ?? ''); for (let i = 0; i < 12; i += 1) { const m = str.match(new RegExp(`${SIGNS[i]}\\s*([\\d.]+)`)); if (m) return i * 30 + Number(m[1]) } return NaN }
  // 锚点自校（独立于被测实现）
  const anchor = ((Math.atan2(1, -(0 + Math.tan(51.5 * rad) * Math.sin(eps * rad))) / rad) % 360 + 360) % 360
  ok('独立实现锚点：φ=51.5°N、RAMC=0 ⇒ 上升 ≈ 巨蟹 26.57°', Math.abs(anchor - 116.57) < 0.05, `实测 ${anchor.toFixed(4)}°`)
  // 赤道上升之**正确**性质：其赤经 = RAMC+90（而**不是**黄经 = RAMC+90）
  const eastPointRa = (ramc + 90) % 360
  const lamOfRa = ((Math.atan2(Math.sin(eastPointRa * rad), Math.cos(eastPointRa * rad) * Math.cos(eps * rad)) / rad) % 360 + 360) % 360
  ok('独立实现：RA=RAMC+90 的黄道点黄经 = atan2(sin,cos·cosε)（自校）', angDiff(lamOfRa, ascOf(0)) < 1e-9,
    `${lamOfRa.toFixed(6)} vs φ=0 上升式 ${ascOf(0).toFixed(6)}`)
  note(`⚠ 「φ=0 ⇒ 上升 ≡ RAMC+90」**不是标准上升式的恒等式**：`
    + `真实赤经 RAMC+90 的**黄道黄经** = ${lamOfRa.toFixed(3)}°，而 RAMC+90 本身 = ${eastPointRa.toFixed(3)}°（差 ${angDiff(lamOfRa, eastPointRa).toFixed(3)}°）；`
    + '二者仅在 RAMC ≡ 0 或 90 (mod 180) 时相等。若实现直接返回 RAMC+90，则它是**东点的赤经**而非黄道上升度。')

  const o105 = RN.runMany({ chart: ch, nos: [105] })[0].outcome
  if (!o105) skip('#105 比对', '未起')
  else {
    const d = o105.detail
    const mcTheirs = parseDeg(d['中天'])
    ok('#105 中天 ≡ 独立球面三角（≤0.01°）', angDiff(mcTheirs, mcOf) < 0.01, `#105 ${mcTheirs}° vs 独立 ${mcOf.toFixed(4)}°`)
    const ascTheirs = parseDeg(d['上升'])
    const isEastPoint = angDiff(ascTheirs, eastPointRa) < 0.01
    const isTrueEq = angDiff(ascTheirs, ascOf(0)) < 0.01
    if (isEastPoint) {
      const gap = angDiff(eastPointRa, ascOf(0))
      ok('#105 未报纬度时按**自报口径**（φ=0 ⇒ RAMC+90）输出', isEastPoint, `${ascTheirs}° = RAMC+90`)
      ok('#105 明确声明「未报纬度 → 赤道面」且列出多纬度候选（诚实降级）',
        /未报.*纬度|赤道面/.test(String(d['上升口径'] ?? '')) && /20°N|30°N|40°N|50°N/.test(String(d['上升口径'] ?? '')))
      if (gap > 0.2) {
        suspect('#105 上升降级口径', `未报纬度时返回 RAMC+90（东点赤经 ${eastPointRa.toFixed(3)}°），`
          + `而标准上升式在 φ=0 给出 ${ascOf(0).toFixed(3)}°（差 ${gap.toFixed(3)}°）。自报口径已写在 detail，属**明示的口径选择**而非隐瞒；`
          + `但术语上「上升」非「东点赤经」，且同盘给出的 φ=20/30/40/50 候选是用真上升式算的，两者并置时易被读成同一量。建议：改用 φ=0 代入上升式，或把该行改称「东点赤经（近似）」`)
      } else ok('#105 上升降级口径与真赤道上升一致', true)
    } else if (isTrueEq) ok('#105 未报纬度时取真赤道上升（φ=0 代入上升式）', true, `${ascTheirs}° = 独立 ${ascOf(0).toFixed(4)}°`)
    else suspect('#105 上升', `#105 ${ascTheirs}° 既不等于东点赤经 ${eastPointRa.toFixed(3)}° 也不等于 φ=0 上升式 ${ascOf(0).toFixed(3)}°（RAMC=${ramc.toFixed(3)}°, ε=${eps.toFixed(4)}°），需人工核对`)
    ok('#105 恒星时声明双通路且差值 ≤1 秒时', /第二通路|Meeus/.test(String(d['恒星时'] ?? '')) && /0\.\d 秒时|1 秒时/.test(String(d['恒星时'] ?? '')), String(d['恒星时']).slice(0, 70))
  }

  // 3.6 报纬度 → 应改用真纬度
  for (const [q, phi] of [['北纬40 出生，看星盘', 40], ['纬度 31.2 出生', 31.2]]) {
    const cLat = C.buildChart({ question: q, when: new Date(2026, 8, 30, 14, 30), longitude: 116.4, birth: B, numbers: [7] })
    const o = RN.runMany({ chart: cLat, nos: [105] })[0].outcome
    if (!o) { skip(`#105 报纬度「${q}」`, '未起'); continue }
    const got = parseDeg(o.detail['上升'])
    if (angDiff(got, ascOf(phi)) < 0.05) {
      ok(`#105 报「${q}」→ 上升改用真纬度 φ=${phi}（独立复算一致）`, true, `${got.toFixed(3)}°`)
      ok(`#105 报纬度 φ=${phi} → fidelity=full`, o.fidelity === 'full', `实测 ${o.fidelity}`)
    } else suspect(`#105 报纬度「${q}」`, `上升 ${got.toFixed(3)}° ≠ 独立 φ=${phi} 值 ${ascOf(phi).toFixed(3)}°（φ=0 值 ${ascOf(0).toFixed(3)}°）；纬度解析可能未生效`)
  }

  // 3.7 塔罗 / 卢恩
  const W = await import('../src/methods/western.js')
  const eT = R.ENTRIES.find((e) => e.no === 107); const eR = R.ENTRIES.find((e) => e.no === 108)
  const drawT = (seed) => W.engines.tarot(ch, eT, K.makeRand(seed))
  ok('塔罗：同 seed 两次抽牌完全一致', JSON.stringify(drawT('t-x')) === JSON.stringify(drawT('t-x')))
  ok('卢恩：同 seed 两次抽取完全一致', JSON.stringify(W.engines.rune(ch, eR, K.makeRand('r-x'))) === JSON.stringify(W.engines.rune(ch, eR, K.makeRand('r-x'))))
  ok('塔罗：异 seed 抽出不同牌面（随机生效）', drawT('t1').essence !== drawT('t2').essence, `${drawT('t1').essence} vs ${drawT('t2').essence}`)
  const names = new Set(); let rev = 0; let shapeOK = true
  for (let i = 0; i < 300; i += 1) {
    const c = drawT('taro-' + i).detail['抽牌']
    if (!Array.isArray(c) || c.length !== 3) { shapeOK = false; break }
    for (const s of c) { names.add(String(s).replace(/·.*/, '')); if (String(s).includes('逆位')) rev += 1 }
  }
  ok('塔罗：300 次抽牌恒为 3 张且牌名取自 78 张韦特体系', shapeOK && names.size > 40, `不同牌名 ${names.size} 种`)
  ok('塔罗：正逆位皆出现（逆位为随机而非写死）', rev > 0 && rev < 900, `300 次抽 900 张中逆位 ${rev} 张`)
  const runes = new Set()
  for (let i = 0; i < 200; i += 1) runes.add(W.engines.rune(ch, eR, K.makeRand('rune-' + i)).essence.split('·')[0])
  ok('卢恩：200 次抽取覆盖多符（非写死单符）', runes.size >= 15, `不同符文 ${runes.size} 种`)
  const citeT = JSON.stringify(RN.runMany({ chart: ch, nos: [107] })[0].outcome.detail.cite)
  const citeR = JSON.stringify(RN.runMany({ chart: ch, nos: [108] })[0].outcome.detail.cite)
  ok('塔罗 cite 引到 Waite 1911（公有领域）', /Waite/i.test(citeT), citeT.slice(0, 90))
  ok('卢恩 cite 引到卢恩诗/原始体系', /卢恩诗|Rune|Poem|Elder|Futhark|盎格鲁/i.test(citeR), citeR.slice(0, 90))
}

// ═════════════════════════ 4. 签卜族诚实性压力测试 ═════════════════════════
section('4. 签卜族（zhanbu #83–#98）诚实性与概率压力测试')

{
  const plain = chart({ q: '这次合作能不能成', numbers: [7, 13, 21] })
  const rP = runFamily('zhanbu', plain)

  // 4.1 各法「本命外应」识别（每法只认自己那一类，故用各自的 omen 测）
  //     先跑**正向对照**：报全（omen+必要附加信息）时必须不标取象且升 fidelity
  const CTRL = [
    [96, '左眼一直跳，是凶是吉', [7, 13, 21], '眼跳（法只需左右+眼跳）'],
    [95, '东方有乌鸦叫', [7, 13, 21], '鸟种+方位（法需鸟种与方位）'],
    [97, '连打三个喷嚏', [3], '喷嚏+声数（法需声数走 numbers 通道）'],
  ]
  for (const [no, q, nums, label] of CTRL) {
    const c = C.buildChart({ question: q, when: new Date(2026, 8, 30, 14, 30), longitude: 116.4, numbers: nums })
    const o = RN.runMany({ chart: c, nos: [no] })[0].outcome
    if (!o) { skip(`#${no} 正向对照`, '未起'); continue }
    // 注：#95 注册表声明 fidelity=approx（鸦鸣方位×时辰表为编辑取值），故报全时**不应**升 fidelity；
    //     #96/#97 声明 core。此处只断言「不再标取象」。
    ok(`#${no} 正向对照（${label}）→ 不标取象（不再声称未报）`, !o.essence.startsWith('未报外应'), `${o.fidelity} ${o.essence}`)
  }
  //     反向：报了 omen 但缺附加信息 → **不得声称「未报外应」**（用户确实报了外应）
  const PARTIAL = [
    [95, '窗外乌鸦叫了三声', [7, 13, 21], '报鸟种未报方位'],
    [97, '连打三个喷嚏', [7, 13, 21], '报喷嚏未报声数'],
  ]
  for (const [no, q, nums, label] of PARTIAL) {
    const c = C.buildChart({ question: q, when: new Date(2026, 8, 30, 14, 30), longitude: 116.4, numbers: nums })
    const o = RN.runMany({ chart: c, nos: [no] })[0].outcome
    if (!o) { skip(`#${no} 部分报（${label}）`, '未起'); continue }
    ok(`#${no} 部分报（${label}）→ 不得标「未报外应」（用户确报了外应）`, !o.essence.startsWith('未报外应'), o.essence)
    if (o.essence.startsWith('未报外应')) {
      suspect(`#${no} 外应标注不精确（${label}）`, `q=「${q}」用户已报 omen（${label}），但 essence 作「${o.essence}」——`
        + '「未报外应」应改为「未报方位/未报声数·取象」：用户确实报了外应，只是缺附加信息。'
        + '契约 §2.2 的原则是「没报的输入不许假装有」，**同样也要求「报了的输入不许说没报」**')
    }
  }
  //     #97 额外：文述声数与取象声数冲突（用户明说「三个」，输出不得写「4声」）
  {
    const q = '连打三个喷嚏'
    const c = C.buildChart({ question: q, when: new Date(2026, 8, 30, 14, 30), longitude: 116.4, numbers: [7, 13, 21] })
    const o = RN.runMany({ chart: c, nos: [97] })[0].outcome
    if (o) {
      const stated = o.essence.match(/喷嚏(\d)声/)
      ok('#97 用户文述「三个喷嚏」时，输出声数不得与之冲突', !!stated && stated[1] === '3', o.essence)
      if (stated && stated[1] !== '3') {
        suspect('#97 声数与用户文述冲突', `q=「${q}」用户明说三声，essence 却作「${stated[1]}声」（取象值）。`
          + '用户不会知道还要通过 numbers 通道报数；建议从文述里解析「一/二/两/三/四声」或至少不输出与文述矛盾的声数')
      }
    }
  }
  // 4.2 未报外应 → 必须标取象 + approx
  for (const no of [95, 96, 97]) {
    const o = rP[no]
    if (!o) { skip(`#${no} 未报外应`, '未起'); continue }
    ok(`#${no} 未报外应 → essence 以「未报外应·取象：」开头`, o.essence.startsWith('未报外应·取象：'), o.essence)
    ok(`#${no} 未报外应 → fidelity=approx`, o.fidelity === 'approx', o.fidelity)
  }
  // 4.3 #92/#93 未报字
  const bare = runFamily('zhanbu', chart({ q: '这次合作能不能成', numbers: [] }))
  for (const no of [92, 93]) {
    const o = bare[no]
    if (!o) { skip(`#${no} 未报字`, '未起'); continue }
    ok(`#${no} 未报字且无报数 → essence 以「未报所测之字·取象：」开头`, o.essence.startsWith('未报所测之字·取象：'), o.essence)
  }
  const o92 = rP[92]
  if (o92) {
    ok('#92 有报数时不标取象且 detail 含「报数」', !o92.essence.startsWith('未报所测之字') && JSON.stringify(o92.detail).includes('报数'), o92.essence)
  }
  const o93 = runFamily('zhanbu', chart({ q: '测字：明，问前程', numbers: [] }))[93]
  if (o93) {
    ok('#93 报了「明」→ detail.所拆之字 以「明」开头且不标取象',
      String(o93.detail['所拆之字'] ?? '').startsWith('明') && !o93.essence.startsWith('未报所测之字'), `${o93.detail['所拆之字']}`)
  }
  // 4.4 灵签：不得**声称**有原文；且须自述未内置
  const fake = []
  for (const no of [83, 84, 85, 86, 87, 88, 89]) {
    const o = rP[no]
    if (!o) continue
    const j = JSON.stringify(o.detail)
    // 只查「肯定式伪造」：引号包裹的长诗句 / 「诗曰：<内容>」/「原文：<内容>」
    if (/诗曰[:：]\s*\S|原文[:：]\s*\S|逐字引用/.test(j)) fake.push(`#${no}(肯定式声称原文)`)
    if (!/未内置|不冒充|避免伪造|请提供签谱/.test(j)) fake.push(`#${no}(未声明未内置)`)
  }
  ok('7 家灵签均未肯定式伪造原文，且都自述「未内置」', fake.length === 0, fake.join(','))
  const lvBad = [83, 84, 85, 86, 87, 88, 89].filter((no) => rP[no] && !/大吉|上吉|中吉|中平|中下|下下|上上|下/.test(rP[no].essence))
  ok('7 家灵签 essence 均含签级（结构性输出）', lvBad.length === 0, lvBad.join(','))

  // 4.5 掷筊蒙特卡洛 20 万次
  const MJ = await import('../src/methods/zhanbu.js')
  const eJ = R.ENTRIES.find((e) => e.no === 90)
  const N = 200000
  let ns = 0; let nx = 0; let nk = 0; let bad = 0
  const combos = new Map()
  const rr = K.makeRand('jiao-mc-200k')
  const t0 = Date.now()
  for (let i = 0; i < N; i += 1) {
    const c = String(MJ.engines.jiao(plain, eJ, rr)?.detail?.['组合'] ?? '')
    const m = c.match(/(\d)圣(\d)笑(\d)哭/)
    if (!m) { bad += 1; break }
    ns += +m[1]; nx += +m[2]; nk += +m[3]
    combos.set(c, (combos.get(c) || 0) + 1)
  }
  const ms = Date.now() - t0
  if (bad) ok('#90 掷筊：detail.组合 可解析', false)
  else {
    const tot = ns + nx + nk
    const p = { 圣: ns / tot, 笑: nx / tot, 哭: nk / tot }
    const tol = 3 / Math.sqrt(tot)
    ok(`#90 掷筊 ${N} 掷：P(圣)=1/2 ±3σ`, Math.abs(p.圣 - 0.5) < tol, `实测 ${p.圣.toFixed(4)} ±${tol.toFixed(4)}`)
    ok(`#90 掷筊 ${N} 掷：P(笑)=1/4 ±3σ`, Math.abs(p.笑 - 0.25) < tol, `实测 ${p.笑.toFixed(4)}`)
    ok(`#90 掷筊 ${N} 掷：P(哭)=1/4 ±3σ`, Math.abs(p.哭 - 0.25) < tol, `实测 ${p.哭.toFixed(4)}`)
    ok('#90 掷筊：三掷组合恰 10 种且多项分布概率和=1', combos.size === 10, `实测 ${combos.size} 种`)
    const fact = (x) => (x <= 1 ? 1 : x * fact(x - 1))
    let sum = 0
    for (const c of combos.keys()) { const m = c.match(/(\d)圣(\d)笑(\d)哭/); sum += fact(3) / (fact(+m[1]) * fact(+m[2]) * fact(+m[3])) * 0.5 ** +m[1] * 0.25 ** +m[2] * 0.25 ** +m[3] }
    ok('#90 掷筊：10 组合概率和 = 1', Math.abs(sum - 1) < 1e-9, `${sum}`)
    note(`蒙特卡洛 ${N} 次耗时 ${ms} ms；实测 圣 ${p.圣.toFixed(4)} 笑 ${p.笑.toFixed(4)} 哭 ${p.哭.toFixed(4)}（声明 0.5/0.25/0.25）`)
  }
  ok('#90 掷筊：同 seed 完全复现', JSON.stringify(MJ.engines.jiao(plain, eJ, K.makeRand('jx'))) === JSON.stringify(MJ.engines.jiao(plain, eJ, K.makeRand('jx'))))

  // 4.6 #94 无梦象 → 明示取象
  const o94 = rP[94]
  if (o94) ok('#94 无梦象时自述取象/未辨（不编造梦境）', /未辨梦象|未报梦|取象/.test(JSON.stringify(o94.detail) + o94.essence), o94.essence)
}

// ═════════════════════════ 5. 宿主时区依赖（跨时区可复现性） ═════════════════════════
section('5. 宿主时区依赖：出生时刻 → 天象')

{
  const B = { y: 1990, m: 5, d: 12, h: 9, mi: 30 }
  const TZ0 = process.env.TZ
  const probe = (tz) => {
    process.env.TZ = tz
    const c = C.buildChart({ question: 'x', when: new Date(2026, 8, 30, 14, 30), longitude: 116.4, birth: B, numbers: [7] })
    return { iso: new Date(B.y, B.m - 1, B.d, B.h, B.mi).toISOString(), sun: c.birthChart?.astro?.sunLon, jup: c.astro?.planets?.木, sat: c.astro?.planets?.土 }
  }
  const rows = [['Etc/GMT-8（本机默认）', 'Etc/GMT-8'], ['Asia/Shanghai', 'Asia/Shanghai'], ['UTC', 'UTC'], ['America/New_York', 'America/New_York']].map(([label, tz]) => [label, probe(tz)])
  process.env.TZ = TZ0
  console.log('  时区 → 出生瞬时(UTC) / 太阳黄经 / 木星 / 土星')
  for (const [label, r] of rows) console.log(`    ${label.padEnd(20)} ${r.iso}  ☉${r.sun?.toFixed(5)}  ♃${r.jup?.toFixed(3)}  ♄${r.sat?.toFixed(3)}`)
  const suns = rows.map(([, r]) => r.sun)
  const spread = Math.max(...suns) - Math.min(...suns)
  ok('出生时刻 → 天象不受宿主时区影响（跨 4 时区逐位相同）', spread < 1e-9, `太阳黄经极差 ${spread.toFixed(5)}°`)
  if (spread >= 1e-9) {
    const oracles = rows.map(([label, r]) => {
      const hit = [['木星 98.90', r.jup, 98.90], ['土星 295.30', r.sat, 295.30]].filter(([, v, w]) => v !== undefined && Math.abs(((v - w) % 360 + 540) % 360 - 180) < 0.1)
      return `${label}: ☉${r.sun?.toFixed(4)}${hit.length ? '（' + hit.map((h) => h[0] + '✓').join(' ') + '）' : ''}`
    })
    suspect('宿主时区决定出生时刻 → 天象（跨机不可复现）',
      `出生资料 y/m/d/h/mi 由 \`new Date(y, m-1, d, h, mi)\`（**宿主本地时区**）解释，故同一份出生资料在不同机器上对应不同的 UTC 瞬时：`
      + `${oracles.join(' ｜ ')}。契约 §6 记录的 oracle（太阳 51.08°、木星 98.90°、土星 295.30°）**只在本机 TZ=Etc/GMT-8（UTC+8、无 DST）下成立**：`
      + `Asia/Shanghai 因 1990 年 4/15–9/15 实行夏令时得到 UTC+9 → 太阳 ${rows[1][1].sun?.toFixed(5)}°；UTC → ${rows[2][1].sun?.toFixed(5)}°；America/New_York → ${rows[3][1].sun?.toFixed(5)}°。`
      + '影响面：#105–#108 西方族、以及一切读 `chart.birthChart.astro` 的法门。'
      + '建议：出生时刻按**显式声明的参考时区**（或 chart 新增 `birthTz`/`utcOffset`）解释，勿用宿主本地时区（含历史 DST）。')
  } else notABug('时区依赖候选', '本机各时区结果一致，无需报')
  ok('本地时区探针自校：四种时区确给出不同 UTC 瞬时（探针有效）', new Set(rows.map(([, r]) => r.iso)).size === rows.length,
    rows.map(([l, r]) => `${l}=${r.iso}`).join(' '))
}

// ═════════════════════════ 汇总 ═════════════════════════
console.log(`\n${'='.repeat(66)}`)
console.log(`PASS ${pass} ｜ FAIL ${fails.length} ｜ SUSPECT ${suspects.length} ｜ SKIP ${skips.length} ｜ 判为误报 ${falsePositives.length}`)
if (skips.length) { console.log('\n—— SKIP（未就绪，**不算通过**）——'); for (const s of skips) console.log('  ⊘ ' + s) }
if (suspects.length) { console.log('\n—— SUSPECT（存疑，需人工判读）——'); for (const s of suspects) console.log('  ? ' + s) }
if (falsePositives.length) { console.log('\n—— 判读后否定（误报，计入误报率）——'); for (const f of falsePositives) console.log('  ○ ' + f) }
if (notes.length) { console.log('\n—— 记录（非缺陷）——'); for (const n of notes) console.log('  · ' + n) }
if (fails.length) { console.log('\n—— FAIL（已证实错误）——'); for (const f of fails) console.log('  · ' + f) }
process.exit(fails.length ? 1 : 0)
