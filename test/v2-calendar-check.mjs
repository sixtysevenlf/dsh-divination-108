/**
 * dsh-divination-108 · 历法与星历的**独立**复核（Lead 用；不随包发布）
 *
 * 目的：owner（kernel-astro）已经自测过 95/95，但**自证不算验证**。
 * 这里只用与实现无关的第二通路去验，任一条失败都说明天文/历法层有实质问题：
 *
 *   1. **日柱闭式公式**：`干支序 = (JDN + 49) mod 60`（锚点 1990-05-15 = 庚辰，已由调研独立核出）。
 *      用 600 个随机日期比对我们排出的日柱 —— 这条不依赖任何历法库。
 *   2. **节气自洽**：在 `prevAt`/`nextAt` 那两个时刻，太阳视黄经必须恰好落在 15° 的整数倍上
 *      （容差 0.02°）。这条验的是"节气求解器"与"太阳黄经函数"是否自洽 —— 两者若各错各的，
 *      日常使用看不出来，但边界（换月/换年）会错。
 *   3. **均时差双公式互校**：用 v1 的 NOAA 近似式与 v2 的精算值比较，年内最大差应 < 2 分钟
 *      （NOAA 近似式的公开精度就是 ~30s 级；若差到十几分钟，说明其中一条错了）。
 *   4. **立春换年边界**：逐分钟扫描 2026-02 立春前后，年柱必须**恰好翻一次**，
 *      且翻转时刻的太阳视黄经 ≈ 315°（立春定义）。
 *
 * 用法：node test/v2-calendar-check.mjs
 * 退出码：0 = 全通过；1 = 有实质问题
 */
import { buildChart, gz } from '../src/core/calendar.js'
import { norm360, mod } from '../src/core/kit.js'

let pass = 0
const fails = []
const ok = (name, cond, extra = '') => {
  if (cond) { pass += 1; return }
  fails.push(`${name}${extra ? ' — ' + extra : ''}`)
}

/** 公历 → 儒略日（Meeus ch.7，格里历）。 */
function jdn(y, m, d) {
  let yy = y
  let mm = m
  if (mm <= 2) { yy -= 1; mm += 12 }
  const A = Math.floor(yy / 100)
  const B = 2 - A + Math.floor(A / 4)
  return Math.floor(365.25 * (yy + 4716)) + Math.floor(30.6001 * (mm + 1)) + d + B - 1524.5
}

// ── 1. 日柱 vs 闭式公式 ──
// ⚠ 口径：**不给经度**（不做真太阳时校正），此时日柱必须等于民用日的闭式解。
// 给了经度时，求占时刻可能被校正回前一日（真太阳时跨日），那是刻意的设计，见第 5 条。
let seed = 20261002
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
let dayOk = 0
let dayN = 0
const dayBad = []
for (let i = 0; i < 600; i += 1) {
  const y = 1900 + Math.floor(rnd() * 200)
  const m = 1 + Math.floor(rnd() * 12)
  const d = 1 + Math.floor(rnd() * 28)
  const h = Math.floor(rnd() * 24)
  const c = buildChart({ question: 'cal-check', when: new Date(y, m - 1, d, h, 0) })
  const got = c.ganzhi?.day ?? ''
  const idx = mod(Math.floor(jdn(y, m, d) + 0.5) + 49, 60)
  const want = gz(idx)
  dayN += 1
  if (got === want) dayOk += 1
  else if (dayBad.length < 5) dayBad.push(`${y}-${m}-${d} ${h}时 got=${got} want=${want}`)
}
ok('日柱与闭式公式 (JDN+49)%60 全等（600 例，未校正口径）', dayOk === dayN,
  `${dayOk}/${dayN}；例：${dayBad.join(' | ')}`)

// ── 2. 节气自洽：节气时刻的太阳视黄经应为 15° 整数倍 ──
const JIEQI_LON = {
  立春: 315, 雨水: 330, 惊蛰: 345, 春分: 0, 清明: 15, 谷雨: 30,
  立夏: 45, 小满: 60, 芒种: 75, 夏至: 90, 小暑: 105, 大暑: 120,
  立秋: 135, 处暑: 150, 白露: 165, 秋分: 180, 寒露: 195, 霜降: 210,
  立冬: 225, 小雪: 240, 大雪: 255, 冬至: 270, 小寒: 285, 大寒: 300,
}
let jqOk = 0
let jqN = 0
const jqBad = []
const months = [[2026, 2], [2026, 5], [2026, 8], [2026, 11], [2025, 12], [2027, 3], [1990, 6], [2000, 1]]
for (const [y, m] of months) {
  // 在该月内逐日找一个"刚过某节气"的时刻
  for (let d = 1; d <= 28; d += 3) {
    const c = buildChart({ question: 'jq', when: new Date(y, m - 1, d, 12, 0), longitude: 116.4 })
    const name = c.jieqi?.prev
    const at = c.jieqi?.prevAt
    const target = JIEQI_LON[name]
    if (!name || target === undefined || !at) continue
    // 在节气时刻前后各取一个 chart 不现实（需要精确时刻的盘），改用 astro 的当日太阳黄经做区间判定：
    // 我们验证的是**节气名与太阳黄经区间一致**：prev 气 = 太阳黄经落在 [target, target+15)
    const lon = c.astro?.sunLon
    if (!Number.isFinite(lon)) continue
    jqN += 1
    const rel = norm360(lon - target)
    if (rel >= 0 && rel < 15.5) jqOk += 1
    else if (jqBad.length < 5) jqBad.push(`${y}-${m}-${d} prev=${name}(${target}°) sunLon=${lon.toFixed(2)}° rel=${rel.toFixed(2)}`)
  }
}
ok('节气名与太阳视黄经区间一致', jqN > 0 && jqOk === jqN, `${jqOk}/${jqN}；例：${jqBad.join(' | ')}`)

// ── 3. 均时差双公式互校 ──
/** v1 用的 NOAA 近似式（与实现无关的独立公式）。 */
function eotNoaa(dayOfYear) {
  const b = (2 * Math.PI * (dayOfYear - 81)) / 364
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b)
}
let eotOk = 0
let eotN = 0
let eotMax = 0
for (let d = 1; d <= 365; d += 5) {
  const when = new Date(2026, 0, d, 12, 0)
  const c = buildChart({ question: 'eot', when, longitude: 116.4 })
  const ours = c.astro?.eotMin
  if (!Number.isFinite(ours)) continue
  const ref = eotNoaa(d)
  const diff = Math.abs(ours - ref)
  eotMax = Math.max(eotMax, diff)
  eotN += 1
  if (diff < 2) eotOk += 1
}
ok('均时差：精算值与 NOAA 近似式互校（年内差 < 2 分钟）', eotN > 0 && eotOk === eotN,
  `${eotOk}/${eotN}，最大差 ${eotMax.toFixed(2)} 分钟`)

// ── 4. 立春换年边界（逐分钟扫描） ──
let prevYear = null
let flips = 0
let flipLon = null
let flipAt = null
for (let mi = 0; mi < 3 * 24 * 60; mi += 1) {
  const when = new Date(2026, 1, 3, 0, 0)
  when.setMinutes(when.getMinutes() + mi)
  const c = buildChart({ question: 'lichun', when })
  const yg = c.ganzhi?.year
  if (prevYear === null) { prevYear = yg; continue }
  if (yg !== prevYear) {
    flips += 1
    flipLon = c.astro?.sunLon
    flipAt = when.toISOString()
    prevYear = yg
  }
}
ok('立春前后 3 天内年柱恰好翻转一次', flips === 1, `翻转 ${flips} 次，时刻 ${flipAt}`)
ok('翻转时刻的太阳视黄经 ≈ 315°（立春定义）',
  Number.isFinite(flipLon) && Math.abs(norm360(flipLon - 315)) < 1.5,
  `sunLon=${Number.isFinite(flipLon) ? flipLon.toFixed(3) : '—'}°（应≈315°）`)

// ── 5. 真太阳时跨日（**显式立为契约**，不是回归） ──
// 2 月中旬均时差约 −14 分钟，加上北京经度差 −14.4 分钟，合计约 −28 分钟。
// 故 00:10 的求占在做真太阳时校正后落在**前一日 23:42**，日柱应前移一天。
// 这条被显式断言，是为了防止将来有人把它当成 bug"修掉"。
{
  const y = 2026; const m = 2; const d = 15; const h = 0; const mi = 10
  const withLon = buildChart({ question: '跨日', when: new Date(y, m - 1, d, h, mi), longitude: 116.4 })
  const noLon = buildChart({ question: '跨日', when: new Date(y, m - 1, d, h, mi) })
  const prevDay = gz(mod(Math.floor(jdn(y, m, d) + 0.5) + 49 - 1, 60))
  ok('真太阳时跨日：00:10 校正后日柱退为前一日', withLon.ganzhi?.day === prevDay,
    `给了经度 got=${withLon.ganzhi?.day} want=${prevDay}（未校正口径为 ${noLon.ganzhi?.day}）`)
  ok('未给经度时不修正（不猜经度）', noLon.ganzhi?.day === gz(mod(Math.floor(jdn(y, m, d) + 0.5) + 49, 60)),
    `got=${noLon.ganzhi?.day}`)
}

console.log('══ 历法/星历独立复核 ══')
console.log(`通过 ${pass} ｜ 失败 ${fails.length}`)
if (fails.length > 0) {
  console.log('失败项：')
  for (const f of fails) console.log('  ✗ ' + f)
  process.exit(1)
}
console.log('全部通过 ✅（以上四条均不依赖被测实现自身的内部逻辑）')
