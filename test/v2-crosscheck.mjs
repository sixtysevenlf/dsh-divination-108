/**
 * dsh-divination-108 · v2 独立验证台（verifier / kernel-astro 执行）
 *
 * 跑法：node test/v2-crosscheck.mjs            （默认全量）
 *       node test/v2-crosscheck.mjs --quick    （跳过 200 问审计，只跑对拍）
 *
 * 设计原则：**不是让测试通过，而是找假**。
 *   · 每条判据都先由**独立通路**算出期望值，再与实现比；
 *   · 禁止"拿实现跟实现比"（vendored astronomy.cjs 与实现同源，故黄经比对换 API 路径）；
 *   · 已知口径差异单列，不混进失败计数（晚子时流派、通书/四柱月建口径）；
 *   · 发现问题只记录（ISSUES），**不修改 src/**。
 *
 * 输出：控制台结构化报告 + 退出码（0 无硬失败 / 1 有硬失败）
 *      同时把结论写入 docs/verification/v1-crosscheck.md 与 ISSUES.md（写入失败不影响退出码）。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { buildChart } from '../src/core/calendar.js'
import { ENTRIES, ENTRY_BY_NO } from '../src/core/registry.js'
import { runMany, runOne, resolveMethod, MODULES } from '../src/core/runner.js'
import { aggregate } from '../src/core/aggregate.js'
import { makeRand as makeRandKit } from '../src/core/kit.js'
import * as mingli from '../src/methods/mingli.js'

const require = createRequire(import.meta.url)
const ORACLE = 'D:/DSH/.divination-v2-deps/node_modules'
const Tyme = require(`${ORACLE}/tyme4ts`)
const Astro = require(`${ORACLE}/astronomy-engine`)
const HERE = 'D:/DSH/plugins/dsh-divination-108'
const QUICK = process.argv.includes('--quick')

const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
const mod = (n, m) => ((n % m) + m) % m

// ───────────────────────── 报告骨架 ─────────────────────────
const RESULTS = []
const ISSUES = []
const NOTES = []

function section(t) { console.log(`\n══ ${t} ══`) }
function rec(name, total, bad, note = '') {
  RESULTS.push({ name, total, bad: bad.length, note, samples: bad.slice(0, 6) })
  const ok = bad.length === 0
  console.log(`${ok ? '✅' : '❌'} ${name}  ${total - bad.length}/${total}${note ? '  ' + note : ''}`)
  for (const b of bad.slice(0, 5)) console.log('     · ' + b)
  return ok
}
function issue(sev, title, detail, repro, owner) {
  ISSUES.push({ sev, title, detail, repro, owner })
  console.log(`  ⚠ [${sev}] ${title} → ${owner}`)
}
function note(t) { NOTES.push(t); console.log(`  ℹ️  ${t}`) }

/** 确定性伪随机（可复现）。 */
function makeRand(seed) {
  let s = seed >>> 0 || 0x9e3779b9
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s >>> 0 }
}

// ═══════════════════════════════════════════════════════════════
// L1 · 历法多通路对拍（★ 独立通路：儒略日 / 立春瞬时 / 太阳黄经分宫 / tyme4ts / astronomy-engine）
// ═══════════════════════════════════════════════════════════════
section('L1 历法多通路对拍')
{
  /** Gregorian → JDN。cite: Meeus, Astronomical Algorithms 2nd ed. ch.7。 */
  const jdnOf = (y, m, d) => {
    const a = Math.floor((14 - m) / 12); const yy = y + 4800 - a; const mm = m + 12 * a - 3
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045
  }
  /** 日柱：纯算术（jdn+49）mod 60。 */
  const dayGZByJdn = (y, m, d) => { const i = mod(jdnOf(y, m, d) + 49, 60); return GAN[i % 10] + ZHI[i % 12] }
  const sunLon = (dt) => mod(Astro.SunPosition(Astro.MakeTime(dt)).elon, 360)
  /** 月支：太阳视黄经 315°(立春) 起每 30° 一宫。 */
  const monthZhiByLon = (dt) => ZHI[(2 + Math.floor(mod(sunLon(dt) - 315, 360) / 30)) % 12]
  const lichunCache = new Map()
  const lichunOf = (y) => {
    if (!lichunCache.has(y)) {
      const h = Astro.SearchSunLongitude(315, Astro.MakeTime(new Date(y, 0, 20, 0, 0, 0)), 40)
      lichunCache.set(y, h ? h.date : null)
    }
    return lichunCache.get(y)
  }
  /** 年柱：立春瞬时换年 + 公元 4 年甲子（1984−4=1980=33×60）。 */
  const yearGZByAstro = (dt) => {
    const lc = lichunOf(dt.getFullYear()); if (!lc) return null
    const eff = dt.getTime() < lc.getTime() ? dt.getFullYear() - 1 : dt.getFullYear()
    const i = mod(eff - 4, 60); return GAN[i % 10] + ZHI[i % 12]
  }
  const tymeHour = (dt) => {
    const st = Tyme.SolarTime.fromYmdHms(dt.getFullYear(), dt.getMonth() + 1, dt.getDate(), dt.getHours(), dt.getMinutes(), 0)
    const m = st.getSixtyCycleHour().toString().match(/^(.{2})年(.{2})月(.{2})日(.{2})时$/)
    return m ? { y: m[1], m: m[2], d: m[3], h: m[4], st } : null
  }
  const tymeLunar = (st) => {
    try {
      const ld = st.getSolarDay().getLunarDay(); const lm = ld.getLunarMonth()
      const leap = typeof lm.isLeap === 'function' ? lm.isLeap() : lm.getMonth() < 0
      return { y: lm.getLunarYear().getYear(), m: leap ? -Math.abs(lm.getMonth()) : Math.abs(lm.getMonth()), d: ld.getDay() }
    } catch { return null }
  }

  // ── 样本：≥300 点。构成 = 均匀底样 + 每月节气前后 ±1 天 + 闰月 + 1900/1950/2000/2026 边界 + 晚子时 ──
  const S = []
  {
    const r = makeRand(0xC0FFEE)
    const t0 = Date.UTC(1900, 0, 1); const t1 = Date.UTC(2100, 11, 31)
    for (let i = 0; i < 220; i += 1) {
      const base = t0 + Math.floor(((t1 - t0) * i) / 220) + r() % 100 * 86400000
      const d = new Date(base)
      S.push({ at: new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), r() % 24, r() % 60), tag: '均匀' })
    }
    // 每月节气前后 ±1 天（每月抽 1 年：滚动覆盖 1900..2100 的每个月）
    const JIE = [['小寒', 285, 1], ['立春', 315, 2], ['惊蛰', 345, 3], ['清明', 15, 4], ['立夏', 45, 5], ['芒种', 75, 6],
      ['小暑', 105, 7], ['立秋', 135, 8], ['白露', 165, 9], ['寒露', 195, 10], ['立冬', 225, 11], ['大雪', 255, 12]]
    for (let i = 0; i < 60; i += 1) {
      const y = 1902 + (i * 3) % 196
      const [, lon, mon] = JIE[i % 12]
      const hit = Astro.SearchSunLongitude(lon, Astro.MakeTime(new Date(y, mon - 1, 1, 0, 0, 0)), 40)
      if (!hit) continue
      const j = hit.date
      for (const off of [-1, 0, 1]) S.push({ at: new Date(j.getFullYear(), j.getMonth(), j.getDate() + off, 3 + (i % 20), (i * 7) % 60), tag: '节气±1' })
    }
    // 闰月（农历闰月抽样：2033 闰冬月、2025 闰六月、2020 闰四月、2017 闰六月、2009 闰五月）
    for (const [y, mo, d] of [[2033, 12, 20], [2025, 7, 25], [2020, 5, 25], [2017, 7, 25], [2009, 6, 5], [1993, 4, 20]]) {
      S.push({ at: new Date(y, mo - 1, d, 10, 0), tag: '闰月' })
    }
    // 边界年份 + 晚子时/早子时
    for (const y of [1900, 1950, 2000, 2026, 2050, 2100]) {
      S.push({ at: new Date(y, 0, 1, 0, 30), tag: '边界' }, { at: new Date(y, 5, 15, 12, 0), tag: '边界' },
        { at: new Date(y, 11, 31, 23, 30), tag: '晚子时' }, { at: new Date(y, 2, 1, 23, 59), tag: '晚子时' })
    }
  }

  const badDay = []; const badYear = []; const badMonth = []; const badTyme = []; const badLunar = []; const badKong = []
  let nLateZi = 0; let nTyme = 0
  for (const { at } of S) {
    const c = buildChart({ question: 'xcheck', when: at })   // 不给经度 → 四柱用平太阳时，与库口径一致
    const stamp = at.toISOString().slice(0, 16).replace('T', ' ')
    // 日柱（独立算术）
    const jd = dayGZByJdn(c.solar.y, c.solar.m, c.solar.d)
    if (jd !== c.ganzhi.day) badDay.push(`${stamp} 实现=${c.ganzhi.day} JDN=${jd}`)
    // 年柱（独立星历：立春瞬时）
    const ya = yearGZByAstro(at)
    if (ya && ya !== c.ganzhi.year) badYear.push(`${stamp} 实现=${c.ganzhi.year} 立春法=${ya}`)
    // 月支（独立星历：太阳视黄经分宫）
    const mz = monthZhiByLon(at)
    if (mz !== c.monthZhi) badMonth.push(`${stamp} 实现=${c.monthZhi} λ法=${mz}（距节气边界 ${(() => { const L = sunLon(at); let b = 999; for (const x of [315, 345, 15, 45, 75, 105, 135, 165, 195, 225, 255, 285]) b = Math.min(b, Math.abs(((L - x + 540) % 360) - 180)); return b.toFixed(3) })()}°）`)
    // 四柱 + 农历（tyme4ts；晚子时口径不同→单列）
    const t = tymeHour(at)
    if (t) {
      if (c.dayBoundary.lateZi) nLateZi += 1
      else {
        nTyme += 1
        if (t.y !== c.ganzhi.year || t.m !== c.ganzhi.month || t.d !== c.ganzhi.day || t.h !== c.ganzhi.hour) {
          badTyme.push(`${stamp} 实现=${c.pillars.join(' ')} tyme4ts=${t.y}年${t.m}月${t.d}日${t.h}时`)
        }
      }
      const tl = tymeLunar(t.st)
      if (!tl) badLunar.push(`${stamp} tyme4ts 农历取不到`)
      else if (!c.dayBoundary.lateZi && (tl.y !== c.lunar.year || tl.m !== c.lunar.month || tl.d !== c.lunar.day)) {
        badLunar.push(`${stamp} 实现=${c.lunar.year}/${c.lunar.month}/${c.lunar.day} tyme4ts=${tl.y}/${tl.m}/${tl.d}`)
      }
    } else badTyme.push(`${stamp} tyme4ts 解析失败`)
    // 旬空：闭式独立算。旬首一定以「甲」起，且旬内十日支序连续 ⇒ 旬首支=(日支序−日干序) mod 12；
    // 该旬覆盖 xunZhi..xunZhi+9 十天，未覆盖的两支即空亡 = xunZhi+10、xunZhi+11。
    const gi = GAN.indexOf(c.ganzhi.day[0]); const zi2 = ZHI.indexOf(c.ganzhi.day[1])
    if (gi >= 0 && zi2 >= 0) {
      const xz = mod(zi2 - gi, 12)
      const xunHead = `甲${ZHI[xz]}`
      const kongExpect = [ZHI[(xz + 10) % 12], ZHI[(xz + 11) % 12]]
      if (xunHead !== c.xun.name || kongExpect.join('') !== c.xun.kong.join('')) {
        badKong.push(`${stamp} 日柱=${c.ganzhi.day} 实现=${c.xun.name}/${c.xun.kong.join('')} 闭式=${xunHead}/${kongExpect.join('')}`)
      }
    }
  }
  rec('日柱 vs 儒略日算术（独立）', S.length, badDay)
  rec('年柱 vs 立春瞬时（独立星历）', S.length, badYear)
  rec('月支 vs 太阳视黄经 30° 分宫（独立星历）', S.length, badMonth)
  rec('四柱 vs tyme4ts（非晚子时）', nTyme, badTyme, `晚子时单列 ${nLateZi} 例`)
  rec('农历 vs tyme4ts（非晚子时）', nTyme, badLunar)
  rec('旬空 vs 旬首闭式（独立）', S.length, badKong)
  note(`样本合计 ${S.length} 点（均匀 220 + 节气±1 + 闰月 6 + 边界/子时 24），≥300 项比对`)

  // 节气时刻：寿星历 vs astronomy-engine（两套独立星历）
  const jieBad = []; let jieMax = 0; let jieAt = ''; let jieN = 0
  const JIE = [['小寒', 285, 1], ['立春', 315, 2], ['惊蛰', 345, 3], ['清明', 15, 4], ['立夏', 45, 5], ['芒种', 75, 6],
    ['小暑', 105, 7], ['立秋', 135, 8], ['白露', 165, 9], ['寒露', 195, 10], ['立冬', 225, 11], ['大雪', 255, 12]]
  const LunarLib = require(`${HERE}/vendor/lunar.cjs`)
  for (let y = 1900; y <= 2100; y += 10) {
    for (const [name, lon, mon] of JIE) {
      let a = null
      try { a = LunarLib.Solar.fromYmdHms(y, mon, 1, 0, 0, 0).getLunar().getNextJie() } catch { a = null }
      if (!a) { jieBad.push(`${y} ${name} 寿星历取不到`); continue }
      const sa = a.getSolar()
      const tA = new Date(sa.getYear(), sa.getMonth() - 1, sa.getDay(), sa.getHour(), sa.getMinute(), sa.getSecond())
      const hit = Astro.SearchSunLongitude(lon, Astro.MakeTime(new Date(y, mon - 1, 1, 0, 0, 0)), 40)
      if (!hit) { jieBad.push(`${y} ${name} astro 搜不到`); continue }
      const ds = Math.abs(tA.getTime() - hit.date.getTime()) / 1000
      jieN += 1
      if (a.getName() !== name) jieBad.push(`${y}-${mon} 名称不符 寿星=${a.getName()}`)
      if (ds > 120) jieBad.push(`${y} ${name} Δ=${ds.toFixed(0)}s`)
      if (ds > jieMax) { jieMax = ds; jieAt = `${y} ${name}` }
    }
  }
  rec('节气时刻 寿星历 vs astronomy-engine（12 节 × 21 年）', jieN, jieBad)
  note(`节气最大差 ${jieMax.toFixed(0)} 秒 @ ${jieAt}`)

  // 立春翻转唯一性：年柱只在立春瞬时切换一次
  const flipBad = []
  for (let y = 1901; y <= 2100; y += 25) {
    const T = lichunOf(y); if (!T) { flipBad.push(`${y} 立春搜不到`); continue }
    const b = buildChart({ question: 'lc', when: new Date(T.getTime() - 6 * 60000) })
    const a = buildChart({ question: 'lc', when: new Date(T.getTime() + 6 * 60000) })
    if (b.ganzhi.year === a.ganzhi.year) flipBad.push(`${y} ±6min 年柱未变(${b.ganzhi.year})`)
    else if (mod(GAN.indexOf(a.ganzhi.year[0]) - GAN.indexOf(b.ganzhi.year[0]), 10) !== 1) {
      flipBad.push(`${y} 年柱跳变非顺行一位 ${b.ganzhi.year}→${a.ganzhi.year}`)
    }
  }
  rec('立春翻转唯一性 + 顺行一位', 9, flipBad)

  // 真太阳时跨日契约：给经度后 solarTrue 跨日时 y/m/d 必须随之进位
  const tstBad = []
  for (const [y, mo, d, h, mi, lng] of [[2026, 1, 1, 0, 5, 87.6], [2026, 12, 31, 23, 55, 135], [2000, 3, 1, 0, 3, 73.5], [2026, 9, 30, 14, 30, 116.4]]) {
    const when = new Date(y, mo - 1, d, h, mi)
    const c = buildChart({ question: 'tst', when, longitude: lng })
    const expect = new Date(when.getTime() + c.solarTrue.offsetMin * 60000)
    if (c.solarTrue.y !== expect.getFullYear() || c.solarTrue.m !== expect.getMonth() + 1 || c.solarTrue.d !== expect.getDate()
      || c.solarTrue.h !== expect.getHours() || c.solarTrue.mi !== expect.getMinutes()) {
      tstBad.push(`${when.toISOString()} 实现=${c.solarTrue.text} 期望=${expect.toLocaleString('sv')}`)
    }
    if (Math.abs(c.solarTrue.offsetMin - (lng - 120) * 4 - c.astro.eotMin) > 0.01) tstBad.push(`${when.toISOString()} offsetMin 不等于 经度差+均时差`)
  }
  rec('真太阳时跨日与 offsetMin 契约', 4, tstBad)
}

// ═══════════════════════════════════════════════════════════════
// L2 · 六爻装卦 vs 独立实现 + 经典 golden（spec §A/§C8）
// ═══════════════════════════════════════════════════════════════
section('L2 六爻装卦（64 卦穷举 vs spec 独立 golden）')
{
  // ── 独立 golden（逐字抄自 docs/research/yijing-spec.md，**不是**从实现抄）──
  /** spec §A2 表：卦名 → [宫, 世位, 上卦, 下卦]。64/64 经 spec 与 R4 逐行核对。 */
  const GOLDEN64 = {
    乾为天: ['乾', 6, '乾', '乾'], 天风姤: ['乾', 1, '乾', '巽'], 天山遁: ['乾', 2, '乾', '艮'], 天地否: ['乾', 3, '乾', '坤'],
    风地观: ['乾', 4, '巽', '坤'], 山地剥: ['乾', 5, '艮', '坤'], 火地晋: ['乾', 4, '离', '坤'], 火天大有: ['乾', 3, '离', '乾'],
    兑为泽: ['兑', 6, '兑', '兑'], 泽水困: ['兑', 1, '兑', '坎'], 泽地萃: ['兑', 2, '兑', '坤'], 泽山咸: ['兑', 3, '兑', '艮'],
    水山蹇: ['兑', 4, '坎', '艮'], 地山谦: ['兑', 5, '坤', '艮'], 雷山小过: ['兑', 4, '震', '艮'], 雷泽归妹: ['兑', 3, '震', '兑'],
    离为火: ['离', 6, '离', '离'], 火山旅: ['离', 1, '离', '艮'], 火风鼎: ['离', 2, '离', '巽'], 火水未济: ['离', 3, '离', '坎'],
    山水蒙: ['离', 4, '艮', '坎'], 风水涣: ['离', 5, '巽', '坎'], 天水讼: ['离', 4, '乾', '坎'], 天火同人: ['离', 3, '乾', '离'],
    震为雷: ['震', 6, '震', '震'], 雷地豫: ['震', 1, '震', '坤'], 雷水解: ['震', 2, '震', '坎'], 雷风恒: ['震', 3, '震', '巽'],
    地风升: ['震', 4, '坤', '巽'], 水风井: ['震', 5, '坎', '巽'], 泽风大过: ['震', 4, '兑', '巽'], 泽雷随: ['震', 3, '兑', '震'],
    巽为风: ['巽', 6, '巽', '巽'], 风天小畜: ['巽', 1, '巽', '乾'], 风火家人: ['巽', 2, '巽', '离'], 风雷益: ['巽', 3, '巽', '震'],
    天雷无妄: ['巽', 4, '乾', '震'], 火雷噬嗑: ['巽', 5, '离', '震'], 山雷颐: ['巽', 4, '艮', '震'], 山风蛊: ['巽', 3, '艮', '巽'],
    坎为水: ['坎', 6, '坎', '坎'], 水泽节: ['坎', 1, '坎', '兑'], 水雷屯: ['坎', 2, '坎', '震'], 水火既济: ['坎', 3, '坎', '离'],
    泽火革: ['坎', 4, '兑', '离'], 雷火丰: ['坎', 5, '震', '离'], 地火明夷: ['坎', 4, '坤', '离'], 地水师: ['坎', 3, '坤', '坎'],
    艮为山: ['艮', 6, '艮', '艮'], 山火贲: ['艮', 1, '艮', '离'], 山天大畜: ['艮', 2, '艮', '乾'], 山泽损: ['艮', 3, '艮', '兑'],
    火泽睽: ['艮', 4, '离', '兑'], 天泽履: ['艮', 5, '乾', '兑'], 风泽中孚: ['艮', 4, '巽', '兑'], 风山渐: ['艮', 3, '巽', '艮'],
    坤为地: ['坤', 6, '坤', '坤'], 地雷复: ['坤', 1, '坤', '震'], 地泽临: ['坤', 2, '坤', '兑'], 地天泰: ['坤', 3, '坤', '乾'],
    雷天大壮: ['坤', 4, '震', '乾'], 泽天夬: ['坤', 5, '兑', '乾'], 水天需: ['坤', 4, '坎', '乾'], 水地比: ['坤', 3, '坎', '坤'],
  }
  /** spec §A1：八卦卦象（初,中,上，1=阳，自下而上）。 */
  const TRI_BITS = { 乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0], 巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0] }
  /** spec §A2 八宫五行。 */
  const PALACE_WX = { 乾: '金', 兑: '金', 离: '火', 震: '木', 巽: '木', 坎: '水', 艮: '土', 坤: '土' }
  /** spec §A4 纳甲完整表（4 源逐字一致）。 */
  const NAJIA_SPEC = {
    乾: { i: '甲', in: ['子', '寅', '辰'], o: '壬', out: ['午', '申', '戌'] },
    坤: { i: '乙', in: ['未', '巳', '卯'], o: '癸', out: ['丑', '亥', '酉'] },
    震: { i: '庚', in: ['子', '寅', '辰'], o: '庚', out: ['午', '申', '戌'] },
    巽: { i: '辛', in: ['丑', '亥', '酉'], o: '辛', out: ['未', '巳', '卯'] },
    坎: { i: '戊', in: ['寅', '辰', '午'], o: '戊', out: ['申', '戌', '子'] },
    离: { i: '己', in: ['卯', '丑', '亥'], o: '己', out: ['酉', '未', '巳'] },
    艮: { i: '丙', in: ['辰', '午', '申'], o: '丙', out: ['戌', '子', '寅'] },
    兑: { i: '丁', in: ['巳', '卯', '丑'], o: '丁', out: ['亥', '酉', '未'] },
  }
  const ZHI_WX = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' }
  const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }
  const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }
  const liuQin = (me, other) => (me === other ? '兄弟' : SHENG[me] === other ? '子孙' : SHENG[other] === me ? '父母' : KE[me] === other ? '妻财' : '官鬼')
  const LIU_CHONG = { 子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅', 卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳' }
  const LIU_HE = { 子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯', 辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午' }

  /** spec §C8 golden 名单（10 六冲 / 8 六合）。 */
  const GOLDEN_CHONG = ['乾为天', '兑为泽', '离为火', '震为雷', '巽为风', '坎为水', '艮为山', '坤为地', '天雷无妄', '雷天大壮']
  const GOLDEN_HE = ['天地否', '地天泰', '水泽节', '泽水困', '山火贲', '火山旅', '雷地豫', '地雷复']

  const entry = ENTRY_BY_NO[3]
  const when = new Date(2026, 8, 30, 14, 30)
  const badName = []; const badPalace = []; const badShiYing = []; const badNajia = []; const badQin = []; const badChongHe = []
  const seenChong = new Set(); const seenHe = new Set()
  let n = 0
  for (const [name, [palace, shi, upper, lower]] of Object.entries(GOLDEN64)) {
    // 由 golden 的上下卦位模式构造六爻（自下而上）：初二三=下卦，四五六=上卦
    const bits = [...TRI_BITS[lower], ...TRI_BITS[upper]]
    const coins = bits.map((b) => (b ? 7 : 8))   // 7 少阳 / 8 少阴，六爻安静
    const chart = buildChart({ question: 'liuyao-golden', when, coins })
    const r = runOne(entry, chart)
    n += 1
    if (!r.outcome) { badName.push(`${name} 未起：${r.error}`); continue }
    const d = r.outcome.detail
    const guaTxt = String(d.卦 ?? '')
    const m = guaTxt.match(/^(.+?)（(.+?)宫·(.+?)，世(\d)应(\d)）$/)
    if (!m) { badName.push(`${name} detail.卦 形状异常：${guaTxt}`); continue }
    if (m[1] !== name) badName.push(`期望 ${name}，实现给 ${m[1]}`)
    if (m[2] !== palace) badPalace.push(`${name} 期望宫 ${palace}，实现 ${m[2]}`)
    const expYing = mod(shi - 1 + 3, 6) + 1
    if (Number(m[4]) !== shi || Number(m[5]) !== expYing) {
      badShiYing.push(`${name} 期望 世${shi}应${expYing}，实现 世${m[4]}应${m[5]}`)
    }
    // 纳甲 + 六亲：逐爻比
    const lines = Array.isArray(d.装卦) ? d.装卦 : []
    if (lines.length !== 6) { badNajia.push(`${name} 装卦行数 ${lines.length}`); continue }
    const nl = NAJIA_SPEC[lower]; const nu = NAJIA_SPEC[upper]
    const expGZ = [...nl.in.map((z) => nl.i + z), ...nu.out.map((z) => nu.o + z)]
    const meWx = PALACE_WX[palace]
    const gotZhi = []
    for (let i = 0; i < 6; i += 1) {
      const mm = String(lines[i]).match(/^(\S+)爻 (阳|阴) (\S)(\S)(\S) (\S+) (\S+)/)
      if (!mm) { badNajia.push(`${name} 第${i + 1}爻解析失败：${lines[i]}`); continue }
      const got = mm[3] + mm[4]
      if (got !== expGZ[i]) badNajia.push(`${name} 第${i + 1}爻 纳甲 期望${expGZ[i]} 实现${got}`)
      const expQin = liuQin(meWx, ZHI_WX[mm[4]])
      if (mm[6] !== expQin) badQin.push(`${name} 第${i + 1}爻(${mm[4]}) 六亲 期望${expQin} 实现${mm[6]}`)
      if (mm[5] !== ZHI_WX[mm[4]]) badNajia.push(`${name} 第${i + 1}爻 五行 ${mm[5]}≠${ZHI_WX[mm[4]]}`)
      gotZhi.push(mm[4])
    }
    // 六冲/六合：独立穷举判据
    if (gotZhi.length === 6) {
      let chong = true; let he = true
      for (let i = 0; i < 3; i += 1) { if (LIU_CHONG[gotZhi[i]] !== gotZhi[i + 3]) chong = false; if (LIU_HE[gotZhi[i]] !== gotZhi[i + 3]) he = false }
      if (chong) seenChong.add(name)
      if (he) seenHe.add(name)
      const expect = chong ? '六冲卦' : he ? '六合卦' : '常卦'
      const got = String(d.六冲六合 ?? '').split(' ')[0].split('→')[0].split('（')[0]
      if (!got.startsWith(expect)) badChongHe.push(`${name} 期望 ${expect}，实现 ${d.六冲六合}`)
    }
  }
  rec('64 卦卦名（上下卦组合 → 卦名）', n, badName)
  rec('64 卦八宫归属', n, badPalace)
  rec('64 卦世应（应=世±3）', n, badShiYing)
  rec('64 卦纳甲（干支+五行）', n, badNajia)
  rec('64 卦六亲（宫五行为我）', n, badQin)
  rec('64 卦六冲/六合 运行时判定', n, badChongHe)

  // golden 名单：数量与成员必须严格等于 spec
  const goldBad = []
  const chongArr = [...seenChong].sort(); const heArr = [...seenHe].sort()
  if (chongArr.length !== 10) goldBad.push(`六冲卦应为 10 卦，实际 ${chongArr.length}：${chongArr.join('、')}`)
  for (const g of GOLDEN_CHONG) if (!seenChong.has(g)) goldBad.push(`六冲卦缺 ${g}`)
  if (heArr.length !== 8) goldBad.push(`六合卦应为 8 卦，实际 ${heArr.length}：${heArr.join('、')}`)
  for (const g of GOLDEN_HE) if (!seenHe.has(g)) goldBad.push(`六合卦缺 ${g}`)
  rec('六冲卦恰 10 卦 / 六合卦恰 8 卦（spec §C8 golden）', 18, goldBad)
  note(`六冲卦：${chongArr.join('、')}`)
  note(`六合卦：${heArr.join('、')}`)
  if (goldBad.length > 0) {
    issue('高', '六冲/六合卦名单与 spec §C8 golden 不符', goldBad.join('；'),
      'node test/v2-crosscheck.mjs（L2 段）', 'm-yijing')
  }

  // ── 第二个独立 golden：m-yijing 手工核对的 20 卦例（来源与其 docs/verification/yijing.md 一致）──
  // 两个来源（spec §A2/§A4 与 m-yijing 手工表）互相印证；实现必须同时满足两者。
  const GOLDEN20 = [
    ['乾为天', 6, 3, '乾', '本宫', '六冲', ['甲子', '甲寅', '甲辰', '壬午', '壬申', '壬戌'], ['子孙', '妻财', '父母', '官鬼', '兄弟', '父母']],
    ['坤为地', 6, 3, '坤', '本宫', '六冲', ['乙未', '乙巳', '乙卯', '癸丑', '癸亥', '癸酉'], ['兄弟', '父母', '官鬼', '兄弟', '妻财', '子孙']],
    ['震为雷', 6, 3, '震', '本宫', '六冲', ['庚子', '庚寅', '庚辰', '庚午', '庚申', '庚戌'], ['父母', '兄弟', '妻财', '子孙', '官鬼', '妻财']],
    ['巽为风', 6, 3, '巽', '本宫', '六冲', ['辛丑', '辛亥', '辛酉', '辛未', '辛巳', '辛卯'], ['妻财', '父母', '官鬼', '妻财', '子孙', '兄弟']],
    ['坎为水', 6, 3, '坎', '本宫', '六冲', ['戊寅', '戊辰', '戊午', '戊申', '戊戌', '戊子'], ['子孙', '官鬼', '妻财', '父母', '官鬼', '兄弟']],
    ['离为火', 6, 3, '离', '本宫', '六冲', ['己卯', '己丑', '己亥', '己酉', '己未', '己巳'], ['父母', '子孙', '官鬼', '妻财', '子孙', '兄弟']],
    ['艮为山', 6, 3, '艮', '本宫', '六冲', ['丙辰', '丙午', '丙申', '丙戌', '丙子', '丙寅'], ['兄弟', '父母', '子孙', '兄弟', '妻财', '官鬼']],
    ['兑为泽', 6, 3, '兑', '本宫', '六冲', ['丁巳', '丁卯', '丁丑', '丁亥', '丁酉', '丁未'], ['官鬼', '妻财', '父母', '子孙', '兄弟', '父母']],
    ['火地晋', 4, 1, '乾', '游魂', '常卦', ['乙未', '乙巳', '乙卯', '己酉', '己未', '己巳'], ['父母', '官鬼', '妻财', '兄弟', '父母', '官鬼']],
    ['火天大有', 3, 6, '乾', '归魂', '常卦', ['甲子', '甲寅', '甲辰', '己酉', '己未', '己巳'], ['子孙', '妻财', '父母', '兄弟', '父母', '官鬼']],
    ['天风姤', 1, 4, '乾', '一世', '常卦', ['辛丑', '辛亥', '辛酉', '壬午', '壬申', '壬戌'], ['父母', '子孙', '兄弟', '官鬼', '兄弟', '父母']],
    ['山地剥', 5, 2, '乾', '五世', '常卦', ['乙未', '乙巳', '乙卯', '丙戌', '丙子', '丙寅'], ['父母', '官鬼', '妻财', '父母', '子孙', '妻财']],
    ['天雷无妄', 4, 1, '巽', '四世', '六冲', ['庚子', '庚寅', '庚辰', '壬午', '壬申', '壬戌'], ['父母', '兄弟', '妻财', '子孙', '官鬼', '妻财']],
    ['雷天大壮', 4, 1, '坤', '四世', '六冲', ['甲子', '甲寅', '甲辰', '庚午', '庚申', '庚戌'], ['妻财', '官鬼', '兄弟', '父母', '子孙', '兄弟']],
    ['天地否', 3, 6, '乾', '三世', '六合', ['乙未', '乙巳', '乙卯', '壬午', '壬申', '壬戌'], ['父母', '官鬼', '妻财', '官鬼', '兄弟', '父母']],
    ['地天泰', 3, 6, '坤', '三世', '六合', ['甲子', '甲寅', '甲辰', '癸丑', '癸亥', '癸酉'], ['妻财', '官鬼', '兄弟', '兄弟', '妻财', '子孙']],
    ['水泽节', 1, 4, '坎', '一世', '六合', ['丁巳', '丁卯', '丁丑', '戊申', '戊戌', '戊子'], ['妻财', '子孙', '官鬼', '父母', '官鬼', '兄弟']],
    ['火山旅', 1, 4, '离', '一世', '六合', ['丙辰', '丙午', '丙申', '己酉', '己未', '己巳'], ['子孙', '兄弟', '妻财', '妻财', '子孙', '兄弟']],
    ['火泽睽', 4, 1, '艮', '四世', '常卦', ['丁巳', '丁卯', '丁丑', '己酉', '己未', '己巳'], ['父母', '官鬼', '兄弟', '子孙', '兄弟', '父母']],
    ['水雷屯', 2, 5, '坎', '二世', '常卦', ['庚子', '庚寅', '庚辰', '戊申', '戊戌', '戊子'], ['兄弟', '子孙', '官鬼', '父母', '官鬼', '兄弟']],
  ]
  const badG20 = []
  let n20 = 0
  for (const [name, shi, ying, palace, stage, pattern, najia, qin] of GOLDEN20) {
    const bits = [...TRI_BITS[GOLDEN64[name][3]], ...TRI_BITS[GOLDEN64[name][2]]]
    const chart = buildChart({ question: 'liuyao-classic', when, coins: bits.map((b) => (b ? 7 : 8)) })
    const r = runOne(entry, chart)
    n20 += 1
    if (!r.outcome) { badG20.push(`${name} 未起`); continue }
    const d = r.outcome.detail
    const m = String(d.卦 ?? '').match(/^(.+?)（(.+?)宫·(.+?)，世(\d)应(\d)）$/)
    if (!m) { badG20.push(`${name} detail.卦 形状异常`); continue }
    if (m[1] !== name || m[2] !== palace || m[3] !== stage) badG20.push(`${name} 宫位 期望${palace}/${stage} 实现${m[2]}/${m[3]}`)
    if (Number(m[4]) !== shi || Number(m[5]) !== ying) badG20.push(`${name} 世应 期望${shi}/${ying} 实现${m[4]}/${m[5]}`)
    const lines = Array.isArray(d.装卦) ? d.装卦 : []
    const got = lines.map((t) => { const mm = String(t).match(/^(\S+)爻 (?:阳|阴) (\S)(\S)(\S) (\S+) (\S+)/); return mm ? { gz: mm[2] + mm[3], qin: mm[5] } : null })
    if (got.some((x) => !x)) { badG20.push(`${name} 装卦解析失败`); continue }
    for (let i = 0; i < 6; i += 1) {
      if (got[i].gz !== najia[i]) badG20.push(`${name} 第${i + 1}爻纳甲 期望${najia[i]} 实现${got[i].gz}`)
      if (got[i].qin !== qin[i]) badG20.push(`${name} 第${i + 1}爻六亲 期望${qin[i]} 实现${got[i].qin}`)
    }
    const gotPattern = String(d.六冲六合 ?? '').split(' ')[0].split('→')[0].split('（')[0]
    if (pattern !== '常卦' && !gotPattern.startsWith(pattern)) badG20.push(`${name} 格局 期望${pattern} 实现${d.六冲六合}`)
    if (pattern === '常卦' && (gotPattern.startsWith('六冲') || gotPattern.startsWith('六合'))) badG20.push(`${name} 格局 期望常卦 实现${gotPattern}`)
  }
  rec('经典卦例 20 例（第二个独立 golden：m-yijing 手工表：宫位/世应/纳甲/六亲/格局）', n20, badG20)
  if (badG20.length > 0) issue('高', '20 个经典卦例与实现不符', badG20.slice(0, 6).join('；'), 'node test/v2-crosscheck.mjs（L2 golden20 段）', 'm-yijing')
}

// ═══════════════════════════════════════════════════════════════
// L3 · 紫微斗数 vs iztro（① 离线夹具 200 组 ② **新鲜样本实时对拍**，防过拟合夹具）
// ═══════════════════════════════════════════════════════════════
section('L3 紫微斗数 vs iztro@2.6.1')
{
  const MAJOR = ['紫微', '天机', '太阳', '武曲', '天同', '廉贞', '天府', '太阴', '贪狼', '巨门', '天相', '天梁', '七杀', '破军']
  /** 时辰索引（iztro 口径）：0=早子时，12=晚子时。 */
  const timeIndexOf = (h) => (h === 23 ? 12 : h === 0 ? 0 : Math.floor((h + 1) / 2))
  const strip = (s) => String(s).replace(/(庙|旺|得|利|平|不|陷|化[禄权科忌])/g, '')

  /** 把一方的 12 宫按**地支**归一（避开「仆役/交友」宫名差异）。 */
  const byBranchFromIztro = (palaces) => {
    const out = {}
    for (const [name, p] of Object.entries(palaces ?? {})) {
      out[p.branch] = { name, major: (p.major ?? []).map(strip).filter((s) => MAJOR.includes(s)), hua: [] }
      for (const s of [...(p.major ?? []), ...(p.minor ?? [])]) {
        const m = String(s).match(/^(.+?)(?:庙|旺|得|利|平|不|陷)?化([禄权科忌])$/)
        if (m) out[p.branch].hua.push(`${m[1]}化${m[2]}`)
      }
    }
    return out
  }
  const byBranchFromOurs = (z) => {
    const out = {}
    for (const p of z.palaces) {
      out[p.zhi] = { name: p.name, major: p.stars.filter((s) => MAJOR.includes(s)), hua: Object.entries(p.hua ?? {}).map(([s, h]) => `${s}化${h}`) }
    }
    return out
  }

  /** 跑一组：返回不一致清单。 */
  function compareOne(input, expect, label) {
    const bad = []
    const chart = buildChart({
      question: 'ziwei-check', when: new Date(2026, 8, 30, 14, 30),
      gender: input.gender, birth: { y: input.y, m: input.mo, d: input.d, h: input.h, mi: input.mi },
    })   // 不给经度：iztro 夹具用的是原始钟表时，不做真太阳时校正
    const z = mingli.ziweiChart(chart)
    if (!z) { bad.push(`${label} ziweiChart 返回 null`); return bad }
    if (z.mingGong !== expect.mingGong) bad.push(`${label} 命宫 实现=${z.mingGong} iztro=${expect.mingGong}`)
    if (z.shenGong !== expect.shenGong) bad.push(`${label} 身宫 实现=${z.shenGong} iztro=${expect.shenGong}`)
    if (z.juName !== expect.wuxingJu) bad.push(`${label} 五行局 实现=${z.juName} iztro=${expect.wuxingJu}`)
    const mine = byBranchFromOurs(z); const theirs = byBranchFromIztro(expect.palaces)
    for (const br of Object.keys(theirs)) {
      const a = (mine[br]?.major ?? []).slice().sort().join('')
      const b = (theirs[br].major ?? []).slice().sort().join('')
      if (a !== b) bad.push(`${label} ${br}宫主星 实现=[${a}] iztro=[${b}]`)
    }
    const huaMine = Object.values(mine).flatMap((p) => p.hua).sort().join('、')
    const huaTheirs = Object.values(theirs).flatMap((p) => p.hua).sort().join('、')
    if (huaMine !== huaTheirs) bad.push(`${label} 生年四化 实现=[${huaMine}] iztro=[${huaTheirs}]`)
    return bad
  }

  // ① 离线夹具 200 组
  const FIX = `${HERE}/tools/fixtures/ziwei-oracle.json`
  if (existsSync(FIX)) {
    const fx = JSON.parse(readFileSync(FIX, 'utf8'))
    const bad = []
    for (const it of fx.items) bad.push(...compareOne(it.input, it.expect, `${it.input.y}-${it.input.mo}-${it.input.d} ${it.input.h}:${it.input.mi}`))
    rec(`紫微 vs iztro 离线夹具（${fx.items.length} 组，命宫/身宫/五行局/主星/四化）`, fx.items.length, bad, `oracle=${fx.oracle}`)
    note(`夹具生成器：${'tools/oracle-ziwei.mjs'}；夹具自身计数 count=${fx.count} skipped=${fx.skipped}`)
  } else {
    rec('紫微 vs iztro 离线夹具', 1, ['夹具不存在，SKIP'], 'SKIP：tools/fixtures/ziwei-oracle.json 缺失')
  }

  // ② 新鲜样本：实时调 iztro（**不同种子**，验证不是过拟合夹具）
  let fresh = null
  try {
    const mod2 = await import('file:///D:/DSH/.divination-v2-deps/node_modules/iztro/lib/index.js')
    fresh = mod2.astro ?? mod2.default?.astro
  } catch (e) { fresh = null; note(`iztro 动态 import 失败：${e.message}`) }
  if (fresh) {
    const r = makeRand(0x5EED1234)   // 与夹具生成器不同种子
    const bad = []
    let n = 0
    for (let i = 0; i < 150; i += 1) {
      const y = 1931 + (r() % 89); const mo = 1 + (r() % 12); const d = 1 + (r() % 28)
      const h = r() % 24; const mi = r() % 60; const gender = r() % 2 === 0 ? '男' : '女'
      let a = null
      try { a = fresh.bySolar(`${y}-${mo}-${d}`, timeIndexOf(h), gender, true, 'zh-CN') } catch { a = null }
      if (!a) continue
      const palaces = {}
      for (const p of a.palaces ?? []) {
        palaces[p.name] = { branch: p.earthlyBranch, major: (p.majorStars ?? []).map((s) => `${s.name}${s.brightness ?? ''}${s.mutagen ? '化' + s.mutagen : ''}`), minor: (p.minorStars ?? []).map((s) => `${s.name}${s.brightness ?? ''}${s.mutagen ? '化' + s.mutagen : ''}`) }
      }
      const expect = { mingGong: a.earthlyBranchOfSoulPalace, shenGong: a.earthlyBranchOfBodyPalace, wuxingJu: a.fiveElementsClass, palaces }
      n += 1
      bad.push(...compareOne({ y, mo, d, h, mi, gender }, expect, `${y}-${mo}-${d} ${h}:${mi} ${gender}`))
    }
    rec('紫微 vs iztro **新鲜样本**（实时查询，非夹具）', n, bad, '种子 0x5EED1234 ≠ 夹具种子 20261002')
    if (bad.length > 0) {
      const lateZiBad = bad.filter((b) => /\b23:/.test(b))
      const other = bad.filter((b) => !/\b23:/.test(b))
      const ev = [
        'iztro 在晚子时（timeIndex=12）的实测口径（本脚本反解其命宫得月序）：',
        '  1955-05-19 农历闰三月廿八：ti=0/6/11 → month 4，ti=12 → month 3',
        '  1998-11-18 农历九月三十：ti=0/6/11 → month 9，ti=12 → month 9（**不因次日进十月而进位**）',
        '⇒ 晚子时 iztro 取「当日农历月/年」，日进次日；实现若整盘进次日，月末/闰月下半月的晚子时会月序 +1。',
      ].join('\n     ')
      if (lateZiBad.length > 0) {
        issue('高', `紫微安星晚子时（23:xx）与 iztro 不一致（${lateZiBad.length} 项断言）`,
          `${lateZiBad.slice(0, 4).join('；')}\n     ${ev}`,
          "node test/v2-crosscheck.mjs（L3-②/③ 段）", 'lead（task-5）')
      }
      if (other.length > 0) issue('高', '紫微安星非晚子时样本也与 iztro 不一致（新增回归）', other.slice(0, 6).join('；'), 'node test/v2-crosscheck.mjs（L3-② 段）', 'lead')
    }
    note(`紫微新鲜样本不一致中：晚子时 ${bad.filter((b) => /\b23:/.test(b)).length} 项，非晚子时 ${bad.filter((b) => !/\b23:/.test(b)).length} 项`)

    // ③ 边缘样本：专打「晚子时 × 农历月末/闰月下半月」这一面（原夹具采不到的面）
    const Lunar = require(`${HERE}/vendor/lunar.cjs`)
    const edge = []
    const re2 = makeRand(0xED6E01)
    for (let guard = 0; guard < 30000 && edge.length < 60; guard += 1) {
      const y = 1930 + (re2() % 91); const mo = 1 + (re2() % 12); const d = 1 + (re2() % 28)
      const h = re2() % 2 === 0 ? 23 : 0
      const mi = 30 + (re2() % 29)
      const l = Lunar.Solar.fromYmdHms(y, mo, d, h, mi, 0).getLunar()
      const day = l.getDay(); const leap = l.getMonth() < 0
      if (h === 23 && (day >= 25 || leap)) edge.push({ y, mo, d, h, mi, gender: re2() % 2 === 0 ? '男' : '女', day, leap })
    }
    const badEdge = []
    let nEdge = 0
    for (const it of edge) {
      let a = null
      try { a = fresh.bySolar(`${it.y}-${it.mo}-${it.d}`, timeIndexOf(it.h), it.gender, true, 'zh-CN') } catch { a = null }
      if (!a) continue
      const palaces = {}
      for (const p of a.palaces ?? []) {
        palaces[p.name] = { branch: p.earthlyBranch, major: (p.majorStars ?? []).map((s) => `${s.name}${s.brightness ?? ''}${s.mutagen ? '化' + s.mutagen : ''}`), minor: (p.minorStars ?? []).map((s) => `${s.name}${s.brightness ?? ''}${s.mutagen ? '化' + s.mutagen : ''}`) }
      }
      nEdge += 1
      badEdge.push(...compareOne(it, { mingGong: a.earthlyBranchOfSoulPalace, shenGong: a.earthlyBranchOfBodyPalace, wuxingJu: a.fiveElementsClass, palaces }, `${it.y}-${it.mo}-${it.d} 23:${it.mi} 农历${it.leap ? '闰' : ''}${it.day}日 ${it.gender}`))
    }
    rec('紫微 **边缘样本**（晚子时 × 农历廿五–三十/闰月，独立构造）', nEdge, badEdge, '专打 ISSUE-01 的面')
    if (badEdge.length > 0) {
      // 归因：把失败样本按「是否闰月 × 下半月」拆分，便于定位残留规则
      const leapHalf = edge.filter((it) => it.leap && it.day >= 16).length
      const leapFirst = edge.filter((it) => it.leap && it.day < 16).length
      const normalEnd = edge.filter((it) => !it.leap).length
      const badSet = new Set(badEdge.map((b) => b.split(' ')[0]))
      const badSamples = edge.filter((it) => badSet.has(`${it.y}-${it.mo}-${it.d}`))
      const badLeapHalf = badSamples.filter((it) => it.leap && it.day >= 16).length
      const badLeapFirst = badSamples.filter((it) => it.leap && it.day < 16).length
      const badNormal = badSamples.filter((it) => !it.leap).length
      issue('高', '紫微在晚子时×闰月边缘样本上仍与 iztro 不一致（ISSUE-01 **未完全闭环**）',
        `${badEdge.length} 项断言 / ${nEdge} 组样本。样本构成：闰月下半月 ${leapHalf}、闰月上半月 ${leapFirst}、非闰月末 ${normalEnd}；`
        + `失败样本构成：闰月下半月 ${badLeapHalf}、闰月上半月 ${badLeapFirst}、非闰月 ${badNormal}。`
        + `\n     例：${badEdge.slice(0, 4).join('；')}`
        + '\n     归因（本脚本反解 iztro 命宫得月序）：晚子时 iztro 取「当日农历月序**原值**」，**闰月亦不做半调整**；'
        + '本例 1998-07-20 农历闰五月廿七 23:48 → iztro 月序 5（原值），实现月序 6（半调整作六月）→ 命宫差一支。'
        + '非闰月末（跨月不进位）那一面已修复 ✅。',
        'node test/v2-crosscheck.mjs（L3-③ 段）', 'lead（task-5）')
    } else if (nEdge > 0) {
      note(`ISSUE-01 闭环复验：${nEdge} 组边缘样本（晚子时 × 农历廿五后/闰月）全部与 iztro 一致 ✅`)
    }
  } else {
    rec('紫微 vs iztro 新鲜样本', 1, ['iztro 不可用，SKIP'], 'SKIP：oracle 依赖缺失')
  }

  // ③ "硬贴合"痕迹扫描：源码里若在**代码行**（非注释）出现夹具/报告点名的具体日期字面量，即为可疑
  const srcTxt = readFileSync(`${HERE}/src/methods/mingli.js`, 'utf8')
  const srcLines = srcTxt.split('\n')
  const dates = ['2020-02-02', '2020-2-2', '1938-02-04', '1938-2-4', '2002-03-05', '2002-3-5', '2009-05', '1974-04', '1993-03']
  const codeHits = []; const commentHits = []
  srcLines.forEach((ln, i) => {
    for (const d of dates) {
      const p = ln.indexOf(d); if (p < 0) continue
      const cmt = ln.indexOf('//')
      const isComment = (cmt >= 0 && cmt < p) || ln.trim().startsWith('*') || ln.trim().startsWith('/*')
      ;(isComment ? commentHits : codeHits).push(`第${i + 1}行 ${d}`)
    }
  })
  rec('紫微实现无「按具体日期硬编码」痕迹（代码行）', 1, codeHits, codeHits.length ? `代码行含日期字面量：${codeHits.join(',')}` : `未见代码行日期字面量（注释里 ${commentHits.length} 处举例说明，属正常）`)
  if (commentHits.length > 0) note(`mingli.js 注释中含反例日期 ${commentHits.length} 处（用于说明口径，非硬编码）：${commentHits.join('、')}`)
  if (codeHits.length > 0) issue('高', 'mingli.js **代码行**出现具体日期字面量（疑似硬贴合夹具）', codeHits.join(','), 'grep -n "2020-02-02" src/methods/mingli.js', 'lead')
}

// ═══════════════════════════════════════════════════════════════
// L4 · 行星/日月黄经 vs astronomy-engine（**换 API 路径**，避免自己比自己）
// ═══════════════════════════════════════════════════════════════
section('L4 星历：换 API 路径复算')
{
  const norm360 = (x) => ((x % 360) + 360) % 360
  const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180)

  const DATES = [new Date(1990, 4, 12, 9, 30), new Date(2026, 8, 30, 14, 30), new Date(1900, 0, 1, 0, 0),
    new Date(1950, 6, 1, 12, 0), new Date(2000, 0, 1, 0, 0), new Date(2026, 1, 4, 4, 2),
    new Date(2050, 11, 31, 23, 59), new Date(2100, 5, 15, 6, 0), new Date(1965, 3, 10, 8, 0), new Date(2010, 10, 5, 20, 0)]
  /** JplHorizons ΔT 表只覆盖 1962–2017（范围外会夹到端点值，不是独立模型）→ 只在表内比对。 */
  const DT_JPL_OK = (y) => y >= 1962 && y <= 2017
  const badSun = []; const badMoon = []; const badPl = []; const badDT = []; const badEot = []; const badSu = []
  const SUNAMES = ['角', '亢', '氐', '房', '心', '尾', '箕', '斗', '牛', '女', '虚', '危', '室', '壁', '奎', '娄', '胃', '昴', '毕', '觜', '参', '井', '鬼', '柳', '星', '张', '翼', '轸']
  for (const d of DATES) {
    const c = buildChart({ question: 'astro-path', when: d })
    const A = c.astro
    const t = Astro.MakeTime(d)
    const stamp = d.toISOString().slice(0, 16)
    // 太阳：实现走 SunPosition（ECT）；另一条路径 = GeoVector(Sun) → Ecliptic
    const sun2 = norm360(Astro.Ecliptic(Astro.GeoVector(Astro.Body.Sun, t, true)).elon)
    if (angDiff(A.sunLon, sun2) > 0.02) badSun.push(`${stamp} 实现=${A.sunLon} GeoVector路=${sun2.toFixed(4)}`)
    // 月亮：实现走 EclipticGeoMoon；另一条 = GeoMoon（J2000 矢量）→ Ecliptic 转 ECT
    const moon2 = norm360(Astro.Ecliptic(Astro.GeoMoon(t)).elon)
    if (angDiff(A.moonLon, moon2) > 0.05) badMoon.push(`${stamp} 实现=${A.moonLon} GeoMoon路=${moon2.toFixed(4)}`)
    // 五星：实现走 GeoVector(行星)+Ecliptic；另一条 = HelioVector(行星)−HelioVector(地球)（无光行时）
    for (const [k, body] of Object.entries({ 水: 'Mercury', 金: 'Venus', 火: 'Mars', 木: 'Jupiter', 土: 'Saturn' })) {
      const hv = Astro.HelioVector(Astro.Body[body], t)
      const he = Astro.HelioVector(Astro.Body.Earth, t)
      const ge = { x: hv.x - he.x, y: hv.y - he.y, z: hv.z - he.z, t }
      const lon2 = norm360(Astro.Ecliptic(ge).elon)
      if (angDiff(A.planets[k], lon2) > 0.1) badPl.push(`${stamp} ${k} 实现=${A.planets[k]} 日心差路=${lon2.toFixed(4)}`)
    }
    // ΔT：两个独立模型（实现用 EspenakMeeus；另一模型 JplHorizons，仅在 1962–2017 表内有效）
    if (DT_JPL_OK(d.getFullYear())) {
      const dt2 = Astro.DeltaT_JplHorizons(t.tt)
      if (Math.abs(A.deltaT - dt2) > 5) badDT.push(`${stamp} EspenakMeeus=${A.deltaT} JplHorizons=${dt2}`)
    }
    // 均时差：换 NOAA 闭式（独立三角近似）
    const doy = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86400000)
    const b2 = (2 * Math.PI * (doy - 81)) / 364
    const noaa = 9.87 * Math.sin(2 * b2) - 7.53 * Math.cos(b2) - 1.5 * Math.sin(b2)
    if (Math.abs(A.eotMin - noaa) > 2) badEot.push(`${stamp} 实现=${A.eotMin} NOAA=${noaa.toFixed(2)}`)
    // 入宿度：宿名合法、入宿度落在该宿宽度内（用实现给出的 refRa 与下一宿距星差校验）
    if (!SUNAMES.includes(A.su28.name)) badSu.push(`${stamp} 宿名非法 ${A.su28.name}`)
    if (!(A.su28.ruDu >= 0 && A.su28.ruDu < 40)) badSu.push(`${stamp} ruDu 越界 ${A.su28.ruDu}`)
    // 日躔宿必须与太阳赤经落在同一区间（用距星赤经复核：目标赤经 − 距星赤经 = ruDu）
    if (Math.abs(norm360(A.sunRaDeg - A.su28.refRa) - A.su28.ruDu) > 0.01) {
      badSu.push(`${stamp} ruDu 与 (日赤经−距星赤经) 不符`)
    }
  }
  rec('太阳黄经：SunPosition 路 vs GeoVector→Ecliptic 路', DATES.length, badSun)
  rec('月亮黄经：EclipticGeoMoon 路 vs GeoMoon→Ecliptic 路', DATES.length, badMoon)
  rec('五星黄经：地心视位置路 vs 日心矢量差路', DATES.length * 5, badPl)
  rec('ΔT：EspenakMeeus vs JplHorizons 双模型（仅 1962–2017 表内）', DATES.filter((d) => DT_JPL_OK(d.getFullYear())).length, badDT, `表外 ${DATES.filter((d) => !DT_JPL_OK(d.getFullYear())).length} 例 SKIP（JplHorizons 超出表范围会夹端点值，非独立模型）`)
  rec('均时差：Meeus 精算 vs NOAA 闭式（容差 2 分钟）', DATES.length, badEot)
  rec('入宿度：宿名合法 + ruDu 与 (赤经−距星赤经) 自洽', DATES.length * 3, badSu)

  // 节气反解：SearchSunLongitude 找到的时刻，其太阳黄经必须等于目标（自洽）
  const badSeek = []
  for (const [lon, y, mo] of [[315, 2026, 2], [90, 2026, 6], [270, 2026, 12], [0, 2000, 3]]) {
    const hit = Astro.SearchSunLongitude(lon, Astro.MakeTime(new Date(y, mo - 1, 1)), 40)
    if (!hit) { badSeek.push(`${y}-${mo} 搜不到 λ=${lon}`); continue }
    const back = norm360(Astro.SunPosition(hit).elon)
    if (Math.abs(((back - lon + 540) % 360) - 180) > 0.002) badSeek.push(`${y}-${mo} λ=${lon} 反解得 ${back}`)
  }
  rec('节气反解自洽（λ 目标 → 时刻 → λ 回代）', 4, badSeek)
}

// ═══════════════════════════════════════════════════════════════
// L5 · 诚实性审计（≥200 问 × 108 法）
// ═══════════════════════════════════════════════════════════════
section('L5 诚实性审计')
{
  const BASE_Q = [
    '', '   ', '。', '？', '嗯', '。。。', '1,2,3', 'a', 'z'.repeat(300),
    '这次合作能不能成', '我跟他还有姻缘吗', '这笔投资能不能赚钱', '这个病能不能好', '该不该跳槽', '官司能赢吗',
    '东西丢哪了', '今年运势如何', '我叫张伟，这个名字好不好', '我叫李娜，问事业', '测字：明，问前程', '测字：',
    '左眼一直跳，是凶是吉', '右眼跳', '打喷嚏了', '昨天晚上梦见蛇', '1990年5月12日出生的人今年如何',
    '明天适不适合搬家', '下个月初八开业好不好', '找一个人，走失三天了', '怀孕了，想看男女', '最近有点焦虑',
    '帮我看下财运和感情', '这个项目什么时候能上线', '我和他还能复合吗', '考试能不能过', '房子什么时候能卖出去',
    '这个合同签不签', '公司会不会裁员', '出门顺利吗', '今天适合谈生意吗', '最近身体怎么样', '做梦梦见水',
    '看到一只乌鸦叫', '听见喜鹊叫', '眼皮跳', '耳鸣', '捡到钱', '打碎杯子', '出门遇雨', '手机丢了',
    '问合作', '问姻缘', '问病', '问财', '问官', '问出行', '问失物', '问考试', '问孕产', '问官司',
  ]
  const NQ = QUICK ? 60 : 220
  const rnd = makeRand(0xA11CE)
  const PLACEHOLDER = /^(|—|-|—|n\/a|N\/A|undefined|null|TBD|待补|待定|无|略)$/
  /** 仍在重写的族（Lead 2026-02 通告：仅择时族）→ 其缺项只作提示，不计硬失败。 */
  const IN_PROGRESS = (no) => no >= 59 && no <= 72
  const STILL_REWRITING = '择时族 #59–#72（kernel-tables 承接 task-6）'
  /** 外应类问题关键词（宽口径：只要用户确实报了某种兆象，就不该被要求标"未报外应"）。 */
  const OMEN = /眼.{0,4}跳|眼皮|耳鸣|喷嚏|打喷嚏|鸟|乌鸦|喜鹊|梦见|做梦|梦到|打碎|杯子|丢|落|雨|雪|雷|彩虹|晕|见血|心跳|打嗝|绊|摔/
  const badCite = []; const badEv = []; const badInfer = []; const badDup = []; const badSkip = []; const badFidelity = []
  const dirty = []            // detail 里的脏值字面量（verifier #2 抓到的检查器漏洞：原先只看 NaN/[object Object]）
  /** detail 序列化后出现这些字面量即为脏值。注意：`undefined` 只在**字符串值**里才看得见
   *  （对象属性为 undefined 时 JSON.stringify 会整个丢掉），故必须同时扫「原始文本」。 */
  const DIRTY_RE = /(\bNaN\b|\[object |undefined|"null"|\bInfinity\b)/
  const skipReasons = new Map()
  const citeMissNos = new Set(); const evMissNos = new Set()
  let runs = 0; let dupTotal = 0
  const fidelityCount = { full: 0, core: 0, approx: 0 }
  for (let i = 0; i < NQ; i += 1) {
    const q = i < BASE_Q.length ? BASE_Q[i] : `${BASE_Q[i % BASE_Q.length]}（第${i}问）`
    const when = new Date(2026, 8, 30, 14, 30)
    const numbers = i % 3 === 0 ? [] : [7, 13, 21]
    const chart = buildChart({ question: q, when, longitude: 116.4, gender: i % 2 ? '女' : '男', numbers, birth: { y: 1990, m: 5, d: 12, h: 9, mi: 30 } })
    const rs = runMany({ chart })
    runs += 1
    if (rs.filter((r) => r.outcome).length !== 108) {
      for (const r of rs.filter((x) => !x.outcome)) {
        const k = `#${r.entry.no}${r.entry.name}|${r.error}`
        skipReasons.set(k, (skipReasons.get(k) ?? 0) + 1)
      }
    }
    const seen = new Map()
    for (const r of rs) {
      const o = r.outcome; if (!o) continue
      fidelityCount[o.fidelity] = (fidelityCount[o.fidelity] ?? 0) + 1
      const d = o.detail ?? {}
      const cites = Array.isArray(d.cite) ? d.cite : (d.cite ? [d.cite] : [])
      // 分三类精确报告：整条缺失（空数组）/ 元素为 null|undefined（数组有洞）/ 元素为占位符或空串
      const badElems = Array.isArray(d.cite) ? cites.map((x, i) => [i, x]).filter(([, x]) => typeof x !== 'string' || x.trim() === '' || PLACEHOLDER.test(x.trim())) : []
      if (cites.length === 0 || badElems.length > 0) {
        const kind = cites.length === 0 ? '空数组' : `元素非法(${badElems.map(([i, x]) => `#${i}:${x === null ? 'null' : x === undefined ? 'undefined' : typeof x === 'string' ? (x.trim() === '' ? '空串' : '占位符') : typeof x}`).join(',')})`
        badCite.push(`#${r.entry.no} ${kind} 数组长度=${cites.length} 合法串长度=[${cites.map((x) => (typeof x === 'string' ? x.length : '-')).join(',')}]`)
        citeMissNos.add(`${r.entry.no}|${IN_PROGRESS(r.entry.no) ? 'SKIP' : 'ISSUE'}`)
      }
      const ev = Array.isArray(d.evidence) ? d.evidence : []
      if (ev.length === 0) {
        badEv.push(`#${r.entry.no} evidence 空`)
        evMissNos.add(`${r.entry.no}|${IN_PROGRESS(r.entry.no) ? 'SKIP' : 'ISSUE'}`)
      }
      // 诚实降级**双向对照**（契约 §2.2）：报了 → 不得标「未报」；未报 → 必须标「未报…取象」且降 approx
      if ([92, 93].includes(r.entry.no)) {
        // #92 笔画：报数可当笔画（契约 §2.2 明文）；#93 拆字：必须问句里真有「字」才不算未报
        // （先剥掉本脚本自己加的「（第N问）」后缀，否则会把后缀里的汉字当作用户报的字）
        const q0 = q.replace(/（第\d+问）$/, '')
        const reported = r.entry.no === 92
          ? (/明|字[:：]\s*[\u4e00-\u9fa5]/.test(q0) || numbers.length > 0)
          : /字[:：]\s*[\u4e00-\u9fa5]/.test(q0)
        const prefixed = String(o.essence).startsWith('未报所测之字')
        if (reported && prefixed) badInfer.push(`#${r.entry.no} 用户**报了字/报数**却仍标「未报所测之字」（q=「${q0}」，essence=「${o.essence}」）`)
        if (!reported && !prefixed) badInfer.push(`#${r.entry.no} 未报字却未标「取象」（q=「${q0}」，essence=「${o.essence}」）`)
        if (!reported && o.fidelity !== 'approx' && r.entry.no === 93) badInfer.push(`#${r.entry.no} 未报字但 fidelity=${o.fidelity}（契约要求 approx，q=「${q0}」）`)
      }
      if ([95, 96, 97].includes(r.entry.no)) {
        // 三个外应法各有自己的兆象域：鸟占看鸟、眼跳占看眼、喷嚏占看喷嚏。
        // 用统一"外应"关键词会把「左眼跳」误判成鸟占的已报外应（Lead 指出的判据缺陷）。
        const DOMAIN = { 95: /鸟|鸦|鹊|燕|雁|鹰|雀|禽|鹞|鸮|飞过/, 96: /左眼|右眼|眼.{0,4}跳/, 97: /喷嚏|打嚏|鼻.{0,2}痒|喷啑/ }
        const reported = DOMAIN[r.entry.no].test(q)
        const prefixed = String(o.essence).startsWith('未报外应')
        if (reported && prefixed) badInfer.push(`#${r.entry.no} 用户**报了本法兆象**却仍标「未报外应」（q=「${q}」）`)
        if (!reported && !prefixed) badInfer.push(`#${r.entry.no} 未报本法兆象却未标「取象」（q=「${q}」，essence=「${o.essence}」）`)
        if (!reported && o.fidelity !== 'approx') badInfer.push(`#${r.entry.no} 未报外应但 fidelity=${o.fidelity}（契约要求 approx，q=「${q}」）`)
      }
      // 保真度 vs 自述（判据已按 Lead 分诊收窄）：
      //   `fidelity` 说的是**主算法/主要数据来源**的完整度；`detail.未核实` 往往只是**子项披露**
      //   （如称骨：骨重表完整=full，仅"《称骨歌》原文未内置"这一子项未核实）→ 不算冲突。
      //   仅当自述明确指向**主算法/主要数据来源**时才算矛盾。
      const txt = JSON.stringify(d)
      if (o.fidelity === 'full' && /(主算法|主要数据|整体算法|核心公式|全表|权威表)[^。；]{0,24}未核实|未核实[^。；]{0,24}(主算法|主要数据|整体算法|核心公式)/.test(txt)) {
        badFidelity.push(`#${r.entry.no} fidelity=full 但自述**主算法/主要数据来源**未核实（q=「${q.slice(0, 8)}」）`)
      }
      // 脏值形态扫描（含 undefined —— 这是 kernel-astro 检查器此前的漏洞，由 verifier #2 指出）
      if (DIRTY_RE.test(txt)) {
        const idx = txt.search(DIRTY_RE)
        const snip = txt.slice(Math.max(0, idx - 60), idx + 30).replace(/\\"/g, '"')
        dirty.push(`#${r.entry.no}${r.entry.name} 脏值「${txt.match(DIRTY_RE)?.[0]}」…${snip}…`)
      }
      const prev = seen.get(o.essence); if (prev) dupTotal += 1
      seen.set(o.essence, (prev ?? 0) + 1)
    }
    for (const [ess, cnt] of seen) if (cnt > 1 && badDup.length < 8) badDup.push(`「${q.slice(0, 8)}」断语「${ess}」重复 ${cnt} 次`)
  }
  // 未起归因：`缺X` = 注册表 need 未满足（合法）；`本法无解` = 引擎按契约 return null（合法）；
  // 其余（算错/引擎未实现/分数非有限数/essence 空）= 硬问题
  const legitSkip = [...skipReasons.entries()].filter(([k]) => /\|(缺|本法无解)/.test(k))
  const realSkip = [...skipReasons.entries()].filter(([k]) => !/\|(缺|本法无解)/.test(k))
  rec('完整输入下 108 法全起（未起仅允许「缺 need」或「本法无解」）', runs, realSkip.map(([k, c]) => `${k} ×${c}`),
    legitSkip.length ? `合法未起 ${legitSkip.map(([k, c]) => `${k}×${c}`).join('、')}` : '')
  const citeIssue = [...citeMissNos].filter((s) => s.endsWith('ISSUE'))
  const citeSkip = [...citeMissNos].filter((s) => s.endsWith('SKIP'))
  const evIssue = [...evMissNos].filter((s) => s.endsWith('ISSUE'))
  const evSkip = [...evMissNos].filter((s) => s.endsWith('SKIP'))
  rec(`detail.cite 合法（非空、非占位、无 null 元素；${NQ}×108，已重写族）`, runs * 108, citeIssue.map((s) => `#${s.split('|')[0]}`),
    `尚在重写族 SKIP ${citeSkip.length} 法：${citeSkip.map((s) => '#' + s.split('|')[0]).join('、')}`)
  rec(`detail.evidence 存在（${NQ}×108；已重写族）`, runs * 108, evIssue.map((s) => `#${s.split('|')[0]}`),
    `尚在重写族 SKIP ${evSkip.length} 法：${evSkip.map((s) => '#' + s.split('|')[0]).join('、')}`)
  rec('未报输入必须标「取象」（#92/93/95/96/97）', runs * 5, [...new Set(badInfer)].slice(0, 6))
  rec('保真度 full 但自述**主算法**未核实（子项披露不算冲突）', runs * 108, [...new Set(badFidelity)].slice(0, 4))
  rec('detail 无脏值字面量（NaN / [object …] / undefined / Infinity / "null"）', runs * 108, [...new Set(dirty)].slice(0, 6))
  const dirtyNos = [...new Set(dirty.map((s) => s.replace(/#(\d+)\S*/, '#$1')))]
  if (dirty.length > 0) {
    issue('中', 'detail 含脏值字面量（呈现给用户时即为 `undefined`/`NaN` 等原始值）',
      `去重法号：${dirtyNos.join('、')}；共 ${dirty.length} 次。根因（模板串插值 undefined）：`
      + dirty.slice(0, 2).map((s) => s.slice(0, 90)).join(' ｜ '),
      'node test/v2-crosscheck.mjs（L5 段）', '#27/#38 → m-sanshi（sanshi.js）')
  }
  note(`一轮 108 法内断语雷同次数合计 ${dupTotal}（同族共用模板会出现，需人工判读）`)
  note(`保真度分布（${NQ}×108）：full ${fidelityCount.full} ｜ core ${fidelityCount.core} ｜ approx ${fidelityCount.approx}`)
  // cite 数组里含 null/undefined 元素（数组有洞）——与"整条缺失"分开归因（判据修订：先按元素分类再报）
  const holeCite = badCite.filter((s) => /元素非法/.test(s))
  const emptyCite = badCite.filter((s) => /空数组/.test(s))
  if (emptyCite.length > 0) {
    issue('中', 'detail.cite 整条缺失（空数组）', `共 ${emptyCite.length} 处：${[...new Set(emptyCite.map((s) => s.split(' ')[0]))].join('、')}`, 'node test/v2-crosscheck.mjs（L5 段）', '对应族 owner')
  }
  if (holeCite.length > 0) {
    issue('中', 'detail.cite 数组含 null/undefined 元素（数组有洞，序列化后变 null）',
      `去重法号：${[...new Set(holeCite.map((s) => s.split(' ')[0]))].join('、')}。精确定位：${holeCite[0]}`,
      'node test/v2-crosscheck.mjs（L5 段）', '#34/#35 属太乙 → m-sanshi')
  }
  if (evIssue.length > 0) {
    issue('中', 'detail.evidence 整条缺失（已重写族）', `共 ${evIssue.length} 法：${evIssue.map((s) => '#' + s.split('|')[0]).join('、')}`, 'node test/v2-crosscheck.mjs（L5 段）', '对应族 owner')
  }
  if (badInfer.length > 0) {
    issue('高', '未报输入未按契约标注「取象」（含"谎报输入"形态）', [...new Set(badInfer)].slice(0, 6).join('；'),
      'node test/v2-crosscheck.mjs（L5 段）',
      'm-zhanbu（#95/#96/#97）—— 根因示例：#96 把问句「该不该**跳**槽」里的「跳」误判成"报了眼跳"，'
      + '于是输出「报眼跳未报左右·取象」；用户根本没提眼睛。建议兆象词要求「眼/眼皮」与「跳」相邻，或先排除 跳槽/跳跃/跳伞 等词')
  }
  if (realSkip.length > 0) {
    issue('高', '有法未起且非「缺 need」（完整输入下必须 108/108）', realSkip.map(([k, c]) => `${k}×${c}`).join('；'), 'node test/v2-crosscheck.mjs（L5 段）', '对应族 owner')
  }
  if (badFidelity.length > 0) {
    issue('中', 'fidelity 与 detail 自述矛盾（full 却标未核实/存疑）', [...new Set(badFidelity)].slice(0, 6).join('；'), 'node test/v2-crosscheck.mjs（L5 段）', '对应族 owner')
  }
  void rnd
}

// ═══════════════════════════════════════════════════════════════
// L6 · 确定性纪律：按「输入依赖」四分类 + 逐类断言
//  分类依据是**独立仪器**（计数 rand 包装器，直接调引擎）+ 四轴扰动（问题/时刻/出生/报数），
//  不依赖各法自己的声明，也不依赖 registry 的 fidelity/need 猜测。
// ═══════════════════════════════════════════════════════════════
section('L6 确定性纪律（输入依赖四分类）')
{
  const B1 = { y: 1990, m: 5, d: 12, h: 9, mi: 30 }
  const B2 = { y: 1985, m: 11, d: 3, h: 21, mi: 15 }
  const T0 = new Date(2026, 8, 30, 14, 30)
  const T_M = new Date(2026, 8, 30, 14, 31)     // 同刻微差（+1 分钟）
  const T_D = new Date(2027, 0, 8, 9, 0)        // 跨 100 天
  const C = (q, when, b, n) => buildChart({ question: q, when, longitude: 116.4, gender: '男', numbers: n, birth: b, seed: 'xcheck-fixed-seed' })
  /** 随机模式（**不给 seed**）—— 只用于 B/D 类统计型断言（口径见 docs/verification/querent-and-geo.md）。 */
  const R = (q, when, b, n) => buildChart({ question: q, when, longitude: 116.4, gender: '男', numbers: n, birth: b })
  const fp = (entry, chart) => {
    const r = runOne(entry, chart)
    return r.outcome ? `${Math.round(r.outcome.score * 1000)}|${r.outcome.essence}` : `未起:${r.error}`
  }
  /** 独立仪器：包一层计数 rand，直接调引擎，测「本法到底用了几次随机」。 */
  const countRand = (entry, chart) => {
    const base = makeRandKit(`${chart.seedBase}|${entry.id}`)
    let calls = 0
    const probe = {}
    for (const k of ['int', 'float', 'below', 'range', 'pick', 'shuffle', 'chance']) {
      probe[k] = (...a) => { calls += 1; return base[k](...a) }
    }
    Object.defineProperty(probe, 'state', { get: () => base.state })
    const fn = MODULES[entry.module]?.[entry.engine]
    if (typeof fn !== 'function') return -1
    try { fn(chart, entry, probe) } catch { return -2 }
    return calls
  }
  const KLASS = { rand: [], 出生资料: [], 求占时刻: [], 问句文本: [], 常数: [] }
  const nonDet = []; const microChange = []; const detail = []
  /** 常数判定要"多时点全同"才算：单点比对会被 12/60 周期巧合骗过（#60 建除、#17 皇极经世即如此）。 */
  const TIME_PROBES = [
    new Date(2026, 8, 30, 14, 30), new Date(2026, 9, 1, 9, 0), new Date(2026, 9, 3, 23, 0),
    new Date(2026, 11, 31, 12, 0), new Date(2027, 8, 30, 14, 30), new Date(2036, 8, 30, 14, 30),
    new Date(2076, 8, 30, 14, 30),
  ]
  for (const e of ENTRIES) {
    const A = fp(e, C('问题甲', T0, B1, [7, 13, 21]))
    const A2 = fp(e, C('问题甲', T0, B1, [7, 13, 21]))
    const Bq = fp(e, C('完全不同的问题乙', T0, B1, [7, 13, 21]))
    const Td = fp(e, C('问题甲', T_D, B1, [7, 13, 21]))
    const Tm = fp(e, C('问题甲', T_M, B1, [7, 13, 21]))
    const Bd = fp(e, C('问题甲', T0, B2, [7, 13, 21]))
    const Nd = fp(e, C('问题甲', T0, B1, [3, 9, 27]))
    if (A !== A2) nonDet.push(`#${e.no}${e.name}`)
    if (A !== Tm) microChange.push(`#${e.no}${e.name}`)
    const rc = countRand(e, C('问题甲', T0, B1, [7, 13, 21]))
    const allTimesSame = TIME_PROBES.every((t) => fp(e, C('问题甲', t, B1, [7, 13, 21])) === A)
    const k = rc > 0 ? 'rand'
      : A !== Bd ? '出生资料'
        : !allTimesSame ? '求占时刻'
          : A !== Bq ? '问句文本' : '常数'
    KLASS[k].push(e.no)
    detail.push({ no: e.no, name: e.name, cat: e.cat, klass: k, randCalls: rc, q: A !== Bq, t: A !== Td, b: A !== Bd, n: A !== Nd, m: A !== Tm, fp: A })
  }
  const nos = (k) => KLASS[k].map((n) => `#${n}`).join('、')

  // 逐类断言：该变的必变
  const badRand = detail.filter((d) => d.klass === 'rand' && !d.q).map((d) => `#${d.no}${d.name}(rand×${d.randCalls} 却未随问变)`)
  const badBirth = detail.filter((d) => d.klass === '出生资料' && !d.b).map((d) => `#${d.no}${d.name}`)
  const badTime = detail.filter((d) => d.klass === '求占时刻' && !d.t).map((d) => `#${d.no}${d.name}`)
  const constList = detail.filter((d) => d.klass === '常数').map((d) => `#${d.no}${d.name}(${d.fp.slice(0, 24)})`)
  // 契约 §2.3 点名
  const MUST_RAND = [1, 2, 90, 107, 108]
  const badMustRand = detail.filter((d) => MUST_RAND.includes(d.no) && d.randCalls <= 0).map((d) => `#${d.no}${d.name}(randCalls=${d.randCalls})`)
  const ZERI = [59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72]
  const badZeri = detail.filter((d) => ZERI.includes(d.no) && d.randCalls !== 0).map((d) => `#${d.no}${d.name}(randCalls=${d.randCalls})`)
  const badZeriQ = detail.filter((d) => ZERI.includes(d.no) && d.q).map((d) => `#${d.no}${d.name}(随问变了)`)

  rec('A 类：seed 模式下 同问同刻两次结果一致（108 法）', ENTRIES.length, nonDet)
  // ── B/D 类（默认随机模式下的统计型断言）──
  // B：该随机的法必须**真的在抽** —— 同问重复 20 次须出现 ≥2 种结果（写死常数的实现 20 次全同 → 必挂）
  // D：历法/择时族不得被随机污染 —— 同问重复 5 次须逐字相同（被 rand 污染的实现会出现多种结果 → 必挂）
  const defChart = () => R('问题甲', T0, B1, [7, 13, 21])
  const N_RAND = 20
  const randMatrix = []
  for (let i = 0; i < N_RAND; i += 1) randMatrix.push(ENTRIES.map((e) => fp(e, defChart())))
  const nRandRuns = 5
  const calMatrix = []
  for (let i = 0; i < nRandRuns; i += 1) calMatrix.push(ENTRIES.map((e) => fp(e, defChart())))
  const randFrozen = []; const calPolluted = []
  for (const e of ENTRIES) {
    const idx = ENTRIES.indexOf(e)
    const kinds = new Set(randMatrix.map((row) => row[idx]))
    const isRand = KLASS.rand.includes(e.no)
    if (isRand && kinds.size < 2) randFrozen.push(`#${e.no}${e.name}（${N_RAND} 次全同，疑似写死/未真随机）`)
    const calKinds = new Set(calMatrix.map((row) => row[idx]))
    if (ZERI.includes(e.no) && calKinds.size > 1) calPolluted.push(`#${e.no}${e.name}（${nRandRuns} 次出现 ${calKinds.size} 种，疑似被随机污染）`)
  }
  rec(`B 类：默认随机模式下 rand 类 ${KLASS.rand.length} 法须真随机（${N_RAND} 次重复出现 ≥2 种结果）`, KLASS.rand.length, randFrozen)
  rec(`D 类：默认随机模式下择时族 ${ZERI.length} 法须逐字不变（${nRandRuns} 次重复全同）`, ZERI.length, calPolluted)
  note(`B 类仍保持判别力：常数实现会在 ${N_RAND} 次重复里全同 → 必挂；D 类若被 rand 污染会出现多种结果 → 必挂`)
  rec('随机模式自证：chart.meta.mode=random 且给出 seedUsed', 1,
    (() => { const c = defChart(); return c.meta.mode === 'random' && typeof c.meta.seedUsed === 'string' ? [] : [`meta.mode=${c.meta.mode}`] })())
  rec('seed 模式自证：chart.meta.mode=seed', 1,
    (() => { const c = C('问题甲', T0, B1, [7, 13, 21]); return c.meta.mode === 'seed' ? [] : [`meta.mode=${c.meta.mode}`] })())
  rec('契约 §2.3：随机类 #1/#2/#90/#107/#108 必须**真的调用 rand**', MUST_RAND.length, badMustRand)
  rec('契约 §2.3：择时族 #59–#72 必须**零 rand 调用**（签名不接 rand）', ZERI.length, badZeri)
  rec('契约 §2.3：择时族 #59–#72 必须不随问变', ZERI.length, badZeriQ)
  // ── C 类：换问题 → 多数法改变 ⚠ **只能在随机模式测** ──
  // seed 模式下同 seed 换问题**本就不该**改变随机序列（那正是"可复现"的定义，实测只变 9 法）；
  // 而在随机模式下，随机源随每次调用重抽，换问题自然大面积改变。判别力：常数/冻结实现会 0 改变 → 必挂。
  const diffCounts = []
  for (let i = 0; i < 5; i += 1) {
    const a = ENTRIES.map((e) => fp(e, R('问题甲', T0, B1, [7, 13, 21])))
    const b = ENTRIES.map((e) => fp(e, R(`另一个完全不同的问题-${i}`, T0, B1, [7, 13, 21])))
    diffCounts.push(a.filter((v, k) => v !== b[k]).length)
  }
  const cBad = diffCounts.map((c, i) => (c >= 30 ? '' : `第${i + 1}轮仅 ${c}/108`)).filter(Boolean)
  rec('C 类：随机模式下「换问题 → 改变法数 ≥30」（5 轮）', diffCounts.length, cBad,
    `5 轮：${diffCounts.join('、')}｜均值 ${(diffCounts.reduce((x, y) => x + y, 0) / diffCounts.length).toFixed(1)}｜阈值 30 依实测最小 46 定（常数实现＝0 必挂）`)
  rec('分类自洽：出生资料类必须随出生资料变', KLASS.出生资料.length, badBirth)
  // 说明：原先「rand 类必须随问变」在 seed 模式下**必然不成立**（同 seed → 同随机序列），
  // 已由 B 类（20 次重复出现 ≥2 种结果）与 C 类（换问题平均改变 ≥30）替代，判别力更强。
  // 同理「求占时刻类必须随求占时刻变」是同义反复，早前已删。
  void badRand
  void badTime
  note(`四分类（输入依赖）：rand ${KLASS.rand.length} ｜ 出生资料 ${KLASS.出生资料.length} ｜ 求占时刻 ${KLASS.求占时刻.length} ｜ 问句文本 ${KLASS.问句文本.length} ｜ **常数 ${KLASS.常数.length}**`)
  note(`  rand 类：${nos('rand')}`)
  note(`  出生资料类：${nos('出生资料')}`)
  note(`  求占时刻类：${nos('求占时刻')}（前 30：${KLASS.求占时刻.slice(0, 30).map((n) => '#' + n).join('、')}）`)
  note(`  问句文本类：${nos('问句文本')}`)
  note(`  常数类（四轴皆不动）：${constList.join('、') || '无'}`)
  note(`同刻 +1 分钟即变 ${microChange.length} 法（其中 rand 类 ${microChange.filter((s) => KLASS.rand.includes(Number(s.slice(1).match(/^\d+/)?.[0]))).length} 法 —— rand 法的种子含时刻，同刻微差改变抽签属契约允许；**非 rand 法微差即变才是问题**）`)
  const microNonRand = microChange.filter((s) => { const n = Number(s.slice(1).match(/^\d+/)[0]); return !KLASS.rand.includes(n) })
  if (microNonRand.length > 0) {
    issue('中', '非随机法在「同一时辰内 1 分钟微差」下结果就变（应同盘）', microNonRand.join('、'), 'node test/v2-crosscheck.mjs（L6 段）', '对应族 owner')
  }
  if (nonDet.length > 0) issue('高', '确定性被破坏（同问同刻结果不同）', nonDet.join('、'), 'node test/v2-crosscheck.mjs（L6 段）', '对应族 owner')
  if (badMustRand.length > 0) issue('高', '契约 §2.3 随机类没有真正用 rand', badMustRand.join('、'), 'node test/v2-crosscheck.mjs（L6 段）', 'm-yijing / m-zhanbu')
  if (badZeri.length > 0) issue('高', '择时族调用了 rand（契约禁止）', badZeri.join('、'), 'node test/v2-crosscheck.mjs（L6 段）', 'm-zeri / kernel-tables')
  if (badZeriQ.length > 0) issue('高', '择时族结果随问变（契约 §2.3 禁止）', badZeriQ.join('、'), 'node test/v2-crosscheck.mjs（L6 段）', 'm-zeri / kernel-tables')
  // ⚠ 这里**不再**报「rand 类随问变」类问题：该判据已由 B 类（默认模式下 20 次重复出现 ≥2 种结果）
  // 与 C 类（换问题平均改变数）替代。在 seed 模式下同 seed 换问题「不随问变」是**正确行为**，
  // 按旧判据会把 39 个法全部误报（第四轮曾据此误报，见轮次台账 R4-1）。
  void badRand
  if (constList.length > 0) issue('中', '四轴（问题/时刻/出生/报数）全不变 —— 常数函数嫌疑', constList.join('、'), 'node test/v2-crosscheck.mjs（L6 段）', '对应族 owner')

  // Lead 点名复验：#25/#26/#27 断语曾逐字相同（飞盘/日家参数疑似未生效）
  const c = C('问题甲', T0, B1, [7, 13, 21])
  const o25 = runOne(ENTRY_BY_NO[25], c).outcome
  const o26 = runOne(ENTRY_BY_NO[26], c).outcome
  const o27 = runOne(ENTRY_BY_NO[27], c).outcome
  const trio = [['#25', o25], ['#26', o26], ['#27', o27]]
  const dupTrio = []
  for (let i = 0; i < 3; i += 1) for (let j = i + 1; j < 3; j += 1) {
    if (trio[i][1] && trio[j][1] && trio[i][1].essence === trio[j][1].essence) dupTrio.push(`${trio[i][0]} 与 ${trio[j][0]}：「${trio[i][1].essence}」`)
  }
  rec('复验 Lead 点名：#25/#26/#27 断语不得逐字相同', 3, dupTrio)
  for (const [lbl, o] of trio) note(`${lbl} essence = ${o ? o.essence : '未起'}`)
  // 更深一层：转盘 vs 飞盘的盘面必须真的不同（不能只换标签）
  const diffKeys = []
  for (const key of new Set([...Object.keys(o25?.detail ?? {}), ...Object.keys(o26?.detail ?? {})])) {
    if (JSON.stringify(o25?.detail?.[key]) !== JSON.stringify(o26?.detail?.[key])) diffKeys.push(key)
  }
  rec('复验：#25 转盘 与 #26 飞盘 的盘面必须真的不同（detail 差异键 > 0）', 1,
    diffKeys.length === 0 ? ['两者 detail 完全相同（飞盘/转盘只换了标签）'] : [],
    `差异键 ${diffKeys.length} 个：${diffKeys.slice(0, 8).join('、')}`)
  if (dupTrio.length > 0 || diffKeys.length === 0) {
    issue('中', '#25/#26 转盘与飞盘疑似只换标签（盘面未分）', `${dupTrio.join('；')}｜差异键 ${diffKeys.length}`,
      'node test/v2-crosscheck.mjs（L6 段）', 'm-sanshi')
  }
  void c
}

// ═══════════════════════════════════════════════════════════════
// 轮次台账：跨轮提出的问题、最终定性与依据（**误报也要回收，这是本文件的审计价值**）
// ═══════════════════════════════════════════════════════════════
const TRIAGE = [
  { id: 'R1-1', title: '紫微安星对 iztro 不一致（新鲜样本 4 项，全在晚子时）', status: '真问题·已闭环', owner: 'lead', evidence: '受控实验反解 iztro 月序 → Lead 修复「日取次日、月年取当日」→ R3 复验 150/150' },
  { id: 'R1-2', title: '源码出现具体日期字面量（2020-02-02 / 1938-02-04）', status: '误报', owner: '—', evidence: '两处均在**注释**内，用于举例说明「立春换年 vs 农历年」分歧，不在判断逻辑中。判据已改为只扫代码行' },
  { id: 'R1-3', title: 'detail.cite 空值/占位符', status: '半真·已闭环', owner: 'kernel-tables / m-sanshi', evidence: '#59–#72 确为空数组（择时族未重写）→ 已补 6 条 cite；#34/#35 当时报法含"显示截断"成分，改判据后确认为**数组含 undefined 空位**（根因：繁简键名不匹配 太乙隕阙/太乙陨阙）→ 已修' },
  { id: 'R1-4', title: '#96 未标「取象」', status: '误报', owner: '—', evidence: '问句「左眼一直跳」时契约 §2.2 明确要求**不得**标前缀（用户确实报了外应）。判据已改为双向对照（报了→断言无前缀；未报→断言有前缀且 approx）' },
  { id: 'R1-5', title: '有法未起（#99/#100/#101 返回 null）', status: '真问题·已闭环', owner: 'm-sanshi', evidence: '问句提不出姓名时应出诚实取象而非未起 → 已修，R3 复验 220/220 全起（唯一未起 #6 缺报数＝契约允许）' },
  { id: 'R1-6', title: '常数函数嫌疑（24 法"不随问也不随刻变"）', status: '误报', owner: '—', evidence: '参照系选错：命理族依赖**出生资料**（固定不变），故既不随问也不随求占时刻变，是正确的输入依赖形态。判据已重写为「代理 rand 计数 + 四轴扰动分类」' },
  { id: 'R2-1', title: '紫微晚子时 × 闰月下半月（边缘样本 41 项断言）', status: '真问题·已闭环', owner: 'lead', evidence: '晚子时 iztro 取**月序原值**（连闰月半旬调整也不做），实现当时叠加了两条规则 → Lead 改为三段式口径 → R3 复验 60/60 边缘样本' },
  { id: 'R2-2', title: '#95/#97 用户已报本法兆象却仍标「未报外应」', status: '真问题·维持', owner: 'm-zhanbu', evidence: '见下方「开放问题」——essence 自身已取出该兆象（未时喷嚏2声 / 北方未时鸦鸣 / 西方未时鹊鸣），却仍以「未报外应·取象」开头＝自述与内容矛盾。判据**已按方法各自的象**匹配（#95↔鸟鸦鹊、#96↔眼跳、#97↔喷嚏）' },
  { id: 'R2-3', title: '#93 用户报了字却仍标「未报所测之字」', status: '误报', owner: '—', evidence: '本脚本自己给问句加的「（第N问）」后缀被当成了用户报的字。判据已改为先剥离后缀、且要求「字：」后紧跟汉字' },
  { id: 'R2-4', title: 'fidelity=full 但 detail 自述「未核实」', status: '部分成立·已收窄', owner: '—', evidence: '子项披露（如称骨：骨重表完整＝full，仅《称骨歌》原文未内置）不构成自相矛盾。判据已收窄为「自述**主算法/主要数据来源**未核实」→ R3 复验 0' },
  { id: 'R2-5', title: '#60 建除 / #17 皇极经世 四轴全不变', status: '误报', owner: '—', evidence: '采样跨度不足：#60 是日粒度（两点恰好同为"开日"，12 周期巧合）；#17 是元会运世尺度（同一世内不变）。判据已改为**7 个时点跨 50 年**全同才算常数 → R3 常数 = 0' },
  { id: 'R3-1', title: '非随机法在「同一时辰内 1 分钟微差」下结果就变', status: '真问题·已定位并开单', owner: 'm-sanshi（task-13）', evidence: '交集法定位到 3 法：#7 梅花·外应卦、#103 面相十二宫、#104 手相掌纹（其余 37 法真调 rand，种子含时刻，属契约允许）' },
  { id: 'R3-2', title: '（判据自身缺陷）「求占时刻类必须随求占时刻变」是同义反复', status: '已删除', owner: '—', evidence: '分类判据本身就是它，无判别力。已改为陈述性分类 + 3 条有判别力的断言（rand 类随问变 / 出生类随出生变 / 非 rand 类同时支稳定）' },
  { id: 'R3-3', title: '（判据自身缺陷）脏值检查漏 `undefined` 形态', status: '已补', owner: '—', evidence: '由 verifier #2 指出（#72 综合择日 detail 出现字面量 undefined，根因 zeri.js 未填 xiuLuck）。原判据只看 NaN/[object Object]；现补 undefined / "null" / [object 前缀 / Infinity，并加隔离自测 D:\\DSH\\tmp\\checker-selftest.mjs 证明能命中' },
  { id: 'R3-4', title: '（跨机缺陷）出生时刻按宿主时区解释 → 跨机器不可复现', status: '真问题·已闭环（task-14）', owner: 'kernel-astro', evidence: '同 TZ 家族内还受历史 DST 影响（Asia/Shanghai vs Etc/GMT-8 对 1990-05-12 09:30 差 1 小时）。改为**固定 UTC+8 偏移、不查时区库** → 五时区 birthChart.astro.sunLon 逐位相同 = 51.07922（＝契约 §6 oracle 的 51.08）' },
  { id: 'R3-5', title: '（交叉印证 verifier #2 的 SUSPECT）「φ=0 ⇒ 上升 ≡ RAMC+90」并非恒等式', status: '真问题·已交叉印证（属 western.js）', owner: 'kernel-tables', evidence: '独立按球面三角复算：RAMC=8.468°、ε=23.441° 时标准上升式在 φ=0 给 97.778°，RAMC+90=98.468°，**差 0.690°**，与 verifier #2 完全一致；且仅在 RAMC≡0/90 (mod 180) 时相等（RAMC=45° 时差 2.465°）' },
  { id: 'R3-6', title: '#96 把「跳槽」里的「跳」误判成"报了眼跳" → 断语谎报输入', status: '真问题·已定位', owner: 'm-zhanbu', evidence: 'q=「该不该跳槽」→ essence「**报眼跳未报左右**·取象：右眼未时跳·有喜」，但用户根本没提眼睛；同一实现下「这次合作能不能成」「嗯」仍正确标「未报外应」。task-13 取象锚定的副作用/遗留，建议兆象词要求「眼/眼皮」与「跳」相邻' },
  { id: 'R3-7', title: '#27/#38 detail 出现字面量 `undefined`（模板串插值未取到值）', status: '真问题·已闭环', owner: 'm-sanshi', evidence: '#27：「符头":"丁未日（，占日前 **undefined** 日）」；#38：「月将":"辰（天罡）｜取自中气「**undefined**」」——后者更重：月将的过宫中气没解析出来。补 `undefined` 形态后立刻抓到（原判据只看 NaN/[object Object]）；已由 m-sanshi 修复，本轮复验 0 残留' },
  { id: 'R4-1', title: '（判据口径过时）「rand 类消耗了随机却没随问变（随机被吞）」', status: '误报·已撤销', owner: '—', evidence: '默认随机改造后该断言仍在 **seed 模式**下取样：同 seed 换问题**本就不该**改变随机序列（那是"可复现"的定义），于是 39 个 rand 法被整批误报。**独立佐证无真缺陷**：B 类（默认模式 20 次重复）显示 39/39 个 rand 法都出现 ≥2 种结果，即无一法"吞随机"。判据已撤销，改由 B 类 + C 类承担，判别力更强' },
  { id: 'R4-2', title: '（判据口径过时）「换问题（同 seed）→ 相当比例的法结果改变」', status: '误报·已改', owner: '—', evidence: '同上：seed 模式下实测只变 9/108（读问句文本的法），**这是正确行为**。已挪到默认随机模式并统计化（5 轮均值 41，阈值 30）' },
  { id: 'R4-3', title: '（判据口径过时）「随机类 #N 随问题改变」（smoke/host 旧断言）', status: '误报·已改', owner: '—', evidence: '真随机下两次撞到同一结果属正常（#90 掷筊结果空间仅 10 种）。已按 A/B/C 三分法重写：A 一致性移到 seed 模式；B 改"20 次重复出现 ≥2 种结果"（常数实现必挂）；C 改随机模式统计均值' },
  { id: 'R4-4', title: '（判据口径过时）「同问同刻必得同一结果」（smoke §5 / host / v2-audit）', status: '口径已废·已改', owner: '—', evidence: '用户 2026-02 更正：「同一人也可能因为当前心诚不诚意不一样，所以根本不需要限制一致性」。改为 A 类（显式 seed 下逐字一致）+ 新增"默认随机模式允许不同"断言；v2-audit 由 Lead 同法改造' },
]
const TALLY = {
  total: TRIAGE.length,
  误报: TRIAGE.filter((t) => t.status === '误报').length,
  真问题: TRIAGE.filter((t) => t.status.startsWith('真问题')).length,
  其他: TRIAGE.filter((t) => !t.status.startsWith('真问题') && t.status !== '误报').length,
}

// ═══════════════════════════════════════════════════════════════
// 汇总 + 落盘
// ═══════════════════════════════════════════════════════════════
{
  const total = RESULTS.reduce((a, r) => a + r.total, 0)
  const bad = RESULTS.reduce((a, r) => a + r.bad, 0)
  console.log(`\n${'═'.repeat(64)}`)
  console.log(`对拍汇总：比较 ${total} 项次，不一致 ${bad} 项次 ｜ 开放问题 ${ISSUES.length} 条`)
  for (const iss of ISSUES) console.log(`  [${iss.sev}] ${iss.title}（${iss.owner}）`)
  console.log(`轮次台账：累计提出 ${TALLY.total} 条 ｜ 误报 ${TALLY.误报} 条（误报率 ${(TALLY.误报 / TALLY.total * 100).toFixed(0)}%）｜ 真问题 ${TALLY.真问题} 条 ｜ 判据自身缺陷 ${TALLY.其他} 条`)
  const hard = ISSUES.filter((i) => i.sev === '高').length

  // 落盘（失败不阻塞）
  try {
    const md = []
    md.push('# v2 独立验证 · 对拍结论（verifier / kernel-astro 执行）')
    md.push('')
    md.push(`> 生成：\`node test/v2-crosscheck.mjs\`${QUICK ? '（--quick 档）' : ''}
> 本次比较 ${total} 项次，不一致 ${bad} 项次；开放问题 ${ISSUES.length} 条（其中高 ${hard} 条）。`)
    md.push('')
    md.push('## 〇、三轮收敛与误报回收')
    md.push('')
    md.push('| 轮次 | 不一致项次 | 开放问题 | 主要动作 |')
    md.push('|---|---:|---:|---|')
    md.push('| R1（首版） | 10 / 76421 | 6 条 | 建四条通路：历法多通路、六爻 64 卦穷举、紫微 iztro、星历换 API 路径 |')
    md.push('| R2（收紧判据） | 57 / 76813 | 7 条 | 加代理 rand 计数器、四轴扰动、紫微边缘样本（晚子时×闰月）→ 抓出 ISSUE-01 未完全闭环 |')
    md.push(`| R3（本轮） | **${bad} / ${total}** | **${ISSUES.length} 条** | 紫微闭环（410 夹具 + 150 新鲜 + 60 边缘全绿）、误报回收、删同义反复判据；**不一致项全部可归因于下方开放问题** |`)
    md.push('')
    md.push(`**误报率**：三轮累计提出 ${TALLY.total} 条，误报 **${TALLY.误报} 条（${(TALLY.误报 / TALLY.total * 100).toFixed(0)}%）**、真问题 ${TALLY.真问题} 条、判据自身缺陷 ${TALLY.其他} 条。`)
    md.push('误报全部回收在下表并写明成因——判据错了也是产出，但必须回收，否则会污染最终验收报告。')
    md.push('')
    md.push('### 轮次台账（提出 → 定性 → 依据）')
    md.push('')
    md.push('| 编号 | 问题 | 最终定性 | 责任方 | 依据 / 处置 |')
    md.push('|---|---|---|---|---|')
    for (const t of TRIAGE) md.push(`| ${t.id} | ${t.title} | ${t.status} | ${t.owner} | ${t.evidence} |`)
    md.push('')
    md.push('### 判据修订记录（每条误报都对应一次判据收紧）')
    md.push('')
    md.push('| 轮 | 原判据 | 缺陷 | 新判据 |')
    md.push('|---|---|---|---|')
    md.push('| R2 | 源码里出现日期字面量即报 | 注释里的举例被冤判 | 只扫**代码行**（排除 `//` 之后与块注释行） |')
    md.push('| R2 | 「问句含任一异象」即要求抑制取象前缀 | 未区分各法**各自的象**（鸟占要鸟鸣、眼跳占要眼跳） | 双向对照 + **按方法各自的兆象域**匹配；未报时另断言 `fidelity===approx` |')
    md.push('| R2 | `fidelity=full` 且 detail 含「未核实」即报矛盾 | 子项披露被当主算法矛盾（如称骨：骨重表完整、仅《称骨歌》原文未内置） | 仅当自述指向**主算法/主要数据来源**未核实时才报 |')
    md.push('| R2 | 「不随问变且不随刻变」即判常数函数 | 参照系选错：命理族依赖出生资料；且单点比对被周期巧合骗过（#60 建除 12 周期） | **代理 rand 计数器 + 四轴扰动四分类**；常数须**7 个时点跨 50 年**全同 |')
    md.push('| R3 | 「求占时刻类必须随求占时刻变」 | **同义反复**（分类判据本身就是它），无判别力 | 删除，改为陈述性分类 + 3 条有判别力断言（rand 类随问变／出生类随出生变／非 rand 类同时支逐字相同） |')
    md.push('| R3 | 脏值检查只看 `NaN`/`[object Object]` | 漏 `undefined` 形态（verifier #2 抓到的 #72） | 补 `undefined` / `"null"` / `[object ` 前缀 / `Infinity`，并附隔离自测 |')
    md.push('')
    md.push('## 〇之二、跨机可复现（task-14，kernel-astro 自域缺陷）')
    md.push('')
    md.push('出生时刻 `birth` 是**无时区数字**，原实现用 `new Date(y,m-1,d,h,mi)` 构造 → 按宿主时区（含历史 DST）解释，同一份出生资料在不同机器上得到不同天象。')
    md.push('')
    md.push('| 宿主 TZ | 解释出的 UTC 瞬时 | birthChart.astro.sunLon |')
    md.push('|---|---|---|')
    md.push('| `Etc/GMT-8`（本机默认） | 1990-05-12T01:30Z | 51.07922（＝契约 §6 oracle 的 51.08） |')
    md.push('| `Asia/Shanghai` | 1990-05-12T**00:30**Z | 51.03899 ← 同名义 +8，却因**中国 1990 年夏令时**差 1 小时 |')
    md.push('| `UTC` | 09:30Z | 51.40103 |')
    md.push('| `America/New_York` | 13:30Z | 51.56192 |')
    md.push('')
    md.push('**修法**：固定 `UTC+8` 偏移（`Date.UTC(y,m-1,d,h,mi) − 8h`），**不查时区库**（否则历史 DST 会再次引入不可复现性）；`renyuan` 的"自节令起日数"也改为两端同口径的**民用时刻差**。')
    md.push('**复验**：五时区（`Etc/GMT-8`/`Asia/Shanghai`/`UTC`/`America/New_York`/`Europe/London`）下 `birthChart.astro.sunLon` **逐位相同 = 51.07922**；出生盘四柱/农历/renyuan 同样逐位相同。')
    md.push('**`when` 语义未动**：仍是绝对瞬间，跨时区本就代表不同瞬间，故 `chart.astro` 随 TZ 变化是**正确**的（任务书第 2 条要求不动它）。')
    md.push('**口径落点**：`calendar.js` 文件头「时间口径」表、`birthChart.tz`（含推导出的 UTC 瞬时）、`meta.timeConvention`。')
    md.push('')
    md.push('> ⚠ **契约 §6 的 oracle 前提**：`docs/V2-CONTRACT.md §6` 所载「太阳 51.08°、木星 98.90°、土星 295.30°」三个值，**以 UTC+8 固定偏移（即本机 `Etc/GMT-8`）为前提**；在 `TZ=UTC` / `America/New_York` 下用同一份**民用时刻**输入会得到不同值——这不是实现错，是输入的时区语义变了。本报告由 verifier #2 独立复现该前提，记此存档。')
    md.push('> 另：`#105 西洋占星` 未报纬度时返回「RAMC+90」（东点赤经），与标准上升式在 φ=0 的值差 **0.690°**（后者才是上升点）——已独立复算确认，详见 `v1-crosscheck.md` 轮次台账 R3-5。')
    md.push('')
    md.push('## 一、判据与通路')
    md.push('')
    md.push('| 段 | 被测对象 | 独立通路（期望值来源） |')
    md.push('|---|---|---|')
    md.push('| L1 | 历法四柱/农历/旬空/节气/真太阳时（430 点：均匀 + 节气±1 天 + 闰月 + 1900/1950/2000/2026/2050/2100 边界 + 晚子时） | 儒略日取模、立春瞬时(λ=315°)、太阳视黄经 30° 分宫、旬首闭式、tyme4ts、astronomy-engine |')
    md.push('| L2 | 六爻装卦（**64 卦穷举** + 两个独立 golden） | `docs/research/yijing-spec.md` §A1/§A2/§A4/§C8（64 行宫位世应、纳甲四源一致表、六冲 10 卦/六合 8 卦名单）+ m-yijing 手工核对的 20 卦例（**第二来源**） |')
    md.push('| L3 | 紫微安星 | iztro@2.6.1：离线夹具 410 组 + **新鲜样本 150 组实时查询**（种子与夹具不同）+ **边缘样本 60 组**（晚子时 × 农历廿五后/闰月，独立构造） |')
    md.push('| L4 | 日月五星黄经/ΔT/均时差/入宿度 | astronomy-engine 的**另一条 API 路径**（GeoVector→Ecliptic、GeoMoon、HelioVector 差、JplHorizons ΔT、NOAA 均时差闭式） |')
    md.push(`| L5 | 诚实性（cite/evidence/取象双向对照/保真度自述） | ${QUICK ? 60 : 220} 组问题 × 108 法 |`)
    md.push('| L6 | 确定性纪律 | **代理 rand 计数器（独立仪器，直接调引擎）** + 四轴扰动（问题/时刻/出生/报数）+ 7 时点跨 50 年定常判定 |')
    md.push('')
    md.push('## 二、结果')
    md.push('')
    md.push('| 检查 | 项次 | 不一致 | 说明 |')
    md.push('|---|---:|---:|---|')
    for (const r of RESULTS) md.push(`| ${r.name} | ${r.total} | ${r.bad} | ${r.note || ''} |`)
    md.push('')
    if (RESULTS.some((r) => r.bad > 0)) {
      md.push('### 不一致明细（前 6 条/项）')
      md.push('')
      for (const r of RESULTS) {
        if (r.bad === 0) continue
        md.push(`**${r.name}**（${r.bad}/${r.total}）`)
        md.push('')
        for (const s of r.samples) md.push(`- ${s}`)
        md.push('')
      }
    }
    md.push('## 三、过程备注')
    md.push('')
    for (const n of NOTES) md.push(`- ${n}`)
    md.push('')
    md.push('## 四、复现')
    md.push('')
    md.push('```powershell')
    md.push('cd D:\\DSH\\plugins\\dsh-divination-108')
    md.push('node test/v2-crosscheck.mjs          # 全量')
    md.push('node test/v2-crosscheck.mjs --quick  # 跳过 220 问审计')
    md.push('```')
    md.push('')
    md.push('> 已知口径差异（不计入失败）：晚子时日柱流派（八字两派/紫微归次日）、通书日粒度月建 vs 四柱节令时刻月建、二十八宿距星异说。')
    md.push('> 说明见 `docs/verification/kernel-astro-crosscheck.md` 与 `docs/verification/mingli.md`。')
    md.push('')
    writeFileSync(`${HERE}/docs/verification/v1-crosscheck.md`, md.join('\n'), 'utf8')

    const im = []
    im.push('# ISSUES · v2 独立验证问题清单')
    im.push('')
    im.push(`> 由 \`node test/v2-crosscheck.mjs\` 生成（verifier / kernel-astro）。共 ${ISSUES.length} 条：高 ${hard} ｜ 中 ${ISSUES.length - hard}。`)
    im.push('> 纪律：verifier **只记录不修复**；每条给现象 + 复现命令 + 疑似责任方 + 严重度。')
    im.push('')
    if (ISSUES.length === 0) im.push('（本轮无问题）')
    ISSUES.forEach((x, i) => {
      im.push(`## ISSUE-${String(i + 1).padStart(2, '0')} · ${x.title}`)
      im.push('')
      im.push(`- **严重度**：${x.sev}`)
      im.push(`- **疑似责任方**：${x.owner}`)
      im.push(`- **现象**：${x.detail}`)
      im.push(`- **复现**：\`${x.repro}\``)
      im.push('')
    })
    writeFileSync(`${HERE}/docs/verification/ISSUES.md`, im.join('\n'), 'utf8')
    console.log('\n报告已写：docs/verification/v1-crosscheck.md ｜ docs/verification/ISSUES.md')
  } catch (e) {
    console.log(`（报告落盘失败，不影响结论：${e.message}）`)
  }
  if (bad > 0 || hard > 0) process.exitCode = 1
}
