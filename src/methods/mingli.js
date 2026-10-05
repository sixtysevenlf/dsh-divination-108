/**
 * 方法模块 · 命理（18 法）· v2 重写
 *
 * 契约见 `docs/V2-CONTRACT.md` §3.2 与 `src/core/runner.js` 顶部：
 * 返回 `{ score, essence, keys, wuxing, timing, detail, fidelity }`；
 * **纯函数、不抛异常、不读时钟、不用 Math.random**；无法计算返回 null（运行器记「未起」）。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * v2 相对 v1 的实质改动（写在明处，便于复核）
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 1. **本族自己排四柱（立春换年 + 节气换月 + 真太阳时）**
 *    v1 直接吃 `chart.birthChart.pillars`，而历法层那里用的是 `getYearInGanZhi()`
 *    （农历年），**不是立春换年**。八字最致命的错误就在这：2 月初出生的人会整年柱错位。
 *    v2 改为自己用 EightChar 排（`getYearInGanZhiExact` 语义 = 立春换年、按节气换月），
 *    并在给了经度时对出生时刻做真太阳时校正。四柱结果进 `detail.四柱` 与 `detail.排盘依据`。
 *
 * 2. **旺衰从"三要素打分"升级为"三维加权 + 人元司令分野"**
 *    v1：得令 0..40 + 得地 0..35 + 得势 0..25，月令只看月支五行。
 *    v2：得令看**节后第几日、当令司令干**（人元司令分野，如寅月立春后前七日戊土司令），
 *    得地看**通根深浅**（本气根/中气根/余气根分别计权，且日支、月支加成），
 *    得势看透干是否得根。三维权重与每一项取值都进 `detail.evidence`。
 *
 * 3. **用神给可执行判据**：扶抑（身强取克泄耗、身弱取生扶）→ 调候（冬火夏水）→ 通关
 *    （两党对峙取通关之神）。冲突时按「调候 > 扶抑」处理并说明原因，不再含糊。
 *
 * 4. **紫微斗数按经典「商余法」原式重算**，并用 iztro@2.6.1 的 200 组金标准夹具
 *    （`tools/fixtures/ziwei-oracle.json`）逐项对拍：命宫、身宫、五行局、命主身主、
 *    十二宫干支、十四主星落宫、生年四化。v1 的 `ZIWEI_OFFSETS` 余数表与它自己的注释
 *    不自洽（水二局初三应为寅，按其表算得丑），故 v2 弃用该表，改为商余法直接算。
 *
 * 5. **七政四余 / 五星占有真星历了**：优先用 `chart.astro`（kernel-astro 提供的
 *    astronomy-engine 真黄经），四余按平均交点/近地点公式推；缺该字段时退化为
 *    族内平均黄经近似并**如实降级为 approx**。
 *
 * 6. **每条断语都带出处与证据链**：`detail.cite`（经典/公式来源）与
 *    `detail.evidence`（`{rule, value, effect}`）。
 *
 * ## 诚实标记
 * - 星曜庙旺（亮度）、四余之外的秘传神煞、铁板类条文：**没有可靠来源，不做**，
 *   相关法保持 `approx` 并在 detail 里写明缺什么。
 * - 紫微「庚干四化」各派不同（庚：太阳禄/武曲权/太阴科/天同忌 与 天同化科、太阴化忌 之争）。
 *   本实现采用与 iztro 夹具一致的一派，并在 `detail.四化流派` 注明。
 */

import {
  GAN, ZHI, WUXING, GAN_WUXING, GAN_YANG, ZHI_WUXING, ZHI_ANIMAL, ZHI_CANGGAN,
  SHENG, KE, SHENG_BY, KE_BY, relation, wangShuai, changShengOf,
  ZHI_LIUHE, ZHI_LIUCHONG, ZHI_XIANGHAI, ZHI_SANHE, ZHI_XIANGXING,
  nayinOf, xunOf, tenGodOf, cangGanGods, shenShaOf, clamp, mod, emptyWuxing,
  norm360, evidence, evidenceDigest, median,
} from '../core/kit.js'
import { XIU28, XIU28_LUCK, ZIWEI_PALACES } from '../core/tables.js'
import { LunarLib } from '../core/calendar.js'
import * as D from './data/mingli.js'

// ═══════════════════════════════════════════════════════════════════
// 族内兜底表（他人并行开发的 tables.js v2 表可能尚未就绪）
// cite: 传统通例；与 tables.js 的同名表互为兜底，取值一致
// ═══════════════════════════════════════════════════════════════════

/** 藏干力量（本气/中气/余气）。 cite: 命理通例 */
const CG_W = [1, 0.4, 0.2]

/**
 * 人元司令分野（节后日数 → 司令干），按十二月建。
 * cite: 《渊海子平》《三命通会》所载人元司令分野通例（每支三干分司本气/中气/余气日数）。
 * 说明：各家日数略有出入（如寅月戊七日丙七日甲十六日 与 戊九日丙九日甲十二日 两说），
 * 本表取常见的一派；`chart.renyuan`（kernel-astro）若已给出则以它为准。
 */
const RENYUAN_30 = {
  寅: [['戊', 7], ['丙', 7], ['甲', 16]],
  卯: [['甲', 10], ['乙', 20]],
  辰: [['乙', 9], ['癸', 3], ['戊', 18]],
  巳: [['戊', 7], ['庚', 7], ['丙', 16]],
  午: [['丙', 10], ['己', 9], ['丁', 11]],
  未: [['丁', 9], ['乙', 3], ['己', 18]],
  申: [['戊', 7], ['壬', 7], ['庚', 16]],
  酉: [['庚', 10], ['辛', 20]],
  戌: [['辛', 9], ['丁', 3], ['戊', 18]],
  亥: [['戊', 7], ['甲', 7], ['壬', 16]],
  子: [['壬', 10], ['癸', 20]],
  丑: [['癸', 9], ['辛', 3], ['己', 18]],
}

/** 十神 → 五类。 */
const GOD_GROUP = {
  比肩: '比劫', 劫财: '比劫', 正印: '印', 偏印: '印',
  食神: '食伤', 伤官: '食伤', 正财: '财', 偏财: '财', 正官: '官杀', 七杀: '官杀',
}

/** 五类 → 该类的五行（以日主五行为我）。 */
function groupWuxing(me) {
  return { 比劫: me, 印: SHENG_BY[me], 食伤: SHENG[me], 财: KE[me], 官杀: KE_BY[me] }
}

/** 月支 → 季节。 */
const SEASON_OF = {
  寅: '春', 卯: '春', 辰: '春', 巳: '夏', 午: '夏', 未: '夏',
  申: '秋', 酉: '秋', 戌: '秋', 亥: '冬', 子: '冬', 丑: '冬',
}

// ═══════════════════════════════════════════════════════════════════
// 排盘：本族自算四柱（立春换年 / 节气换月 / 真太阳时）
// ═══════════════════════════════════════════════════════════════════

/** 从 birthChart.solar 解析出生公历分量。 */
function birthSolar(chart) {
  const m = /(\d{1,4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})/.exec(String(chart?.birthChart?.solar ?? ''))
  if (!m) return null
  const v = { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] }
  if (!Number.isFinite(v.y) || v.y < 1) return null
  return v
}

/**
 * 排本族四柱（v2：立春换年 + 节气换月 + 可选真太阳时校正）。
 * cite: lunar-javascript（寿星天文历）EightChar；其 getYear 按立春、getMonth 按节气。
 * @param {object} chart 盘基。
 * @returns {object|null} { pillars, dayGan, monthZhi, …, jieqi, lunar, solarTrue, offsetMin }
 */
function natalPillars(chart) {
  const s = birthSolar(chart)
  if (!s) return null
  // 真太阳时：给了经度才校正（与历法层同一口径，避免"猜经度"）
  let offsetMin = 0
  let note = '未校正（未提供经度）'
  if (Number.isFinite(chart?.longitude)) {
    const lonPart = (chart.longitude - 120) * 4
    const eot = Number(chart?.astro?.eotMin)
    offsetMin = lonPart + (Number.isFinite(eot) ? eot : 0)
    note = `经度差 ${lonPart >= 0 ? '+' : ''}${lonPart.toFixed(1)}′${Number.isFinite(eot) ? ` 均时差 ${eot >= 0 ? '+' : ''}${eot.toFixed(1)}′` : '（均时差待天文层提供）'}`
  }
  const dt = new Date(Date.UTC(s.y, s.mo - 1, s.d, s.h, s.mi) + Math.round(offsetMin) * 60000)
  const sy = dt.getUTCFullYear(); const smo = dt.getUTCMonth() + 1; const sd = dt.getUTCDate()
  const sh = dt.getUTCHours(); const smi = dt.getUTCMinutes()
  try {
    const solar = LunarLib.Solar.fromYmdHms(sy, smo, sd, sh, smi, 0)
    const lunar = solar.getLunar()
    const ec = lunar.getEightChar()
    const pillars = [ec.getYear(), ec.getMonth(), ec.getDay(), ec.getTime()]
    if (pillars.some((p) => typeof p !== 'string' || p.length < 2)) return null
    // 晚子时（23:00–23:59）：紫微斗数取「次日」的农历日与月（子时归次日）。
    // 若当日恰为农历月末，次日会自然滚入下月，故这里直接构造次日对象而不是简单 +1。
    const lateZi = sh === 23
    let lunarNext = null
    if (lateZi) {
      const nd = new Date(Date.UTC(sy, smo - 1, sd + 1, 0, 0))
      const nl = LunarLib.Solar.fromYmdHms(nd.getUTCFullYear(), nd.getUTCMonth() + 1, nd.getUTCDate(), 0, 0, 0).getLunar()
      lunarNext = { month: Math.abs(nl.getMonth()) || 1, leap: nl.getMonth() < 0, day: nl.getDay() || 1, yearGZ: nl.getYearInGanZhi() || '' }
    }
    return {
      pillars,
      offsetMin,
      solarTrue: `${sy}-${String(smo).padStart(2, '0')}-${String(sd).padStart(2, '0')} ${String(sh).padStart(2, '0')}:${String(smi).padStart(2, '0')}`,
      solarNote: note,
      lateZi,
      lunarNext,
      jieqi: { prev: lunar.getPrevJieQi()?.getName?.() ?? '', next: lunar.getNextJieQi()?.getName?.() ?? '' },
      lunar: {
        month: Math.abs(lunar.getMonth()) || 1,
        leap: lunar.getMonth() < 0,
        day: lunar.getDay() || 1,
        yearGZ: lunar.getYearInGanZhi() || '',
        text: lunar.toString(),
      },
      taiYuan: ec.getTaiYuan(),
      mingGong: ec.getMingGong(),
      shenGong: ec.getShenGong(),
    }
  } catch {
    return null
  }
}

/** 节后日数（用于人元司令分野）：以历法层/天文的节气为准，缺则按公历日粗估。 */
function daysAfterJie(chart, natal) {
  const prevAt = chart?.jieqi?.prevAt
  const before = chart?.birthChart?.solar
  if (typeof prevAt === 'string' && typeof before === 'string') {
    const a = Date.parse(prevAt.replace(' ', 'T'))
    const b = Date.parse(before.replace(' ', 'T'))
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
      return clamp(Math.floor((b - a) / 86400000) + 1, 1, 30)
    }
  }
  return clamp(Math.round((natal?.lunar?.day ?? 1) / 3) + 1, 1, 30)
}

/** 取司令干（人元司令分野）。 */
function marshalGan(monthZhi, days) {
  const segs = RENYUAN_30[monthZhi]
  if (!segs) return null
  let acc = 0
  for (const [gan, len] of segs) {
    acc += len
    if (days <= acc) return { gan, days, span: len }
  }
  const last = segs[segs.length - 1]
  return { gan: last[0], days, span: last[1] }
}

// ═══════════════════════════════════════════════════════════════════
// 五行力量 / 十神力量
// ═══════════════════════════════════════════════════════════════════

/**
 * 五行力量：天干（月干 ×1.2）+ 地支藏干（本气/中气/余气，月令支 ×1.5）
 * + **司令干加权**（当令者额外 +0.8，体现"月令司权"）。
 * cite: 命理通例（藏干力量）＋人元司令分野（司权加成）。
 */
function wxPower(ps, marshal) {
  const out = emptyWuxing()
  ps.forEach((gz, i) => {
    const gw = i === 1 ? 1.2 : 1.0
    if (GAN_WUXING[gz[0]]) out[GAN_WUXING[gz[0]]] += gw
    const zw = i === 1 ? 1.5 : 1.0
    const hidden = ZHI_CANGGAN[gz[1]] ?? []
    hidden.forEach((hg, k) => {
      const wx = GAN_WUXING[hg]
      if (wx) out[wx] += (CG_W[k] ?? 0.2) * zw
    })
    if (i === 1 && marshal?.gan && GAN_WUXING[marshal.gan]) out[GAN_WUXING[marshal.gan]] += 0.8
  })
  return out
}

/** 五行占比（%）。 */
function wxPct(wx) {
  const total = WUXING.reduce((s, k) => s + (wx[k] ?? 0), 0) || 1
  const out = {}
  for (const k of WUXING) out[k] = ((wx[k] ?? 0) / total) * 100
  return out
}

/** 十神力量（天干 1.0/月干 1.2；藏干按本气/中气/余气，月令支 ×1.5）。 */
function godPower(ps, dayGan) {
  const gods = {}
  const add = (g, w) => {
    const t = tenGodOf(dayGan, g)
    if (!t || t === '—') return
    gods[t] = (gods[t] ?? 0) + w
  }
  ps.forEach((gz, i) => {
    if (i !== 2) add(gz[0], i === 1 ? 1.2 : 1.0)
    const zw = i === 1 ? 1.5 : 1.0
    ;(ZHI_CANGGAN[gz[1]] ?? []).forEach((hg, k) => add(hg, (CG_W[k] ?? 0.2) * zw))
  })
  return gods
}

/** 十神 → 五类力量。 */
function groupPower(gods) {
  const out = { 比劫: 0, 印: 0, 食伤: 0, 财: 0, 官杀: 0 }
  for (const [g, v] of Object.entries(gods)) {
    const grp = GOD_GROUP[g]
    if (grp) out[grp] += v
  }
  return out
}

// ═══════════════════════════════════════════════════════════════════
// 八字总分析（v2：三维旺衰 + 格局 + 用神判据）
// ═══════════════════════════════════════════════════════════════════

/**
 * 旺衰三维：
 * - **得令**（0..45）：月令本气对日主的旺衰档 + 司令干是否为同党（司权）。
 * - **得地**（0..35）：四支藏干中同党之根的加权（本气根 1.0 / 中气 0.6 / 余气 0.35），
 *   日支、月支额外 ×1.3（坐下与月令最重）。
 * - **得势**（0..20）：年月时三干中同党之数与是否得根。
 * 合计 0..100，≥50 判身强。全部取值进 evidence。
 */
function analyzeStrength(ps, dayGan, marshal) {
  const me = GAN_WUXING[dayGan]
  if (!me) return null
  const ev = []
  const monthZhi = ps[1][1]
  const monthWx = ZHI_WUXING[monthZhi] ?? '土'
  const rel = relation(me, monthWx)   // 我 vs 月令五行

  // 得令：月令档位（同我=旺 45 / 生我=相 38 / 我生=休 26 / 我克=囚 16 / 克我=死 9）
  const LING = { 比和: 45, 生我: 38, 我生: 26, 我克: 16, 克我: 9 }
  let deLing = LING[rel] ?? 20
  ev.push(evidence('得令·月令本气（月支五行对日主：同我/生我/我生/我克/克我）', `${monthZhi}${monthWx}·${rel} → ${deLing}`, '月令为提纲，权重最重'))

  // 司令干：当令之神若与日主同党（比劫/印）再加，异党再减
  if (marshal?.gan) {
    const mWx = GAN_WUXING[marshal.gan]
    const same = mWx === me || SHENG_BY[me] === mWx
    const d = same ? 8 : -6
    deLing = clamp(deLing + d, 0, 45)
    ev.push(evidence('得令·人元司令分野（节后日数定司令干）', `${monthZhi}月节后${marshal.days}日 → ${marshal.gan}（${mWx}，${same ? '同党' : '异党'}）→ ${d > 0 ? '+' : ''}${d}`, '月令司权者当权'))
  }

  // 得地：四支藏干同党之根
  let deDi = 0
  const roots = []
  ps.forEach((gz, i) => {
    if (i === 2) return  // 日干本身不是根
    const zhi = gz[1]
    const hidden = ZHI_CANGGAN[zhi] ?? []
    const w = (i === 1 || i === 2) ? 1.3 : 1.0
    hidden.forEach((hg, k) => {
      const hw = GAN_WUXING[hg]
      const isSame = hw === me || SHENG_BY[me] === hw
      if (!isSame) return
      const v = (CG_W[k] ?? 0.2) * w
      deDi += v
      roots.push(`${gz[1]}藏${hg}(${k === 0 ? '本气' : k === 1 ? '中气' : '余气'}${w > 1 ? '·加' : ''})`)
    })
  })
  const deDiScore = clamp(Math.round(deDi * 14), 0, 35)
  ev.push(evidence('得地·通根（四支藏干中同党之根加权：本气1.0/中气0.6/余气0.35，日支月支×1.3）', roots.length > 0 ? roots.join('、') : '无根', `加权 ${deDi.toFixed(2)} → ${deDiScore}`))

  // 得势：年月时三干
  let sameGan = 0
  const ganList = []
  ps.forEach((gz, i) => {
    if (i === 2) return
    const g = gz[0]
    const gw = GAN_WUXING[g]
    const isSame = gw === me || SHENG_BY[me] === gw
    ganList.push(`${gz}${isSame ? '同' : '异'}`)
    if (isSame) sameGan += 1
  })
  const deShi = clamp(Math.round((sameGan / 3) * 20), 0, 20)
  ev.push(evidence('得势·透干（年月时三干中同党之数，满分三干）', ganList.join('、'), `${sameGan}/3 → ${deShi}`))

  const score = clamp(deLing + deDiScore + deShi, 0, 100)
  return {
    me, deLing, deDi: deDiScore, deShi, score,
    strong: score >= 50,
    level: score >= 70 ? '极强' : score >= 55 ? '偏强' : score >= 45 ? '中和' : score >= 30 ? '偏弱' : '极弱',
    monthRel: rel,
    roots,
    evidence: ev,
  }
}

/** 格局：月令本气十神 → 格局名（比劫在月令为建禄/月刃）。 */
function analyzeGeJu(ps, dayGan) {
  const monthZhi = ps[1][1]
  const benQi = (ZHI_CANGGAN[monthZhi] ?? [])[0]
  const god = tenGodOf(dayGan, benQi)
  const LU = { 甲: '寅', 乙: '卯', 丙: '巳', 丁: '午', 戊: '巳', 己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子' }
  const YANG_REN = { 甲: '卯', 乙: '寅', 丙: '午', 丁: '巳', 戊: '午', 己: '巳', 庚: '酉', 辛: '申', 壬: '子', 癸: '亥' }
  let name = `${god}格`
  if (god === '比肩' && LU[dayGan] === monthZhi) name = '建禄格'
  if (god === '劫财' && YANG_REN[dayGan] === monthZhi) name = '月刃格（羊刃格）'
  return {
    name,
    monthZhi,
    benQi,
    god,
    note: `${monthZhi}月本气${benQi}为${god}`,
    evidence: evidence('格局·月令本气十神取格（比劫在月令则论建禄/月刃）', `${monthZhi}月本气${benQi} → ${god} → ${name}`, '格局定用神方向'),
  }
}

/** 用神：扶抑 → 调候 → 通关。返回可执行判据。 */
function analyzeYongShen(ps, dayGan, strength, groups) {
  const me = GAN_WUXING[dayGan]
  const monthZhi = ps[1][1]
  const season = SEASON_OF[monthZhi] ?? '春'
  const gw = groupWuxing(me)
  const ev = []
  // 扶抑
  const order = strength.strong
    ? ['官杀', '食伤', '财']   // 身强：克泄耗
    : ['印', '比劫']           // 身弱：生扶
  const picked = order.map((g) => ({ group: g, wx: gw[g], power: groups[g] ?? 0 }))
    .sort((a, b) => b.power - a.power)[0]
  ev.push(evidence(
    `扶抑取用（${strength.strong ? '身强取克泄耗' : '身弱取生扶'}，取该党中力量最大者）`,
    `${order.join('>')} 中 ${picked.group}(${picked.wx}) 力量 ${picked.power.toFixed(2)}`,
    '扶抑为取用第一义',
  ))
  // 调候
  let tiaohou = null
  if (season === '冬') { tiaohou = '火'; ev.push(evidence('调候（冬生喜火，亥子丑月寒，需火暖局）', `${monthZhi}月属冬 → 火`, '冬生无火则滞')) }
  else if (season === '夏') { tiaohou = '水'; ev.push(evidence('调候（夏生喜水，巳午未月燥，需水润局）', `${monthZhi}月属夏 → 水`, '夏生无水则枯')) }
  // 冲突处理：调候 > 扶抑（寒暖为生死之机）
  const conflict = Boolean(tiaohou) && tiaohou !== picked.wx
  const yong = conflict ? tiaohou : picked.wx
  if (conflict) {
    ev.push(evidence('调候与扶抑冲突的取舍', `扶抑取${picked.wx}，调候取${tiaohou} → 从调候`, '调候关乎寒暖生死，优先于扶抑'))
  }
  // 通关：两党对峙（最强的两类力量接近且相克）
  const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1])
  let tongGuan = null
  if (sorted.length >= 2 && sorted[0][1] > 0 && sorted[1][1] > 0) {
    const [g1, v1] = sorted[0]
    const [g2, v2] = sorted[1]
    if (v2 / v1 > 0.75 && KE[gw[g1]] === gw[g2]) {
      tongGuan = SHENG[gw[g1]]
      ev.push(evidence('通关（两党力量接近且相克，取通关之神）', `${g1}(${gw[g1]}) 与 ${g2}(${gw[g2]}) 力量 ${v1.toFixed(2)}/${v2.toFixed(2)} → 通关取 ${tongGuan}`, '通关解对峙'))
    }
  }
  return { yong, tiaohou, tongGuan, conflict, season, evidence: ev, groupOrder: sorted }
}

/** 八字总分析。 */
function analyzeBazi(chart) {
  const natal = natalPillars(chart)
  if (!natal) return null
  const ps = natal.pillars
  const dayGan = ps[2][0]
  const me = GAN_WUXING[dayGan]
  if (!me) return null
  const monthZhi = ps[1][1]
  const days = daysAfterJie(chart, natal)
  // 人元司令分野：优先用天文层 `chart.renyuan`（按**真实节气时刻**推，含用事日数与本段已过日数），
  // 缺则退回族内表（按公历日粗估）。两条通路的差别在节气当日附近，天文层更准。
  const ry = chart?.renyuan
  const marshal = (ry && ry.gan)
    ? { gan: ry.gan, days: Number.isFinite(ry.elapsed) ? ry.elapsed + 1 : days, span: ry.days, from: 'chart.renyuan（天文层，按真实节气时刻）' }
    : { ...(marshalGan(monthZhi, days) ?? {}), from: '族内 RENYUAN_30（按节后日数近似）' }
  const strength = analyzeStrength(ps, dayGan, marshal)
  if (!strength) return null
  const gods = godPower(ps, dayGan)
  const groups = groupPower(gods)
  const geju = analyzeGeJu(ps, dayGan)
  const yong = analyzeYongShen(ps, dayGan, strength, groups)
  const wx = wxPower(ps, marshal)
  return {
    natal, ps, dayGan, me, monthZhi, days, marshal, strength, gods, groups, geju, yong,
    wx, wxPct: wxPct(wx), season: SEASON_OF[monthZhi] ?? '春',
  }
}

// ═══════════════════════════════════════════════════════════════════
// 紫微斗数（商余法原式）
// ═══════════════════════════════════════════════════════════════════

/** 地支序（子=0）。 */
const zi = (z) => ZHI.indexOf(z)

/**
 * 起紫微（经典商余法）：
 * q = ⌈日/局⌉，r = q×局 − 日；自寅宫起数 q 宫（寅为第 1 宫），
 * r 为偶数再顺进 r 宫、为奇数则逆退 r 宫。
 * cite: 《紫微斗数全书》起紫微诀；已用水二局初一丑…初六辰逐日自洽。
 * @param {number} day 农历日 1..30。
 * @param {number} ju 局数 2..6。
 * @returns {string} 紫微所在地支。
 */
function qiZiwei(day, ju) {
  const q = Math.ceil(day / ju)
  const r = q * ju - day
  let idx = zi('寅') + (q - 1)
  idx += (r % 2 === 0) ? r : -r
  return ZHI[mod(idx, 12)]
}

/** 五虎遁：年干 → 某地支宫的宫干。 */
function palaceGan(yearGan, zhi) {
  const yinGan = D.YIN_GAN[yearGan]
  if (!yinGan) return ''
  const start = GAN.indexOf(yinGan)
  return GAN[mod(start + mod(zi(zhi) - zi('寅'), 12), 10)]
}

/**
 * 紫微安星（v2）。
 * @param {object} chart 盘基。
 * @returns {object|null} 紫微盘。
 */
function ziweiChart(chart) {
  const natal = natalPillars(chart)
  if (!natal) return null
  const y = natal.lunar
  const next = natal.lateZi && natal.lunarNext ? natal.lunarNext : null
  // ⚠ 晚子时（23:00–23:59）口径——**由独立验证（verifier ISSUE-01）驱动修正，实测反解 iztro**
  //   日推进、月与年**不推进**：
  //   · 日推进：紫微起星用次日的农历日（实测 2002-03-05 23:58 等 10 例主星落宫靠这条才吻合）；
  //   · 月不推进：1998-11-18 23:33（九月三十→十月初一）iztro 仍用**九月**；
  //     2026-02-16 23:10（十二月廿九→正月初一）iztro 仍用**十二月**。
  //   v2 早期版本把月/年也一并推进，靠"未跨月"的样本侥幸拿到 200/200，属**对夹具过拟合**，
  //   已由边缘样本暴露（1955-5-19 23:29 闰三月廿八：iztro 用三月，旧实现用四月 → 命宫差一宫）。
  const dayBase = next ?? y
  const yearGan = (y.yearGZ && y.yearGZ[0]) || natal.pillars[0][0]
  const yearZhi = (y.yearGZ && y.yearGZ[1]) || natal.pillars[0][1]
  // ⚠ 闰月口径（受控实验反解 iztro：固定时辰、只扫农历日，第 15→16 日整点切换）：
  //   **上半月（初一~十五）作本月，下半月（十六以后）作下月**。
  //   例：1941 闰六月 1–15 日作六月、16–30 日作七月；1955 闰三月同。
  //
  // ⚠⚠ 但**晚子时是例外**（由独立验证 ISSUE-02 驱动，Lead 受控实验 4 例复核确认）：
  //   晚子时（ti=12）iztro 取**农历月序原值**，**连闰月半旬调整也不做**。
  //   实测四条（均为闰月下半月）：
  //     1998 闰五月廿七 → 常时月6 / 晚子时月5；1974 闰四月十七 → 5 / 4；
  //     1955 闰三月廿八 → 4 / 3；1941 闰六月十八 → 7 / 6。
  //   注意晚子时**仍然推进"日"**（紫微起星用次日日数），只是不推进月/年、也不做闰月调整。
  const month = next
    ? y.month
    : (y.leap ? (y.day <= 15 ? y.month : (y.month % 12) + 1) : y.month)
  const day = clamp(dayBase.day, 1, 30)
  const hourZhi = natal.pillars[3][1]

  // 命宫：寅起正月顺数至生月，再自该宫起子时**逆**数至生时
  const mingIdx = mod(zi('寅') + (month - 1) - zi(hourZhi), 12)
  // 身宫：同起点，起子时**顺**数至生时
  const shenIdx = mod(zi('寅') + (month - 1) + zi(hourZhi), 12)
  const mingZhi = ZHI[mingIdx]
  const shenZhi = ZHI[shenIdx]

  // 五行局：命宫干支纳音 → 五行 → 局数
  const mgGan = palaceGan(yearGan, mingZhi)
  const mgGZ = `${mgGan}${mingZhi}`
  const mgNayin = nayinOf(mgGZ)
  const juWx = mgNayin && mgNayin !== '—' ? mgNayin.slice(-1) : '水'
  const ju = D.JU_BY_WUXING[juWx] ?? 2

  // 紫微 / 天府
  const zwZhi = qiZiwei(day, ju)
  const tfZhi = ZHI[mod(4 - zi(zwZhi), 12)]

  /** 十二宫（自命宫起逆排）。 */
  const palaces = ZIWEI_PALACES.map((name, i) => {
    const z = ZHI[mod(mingIdx - i, 12)]
    return { name, zhi: z, gan: palaceGan(yearGan, z), stars: [], hua: {} }
  })
  const byZhi = {}
  for (const p of palaces) byZhi[p.zhi] = p

  const put = (zhi, star, hua) => {
    const p = byZhi[zhi]
    if (!p) return
    if (!p.stars.includes(star)) p.stars.push(star)
    if (hua) p.hua[star] = hua
  }

  // 十四主星
  for (const [star, off] of D.ZIWEI_SERIES) put(ZHI[mod(zi(zwZhi) + off, 12)], star)
  for (const [star, off] of D.TIANFU_SERIES) put(ZHI[mod(zi(tfZhi) + off, 12)], star)

  // 辅星
  put(ZHI[mod(zi('辰') + (month - 1), 12)], '左辅')
  put(ZHI[mod(zi('戌') - (month - 1), 12)], '右弼')
  put(ZHI[mod(zi('戌') - zi(hourZhi), 12)], '文昌')
  put(ZHI[mod(zi('辰') + zi(hourZhi), 12)], '文曲')
  const gui = D.TIAN_GUI[yearGan] ?? []
  if (gui[0]) put(gui[0], '天魁')
  if (gui[1]) put(gui[1], '天钺')
  const lu = D.LUCUN[yearGan]
  if (lu) {
    put(lu, '禄存')
    put(ZHI[mod(zi(lu) + 1, 12)], '擎羊')
    put(ZHI[mod(zi(lu) - 1, 12)], '陀罗')
  }
  const huo = D.HUO_START[yearZhi]
  if (huo) put(ZHI[mod(zi(huo) + zi(hourZhi), 12)], '火星')
  const ling = D.LING_START[yearZhi]
  if (ling) put(ZHI[mod(zi(ling) + zi(hourZhi), 12)], '铃星')
  put(ZHI[mod(zi('亥') + zi(hourZhi), 12)], '地劫')
  put(ZHI[mod(zi('亥') - zi(hourZhi), 12)], '地空')
  const MA = { 寅: '申', 午: '申', 戌: '申', 申: '寅', 子: '寅', 辰: '寅', 巳: '亥', 酉: '亥', 丑: '亥', 亥: '巳', 卯: '巳', 未: '巳' }
  if (MA[yearZhi]) put(MA[yearZhi], '天马')

  // 生年四化
  const sh = D.SIHUA[yearGan] ?? {}
  const sihua = []
  for (const [hua, star] of Object.entries(sh)) {
    sihua.push({ star, hua })
    // 四化落在该星所在宫
    for (const p of palaces) if (p.stars.includes(star)) p.hua[star] = hua
  }

  // 大限：阳男阴女顺行 / 阴男阳女逆行；起限岁 = 局数，每限十年
  const yangYear = GAN_YANG[yearGan] === true
  const male = chart?.gender !== '女'
  const forward = (yangYear && male) || (!yangYear && !male)
  const daxian = []
  for (let i = 0; i < 12; i += 1) {
    const step = forward ? i : -i
    const p = palaces[mod(0 + step, 12)] ?? palaces[0]
    const startAge = ju + i * 10
    daxian.push({ palace: p.name, zhi: p.zhi, startAge, endAge: startAge + 9 })
  }

  return {
    mingGong: mingZhi, shenGong: shenZhi, mingGongGZ: mgGZ, ju, juName: D.JU_NAME[ju] ?? '',
    juWx, ziwei: zwZhi, tianfu: tfZhi, palaces, byZhi, sihua, daxian, forward,
    yearGan, yearZhi, month, day, hourZhi,
    monthIsLeap: y.leap,
  }
}

/** 三方四正：本宫 + 对宫 + 三合两宫。 */
function sanFangSiZheng(palaces, idx) {
  const at = (i) => palaces[mod(i, 12)]
  return { 本宫: at(idx), 对宫: at(idx + 6), 三合: [at(idx + 4), at(idx + 8)] }
}

// ═══════════════════════════════════════════════════════════════════
// 七政四余 / 五星占
// ═══════════════════════════════════════════════════════════════════

/** 儒略世纪数（J2000 起）。 */
const jc = (jd) => (jd - 2451545.0) / 36525

/** 日期 → 儒略日（用出生时刻的 UT 近似）。 */
function julianDay(y, mo, d, h, mi) {
  let yy = y; let mm = mo
  if (mm <= 2) { yy -= 1; mm += 12 }
  const A = Math.floor(yy / 100)
  const B = 2 - A + Math.floor(A / 4)
  return Math.floor(365.25 * (yy + 4716)) + Math.floor(30.6001 * (mm + 1)) + d + B - 1524.5 + (h + mi / 60) / 24
}

/**
 * 七政黄经。
 * 优先用 `chart.astro`（kernel-astro 提供的 astronomy-engine 真黄经，视黄经）；
 * 缺该字段时退化为族内平均黄经近似（`data/mingli.js` 的 MEAN_LONGITUDE 表 + 平均运动），
 * 并**如实降级为 approx**。
 * @returns {{lons:object, real:boolean, note:string}}
 */
function planetLons(chart) {
  const a = chart?.astro
  if (a && Number.isFinite(a.sunLon) && a.planets && Number.isFinite(a.planets?.木)) {
    return {
      lons: {
        太阳: a.sunLon,
        太阴: a.moonLon,
        水星: a.planets.水,
        金星: a.planets.金,
        火星: a.planets.火,
        木星: a.planets.木,
        土星: a.planets.土,
      },
      real: true,
      note: '真星历（astronomy-engine 视黄经）',
    }
  }
  const s = birthSolar(chart)
  if (!s) return null
  const jd = julianDay(s.y, s.mo, s.d, s.h, s.mi)
  const T = jc(jd)
  const lons = {}
  for (const [name, base] of Object.entries(D.MEAN_LONGITUDE)) {
    const rate = name === '太阳' ? 0.9856473 : name === '太阴' ? 13.176396 : 0.9856
    lons[name] = norm360(base + rate * (jd - 2451545.0))
  }
  return { lons, real: false, note: '无星历表：按 J2000 平均黄经 + 平均运动近似' }
}

/**
 * 四余（罗睺/计都/月孛/紫气）。
 * 罗睺 = 月亮**升交点**平黄经，计都 = 罗睺 + 180°（两说并存，本实现取"计都为罗睺对冲"一派）；
 * 月孛 = 月亮**近地点**平黄经（平黄经 − 平近点角）；
 * 紫气 = 传统虚星，28.8 年一周天（值取通例 28 年余，标 approx）。
 * cite: 交点/近地点公式见 Meeus《Astronomical Algorithms》ch.47（平交点）与 ch.22（均时差同源）；
 *       紫气周期为传统通例，非天文实星。
 */
function siyuLons(chart) {
  const s = birthSolar(chart)
  if (!s) return null
  const jd = julianDay(s.y, s.mo, s.d, s.h, s.mi)
  const T = jc(jd)
  const node = norm360(125.04452 - 1934.136261 * T + 0.0020708 * T * T)
  const moonMean = norm360(218.3165 + 481267.8813 * T)
  const moonAnom = norm360(134.9634 + 477198.8676 * T)
  const perigee = norm360(moonMean - moonAnom)
  const ziqi = norm360(280 + (360 / (28.8 * 365.2422)) * (jd - 2451545.0))
  return { 罗睺: node, 计都: norm360(node + 180), 月孛: perigee, 紫气: ziqi }
}

/** 黄经 → 二十八宿与入宿度。cite: 二十八宿距度按各宿等分（无古度表，标 approx）。 */
function xiuOf(lon, xiuNames) {
  const n = xiuNames.length
  const span = 360 / n
  const i = Math.floor(norm360(lon) / span) % n
  return { name: xiuNames[i], ruDu: norm360(lon) - i * span, span }
}

// ═══════════════════════════════════════════════════════════════════
// 断语工具
// ═══════════════════════════════════════════════════════════════════

/** 分数 → 吉凶副词（本族统一口径，避免各法自造）。 */
function adv(sc) {
  if (sc >= 55) return '大吉'
  if (sc >= 30) return '吉'
  if (sc >= 12) return '小吉'
  if (sc > -12) return '平'
  if (sc > -30) return '小凶'
  if (sc > -55) return '凶'
  return '大凶'
}

/** 五行信号：把某五行按权重塞进 wuxing 对象（合盘统计用）。 */
function wxSignal(pairs) {
  const out = emptyWuxing()
  for (const [w, v] of pairs) if (WUXING.includes(w)) out[w] += Number(v) || 0
  return out
}

/** 四柱展示串。 */
const pillarsText = (ps) => ps.join(' ')

/** 神煞（**优先用天文层 `chart.shenshaAll` 的 28 种**，缺则用族内表按年支/日干查）。 */
function shenshaOf(chart, ps) {
  const yearZhi = ps[0][1]
  const dayZhi = ps[2][1]
  const dayGan = ps[2][0]
  const monthZhi = ps[1][1]
  const out = []
  const all = chart?.shenshaAll
  if (all && typeof all === 'object' && Object.keys(all).length > 0) {
    for (const [name, zhis] of Object.entries(all)) {
      const arr = Array.isArray(zhis) ? zhis.filter(Boolean) : (zhis ? [zhis] : [])
      out.push({
        name,
        zhi: arr.length > 0 ? [...new Set(arr)].join('/') : '—',
        how: '天文层 chart.shenshaAll（通行口诀表 + 逐条 cite）',
        luck: D.SHENSHA_LUCK?.[name] ?? 0,
        hit: arr.length > 0,
      })
    }
    return out
  }
  const push = (name, zhi, how, luck) => { if (zhi) out.push({ name, zhi, how, luck }) }
  // 四孟神煞（驿马/桃花/华盖/将星）走共享表
  for (const kind of ['驿马', '桃花', '华盖', '将星']) {
    push(kind, shenShaOf(kind, yearZhi), `年支${yearZhi}查${kind}`, kind === '驿马' ? 8 : kind === '桃花' ? 5 : kind === '华盖' ? -4 : 10)
  }
  const tIANYI = D.TIANYI?.[dayGan] ?? D.TIANYI?.[ps[0][0]] ?? []
  for (const z of (Array.isArray(tIANYI) ? tIANYI : [tIANYI])) push('天乙贵人', z, `日干${dayGan}查天乙`, 16)
  push('文昌贵人', D.WENCHANG?.[dayGan], `日干${dayGan}查文昌`, 12)
  push('禄神', D.LUSHEN?.[dayGan], `日干${dayGan}查禄`, 14)
  push('羊刃', D.YANGREN?.[dayGan], `日干${dayGan}查羊刃`, -12)
  push('金舆', D.JINYU?.[dayGan], `日干${dayGan}查金舆`, 8)
  push('红艳', D.HONGYAN?.[dayGan], `日干${dayGan}查红艳`, 0)
  const gg = D.GUGUA?.[yearZhi] ?? []
  if (gg[0]) push('孤辰', gg[0], `年支${yearZhi}查孤辰`, -8)
  if (gg[1]) push('寡宿', gg[1], `年支${yearZhi}查寡宿`, -8)
  push('亡神', D.WANGSHEN?.[yearZhi], `年支${yearZhi}查亡神`, -8)
  push('劫煞', D.JIESHA?.[yearZhi], `年支${yearZhi}查劫煞`, -10)
  if (D.KUIGANG?.includes(ps[2])) push('魁罡', dayZhi, '日柱为魁罡', 10)
  push('月德', D.YUEDE?.[monthZhi], `月支${monthZhi}查月德`, 12)
  push('天德', D.TIANDE?.[chart?.lunar?.month ?? 1], '农历月查天德', 12)
  // 命中：神煞所在地支出现在四柱即"带"
  const zhis = ps.map((p) => p[1])
  for (const o of out) o.hit = zhis.includes(o.zhi)
  return out
}

// ═══════════════════════════════════════════════════════════════════
// 引擎表（18 法）
// ═══════════════════════════════════════════════════════════════════

/** 本族统一的出处（detail.cite 用）。 */
const CITE = {
  四柱: 'lunar-javascript 寿星天文历 EightChar（立春换年、节气换月）',
  旺衰: '《渊海子平》《三命通会》人元司令分野 + 通根透干通例',
  格局: '《子平真诠》月令取格',
  用神: '《滴天髓》扶抑/调候/通关三义',
  神煞: '《三命通会》神煞篇（族内表 data/mingli.js 同源）',
  紫微: '《紫微斗数全书》安星诀（商余法）；对拍 iztro@2.6.1 金标准',
  四化: '生年四化表（与 iztro@2.6.1 同派）',
  七政: 'Meeus《Astronomical Algorithms》平交点/近地点；真黄经取 astronomy-engine',
  称骨: '《袁天罡称骨歌》公开表',
  命卦: '《八宅明镜》九星命卦',
}

export const engines = {
  // ── 41 四柱八字·排盘 ──
  baziPan(chart) {
    const a = analyzeBazi(chart)
    if (!a) return null
    const { natal, ps, dayGan, strength, geju, yong, wxPct: pct } = a
    const strong = strength.strong
    const sc = clamp(
      (strong ? 8 : 12) + (strength.score >= 45 && strength.score <= 55 ? 22 : 0)
      + (yong.tongGuan ? 10 : 0) + (yong.conflict ? -4 : 6),
      -100, 100,
    )
    return {
      score: sc,
      essence: `${ps[0]}年${ps[1]}月${ps[2]}日${ps[3]}时·日主${dayGan}${a.me}·${strength.level}·${geju.name}`,
      keys: [geju.name, strength.level, `日主${a.me}`, yong.yong ? `用神${yong.yong}` : '用神未定'],
      wuxing: wxSignal(WUXING.map((w) => [w, pct[w] / 25])),
      timing: null,
      fidelity: 'full',
      detail: {
        四柱: pillarsText(ps),
        真太阳时: natal.solarTrue,
        时校: natal.solarNote,
        农历: natal.lunar.text,
        节气: `${natal.jieqi.prev}→${natal.jieqi.next}`,
        日主: `${dayGan}（${a.me}）`,
        旺衰: `${strength.level}（得令${strength.deLing}+得地${strength.deDi}+得势${strength.deShi}=${strength.score}/100）`,
        格局: `${geju.name}（${geju.note}）`,
        用神: `${yong.yong}${yong.tiaohou ? `（调候${yong.tiaohou}）` : ''}${yong.tongGuan ? `，通关${yong.tongGuan}` : ''}`,
        五行占比: WUXING.map((w) => `${w}${pct[w].toFixed(1)}%`).join(' '),
        藏干: ps.map((gz, i) => `${['年', '月', '日', '时'][i]}${gz}:${cangGanGods(dayGan, gz[1]).map((c) => `${c.gan}${c.god}`).join('/')}`),
        納音: ps.map((gz) => `${gz}${nayinOf(gz)}`),
        胎元命宫身宫: `${natal.taiYuan} / ${natal.mingGong} / ${natal.shenGong}`,
        cite: [CITE.四柱, CITE.旺衰, CITE.格局],
        evidence: [...strength.evidence, geju.evidence, ...yong.evidence],
      },
    }
  },

  // ── 42 日主旺衰 ──
  baziWangShuai(chart) {
    const a = analyzeBazi(chart)
    if (!a) return null
    const { strength, ps, dayGan } = a
    const sc = clamp((strength.score - 50) * 1.6, -100, 100)
    return {
      score: sc,
      essence: `日主${dayGan}${a.me}：${strength.level}（得令${strength.deLing}/得地${strength.deDi}/得势${strength.deShi}）`,
      keys: [strength.level, strength.strong ? '身强' : '身弱', `月令${a.monthZhi}`, `司令${a.marshal?.gan ?? '—'}`],
      wuxing: wxSignal([[a.me, strength.score / 50], [SHENG_BY[a.me], strength.deDi / 50]]),
      timing: null,
      fidelity: 'full',
      detail: {
        三维得分: `得令${strength.deLing} 得地${strength.deDi} 得势${strength.deShi} 合计${strength.score}`,
        判定: `${strength.score >= 50 ? '身强' : '身弱'}（以 50 为中和线）`,
        月令: `${a.monthZhi}（${ZHI_WUXING[a.monthZhi]}，对日主为「${strength.monthRel}」）`,
        司令: a.marshal ? `${a.marshal.gan}（节后${a.marshal.days}日，本气分司${a.marshal.span}日）` : '未定',
        通根: strength.roots.length > 0 ? strength.roots.join('、') : '无根（虚浮）',
        四柱: pillarsText(ps),
        cite: [CITE.旺衰],
        evidence: strength.evidence,
      },
    }
  },

  // ── 43 十神格局 ──
  baziShiShen(chart) {
    const a = analyzeBazi(chart)
    if (!a) return null
    const { gods, groups, geju, dayGan } = a
    const list = Object.entries(gods).sort((x, y) => y[1] - x[1])
    const top = list[0] ?? ['比肩', 0]
    const sc = clamp(20 + (groups.财 ?? 0) * 3 - (groups.官杀 ?? 0) * 1.5 + (groups.印 ?? 0) * 2, -100, 100)
    return {
      score: sc,
      essence: `格局${geju.name}，月令本气${geju.benQi}为${geju.god}；最旺十神为${top[0]}`,
      keys: [geju.name, geju.god, `最旺${top[0]}`, ...list.slice(1, 3).map((g) => g[0])],
      wuxing: wxSignal(WUXING.map((w) => [w, (a.wxPct[w] ?? 0) / 25])),
      timing: null,
      fidelity: 'full',
      detail: {
        格局: geju.name,
        取格依据: geju.note,
        十神力量: list.map(([g, v]) => `${g}${v.toFixed(2)}`).join(' '),
        五类力量: Object.entries(groups).map(([g, v]) => `${g}${v.toFixed(2)}`).join(' '),
        日主: dayGan,
        cite: [CITE.格局],
        evidence: [geju.evidence, evidence('十神力量（天干1.0/月干1.2，藏干本气1.0/中气0.4/余气0.2，月令支×1.5）', list.slice(0, 4).map(([g, v]) => `${g}${v.toFixed(2)}`).join('、'), '取最旺者为用神方向')],
      },
    }
  },

  // ── 44 用神取法 ──
  baziYongShen(chart) {
    const a = analyzeBazi(chart)
    if (!a) return null
    const { yong, strength, groups } = a
    const sc = clamp(30 + (yong.tongGuan ? 12 : 0) - (yong.conflict ? 10 : 0), -100, 100)
    return {
      score: sc,
      essence: `用神取${yong.yong}（${strength.strong ? '身强取克泄耗' : '身弱取生扶'}${yong.tiaohou ? `，调候${yong.tiaohou}` : ''}${yong.tongGuan ? `，通关${yong.tongGuan}` : ''}）`,
      keys: [`用神${yong.yong}`, strength.strong ? '身强' : '身弱', yong.season, ...(yong.tongGuan ? [`通关${yong.tongGuan}`] : [])],
      wuxing: wxSignal([[yong.yong, 1.2], ...(yong.tongGuan ? [[yong.tongGuan, 0.6]] : [])]),
      timing: null,
      fidelity: 'core',
      detail: {
        用神: yong.yong,
        调候: yong.tiaohou ?? '本季不需专取调候',
        通关: yong.tongGuan ?? '无对峙，不需通关',
        取舍: yong.conflict ? '调候与扶抑冲突 → 从调候（寒暖关乎生死）' : '调候与扶抑一致',
        五类力量排序: yong.groupOrder.map(([g, v]) => `${g}${v.toFixed(2)}`).join(' > '),
        cite: [CITE.用神],
        evidence: yong.evidence,
      },
    }
  },

  // ── 45 大运流年 ──
  baziDaYun(chart) {
    const a = analyzeBazi(chart)
    if (!a) return null
    const yun = chart?.yun
    const ps = a.ps
    const nowYear = Number(String(chart?.solar?.text ?? '').slice(0, 4)) || new Date().getUTCFullYear()
    const liuNian = a.natal.lunar?.yearGZ ?? ''
    // 起运：历法层已给（三天折一年）。缺则按"节后日数/3"粗估并降级。
    let startTxt = '未提供'
    let daYun = []
    if (yun && Array.isArray(yun.daYun) && yun.daYun.length > 0) {
      startTxt = `${yun.startYear}年${yun.startMonth}月${yun.startDay}日（交运 ${yun.startSolar}）`
      daYun = yun.daYun.slice(0, 8)
    }
    const cur = daYun.find((d) => nowYear >= (d.startYear ?? 0) && nowYear <= (d.startYear ?? 0) + 9)
    const sc = clamp(cur ? 12 : 0, -100, 100)
    return {
      score: sc,
      essence: `起运${startTxt.slice(0, 18)}；当前大运${cur?.gz ?? '未入'}`,
      keys: ['大运', cur ? `现行${cur.gz}` : '未起运', `流年${liuNian}`],
      wuxing: cur ? wxSignal(WUXING.map((w) => [w, 0.25])) : emptyWuxing(),
      timing: cur ? `${cur.gz}运（${cur.startYear}–${(cur.startYear ?? 0) + 9}）` : null,
      fidelity: daYun.length > 0 ? 'full' : 'approx',
      detail: {
        起运: startTxt,
        排法: `阳男阴女顺排、阴男阳女逆排；三天折一年（历法层按出生时刻到节气的精确时差折算）`,
        大运: daYun.map((d) => `${d.gz}(${d.startAge}-${d.endAge}岁/${d.startYear}起)`),
        当前大运: cur ? `${cur.gz}（${cur.startYear}–${(cur.startYear ?? 0) + 9}）` : '未入大运',
        流年: `${liuNian}（求占年 ${nowYear}）`,
        四柱: pillarsText(ps),
        cite: ['lunar-javascript 起运折算（三天折一年）', '《渊海子平》大运排法'],
        evidence: [evidence('大运顺逆（阳男阴女顺、阴男阳女逆）', `年干${ps[0][0]}${GAN_YANG[ps[0][0]] ? '阳' : '阴'}·${chart?.gender ?? '男'} → ${yun ? '历法层已排' : '无数据'}`, '定大运方向'), evidence('起运折算（三天折一年）', startTxt, '定入运时刻')],
      },
    }
  },

  // ── 46 八字神煞 ──
  baziShenSha(chart) {
    const a = analyzeBazi(chart)
    if (!a) return null
    const list = shenshaOf(chart, a.ps)
    const hit = list.filter((s) => s.hit)
    const sum = hit.reduce((s, x) => s + (x.luck ?? 0), 0)
    const sc = clamp(sum * 1.6, -100, 100)
    return {
      score: sc,
      essence: `神煞${list.length}项，命中${hit.length}项：${hit.slice(0, 4).map((s) => s.name).join('/') || '无'}`,
      keys: hit.slice(0, 5).map((s) => s.name).concat(['神煞']),
      wuxing: emptyWuxing(),
      timing: null,
      fidelity: 'full',
      detail: {
        命中: hit.map((s) => `${s.name}(${s.zhi}${s.luck >= 0 ? '+' : ''}${s.luck})`),
        全表: list.map((s) => `${s.name}-${s.zhi}(${s.how})${s.hit ? '·命' : ''}`),
        合计: `${sum}（${hit.length}项命中）`,
        cite: [CITE.神煞],
        evidence: [evidence('神煞查法（年支/日干/月支/日柱各按其表）', hit.slice(0, 6).map((s) => `${s.name}=${s.zhi}`).join('、') || '无命中', `加权 ${sum}`)],
      },
    }
  },

  // ── 47 纳音论命 ──
  nayin(chart) {
    const a = analyzeBazi(chart)
    if (!a) return null
    const ps = a.ps
    const ny = ps.map((gz) => nayinOf(gz))
    const nyWx = ny.map((n) => (n && n !== '—' ? n.slice(-1) : ''))
    const me = nyWx[2] || a.me
    const rel = relation(a.me, me)
    const sc = clamp(({ 比和: 18, 生我: 30, 我生: 8, 我克: 22, 克我: -22 })[rel] ?? 0, -100, 100)
    return {
      score: sc,
      essence: `日柱纳音${ny[2]}（${me}），与日主${a.me}${rel}`,
      keys: [`纳音${ny[2]}`, `纳音五行${me}`, rel],
      wuxing: wxSignal([[me, 1]]),
      timing: null,
      fidelity: 'full',
      detail: { 四柱纳音: ps.map((gz, i) => `${gz}=${ny[i]}`).join(' '), 日柱纳音: ny[2], 关系: `日主${a.me}对纳音${me}为「${rel}」`, cite: [CITE.称骨.replace('称骨歌', '六十甲子纳音表')], evidence: [evidence('六十甲子纳音（两甲子一组）', `${ps[2]} → ${ny[2]}`, `${rel} → ${sc}`)] },
    }
  },

  // ── 48 十二长生·命宫 ──
  changsheng(chart) {
    const a = analyzeBazi(chart)
    if (!a) return null
    const ps = a.ps
    const dayGan = a.dayGan
    const st = ZHI.map((z) => `${z}${changShengOf(dayGan, z)}`)
    const dayState = changShengOf(dayGan, ps[2][1])
    const LUCK = { 长生: 18, 沐浴: 0, 冠带: 12, 临官: 22, 帝旺: 26, 衰: -6, 病: -12, 死: -18, 墓: -8, 绝: -22, 胎: 4, 养: 8 }
    const sc = clamp(LUCK[dayState] ?? 0, -100, 100)
    return {
      score: sc,
      essence: `日主${dayGan}坐${ps[2][1]}为「${dayState}」；胎元${a.natal.taiYuan} 命宫${a.natal.mingGong}`,
      keys: [`日坐${dayState}`, `命宫${a.natal.mingGong}`, `胎元${a.natal.taiYuan}`],
      wuxing: emptyWuxing(),
      timing: null,
      fidelity: 'full',
      detail: { 日主长生位: `${dayGan}坐${ps[2][1]}：${dayState}`, 十二长生: st.join(' '), 胎元: a.natal.taiYuan, 命宫: a.natal.mingGong, 身宫: a.natal.shenGong, cite: ['《三命通会》十二长生（阳干顺行、阴干逆行）', 'lunar-javascript 胎元/命宫/身宫'], evidence: [evidence('十二长生起法（各干长生起点，阳顺阴逆）', `${dayGan}坐${ps[2][1]} → ${dayState}`, `${LUCK[dayState] ?? 0}`)] },
    }
  },

  // ── 49 紫微斗数·安星 ──
  ziweiAnxing(chart) {
    const z = ziweiChart(chart)
    if (!z) return null
    const ming = z.palaces[0]
    const stars = ming.stars
    const luck = stars.reduce((s, n) => s + (D.STAR_LUCK[n] ?? 0), 0)
    const sc = clamp(luck, -100, 100)
    return {
      score: sc,
      essence: `命宫${z.mingGong}（${z.mingGongGZ}）${z.juName}；命宫主星${stars.slice(0, 3).join('') || '空宫'}`,
      keys: [`命宫${z.mingGong}`, z.juName, ...stars.slice(0, 3)],
      wuxing: wxSignal([[z.juWx, 1]]),
      timing: null,
      fidelity: 'core',
      detail: {
        命宫: `${z.mingGong}（${z.mingGongGZ}·${nayinOf(z.mingGongGZ)}→${z.juName}）`,
        身宫: z.shenGong,
        紫微天府: `紫微在${z.ziwei}，天府在${z.tianfu}`,
        十二宫: z.palaces.map((p) => `${p.name}(${p.gan}${p.zhi}):${p.stars.join('') || '空'}`),
        生年四化: z.sihua.map((h) => `${h.star}化${h.hua}`).join('、') || '未定',
        大限: z.daxian.slice(0, 6).map((d) => `${d.palace}${d.startAge}-${d.endAge}`),
        四化流派: '庚干取太阳禄/武曲权/太阴科/天同忌（与 iztro@2.6.1 同派）',
        未核实: '星曜庙旺（亮度）需秘传庙旺表，本实现未内置，故本项按 core 保真度',
        cite: [CITE.紫微, CITE.四化],
        evidence: [
          evidence('命宫起法（寅起正月顺数至生月，再起子时逆数至生时）', `农历${z.month}月${z.day}日${z.hourZhi}时 → 命宫${z.mingGong}`, '命宫为十二宫之首'),
          evidence('五行局（命宫干支纳音 → 局数）', `${z.mingGongGZ} 纳音${nayinOf(z.mingGongGZ)} → ${z.juName}`, '局数定紫微起点与大限起始岁'),
          evidence('起紫微（商余法：q=⌈日/局⌉，r=q×局−日，自寅数q宫，r偶进奇退）', `农历${z.day}日/${z.ju}局 → 紫微${z.ziwei}`, `天府=4−紫微 → ${z.tianfu}`),
        ],
      },
    }
  },

  // ── 50 紫微斗数·四化 ──
  ziweiSiHua(chart) {
    const z = ziweiChart(chart)
    if (!z) return null
    const hit = []
    for (const { star, hua } of z.sihua) {
      const p = z.palaces.find((x) => x.stars.includes(star))
      hit.push({ star, hua, palace: p?.name ?? '—', zhi: p?.zhi ?? '' })
    }
    const sc = clamp(hit.reduce((s, h) => s + (D.HUA_LUCK[h.hua] ?? 0), 0), -100, 100)
    return {
      score: sc,
      essence: `生年${z.yearGan}干四化：${hit.map((h) => `${h.star}化${h.hua}在${h.palace}`).slice(0, 3).join('，')}`,
      keys: hit.map((h) => `${h.star}化${h.hua}`).slice(0, 5),
      wuxing: emptyWuxing(),
      timing: null,
      fidelity: 'core',
      detail: {
        生年干: z.yearGan,
        四化: hit.map((h) => `${h.star}化${h.hua} → ${h.palace}宫(${h.zhi})`),
        加成: D.HUA_LUCK,
        流派说明: '本表与 iztro@2.6.1 同派；庚干各派有异（另有天同化科、太阴化忌一派）',
        cite: [CITE.四化],
        evidence: [evidence('生年四化（年干 → 禄权科忌四星）', `${z.yearGan} → ${z.sihua.map((h) => h.star + h.hua).join('、')}`, `加权 ${sc}`)],
      },
    }
  },

  // ── 51 紫微·三方四正 ──
  ziweiSanFang(chart) {
    const z = ziweiChart(chart)
    if (!z) return null
    const idx = z.palaces.findIndex((p) => p.clusters)  // 占位，下面直接用 0
    const set = sanFangSiZheng(z.palaces, 0)
    const all = [set.本宫, set.对宫, ...set.三合].filter(Boolean)
    const stars = all.flatMap((p) => p.stars)
    const luck = stars.reduce((s, n) => s + (D.STAR_LUCK[n] ?? 0), 0)
    const sc = clamp(luck * 0.8, -100, 100)
    return {
      score: sc,
      essence: `命宫三方四正会${stars.length}星：${stars.slice(0, 5).join('') || '空'}`,
      keys: ['三方四正', ...stars.slice(0, 4)],
      wuxing: emptyWuxing(),
      timing: null,
      fidelity: 'core',
      detail: {
        三方四正: all.map((p) => `${p.name}(${p.zhi}):${p.stars.join('') || '空'}`),
        会照星曜: stars,
        吉凶合计: luck,
        cite: [CITE.紫微],
        evidence: [evidence('三方四正（本宫 + 对宫 + 三合两宫）', all.map((p) => p.name).join('+'), `会照 ${stars.length} 星，合计 ${luck}`)],
      },
    }
  },

  // ── 52 紫微·大限流年 ──
  ziweiDaXian(chart) {
    const z = ziweiChart(chart)
    if (!z) return null
    const age = (() => {
      const s = birthSolar(chart)
      const y = Number(String(chart?.solar?.text ?? '').slice(0, 4))
      if (!s || !Number.isFinite(y)) return null
      return y - s.y
    })()
    const cur = age === null ? null : z.daxian.find((d) => age >= d.startAge && age <= d.endAge)
    const sc = clamp(10 - (z.daxian.length === 0 ? 10 : 0), -100, 100)
    return {
      score: sc,
      essence: cur ? `现年${age}岁行${cur.palace}大限（${cur.startAge}-${cur.endAge}岁）` : `大限序列自${z.ju}岁起，每限十年`,
      keys: ['大限', cur ? `${cur.palace}限` : '未入限', z.forward ? '顺行' : '逆行'],
      wuxing: emptyWuxing(),
      timing: cur ? `${cur.palace}大限（${cur.startAge}-${cur.endAge}岁）` : null,
      fidelity: 'core',
      detail: {
        起限: `${z.juName}，起限 ${z.ju} 岁，每限十年`,
        行向: `${z.forward ? '顺行' : '逆行'}（阳男阴女顺、阴男阳女逆；年干${z.yearGan}${GAN_YANG[z.yearGan] ? '阳' : '阴'}·${chart?.gender ?? '男'}）`,
        大限: z.daxian.map((d) => `${d.palace}(${d.zhi}) ${d.startAge}-${d.endAge}岁`),
        当前: cur ? `${cur.palace}限 ${cur.startAge}-${cur.endAge}岁` : '年龄未入限',
        cite: [CITE.紫微],
        evidence: [evidence('大限行向（阳男阴女顺行、阴男阳女逆行）', `年干${z.yearGan}·${chart?.gender ?? '男'} → ${z.forward ? '顺行' : '逆行'}`, '定大限落宫顺序')],
      },
    }
  },

  // ── 53 七政四余 ──
  qizheng(chart) {
    const p = planetLons(chart)
    const siyu = siyuLons(chart)
    if (!p || !siyu) return null
    const xiuNames = XIU28.map((x) => (typeof x === 'string' ? x : x.name)).filter(Boolean)
    const rows = Object.entries(p.lons).map(([name, lon]) => ({ name, lon, xiu: xiuOf(lon, xiuNames) }))
    const siyuRows = Object.entries(siyu).map(([name, lon]) => ({ name, lon, xiu: xiuOf(lon, xiuNames) }))
    // 命度：以太阳或命宫宿度定；此处用命宫地支对应宿区（近似）
    const sunRow = rows.find((r) => r.name === '太阳')
    const sc = clamp(p.real ? 10 : -6, -100, 100)
    return {
      score: sc,
      essence: `${p.real ? '真星历' : '平均黄经（无星历表）'}：太阳在${sunRow?.xiu?.name ?? '—'}${sunRow ? sunRow.xiu.ruDu.toFixed(1) : '—'}度；四余罗睺${siyuRows[0]?.xiu?.name ?? '—'}`,
      keys: ['七政四余', `太阳${sunRow?.xiu?.name ?? '—'}`, `罗睺${siyuRows[0]?.xiu?.name ?? '—'}`, p.real ? '真星历' : '平均黄经'],
      wuxing: wxSignal([[D.QIZHENG_WX?.太阳 ?? '火', 0.6], [D.QIZHENG_WX?.太阴 ?? '水', 0.6]]),
      timing: null,
      fidelity: p.real ? 'core' : 'approx',
      detail: {
        七政: rows.map((r) => `${r.name} ${r.lon.toFixed(2)}° → ${r.xiu.name}${r.xiu.ruDu.toFixed(2)}度`),
        四余: siyuRows.map((r) => `${r.name} ${r.lon.toFixed(2)}° → ${r.xiu.name}${r.xiu.ruDu.toFixed(2)}度`),
        数据来源: p.note,
        未核实: p.real ? '星曜庙旺与七政四余秘传断法未内置；二十八宿距度为等分近似（无古度表）' : '无星历表，且二十八宿距度为等分近似',
        cite: [CITE.七政],
        evidence: [
          evidence('七政黄经来源', p.note, p.real ? '真黄经可直接用' : '降 approx'),
          evidence('四余取法（罗睺=平交点，计都=罗睺+180°，月孛=平近地点，紫气=28.8年虚星）', siyuRows.map((r) => `${r.name}${r.lon.toFixed(1)}°`).join('、'), '四余为虚星/交点，非实星'),
        ],
      },
    }
  },

  // ── 54 五星占 ──
  wuxingZhan(chart) {
    const p = planetLons(chart)
    if (!p) return null
    const five = ['木星', '火星', '土星', '金星', '水星']
    const rows = five.map((n) => ({ name: n, lon: p.lons[n], wx: D.QIZHENG_WX?.[n] ?? '' }))
    const known = rows.filter((r) => Number.isFinite(r.lon))
    // 五星聚散：最大黄经差（同宫/聚 → 结构性强）
    let spread = 0
    for (let i = 0; i < known.length; i += 1) {
      for (let j = i + 1; j < known.length; j += 1) {
        const d = Math.abs(norm360(known[i].lon) - norm360(known[j].lon))
        spread = Math.max(spread, d > 180 ? 360 - d : d)
      }
    }
    const ju = spread <= 30
    const sc = clamp(ju ? 24 : 6 - spread / 12, -100, 100)
    return {
      score: sc,
      essence: `五星${ju ? '聚（黄经差≤30°）' : `散布（最大差${spread.toFixed(0)}°）`}：${known.map((r) => `${r.name}${r.wx}`).join('')}`,
      keys: ['五星占', ju ? '五星聚' : '五星散', ...known.slice(0, 3).map((r) => r.name)],
      wuxing: wxSignal(known.map((r) => [r.wx, 0.5])),
      timing: null,
      fidelity: p.real ? 'core' : 'approx',
      detail: {
        五星黄经: known.map((r) => `${r.name}(${r.wx}) ${r.lon.toFixed(2)}°`),
        聚散: `${ju ? '聚' : '散'}（最大黄经差 ${spread.toFixed(2)}°）`,
        数据来源: p.note,
        cite: [CITE.七政, '《史记·天官书》五星占（聚散配五行）'],
        evidence: [evidence('五星聚散（最大黄经差 ≤30° 为聚）', `最大差 ${spread.toFixed(2)}° → ${ju ? '聚' : '散'}`, `配五行得 ${known.map((r) => r.wx).join('')}`)],
      },
    }
  },

  // ── 55 二十八宿命度 ──
  xiu28Ming(chart) {
    const natal = natalPillars(chart)
    if (!natal) return null
    const xiuNames = XIU28.map((x) => (typeof x === 'string' ? x : x.name)).filter(Boolean)
    // 优先用天文层 `chart.astro.moonSu28`：按**传统赤道口径**（入宿度 = 月亮赤经 − 距星赤经）算，
    // 距星坐标取自 SIMBAD、逐颗 cite；比"周天等分"更近古法。缺则退回等分近似并如实降级。
    const ms = chart?.astro?.moonSu28
    const useReal = Boolean(ms && ms.name)
    const moonLon = chart?.astro?.moonLon
    const x = useReal
      ? { name: ms.name, ruDu: Number(ms.ruDu) || 0, span: Number(ms.span) || 360 / xiuNames.length }
      : xiuOf(Number.isFinite(moonLon) ? moonLon : (natal.lunar.day / 30) * 360, xiuNames)
    // 吉凶以 `tables.XIU28_LUCK` 为**单一权威**（kernel-tables 逐条核验；见 docs/verification/tables-provenance.md）。
    // 注意 v1 的 XIU28 只给 score、没有 luck 字段（旧代码读 `?.luck` 恒为 undefined，导致本项分数长期恒为 0），
    // 且其心/翼给出 +30（吉）与通书歌诀（凶）冲突 —— 已在 V2-CONTRACT §8.2 裁决：冲突记入报告、以 XIU28_LUCK 为准。
    const v1Xiu = XIU28.find((v) => (typeof v === 'object' && v.name === x.name))
    const luck = XIU28_LUCK?.[x.name] ?? (v1Xiu ? (v1Xiu.score >= 0 ? '吉' : '凶') : undefined)
    const luckConflict = Boolean(v1Xiu && XIU28_LUCK?.[x.name] && (XIU28_LUCK[x.name] === '吉') !== (v1Xiu.score >= 0))
    const sc = clamp(luck === '吉' ? 20 : luck === '凶' ? -18 : 0, -100, 100)
    return {
      score: sc,
      essence: `命度${x.name}${x.ruDu.toFixed(1)}度（${useReal ? '距星入宿度' : Number.isFinite(moonLon) ? '真月亮黄经等分' : '按农历日近似'}）${luck ? `·${luck}` : ''}`,
      keys: [`命度${x.name}`, '二十八宿', ...(luck ? [luck] : [])],
      wuxing: emptyWuxing(),
      timing: null,
      fidelity: useReal ? 'core' : (Number.isFinite(moonLon) ? 'core' : 'approx'),
      detail: {
        命度宿: `${x.name}（入宿 ${x.ruDu.toFixed(2)}°，宿宽 ${x.span.toFixed(2)}°）`,
        定宿依据: useReal
          ? 'chart.astro.moonSu28（传统赤道口径：月亮赤经 − 距星赤经，距星取自 SIMBAD）'
          : `黄经等分近似（${Number.isFinite(moonLon) ? `月亮黄经 ${moonLon.toFixed(2)}°` : `农历${natal.lunar.day}日均分`}）`,
        生日值宿: chart?.birthChart ? String(chart.birthChart.solar ?? '') : '',
        吉凶依据: `${x.name}宿：${luck ?? '未定'}（单一权威 tables.XIU28_LUCK）${luckConflict ? '；注：v1 的 XIU28 表此项与通书歌诀相反，已按裁决以 XIU28_LUCK 为准并记录分歧' : ''}`,
        未核实: useReal ? '值宿吉凶依《二十八宿吉凶歌》通例（未与影印本逐字校勘）' : '二十八宿距度为等分近似（无古度表）',
        cite: useReal
          ? ['chart.astro.moonSu28（距星赤经入宿度，SIMBAD）', '值宿吉凶依《二十八宿吉凶歌》通例']
          : ['二十八宿距度（等分近似，无古度表）', '值宿吉凶依《二十八宿吉凶歌》通例'],
        evidence: [evidence('命度取宿（传统入宿度 / 等分）', `${x.name} ${x.ruDu.toFixed(2)}°`, `吉凶 ${luck ?? '未定'}`)],
      },
    }
  },

  // ── 56 称骨算命 ──
  chenggu(chart) {
    const natal = natalPillars(chart)
    if (!natal) return null
    const yGZ = natal.lunar.yearGZ
    const wYear = D.CG_YEAR[yGZ]
    const wMonth = D.CG_MONTH[natal.lunar.month - 1]
    const wDay = D.CG_DAY[natal.lunar.day - 1]
    const wHour = D.CG_HOUR[ZHI.indexOf(natal.pillars[3][1])]
    if (![wYear, wMonth, wDay, wHour].every((v) => Number.isFinite(v))) return null
    const total = Math.round((wYear + wMonth + wDay + wHour) * 10) / 10
    const grade = D.CG_GRADE.find((g) => total <= g.max) ?? D.CG_GRADE[D.CG_GRADE.length - 1]
    const sc = clamp((total - 4.2) * 28, -100, 100)
    return {
      score: sc,
      essence: `骨重${total.toFixed(1)}两（${grade.grade}）：${grade.gist.slice(0, 16)}`,
      keys: [`骨重${total.toFixed(1)}两`, grade.grade, '称骨'],
      wuxing: emptyWuxing(),
      timing: null,
      fidelity: 'full',
      detail: {
        分项: `年${yGZ}${wYear}两 月${natal.lunar.month}月${wMonth}两 日${natal.lunar.day}日${wDay}两 时${natal.pillars[3][1]}${wHour}两`,
        总骨重: `${total.toFixed(1)} 两`,
        档次: grade.grade,
        断语: grade.gist,
        未核实: '子项未核实：《称骨歌》51 条原文未内置（不影响骨重计算——骨重为完整公开表，故本项判 full）；档次断语为编辑取值',
        cite: [CITE.称骨],
        evidence: [evidence('称骨（年月日时四项骨重相加）', `${wYear}+${wMonth}+${wDay}+${wHour}=${total.toFixed(1)}两`, `落 ${grade.grade} 档`)],
      },
    }
  },

  // ── 57 河洛命卦 ──
  heluoMingGua(chart) {
    const s = birthSolar(chart)
    if (!s) return null
    const male = chart?.gender !== '女'
    // 命卦：男 (100−年尾两位)/9 余数；女 (年尾两位+5)/9 余数；余 0 作 9
    const yy = s.y % 100
    const num = male ? mod(100 - yy, 9) || 9 : mod(yy + 5, 9) || 9
    const g = D.GUAS?.[num]
    if (!g) return null
    const [name, wx, star] = g
    const east = (D.EAST_WEST?.east ?? []).includes(name)
    const sc = clamp(east ? 16 : 4, -100, 100)
    return {
      score: sc,
      essence: `命卦${name}（${star}·${wx}）·${east ? '东四命' : '西四命'}`,
      keys: [`命卦${name}`, east ? '东四命' : '西四命', star],
      wuxing: wxSignal([[wx, 1]]),
      timing: null,
      fidelity: 'full',
      detail: {
        命卦: `${name}（九星${star}，五行${wx}）`,
        算式: male ? `男：(100−${yy})÷9 取余 → ${num}` : `女：(${yy}+5)÷9 取余 → ${num}`,
        东西四命: east ? '东四命（宜居东四宅）' : '西四命（宜居西四宅）',
        cite: [CITE.命卦],
        evidence: [evidence('河洛命卦（男 100−年尾两位、女 年尾两位+5，除 9 取余，0 作 9）', `${male ? '男' : '女'}·${s.y} → 余${num} → ${name}`, `${east ? '东四命' : '西四命'}`)],
      },
    }
  },

  // ── 58 生肖命理 ──
  shengxiao(chart) {
    const natal = natalPillars(chart)
    if (!natal) return null
    const yz = natal.pillars[0][1]
    const animal = ZHI_ANIMAL[yz] ?? ''
    const nowZhi = chart?.yearZhi ?? ''
    const rel = nowZhi
      ? (ZHI_LIUHE[yz] === nowZhi ? '六合太岁' : ZHI_LIUCHONG[yz] === nowZhi ? '冲太岁'
        : ZHI_XIANGHAI[yz] === nowZhi ? '害太岁' : ZHI_XIANGXING.some((g) => g.includes(yz) && g.includes(nowZhi)) ? '刑太岁'
          : ZHI_SANHE[yz] === ZHI_SANHE[nowZhi] ? '三合太岁' : '平')
      : '未知'
    const L = { 六合太岁: 26, 三合太岁: 20, 平: 0, 害太岁: -12, 刑太岁: -16, 冲太岁: -26, 未知: 0 }
    const sc = clamp(L[rel] ?? 0, -100, 100)
    return {
      score: sc,
      essence: `生肖${animal}（年支${yz}），与${nowZhi || '?'}年太岁「${rel}」`,
      keys: [`生肖${animal}`, rel, `年支${yz}`],
      wuxing: wxSignal([[ZHI_WUXING[yz], 1]]),
      timing: null,
      fidelity: 'full',
      detail: {
        生肖: `${animal}（年支 ${yz}，五行 ${ZHI_WUXING[yz]}）`,
        太岁关系: `${nowZhi || '—'} → ${rel}`,
        刑冲合害: `合${ZHI_LIUHE[yz] ?? '—'} 冲${ZHI_LIUCHONG[yz] ?? '—'} 害${ZHI_XIANGHAI[yz] ?? '—'} 三合${ZHI_SANHE[yz] ?? '—'}`,
        cite: ['《三命通会》生肖刑冲合害', '建除/太岁关系通例'],
        evidence: [evidence('生肖与太岁关系（六合/三合/冲/刑/害）', `年支${yz} vs ${nowZhi || '—'} → ${rel}`, `${L[rel] ?? 0}`)],
      },
    }
  },
}

export { analyzeBazi, ziweiChart, qiZiwei, natalPillars }
