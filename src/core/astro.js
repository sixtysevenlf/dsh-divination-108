/**
 * 术数内核 · 天文层（astro）
 *
 * 职责：把「一个时刻」变成**真实天象**——日月五星视黄经、ΔT、均时差、二十八宿入宿度。
 * 历法层（calendar.js）拿它算真太阳时与日躔；方法层（七政四余/择日/西占）拿它取星历。
 *
 * ── 数据源（全部可复现，禁止凭记忆编造）────────────────────────────────
 * | 量 | 来源 | 保真度 |
 * |---|---|---|
 * | 日月五星地心视黄经 | vendor/astronomy.cjs = astronomy-engine 2.1.19（MIT, Don Cross） | full |
 * | ΔT | astronomy-engine `DeltaT_EspenakMeeus`（Espenak–Meeus 多项式，NASA 五千年 ΔT 目录同源） | full |
 * | 均时差 | Meeus《Astronomical Algorithms》2nd ed. 第 28 章：EoT = 4×(L0 − α_视) | full |
 * | 二十八宿入宿度 | 距星 ICRS J2000 坐标取自 SIMBAD（CDS）实测星表，见 SU28_STARS 注释 | full（距星身份有异说，见下） |
 * | 节气精确时刻 | 仍走 vendor/lunar.cjs 寿星天文历（与 v1 一致，避免行为漂移） | full |
 *
 * ── 坐标约定（重要，方法层必须知道）────────────────────────────────────
 * 1. 所有黄经都是 **ECT 真黄道·当日真春分点**（含岁差 + 章动），不是 J2000 平黄经。
 *    - 太阳：`SunPosition` 本身即"true equinox of date"。
 *    - 行星：`Ecliptic(GeoVector(body, t, true))` —— astronomy-engine 源码注释明确写
 *      "Converts a J2000 mean equator (EQJ) vector to a true ecliptic of date (ETC) vector"，
 *      即该调用返回的就是视黄经（含光行时 + 光行差）。
 *    - 月亮：`EclipticGeoMoon` 同样返回 ECT 角度。
 *    - 所以三者在同一坐标架内，可直接相减（合冲、相位、入宿都用同一架）。
 * 2. 时间参数是 JS `Date`（绝对时刻，时区无关）；`MakeTime` 只取 UTC 瞬间。
 * 3. 本模块**纯函数、不读时钟、不联网**：时刻一律由调用方注入。
 */

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const HERE = dirname(fileURLToPath(import.meta.url))
/** @type {any} Astronomy Engine 2.1.19（CommonJS，故 require）。 */
const Astro = require(join(HERE, '..', '..', 'vendor', 'astronomy.cjs'))

/** 星历来源自证串（进 chart.meta，便于复核与 issue 定位）。 */
export const ASTRO_SOURCE = 'astronomy-engine@2.1.19 (MIT, Don Cross) · vendor/astronomy.cjs'
/** 黄经坐标架自证串。 */
export const ASTRO_FRAME = 'ECT 真黄道·当日真春分点（视位置：含光行时与光行差）'

// ───────────────────────────── 二十八宿距星 ─────────────────────────────

/**
 * 二十八宿**距星**（determinative star）ICRS J2000 赤道坐标。
 *
 * cite（坐标）: SIMBAD / CDS TAP 服务，ICRS 参考架、equinox J2000、epoch J2000 实测值。
 *   `SELECT main_id, ra, dec FROM basic WHERE main_id IN (...)`，2026-02 由 kernel-astro 一次性取回，
 *   原始响应与逐条数值记录在 `docs/verification/kernel-astro-crosscheck.md`。
 *   SIMBAD: https://simbad.u-strasbg.fr/simbad/sim-tap
 * cite（距星身份）: Wikipedia "Twenty-Eight Mansions" §List of mansions（该表引 潘鼐《中国恒星观测史》
 *   与 Needham, *Science and Civilisation in China* vol.3）。
 * ⚠ 已知异说：**心宿距星**古星表有作 心宿一（σ Sco）者，本表从维基/现代通说取 心宿二（α Sco）。
 *   另有 觜/参 两宿相距仅约 1.4°赤经（觜宿极窄），是其固有特征，不是 bug。
 * 顺序 = 传统自西向东（赤经递增）顺序：角→亢→…→轸→（回角）。
 */
export const SU28_STARS = [
  { name: '角', star: 'α Vir (Spica)', ra: 201.29824736156320, dec: -11.161319485111932 },
  { name: '亢', star: 'κ Vir', ra: 213.22393688595750, dec: -10.273703461482222 },
  { name: '氐', star: 'α² Lib', ra: 222.71963789158030, dec: -16.041776519834446 },
  { name: '房', star: 'π Sco', ra: 239.71297182416666, dec: -26.114107945 },
  { name: '心', star: 'α Sco (Antares)', ra: 247.35191541982640, dec: -26.432002611950832 },
  { name: '尾', star: 'μ¹ Sco', ra: 252.96761814529000, dec: -38.047399464000010 },
  { name: '箕', star: 'γ² Sgr', ra: 271.45203374499994, dec: -30.424089849444446 },
  { name: '斗', star: 'φ Sgr', ra: 281.41412309412124, dec: -26.990782645111390 },
  { name: '牛', star: 'β¹ Cap', ra: 305.25277749238000, dec: -14.781407602080000 },
  { name: '女', star: 'ε Aqr', ra: 311.91895655341670, dec: -9.495776926900833 },
  { name: '虚', star: 'β Aqr', ra: 322.88971698347876, dec: -5.5711748280636115 },
  { name: '危', star: 'α Aqr', ra: 331.44598144094790, dec: -0.3198509554241667 },
  { name: '室', star: 'α Peg', ra: 346.19022269142596, dec: 15.205267147927536 },
  { name: '壁', star: 'γ Peg', ra: 3.30896812090500040, dec: 15.183598429593890 },
  { name: '奎', star: 'η And', ra: 14.301667830110834, dec: 23.417650023123606 },
  { name: '娄', star: 'β Ari', ra: 28.660045788845140, dec: 20.808031471916408 },
  { name: '胃', star: '35 Ari', ra: 40.862976164400000, dec: 27.707149409290004 },
  { name: '昴', star: '17 Tau (Pleiades)', ra: 56.218904540787506, dec: 24.113337850020000 },
  { name: '毕', star: 'ε Tau', ra: 67.154167729664580, dec: 19.180434205813890 },
  { name: '觜', star: 'λ Ori', ra: 83.784490021032180, dec: 9.934155874166667 },
  { name: '参', star: 'ζ Ori (Alnitak)', ra: 85.189694427930680, dec: -1.9425735859722049 },
  { name: '井', star: 'μ Gem', ra: 95.740111926195640, dec: 22.513582745904277 },
  { name: '鬼', star: 'θ Cnc', ra: 127.898874834249980, dec: 18.094418172960000 },
  { name: '柳', star: 'δ Hya', ra: 129.414031136630000, dec: 5.7037877622300000 },
  { name: '星', star: 'α Hya', ra: 141.896844595859480, dec: -8.658599531745583 },
  { name: '张', star: 'υ¹ Hya', ra: 147.869479078842060, dec: -14.846628713346947 },
  { name: '翼', star: 'α Crt', ra: 164.943604815761660, dec: -18.298786220615558 },
  { name: '轸', star: 'γ Crv', ra: 183.951545037376800, dec: -17.541930457603193 },
]

/** 一年 365.25 古度 ÷ 360 现代度（古度换算用）。 */
const GU_DU_PER_DEG = 365.25 / 360

// ───────────────────────────── 时间与基础量 ─────────────────────────────

/**
 * JS Date → astronomy-engine 时间对象（只取绝对时刻，与时区无关）。
 * @param {Date} date 绝对时刻。
 * @returns {any} AstroTime。
 */
export function makeTime(date) {
  return Astro.MakeTime(date)
}

/**
 * ΔT = TT − UT（秒）。
 * cite: astronomy-engine `DeltaT_EspenakMeeus`，即 Espenak & Meeus 的 ΔT 多项式
 *   （NASA "Five Millennium Canon of Solar Eclipses" 同源模型，覆盖 −1999..+3000）。
 * @param {Date|any} date 时刻或 AstroTime。
 * @returns {number} 秒。
 */
export function deltaT(date) {
  const t = date && typeof date.tt === 'number' ? date : makeTime(date)
  return Astro.DeltaT_EspenakMeeus(t.tt)
}

/**
 * 太阳视黄经（度，ECT 真黄道·当日真春分点）。
 * cite: astronomy-engine `SunPosition`（文档：ecliptic coordinates, true equinox of date）。
 * @param {Date|any} date 时刻。
 * @returns {number} 0..360。
 */
export function sunLongitude(date) {
  const t = date && typeof date.tt === 'number' ? date : makeTime(date)
  return norm360(Astro.SunPosition(t).elon)
}

/**
 * 月亮视黄经（度，ECT）。月亮黄纬另见 {@link moonPosition}。
 * cite: astronomy-engine `EclipticGeoMoon`（ECT 角度；底稿为 Improved Lunar Ephemeris 1954 / Brown）。
 * @param {Date|any} date 时刻。
 * @returns {number} 0..360。
 */
export function moonLongitude(date) {
  const t = date && typeof date.tt === 'number' ? date : makeTime(date)
  return norm360(Astro.EclipticGeoMoon(t).lon)
}

/** 五星（七政之五）→ astronomy-engine Body。 */
const PLANET_BODY = { 水: 'Mercury', 金: 'Venus', 火: 'Mars', 木: 'Jupiter', 土: 'Saturn' }
/** 七政（日月 + 五星），占星类常用。 */
const SEVEN_BODY = { 日: 'Sun', 月: 'Moon', ...PLANET_BODY }
export { PLANET_BODY, SEVEN_BODY }

/**
 * 地心视黄经（度，ECT）。太阳与月亮走各自的高精度通道，五星走 `GeoVector` + `Ecliptic`。
 * cite: astronomy-engine `GeoVector(body, t, true)`（含光行时 + 光行差 → 视位置）
 *       + `Ecliptic()`（源码注释：EQJ → true ecliptic of date, ETC）。
 * @param {string} key 中文名（日/月/水/金/火/木/土）。
 * @param {Date|any} date 时刻。
 * @returns {number|null} 0..360；未知名字返回 null（**不抛异常**）。
 */
export function bodyLongitude(key, date) {
  const t = date && typeof date.tt === 'number' ? date : makeTime(date)
  if (key === '日') return sunLongitude(t)
  if (key === '月') return moonLongitude(t)
  const body = SEVEN_BODY[key]
  if (!body) return null
  return norm360(Astro.Ecliptic(Astro.GeoVector(Astro.Body[body], t, true)).elon)
}

/**
 * 月亮黄纬与地心距。
 * @param {Date|any} date 时刻。
 * @returns {{lon:number, lat:number, distAu:number}} ECT 黄经/黄纬/距离（AU）。
 */
export function moonPosition(date) {
  const t = date && typeof date.tt === 'number' ? date : makeTime(date)
  const m = Astro.EclipticGeoMoon(t)
  return { lon: norm360(m.lon), lat: m.lat, distAu: m.dist }
}

/**
 * 均时差（分钟）= 真太阳时 − 平太阳时。
 *
 * 定义与算法 cite: Meeus, *Astronomical Algorithms* 2nd ed. ch.28（Equation of Time）；
 *   EoT(度) = L0 − α_视，L0 为太阳几何平黄经（Meeus 25.2 式），α_视为太阳视赤经（当日真赤道、含光行差），
 *   再 ×4 化为分钟。取代 v1 calendar.js 里 NOAA 的 3 项三角近似（年内误差可达 ~30 s），
 *   本法与天文年历一致到数秒量级。
 *
 * 符号约定：正值 = 日晷快于钟表（如 11 月初 ≈ +16 min），与 v1 近似式同号，故 v1 行为不反转。
 *
 * @param {Date|any} date 时刻。
 * @returns {number} 分钟（约 −14.5 .. +16.5）。
 */
export function equationOfTimeMin(date) {
  const t = date && typeof date.tt === 'number' ? date : makeTime(date)
  // 儒略世纪（TT，自 J2000 起）
  const T = t.tt / 36525
  const l0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T
  // 太阳视赤经（当日真赤道 + 光行差）
  const raDeg = geocentricRaDeg('Sun', t, true)
  return 4 * norm180(l0 - raDeg)
}

/**
 * 太阳视赤经/赤纬（当日真赤道，含光行差）。
 * @param {Date|any} date 时刻。
 * @returns {{raHours:number, raDeg:number, dec:number}} 赤经（时/度）与赤纬（度）。
 */
export function sunEquatorial(date) {
  const t = date && typeof date.tt === 'number' ? date : makeTime(date)
  const v = Astro.EquatorFromVector(
    Astro.RotateVector(Astro.Rotation_EQJ_EQD(t), Astro.GeoVector(Astro.Body.Sun, t, true)),
  )
  return { raHours: v.ra, raDeg: norm360(v.ra * 15), dec: v.dec }
}

/**
 * 任意天体的**地心**当日真赤道赤经（度）。
 *
 * 说明：不使用 `Equator(body, t, observer, true, true)` —— 该 API 的 observer 参数不接受 null，
 * 且一旦传入地面观测者就变成**站心**坐标（月亮视差可达 0.6°），与术数"地心视位置"不符。
 * 故改为显式两步：`GeoVector`（地心 J2000，含光行时/光行差）→ `Rotation_EQJ_EQD`（岁差+章动）→ 赤经。
 * cite: astronomy-engine `GeoVector` / `Rotation_EQJ_EQD` / `EquatorFromVector`。
 *
 * @param {string} body 英文天体名（Sun/Moon/Mercury…）。
 * @param {any} t AstroTime。
 * @param {boolean} [aberration=true] 是否含光行差（视位置）。
 * @returns {number} 赤经（度，0..360）。
 */
function geocentricRaDeg(body, t, aberration = true) {
  const v = Astro.RotateVector(
    Astro.Rotation_EQJ_EQD(t),
    Astro.GeoVector(Astro.Body[body], t, aberration),
  )
  return norm360(Astro.EquatorFromVector(v).ra * 15)
}

/**
 * 格林尼治平恒星时（小时）。
 * cite: astronomy-engine `SiderealTime`（IAU 1982 GMST）。
 * @param {Date|any} date 时刻。
 * @returns {number} 0..24 小时。
 */
export function siderealTimeHours(date) {
  const t = date && typeof date.tt === 'number' ? date : makeTime(date)
  const h = Astro.SiderealTime(t)
  return ((h % 24) + 24) % 24
}

// ───────────────────────────── 二十八宿入宿度 ─────────────────────────────

/**
 * 二十八宿距星的**当日真赤道赤经**（度）。
 * 做法：SIMBAD 的 J2000 单位矢量，用 astronomy-engine 的 EQJ→EQD 旋转矩阵（含岁差 + 章动）转到当日真赤道。
 * cite: astronomy-engine `Rotation_EQJ_EQD` + `RotateVector` + `EquatorFromVector`。
 * @param {any} t AstroTime。
 * @returns {number[]} 与 {@link SU28_STARS} 同序的赤经（度，0..360）。
 */
function su28RaOfDate(t) {
  const rot = Astro.Rotation_EQJ_EQD(t)
  return SU28_STARS.map((s) => {
    const v = Astro.VectorFromSphere(new Astro.Spherical(s.dec, s.ra, 1), t)
    const eqd = Astro.RotateVector(rot, v)
    return norm360(Astro.EquatorFromVector(eqd).ra * 15)
  })
}

/**
 * 由赤经定二十八宿与入宿度（传统定义：以该宿**距星**为原点，沿赤道向东度量）。
 *
 * 算法：距星赤经在周天上自西向东递增，取"赤经不大于目标"的最后一颗距星即所在宿；
 *   入宿度 = (目标赤经 − 距星赤经) mod 360。
 * cite: 《汉书·律历志》以下历代历法的"入宿度/去极度"体系：入宿度为赤经差、去极度为极距。
 *   （现代软件有以黄经差代替者，故本函数额外给出 `ruDuByLon` 备参。）
 *
 * @param {number} raDeg 目标赤经（度，当日真赤道）。
 * @param {number} lonDeg 目标视黄经（度，ECT），用于附带黄经口径的入宿度。
 * @param {any} t AstroTime（用于把距星岁差到当日）。
 * @returns {{name:string, ruDu:number, ruDu365:number, ruDuByLon:number, star:string, refRa:number}} 宿名与入宿度。
 */
export function su28Of(raDeg, lonDeg, t) {
  const ras = su28RaOfDate(t)
  const ra = norm360(raDeg)
  let best = -1
  let bestDelta = Infinity
  for (let i = 0; i < ras.length; i += 1) {
    // 距星 i 到目标的东向弧长（落在 [0,360)）
    const d = norm360(ra - ras[i])
    // 取"刚过去的那颗"：弧长最小者即所在宿的距星
    if (d < bestDelta) { bestDelta = d; best = i }
  }
  const star = SU28_STARS[best]
  const ruDu = bestDelta
  // 黄经口径（备参）：距星自身的视黄经不好直接取，改用同宿起点黄经的等价量 —— 由赤经差近似换到黄经差会引入黄纬误差，
  // 故此处只用「目标黄经 − 该宿距星黄经」的严格值（距星黄经由 EQD 矢量转 ECT 得到）。
  let ruDuByLon = null
  try {
    // 距星的视黄经：J2000 矢量直接经 `Ecliptic()`（EQJ → ECT）得到，与太阳/行星同一坐标架。
    const v = Astro.VectorFromSphere(new Astro.Spherical(star.dec, star.ra, 1), t)
    const lon = norm360(Astro.Ecliptic(v).elon)
    ruDuByLon = norm360(norm360(lonDeg) - lon)
  } catch {
    ruDuByLon = null
  }
  return {
    name: star.name,
    ruDu: round(ruDu, 4),
    ruDu365: round(ruDu * GU_DU_PER_DEG, 4),
    ruDuByLon: ruDuByLon === null ? null : round(ruDuByLon, 4),
    star: star.star,
    refRa: round(norm360(ras[best]), 4),
  }
}

// ───────────────────────────── 节气（第二通路） ─────────────────────────────

/** 二十四节气名 → 太阳视黄经（度）。cite: 通行定气定义（春分 0°、每气 15°）。 */
export const JIEQI_LON = {
  春分: 0, 清明: 15, 谷雨: 30, 立夏: 45, 小满: 60, 芒种: 75,
  夏至: 90, 小暑: 105, 大暑: 120, 立秋: 135, 处暑: 150, 白露: 165,
  秋分: 180, 寒露: 195, 霜降: 210, 立冬: 225, 小雪: 240, 大雪: 255,
  冬至: 270, 小寒: 285, 大寒: 300, 立春: 315, 雨水: 330, 惊蛰: 345,
}

/**
 * 求从某时刻起**下一次**太阳到达指定视黄经的时刻（定气）。
 * 用途：与 vendor/lunar.cjs 寿星历的节气表做**独立第二通路对拍**（见 docs/verification）。
 * cite: astronomy-engine `SearchSunLongitude`（自研 VSOP87 截断 + 迭代求根）。
 * @param {number} lonDeg 目标视黄经（度）。
 * @param {Date} from 起算时刻。
 * @param {number} [limitDays=40] 搜索上限（天）。
 * @returns {{at:string, atDate:Date, lon:number}|null} ISO 本地时间串与 Date；找不到返回 null。
 */
export function nextSolarTerm(lonDeg, from, limitDays = 40) {
  const t0 = makeTime(from)
  const hit = Astro.SearchSunLongitude(lonDeg, t0, limitDays)
  if (!hit) return null
  const d = hit.date
  return { at: localText(d), atDate: d, lon: lonDeg }
}

// ───────────────────────────── 汇总入口 ─────────────────────────────

/**
 * 一次性算出历法层需要的一切天文量。
 * @param {Date} date 绝对时刻（调用方已决定是否做真太阳时校正；本函数不做校正）。
 * @returns {object} 见契约 §3.1 `chart.astro` 及附加字段。
 */
export function computeAstro(date) {
  const t = makeTime(date)
  const sun = Astro.SunPosition(t)
  const moon = Astro.EclipticGeoMoon(t)
  const sunRaDeg = geocentricRaDeg('Sun', t, true)
  const sunDec = Astro.EquatorFromVector(
    Astro.RotateVector(Astro.Rotation_EQJ_EQD(t), Astro.GeoVector(Astro.Body.Sun, t, true)),
  ).dec

  /** 五星地心视黄经（度，ECT）。 */
  const planets = {}
  /** 七政（日月五星）。 */
  const seven = { 日: norm360(sun.elon), 月: norm360(moon.lon) }
  /** 行星视黄经速度（度/日，中心差分）与逆行标记。 */
  const speed = {}
  const retro = {}
  const dt = 0.5 // 天；中心差分步长
  const tA = makeTime(new Date(date.getTime() - dt * 86400000))
  const tB = makeTime(new Date(date.getTime() + dt * 86400000))
  for (const [key, body] of Object.entries(PLANET_BODY)) {
    const lon = norm360(Astro.Ecliptic(Astro.GeoVector(Astro.Body[body], t, true)).elon)
    planets[key] = round(lon, 5)
    seven[key] = round(lon, 5)
    try {
      const lonA = Astro.Ecliptic(Astro.GeoVector(Astro.Body[body], tA, true)).elon
      const lonB = Astro.Ecliptic(Astro.GeoVector(Astro.Body[body], tB, true)).elon
      const v = norm180(lonB - lonA) / (2 * dt)
      speed[key] = round(v, 5)
      retro[key] = v < 0
    } catch {
      speed[key] = null
      retro[key] = null
    }
  }
  // 日月的视黄经速度（月亮约 13.18 度/日，太阳约 0.986 度/日）——七政四余断"迟疾"用
  speed.日 = round(norm180(sunLongitude(tB) - sunLongitude(tA)) / (2 * dt), 5)
  speed.月 = round(norm180(moonLongitude(tB) - moonLongitude(tA)) / (2 * dt), 5)
  retro.日 = speed.日 < 0
  retro.月 = speed.月 < 0

  const sunLon = norm360(sun.elon)
  const moonLon = norm360(moon.lon)
  const su28 = su28Of(sunRaDeg, sunLon, t)
  const moonSu28 = su28Of(geocentricRaDeg('Moon', t, true), moonLon, t)

  return {
    // ── 契约 §3.1 必需字段 ──
    sunLon: round(sunLon, 5),
    moonLon: round(moonLon, 5),
    planets,
    su28,
    deltaT: round(deltaT(t), 4),
    eotMin: round(equationOfTimeMin(t), 4),

    // ── 附加（只增不改，方法层可选用） ──
    /** 太阳视黄纬（度，≈0，留作校验）。 */
    sunLat: round(sun.elat, 6),
    /** 月亮黄纬与地心距。 */
    moonLat: round(moon.lat, 5),
    moonDistAu: round(moon.dist, 8),
    /** 七政视黄经（日月五星）。 */
    seven,
    /** 视黄经速度（度/日）与逆行（留/逆）标记。 */
    speed, retro,
    /** 太阳视赤经/赤纬（当日真赤道）。 */
    sunRaDeg: round(sunRaDeg, 5),
    sunDec: round(sunDec, 5),
    /** 月亮所在的二十八宿与入宿度（月离）。 */
    moonSu28,
    /** 格林尼治平恒星时（小时）。 */
    siderealHours: round(siderealTimeHours(t), 6),
    /** 月相：0=新月 0.5=满月（与"朔望"对齐，供择日/占星用）。 */
    moonPhase: round(Astro.MoonPhase(t), 6),
    /** 日月视黄经差（度，0=朔 180=望）。 */
    moonElong: round(norm360(moonLon - sunLon), 5),
    /** 自证串。 */
    source: ASTRO_SOURCE,
    frame: ASTRO_FRAME,
  }
}

// ───────────────────────────── 数值小工具 ─────────────────────────────

/** 归一到 [0,360)。 */
export function norm360(x) {
  const v = Number.isFinite(x) ? x : 0
  return ((v % 360) + 360) % 360
}

/** 归一到 (-180,180]。 */
export function norm180(x) {
  const v = norm360(x)
  return v > 180 ? v - 360 : v
}

/** 四舍五入到 n 位（避免浮点尾巴污染输出）。 */
function round(x, n) {
  const f = 10 ** n
  return Math.round((Number.isFinite(x) ? x : 0) * f) / f
}

/** 本地时间文本（与 calendar.js 的 solar.text 同格式）。 */
function localText(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
