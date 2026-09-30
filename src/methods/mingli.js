/**
 * 方法模块 · 命理（18 法）
 *
 * 契约见 `src/core/runner.js` 顶部注释；结构照 `src/methods/yijing.js`。
 * 结果字段：`score`(-100..100) / `essence`(≤60字) / `keys`(≤6) / `wuxing`
 * / `timing`(应期或 null) / `detail`(非空对象，中文键) / `fidelity`(可覆盖条目默认)。
 * 返回 `null` = 本局无解（运行器记「未起」）。**禁止抛异常、禁止 Math.random、禁止读时钟。**
 *
 * ## 本模块的公开口径（写在明处，可改）
 *
 * ### 八字
 * - 四柱取自 `chart.birthChart.pillars`（历法层已排好），日主 = 日柱天干。
 * - **旺衰**三要素量化：得令（月令对日主的旺衰，0..40）＋得地（四支藏干中日主同党
 *   之根的加权和，0..35）＋得势（年月时三干中日主同党之数，0..25）→ 0..100，
 *   50 为中和线，≥50 判身强。
 * - **十神**用 `tenGodOf` / `cangGanGods`；五行力量表给天干 1.0（月干 1.2）、
 *   地支本气 1.0 / 中气 0.4 / 余气 0.2（月令支 ×1.5）。
 * - **用神**：身强取克泄耗（官杀→食伤→财）、身弱取生扶（印→比劫），取「有气者」；
 *   另按调候（冬生喜火、夏生喜水）兼取。
 * - **大运**用 `chart.yun.daYun`（历法层已排），流年取求占年的年干支。
 *
 * ### 紫微斗数（安星法为公开口诀，非秘传）
 * - 命宫 = 寅起正月顺数至生月，再自该宫起子时逆数至生时；身宫同法但顺数生时。
 * - 十二宫自命宫起**逆时针**排（命、兄、夫、子、财、疾、迁、友、官、田、福、父）。
 * - 五行局由**命宫干支纳音**定（水二/木三/金四/土五/火六）。
 * - 紫微星用「商数+余数」法：`q = ceil(日/局)`、`r = q×局 − 日`，
 *   自寅顺数 `q−1` 宫，`r` 为偶数再进 `r` 宫、奇数退 `r` 宫。
 *   等价于查表法（水二局初一丑、初二寅、初三寅…已逐日核对）。
 * - 天府 = `(4 − 紫微) mod 12`；紫微系逆行、天府系顺行，十四主星相对位置固定。
 * - 四化按生年干（甲廉破武阳…癸破巨阴贪）；六吉六煞（左辅右弼文昌文曲天魁天钺禄存
 *   擎羊陀罗火铃地空地劫天马）按公开口诀安。
 * - 主星「吉凶倾向分」是**本插件采用的公开通例编辑取值**（依星性语义），与
 *   `core/tables.js` 的卦德表同一做法，可按师承改。
 *
 * ### 无星历表者（诚实标记）
 * - 七政四余、五星占：**没有星历表**，只用 J2000 平均黄经近似式（Paul Schlyter 公开式），
 *   紫气为虚星（传统 28 年一周天）。两者一律 `fidelity: 'approx'`，并在 `detail.说明` 写明。
 * - 二十八宿命度：值宿取历法库真实值宿表；「宿内度数」按十二时辰均分该宿的简化分法。
 */

import {
  GAN, ZHI, WUXING, GAN_WUXING, GAN_YANG, ZHI_WUXING, ZHI_ANIMAL, ZHI_CANGGAN,
  SHENG, KE, SHENG_BY, KE_BY, relation, wangShuai, changShengOf, CHANGSHENG_START,
  ZHI_LIUHE, ZHI_LIUCHONG, ZHI_XIANGHAI, ZHI_SANHE, ZHI_XIANGXING,
  nayinOf, xunOf, tenGodOf, cangGanGods, shenShaOf, clamp, mod, emptyWuxing,
} from '../core/kit.js'
import { XIU28, ZIWEI_PALACES, NINE_STAR, EAST_WEST } from '../core/tables.js'
import { LunarLib } from '../core/calendar.js'
import * as D from './data/mingli.js'

// ═════════════════════════ 共用原语 ═════════════════════════

/** 藏干力量（本气/中气/余气）。 */
const CG_W = [1, 0.4, 0.2]

/** 十神 → 五类（比劫/印/食伤/财/官杀）。 */
const GOD_GROUP = {
  比肩: '比劫', 劫财: '比劫', 正印: '印', 偏印: '印',
  食神: '食伤', 伤官: '食伤', 正财: '财', 偏财: '财', 正官: '官杀', 七杀: '官杀',
}

/** 五类 → 该类的五行（以日主五行为我）。 */
function groupWuxing(me) {
  return { 比劫: me, 印: SHENG_BY[me], 食伤: SHENG[me], 财: KE[me], 官杀: KE_BY[me] }
}

/** relation() 结果 → 「客对我」的人话标签（relation 第一参数恒为我方）。 */
const REL_LABEL = {
  生我: '彼生我', 我生: '我生彼', 比和: '彼此比和', 我克: '我克彼', 克我: '彼克我',
}

/** relation() 结果 → 「某宿对日主」的标签（第一参数恒为日主）。 */
const REL_LABEL_XIU = {
  生我: '宿生我', 我生: '我生宿', 比和: '宿比和', 我克: '我克宿', 克我: '宿克我',
}

// 三刑拆成「三者互刑 / 两者相刑 / 自刑」三类，全部由共享表 ZHI_XIANGXING 派生
const XING_TRIPLE = ZHI_XIANGXING.filter((g) => g.length === 3)
const XING_PAIR = ZHI_XIANGXING.filter((g) => g.length === 2)
const XING_SELF = ZHI_XIANGXING.find((g) => g.length === 4) ?? ''

/**
 * 两地支是否相刑（含自刑）。寅巳申、丑戌未三者互刑；子卯相刑；辰午酉亥自刑。
 * @param {string} a 地支。
 * @param {string} b 地支。
 * @returns {boolean} 是否相刑。
 */
function xingWith(a, b) {
  if (!a || !b) return false
  if (a === b) return XING_SELF.includes(a)
  return XING_TRIPLE.some((g) => g.includes(a) && g.includes(b))
    || XING_PAIR.some((g) => g.includes(a) && g.includes(b))
}

/** 从 birthChart.solar 解析出生公历分量。 */
function birthSolar(chart) {
  const m = /(\d{1,4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})/.exec(String(chart?.birthChart?.solar ?? ''))
  if (!m) return null
  const v = { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] }
  if (!Number.isFinite(v.y) || v.y < 1) return null
  return v
}

/**
 * 出生农历（紫微 / 称骨 / 宿命需要）。
 * @returns {object|null} {month, leap, day, hourZhi, yearGZ, xiu, xiuLuck, text, ...公历}
 */
function birthLunar(chart) {
  const s = birthSolar(chart)
  if (!s) return null
  try {
    const l = LunarLib.Solar.fromYmdHms(s.y, s.mo, s.d, s.h, s.mi, 0).getLunar()
    const mo = l.getMonth()
    return {
      ...s,
      month: Math.abs(mo) || 1,
      leap: mo < 0,
      day: l.getDay() || 1,
      hourZhi: l.getTimeZhi() || '',
      yearGZ: l.getYearInGanZhi() || '',
      xiu: l.getXiu() || '',
      xiuLuck: l.getXiuLuck() || '',
      text: l.toString(),
    }
  } catch {
    return null
  }
}

/** 四柱（过滤掉异常项）。 */
function pillarsOf(chart) {
  const ps = chart?.birthChart?.pillars
  if (!Array.isArray(ps)) return []
  return ps.filter((g) => typeof g === 'string' && g.length >= 2)
}

/** 五行加权力量（天干 1.0，月干 1.2；地支本气 1.0 / 中气 0.4 / 余气 0.2，月令支 ×1.5）。 */
function wxPower(ps) {
  const out = emptyWuxing()
  ps.forEach((gz, i) => {
    const gw = i === 1 ? 1.2 : 1.0
    if (GAN_WUXING[gz[0]]) out[GAN_WUXING[gz[0]]] += gw
    const zw = i === 1 ? 1.5 : 1.0
    ;(ZHI_CANGGAN[gz[1]] ?? []).forEach((hg, k) => {
      const wx = GAN_WUXING[hg]
      if (wx) out[wx] += (CG_W[k] ?? 0.2) * zw
    })
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

/** 十神力量（天干 1.0，月干 1.2；藏干按本气/中气/余气，月令支 ×1.5）。 */
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

/**
 * 八字总分析（旺衰 / 十神 / 用神 / 五行）。
 * @returns {object|null} 分析结果，四柱不全时返回 null。
 */
function analyzeBazi(chart) {
  const ps = pillarsOf(chart)
  if (ps.length < 4) return null
  const bc = chart.birthChart
  const dayGan = bc.dayGan || ps[2][0]
  const me = GAN_WUXING[dayGan]
  if (!me) return null

  const monthZhi = ps[1][1]
  const monthWx = ZHI_WUXING[monthZhi] ?? '土'
  const dayZhi = ps[2][1]
  const yearZhi = ps[0][1]
  const hourZhi = ps[3][1]

  // ── 得令：月令对日主的旺衰 ──
  const ws = wangShuai(me, monthWx)
  const LING = { 旺: 40, 相: 30, 休: 14, 囚: 7, 死: 0 }
  const lingScore = LING[ws.state] ?? 0

  // ── 得地：四支藏干中日主同党（比劫 / 印）之根 ──
  let roots = 0
  const rootList = []
  ps.forEach((gz, i) => {
    const zhi = gz[1]
    ;(ZHI_CANGGAN[zhi] ?? []).forEach((hg, k) => {
      const rel = relation(me, GAN_WUXING[hg])
      if (rel !== '比和' && rel !== '生我') return
      const w = CG_W[k] ?? 0.2
      roots += w
      rootList.push(`${i === 2 ? '日支' : ['年支', '月支', '', '时支'][i]}${zhi}藏${hg}(${rel === '比和' ? '比劫' : '印'})`)
    })
  })
  const diScore = Math.min(35, roots * 11)

  // ── 得势：年月时三干中日主同党之数 ──
  let allies = 0
  const allyList = []
  for (const i of [0, 1, 3]) {
    const g = ps[i][0]
    const rel = relation(me, GAN_WUXING[g])
    if (rel === '比和' || rel === '生我') {
      allies += 1
      allyList.push(`${['年干', '月干', '', '时干'][i]}${g}(${rel === '比和' ? '比劫' : '印'})`)
    }
  }
  const shiScore = Math.min(25, allies * 9)

  const helpScore = clamp(lingScore + diScore + shiScore, 0, 100)
  const strong = helpScore >= 50

  // ── 五行与十神 ──
  const wx = wxPower(ps)
  const pct = wxPct(wx)
  const gods = godPower(ps, dayGan)
  const gp = groupPower(gods)
  const gwx = groupWuxing(me)

  // ── 用神（扶抑）：身强取克泄耗、身弱取生扶，取有气者 ──
  const allowed = strong ? ['官杀', '食伤', '财'] : ['印', '比劫']
  const yongGroup = allowed.find((g) => pct[gwx[g]] >= 8)
    ?? allowed.find((g) => gp[g] > 0.05)
    ?? allowed[0]
  const yongWx = gwx[yongGroup]
  const jiGroup = strong ? (yongGroup === '官杀' ? '印' : '官杀') : (yongGroup === '印' ? '财' : '印')
  const jiWx = gwx[jiGroup]
  const yongPower = pct[yongWx] ?? 0
  const yongYouLi = yongPower >= 12

  // ── 调候：冬生喜火、夏生喜水 ──
  const tiaohou = ['亥', '子', '丑'].includes(monthZhi) ? '火'
    : ['巳', '午', '未'].includes(monthZhi) ? '水' : null
  const tiaohouOk = tiaohou ? (pct[tiaohou] ?? 0) >= 10 : false

  // ── 格局（月令本气十神）──
  const monthMain = (ZHI_CANGGAN[monthZhi] ?? [])[0] ?? dayGan
  const monthGod = tenGodOf(dayGan, monthMain)
  const GEJU = {
    正官: '正官格', 七杀: '七杀格', 正财: '正财格', 偏财: '偏财格',
    正印: '正印格', 偏印: '偏印格', 食神: '食神格', 伤官: '伤官格',
    比肩: '建禄格', 劫财: '月刃格',
  }
  const geju = GEJU[monthGod] ?? '杂气格'
  const touGan = [ps[0][0], ps[1][0], ps[3][0]].includes(monthMain)

  return {
    ps, dayGan, me, monthZhi, monthWx, dayZhi, yearZhi, hourZhi,
    ws, lingScore, diScore, shiScore, roots, rootList, allies, allyList,
    helpScore, strong,
    wx, pct, gods, gp, gwx,
    allowed, yongGroup, yongWx, yongPower, yongYouLi,
    jiGroup, jiWx, tiaohou, tiaohouOk,
    monthGod, geju, monthMain, touGan,
    strength: helpScore >= 62 ? '身旺' : helpScore >= 50 ? '身强' : helpScore >= 38 ? '身弱' : '身衰',
  }
}

/** 四柱信息表（年/月/日/时）。 */
function pillarInfo(ps, dayGan) {
  const names = ['年柱', '月柱', '日柱', '时柱']
  return ps.map((gz, i) => {
    const g = gz[0]; const z = gz[1]
    const cang = cangGanGods(dayGan, z)
    return {
      name: names[i],
      gz,
      gan: g,
      zhi: z,
      ganWx: GAN_WUXING[g] ?? '',
      zhiWx: ZHI_WUXING[z] ?? '',
      god: i === 2 ? '日主' : tenGodOf(dayGan, g),
      nayin: nayinOf(gz),
      changSheng: i === 2 ? '—' : changShengOf(g, z),
      cangGan: cang.map((c) => `${c.gan}(${c.god})`).join(' '),
    }
  })
}

/** 问事 → 八字用神类（官杀/财/印/食伤/比劫），无则 null。 */
function baziUseGod(question) {
  const q = String(question ?? '')
  const t = [
    { god: '官杀', kw: ['事业', '工作', '职场', '升职', '升迁', '官', '考', '职位', '公务', '诉讼', '上司', '名'] },
    { god: '财', kw: ['财', '钱', '投资', '生意', '买卖', '收入', '工资', '奖金', '债', '股'] },
    { god: '印', kw: ['学业', '读书', '文书', '合同', '证件', '房', '母', '长辈', '师'] },
    { god: '食伤', kw: ['子女', '孩子', '才艺', '创作', '表达', '技', '自由', '作品'] },
    { god: '比劫', kw: ['兄弟', '姐妹', '朋友', '合伙', '同事', '竞争', '同辈'] },
  ]
  for (const x of t) if (x.kw.some((k) => q.includes(k))) return x.god
  return null
}

/** 虚岁（求占年 − 出生年 + 1）。 */
function xuSui(chart) {
  const s = birthSolar(chart)
  if (!s) return null
  return chart.solar.y - s.y + 1
}

// ═════════════════════════ 紫微斗数 ═════════════════════════

/**
 * 排紫微斗数全盘。
 * @returns {object|null} 盘；缺出生资料 / 四柱不全时返回 null。
 */
function buildZiwei(chart) {
  const ps = pillarsOf(chart)
  if (ps.length < 4) return null
  const L = birthLunar(chart)
  if (!L) return null

  const yearGan = ps[0][0]
  const yearZhi = ps[0][1]
  const month = L.month
  const day = L.day
  const hourZhi = L.hourZhi || ps[3][1]
  const hi = ZHI.indexOf(hourZhi)
  if (hi < 0) return null

  // 命宫 / 身宫
  const mingIdx = mod(2 + (month - 1) - hi, 12)
  const shenIdx = mod(2 + (month - 1) + hi, 12)

  // 五行局：命宫干支纳音
  const yinGan = D.YIN_GAN[yearGan] ?? '丙'
  const ganAt = (idx) => GAN[mod(GAN.indexOf(yinGan) + (idx - 2), 10)]
  const mingGan = ganAt(mingIdx)
  const mingGZ = mingGan + ZHI[mingIdx]
  const mingNayin = nayinOf(mingGZ)
  const juWx = mingNayin.slice(-1)
  const ju = D.JU_BY_WUXING[juWx]
  if (!ju) return null

  // 紫微：商数 + 余数
  const q = Math.ceil(day / ju)
  const r = q * ju - day
  const zwIdx = mod(2 + (q - 1) + (r % 2 === 0 ? r : -r), 12)
  const tfIdx = mod(4 - zwIdx, 12)

  // 安星
  const stars = Array.from({ length: 12 }, () => [])
  const put = (idx, name) => { stars[mod(idx, 12)].push(name) }
  for (const [n, off] of D.ZIWEI_SERIES) put(zwIdx + off, n)
  for (const [n, off] of D.TIANFU_SERIES) put(tfIdx + off, n)

  put(4 + (month - 1), '左辅')
  put(10 - (month - 1), '右弼')
  put(10 - hi, '文昌')
  put(4 + hi, '文曲')
  const gui = D.TIAN_GUI[yearGan]
  if (gui) { put(ZHI.indexOf(gui[0]), '天魁'); put(ZHI.indexOf(gui[1]), '天钺') }
  const luIdx = ZHI.indexOf(D.LUCUN[yearGan] ?? '寅')
  put(luIdx, '禄存'); put(luIdx + 1, '擎羊'); put(luIdx - 1, '陀罗')
  put(ZHI.indexOf(D.HUO_START[yearZhi] ?? '丑') + hi, '火星')
  put(ZHI.indexOf(D.LING_START[yearZhi] ?? '戌') + hi, '铃星')
  put(11 + hi, '地劫')
  put(11 - hi, '地空')
  const ma = shenShaOf('驿马', yearZhi)
  if (ma) put(ZHI.indexOf(ma), '天马')

  // 四化
  const hua = D.SIHUA[yearGan] ?? {}
  const huaOf = {}
  for (const [kind, star] of Object.entries(hua)) huaOf[star] = kind
  for (const [star, kind] of Object.entries(huaOf)) {
    for (let i = 0; i < 12; i += 1) if (stars[i].includes(star)) stars[i] = stars[i].map((s) => (s === star ? `${s}化${kind}` : s))
  }

  // 十二宫
  const palaces = ZIWEI_PALACES.map((name, k) => {
    const idx = mod(mingIdx - k, 12)
    return {
      k,
      name,
      idx,
      zhi: ZHI[idx],
      gan: ganAt(idx),
      stars: stars[idx],
      isMing: idx === mingIdx,
      isShen: idx === shenIdx,
    }
  })

  // 大限：阳男阴女顺行、阴男阳女逆行；起限岁数 = 局数，每限十年
  const yang = !!GAN_YANG[yearGan]
  const male = chart.gender !== '女'
  const forward = (yang && male) || (!yang && !male)
  const limits = ZIWEI_PALACES.map((name, k) => {
    const idx = mod(forward ? mingIdx + k : mingIdx - k, 12)
    const start = ju + 10 * k
    return { k, palace: name, idx, zhi: ZHI[idx], gan: ganAt(idx), startAge: start, endAge: start + 9, stars: stars[idx] }
  })

  return {
    lunar: L, yearGan, yearZhi, month, day, hourZhi, hi,
    mingIdx, shenIdx, mingGan, mingGZ, mingNayin, juWx, ju,
    juName: D.JU_NAME[ju] ?? '',
    zwIdx, tfIdx, stars, hua, huaOf, palaces, limits, forward,
    yang, male, ganAt,
  }
}

/** 星曜吉凶合计（含四化加成）。 */
function starsLuck(list) {
  let s = 0
  const detail = []
  for (const raw of list) {
    const m = /^(.+?)化(禄|权|科|忌)$/.exec(raw)
    if (m) {
      const base = D.STAR_LUCK[m[1]] ?? 0
      const hua = D.HUA_LUCK[m[2]] ?? 0
      s += base + hua
      detail.push(`${raw}(${base + hua >= 0 ? '+' : ''}${base + hua})`)
    } else {
      const v = D.STAR_LUCK[raw] ?? 0
      s += v
      detail.push(`${raw}(${v >= 0 ? '+' : ''}${v})`)
    }
  }
  return { score: s, detail }
}

/** 三方四正：本宫 + 对宫 + 三合两宫。 */
function sanFang(idx) {
  return [idx, mod(idx + 6, 12), mod(idx + 4, 12), mod(idx - 4, 12)]
}

/** 问事 → 取用宫名（默认命宫）。 */
function palaceOfQuestion(question) {
  const q = String(question ?? '')
  for (const t of D.PALACE_KEYWORDS) if (t.kw.some((k) => q.includes(k))) return t.palace
  return '命宫'
}

/** 命盘某宫 → 该宫信息（含三方四正）。 */
function palaceView(zw, palaceName) {
  const p = zw.palaces.find((x) => x.name === palaceName) ?? zw.palaces[0]
  const sf = sanFang(p.idx)
  const sfStars = []
  for (const i of sf) for (const s of zw.stars[i]) if (!sfStars.includes(s)) sfStars.push(s)
  return { p, sf, sfStars, self: starsLuck(zw.stars[p.idx]), all: starsLuck(sfStars) }
}

// ═════════════════════════ 七政四余 / 五星占 ═════════════════════════

/** 儒略日（格里历，用当地时分，未转 UT —— 平均黄经近似下误差可忽略）。 */
function julianDay({ y, mo, d, h = 0, mi = 0 }) {
  const dayFrac = d + (h + mi / 60) / 24
  const a = Math.floor((14 - mo) / 12)
  const yy = y + 4800 - a
  const mm = mo + 12 * a - 3
  return dayFrac + Math.floor((153 * mm + 2) / 5) + 365 * yy
    + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045
}

/** 平均黄经（度，0..360）。 */
function meanLon(name, jd) {
  const p = D.MEAN_LONGITUDE[name]
  if (!p) return null
  return mod(p.L0 + p.rate * (jd - 2451545.0), 360)
}

/** 黄经 → 十二宫序（0 = 戌宫，白羊 0°）。 */
const palaceOfLon = (lon) => mod(Math.floor(lon / 30), 12)

// ═════════════════════════ 引擎实现 ═════════════════════════

export const engines = {
  // ── 41 四柱八字·排盘 ──
  baziPan(chart, entry, rand) {
    const A = analyzeBazi(chart)
    if (!A) return null
    const info = pillarInfo(A.ps, A.dayGan)
    const vals = WUXING.map((k) => A.pct[k])
    const mean = 20
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / 5)
    const score = clamp(62 - sd * 2.1 - Math.abs(A.helpScore - 50) * 0.5, -100, 100)
    const missing = WUXING.filter((k) => A.pct[k] < 5)
    const strongest = WUXING.slice().sort((a, b) => A.pct[b] - A.pct[a])[0]

    return {
      score,
      essence: `${A.ps.join(' ')}·日主${A.dayGan}${A.me}${A.strength}·${strongest}${A.pct[strongest].toFixed(0)}%最旺`,
      keys: [A.ps.join(''), `${A.dayGan}${A.me}`, A.strength, `${strongest}旺`,
        ...(missing.length > 0 ? [`缺${missing.join('')}`] : ['五行不缺'])],
      wuxing: A.wx,
      timing: null,
      detail: {
        四柱: info.map((p) => `${p.name} ${p.gz}（${p.ganWx}${p.zhiWx}·${p.nayin}·${p.god}）`),
        藏干十神: info.map((p) => `${p.name}: ${p.cangGan}`),
        日主: `${A.dayGan}（${A.me}）· 月令${A.monthZhi}（${A.monthWx}）· ${A.ws.state}`,
        五行力量: WUXING.map((k) => `${k} ${A.wx[k].toFixed(2)}（${A.pct[k].toFixed(1)}%）`),
        五行均衡: `标准差 ${sd.toFixed(1)}（越小越均衡）`,
        胎元命宫身宫: `胎元 ${chart.birthChart.taiYuan || '—'}｜命宫 ${chart.birthChart.mingGong || '—'}｜身宫 ${chart.birthChart.shenGong || '—'}`,
        旬空: `${xunOf(A.ps[2]).xun}旬 空${(xunOf(A.ps[2]).kong || []).join('')}`,
      },
    }
  },

  // ── 42 八字·日主旺衰 ──
  baziWangShuai(chart, entry, rand) {
    const A = analyzeBazi(chart)
    if (!A) return null
    const dev = Math.abs(A.helpScore - 50)
    let score = 50 - dev * 0.7
    score += A.yongYouLi ? 20 : -25
    if (A.tiaohou) score += A.tiaohouOk ? 10 : -5
    score = clamp(score, -100, 100)

    const keys = [A.strength, `得令${A.ws.state}`, `根${A.roots.toFixed(1)}`, `党${A.allies}`]
    if (A.tiaohou) keys.push(A.tiaohouOk ? `调候得${A.tiaohou}` : `需${A.tiaohou}调候`)

    return {
      score,
      essence: `日主${A.dayGan}${A.me} ${A.strength}（${A.helpScore.toFixed(0)}分）·用神${A.yongWx}${A.yongYouLi ? '有力' : '无力'}`,
      keys,
      wuxing: A.wx,
      timing: null,
      detail: {
        日主: `${A.dayGan}（${A.me}），生于${A.monthZhi}月（${A.monthWx}令）`,
        旺衰总分: `${A.helpScore.toFixed(1)} / 100（50 为中和线）→ ${A.strength}`,
        得令: `月令${A.monthWx}对${A.me}为「${A.ws.state}」→ ${A.lingScore} 分`,
        得地: `四支同党之根 ${A.roots.toFixed(2)} → ${A.diScore.toFixed(1)} 分；${A.rootList.length > 0 ? A.rootList.join('、') : '四支无根'}`,
        得势: `年月时三干同党 ${A.allies} 个 → ${A.shiScore} 分；${A.allyList.length > 0 ? A.allyList.join('、') : '天干无助'}`,
        用神: `${A.yongGroup}（${A.yongWx}）占 ${A.yongPower.toFixed(1)}% → ${A.yongYouLi ? '有力' : '无力'}`,
        忌神: `${A.jiGroup}（${A.jiWx}）`,
        调候: A.tiaohou ? `生${A.monthZhi}月宜见${A.tiaohou}，命局${A.tiaohou}占 ${(A.pct[A.tiaohou] ?? 0).toFixed(1)}%` : '四孟之月，调候不急',
      },
    }
  },

  // ── 43 八字·十神格局 ──
  baziShiShen(chart, entry, rand) {
    const A = analyzeBazi(chart)
    if (!A) return null
    const rank = Object.entries(A.gods).sort((a, b) => b[1] - a[1])
    const useGod = baziUseGod(chart.question)
    const useGrp = useGod ? GOD_GROUP[useGod] : A.yongGroup
    const useWx = A.gwx[useGrp]
    const usePow = A.pct[useWx] ?? 0

    let score = 38
    if (A.touGan) score += 12
    if ((A.gp[A.yongGroup] ?? 0) > 0.6) score += 12
    if (A.yongYouLi) score += 15; else score -= 18
    if (usePow >= 15) score += 12; else if (usePow < 6) score -= 12
    if (A.gp.官杀 + A.gp.印 > 0 && A.gp.财 > 0 && A.gp.食伤 > 0) score += 6
    score = clamp(score, -100, 100)

    const keys = [A.geju, `月令${A.monthGod}`, ...rank.slice(0, 3).map(([g, v]) => `${g}${v.toFixed(1)}`)]
    if (useGod) keys.push(`问${useGod}`)

    return {
      score,
      essence: `${A.geju}·月令${A.monthMain}${A.monthGod}${A.touGan ? '透干' : '不透'}·${rank[0][0]}最重`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: A.wx,
      timing: null,
      detail: {
        格局: `${A.geju}（月令${A.monthZhi}本气${A.monthMain}，对日主${A.dayGan}为${A.monthGod}，${A.touGan ? '透于天干' : '不透天干'}）`,
        十神分布: rank.map(([g, v]) => `${g} ${v.toFixed(2)}`),
        五类力量: Object.entries(A.gp).map(([g, v]) => `${g} ${v.toFixed(2)}`),
        日主: `${A.dayGan}（${A.me}）·${A.strength}`,
        用神: `${A.yongGroup}（${A.yongWx}）·${A.yongYouLi ? '有力' : '无力'}`,
        问事取用: useGod
          ? `所问之事以「${useGod}」为用，该类五行${useWx}占 ${usePow.toFixed(1)}%`
          : `事类不明，仍以扶抑用神「${A.yongGroup}」论`,
        格局评断: A.touGan && A.yongYouLi
          ? '格局星透干、用神有气，格成而清'
          : A.touGan ? '格局星透干而用神欠力，格成而力薄'
            : '格局星藏支不透，格不甚清，须待运引发',
      },
    }
  },

  // ── 44 八字·用神取法 ──
  baziYongShen(chart, entry, rand) {
    const A = analyzeBazi(chart)
    if (!A) return null
    let score = clamp(A.yongPower * 3.0 - 24, -100, 100)
    if (A.yongYouLi) score += 8
    if (A.tiaohou) score += A.tiaohouOk ? 14 : -10
    score = clamp(score, -100, 100)

    const keys = [`${A.strong ? '扶抑' : '扶抑'}取${A.yongGroup}`, `用神${A.yongWx}`, `占${A.yongPower.toFixed(0)}%`]
    if (A.tiaohou) keys.push(`调候${A.tiaohou}`)
    keys.push(`忌${A.jiWx}`)

    return {
      score,
      essence: `${A.strength}取${A.yongGroup}（${A.yongWx}）${A.yongYouLi ? '有力' : '无力'}${A.tiaohou ? `·兼调候${A.tiaohou}` : ''}`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: A.wx,
      timing: null,
      detail: {
        取法: A.strong
          ? `日主${A.dayGan}${A.me}${A.strength}（${A.helpScore.toFixed(0)}分），宜克泄耗：官杀 → 食伤 → 财`
          : `日主${A.dayGan}${A.me}${A.strength}（${A.helpScore.toFixed(0)}分），宜生扶：印 → 比劫`,
        用神: `${A.yongGroup} → 五行「${A.yongWx}」，命局占 ${A.yongPower.toFixed(1)}%`,
        忌神: `${A.jiGroup} → 五行「${A.jiWx}」，命局占 ${(A.pct[A.jiWx] ?? 0).toFixed(1)}%`,
        喜神: `生用神者为喜：${SHENG_BY[A.yongWx]}（${A.pct[SHENG_BY[A.yongWx]].toFixed(1)}%）`,
        调候: A.tiaohou
          ? `生于${A.monthZhi}月，气候宜${A.tiaohou}；命局${A.tiaohou}占 ${(A.pct[A.tiaohou] ?? 0).toFixed(1)}%，${A.tiaohouOk ? '调候已足' : '调候不足，行运见之为佳'}`
          : '非严寒盛暑之月，以扶抑为主',
        说明: '取用神以扶抑为主、调候为辅；若扶抑与调候冲突，则扶抑用神为主、调候为佐。',
      },
    }
  },

  // ── 45 八字·大运流年 ──
  baziDaYun(chart, entry, rand) {
    const A = analyzeBazi(chart)
    if (!A) return null
    const yun = chart.yun
    const list = Array.isArray(yun?.daYun) ? yun.daYun.filter((d) => typeof d?.gz === 'string' && d.gz.length >= 2) : []
    const age = xuSui(chart)
    const cur = list.find((d) => age >= d.startAge && age <= d.endAge) ?? list[0] ?? null
    const liuNian = chart.ganzhi.year || ''
    const favor = A.allowed

    /** 干支对日主的喜忌分。 */
    const judgeGZ = (gz) => {
      if (!gz || gz.length < 2) return { s: 0, god: '—', grp: '—', note: '无干支' }
      const god = tenGodOf(A.dayGan, gz[0])
      const grp = GOD_GROUP[god] ?? '—'
      const dwx = GAN_WUXING[gz[0]]
      const zwx = ZHI_WUXING[gz[1]]
      let s = 0
      if (favor.includes(grp)) s += 18; else s -= 18
      if (dwx === A.yongWx) s += 12; else if (dwx === A.jiWx) s -= 10
      if (zwx === A.yongWx) s += 14; else if (zwx === A.jiWx) s -= 12
      if (A.tiaohou && (dwx === A.tiaohou || zwx === A.tiaohou)) s += 8
      const relDay = relation(A.me, dwx)
      return {
        s, god, grp,
        note: `${gz[0]}${dwx}为${god}（${grp}），${gz[1]}${zwx}；与日主${relDay}`,
      }
    }

    const curJ = cur ? judgeGZ(cur.gz) : { s: 0, god: '—', grp: '—', note: '未起运' }
    const lnJ = judgeGZ(liuNian)
    let score = clamp(curJ.s * 1.4 + lnJ.s * 1.1 + 8, -100, 100)

    const keys = []
    if (cur) keys.push(`大运${cur.gz}`)
    keys.push(`流年${liuNian}`, `${lnJ.grp}`, ...(cur ? [`${curJ.grp}`] : []))
    if (A.tiaohou && A.tiaohouOk) keys.push('调候已足')

    const upcoming = list.filter((d) => age < d.startAge).slice(0, 3)
    const past = list.filter((d) => age > d.endAge).slice(-1)

    return {
      score,
      essence: cur
        ? `${age}岁行${cur.gz}运（${curJ.grp}）·流年${liuNian}（${lnJ.grp}）·${score > 15 ? '顺' : score < -15 ? '滞' : '平'}`
        : `未起运·流年${liuNian}（${lnJ.grp}）`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: A.wx,
      timing: cur ? `${cur.gz}运 ${cur.startYear}–${cur.startYear + 9}年（${cur.startAge}–${cur.endAge}岁）` : null,
      detail: {
        起运: yun
          ? `${yun.startYear} 年 ${yun.startMonth} 个月起运（${yun.startSolar || '—'}）`
          : '历法层未排出大运（缺性别或出生资料）',
        虚岁: age === null ? '—' : `${age} 岁`,
        当前大运: cur ? `${cur.gz}（${cur.startAge}–${cur.endAge}岁，${cur.startYear}年起）— ${curJ.note}` : '未起运',
        流年: `${liuNian} — ${lnJ.note}`,
        用忌: `用神 ${A.yongGroup}（${A.yongWx}）；忌神 ${A.jiGroup}（${A.jiWx}）`,
        已过大运: past.length > 0 ? past.map((d) => `${d.gz}(${d.startAge}-${d.endAge})`).join('、') : '无',
        未来大运: upcoming.length > 0
          ? upcoming.map((d) => `${d.gz}(${d.startAge}-${d.endAge}岁) ${judgeGZ(d.gz).grp === '—' ? '' : judgeGZ(d.gz).grp}`).join('、')
          : '无更多大运',
        大运全表: list.map((d) => `${d.gz} ${d.startAge}-${d.endAge}岁`),
        断: score > 30 ? '运岁扶用神，此期可进取'
          : score > 0 ? '运岁小顺，宜守中有进'
            : score > -30 ? '运岁欠扶，宜稳守待时'
              : '运岁助忌神，此期宜静不宜动',
      },
    }
  },

  // ── 46 八字·神煞 ──
  baziShenSha(chart, entry, rand) {
    const ps = pillarsOf(chart)
    if (ps.length < 4) return null
    const dayGan = chart.birthChart.dayGan || ps[2][0]
    const yearGan = ps[0][0]
    const yearZhi = ps[0][1]
    const dayZhi = ps[2][1]
    const zhis = ps.map((g) => g[1])
    const gans = ps.map((g) => g[0])

    /** 命中记录。 */
    const hits = []
    const mark = (name, zhi, how) => {
      if (!zhi) return
      const at = zhis.map((z, i) => (z === zhi ? ['年', '月', '日', '时'][i] : '')).filter(Boolean)
      if (at.length > 0) hits.push({ name, zhi, at: at.join(''), how, luck: D.SHENSHA_LUCK[name] ?? 0 })
    }

    for (const z of D.TIANYI[yearGan] ?? []) mark('天乙贵人', z, '年干')
    for (const z of D.TIANYI[dayGan] ?? []) mark('天乙贵人', z, '日干')
    mark('文昌贵人', D.WENCHANG[dayGan], '日干')
    mark('禄神', D.LUSHEN[dayGan], '日干')
    mark('金舆', D.JINYU[dayGan], '日干')
    mark('羊刃', D.YANGREN[dayGan], '日干')
    mark('红艳', D.HONGYAN[dayGan], '日干')
    const gugua = D.GUGUA[yearZhi] ?? []
    mark('孤辰', gugua[0], '年支')
    mark('寡宿', gugua[1], '年支')
    mark('亡神', D.WANGSHEN[yearZhi], '年支')
    mark('劫煞', D.JIESHA[yearZhi], '年支')
    for (const kind of ['驿马', '桃花', '华盖', '将星']) {
      mark(kind, shenShaOf(kind, yearZhi), '年支')
      mark(kind, shenShaOf(kind, dayZhi), '日支')
    }
    const yuede = D.YUEDE[ps[1][1]]
    if (yuede && gans.includes(yuede)) hits.push({ name: '月德贵人', zhi: yuede, at: '天干', how: '月支三合', luck: D.SHENSHA_LUCK.月德贵人 })
    const L = birthLunar(chart)
    const tiande = L ? D.TIANDE[L.month] : null
    if (tiande && (gans.includes(tiande) || zhis.includes(tiande))) {
      hits.push({ name: '天德贵人', zhi: tiande, at: '命局', how: '农历月', luck: D.SHENSHA_LUCK.天德贵人 })
    }
    if (D.KUIGANG.includes(ps[2])) hits.push({ name: '魁罡', zhi: ps[2][1], at: '日', how: '日柱', luck: D.SHENSHA_LUCK.魁罡 })

    // 同名神煞合并计分（重复出现略加权，但不线性叠加），避免「多宫重见」把总分顶满
    const byName = new Map()
    for (const h of hits) {
      const cur = byName.get(h.name)
      if (cur) { cur.count += 1; cur.at += h.at }
      else byName.set(h.name, { ...h, count: 1 })
    }
    const uniq = [...byName.values()]
    const total = uniq.reduce((s, h) => s + h.luck * Math.min(1.5, 1 + 0.25 * (h.count - 1)), 0)
    const good = uniq.filter((h) => h.luck > 0)
    const bad = uniq.filter((h) => h.luck < 0)
    const score = clamp(total * 1.3, -100, 100)

    // 应期：以命中神煞所在地支，取其冲 / 值之年（公开通法）
    let timing = null
    if (hits.length > 0) {
      const pick = hits[rand.below(hits.length)]
      const chong = ZHI[mod(ZHI.indexOf(pick.zhi) + 6, 12)]
      timing = `${pick.name}在${pick.zhi}，逢${pick.zhi}${chong}之年应`
    }

    const keys = [...new Set(hits.map((h) => h.name))].slice(0, 6)
    if (keys.length === 0) keys.push('四柱无常用神煞')

    return {
      score,
      essence: hits.length === 0
        ? '四柱未见常用神煞，以格局旺衰论'
        : `吉神${good.length}凶煞${bad.length}·${good.slice(0, 2).map((h) => h.name).join('/') || '无'}${bad.length > 0 ? `·${bad.slice(0, 2).map((h) => h.name).join('/')}` : ''}`,
      keys,
      wuxing: chart.birthChart.wuxing ?? emptyWuxing(),
      timing,
      detail: {
        命中神煞: hits.length > 0 ? hits.map((h) => `${h.name}（${h.how}→${h.zhi}，落${h.at}，${h.luck >= 0 ? '+' : ''}${h.luck}）`) : ['无'],
        吉神: good.length > 0 ? good.map((h) => h.name) : ['无'],
        凶煞: bad.length > 0 ? bad.map((h) => h.name) : ['无'],
        神煞总分: `${total.toFixed(1)}（同名合并后 ×1.3 → ${score.toFixed(1)}）`,
        查法: [...new Set(hits.map((h) => `${h.name}：${D.SHENSHA_HOW[h.name] ?? h.how}`))],
        四柱: ps.join(' '),
        说明: '神煞吉凶分为本插件采用的公开通例编辑取值（见 methods/data/mingli.js），仅作辅助，须与格局旺衰合参。',
      },
    }
  },

  // ── 47 纳音论命 ──
  nayin(chart, entry, rand) {
    const ps = pillarsOf(chart)
    if (ps.length < 4) return null
    const dayGan = chart.birthChart.dayGan || ps[2][0]
    const me = GAN_WUXING[dayGan]
    const nys = ps.map((gz) => nayinOf(gz))
    const nyWx = nys.map((n) => n.slice(-1))
    const info = pillarInfo(ps, dayGan)

    // 年纳音与日纳音：古法「年为本、日为主」
    const relYearDay = relation(nyWx[2], nyWx[0])   // 以日纳音为主、年纳音为客
    // 日纳音 vs 日主五行（以日主为主）
    const relNayinMe = relation(me, nyWx[2])
    let score = 0
    score += { 生我: 25, 比和: 20, 我克: 10, 我生: -5, 克我: -25 }[relNayinMe] ?? 0
    score += { 生我: 18, 比和: 14, 我克: 6, 我生: -4, 克我: -18 }[relYearDay] ?? 0
    // 四柱纳音五行分布是否相续（相生为顺）
    let chain = 0
    for (let i = 1; i < 4; i += 1) {
      const r = relation(nyWx[i - 1], nyWx[i])
      if (r === '我生' || r === '比和') chain += 1
      else if (r === '克我') chain -= 1
    }
    score += chain * 6
    score = clamp(score, -100, 100)

    const wx = emptyWuxing()
    nyWx.forEach((k, i) => { wx[k] += i === 2 ? 2 : 1 })

    return {
      score,
      essence: `日纳音${nys[2]}·${relNayinMe}日主${me}·年日${relYearDay}`,
      keys: [`日${nys[2]}`, `年${nys[0]}`, `纳音${relNayinMe}`, chain >= 2 ? '纳音相续' : chain <= -1 ? '纳音相克' : '纳音平'],
      wuxing: wx,
      timing: null,
      detail: {
        四柱纳音: info.map((p) => `${p.name} ${p.gz} → ${p.nayin}（${p.nayin.slice(-1)}）`),
        纳音五行: nys.map((n, i) => `${['年', '月', '日', '时'][i]}${n}`),
        日纳音与日主: `日纳音${nys[2]}（${nyWx[2]}）对日主${dayGan}（${me}）为「${relNayinMe}」（以日主为主）`,
        年日关系: `以日纳音${nys[2]}（${nyWx[2]}）为主、年纳音${nys[0]}（${nyWx[0]}）为客 →「${relYearDay}」`,
        纳音相续: `四柱相邻纳音顺逆 ${chain}（正为相生相续，负为相克断续）`,
        古法: '纳音以年为本、日为主：年纳音看根基，日纳音看本身，相生相续为顺、相克断续为滞。',
      },
    }
  },

  // ── 48 十二长生·命宫 ──
  changsheng(chart, entry, rand) {
    const ps = pillarsOf(chart)
    if (ps.length < 4) return null
    const bc = chart.birthChart
    const dayGan = bc.dayGan || ps[2][0]
    const me = GAN_WUXING[dayGan]
    const stages = ps.map((gz) => changShengOf(dayGan, gz[1]))
    const LUCK = { 长生: 22, 沐浴: -8, 冠带: 14, 临官: 22, 帝旺: 26, 衰: -10, 病: -16, 死: -20, 墓: -12, 绝: -18, 胎: 4, 养: 8 }
    const parts = stages.map((s) => LUCK[s] ?? 0)
    let score = parts.reduce((a, b) => a + b, 0) / 4 * 2.4

    const mingGZ = String(bc.mingGong ?? '')
    const shenGZ = String(bc.shenGong ?? '')
    const taiGZ = String(bc.taiYuan ?? '')
    const mingWx = mingGZ.length >= 2 ? (GAN_WUXING[mingGZ[0]] ?? '') : ''
    const mingRel = mingWx ? relation(me, mingWx) : null
    if (mingRel) score += { 生我: 16, 比和: 12, 我克: 4, 我生: -4, 克我: -16 }[mingRel] ?? 0
    score = clamp(score, -100, 100)

    const zhiSheng = stages[2]
    const keys = [`日坐${zhiSheng}`, `时${stages[3]}`, `月${stages[1]}`]
    if (mingGZ) keys.push(`命宫${mingGZ}`)
    if (['长生', '临官', '帝旺'].includes(zhiSheng)) keys.push('日主得气')
    else if (['死', '绝', '墓', '病'].includes(zhiSheng)) keys.push('日主失气')

    return {
      score,
      essence: `日主${dayGan}坐${ps[2][1]}为${zhiSheng}·命宫${mingGZ || '—'}${mingRel ? `(${mingRel})` : ''}`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: wxPower(ps),
      timing: null,
      detail: {
        日干十二长生: ps.map((gz, i) => `${['年', '月', '日', '时'][i]}支${gz[1]}：${stages[i]}（${parts[i] >= 0 ? '+' : ''}${parts[i]}）`),
        日主: `${dayGan}（${me}）`,
        胎元: taiGZ || '—',
        命宫: mingGZ ? `${mingGZ}（${nayinOf(mingGZ)}${mingRel ? `，对日主为${mingRel}` : ''}）` : '—',
        身宫: shenGZ ? `${shenGZ}（${nayinOf(shenGZ)}）` : '—',
        长生起点: `日干${dayGan}长生在${CHANGSHENG_START[dayGan] ?? '—'}，${GAN_YANG[dayGan] ? '阳干顺行' : '阴干逆行'}`,
        断: ['长生', '临官', '帝旺'].includes(zhiSheng)
          ? '日坐生旺之地，本身气足，能任财官'
          : ['死', '绝', '墓', '病'].includes(zhiSheng)
            ? '日坐死绝之地，本身气弱，须印比帮扶'
            : '日坐中和之地，气不偏胜',
      },
    }
  },

  // ── 49 紫微斗数·安星 ──
  ziweiAnxing(chart, entry, rand) {
    const zw = buildZiwei(chart)
    if (!zw) return null
    const target = palaceOfQuestion(chart.question)
    const v = palaceView(zw, target)
    const ming = palaceView(zw, '命宫')
    let score = clamp(ming.all.score * 0.75 + v.all.score * 0.35, -100, 100)
    if (ming.p.stars.length === 0) score -= 8

    const keys = [`${zw.juName}`, `命宫${ZHI[zw.mingIdx]}`, `取${target}`]
    const main = ming.p.stars.filter((s) => D.ZIWEI_SERIES.some((x) => x[0] === s) || D.TIANFU_SERIES.some((x) => x[0] === s))
    if (main.length > 0) keys.push(main.slice(0, 2).join(''))

    return {
      score,
      essence: `${zw.juName}·命宫${ZHI[zw.mingIdx]}${ming.p.stars.slice(0, 2).join('') || '空宫'}·${target}${v.p.stars.slice(0, 1).join('') || '空'}`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: (() => {
        const w = emptyWuxing()
        for (const p of zw.palaces) for (const s of p.stars) {
          const wx = { 紫微: '土', 天机: '木', 太阳: '火', 武曲: '金', 天同: '水', 廉贞: '火', 天府: '土', 太阴: '水', 贪狼: '木', 巨门: '水', 天相: '水', 天梁: '土', 七杀: '金', 破军: '水' }[s.replace(/化(禄|权|科|忌)$/, '')]
          if (wx) w[wx] += 1
        }
        return w
      })(),
      timing: null,
      detail: {
        生年: `${zw.yearGan}${zw.yearZhi}年 · 农历${zw.lunar.leap ? '闰' : ''}${zw.month}月${zw.day}日 ${zw.hourZhi}时`,
        五行局: `${zw.juName}（命宫${zw.mingGZ}，纳音${zw.mingNayin}→${zw.juWx}）`,
        命宫身宫: `命宫在${ZHI[zw.mingIdx]}（${zw.mingGan}${ZHI[zw.mingIdx]}），身宫在${ZHI[zw.shenIdx]}`,
        紫微天府: `紫微在${ZHI[zw.zwIdx]}，天府在${ZHI[zw.tfIdx]}`,
        十二宫: zw.palaces.map((p) => `${p.name}(${p.gan}${p.zhi}${p.isShen ? '·身' : ''})：${p.stars.join(' ') || '空宫'}`),
        取用宫: `${target}（${v.p.gan}${v.p.zhi}）：本宫 ${v.p.stars.join(' ') || '空宫'}`,
        三方四正: `[${v.sf.map((i) => ZHI[i]).join(' ')}] ${v.sfStars.join(' ')}`,
        星曜吉凶分: `命宫三方 ${ming.all.score.toFixed(0)}｜${target}三方 ${v.all.score.toFixed(0)}`,
        说明: '安星法取《紫微斗数全书》公开口诀；主星吉凶倾向分为本插件公开通例编辑取值（见 methods/data/mingli.js）。',
      },
    }
  },

  // ── 50 紫微斗数·四化 ──
  ziweiSiHua(chart, entry, rand) {
    const zw = buildZiwei(chart)
    if (!zw) return null
    const entries = Object.entries(zw.hua)
    if (entries.length === 0) return null
    const rows = entries.map(([kind, star]) => {
      const idx = zw.stars.findIndex((arr) => arr.some((s) => s.replace(/化(禄|权|科|忌)$/, '') === star))
      const pal = idx >= 0 ? zw.palaces.find((p) => p.idx === idx) : null
      return { kind, star, idx, palace: pal?.name ?? '—', zhi: idx >= 0 ? ZHI[idx] : '—' }
    })
    const target = palaceOfQuestion(chart.question)
    let score = 0
    for (const r of rows) score += D.HUA_LUCK[r.kind] ?? 0
    const hit = rows.filter((r) => r.palace === target)
    for (const h of hit) score += (D.HUA_LUCK[h.kind] ?? 0) * 0.6
    // 化忌落命/用宫重扣
    if (rows.some((r) => r.kind === '忌' && (r.palace === '命宫' || r.palace === target))) score -= 12
    score = clamp(score, -100, 100)

    const keys = rows.map((r) => `${r.star}化${r.kind}`)
    if (hit.length > 0) keys.push(`${target}得化`)

    return {
      score,
      essence: `${zw.yearGan}干四化：${rows.map((r) => `${r.star}${r.kind}入${r.palace}`).join('·')}`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: emptyWuxing(),
      timing: null,
      detail: {
        生年干: `${zw.yearGan}（${zw.yearZhi}年）`,
        四化: rows.map((r) => `${r.star}化${r.kind} → 在${r.zhi}宫（${r.palace}，${D.HUA_LUCK[r.kind] >= 0 ? '+' : ''}${D.HUA_LUCK[r.kind]}）`),
        取用宫: target,
        用宫逢化: hit.length > 0 ? hit.map((h) => `${h.star}化${h.kind}`) : ['无'],
        四化吉凶分: `${score.toFixed(1)}（禄权科为吉、忌为凶；落命宫或用事宫加倍）`,
        说明: '四化表按生年干：甲廉破武阳、乙机梁紫阴、丙同机昌廉、丁阴同机巨、戊贪阴右机、己武贪梁曲、庚阳武阴同、辛巨阳曲昌、壬梁紫左武、癸破巨阴贪。',
      },
    }
  },

  // ── 51 紫微·三方四正 ──
  ziweiSanFang(chart, entry, rand) {
    const zw = buildZiwei(chart)
    if (!zw) return null
    const target = palaceOfQuestion(chart.question)
    const v = palaceView(zw, target)
    const ji = v.sfStars.filter((s) => ['左辅', '右弼', '文昌', '文曲', '天魁', '天钺', '禄存'].includes(s))
    const sha = v.sfStars.filter((s) => ['擎羊', '陀罗', '火星', '铃星', '地空', '地劫'].includes(s))
    let score = clamp(v.all.score * 0.9 + (ji.length - sha.length) * 6, -100, 100)
    if (v.p.stars.length === 0) score -= 6

    const keys = [`${target}三方`, `吉${ji.length}`, `煞${sha.length}`]
    if (ji.length > 0) keys.push(ji.slice(0, 2).join(''))
    if (sha.length > 0) keys.push(sha.slice(0, 2).join(''))

    return {
      score,
      essence: `${target}三方四正：吉${ji.length}煞${sha.length}·${v.sfStars.slice(0, 3).join('') || '空'}·${score > 25 ? '会照得力' : score < -20 ? '煞重' : '平'}`
        .slice(0, 60),
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: emptyWuxing(),
      timing: null,
      detail: {
        取用宫: `${target}（${v.p.gan}${v.p.zhi}）`,
        本宫: v.p.stars.join(' ') || '空宫',
        三方四正宫位: v.sf.map((i) => `${ZHI[i]}(${zw.palaces.find((p) => p.idx === i)?.name ?? ''})`),
        会照星曜: v.sfStars.length > 0 ? v.sfStars : ['无'],
        吉星: ji.length > 0 ? ji : ['无'],
        煞星: sha.length > 0 ? sha : ['无'],
        吉凶分: `本宫 ${v.self.score.toFixed(0)}｜三方四正合计 ${v.all.score.toFixed(0)}`,
        断: score > 25
          ? '三方四正吉星会照，事有助力'
          : score < -20 ? '三方四正煞星冲破，事多阻隔' : '三方四正吉煞相参，平中带变',
      },
    }
  },

  // ── 52 紫微·大限流年 ──
  ziweiDaXian(chart, entry, rand) {
    const zw = buildZiwei(chart)
    if (!zw) return null
    const age = xuSui(chart)
    if (age === null) return null
    const limit = zw.limits.find((l) => age >= l.startAge && age <= l.endAge) ?? zw.limits[0]
    const liuZhi = chart.ganzhi.year ? chart.ganzhi.year[1] : ''
    const liuIdx = ZHI.indexOf(liuZhi)
    const liuPalace = zw.palaces.find((p) => p.idx === liuIdx) ?? null
    const limView = palaceView(zw, limit.palace)
    const liuStars = liuIdx >= 0 ? starsLuck(zw.stars[liuIdx]) : { score: 0, detail: [] }
    const target = palaceOfQuestion(chart.question)
    const targetInLimit = zw.palaces.find((p) => p.name === target)

    let score = clamp(limView.all.score * 0.8 + liuStars.score * 0.5, -100, 100)
    if (targetInLimit && targetInLimit.idx === limit.idx) score += 10
    if (liuIdx === zw.mingIdx) score -= 8   // 流年临本命，动中带冲
    score = clamp(score, -100, 100)

    const keys = [`大限${limit.palace}`, `${limit.startAge}-${limit.endAge}岁`, `流年${liuZhi}`]
    if (liuPalace) keys.push(`流年${liuPalace.name}`)

    return {
      score,
      essence: `${age}岁大限${limit.palace}（${limit.zhi}）·流年${liuZhi}落${liuPalace?.name ?? '—'}·${score > 25 ? '吉' : score < -20 ? '滞' : '平'}`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: emptyWuxing(),
      timing: `${limit.palace}大限 ${limit.startAge}–${limit.endAge}岁`,
      detail: {
        虚岁: `${age} 岁`,
        大限: `第${limit.k + 1}限 · ${limit.palace}宫（${limit.gan}${limit.zhi}）· ${limit.startAge}–${limit.endAge} 岁`,
        大限星曜: limit.stars.join(' ') || '空宫',
        大限三方: `[${sanFang(limit.idx).map((i) => ZHI[i]).join(' ')}] ${palaceView(zw, limit.palace).sfStars.join(' ')}`,
        流年: `${chart.ganzhi.year}（${liuZhi}年）落${liuPalace?.name ?? '—'}宫`,
        流年星曜: zw.stars[liuIdx]?.join(' ') || '空宫',
        行限方向: zw.forward ? '顺行（阳男阴女）' : '逆行（阴男阳女）',
        大限全表: zw.limits.map((l) => `${l.palace} ${l.startAge}-${l.endAge}岁`),
        断: score > 25 ? '限运星曜得地，此期可图进取'
          : score < -20 ? '限运煞重，宜守成避险' : '限运吉凶相参，稳中求进',
      },
    }
  },

  // ── 53 七政四余 ──
  qizheng(chart, entry, rand) {
    const s = birthSolar(chart)
    if (!s) return null
    const jd = julianDay(s)
    const pos = {}
    for (const name of [...D.QIZHENG, ...D.SIYU]) {
      const lon = meanLon(name, jd)
      if (lon === null) continue
      pos[name] = { lon, palace: palaceOfLon(lon), zhi: D.TWELVE_ZHI[palaceOfLon(lon)], wx: D.QIZHENG_WX[name] }
    }
    const sun = pos.太阳
    if (!sun) return null
    const hi = ZHI.indexOf(birthLunar(chart)?.hourZhi ?? '') 
    const hourIdx = hi >= 0 ? hi : ZHI.indexOf(pillarsOf(chart)[3]?.[1] ?? '')
    // 命宫：太阳所躔之宫，按生时推上升（卯时太阳在命宫，每时辰进一宫）
    const mingIdx = mod(sun.palace + ((hourIdx >= 0 ? hourIdx : 3) - 3), 12)
    const mingZhi = D.TWELVE_ZHI[mingIdx]
    const mingWx = ZHI_WUXING[mingZhi] ?? '土'

    // 星曜落宫与命宫的生克
    let score = 0
    const rows = []
    for (const [name, p] of Object.entries(pos)) {
      const rel = relation(mingWx, p.wx)
      let v = { 生我: 14, 比和: 10, 我克: 4, 我生: -4, 克我: -14 }[rel] ?? 0
      if (p.palace === mingIdx) v += 8
      if (p.palace === mod(mingIdx + 6, 12)) v -= 6
      if (name === '太阳' || name === '太阴') v *= 1.3
      score += v
      rows.push({ name, ...p, rel, v, palaceName: D.TWELVE_PALACES[p.palace] })
    }
    score = clamp(score * 1.6, -100, 100)

    const wx = emptyWuxing()
    for (const p of Object.values(pos)) wx[p.wx] += 1

    const keys = [`命宫${mingZhi}`, ...rows.slice(0, 3).map((r) => `${r.name}${r.zhi}`)]

    return {
      score,
      fidelity: 'approx',
      essence: `命宫${mingZhi}(${mingWx})·日${sun.zhi}月${pos.太阴?.zhi ?? '—'}·${score > 30 ? '星多生扶' : score < -20 ? '星多克害' : '生克相参'}`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: wx,
      timing: null,
      detail: {
        出生: `${s.y}-${s.mo}-${s.d} ${s.h}:${String(s.mi).padStart(2, '0')}（儒略日 ${jd.toFixed(2)}）`,
        命宫: `${mingZhi}宫（${D.TWELVE_PALACES[mingIdx]}，宫五行${mingWx}）`,
        七政: D.QIZHENG.map((n) => pos[n] ? `${n} 黄经${pos[n].lon.toFixed(1)}° → ${pos[n].zhi}宫(${pos[n].palaceName}) ${pos[n].wx}·${pos[n].rel}` : `${n} —`),
        四余: D.SIYU.map((n) => pos[n] ? `${n} 黄经${pos[n].lon.toFixed(1)}° → ${pos[n].zhi}宫(${pos[n].palaceName})` : `${n} —`),
        十二宫: D.TWELVE_PALACES.map((n, i) => `${n}(${D.TWELVE_ZHI[i]})`),
        星曜吉凶分: rows.map((r) => `${r.name}(${r.v >= 0 ? '+' : ''}${r.v.toFixed(1)})`),
        说明: '无星历表：七政黄经按 J2000 平均黄经近似式（太阳 0.9856°/日、月 13.1764°/日、五星用平均运动）推算，未含摄动、未作岁差与光行时改正；四余中罗睺/计都为月球交点、月孛为月球远地点（皆近似），紫气为传统虚星（按 28 年一周天）。命宫按「太阳所躔之宫，卯时在命、每时辰进一宫」近似定，非真实上升点。故此条 fidelity 标 approx。',
      },
    }
  },

  // ── 54 五星占 ──
  wuxingZhan(chart, entry, rand) {
    const s = birthSolar(chart)
    if (!s) return null
    const jd = julianDay(s)
    const ps = pillarsOf(chart)
    const dayGan = ps.length >= 3 ? (chart.birthChart?.dayGan || ps[2][0]) : ''
    const me = GAN_WUXING[dayGan] ?? ''

    const rows = D.FIVE_PLANETS.map((p) => {
      const lon = meanLon(p.planet, jd)
      const palace = lon === null ? -1 : palaceOfLon(lon)
      return { ...p, lon, palace, zhi: palace >= 0 ? D.TWELVE_ZHI[palace] : '—' }
    })
    const valid = rows.filter((r) => r.palace >= 0)
    if (valid.length === 0) return null

    // 五星聚散：同宫为聚
    const groups = {}
    for (const r of valid) (groups[r.palace] ??= []).push(r)
    const ju = Object.entries(groups).filter(([, v]) => v.length >= 2)
    const san = Object.entries(groups).filter(([, v]) => v.length >= 3)

    let score = 0
    for (const r of valid) {
      let v = r.luck
      if (me) {
        const rel = relation(me, r.wx)
        v += { 生我: 10, 比和: 6, 我克: 2, 我生: -3, 克我: -10 }[rel] ?? 0
      }
      score += v
    }
    if (san.length > 0) score += 22
    else if (ju.length > 0) score += 10
    score = clamp(score * 1.8, -100, 100)

    const wx = emptyWuxing()
    for (const r of valid) wx[r.wx] += 1
    const missing = WUXING.filter((k) => wx[k] === 0)

    const keys = [`五星${ju.length > 0 ? `${ju.length}聚` : '不聚'}`]
    if (me) keys.push(`日主${me}`)
    if (missing.length > 0) keys.push(`星缺${missing.join('')}`)
    keys.push(...valid.slice(0, 2).map((r) => `${r.name}${r.zhi}`))

    return {
      score,
      fidelity: 'approx',
      essence: `五星${valid.map((r) => r.name[0]).join('')}·${san.length > 0 ? `${san[0][1].length}星聚` : ju.length > 0 ? '两星聚' : '散居各宫'}·${me ? `对日主${me}` : '无日主'}`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: wx,
      timing: null,
      detail: {
        五星躔度: valid.map((r) => `${r.name}(${r.planet}) 黄经${r.lon.toFixed(1)}° → ${r.zhi}宫(${D.TWELVE_PALACES[r.palace]})，${r.wx}·${r.note}`),
        五星聚散: ju.length > 0
          ? ju.map(([pi, v]) => `${D.TWELVE_ZHI[+pi]}宫聚 ${v.map((x) => x.name).join('、')}`)
          : ['五星散居各宫，不相聚'],
        五星五行: WUXING.map((k) => `${k} ${wx[k]}`),
        与日主关系: me
          ? valid.map((r) => `${r.name}${r.wx}对日主${me}为「${relation(me, r.wx)}」`)
          : ['无出生四柱，略去与日主的关系'],
        说明: '无星历表：五星位置按 J2000 平均会合运动（平均黄经）近似，不含摄动与冲日/留逆，故「聚散」只是平均位置上的同宫，不等同真实天象。fidelity 标 approx。',
      },
    }
  },

  // ── 55 二十八宿命度 ──
  xiu28Ming(chart, entry, rand) {
    const L = birthLunar(chart)
    if (!L) return null
    const idx = XIU28.findIndex((x) => x.name === L.xiu)
    const xiu = idx >= 0 ? XIU28[idx] : null
    if (!xiu) return null
    const hi = ZHI.indexOf(L.hourZhi)
    const du = ((hi >= 0 ? hi : 0) + 0.5) * 2.5   // 一宿 30 度、十二时辰均分
    const ps = pillarsOf(chart)
    const dayGan = ps.length >= 3 ? (chart.birthChart?.dayGan || ps[2][0]) : ''
    const me = GAN_WUXING[dayGan] ?? ''
    const rel = me ? relation(me, xiu.wx) : null

    let score = xiu.score
    if (rel) score += { 生我: 20, 比和: 14, 我克: 6, 我生: -6, 克我: -20 }[rel]
    if (L.xiuLuck === '吉') score += 14
    else if (L.xiuLuck === '凶') score -= 14
    // 命度前后宿的吉凶（宿与宿相邻）
    const prev = XIU28[mod(idx - 1, 28)]
    const next = XIU28[mod(idx + 1, 28)]
    score += (prev.score + next.score) * 0.1
    score = clamp(score, -100, 100)

    const keys = [`${xiu.name}宿`, `${xiu.dir}方`, `${xiu.wx}`, L.xiuLuck ? `宿${L.xiuLuck}` : '宿平']
    if (rel) keys.push(REL_LABEL_XIU[rel] ?? rel)

    return {
      score,
      essence: `值宿${xiu.name}（${xiu.dir}方${xiu.wx}·${L.xiuLuck || '平'}）命度${du.toFixed(1)}度${rel ? `·${REL_LABEL_XIU[rel]}` : ''}`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: (() => { const w = emptyWuxing(); w[xiu.wx] += 3; if (me) w[me] += 1; return w })(),
      timing: null,
      detail: {
        出生农历: `${L.leap ? '闰' : ''}${L.month}月${L.day}日 ${L.hourZhi}时（${L.text}）`,
        值宿: `${xiu.name}宿（${xiu.dir}方七宿之一，${xiu.wx}，${xiu.animal}，吉凶分 ${xiu.score}）`,
        命度: `${xiu.name}宿 ${du.toFixed(1)} 度（一宿 30 度、十二时辰均分，每时辰 2.5 度）`,
        宿曜: `${xiu.name}（禽${xiu.animal}）· 吉凶 ${L.xiuLuck || '—'} · 宿直 ${L.xiu}`,
        邻宿: `前一宿 ${prev.name}（${prev.score}）｜后一宿 ${next.name}（${next.score}）`,
        与日主: me ? `宿五行${xiu.wx}对日主${dayGan}（${me}）为「${REL_LABEL_XIU[rel] ?? rel}」` : '无四柱，略',
        断: score > 35 ? '值宿得地，命度吉，行事多助'
          : score < -25 ? '值宿失地，命度凶，宜守宜静' : '值宿中平，吉凶随运',
        说明: '值宿取历法库的二十八宿值日表（真实表）；「宿内度数」因无星历表，按十二时辰均分该宿的简化分法给出，非真实太阴躔度。',
      },
    }
  },

  // ── 56 称骨算命 ──
  chenggu(chart, entry, rand) {
    const ps = pillarsOf(chart)
    const L = birthLunar(chart)
    if (ps.length < 4 || !L) return null
    const yearGZ = ps[0]
    const yW = D.CG_YEAR[yearGZ]
    const mW = D.CG_MONTH[mod(L.month - 1, 12)]
    const dW = D.CG_DAY[mod(L.day - 1, 30)]
    const hIdx = ZHI.indexOf(L.hourZhi)
    const hW = hIdx >= 0 ? D.CG_HOUR[hIdx] : null
    if (yW === undefined || mW === undefined || dW === undefined || hW === undefined || hW === null) return null

    const total = Math.round((yW + mW + dW + hW) * 10) / 10
    const grade = D.CG_GRADE.find((g) => total <= g.max) ?? D.CG_GRADE[D.CG_GRADE.length - 1]
    const gIdx = D.CG_GRADE.indexOf(grade)
    // 骨重 2.1 最轻、7.2 最重：以中值 4.2 为平，映射到 -100..100
    let score = clamp((total - 4.2) * 42, -100, 100)
    if (gIdx >= 5) score += 8
    if (gIdx <= 1) score -= 8
    score = clamp(score, -100, 100)

    const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
    const liang = (v) => {
      const t = Math.round(v * 10)
      const l = Math.floor(t / 10); const q = t % 10
      if (l === 0) return `${CN[q] ?? q}钱`
      return `${CN[l] ?? l}两${q === 0 ? '' : `${CN[q] ?? q}钱`}`
    }

    return {
      score,
      essence: `骨重${liang(total)}（${grade.grade}）·年${liang(yW)}月${liang(mW)}日${liang(dW)}时${liang(hW)}`,
      keys: [`${liang(total)}`, grade.grade, `年${liang(yW)}`, `月${liang(mW)}`, `日${liang(dW)}`, `时${liang(hW)}`],
      wuxing: chart.birthChart.wuxing ?? emptyWuxing(),
      timing: null,
      detail: {
        总骨重: `${liang(total)}（${total.toFixed(1)} 两）`,
        四项骨重: `年 ${yearGZ} → ${liang(yW)}｜月 ${L.leap ? '闰' : ''}${L.month}月 → ${liang(mW)}｜日 ${L.day}日 → ${liang(dW)}｜时 ${L.hourZhi}时 → ${liang(hW)}`,
        断语分档: `${grade.grade} —— ${grade.gist}`,
        换算: '年/月/日/时骨重均取袁天罡称骨公开表（单位：两，0.1 两 = 一钱）',
        说明: '称骨歌 51 条断语原文（二两一至七两二）未内置，此处按总骨重给出分档等级与概述，概述为本插件编辑取值；骨重表本身为完整公开表。',
      },
    }
  },

  // ── 57 河洛命卦 ──
  heluoMingGua(chart, entry, rand) {
    const s = birthSolar(chart)
    if (!s) return null
    const yy = mod(s.y, 100)
    const male = chart.gender !== '女'
    // 男 (100 − 年后两位) % 9；女 (年后两位 + 5) % 9；余 0 作 9。2000 年后按通行世纪修正 +1。
    const century = s.y >= 2000 ? 1 : 0
    const raw = male ? (100 - yy - century) : (yy + 5 + century)
    let n = mod(raw, 9)
    if (n === 0) n = 9
    let gua = D.GUAS[n]
    let note = ''
    if (n === 5) {
      gua = male ? D.GUAS[2] : D.GUAS[8]
      note = `命卦得 5，${male ? '男寄坤' : '女寄艮'} → ${gua[0]}`
      n = male ? 2 : 8
    }
    const [gname, gwx, star] = gua
    const group = EAST_WEST.东四.includes(gname) ? '东四命' : '西四命'
    const zhai = D.ZHAI_BAYOU[gname] ?? null

    // 与求占年（流年）的关系：流年紫白九星（与命卦同源洛书数理）的吉凶 + 与命卦五行的生克
    const liuNianNum = (() => {
      const y = chart.solar.y
      const c = y >= 2000 ? 1 : 0
      let v = mod(100 - mod(y, 100) - c, 9)
      if (v === 0) v = 9
      return v
    })()
    const ls = NINE_STAR[liuNianNum - 1] ?? null
    const relLn = ls ? relation(gwx, ls.wx) : null
    let score = 30
    if (relLn) score += { 生我: 16, 比和: 12, 我克: 4, 我生: -4, 克我: -16 }[relLn] ?? 0
    score += { 大吉: 20, 吉: 12, 凶: -12, 大凶: -20 }[ls?.luck] ?? 0
    score = clamp(score, -100, 100)

    const keys = [`${gname}命`, group, star, `流年${ls?.name ?? ''}`]
    if (note) keys.push('寄宫')

    return {
      score,
      essence: `${male ? '男' : '女'}命${gname}卦（${gwx}）${group}·流年${ls?.name ?? '—'}${ls ? `(${ls.luck})` : ''}`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: (() => { const w = emptyWuxing(); w[gwx] += 3; if (ls) w[ls.wx] += 1; return w })(),
      timing: null,
      detail: {
        出生年: `${s.y} 年（年后两位 ${String(yy).padStart(2, '0')}）`,
        推算: male
          ? `男命 (100 − ${String(yy).padStart(2, '0')}${century ? ' − 1' : ''}) ÷ 9 取余 → ${n}${note ? `（${note}）` : ''}`
          : `女命 (${String(yy).padStart(2, '0')} + 5${century ? ' + 1' : ''}) ÷ 9 取余 → ${n}${note ? `（${note}）` : ''}`,
        命卦: `${gname}卦（五行${gwx}，九星${star}）`,
        东西四命: `${group} —— ${group === '东四命' ? '宜居东四宅（坎离震巽）' : '宜居西四宅（乾坤艮兑）'}`,
        吉方: zhai ? zhai.吉.join('、') : '—',
        凶方: zhai ? zhai.凶.join('、') : '—',
        流年九星: `${chart.solar.y} 年 ${ls?.name ?? '—'}（${ls?.luck ?? ''}·${ls?.wx ?? ''}）对命卦${gwx}为「${relLn ? (REL_LABEL[relLn] ?? relLn) : '—'}」`,
        说明: '命卦用三元命卦公开公式；2000 年及以后按通行的世纪修正（男 −1、女 +1）。流年取紫白年星（与命卦同一洛书数理），八宅吉凶方为公开通例。',
      },
    }
  },

  // ── 58 生肖命理 ──
  shengxiao(chart, entry, rand) {
    const ps = pillarsOf(chart)
    if (ps.length < 4) return null
    const yearZhi = ps[0][1]
    const dayZhi = ps[2][1]
    const animal = ZHI_ANIMAL[yearZhi] ?? '—'
    const liuZhi = chart.ganzhi.year ? chart.ganzhi.year[1] : ''
    const liuAnimal = ZHI_ANIMAL[liuZhi] ?? '—'

    // 与本命年的关系（刑冲合害一律用 core/kit.js 的共享表）
    const rels = []
    if (liuZhi === yearZhi) rels.push({ name: '值太岁', v: -14, note: '本命年，事多变动' })
    if (ZHI_LIUCHONG[yearZhi] === liuZhi) rels.push({ name: '冲太岁', v: -20, note: '岁破相冲，动荡最大' })
    if (xingWith(yearZhi, liuZhi)) rels.push({ name: yearZhi === liuZhi ? '自刑太岁' : '刑太岁', v: -10, note: '相刑，主口舌刑伤' })
    if (ZHI_XIANGHAI[yearZhi] === liuZhi) rels.push({ name: '害太岁', v: -8, note: '相害，主小人暗损' })
    if (ZHI_LIUHE[yearZhi] === liuZhi) rels.push({ name: '六合太岁', v: 16, note: '与太岁相合，得贵人助' })
    const sanhe = ZHI.filter((x) => x !== yearZhi && ZHI_SANHE[x] === ZHI_SANHE[yearZhi])
    if (sanhe.includes(liuZhi)) rels.push({ name: '三合太岁', v: 14, note: '与太岁三合，事顺有助' })

    let score = 20
    for (const r of rels) score += r.v
    // 日支与年支（自身根基）
    const selfRel = relation(ZHI_WUXING[dayZhi] ?? '土', ZHI_WUXING[yearZhi] ?? '土')
    score += { 生我: 12, 比和: 10, 我克: 4, 我生: -4, 克我: -12 }[selfRel] ?? 0
    // 生肖五行在命局中的力量
    const A = analyzeBazi(chart)
    if (A) {
      const zw = ZHI_WUXING[yearZhi] ?? '土'
      score += (A.pct[zw] - 20) * 0.4
    }
    score = clamp(score, -100, 100)

    const keys = [`${animal}年生`, `流年${liuAnimal}`]
    if (rels.length > 0) keys.push(...rels.slice(0, 2).map((r) => r.name))
    else keys.push('不犯太岁')
    keys.push(`日支${dayZhi}`)

    return {
      score,
      essence: `${animal}年命·流年${liuZhi}(${liuAnimal})·${rels.length > 0 ? rels.map((r) => r.name).join('/') : '与太岁无刑冲合害'}`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: (() => { const w = emptyWuxing(); w[ZHI_WUXING[yearZhi] ?? '土'] += 2; w[ZHI_WUXING[dayZhi] ?? '土'] += 2; return w })(),
      timing: `${chart.solar.y} 年（${liuZhi}年）`,
      detail: {
        本命生肖: `${yearZhi}（${animal}），年柱 ${ps[0]}，纳音 ${nayinOf(ps[0])}`,
        流年: `${chart.ganzhi.year}（${liuAnimal}年）`,
        太岁关系: rels.length > 0 ? rels.map((r) => `${r.name}（${r.v >= 0 ? '+' : ''}${r.v}）：${r.note}`) : ['与太岁无值冲刑害合'],
        日支: `${dayZhi}（${ZHI_ANIMAL[dayZhi] ?? '—'}）对年支为「${selfRel}」`,
        三合六合: `三合 ${sanhe.join('、') || '—'}｜六合 ${ZHI_LIUHE[yearZhi] ?? '—'}｜相冲 ${ZHI_LIUCHONG[yearZhi] ?? '—'}｜相害 ${ZHI_XIANGHAI[yearZhi] ?? '—'}`,
        说明: '生肖吉凶只看年支与流年支的刑冲合害（公开通例），须与八字格局、紫微限运合参，不可单断。',
      },
    }
  },
}

export default engines
