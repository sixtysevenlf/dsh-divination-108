/**
 * 方法模块 · 风水类（10 法 / 条目 73-82）
 *
 * 契约见 `src/core/runner.js` 顶部注释；结构照 `src/methods/yijing.js`。
 * 私有数据表在 `src/methods/data/fengshui.js`。
 *
 * ## 坐向从哪来（本模块最关键的一处工程决定）
 * 插件目前没有专门的「坐向」参数，故本模块从 `chart.question` 里用正则提坐向：
 *   · `卯山酉向`（山向式）
 *   · `坐子向午` / `坐子`（坐向式）
 *   · `坐北朝南` / `坐东南向西北`（方位式）
 *   · `东南向` / `朝南`（只给向）
 * 四正方位映射：北→子、南→午、东→卯、西→酉；四维：东北→艮、东南→巽、
 * 西南→坤、西北→乾。只给坐山则向取对宫（二十四山数组序 +12），反之亦然；
 * 若所给向与坐山非对宫，按坐山取对宫并在 `detail.说明` 里记明。
 * **提不出坐向时**：用 `rand` 从二十四山取一随机坐山，`fidelity` 降为 `approx`，
 * 并在 `detail.说明` 里写明「未提供坐向，已随机取山：X；如需精确请注明坐向」。
 *
 * ## 本模块的公开算法口径（全部写在明处，不冒充秘传）
 * - **八宅**：大游年歌翻卦定八宫九星（乾六天五祸绝延生…）。歌诀的宫序为后天八卦
 *   顺时针 坎艮震巽离坤兑乾 **自伏位卦之后一位起**（已逐卦用「上中下中上中下」
 *   变爻翻卦校验：乾宅兑生气、坎宅巽生气、艮宅坤生气、离宅震生气，与通行八宅图一致）。
 *   命卦由出生年+性别（男 (100−年末两位) mod 9、女 (年末两位+5) mod 9，余 0 作 9、
 *   余 5 男坤女艮）或用流年支所属卦兜底；东四命宜居东四宅，西四命宜居西四宅。
 * - **玄空**：三元九运（1864 起，每运 20 年）；运盘当运星入中顺飞；山星/向星入中数
 *   取运盘在坐山/向首宫之数，依三元龙阴阳阳顺阴逆飞布；旺山旺向 = 山星到山、向星到向。
 * - **三合**：双山五行定局（以向首定局、坐山为入首龙），顺排十二长生；来水宜
 *   长生冠带临官帝旺，去水宜衰病死墓绝。水口未提供时按「水自坐方来、向方去」假设。
 * - **三元三般卦**：1-4-7 / 2-5-8 / 3-6-9 三组；运星、山星、向星三数同组为父母三般卦，
 *   山向两星同组为连珠三般卦；另配三元零正（正神宜山、零神宜水）。
 * - **九星水法**：以向首卦起辅弼翻卦得八星（辅弼=伏位、武曲=延年、贪狼=生气、
 *   巨门=天医、禄存=祸害、文曲=六煞、廉贞=五鬼、破军=绝命），另附二十四山辅星盘
 *   （口诀「辅武破廉贪巨禄文」，净阴净阳阳顺阴逆，每山一星、循环三周）。
 * - **阳宅三要**：门（向首）、主（坐山）、灶（门卦生气方）三者五行生克。
 * - **形势四灵**：玄武（坐）／朱雀（向）／青龙（向左 6 山）／白虎（向右 6 山），
 *   以五行旺衰拟四灵之势（无形峦实测数据）。
 * - **罗盘**：二十四山每山 15°、子山中心为正北 0°；八卦分宫每卦三山；大空亡 = 八宫
 *   交界线（22.5°+45k 共八线），小空亡 = 本卦内三山交界线（共十六线）。
 * - **一百二十分金**：甲子起子山起点 352.5°、每格 3° 顺行六十甲子两轮共 120 格，
 *   每山五格（此排法使每山正中恰为丙/辛旺相分金）；丙丁庚辛旺相、戊己空亡、
 *   甲乙壬癸孤虚；吉凶另参纳音五行与月令旺衰。
 */

import {
  relation, wangShuai, mod, clamp, emptyWuxing, nayinOf, ganzhiOf, CHANGSHENG,
} from '../core/kit.js'
import { TRIGRAMS, TRI_BY_NAME, SHAN24, SHAN_PALACE, EAST_WEST } from '../core/tables.js'
import {
  HOU2TRI, FLY_ORDER, YUN_START, YUN_SPAN, SAN_YUAN_NAME,
  STAR_WX, STAR_NAME, STAR_LUCK_SCORE,
  BAZHAI_SONG, YOU_NIAN_ORDER, STAR_FULL, STAR_SCORE, STAR_TO_FUXING, ZHI_GUA,
  SHUANG_SHAN, SHAN2SHUANG, SHUANG_SHAN_WX, JU_CHANGSHENG_START, JU_MU, JU_DIWANG,
  CHANGSHENG_SCORE, JI_SHUI,
  FU_XING_ORDER, FU_XING_SCORE, FU_XING_JI,
  YUAN_LONG, SHAN_YANG, JING_YANG,
  FENJIN_START_DEG, FENJIN_STEP, FENJIN_GRADE, FENJIN_SCORE, FENJIN_NOTE,
  SEASON_OF_WX,
} from './data/fengshui.js'

// ───────────────────────── 二十四山原语 ─────────────────────────

/** 山名 → 索引（0 = 子，顺时针每山 15°）。 */
const SHAN_INDEX = Object.fromEntries(SHAN24.map((s, i) => [s, i]))
/** 二十四山字集（供正则用）。 */
const SHAN_CHARS = '子丑寅卯辰巳午未申酉戌亥艮巽乾坤甲庚壬丙乙辛丁癸'
/** 四正四维 → 二十四山代表山。 */
const DIR2SHAN = { 北: '子', 南: '午', 东: '卯', 西: '酉', 东北: '艮', 东南: '巽', 西南: '坤', 西北: '乾' }
/** 方位词正则（长的在前，避免「东北」被「东」抢先）。 */
const DIR_RE = '东北|东南|西北|西南|北|南|东|西'
/** 十二地支山（正针得旺相分金者）。 */
const ZHI_SHAN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']

/** 取第 i 山（环形）。 */
const shanAt = (i) => SHAN24[mod(i, 24)]
/** 对宫山（罗盘 180° 对山）。 */
const oppositeShan = (s) => shanAt((SHAN_INDEX[s] ?? 0) + 12)
/** 山所属八卦宫。 */
const palaceOf = (s) => SHAN_PALACE[s] ?? '坎'
/** 山所属八卦的五行。 */
const guaWxOf = (s) => TRI_BY_NAME[palaceOf(s)]?.wx ?? '土'
/** 山度（中心，子 = 0°）。 */
const degOf = (s) => mod((SHAN_INDEX[s] ?? 0) * 15, 360)
/** 三元龙（天元/地元/人元）。 */
const yuanLongOf = (s) => YUAN_LONG[s] ?? '天元'
/** 三元龙阴阳（玄空飞星顺逆）：八干四维为阳，十二地支为阴。 */
const isYangShan = (s) => SHAN_YANG[s] === true
/** 净阴净阳（三合红黑字）。 */
const isJingYang = (s) => JING_YANG.includes(s)

/** 五行 → 应期文本（取用神旺月）。 */
function timingOfWx(wx, what) {
  const s = SEASON_OF_WX[wx]
  if (!s) return null
  return `${what}属${wx}，应于${s.text}（${s.season}）`
}

/** 纳音名 → 五行（末字）。 */
const nayinWx = (n) => (typeof n === 'string' && n.length > 0 ? n[n.length - 1] : '土')

/** 八星名 → 五行（九星水法用）。 */
const FUXING_WX = { 辅弼: '水', 武曲: '金', 破军: '金', 廉贞: '火', 贪狼: '木', 巨门: '土', 禄存: '土', 文曲: '水' }
const fuxingWx = (star) => FUXING_WX[star] ?? '土'

// ───────────────────────── 坐向提取 ─────────────────────────

const RE_SHAN_XIANG = new RegExp(`([${SHAN_CHARS}])\\s*山\\s*([${SHAN_CHARS}])\\s*向`)
const RE_ZUO_XIANG = new RegExp(`坐\\s*([${SHAN_CHARS}])\\s*(?:山)?(?:\\s*向\\s*([${SHAN_CHARS}]))?`)
const RE_ZUO_DIR = new RegExp(`坐\\s*(${DIR_RE})(?:\\s*(?:朝|向|望)\\s*(${DIR_RE}))?`)
const RE_DIR_XIANG = new RegExp(`(${DIR_RE})\\s*向`)
const RE_CHAO = new RegExp(`(?:朝|向)\\s*(${DIR_RE})`)

/**
 * 从所问里提坐向；提不出则随机取山（并标记 approx）。
 * @param {object} chart 盘基。
 * @param {import('../core/kit.js').Rand} rand 随机源。
 * @returns {{zuo:string, xiang:string, source:string, approx:boolean, how:string, note:string}} 坐向。
 */
function resolveOrientation(chart, rand) {
  const q = String(chart?.question ?? '')
  let zuo = null
  let xiang = null
  let how = ''
  let matched = false

  let m = RE_SHAN_XIANG.exec(q)
  if (m) { zuo = m[1]; xiang = m[2]; how = `山向式「${m[0]}」`; matched = true }

  if (!zuo) {
    m = RE_ZUO_XIANG.exec(q)
    if (m) { zuo = m[1]; xiang = m[2] ?? null; how = `坐向式「${m[0]}」`; matched = true }
  }
  if (!zuo) {
    m = RE_ZUO_DIR.exec(q)
    if (m && DIR2SHAN[m[1]]) {
      zuo = DIR2SHAN[m[1]]
      xiang = m[2] ? (DIR2SHAN[m[2]] ?? null) : null
      how = `坐朝式「${m[0]}」（${m[1]}→${zuo}${m[2] ? `，${m[2]}→${xiang}` : ''}）`
      matched = true
    }
  }
  if (!zuo && !xiang) {
    m = RE_DIR_XIANG.exec(q)
    if (m && DIR2SHAN[m[1]]) { xiang = DIR2SHAN[m[1]]; how = `向首式「${m[0]}」`; matched = true }
  }
  if (!zuo && !xiang) {
    m = RE_CHAO.exec(q)
    if (m && DIR2SHAN[m[1]]) { xiang = DIR2SHAN[m[1]]; how = `朝向式「${m[0]}」`; matched = true }
  }

  if (zuo && !xiang) xiang = oppositeShan(zuo)
  if (xiang && !zuo) zuo = oppositeShan(xiang)

  if (!zuo) {
    const z = rand.pick(SHAN24) ?? '子'
    return {
      zuo: z,
      xiang: oppositeShan(z),
      source: 'random',
      approx: true,
      how: '未提供坐向（随机取山）',
      note: `未提供坐向，已随机取山：${z}（向${oppositeShan(z)}）；如需精确请注明坐向（如「坐子向午」「坐北朝南」「卯山酉向」）`,
    }
  }

  const notes = []
  const opp = oppositeShan(zuo)
  if (xiang !== opp) {
    notes.push(`所给向首${xiang}与坐山${zuo}非对宫，已按坐山取对宫${opp}为向`)
    xiang = opp
  }
  if (!matched) notes.push('坐向由推断得出，请核对')
  return { zuo, xiang, source: 'question', approx: false, how, note: notes.join('；') }
}

/**
 * 按坐向来源决定保真度：提不出坐向一律降为 approx。
 * @param {object} entry 条目。
 * @param {object} or 坐向。
 * @param {boolean} [extra] 是否另有近似因素。
 * @returns {'full'|'core'|'approx'} 保真度。
 */
function fidOf(entry, or, extra) {
  if (or?.approx || extra) return 'approx'
  const f = entry?.fidelity
  return f === 'full' || f === 'core' || f === 'approx' ? f : 'core'
}

/** 坐向说明文本（进 detail.说明）。 */
function orText(or) {
  return `坐${or.zuo}山（${degOf(or.zuo)}°·${palaceOf(or.zuo)}宫）向${or.xiang}（${degOf(or.xiang)}°·${palaceOf(or.xiang)}宫），取自${or.how}`
}

// ───────────────────────── 八宅原语 ─────────────────────────

/**
 * 命卦：出生年 + 性别。男 (100−年末两位) mod 9，女 (年末两位+5) mod 9；
 * 余 0 作 9，余 5 男作坤、女作艮。
 * @param {number} year 出生年。
 * @param {string} gender 性别。
 * @returns {string} 命卦名。
 */
function mingGuaFromYear(year, gender) {
  const yy = mod(Math.trunc(Number(year) || 0), 100)
  const r0 = gender === '女' ? mod(yy + 5, 9) : mod(100 - yy, 9)
  const r = r0 === 0 ? 9 : r0
  if (r === 5) return gender === '女' ? '艮' : '坤'
  return HOU2TRI[r] ?? '坎'
}

/**
 * 取命卦（优先出生年，无出生资料则用流年支所属卦兜底）。
 * @param {object} chart 盘基。
 * @returns {{gua:string, from:string, approx:boolean}} 命卦。
 */
function mingGuaOf(chart) {
  const solar = chart?.birthChart?.solar
  const m = /^(\d{4})/.exec(String(solar ?? ''))
  if (m) {
    const y = Number(m[1])
    return { gua: mingGuaFromYear(y, chart.gender), from: `出生年${y}（${chart.gender}命）`, approx: false }
  }
  const g = ZHI_GUA[chart?.yearZhi]
  if (g) return { gua: g, from: `未提供出生年，以流年支${chart.yearZhi}所属${g}卦代命卦`, approx: true }
  return { gua: '坎', from: '出生年与流年支皆不可得，暂以坎卦代命卦', approx: true }
}

/**
 * 大游年：由伏位卦翻出八卦各自的游年九星。
 *
 * 大游年歌每行首字为伏位卦，后七字依次配给「后天八卦顺时针 坎艮震巽离坤兑乾
 * 自伏位卦之后一位起」的七宫。此宫序已用「上中下中上中下」变爻翻卦逐卦校验：
 * 乾宅兑生气、坎宅巽生气、艮宅坤生气、震宅离生气、巽宅坎生气、离宅震生气、
 * 坤宅艮生气、兑宅乾生气 —— 与通行八宅图完全一致。
 *
 * @param {string} gua 伏位卦（宅卦或门卦）。
 * @returns {Object<string,string>} 卦名 → 游年九星名。
 */
function youNianOf(gua) {
  const out = { [gua]: '伏位' }
  const song = BAZHAI_SONG[gua]
  if (!song) return out
  const n = YOU_NIAN_ORDER.length
  const i0 = YOU_NIAN_ORDER.indexOf(gua)
  if (i0 < 0) return out
  const chars = [...song]
  for (let k = 1; k < n; k += 1) {
    const g = YOU_NIAN_ORDER[mod(i0 + k, n)]
    out[g] = STAR_FULL[chars[k - 1]] ?? '伏位'
  }
  return out
}

/** 东四 / 西四。 */
const eastWestOf = (gua) => (EAST_WEST.东四.includes(gua) ? '东四' : '西四')

/** 游年九星表 → 可读串（按后天八卦宫序）。 */
function youNianText(yn) {
  return YOU_NIAN_ORDER.map((g) => `${g}${yn[g] ?? '—'}`).join(' ')
}

// ───────────────────────── 玄空原语 ─────────────────────────

/**
 * 飞星盘：入中之数按洛书轨迹顺飞或逆飞。
 * @param {number} center 入中之数（1..9）。
 * @param {boolean} forward 是否顺飞。
 * @returns {Object<string,number>} 宫 → 星数。
 */
function flyPan(center, forward) {
  const out = {}
  for (let k = 0; k < FLY_ORDER.length; k += 1) {
    out[FLY_ORDER[k]] = mod(center - 1 + (forward ? k : -k), 9) + 1
  }
  return out
}

/**
 * 由公历年定三元九运（1864 起一运，每运 20 年）。
 * @param {number} year 年。
 * @returns {{yun:number, start:number, end:number, yuan:string}} 运。
 */
function yunOf(year) {
  const raw = Math.floor((Number(year) - YUN_START) / YUN_SPAN)
  const yun = mod(raw, 9) + 1
  const start = YUN_START + raw * YUN_SPAN
  return { yun, start, end: start + YUN_SPAN - 1, yuan: SAN_YUAN_NAME[yun] ?? '上元' }
}

/** 九宫盘 → 传统布局串（巽离坤／震中兑／艮坎乾）。 */
function panText(pan) {
  return `巽${pan.巽} 离${pan.离} 坤${pan.坤} ｜ 震${pan.震} 中${pan.中} 兑${pan.兑} ｜ 艮${pan.艮} 坎${pan.坎} 乾${pan.乾}`
}

/** 星数 → 星名。 */
const starName = (n) => STAR_NAME[n] ?? String(n)

/** 运星生旺衰死（相对当运）：0 当旺、1 生气、6/7/8 为过去衰死。 */
function yunQiOf(star, yun) {
  const d = mod(star - yun, 9)
  if (d === 0) return { name: '当旺', score: 90 }
  if (d === 1) return { name: '生气', score: 65 }
  if (d === 2) return { name: '未来气', score: 25 }
  if (d === 3) return { name: '未来气', score: 5 }
  if (d === 4) return { name: '平气', score: -15 }
  if (d === 5) return { name: '平气', score: -25 }
  if (d === 6) return { name: '死气', score: -70 }
  if (d === 7) return { name: '衰气', score: -65 }
  return { name: '退气', score: -45 }
}

/** 三元零正：正神卦 = 当运星之后天卦，零神卦 = 其对宫（五运无零神）。 */
function lingZhengOf(yun) {
  return { zheng: HOU2TRI[yun] ?? null, ling: yun === 5 ? null : (HOU2TRI[10 - yun] ?? null) }
}

// ───────────────────────── 三合 / 水法原语 ─────────────────────────

/** 山 → 双山。 */
const shuangOf = (s) => SHAN2SHUANG[s] ?? '壬子'

/**
 * 双山在指定局里的十二长生位。
 * @param {string} shan 二十四山之一。
 * @param {string} ju 局五行（水/木/火/金）。
 * @returns {string} 十二长生之一。
 */
function changShengShan(shan, ju) {
  const start = SHUANG_SHAN.indexOf(JU_CHANGSHENG_START[ju] ?? '坤申')
  const cur = SHUANG_SHAN.indexOf(shuangOf(shan))
  if (start < 0 || cur < 0) return '—'
  return CHANGSHENG[mod(cur - start, 12)] ?? '—'
}

/** 某局十二长生盘（十二双山）。 */
function juPanText(ju) {
  const start = SHUANG_SHAN.indexOf(JU_CHANGSHENG_START[ju] ?? '坤申')
  return SHUANG_SHAN.map((ss) => `${ss}${CHANGSHENG[mod(SHUANG_SHAN.indexOf(ss) - start, 12)]}`).join(' ')
}

/**
 * 辅星水法二十四山盘：自向首起辅弼，依净阴净阳阳顺阴逆，八星循环三周。
 * @param {string} xiangShan 向首山。
 * @returns {Object<string,string>} 二十四山 → 八星名。
 */
function fuXingPan(xiangShan) {
  const i0 = SHAN_INDEX[xiangShan] ?? 0
  const forward = isJingYang(xiangShan)
  const out = {}
  for (let j = 0; j < 24; j += 1) {
    out[SHAN24[j]] = FU_XING_ORDER[forward ? mod(j - i0, 8) : mod(i0 - j, 8)] ?? '辅弼'
  }
  return out
}

/** 八星盘 → 可读串。 */
function fuXingText(pan) {
  return SHAN24.map((s) => `${s}${pan[s]}`).join(' ')
}

// ───────────────────────── 一百二十分金原语 ─────────────────────────

/**
 * 某山的五分金（甲子起子山起点 352.5°，每格 3° 顺行六十甲子两轮）。
 * @param {string} shan 二十四山之一。
 * @returns {Array<object>} 五个分金。
 */
function fenjinOf(shan) {
  const i = SHAN_INDEX[shan] ?? 0
  const out = []
  for (let j = 0; j < 5; j += 1) {
    const k = i * 5 + j
    const gz = ganzhiOf(k)
    const gan = gz[0]
    const grade = FENJIN_GRADE[gan] ?? '孤虚'
    const from = mod(FENJIN_START_DEG + FENJIN_STEP * k, 360)
    out.push({
      gz,
      gan,
      zhi: gz[1],
      grade,
      score: FENJIN_SCORE[grade] ?? 0,
      nayin: nayinOf(gz),
      from,
      to: mod(from + FENJIN_STEP, 360),
    })
  }
  return out
}

/** 分金表 → 可读串。 */
function fenjinText(list) {
  return list.map((f) => `${f.gz}(${f.grade}·${f.nayin}·${f.from}°~${f.to}°)`).join(' ')
}

// ───────────────────────── 引擎实现 ─────────────────────────

export const engines = {
  // ── 73 八宅明镜 ──
  bazhai(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const zhai = palaceOf(or.zuo)
    const ming = mingGuaOf(chart)
    const yn = youNianOf(zhai)
    const menGua = palaceOf(or.xiang)
    const menStar = yn[menGua] ?? '伏位'
    const mingStar = yn[ming.gua] ?? '伏位'
    const compat = eastWestOf(zhai) === eastWestOf(ming.gua)

    const zhaiWx = guaWxOf(or.zuo)
    const ws = wangShuai(zhaiWx, chart.monthWx)

    let score = compat ? 42 : -38
    score += (STAR_SCORE[menStar] ?? 0) * 0.32
    score += (STAR_SCORE[mingStar] ?? 0) * 0.22
    score += (ws.score - 55) * 0.3
    score = clamp(score, -100, 100)

    const notes = []
    if (or.note) notes.push(or.note)
    if (ming.approx) notes.push(`命卦取法：${ming.from}，属近似`)
    notes.push('八宅以宅卦（坐山）翻大游年定八宫九星；门向所临之星与命卦所临之星并重。东四命宜居东四宅，西四命宜居西四宅。')

    const wuxing = emptyWuxing()
    wuxing[zhaiWx] += 2
    wuxing[guaWxOf(or.xiang)] += 1
    wuxing[chart.monthWx] += 1

    return {
      score,
      essence: `宅卦${zhai}·命卦${ming.gua}（${eastWestOf(ming.gua)}命）门临${menStar}`,
      keys: [`宅${zhai}`, `命${ming.gua}`, `${eastWestOf(zhai)}宅`, menStar, mingStar, compat ? '命宅相配' : '命宅相违'],
      wuxing,
      timing: timingOfWx(guaWxOf(or.xiang), '门方'),
      fidelity: fidOf(entry, or, ming.approx),
      detail: {
        坐向: orText(or),
        宅卦: `${zhai}（${eastWestOf(zhai)}宅·${zhaiWx}·${ws.state}）`,
        命卦: `${ming.gua}（${eastWestOf(ming.gua)}命）— ${ming.from}`,
        命宅相配: compat ? '相配（命宅同东西四，吉）' : '不相配（命宅异东西四，凶）',
        门位: `向首${or.xiang}属${menGua}宫，游年得「${menStar}」（${STAR_SCORE[menStar] ?? 0} 分）`,
        命卦方位: `${ming.gua}宫游年得「${mingStar}」（${STAR_SCORE[mingStar] ?? 0} 分）`,
        游年九星: youNianText(yn),
        八星对应: '伏位=辅弼 生气=贪狼 延年=武曲 天医=巨门 绝命=破军 五鬼=廉贞 六煞=文曲 祸害=禄存',
        断: compat
          ? `${eastWestOf(ming.gua)}命居${eastWestOf(zhai)}宅，命宅一气；门临${menStar}，${(STAR_SCORE[menStar] ?? 0) >= 60 ? '纳吉气' : (STAR_SCORE[menStar] ?? 0) >= 0 ? '气平' : '纳凶气'}`
          : `${eastWestOf(ming.gua)}命居${eastWestOf(zhai)}宅，命宅相违，纵门星吉亦难全美`,
        说明: notes.join(' '),
      },
    }
  },

  // ── 74 玄空·运盘 ──
  xuankongYun(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const y = yunOf(chart?.solar?.y ?? 2024)
    const pan = flyPan(y.yun, true)
    const zuoPalace = palaceOf(or.zuo)
    const xiangPalace = palaceOf(or.xiang)
    const qZuo = yunQiOf(pan[zuoPalace], y.yun)
    const qXiang = yunQiOf(pan[xiangPalace], y.yun)
    const qZhong = yunQiOf(pan.中, y.yun)
    const lz = lingZhengOf(y.yun)

    let score = 0.42 * qZuo.score + 0.42 * qXiang.score + 0.16 * qZhong.score
    if (lz.zheng && zuoPalace === lz.zheng) score += 14
    if (lz.ling && xiangPalace === lz.ling) score += 14
    if (lz.zheng && xiangPalace === lz.zheng) score -= 12
    if (lz.ling && zuoPalace === lz.ling) score -= 12
    score = clamp(score, -100, 100)

    const nextYun = mod(y.yun, 9) + 1
    const wuxing = emptyWuxing()
    wuxing[STAR_WX[pan[zuoPalace]]] += 2
    wuxing[STAR_WX[pan[xiangPalace]]] += 2
    wuxing[chart.monthWx] += 1

    const notes = []
    if (or.note) notes.push(or.note)
    notes.push(`三元九运：${YUN_START} 年起一运、每运 ${YUN_SPAN} 年；运盘为当运星入中顺飞（中→乾→兑→艮→离→坎→坤→震→巽）。`)

    return {
      score,
      essence: `${y.yun}运（${y.yuan}）·坐${zuoPalace}${starName(pan[zuoPalace])}${qZuo.name}·向${xiangPalace}${starName(pan[xiangPalace])}${qXiang.name}`,
      keys: [`${y.yun}运`, y.yuan, `${qZuo.name}到坐`, `${qXiang.name}到向`, lz.zheng ? `正神${lz.zheng}` : '五运无零正'],
      wuxing,
      timing: `${y.end + 1}年交${nextYun}运`,
      fidelity: fidOf(entry, or),
      detail: {
        坐向: orText(or),
        当运: `${y.yun}运（${y.yuan}）${y.start}–${y.end} 年`,
        运盘: panText(pan),
        坐山宫: `${zuoPalace}宫得${starName(pan[zuoPalace])}（${STAR_WX[pan[zuoPalace]]}）·${qZuo.name}`,
        向首宫: `${xiangPalace}宫得${starName(pan[xiangPalace])}（${STAR_WX[pan[xiangPalace]]}）·${qXiang.name}`,
        中宫: `${starName(pan.中)}（当运星入中，${qZhong.name}）`,
        三元零正: lz.zheng ? `正神在${lz.zheng}（宜山宜高），零神在${lz.ling}（宜水宜低）` : '五运居中，零正寄坤艮，此盘不判',
        断: `坐山宫${qZuo.name}、向首宫${qXiang.name}；${qZuo.score + qXiang.score >= 90 ? '坐向皆得生旺，当运可用' : qZuo.score + qXiang.score >= 0 ? '坐向气平，需配合形峦' : '坐向落衰死，宜待运或改造'}；${y.end + 1}年交${nextYun}运，气数将变`,
        说明: notes.join(' '),
      },
    }
  },

  // ── 75 玄空·山向飞星 ──
  xuankongShanXiang(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const y = yunOf(chart?.solar?.y ?? 2024)
    const yunPan = flyPan(y.yun, true)
    const zuoPalace = palaceOf(or.zuo)
    const xiangPalace = palaceOf(or.xiang)

    const ns = yunPan[zuoPalace]                 // 山星入中数 = 运盘坐山宫之数
    const nw = yunPan[xiangPalace]               // 向星入中数 = 运盘向首宫之数
    const zuoFwd = isYangShan(or.zuo)            // 三元龙阴阳：阳顺阴逆
    const xiangFwd = isYangShan(or.xiang)
    const shanPan = flyPan(ns, zuoFwd)
    const xiangPan = flyPan(nw, xiangFwd)

    const wangShan = shanPan[zuoPalace] === y.yun
    const wangXiang = xiangPan[xiangPalace] === y.yun

    const luckAt = (n) => STAR_LUCK_SCORE[n] ?? 0
    let score = 0
    if (wangShan && wangXiang) score += 55
    else if (wangShan || wangXiang) score += 18
    else score -= 45
    score += luckAt(shanPan[zuoPalace]) * 0.22
    score += luckAt(xiangPan[xiangPalace]) * 0.22
    score += (wangShuai(guaWxOf(or.zuo), chart.monthWx).score - 55) * 0.3
    score += (wangShuai(guaWxOf(or.xiang), chart.monthWx).score - 55) * 0.3
    score = clamp(score, -100, 100)

    const pattern = wangShan && wangXiang ? '旺山旺向（到山到向）'
      : (!wangShan && !wangXiang) ? '上山下水'
        : (wangShan ? '旺山不旺向' : '旺向不旺山')

    const wuxing = emptyWuxing()
    wuxing[STAR_WX[shanPan[zuoPalace]]] += 2
    wuxing[STAR_WX[xiangPan[xiangPalace]]] += 2
    wuxing[chart.monthWx] += 1

    const notes = []
    if (or.note) notes.push(or.note)
    notes.push(`山星入中=${ns}（坐山宫运盘数），向星入中=${nw}（向首宫运盘数）；顺逆取三元龙阴阳：坐山${or.zuo}属${yuanLongOf(or.zuo)}为${zuoFwd ? '阳→顺飞' : '阴→逆飞'}，向首${or.xiang}属${yuanLongOf(or.xiang)}为${xiangFwd ? '阳→顺飞' : '阴→逆飞'}。`)
    notes.push('旺山旺向判定：山星盘中坐山宫之星为当运星（山星到山）、向星盘中向首宫之星为当运星（向星到向），二者兼备为旺山旺向，皆不备为上山下水。')

    return {
      score,
      essence: `${or.zuo}山${or.xiang}向·${y.yun}运·山${ns}向${nw}·${pattern}`,
      keys: [`${y.yun}运`, pattern, `山星${ns}`, `向星${nw}`, wangShan ? '山星到山' : '山星不到山', wangXiang ? '向星到向' : '向星不到向'],
      wuxing,
      timing: timingOfWx(STAR_WX[y.yun], '当运星'),
      fidelity: fidOf(entry, or),
      detail: {
        坐向: orText(or),
        当运: `${y.yun}运（${y.yuan}）`,
        运盘: panText(yunPan),
        山星盘: `${panText(shanPan)}（入中${ns}，${zuoFwd ? '顺飞' : '逆飞'}）`,
        向星盘: `${panText(xiangPan)}（入中${nw}，${xiangFwd ? '顺飞' : '逆飞'}）`,
        坐山宫: `山星${starName(shanPan[zuoPalace])} 向星${starName(xiangPan[zuoPalace])}`,
        向首宫: `山星${starName(shanPan[xiangPalace])} 向星${starName(xiangPan[xiangPalace])}`,
        格局: pattern,
        断: wangShan && wangXiang
          ? '山星到山、向星到向，人丁财禄两旺，为当运首选之局'
          : (!wangShan && !wangXiang)
            ? '山上龙神下水、水里龙神上山，丁财两败，宜以形峦裁剪或换运再议'
            : '一旺一衰，偏于丁或偏于财，宜补其不足之处',
        说明: notes.join(' '),
      },
    }
  },

  // ── 76 三合派·二十四山 ──
  sanhe(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const ju = SHUANG_SHAN_WX[shuangOf(or.xiang)] ?? '水'
    const zuoCs = changShengShan(or.zuo, ju)
    const xiangCs = changShengShan(or.xiang, ju)
    const zuoScore = CHANGSHENG_SCORE[zuoCs] ?? 0
    const xiangScore = CHANGSHENG_SCORE[xiangCs] ?? 0
    const ws = wangShuai(ju, chart.monthWx)

    // 来水（按坐方来）宜吉位；去水（按向方去）宜凶位。
    let score = 0.5 * zuoScore + 0.3 * -xiangScore + 0.2 * (ws.score - 55)
    if (JI_SHUI.includes(zuoCs)) score += 8
    if (!JI_SHUI.includes(xiangCs)) score += 6
    score = clamp(score, -100, 100)

    const mu = JU_MU[ju] ?? '—'
    const muZhi = mu[1] ?? ''
    const wuxing = emptyWuxing()
    wuxing[ju] += 3
    wuxing[chart.monthWx] += 1

    const notes = []
    if (or.note) notes.push(or.note)
    notes.push('水口方位未提供，本盘按「水自坐山方来、向首方去」的公开简化口径取值；实际应以实测水口与来去水方位核对。')
    notes.push('三合局：申子辰水、亥卯未木、寅午戌火、巳酉丑金；双山五行每两山一局。以向首双山定局、坐山为入首龙，顺排十二长生。')

    return {
      score,
      essence: `${ju}局·坐${or.zuo}${zuoCs} 向${or.xiang}${xiangCs}（水出${mu}）`,
      keys: [`${ju}局`, `坐${zuoCs}`, `向${xiangCs}`, JI_SHUI.includes(zuoCs) ? '龙得吉位' : '龙失吉位', `水出${mu}`],
      wuxing,
      timing: `${ju}局墓库在${mu}，应于${muZhi}月`,
      fidelity: fidOf(entry, or),
      detail: {
        坐向: orText(or),
        三合局: `${ju}局（向首双山${shuangOf(or.xiang)}属${ju}）`,
        双山: `坐山双山${shuangOf(or.zuo)}（${SHUANG_SHAN_WX[shuangOf(or.zuo)]}）·向首双山${shuangOf(or.xiang)}（${ju}）`,
        坐山长生: `${or.zuo}（${shuangOf(or.zuo)}）在${ju}局为「${zuoCs}」（${zuoScore >= 70 ? '吉' : zuoScore >= 0 ? '平' : '凶'}）`,
        向首长生: `${or.xiang}（${shuangOf(or.xiang)}）在${ju}局为「${xiangCs}」（去水宜凶，${xiangScore <= 0 ? '合宜' : '不宜'}）`,
        局旺衰: `${ju}于${chart.monthWx}月为「${ws.state}」`,
        墓库: `${mu}（去水宜出此方）`,
        帝旺: JU_DIWANG[ju] ?? '—',
        十二长生盘: juPanText(ju),
        断: JI_SHUI.includes(zuoCs)
          ? `来龙（坐山）得${zuoCs}吉位，去水出${mu}墓库，三合联珠之象`
          : `来龙（坐山）落${zuoCs}，龙气不足；去水出${mu}${xiangScore <= 0 ? '尚合' : '，水法欠妥'}`,
        说明: notes.join(' '),
      },
    }
  },

  // ── 77 三元派·三般卦 ──
  sanyuan(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const y = yunOf(chart?.solar?.y ?? 2024)
    const yunPan = flyPan(y.yun, true)
    const zuoPalace = palaceOf(or.zuo)
    const xiangPalace = palaceOf(or.xiang)
    const ns = yunPan[zuoPalace]
    const nw = yunPan[xiangPalace]

    // 三般卦分组：1-4-7 / 2-5-8 / 3-6-9
    const groupOf = (n) => mod(n - 1, 3)
    const gName = ['一四七', '二五八', '三六九']
    const gY = groupOf(y.yun)
    const gS = groupOf(ns)
    const gX = groupOf(nw)
    let guaKind = '不成三般卦'
    let guaScore = 0
    if (gY === gS && gS === gX) { guaKind = '父母三般卦'; guaScore = 90 }
    else if (gS === gX) { guaKind = '连珠三般卦'; guaScore = 60 }
    else if (gY === gS || gY === gX) { guaKind = '半合三般卦'; guaScore = 30 }

    const lz = lingZhengOf(y.yun)
    const zhengDeShan = !!lz.zheng && zuoPalace === lz.zheng
    const lingDeShui = !!lz.ling && xiangPalace === lz.ling
    const lzScore = (zhengDeShan ? 40 : -25) + (lingDeShui ? 40 : -25)

    const ws = wangShuai(guaWxOf(or.zuo), chart.monthWx)
    const score = clamp(0.45 * guaScore + 0.55 * lzScore + (ws.score - 55) * 0.2, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[guaWxOf(or.zuo)] += 2
    wuxing[guaWxOf(or.xiang)] += 1
    wuxing[chart.monthWx] += 1

    const lingWx = lz.ling ? (TRI_BY_NAME[lz.ling]?.wx ?? '土') : null

    const notes = []
    if (or.note) notes.push(or.note)
    notes.push('三般卦按公开分组 1-4-7／2-5-8／3-6-9：运星、山星、向星三数同组为父母三般卦，山向两星同组为连珠三般卦，仅两数同组为半合。')
    notes.push('各派对三般卦的成立条件（是否须同宫相连、是否兼看零正）说法不一，本盘取上述可复核的取值法，故标 approx。')

    return {
      score,
      essence: `${guaKind}（${gName[gY]}）·${y.yun}运山${ns}向${nw}·零正${zhengDeShan && lingDeShui ? '得位' : '有失'}`,
      keys: [guaKind, gName[gY], `山${ns}`, `向${nw}`, zhengDeShan ? '正神得山' : '正神失位', lingDeShui ? '零神得水' : '零神失位'],
      wuxing,
      timing: lingWx ? timingOfWx(lingWx, '零神方') : null,
      fidelity: fidOf(entry, or, true),
      detail: {
        坐向: orText(or),
        三元: `${y.yun}运（${y.yuan}）`,
        三数: `运星${y.yun}、山星${ns}、向星${nw}`,
        三般卦: `${guaKind}（运星属${gName[gY]}，山星属${gName[gS]}，向星属${gName[gX]}）`,
        三元零正: lz.zheng ? `正神${lz.zheng}（宜山）、零神${lz.ling}（宜水）` : '五运无零正',
        零正得失: `坐山宫${zuoPalace}${zhengDeShan ? '得正神' : '非正神'}；向首宫${xiangPalace}${lingDeShui ? '得零神' : '非零神'}`,
        运盘: panText(yunPan),
        断: `${guaKind}；${zhengDeShan && lingDeShui ? '正神得山、零神得水，三元不败之局' : zhengDeShan || lingDeShui ? '零正只得其一，福力减半' : '零正两失，宜改向或待运'}；坐山${guaWxOf(or.zuo)}于月令为「${ws.state}」`,
        说明: notes.join(' '),
      },
    }
  },

  // ── 78 九星水法 ──
  jiuxingShuiFa(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const xiangGua = palaceOf(or.xiang)
    const zuoGua = palaceOf(or.zuo)
    // 八星翻卦：以向首卦起辅弼（伏位），八星名与八宅游年九星同源。
    const yn = youNianOf(xiangGua)
    const zuoStar = STAR_TO_FUXING[yn[zuoGua] ?? '伏位'] ?? '辅弼'
    const xiangStar = STAR_TO_FUXING[yn[xiangGua] ?? '伏位'] ?? '辅弼'
    const zuoScore = FU_XING_SCORE[zuoStar] ?? 0
    const xiangScore = FU_XING_SCORE[xiangStar] ?? 0
    // 二十四山辅星盘（口诀「辅武破廉贪巨禄文」，净阴净阳顺逆）
    const pan = fuXingPan(or.xiang)
    const shanStar = pan[or.zuo] ?? '辅弼'
    const shanScore = FU_XING_SCORE[shanStar] ?? 0

    const wx = fuxingWx(shanStar)
    const ws = wangShuai(wx, chart.monthWx)

    let score = 0.6 * zuoScore + 0.2 * shanScore + 0.2 * (ws.score - 55) - 18
    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[wx] += 2
    wuxing[chart.monthWx] += 1

    const notes = []
    if (or.note) notes.push(or.note)
    notes.push('水口方位未提供：本盘以坐山方为「来水／来龙」、向首方为「去水」。来水宜贪狼巨门武曲辅弼，去水宜破军禄存文曲廉贞；因起卦以向首为辅弼，去水方恒得吉星，故统一减分。实际请按实测水口方位在下表核对。')
    notes.push('主判取八星翻卦（以向首卦起辅弼，星名与八宅游年同源：辅弼=伏位、武曲=延年、贪狼=生气、巨门=天医、禄存=祸害、文曲=六煞、廉贞=五鬼、破军=绝命）。')
    notes.push('另附二十四山辅星盘，取口诀「辅武破廉贪巨禄文」，依净阴净阳（阳顺阴逆）每山一星、循环三周；各派辅星排法起甲不同，故本条 fidelity 标 approx。')

    return {
      score,
      essence: `坐${or.zuo}${zuoStar}·向${or.xiang}${xiangStar}（来水${FU_XING_JI[zuoStar] ? '吉星' : '凶星'}）`,
      keys: [`坐${zuoStar}`, `向${xiangStar}`, FU_XING_JI[zuoStar] ? '来水吉星' : '来水凶星', FU_XING_JI[xiangStar] ? '去水吉星' : '去水凶星', `山盘${shanStar}`],
      wuxing,
      timing: timingOfWx(wx, '坐山星'),
      fidelity: fidOf(entry, or, true),
      detail: {
        坐向: orText(or),
        八星翻卦: `以向首${xiangGua}卦起辅弼，翻得：${youNianText(Object.fromEntries(Object.entries(yn).map(([g, s]) => [g, STAR_TO_FUXING[s] ?? s])))}`,
        坐山星: `${or.zuo}（${zuoGua}宫）得「${zuoStar}」（${zuoScore} 分，${FU_XING_JI[zuoStar] ? '吉星' : '凶星'}）`,
        向首星: `${or.xiang}（${xiangGua}宫）得「${xiangStar}」（${xiangScore} 分，${FU_XING_JI[xiangStar] ? '吉星' : '凶星'}）`,
        二十四山辅星盘: fuXingText(pan),
        坐山辅星: `${or.zuo}在辅星盘得「${shanStar}」（${shanScore} 分，属${wx}·${ws.state}）`,
        断: FU_XING_JI[zuoStar]
          ? `来水得${zuoStar}吉星，水聚生财；去水临${xiangStar}${FU_XING_JI[xiangStar] ? '（吉星，去水不宜，主财来财去）' : '（凶星，去水合宜，煞随水去）'}`
          : `来水得${zuoStar}凶星，主破耗疾病；去水临${xiangStar}${FU_XING_JI[xiangStar] ? '（吉星，吉水外流，财不聚）' : '（凶星，去水合宜）'}`,
        说明: notes.join(' '),
      },
    }
  },

  // ── 79 阳宅三要 ──
  yangzhai(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const menGua = palaceOf(or.xiang)      // 门：向首
    const zhuGua = palaceOf(or.zuo)        // 主：坐山
    const yn = youNianOf(menGua)
    const zaoGua = Object.keys(yn).find((g) => yn[g] === '生气') ?? menGua  // 灶：门卦生气方

    const menWx = TRI_BY_NAME[menGua]?.wx ?? '土'
    const zhuWx = TRI_BY_NAME[zhuGua]?.wx ?? '土'
    const zaoWx = TRI_BY_NAME[zaoGua]?.wx ?? '土'

    const r1 = relation(menWx, zhuWx)  // 门 → 主
    const r2 = relation(zhuWx, zaoWx)  // 主 → 灶
    const r3 = relation(zaoWx, menWx)  // 灶 → 门
    const bias = { 生我: 75, 我生: 65, 比和: 45, 我克: -35, 克我: -55 }
    const relScore = (r) => bias[r] ?? 0

    const allSheng = [r1, r2, r3].every((r) => r === '生我' || r === '我生' || r === '比和')
    const allKe = [r1, r2, r3].every((r) => r === '我克' || r === '克我')
    let score = (relScore(r1) + relScore(r2) + relScore(r3)) / 3
    if (allSheng) score += 12
    if (allKe) score -= 12
    const ming = mingGuaOf(chart)
    const mingMatch = eastWestOf(zhuGua) === eastWestOf(ming.gua)
    score += mingMatch ? 8 : -8
    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[menWx] += 1
    wuxing[zhuWx] += 1
    wuxing[zaoWx] += 1
    wuxing[chart.monthWx] += 1

    const notes = []
    if (or.note) notes.push(or.note)
    notes.push('门、主、灶三方位：门取向首（向首为门）、主取坐山（坐山为主房）、灶取门卦游年「生气」方。实际灶位与主房位置应由户型图核对。')
    if (ming.approx) notes.push(`命卦取法：${ming.from}，属近似`)

    return {
      score,
      essence: `门${menGua}(${menWx}) 主${zhuGua}(${zhuWx}) 灶${zaoGua}(${zaoWx})·${allSheng ? '三要相生' : allKe ? '三要相克' : '生克互见'}`,
      keys: [`门${menGua}`, `主${zhuGua}`, `灶${zaoGua}`, allSheng ? '三要相生' : allKe ? '三要相克' : '生克互见', r1, r2],
      wuxing,
      timing: timingOfWx(zaoWx, '灶方'),
      fidelity: fidOf(entry, or, ming.approx),
      detail: {
        坐向: orText(or),
        门: `${or.xiang}属${menGua}宫（${menWx}·${TRI_BY_NAME[menGua]?.dir ?? ''}）`,
        主: `${or.zuo}属${zhuGua}宫（${zhuWx}·${TRI_BY_NAME[zhuGua]?.dir ?? ''}）`,
        灶: `${zaoGua}宫（${zaoWx}·门卦${menGua}之生气方）`,
        门主关系: `门${menWx} → 主${zhuWx}：${r1}`,
        主灶关系: `主${zhuWx} → 灶${zaoWx}：${r2}`,
        灶门关系: `灶${zaoWx} → 门${menWx}：${r3}`,
        命宅: `${ming.gua}（${eastWestOf(ming.gua)}命）居${eastWestOf(zhuGua)}宅，${mingMatch ? '相配' : '不相配'}`,
        游年九星: youNianText(yn),
        断: allSheng
          ? '门主灶三者循环相生，人口安泰、财禄渐旺'
          : allKe
            ? '门主灶三者循环相克，主口舌疾病、财丁不聚，宜改门或移灶'
            : `三者生克互见（${r1}／${r2}／${r3}），吉凶相半，宜就凶处调理`,
        说明: notes.join(' '),
      },
    }
  },

  // ── 80 形势派·四灵 ──
  xingshi(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const i = SHAN_INDEX[or.zuo] ?? 0
    const xuanwu = shanAt(i)            // 后（坐）
    const zhuque = shanAt(i + 12)       // 前（向）
    const qinglong = shanAt(i + 6)      // 左
    const baihu = shanAt(i + 18)        // 右

    const wxXuan = guaWxOf(xuanwu)
    const wxQing = guaWxOf(qinglong)
    const wxBai = guaWxOf(baihu)
    const wxZhu = guaWxOf(zhuque)

    const sXuan = wangShuai(wxXuan, chart.monthWx)
    const sQing = wangShuai(wxQing, chart.monthWx)
    const sBai = wangShuai(wxBai, chart.monthWx)
    const sZhu = wangShuai(wxZhu, chart.monthWx)

    const xuanPart = clamp((sXuan.score - 55) * 0.9, -50, 50)
    const d = sQing.score - sBai.score
    const longHuPart = clamp(40 - Math.abs(d - 25) * 0.8, -50, 50)        // 龙宜略强于虎
    const zhuPart = clamp(35 - Math.abs(sZhu.score - 60) * 0.6, -50, 50)  // 明堂宜开阔平和

    const relA = relation(wxXuan, wxQing)  // 后 → 左
    const relB = relation(wxQing, wxZhu)   // 左 → 前
    const flowScore = { 我生: 35, 比和: 28, 生我: 18, 我克: -12, 克我: -28 }
    const flowPart = ((flowScore[relA] ?? 0) + (flowScore[relB] ?? 0)) / 2

    const score = clamp(0.3 * xuanPart + 0.3 * longHuPart + 0.2 * zhuPart + 0.2 * flowPart, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[wxXuan] += 1
    wuxing[wxQing] += 1
    wuxing[wxBai] += 1
    wuxing[wxZhu] += 1

    const notes = []
    if (or.note) notes.push(or.note)
    notes.push('形峦（山体高低、水路走向、远近逼压）须实地勘察，本盘只按坐向定四灵方位，以五行旺衰拟「势」之强弱，不代替现场目验。')

    return {
      score,
      essence: `玄武${xuanwu}(${sXuan.state}) 青龙${qinglong}(${sQing.state}) 白虎${baihu}(${sBai.state}) 朱雀${zhuque}(${sZhu.state})`,
      keys: [`玄武${sXuan.state}`, `青龙${sQing.state}`, `白虎${sBai.state}`, `朱雀${sZhu.state}`, d > 0 ? '龙强虎弱' : '虎强龙弱'],
      wuxing,
      timing: timingOfWx(wxXuan, '玄武靠山'),
      fidelity: fidOf(entry, or),
      detail: {
        坐向: orText(or),
        玄武: `后·${xuanwu}（${wxXuan}·${palaceOf(xuanwu)}宫）${sXuan.state} — 宜高耸有靠`,
        朱雀: `前·${zhuque}（${wxZhu}·${palaceOf(zhuque)}宫）${sZhu.state} — 宜开阔明亮、有水有情`,
        青龙: `左·${qinglong}（${wxQing}·${palaceOf(qinglong)}宫）${sQing.state} — 宜蜿蜒略高`,
        白虎: `右·${baihu}（${wxBai}·${palaceOf(baihu)}宫）${sBai.state} — 宜低伏驯顺`,
        龙虎之势: `青龙${sQing.score} 对 白虎${sBai.score}（差 ${d > 0 ? '+' : ''}${d}）→ ${d > 40 ? '青龙过强，恐欺主' : d < 0 ? '白虎抬头，主是非破财' : '龙虎相安，龙略胜虎为佳'}`,
        五行流通: `玄武${wxXuan} → 青龙${wxQing}：${relA}；青龙${wxQing} → 朱雀${wxZhu}：${relB}`,
        断: [
          sXuan.score >= 75 ? '玄武得令，靠山有力，人丁安稳' : sXuan.score <= 40 ? '玄武失令，后靠空虚，主根基不固' : '玄武平平，后靠尚可',
          d < 0 ? '白虎强于青龙，宜于右侧植绿、减其锐气' : '青龙不弱于白虎，四灵得序',
          sZhu.score >= 75 ? '朱雀过旺，明堂有逼压之嫌' : '朱雀平和，明堂开阔',
        ].join('；'),
        说明: notes.join(' '),
      },
    }
  },

  // ── 81 罗盘二十四山 ──
  luopan(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const zi = SHAN_INDEX[or.zuo] ?? 0
    const zuoGua = palaceOf(or.zuo)
    const xiangGua = palaceOf(or.xiang)
    const zuoYuan = yuanLongOf(or.zuo)
    const xiangYuan = yuanLongOf(or.xiang)
    const chuGua = zuoYuan !== xiangYuan
    const chaCuo = isYangShan(or.zuo) !== isYangShan(or.xiang)

    // 山界空亡：界 m 位于 7.5+15m 度；m ≡ 1 (mod 3) 为大空亡（八宫交界），余为小空亡。
    const boundary = (mm) => ({ deg: mod(7.5 + 15 * mm, 360), big: mod(mm, 3) === 1 })
    const bl = boundary(mod(zi - 1, 24))
    const br = boundary(mod(zi, 24))
    const zuoBig = bl.big || br.big

    const zuoWx = guaWxOf(or.zuo)
    const xiangWx = guaWxOf(or.xiang)
    const ws = wangShuai(zuoWx, chart.monthWx)
    const rel = relation(zuoWx, xiangWx)

    let score = 30
    score += chuGua ? -30 : 12
    score += chaCuo ? -25 : 8
    if (zuoBig) score -= 8
    score += (ws.score - 55) * 0.35
    score += ({ 比和: 15, 生我: 20, 我生: 5, 我克: -5, 克我: -18 }[rel] ?? 0)
    if (!ZHI_SHAN.includes(or.zuo)) score -= 6
    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[zuoWx] += 2
    wuxing[xiangWx] += 1
    wuxing[chart.monthWx] += 1

    const notes = []
    if (or.note) notes.push(or.note)
    notes.push('二十四山每山 15°，子山中心为正北 0°，顺时针递加。正针立向取山中心；兼针（偏 3°~7.5°）须与邻山同元龙，否则出卦。')
    notes.push('大空亡 = 八卦分界（22.5°+45k 共八线）；小空亡 = 本卦内三山交界（共十六线）。正针落山中心，距两界各 7.5°，故不犯空亡。')

    return {
      score,
      essence: `坐${or.zuo}（${degOf(or.zuo)}°·${zuoGua}宫·${zuoYuan}）向${or.xiang}（${degOf(or.xiang)}°·${xiangGua}宫）${chuGua ? '出卦' : '不出卦'}`,
      keys: [`坐${or.zuo}`, `向${or.xiang}`, `${zuoGua}宫`, zuoYuan, chuGua ? '出卦' : '不出卦', chaCuo ? '阴阳差错' : '净阴净阳'],
      wuxing,
      timing: timingOfWx(zuoWx, '坐卦'),
      fidelity: fidOf(entry, or),
      detail: {
        坐向: orText(or),
        坐山: `${or.zuo}山 ${degOf(or.zuo)}°（${mod(degOf(or.zuo) - 7.5, 360)}°~${mod(degOf(or.zuo) + 7.5, 360)}°）属${zuoGua}宫（${zuoWx}·${zuoYuan}·${isYangShan(or.zuo) ? '阳' : '阴'}）`,
        向首: `${or.xiang}山 ${degOf(or.xiang)}°属${xiangGua}宫（${xiangWx}·${xiangYuan}·${isYangShan(or.xiang) ? '阳' : '阴'}）`,
        八卦分宫: TRIGRAMS.map((t) => `${t.name}${t.dir}`).join(' '),
        本卦三山: `${zuoGua}宫管${SHAN24.filter((s) => palaceOf(s) === zuoGua).join('、')}`,
        出卦差错: `坐山${zuoYuan}${isYangShan(or.zuo) ? '阳' : '阴'}，向首${xiangYuan}${isYangShan(or.xiang) ? '阳' : '阴'} → ${chuGua ? '出卦（元龙不一）' : '不出卦'}、${chaCuo ? '阴阳差错' : '净阴净阳'}`,
        空亡线: `左界 ${bl.deg}°（${bl.big ? '大空亡·八宫交界' : '小空亡·本卦三山交界'}）、右界 ${br.deg}°（${br.big ? '大空亡·八宫交界' : '小空亡·本卦三山交界'}）`,
        立向区间: `正针安全区 ${mod(degOf(or.zuo) - 3, 360)}°~${mod(degOf(or.zuo) + 3, 360)}°；超出则入兼针，须同元龙`,
        卦关系: `坐卦${zuoWx} 与 向卦${xiangWx}：${rel}`,
        断: `${chuGua ? '山向元龙不一，为出卦，主长幼失序、人丁不安' : '山向同元龙，不出卦'}；${chaCuo ? '阴阳混杂为差错，主家宅不宁' : '净阴净阳，气纯'}；坐山${zuoWx}于月令为「${ws.state}」${zuoBig ? '；两侧邻大空亡线，兼针须谨慎' : ''}`,
        说明: notes.join(' '),
      },
    }
  },

  // ── 82 六十甲子分金 ──
  fenjin(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const zuoList = fenjinOf(or.zuo)
    const xiangList = fenjinOf(or.xiang)
    const zuoZheng = zuoList[2] ?? zuoList[0]
    const xiangZheng = xiangList[2] ?? xiangList[0]
    const zhengWx = nayinWx(zuoZheng?.nayin)
    const ws = wangShuai(zhengWx, chart.monthWx)
    const guaWx = guaWxOf(or.zuo)
    const rel = relation(zhengWx, guaWx)

    // 五格纳音中「生我／比和」坐卦的格数（多则助坐山）
    const helpCount = (list) => list.filter((f) => {
      const r = relation(nayinWx(f.nayin), guaWx)
      return r === '生我' || r === '比和'
    }).length
    const helpZuo = helpCount(zuoList)
    const helpXiang = helpCount(xiangList)
    const kongIdx = zuoList.findIndex((f) => f.grade === '空亡')

    let score = 10
    score += 18                                   // 正针恒为旺相分金
    score += (ws.score - 55) * 0.45
    score += ({ 生我: 20, 比和: 12, 我生: -5, 我克: -12, 克我: -25 }[rel] ?? 0)
    score += (helpZuo - 2.5) * 6
    score += (helpXiang - 2.5) * 3
    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[zhengWx] += 3
    wuxing[guaWx] += 1
    wuxing[chart.monthWx] += 1

    const notes = []
    if (or.note) notes.push(or.note)
    notes.push(`一百二十分金：甲子起于子山起点 ${FENJIN_START_DEG}°，每格 ${FENJIN_STEP}° 顺行六十甲子两轮，共 120 格、每山五格；此排法使每山正中恰为丙/辛旺相分金。`)
    notes.push('另有「透地六十龙」只排十二地支山（每山五龙，支同本山），与本盘排法不同派，此处不取。')
    notes.push('丙丁庚辛为旺相（吉）、戊己为空亡（凶）、甲乙壬癸为孤虚（半吉半凶）；吉凶另参纳音五行与月令旺衰。')

    return {
      score,
      essence: `坐${or.zuo}正针分金${zuoZheng?.gz}（${zuoZheng?.grade}·${zuoZheng?.nayin}）向${xiangZheng?.gz}`,
      keys: [`${or.zuo}山${zuoZheng?.gz}`, zuoZheng?.grade ?? '—', zuoZheng?.nayin ?? '—', `向${xiangZheng?.gz}`, `纳音${zhengWx}${ws.state}`],
      wuxing,
      timing: timingOfWx(zhengWx, '正针分金纳音'),
      fidelity: fidOf(entry, or),
      detail: {
        坐向: orText(or),
        正针分金: `${or.zuo}山正中 ${degOf(or.zuo)}° 落 ${zuoZheng?.gz}（${zuoZheng?.grade}·${zuoZheng?.nayin}·${zuoZheng?.from}°~${zuoZheng?.to}°）`,
        向首分金: `${or.xiang}山正中 ${degOf(or.xiang)}° 落 ${xiangZheng?.gz}（${xiangZheng?.grade}·${xiangZheng?.nayin}）`,
        坐山五分金: fenjinText(zuoList),
        向首五分金: fenjinText(xiangList),
        纳音五行: `${zuoZheng?.nayin}属${zhengWx}，于${chart.monthWx}月为「${ws.state}」；与坐卦${guaWx}关系：${rel}`,
        吉凶等级: FENJIN_NOTE[zuoZheng?.grade ?? '孤虚'] ?? '',
        断: `${zuoZheng?.grade === '旺相' ? '坐山正针得旺相分金，立向可用' : zuoZheng?.grade === '空亡' ? '坐山正针压空亡分金，立向大忌，宜偏取旺相格' : '坐山正针落孤虚分金，吉凶相半，宜微调取丙丁庚辛'}；本山空亡格在自山起第 ${kongIdx + 1} 格（共五格），放线时尤须避开该 3° 带`,
        说明: notes.join(' '),
      },
    }
  },
}

export default engines
