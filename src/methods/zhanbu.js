/**
 * 方法模块 · 签卜 + 杂占（16 法 / 10 引擎）
 *
 * 覆盖注册表 no.83–98：
 *   83–89 签卜：观音/关帝/月老/吕祖/黄大仙/妈祖/车公灵签（同引擎 `qian`）、掷筊 `jiao`
 *   90–98 杂占：米卦 `mibua`、测字·笔画 `ceziBiHua`、测字·拆字 `ceziChaiZi`、
 *              周公解梦 `zhougong`、鸟占 `niaoZhan`、眼跳占 `yanTiao`、
 *              喷嚏占 `penTi`、五音占 `wuYin`
 *
 * ## 契约（见 core/runner.js 顶部）
 * ```js
 * export const engines = { 引擎名(chart, entry, rand) { return 结果对象 | null } }
 * ```
 * 结果字段：`score`(-100..100) / `essence`(≤60字) / `keys`(≤6) / `wuxing`(非负五项)
 * / `timing`(应期或 null) / `detail`(非空对象，中文键名) / `fidelity`(可覆盖条目默认)。
 *
 * ## 三条硬约束
 * 1. 纯函数：不读时钟/文件/网络，不写模块级可变状态；**不读签谱文件**。
 * 2. 不抛异常：算不出返回 `null`。
 * 3. 不用 `Math.random()`：随机一律走 `rand`。
 *
 * ## 本模块的诚实口径（最重要的一段）
 * 手上**没有**签谱辞书、解梦辞书、音韵字表。因此：
 * - **绝不编造签诗原文**。`qian` 只出「签号 + 签级 + 对应卦象 + 断语」，
 *   并在 `detail.说明` 里写明签诗原文未内置、如需全文请提供签谱 JSON。
 * - 凡按公开通例编辑出来的表（梦象、鸦鸣方位、眼跳、喷嚏、签级层次分布），
 *   一律在 `detail.说明` 声明「公开通例的编辑取值」，条目 `fidelity` 为 `approx`/`core`。
 * - **可以做实的就做实**：部首五行表（130 余个偏旁）、掷筊三掷组合、米卦三数起卦、
 *   五音配五行、卦德/卦气合成，都是公开算法，不用编。
 * - 手上没有的表，用**确定性替代法**（如测字以字码取数代替笔画、五音以字码取音
 *   代替声母），并在 `detail.说明` 里把替代法与替代原因写清楚。
 *
 * 私有数据表见 `./data/zhanbu.js`。
 */

import {
  SHENG, SHENG_BY, relation, relationScore, wangShuai, mod, clamp,
  emptyWuxing, ZHI, ZHI_WUXING,
} from '../core/kit.js'
import {
  TRIGRAMS, TRI_BY_NAME, hexInfoOf, HEX_POLARITY, HEX_WUXING, HEX_SEQ, WUYIN,
} from '../core/tables.js'
import {
  QIAN_LEVELS, QIAN_LEVEL_SCORE, QIAN_LEVEL_SAY, QIAN_SYSTEMS, QIAN_NOTE, QIAN_LEVEL_NOTE,
  HEX_UP_LOW, JIAO_COMBO, JIAO_FACE,
  BUSHOU_WUXING, BUSHOU_CHARS, BUSHOU_POS, BUSHOU_META, DREAM_OMENS, DREAM_META,
  ZHI12, FANG_WUXING, FANG_MEANING, NIAO_FANG, NIAO_KIND, NIAO_SAY, FANG_KW,
  YAN_TIAO, YAN_META, PEN_TI, PEN_SHENG, PEN_META,
  WUYIN_ORDER, ZHI_YIN, WUYIN_SAY, WUYIN_META,
} from './data/zhanbu.js'

// ───────────────────────── 拆字索引 ─────────────────────────

/** 偏旁 → 五行（由 BUSHOU_WUXING 数组建索引）。 */
const WX_BY_BUSHOU = new Map(BUSHOU_WUXING.map(([b, wx]) => [b, wx]))

/**
 * 常用字 → 偏旁索引（由 BUSHOU_CHARS 的「偏旁 → 字串」反转）。
 * 同一字若在多组出现，以先出现者为准。
 */
const BUSHOU_BY_CHAR = (() => {
  const out = new Map()
  for (const [bs, chars] of Object.entries(BUSHOU_CHARS)) {
    for (const ch of chars) {
      if (/\S/.test(ch) && !out.has(ch)) out.set(ch, bs)
    }
  }
  return out
})()

/**
 * 拆字虚字表：只作语法连接、不载事象，**不参与体用取字**（仍列于逐字拆解）。
 * 这是一张公开的现代汉语虚字表，与术数无关。
 */
const XUZI = new Set([
  '的', '了', '吗', '呢', '吧', '啊', '呀', '是', '在', '和', '与', '跟', '同', '向', '往',
  '给', '对', '为', '把', '被', '让', '还', '就', '都', '也', '很', '太', '我', '你', '他',
  '她', '它', '们', '这', '那', '之', '其', '而', '但', '或', '么', '个', '些', '什', '怎',
  '样', '时', '候', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '能', '会',
  '要', '不', '没', '无', '可', '以', '有',
])

/**
 * 求某字的部首（三级：常用字部首表 → 字形字面包含 → 无）。
 * @param {string} ch 单字。
 * @returns {{b:string, wx:string, src:string}|null} 部首与五行。
 */
function bushouOf(ch) {
  const direct = BUSHOU_BY_CHAR.get(ch)
  if (direct && WX_BY_BUSHOU.has(direct)) {
    return { b: direct, wx: WX_BY_BUSHOU.get(direct), src: '常用字部首表' }
  }
  // 字形字面包含：只有「本身即部首」的字（水/木/火/见/门…）会命中
  for (const [bs, wx] of BUSHOU_WUXING) {
    if (ch.includes(bs)) return { b: bs, wx, src: '字形字面包含' }
  }
  return null
}

/**
 * 列出某字在两级口径下命中的全部偏旁（首项为本字部首，其余为兼象）。
 * @param {string} ch 单字。
 * @returns {Array<{b:string, wx:string, src:string}>} 命中列表（可空）。
 */
function bushouAllOf(ch) {
  const hits = []
  const primary = bushouOf(ch)
  if (primary) hits.push(primary)
  for (const [bs, wx] of BUSHOU_WUXING) {
    if (hits.some((h) => h.b === bs)) continue
    if (ch.includes(bs)) hits.push({ b: bs, wx, src: '字形字面包含' })
  }
  return hits
}

// ───────────────────────── 共用原语 ─────────────────────────

/**
 * 取有限整数（非有限值回落 fallback）。
 * @param {*} v 值。
 * @param {number} fallback 兜底。
 * @returns {number} 整数。
 */
function intOf(v, fallback) {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? n : fallback
}

/**
 * 三数起卦（米卦 / 测字共用）。
 * 上卦 = a mod 8（余 0 作 8）、下卦 = b mod 8、动爻 = c mod 6（余 0 作 6）；
 * 先天数序同 core/tables.js 的 TRIGRAMS.xian。
 * @param {number} a 上卦数。
 * @param {number} b 下卦数。
 * @param {number} c 动爻数。
 * @returns {{upT:object, loT:object, bits:number[], changed:number[], movePos:number}} 卦。
 */
function guaFromNumbers(a, b, c) {
  const upN = mod(intOf(a, 1) - 1, 8) + 1
  const loN = mod(intOf(b, 1) - 1, 8) + 1
  const mv = mod(intOf(c, 1) - 1, 6) + 1
  const upT = TRIGRAMS.find((t) => t.xian === upN) ?? TRIGRAMS[0]
  const loT = TRIGRAMS.find((t) => t.xian === loN) ?? TRIGRAMS[0]
  const bits = [...loT.bits, ...upT.bits]
  const changed = bits.slice()
  changed[mv - 1] = 1 - changed[mv - 1]
  return { upT, loT, bits, changed, movePos: mv }
}

/**
 * 本卦 / 变卦 / 卦气 合成断分（签卜与杂占共用的轻量口径）。
 * 口径：**卦德 ×0.5 + 变卦德 ×0.25 + 卦气（月令旺衰）×0.35**。
 * @param {object} chart 盘基。
 * @param {number[]} bits 本卦六爻（自下而上）。
 * @param {number} movePos 动爻位（1..6）。
 * @returns {{ben:object, bian:object, gas:object, score:number, wuxing:object}} 断果。
 */
function judgeGua(chart, bits, movePos) {
  const ben = hexInfoOf(bits)
  const changed = bits.slice()
  const mv = Math.min(6, Math.max(1, intOf(movePos, 1)))
  changed[mv - 1] = 1 - changed[mv - 1]
  const bian = hexInfoOf(changed)
  const benWx = ben.wuxing || '土'
  const bianWx = bian.wuxing || '土'
  const gas = wangShuai(benWx, chart.monthWx)
  const score = clamp(
    ben.polarity * 0.5 + bian.polarity * 0.25 + (gas.score - 55) * 0.35,
    -100, 100,
  )
  const wuxing = emptyWuxing()
  wuxing[benWx] += 2
  wuxing[bianWx] += 1
  wuxing[chart.monthWx] += 1
  return { ben, bian, gas, score, wuxing }
}

/**
 * 体用（梅花口径）：动爻在下卦（1-3）则下卦为用、上卦为体，反之亦然。
 * @param {number[]} bits 本卦六爻。
 * @param {number} movePos 动爻位。
 * @returns {{ti:string, yong:string, tiWx:string, yongWx:string, rel:string, score:number}}
 */
function tiYongOf(bits, movePos) {
  const upName = TRIGRAMS.find((t) => t.bits.join('') === bits.slice(3, 6).join(''))?.name ?? '乾'
  const loName = TRIGRAMS.find((t) => t.bits.join('') === bits.slice(0, 3).join(''))?.name ?? '乾'
  const ti = movePos <= 3 ? upName : loName
  const yong = movePos <= 3 ? loName : upName
  const tiWx = TRI_BY_NAME[ti]?.wx ?? '土'
  const yongWx = TRI_BY_NAME[yong]?.wx ?? '土'
  const rel = relation(tiWx, yongWx)
  const score = { 生我: 70, 比和: 45, 我克: 25, 我生: -15, 克我: -75 }[rel] ?? 0
  return { ti, yong, tiWx, yongWx, rel, score }
}

/**
 * 分数 → 四字断语（essence 尾部用，短）。
 * @param {number} score 分数。
 * @returns {string} 断语。
 */
function shortSay(score) {
  if (score >= 70) return '大吉可成'
  if (score >= 40) return '吉而可成'
  if (score >= 15) return '小吉缓成'
  if (score > -15) return '平守为吉'
  if (score > -40) return '小凶宜慎'
  if (score > -70) return '凶宜止'
  return '大凶宜止'
}

/**
 * 应期：按该五行在月令的旺衰给「何时转旺」。
 * @param {string} wx 五行。
 * @param {object} chart 盘基。
 * @returns {string} 应期文本。
 */
function timingOf(wx, chart) {
  const gas = wangShuai(wx, chart.monthWx)
  if (gas.state === '旺') return `${chart.monthZhi}月内即应`
  if (gas.state === '相') return `次月（${SHENG[chart.monthWx] ?? '本气'}旺之月）应`
  if (gas.state === '休') return `${SHENG_BY[wx] ?? '本气'}月转旺时应`
  return `需待${SHENG_BY[wx] ?? '本气'}月方有转机`
}

/**
 * 查偏旁位置（左/右/上/下/外），未收录返回 ''。
 * @param {string} b 偏旁。
 * @returns {string} 位置名或空串。
 */
function posOf(b) {
  for (const [pos, list] of Object.entries(BUSHOU_POS)) {
    if (list.split(/\s+/).includes(b)) return pos
  }
  return ''
}

/**
 * 描述某字的整体结构（拆字用）。
 * @param {{ch:string, b:string}} p 逐字拆解结果。
 * @param {string} pos 偏旁位置（posOf 的结果，可空）。
 * @returns {string} 结构描述。
 */
function structOf(p, pos) {
  if (p.ch === p.b) return '独体（本字即部首）'
  if (pos === '左') return '左右结构·偏旁居左（阳位）'
  if (pos === '上') return '上下结构·偏旁居上（阳位）'
  if (pos === '右') return '左右结构·偏旁居右（阴位）'
  if (pos === '下') return '上下结构·偏旁居下（阴位）'
  if (pos === '外') return '半包围/包围结构（中位）'
  return '合体（偏旁位置未收录）'
}

/**
 * 签号 → 签级。
 *
 * 手上没有「逐签对照表」，所以不冒充。做法：把该签种公开的吉凶层次分布
 * （各档位计数）铺成一条长度为 `total` 的档位带，再用固定步长 37 做置换
 * （37 与 100/96/60 互质，故置换是一一映射），使各签级均匀散布在签号上。
 * 于是「同一签种里每个签号恒对应同一签级」，且各档位数量与公开分布一致。
 *
 * @param {object} sys 签种元数据。
 * @param {number} n 签号（1..total）。
 * @returns {string} 签级名。
 */
function qianLevelAt(sys, n) {
  const band = []
  sys.levels.forEach((cnt, li) => {
    for (let i = 0; i < cnt; i += 1) band.push(li)
  })
  if (band.length === 0) return QIAN_LEVELS[3]
  return QIAN_LEVELS[band[mod((n - 1) * 37, band.length)]] ?? QIAN_LEVELS[3]
}

/**
 * 签级 → 一句断语（叠加卦德与卦气后更具体）。
 * @param {string} level 签级。
 * @param {number} polarity 卦德。
 * @param {object} gas 卦气（月令旺衰）。
 * @returns {string} 断语。
 */
function qianSay(level, polarity, gas) {
  const base = QIAN_LEVEL_SAY[level] ?? '平顺无咎'
  const hexPart = polarity > 25 ? '卦德助之' : polarity < -25 ? '卦德不助' : '卦德平平'
  const gasPart = gas.state === '旺' || gas.state === '相' ? '得月令之气' : '失月令之气'
  return `${base}；${hexPart}，${gasPart}`
}

/**
 * 取「所测之字」（测字·笔画 与 测字·拆字 共用）。
 *
 * 测字必须有一个明确的**字**。用户报了字就用它；没报就只能取象 ——
 * 此时返回 `assumed: true`，调用方要降 `fidelity` 为 `approx` 并把说明写进 detail。
 * 早期实现把**整句问句**当成所测之字，会得出一个看着像真、其实无意义的结果。
 *
 * @param {object} chart 盘基。
 * @returns {{chars:string[], assumed:boolean, note:string, reported:boolean}} 所测之字。
 */
function ceziTargets(chart) {
  const q = String(chart.question ?? '')
  // 明确报字：引号内（「明」「测字」）或「测字：明 / 拆字 明」样式
  const quoted = q.match(/[「『“"]([^」』”"]{1,3})[」』”"]/)?.[1] ?? ''
  const afterKw = q.match(/(?:测字|拆字|测个字|拆个字|字占|看字|解字)\s*[:：]?\s*([\u4e00-\u9fff]{1,3})/)?.[1] ?? ''
  const explicit = `${quoted}${afterKw}`.replace(/[^\u4e00-\u9fff]/g, '')
  if (explicit.length > 0) {
    return { chars: [...explicit].slice(0, 3), assumed: false, note: '用户所报之字', reported: true }
  }
  const first = q.match(/[\u4e00-\u9fff]/)?.[0] ?? '占'
  return {
    chars: [first],
    assumed: true,
    note: `未报所测之字，取所问首字「${first}」为象；建议明确写出要测的字（如「测字：明」）`,
    reported: false,
  }
}

// ───────────────────────── 引擎实现 ─────────────────────────

export const engines = {
  // ── 83-89 灵签（观音/关帝/月老/吕祖/黄大仙/妈祖/车公） ──
  qian(chart, entry, rand) {
    const want = String(entry?.params?.system ?? '观音')
    const known = Object.prototype.hasOwnProperty.call(QIAN_SYSTEMS, want)
    const sysName = known ? want : '观音'
    const sys = QIAN_SYSTEMS[sysName]
    const total = sys.total

    const n = rand.below(total) + 1
    const level = qianLevelAt(sys, n)
    const hexName = HEX_SEQ[(n - 1) % HEX_SEQ.length] ?? '乾为天'
    const polarity = HEX_POLARITY[hexName] ?? 0
    const hexWx = HEX_WUXING[hexName] ?? '土'
    const hl = HEX_UP_LOW[hexName] ?? { upper: '乾', lower: '乾', xiang: '天' }
    const gas = wangShuai(hexWx, chart.monthWx)

    const q = String(chart.question ?? '')
    const focusHit = (sys.focusKw ?? []).some((k) => k && q.includes(k))
    let score = (QIAN_LEVEL_SCORE[level] ?? 0) * 0.62 + polarity * 0.28 + (gas.score - 55) * 0.3
    // 签种专门事类（月老重姻缘）：所问合其专司则增，不合则减
    if (sys.focus === '姻缘') score += focusHit ? 8 : -4
    score = clamp(score, -100, 100)

    const say = shortSay(score)
    const wuxing = emptyWuxing()
    wuxing[hexWx] += 2
    wuxing[chart.monthWx] += 1

    return {
      score,
      essence: `${sysName}第${n}签(${level})·${hexName}·${say}`,
      keys: [hexName, level, hl.xiang, `${hexWx}${gas.state}`, `${sysName}签`],
      wuxing,
      timing: timingOf(hexWx, chart),
      detail: {
        签种: `${sysName}灵签（${sys.deity}）`,
        签数: `${n} / ${total}`,
        签级: level,
        签级释义: `${level}：${QIAN_LEVEL_SAY[level] ?? '—'}`,
        对应卦象: `${hexName}（上${hl.upper}${hl.upperXiang}·下${hl.lower}${hl.lowerXiang}，${hexWx}）`,
        卦德: `${polarity}（core/tables.js HEX_POLARITY，公开通例的编辑取值）`,
        卦气: `${gas.state}（月令${chart.monthZhi}·${chart.monthWx}）`,
        断语: qianSay(level, polarity, gas),
        专司: sys.focus === 'general' ? '通用（不专主一事）' : `${sys.focus}（所问${focusHit ? '合其专司' : '不合其专司，减等取用'}）`,
        签数出处: sys.note,
        签种识别: known ? `按 params.system=「${want}」` : `params.system=「${want}」不在本表，按观音处理`,
        说明: `${QIAN_NOTE}${QIAN_LEVEL_NOTE}。本引擎按该签种公开的吉凶层次分布（${sys.levels.join('/')}）将签级固定铺排到签号上，故同一签种每个签号恒对应同一签级，但**不是**逐签对照表；卦象按签号对六十四卦循环取（本插件自定的公开近似映射）。`,
      },
    }
  },

  // ── 90 掷筊 ──
  jiao(chart, entry, rand) {
    // 两筊三掷：每筊 1 = 正面（平面朝上），0 = 反面（凸面朝上）
    const seq = []
    const faces = []
    for (let i = 0; i < 3; i += 1) {
      const a = rand.chance(0.5) ? 1 : 0
      const b = rand.chance(0.5) ? 1 : 0
      const sum = a + b
      const key = sum === 1 ? '圣' : sum === 2 ? '笑' : '哭'
      seq.push(key)
      faces.push({ a, b, key })
    }
    const counts = { 圣: 0, 笑: 0, 哭: 0 }
    for (const k of seq) counts[k] += 1
    const combo = JIAO_COMBO[`${counts.圣}-${counts.笑}-${counts.哭}`]
    if (!combo) return null

    const comboName = `${counts.圣}圣${counts.笑}笑${counts.哭}哭`
    const hourWx = ZHI_WUXING[chart.hourZhi] ?? '土'
    const wuxing = emptyWuxing()
    wuxing[hourWx] += 1
    wuxing[chart.monthWx] += 1

    return {
      score: combo.score,
      essence: `掷筊${comboName}·${combo.允}·${shortSay(combo.score)}`,
      keys: [comboName, combo.允, shortSay(combo.score), '掷筊'],
      wuxing,
      timing: combo.速,
      detail: {
        三掷: faces.map((f, i) => `第${i + 1}掷 ${JIAO_FACE[f.key].name}（${JIAO_FACE[f.key].why}）`).join('；'),
        掷序: seq.map((k) => JIAO_FACE[k].sym).join(' '),
        组合: comboName,
        神明之意: combo.允,
        断: combo.断,
        应期: combo.速,
        问事之时: `${chart.ganzhi.day}日 ${chart.hourZhi}时（${hourWx}）`,
        说明: '掷筊三掷的组合判定为公开通行算法：一正一反为圣杯（允）、两正为笑杯（含糊／所问未明）、两反为哭杯（阴杯，不许／宜缓）；三圣杯为大吉。各组合的吉凶分与断语为民间通例的编辑取值。',
      },
    }
  },

  // ── 91 米卦 ──
  mibua(chart, entry, rand) {
    // 抓米三撮计数：本插件以确定性随机源模拟（同问同刻可复现）
    const c1 = rand.range(20, 99)
    const c2 = rand.range(20, 99)
    const c3 = rand.range(20, 99)
    const g = guaFromNumbers(c1, c2, c3)
    const j = judgeGua(chart, g.bits, g.movePos)
    const ty = tiYongOf(g.bits, g.movePos)
    const odd = mod(c1 + c2 + c3, 2) === 1
    const score = clamp(j.score + (odd ? 6 : -6), -100, 100)
    const say = shortSay(score)

    return {
      score,
      essence: `${j.ben.name}之${j.bian.name}·${ty.rel}·${say}`,
      keys: [j.ben.name, `之${j.bian.name}`, ty.rel, `${j.ben.wuxing}${j.gas.state}`, odd ? '奇阳' : '偶阴'],
      wuxing: j.wuxing,
      timing: timingOf(j.ben.wuxing, chart),
      detail: {
        三撮米数: `${c1} / ${c2} / ${c3}（共${c1 + c2 + c3}粒，${odd ? '奇数为阳，主进' : '偶数为阴，主守'}）`,
        起卦: `第一撮${c1}÷8取上卦、第二撮${c2}÷8取下卦、第三撮${c3}÷6取动爻`,
        上卦: `${g.upT.name}（${g.upT.xiang}·${g.upT.wx}，先天数${g.upT.xian}）`,
        下卦: `${g.loT.name}（${g.loT.xiang}·${g.loT.wx}，先天数${g.loT.xian}）`,
        动爻: `第${g.movePos}爻`,
        本卦: `${j.ben.name}（序${j.ben.order}，${j.ben.lines}）`,
        变卦: `${j.bian.name}（${j.bian.wuxing}）`,
        体用: `体${ty.ti}(${ty.tiWx}) 用${ty.yong}(${ty.yongWx}) → ${ty.rel}`,
        卦德: `${j.ben.polarity} → ${j.bian.polarity}`,
        卦气: `${j.gas.state}（月令${chart.monthZhi}·${chart.monthWx}）`,
        断: `${say}：${ty.rel === '生我' ? '用生体，得外助，事顺' : ty.rel === '比和' ? '体用比和，事顺而缓' : ty.rel === '我克' ? '体克用，我能制事' : ty.rel === '我生' ? '体生用，耗我之力' : '用克体，事来克我，宜守'}`,
        说明: '米卦以抓米三撮计数起卦（三数起卦法）为公开算法；本插件无实米可数，三撮米数以确定性随机源模拟（同问同刻必得同一组数）。吉凶按卦德×变卦德×卦气×体用合成。',
      },
    }
  },

  // ── 测字取字助手 ──
  // 测字要有明确的「字」。用户没报字时，取所问首字为象并**标注降保真度**——
  // 不能把整句问句当成所测之字（那样得出的结果看着像真、其实无意义）。
  // 见模块作用域的 ceziTargets()。

  // ── 92 测字·笔画 ──
  ceziBiHua(chart, entry, rand) {
    const q = String(chart.question ?? '')
    const nums = Array.isArray(chart.numbers) ? chart.numbers : []
    let a; let b; let c; let how
    let assumed = false
    let assumedNote = ''
    if (nums.length >= 2) {
      a = intOf(nums[0], 1)
      b = intOf(nums[1], 1)
      c = Number.isFinite(nums[2]) ? intOf(nums[2], a + b) : a + b
      how = `用户报数（笔画）${nums.slice(0, 3).join(' / ')}`
    } else {
      const t = ceziTargets(chart)
      assumed = t.assumed
      assumedNote = t.note
      const chars = t.chars
      const code = (ch) => ch.codePointAt(0) % 100
      const half = Math.max(1, Math.ceil(chars.length / 2))
      const up = chars.slice(0, half).reduce((s, ch) => s + code(ch), 0)
      const lo = chars.slice(half).reduce((s, ch) => s + code(ch), 0) || up
      const h = ZHI.indexOf(chart.hourZhi) + 1
      a = up
      b = lo
      c = up + lo + h
      how = `字码取数（「${chars.join('')}」逐字 codePointAt(0)%100 求和：上${up} 下${lo} 动${up}+${lo}+时${h}）${assumed ? `｜${t.note}` : ''}`
    }

    const g = guaFromNumbers(a, b, c)
    const j = judgeGua(chart, g.bits, g.movePos)
    const ty = tiYongOf(g.bits, g.movePos)
    const score = clamp(j.score * 0.6 + (ty.score - 20) * 0.4, -100, 100)
    const say = shortSay(score)

    return {
      score,
      essence: `${assumed ? '未报所测之字·取象：' : ''}${j.ben.name}之${j.bian.name}·体${ty.ti}(${ty.tiWx})用${ty.yong}(${ty.yongWx})${ty.rel}`,
      keys: [j.ben.name, `之${j.bian.name}`, ty.rel, `${j.ben.wuxing}${j.gas.state}`, say],
      wuxing: j.wuxing,
      timing: timingOf(j.ben.wuxing, chart),
      ...(assumed ? { fidelity: 'approx' } : {}),
      detail: {
        起数: how,
        上卦: `${g.upT.name}（${g.upT.xiang}·${g.upT.wx}）`,
        下卦: `${g.loT.name}（${g.loT.xiang}·${g.loT.wx}）`,
        动爻: `第${g.movePos}爻`,
        本卦: `${j.ben.name}（序${j.ben.order}，${j.ben.lines}）`,
        变卦: `${j.bian.name}（${j.bian.wuxing}）`,
        体用: `体${ty.ti}(${ty.tiWx}) 用${ty.yong}(${ty.yongWx}) → ${ty.rel}`,
        卦德: `${j.ben.polarity} → ${j.bian.polarity}`,
        卦气: `${j.gas.state}（月令${chart.monthZhi}·${chart.monthWx}）`,
        断: `${say}：${ty.rel === '生我' ? '用生体，事得外助' : ty.rel === '比和' ? '体用比和，事顺而缓' : ty.rel === '我克' ? '体克用，我能制事' : ty.rel === '我生' ? '体生用，耗我之力' : '用克体，事来克我，宜守'}`,
        说明: '以字码取数（确定性、可复现）；如你有笔画表，可通过 numbers 参数传入笔画。'
          + '本插件未内置汉字笔画表，故默认以「逐字 codePointAt(0) 取模求和」代替笔画数起卦；'
          + '若 chart.numbers 给到两个以上数值，则直接以之为笔画数。吉凶按卦德×变卦德×卦气×体用合成。'
          + (assumedNote ? `本问${assumedNote}` : ''),
      },
    }
  },

  // ── 93 测字·拆字 ──
  ceziChaiZi(chart, entry, rand) {
    const t = ceziTargets(chart)
    const assumed = t.assumed
    const assumedNote = t.note
    const chars = t.chars
    if (chars.length === 0) return null

    // 逐字拆解：常用字部首表 → 字形字面包含；命中不了的字不参与体用
    const parts = chars.map((ch) => {
      const hits = bushouAllOf(ch)
      return hits.length === 0
        ? { ch, b: '', wx: '', src: '', others: [], xuzi: XUZI.has(ch) }
        : { ch, b: hits[0].b, wx: hits[0].wx, src: hits[0].src, others: hits.slice(1), xuzi: XUZI.has(ch) }
    })
    const matched = parts.filter((p) => p.b)
    const content = matched.filter((p) => !p.xuzi)
    // 体用取字：优先取实字（虚字不参与），全为虚字时退用全部命中字
    const pick = content.length > 0 ? content : matched

    // 无部首可拆 → 以字码取数备援（不冒充拆字）
    if (pick.length === 0) {
      const sum = chars.reduce((s, ch) => s + (ch.codePointAt(0) % 100), 0)
      const wx = ['木', '火', '土', '金', '水'][mod(sum, 5)]
      const gas = wangShuai(wx, chart.monthWx)
      const score = clamp((gas.score - 55) * 0.8, -100, 100)
      const wuxing = emptyWuxing()
      wuxing[wx] += 2
      wuxing[chart.monthWx] += 1
      return {
        score,
        essence: `${assumed ? '未报所测之字·取象：' : ''}无部首可拆·以字码取${wx}·${gas.state}`,
        keys: ['字码取数', wx, gas.state, '无部首'],
        wuxing,
        timing: timingOf(wx, chart),
        ...(assumed ? { fidelity: 'approx' } : {}),
        detail: {
          所拆之字: `${chars.join('')}（共${chars.length}字）`,
          取字来源: assumedNote,
          逐字拆解: parts.map((p) => `${p.ch}：字面未见本表偏旁`).join('；'),
          命中字数: `0 / ${chars.length}`,
          字码和: sum,
          取用五行: `${wx}（字码和 ${sum} 取模）`,
          卦气: `${gas.state}（月令${chart.monthZhi}·${chart.monthWx}）`,
          断: '字面均未见本表偏旁，无可拆之象；改以字码取数定五行，仅作参考',
          部首表: `偏旁 ${BUSHOU_META.count} 个；常用字 ${BUSHOU_META.charCount} 个`,
          匹配口径: BUSHOU_META.matchNote,
          说明: `本问之字均未命中部首表，故以字码取数备援（不冒充拆字）。${BUSHOU_META.note}；${BUSHOU_META.charNote}；${BUSHOU_META.matchNote}。`,
        },
      }
    }

    const tiPart = pick[0]
    const yongPart = pick[pick.length - 1]
    const solo = pick.length === 1
    const tiWx = tiPart.wx
    const yongWx = solo ? chart.monthWx : yongPart.wx
    const rel = relation(tiWx, yongWx)
    const gas = wangShuai(tiWx, chart.monthWx)
    const base = relationScore(rel, { 比和: 40, 生我: 65, 我生: -12, 我克: 38, 克我: -55 })

    // 整体结构：本字即部首为独体；否则查偏旁位置表（左/上为阳位、右/下为阴位、外围为中位）
    const tiPos = posOf(tiPart.b)
    const structBonus = (() => {
      if (tiPart.ch === tiPart.b) return 8
      if (tiPos === '左' || tiPos === '上') return 6
      if (tiPos === '右' || tiPos === '下') return -4
      return 0
    })()
    const extra = pick.length >= 3 ? 3 : 0
    const score = clamp(base * 0.7 + (gas.score - 55) * 0.55 + structBonus + extra, -100, 100)
    const say = shortSay(score)

    const wuxing = emptyWuxing()
    wuxing[tiWx] += 2
    wuxing[yongWx] += 1
    wuxing[chart.monthWx] += 1

    const head = chars.length > 6 ? `${chars.slice(0, 6).join('')}…` : chars.join('')
    const sayOf = {
      生我: '用（末字）生体（首字），事有外来之助，吉',
      比和: '体用同气，字象相合，事顺而缓',
      我克: '体克用，我能制事，主动在我，小吉',
      我生: '体生用，我耗于外，事费力而利薄',
      克我: '用克体，字象相制，外事来克，宜守宜缓',
    }[rel] ?? '—'

    return {
      score,
      essence: `${assumed ? '未报所测之字·取象：' : ''}${head}·体${tiPart.b}(${tiWx})用${yongPart.b}(${yongWx})·${rel}`,
      keys: [`${tiPart.b}${tiWx}`, `${yongPart.b}${yongWx}`, rel, `${tiWx}${gas.state}`, say],
      wuxing,
      timing: timingOf(tiWx, chart),
      ...(assumed ? { fidelity: 'approx' } : {}),
      detail: {
        所拆之字: `${chars.join('')}（共${chars.length}字，命中${matched.length}字，其中实字${content.length}个）`,
        取字来源: assumedNote,
        逐字拆解: parts.map((p) => (p.b
          ? `${p.ch}：部首「${p.b}」属${p.wx}（${p.src}）${p.xuzi ? '［虚字，不参与体用］' : ''}${p.others.length > 0 ? `（兼象 ${p.others.map((o) => `${o.b}${o.wx}`).join('/')}）` : ''}`
          : `${p.ch}：未命中部首表`)).join('；'),
        体字: `${tiPart.ch}（部首「${tiPart.b}」·${tiWx}·${structOf(tiPart, tiPos)}）`,
        用字: solo
          ? `无（仅一字可拆，以月令${chart.monthZhi}（${chart.monthWx}）为用）`
          : `${yongPart.ch}（部首「${yongPart.b}」·${yongWx}·${structOf(yongPart, posOf(yongPart.b))}）`,
        取字口径: '体取所问之首个实字、用取末个实字；虚字（语法连接字）只列不取',
        体用关系: `${tiWx} 与 ${yongWx} → ${rel}`,
        卦气: `${gas.state}（月令${chart.monthZhi}·${chart.monthWx}）`,
        部首表: `偏旁五行 ${BUSHOU_META.count} 个；常用字部首 ${BUSHOU_META.charCount} 个；偏旁位置 ${BUSHOU_META.posCount} 个`,
        匹配口径: BUSHOU_META.matchNote,
        断: sayOf,
        说明: `拆字取象按部首／偏旁的五行归属与整体结构断吉凶。${BUSHOU_META.note}；${BUSHOU_META.charNote}；${BUSHOU_META.posNote}；${BUSHOU_META.matchNote}。`
          + (assumedNote ? `本问${assumedNote}` : ''),
      },
    }
  },

  // ── 94 周公解梦 ──
  zhougong(chart, entry, rand) {
    const q = String(chart.question ?? '')
    const isDream = q.includes('梦')
    // 顺序即优先级；命中后把关键词挖掉，避免「洪水」又命中「水」
    let rest = q
    const hits = []
    for (const o of DREAM_OMENS) {
      if (hits.length >= 4) break
      for (const k of o.kw) {
        if (k && rest.includes(k)) {
          hits.push({ hit: k, wx: o.wx, score: o.score, 断: o.断 })
          rest = rest.split(k).join('　')
          break
        }
      }
    }

    let mainWx
    let gas
    let score
    if (hits.length > 0) {
      const avg = hits.reduce((s, h) => s + h.score, 0) / hits.length
      const tally = {}
      for (const h of hits) tally[h.wx] = (tally[h.wx] ?? 0) + 1
      mainWx = Object.entries(tally).sort((x, y) => y[1] - x[1])[0][0]
      gas = wangShuai(mainWx, chart.monthWx)
      score = clamp(avg * 0.75 + (gas.score - 55) * 0.35 - (hits.length >= 3 ? 5 : 0), -100, 100)
    } else {
      // 备援：未辨梦象 → 以当日日支五行取象（参考值，不作实断）
      mainWx = ZHI_WUXING[chart.dayZhi] ?? '土'
      gas = wangShuai(mainWx, chart.monthWx)
      score = clamp((gas.score - 55) * 0.5, -100, 100)
    }
    const say = shortSay(score)
    const wuxing = emptyWuxing()
    wuxing[mainWx] += 2
    wuxing[chart.monthWx] += 1

    return {
      score,
      essence: hits.length > 0
        ? `梦${hits.map((h) => h.hit).join('')}·${mainWx}${gas.state}·${say}`
        : `未辨梦象·以日支${chart.dayZhi}(${mainWx})断·${say}`,
      keys: hits.length > 0
        ? [...hits.slice(0, 3).map((h) => h.hit), `${mainWx}${gas.state}`, say]
        : ['未辨梦象', mainWx, gas.state, say],
      wuxing,
      timing: timingOf(mainWx, chart),
      detail: {
        问句: q || '（未填）',
        是否言梦: isDream ? '问句含「梦」字，按梦占断' : '问句未言梦，按象取占（参考）',
        命中梦象: hits.length > 0
          ? hits.map((h) => `${h.hit}（${h.wx}·倾向${h.score > 0 ? '+' : ''}${h.score}）`).join('；')
          : '未命中本表梦象',
        主象五行: `${mainWx}（月令${chart.monthZhi}·${chart.monthWx} → ${gas.state}）`,
        诸象断语: hits.length > 0 ? hits.map((h) => h.断).join('；') : '—',
        断: hits.length > 0
          ? `${say}。${hits.length > 1 ? `${hits.length}象并见，以${mainWx}为主气，诸象取其均势` : '单象独见，以该象为主'}`
          : '问句中未见本表梦象，改以当日日支五行取象，仅作参考，不足为实断',
        梦象表: `共 ${DREAM_META.count} 条意象`,
        说明: `${DREAM_META.note}（本表共 ${DREAM_META.count} 条意象，按五行归类并给吉凶倾向）。未命中时以当日日支五行取象为备援，仅作参考。`,
      },
    }
  },

  // ── 95 鸟占（鸦鸣占） ──
  niaoZhan(chart, entry, rand) {
    const q = String(chart.question ?? '')
    const kind = NIAO_KIND.find((k) => k.kw.some((w) => q.includes(w)))
      ?? NIAO_KIND.find((k) => k.name === '鸦')
      ?? { name: '鸦', bias: 0, wx: '水', 断: '鸦鸣主报信' }

    let fang = null
    for (const f of FANG_KW) {
      if (f.kw.some((k) => q.includes(k))) { fang = f.f; break }
    }
    const fangFrom = fang ? '问句所报方位' : '问句未报方位，按占时以确定性随机源取方位'
    // 外应（鸟鸣）本是「现实观测」，用户没报就只能按通例取象：
    // 这种情况必须标注并降保真度，不能把插件取的值说成用户看到的。
    const kindReported = NIAO_KIND.some((k) => k.kw.some((w) => q.includes(w)))
    const assumed = !(kindReported && fang !== null)
    if (!fang) fang = rand.pick(['东', '南', '西', '北']) ?? '东'

    const ziIdx = Math.max(0, ZHI12.indexOf(chart.hourZhi))
    const row = NIAO_FANG[fang] ?? NIAO_FANG.东
    const base = Number.isFinite(row[ziIdx]) ? row[ziIdx] : 0
    const fangWx = FANG_WUXING[fang] ?? '土'
    const gas = wangShuai(fangWx, chart.monthWx)
    const score = clamp(base + (kind.bias ?? 0) + (gas.score - 55) * 0.2, -100, 100)
    const say = NIAO_SAY.find((s) => score > s.min)?.断 ?? '平常，事无大起落'

    const wuxing = emptyWuxing()
    wuxing[fangWx] += 2
    wuxing[kind.wx ?? '水'] += 1
    wuxing[chart.monthWx] += 1

    return {
      score,
      essence: `${assumed ? '未报外应·取象：' : ''}${fang}方${chart.hourZhi}时${kind.name}鸣·${say}`,
      keys: [`${fang}方`, `${chart.hourZhi}时`, kind.name, shortSay(score)],
      wuxing,
      timing: score >= 15 ? '三日内有信' : score > -15 ? '旬日内' : '宜静候，勿强求',
      ...(assumed ? { fidelity: 'approx' } : {}),
      detail: {
        鸟种: `${kind.name}（${kind.断}，加减${kind.bias ?? 0}）`,
        方位: `${fang}（${FANG_MEANING[fang] ?? '—'}·${fangWx}）`,
        方位来源: fangFrom,
        时辰: `${chart.hourZhi}时（${ZHI_WUXING[chart.hourZhi] ?? '土'}）`,
        方位时辰表值: `${base}（4×12 表）`,
        卦气修正: `${gas.state}（月令${chart.monthZhi}·${chart.monthWx}）`,
        断: say,
        说明: '鸦鸣占以方位与时辰定吉凶：方位义基准分 + 方位五行与时辰五行的生克 + 昼夜阴阳（卯至申为昼、酉至寅为夜），三项合成后固化为 4×12 表；鸟种（鸦／鹊／燕／枭）加减亦为编辑取值。以上皆为公开通例的编辑取值，非某一秘本原文。问句未报方位时按占时以确定性随机源取方位。',
      },
    }
  },

  // ── 96 眼跳占 ──
  yanTiao(chart, entry, rand) {
    const q = String(chart.question ?? '')
    let eye = null
    if (q.includes('左眼') || q.includes('左眼皮')) eye = '左'
    else if (q.includes('右眼') || q.includes('右眼皮')) eye = '右'
    const eyeFrom = eye ? '问句所报' : '问句未报左右，按确定性随机源取'
    // 未报「眼跳」这一外应时，只能算按通例取象（见 niaoZhan 的同类说明）。
    const assumed = !(eye !== null && (q.includes('跳') || q.includes('眼皮')))
    if (!eye) eye = rand.chance(0.5) ? '左' : '右'

    const ziIdx = Math.max(0, ZHI12.indexOf(chart.hourZhi))
    const row = YAN_TIAO[eye] ?? YAN_TIAO.左
    const cell = row[ziIdx] ?? row[0]
    const bias = eye === '左' ? 5 : -5
    const hourWx = ZHI_WUXING[chart.hourZhi] ?? '土'
    const gas = wangShuai(hourWx, chart.monthWx)
    const score = clamp(cell.score * 0.85 + (gas.score - 55) * 0.3 + bias, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[hourWx] += 2
    wuxing[chart.monthWx] += 1

    return {
      score,
      essence: `${assumed ? '未报外应·取象：' : ''}${eye}眼${chart.hourZhi}时跳·${cell.断}`,
      keys: [`${eye}眼`, `${chart.hourZhi}时`, cell.断, gas.state],
      wuxing,
      timing: `应在${chart.hourZhi}时前后三日`,
      ...(assumed ? { fidelity: 'approx' } : {}),
      detail: {
        眼别: `${eye}眼（${eyeFrom}）`,
        时辰: `${chart.hourZhi}时（${hourWx}·${gas.state}）`,
        口诀: `${eye}眼${cell.zhi}时：${cell.断}`,
        口诀分值: `${cell.score}（编辑取值）`,
        通例: YAN_META.rule,
        时辰五行修正: `${gas.state}（月令${chart.monthZhi}·${chart.monthWx}）`,
        断: `${cell.断}${score >= 15 ? '，主吉' : score <= -15 ? '，宜慎' : '，平常'}`,
        说明: `${YAN_META.note}。时辰五行按十二支本气取（${hourWx}），左右眼另按通例作 ±5 微调。`,
      },
    }
  },

  // ── 97 喷嚏占 ──
  penTi(chart, entry, rand) {
    const ziIdx = Math.max(0, ZHI12.indexOf(chart.hourZhi))
    const cell = PEN_TI[ziIdx] ?? PEN_TI[0]
    const nums = Array.isArray(chart.numbers) ? chart.numbers : []
    let sheng
    let shengFrom
    if (Number.isFinite(nums[0]) && nums[0] >= 1 && nums[0] <= 4) {
      sheng = Math.round(nums[0])
      shengFrom = `用户报数 ${nums[0]}（1–4 声，直接取用）`
    } else {
      sheng = rand.range(1, 4)
      shengFrom = Number.isFinite(nums[0])
        ? `报数 ${nums[0]} 不在 1–4 声内，改按确定性随机源取`
        : '未报声数，按确定性随机源取'
    }
    const s = PEN_SHENG[sheng] ?? PEN_SHENG[1]
    // 未报「喷嚏」这一外应、或声数不是用户给的 → 按通例取象（见 niaoZhan 的同类说明）。
    const q = String(chart.question ?? '')
    const assumed = !(q.includes('喷嚏') && Number.isFinite(nums[0]) && nums[0] >= 1 && nums[0] <= 4)
    const hourWx = ZHI_WUXING[chart.hourZhi] ?? '土'
    const gas = wangShuai(hourWx, chart.monthWx)
    const score = clamp(cell.score * 0.8 + s.score * 0.6 + (gas.score - 55) * 0.2, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[hourWx] += 2
    wuxing[chart.monthWx] += 1

    return {
      score,
      essence: `${assumed ? '未报外应·取象：' : ''}${chart.hourZhi}时喷嚏${sheng}声·${cell.断}`,
      keys: [`${chart.hourZhi}时`, `${sheng}声`, cell.断, gas.state],
      wuxing,
      timing: score >= 15 ? '即日至三日内' : '三日至旬日',
      ...(assumed ? { fidelity: 'approx' } : {}),
      detail: {
        时辰: `${chart.hourZhi}时（${hourWx}·${gas.state}）`,
        声数: `${sheng}声（${shengFrom}）`,
        时辰断: `${cell.zhi}时喷嚏：${cell.断}（${cell.score}）`,
        声数断: `${s.断}（${s.score}）`,
        断: `${cell.断}；${s.断}`,
        说明: `${PEN_META.note}。时辰五行按十二支本气取（${hourWx}）。`,
      },
    }
  },

  // ── 98 五音占 ──
  wuYin(chart, entry, rand) {
    // 主音：占时地支五行 → 五音（公开配属的直接推论）
    const mainYin = ZHI_YIN[chart.hourZhi] ?? '宫'
    const mainWx = WUYIN[mainYin] ?? '土'
    // 客音：有报数用报数，否则以所问首字字码取音（确定性替代法）
    const q = String(chart.question ?? '')
    const nums = Array.isArray(chart.numbers) ? chart.numbers : []
    let guestYin
    let guestFrom
    if (Number.isFinite(nums[0])) {
      guestYin = WUYIN_ORDER[mod(intOf(nums[0], 1) - 1, 5)]
      guestFrom = `用户报数 ${nums[0]}（取模定音）`
    } else {
      const ch = [...(q || '占')].find((c) => /\S/.test(c)) ?? '占'
      const code = ch.codePointAt(0)
      guestYin = WUYIN_ORDER[mod(code, 5)]
      guestFrom = `所问首字「${ch}」字码 ${code} 取模定音（无音韵表，确定性替代法）`
    }
    const guestWx = WUYIN[guestYin] ?? '土'
    const rel = relation(mainWx, guestWx)
    const gas = wangShuai(mainWx, chart.monthWx)
    const base = relationScore(rel, { 比和: 45, 生我: 70, 我生: -15, 我克: 40, 克我: -60 })
    const score = clamp(base * 0.7 + (gas.score - 55) * 0.45, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[mainWx] += 2
    wuxing[guestWx] += 1
    wuxing[chart.monthWx] += 1

    return {
      score,
      essence: `${mainYin}(${mainWx})受${guestYin}(${guestWx})·${rel}`,
      keys: [mainYin, guestYin, rel, `${mainWx}${gas.state}`],
      wuxing,
      timing: timingOf(mainWx, chart),
      detail: {
        主音: `${mainYin}（${mainWx}）— 由占时${chart.hourZhi}时地支五行推出`,
        客音: `${guestYin}（${guestWx}）— ${guestFrom}`,
        五音配属: '宫土 商金 角木 徵火 羽水（core/tables.js WUYIN，公开配属）',
        生克: `主${mainYin}(${mainWx}) 与 客${guestYin}(${guestWx}) → ${rel}`,
        卦气: `${gas.state}（月令${chart.monthZhi}·${chart.monthWx}）`,
        断: WUYIN_SAY[rel] ?? '—',
        说明: `${WUYIN_META.note}。十二支取音由地支五行→五音五行直接推出（亥子水→羽、寅卯木→角、巳午火→徵、申酉金→商、辰戌丑未土→宫），属公开算法。`,
      },
    }
  },
}

export default engines
