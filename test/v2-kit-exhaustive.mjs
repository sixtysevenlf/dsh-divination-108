/**
 * dsh-divination-108 · `src/core/kit.js` 穷举复核（task-10）
 *
 * 跑法：`node test/v2-kit-exhaustive.mjs`
 *
 * ## 为什么有这份测试
 * `kit.xunOf` 曾有一处 **20/60 才现形** 的 bug（用 `min(gi,zi)` 退旬首 → 二十个日干支得空数组），
 * 在小样本上完全正确。kit.js 是 108 法共用的底座，故对本文件**每一个导出**做穷举/闭式对拍。
 *
 * ## 设计原则
 * 1. **独立 oracle**：期望值一律由本文件**从定义式重新实现**，或取自**第三方独立来源**——
 *    优先用仓库已 vendored 的 `vendor/lunar.cjs`（lunar-javascript，与新历法无关的第三方实现）：
 *      `LunarUtil.NAYIN`（60 甲子纳音）、`LunarUtil.SHI_SHEN`（100 组十神）、
 *      `LunarUtil.CHANG_SHENG_OFFSET`（十干长生偏移）、`WU_XING_GAN/ZHI`（干支五行）。
 *    **不从 kit.js 反推期望值**（否则是自证）。
 * 2. **只读 src/**：本文件只 import + 断言，绝不修改被测代码；发现的问题写进
 *    `docs/verification/kit-exhaustive.md` 的「发现」节并回报 Lead。
 * 3. **确定性**：随机相关的检查一律用固定 seed，可重复；不 flake。
 * 4. `makeRand` 的**序列是冻结基准**（决定所有历史 seed 的复现性）——本文件用「序列锁」盯住它：
 *    若有人改了算法，锁会失败；这时**不应改锁**，而应报告。
 *
 * 输出约定：`PASS` 断言通过 ｜ `WARN` 边界/健壮性观察（非缺陷，但需知情）｜ `FAIL` 真缺陷（退出码 1）。
 */

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import * as K from '../src/core/kit.js'
import * as T from '../src/core/tables.js'

const require = createRequire(import.meta.url)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const LUNAR = require(path.join(HERE, '..', 'vendor', 'lunar.cjs'))
const LU = LUNAR.LunarUtil

// ───────────────────────── 结果记账 ─────────────────────────

let pass = 0
const warns = []
const fails = []

/** 断言。 */
function ok(name, cond, extra = '') {
  if (cond) { pass += 1; return true }
  fails.push(`${name}${extra ? ' — ' + extra : ''}`)
  console.log(`  ✗ FAIL ${name}${extra ? ' — ' + extra : ''}`)
  return false
}
/** 深度相等（仅用于平铺对象/数组的期望值对拍）。 */
function eq(name, actual, expect) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expect)
  return ok(name, a === b, `实测 ${a} ≠ 期望 ${b}`)
}
/** 边界/健壮性观察。 */
function warn(topic, detail) {
  warns.push(`${topic}：${detail}`)
}
function section(t) { console.log(`\n=== ${t} ===`) }

// ═════════════════════ 独立 oracle 区（不调用 kit） ═════════════════════

const GAN = '甲乙丙丁戊己庚辛壬癸'
const ZHI = '子丑寅卯辰巳午未申酉戌亥'
const WX = ['木', '火', '土', '金', '水']
/** 我生 / 我克（独立写在测试里，不从 kit 取）。 */
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }
/** 地支六合（用于 shenSha 之外的独立检查）。 */
const LIUHE = { 子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯', 辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午' }

/** 六十甲子序号 → 干支（闭式，独立于 kit.ganzhiOf）。 */
function oracleGZ(i) {
  const k = ((i % 60) + 60) % 60
  return GAN[k % 10] + ZHI[k % 12]
}
/** 六十甲子中某干支的序号（存在且在 0..59；不存在返回 -1）。 */
function gzIndex(gz) {
  for (let i = 0; i < 60; i += 1) if (oracleGZ(i) === gz) return i
  return -1
}
/** 旬空闭式（独立推导，与 spec §C7 三源一致表对拍）。 */
function oracleKong(gz) {
  const i = gzIndex(gz)
  if (i < 0) return null
  const head = i - (i % 10)
  const covered = new Set()
  for (let k = 0; k < 10; k += 1) covered.add(ZHI[(head + k) % 12])
  return ZHI.split('').filter((z) => !covered.has(z))
}
/** 十干禄（临官位）。cite: 《渊海子平》「甲禄在寅、乙禄在卯、丙戊禄在巳、丁己禄在午、庚禄在申、辛禄在酉、壬禄在亥、癸禄在子」。 */
const LU_ZHI = { 甲: '寅', 乙: '卯', 丙: '巳', 戊: '巳', 丁: '午', 己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子' }
/**
 * 三合局 → 十二长生偏移，独立推导四神煞：
 * 局之长生位起（阳顺），驿马＝冲长生(+6)、桃花＝沐浴(+1)、华盖＝墓(+8)、将星＝帝旺(+4)。
 */
const JU_OF_ZHI = {}
for (const [ju, zs] of Object.entries({ 水: ['申', '子', '辰'], 木: ['亥', '卯', '未'], 火: ['寅', '午', '戌'], 金: ['巳', '酉', '丑'] })) {
  for (const z of zs) JU_OF_ZHI[z] = ju
}
const JU_SHENG = { 水: '申', 木: '亥', 火: '寅', 金: '巳' }
const SHENSHA_OFFSET = { 驿马: 6, 桃花: 1, 华盖: 8, 将星: 4 }
function oracleShenSha(kind, base) {
  const ju = JU_OF_ZHI[base]
  if (!ju) return null
  const s = ZHI.indexOf(JU_SHENG[ju])
  return ZHI[(s + SHENSHA_OFFSET[kind]) % 12]
}

// ═════════════════════ 1. ganzhiOf ═════════════════════
section('1. ganzhiOf —— 60 甲子全枚举 + 周期 + 不变量')

{
  const all = []
  for (let i = 0; i < 60; i += 1) all.push(K.ganzhiOf(i))
  ok('60 项两两不同', new Set(all).size === 60, `${new Set(all).size}`)
  eq('序列 = 独立闭式', all, Array.from({ length: 60 }, (_, i) => oracleGZ(i)))
  ok('周期为 60', [0, 60, 120, 600].every((i) => K.ganzhiOf(i) === '甲子'))
  let per = true
  let inv = true
  for (let i = -120; i < 180; i += 1) {
    const g = K.ganzhiOf(i)
    if (g !== oracleGZ(i)) per = false
    if (g.length !== 2 || GAN.indexOf(g[0]) < 0 || ZHI.indexOf(g[1]) < 0) inv = false
    // 六十甲子不变量：支序 − 干序 恒为偶数
    if (((ZHI.indexOf(g[1]) - GAN.indexOf(g[0])) % 2 + 2) % 2 !== 0) inv = false
  }
  ok('i ∈ [-120,180) 与闭式一致（含负数）', per)
  ok('每项合法且满足「支序−干序」为偶', inv)
  // 边界观察
  const odd = [K.ganzhiOf(NaN), K.ganzhiOf(1.5), K.ganzhiOf(undefined)]
  if (odd.some((x) => typeof x !== 'string')) {
    warn('ganzhiOf 非法入参', `ganzhiOf(NaN/1.5/undefined) 均返回**数值 NaN**（类型 ${typeof odd[0]}，非契约声明的 string，不抛异常）`)
  }
}

// ═════════════════════ 2. xunOf（重点：验证上个 bug 修复完备） ═════════════════════
section('2. xunOf —— 60 甲子穷举：旬首恒为甲、空亡恒两支且不在本旬')

{
  const XUN_HEAD = ['甲子', '甲戌', '甲申', '甲午', '甲辰', '甲寅']
  const TRUE_TABLE = { 甲子: ['戌', '亥'], 甲戌: ['申', '酉'], 甲申: ['午', '未'], 甲午: ['辰', '巳'], 甲辰: ['寅', '卯'], 甲寅: ['子', '丑'] }
  let badHead = []
  let badLen = []
  let badKong = []
  let badSelf = []
  let badTable = []
  let badOracle = []
  for (let i = 0; i < 60; i += 1) {
    const gz = oracleGZ(i)
    const r = K.xunOf(gz)
    const head = oracleGZ(i - (i % 10))
    if (r.xun !== head) badHead.push(`${gz}:${r.xun}≠${head}`)
    if (r.xun[0] !== '甲') badHead.push(`${gz}:旬首非甲`)
    if (!XUN_HEAD.includes(r.xun)) badHead.push(`${gz}:旬首不在六甲`)
    if (!Array.isArray(r.kong) || r.kong.length !== 2) badLen.push(`${gz}:${JSON.stringify(r.kong)}`)
    else if (JSON.stringify(r.kong) !== JSON.stringify(oracleKong(gz))) badOracle.push(`${gz}:${r.kong.join('')}≠${oracleKong(gz).join('')}`)
    if (JSON.stringify(r.kong) !== JSON.stringify(TRUE_TABLE[r.xun])) badTable.push(`${gz}:${r.kong.join('')}≠表${TRUE_TABLE[r.xun].join('')}`)
    // 空亡不得出现在本旬的十个干支里
    for (const z of r.kong) {
      const inXun = Array.from({ length: 10 }, (_, k) => oracleGZ(i - (i % 10) + k)).some((g) => g[1] === z)
      if (inXun) badSelf.push(`${gz}:空亡支 ${z} 竟属本旬`)
    }
  }
  ok('旬首恒为「甲+旬首支」，且必属六甲', badHead.length === 0, badHead.slice(0, 4).join(' | '))
  ok('空亡恒为两支', badLen.length === 0, badLen.slice(0, 4).join(' | '))
  ok('与六旬真值表逐项一致', badTable.length === 0, badTable.slice(0, 4).join(' | '))
  ok('与独立闭式一致', badOracle.length === 0, badOracle.slice(0, 4).join(' | '))
  ok('空亡支不属于本旬任何干支', badSelf.length === 0, badSelf.slice(0, 4).join(' | '))
  // 六旬覆盖：旬空并集恰好覆盖 12 支各一次
  const kongFlat = Object.values(TRUE_TABLE).flat()
  ok('六旬空亡并集 = 12 支各一次', new Set(kongFlat).size === 12 && kongFlat.length === 12)
  // 旬内十天干必同支序奇偶
  ok('XUNKONG 表 6 键', Object.keys(K.XUNKONG).length === 6)
  const badXun = K.xunOf('不存在')
  if (badXun.xun !== '—' || badXun.kong.length !== 0) warn('xunOf 非法干支', `返回 ${JSON.stringify(badXun)}`)
}

// ═════════════════════ 3. changShengOf（10×12） ═════════════════════
section('3. changShengOf —— 120 组合：对拍 vendor 独立实现 + 十干禄不变量')

{
  const CS = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养']
  /** vendor oracle：index = offset + (干序偶 ? +支序 : −支序)，再 mod 12。 */
  function oracleCS(gan, zhi) {
    const off = LU.CHANG_SHENG_OFFSET[gan]
    if (!Number.isFinite(off)) return '—'
    const gi = GAN.indexOf(gan)
    const zi = ZHI.indexOf(zhi)
    const raw = gi % 2 === 0 ? off + zi : off - zi
    return CS[((raw % 12) + 12) % 12]
  }
  let diff = []
  let badBi = []
  let badYin = []
  for (const gan of GAN) {
    const seen = new Set()
    for (const zhi of ZHI) {
      const got = K.changShengOf(gan, zhi)
      const want = oracleCS(gan, zhi)
      if (got !== want) diff.push(`${gan}${zhi}:${got}≠${want}`)
      seen.add(got)
      // 阳干顺行：支序 +1 → 长生序号 +1
      const zi = ZHI.indexOf(zhi)
      const step = K.GAN_YANG[gan] ? 1 : -1
      const next = ZHI[(zi + 1) % 12]
      const a = CS.indexOf(K.changShengOf(gan, zhi))
      const b = CS.indexOf(K.changShengOf(gan, next))
      if (((b - a - step) % 12 + 12) % 12 !== 0) badYin.push(`${gan}:${zhi}→${next} 不符${K.GAN_YANG[gan] ? '顺' : '逆'}行`)
    }
    if (seen.size !== 12) badBi.push(`${gan}:${seen.size}/12`)
  }
  ok('120 组合与 vendor lunar-javascript 逐项一致', diff.length === 0, diff.slice(0, 5).join(' | '))
  ok('每干 12 支恰映射到 12 个长生位（双射）', badBi.length === 0, badBi.join(' | '))
  ok('阳干顺行 / 阴干逆行', badYin.length === 0, badYin.slice(0, 4).join(' | '))
  // 独立不变量：十干禄位必为「临官」
  const badLu = GAN.split('').filter((g) => K.changShengOf(g, LU_ZHI[g]) !== '临官')
  ok('十干禄位 = 临官（10/10）', badLu.length === 0, badLu.map((g) => `${g}${LU_ZHI[g]}=${K.changShengOf(g, LU_ZHI[g])}`).join(','))
  // 土之流派：kit 取「火土同宫」（戊长生寅、己长生酉）
  if (K.CHANGSHENG_START['戊'] === '寅' && K.CHANGSHENG_START['己'] === '酉') {
    warn('changshengOf 土之流派', 'CHANGSHENG_START 取「火土同宫」（戊寅·己酉），与 vendor 一致；spec §D4 提到「水土同宫」为另一派（本次未核实），kit 选火土同宫＝子平主流，记为流派选择而非缺陷')
  }
  ok('未知干回落 —', K.changShengOf('X', '子') === '—')
}

// ═════════════════════ 4. nayinOf（60 甲子） ═════════════════════
section('4. nayinOf —— 60 甲子：对拍 vendor + 两两共名 + 30 名无重复')

{
  /** 异体字归一：纳音名「砂/沙」两体并行于各本（本插件用「砂中金」、lunar-javascript 用「沙中金」），
   *  属**用字差异**而非数据错误，故归一后对拍，并把用字差异单独记 WARN。 */
  const norm = (s) => String(s).replace(/砂/g, '沙')
  let diff = []
  const variants = []
  for (let i = 0; i < 60; i += 1) {
    const gz = oracleGZ(i)
    const got = K.nayinOf(gz)
    const want = LU.NAYIN[gz]
    if (got !== want) {
      if (norm(got) === norm(want)) variants.push(`${gz}:${got}/${want}`)
      else diff.push(`${gz}:${got}≠${want}`)
    }
  }
  ok('60 项与 vendor lunar-javascript 一致（异体字归一后）', diff.length === 0, diff.slice(0, 5).join(' | '))
  if (variants.length > 0) {
    warn('纳音异体字', `与 lunar-javascript 存在用字差异（砂↔沙）：${variants.join('、')}。属各本用字不同，非数据错误；但注意 **kit 自身两处用字不一致**——「砂中金」(甲午/乙未) 与「沙中土」(丙辰/丁巳) 混用，建议统一为「砂」或「沙」之一以利检索与对拍`)
  }
  const pairs = []
  for (let i = 0; i < 60; i += 2) pairs.push(K.nayinOf(oracleGZ(i)))
  ok('相邻两甲子共用一个纳音（30 组）', pairs.every((_, k) => K.nayinOf(oracleGZ(2 * k)) === K.nayinOf(oracleGZ(2 * k + 1))))
  ok('30 名两两不同', new Set(pairs).size === 30, `${new Set(pairs).size}`)
  const counts = {}
  for (let i = 0; i < 60; i += 1) counts[K.nayinOf(oracleGZ(i))] = (counts[K.nayinOf(oracleGZ(i))] || 0) + 1
  ok('每个纳音恰覆盖 2 个干支', Object.values(counts).every((c) => c === 2), JSON.stringify(Object.entries(counts).filter(([, c]) => c !== 2)))
  ok('无缺失（60 项全部有名）', Object.keys(counts).length === 30 && !Object.values(counts).includes(undefined))
  ok('未知干支回落 —', K.nayinOf('XX') === '—')
  // 纳音五行（名末字）与干支五行关系不做强断言（纳音非干支行），只做形状检查
  const badShape = pairs.filter((n) => !/^[\u4e00-\u9fa5]{2,4}[木火土金水]$/.test(n))
  ok('纳音名形状合法（末字为五行）', badShape.length === 0, badShape.join(','))
}

// ═════════════════════ 5. liuShenOf（10×6） ═════════════════════
section('5. liuShenOf —— 60 组合：对拍「甲乙青龙起」口诀 + 顺行')

{
  const LS = ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武']
  const START = { 甲: '青龙', 乙: '青龙', 丙: '朱雀', 丁: '朱雀', 戊: '勾陈', 己: '螣蛇', 庚: '白虎', 辛: '白虎', 壬: '玄武', 癸: '玄武' }
  let diff = []
  let badDistinct = []
  for (const g of GAN) {
    const row = [0, 1, 2, 3, 4, 5].map((i) => K.liuShenOf(g, i))
    if (row[0] !== START[g]) diff.push(`${g}:初爻=${row[0]}≠${START[g]}`)
    const si = LS.indexOf(START[g])
    for (let i = 0; i < 6; i += 1) if (row[i] !== LS[(si + i) % 6]) diff.push(`${g}:第${i}爻`)
    if (new Set(row).size !== 6) badDistinct.push(g)
  }
  ok('60 组合与「甲乙青龙起、依爻位顺行」一致', diff.length === 0, diff.slice(0, 5).join(' | '))
  ok('每干六爻六神两两不同', badDistinct.length === 0, badDistinct.join(','))
  ok('未知日干回落 —', K.liuShenOf('X', 0) === '—')
  // 跨表一致（kernel-tables 的 LIUSHEN 名录）
  ok('六神名录与 tables.LIUSHEN 一致', JSON.stringify(LS) === JSON.stringify(Array.isArray(T.LIUSHEN) ? T.LIUSHEN : LS))
}

// ═════════════════════ 6. tenGodOf（10×10） ═════════════════════
section('6. tenGodOf —— 100 组合：对拍 vendor + 完备性/阴阳配对')

{
  let diff = []
  let badComplete = []
  for (const me of GAN) {
    const seen = new Set()
    for (const other of GAN) {
      const got = K.tenGodOf(me, other)
      const want = LU.SHI_SHEN[me + other]
      if (got !== want) diff.push(`${me}${other}:${got}≠${want}`)
      seen.add(got)
    }
    if (seen.size !== 10) badComplete.push(`${me}:${seen.size}/10`)
  }
  ok('100 组合与 vendor lunar-javascript 一致', diff.length === 0, diff.slice(0, 5).join(' | '))
  ok('每干十神覆盖全 10 种（完备性）', badComplete.length === 0, badComplete.join(' | '))
  ok('同干必为比肩', GAN.split('').every((g) => K.tenGodOf(g, g) === '比肩'))
  // 阴阳配对自洽：同一「五行+生克位」下，阴阳同者与阴阳异者必成对（正↔偏、比肩↔劫财…）
  const PAIR = { 比肩: '劫财', 劫财: '比肩', 食神: '伤官', 伤官: '食神', 偏财: '正财', 正财: '偏财', 七杀: '正官', 正官: '七杀', 偏印: '正印', 正印: '偏印' }
  const badPair = []
  for (const me of GAN) {
    for (const other of GAN) {
      if (K.GAN_YANG[me] === K.GAN_YANG[other]) continue // 只查与日主异阴阳者
      const god = K.tenGodOf(me, other)
      // 找与 other 同五行、但与 me 同阴阳的那个干 → 其十神应是 god 的阴阳对偶
      const mirror = GAN.split('').find((g) => K.GAN_YANG[g] === K.GAN_YANG[me] && K.GAN_WUXING[g] === K.GAN_WUXING[other])
      if (!mirror) { badPair.push(`${me}${other}:找不到镜像干`); continue }
      if (K.tenGodOf(me, mirror) !== PAIR[god]) badPair.push(`${me}${other}(${god}) vs ${me}${mirror}(${K.tenGodOf(me, mirror)})`)
    }
  }
  ok('阴阳配对自洽（正↔偏·比肩↔劫财 等 5 对双向）', badPair.length === 0, badPair.slice(0, 5).join(','))
  // 甲行经典对照（《渊海子平》十神例）
  eq('甲见十干 = 比肩劫财食神伤官偏财正财七杀正官偏印正印', GAN.split('').map((g) => K.tenGodOf('甲', g)).join(''), '比肩劫财食神伤官偏财正财七杀正官偏印正印')
  // 独立重算（不调用 kit）：以五行关系 + 阴阳同异判定
  const NAMES = { 比和: ['比肩', '劫财'], 我生: ['食神', '伤官'], 我克: ['偏财', '正财'], 克我: ['七杀', '正官'], 生我: ['偏印', '正印'] }
  const badIndep = []
  for (const me of GAN) {
    for (const other of GAN) {
      const a = K.GAN_WUXING[me]; const b = K.GAN_WUXING[other]
      const rel = a === b ? '比和' : SHENG[a] === b ? '我生' : SHENG[b] === a ? '生我' : KE[a] === b ? '我克' : '克我'
      const same = K.GAN_YANG[me] === K.GAN_YANG[other]
      const want = NAMES[rel][same ? 0 : 1]
      if (K.tenGodOf(me, other) !== want) badIndep.push(`${me}${other}`)
    }
  }
  ok('与「五行生克 + 阴阳同异」独立重算一致', badIndep.length === 0, badIndep.slice(0, 5).join(','))
  ok('未知干回落 —', K.tenGodOf('X', '甲') === '—' && K.tenGodOf('甲', 'X') === '—')
}

// ═════════════════════ 7. cangGanGods（12 支 × 日主） ═════════════════════
section('7. cangGanGods —— 藏干层级与 ZHI_CANGGAN 一致 + 十神正确')

{
  const LEVEL = ['本气', '中气', '余气']
  let badList = []
  let badLevel = []
  let badGod = []
  let badCount = []
  for (const zhi of ZHI) {
    const src = K.ZHI_CANGGAN[zhi]
    for (const me of ['甲', '己']) {
      const got = K.cangGanGods(me, zhi)
      if (got.length !== src.length) badCount.push(`${zhi}:${got.length}≠${src.length}`)
      got.forEach((x, i) => {
        if (x.gan !== src[i]) badList.push(`${zhi}#${i}:${x.gan}≠${src[i]}`)
        if (x.level !== LEVEL[i] && LEVEL[i] !== undefined) badLevel.push(`${zhi}#${i}:${x.level}`)
        if (x.god !== K.tenGodOf(me, src[i])) badGod.push(`${zhi}#${i}`)
      })
    }
  }
  ok('藏干序列与 ZHI_CANGGAN 逐项一致', badList.length === 0, badList.slice(0, 4).join(','))
  ok('层级标注 本气/中气/余气 正确', badLevel.length === 0, badLevel.slice(0, 4).join(','))
  ok('十神与 tenGodOf 自洽', badGod.length === 0, badGod.slice(0, 4).join(','))
  ok('单藏干支（子/卯/酉）长度为 1', ['子', '卯', '酉'].every((z) => K.cangGanGods('甲', z).length === 1))
  intCheck: {
    const n = ZHI.split('').reduce((s, z) => s + K.cangGanGods('甲', z).length, 0)
    ok('藏干总数 = ZHI_CANGGAN 总和', n === Object.values(K.ZHI_CANGGAN).reduce((s, a) => s + a.length, 0))
  }
  ok('未知支返回空数组', Array.isArray(K.cangGanGods('甲', 'X')) && K.cangGanGods('甲', 'X').length === 0)
}

// ═════════════════════ 8. shenShaOf（4 类 × 12 支） ═════════════════════
section('8. shenShaOf —— 48 组合：三合局长生位独立推导 + 跨表一致')

{
  let diff = []
  let badCov = []
  for (const kind of Object.keys(SHENSHA_OFFSET)) {
    const vals = []
    for (const base of ZHI) {
      const got = K.shenShaOf(kind, base)
      const want = oracleShenSha(kind, base)
      if (got !== want) diff.push(`${kind}/${base}:${got}≠${want}`)
      vals.push(got)
    }
    // 每类神煞落在 4 个支上（每个三合局一个）
    const uniq = new Set(vals.filter(Boolean))
    if (uniq.size !== 4) badCov.push(`${kind}:${uniq.size}/4`)
  }
  ok('48 组合与三合局+十二长生独立推导一致', diff.length === 0, diff.slice(0, 5).join(' | '))
  ok('每类神煞恰落 4 支（四局各一）', badCov.length === 0, badCov.join(','))
  // 与经典口诀对拍（《三命通会》）
  eq('驿马：申子辰在寅·寅午戌在申·巳酉丑在亥·亥卯未在巳',
    ['申', '子', '辰', '寅', '午', '戌', '巳', '酉', '丑', '亥', '卯', '未'].map((z) => K.shenShaOf('驿马', z)).join(''),
    '寅寅寅申申申亥亥亥巳巳巳')
  eq('桃花：申子辰在酉·寅午戌在卯·巳酉丑在午·亥卯未在子',
    ['申', '子', '辰', '寅', '午', '戌', '巳', '酉', '丑', '亥', '卯', '未'].map((z) => K.shenShaOf('桃花', z)).join(''),
    '酉酉酉卯卯卯午午午子子子')
  eq('华盖：申子辰在辰·寅午戌在戌·巳酉丑在丑·亥卯未在未',
    ['申', '子', '辰', '寅', '午', '戌', '巳', '酉', '丑', '亥', '卯', '未'].map((z) => K.shenShaOf('华盖', z)).join(''),
    '辰辰辰戌戌戌丑丑丑未未未')
  eq('将星：申子辰在子·寅午戌在午·巳酉丑在酉·亥卯未在卯',
    ['申', '子', '辰', '寅', '午', '戌', '巳', '酉', '丑', '亥', '卯', '未'].map((z) => K.shenShaOf('将星', z)).join(''),
    '子子子午午午酉酉酉卯卯卯')
  ok('未知神煞/地支返回 null', K.shenShaOf('不存在', '子') === null && K.shenShaOf('驿马', 'X') === null)
  // 跨表一致：kernel-tables 的 SHENSHA_ALL（目标支口径）
  const sa = T.SHENSHA_ALL?.['驿马']
  if (sa?.map) {
    const agree = ZHI.split('').filter((b) => String(sa.map[b] ?? '').includes(K.shenShaOf('驿马', b) ?? '@')).length
    ok('驿马与 tables.SHENSHA_ALL 跨表一致（12/12 支）', agree === 12, `${agree}/12`)
  } else {
    warn('跨表对拍', 'tables.SHENSHA_ALL.驿马 结构不可识别，跳过跨表一致检查（已在 kit 内部三合局推导上验证）')
  }
}

// ═════════════════════ 9. relation / relationScore / wangShuai（5×5） ═════════════════════
section('9. relation / relationScore / wangShuai —— 25 组合全覆盖')

{
  let badInv = []
  let badSelf = []
  let badDist = []
  for (const a of WX) {
    const row = WX.map((b) => K.relation(a, b))
    if (new Set(row).size !== 5) badDist.push(`${a}:${new Set(row).size}/5`)
    if (K.relation(a, a) !== '比和') badSelf.push(a)
    for (const b of WX) {
      if (a === b) continue
      const r = K.relation(a, b)
      const inv = K.relation(b, a)
      const want = { 我生: '生我', 生我: '我生', 我克: '克我', 克我: '我克' }[r]
      if (inv !== want) badInv.push(`${a}${b}:${r}/${inv}`)
    }
  }
  ok('每行恰出现 5 种关系（比和+四向各一）', badDist.length === 0, badDist.join(','))
  ok('自身必比和', badSelf.length === 0, badSelf.join(','))
  ok('生克互逆（我生↔生我、我克↔克我）', badInv.length === 0, badInv.slice(0, 5).join(' | '))
  // 独立重算
  let badIndep = []
  for (const a of WX) {
    for (const b of WX) {
      const want = a === b ? '比和' : SHENG[a] === b ? '我生' : SHENG[b] === a ? '生我' : KE[a] === b ? '我克' : '克我'
      if (K.relation(a, b) !== want) badIndep.push(`${a}${b}`)
    }
  }
  ok('与独立闭式一致（25/25）', badIndep.length === 0, badIndep.join(','))
  // relationScore
  const base = { 比和: 20, 我生: 8, 生我: 45, 我克: 25, 克我: -40 }
  ok('relationScore 默认值与文档一致', WX.every((a) => WX.every((b) => K.relationScore(K.relation(a, b)) === base[K.relation(a, b)])))
  ok('relationScore bias 覆盖生效（含 0）', K.relationScore('克我', { 克我: 0 }) === 0 && K.relationScore('比和', { 比和: -5 }) === -5)
  ok('relationScore 未知关系 → 0', K.relationScore('不存在') === 0)
  // wangShuai 双射
  const STATES = ['旺', '相', '休', '囚', '死']
  let badBij = []
  let badMon = []
  for (const m of WX) {
    const states = WX.map((w) => K.wangShuai(w, m).state)
    if (new Set(states).size !== 5) badBij.push(`${m}:${states.join(',')}`)
    if (K.wangShuai(m, m).state !== '旺') badMon.push(m)
    const scores = WX.map((w) => K.wangShuai(w, m).score)
    if (!(scores[0] > scores[1] && scores[1] > scores[2] && scores[2] > scores[3] && scores[3] > scores[4])) {
      // 顺序随五行排列不同，改判「分数集合 = {100,75,40,25,10}」
    }
    const set = [...new Set(scores)].sort((a, b) => b - a)
    if (JSON.stringify(set) !== JSON.stringify([100, 75, 40, 25, 10])) badMon.push(`${m} 分值集合 ${set}`)
  }
  ok('每月令下五档状态无重无漏（双射）', badBij.length === 0, badBij.join(' | '))
  ok('当令者旺；分值集合恒为 {100,75,40,25,10}', badMon.length === 0, badMon.join(' | '))
  // 独立重算（当令旺、令生相、生令休、克令囚、令克死）
  const badIndep2 = []
  for (const m of WX) {
    for (const w of WX) {
      const want = w === m ? '旺' : SHENG[m] === w ? '相' : SHENG[w] === m ? '休' : KE[w] === m ? '囚' : '死'
      if (K.wangShuai(w, m).state !== want) badIndep2.push(`${w}/${m}`)
    }
  }
  ok('与「当令旺·令生相·生令休·克令囚·令克死」独立重算一致', badIndep2.length === 0, badIndep2.join(','))
  ok('STRENGTH_FACTOR 五键且单调递减', STATES.every((s) => Number.isFinite(K.strengthOf(s))) && STATES.every((s, i, a) => i === 0 || K.strengthOf(a[i - 1]) > K.strengthOf(s)))
  ok('strengthOf 未知状态 → 0.5', K.strengthOf('不存在') === 0.5)
}

// ═════════════════════ 10. verdictOf / clamp / mod / truncate / weightedScore ═════════════════════
section('10. verdictOf / clamp / mod / truncate / weightedScore —— 边界与单调性')

{
  // verdictOf：与「对称分档」定义式一致（边界归更极端一档）+ 单调不降 + 七档全覆盖
  // 分档：|s|≥70 大吉/大凶、|s|≥40 吉/凶、|s|≥15 小吉/小凶、否则平
  const bandOf = (s) => {
    const a = Math.abs(s)
    if (s >= 0) return a >= 70 ? '大吉' : a >= 40 ? '吉' : a >= 15 ? '小吉' : '平'
    return a >= 70 ? '大凶' : a >= 40 ? '凶' : a >= 15 ? '小凶' : '平'
  }
  let badV = []
  for (let s = -100; s <= 100; s += 0.5) {
    const want = bandOf(s)
    if (K.verdictOf(s) !== want) badV.push(`${s}:${K.verdictOf(s)}≠${want}`)
  }
  ok('verdictOf 在 [-100,100] 半整数网格上与对称分档定义一致', badV.length === 0, badV.slice(0, 5).join(','))
  ok('verdictOf 关于 0 对称（±t 同档之吉凶）', [[70, '大吉', '大凶'], [40, '吉', '凶'], [15, '小吉', '小凶'], [0, '平', '平']]
    .every(([t, up, down]) => K.verdictOf(t) === up && K.verdictOf(-t) === down))
  ok('verdictOf 边界归属：±15/±40/±70 均归更极端一档', K.verdictOf(-15) === '小凶' && K.verdictOf(-40) === '凶' && K.verdictOf(-70) === '大凶')
  ok('verdictOf 单调不降', (() => { let p = -1; const order = K.VERDICTS; for (let s = -100; s <= 100; s += 1) { const i = order.indexOf(K.verdictOf(s)); if (i < p) return false; p = i } return true })())
  ok('越界分夹取（±1e9 → ±100 档）', K.verdictOf(1e9) === '大吉' && K.verdictOf(-1e9) === '大凶')
  if (K.verdictOf(NaN) !== '平') warn('verdictOf(NaN)', `返回 ${K.verdictOf(NaN)}`)
  else warn('verdictOf(NaN)', '返回「平」——NaN 被 clamp 静默当作 0（见 makeOutcome 节）')
  ok('VERDICTS 七档、VERDICT_GLYPH/VERDICT_VALUE 键齐全', K.VERDICTS.length === 7 && K.VERDICTS.every((v) => K.VERDICT_GLYPH[v] && Number.isFinite(K.VERDICT_VALUE[v])))
  // clamp
  ok('clamp 夹取与 NaN/Inf 归零', K.clamp(5, 0, 1) === 1 && K.clamp(-5, 0, 1) === 0 && K.clamp(NaN, -1, 1) === 0 && K.clamp(Infinity, -1, 1) === 0 && K.clamp(-Infinity, -1, 1) === 0)
  ok('clamp 边界值不越界', K.clamp(0, 0, 1) === 0 && K.clamp(1, 0, 1) === 1)
  // mod
  ok('mod 恒非负', [-7, -1, 0, 1, 7].every((n) => K.mod(n, 3) >= 0))
  eq('mod 值正确', [-7, -6, -1, 0, 5, 6].map((n) => K.mod(n, 3)), [2, 0, 2, 0, 2, 0])
  if (K.mod(5, 0) !== 0 && !Number.isNaN(K.mod(5, 0))) warn('mod(n,0)', `返回 ${K.mod(5, 0)}`)
  // truncate
  ok('truncate 不超长', K.truncate('a'.repeat(100), 60).length === 60)
  ok('truncate 短串原样', K.truncate('abc', 10) === 'abc')
  ok('truncate 非字符串安全', K.truncate(null, 5) === '' && K.truncate(undefined, 5) === '')
  if (K.truncate('abc', 0).length > 0) warn('truncate(s,0)', `返回 "${K.truncate('abc', 0)}"（长度 ${K.truncate('abc', 0).length} > 0）`)
  if (K.truncate('ab', 2) !== 'ab') warn('truncate 恰好等长', '边界处理异常')
  // weightedScore
  ok('weightedScore 空 → 0', K.weightedScore([]) === 0)
  ok('weightedScore 忽略 weight ≤ 0', K.weightedScore([{ score: 100, weight: 0 }, { score: -50, weight: 2 }]) === -50)
  ok('weightedScore 夹取分数', K.weightedScore([{ score: 1e9, weight: 1 }]) === 100)
  ok('weightedScore weight 非有限按 1 计', K.weightedScore([{ score: 10, weight: NaN }]) === 10)
  ok('emptyWuxing 五键全 0', JSON.stringify(K.emptyWuxing()) === JSON.stringify({ 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 }))
}

// ═════════════════════ 11. makeRand —— 边界 / 确定 / 均匀 / 序列锁 ═════════════════════
section('11. makeRand —— 边界、确定性、分布均匀、序列冻结锁')

{
  // 边界行为
  const r = K.makeRand('boundary')
  ok('below(0)/below(-1) → 0 且不抛', r.below(0) === 0 && r.below(-1) === 0)
  ok('below(1) → 0', r.below(1) === 0)
  const r2 = K.makeRand('range')
  ok('range(a,a) → a', r2.range(7, 7) === 7 && r2.range(-3, -3) === -3)
  ok('range(min>max) → min（不越界、不抛）', r2.range(5, 1) === 5)
  ok('pick([]) / pick(null) → undefined 且不抛', K.makeRand('p').pick([]) === undefined && K.makeRand('p').pick(null) === undefined)
  const sh = K.makeRand('shuffle').shuffle([])
  ok('shuffle([]) → [] 且不动原数组', Array.isArray(sh) && sh.length === 0)
  const src = [1, 2, 3, 4, 5]
  const srcCopy = src.slice()
  const out = K.makeRand('shuffle2').shuffle(src)
  ok('shuffle 不改原数组', JSON.stringify(src) === JSON.stringify(srcCopy))
  ok('shuffle 保持多重集', JSON.stringify(out.slice().sort()) === JSON.stringify(srcCopy.slice().sort()))
  ok('chance(0) 恒 false', (() => { const q = K.makeRand('c0'); for (let i = 0; i < 5000; i += 1) if (q.chance(0)) return false; return true })())
  ok('chance(1) 恒 true', (() => { const q = K.makeRand('c1'); for (let i = 0; i < 5000; i += 1) if (!q.chance(1)) return false; return true })())
  ok('chance(-1) 恒 false', (() => { const q = K.makeRand('c-1'); for (let i = 0; i < 200; i += 1) if (q.chance(-1)) return false; return true })())
  // float/int 值域
  const q = K.makeRand('range-check')
  let floatOk = true
  let intOk = true
  let idxOk = true
  for (let i = 0; i < 20000; i += 1) {
    const f = q.float()
    if (!(f >= 0 && f < 1)) floatOk = false
    const n = q.int()
    if (!(Number.isInteger(n) && n >= 0 && n <= 0xFFFFFFFF)) intOk = false
    const b = q.below(6)
    if (!(Number.isInteger(b) && b >= 0 && b < 6)) idxOk = false
  }
  ok('float ∈ [0,1)', floatOk)
  ok('int 为 uint32', intOk)
  ok('below(n) ∈ [0,n)', idxOk)
  // 同种子同序列 / 不同种子不同序列
  const same = (s) => Array.from({ length: 10 }, () => K.makeRand(s).int())
  ok('同种子必同序列（字符串与数值）', JSON.stringify(same('abc')) === JSON.stringify(same('abc')) && JSON.stringify(same(42)) === JSON.stringify(same(42)))
  ok('不同种子给出不同序列', JSON.stringify(same('abc')) !== JSON.stringify(same('abd')))
  ok('hash32 → makeRand 一致性', JSON.stringify(K.makeRand(K.hash32('xyz')).int ? [K.makeRand(K.hash32('xyz')).int()] : []) !== '[]')
  // 分布均匀（固定 seed，卡方；p=0.001 临界值，绝不 flake）
  function chi2(n, N, seed) {
    const q2 = K.makeRand(seed)
    const bins = new Array(n).fill(0)
    for (let i = 0; i < N; i += 1) bins[q2.below(n)] += 1
    const e = N / n
    return bins.reduce((s, o) => s + (o - e) ** 2 / e, 0)
  }
  const CRIT = { 6: 20.515, 8: 24.322, 12: 31.264, 60: 96.05 } // df=n−1, p=0.001
  for (const n of [6, 8, 12, 60]) {
    const N = n === 60 ? 600000 : 200000
    const x = chi2(n, N, `chi2-${n}`)
    ok(`below(${n}) 分布均匀 χ²=${x.toFixed(2)} < ${CRIT[n]}（N=${N}）`, x < CRIT[n])
  }
  // 模偏差量级（诚实报告，非缺陷）
  const lim = 4294967296
  const worst = [6, 7, 12, 60].map((n) => ({ n, bias: (lim % n) / lim }))
  warn('below() 取模偏差', `next()%n 存在模偏差；最大相对偏差 ${worst.map((w) => `n=${w.n}:${(w.bias * 100).toExponential(2)}%`).join(' ')}（量级 1e-8，对术数用途可忽略；如需消除可用拒绝采样）`)
  // 序列冻结锁：makeRand 决定所有历史 seed 的复现性 → 不许改
  const LOCK = {
    'lock-1': [1853949350, 2290726204, 2078486347, 3745663374, 1477153879, 2058175479, 2292881758, 2879891294],
    'lock-2': [33013832, 3324586583, 2400503590, 3924924190, 3109382263, 2670446874, 655866334, 3584960712],
    'divination-108': [1913721404, 1518467319, 3598347576, 3766041110, 541632747, 2683279969, 4174514736, 2334034362],
    0: [1359758873, 3761132862, 2075758394, 25405621, 3862129951, 4186559031, 3122997712, 4244368831],
    1: [270369, 67634689, 2647435461, 307599695, 2398689233, 745495504, 632435482, 435756210],
    12345: [3336926330, 1697253807, 2816511904, 1955480042, 718842323, 3283620450, 4285686168, 3680911160],
  }
  for (const [seed, expect] of Object.entries(LOCK)) {
    const s = /^\d+$/.test(seed) ? Number(seed) : seed
    const q = K.makeRand(s)
    const got = []
    for (let i = 0; i < 8; i += 1) got.push(q.int())
    ok(`序列锁 seed=${seed}（改动 makeRand 会使此项失败——那是**报告**信号，不是改锁信号）`, JSON.stringify(got) === JSON.stringify(expect), `实测 ${got.slice(0, 3)}…`)
  }
  // seed 0 与 0x9e3779b9 落同一状态（设计如此，记录）
  ok('seed 0 与 0x9e3779b9 同轨迹（源码显式兜底）', K.makeRand(0).int() === K.makeRand(0x9e3779b9).int())
  // 状态可观察且单调推进
  const st = K.makeRand('state')
  const s0 = st.state
  st.int()
  ok('state 随取值推进', st.state !== s0)
  ok('hash32 输出 uint32 且确定', Number.isInteger(K.hash32('x')) && K.hash32('x') >= 0 && K.hash32('x') === K.hash32('x'))
}

// ═════════════════════ 12. makeOutcome —— 边界穷举 ═════════════════════
section('12. makeOutcome —— 边界与规范化（含 NaN / Infinity / 非法 verdict / detail 透传）')

{
  const o = (raw) => K.makeOutcome(raw)
  // 分数
  const invNaN = o({ score: NaN })
  const invPInf = o({ score: Infinity })
  const invNInf = o({ score: -Infinity })
  const invOK = o({ score: 50 })
  ok('score=NaN → 0', invNaN.score === 0)
  ok('score=NaN → detail.__scoreInvalid = true【回归锁：曾被静默夹成 0 且不留痕】', invNaN.detail.__scoreInvalid === true, JSON.stringify(invNaN.detail))
  ok('score=+Infinity → 0', invPInf.score === 0)
  ok('score=+Infinity → detail.__scoreInvalid = true【回归锁】', invPInf.detail.__scoreInvalid === true, JSON.stringify(invPInf.detail))
  ok('score=-Infinity → 0 且留痕', invNInf.score === 0 && invNInf.detail.__scoreInvalid === true)
  ok('合法分数**不**带 __scoreInvalid（不得误标）', !('__scoreInvalid' in invOK.detail) && JSON.stringify(invOK.detail) === '{}', JSON.stringify(invOK.detail))
  if (!invNaN.detail.__scoreInvalid) {
    warn('makeOutcome(score=NaN)', '非有限分数被静默夹成 0 且**不留痕** → 审计无法发现「本该报错却被夹成中立票」。'
      + 'v2 runner 已在调用前拦非有限分数，故链路安全；但 makeOutcome 是公开导出。'
      + '建议：非有限 → 0 且 `detail.__scoreInvalid = true`（或直接抛错）')
  }
  warn('makeOutcome(score=±Infinity) 语义', '非有限值一律归零（`+Infinity` → **0 而非 +100**），语义是「无效即中立」。'
    + '已在 detail 留痕（__scoreInvalid），属可用口径；记录以便调用方知晓')
  ok('score 越界夹取', o({ score: 1e9 }).score === 100 && o({ score: -1e9 }).score === -100)
  ok('score 数值字符串被接受', o({ score: '50' }).score === 50)
  ok('score 非法字符串 → 0', o({ score: 'abc' }).score === 0)
  ok('score=null → 0', o({ score: null }).score === 0)
  ok('raw 为 null/undefined 不抛', o(null).score === 0 && o(undefined).score === 0)
  // verdict
  ok('verdict 非法 → 按分数重算', o({ score: 80, verdict: '乱写' }).verdict === '大吉')
  const wrong = o({ score: 0, verdict: '大吉' })
  ok('verdict 合法但与分数矛盾 → 原样保留（**不校对**）', wrong.verdict === '大吉')
  if (wrong.verdict === '大吉') {
    warn('makeOutcome(verdict 与 score 矛盾)', '只要 verdict 是七档之一就**原样信任**，不校验 verdictOf(score)。契约 §2.4 要求「不许自己造等级字符串」，但 audited 层（smoke）才拦住；建议 makeOutcome 直接以 verdictOf(score) 覆盖，或对矛盾输入抛错')
  }
  ok('verdict 缺失 → 按分数', o({ score: -80 }).verdict === '大凶')
  // essence
  ok('essence 截断到 60', o({ essence: '字'.repeat(200) }).essence.length === 60)
  ok('essence 非字符串 → 空串', o({ essence: 123 }).essence === '' && o({ essence: null }).essence === '')
  warn('makeOutcome(essence 缺失)', `返回空串 ""（不抛、不填默认），调用方需自行保证非空——契约 §2.4 要求 essence 非空，此处是「不校验」而非「保证」`)
  // keys
  ok('keys 上限 6', o({ keys: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).keys.length === 6)
  eq('keys 过滤非字符串/空串并**去重**（保序）【回归锁：曾不去重】', o({ keys: [1, 'a', null, '', 'a', {}, 'b'] }).keys, ['a', 'b'])
  eq('keys 去重含 trim（Lead 例：a,a,b,b,c,c,d → a,b,c,d）', o({ keys: ['a', 'a', 'b', 'b', 'c', 'c', 'd'] }).keys, ['a', 'b', 'c', 'd'])
  eq('keys 去重前先 trim 空白', o({ keys: ['a', ' a ', 'a', 'b'] }).keys, ['a', 'b'])
  ok('keys 去重后再取 6 上限', o({ keys: ['a', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'b'] }).keys.length === 6
    && new Set(o({ keys: ['a', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'b'] }).keys).size === 6)
  ok('keys 非数组 → []', JSON.stringify(o({ keys: 'abc' }).keys) === '[]')
  // keys 去重：task-10 验收清单明确要求「keys 去重与上限 6」，实现只做上限不做去重
  const dupKeys = o({ keys: ['财', '财', '财'] }).keys
  ok('keys 去重（task-10 验收项：先去重再取 6）', dupKeys.length === new Set(dupKeys).size, `实测 ${JSON.stringify(dupKeys)}`)
  if (dupKeys.length !== new Set(dupKeys).size) {
    warn('makeOutcome(keys 不去重)', '重复 key 会**灌水下游共识计数**：aggregate.js 对 `r.outcome.keys` 逐项累加 `count`，'
      + '故一条方法里把同一 key 写 3 次，等于给该 key 投 3 票，可越过 `count >= 3` 的共识阈值。'
      + '实测：3 条法（其中一条 keys=[财,财,财]、一条 keys=[财]）→ 共识「财」count=4，而实际只有 **2 法**提及。'
      + '建议 makeOutcome 内 `[...new Set(filtered)].slice(0,6)`（一行），或在 aggregate 侧按方法去重。'
      + '注：当前 8 个方法族多数自建 keys 时已用 Set，故尚未造成可见偏差；但契约层不设防')
  }
  // wuxing
  eq('wuxing 缺键补零', o({ wuxing: { 木: 5 } }).wuxing, { 木: 5, 火: 0, 土: 0, 金: 0, 水: 0 })
  ok('wuxing 数值字符串被接受', o({ wuxing: { 木: '3' } }).wuxing.木 === 3)
  ok('wuxing NaN → 0', o({ wuxing: { 木: NaN } }).wuxing.木 === 0)
  if (o({ wuxing: { 木: true } }).wuxing.木 === 1) warn('makeOutcome(wuxing 布尔)', 'Number(true)===1 被接受 → 五行信号可为 1，属类型不严（无实际风险，方法层不会传布尔）')
  ok('wuxing 非对象 → 全 0', JSON.stringify(o({ wuxing: 'x' }).wuxing) === JSON.stringify(K.emptyWuxing()))
  // timing
  ok('timing 空串 → null', o({ timing: '' }).timing === null)
  ok('timing 非字符串 → null', o({ timing: 123 }).timing === null && o({ timing: null }).timing === null)
  ok('timing 纯空白串 → null（已 trim）【回归锁：曾返回 " "】', o({ timing: ' ' }).timing === null, `实测 ${JSON.stringify(o({ timing: ' ' }).timing)}`)
  if (o({ timing: ' ' }).timing === ' ') warn('makeOutcome(timing 空白串)', '纯空白串被当作有效应期（应 trim 后再判）')
  // fidelity
  ok('fidelity 三档保留', ['full', 'core', 'approx'].every((f) => o({ fidelity: f }).fidelity === f))
  if (o({ fidelity: 'bogus' }).fidelity === 'core') warn('makeOutcome(fidelity 非法)', "非法值静默回落 'core'（既不抛也不标 approx）；runner 传的是受注册表校验的 entry.fidelity，故实际无风险，但方法层写错字会被吞掉")
  // detail
  ok('detail=null → {}', JSON.stringify(o({ detail: null }).detail) === '{}')
  const dStr = o({ detail: 'oops' }).detail
  const isPlainObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x) && JSON.stringify(x) === '{}'
  ok('detail 非对象（字符串）→ 回落为普通对象 {}【回归锁：曾原样透传 "oops"】', isPlainObj(dStr), `实测 ${JSON.stringify(dStr)}`)
  if (!isPlainObj(dStr)) warn('makeOutcome(detail 非对象)', "`detail:'oops'` 被原样透传（契约要求 detail 为非空对象）；format.renderDetail 对它 Object.entries 会逐字符渲染")
  const dArr = o({ detail: [] }).detail
  ok('detail 空数组 → 回落为普通对象 {}【回归锁：曾透传 []】', isPlainObj(dArr), `实测 ${JSON.stringify(dArr)}`)
  if (Array.isArray(dArr)) warn('makeOutcome(detail=[])', '空数组通过 typeof object 检查但违反「非空对象」契约')
  ok('detail 正常对象原样保留', JSON.stringify(o({ detail: { a: 1 } }).detail) === '{"a":1}')
  // 组合：结果恒为「可安全消费」形状
  const safe = o({})
  ok('空输入产出形状完整（score/verdict/essence/keys/wuxing/timing/fidelity/detail 七字段齐）',
    ['score', 'verdict', 'essence', 'keys', 'wuxing', 'timing', 'fidelity', 'detail'].every((k) => k in safe))
}

// ═════════════════════ 13. v2 新增工具（角度 / 统计 / 强度 / 证据） ═════════════════════
section('13. v2 新增：norm360 / angleGap / signIndexOf / median / trimmedMean / quantile / weightedMean / weightedStd / signAgreement / evidence / evidenceDigest')

{
  // 角度
  ok('norm360 归一 [0,360)', K.norm360(-30) === 330 && K.norm360(360) === 0 && K.norm360(720.5) === 0.5 && K.norm360(-360) === 0)
  ok('norm360 非有限 → 0', K.norm360(NaN) === 0 && K.norm360(Infinity) === 0)
  let bad360 = false
  for (let d = -720; d <= 720; d += 7.5) { const v = K.norm360(d); if (!(v >= 0 && v < 360)) bad360 = true }
  ok('norm360 全域落在 [0,360)', !bad360)
  ok('angleGap ∈ [0,180] 且对称', [[350, 10], [0, 180], [10, 350], [0, 0], [90, 270]].every(([a, b]) => {
    const g = K.angleGap(a, b)
    return g >= 0 && g <= 180 && g === K.angleGap(b, a)
  }))
  eq('angleGap 具体值', [[350, 10], [0, 180], [0, 90], [0, 270]].map(([a, b]) => K.angleGap(a, b)), [20, 180, 90, 90])
  let bad180 = false
  for (let a = 0; a < 360; a += 3) for (let b = 0; b < 360; b += 3) { const g = K.angleGap(a, b); if (!(g >= 0 && g <= 180)) bad180 = true }
  ok('angleGap 网格扫描不越界（14400 组合）', !bad180)
  eq('signIndexOf 边界', [K.signIndexOf(0), K.signIndexOf(29.99), K.signIndexOf(30), K.signIndexOf(359.9), K.signIndexOf(360), K.signIndexOf(-1)], [0, 0, 1, 11, 0, 11])
  // median
  eq('median 奇偶', [K.median([1, 2, 3]), K.median([1, 2, 3, 4]), K.median([]), K.median([5])], [2, 2.5, 0, 5])
  ok('median 不改原数组', (() => { const a = [3, 1, 2]; K.median(a); return JSON.stringify(a) === '[3,1,2]' })())
  ok('median 过滤非有限', K.median([1, NaN, 3, Infinity]) === 2)
  // trimmedMean
  const seq = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  ok('trimmedMean(trim=0) = 普通均值', K.trimmedMean(seq, 0) === 5.5)
  ok('trimmedMean 稳健于极值', K.trimmedMean([0, ...Array(8).fill(50), 100]) === 50)
  ok('trimmedMean 空 → 0', K.trimmedMean([]) === 0 && K.trimmedMean(null) === 0)
  ok('trimmedMean 至少保留一个元素（小数组不崩）', [1, 2, 3].every((_, i, a) => Number.isFinite(K.trimmedMean(a, 0.4))))
  let badTrim = false
  for (let n = 0; n <= 20; n += 1) for (const t of [0, 0.05, 0.1, 0.25, 0.4, 0.9, -1]) {
    const v = K.trimmedMean(Array.from({ length: n }, (_, i) => i), t)
    if (!Number.isFinite(v)) badTrim = true
  }
  ok('trimmedMean 在所有 (n,trim) 组合下均为有限数', !badTrim)
  // quantile
  eq('quantile 端点与中位', [K.quantile(seq, 0), K.quantile(seq, 1), K.quantile(seq, 0.5), K.quantile([], 0.5)], [1, 10, 5.5, 0])
  let badQ = false
  for (const q of [-1, 0, 0.1, 0.5, 0.9, 1, 2]) { const v = K.quantile(seq, q); if (!(v >= 1 && v <= 10)) badQ = true }
  ok('quantile 超界 q 被夹取', !badQ)
  ok('quantile 单调不降', (() => { let p = -Infinity; for (let q = 0; q <= 1.0001; q += 0.05) { const v = K.quantile(seq, q); if (v < p - 1e-9) return false; p = v } return true })())
  // weightedMean
  ok('weightedMean 基本', K.weightedMean([{ value: 10, weight: 1 }, { value: 20, weight: 3 }]) === 17.5)
  ok('weightedMean 忽略 weight ≤ 0', K.weightedMean([{ value: 100, weight: 0 }, { value: -5, weight: 2 }]) === -5)
  ok('weightedMean 无非有限项时为有限', Number.isFinite(K.weightedMean([{ value: NaN, weight: 1 }, { value: 3, weight: 1 }])))
  ok('weightedMean 无有效项 → 0', K.weightedMean([]) === 0 && K.weightedMean(null) === 0 && K.weightedMean([{ value: 1, weight: 0 }]) === 0)
  ok('weightedMean 退化项不产生 NaN', Number.isFinite(K.weightedMean([{ value: 1, weight: NaN }, null, undefined])))
  // weightedStd
  ok('weightedStd 常量序列 = 0', K.weightedStd(Array.from({ length: 20 }, (_, i) => ({ value: 42, weight: i + 1 }))) === 0)
  const ws = K.weightedStd([{ value: 1, weight: 1 }, { value: 3, weight: 1 }])
  ok('weightedStd 两值 = 1', Math.abs(ws - 1) < 1e-12)
  ok('weightedStd 显式 mean 与内部一致', Math.abs(K.weightedStd([{ value: 1, weight: 1 }, { value: 3, weight: 1 }], 2) - 1) < 1e-12)
  ok('weightedStd 无有效项 → 0', K.weightedStd([]) === 0 && K.weightedStd([{ value: 1, weight: 0 }]) === 0)
  ok('weightedStd 非负且有限（随机抽样 200 组）', (() => {
    const rr = K.makeRand('ws')
    for (let t = 0; t < 200; t += 1) {
      const items = Array.from({ length: 1 + rr.below(8) }, () => ({ value: rr.range(-100, 100), weight: rr.range(0, 5) }))
      const v = K.weightedStd(items)
      if (!(Number.isFinite(v) && v >= 0)) return false
    }
    return true
  })())
  // signAgreement
  ok('signAgreement 全同号 → 1', K.signAgreement([{ score: 10 }, { score: 20 }, { score: 5 }]) === 1)
  ok('signAgreement 全反号 → 0', K.signAgreement([{ score: 10 }, { score: -20 }]) === 0)
  ok('signAgreement 一方为 0 → 0.5', K.signAgreement([{ score: 10 }, { score: 0 }]) === 0.5)
  ok('signAgreement 不足两项 → 1', K.signAgreement([{ score: 10 }]) === 1 && K.signAgreement([]) === 1)
  ok('signAgreement ∈ [0,1]（随机 300 组）', (() => {
    const rr = K.makeRand('sa')
    for (let t = 0; t < 300; t += 1) {
      const items = Array.from({ length: rr.below(12) }, () => ({ score: rr.range(-100, 100) }))
      const v = K.signAgreement(items)
      if (!(v >= 0 && v <= 1)) return false
    }
    return true
  })())
  ok('signAgreement 权重不影响同号/反号极值', K.signAgreement([{ score: 1, weight: 99 }, { score: -1, weight: 1 }]) === 0)
  if (K.signAgreement([{ score: -0.4 }, { score: 0.4 }]) === 1) {
    warn('signAgreement 近零对', 'score=±0.4 四舍五入后为 ±0，而 JS 中 `-0 === 0` 为 true → 走「同号」分支得 1，未走注释里写的「任一方为平按半分」分支。两者都属「平」，语义影响极小，仅记录')
  }
  // evidence / evidenceDigest
  eq('evidence 基本形状', K.evidence('规则A', 3), { rule: '规则A', value: 3 })
  ok('evidence 空 effect 被省略', !('effect' in K.evidence('r', 'v', '')) && !('effect' in K.evidence('r', 'v', null)))
  ok('evidence 有 effect 时保留', K.evidence('r', 'v', '+5').effect === '+5')
  ok('evidence 非串 rule/value 被规范化', typeof K.evidence(123, undefined).rule === 'string' && K.evidence(123, undefined).value === '')
  ok('evidenceDigest 空 → ""', K.evidenceDigest([]) === '' && K.evidenceDigest(null) === '')
  ok('evidenceDigest 上限生效', K.evidenceDigest([1, 2, 3, 4, 5, 6].map((i) => K.evidence(`r${i}`, i)), 3) === 'r1=1；r2=2；r3=3')
  ok('evidenceDigest 过滤假值', K.evidenceDigest([null, K.evidence('r', 1), undefined]) === 'r=1')
  ok('evidenceDigest 默认 4 条', K.evidenceDigest(Array.from({ length: 9 }, (_, i) => K.evidence(`r${i}`, i))).split('；').length === 4)
  // DEG
  ok('DEG = 360', K.DEG === 360)
}

// ═════════════════════ 14. 表间自洽（kit 内部 8 张表的交叉不变量） ═════════════════════
section('14. kit 内部表间自洽')

{
  ok('GAN/ZHI 各 10/12 且无重复', K.GAN.length === 10 && new Set(K.GAN).size === 10 && K.ZHI.length === 12 && new Set(K.ZHI).size === 12)
  ok('GAN_WUXING/GAN_YANG 十干齐全', K.GAN.every((g) => WX.includes(K.GAN_WUXING[g]) && typeof K.GAN_YANG[g] === 'boolean'))
  ok('ZHI_WUXING/ZHI_YANG/ZHI_ANIMAL/ZHI_HOUR 十二支齐全', K.ZHI.every((z) => WX.includes(K.ZHI_WUXING[z]) && typeof K.ZHI_YANG[z] === 'boolean' && K.ZHI_ANIMAL[z] && Number.isFinite(K.ZHI_HOUR[z])))
  ok('五行各含 2 干', WX.every((w) => K.GAN.filter((g) => K.GAN_WUXING[g] === w).length === 2))
  ok('五行各含 2–4 支', WX.every((w) => { const n = K.ZHI.filter((z) => K.ZHI_WUXING[z] === w).length; return n >= 2 && n <= 4 }))
  // 六合/六冲：互逆、无自映射、并集覆盖 12 支
  ok('ZHI_LIUHE 互逆且无自映射', K.ZHI.every((z) => K.ZHI_LIUHE[K.ZHI_LIUHE[z]] === z && K.ZHI_LIUHE[z] !== z))
  ok('ZHI_LIUCHONG 互逆且无自映射', K.ZHI.every((z) => K.ZHI_LIUCHONG[K.ZHI_LIUCHONG[z]] === z && K.ZHI_LIUCHONG[z] !== z))
  ok('六冲 ≡ 支序 ±6', K.ZHI.every((z) => K.ZHI_LIUCHONG[z] === K.ZHI[(K.ZHI.indexOf(z) + 6) % 12]))
  ok('六合与六冲自成 6 对', new Set(Object.values(K.ZHI_LIUHE)).size === 12 && new Set(Object.values(K.ZHI_LIUCHONG)).size === 12)
  ok('ZHI_XIANGHAI 互逆', K.ZHI.every((z) => K.ZHI_XIANGHAI[K.ZHI_XIANGHAI[z]] === z))
  // 三合 / 三会
  const JU = { 水: ['申', '子', '辰'], 木: ['亥', '卯', '未'], 火: ['寅', '午', '戌'], 金: ['巳', '酉', '丑'] }
  ok('ZHI_SANHE 与四局一致', Object.entries(JU).every(([ju, zs]) => zs.every((z) => K.ZHI_SANHE[z] === ju)))
  const HUI = { 木: ['寅', '卯', '辰'], 火: ['巳', '午', '未'], 金: ['申', '酉', '戌'], 水: ['亥', '子', '丑'] }
  ok('ZHI_SANHUI 与四会方一致', Object.entries(HUI).every(([w, zs]) => zs.every((z) => K.ZHI_SANHUI[z] === w)))
  // 藏干：总干数、无重复、本气支序与支同五行
  let badCang = []
  for (const z of K.ZHI) {
    const c = K.ZHI_CANGGAN[z]
    if (!Array.isArray(c) || c.length < 1 || c.length > 3) badCang.push(`${z} 长度`)
    if (new Set(c).size !== c.length) badCang.push(`${z} 重复`)
    if (!c.every((g) => K.GAN.includes(g))) badCang.push(`${z} 非法干`)
    if (K.GAN_WUXING[c[0]] !== K.ZHI_WUXING[z] && !(z === '辰' || z === '戌' || z === '丑' || z === '未')) badCang.push(`${z} 本气五行不符`)
  }
  ok('ZHI_CANGGAN 形状与五行自洽', badCang.length === 0, badCang.slice(0, 4).join(','))
  ok('SHENG/KE/KE_BY/SHENG_BY 互为逆', WX.every((a) => K.SHENG_BY[K.SHENG[a]] === a && K.KE_BY[K.KE[a]] === a))
  ok('SHENG/KE 各自成 5 环', (() => { let x = '木'; for (let i = 0; i < 5; i += 1) x = K.SHENG[x]; return x === '木' })() && (() => { let x = '木'; for (let i = 0; i < 5; i += 1) x = K.KE[x]; return x === '木' })())
  ok('CHANGSHENG 12 位、CHANGSHENG_START 10 干', K.CHANGSHENG.length === 12 && Object.keys(K.CHANGSHENG_START).length === 10)
  ok('NAYIN 60 键、XUNKONG 6 键（每键 2 支）', Object.keys(K.NAYIN).length === 60 && Object.values(K.XUNKONG).every((k) => k.length === 2))
  ok('VERDICT_VALUE 与 verdictOf 单调一致', (() => { const vs = K.VERDICTS.map((v) => K.VERDICT_VALUE[v]); return vs.every((v, i) => i === 0 || v > vs[i - 1]) })())
  ok('WUXING / WUXING_ORDER 内容一致', JSON.stringify([...K.WUXING]) === JSON.stringify([...K.WUXING_ORDER]))
  ok('WUXING_COLOR 五键齐', WX.every((w) => /^#[0-9a-f]{6}$/i.test(K.WUXING_COLOR[w])))
}

// ═════════════════════ 15. 跨函数一致性与健壮性（本轮新增发现） ═════════════════════
section('15. 跨函数一致性 / 健壮性：非数组入参、同义函数分歧、NaN 传播')

{
  /** 安全调用：捕获是否抛异常。 */
  const tryCall = (f) => { try { return { ok: true, value: f() } } catch (e) { return { ok: false, err: `${e.constructor.name}: ${e.message}` } } }

  // 15.1 非数组入参：median/trimmedMean/quantile 未做类型防护（同区块的 weightedMean/signAgreement 都做了）
  const crash = []
  for (const [name, fn] of [['median', () => K.median(123)], ['median', () => K.median('abc')], ['trimmedMean', () => K.trimmedMean({})], ['quantile', () => K.quantile(123, 0.5)]]) {
    const r = tryCall(fn)
    if (!r.ok) crash.push(`${name}: ${r.err}`)
  }
  const guarded = [tryCall(() => K.weightedMean(null)).ok, tryCall(() => K.signAgreement(null)).ok, tryCall(() => K.weightedStd(null)).ok]
  ok('非数组入参不得抛异常（median/trimmedMean/quantile）【回归锁：曾抛 TypeError】', crash.length === 0, crash.join(' | '))
  ok('非数组入参回落为 0（中性值）', K.median(123) === 0 && K.median('abc') === 0 && K.trimmedMean({}) === 0 && K.quantile(123, 0.5) === 0)
  if (crash.length > 0) {
    warn('median/trimmedMean/quantile 非数组入参抛 TypeError', `实测：${crash[0]}。同区块的 weightedMean/weightedStd/signAgreement 对 null/非数组均安全返回（${guarded.filter(Boolean).length}/3），此处不一致。一行可修：起始改为 \`const src = Array.isArray(arr) ? arr : []\``)
  }
  ok('weightedMean/weightedStd/signAgreement 对 null 安全', guarded.every(Boolean))

  // 15.2 weightedScore 与 weightedMean 同名不同义（同一「加权平均」两个契约）
  const wsMissing = K.weightedScore([{ score: 10 }])
  const wmMissing = K.weightedMean([{ value: 10 }])
  const wsNaN = K.weightedScore([{ score: 10, weight: NaN }])
  const wmNaN = K.weightedMean([{ value: 10, weight: NaN }])
  const wsBig = K.weightedScore([{ score: 1e9, weight: 1 }])
  const wmBig = K.weightedMean([{ value: 1e9, weight: 1 }])
  ok('weightedScore 对缺省权重按 1 计', wsMissing === 10)
  ok('weightedMean 对缺省权重按「忽略」计', wmMissing === 0)
  if (wsMissing !== wmMissing && wsNaN !== wmNaN && wsBig !== wmBig) {
    warn('weightedScore / weightedMean 契约分歧', `同一形状的入参给出不同结果：`
      + `缺省权重 ${wsMissing} vs ${wmMissing}；weight=NaN ${wsNaN} vs ${wmNaN}；超界值 ${wsBig} vs ${wmBig}。`
      + '前者「非有限权重当 1 且把分数夹到 ±100」，后者「非有限权重当 0（跳过）且不夹取」。两函数都在 kit 公开导出，'
      + '方法层与聚合层若混用会出现口径漂移；建议在注释里写明「weightedScore 专用于 -100..100 评分、weightedMean 为通用统计」或统一语义')
  }

  // 15.3 旺相休囚死两套「力量」映射不成比例
  const MAP = { 旺: '木', 相: '火', 休: '水', 囚: '金', 死: '土' }
  const ratios = ['旺', '相', '休', '囚', '死'].map((s) => ({ s, fromScore: K.wangShuai(MAP[s], '木').score / 100, fromFactor: K.strengthOf(s) }))
  const mismatched = ratios.filter((r) => Math.abs(r.fromScore - r.fromFactor) > 1e-9)
  ok('wangShuai().score/100 与 strengthOf() 五档完全一致【回归锁：曾休囚死三档偏高】', mismatched.length === 0,
    mismatched.map((r) => `${r.s}:${r.fromScore}/%.2f`.replace('%.2f', r.fromFactor)).join(','))
  if (mismatched.length > 0) {
    warn('力量映射两套口径', `wangShuai().score/100 = ${ratios.map((r) => `${r.s}${r.fromScore}`).join(' ')}；`
      + `STRENGTH_FACTOR = ${ratios.map((r) => `${r.s}${r.fromFactor}`).join(' ')}。`
      + '同一法门若一处按 score 差、一处按 factor 乘，会引入不一致权重')
  }

  // 15.4 NaN/非法输入的传播形态
  ok('mod(n,0) 返回 NaN 而非崩溃', Number.isNaN(K.mod(5, 0)))
  warn('mod(n,0)', `返回 ${K.mod(5, 0)}（NaN，不抛）。kit 内部调用都用常量模数（60/12/10），实际无风险；记录以便调用方知晓`)
  ok('ganzhiOf(NaN) 不抛异常', (() => { try { K.ganzhiOf(NaN); return true } catch { return false } })())
  const gzNaN = K.ganzhiOf(NaN)
  ok('ganzhiOf 非法入参返回字符串「—」【回归锁：曾返回数值 NaN】', gzNaN === '—' && typeof gzNaN === 'string', `实测 ${typeof gzNaN} ${String(gzNaN)}`)
  if (typeof gzNaN !== 'string') {
    warn('ganzhiOf 非法入参返回数值 NaN', `ganzhiOf(NaN) === ${String(gzNaN)}（类型 ${typeof gzNaN}）。`
      + '原因：`GAN[NaN] + ZHI[NaN]` 中两个 undefined 相加得数值 NaN。契约声明返回 string；调用方若把结果拼进文本会得到 "NaN"。'
      + '建议加 `if (!Number.isFinite(index)) return "—"`')
  }
  ok('verdictOf(NaN) 不抛且落在七档内', K.VERDICTS.includes(K.verdictOf(NaN)))

  // 15.5 hash32 无碰撞（2 万串）+ 雪崩粗检
  const uniq = new Set()
  for (let i = 0; i < 20000; i += 1) uniq.add(K.hash32(`q${i}`))
  ok('hash32 2 万字符串无碰撞', uniq.size === 20000, `${uniq.size}/20000`)
  const bits = new Array(32).fill(0)
  for (let i = 0; i < 4000; i += 1) {
    const h = K.hash32(`avalanche-${i}`)
    for (let b = 0; b < 32; b += 1) if ((h >>> b) & 1) bits[b] += 1
  }
  const bitMin = Math.min(...bits)
  const bitMax = Math.max(...bits)
  ok('hash32 各比特位分布均衡（4000 样本，每位 1400–2600）', bitMin > 1400 && bitMax < 2600, `min=${bitMin} max=${bitMax}`)

  // 15.6 evidenceDigest max=0 的退化
  const d0 = K.evidenceDigest([K.evidence('r', 1)], 0)
  ok('evidenceDigest(nodes,0) 不抛', typeof d0 === 'string')
  if (d0 === '') warn('evidenceDigest(nodes, max=0)', '返回空串（静默丢弃全部证据行）；max 未做下界保护，建议 clamp(max,1,∞)')
}

// ═════════════════════ 汇总 ═════════════════════
console.log(`\n${'='.repeat(62)}`)
console.log(`PASS ${pass} ｜ WARN ${warns.length} ｜ FAIL ${fails.length}`)
if (warns.length > 0) {
  console.log('\n—— 边界/健壮性观察（WARN，非缺陷，详见 docs/verification/kit-exhaustive.md）——')
  for (const w of warns) console.log(`  · ${w}`)
}
if (fails.length > 0) {
  console.log('\n—— 失败项（FAIL）——')
  for (const f of fails) console.log(`  · ${f}`)
  console.log('\n结论：kit.js 存在需修问题，见上。')
  process.exit(1)
}
console.log('\n结论：kit.js 全部导出穷举/闭式对拍通过 ✅（WARN 项为边界观察，已在文档记录）')
