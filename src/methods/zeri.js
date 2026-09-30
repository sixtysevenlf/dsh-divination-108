/**
 * 方法模块 · 择时/择日类（14 法：#59 黄历宜忌 … #72 综合择日）
 *
 * 契约见 `src/core/runner.js` 顶部注释；结构与代码风格照 `src/methods/yijing.js`。
 * 私有数据表在 `src/methods/data/zeri.js`。
 *
 * ## 本模块共用的口径（全部写在明处，可核可改）
 * 1. **择日必须可复现**：本模块**不用随机数**（择日不是掷骰子），
 *    因此 `rand` 参数不使用；一切从 `chart` 与历法库推出。
 * 2. **时刻来源**：只用 `chart.when` / `chart.solar` / 四柱，不读时钟。
 *    "未来 N 日"一律 `new Date(chart.when.getTime() + n * 86400000)` 推。
 * 3. **历法真源**：日干支、建除、值神、二十八宿、日九星、宜忌、六曜全部取
 *    `chart.almanac`（内置历法库 vendor/lunar.cjs）。时家数据（时干支/时值神/
 *    时九星/时宜忌）取同一个库，避免自造时家神煞表。
 * 4. **立春换年**：紫白年星、太岁、五运六气都要"立春换年"的干支年，而
 *    `chart.ganzhi.year` 是**农历换年**。故由「节气月 + 公历日」反推立春年 `Y`：
 *    寅月（立春）为一岁之首，丑月与公历 1 月的子月仍属上一年（见 `liChunYear`）。
 * 5. **九星口诀**（均与内置历法库逐项对过，见各引擎 `detail.校验`）：
 *    · 年白 = `mod(2 − Y, 9)`（0 作 9）。核验：1864 上元甲子年 = 一白 ✓、2024 = 三碧 ✓、2026 = 一白 ✓。
 *    · 月白：子午卯酉年正月起八白、辰戌丑未年正月起五黄、寅申巳亥年正月起二黑，逐月**逆退**一位。
 *    · 时白：冬至后（阳遁）子午卯酉日一白、辰戌丑未日四绿、寅申巳亥日七赤，**顺行**；
 *      夏至后（阴遁）子午卯酉日九紫、辰戌丑未日六白、寅申巳亥日三碧，**逆行**。
 *    · 日白：口径较繁（冬至后甲子日顺飞、夏至后甲子日逆飞），直接用历法库 `almanac.nineStarNum`。
 * 6. **黄黑道十二值神**：值日神 = 月支起青龙顺行（寅申月青龙在子、卯酉月青龙在寅、
 *    辰戌月青龙在辰、巳亥月青龙在午、午子月青龙在申、未丑月青龙在戌），即
 *    `起支 = mod(2 × (月支序 − 2), 12)`；值时神 = `起支 = mod(2 × 日支序 + 8, 12)`。
 *    两条都实测对过：值日神 400 日、值时神 400 日 × 12 时辰，与历法库全同。
 * 7. **异体字归一**：历法库六曜作「佛灭」，`core/tables.js` 的 LIUYAO 表作「仏灭」，
 *    同一曜而字形不同，故 `liuyaoName()` 统一，避免六日之中有一日查表落空。
 * 8. **打分方式**：各引擎"分项加权（`weightedScore`）+ 硬性凶煞扣分"，权重写在各引擎里。
 *
 * ## 保真度
 * 14 法全部按注册表 fidelity 输出（full/core）。**没有任何一条依赖秘传表**：
 * 用到的都是通书通行表、内置历法库原文/算法、或上面写明的公开口诀。
 * 简化之处（奇门未排局、董公未含逐月全表、二十八宿事类用歌诀关键词提取）
 * 都在各自 `detail.说明` 里写明，不冒充完整传承。
 */

import {
  GAN, ZHI, GAN_WUXING, ZHI_WUXING, ZHI_LIUHE, ZHI_LIUCHONG, ZHI_SANHE, ZHI_XIANGHAI, ZHI_XIANGXING,
  relation, wangShuai, clamp, mod, weightedScore,
} from '../core/kit.js'
import {
  JIANCHU, HUANGHEIDAO, XIU28, LIUYAO, NINE_STAR,
  DONGGONG_JI, YANGGONG_13, WUYUN, LIUQI_SITIAN,
} from '../core/tables.js'
import { buildChart, LunarLib } from '../core/calendar.js'
import * as ZD from './data/zeri.js'

// ───────────────────────────── 小工具 ─────────────────────────────

/** 保证是数组。 */
const arrOf = (v) => (Array.isArray(v) ? v : [])

/** 带符号取整。 */
const signed = (n) => `${n >= 0 ? '+' : ''}${Math.round(n)}`

/** 中文数字 → 1..9（历法库九星返回「一」…「九」）。 */
function cnNum(s) {
  const i = '一二三四五六七八九'.indexOf(String(s ?? ''))
  return i >= 0 ? i + 1 : 0
}

/** 取九星对象。 */
const starInfo = (n) => NINE_STAR.find((s) => s.num === n) ?? null

/**
 * 六曜名归一。
 * 内置历法库作「佛灭」（U+4F5B），core/tables.js 的 LIUYAO 表作「仏灭」（U+4ECF）——同一曜，
 * 异体字不同，故此处统一成表里的写法，避免六日之中有一日查表落空。
 * @param {string} raw 库返回的六曜名。
 * @returns {string} 归一后的六曜名。
 */
function liuyaoName(raw) {
  const s = String(raw ?? '')
  return s === '佛灭' || s === '佛滅' || s === '仏滅' ? '仏灭' : s
}

/** 九星吉凶 → 分。 */
const luckScore = (luck) => ZD.NINE_LUCK_SCORE[luck] ?? 0

/** 二十四节气（自冬至起），用于判阳遁/阴遁（时白顺逆）。 */
const JIEQI_FROM_DONGZHI = [
  '冬至', '小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种',
  '夏至', '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪',
]

/**
 * 立春换年的公历年（紫白年星、太岁、五运六气用）。
 * 节气月以寅月为岁首：丑月（公历 1 月）与公历 1 月的子月仍属上一年。
 * @param {object} chart 盘基。
 * @returns {number} 立春纪年的公历年。
 */
function liChunYear(chart) {
  const mz = chart?.ganzhi?.month?.[1] ?? ''
  const mi = ZHI.indexOf(mz)
  const y = chart?.solar?.y ?? 0
  if (mi === 1) return y - 1                       // 丑月：公历 1 月，属上一年
  if (mi === 0 && (chart?.solar?.m ?? 0) === 1) return y - 1  // 子月跨年，公历 1 月上旬属上一年
  return y
}

/**
 * 立春换年的年干支。
 * @param {object} chart 盘基。
 * @returns {{y:number, gan:string, zhi:string}} 年干支。
 */
function yearGZ(chart) {
  const y = liChunYear(chart)
  return { y, gan: GAN[mod(y - 4, 10)], zhi: ZHI[mod(y - 4, 12)] }
}

/** 年紫白（入中之星）。 */
const yearStar = (y) => mod(2 - y, 9) || 9

/**
 * 月紫白（入中之星）。
 * @param {string} yearZhi 立春年支。
 * @param {string} monthZhi 节气月支（寅 = 正月）。
 * @returns {number} 1..9。
 */
function monthStar(yearZhi, monthZhi) {
  const yi = ZHI.indexOf(yearZhi)
  const mi = ZHI.indexOf(monthZhi)
  if (yi < 0 || mi < 0) return 0
  const start = { 0: 8, 1: 5, 2: 2 }[yi % 3]        // 子午卯酉 8、辰戌丑未 5、寅申巳亥 2
  const mIdx = mod(mi - 2, 12) + 1                  // 寅月 = 1
  return mod(start - (mIdx - 1) - 1, 9) + 1
}

/** 是否阳遁（冬至后至夏至前）——决定时白顺逆。 */
function isYangDun(chart) {
  const prev = chart?.jieqi?.prev ?? ''
  const m = chart?.solar?.m ?? 1
  const i = JIEQI_FROM_DONGZHI.indexOf(prev)
  let yang = i >= 0 ? i < 12 : (m >= 12 || m <= 6)
  // 历法库按「日」切换顺逆（冬至/夏至当日 0 时即入新段），故当日须按下一节气校正
  const next = chart?.jieqi?.next ?? ''
  const at = String(chart?.jieqi?.nextAt ?? '')
  if ((next === '冬至' || next === '夏至') && at !== '') {
    const [yy, mm, dd] = at.split(/[- :]/).map(Number)
    if (yy === chart.solar.y && mm === chart.solar.m && dd === chart.solar.d) yang = next === '冬至'
  }
  return yang
}

/**
 * 时紫白（入中之星）。
 * @param {string} dayZhi 日支。
 * @param {string} hourZhi 时支。
 * @param {boolean} yang 是否阳遁（冬至后）。
 * @returns {number} 1..9。
 */
function timeStar(dayZhi, hourZhi, yang) {
  const di = ZHI.indexOf(dayZhi)
  const hi = ZHI.indexOf(hourZhi)
  if (di < 0 || hi < 0) return 0
  const g = di % 3
  const start = yang ? [1, 4, 7][g] : [9, 6, 3][g]
  return yang ? mod(start - 1 + hi, 9) + 1 : mod(start - 1 + 9 - hi, 9) + 1
}

/**
 * 某星入中时，五黄所到之宫与方位。
 * 飞布序：中→乾→兑→艮→离→坎→坤→震→巽（宫位数 5,6,7,8,9,1,2,3,4）。
 * @param {number} star 入中之星。
 * @returns {{palace:number, dir:string}} 宫位与方位。
 */
function wuHuangOf(star) {
  const palace = ZD.LUOSHU_FLY[mod(5 - star, 9)] ?? 0
  return { palace, dir: ZD.PALACE_DIR[palace] ?? '—' }
}

/**
 * 值时神（黄黑道十二神按时辰轮转，青龙起支 = mod(2×日支序 + 8, 12)）。
 * @param {string} dayZhi 日支。
 * @param {string} hourZhi 时支。
 * @returns {string} 值神名。
 */
function hourShenOf(dayZhi, hourZhi) {
  const di = ZHI.indexOf(dayZhi)
  const hi = ZHI.indexOf(hourZhi)
  if (di < 0 || hi < 0) return ''
  const start = mod(2 * di + 8, 12)
  return ZD.TIANSHEN_ORDER[mod(hi - start, 12)] ?? ''
}

/**
 * 值日神（青龙起支 = mod(2×(月支序 − 2), 12)，顺行）。
 * @param {string} monthZhi 月支。
 * @param {string} dayZhi 日支。
 * @returns {string} 值神名。
 */
function dayShenOf(monthZhi, dayZhi) {
  const mi = ZHI.indexOf(monthZhi)
  const di = ZHI.indexOf(dayZhi)
  if (mi < 0 || di < 0) return ''
  const start = mod(2 * (mi - 2), 12)
  return ZD.TIANSHEN_ORDER[mod(di - start, 12)] ?? ''
}

/**
 * 建除值日（建日 = 日支同月支，余顺行）。
 * @param {string} monthZhi 月支。
 * @param {string} dayZhi 日支。
 * @returns {string} 建除神名。
 */
function jianChuOf(monthZhi, dayZhi) {
  const mi = ZHI.indexOf(monthZhi)
  const di = ZHI.indexOf(dayZhi)
  if (mi < 0 || di < 0) return ''
  return ZD.JIANCHU_ORDER[mod(di - mi, 12)] ?? ''
}

/**
 * 从问题里认事类。
 * @param {string} question 所问。
 * @returns {object} 事类（含 id / name / terms，未识别时为通用）。
 */
function topicOf(question) {
  const q = String(question ?? '')
  if (q === '') return ZD.GENERAL_TOPIC
  let best = null
  for (const t of ZD.ZERI_TOPICS) {
    const hit = t.kw.filter((k) => q.includes(k))
    if (hit.length === 0) continue
    const weight = hit.length * 10 + hit.reduce((s, k) => s + k.length, 0)
    if (!best || weight > best.weight) best = { t, weight, hit }
  }
  return best ? { ...best.t, hit: best.hit } : ZD.GENERAL_TOPIC
}

/**
 * 从问题里认方位（东南/西北等先认，避免"东"吃掉"东南"）。
 * @param {string} question 所问。
 * @returns {string|null} 方位名。
 */
function dirOfQuestion(question) {
  const q = String(question ?? '')
  for (const d of ['东南', '西南', '西北', '东北']) if (q.includes(d)) return d
  for (const d of ['东', '南', '西', '北']) if (q.includes(d)) return d
  return null
}

/**
 * 宜忌比对：所问事类的通书术语落在「宜」还是「忌」里。
 * @param {object} almanac 黄历块。
 * @param {object} topic 事类。
 * @returns {{score:number, yiHit:string[], jiHit:string[], kind:string}} 判定。
 */
function yiJiOf(almanac, topic) {
  const yi = arrOf(almanac?.yi)
  const ji = arrOf(almanac?.ji)
  if (!topic || topic.id === '通用' || arrOf(topic.terms).length === 0) {
    return { score: clamp((yi.length - ji.length) * 3, -30, 30), yiHit: [], jiHit: [], kind: '通用' }
  }
  const yiHit = topic.terms.filter((t) => yi.includes(t))
  const jiHit = topic.terms.filter((t) => ji.includes(t))
  let score = 0
  let kind = '两不载'
  if (yiHit.length > 0 && jiHit.length > 0) { score = -8; kind = '宜忌并见' }
  else if (yiHit.length > 0) { score = 50; kind = '在宜' }
  else if (jiHit.length > 0) { score = -65; kind = '在忌' }
  return { score, yiHit, jiHit, kind }
}

/**
 * 吉神凶煞净数分。
 * @param {object} almanac 黄历块。
 * @returns {number} -35..35。
 */
function jiShenScore(almanac) {
  return clamp((arrOf(almanac?.jiShen).length - arrOf(almanac?.xiongSha).length) * 7, -35, 35)
}

/**
 * 彭祖百忌扣分（日干忌 / 日支忌 命中事类）。
 * @param {object} chart 盘基。
 * @param {object} topic 事类。
 * @returns {{score:number, hit:string[]}} 扣分与命中项。
 */
function pengZuScore(chart, topic) {
  const hit = []
  let score = 0
  if (!topic || topic.id === '通用') return { score, hit }
  if ((ZD.PENGZU_TOPIC[chart?.dayGan] ?? []).includes(topic.id)) { score -= 18; hit.push(`日干${chart.dayGan}忌${topic.id}`) }
  if ((ZD.PENGZU_TOPIC[chart?.dayZhi] ?? []).includes(topic.id)) { score -= 15; hit.push(`日支${chart.dayZhi}忌${topic.id}`) }
  return { score, hit }
}

/**
 * 二十八宿歌诀取义：把歌诀按句切开，找含事类关键词的句子，按吉/凶字判该句吉凶。
 * **这是关键词启发式**（不是宿的宜忌表），个别句可能误判，故 `detail` 会列出命中句供核对。
 * @param {string} song 歌诀原文。
 * @param {string[]} kws 事类关键词。
 * @returns {{score:number, hits:string[]}} 句数与吉凶累计。
 */
function songSentiment(song, kws) {
  const list = arrOf(kws)
  if (list.length === 0 || !song) return { score: 0, hits: [] }
  const clauses = String(song).split(/[，,。；;、]/).filter((c) => c.length > 0)
  const hits = []
  let score = 0
  for (const c of clauses) {
    if (!list.some((k) => c.includes(k))) continue
    const bad = ZD.XIONG_WORDS.some((w) => c.includes(w))
    const good = ZD.JI_WORDS.some((w) => c.includes(w))
    const s = bad ? -1 : good ? 1 : 0
    hits.push(`${c}（${s > 0 ? '吉' : s < 0 ? '凶' : '平'}）`)
    score += s
  }
  return { score, hits }
}

/** 事类命中的宜忌关键词（宜/忌命中列表 → 关键词）。 */
function actHits(act, topicId) {
  const yi = arrOf(act?.yi).includes(topicId)
  const ji = arrOf(act?.ji).includes(topicId)
  return { yi, ji }
}

/**
 * 日辰与日支的关系分（六合/三合/六冲/相害/相刑/同支）。
 * @param {string} a 参照支。
 * @param {string} b 待判支。
 * @returns {{score:number, rel:string}} 关系分。
 */
function zhiRel(a, b) {
  if (!a || !b) return { score: 0, rel: '—' }
  if (a === b) return { score: 6, rel: '同支' }
  if (ZHI_LIUHE[a] === b) return { score: 14, rel: '六合' }
  if (ZHI_SANHE[a] === ZHI_SANHE[b]) return { score: 10, rel: '三合' }
  if (ZHI_LIUCHONG[a] === b) return { score: -24, rel: '六冲' }
  if (ZHI_XIANGHAI[a] === b) return { score: -14, rel: '相害' }
  if (ZHI_XIANGXING.some((g) => g.includes(a) && g.includes(b))) return { score: -18, rel: '相刑' }
  return { score: 0, rel: '无特殊' }
}

/**
 * 日课总评（综合择日用）：分项加权 + 硬性凶煞扣分。
 * @param {object} chart 某日盘基。
 * @param {object} topic 事类。
 * @returns {{score:number, base:number, penalty:number, flags:string[], yj:object}} 评分明细。
 */
function dayJudge(chart, topic) {
  const a = chart?.almanac ?? {}
  const parts = []
  const flags = []
  const jc = JIANCHU[a.zhiXing]
  const hh = HUANGHEIDAO[a.tianShen]
  const xiu = XIU28.find((x) => x.name === a.xiu)
  const ly = LIUYAO[liuyaoName(a.liuYao)]
  const st = cnNum(a.nineStarNum)
  if (jc) parts.push({ name: '建除', score: jc.score, weight: 1.0 })
  if (hh) parts.push({ name: '黄黑道', score: hh.score, weight: 1.0 })
  if (xiu) parts.push({ name: '二十八宿', score: xiu.score, weight: 0.8 })
  if (ly) parts.push({ name: '六曜', score: ly.score, weight: 0.7 })
  parts.push({ name: '吉神凶煞', score: jiShenScore(a), weight: 0.8 })
  const yj = yiJiOf(a, topic)
  parts.push({ name: '宜忌', score: yj.score, weight: 1.3 })
  if (st) parts.push({ name: '日九星', score: luckScore(starInfo(st)?.luck), weight: 0.7 })
  const base = weightedScore(parts)

  // 标定：分项均值 × 1.5 —— 诸体系同吉方达「大吉」量级、同凶方达「大凶」量级，
  // 单项偏吉不足以拉高总分（择日宁严勿滥）。
  const K = 1.5
  let penalty = 0
  const lm = Math.abs(chart?.lunar?.month ?? 0)
  const ld = chart?.lunar?.day ?? 0
  if (YANGGONG_13[lm] && YANGGONG_13[lm] === ld) { penalty -= 95; flags.push('杨公忌日') }
  if (DONGGONG_JI[chart?.monthZhi] && DONGGONG_JI[chart.monthZhi] === chart.dayZhi) { penalty -= 60; flags.push('月破(董公忌)') }
  // 太岁/岁破/三煞本是「方位与土工」之忌：动土、安葬、移徙类全量计，余事减半计
  const soil = ['动土', '安葬', '移徙', '安床'].includes(topic?.id)
  const w = soil ? 1 : 0.45
  const ygz = yearGZ(chart)
  if (chart?.dayZhi === ygz.zhi) { penalty -= 20 * w; flags.push('值年太岁') }
  if (chart?.dayZhi === ZHI_LIUCHONG[ygz.zhi]) { penalty -= 70 * w; flags.push('岁破') }
  if ((ZD.SANSHAN_ZHI[ZD.SANSHAN_DIR[ygz.zhi]] ?? []).includes(chart?.dayZhi)) { penalty -= 40 * w; flags.push('犯三煞') }
  return { score: clamp(base * K + penalty, -100, 100), base, penalty, flags, yj }
}

/** 日课一行摘要（30 日排序表用）。 */
function dayLine(chart, date, judge, rank) {
  const a = chart.almanac ?? {}
  const yi = arrOf(a.yi).slice(0, 3).join('/')
  const ji = arrOf(a.ji).slice(0, 3).join('/')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const wd = '日一二三四五六'[date.getDay()]
  const flag = judge.flags.length > 0 ? ` ⚠${judge.flags.join('+')}` : ''
  return `${String(rank).padStart(2, ' ')} ${mm}-${dd} 周${wd} ${chart.ganzhi.day} ${a.zhiXing}日 ${a.tianShen}(${a.tianShenType}) ${a.xiu}宿 宜${yi || '—'} 忌${ji || '—'} ${signed(judge.score)}分${flag}`
}

/**
 * 表基准日的偏移：晚子时（23 时后）时 chart 的日干支已算次日，时辰表须顺延一天。
 * @param {object} chart 盘基。
 * @returns {number} 0 或 1。
 */
function dayShiftOf(chart) {
  const y = chart?.solar?.y
  const m = chart?.solar?.m
  const d = chart?.solar?.d
  if (!y || !m || !d) return 0
  const probe = lunarAt(y, m, d, 0)
  return probe && chart.ganzhi?.day && probe.getDayInGanZhi() !== chart.ganzhi.day ? 1 : 0
}

/**
 * 取某日某时辰的时家数据（时干支/时值神/时九星/时宜忌/时旬空）。
 * 用内置历法库直取，避免自造时家神煞表。纯函数：输入定则输出定。
 * @param {object} chart 盘基（提供当日公历日与日干支）。
 * @param {number} idx 时辰序（0 = 子 … 11 = 亥）。
 * @param {number} [shift] 基准日偏移（批量调用时可预先算好传入）。
 * @returns {object|null} 时家数据。
 */
function hourData(chart, idx, shift) {
  const y = chart?.solar?.y
  const m = chart?.solar?.m
  const d = chart?.solar?.d
  if (!y || !m || !d) return null
  const sh = Number.isFinite(shift) ? shift : dayShiftOf(chart)
  const hh = idx === 0 ? 0 : idx * 2                  // 子 0:30、丑 2:00、寅 4:00 … 亥 22:00
  const l = lunarAt(y, m, d + sh, hh)
  if (!l) return null
  const num = cnNum(l.getTimeNineStar()?.getNumber?.())
  return {
    idx,
    zhi: ZHI[idx],
    gz: l.getTimeInGanZhi(),
    gan: l.getTimeInGanZhi()[0] ?? '',
    shen: l.getTimeTianShen(),
    shenType: l.getTimeTianShenType(),
    shenLuck: l.getTimeTianShenLuck(),
    star: num,
    yi: arrOf(l.getTimeYi()),
    ji: arrOf(l.getTimeJi()),
    kong: l.getTimeXunKong(),
  }
}

/** 取某日某时的 Lunar 对象（失败返回 null，绝不抛）。 */
function lunarAt(y, m, d, h) {
  try {
    const dt = new Date(y, m - 1, d, h, 30, 0)
    if (Number.isNaN(dt.getTime())) return null
    return LunarLib.Solar.fromYmdHms(
      dt.getFullYear(), dt.getMonth() + 1, dt.getDate(), dt.getHours(), dt.getMinutes(), 0,
    ).getLunar()
  } catch {
    return null
  }
}

// ───────────────────────────── 引擎实现 ─────────────────────────────

export const engines = {
  // ── 59 黄历宜忌 ──
  huangli(chart, entry) {
    const a = chart?.almanac
    if (!a) return null
    const topic = topicOf(chart.question)
    const yj = yiJiOf(a, topic)
    const js = arrOf(a.jiShen)
    const xs = arrOf(a.xiongSha)
    const peng = pengZuScore(chart, topic)
    const score = clamp(yj.score * 0.8 + jiShenScore(a) * 0.8 + peng.score, -100, 100)

    const keys = [topic.id]
    keys.push(yj.kind)
    if (js[0]) keys.push(`吉神${js[0]}`)
    if (xs[0]) keys.push(`凶煞${xs[0]}`)
    if (peng.hit.length > 0) keys.push('彭祖忌')

    const essence = yj.kind === '在宜'
      ? `${topic.id}在宜（${yj.yiHit.slice(0, 2).join('/')}）·吉神${js.length}凶煞${xs.length}`
      : yj.kind === '在忌'
        ? `${topic.id}在忌（${yj.jiHit.slice(0, 2).join('/')}）·吉神${js.length}凶煞${xs.length}`
        : yj.kind === '通用'
          ? `事类未识别·宜${arrOf(a.yi).length}忌${arrOf(a.ji).length}·吉神${js.length}凶煞${xs.length}`
          : `${topic.id}${yj.kind}·吉神${js.length}凶煞${xs.length}·${a.zhiXing}日`

    return {
      score,
      essence,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: {
        [GAN_WUXING[chart.dayGan] ?? '土']: 2,
        [ZHI_WUXING[chart.dayZhi] ?? '土']: 2,
        [chart.monthWx ?? '土']: 1,
      },
      timing: null,
      detail: {
        所问事类: `${topic.name}（命中词：${arrOf(topic.hit).join('、') || '无，按宜忌总条数判'}）`,
        判定: yj.kind === '通用'
          ? `未识别具体事类 → 按宜忌总条数判（宜 ${arrOf(a.yi).length} 条 / 忌 ${arrOf(a.ji).length} 条）`
          : `${yj.kind}${yj.yiHit.length > 0 ? `；宜中见 ${yj.yiHit.join('、')}` : ''}${yj.jiHit.length > 0 ? `；忌中见 ${yj.jiHit.join('、')}` : ''}`,
        宜: arrOf(a.yi),
        忌: arrOf(a.ji),
        吉神: js,
        凶煞: xs,
        彭祖百忌: [`${a.pengZuGan}`, `${a.pengZuZhi}`, ...peng.hit],
        值日: `${a.zhiXing}日 · ${a.tianShen}（${a.tianShenType}·${a.tianShenLuck}） · ${a.xiu}宿（${a.xiuLuck}） · ${a.nineStar}`,
        六曜: a.liuYao,
        说明: '宜忌、吉神凶煞、彭祖百忌均取内置历法库（通书通行本）；事类由所问关键词判定，术语比对见「判定」。宜忌并存者按"事有反复"从谨慎取值。',
      },
    }
  },

  // ── 60 建除十二神 ──
  jianchu(chart, entry) {
    const zx = chart?.almanac?.zhiXing
    const info = JIANCHU[zx]
    if (!info) return null
    const topic = topicOf(chart.question)
    const act = ZD.JIANCHU_ACT[zx] ?? { yi: [], ji: [], note: '' }
    const hit = actHits(act, topic.id)
    let score = info.score * 0.7
    if (hit.yi) score += 22
    if (hit.ji) score -= 30
    // 建除与月建的关系：建日（日支同月支）为月建当值，宜守不宜攻
    const self = jianChuOf(chart.monthZhi, chart.dayZhi)
    if (zx === '建') score -= 6
    score = clamp(score, -100, 100)

    const keys = [zx, `建除${zx}`, topic.id]
    if (hit.yi) keys.push('事类宜')
    if (hit.ji) keys.push('事类忌')

    return {
      score,
      essence: `${zx}日（${info.note}）·${topic.id}${hit.yi ? '宜' : hit.ji ? '忌' : '平'}`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: { [ZHI_WUXING[chart.dayZhi] ?? '土']: 2, [chart.monthWx ?? '土']: 2, [ZHI_WUXING[chart.monthZhi] ?? '土']: 1 },
      timing: null,
      detail: {
        值日: `${zx}日`,
        建除吉凶: `${info.score} 分 — ${info.note}`,
        月建: `${chart.ganzhi.month}（月支 ${chart.monthZhi}）`,
        日辰: `${chart.ganzhi.day}（日支 ${chart.dayZhi}）`,
        所问事类: `${topic.name} → ${hit.yi ? '宜' : hit.ji ? '忌' : '本表未载，按建除本气取'}`,
        建除宜忌: act.note || '—',
        建除全表: ZD.JIANCHU_ORDER.map((k) => `${k}${k === zx ? '●' : ''}${JIANCHU[k].score >= 0 ? '+' : ''}${JIANCHU[k].score}`).join(' '),
        校验: self === zx ? `月建推值日 ${self}，与历法库一致` : `月建推值日 ${self}，历法库作 ${zx}`,
        说明: '建除值日 = 日支自月支顺数（建日同月支）；宜忌取通书通行表（见 data/zeri.js 的 JIANCHU_ACT）。',
      },
    }
  },

  // ── 61 二十八宿择日 ──
  xiu28Zeri(chart, entry) {
    const name = chart?.almanac?.xiu
    const info = XIU28.find((x) => x.name === name)
    if (!info) return null
    const topic = topicOf(chart.question)
    const senti = songSentiment(chart.almanac.xiuSong, ZD.XIU_SONG_KW[topic.id] ?? [])
    const ws = wangShuai(info.wx, chart.monthWx)
    const score = clamp(info.score * 0.7 + clamp(senti.score * 12, -36, 36) + (ws.score - 55) * 0.25, -100, 100)

    const keys = [`${name}宿`, `${info.dir}方`, `${info.wx}`, chart.almanac.xiuLuck]
    if (senti.hits.length > 0) keys.push(`${topic.id}${senti.score > 0 ? '吉' : senti.score < 0 ? '凶' : '平'}`)

    return {
      score,
      essence: `${name}宿（${info.wx}·${chart.almanac.xiuLuck}）${senti.hits.length > 0 ? `·歌诀${topic.id}${senti.score > 0 ? '吉' : senti.score < 0 ? '凶' : '平'}` : `·${topic.id}歌诀未及`}`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: { [info.wx]: 3, [chart.monthWx ?? '土']: 1 },
      timing: null,
      detail: {
        值宿: `${name}宿（${info.dir}方·${info.wx}·${info.animal}·本表 ${info.score} 分·历法库作 ${chart.almanac.xiuLuck}）`,
        所问事类: topic.name,
        歌诀断句: senti.hits.length > 0 ? senti.hits : ['歌诀中未见所问事类关键词，按宿之总吉凶取值'],
        歌诀: chart.almanac.xiuSong,
        宿五行旺衰: `${info.wx}于${chart.monthWx}月 → ${ws.state}`,
        说明: '值宿与宿之总吉凶取内置历法库（二十八宿吉凶为通书通行表）；所问事类由歌诀原文按句提取——这是关键词启发式，命中句已在「歌诀断句」列出，可自行核对，个别句可能误判。',
      },
    }
  },

  // ── 62 黄黑道择日 ──
  huangHeiDao(chart, entry) {
    const shen = chart?.almanac?.tianShen
    const info = HUANGHEIDAO[shen]
    if (!info) return null
    const topic = topicOf(chart.question)
    const act = ZD.TIANSHEN_ACT[shen] ?? { yi: [], ji: [], note: '' }
    const hit = actHits(act, topic.id)
    const zx = JIANCHU[chart.almanac.zhiXing]
    let score = info.score * 0.9 + (zx ? zx.score * 0.15 : 0)
    if (hit.yi) score += 12
    if (hit.ji) score -= 16
    score = clamp(score, -100, 100)

    const daoOk = chart.almanac.tianShenType === info.dao
    const keys = [shen, info.dao, chart.almanac.tianShenLuck, topic.id]
    if (hit.yi) keys.push('事类宜')
    if (hit.ji) keys.push('事类忌')

    return {
      score,
      essence: `${shen}值日·${info.dao}（${chart.almanac.tianShenLuck}）·${topic.id}${hit.yi ? '宜' : hit.ji ? '忌' : '平'}`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: { [chart.monthWx ?? '土']: 2, [ZHI_WUXING[chart.dayZhi] ?? '土']: 2, [GAN_WUXING[chart.dayGan] ?? '土']: 1 },
      timing: null,
      detail: {
        值日神: `${shen}（${info.dao}·${chart.almanac.tianShenLuck}·本表 ${info.score} 分）`,
        所问事类: `${topic.name} → ${hit.yi ? '宜' : hit.ji ? '忌' : '本表未载'}`,
        值神宜忌: act.note || '—',
        黄道六神: ZD.TIANSHEN_ORDER.filter((s) => HUANGHEIDAO[s]?.dao === '黄道').join('、'),
        黑道六神: ZD.TIANSHEN_ORDER.filter((s) => HUANGHEIDAO[s]?.dao === '黑道').join('、'),
        校验: daoOk ? `历法库值神 ${shen} 与黄黑道表一致（${info.dao}）` : `历法库值神 ${shen} 与黄黑道表不符（库作 ${chart.almanac.tianShenType}）`,
        说明: '黄黑道十二值神（青龙明堂天刑朱雀金匮天德白虎玉堂天牢玄武司命勾陈）为通书通行表；吉凶分与宜忌见 data/zeri.js 的 HUANGHEIDAO / TIANSHEN_ACT。',
      },
    }
  },

  // ── 63 董公择日 ──
  donggong(chart, entry) {
    const a = chart?.almanac
    if (!a) return null
    const topic = topicOf(chart.question)
    const mz = chart.monthZhi
    const dz = chart.dayZhi
    const jiZhi = DONGGONG_JI[mz] ?? ''
    const isJi = jiZhi !== '' && jiZhi === dz
    const js = arrOf(a.jiShen)
    const xs = arrOf(a.xiongSha)
    const zx = JIANCHU[a.zhiXing]
    const hh = HUANGHEIDAO[a.tianShen]

    let score = (zx ? zx.score * 0.5 : 0) + clamp((xs.length - js.length) * 5, -30, 30) + (hh ? hh.score * 0.3 : 0)
    // 月破之忌以土工、丧葬、迁移类最重，余事次之
    const soil = ['动土', '安葬', '移徙', '安床'].includes(topic.id)
    if (isJi) score -= soil ? 70 : 48
    score = clamp(score, -100, 100)

    const keys = [isJi ? '月破忌日' : '非忌日', `${mz}月`, `${dz}日`]
    if (xs[0]) keys.push(`凶煞${xs[0]}`)
    if (zx) keys.push(`${a.zhiXing}日`)

    return {
      score,
      essence: isJi
        ? `董公忌日（${mz}月见${dz}，月破）·凶煞${xs.length}叠加`
        : `非董公忌日（${mz}月忌${jiZhi || '—'}）·${a.zhiXing}日·凶煞${xs.length}`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: { [ZHI_WUXING[dz] ?? '土']: 2, [ZHI_WUXING[mz] ?? '土']: 2, [chart.monthWx ?? '土']: 1 },
      timing: isJi ? '此日宜改期' : null,
      detail: {
        月建: `${chart.ganzhi.month}（月支 ${mz}）`,
        日辰: `${chart.ganzhi.day}（日支 ${dz}）`,
        董公忌日: isJi ? `是 —— 月支 ${mz} 忌日支 ${jiZhi}（即月破日）` : `否 —— 月支 ${mz} 所忌为 ${jiZhi || '—'}，本日 ${dz}`,
        月破关系: `月支 ${mz} 与日支 ${dz}：${ZHI_LIUCHONG[mz] === dz ? '相冲（月破）' : '不相冲'}`,
        凶煞叠加: xs,
        吉神: js,
        值日: `${a.zhiXing}日 · ${a.tianShen}（${a.tianShenType}）`,
        建除吉凶: zx ? `${a.zhiXing} ${zx.score} 分 — ${zx.note}` : '—',
        所问事类: topic.name,
        说明: '董公选要的核心口径 = 月建与日支的关系（月破为忌）叠加凶煞多寡。本插件只实现这一核心，**未内置董公逐月忌日全表**，故不是完整董公法；吉凶为通书通例取值。',
      },
    }
  },

  // ── 64 杨公十三忌 ──
  yanggong(chart, entry) {
    const lm = Math.abs(chart?.lunar?.month ?? 0)
    const ld = chart?.lunar?.day ?? 0
    if (lm < 1 || ld < 1) return null
    const jiDay = YANGGONG_13[lm] ?? 0
    const isJi = jiDay === ld
    const zx = JIANCHU[chart.almanac?.zhiXing]
    const hh = HUANGHEIDAO[chart.almanac?.tianShen]
    // 非忌日：按建除/黄黑道取轻分，使本法在非忌日仍有分辨力
    const base = (zx ? zx.score * 0.3 : 0) + (hh ? hh.score * 0.3 : 0) + 12
    const score = clamp(isJi ? -85 : base, -100, 100)
    const topic = topicOf(chart.question)

    return {
      score,
      essence: isJi
        ? `杨公十三忌日（农历${lm}月${ld}日）·百事不宜`
        : `非杨公忌日（${lm}月忌${jiDay}日）·${chart.almanac?.zhiXing ?? ''}日`,
      keys: [...new Set([isJi ? '杨公忌日' : '非忌日', `${lm}月${ld}日`, chart.ganzhi.day, topic.id, isJi ? '百事不宜' : '可用'])].slice(0, 6),
      wuxing: { [ZHI_WUXING[chart.dayZhi] ?? '土']: 2, [GAN_WUXING[chart.dayGan] ?? '土']: 2, [chart.monthWx ?? '土']: 1 },
      timing: isJi ? `宜避此日，本月忌日即 ${lm}月${jiDay}日` : `本月忌日：${lm}月${jiDay}日`,
      detail: {
        农历: `${chart.lunar.text}（${lm}月${ld}日${chart.lunar.month < 0 ? '·闰月按本月论' : ''}）`,
        忌日判定: isJi ? `是 —— 农历 ${lm} 月忌 ${jiDay} 日` : `否 —— 农历 ${lm} 月忌 ${jiDay} 日，本日为 ${ld} 日`,
        十三忌表: Object.entries(YANGGONG_13).map(([m, d]) => `${m}月${d}日${Number(m) === lm ? '●' : ''}`).join(' '),
        口诀: ZD.YANGGONG_VERSE,
        值日: `${chart.ganzhi.day} · ${chart.almanac?.zhiXing ?? ''}日 · ${chart.almanac?.tianShen ?? ''}（${chart.almanac?.tianShenType ?? ''}）`,
        说明: '杨公十三忌（杨筠松）按农历月日定：正十三、二一一、三初九、四初七、五初五、六初三、七初一、八廿七、九廿五、十廿三、十一廿一、十二十九。闰月按所闰之月论（故取绝对值）。忌日主百事不宜，非忌日按建除/黄黑道取轻分。',
      },
    }
  },

  // ── 65 五运六气 ──
  wuyunLiuqi(chart, entry) {
    const ygz = yearGZ(chart)
    const yun = WUYUN[ygz.gan]
    const sitian = LIUQI_SITIAN[ygz.zhi]
    if (!yun || !sitian) return null
    const zaiquan = ZD.LIUQI_ZAIQUAN[sitian] ?? '—'
    const sIdx = ZD.LIUQI_CYCLE.indexOf(sitian)
    const stepIdx = ZD.LIUQI_STEP_JIEQI[chart?.jieqi?.prev] ?? -1
    const topic = topicOf(chart.question)

    // 客气六步（司天居三之气，在泉居终之气）
    const kqOf = (k) => (sIdx >= 0 ? ZD.LIUQI_CYCLE[mod(sIdx - 2 + (k - 1), 6)] : '—')
    const steps = [1, 2, 3, 4, 5, 6].map((k) => {
      const kq = kqOf(k)
      const zq = ZD.LIUQI_MAIN[k - 1]
      return `${['初', '二', '三', '四', '五', '终'][k - 1]}之气：客气${kq} 加 主气${zq}${k === 3 ? '（司天）' : ''}${k === 6 ? '（在泉）' : ''}`
    })

    let score = 0
    let rel = '节气未定，客主无从加临'
    const kq = stepIdx >= 0 ? kqOf(stepIdx + 1) : ''
    const zq = stepIdx >= 0 ? ZD.LIUQI_MAIN[stepIdx] : ''
    if (kq && zq) {
      const r = relation(ZD.LIUQI_WUXING[kq] ?? '土', ZD.LIUQI_WUXING[zq] ?? '土')
      if (kq === '少阴君火' && zq === '少阳相火') { rel = '君位臣（顺）'; score += 20 }
      else if (kq === '少阳相火' && zq === '少阴君火') { rel = '臣位君（逆）'; score -= 22 }
      else if (r === '比和') { rel = '客主同气（相得）'; score += 22 }
      else if (r === '我生' || r === '生我') { rel = `客主相生·${r}（相得）`; score += 15 }
      else { rel = `客主相克·${r}（不相得）`; score -= 20 }
    }
    const taiGuo = yun.includes('太过')
    score += taiGuo ? 8 : -6
    const ws = wangShuai(ZD.LIUQI_WUXING[kq] ?? '土', chart.monthWx)
    score += (ws.score - 55) * 0.25
    // 求医/健康之事更看气运：客主不相得则病气盛
    if (topic.id === '求医' && rel.includes('不相得')) score -= 12
    if (topic.id === '求医' && rel.includes('相得')) score += 8
    score = clamp(score, -100, 100)

    return {
      score,
      essence: `${ygz.gan}${ygz.zhi}年 岁运${yun}·司天${sitian}在泉${zaiquan}·${kq ? `${kq}加${zq}` : '未定步'}${rel.includes('逆') ? '逆' : ''}`,
      keys: [...new Set([`岁运${yun}`, `司天${sitian}`, `在泉${zaiquan}`, kq ? `客气${kq}` : '客气未定', taiGuo ? '太过' : '不及'])].slice(0, 6),
      wuxing: { [ZD.LIUQI_WUXING[kq] ?? '土']: 2, [ZD.LIUQI_WUXING[zq] ?? '土']: 2, [chart.monthWx ?? '土']: 1 },
      timing: kq ? `${zq}主气之时` : null,
      detail: {
        岁运: `${ygz.gan}年 → ${yun}（十干化运：甲己土、乙庚金、丙辛水、丁壬木、戊癸火）`,
        司天: `${ygz.zhi}年 → ${sitian}`,
        在泉: `${zaiquan}（司天对化：一阴对一阳、二阴对二阳、三阴对三阳）`,
        当前步: stepIdx >= 0 ? `${['初', '二', '三', '四', '五', '终'][stepIdx]}之气（上一节气：${chart.jieqi.prev}）` : '节气未定',
        客主加临: kq && zq ? `客气${kq} 加 主气${zq} → ${rel}` : rel,
        客气六步: steps,
        客气五行旺衰: kq ? `${ZD.LIUQI_WUXING[kq]}于${chart.monthWx}月 → ${ws.state}` : '—',
        所问事类: topic.name,
        说明: '五运六气本主年景与疫病，用于择日只是**粗调**：以「客主加临相得/不相得」为主，岁运太过不及为辅。客气次序按三阴三阳（厥阴→少阴→太阴→少阳→阳明→太阳），司天居三之气、在泉居终之气；主气按节气定步（初之气起大寒）。',
      },
    }
  },

  // ── 66 太岁三煞 ──
  taisui(chart, entry) {
    const a = chart?.almanac
    if (!a) return null
    const ygz = yearGZ(chart)
    const taiSui = ygz.zhi
    const suiPo = ZHI_LIUCHONG[taiSui] ?? ''
    const ssDir = ZD.SANSHAN_DIR[taiSui] ?? ''
    const ssZhi = ZD.SANSHAN_ZHI[ssDir] ?? []
    const yStar = yearStar(ygz.y)
    const wuHuang = wuHuangOf(yStar)
    const dz = chart.dayZhi
    const topic = topicOf(chart.question)
    const dir = dirOfQuestion(chart.question)
    const flags = []
    // 太岁/岁破/三煞本是方位与土工之忌：动土、安葬、移徙类全量计，余事减半
    const soil = ['动土', '安葬', '移徙', '安床'].includes(topic.id)
    const w = soil ? 1 : 0.5

    let score = 0
    if (dz === suiPo) { score -= 55 * w; flags.push('岁破日') }
    if (dz === taiSui) { score -= 20 * w; flags.push('值太岁') }
    if (ssZhi.includes(dz)) { score -= 28 * w; flags.push(`犯三煞(${ssDir})`) }
    if (ZHI_SANHE[dz] === ZHI_SANHE[taiSui]) { score += 12; flags.push('与太岁三合') }
    if (ZHI_LIUHE[dz] === taiSui) { score += 14; flags.push('与太岁六合') }
    if (dir) {
      const dZhi = ZD.DIR_ZHI[dir] ?? []
      if (dZhi.some((z) => ssZhi.includes(z))) { score -= 20; flags.push(`所问${dir}方犯三煞`) }
      if (ZD.PALACE_DIR[wuHuang.palace] === dir) { score -= 18; flags.push(`所问${dir}方五黄`) }
    }
    score += (JIANCHU[a.zhiXing]?.score ?? 0) * 0.2 + (HUANGHEIDAO[a.tianShen]?.score ?? 0) * 0.2
    score = clamp(score, -100, 100)

    return {
      score,
      essence: `${ygz.gan}${taiSui}年 太岁在${taiSui}·岁破${suiPo}·三煞在${ssDir}·${dz}日${flags.length > 0 ? flags.slice(0, 2).join('/') : '不犯'}`,
      keys: [...new Set([`太岁${taiSui}`, `岁破${suiPo}`, `三煞${ssDir}`, `五黄${wuHuang.dir}`, ...flags.slice(0, 2)])].slice(0, 6),
      wuxing: { [ZHI_WUXING[taiSui] ?? '土']: 2, [ZHI_WUXING[dz] ?? '土']: 2, [chart.monthWx ?? '土']: 1 },
      timing: null,
      detail: {
        太岁: `${ygz.gan}${taiSui}（立春换年，纪年 ${ygz.y}）· 方位 ${ZD.PALACE_DIR[ZD.ZHI_PALACE[taiSui]] ?? '—'}`,
        岁破: `${suiPo}（太岁对冲，忌动土修造）`,
        三煞: `${ssDir}方 ${ssZhi.join('、')}（申子辰煞南、寅午戌煞北、亥卯未煞西、巳酉丑煞东）`,
        年白五黄: `年白 ${yStar} 入中 → 五黄到 ${wuHuang.dir}（宫 ${wuHuang.palace}）`,
        日辰: `${chart.ganzhi.day}（日支 ${dz}）`,
        所问方位: dir ? `${dir}方（由所问文字判定）` : '未提及方位',
        所问事类: `${topic.name} → 太岁/三煞之忌按${soil ? '全量' : '减半'}计（土工、丧葬、迁移类最忌）`,
        犯忌: flags.length > 0 ? flags : ['不犯太岁、岁破、三煞'],
        值日: `${a.zhiXing}日 · ${a.tianShen}（${a.tianShenType}）`,
        说明: '太岁取立春换年年支；三煞 = 年支三合局所克之方；五黄由年白入中推。所问方位由问题文字判定（如「东」），只是提示，不作硬判。',
      },
    }
  },

  // ── 67 紫白九星择日 ──
  zibai(chart, entry) {
    const a = chart?.almanac
    if (!a) return null
    const ygz = yearGZ(chart)
    const ys = yearStar(ygz.y)
    const ms = monthStar(ygz.zhi, chart.monthZhi)
    const ds = cnNum(a.nineStarNum)
    const yang = isYangDun(chart)
    const hs = timeStar(chart.dayZhi, chart.hourZhi, yang)
    if (!ds) return null
    const wuHuang = wuHuangOf(ys)

    // 择日以日白为主，月白次之，年白为背景；时白用于择时提示
    const yInfo = starInfo(ys)
    const mInfo = starInfo(ms)
    const dInfo = starInfo(ds)
    const hInfo = starInfo(hs)
    // 五黄所到之方：所问若正指该方，另加重忌（五黄宜静不宜动）
    const dir = dirOfQuestion(chart.question)
    const hitDir = dir !== null && ZD.PALACE_DIR[wuHuang.palace] === dir
    // 九星类象与事类相宜（八白财星、四绿文昌、九紫喜星…）
    const topic = topicOf(chart.question)
    const aff = (ZD.NINE_TOPIC_AFFINITY[ds] ?? []).includes(topic.id)
    const score = clamp(
      luckScore(dInfo?.luck) * 0.9 + luckScore(mInfo?.luck) * 0.45 + luckScore(yInfo?.luck) * 0.25 + luckScore(hInfo?.luck) * 0.25
      + (hitDir ? -15 : 0) + (aff ? 14 : 0),
      -100, 100,
    )

    return {
      score,
      essence: `日白${dInfo?.name ?? '—'}（${dInfo?.luck ?? '—'}）·月白${mInfo?.name ?? '—'}·年白${yInfo?.name ?? '—'}·五黄到${wuHuang.dir}${aff ? `·${topic.id}得星` : ''}${hitDir ? '（正犯所问方）' : ''}`,
      keys: [...new Set([`日白${dInfo?.name ?? '—'}`, `月白${mInfo?.name ?? '—'}`, `年白${yInfo?.name ?? '—'}`, `时白${hInfo?.name ?? '—'}`, `五黄${wuHuang.dir}`, aff ? `${topic.id}得星` : hitDir ? '犯五黄方' : '五黄不犯'])].slice(0, 6),
      wuxing: { [dInfo?.wx ?? '土']: 2, [mInfo?.wx ?? '土']: 1, [yInfo?.wx ?? '土']: 1, [chart.monthWx ?? '土']: 1 },
      timing: null,
      detail: {
        年白: `${yInfo?.name ?? '—'}（${yInfo?.wx ?? '—'}·${yInfo?.luck ?? '—'}·${yInfo?.note ?? ''}）入中 — 立春纪年 ${ygz.y}，口诀 mod(2−年, 9)`,
        月白: `${mInfo?.name ?? '—'}（${mInfo?.wx ?? '—'}·${mInfo?.luck ?? '—'}）入中 — ${ygz.zhi}年${chart.monthZhi}月（节气月）`,
        日白: `${dInfo?.name ?? '—'}（${dInfo?.wx ?? '—'}·${dInfo?.luck ?? '—'}）入中 — 取历法库`,
        时白: `${hInfo?.name ?? '—'}（${hInfo?.wx ?? '—'}·${hInfo?.luck ?? '—'}）入中 — ${yang ? '冬至后阳遁顺行' : '夏至后阴遁逆行'}，${chart.dayZhi}日${chart.hourZhi}时`,
        五黄方位: `年五黄到 ${wuHuang.dir}（宫 ${wuHuang.palace}）— 五黄为土，忌动土、修造、久留${dir ? `；所问指${dir}方 → ${hitDir ? '正犯五黄' : '不犯'}` : ''}`,
        事类取象: `${topic.name} → 日白${dInfo?.name ?? '—'}${aff ? '与本类事相宜（九星类象）' : '与九星类象无特别相宜'}`,
        校验: `时白：口诀推 ${hInfo?.name ?? '—'} / 历法库 ${a.timeNineStar || '—'} → ${cnNum(a.timeNineStar?.[0]) === hs ? '一致' : '不一致'}；日白取历法库 ${a.nineStar}`,
        九星吉凶表: NINE_STAR.map((s) => `${s.name}(${s.wx}·${s.luck})`).join(' '),
        说明: '年白/月白/时白用公开口诀推算（见文件头第 5 条，已与内置历法库逐项对过）；日白口径较繁（冬至后甲子日顺飞、夏至后甲子日逆飞），直接取历法库。九星吉凶分见 data/zeri.js 的 NINE_LUCK_SCORE；九星类象（八白财、四绿文昌、九紫喜、一白官、六白权威）见 NINE_TOPIC_AFFINITY。',
      },
    }
  },

  // ── 68 奇门择时 ──
  qimenZeShi(chart, entry) {
    const hourGZ = chart?.ganzhi?.hour ?? ''
    const hGan = hourGZ[0] ?? ''
    const hZhi = hourGZ[1] ?? ''
    if (!hGan || !hZhi) return null
    const topic = topicOf(chart.question)

    const ganScore = ZD.HOUR_GAN_SCORE[hGan] ?? 0
    const isSanQi = ZD.SANQI.includes(hGan)
    const isLiuYi = ZD.LIUYI.includes(hGan)
    const palace = ZD.ZHI_PALACE[hZhi] ?? 0
    const gate = ZD.PALACE_GATE[palace] ?? ''
    const gateScore = ZD.GATE_LUCK[gate] ?? 0
    const hStar = timeStar(chart.dayZhi, hZhi, isYangDun(chart))
    const hStarInfo = starInfo(hStar)
    const shen = hourShenOf(chart.dayZhi, hZhi)
    const shenScore = HUANGHEIDAO[shen]?.score ?? 0
    const relHour = relation(GAN_WUXING[hGan] ?? '土', GAN_WUXING[chart.dayGan] ?? '土')
    const relZhi = zhiRel(chart.dayZhi, hZhi)
    const kong = (chart.xunKong?.day ?? '').includes(hZhi)
    // 时家宜忌（历法库）
    const hd = hourData(chart, ZHI.indexOf(hZhi))
    let yiScore = 0
    const yiHit = []
    const jiHit = []
    if (hd && topic.id !== '通用') {
      for (const t of topic.terms) {
        if (hd.yi.includes(t)) { yiScore += 20; yiHit.push(t) }
        if (hd.ji.includes(t)) { yiScore -= 25; jiHit.push(t) }
      }
    }

    let score = ganScore
      + gateScore * 0.5
      + luckScore(hStarInfo?.luck) * 0.45
      + shenScore * 0.4
      + yiScore
      + relZhi.score * 0.6
      + (kong ? -15 : 0)
    score += { 生我: 12, 比和: 8, 我克: 6, 我生: -5, 克我: -15 }[relHour] ?? 0
    score = clamp(score, -100, 100)

    const keys = [isSanQi ? `三奇${hGan}` : isLiuYi ? `六仪${hGan}` : `时干${hGan}`, gate, `时白${hStarInfo?.name ?? '—'}`, shen]
    if (kong) keys.push('时落空亡')
    if (yiHit.length > 0) keys.push('时宜')

    return {
      score,
      essence: `${hourGZ}时·${isSanQi ? `三奇得使(${hGan})` : `时干${hGan}`}·${gate}(${gateScore >= 0 ? '吉' : '凶'})·${hStarInfo?.name ?? '—'}·${shen}${shenScore >= 0 ? '黄道' : '黑道'}`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: { [GAN_WUXING[hGan] ?? '土']: 2, [ZHI_WUXING[hZhi] ?? '土']: 2, [chart.monthWx ?? '土']: 1 },
      timing: null,
      detail: {
        时辰: `${chart.ganzhi.day}日 ${hourGZ}时（${hZhi}时）`,
        三奇得使: isSanQi ? `${hGan} 为三奇之一（乙丙丁），三奇得使为吉` : isLiuYi ? `${hGan} 为六仪（戊己庚辛壬癸），甲遁于仪` : `时干 ${hGan}`,
        时干吉凶: `${hGan} → ${ganScore} 分（庚为天狱最凶）`,
        八门: `${hZhi}时值 ${palace} 宫 → 本位${gate}（${gateScore >= 0 ? '吉门' : '凶门'}）`,
        时家九星: `${hStarInfo?.name ?? '—'}（${hStarInfo?.luck ?? '—'}）入中`,
        时家值神: `${shen}（${HUANGHEIDAO[shen]?.dao ?? '—'}）`,
        时宜忌: hd ? { 宜: hd.yi, 忌: hd.ji, 事类命中: [...yiHit.map((x) => `宜${x}`), ...jiHit.map((x) => `忌${x}`)] } : '未取到',
        日时关系: `时干${hGan} vs 日干${chart.dayGan} → ${relHour}；时支${hZhi} vs 日支${chart.dayZhi} → ${relZhi.rel}`,
        旬空: kong ? `时支 ${hZhi} 落旬空（${chart.xunKong.day}）` : `不空（旬空 ${chart.xunKong.day}）`,
        所问事类: topic.name,
        说明: '**简化择时**：只取「时干三奇 + 时支本位八门 + 时家九星 + 时家值神 + 日时关系 + 时家宜忌」六项，**未排奇门局**（无局数、值符值使、天地盘、三奇六仪落宫），故门为八卦本位门而非局门。完整时家奇门见 #25–30。八门本位与吉凶见 data/zeri.js 的 PALACE_GATE / GATE_LUCK。',
      },
    }
  },

  // ── 69 六曜择日 ──
  liuyaoZeri(chart, entry) {
    const name = liuyaoName(chart?.almanac?.liuYao)
    const info = LIUYAO[name]
    if (!info) return null
    const topic = topicOf(chart.question)
    const act = ZD.LIUYAO_ACT[name] ?? { yi: [], ji: [], note: '' }
    const hit = actHits(act, topic.id)
    let score = info.score * 0.8
    if (hit.yi) score += 18
    if (hit.ji) score -= 24
    score = clamp(score, -100, 100)

    // 六曜为六日一轮，可推下一个大安日（择日实用）
    const idx = ZD.LIUYAO_ORDER.indexOf(name)
    const off = idx >= 0 ? mod(ZD.LIUYAO_ORDER.indexOf('大安') - idx, 6) : 0
    const nextAn = new Date(chart.when.getTime() + off * 86400000)
    const nextAnText = off === 0 ? '今日即大安' : `${nextAn.getMonth() + 1}月${nextAn.getDate()}日（大安）`

    return {
      score,
      essence: `${name}（${info.note}）·${topic.id}${hit.yi ? '宜' : hit.ji ? '忌' : '平'}`,
      keys: [...new Set([name, info.score >= 0 ? '吉曜' : '凶曜', topic.id, hit.yi ? '事类宜' : hit.ji ? '事类忌' : '事类平'])].slice(0, 6),
      wuxing: { [ZHI_WUXING[chart.dayZhi] ?? '土']: 2, [GAN_WUXING[chart.dayGan] ?? '土']: 2, [chart.monthWx ?? '土']: 1 },
      timing: nextAnText,
      detail: {
        六曜: `${name} — ${info.note}（本表 ${info.score} 分）`,
        所问事类: `${topic.name} → ${hit.yi ? '宜' : hit.ji ? '忌' : '本表未载'}`,
        六曜宜忌: act.note || '—',
        六曜次序: ZD.LIUYAO_ORDER.map((k) => `${k}${k === name ? '●' : ''}`).join(' → '),
        下个大安: nextAnText,
        说明: '六曜（先胜/友引/先负/仏灭/大安/赤口）取内置历法库；六曜宜忌为中日同源之通行说法（见 data/zeri.js 的 LIUYAO_ACT）。六曜六日一轮，故可推下个大安日。',
      },
    }
  },

  // ── 70 十二值神 ──
  zhiShen(chart, entry) {
    const a = chart?.almanac
    const shen = a?.tianShen
    const info = HUANGHEIDAO[shen]
    if (!info) return null
    const topic = topicOf(chart.question)
    const act = ZD.TIANSHEN_ACT[shen] ?? { yi: [], ji: [], note: '' }
    const hit = actHits(act, topic.id)
    const self = dayShenOf(chart.monthZhi, chart.dayZhi)
    const order = ZD.TIANSHEN_ORDER.indexOf(shen) + 1

    // 以值神宜忌为主，黄黑道为辅；天德/司命/玉堂等吉神另有加成
    let score = info.score * 0.45
    if (hit.yi) score += 26
    if (hit.ji) score -= 32
    score += a.tianShenLuck === '吉' ? 10 : -10
    if (['天德', '明堂', '金匮', '司命'].includes(shen)) score += 8
    if (['天刑', '白虎', '天牢', '勾陈'].includes(shen)) score -= 8
    score = clamp(score, -100, 100)

    return {
      score,
      essence: `十二值神·${shen}（第${order}神·${info.dao}）·${topic.id}${hit.yi ? '宜' : hit.ji ? '忌' : '平'}`,
      keys: [...new Set([shen, `${info.dao}值神`, `第${order}神`, topic.id, hit.yi ? '事类宜' : hit.ji ? '事类忌' : '事类平'])].slice(0, 6),
      wuxing: { [chart.monthWx ?? '土']: 2, [ZHI_WUXING[chart.dayZhi] ?? '土']: 2, [ZHI_WUXING[chart.monthZhi] ?? '土']: 1 },
      timing: null,
      detail: {
        值日神: `${shen}（${info.dao}·${a.tianShenLuck}·第 ${order} 神）`,
        值神宜忌: act.note || '—',
        宜: act.yi,
        忌: act.ji,
        所问事类: `${topic.name} → ${hit.yi ? '宜' : hit.ji ? '忌' : '本表未载'}`,
        起神校验: self === shen ? `月支推值神 ${self}，与历法库一致` : `月支推值神 ${self}，历法库作 ${shen}`,
        十二神序: ZD.TIANSHEN_ORDER.map((k) => `${k}${k === shen ? '●' : ''}${HUANGHEIDAO[k].dao === '黄道' ? '(黄)' : '(黑)'}`).join(' '),
        说明: '值日神由月支起青龙顺行（起支 = mod(2×(月支序−2),12)），与历法库一致；宜忌取通书通行表（data/zeri.js 的 TIANSHEN_ACT）。与 #62 黄黑道同源而侧重不同：#62 重黄道/黑道总判，本法重值神本身的宜忌与神性。',
      },
    }
  },

  // ── 71 择吉时 ──
  jiShi(chart, entry) {
    const topic = topicOf(chart.question)
    const shift = dayShiftOf(chart)
    const rows = []
    for (let i = 0; i < 12; i += 1) {
      const hd = hourData(chart, i, shift)
      if (!hd) continue
      const zhi = ZHI[i]
      const relZhi = zhiRel(chart.dayZhi, zhi)
      const relGan = relation(GAN_WUXING[hd.gan] ?? '土', GAN_WUXING[chart.dayGan] ?? '土')
      const shenScore = HUANGHEIDAO[hd.shen]?.score ?? 0
      const starScore = luckScore(starInfo(hd.star)?.luck)
      const kong = (chart.xunKong?.day ?? '').includes(zhi) || (hd.kong ?? '').includes(zhi)
      const lu = ZD.RILU[chart.dayGan] === zhi
      const gui = (ZD.TIANYI[chart.dayGan] ?? []).includes(zhi)
      let yiScore = 0
      const yiHit = []
      const jiHit = []
      if (topic.id !== '通用') {
        for (const t of topic.terms) {
          if (hd.yi.includes(t)) { yiScore += 18; yiHit.push(t) }
          if (hd.ji.includes(t)) { yiScore -= 22; jiHit.push(t) }
        }
      }
      let sc = shenScore * 0.45 + starScore * 0.25 + yiScore + relZhi.score + (kong ? -18 : 0) + (lu ? 18 : 0) + (gui ? 16 : 0)
      sc += { 生我: 10, 比和: 6, 我克: 4, 我生: -4, 克我: -12 }[relGan] ?? 0
      sc = clamp(sc, -100, 100)
      const marks = []
      if (lu) marks.push('日禄')
      if (gui) marks.push('贵人')
      if (kong) marks.push('空亡')
      if (yiHit.length > 0) marks.push(`宜${yiHit.slice(0, 2).join('/')}`)
      if (jiHit.length > 0) marks.push(`忌${jiHit.slice(0, 2).join('/')}`)
      rows.push({
        i, zhi, gz: hd.gz, shen: hd.shen, dao: hd.shenType, star: hd.star, score: sc,
        relZhi: relZhi.rel, relGan, marks,
        line: `${zhi}时 ${hd.gz} ${hd.shen}(${hd.shenType}·${hd.shenLuck}) ${starInfo(hd.star)?.name ?? '—'} 日支${relZhi.rel} ${signed(sc)}分 ${marks.join(' ')}`.trim(),
      })
    }
    if (rows.length === 0) return null
    const sorted = rows.slice().sort((a, b) => b.score - a.score)
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]
    const mean = rows.reduce((s, r) => s + r.score, 0) / rows.length
    const score = clamp(best.score * 0.65 + mean * 0.35, -100, 100)

    // 校验：口诀推算的时值神/时白 vs 历法库
    const chk = rows.filter((r) => hourShenOf(chart.dayZhi, r.zhi) === r.shen).length
    const chkStar = rows.filter((r) => timeStar(chart.dayZhi, r.zhi, isYangDun(chart)) === r.star).length

    return {
      score,
      essence: `最佳${best.zhi}时（${best.gz}·${best.shen}）${signed(best.score)}分；忌${worst.zhi}时（${worst.shen}）${signed(worst.score)}分`,
      keys: [...new Set([`吉时${best.zhi}时`, best.shen, `${starInfo(best.star)?.name ?? '—'}`, `忌${worst.zhi}时`, topic.id])].slice(0, 6),
      wuxing: { [ZHI_WUXING[best.zhi] ?? '土']: 2, [GAN_WUXING[chart.dayGan] ?? '土']: 2, [chart.monthWx ?? '土']: 1 },
      timing: `${best.zhi}时（${best.gz}）`,
      detail: {
        日辰: `${chart.ganzhi.day}日（${chart.dayZhi}支）· 旬空 ${chart.xunKong.day}`,
        所问事类: topic.name,
        十二时辰: rows.map((r) => r.line),
        吉时排序: sorted.map((r, k) => `${k + 1}. ${r.line}`),
        最佳: `${best.zhi}时 ${best.gz}（${best.shen}·${best.dao}）${signed(best.score)}分`,
        最忌: `${worst.zhi}时 ${worst.gz}（${worst.shen}·${worst.dao}）${signed(worst.score)}分`,
        日禄: `日干${chart.dayGan}禄在${ZD.RILU[chart.dayGan] ?? '—'}`,
        天乙贵人: `日干${chart.dayGan}贵人在${(ZD.TIANYI[chart.dayGan] ?? []).join('、') || '—'}`,
        校验: `时值神口诀与历法库一致 ${chk}/12；时白口诀与历法库一致 ${chkStar}/12`,
        说明: '十二时辰的时干支/时值神/时白/时宜忌取内置历法库；日支关系、日干关系、日禄、天乙贵人、旬空按公开口诀推算。评分为「时家黄黑道 0.45 + 时白 0.25 + 事类时宜忌 + 日支关系 + 神煞」加权，最佳时辰与排序见上。子时取当日 00:00–01:00（早子时），故 23 时后求占者，chart 的时柱（晚子时，时干从次日起）与本表子时不同。',
      },
    }
  },

  // ── 72 综合择日 ──
  zeRi(chart, entry) {
    if (!(chart?.when instanceof Date) || Number.isNaN(chart.when.getTime())) return null
    const topic = topicOf(chart.question)
    const days = []
    for (let n = 0; n < 30; n += 1) {
      const date = new Date(chart.when.getTime() + n * 86400000)
      let c = null
      if (n === 0) c = chart
      else {
        try {
          c = buildChart({ when: date, longitude: chart.longitude, question: chart.question })
        } catch {
          c = null
        }
      }
      if (!c) continue
      const judge = dayJudge(c, topic)
      days.push({ n, date, chart: c, judge })
    }
    if (days.length === 0) return null
    const ranked = days.slice().sort((a, b) => b.judge.score - a.judge.score)
    const lines = ranked.map((d, i) => dayLine(d.chart, d.date, d.judge, i + 1))
    const best = ranked[0]
    const worst = ranked[ranked.length - 1]
    const today = days[0]
    const todayRank = ranked.findIndex((d) => d.n === 0) + 1
    const score = clamp(best.judge.score, -100, 100)

    const fmt = (d) => {
      const c = d.chart
      const wd = '日一二三四五六'[d.date.getDay()]
      return `${d.date.getMonth() + 1}月${d.date.getDate()}日(周${wd}·${c.ganzhi.day}·${c.almanac.zhiXing}日·${c.almanac.tianShen}${c.almanac.tianShenType}·${c.almanac.xiu}宿) ${signed(d.judge.score)}分`
    }

    return {
      score,
      essence: `未来30日最佳：${best.date.getMonth() + 1}月${best.date.getDate()}日（${best.chart.ganzhi.day}·${best.chart.almanac.zhiXing}日·${best.chart.almanac.tianShen}）${signed(best.judge.score)}分`,
      keys: [...new Set([topic.id, `最佳${best.date.getMonth() + 1}-${best.date.getDate()}`, `最忌${worst.date.getMonth() + 1}-${worst.date.getDate()}`, `当日第${todayRank}名`, best.chart.almanac.tianShen])].slice(0, 6),
      wuxing: {
        [GAN_WUXING[best.chart.dayGan] ?? '土']: 2,
        [ZHI_WUXING[best.chart.dayZhi] ?? '土']: 2,
        [best.chart.monthWx ?? '土']: 1,
      },
      timing: `${best.date.getMonth() + 1}月${best.date.getDate()}日 ${best.chart.ganzhi.day}日`,
      detail: {
        所问事类: topic.name,
        当日: `第 ${todayRank} 名 / ${days.length} 日 — ${fmt(today)}`,
        吉日推荐: ranked.slice(0, 3).map((d, i) => `${i + 1}. ${fmt(d)}`),
        凶日避忌: ranked.slice(-3).reverse().map((d) => `· ${fmt(d)}`),
        三十日排序: lines,
        评分口径: '建除(1.0) + 黄黑道(1.0) + 二十八宿(0.8) + 六曜(0.7) + 吉神凶煞(0.8) + 事类宜忌(1.3) + 日九星(0.7) 加权均值 ×1.5，再硬扣：杨公忌日 −95、月破(董公忌) −60、岁破 −70、犯三煞 −40、值太岁 −20（后三项对动土/安葬/移徙/安床类全量计，余事减半）。',
        说明: '逐日以 core/calendar.js 的 buildChart 重排盘（历法真源同一），自 chart.when 起推 30 日（不用时钟）。排序表首列为名次，末列 ⚠ 为硬性凶煞。本法给出"可选之最吉日"，故总分取最佳日；当日名次见「当日」。',
      },
    }
  },
}

export default engines
