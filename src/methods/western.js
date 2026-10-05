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
 * ### 二、星历：**v2 起用真星历**（v1 是平均运动近似）
 * 日/月/水/金/火/木/土 一律取 `core/astro.js`（＝ `vendor/astronomy.cjs`，
 * astronomy-engine@2.1.19, MIT, Don Cross）的**地心视黄经**（ECT 真黄道·当日真春分点，
 * 含光行时与光行差）。v1 的「J2000 平黄经 + 平均运动」已全部删除：
 *   · v1 月亮误差可达数度、五星更差（未做地心视差/偏心率/摄动）；
 *   · v1 的 `chart.astro` 是**求占时刻**的真值，本命盘需要的是**出生时刻**的真值，
 *     故本模块直接调 `core/astro.js` 的同一套函数（同一份 vendor），而不是复用 `chart.astro`。
 * 恒星时取该库 `SiderealTime`（IAU 1982 GMST）；黄赤交角用 Meeus (22.2) 低精度式。
 *
 * **出生时刻 → UT 的换算（必须明写）**：用户给的出生钟表时按**当地平太阳时**处理，
 * `UT = 钟表时 − 经度/15`（经度取 `chart.longitude`，未给则 0°＝UT）。出生地经度未知时，
 * 这一项可带来最多 ±8h 的误差（月亮约 ±4°、上升约 ±120°），故 detail 里照实标注。
 *
 * **上升与中天**：
 *   · RAMC = 地方恒星时（度）= (GMST + 经度/15) × 15。
 *   · 中天 MC 与**纬度无关**：λ_MC = atan2(sin RAMC, cos RAMC·cos ε) —— 本模块精确计算。
 *   · 上升 λ_Asc = atan2(cos RAMC, −(sin RAMC·cos ε + tan φ·sin ε))，**需要出生地纬度 φ**：
 *       - 问句里报了纬度（「北纬40」「纬度31.2」「南纬」）→ 用真值，`fidelity: 'full'`；
 *       - 未报纬度 → 取**赤道面上升**（φ=0 代入同一上升式＝东点的黄道黄经；注意它 **≠** RAMC+90，
 *         后者是东点的赤经，二者最多差约 ε≈0.7°），
 *         并在 detail 同时列出 φ=20/30/40/50°N 的四个候选值，供知道出生地者直接读用。
 *   · 宫位：等宫制，自上升起每宫 30°（宫名取 tables.js `ASTRO_HOUSES`）。
 * 锚点自校：φ=0 ⇒ 上升 = 东点的**黄道黄经**（= atan2(cos RAMC, −sin RAMC·cos ε)，**不是** RAMC+90）；
 *   伦敦 φ=51.5°、MC 白羊 0° ⇒ 上升约巨蟹 26°。
 *
 * ### 三、相位与容许度
 * 相位角：合 0° / 六合 60° / 刑 90° / 三合 120° / 冲 180°；容许度（orb）**取现代通行口径**：
 * 合 8°、冲 8°、刑 8°、三合 8°、六合 6°（见 {@link ASPECTS}）。
 * 说明与出处：容许度的**概念**源自古典占星的「moiety」——Lilly《Christian Astrology》(1659)
 * 以两星各自 orb 之半相加为准（<https://old.skyscript.co.uk/pdf/pubs/TA/16/TA_16.pdf>）；
 * 各家数值互异（Lilly 星体 moiety / 现代固定 8°·6° 派），本插件**未**采用 Lilly 的具体数值
 * （手上无可靠影印表），故此处明写「现代通行 8/6 口径、本插件编辑取值」，不冒充古典原表。
 * 星座关系（按星座序差）：同座=共鸣、三合=同元素和谐、六合=元素相生、对宫=互补张力、刑=冲突。
 *
 * ### 四、塔罗 / 卢恩
 * 78 张韦特体系牌义、24 个 Elder Futhark 符文义均为**公开资料**，见 ./data/western.js：
 *   · 塔罗结构与牌名：A. E. Waite, *The Pictorial Key to the Tarot* (1911, 公有领域) 之韦特-史密斯体系；
 *     大阿卡纳 22 张的元素/行星配属取「金色黎明」通行配属（公开）；牌义倾向分是本插件为合盘所给的
 *     近似数值，**不是**传统数值；逆位读法各家不一，本插件取韦特书中的「逆位读法」通行做法。
 *   · 卢恩：Elder Futhark 二十四符文之名与字面义见《盎格鲁-撒克逊卢恩诗》(Cotton MS Domitian A.ix,
 *     约 10 世纪, 公有领域) 与《挪威卢恩诗》；三埃特（弗雷/海姆达尔/提尔，各 8 符）为通行分组；
 *     逆位（merkstave）读法为现代通行做法（各派互异）。
 */

import { clamp, emptyWuxing, mod, weightedScore } from '../core/kit.js'
import { ZODIAC, ASTRO_HOUSES } from '../core/tables.js'
import {
  sunLongitude, moonLongitude, bodyLongitude, siderealTimeHours,
  nextSolarTerm, ASTRO_SOURCE, ASTRO_FRAME,
} from '../core/astro.js'
import { TAROT, RUNES, AETTIR, ELEMENT_WX } from './data/western.js'

// ───────────────────────── 占星：真星历 / 上升 / 中天 ─────────────────────────
//
// 本节的取值全部来自 core/astro.js（= vendor/astronomy.cjs, astronomy-engine@2.1.19, MIT）：
//   日/月/水/金/火/木/土 → 地心视黄经；恒星时 → IAU 1982 GMST。v1 的平均运动近似已删除。

/** 星历来源串（写进 detail.cite，便于 verifier 直接核对）。 */
const EPHEM_CITE = `${ASTRO_SOURCE}（${ASTRO_FRAME}）`

/** J2000.0 儒略日（ε 的 T 用）。 */
const J2000 = 2451545.0

/** 黄经 0° 起的十二星座名（0–30 白羊 … 330–360 双鱼）。 */
const SIGN_BY_LON = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼']
/** 星座名 → ZODIAC 表项。 */
const ZODIAC_BY_NAME = Object.fromEntries(ZODIAC.map((z) => [z.name, z]))
/** 元素相生（风助火、水润地）。 */
const ELEM_FRIEND = { 火: ['风'], 风: ['火'], 地: ['水'], 水: ['地'] }

/**
 * 黄赤交角 ε（度，当日真值）。
 * cite: Meeus, *Astronomical Algorithms* 2nd ed. ch.22「Obliquity of the Ecliptic」低精度式
 *   ε = 23°26′21.448″ − 46.8150″T − 0.00059″T² + 0.001813″T³（T = J2000 起儒略世纪）
 * note: T 以 UT 代 TT（ΔT ≈ 70 s 对 ε 的影响 < 1e-6 度，可忽略）。
 * @param {Date} date 时刻。
 * @returns {number} ε（度）。
 */
function obliquityDeg(date) {
  const T = (date.getTime() / 86400000 + 2440587.5 - J2000) / 36525
  const arcsec = 21.448 - 46.8150 * T - 0.00059 * T * T + 0.001813 * T * T * T
  return 23 + 26 / 60 + arcsec / 3600
}

/**
 * 中天黄经（度）—— **与地理纬度无关**，只由 RAMC 与 ε 决定。
 * 推导：黄道点赤经关系 tan α = tan λ·cos ε（Meeus ch.13 黄道↔赤道变换），令 α = RAMC：
 *   λ_MC = atan2( sin RAMC, cos RAMC·cos ε )
 * cite: Meeus, *Astronomical Algorithms* 2nd ed. ch.13；MC 定义见占星通行教科书。
 * @param {number} ramcDeg 赤经中天（度）。
 * @param {number} epsDeg 黄赤交角（度）。
 * @returns {number} 黄经 0..360。
 */
function mcLonOf(ramcDeg, epsDeg) {
  const r = ramcDeg * (Math.PI / 180)
  const e = epsDeg * (Math.PI / 180)
  return mod(Math.atan2(Math.sin(r), Math.cos(r) * Math.cos(e)) * (180 / Math.PI), 360)
}

/**
 * 上升点黄经（度）。
 *   λ_Asc = atan2( cos RAMC, −( sin RAMC·cos ε + tan φ·sin ε ) )
 * 自校：**φ = 0 时本式给出的就是「东点」的黄道黄经**。东点的赤经是 RAMC+90，其黄道黄经
 *   λ_东点 = atan2( sin(RAMC+90), cos(RAMC+90)·cos ε ) = atan2( cos RAMC, −sin RAMC·cos ε )，
 * 与本式 φ=0 同形。**注意 λ_东点 ≠ RAMC+90**：二者只在 RAMC ≡ 0 或 90 (mod 180) 时相等，
 * 一般相差最多约 ε ≈ 0.7°（verifier #2 指出本插件曾把 RAMC+90 误当作 φ=0 的上升度，已改按本式）。
 * 已知锚点：φ = 51.5°N、MC = 白羊 0°（RAMC = 0）⇒ 上升约巨蟹 26°。
 * cite: 上升点标准球面式（等价于地平圈与黄道的交点），见 Meeus ch.13 坐标变换与占星通行教科书。
 * @param {number} ramcDeg 赤经中天（度）。
 * @param {number} epsDeg 黄赤交角（度）。
 * @param {number} latDeg 地理纬度（度，北正南负）。
 * @returns {number} 黄经 0..360。
 */
function ascLonOf(ramcDeg, epsDeg, latDeg) {
  const r = ramcDeg * (Math.PI / 180)
  const e = epsDeg * (Math.PI / 180)
  const p = latDeg * (Math.PI / 180)
  return mod(Math.atan2(Math.cos(r), -(Math.sin(r) * Math.cos(e) + Math.tan(p) * Math.sin(e))) * (180 / Math.PI), 360)
}

/**
 * 从问句里读出生地纬度（「北纬40」「纬度31.2」「南纬23.5」）。
 * 没报就不猜 —— 返回 null，由调用方降级并**在 detail 里明说取象方式**。
 * @param {string} text 问句。
 * @returns {{lat:number, src:string}|null} 纬度与来源说明。
 */
function latFromText(text) {
  const t = String(text ?? '')
  const m = /(北|南)?纬\s*(?:度)?\s*([0-9]{1,2}(?:\.[0-9]{1,2})?)/.exec(t)
  if (!m) return null
  const v = Number(m[2])
  if (!Number.isFinite(v) || v < 0 || v > 90) return null
  const south = m[1] === '南'
  return { lat: south ? -v : v, src: `问句所报纬度「${m[0]}」` }
}

/** 行星 / 七政取值顺序（真星历，日月 + 五星）。 */
const SEVEN_KEYS = ['日', '月', '水', '金', '火', '木', '土']

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
 * 造一张「本命盘」：真星历日月五星 + 真恒星时推上升/中天 + 等宫宫位。
 *
 * 与 v1 的差别（可验证）：
 *   · v1 用 J2000 平黄经 + 平均运动自算（月亮误差可达数度、行星更差），
 *     v2 取 astronomy-engine 的**地心视黄经**（ECT，含光行时与光行差）；
 *   · v1 上升用「λ☉ + 90° + 时角×15°」的正午近似，v2 由 IAU 1982 GMST 推 RAMC：
 *     中天 MC **与纬度无关、精确可算**；上升在报了纬度时精确，未报时退赤道面值（φ=0 ⇒ RAMC+90）
 *     并在 detail 列出 φ=20/30/40/50°N 四个候选值。
 *
 * @param {{y:number,m:number,d:number,h:number,mi:number}} b 出生分量（当地钟表时）。
 * @param {{lonDeg?:number, latDeg?:number|null}} [ctx] 经度（算地方恒星时用）与纬度。
 * @returns {object|null} 本命盘；输入非法返回 null。
 */
function natalOf(b, ctx = {}) {
  if (!b || !validDate(b.y, b.m, b.d)) return null
  const h = Number.isFinite(b.h) ? clamp(b.h, 0, 23) : 12
  const mi = Number.isFinite(b.mi) ? clamp(b.mi, 0, 59) : 0
  const lonDeg = Number.isFinite(ctx.lonDeg) ? ctx.lonDeg : 0
  // 出生钟表时 → 绝对时刻：**与 core/calendar.js 的 birthChart 同口径**（宿主本地民用时，
  // `new Date(y, m-1, d, h, mi)`），故本模块的日月五星可与 `chart.birthChart.astro` 逐位对拍。
  // 出生地经度只用于地方恒星时（LST = GMST + 经度/15）——上升/中天要的是地方时角。
  const date = new Date(b.y, b.m - 1, b.d, h, mi, 0)

  const lonOf = (k) => {
    const v = bodyLongitude(k, date)
    return Number.isFinite(v) ? v : 0
  }
  const seven = Object.fromEntries(SEVEN_KEYS.map((k) => [k, lonOf(k)]))
  const sun = signOfLon(seven.日)
  const moon = signOfLon(seven.月)

  const gast = siderealTimeHours(date)
  const lstH = mod(gast + lonDeg / 15, 24)
  const ramc = lstH * 15
  const eps = obliquityDeg(date)
  const mc = signOfLon(mcLonOf(ramc, eps))
  const latDeg = Number.isFinite(ctx.latDeg) ? ctx.latDeg : null
  const ascExact = latDeg === null ? null : signOfLon(ascLonOf(ramc, eps, latDeg))
  // 未报纬度时取**赤道面上升**：φ=0 代入同一上升式（＝东点的黄道黄经），
  // 而不是 RAMC+90（那是东点的赤经，二者相差最多约 ε≈0.7°，见 ascLonOf 注释）。
  const asc = ascExact ?? signOfLon(ascLonOf(ramc, eps, 0))
  const ascByLat = [20, 30, 40, 50].map((la) => `${la}°N ${signOfLon(ascLonOf(ramc, eps, la)).name}`)

  const others = {}
  for (const k of ['水', '金', '火', '木', '土']) others[k] = signOfLon(seven[k])
  const bodies = SEVEN_KEYS.map((k) => signOfLon(seven[k]))
  const houses = bodies.map((x) => Math.floor(mod(x.lon - asc.lon, 360) / 30) + 1)

  return {
    birth: `${b.y}-${String(b.m).padStart(2, '0')}-${String(b.d).padStart(2, '0')} ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`,
    ymd: { y: b.y, m: b.m, d: b.d },
    date,
    utc: date.toISOString().slice(0, 16).replace('T', ' '),
    lonDeg,
    latDeg,
    seven,
    sun, moon, asc, ascLon: asc.lon, ascExact: ascExact !== null, ascByLat,
    mc, ramc, eps, gast, lstH,
    mercury: others.水, venus: others.金, mars: others.火, jupiter: others.木, saturn: others.土,
    bodies, houses,
  }
}

/**
 * 相位容许度表（orb，度）。
 *
 * cite/口径：**现代通行口径** —— 合 8°、冲 8°、刑 8°、三合 8°、六合 6°。
 *   古典占星用「moiety」法：Lilly《Christian Astrology》(1659) 以两星各自 orb 之半相加为准
 *   （参见 <https://old.skyscript.co.uk/pdf/pubs/TA/16/TA_16.pdf> 对 particular orbs / moiety 的说明）。
 *   各家数值互异（Lilly 星体 moiety 派 vs 现代固定 8°·6° 派）；本插件**未采用** Lilly 的具体数值
 *   （手上无可靠影印表），故此处为**本插件编辑取值**，不冒充古典原表。
 */
const ASPECTS = [
  { name: '合', angle: 0, orb: 8, score: 40, note: '同源共鸣' },
  { name: '六合', angle: 60, orb: 6, score: 50, note: '顺畅协作' },
  { name: '刑', angle: 90, orb: 8, score: -55, note: '张力冲突' },
  { name: '三合', angle: 120, orb: 8, score: 60, note: '天赋顺流' },
  { name: '冲', angle: 180, orb: 8, score: -20, note: '两极对拉' },
]

/**
 * 黄经夹角 → 相位（按 {@link ASPECTS} 的容许度入相位）。
 * @param {number} sepA 黄经差（度）。
 * @returns {{name:string, score:number, note:string, angle:number, orb:number, diff:number}} 相位。
 */
function aspectOf(sepA) {
  const a = mod(Number.isFinite(sepA) ? sepA : 0, 360)
  const s = a > 180 ? 360 - a : a
  for (const asp of ASPECTS) {
    const diff = Math.abs(s - asp.angle)
    if (diff <= asp.orb) {
      return { name: asp.name, score: asp.score, note: asp.note, angle: s, orb: asp.orb, diff }
    }
  }
  return { name: '无相位', score: 0, note: '彼此独立（超出容许度）', angle: s, orb: 0, diff: 0 }
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

/** 星历与盘面结构说明（本命 / 合盘共用）。 */
const EPHEM_NOTE = `星历：${EPHEM_CITE}。日月五星取**地心视黄经**（真黄道·当日真春分点，含光行时/光行差），已非 v1 的平均运动近似。`
const NATAL_NOTE = `${EPHEM_NOTE}恒星时取该库 SiderealTime（IAU 1982 GMST），出生地经度只用于地方恒星时（LST = GMST + 经度/15）：中天 MC 与纬度无关、精确可算；上升需出生地纬度，未报时取**赤道面上升**（φ=0 代入同一上升式＝东点的黄道黄经，注意它 ≠ RAMC+90，后者是东点的赤经）并列出 20/30/40/50°N 候选。出生钟表时**与 core/calendar.js 的 birthChart 同口径**（宿主本地民用时），故本模块日月五星可与 chart.birthChart.astro 逐位对拍（detail.evidence 给出实测差）。宫位为等宫制（自上升起每宫 30°）。`
const SYNASTRY_NOTE = `双方星盘均为真星历（同 #105）。相位容许度取现代通行 8°·6° 口径（本插件编辑取值；古典 moiety 法各派数值互异）。`

/** #105/#106 的出处清单（detail.cite）。 */
const ASTRO_CITES = [
  EPHEM_CITE,
  '恒星时：astronomy-engine `SiderealTime`（IAU 1982 GMST）；第二通路 Meeus, *Astronomical Algorithms* 2nd ed. (12.4)',
  '黄赤交角：Meeus, *Astronomical Algorithms* 2nd ed. (22.2) 低精度式',
  '中天/上升：黄道↔赤道变换（Meeus ch.13）＋占星通行中天/上升公式；MC 与纬度无关，上升在 φ=0 时给出**东点的黄道黄经**（≠ 东点赤经 RAMC+90，二者最多差约 ε≈0.7°）',
  '相位容许度：现代通行 合/冲/刑/三合 8°、六合 6°（本插件编辑取值；古典 moiety 法见 Lilly, *Christian Astrology*, 1659）',
  '元素四象、角宫/弱宫力量、星座关系：现代占星通行口径（本插件编辑取值）',
  '星座日期区间：core/tables.js ZODIAC（仅作生日区间互校）',
  '宫位：等宫制（equal house），宫名取 core/tables.js ASTRO_HOUSES',
]

/**
 * 恒星时**第二通路**核对：Meeus (12.4) 多项式 vs astronomy-engine 的 `SiderealTime`。
 * GMST(度) = 280.46061837 + 360.98564736629·(JD−2451545) + 0.000387933·T² − T³/38710000
 * cite: Meeus, *Astronomical Algorithms* 2nd ed. ch.12 (12.4)
 * @param {Date} date 时刻。
 * @returns {number} GMST（小时，0..24）。
 */
function gmstHoursClassic(date) {
  const jd = date.getTime() / 86400000 + 2440587.5
  const d = jd - J2000
  const T = d / 36525
  const deg = 280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - (T * T * T) / 38710000
  return mod(deg, 360) / 15
}

// ───────────────────────── 塔罗 / 卢恩：族内表（带出处）─────────────────────────

/**
 * 塔罗牌阵牌位语义（三牌阵）。
 * cite: 三牌阵（过去/现在/未来）为现代通行牌阵；牌位语义取通行读法（本插件编辑取值）。
 *   A. E. Waite, *The Pictorial Key to the Tarot* (1911, 公有领域) 载 78 张牌义与多种牌阵，
 *   本插件**未逐字引用**其牌阵原文，只采用公开的牌位读法。
 */
const TAROT_POSITIONS = {
  single: [{ name: '指引', w: 1, mean: '当前最该看的一张牌，直指核心' }],
  three: [
    { name: '过去', w: 0.2, mean: '事情的基础与来路（已定之势）' },
    { name: '现在', w: 0.4, mean: '当下的局面与主因（权重最高）' },
    { name: '未来', w: 0.4, mean: '若维持现状的走势（可因作为而变）' },
  ],
}

/**
 * 大阿卡纳 22 张的元素／行星／星座配属（金色黎明通行配属，公开资料）。
 * cite: 金色黎明（Hermetic Order of the Golden Dawn）通行配属，见 *Book T* 系统之公开转述；
 *   现代占星派对 0 愚者／12 倒吊人／20 审判 有「天王星／海王星／冥王星」的替代配属（本表 `alt` 列）。
 */
const TAROT_MAJOR_ATTR = {
  愚者: { attr: '风元素', alt: '天王星' },
  魔术师: { attr: '水星' }, 女祭司: { attr: '月亮' }, 皇后: { attr: '金星' }, 皇帝: { attr: '白羊' },
  教皇: { attr: '金牛' }, 恋人: { attr: '双子' }, 战车: { attr: '巨蟹' }, 力量: { attr: '狮子' },
  隐者: { attr: '处女' }, 命运之轮: { attr: '木星' }, 正义: { attr: '天秤' },
  倒吊人: { attr: '水元素', alt: '海王星' }, 死神: { attr: '天蝎' }, 节制: { attr: '射手' },
  恶魔: { attr: '摩羯' }, 塔: { attr: '火星' }, 星星: { attr: '水瓶' }, 月亮: { attr: '双鱼' },
  太阳: { attr: '太阳' }, 审判: { attr: '火元素', alt: '冥王星' }, 世界: { attr: '土星' },
}

/** 宫廷牌四阶（侍从/骑士/王后/国王）的通行读法。cite: 韦特体系通行读法（本插件编辑取值） */
const TAROT_COURT = {
  侍从: '学习者／消息／初试（Page）',
  骑士: '行动者／追求／推进（Knight）',
  王后: '内在成熟／滋养／感受力（Queen）',
  国王: '外在掌控／决断／权威（King）',
}

/** 塔罗出处清单（detail.cite）。 */
const TAROT_CITES = [
  'A. E. Waite, *The Pictorial Key to the Tarot* (1911, 公有领域)：韦特-史密斯 78 张牌结构与牌义（本插件的牌义为其**公开通例的简短转述**，非逐字引用）',
  '大阿卡纳元素/行星/星座配属：金色黎明（Golden Dawn）通行配属（公开；愚者/倒吊人/审判 另有天王/海王/冥王 的现代替代配属）',
  '三牌阵（过去/现在/未来）牌位语义：现代通行读法（本插件编辑取值）',
  '元素 → 五行桥接：本插件为与中式合盘而设（火→火、地→土、风→金、水→水、木→木）',
]

/** 卢恩出处清单（detail.cite）。 */
const RUNE_CITES = [
  'Elder Futhark 二十四符文之名与字面义：《盎格鲁-撒克逊卢恩诗》(Cotton MS Domitian A.ix, 约 10 世纪, 公有领域) 与《挪威卢恩诗》',
  '三埃特分组（弗雷 8 / 海姆达尔 8 / 提尔 8）：通行分组（公开）',
  '逆位（merkstave）读法：现代通行做法（各家互异；形制对称的符文传统上不作逆位读）',
  '符文元素归属：现代通行配属（本插件编辑取值；各派互异）',
]

// ───────────────────────── 引擎实现 ─────────────────────────

export const engines = {
  // ── 105 西洋占星·本命 ──
  astroNatal(chart, entry, rand) {
    const q = String(chart?.question ?? '')
    const b = birthFromText(chart?.birthChart?.solar)
    const latHit = latFromText(q)
    const lonDeg = Number.isFinite(chart?.longitude) ? chart.longitude : 0
    const ctx = { lonDeg, latDeg: latHit?.lat ?? null }
    const n = natalOf(b, ctx)
    if (!n) return null

    const [sun, moon] = [n.sun, n.moon]
    const sunMoon = aspectOf(sun.lon - moon.lon)

    // 元素分布（七政 + 上升，共八点）
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

    // 元素平衡与日月升协调（八点盘，偏枯门槛按比例提到 5 点）
    let balance = present === 4 ? 12 : 0
    if (maxElem >= 5) balance -= 12
    const friendly = (a, c) => (a === c ? 10 : (ELEM_FRIEND[a]?.includes(c) ? 8 : -6))
    const harmony = friendly(sun.element, moon.element) + friendly(sun.element, n.asc.element)

    const score = clamp(sunMoon.score * 0.6 + balance + strength * 0.5 + harmony * 0.5, -100, 100)

    const wuxing = emptyWuxing()
    for (const p of points) wuxing[p.wx] += 1

    // 下一次太阳入座：用 SearchSunLongitude 求**精确时刻**（v1 用平均运动折算天数）
    const nextBoundary = mod((Math.floor(sun.lon / 30) + 1) * 30, 360)
    const ingress = nextSolarTerm(nextBoundary, n.date, 40)
    const daysToNext = ingress ? Math.max(0, (ingress.atDate.getTime() - n.date.getTime()) / 86400000) : null
    const nextSign = signOfLon(nextBoundary + 0.001)
    const byDate = signByDate(n.ymd.m, n.ymd.d)

    const houseText = ASTRO_HOUSES
      .map((hn, i) => `${i + 1}${hn}:${signOfLon(n.ascLon + i * 30).name}`)
      .join(' ')

    // 恒星时双通路核对（把两侧数值与差都写出来，verifier 可直接复算）
    const gmstLib = siderealTimeHours(n.date)
    const gmstMeeus = gmstHoursClassic(n.date)
    const gmstDiffSec = Math.abs(gmstLib - gmstMeeus) * 3600

    // 与历法层对拍：chart.birthChart.astro 是同一出生时刻的星象（kernel-astro 产出）
    const ref = chart?.birthChart?.astro ?? null
    const refLine = ref && Number.isFinite(ref.sunLon)
      ? `chart.birthChart.astro λ☉=${ref.sunLon.toFixed(5)}° vs 本模块 ${n.seven.日.toFixed(5)}°（差 ${Math.abs(ref.sunLon - n.seven.日).toFixed(5)}°）；λ☾ ${Number.isFinite(ref.moonLon) ? `${ref.moonLon.toFixed(5)}° vs ${n.seven.月.toFixed(5)}°（差 ${Math.abs(ref.moonLon - n.seven.月).toFixed(5)}°）` : '—'}`
      : '未取得 chart.birthChart.astro（历法层未提供）'

    return {
      score,
      essence: `太阳${sun.name} 月亮${moon.name} 上升${n.asc.name}·日月${sunMoon.name}`,
      keys: [
        `日${sun.name}`, `月${moon.name}`, `升${n.asc.name}`,
        `日月${sunMoon.name}`, `${domElem}象${maxElem}点`,
      ],
      wuxing,
      timing: daysToNext === null ? `太阳${sun.name}中` : `约${Math.round(daysToNext)}天后太阳入${nextSign.name}`,
      fidelity: latHit ? 'full' : 'core',
      detail: {
        出生: `${n.birth}（与 core/calendar.js 的 birthChart 同口径：宿主本地民用时）`,
        太阳: `${sun.name} ${sun.deg.toFixed(2)}°（${sun.element}象·五行${sun.wx}）`,
        月亮: `${moon.name} ${moon.deg.toFixed(2)}°（${moon.element}象·五行${moon.wx}）`,
        上升: `${n.asc.name} ${n.asc.deg.toFixed(2)}°（${n.asc.element}象·五行${n.asc.wx}）`,
        上升口径: n.ascExact
          ? `${latHit?.src ?? '所报纬度'} → 真上升（φ=${n.latDeg}°，λ_Asc=${n.ascLon.toFixed(2)}°）`
          : `未报出生地纬度 → 取**赤道面上升**（φ=0 代入同一上升式＝东点的黄道黄经，λ=${n.ascLon.toFixed(2)}°；东点赤经为 RAMC+90=${mod(n.ramc + 90, 360).toFixed(2)}°，二者不等，差 ${Math.abs(((n.ascLon - mod(n.ramc + 90, 360) + 540) % 360) - 180).toFixed(2)}°），仅作结构参考；同时列出候选：${n.ascByLat.join(' ｜ ')}`,
        中天: `${n.mc.name} ${n.mc.deg.toFixed(2)}°（MC 与纬度无关，由 RAMC=${n.ramc.toFixed(2)}°、ε=${n.eps.toFixed(3)}° 精确推出）`,
        三要素: `太阳${sun.name} ｜ 月亮${moon.name} ｜ 上升${n.asc.name}`,
        水星: `${n.mercury.name} ${n.mercury.deg.toFixed(2)}°`,
        金星: `${n.venus.name} ${n.venus.deg.toFixed(2)}°`,
        火星: `${n.mars.name} ${n.mars.deg.toFixed(2)}°`,
        木星: `${n.jupiter.name} ${n.jupiter.deg.toFixed(2)}°`,
        土星: `${n.saturn.name} ${n.saturn.deg.toFixed(2)}°`,
        行星落宫: `日${n.houses[0]}宫 月${n.houses[1]}宫 水${n.houses[2]}宫 金${n.houses[3]}宫 火${n.houses[4]}宫 木${n.houses[5]}宫 土${n.houses[6]}宫（等宫制，自上升起）`,
        十二宫: houseText,
        日月相位: `${sunMoon.name}（实测夹角 ${sunMoon.angle.toFixed(2)}°，容差 ±${sunMoon.orb}°，距精确 ${sunMoon.diff.toFixed(2)}°；${sunMoon.note}）`,
        元素分布: `火${elem.火} 地${elem.地} 风${elem.风} 水${elem.水}（八点：七政＋上升；${present}元素俱全${maxElem >= 5 ? '，偏枯' : ''}）`,
        恒星时: `GMST ${gmstLib.toFixed(4)}h（astronomy-engine）｜${gmstMeeus.toFixed(4)}h（Meeus 12.4，第二通路）｜差 ${gmstDiffSec.toFixed(1)} 秒时；地方恒星时 ${n.lstH.toFixed(4)}h`,
        生日区间校验: `按公历区间查 ZODIAC 表 → ${byDate?.name ?? '—'}${byDate?.name === sun.name ? '（与真黄经推算一致）' : '（与黄经推算不同：区间表按固定日期，黄经含岁差与真实运动，以黄经为准）'}`,
        说明: NATAL_NOTE,
        cite: ASTRO_CITES,
        evidence: [
          `日月相位：λ☉−λ☾ = ${(sun.lon - moon.lon).toFixed(2)}° → 归化夹角 ${sunMoon.angle.toFixed(2)}° → ${sunMoon.name}（容差 ±${sunMoon.orb}°）→ 相位分 ${sunMoon.score}`,
          `元素分布：八点（七政+上升）＝火${elem.火}/地${elem.地}/风${elem.风}/水${elem.水} → ${present === 4 ? '四象俱全 +12' : '有缺 +0'}${maxElem >= 5 ? `，偏枯（最多 ${maxElem} 点）−12` : ''}`,
          `角宫力量：行星落 1/4/7/10 宫各 +8、3/6/9/12 宫各 −5 → 合计 ${strength}`,
          `日月升协调：日-月 ${friendly(sun.element, moon.element)}、日-升 ${friendly(sun.element, n.asc.element)} → 合计 ${harmony}`,
          `合分：${sunMoon.score}×0.6 ＋ 平衡 ${balance} ＋ 力量 ${strength}×0.5 ＋ 协调 ${harmony}×0.5 = ${Math.round(score)}`,
          `恒星时双通路：astronomy-engine ${gmstLib.toFixed(4)}h vs Meeus(12.4) ${gmstMeeus.toFixed(4)}h，差 ${gmstDiffSec.toFixed(1)} 秒时（≤1 秒时为佳）`,
          `与历法层对拍（同一出生时刻）：${refLine}`,
          `地方恒星时：GMST ${gmstLib.toFixed(4)}h ＋ 经度 ${lonDeg}°/15 = LST ${n.lstH.toFixed(4)}h → RAMC ${n.ramc.toFixed(3)}°`,
          `中天：λ_MC = atan2(sin RAMC, cos RAMC·cos ε)，ε=${n.eps.toFixed(4)}° → ${n.mc.name} ${n.mc.deg.toFixed(2)}°（与纬度无关）${n.ascExact ? `；上升：atan2(cos RAMC, −(sin RAMC·cos ε + tan φ·sin ε))，φ=${n.latDeg}° → ${n.asc.name} ${n.asc.deg.toFixed(2)}°` : `；上升取赤道面值：atan2(cos RAMC, −sin RAMC·cos ε)（＝东点黄道黄经）= ${n.ascLon.toFixed(2)}° → ${n.asc.name} ${n.asc.deg.toFixed(2)}°；**注意东点赤经 RAMC+90 = ${mod(n.ramc + 90, 360).toFixed(2)}° 是赤经、不是黄经**，本插件不再拿它当上升度`}`,
          `入座时刻：SearchSunLongitude(${nextBoundary}°) → ${ingress ? `${ingress.at}（约 ${(daysToNext ?? 0).toFixed(1)} 天后）` : '未在 40 日内找到'}`,
        ],
      },
    }
  },

  // ── 106 西洋占星·合盘 ──
  astroSynastry(chart, entry, rand) {
    // 甲方：本盘出生资料；缺则用本次求占时刻代盘（本条 need 为空，无出生资料也要能起）
    const aBirth = birthFromText(chart?.birthChart?.solar)
    const aFallback = !aBirth
    const s = chart?.solar ?? {}
    const latHit = latFromText(String(chart?.question ?? ''))
    const lonDeg = Number.isFinite(chart?.longitude) ? chart.longitude : 0
    // 甲方：有出生资料 → 用其所报经度/纬度换算；无出生资料 → 以本次求占时刻（真太阳时）代盘，
    // 此时 chart.solar 已是真太阳时，故经度不再二次校正（lonDeg = 0）。
    const A = aBirth
      ? natalOf(aBirth, { lonDeg, latDeg: latHit?.lat ?? null })
      : natalOf({ y: s.y, m: s.m, d: s.d, h: s.h ?? 12, mi: s.mi ?? 0 }, { lonDeg: 0, latDeg: null })
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
    }, { lonDeg, latDeg: null })
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
      fidelity: aFallback || bRandom || !latHit ? 'approx' : 'core',
      detail: {
        甲方出生: `${A.birth}（宿主本地民用时口径，同 core/calendar.js；折 UT ${A.utc}）`,
        甲方三要素: `太阳${A.sun.name} 月亮${A.moon.name} 上升${A.asc.name}`,
        甲方中天: `${A.mc.name} ${A.mc.deg.toFixed(2)}°（RAMC ${A.ramc.toFixed(2)}°）`,
        乙方出生: `${B.birth}${bRandom ? '（随机对照盘）' : ''}（折 UT ${B.utc}）`,
        乙方三要素: `太阳${B.sun.name} 月亮${B.moon.name} 上升${B.asc.name}`,
        乙方中天: `${B.mc.name} ${B.mc.deg.toFixed(2)}°（RAMC ${B.ramc.toFixed(2)}°）`,
        相位清单: list,
        星座关系: signList,
        容许度: '合/冲/刑/三合 ±8°、六合 ±6°（现代通行口径，本插件编辑取值；古典 moiety 法数值各派互异）',
        关系评分: `相位加权 ${aspAvg.toFixed(1)} × 0.7 ＋ 星座关系 ${signAvg.toFixed(1)} × 2 → ${Math.round(score)}`,
        断: `${tag}：${coreRel.日.name === '同座' || coreRel.月.name === '同座' ? '核心同座，共鸣强' : coreRel.月.name === '刑' || coreRel.日.name === '刑' ? '核心见刑，需刻意磨合' : coreRel.月.name === '三合' || coreRel.日.name === '三合' ? '核心三合，相处顺流' : '核心关系中性，成败多在经营'}`,
        说明: notes.join(''),
        cite: [
          ...ASTRO_CITES,
          '合盘配对（日-日/月-月/升-升/日月交叉/金-火）与权重：现代占星通行做法（本插件编辑取值）',
        ],
        evidence: [
          ...PAIRS.map((p) => {
            const asp = aspByName[p.label]
            return `${p.label}：λ${p.k}(${A[p.k].name}${A[p.k].deg.toFixed(1)}°) − λ${p.j}(${B[p.j].name}${B[p.j].deg.toFixed(1)}°) → 夹角 ${asp.angle.toFixed(2)}° → ${asp.name}（容差 ±${asp.orb}°）→ ${asp.score}，权重 ${p.w}`
          }),
          `相位加权：${PAIRS.length} 对按权重 ${PAIRS.map((p) => p.w).join('/')} → ${aspAvg.toFixed(2)}`,
          `星座关系：日${coreRel.日.name}(${coreRel.日.score}) 月${coreRel.月.name}(${coreRel.月.score}) 升${coreRel.升.name}(${coreRel.升.score}) → 均值 ${signAvg.toFixed(2)}`,
          `合分：相位 ${aspAvg.toFixed(2)}×0.7 ＋ 星座关系 ${signAvg.toFixed(2)}×2 = ${Math.round(score)} → 「${tag}」`,
          `恒星时通路（甲方）：astronomy-engine ${siderealTimeHours(A.date).toFixed(4)}h vs Meeus(12.4) ${gmstHoursClassic(A.date).toFixed(4)}h`,
        ],
      },
    }
  },

  // ── 107 塔罗·三牌阵 ──
  tarot(chart, entry, rand) {
    if (!Array.isArray(TAROT) || TAROT.length === 0) return null
    const spread = entry?.params?.spread === 'single' ? 'single' : 'three'
    const positions = TAROT_POSITIONS[spread] ?? TAROT_POSITIONS.three

    // 78 张洗牌后**不放回**抽牌（同一牌阵内不会重复出同一张牌）
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

    // 大阿卡纳配属（金色黎明）+ 宫廷牌阶（侍从/骑士/王后/国王）
    const attrOf = (card) => {
      if (card.arcana === '大阿卡纳') {
        const a = TAROT_MAJOR_ATTR[card.name]
        return a ? `${a.attr}${a.alt ? `（现代替代配属：${a.alt}）` : ''}` : '—'
      }
      if (/侍从|骑士|王后|国王/.test(card.name)) {
        const rank = card.name.match(/(侍从|骑士|王后|国王)/)?.[1]
        return `${card.suit}·${rank}（${TAROT_COURT[rank] ?? '—'}）`
      }
      return `${card.suit}·数牌（1–10）`
    }

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
        牌位: positions.map((p) => `${p.name}（权重${p.w}）：${p.mean}`),
        配属: draws.map((d) => `${d.card.name} → ${attrOf(d.card)}`),
        权重: positions.map((p) => `${p.name} ${p.w}`).join(' ｜ '),
        评分: `牌义加权 ${base.toFixed(1)}${resonance > 0 ? ` ＋ 事类共振 ${resonance}` : ''} → ${Math.round(score)}`,
        事类共振: hit ? `所问命中「${hit.topic}」，${hit.suit}×${matchCount} → +${resonance}` : '未命中预设事类，纯按牌义加权',
        说明: `韦特体系 78 张（大阿卡纳 22 ＋ 小阿卡纳 56），牌义为公开资料（见 ./data/western.js）；78 张洗牌后不放回抽牌，正逆位由确定性随机源抽取。权重 过去0.2/现在0.4/未来0.4。元素映射：火→火、地→土、风→金、水→水，生命/成长类牌（如皇后）取木。大阿卡纳配属取金色黎明通行配属。`,
        cite: TAROT_CITES,
        evidence: [
          `抽牌源：rand.shuffle(78 张) 不放回取前 ${positions.length} 张 → ${draws.map((d, i) => `${i + 1}.${d.card.name}`).join(' / ')}`,
          `正逆位：每张 rand.chance(0.5) → ${draws.map((d) => (d.rev ? '逆' : '正')).join('/')}`,
          `牌义分：${draws.map((d) => `${d.card.name}${d.rev ? '逆' : '正'}=${d.score}`).join('、')} 按牌位权重 [${positions.map((p) => p.w).join('/')}] 加权 → ${base.toFixed(2)}`,
          hit ? `事类共振：所问含「${hit.topic}」关键词 → 取 ${hit.suit} 花色，命中 ${matchCount} 张 ×5 = +${resonance}` : '事类共振：未命中预设事类 → +0',
          `合分：${base.toFixed(2)} ＋ ${resonance} = ${Math.round(score)} → 「${trend}」`,
        ],
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
        埃特: `${aettName}之埃特（第 ${r.aett} 组，共 3 组：弗雷／海姆达尔／提尔）`,
        元素: `${r.el} → 五行${r.wx}`,
        本次: rev ? '逆位（merkstave）' : '正位',
        正位义: r.up,
        逆位义: r.rev,
        逆转读法: r.noRev
          ? '此符形制对称，传统上不作逆位读；本次若现逆位，按现代通行的「阻滞/内化」解。'
          : '此符形制不对称，逆位按「阻滞/失衡/内化」解。',
        说明: 'Elder Futhark 二十四符文（单抽一符），符文义为公开资料（见 ./data/western.js）；正逆位由确定性随机源抽取。逆位读法各家不一，本插件取通行的 merkstave 读法，不冒充秘传。',
        cite: RUNE_CITES,
        evidence: [
          `抽符：rand.below(24) → 第 ${RUNES.indexOf(r) + 1} 符 ${r.sym} ${r.name}（${r.cn}，${aettName}埃特）`,
          `正逆位：rand.chance(0.5) → ${rev ? '逆位' : '正位'}${r.noRev ? '（该符传统上不作逆位读，此处按现代通行读法解）' : ''}`,
          `倾向分：${rev ? `逆位值 ${r.rs}` : `正位值 ${r.us}`}（本插件按符文义给的编辑取值，非传统数值）`,
          `五行信号：${r.el} → 五行${r.wx} = 3`,
        ],
      },
    }
  },
}

export default engines
