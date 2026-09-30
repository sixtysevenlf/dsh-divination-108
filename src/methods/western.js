/**
 * 方法模块 · 西方占卜（4 法：占星本命 / 占星合盘 / 塔罗三牌 / 卢恩符文）
 *
 * 契约见 src/core/runner.js 顶部注释；结构参照 src/methods/yijing.js。
 * 私有数据（78 张塔罗牌义、24 符文义）在 ./data/western.js。
 *
 * ## 本模块的公开口径（写在明处，便于复核）
 *
 * ### 一、元素 → 五行桥接（为与中式 108 法合盘而设，非西方本有概念）
 * 火→火 ｜ 地→土 ｜ 风→金 ｜ 水→水 ｜ 木→木（仅生命/成长类牌，如皇后、贝卡纳）
 *
 * ### 二、简化星历（**无星历表，全部是平均运动近似**）
 * - 儒略日 d = JD − 2451545.0（J2000.0 起算），JD 由出生公历时刻用 Date.UTC 推得（不读时钟）。
 * - 太阳：平黄经 L☉ = 280.460 + 0.9856474·d，再加**中心差**（Astronomical Almanac 低精度
 *   太阳坐标公式，公开）：g = 357.528 + 0.9856003·d，
 *   λ☉ = L☉ + 1.915·sin g + 0.020·sin 2g（精度约 0.01°，星座边界因此与公历区间表一致）。
 * - 月亮黄经 λ☾ ≈ 218.316 + 13.176396·d（未做出差/二均差等周期项，误差可达数度）。
 * - 水/金/火黄经用各自 J2000 平黄经 + 平均会合运动（水星 4.092334°/日、金星 1.602130°/日、
 *   火星 0.524033°/日），即 87.97 / 224.70 / 686.98 天的公转周期。**这是把行星平黄经直接当地心
 *   黄经用的粗糙代法（未做地心视差、偏心率与摄动修正），误差远大于日月，只作粗略参考。**
 * - **上升星座（近似）**：λAsc ≈ λ☉ + 90° + (出生时 − 12h) × 15°
 *   （正午时太阳近中天，上升约在太阳黄经前 90°；每过 1 小时天球转 15°。）
 *   **未计入出生地经纬、黄道倾角与地理纬度，误差可达一个星座以上，只作结构参考。**
 * - 宫位：等宫制近似，上升星座起第一宫，每宫 30°，宫名取 tables.js 的 ASTRO_HOUSES。
 *
 * ### 三、相位口径
 * 合 0°(±8) / 六合 60°(±6) / 刑 90°(±8) / 三合 120°(±8) / 冲 180°(±8)，其余为无相位。
 * 星座关系（按星座序差）：同座=共鸣、三合=同元素和谐、六合=元素相生、对宫=互补张力、刑=冲突。
 *
 * ### 四、塔罗 / 卢恩
 * 78 张韦特体系牌义、24 个 Elder Futhark 符文义均为**公开资料**，见 ./data/western.js；
 * 牌义倾向分是本插件为合盘所给的近似数值，不是传统数值。逆位读法各家不一，卢恩取通行 merkstave 读法。
 */

import { clamp, emptyWuxing, mod, weightedScore } from '../core/kit.js'
import { ZODIAC, ASTRO_HOUSES } from '../core/tables.js'
import { TAROT, RUNES, AETTIR, ELEMENT_WX } from './data/western.js'

// ───────────────────────── 占星：简化星历 ─────────────────────────

/** J2000.0 儒略日。 */
const J2000 = 2451545.0
/** 太阳平黄经与日均运动（度/日）。 */
const SUN_L0 = 280.46
const SUN_N = 0.9856474
/** 太阳平近点角基数与日均运动（中心差用）。 */
const SUN_G0 = 357.528
const SUN_GN = 0.9856003
/** 月亮平黄经与日均运动。 */
const MOON_L0 = 218.316
const MOON_N = 13.176396
/** 水星 / 金星 / 火星（J2000 平黄经 + 日均运动）。 */
const PLANETS = [
  { key: '水星', L0: 252.25084, n: 4.09233445 },
  { key: '金星', L0: 181.97973, n: 1.60213034 },
  { key: '火星', L0: 355.45332, n: 0.52403304 },
]

/** 黄经 0° 起的十二星座名（0–30 白羊 … 330–360 双鱼）。 */
const SIGN_BY_LON = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼']
/** 星座名 → ZODIAC 表项。 */
const ZODIAC_BY_NAME = Object.fromEntries(ZODIAC.map((z) => [z.name, z]))
/** 元素相生（风助火、水润地）。 */
const ELEM_FRIEND = { 火: ['风'], 风: ['火'], 地: ['水'], 水: ['地'] }

/**
 * 黄经 → 星座（含元素、五行、座内度数）。
 *
 * 五行一律**由 element 按本模块口径映射**（火→火、地→土、风→金、水→水），不直接取 ZODIAC 表的
 * `wx` 字段：共享表里水瓶座写的是 `element:'风'` 而 `wx:'土'`，与该口径不符，以 element 为准。
 * @param {number} lon 黄经（度，任意实数）。
 * @returns {{name:string, element:string, wx:string, deg:number, lon:number}} 星座信息。
 */
function signOfLon(lon) {
  const L = mod(Number.isFinite(lon) ? lon : 0, 360)
  const idx = Math.floor(L / 30) % 12
  const name = SIGN_BY_LON[idx]
  const z = ZODIAC_BY_NAME[name]
  const el = z?.element ?? '火'
  return { name, element: el, wx: ELEMENT_WX[el] ?? z?.wx ?? '火', deg: L - idx * 30, lon: L }
}

/**
 * 按公历月日查 ZODIAC 表（**摩羯跨年 12/22–1/19 需特判**）。
 * 用于与黄经推算互相校验。
 * @param {number} m 月（1–12）。
 * @param {number} d 日。
 * @returns {object|null} ZODIAC 表项。
 */
function signByDate(m, d) {
  for (const z of ZODIAC) {
    const [fm, fd] = z.from
    const [tm, td] = z.to
    if (fm <= tm) {
      if ((m === fm && d >= fd) || (m === tm && d <= td) || (m > fm && m < tm)) return z
    } else if ((m === fm && d >= fd) || (m === tm && d <= td)) {
      return z // 跨年区间（摩羯）
    }
  }
  return null
}

/** 公历日期是否合法。 */
function validDate(y, m, d) {
  if (!Number.isInteger(y) || y < 1000 || y > 2999) return false
  if (!Number.isInteger(m) || m < 1 || m > 12) return false
  if (!Number.isInteger(d) || d < 1 || d > 31) return false
  const dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return d <= dim[m - 1]
}

/**
 * 儒略日（由公历分量经 Date.UTC 推得，不读系统时钟）。
 * @param {number} y 年。
 * @param {number} m 月。
 * @param {number} d 日。
 * @param {number} h 时。
 * @param {number} mi 分。
 * @returns {number} 儒略日。
 */
function julianDay(y, m, d, h, mi) {
  return Date.UTC(y, m - 1, d, h, mi, 0) / 86400000 + 2440587.5
}

/**
 * 从文本里提取「年-月-日 [时:分 / N时]」。合盘取对方生日用。
 * @param {string} text 文本。
 * @returns {{y:number,m:number,d:number,h:number,mi:number}|null} 出生分量。
 */
function birthFromText(text) {
  const t = String(text ?? '')
  const m = /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/.exec(t)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!validDate(y, mo, d)) return null
  const tail = t.slice(m.index, m.index + 40)
  let h = 12
  let mi = 0
  const t1 = /(\d{1,2})\s*[:：]\s*(\d{1,2})/.exec(tail)
  const t2 = /(\d{1,2})\s*[时点]/.exec(tail)
  if (t1 && Number(t1[1]) <= 23 && Number(t1[2]) <= 59) { h = Number(t1[1]); mi = Number(t1[2]) } else if (t2 && Number(t2[1]) <= 23) { h = Number(t2[1]) }
  return { y, m: mo, d, h, mi }
}

/**
 * 造一张「本命盘」（日月升 + 水金火 + 等宫宫位）。全部为平均运动近似。
 * @param {{y:number,m:number,d:number,h:number,mi:number}} b 出生分量。
 * @returns {object|null} 本命盘；输入非法返回 null。
 */
function natalOf(b) {
  if (!b || !validDate(b.y, b.m, b.d)) return null
  const h = Number.isFinite(b.h) ? clamp(b.h, 0, 23) : 12
  const mi = Number.isFinite(b.mi) ? clamp(b.mi, 0, 59) : 0
  const day = julianDay(b.y, b.m, b.d, h, mi) - J2000

  // 太阳：平黄经 + 中心差（公开的低精度太阳坐标公式，精度约 0.01°）
  const g = mod(SUN_G0 + SUN_GN * day, 360) * (Math.PI / 180)
  const sun = signOfLon(SUN_L0 + SUN_N * day + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g))
  const moon = signOfLon(MOON_L0 + MOON_N * day)
  // 上升近似：正午太阳近中天（MC ≈ λ☉），上升约在前 90°；每 1 小时天球转 15°。
  const ascLon = mod(sun.lon + 90 + (h + mi / 60 - 12) * 15, 360)
  const asc = signOfLon(ascLon)

  const others = {}
  for (const p of PLANETS) others[p.key] = signOfLon(p.L0 + p.n * day)

  const bodies = [sun, moon, others.水星, others.金星, others.火星]
  const houses = bodies.map((x) => Math.floor(mod(x.lon - ascLon, 360) / 30) + 1)

  return {
    birth: `${b.y}-${String(b.m).padStart(2, '0')}-${String(b.d).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`,
    ymd: { y: b.y, m: b.m, d: b.d },
    day,
    sun, moon, asc, ascLon,
    mercury: others.水星, venus: others.金星, mars: others.火星,
    bodies, houses,
  }
}

/**
 * 黄经夹角 → 相位。
 * @param {number} sepA 黄经差（度）。
 * @returns {{name:string, score:number, note:string, angle:number}} 相位。
 */
function aspectOf(sepA) {
  const a = mod(Number.isFinite(sepA) ? sepA : 0, 360)
  const s = a > 180 ? 360 - a : a
  if (s <= 8) return { name: '合', score: 40, note: '同源共鸣', angle: s }
  if (Math.abs(s - 60) <= 6) return { name: '六合', score: 50, note: '顺畅协作', angle: s }
  if (Math.abs(s - 90) <= 8) return { name: '刑', score: -55, note: '张力冲突', angle: s }
  if (Math.abs(s - 120) <= 8) return { name: '三合', score: 60, note: '天赋顺流', angle: s }
  if (Math.abs(s - 180) <= 8) return { name: '冲', score: -20, note: '两极对拉', angle: s }
  return { name: '无相位', score: 0, note: '彼此独立', angle: s }
}

/**
 * 星座序差 → 星座关系（同座/三合/六合/对宫/刑）。
 * @param {object} pa 甲方星座。
 * @param {object} pb 乙方星座。
 * @returns {{name:string, score:number, note:string}} 关系。
 */
function signRelation(pa, pb) {
  const ia = SIGN_BY_LON.indexOf(pa?.name)
  const ib = SIGN_BY_LON.indexOf(pb?.name)
  if (ia < 0 || ib < 0) return { name: '未知', score: 0, note: '—' }
  const diff = mod(ib - ia, 12)
  const d = Math.min(diff, 12 - diff)
  if (d === 0) return { name: '同座', score: 10, note: '共鸣' }
  if (d === 4) return { name: '三合', score: 8, note: '同元素和谐' }
  if (d === 2) return { name: '六合', score: 6, note: '元素相生' }
  if (d === 6) return { name: '对宫', score: 2, note: '互补张力' }
  if (d === 3) return { name: '刑', score: -8, note: '冲突' }
  return { name: '无关系', score: 0, note: '中性' }
}

/** 星盘结构说明（本命 / 合盘共用）。 */
const NATAL_NOTE = '太阳黄经用公开的低精度太阳坐标公式（平黄经＋中心差，误差约 0.01°）；月亮与水/金/火用 J2000 平均运动（月亮误差可达数度；行星是平黄经直接当地心黄经的粗代法，误差更大）；上升星座按「太阳黄经+90°+出生时角×15°」估算，未计出生地经纬与黄道倾角，误差可达一个星座以上。缺星历与出生地，故非实测盘。'
const SYNASTRY_NOTE = '上升星座与全部相位均由平均运动近似式推得（无星历表），结果仅供结构参考，不作吉凶定论。'

// ───────────────────────── 引擎实现 ─────────────────────────

export const engines = {
  // ── 105 西洋占星·本命 ──
  astroNatal(chart, entry, rand) {
    const b = birthFromText(chart?.birthChart?.solar)
    const n = natalOf(b)
    if (!n) return null

    const [sun, moon] = [n.sun, n.moon]
    const sunMoon = aspectOf(sun.lon - moon.lon)

    // 元素分布（五体 + 上升，共六点）
    const points = [...n.bodies, n.asc]
    const elem = { 火: 0, 地: 0, 风: 0, 水: 0 }
    for (const p of points) elem[p.element] = (elem[p.element] ?? 0) + 1
    const maxElem = Math.max(...Object.values(elem))
    const domElem = Object.entries(elem).sort((a, c) => c[1] - a[1])[0][0]
    const present = Object.values(elem).filter((v) => v > 0).length

    // 角宫/弱宫力量（1/4/7/10 强，3/6/9/12 弱）——公开通例
    const ANGULAR = [1, 4, 7, 10]
    const CADENT = [3, 6, 9, 12]
    let strength = 0
    for (const hh of n.houses) {
      if (ANGULAR.includes(hh)) strength += 8
      else if (CADENT.includes(hh)) strength -= 5
    }

    // 元素平衡与日月升协调
    let balance = present === 4 ? 12 : 0
    if (maxElem >= 4) balance -= 12
    const friendly = (a, c) => (a === c ? 10 : (ELEM_FRIEND[a]?.includes(c) ? 8 : -6))
    const harmony = friendly(sun.element, moon.element) + friendly(sun.element, n.asc.element)

    const score = clamp(sunMoon.score * 0.6 + balance + strength * 0.5 + harmony * 0.5, -100, 100)

    const wuxing = emptyWuxing()
    for (const p of points) wuxing[p.wx] += 1

    const daysToNext = Math.max(1, Math.round((30 - sun.deg) / SUN_N))
    const nextSign = signOfLon(sun.lon + (30 - sun.deg) + 0.01)
    const byDate = signByDate(n.ymd.m, n.ymd.d)

    const houseText = ASTRO_HOUSES
      .map((hn, i) => `${i + 1}${hn}:${signOfLon(n.ascLon + i * 30).name}`)
      .join(' ')

    return {
      score,
      essence: `太阳${sun.name} 月亮${moon.name} 上升${n.asc.name}·日月${sunMoon.name}`,
      keys: [
        `日${sun.name}`, `月${moon.name}`, `升${n.asc.name}`,
        `日月${sunMoon.name}`, `${domElem}象${maxElem}点`,
      ],
      wuxing,
      timing: `约${daysToNext}天后太阳入${nextSign.name}`,
      fidelity: 'core',
      detail: {
        出生: n.birth,
        太阳: `${sun.name} ${sun.deg.toFixed(1)}°（${sun.element}象·五行${sun.wx}）`,
        月亮: `${moon.name} ${moon.deg.toFixed(1)}°（${moon.element}象·五行${moon.wx}）`,
        上升: `${n.asc.name} ${n.asc.deg.toFixed(1)}°（${n.asc.element}象·五行${n.asc.wx}）`,
        三要素: `太阳${sun.name} ｜ 月亮${moon.name} ｜ 上升${n.asc.name}`,
        水星: `${n.mercury.name} ${n.mercury.deg.toFixed(1)}°`,
        金星: `${n.venus.name} ${n.venus.deg.toFixed(1)}°`,
        火星: `${n.mars.name} ${n.mars.deg.toFixed(1)}°`,
        行星落宫: `太阳${n.houses[0]}宫 月亮${n.houses[1]}宫 水星${n.houses[2]}宫 金星${n.houses[3]}宫 火星${n.houses[4]}宫（等宫制）`,
        十二宫: houseText,
        日月相位: `${sunMoon.name}（夹角 ${sunMoon.angle.toFixed(1)}°，${sunMoon.note}）`,
        元素分布: `火${elem.火} 地${elem.地} 风${elem.风} 水${elem.水}（${present}元素俱全${maxElem >= 4 ? '，偏枯' : ''}）`,
        生日区间校验: `按公历区间查 ZODIAC 表 → ${byDate?.name ?? '—'}${byDate?.name === sun.name ? '（与黄经推算一致）' : '（与黄经推算不同：区间表按固定日期，黄经含岁差与公式误差，以黄经为准）'}`,
        说明: NATAL_NOTE,
      },
    }
  },

  // ── 106 西洋占星·合盘 ──
  astroSynastry(chart, entry, rand) {
    // 甲方：本盘出生资料；缺则用本次求占时刻代盘（本条 need 为空，无出生资料也要能起）
    const aBirth = birthFromText(chart?.birthChart?.solar)
    const aFallback = !aBirth
    const s = chart?.solar ?? {}
    const A = natalOf(aBirth ?? { y: s.y, m: s.m, d: s.d, h: s.h ?? 12, mi: s.mi ?? 0 })
    if (!A) return null

    // 乙方：从所问里找日期；找不到就用 rand 造对照盘
    const bBirth = birthFromText(chart?.question)
    const bRandom = !bBirth
    const B = natalOf(bBirth ?? {
      y: 1965 + rand.below(45),
      m: 1 + rand.below(12),
      d: 1 + rand.below(28),
      h: rand.below(24),
      mi: 0,
    })
    if (!B) return null

    // 相位清单（含经典合盘配对）
    const PAIRS = [
      { k: 'sun', j: 'sun', label: '日-日', w: 1.4 },
      { k: 'moon', j: 'moon', label: '月-月', w: 1.6 },
      { k: 'asc', j: 'asc', label: '升-升', w: 1.2 },
      { k: 'sun', j: 'moon', label: '日-月', w: 1.2 },
      { k: 'moon', j: 'sun', label: '月-日', w: 1.2 },
      { k: 'sun', j: 'asc', label: '日-升', w: 0.9 },
      { k: 'asc', j: 'sun', label: '升-日', w: 0.9 },
      { k: 'venus', j: 'mars', label: '金-火', w: 1.3 },
      { k: 'mars', j: 'venus', label: '火-金', w: 1.1 },
    ]
    const items = []
    const list = []
    const aspByName = {}
    for (const p of PAIRS) {
      const a = A[p.k]
      const b = B[p.j]
      const asp = aspectOf(a.lon - b.lon)
      aspByName[p.label] = asp
      items.push({ score: asp.score, weight: p.w })
      list.push(`${p.label}：${a.name}${a.deg.toFixed(0)}° × ${b.name}${b.deg.toFixed(0)}° → ${asp.name}（${asp.note}，夹角 ${asp.angle.toFixed(1)}°）`)
    }
    const aspAvg = weightedScore(items)

    // 三要素星座关系
    const CORE = [['sun', 'sun', '日'], ['moon', 'moon', '月'], ['asc', 'asc', '升']]
    let signSum = 0
    const signList = []
    const coreRel = {}
    for (const [k, j, label] of CORE) {
      const r = signRelation(A[k], B[j])
      coreRel[label] = r
      signSum += r.score
      signList.push(`${label}-${label}：${A[k].name} × ${B[j].name} → ${r.name}（${r.note}）`)
    }
    const signAvg = signSum / CORE.length
    const score = clamp(aspAvg * 0.7 + signAvg * 2, -100, 100)

    const tag = score >= 45 ? '缘分相投' : score >= 20 ? '关系顺畅' : score >= 5 ? '尚可磨合' : score > -15 ? '需多经营' : score > -35 ? '张力偏大' : '磨合艰难'

    const wuxing = emptyWuxing()
    for (const p of [...A.bodies, A.asc, ...B.bodies, B.asc]) wuxing[p.wx] += 1

    const notes = []
    if (aFallback) notes.push('未提供你的出生资料，甲方以本次求占时刻代盘。')
    if (bRandom) notes.push('未提供对方出生资料，已随机取对照盘；请提供对方生日以得精确合盘。')
    else notes.push(`对方出生资料取自所问文本（${B.birth}）。`)
    notes.push(SYNASTRY_NOTE)

    return {
      score,
      essence: `日${A.sun.name}×${B.sun.name} 月${A.moon.name}×${B.moon.name} 升${A.asc.name}×${B.asc.name}·${tag}`,
      keys: [
        `日-日${aspByName['日-日'].name}`, `月-月${aspByName['月-月'].name}`, `升-升${aspByName['升-升'].name}`,
        `金-火${aspByName['金-火'].name}`, tag,
      ],
      wuxing,
      timing: null,
      fidelity: 'approx',
      detail: {
        甲方出生: A.birth,
        甲方三要素: `太阳${A.sun.name} 月亮${A.moon.name} 上升${A.asc.name}`,
        乙方出生: `${B.birth}${bRandom ? '（随机对照盘）' : ''}`,
        乙方三要素: `太阳${B.sun.name} 月亮${B.moon.name} 上升${B.asc.name}`,
        相位清单: list,
        星座关系: signList,
        关系评分: `相位加权 ${aspAvg.toFixed(1)} × 0.7 ＋ 星座关系 ${signAvg.toFixed(1)} × 2 → ${Math.round(score)}`,
        断: `${tag}：${coreRel.日.name === '同座' || coreRel.月.name === '同座' ? '核心同座，共鸣强' : coreRel.月.name === '刑' || coreRel.日.name === '刑' ? '核心见刑，需刻意磨合' : coreRel.月.name === '三合' || coreRel.日.name === '三合' ? '核心三合，相处顺流' : '核心关系中性，成败多在经营'}`,
        说明: notes.join(''),
      },
    }
  },

  // ── 107 塔罗·三牌阵 ──
  tarot(chart, entry, rand) {
    if (!Array.isArray(TAROT) || TAROT.length === 0) return null
    const spread = entry?.params?.spread === 'single' ? 'single' : 'three'
    const positions = spread === 'single'
      ? [{ name: '指引', w: 1 }]
      : [{ name: '过去', w: 0.2 }, { name: '现在', w: 0.4 }, { name: '未来', w: 0.4 }]

    const deck = rand.shuffle(TAROT)
    const draws = positions.map((pos, i) => {
      const card = deck[i] ?? TAROT[i % TAROT.length]
      const rev = rand.chance(0.5)
      return { pos, card, rev, score: rev ? card.rs : card.us }
    })

    const base = weightedScore(draws.map((d) => ({ score: d.score, weight: d.pos.w })))

    // 事类共振：所问事类与牌组花色相合时小幅加权（公开的「牌阵对应事类」通例，非秘传）
    const TOPIC_SUIT = [
      { topic: '感情', suit: '圣杯', kw: ['感情', '爱情', '恋爱', '姻缘', '婚姻', '复合', '桃花', '对象', '男友', '女友', '伴侣', '喜欢', '和好'] },
      { topic: '事业', suit: '权杖', kw: ['工作', '事业', '升职', '创业', '项目', '考试', '学业', '竞争', '官司', '面试', '跳槽', '上司'] },
      { topic: '财运', suit: '星币', kw: ['钱财', '财运', '投资', '生意', '买卖', '收入', '工资', '房子', '债务', '回款', '分红', '买卖'] },
      { topic: '决断', suit: '宝剑', kw: ['选择', '决定', '真相', '是非', '矛盾', '沟通', '消息', '纠结', '要不要', '能不能'] },
    ]
    const q = String(chart?.question ?? '')
    const hit = TOPIC_SUIT.find((t) => t.kw.some((k) => q.includes(k))) ?? null
    const matchCount = hit ? draws.filter((d) => d.card.suit === hit.suit).length : 0
    const resonance = Math.min(12, matchCount * 5)

    const score = clamp(base + resonance, -100, 100)
    const trend = score >= 45 ? '顺势上行' : score >= 15 ? '稳中偏好' : score > -15 ? '平中有变' : score > -45 ? '阻滞待解' : '逆势须慎'

    const wuxing = emptyWuxing()
    for (const d of draws) wuxing[d.card.wx] += d.pos.w * 3

    return {
      score,
      essence: `${draws.map((d) => `${d.card.name}${d.rev ? '逆' : '正'}`).join('→')}·${trend}`,
      keys: [
        ...draws.map((d) => `${d.card.arcana}·${d.card.name}`),
        trend,
      ],
      wuxing,
      timing: null,
      fidelity: 'core',
      detail: {
        阵型: spread === 'single' ? '单牌阵（指引）' : '三牌阵（过去 / 现在 / 未来）',
        抽牌: draws.map((d) => `${d.pos.name}：${d.card.name}（${d.card.en}）·${d.rev ? '逆位' : '正位'}`),
        牌义: draws.map((d) => `${d.pos.name}·${d.card.name}：${d.rev ? d.card.rev : d.card.up}（${d.card.el}象·五行${d.card.wx}）`),
        权重: positions.map((p) => `${p.name} ${p.w}`).join(' ｜ '),
        评分: `牌义加权 ${base.toFixed(1)}${resonance > 0 ? ` ＋ 事类共振 ${resonance}` : ''} → ${Math.round(score)}`,
        事类共振: hit ? `所问命中「${hit.topic}」，${hit.suit}×${matchCount} → +${resonance}` : '未命中预设事类，纯按牌义加权',
        说明: `韦特体系 78 张（大阿卡纳 22 ＋ 小阿卡纳 56），牌义为公开资料；正逆位由确定性随机源抽取。权重 过去0.2/现在0.4/未来0.4。元素映射：火→火、地→土、风→金、水→水，生命/成长类牌（如皇后）取木。`,
      },
    }
  },

  // ── 108 卢恩符文 ──
  rune(chart, entry, rand) {
    if (!Array.isArray(RUNES) || RUNES.length === 0) return null
    const r = RUNES[rand.below(RUNES.length)]
    if (!r) return null
    const rev = rand.chance(0.5)
    const score = clamp(rev ? r.rs : r.us, -100, 100)

    const firstSeg = (txt) => String(txt ?? '').split('、')[0]
    const meaning = rev ? firstSeg(r.rev) : firstSeg(r.up)
    const aettName = AETTIR[r.aett] ?? '—'

    const wuxing = emptyWuxing()
    wuxing[r.wx] = 3

    return {
      score,
      essence: `${r.sym} ${r.name}·${r.cn}·${rev ? '逆位' : '正位'}·${meaning}`,
      keys: [r.name, r.cn, rev ? '逆位' : '正位', `${r.el}元素`, `${aettName}埃特`],
      wuxing,
      timing: null,
      fidelity: 'core',
      detail: {
        符文: `${r.sym} ${r.name}（${r.cn}）`,
        象征: r.mean,
        埃特: `${aettName}之埃特（第 ${r.aett} 组，共 3 组）`,
        元素: `${r.el} → 五行${r.wx}`,
        本次: rev ? '逆位（merkstave）' : '正位',
        正位义: r.up,
        逆位义: r.rev,
        逆转读法: r.noRev
          ? '此符形制对称，传统上不作逆位读；本次若现逆位，按现代通行的「阻滞/内化」解。'
          : '此符形制不对称，逆位按「阻滞/失衡/内化」解。',
        说明: 'Elder Futhark 二十四符文，符文义为公开资料；单抽一符，正逆位由确定性随机源抽取。逆位读法各家不一，本插件取通行的 merkstave 读法，不冒充秘传。',
      },
    }
  },
}

export default engines
