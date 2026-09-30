/**
 * 方法模块 · 三式 + 六壬（16 条 → 12 引擎）
 *
 * 契约见 src/core/runner.js 顶部注释；结构与代码风格照 src/methods/yijing.js。
 * 私有表在 ./data/sanshi.js。
 *
 * ## 本模块共用的起盘口径（写在明处，便于核对与按师承修改）
 *
 * **奇门遁甲**
 * - 阴阳遁：以 `chart.jieqi.prev` 落在二十四节气环的冬至→芒种段为阳遁，夏至→大雪段为阴遁。
 * - 局数：节气三元局数表（上中下元）；元由**符头**定——符头 = 最近的甲/己日，
 *   符头支属子午卯酉为上元、寅申巳亥为中元、辰戌丑未为下元。
 * - 地盘：戊己庚辛壬癸丁丙乙 自局数宫起，阳遁顺飞九宫、阴遁逆飞九宫。
 * - 值符随时干、值使随时宫：值符 = 旬首所遁之仪所在地盘宫的本位星；值符落时干宫；
 *   值使门自其本位宫起，按阳顺阴逆数「本干支在旬中的序数」。
 * - 转盘沿洛书八宫顺时针环旋转（含天禽寄坤）；飞盘按宫数 1→9 飞布。
 * - 中五宫无门，寄坤二宫（转盘）。
 * - **未做超接置闰**：符头与节气的超神/接气只在 detail 里标出，不据此调局。
 *
 * **大六壬**
 * - 月将 = 中气换将（`YUEJIANG_BY_JIEQI`），天地盘 = 月将加占时。
 * - 四课 = 干寄宫上神、干上之上神、日支上神、支上之上神。
 * - 三传按九宗门取，判断次序：伏吟 → 返吟 → 贼克（含比用、涉害）→ 八专 → 遥克 → 别责 → 昴星。
 *   · 贼克：先看下贼上（重审），无则看上克下（元首）；同类多处者先比用（知一）、再涉害。
 *   · 八专：干支同位、四课只两课且无克（歌诀「两课无克号八专，有克仍归比涉门」，八专不看遥克）。
 *   · 别责：四课不全只有三课且无克无遥（歌诀「四课不全三课备，无克无遥别责是」）；
 *     阳日取干合之神的上神、阴日取日支三合前一位（连身顺数至第五位），中末俱取干上神。
 *   · 昴星：四课全备无克无遥，「刚日先辰而后日，柔日先日而后辰」。
 * - 涉害深浅 = 自所临地盘位顺数至本家，计途中克我之支数；深浅相同则取临四孟者，
 *   再同比用，最后阳日取干上神、阴日取支上神（复等时的收束法，各家略异）。
 * - 十二天将：昼（阳）贵 / 夜（阴）贵 由日干定（`GUIREN`，第一个为昼贵），
 *   卯至申为昼、酉至寅为夜；贵人临地盘亥子丑寅卯辰顺布、临巳午未申酉戌逆布。
 *
 * **太乙神数**
 * - 太乙宫：积年（上元积年通行值 + 公元年）÷ 24，每宫三年、行八宫不入中五。
 * - 计神：自寅起顺行十二辰，一年一移。
 * - 始击（客目）、主客大将/参将、主客算的完整起例诸本互异，本插件按公开可推部分计算，
 *   并在 detail 中写明；`taiyiJi` 因此标 approx。
 *
 * **中六壬**：用《中六壬天罡掌诀》——农历月上起日、日上起时、时上退一位起天罡，
 * 视十将第八/九/十（登明孟、神后仲、大吉季）落于子午卯酉何位定断。
 *
 * ## 三条硬约束
 * 纯函数（时刻一律取自 chart）／绝不抛异常（算不出返回 null）／不用 Math.random（随机走 rand）。
 */

import {
  GAN, ZHI, GAN_WUXING, ZHI_WUXING, GAN_YANG, ZHI_YANG, ZHI_CANGGAN,
  relation, wangShuai, xunOf, tenGodOf, shenShaOf,
  clamp, emptyWuxing, mod,
} from '../core/kit.js'
import {
  JIEQI_RING, YUEJIANG_BY_JIEQI, JIANG_NAME,
  QIMEN_JU, JIUXING, BAMEN, BASHEN, RING8, PALACE_INFO,
  MEN_WX, XING_WX, MEN_LUCK, XING_LUCK, SHEN_LUCK, QIMEN_GEJU,
  SANQI, XUN_DUN, XUN_HEAD,
  JIGONG, WUHE, XING, SI_MENG, SI_ZHONG, SI_JI,
  JIANG12, GUIREN, ZHOU_HOURS, SHUN_GONG, KETI,
  TAIYI_RING, TAIYI_YUAN, GONG_ZHI, GONG_16SHEN, TAIYI_YANG_GONG,
  LIU_GONG, ZLR_MONTH_START, ZLR_JIANG10, ZLR_SANWEI, ZLR_DUAN, ZLR_TOPIC,
  WUSHU_DUN,
} from './data/sanshi.js'

// ═════════════════════════ 通用小工具 ═════════════════════════

/**
 * 干支 → 六十甲子序号（0..59）。
 * @param {string} gz 干支两字。
 * @returns {number} 序号；无法解析时 0。
 */
function gzIdx60(gz) {
  if (typeof gz !== 'string' || gz.length < 2) return 0
  const gi = GAN.indexOf(gz[0])
  const zi = ZHI.indexOf(gz[1])
  if (gi < 0 || zi < 0) return 0
  for (let i = 0; i < 60; i += 1) if (i % 10 === gi && i % 12 === zi) return i
  return 0
}

/** 支 → 五行（缺省土）。 */
const wxOf = (z) => ZHI_WUXING[z] ?? '土'
/** 支是否属阳。 */
const isYangZhi = (z) => ZHI_YANG[z] === true
/** 干是否属阳。 */
const isYangGan = (g) => GAN_YANG[g] === true

/**
 * 取「盘上用的干」：甲不独立，隐于旬首所遁之仪（甲子隐戊、甲戌隐己…）。
 * @param {string} gz 干支。
 * @returns {string} 用于地盘寻宫的干。
 */
function panGanOf(gz) {
  const gan = (gz ?? '')[0] ?? ''
  if (gan !== '甲') return gan
  return XUN_DUN[XUN_HEAD[Math.floor(gzIdx60(gz) / 10)] ?? '甲子'] ?? '戊'
}

/** 地支六合（月将兜底用）。 */
const LIUHE = { 子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯', 辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午' }

/**
 * 月将：中气换将。以当前所处节气查表，查不到时退回「月建六合」。
 * @param {object} chart 盘基。
 * @returns {string} 月将地支。
 */
function yueJiangOf(chart) {
  const jq = chart?.jieqi?.prev ?? ''
  const hit = YUEJIANG_BY_JIEQI[jq]
  if (hit) return hit
  return LIUHE[chart?.monthZhi ?? '子'] ?? '亥'
}

/**
 * 拼一行「九宫盘」文本。
 * @param {object} map 宫 → 值。
 * @param {string} [suffix] 每格后缀。
 * @returns {string[]} 九行文本。
 */
function palaceLines(map) {
  const out = []
  for (let g = 1; g <= 9; g += 1) out.push(`${g}宫${PALACE_INFO[g].gua}(${PALACE_INFO[g].dir}) ${map[g] ?? '—'}`)
  return out
}

/** 去重并截到 6 个 key。 */
const uniqKeys = (arr) => [...new Set(arr.filter((k) => typeof k === 'string' && k.length > 0))].slice(0, 6)

// ═════════════════════════ 奇门遁甲 ═════════════════════════

/**
 * 奇门定局：节气定阴阳遁与局数，日干支定符头与三元。
 * @param {object} chart 盘基。
 * @param {'时'|'日'|'月'|'年'} scale 起局基准。
 * @returns {object|null} 定局结果。
 */
function qimenDingJu(chart, scale) {
  const jieqi = chart?.jieqi?.prev ?? ''
  const ri = JIEQI_RING.indexOf(jieqi)
  // 阴阳遁：节气环前 12 个为阳遁；无节气时按「子月至巳月为阳」兜底。
  const yang = ri >= 0 ? ri < 12 : ['子', '丑', '寅', '卯', '辰', '巳'].includes(chart?.monthZhi)

  // 符头：最近的甲/己日
  const dayIdx = gzIdx60(chart?.ganzhi?.day ?? '甲子')
  const fuIdx = Math.floor(dayIdx / 5) * 5
  const fuZhi = ZHI[fuIdx % 12]
  const yuanByFu = SI_ZHONG.includes(fuZhi) ? 0 : SI_MENG.includes(fuZhi) ? 1 : 2
  // 月家/年家取该节气上元（冷门法，公开简法）
  const yuan = (scale === '月' || scale === '年') ? 0 : yuanByFu
  const yuanName = ['上元', '中元', '下元'][yuan]

  const table = QIMEN_JU[jieqi]
  const ju = table ? table[yuan] : 1

  // 超神 / 接气 / 正授：比较符头日与节气日（只作标注，不据此调局）
  let chaJie = '—'
  const jqAt = String(chart?.jieqi?.prevAt ?? '').slice(0, 10)
  if (jqAt) {
    const back = dayIdx - fuIdx
    const d = new Date(chart.solar.y, chart.solar.m - 1, chart.solar.d)
    d.setDate(d.getDate() - back)
    const fuAt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    chaJie = fuAt < jqAt ? `超神（符头${fuAt}先于节气${jqAt}）`
      : fuAt > jqAt ? `接气（符头${fuAt}后于节气${jqAt}）`
        : `正授（符头与节气同日${fuAt}）`
  }

  return {
    jieqi: jieqi || '（未得节气，按兜底起局）',
    yang,
    ju,
    yuan,
    yuanName,
    fuTou: `${GAN[fuIdx % 10]}${fuZhi}`,
    fuTouIdx: fuIdx,
    chaJie,
    scale,
  }
}

/**
 * 排奇门盘（地盘三奇六仪 / 天盘九星 / 八门 / 八神 / 值符值使）。
 * @param {object} chart 盘基。
 * @param {'时'|'日'|'月'|'年'} scale 基准。
 * @param {'转盘'|'飞盘'} pan 盘式。
 * @returns {object|null} 盘。
 */
function qimenPan(chart, scale, pan) {
  const dj = qimenDingJu(chart, scale)
  if (!dj) return null
  const { yang, ju, yuanName } = dj
  const dir = yang ? 1 : -1
  const jiGong = (g) => (g === 5 ? 2 : g) // 中五宫寄坤二宫

  // 地盘三奇六仪：戊己庚辛壬癸丁丙乙，自局数宫起，阳顺阴逆
  const SEQ = ['戊', '己', '庚', '辛', '壬', '癸', '丁', '丙', '乙']
  const diGan = {}
  const ganGong = {}
  SEQ.forEach((g, k) => {
    const p = mod(ju - 1 + dir * k, 9) + 1
    diGan[p] = g
    ganGong[g] = p
  })

  // 基准干支
  const gzTable = { 时: chart.ganzhi.hour, 日: chart.ganzhi.day, 月: chart.ganzhi.month, 年: chart.ganzhi.year }
  const scaleGZ = gzTable[scale] ?? chart.ganzhi.hour
  const sIdx = gzIdx60(scaleGZ)
  const xunHeadIdx = Math.floor(sIdx / 10)
  const xunHead = XUN_HEAD[xunHeadIdx] ?? '甲子'
  const step = sIdx - xunHeadIdx * 10
  const fuShouGan = XUN_DUN[xunHead] ?? '戊'
  const fuShouGong = ganGong[fuShouGan] ?? 1
  const yongGan = panGanOf(scaleGZ)
  const yongGong = ganGong[yongGan] ?? 1

  const zhiFuXing = JIUXING[fuShouGong] ?? '天禽'
  const zhiShiMen = BAMEN[jiGong(fuShouGong)] ?? '死门'

  // 天盘九星 + 天盘干
  const fei = pan === '飞盘'
  const ringX = fei ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : RING8
  const kSrc = ringX.indexOf(fei ? fuShouGong : jiGong(fuShouGong))
  const kDst = ringX.indexOf(fei ? yongGong : jiGong(yongGong))
  const dK = kDst - kSrc
  const tianXing = {}
  const tianGan = {}
  const xingFu = {}
  for (let k = 0; k < ringX.length; k += 1) {
    const g = ringX[k]
    const kg = ringX[mod(k - dK, ringX.length)]
    tianXing[g] = JIUXING[kg]
    tianGan[g] = diGan[kg]
    if (JIUXING[kg] === '天芮') xingFu[g] = '天禽' // 天禽寄天芮
  }
  if (!fei) { tianXing[5] = '天禽'; tianGan[5] = diGan[5] }

  // 八门：值使门自本位宫起，按阳顺阴逆数旬内序数
  const ringM = fei ? [1, 2, 3, 4, 6, 7, 8, 9] : RING8
  const kMBase = ringM.indexOf(jiGong(fuShouGong))
  const kMLuo = mod(kMBase + dir * step, 8)
  const dM = kMLuo - kMBase
  const tianMen = {}
  for (let k = 0; k < 8; k += 1) {
    tianMen[ringM[k]] = BAMEN[ringM[mod(k - dM, 8)]]
  }
  const zhiShiGong = ringM[kMLuo]

  // 八神：自值符落宫起，阳顺阴逆
  const kS = ringM.indexOf(jiGong(yongGong))
  const tianShen = {}
  for (let k = 0; k < 8; k += 1) {
    tianShen[ringM[k]] = BASHEN[mod(dir * (k - kS), 8)]
  }

  return {
    ...dj, pan, diGan, ganGong, tianGan, tianXing, tianMen, tianShen, xingFu,
    fuShouGan, fuShouGong, xunHead, step, scaleGZ, yongGan, yongGong,
    zhiFuXing, zhiShiMen, zhiShiGong, jiGong, dir,
  }
}

/**
 * 读一宫的星门神干。
 * @param {object} p 奇门盘。
 * @param {number} g 宫数。
 * @returns {object} 该宫读数。
 */
function readPalace(p, g) {
  const info = PALACE_INFO[g] ?? PALACE_INFO[5]
  return {
    g,
    men: p.tianMen[g] ?? null,
    xing: p.tianXing[g] ?? null,
    shen: p.tianShen[g] ?? null,
    gan: p.tianGan[g] ?? null,
    diGan: p.diGan[g] ?? null,
    wx: info.wx,
    gua: info.gua,
    dir: info.dir,
  }
}

/**
 * 单宫吉凶打分（门、星、神、三奇、十干克应、门宫生克）。
 * @param {object} r 宫读数。
 * @returns {{s:number, keys:string[], geju:string|null}} 分与关键词。
 */
function palaceScore(r) {
  let s = 0
  const keys = []
  s += (MEN_LUCK[r.men] ?? 0) * 0.30
  s += (XING_LUCK[r.xing] ?? 0) * 0.24
  s += (SHEN_LUCK[r.shen] ?? 0) * 0.18

  if (SANQI.includes(r.gan)) { s += 16; keys.push('三奇临宫') }
  if (r.gan === '庚') { s -= 14; keys.push('庚临宫') }
  if (SANQI.includes(r.gan) && ['开门', '休门', '生门'].includes(r.men)) { s += 18; keys.push('三奇得使') }

  if (r.men) {
    const rel = relation(MEN_WX[r.men] ?? '土', r.wx)
    if (rel === '我克') { s -= 16; keys.push('门迫') }
    else if (rel === '克我') { s -= 10; keys.push('门制') }
    else if (rel === '生我') { s += 10; keys.push('宫生门') }
    else if (rel === '我生') { s -= 4; keys.push('门泄气') }
    else { s += 5; keys.push('门宫比和') }
  }

  const geju = QIMEN_GEJU[`${r.gan}${r.diGan}`] ?? null
  if (geju) { s += geju.score * 0.45; keys.push(geju.name) }
  if (r.gan && r.gan === r.diGan) { s -= 12; keys.push('伏吟格') }

  return { s, keys, geju: geju?.name ?? null }
}

/** 奇门用神取法（人 = 日干宫，事 = 基准干宫）。 */
function qimenYong(chart, p, scale) {
  const gzTable = { 时: chart.ganzhi.hour, 日: chart.ganzhi.day, 月: chart.ganzhi.month, 年: chart.ganzhi.year }
  const shiGZ = gzTable[scale] ?? chart.ganzhi.hour
  const shiGong = p.ganGong[panGanOf(shiGZ)] ?? 1
  const renGong = p.ganGong[panGanOf(chart.ganzhi.day)] ?? 1
  return { shiGZ, shiGong, renGong }
}

// ═════════════════════════ 大六壬 ═════════════════════════

/**
 * 取三传（九宗门）。
 * @param {object} chart 盘基。
 * @param {Array<{up:string,down:string}>} ke 四课。
 * @param {object} tian 地盘支 → 天盘支。
 * @param {object} diOf 天盘支 → 地盘支。
 * @param {string} yuejiang 月将。
 * @param {string} shi 占时支。
 * @returns {{chuan:string[], keti:string, ketiNote:string, trace:string[]}} 三传与课体。
 */
function sanChuanOf(chart, ke, tian, diOf, yuejiang, shi) {
  const dayGan = chart.dayGan
  const dayZhi = chart.dayZhi
  const yang = isYangGan(dayGan)
  const trace = []

  // 上下贼克
  const zei = []
  const kes = []
  for (let i = 0; i < 4; i += 1) {
    const { up, down } = ke[i]
    if (relation(wxOf(down), wxOf(up)) === '我克') zei.push(i)
    else if (relation(wxOf(up), wxOf(down)) === '我克') kes.push(i)
  }
  trace.push(`贼克：下贼上 ${zei.length ? zei.map((i) => i + 1).join(',') : '无'}；上克下 ${kes.length ? kes.map((i) => i + 1).join(',') : '无'}`)

  /** 比用：取与日干阴阳相同者（知一课）。 */
  const biYong = (cands) => {
    const same = cands.filter((i) => isYangZhi(ke[i].up) === yang)
    return same.length === 1 ? same[0] : null
  }
  /** 涉害：数归本家途中所受之克，深者取；再取临四孟者。 */
  const sheHai = (cands) => {
    const depth = cands.map((i) => {
      const up = ke[i].up
      const start = ZHI.indexOf(ke[i].down)
      let steps = mod(ZHI.indexOf(up) - start, 12)
      if (steps === 0) steps = 12
      let cnt = 0
      for (let s = 1; s <= steps; s += 1) {
        if (relation(wxOf(ZHI[mod(start + s, 12)]), wxOf(up)) === '我克') cnt += 1
      }
      return { i, cnt }
    })
    const max = Math.max(...depth.map((d) => d.cnt))
    let top = depth.filter((d) => d.cnt === max).map((d) => d.i)
    trace.push(`涉害：${depth.map((d) => `第${d.i + 1}课${d.cnt}重`).join(' ')}`)
    if (top.length > 1) {
      for (const grp of [SI_MENG, SI_ZHONG, SI_JI]) {
        const f = top.filter((i) => grp.includes(ke[i].down))
        if (f.length === 1) return f[0]
        if (f.length > 1) { top = f; break }
      }
    }
    if (top.length === 1) return top[0]
    const by = biYong(top)
    if (by !== null) return by
    return yang ? 0 : 2
  }
  /** 从候选里定一课，并回报所用的法（贼克 / 比用 / 涉害）。 */
  const pickFrom = (cands) => {
    if (cands.length === 1) return { idx: cands[0], method: '贼克' }
    const by = biYong(cands)
    if (by !== null) return { idx: by, method: '比用' }
    return { idx: sheHai(cands), method: '涉害' }
  }
  /** 三传递传：中传取初传上神，末传取中传上神。 */
  const chain3 = (c1) => [c1, tian[c1], tian[tian[c1]]]
  /** 四课中不同上神之数：4 = 全备，3 = 不全（别责），2 = 只两课（八专）。 */
  const distinct = new Set(ke.map((k) => k.up)).size

  // 课体前提：伏吟（天地盘同）、返吟（天地盘冲）
  const fuYin = yuejiang === shi
  const fanYin = mod(ZHI.indexOf(yuejiang) - ZHI.indexOf(shi), 12) === 6

  if (fuYin) {
    if (zei.length > 0 || kes.length > 0) {
      const { idx } = pickFrom(zei.length > 0 ? zei : kes)
      const c1 = ke[idx].up
      const c2 = XING[c1] ?? c1
      const c3 = XING[c2] ?? c2
      trace.push('伏吟有克：取克为初传，中末递取初传、中传之刑')
      return { chuan: [c1, c2, c3], keti: '伏吟', ketiNote: '伏吟有克（自任/自信），事体静而不动，得克方有转机', trace }
    }
    const c1 = yang ? ke[0].up : ke[2].up
    let c2 = XING[c1] ?? c1
    if (c2 === c1) c2 = ke[2].up
    let c3 = XING[c2] ?? c2
    if (c3 === c2) c3 = ZHI[mod(ZHI.indexOf(c2) + 6, 12)]
    trace.push(`伏吟无克：无克刚干柔取辰，${yang ? '阳日取干上神' : '阴日取支上神'}为初传，中末递取其刑`)
    return { chuan: [c1, c2, c3], keti: '伏吟', ketiNote: '伏吟无克（自任/自信），天地不动，事主迟滞呻吟', trace }
  }

  if (fanYin) {
    if (zei.length > 0 || kes.length > 0) {
      const { idx } = pickFrom(zei.length > 0 ? zei : kes)
      trace.push('返吟有克：仍取克为初传，中末递传')
      return { chuan: chain3(ke[idx].up), keti: '返吟', ketiNote: '返吟有克，天地相冲而有所制，事有反复终可解', trace }
    }
    const ma = shenShaOf('驿马', dayZhi) ?? '寅'
    trace.push(`返吟无亲：初取驿马${ma}，中取支上神、末取干上神`)
    return { chuan: [ma, ke[2].up, ke[0].up], keti: '返吟', ketiNote: '返吟无亲（井栏射），天地皆冲，事无依靠、多反复', trace }
  }

  if (zei.length > 0) {
    const { idx, method } = pickFrom(zei)
    const sub = method === '贼克' ? '重审（一下贼上，事起于下）' : `${method}（下贼上者众）`
    trace.push(`下贼上${zei.length}处，以${method}法定第${idx + 1}课`)
    return { chuan: chain3(ke[idx].up), keti: method, ketiNote: `${method}·${sub}`, trace }
  }
  if (kes.length > 0) {
    const { idx, method } = pickFrom(kes)
    const sub = method === '贼克' ? '元首（一上克下，事起于上）' : `${method}（上克下者众）`
    trace.push(`上克下${kes.length}处，以${method}法定第${idx + 1}课`)
    return { chuan: chain3(ke[idx].up), keti: method, ketiNote: `${method}·${sub}`, trace }
  }

  // 八专：干支同位、四课只两课且无克（歌诀「两课无克号八专，有克仍归比涉门」，八专不看遥克）
  if (distinct === 2) {
    const ganShang = ke[0].up
    const c1 = yang
      ? ZHI[mod(ZHI.indexOf(ganShang) + 2, 12)]
      : ZHI[mod(ZHI.indexOf(ke[3].up) - 2, 12)]
    trace.push(`八专法：干支同位、四课只两课且无克（八专不看遥克）。${yang ? `阳日自干上神${ganShang}连身顺数三位` : `阴日自第四课上神${ke[3].up}连身逆数三位`}得初传${c1}，中末俱取干上神${ganShang}`)
    return { chuan: [c1, ganShang, ganShang], keti: '八专', ketiNote: '八专课，干支同位、四课只两课，事多重叠纠缠；阴私之神入传为「帷薄不修」', trace }
  }

  // 无上下克 → 遥克
  const dayWx = GAN_WUXING[dayGan]
  const yaoKe = [0, 1, 2, 3].filter((i) => relation(wxOf(ke[i].up), dayWx) === '我克')
  const yaoKe2 = [0, 1, 2, 3].filter((i) => relation(dayWx, wxOf(ke[i].up)) === '我克')
  if (yaoKe.length > 0 || yaoKe2.length > 0) {
    const cands = yaoKe.length > 0 ? yaoKe : yaoKe2
    const idx = cands.length === 1 ? cands[0] : (biYong(cands) ?? cands[0])
    trace.push(`遥克法：${yaoKe.length > 0 ? '上神克日干' : '日干克上神'}者${cands.length}处，取第${idx + 1}课`)
    return { chuan: chain3(ke[idx].up), keti: '遥克', ketiNote: `遥克（${yaoKe.length > 0 ? '蒿矢' : '弹射'}），事隔他方，缓而不亲`, trace }
  }

  // 别责：四课不全只有三课，且无克无遥
  if (distinct === 3) {
    const ganShang = ke[0].up
    if (yang) {
      const heGan = WUHE[dayGan] ?? '己'
      const c1 = tian[JIGONG[heGan] ?? '未']
      trace.push(`别责法：四课不全（三课备）、无克无遥。阳日取干合之神（${dayGan}合${heGan}，${heGan}寄${JIGONG[heGan]}）上神${c1}为初传，中末俱取干上神${ganShang}`)
      return { chuan: [c1, ganShang, ganShang], keti: '别责', ketiNote: '别责课（芜淫），四课不全只有三课、事不由己，须借力他方', trace }
    }
    const c1 = ZHI[mod(ZHI.indexOf(dayZhi) + 4, 12)]
    trace.push(`别责法：四课不全（三课备）、无克无遥。阴日取日支${dayZhi}三合前一位${c1}（连身顺数至第五位）为初传，中末俱取干上神${ganShang}`)
    return { chuan: [c1, ganShang, ganShang], keti: '别责', ketiNote: '别责课（芜淫），四课不全只有三课、事不由己，须借力他方', trace }
  }

  // 昴星：四课全备而无克无遥。刚日先辰而后日，柔日先日而后辰。
  if (yang) {
    trace.push('昴星法：四课全备而无克无遥。阳日「虎视」取地盘酉上神为初传；刚日先辰而后日，中取支上神、末取干上神')
    return { chuan: [tian['酉'], ke[2].up, ke[0].up], keti: '昴星', ketiNote: '昴星·虎视，事多暗昧而机在外', trace }
  }
  trace.push('昴星法：四课全备而无克无遥。阴日「冬蛇掩目」取天盘酉所临地盘支为初传；柔日先日而后辰，中取干上神、末取支上神')
  return { chuan: [diOf['酉'], ke[0].up, ke[2].up], keti: '昴星', ketiNote: '昴星·冬蛇掩目，事多暗昧而机在内', trace }
}

/**
 * 布十二天将。
 * @param {object} chart 盘基。
 * @param {object} diOf 天盘支 → 地盘支。
 * @returns {object|null} 将盘。
 */
function jiangPanOf(chart, diOf) {
  const dayGan = chart?.dayGan ?? ''
  const gr = GUIREN[dayGan]
  if (!gr) return null
  const shi = chart.hourZhi || '子'
  const isZhou = ZHOU_HOURS.includes(shi)
  const guiren = isZhou ? gr[0] : gr[1]
  const diGong = diOf[guiren] ?? guiren
  const shun = SHUN_GONG.includes(diGong)
  const gi = ZHI.indexOf(guiren)
  const at = {}
  for (let k = 0; k < 12; k += 1) at[ZHI[mod(gi + (shun ? k : -k), 12)]] = JIANG12[k]
  return { guiren, isZhou, diGong, shun, at, dayGan, shi }
}

/**
 * 起大六壬盘（天地盘 / 四课 / 三传 / 十二将）。
 * @param {object} chart 盘基。
 * @returns {object|null} 盘。
 */
function liurenPan(chart) {
  const dayGan = chart?.dayGan ?? ''
  const dayZhi = chart?.dayZhi ?? ''
  if (!dayGan || !dayZhi) return null
  const shi = chart.hourZhi || '子'
  const yuejiang = yueJiangOf(chart)
  const t = ZHI.indexOf(shi)
  const j = ZHI.indexOf(yuejiang)

  const tian = {}
  const diOf = {}
  for (let e = 0; e < 12; e += 1) {
    const v = ZHI[mod(j + (e - t), 12)]
    tian[ZHI[e]] = v
    diOf[v] = ZHI[e]
  }

  const jg = JIGONG[dayGan] ?? '寅'
  const ke = [
    { down: jg, up: tian[jg] },
    { down: tian[jg], up: tian[tian[jg]] },
    { down: dayZhi, up: tian[dayZhi] },
    { down: tian[dayZhi], up: tian[tian[dayZhi]] },
  ]

  const sc = sanChuanOf(chart, ke, tian, diOf, yuejiang, shi)
  const jp = jiangPanOf(chart, diOf)
  const chuan = sc.chuan

  // 三传附加信息
  const kong = chart?.xunKong?.day ?? ''
  const chuanInfo = chuan.map((z, i) => {
    const cg = ZHI_CANGGAN[z] ?? []
    const jiang = jp?.at?.[z]
    return {
      pos: ['初传', '中传', '末传'][i],
      zhi: z,
      wx: wxOf(z),
      jiang: jiang?.name ?? '—',
      jiangWx: jiang?.wx ?? '—',
      jiangLuck: jiang?.luck ?? 0,
      kong: kong.includes(z),
      god: cg.length > 0 ? tenGodOf(dayGan, cg[0]) : '—',
      name: JIANG_NAME[z] ?? '',
      ws: wangShuai(wxOf(z), chart.monthWx),
    }
  })

  return {
    shi, yuejiang, yuejiangName: JIANG_NAME[yuejiang] ?? '', tian, diOf, ke, chuan,
    keti: sc.keti, ketiNote: sc.ketiNote, trace: sc.trace, jp, chuanInfo, kong,
    dayGan, dayZhi, jg,
    fuYin: yuejiang === shi,
    fanYin: mod(j - t, 12) === 6,
  }
}

/** 四课文本。 */
function keLines(p) {
  const names = ['第一课（干上）', '第二课（干上之上）', '第三课（支上）', '第四课（支上之上）']
  return p.ke.map((k, i) => `${names[i]}：${k.up} 临 ${k.down}`)
}

/** 天地盘文本（地盘支 → 天盘支）。 */
function tianPanLines(p) {
  const out = []
  for (let i = 0; i < 12; i += 1) {
    const e = ZHI[i]
    out.push(`${e}→${p.tian[e]}${p.jp?.at?.[p.tian[e]] ? `(${p.jp.at[p.tian[e]].name})` : ''}`)
  }
  return out
}

/**
 * 三传生克结构（递生/递克/合局/会局/空亡/旺衰）。
 * @param {object} chart 盘基。
 * @param {object} p 六壬盘。
 * @returns {object} 结构分与关键词。
 */
function chuanStructure(chart, p) {
  const [c1, c2, c3] = p.chuan
  const w = [wxOf(c1), wxOf(c2), wxOf(c3)]
  let s = 0
  const keys = []
  const notes = []

  if (relation(w[0], w[1]) === '我生' && relation(w[1], w[2]) === '我生') { s += 22; keys.push('三传递生'); notes.push('初生中、中生末，事体顺遂有接续') }
  if (relation(w[0], w[1]) === '我克' && relation(w[1], w[2]) === '我克') { s -= 18; keys.push('三传递克'); notes.push('初克中、中克末，层层相制') }
  if (relation(w[2], w[0]) === '我生' || relation(w[2], w[0]) === '生我') { s += 6; notes.push('首尾相生，事有回护') }

  const sanhe = ZHI_SANHE_EQ(c1, c2, c3)
  if (sanhe) { s += 18; keys.push('三传合局'); notes.push(`三传会成${sanhe}局，事体归一`) }
  const sanhui = ZHI_SANHUI_EQ(c1, c2, c3)
  if (sanhui) { s += 15; keys.push('三传会局'); notes.push(`三传会成${sanhui}方，气势偏聚`) }
  if (w[0] === w[1] && w[1] === w[2]) { s += 10; keys.push('三传一气'); notes.push(`三传同属${w[0]}，气专`) }

  const ws = wangShuai(w[0], chart.monthWx)
  s += (ws.score - 55) * 0.35
  notes.push(`初传${c1}(${w[0]})${ws.state}`)

  if (p.chuanInfo[0].kong) { s -= 26; keys.push('初传空亡'); notes.push('初传落空，发用无力') }
  else if (p.chuanInfo[1].kong || p.chuanInfo[2].kong) { s -= 10; keys.push('中末空亡'); notes.push('中末传空，后段虚耗') }

  return { s, keys, notes }
}

/** 三支是否同属一个三合局。 */
function ZHI_SANHE_EQ(a, b, c) {
  const j = { 申: '水', 子: '水', 辰: '水', 亥: '木', 卯: '木', 未: '木', 寅: '火', 午: '火', 戌: '火', 巳: '金', 酉: '金', 丑: '金' }
  return j[a] && j[a] === j[b] && j[b] === j[c] ? j[a] : null
}
/** 三支是否同属一个三会方局。 */
function ZHI_SANHUI_EQ(a, b, c) {
  const j = { 寅: '木', 卯: '木', 辰: '木', 巳: '火', 午: '火', 未: '火', 申: '金', 酉: '金', 戌: '金', 亥: '水', 子: '水', 丑: '水' }
  return j[a] && j[a] === j[b] && j[b] === j[c] ? j[a] : null
}

/** 三传与日干的关系分（以日干为我）。 */
const DAY_REL_SCORE = { 生我: 26, 比和: 16, 我克: 12, 我生: -8, 克我: -30 }

// ═════════════════════════ 太乙神数 ═════════════════════════

/**
 * 起太乙盘。
 * @param {object} chart 盘基。
 * @returns {object|null} 盘。
 */
function taiyiPan(chart) {
  const year = chart?.solar?.y
  if (!Number.isFinite(year)) return null
  const ji = TAIYI_YUAN + year
  const cyc = mod(ji, 24)
  const gongIdx = Math.floor(cyc / 3)
  const ruNian = (cyc % 3) + 1
  const gong = TAIYI_RING[gongIdx]
  const jiShen = ZHI[mod(2 + ji, 12)]
  const taiSui = chart.yearZhi || '子'
  const shiJiIdx = (gongIdx + 4) % 8
  const shiJi = TAIYI_RING[shiJiIdx]
  const zhuDa = TAIYI_RING[(gongIdx + 3) % 8]
  const zhuCan = TAIYI_RING[(gongIdx + 6) % 8]
  const keDa = TAIYI_RING[(shiJiIdx + 3) % 8]
  const keCan = TAIYI_RING[(shiJiIdx + 6) % 8]

  const step = (from, to) => {
    const d = mod(ZHI.indexOf(to) - ZHI.indexOf(from), 12)
    return d === 0 ? 12 : d
  }
  const zhuSuan = step(GONG_ZHI[gong], jiShen)
  const keSuan = step(GONG_ZHI[shiJi], jiShen)

  return {
    year, ji, gong, gongIdx, ruNian, jiShen, taiSui, shiJi,
    zhuDa, zhuCan, keDa, keCan, zhuSuan, keSuan,
    gongZhi: GONG_ZHI[gong], shiJiZhi: GONG_ZHI[shiJi],
    gongShen: GONG_16SHEN[gong] ?? '—', shiJiShen: GONG_16SHEN[shiJi] ?? '—',
    yangGong: TAIYI_YANG_GONG.includes(gong),
  }
}

/** 太乙盘文本。 */
function taiyiLines(p) {
  return [
    `太乙：${p.gong}宫（${PALACE_INFO[p.gong].gua}·${PALACE_INFO[p.gong].dir}）${p.gongShen}，入宫第${p.ruNian}年`,
    `始击（客目）：${p.shiJi}宫 ${p.shiJiShen}`,
    `计神：${p.jiShen}`,
    `太岁：${p.taiSui}`,
    `主大将：${p.zhuDa}宫；主参将：${p.zhuCan}宫`,
    `客大将：${p.keDa}宫；客参将：${p.keCan}宫`,
    `主算：${p.zhuSuan}；客算：${p.keSuan}`,
  ]
}

// ═════════════════════════ 六宫（小六壬 / 马前课） ═════════════════════════

/**
 * 六宫三轮掐指：大安起正月，月上起初一，日上起子时。
 * @param {number} m 农历月。
 * @param {number} d 农历日。
 * @param {number} hIdx 时辰序（子 = 0）。
 * @returns {number} 宫序 0..5。
 */
function liuGongRound(m, d, hIdx) {
  return mod((m - 1) + (d - 1) + hIdx, 6)
}

/** 六宫 → 判果（含月令旺衰修正）。 */
function judgeLiuGong(chart, idx, extra) {
  const g = LIU_GONG[idx]
  const ws = wangShuai(g.wx, chart.monthWx)
  let score = g.score + (ws.score - 55) * 0.3
  const rel = relation(GAN_WUXING[chart.dayGan] ?? '土', g.wx)
  score += DAY_REL_SCORE[rel] * 0.25
  return { g, ws, rel, score: clamp(score, -100, 100), ...extra }
}

// ═════════════════════════ 引擎实现 ═════════════════════════

export const engines = {
  // ── 25-29 奇门遁甲（时/日/月/年家 · 转盘/飞盘） ──
  qimen(chart, entry, rand) {
    const scale = entry?.params?.scale ?? '时'
    const pan = entry?.params?.pan ?? '转盘'
    const p = qimenPan(chart, scale, pan)
    if (!p) return null
    const { shiGong, renGong, shiGZ } = qimenYong(chart, p, scale)
    const rs = readPalace(p, shiGong)
    const rr = readPalace(p, renGong)
    const a = palaceScore(rs)
    const b = palaceScore(rr)

    let score = a.s * 0.62 + b.s * 0.38
    const keys = [`${p.yang ? '阳' : '阴'}遁${p.ju}局`, `${p.zhiFuXing}值符`, rs.men ?? '—', ...a.keys, ...b.keys]

    if (shiGong !== renGong) {
      const rel = relation(PALACE_INFO[renGong].wx, PALACE_INFO[shiGong].wx)
      score += (DAY_REL_SCORE[rel] ?? 0) * 0.6
      keys.push(`人${rel}事`)
    } else { score += 6; keys.push('人宅同宫') }

    const kFu = RING8.indexOf(p.jiGong(p.fuShouGong))
    const kYong = RING8.indexOf(p.jiGong(p.yongGong))
    if (p.yongGong === p.fuShouGong) { score -= 16; keys.push('值符伏吟') }
    else if (mod(kYong - kFu, 8) === 4) { score -= 12; keys.push('值符反吟') }

    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[rs.wx] += 2
    wuxing[rr.wx] += 1
    if (rs.men) wuxing[MEN_WX[rs.men]] += 1
    if (rs.xing) wuxing[XING_WX[rs.xing]] += 1
    wuxing[chart.monthWx] += 1

    return {
      score,
      essence: `${p.yang ? '阳' : '阴'}遁${p.ju}局${p.yuanName}·${p.zhiFuXing}值符·${rs.men ?? '—'}临${rs.gua}`,
      keys: uniqKeys(keys),
      wuxing,
      timing: `${scale}内应${p.ju}数（用神在${rs.dir}方）`,
      detail: {
        定局: `${p.yang ? '阳遁' : '阴遁'}${p.ju}局（${p.jieqi}·${p.yuanName}）`,
        节气: `${p.jieqi}｜${p.chaJie}`,
        符头: `${p.fuTou}日 → ${p.yuanName}`,
        旬首: `${p.xunHead}（遁${p.fuShouGan}），本干支在旬中第 ${p.step + 1} 位`,
        值符: `${p.zhiFuXing}（本位${p.fuShouGong}宫）加 ${p.yongGong}宫（${scale}干${p.yongGan}）`,
        值使: `${p.zhiShiMen}落 ${p.zhiShiGong}宫`,
        盘式: `${pan}${scale}家${p.pan === '飞盘' ? '（九星八门按宫数飞布）' : '（九星八门沿洛书八宫环旋转，中五寄坤二）'}`,
        地盘三奇六仪: palaceLines(p.diGan),
        天盘九星: palaceLines(Object.fromEntries(Object.entries(p.tianXing).map(([g, v]) => [g, p.xingFu[g] ? `${v}+${p.xingFu[g]}` : v]))),
        天盘八门: palaceLines(p.tianMen),
        八神: palaceLines(p.tianShen),
        天盘干: palaceLines(p.tianGan),
        用神宫: `${shiGong}宫${rs.gua}（${scale}柱${shiGZ}）门${rs.men ?? '—'}星${rs.xing ?? '—'}神${rs.shen ?? '—'}天盘干${rs.gan ?? '—'}地盘干${rs.diGan ?? '—'} → ${a.geju ?? '无成格'}`,
        人宫: `${renGong}宫${rr.gua}（日柱${chart.ganzhi.day}）门${rr.men ?? '—'}星${rr.xing ?? '—'}神${rr.shen ?? '—'} → ${b.geju ?? '无成格'}`,
        断: `门星神三盘以用神宫为主：${rs.men ?? '—'}${(MEN_LUCK[rs.men] ?? 0) >= 40 ? '为吉门' : (MEN_LUCK[rs.men] ?? 0) <= -40 ? '为凶门' : '为中平门'}，${rs.xing ?? '—'}${(XING_LUCK[rs.xing] ?? 0) >= 30 ? '星吉' : (XING_LUCK[rs.xing] ?? 0) <= -30 ? '星凶' : '星平'}；再看人宫与用神宫生克`,
        说明: (scale === '月' || scale === '年')
          ? '说明：月家/年家奇门取该节气「上元」局数，属公开简法；本插件未做超接置闰，符头与节气的超神/接气仅在「节气」项标注，不据此调局。'
          : '说明：局数按节气三元局数表 + 日干支符头定元；未做超接置闰（超神/接气仅标注）。转盘沿洛书八宫顺时针环旋转，中五宫无门寄坤二。',
      },
    }
  },

  // ── 30 奇门·局数法 ──
  qimenJu(chart, entry, rand) {
    const dj = qimenDingJu(chart, '时')
    if (!dj) return null
    const p = qimenPan(chart, '时', '转盘')
    if (!p) return null

    // 局数法专断：局数阴阳、三奇六仪分布、符头三元、超接
    const qiGong = { 乙: 0, 丙: 0, 丁: 0 }
    for (const g of SANQI) qiGong[g] = p.ganGong[g] ?? 0
    const sanQiJu = [qiGong.乙, qiGong.丙, qiGong.丁]
    // 三奇得「生门/开门/休门」之宫：以吉门与三奇同宫为准
    const sanQiDeShi = SANQI.filter((g) => {
      const pg = p.ganGong[g]
      return ['开门', '休门', '生门'].includes(p.tianMen[pg])
    })

    let score = 0
    const keys = [`${dj.yang ? '阳' : '阴'}遁${dj.ju}局`, dj.yuanName]
    // 阳遁局数奇数主刚进、阴遁局数奇数主退守（公开通例的强弱取向）
    const odd = dj.ju % 2 === 1
    score += (dj.yang ? (odd ? 14 : 6) : (odd ? -8 : 2))
    score += dj.yuan === 0 ? 8 : dj.yuan === 1 ? 2 : -6
    if (dj.chaJie.startsWith('超神')) { score -= 6; keys.push('超神') }
    else if (dj.chaJie.startsWith('接气')) { score += 4; keys.push('接气') }
    else if (dj.chaJie.startsWith('正授')) { score += 10; keys.push('正授') }
    if (sanQiDeShi.length > 0) { score += 12 * sanQiDeShi.length; keys.push('三奇得使') }
    keys.push(`三奇在${sanQiJu.join('/')}宫`)
    // 局数与月令五行：局数配洛书宫五行与月令
    const juWx = PALACE_INFO[dj.ju].wx
    const ws = wangShuai(juWx, chart.monthWx)
    score += (ws.score - 55) * 0.3
    keys.push(`局${ws.state}`)
    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[juWx] += 2
    wuxing[chart.monthWx] += 1
    for (const g of SANQI) wuxing[GAN_WUXING[g]] += 0.5

    return {
      score,
      essence: `${dj.yang ? '阳' : '阴'}遁${dj.ju}局·符头${dj.fuTou}${dj.yuanName}·${dj.chaJie.slice(0, 2)}`,
      keys: uniqKeys(keys),
      wuxing,
      timing: `${dj.ju}数为应（${dj.jieqi}${dj.yuanName}）`,
      detail: {
        局数: `${dj.yang ? '阳遁' : '阴遁'}${dj.ju}局`,
        节气三元: `${dj.jieqi} 三元 [${(QIMEN_JU[dj.jieqi] ?? [1, 7, 4]).join('/')}] → 取${dj.yuanName}`,
        符头: `${dj.fuTou}日（日柱${chart.ganzhi.day}）`,
        超接置闰: dj.chaJie,
        三奇落宫: `乙${qiGong.乙}宫 丙${qiGong.丙}宫 丁${qiGong.丁}宫`,
        三奇得使: sanQiDeShi.length > 0 ? `${sanQiDeShi.join('、')}临三吉门` : '三奇未得吉门',
        值符值使: `${p.zhiFuXing}加${p.yongGong}宫，${p.zhiShiMen}落${p.zhiShiGong}宫`,
        局气: `局数${dj.ju}属${juWx}，月令${chart.monthWx}，${ws.state}`,
        断: `${dj.yang ? '阳遁' : '阴遁'}${dj.ju}局${dj.yuanName}，${dj.chaJie.slice(0, 2)}得气；三奇${sanQiDeShi.length > 0 ? '得使可用' : '未得吉门，须借门星之吉'}`,
        说明: '说明：本引擎专断局数（阴阳遁、节气三元、符头、超接置闰），不重排星门神；未做置闰调局，超神/接气只作标注。',
      },
    }
  },

  // ── 31 大六壬·四课三传 ──
  liuren(chart, entry, rand) {
    const p = liurenPan(chart)
    if (!p) return null
    const dayWx = GAN_WUXING[p.dayGan]
    const st = chuanStructure(chart, p)
    const kt = KETI[p.keti] ?? { score: 0, note: '' }

    const rel1 = relation(dayWx, wxOf(p.chuan[0]))
    const rel3 = relation(dayWx, wxOf(p.chuan[2]))
    let score = kt.score * 0.5 + (DAY_REL_SCORE[rel1] ?? 0) * 1.0 + (DAY_REL_SCORE[rel3] ?? 0) * 0.4 + st.s
    const keys = [p.keti, `初传${p.chuan[0]}`, rel1, ...st.keys]

    score = clamp(score, -100, 100)
    const wuxing = emptyWuxing()
    for (const c of p.chuan) wuxing[wxOf(c)] += 1
    wuxing[chart.monthWx] += 1
    wuxing[GAN_WUXING[p.dayGan]] += 1

    return {
      score,
      essence: `${p.yuejiangName}加${p.shi}·${p.keti}·初传${p.chuan[0]}(${wxOf(p.chuan[0])})${rel1}`,
      keys: uniqKeys(keys),
      wuxing,
      timing: `${p.chuan[0]}日/月应（初传发用）`,
      detail: {
        月将: `${p.yuejiang}（${p.yuejiangName}）加占时${p.shi}`,
        四课: keLines(p),
        三传: p.chuan.map((z, i) => `${['初', '中', '末'][i]}传 ${z}(${wxOf(z)}) ${p.chuanInfo[i].jiang} ${p.chuanInfo[i].god}${p.chuanInfo[i].kong ? ' 空' : ''}`),
        课体: `${p.keti}｜${p.ketiNote}`,
        取传过程: p.trace,
        天地盘: tianPanLines(p),
        用神与日干: `日干${p.dayGan}(${dayWx})｜初传${relation(dayWx, wxOf(p.chuan[0]))}｜末传${relation(dayWx, wxOf(p.chuan[2]))}`,
        结构: st.notes,
        旬空: p.kong,
        断: `${p.ketiNote}；${(DAY_REL_SCORE[rel1] ?? 0) > 0 ? '初传生日干，事来就我' : (DAY_REL_SCORE[rel1] ?? 0) < 0 ? '初传克日干，事来相逼' : '初传与日干同类，事在己身'}${st.keys.includes('初传空亡') ? '，然初传落空，须待填实' : ''}`,
      },
    }
  },

  // ── 32 大六壬·课体 ──
  liurenKe(chart, entry, rand) {
    const p = liurenPan(chart)
    if (!p) return null
    const st = chuanStructure(chart, p)
    const kt = KETI[p.keti] ?? { score: 0, note: '' }

    // 课体专断：九宗门课体 + 四课完整度 + 结构
    const keDistinct = new Set(p.ke.map((k) => `${k.up}${k.down}`)).size
    let score = kt.score * 1.15 + st.s * 0.8
    const keys = [p.keti, `${keDistinct}课`, ...st.keys]
    if (keDistinct === 2) { score -= 14; keys.push('四课不全') }
    if (p.fuYin) { score -= 10; keys.push('天地伏吟') }
    if (p.fanYin) { score -= 8; keys.push('天地返吟') }
    if (['伏吟', '返吟', '八专', '别责'].includes(p.keti)) { score -= 8 }
    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[wxOf(p.chuan[0])] += 2
    for (const k of p.ke) wuxing[wxOf(k.up)] += 0.5
    wuxing[chart.monthWx] += 1

    return {
      score,
      essence: `课体${p.keti}·四课${keDistinct}课·${st.keys[0] ?? '三传平顺'}`,
      keys: uniqKeys(keys),
      wuxing,
      timing: `${p.chuan[2]}日/月应（末传定终局）`,
      detail: {
        课体: p.keti,
        课体释义: kt.note,
        课体注: p.ketiNote,
        四课: keLines(p),
        课数: `${keDistinct} / 4（${keDistinct < 4 ? '有重复，课不全' : '四课全备'}）`,
        三传: p.chuan.join(' → '),
        三传结构: st.notes,
        取传过程: p.trace,
        断: `${kt.note}；${st.keys.length > 0 ? `三传见${st.keys.join('、')}` : '三传无合无冲，平顺无奇'}`,
        说明: '说明：九宗门取传次序为伏吟→返吟→贼克（含比用、涉害）→八专→遥克→别责→昴星；涉害复等时先取临四孟者，再同比用，最后阳日取干上神、阴日取支上神（各家收束法略异）。别责、八专的中末传俱取干上神。',
      },
    }
  },

  // ── 33 大六壬·十二天将 ──
  liurenJiang(chart, entry, rand) {
    const p = liurenPan(chart)
    if (!p || !p.jp) return null
    const jp = p.jp
    const c = p.chuanInfo
    // 三传所乘将加权：初 0.5 / 中 0.3 / 末 0.2
    let score = c[0].jiangLuck * 0.5 + c[1].jiangLuck * 0.3 + c[2].jiangLuck * 0.2
    const keys = [c[0].jiang, c[1].jiang, c[2].jiang, jp.shun ? '贵人顺布' : '贵人逆布']
    const good = c.filter((x) => x.jiangLuck > 0).length
    const bad = c.filter((x) => x.jiangLuck < 0).length
    score += (good - bad) * 8
    if (jp.isZhou) keys.push('昼贵')
    else keys.push('夜贵')
    // 贵人所临之宫与日干关系
    const rel = relation(GAN_WUXING[jp.dayGan] ?? '土', wxOf(jp.diGong))
    score += (DAY_REL_SCORE[rel] ?? 0) * 0.3
    // 旺衰
    score += (wangShuai(c[0].jiangWx === '—' ? '土' : c[0].jiangWx, chart.monthWx).score - 55) * 0.2
    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    for (const x of c) if (x.jiangWx !== '—') wuxing[x.jiangWx] += 1
    wuxing[chart.monthWx] += 1

    return {
      score,
      essence: `${jp.isZhou ? '昼' : '夜'}贵${jp.guiren}${jp.shun ? '顺' : '逆'}布·${c[0].jiang}乘${c[0].zhi}·${c[1].jiang}乘${c[1].zhi}`,
      keys: uniqKeys(keys),
      wuxing,
      timing: `${c[0].zhi}日应（${c[0].jiang}乘初传）`,
      detail: {
        贵人: `${jp.dayGan}日${jp.isZhou ? '昼' : '夜'}贵取${jp.guiren}，临地盘${jp.diGong}宫，故${jp.shun ? '顺布' : '逆布'}十二将`,
        十二将盘: (() => {
          const out = []
          for (let i = 0; i < 12; i += 1) out.push(`${ZHI[i]}上${jp.at[ZHI[i]]?.name ?? '—'}`)
          return out
        })(),
        三传乘将: c.map((x) => `${x.pos} ${x.zhi} 乘 ${x.jiang}(${x.jiangWx}·${x.jiangLuck > 0 ? '吉将' : x.jiangLuck < 0 ? '凶将' : '平将'})`),
        吉将数: `${good} 吉 / ${bad} 凶`,
        断: `${c[0].jiang}乘初传${c[0].jiangLuck > 0 ? '，吉将临用，事多顺遂' : c[0].jiangLuck < 0 ? '，凶将临用，事多阻滞' : '，平将临用，事无大起落'}；贵人${jp.shun ? '顺治' : '逆治'}主事势${jp.shun ? '顺行易达' : '多逆折'}`,
        说明: '说明：贵人起法用「甲戊庚牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸兔蛇藏，六辛逢马虎」，卯至申为昼、酉至寅为夜；贵人临亥子丑寅卯辰顺布，临巳午未申酉戌逆布。',
      },
    }
  },

  // ── 34 太乙神数·九宫 ──
  taiyi(chart, entry, rand) {
    const p = taiyiPan(chart)
    if (!p) return null
    const dayWx = GAN_WUXING[chart.dayGan] ?? '土'
    let score = p.yangGong ? 26 : -22
    const keys = [p.yangGong ? '太乙临阳宫' : '太乙临阴宫', `太乙${p.gong}宫`, `计神${p.jiShen}`]
    score += (p.zhuSuan - p.keSuan) * 3.5
    keys.push(p.zhuSuan >= p.keSuan ? '主算胜' : '客算胜')
    score += (DAY_REL_SCORE[relation(wxOf(p.gongZhi), wxOf(p.taiSui))] ?? 0) * 0.35
    score += (DAY_REL_SCORE[relation(wxOf(p.jiShen), dayWx)] ?? 0) * 0.3
    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[wxOf(p.gongZhi)] += 2
    wuxing[wxOf(p.jiShen)] += 1
    wuxing[wxOf(p.taiSui)] += 1
    wuxing[chart.monthWx] += 1

    return {
      score,
      essence: `太乙${p.gong}宫${p.gongShen}第${p.ruNian}年·主算${p.zhuSuan}客算${p.keSuan}·${p.zhuSuan >= p.keSuan ? '主胜' : '客胜'}`,
      keys: uniqKeys(keys),
      wuxing,
      timing: `太乙入${p.gong}宫第${p.ruNian}年，应${p.ruNian}年`,
      detail: {
        太乙积年: `${p.ji}（上元积年通行值 ${TAIYI_YUAN} + 公元${p.year}）`,
        太乙: `${p.gong}宫（${PALACE_INFO[p.gong].gua}·${PALACE_INFO[p.gong].dir}）${p.gongShen}，入宫第${p.ruNian}年`,
        阴阳宫: p.yangGong ? '阳宫（奇宫），太乙临之为吉' : '阴宫（偶宫），太乙临之不利',
        计神: `${p.jiShen}（自寅起顺行十二辰）`,
        太岁: `${p.taiSui}（与太乙宫${p.gongZhi}：${relation(wxOf(p.gongZhi), wxOf(p.taiSui))}）`,
        主客算: `主算${p.zhuSuan}（自太乙宫${p.gongZhi}顺数至计神${p.jiShen}）；客算${p.keSuan}（自始击宫${p.shiJiZhi}顺数至计神）`,
        九宫盘: taiyiLines(p),
        断: `太乙临${p.yangGong ? '阳' : '阴'}宫，${p.zhuSuan >= p.keSuan ? '主算多于客算，主胜客负，宜主不宜客' : '客算多于主算，客胜主负，宜客不宜主'}；计神${p.jiShen}与日干${chart.dayGan}为${relation(wxOf(p.jiShen), dayWx)}`,
        说明: '说明：太乙行九宫（积年÷24，每宫三年、不入中五）与计神（自寅起顺行）为公开确定算法；始击（客目）、主客大将/参将、主客算的完整起例诸本互异，本插件按公开可推部分计算——始击取太乙对宫、大将自本位顺行三宫、算数自本位顺数至计神，不作秘传表冒充。',
      },
    }
  },

  // ── 35 太乙·计神算 ──
  taiyiJi(chart, entry, rand) {
    const p = taiyiPan(chart)
    if (!p) return null
    const dayWx = GAN_WUXING[chart.dayGan] ?? '土'
    let score = 0
    const keys = [`计神${p.jiShen}`, `主大将${p.zhuDa}宫`, `客大将${p.keDa}宫`]
    score += (DAY_REL_SCORE[relation(wxOf(p.jiShen), dayWx)] ?? 0) * 0.8
    score += (p.zhuSuan - p.keSuan) * 4
    keys.push(p.zhuSuan >= p.keSuan ? '主算长' : '客算长')
    score += (DAY_REL_SCORE[relation(wxOf(p.gongZhi), wxOf(p.taiSui))] ?? 0) * 0.3
    score += (DAY_REL_SCORE[relation(wxOf(GONG_ZHI[p.zhuDa]), wxOf(GONG_ZHI[p.keDa]))] ?? 0) * 0.4
    const canRel = relation(wxOf(GONG_ZHI[p.zhuCan]), wxOf(GONG_ZHI[p.keCan]))
    if (canRel === '生我' || canRel === '比和') { score += 8; keys.push('参将相得') }
    else if (canRel === '克我') { score -= 10; keys.push('参将相克') }
    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[wxOf(p.jiShen)] += 2
    wuxing[wxOf(GONG_ZHI[p.zhuDa])] += 1
    wuxing[wxOf(GONG_ZHI[p.keDa])] += 1
    wuxing[chart.monthWx] += 1

    return {
      score,
      fidelity: 'approx',
      essence: `计神${p.jiShen}·主算${p.zhuSuan}客算${p.keSuan}·主大将${p.zhuDa}宫客大将${p.keDa}宫`,
      keys: uniqKeys(keys),
      wuxing,
      timing: `${p.zhuSuan}数为应（主算）`,
      detail: {
        计神: `${p.jiShen}（五行${wxOf(p.jiShen)}，与日干${chart.dayGan}为${relation(wxOf(p.jiShen), dayWx)}）`,
        主客算: `主算${p.zhuSuan} ｜ 客算${p.keSuan} ｜ ${p.zhuSuan >= p.keSuan ? '主算为长，主胜' : '客算为长，客胜'}`,
        主将: `主大将${p.zhuDa}宫（${GONG_16SHEN[p.zhuDa]}）｜主参将${p.zhuCan}宫（${GONG_16SHEN[p.zhuCan]}）`,
        客将: `客大将${p.keDa}宫（${GONG_16SHEN[p.keDa]}）｜客参将${p.keCan}宫（${GONG_16SHEN[p.keCan]}）`,
        将之生克: `主大将与客大将：${relation(wxOf(GONG_ZHI[p.zhuDa]), wxOf(GONG_ZHI[p.keDa]))}；主参将与客参将：${canRel}`,
        太岁: `${p.taiSui}，与太乙宫${p.gongZhi}${relation(wxOf(p.gongZhi), wxOf(p.taiSui))}`,
        断: `计神在${p.jiShen}，主算${p.zhuSuan}、客算${p.keSuan}，${p.zhuSuan >= p.keSuan ? '主势为长，宜守正为主' : '客势为长，宜借力于客'}；主客参将${canRel === '克我' ? '相克，协同有碍' : '不相克，尚可协同'}`,
        说明: '说明：本引擎专断计神与主客大将、参将、算数。太乙家对始击、主客算的起例诸本互异，本插件按公开可推部分计算（始击取太乙对宫、大将顺行三宫、算数顺数至计神），故整体标 approx，不冒充秘传表。',
      },
    }
  },

  // ── 36 小六壬 ──
  xiaoliuren(chart, entry, rand) {
    const m = Math.abs(chart?.lunar?.month ?? 1) || 1
    const d = chart?.lunar?.day || 1
    const hIdx = Math.max(0, ZHI.indexOf(chart?.hourZhi ?? '子'))
    const idx = liuGongRound(m, d, hIdx)
    const j = judgeLiuGong(chart, idx)
    const keys = [j.g.name, `${j.g.wx}`, j.g.kw, j.ws.state]

    return {
      score: j.score,
      essence: `小六壬${j.g.name}（${j.g.wx}）·月${m}日${d}${chart.hourZhi}时·${j.g.kw}`,
      keys: uniqKeys(keys),
      wuxing: { ...emptyWuxing(), [j.g.wx]: 3, [chart.monthWx]: 1 },
      timing: j.g.ying,
      detail: {
        起课: `大安起正月顺数至${m}月 → 该宫起初一顺数至${d}日 → 该宫起子时顺数至${chart.hourZhi}时，落第${idx + 1}宫`,
        宫位: `第${idx + 1}宫 ${j.g.name}（${j.g.luck}）`,
        五行: `${j.g.wx}（月令${chart.monthWx}·${j.ws.state}）`,
        宫义: j.g.main,
        与日干: `日干${chart.dayGan}(${GAN_WUXING[chart.dayGan]}) 与宫${j.g.wx}为${j.rel}`,
        应期: j.g.ying,
        断: `${j.g.name}主「${j.g.main}」，${j.g.luck === '吉' ? '可用可行' : j.g.luck === '大凶' ? '宜止宜守，不可妄动' : '宜缓图，谨防其失'}`,
        说明: '说明：小六壬为公开确定算法——大安起正月，月上起初一，日上起子时，三轮掐指落宫；本插件按此逐轮推算。',
      },
    }
  },

  // ── 37 中六壬（天罡掌诀） ──
  zhongliuren(chart, entry, rand) {
    const m = Math.abs(chart?.lunar?.month ?? 1) || 1
    const d = chart?.lunar?.day || 1
    const hIdx = Math.max(0, ZHI.indexOf(chart?.hourZhi ?? '子'))
    const startZhi = ZLR_MONTH_START[mod(m - 1, 12)]
    const dayPos = mod(ZHI.indexOf(startZhi) + (d - 1), 12)
    const hourPos = mod(dayPos + hIdx, 12)
    const tianGang = mod(hourPos - 1, 12) // 时上退一位起天罡
    const siZheng = ['子', '午', '卯', '酉']
    const san = ZLR_SANWEI.map((s) => ({ ...s, zhi: ZHI[mod(tianGang + s.offset, 12)] }))
    const hit = san.find((s) => siZheng.includes(s.zhi))
    if (!hit) return null
    const wei = hit.wei

    // 值空亡则不验（以月柱旬空取）
    const kong = xunOf(chart.ganzhi.month || '甲子').kong
    const kongHit = kong.includes(chart.dayZhi) || kong.includes(chart.hourZhi)

    const ws = wangShuai(wxOf(hit.zhi), chart.monthWx)
    let score = hit.score + (ws.score - 55) * 0.3
    const keys = [hit.kw, `天罡${ZHI[tianGang]}`, `${wei}位`]
    if (kongHit) { score -= 20; keys.push('值空亡') }

    // 按所问事类取分类断辞
    const topic = zlrTopicOf(chart.question)
    let topicText = ''
    if (topic) {
      topicText = `${topic}：${ZLR_TOPIC[topic][wei]}`
      if (['婚姻', '求财', '交易', '文书'].includes(topic)) {
        score += wei === '季' ? 12 : wei === '仲' ? -8 : -4
      } else if (['病患', '官非', '词讼'].includes(topic)) {
        score += wei === '孟' ? 8 : wei === '季' ? -10 : 4
      } else if (topic === '行人') {
        score += wei === '孟' ? -6 : 8
      } else if (topic === '失物') {
        score += wei === '孟' ? 8 : -4
      }
    }
    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[wxOf(hit.zhi)] += 2
    wuxing[wxOf(ZHI[tianGang])] += 1
    wuxing[chart.monthWx] += 1

    return {
      score,
      essence: `中六壬天罡加${wei}·${hit.jiang}在${hit.zhi}·${kongHit ? '值空亡不验' : '课成'}`,
      keys: uniqKeys(keys),
      wuxing,
      timing: wei === '孟' ? '孟主近，一、三日内' : wei === '仲' ? '仲主中，五、七日内' : '季主远，十日以上',
      detail: {
        起课: `农历${m}月自${startZhi}起，顺数至${d}日得${ZHI[dayPos]}；自${ZHI[dayPos]}起子时，顺数至${chart.hourZhi}时得${ZHI[hourPos]}；时上退一位起天罡，天罡在${ZHI[tianGang]}`,
        十将: ZLR_JIANG10.map((n, i) => `${i + 1}${n}在${ZHI[mod(tianGang + i, 12)]}`),
        三位: san.map((s) => `${s.wei}·${s.jiang}在${s.zhi}${siZheng.includes(s.zhi) ? '（值子午卯酉）' : ''}`),
        孟仲季: `天罡加${wei}（${hit.jiang}落${hit.zhi}，属子午卯酉）`,
        总断: ZLR_DUAN[wei],
        分类断: topicText || '（所问事类未入分类断辞，以总断为准）',
        空亡: kongHit ? `月柱${chart.ganzhi.month}旬空${kong.join('')}，日/时值空——歌诀云「值空亡日时占之则不验」` : `月柱旬空${kong.join('')}，日时未值空`,
        五行: `${wxOf(hit.zhi)}（月令${chart.monthWx}·${ws.state}）`,
        说明: '说明：本引擎用《中六壬天罡掌诀》——农历月上起日、日上起时、时上退一位起天罡，视十将第八/九/十（登明孟、神后仲、大吉季）落于子午卯酉何位定断；断辞取自该诀总论与分类断辞。',
      },
    }
  },

  // ── 38 六壬金口诀 ──
  jinkoujue(chart, entry, rand) {
    const diFen = chart?.hourZhi || '子'
    const dayGan = chart?.dayGan ?? ''
    const gr = GUIREN[dayGan]
    if (!gr) return null
    const yuejiang = yueJiangOf(chart)
    const isZhou = ZHOU_HOURS.includes(diFen)
    const guiren = isZhou ? gr[0] : gr[1]
    const shun = SHUN_GONG.includes(guiren)
    const gi = ZHI.indexOf(guiren)
    const jiangAt = (z) => JIANG12[mod((shun ? 1 : -1) * (ZHI.indexOf(z) - gi), 12)]
    const guiShen = jiangAt(diFen)
    const dunShou = WUSHU_DUN[dayGan] ?? '甲'
    const renYuan = GAN[mod(GAN.indexOf(dunShou) + ZHI.indexOf(diFen), 10)]

    const wx = [GAN_WUXING[renYuan], guiShen.wx, wxOf(yuejiang), wxOf(diFen)]
    const labels = ['人元', '贵神', '月将', '地分']
    const chain = [[0, 1], [1, 2], [2, 3]].map(([a, b]) => ({ from: labels[a], to: labels[b], rel: relation(wx[a], wx[b]) }))
    let score = 0
    const keys = [guiShen.name, `月将${JIANG_NAME[yuejiang]}`, `地分${diFen}`]
    for (const c of chain) score += (DAY_REL_SCORE[c.rel] ?? 0) * 0.45
    score += guiShen.luck * 0.4
    score += (wangShuai(wxOf(yuejiang), chart.monthWx).score - 55) * 0.25

    const allSheng = chain.every((c) => c.rel === '我生' || c.rel === '生我' || c.rel === '比和')
    const allKe = chain.every((c) => c.rel === '我克' || c.rel === '克我')
    if (allSheng) { score += 24; keys.push('四位相生') }
    else if (allKe) { score -= 22; keys.push('四位相克') }
    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[wx[0]] += 1
    wuxing[wx[1]] += 1
    wuxing[wx[2]] += 1
    wuxing[wx[3]] += 1

    return {
      score,
      essence: `金口诀·人元${renYuan} 贵神${guiShen.name} 月将${JIANG_NAME[yuejiang]} 地分${diFen}·${allSheng ? '四位相生' : allKe ? '四位相克' : '生克互见'}`,
      keys: uniqKeys(keys),
      wuxing,
      timing: `地分${diFen}，应${diFen}日或${ZHI[mod(ZHI.indexOf(diFen) + 6, 12)]}日`,
      detail: {
        四位: labels.map((l, i) => `${l}：${[renYuan, guiShen.name, `${yuejiang}(${JIANG_NAME[yuejiang]})`, diFen][i]}（${wx[i]}）`),
        人元起法: `五子元遁：${dayGan}日起${dunShou}子，顺数至地分${diFen}得${renYuan}`,
        贵神起法: `${dayGan}日${isZhou ? '昼' : '夜'}贵取${guiren}，贵人临${guiren}${shun ? '顺布' : '逆布'}十二将，地分${diFen}上得${guiShen.name}`,
        月将: `${yuejiang}（${JIANG_NAME[yuejiang]}），五行${wxOf(yuejiang)}`,
        四位生克: chain.map((c) => `${c.from}→${c.to}：${c.rel}`),
        贵神吉凶: `${guiShen.name}（${guiShen.wx}）为${guiShen.luck > 0 ? '吉将' : guiShen.luck < 0 ? '凶将' : '平将'}`,
        断: `四位${allSheng ? '递相生，事顺而有力' : allKe ? '递相克，事阻而多耗' : '生克互见，成败相参'}；${guiShen.luck > 0 ? '贵神为吉将，主有贵人扶助' : '贵神非吉将，须防暗中阻隔'}`,
        说明: '说明：金口诀四位＝地分（时支）、月将（中气换将）、贵神（十二将临地分）、人元（五子元遁至地分）；四位生克以「上生下为顺、下克上为逆」的通行口径累加。',
      },
    }
  },

  // ── 39 马前课 ──
  maqianke(chart, entry, rand) {
    const nums = (chart?.numbers ?? []).filter(Number.isFinite)
    const m = Math.abs(chart?.lunar?.month ?? 1) || 1
    const d = chart?.lunar?.day || 1
    const hIdx = Math.max(0, ZHI.indexOf(chart?.hourZhi ?? '子'))
    let idx
    let how
    if (nums.length >= 3) {
      const n = nums.slice(0, 3).map((x) => Math.max(1, Math.round(x)))
      let k = mod(n[0] - 1, 6)
      k = mod(k + n[1] - 1, 6)
      k = mod(k + n[2] - 1, 6)
      idx = k
      how = `报数 ${n.join('/')} 三轮起课（大安起，逐轮顺数）`
    } else {
      idx = liuGongRound(m, d, hIdx)
      how = `农历${m}月${d}日${chart.hourZhi}时 三轮起课（无报数，退回月→日→时）`
    }
    const j = judgeLiuGong(chart, idx)
    const keys = [j.g.name, `${idx + 1}宫`, j.g.kw, j.ws.state]

    return {
      score: j.score,
      essence: `马前课${j.g.name}（第${idx + 1}宫）·${j.g.wx}${j.ws.state}·${j.g.kw}`,
      keys: uniqKeys(keys),
      wuxing: { ...emptyWuxing(), [j.g.wx]: 3, [chart.monthWx]: 1 },
      timing: j.g.ying,
      detail: {
        起课: how,
        宫位: `第${idx + 1}宫 ${j.g.name}（${j.g.luck}）`,
        五行: `${j.g.wx}（月令${chart.monthWx}·${j.ws.state}）`,
        宫义: j.g.main,
        与日干: `日干${chart.dayGan}(${GAN_WUXING[chart.dayGan]}) 与宫${j.g.wx}为${j.rel}`,
        应期: j.g.ying,
        断: `${j.g.name}定数主「${j.g.main}」，${j.g.luck === '吉' ? '宜进宜成' : j.g.luck === '大凶' ? '宜退宜守' : '宜缓图谨防其失'}`,
        说明: '说明：马前课与小六壬同源同法（大安→留连→速喜→赤口→小吉→空亡六宫，月上起日、日上起时）。本插件在马前课优先以报数三轮起课；无报数时退回农历月日时三轮，此时两法必然同盘——属法脉同源，非重复计数之误。',
      },
    }
  },

  // ── 40 三传九宗 ──
  sanchuan(chart, entry, rand) {
    const p = liurenPan(chart)
    if (!p) return null
    const dayWx = GAN_WUXING[p.dayGan]
    const st = chuanStructure(chart, p)
    const kt = KETI[p.keti] ?? { score: 0, note: '' }
    const [c1, c2, c3] = p.chuan
    const rel1 = relation(dayWx, wxOf(c1))
    const rel2 = relation(dayWx, wxOf(c2))
    const rel3 = relation(dayWx, wxOf(c3))

    let score = kt.score * 0.7 + st.s * 0.9
    score += ((DAY_REL_SCORE[rel1] ?? 0) + (DAY_REL_SCORE[rel2] ?? 0) * 0.6 + (DAY_REL_SCORE[rel3] ?? 0) * 0.4)
    const keys = [p.keti, `${c1}${c2}${c3}`, rel1, ...st.keys]
    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[wxOf(c1)] += 1.5
    wuxing[wxOf(c2)] += 1
    wuxing[wxOf(c3)] += 1
    wuxing[chart.monthWx] += 1

    return {
      score,
      essence: `三传${c1}${c2}${c3}·${p.keti}·${st.keys[0] ?? '三传平顺'}`,
      keys: uniqKeys(keys),
      wuxing,
      timing: `${c3}日应（末传归着）`,
      detail: {
        九宗取传: `${p.keti}（${p.ketiNote}）`,
        取传过程: p.trace,
        三传: [
          `初传 ${c1}（${wxOf(c1)}）${p.chuanInfo[0].jiang} ${p.chuanInfo[0].god}${p.chuanInfo[0].kong ? ' 空' : ''} — 日干${rel1}`,
          `中传 ${c2}（${wxOf(c2)}）${p.chuanInfo[1].jiang} ${p.chuanInfo[1].god}${p.chuanInfo[1].kong ? ' 空' : ''} — 日干${rel2}`,
          `末传 ${c3}（${wxOf(c3)}）${p.chuanInfo[2].jiang} ${p.chuanInfo[2].god}${p.chuanInfo[2].kong ? ' 空' : ''} — 日干${rel3}`,
        ],
        三传结构: st.notes,
        初末相因: `初传${c1}为发用（事之始），末传${c3}为归着（事之终）；${relation(wxOf(c3), wxOf(c1)) === '生我' ? '末生初，终局回护' : relation(wxOf(c1), wxOf(c3)) === '我生' ? '初生末，事有接续' : '首尾不相生，中途须自守'}`,
        九宗释义: Object.entries(KETI).map(([k, v]) => `${k}：${v.note}`),
        断: `${p.ketiNote}；三传${st.keys.length > 0 ? `见${st.keys.join('、')}` : '无合无冲'}，初传${rel1}、末传${rel3}`,
        说明: '说明：九宗＝贼克（重审/元首）、比用、涉害、遥克、昴星、别责、八专、伏吟、返吟；伏吟、返吟为课体前提，先于贼克链判断；八专不看遥克，别责须四课不全且无克无遥。涉害复等时取临四孟者，再同比用，末以阳日干上神、阴日支上神收束。',
      },
    }
  },
}

/**
 * 按所问取中六壬分类断辞的类别。
 * @param {string} question 所问。
 * @returns {string|null} 类别。
 */
function zlrTopicOf(question) {
  const q = String(question ?? '')
  const table = [
    { t: '婚姻', kw: ['婚', '姻', '嫁', '娶', '感情', '对象', '女友', '男友', '复合', '缘分'] },
    { t: '求财', kw: ['财', '钱', '投资', '生意', '买卖', '回款', '收入', '债', '利'] },
    { t: '交易', kw: ['交易', '合作', '成交', '合同', '签约'] },
    { t: '行人', kw: ['行人', '出行', '远行', '归来', '何时回', '出差'] },
    { t: '失物', kw: ['失物', '丢', '找不', '遗失', '被盗', '偷'] },
    { t: '病患', kw: ['病', '疾', '健康', '身体', '医'] },
    { t: '官非', kw: ['官非', '官司', '诉讼', '纠纷', '罪', '牢'] },
    { t: '词讼', kw: ['讼', '打官司', '对簿'] },
    { t: '文书', kw: ['文书', '考试', '证件', '审批', '申', '文'] },
    { t: '音信', kw: ['音信', '消息', '信', '联系'] },
    { t: '迁移', kw: ['迁', '搬家', '搬家', '换房', '移民'] },
  ]
  for (const row of table) if (row.kw.some((k) => q.includes(k))) return row.t
  return null
}

export default engines
