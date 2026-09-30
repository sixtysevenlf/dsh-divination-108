/**
 * 术数内核 · 历法层
 *
 * 把「一个时刻 + 一个问题」变成所有术法共用的**盘基**（Chart）。
 * 108 法都从这里取干支、节气、月令、空亡、神煞……不再各自推算历法。
 *
 * 历法本体交给内置的 `lunar-javascript`（vendor/lunar.cjs，六年节气/农历/神煞表），
 * 本层只做三件事：
 *   1. **归一化**：把库的分散 getter 收成一张扁平、稳定的盘；
 *   2. **补算**：真太阳时、五行力量统计、驿马桃花等库没有的派生量；
 *   3. **容错**：库版本差异时，缺哪个字段就留空，绝不因为一个 getter 抛错让整盘失败。
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  GAN, ZHI, GAN_WUXING, ZHI_WUXING, ZHI_ANIMAL, ZHI_CANGGAN,
  NAYIN, xunOf, shenShaOf, mod, emptyWuxing, hash32,
} from './kit.js'

const require = createRequire(import.meta.url)
const HERE = dirname(fileURLToPath(import.meta.url))
/** @type {any} 内置历法库（CommonJS，故用 require 载入，避免 ESM 默认导出歧义）。 */
const LunarLib = require(join(HERE, '..', '..', 'vendor', 'lunar.cjs'))

/** 调用库方法，失败返回兜底值（版本差异不该让整盘崩掉）。 */
function safe(fn, fallback = null) {
  try {
    const v = fn()
    return v === undefined || v === null ? fallback : v
  } catch {
    return fallback
  }
}

/** 标准时区中央经线（东八区 = 120°E）。 */
const STD_MERIDIAN = 120

/**
 * 均时差（分钟）——真太阳时校正的第二项。
 * 用 NOAA 的常用近似式，年内误差 < 30 秒，对择时足够。
 * @param {number} dayOfYear 年积日（1..366）。
 * @returns {number} 分钟数（可为负）。
 */
function equationOfTime(dayOfYear) {
  const b = (2 * Math.PI * (dayOfYear - 81)) / 364
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b)
}

/**
 * 年积日。
 * @param {Date} d 日期（按本地分量取）。
 * @returns {number} 1..366。
 */
function dayOfYear(d) {
  const start = Date.UTC(d.getFullYear(), 0, 0)
  const cur = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((cur - start) / 86400000)
}

/**
 * 真太阳时校正。
 * 真太阳时 = 平太阳时 + (经度 − 中央经线) × 4 分钟 + 均时差。
 * @param {Date} d 平太阳时（本机时区）。
 * @param {number} longitude 当地经度（东经为正）。
 * @returns {{minutes:number, text:string}} 总校正分钟数与说明。
 */
export function trueSolarOffset(d, longitude) {
  const lonPart = (longitude - STD_MERIDIAN) * 4
  const eot = equationOfTime(dayOfYear(d))
  const total = lonPart + eot
  return {
    minutes: total,
    text: `经度差 ${lonPart >= 0 ? '+' : ''}${lonPart.toFixed(1)}′ 均时差 ${eot >= 0 ? '+' : ''}${eot.toFixed(1)}′`,
  }
}

/**
 * 统计一组干支的五行力量（天干各记 1，地支按本气记 1，中气记 0.4，余气记 0.2）。
 * @param {string[]} gzs 干支字符串数组。
 * @returns {{木:number,火:number,土:number,金:number,水:number}} 五行计数。
 */
export function wuxingCount(gzs) {
  const out = emptyWuxing()
  for (const gz of gzs) {
    if (typeof gz !== 'string' || gz.length < 2) continue
    const [g, z] = [gz[0], gz[1]]
    if (GAN_WUXING[g]) out[GAN_WUXING[g]] += 1
    const hidden = ZHI_CANGGAN[z] ?? []
    const weights = [1, 0.4, 0.2]
    hidden.forEach((hg, i) => {
      const wx = GAN_WUXING[hg]
      if (wx) out[wx] += weights[i] ?? 0.2
    })
  }
  return out
}

/**
 * 构建盘基。
 *
 * @param {object} input 求占输入。
 * @param {string} [input.question] 所问之事（进入随机种子，保证同问同时刻同结果）。
 * @param {Date} [input.when] 求占时刻，缺省为当前时刻。
 * @param {number} [input.longitude] 当地经度（做真太阳时校正；缺省不校正）。
 * @param {'男'|'女'} [input.gender] 性别（命理类需要）。
 * @param {{y:number,m:number,d:number,h:number,mi:number,longitude?:number}} [input.birth] 出生资料（命理类需要）。
 * @param {number[]} [input.numbers] 报数（梅花/测字等需要）。
 * @param {number[]} [input.coins] 指定六爻钱面（回放用）。
 * @param {string|number} [input.seed] 显式种子（覆盖默认派生）。
 * @returns {Chart} 盘基。
 */
export function buildChart(input = {}) {
  const question = typeof input.question === 'string' ? input.question.trim() : ''
  const when = input.when instanceof Date && !Number.isNaN(input.when.getTime())
    ? input.when
    : (input.when ? new Date(input.when) : new Date())
  const longitude = Number.isFinite(input.longitude) ? input.longitude : null

  // ── 真太阳时校正：仅当给了经度才动，否则用平太阳时（避免"猜经度"）。
  let solarDate = when
  let solarNote = '未校正（未提供经度）'
  if (longitude !== null) {
    const { minutes, text } = trueSolarOffset(when, longitude)
    solarDate = new Date(when.getTime() + minutes * 60000)
    solarNote = text
  }

  const solar = LunarLib.Solar.fromYmdHms(
    solarDate.getFullYear(), solarDate.getMonth() + 1, solarDate.getDate(),
    solarDate.getHours(), solarDate.getMinutes(), solarDate.getSeconds(),
  )
  const lunar = solar.getLunar()
  const ec = safe(() => lunar.getEightChar(), null)

  // ── 年柱：必须按**立春**换年，不是按农历正月初一 ──
  // 这是术数里最常踩的坑：2026-02-05 农历仍算乙巳年，但立春已过，四柱年柱应为丙午。
  // `getYearInGanZhi()` 是农历年；`getYearInGanZhiExact()` 才是立春换年（且精确到时刻）。
  // 四柱/紫白/太岁/五运六气都要立春年；生肖民俗用农历年，故两者都留在盘上。
  const yearGZ = safe(() => lunar.getYearInGanZhiExact(), '') || safe(() => lunar.getYearInGanZhi(), '')
  const lunarYearGZ = safe(() => lunar.getYearInGanZhi(), '')
  const monthGZ = safe(() => lunar.getMonthInGanZhi(), '')
  const dayGZ = safe(() => lunar.getDayInGanZhi(), '')
  const hourGZ = safe(() => lunar.getTimeInGanZhi(), '')
  const pillars = [yearGZ, monthGZ, dayGZ, hourGZ]

  const dayGan = dayGZ[0] ?? ''
  const dayZhi = dayGZ[1] ?? ''
  const monthZhi = monthGZ[1] ?? ''
  const yearZhi = yearGZ[1] ?? ''
  const hourZhi = hourGZ[1] ?? ''

  const prevJieQi = safe(() => lunar.getPrevJieQi(), null)
  const nextJieQi = safe(() => lunar.getNextJieQi(), null)

  const monthWx = ZHI_WUXING[monthZhi] ?? '土'
  const { xun, kong } = xunOf(dayGZ || '甲子')

  const wx = wuxingCount(pillars)

  /** 四柱详细。 */
  const pillarDetail = [
    { name: '年', gz: yearGZ },
    { name: '月', gz: monthGZ },
    { name: '日', gz: dayGZ },
    { name: '时', gz: hourGZ },
  ].map(({ name, gz }) => ({
    name,
    gz,
    gan: gz[0] ?? '',
    zhi: gz[1] ?? '',
    ganWx: GAN_WUXING[gz[0]] ?? '',
    zhiWx: ZHI_WUXING[gz[1]] ?? '',
    nayin: NAYIN[gz] ?? '',
    animal: ZHI_ANIMAL[gz[1]] ?? '',
  }))

  /** 神煞（以年支与日支各查一遍）。 */
  const shensha = {}
  for (const kind of ['驿马', '桃花', '华盖', '将星']) {
    const byYear = shenShaOf(kind, yearZhi)
    const byDay = shenShaOf(kind, dayZhi)
    shensha[kind] = { byYear, byDay, hit: byYear === byDay ? byYear : `${byYear ?? '—'}/${byDay ?? '—'}` }
  }

  /** 大运（仅当有出生资料时算）。 */
  let yun = null
  if (input.birth && ec) {
    const genderNum = input.gender === '女' ? 0 : 1
    const y = safe(() => ec.getYun(genderNum), null)
    if (y) {
      yun = {
        startYear: safe(() => y.getStartYear(), 0),
        startMonth: safe(() => y.getStartMonth(), 0),
        startDay: safe(() => y.getStartDay(), 0),
        startSolar: safe(() => safe(() => y.getStartSolar().toYmdHms(), ''), ''),
        daYun: safe(() => (y.getDaYun() || []).slice(0, 9).map((d) => ({
          gz: safe(() => d.getGanZhi(), ''),
          startAge: safe(() => d.getStartAge(), 0),
          endAge: safe(() => d.getEndAge(), 0),
          startYear: safe(() => d.getStartYear(), 0),
        })), []),
      }
    }
  }

  /** 出生盘（命理类）。 */
  let birthChart = null
  if (input.birth) {
    const b = input.birth
    const bs = safe(() => LunarLib.Solar.fromYmdHms(b.y, b.m, b.d, b.h ?? 12, b.mi ?? 0, 0), null)
    if (bs) {
      const bl = bs.getLunar()
      const bec = safe(() => bl.getEightChar(), null)
      const bgz = [
        safe(() => bl.getYearInGanZhi(), ''),
        safe(() => bl.getMonthInGanZhi(), ''),
        safe(() => bl.getDayInGanZhi(), ''),
        safe(() => bl.getTimeInGanZhi(), ''),
      ]
      birthChart = {
        solar: `${b.y}-${String(b.m).padStart(2, '0')}-${String(b.d).padStart(2, '0')} ${String(b.h ?? 12).padStart(2, '0')}:${String(b.mi ?? 0).padStart(2, '0')}`,
        lunar: safe(() => bl.toString(), ''),
        pillars: bgz,
        dayGan: bgz[2][0] ?? '',
        yearZhi: bgz[0][1] ?? '',
        monthZhi: bgz[1][1] ?? '',
        dayZhi: bgz[2][1] ?? '',
        hourZhi: bgz[3][1] ?? '',
        wuxing: wuxingCount(bgz),
        nayin: bgz.map((g) => NAYIN[g] ?? ''),
        taiYuan: safe(() => bec?.getTaiYuan(), ''),
        mingGong: safe(() => bec?.getMingGong(), ''),
        shenGong: safe(() => bec?.getShenGong(), ''),
        tenGods: bgz.map((g, i) => (i === 2 ? '日主' : safe(() => [
          bec?.getYearShiShenGan?.(), bec?.getMonthShiShenGan?.(), null, bec?.getTimeShiShenGan?.(),
        ][i], '—'))),
      }
    }
  }

  /** 确定性种子：同问 + 同时刻 + 同法号 → 同结果。 */
  const seedBase = input.seed !== undefined
    ? String(input.seed)
    : `${question}|${solarDate.toISOString()}|${longitude ?? 'nolng'}`

  const now = new Date()

  return {
    // 输入
    question,
    when,
    solarDate,
    longitude,
    solarNote,
    gender: input.gender === '女' ? '女' : '男',
    numbers: Array.isArray(input.numbers) ? input.numbers.map(Number).filter(Number.isFinite) : [],
    coins: Array.isArray(input.coins) ? input.coins.map(Number).filter(Number.isFinite) : [],
    seedBase,

    // 公历 / 农历
    solar: {
      y: solarDate.getFullYear(), m: solarDate.getMonth() + 1, d: solarDate.getDate(),
      h: solarDate.getHours(), mi: solarDate.getMinutes(),
      weekday: ['日', '一', '二', '三', '四', '五', '六'][solarDate.getDay()],
      text: `${solarDate.getFullYear()}-${String(solarDate.getMonth() + 1).padStart(2, '0')}-${String(solarDate.getDate()).padStart(2, '0')} ${String(solarDate.getHours()).padStart(2, '0')}:${String(solarDate.getMinutes()).padStart(2, '0')}`,
    },
    lunar: {
      year: safe(() => lunar.getYear(), 0),
      month: safe(() => lunar.getMonth(), 0),
      day: safe(() => lunar.getDay(), 0),
      text: safe(() => lunar.toString(), ''),
      monthName: safe(() => lunar.getMonthInChinese(), ''),
      dayName: safe(() => lunar.getDayInChinese(), ''),
      season: safe(() => lunar.getSeason(), ''),
    },

    // 四柱（年柱已按立春换年，见上文注释）
    ganzhi: { year: yearGZ, month: monthGZ, day: dayGZ, hour: hourGZ },
    /** 农历年干支（生肖民俗用；与四柱年柱在立春前后会不同）。 */
    lunarYearGZ,
    lunarYearZhi: lunarYearGZ[1] ?? '',
    /** 立春年与农历年是否一致（不一致时，命理类与生肖类会给出不同的年）。 */
    yearBoundarySplit: yearGZ !== lunarYearGZ,
    pillars,
    pillarDetail,
    dayGan, dayZhi, monthZhi, yearZhi, hourZhi,
    dayMasterWx: GAN_WUXING[dayGan] ?? '',
    monthWx,
    wuxing: wx,
    birthChart,
    yun,

    // 节气
    jieqi: {
      prev: safe(() => prevJieQi?.getName(), ''),
      prevAt: safe(() => prevJieQi?.getSolar()?.toYmdHms(), ''),
      next: safe(() => nextJieQi?.getName(), ''),
      nextAt: safe(() => nextJieQi?.getSolar()?.toYmdHms(), ''),
      current: safe(() => lunar.getJieQi(), ''),
      hou: safe(() => lunar.getHou(), ''),
      wuhou: safe(() => lunar.getWuHou(), ''),
    },

    // 旬空
    xun: { name: xun, kong },
    xunKong: {
      day: safe(() => lunar.getDayXunKong(), kong.join('')),
      time: safe(() => lunar.getTimeXunKong(), ''),
      year: safe(() => lunar.getYearXunKong(), ''),
    },

    // 择日 / 黄历
    almanac: {
      zhiXing: safe(() => lunar.getZhiXing(), ''),                 // 建除十二神
      tianShen: safe(() => lunar.getDayTianShen(), ''),            // 黄黑道值日神
      tianShenType: safe(() => lunar.getDayTianShenType(), ''),    // 黄道/黑道
      tianShenLuck: safe(() => lunar.getDayTianShenLuck(), ''),    // 吉/凶
      xiu: safe(() => lunar.getXiu(), ''),                         // 二十八宿
      xiuLuck: safe(() => lunar.getXiuLuck(), ''),
      xiuSong: safe(() => lunar.getXiuSong(), ''),
      zheng: safe(() => lunar.getZheng(), ''),
      animal: safe(() => lunar.getAnimal(), ''),
      nineStar: safe(() => lunar.getDayNineStar()?.toString(), ''),  // 日九星
      nineStarNum: safe(() => lunar.getDayNineStar()?.getNumber(), 0),
      timeNineStar: safe(() => lunar.getTimeNineStar?.()?.toString(), ''),
      yi: safe(() => lunar.getDayYi(), []),
      ji: safe(() => lunar.getDayJi(), []),
      jiShen: safe(() => lunar.getDayJiShen(), []),
      xiongSha: safe(() => lunar.getDayXiongSha(), []),
      pengZuGan: safe(() => lunar.getPengZuGan(), ''),
      pengZuZhi: safe(() => lunar.getPengZuZhi(), ''),
      liuYao: safe(() => lunar.getLiuYao(), ''),                    // 六曜
      shou: safe(() => lunar.getShou(), ''),
      positionXi: safe(() => lunar.getDayPositionXi(), ''),
      positionCai: safe(() => lunar.getDayPositionCai(), ''),
      positionTai: safe(() => lunar.getDayPositionTai(), ''),
      positionFu: safe(() => lunar.getDayPositionFu?.(), ''),
    },

    // 神煞
    shensha,

    // 元信息
    meta: { builtAt: now.toISOString(), hash: hash32(seedBase) },
  }
}

/**
 * @typedef {ReturnType<typeof buildChart>} Chart
 */

/**
 * 把干支序号转成干支串（供各法起卦用）。
 * @param {number} i 序号。
 * @returns {string} 干支。
 */
export function gz(i) {
  return GAN[mod(i, 10)] + ZHI[mod(i, 12)]
}

export { LunarLib }
