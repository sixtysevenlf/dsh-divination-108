/**
 * 术数内核 · 基础工具箱
 *
 * 这里只放**所有术法共用**的东西：干支五行、生克、旺衰、十二长生、纳音、旬空、
 * 确定性随机源、评分归一化。任何与具体术法有关的数据都不放这里。
 *
 * 设计约束（重要）：
 * 1. **纯函数**：不读时钟、不读文件、不联网。时刻由 calendar 层注入。
 * 2. **确定性**：所有"随机"必须走 {@link makeRand}，种子由「问题 + 时刻 + 法号」派生。
 *    同一个问题在同一时刻重复求占，必须得到同一结果 —— 否则 108 法合盘不可复核。
 * 3. 输出给模型看的字符串一律走 {@link verdictOf} 归一化，避免各法自造等级。
 */

// ───────────────────────────── 基本表 ─────────────────────────────

export const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
export const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
export const WUXING = ['木', '火', '土', '金', '水']
export const WUXING_ORDER = ['木', '火', '土', '金', '水']

/** 天干五行。 */
export const GAN_WUXING = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' }
/** 天干阴阳：true = 阳。 */
export const GAN_YANG = { 甲: true, 乙: false, 丙: true, 丁: false, 戊: true, 己: false, 庚: true, 辛: false, 壬: true, 癸: false }
/** 地支五行。 */
export const ZHI_WUXING = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' }
/** 地支阴阳：true = 阳。 */
export const ZHI_YANG = { 子: true, 丑: false, 寅: true, 卯: false, 辰: true, 巳: false, 午: true, 未: false, 申: true, 酉: false, 戌: true, 亥: false }
/** 地支生肖。 */
export const ZHI_ANIMAL = { 子: '鼠', 丑: '牛', 寅: '虎', 卯: '兔', 辰: '龙', 巳: '蛇', 午: '马', 未: '羊', 申: '猴', 酉: '鸡', 戌: '狗', 亥: '猪' }
/** 地支时辰范围（24 小时制起点，子时跨日）。 */
export const ZHI_HOUR = { 子: 23, 丑: 1, 寅: 3, 卯: 5, 辰: 7, 巳: 9, 午: 11, 未: 13, 申: 15, 酉: 17, 戌: 19, 亥: 21 }

/** 地支藏干（本气、中气、余气，按力量降序）。 */
export const ZHI_CANGGAN = {
  子: ['癸'], 丑: ['己', '癸', '辛'], 寅: ['甲', '丙', '戊'], 卯: ['乙'],
  辰: ['戊', '乙', '癸'], 巳: ['丙', '庚', '戊'], 午: ['丁', '己'], 未: ['己', '丁', '乙'],
  申: ['庚', '壬', '戊'], 酉: ['辛'], 戌: ['戊', '辛', '丁'], 亥: ['壬', '甲'],
}

/** 地支六合。 */
export const ZHI_LIUHE = { 子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯', 辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午' }
/** 地支六冲。 */
export const ZHI_LIUCHONG = { 子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅', 卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳' }
/** 地支三合局（长生·帝旺·墓库）。 */
export const ZHI_SANHE = { 申: '水', 子: '水', 辰: '水', 亥: '木', 卯: '木', 未: '木', 寅: '火', 午: '火', 戌: '火', 巳: '金', 酉: '金', 丑: '金' }
/** 地支三会方局。 */
export const ZHI_SANHUI = { 寅: '木', 卯: '木', 辰: '木', 巳: '火', 午: '火', 未: '火', 申: '金', 酉: '金', 戌: '金', 亥: '水', 子: '水', 丑: '水' }
/** 地支相刑。 */
export const ZHI_XIANGXING = ['寅巳申', '丑戌未', '子卯', '辰午酉亥']
/** 地支相害。 */
export const ZHI_XIANGHAI = { 子: '未', 未: '子', 丑: '午', 午: '丑', 寅: '巳', 巳: '寅', 卯: '辰', 辰: '卯', 申: '亥', 亥: '申', 酉: '戌', 戌: '酉' }

/** 十二长生序列。 */
export const CHANGSHENG = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养']
/** 十干长生起点（阳干顺行、阴干逆行）。 */
export const CHANGSHENG_START = { 甲: '亥', 乙: '午', 丙: '寅', 丁: '酉', 戊: '寅', 己: '酉', 庚: '巳', 辛: '子', 壬: '申', 癸: '卯' }

/** 六十甲子纳音（每两个甲子一组）。 */
export const NAYIN = {
  甲子: '海中金', 乙丑: '海中金', 丙寅: '炉中火', 丁卯: '炉中火', 戊辰: '大林木', 己巳: '大林木',
  庚午: '路旁土', 辛未: '路旁土', 壬申: '剑锋金', 癸酉: '剑锋金', 甲戌: '山头火', 乙亥: '山头火',
  丙子: '涧下水', 丁丑: '涧下水', 戊寅: '城头土', 己卯: '城头土', 庚辰: '白蜡金', 辛巳: '白蜡金',
  壬午: '杨柳木', 癸未: '杨柳木', 甲申: '泉中水', 乙酉: '泉中水', 丙戌: '屋上土', 丁亥: '屋上土',
  戊子: '霹雳火', 己丑: '霹雳火', 庚寅: '松柏木', 辛卯: '松柏木', 壬辰: '长流水', 癸巳: '长流水',
  甲午: '砂中金', 乙未: '砂中金', 丙申: '山下火', 丁酉: '山下火', 戊戌: '平地木', 己亥: '平地木',
  庚子: '壁上土', 辛丑: '壁上土', 壬寅: '金箔金', 癸卯: '金箔金', 甲辰: '覆灯火', 乙巳: '覆灯火',
  丙午: '天河水', 丁未: '天河水', 戊申: '大驿土', 己酉: '大驿土', 庚戌: '钗钏金', 辛亥: '钗钏金',
  壬子: '桑柘木', 癸丑: '桑柘木', 甲寅: '大溪水', 乙卯: '大溪水', 丙辰: '沙中土', 丁巳: '沙中土',
  戊午: '天上火', 己未: '天上火', 庚申: '石榴木', 辛酉: '石榴木', 壬戌: '大海水', 癸亥: '大海水',
}

/** 六甲旬空（旬首 → 空亡两支）。 */
export const XUNKONG = {
  甲子: ['戌', '亥'], 甲戌: ['申', '酉'], 甲申: ['午', '未'],
  甲午: ['辰', '巳'], 甲辰: ['寅', '卯'], 甲寅: ['子', '丑'],
}

/** 五行生克。 */
export const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }
export const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }
/** 反查：谁生我 / 谁克我。 */
export const SHENG_BY = { 火: '木', 土: '火', 金: '土', 水: '金', 木: '水' }
export const KE_BY = { 土: '木', 水: '土', 火: '水', 金: '火', 木: '金' }

/** 五行配色（客户端 UI 用）。 */
export const WUXING_COLOR = { 木: '#3f9e63', 火: '#d9534f', 土: '#b8860b', 金: '#c9a227', 水: '#3b7dd8' }

// ───────────────────────────── 五行关系 ─────────────────────────────

/**
 * 判断 a 与 b 的五行关系（以 a 为主体）。
 * @param {string} a 主体五行。
 * @param {string} b 客体五行。
 * @returns {'比和'|'我生'|'生我'|'我克'|'克我'} 关系名。
 */
export function relation(a, b) {
  if (a === b) return '比和'
  if (SHENG[a] === b) return '我生'
  if (SHENG[b] === a) return '生我'
  if (KE[a] === b) return '我克'
  return '克我'
}

/**
 * 关系对应的吉凶倾向分（-100..100）。这是**通用先验**，
 * 各术法可覆盖（例如六爻里"我克"是妻财、多为吉；风水里"克我"是煞）。
 * @param {string} rel 关系名。
 * @param {object} [bias] 各关系覆盖值。
 * @returns {number} 分数。
 */
export function relationScore(rel, bias) {
  const base = { 比和: 20, 我生: 8, 生我: 45, 我克: 25, 克我: -40 }
  const table = bias ? { ...base, ...bias } : base
  return table[rel] ?? 0
}

/**
 * 按月令判五行旺衰。
 * 规则：当令旺、令生者相、生令者休、克令者囚、令克者死。
 * @param {string} wx 待判五行。
 * @param {string} monthWx 月令五行。
 * @returns {{state:string, score:number}} 旺衰状态与力量系数分。
 */
export function wangShuai(wx, monthWx) {
  if (wx === monthWx) return { state: '旺', score: 100 }
  if (SHENG[monthWx] === wx) return { state: '相', score: 75 }
  if (SHENG[wx] === monthWx) return { state: '休', score: 40 }
  if (KE[wx] === monthWx) return { state: '囚', score: 25 }
  return { state: '死', score: 10 }
}

// ───────────────────────────── 干支推算 ─────────────────────────────

/**
 * 六十甲子序号（0..59）→ 干支。
 * @param {number} index 序号。
 * @returns {string} 例如 `甲子`。
 */
export function ganzhiOf(index) {
  const i = mod(index, 60)
  return GAN[i % 10] + ZHI[i % 12]
}

/** 取模（结果恒非负）。 */
export function mod(n, m) {
  return ((n % m) + m) % m
}

/**
 * 天干在地支上的十二长生位。
 * @param {string} gan 天干。
 * @param {string} zhi 地支。
 * @returns {string} 长生十二神之一。
 */
export function changShengOf(gan, zhi) {
  const start = CHANGSHENG_START[gan]
  if (start === undefined) return '—'
  const offset = mod(ZHI.indexOf(zhi) - ZHI.indexOf(start), 12)
  const step = GAN_YANG[gan] ? offset : mod(-offset, 12)
  return CHANGSHENG[step]
}

/**
 * 干支纳音。
 * @param {string} gz 干支（两字）。
 * @returns {string} 纳音名。
 */
export function nayinOf(gz) {
  return NAYIN[gz] ?? '—'
}

/**
 * 干支所属旬与旬空。
 * @param {string} gz 干支（两字）。
 * @returns {{xun:string, kong:string[]}} 旬首与空亡两支。
 */
export function xunOf(gz) {
  const gi = GAN.indexOf(gz[0])
  const zi = ZHI.indexOf(gz[1])
  if (gi < 0 || zi < 0) return { xun: '—', kong: [] }
  // 旬首：干支同时后退 min(gi, zi) 步
  const back = Math.min(gi, zi)
  const xun = GAN[gi - back] + ZHI[zi - back]
  return { xun, kong: XUNKONG[xun] ?? [] }
}

/**
 * 日干支起六神（青龙→玄武）。
 * @param {string} dayGan 日干。
 * @param {number} lineIndex 爻位（0 = 初爻）。
 * @returns {string} 六神名。
 */
export function liuShenOf(dayGan, lineIndex) {
  const startTable = [0, 0, 1, 1, 2, 3, 4, 4, 5, 5]
  const gi = GAN.indexOf(dayGan)
  if (gi < 0) return '—'
  return ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武'][mod(startTable[gi] + lineIndex, 6)]
}

/**
 * 十神：以日主为我，判某天干的十神。
 * @param {string} dayGan 日主天干。
 * @param {string} other 待判天干。
 * @returns {string} 十神名。
 */
export function tenGodOf(dayGan, other) {
  const me = GAN_WUXING[dayGan]
  const it = GAN_WUXING[other]
  if (!me || !it) return '—'
  const same = GAN_YANG[dayGan] === GAN_YANG[other]
  const rel = relation(me, it)
  if (rel === '比和') return same ? '比肩' : '劫财'
  if (rel === '我生') return same ? '食神' : '伤官'
  if (rel === '生我') return same ? '偏印' : '正印'
  if (rel === '我克') return same ? '偏财' : '正财'
  return same ? '七杀' : '正官'
}

/**
 * 地支藏干十神（取本气与中气）。
 * @param {string} dayGan 日主。
 * @param {string} zhi 地支。
 * @returns {Array<{gan:string, god:string, level:string}>} 藏干与十神。
 */
export function cangGanGods(dayGan, zhi) {
  const list = ZHI_CANGGAN[zhi] ?? []
  const level = ['本气', '中气', '余气']
  return list.map((g, i) => ({ gan: g, god: tenGodOf(dayGan, g), level: level[i] ?? '余气' }))
}

/** 四柱各柱的常见神煞（驿马、桃花、贵人、华盖、将星）。 */
export const SHENSHA = {
  /** 三合局 → 驿马（寅申巳亥）。 */
  驿马: { 申: '寅', 子: '寅', 辰: '寅', 寅: '申', 午: '申', 戌: '申', 巳: '亥', 酉: '亥', 丑: '亥', 亥: '巳', 卯: '巳', 未: '巳' },
  /** 三合局 → 桃花（子午卯酉）。 */
  桃花: { 申: '酉', 子: '酉', 辰: '酉', 寅: '卯', 午: '卯', 戌: '卯', 巳: '午', 酉: '午', 丑: '午', 亥: '子', 卯: '子', 未: '子' },
  /** 三合局 → 华盖（辰戌丑未）。 */
  华盖: { 申: '辰', 子: '辰', 辰: '辰', 寅: '戌', 午: '戌', 戌: '戌', 巳: '丑', 酉: '丑', 丑: '丑', 亥: '未', 卯: '未', 未: '未' },
  /** 三合局 → 将星。 */
  将星: { 申: '子', 子: '子', 辰: '子', 寅: '午', 午: '午', 戌: '午', 巳: '酉', 酉: '酉', 丑: '酉', 亥: '卯', 卯: '卯', 未: '卯' },
}

/**
 * 以某地支为基准查神煞。
 * @param {string} kind 神煞名（驿马/桃花/华盖/将星）。
 * @param {string} base 基准地支（通常为年支或日支）。
 * @returns {string|null} 该神煞所在地支。
 */
export function shenShaOf(kind, base) {
  return SHENSHA[kind]?.[base] ?? null
}

// ───────────────────────────── 确定性随机 ─────────────────────────────

/**
 * 32 位字符串散列（FNV-1a 变体）。用于把「问题 + 时刻 + 法号」压成种子。
 * @param {string} str 输入。
 * @returns {number} 无符号 32 位整数。
 */
export function hash32(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/**
 * 造一个确定性随机源（xorshift32）。同一个 seed 必然给出同一串数。
 * @param {string|number} seed 种子。
 * @returns {Rand} 随机源对象。
 */
export function makeRand(seed) {
  let state = (typeof seed === 'number' ? seed : hash32(String(seed))) >>> 0
  if (state === 0) state = 0x9e3779b9
  const next = () => {
    state ^= state << 13; state >>>= 0
    state ^= state >>> 17
    state ^= state << 5; state >>>= 0
    return state >>> 0
  }
  return {
    /** 下一整数（0..2^32-1）。 */
    int: next,
    /** [0,1) 浮点。 */
    float: () => next() / 4294967296,
    /** [0,n) 整数。 */
    below: (n) => (n <= 0 ? 0 : next() % n),
    /** [min,max] 闭区间整数。 */
    range: (min, max) => min + (max - min <= 0 ? 0 : next() % (max - min + 1)),
    /** 从数组里取一个。 */
    pick: (arr) => (Array.isArray(arr) && arr.length > 0 ? arr[next() % arr.length] : undefined),
    /** 洗牌（返回新数组）。 */
    shuffle: (arr) => {
      const out = arr.slice()
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = next() % (i + 1)
        const t = out[i]; out[i] = out[j]; out[j] = t
      }
      return out
    },
    /** 以概率 p 返回 true。 */
    chance: (p) => next() / 4294967296 < p,
    /** 暴露原始状态（调试用）。 */
    get state() { return state },
  }
}

/**
 * @typedef {object} Rand
 * @property {() => number} int 下一 32 位整数。
 * @property {() => number} float [0,1) 浮点。
 * @property {(n:number) => number} below [0,n) 整数。
 * @property {(min:number,max:number) => number} range 闭区间整数。
 * @property {(arr:any[]) => any} pick 随机取一。
 * @property {(arr:any[]) => any[]} shuffle 洗牌。
 * @property {(p:number) => boolean} chance 概率判定。
 * @property {number} state 当前状态。
 */

// ───────────────────────────── 评分与等级 ─────────────────────────────

/** 吉凶等级（由凶到吉）。 */
export const VERDICTS = ['大凶', '凶', '小凶', '平', '小吉', '吉', '大吉']

/** 等级 → 符号（紧凑输出用，省 token）。 */
export const VERDICT_GLYPH = { 大吉: '◎', 吉: '○', 小吉: '○', 平: '·', 小凶: '△', 凶: '▲', 大凶: '×' }

/** 等级 → 数值中值（聚合用）。 */
export const VERDICT_VALUE = { 大吉: 85, 吉: 60, 小吉: 35, 平: 0, 小凶: -35, 凶: -60, 大凶: -85 }

/**
 * 把 -100..100 的分数归一成七级吉凶。
 * @param {number} score 分数。
 * @returns {string} 等级名。
 */
export function verdictOf(score) {
  const s = clamp(score, -100, 100)
  if (s >= 70) return '大吉'
  if (s >= 40) return '吉'
  if (s >= 15) return '小吉'
  if (s > -15) return '平'
  if (s > -40) return '小凶'
  if (s > -70) return '凶'
  return '大凶'
}

/**
 * 数值夹取。
 * @param {number} n 值。
 * @param {number} min 下界。
 * @param {number} max 上界。
 * @returns {number} 夹取后的值。
 */
export function clamp(n, min, max) {
  const v = Number.isFinite(n) ? n : 0
  return v < min ? min : v > max ? max : v
}

/**
 * 把一组分数（0..1 权重）加权平均成 -100..100。
 * @param {Array<{score:number, weight:number}>} items 项。
 * @returns {number} 加权分。
 */
export function weightedScore(items) {
  let num = 0
  let den = 0
  for (const it of items) {
    const w = Number.isFinite(it.weight) ? it.weight : 1
    if (w <= 0) continue
    num += clamp(it.score, -100, 100) * w
    den += w
  }
  return den === 0 ? 0 : clamp(num / den, -100, 100)
}

/** 空五行信号表。 */
export function emptyWuxing() {
  return { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 }
}

/**
 * 构造一个合规的术法结果（把可选字段补齐、把越界值夹回）。
 * 所有术法**必须**返回本函数的结果，聚合器才能安全消费。
 * @param {object} raw 原始结果。
 * @returns {MethodOutcome} 规范化结果。
 */
export function makeOutcome(raw) {
  const score = clamp(Number(raw?.score) || 0, -100, 100)
  const wx = raw?.wuxing ?? {}
  const wuxing = emptyWuxing()
  for (const k of WUXING) {
    const v = Number(wx[k])
    if (Number.isFinite(v)) wuxing[k] = v
  }
  const keys = Array.isArray(raw?.keys) ? raw.keys.filter((k) => typeof k === 'string' && k.length > 0).slice(0, 6) : []
  return {
    score,
    verdict: typeof raw?.verdict === 'string' && VERDICTS.includes(raw.verdict) ? raw.verdict : verdictOf(score),
    essence: typeof raw?.essence === 'string' ? truncate(raw.essence, 60) : '',
    keys,
    wuxing,
    timing: typeof raw?.timing === 'string' && raw.timing.length > 0 ? raw.timing : null,
    fidelity: raw?.fidelity === 'full' || raw?.fidelity === 'core' || raw?.fidelity === 'approx' ? raw.fidelity : 'core',
    detail: raw?.detail ?? {},
  }
}

/**
 * 截断字符串到指定字符数。
 * @param {string} s 字符串。
 * @param {number} n 上限。
 * @returns {string} 截断结果。
 */
export function truncate(s, n) {
  const str = String(s ?? '')
  return str.length <= n ? str : str.slice(0, n - 1) + '…'
}

/**
 * @typedef {object} MethodOutcome
 * @property {number} score -100..100 归一化吉凶分。
 * @property {string} verdict 七级吉凶之一。
 * @property {string} essence 一句话核心依据（紧凑输出用，务必短）。
 * @property {string[]} keys 共识关键词（合盘统计用）。
 * @property {{木:number,火:number,土:number,金:number,水:number}} wuxing 五行信号。
 * @property {string|null} timing 应期信号。
 * @property {'full'|'core'|'approx'} fidelity 算法保真度。
 * @property {object} detail 完整盘（按需下钻时输出）。
 */
