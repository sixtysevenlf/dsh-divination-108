/**
 * 术数内核 · 合盘聚合引擎（v2）
 *
 * 把 108 法的各自结论**收敛成一张合盘**：总分、票型、五行、共识、应期、分歧、类别倾向。
 * 全程纯计算，不调用模型 —— 这正是"省 token"的关键：108 法在本地算完，
 * 模型只读这张合盘，不必在思维链里推任何一法。
 *
 * ## 与 v1 的方法论差异（重要，写在明处便于复核）
 *
 * v1 是「逐法加权平均」：`总分 = Σ(score×w) / Σw`。这样做有一个结构性缺陷：
 * 易卦族有 24 法、签卜族有 16 法、相术族只有 2 法，**同族内部高度相关**
 * （同一个卦、同一个日辰、同一套五行），逐法平均等于让"法数最多的族"绑架合盘。
 * 一个 24 法的族集体看多，就能压过其余 7 个族的一致看空 —— 这不是"多法印证"，
 * 是"一个声音被重复了 24 遍"。
 *
 * v2 因此改为**两级聚合**：
 *   1. **门内**：每个分类先聚成一个「门分」，用**截尾均值**（去掉两端各 15% 极值）抗极端法门；
 *   2. **门间**：以 `√(门内法数)` 为门权合成总分。取 √ 而不是 1 或 n，是为了
 *      既承认"法多的门信息量大"，又不让它线性碾压法少的门。
 *
 * 同时保留逐法口径 `overall.rawScore`，并报出两者之差 `divergence.familySkew`——
 * 这个差值本身就是诊断量：**差值大 = 某族正在绑架结论**，值得警告。
 *
 * ## 其它口径
 * - 保真度系数：full=1.0, core=0.85, approx=0.6（近似法门不该和全算法门等权）；
 * - 一致性 conformance：**同号率**与**离散度**分开报，合成时各占一半。
 *   十家 +5 与十家 -5 的均值是 0、标准差很大、同号率是 0 —— 两个量含义不同，都要看；
 * - 置信 = 一致性 × 起卦覆盖率 × 可信度折扣（近似法门占比越高，折扣越大）；
 * - 五行信号按各法给的 wuxing 累加后归一，报「最旺」与「最缺」；
 * - 共识关键词按出现次数排序，另报「跨门数」（同一词出现在几个不同的门里才叫真共识）；
 * - 分歧 = 门内分差 ≥ 60 的极端对 + 门间最强/最弱之差；
 * - 出处账本 = 统计各法 `detail.cite` 的引用频次，报本盘引证最多的经典。
 */

import {
  VERDICTS, WUXING, clamp, truncate, trimmedMean, weightedMean, weightedStd,
  signAgreement, median, quantile,
} from './kit.js'
import { ENTRIES, CATEGORIES, FIDELITY_LABEL } from './registry.js'
import { durationOf } from './tables.js'

/** 保真度权重系数。 */
const FIDELITY_FACTOR = { full: 1.0, core: 0.85, approx: 0.6 }

/** 门内截尾比例（每端裁掉的比例）。 */
const TRIM = 0.15

/**
 * 主法 / 辅法加权倍率（规格口径：`skills/108-divination/SKILL.md` §五「实操主辅法」）。
 *
 * **为什么改成法号白名单**（delta D-06）：旧实现把 `boost` 键当 `name|id|cat|note` 的**子串**匹配，
 * 于是「健康」一条命中的是 `疾厄`（撞上风水/相术的子项名），「财运」命中的是 `财帛`（撞上 #103 面相十二宫），
 * 「考试」命中 `父母`（撞上 #77「父母三般卦」），「寻物」命中 `玄武`（撞上 #80 四形派·四灵）——
 * 8 个事类实际空转或错配，而手册 §五 的「主法」列就是这张错配表的逐字快照。
 *
 * 规格要求：**按法号白名单**给定（`no` 稳定、不随措辞漂移），内容直接取 SKILL §五「实操上值得优先讲的法」那一列。
 */
const TOPIC_MAIN_BOOST = 1.8
const TOPIC_AUX_BOOST = 1.3

/**
 * 问题归类：按关键词判断所问何事，用于给相关术法加权。
 * 这不是模型判断，是一张**公开的关键词表**，可自行增补。
 *
 * 每条字段：
 *   · `kw`      触发关键词（判类，未改动）；
 *   · `main`    主法（法号白名单，×1.8）—— 取 SKILL §五「实操主辅法」列；
 *   · `aux`     辅法（法号白名单，×1.3）—— 同列其余项；
 *   · `unboost` 降权项（仍按方法族子串匹配；这一条旧口径本来就有效：择时/月老/姓名/相术 属族级降权）；
 *   · `note`    主辅法分工依据（供 `meta.topicMain/aux` 与文档复述）。
 *
 * **关键词覆盖（task-19 补强）**：口语说法漏词会**静默降级为「综合」**（用户看不出加权没生效）。
 * 故各事类补入口语式（「东西丢哪了」「这份工作」「能回本吗」「能不能过」…）；
 * 明显歧义的短语（如「我跟他」「要不要去」「能成吗」——合作/相亲/就医都可能这么说）**刻意不收**，
 * 宁可让该问落到「综合」也不误判事类（取舍与理由记在 `docs/verification/skill-alignment.md`）。
 * **规则次序即平手裁决序**（命中数相同时取先出现者），故把更具体的类放前面。
 */
const TOPIC_RULES = [
  {
    topic: '姻缘',
    kw: ['姻缘', '感情', '婚姻', '结婚', '恋爱', '对象', '女友', '男友', '夫妻', '复合', '脱单', '相亲', '桃花', '离婚', '正缘', '缘分', '在一起', '表白', '暧昧', '喜欢他', '喜欢她', '异地恋', '冷战'],
    main: [85, 3],
    aux: [12, 21, 46],
    unboost: { 择时: 0.7 },
    note: 'SKILL §五：「#85 月老灵签｜#3 六爻纳甲（男占妻财、女占官鬼）｜#21 大象占（咸/恒之象）」；辅以 #12 文王卦用神、#46 神煞（桃花）',
  },
  {
    topic: '寻物',
    kw: ['寻物', '找', '丢了', '遗失', '失物', '不见', '不见了', '下落', '寻人', '走失', '找回', '丢哪', '哪去了', '哪去', '丢了没', '找不着', '找不到', '落哪', '忘哪', '捡到', '掉了', '落在'],
    main: [12, 91],
    aux: [93, 3],
    unboost: {},
    note: 'SKILL §五：「#12 用神取妻财｜#91 米卦｜#93 测字拆字（方位取象）」；口语补强：丢哪/哪去了/找不着/不见了',
  },
  {
    topic: '健康',
    kw: ['健康', '病', '身体', '疾', '手术', '康复', '疼', '痛', '医院', '中医', '吃药', '养生', '体检', '能好吗', '好得了吗', '严重吗', '严不严重', '要不要做手术', '住院', '失眠', '焦虑', '抑郁'],
    main: [12, 65],
    aux: [3, 105],
    unboost: { 择时: 0.6 },
    note: 'SKILL §五：「#12 用神取世爻（官鬼为病、子孙为药）｜#65 五运六气｜#105 占星（作参考）」；口语补强：能好吗/严重吗/要不要做手术',
  },
  {
    topic: '考试',
    kw: ['考试', '考', '升学', '考研', '公考', '面试', '学位', '论文', '答辩', '证书', '录取', '成绩', '能不能过', '能考上', '考得上', '过得了吗', '笔试', '复试'],
    main: [12, 46],
    aux: [3, 68],
    unboost: {},
    note: 'SKILL §五：「#12 用神取父母（文书）＋官鬼（名次）｜#3 六爻纳甲｜#46 八字神煞（文昌）」；口语补强：能不能过/能考上吗',
  },
  {
    topic: '财运',
    kw: ['财运', '钱', '财', '投资', '股票', '基金', '生意', '买卖', '回款', '欠款', '债', '收入', '赚钱', '亏', '发财', '彩票', '理财', '值不值', '回本', '亏不亏', '划算', '赚不赚', '本金', '分红', '还款', '报价'],
    main: [12, 3],
    aux: [59, 60, 62, 72],
    unboost: {},
    note: 'SKILL §五：「#12 文王卦用神（用神取妻财）｜#3 六爻纳甲｜#59–72 择时里取『开/定/成』类日」；口语补强：值不值/能回本吗/亏不亏',
  },
  {
    topic: '出行',
    kw: ['出行', '出门', '旅行', '旅游', '搬迁', '搬家', '移民', '出国', '回国', '航班', '车', '船', '路', '途中', '动身', '签证', '机票', '出差', '自驾', '高铁', '顺不顺利'],
    main: [46, 3],
    aux: [12, 61],
    unboost: {},
    note: 'SKILL §五：「#3/#12（世爻与父母）｜#46 神煞（驿马）｜#61 二十八宿择日」',
  },
  {
    topic: '孕产',
    kw: ['怀孕', '孕', '生子', '求子', '生育', '胎儿', '产', '坐月子', '宝宝', '怀上', '有了吗', '男女'],
    main: [12, 48],
    aux: [3, 46],
    unboost: {},
    note: 'SKILL §五未单列孕产 → 按六亲取用推导：子孙为用（#12/#3 用神取子孙）＋ #48 十二长生·命宫（胎元）',
  },
  {
    topic: '家宅',
    kw: ['家宅', '房子', '买房', '装修', '风水', '宅', '搬家', '租房', '户型', '坐向', '祖坟', '阴宅', '这房子', '新居', '门面', '店铺', '商铺'],
    main: [73, 74, 75, 76, 77, 78, 79, 80, 81, 82],
    aux: [13, 21],
    unboost: { 月老: 0.6 },
    note: 'SKILL §五：「#73–82 风水十法｜#13 京房八宫／#21 大象占（卦象取象）」；口语补强：这房子/门面/店铺',
  },
  {
    topic: '诉讼',
    kw: ['诉讼', '官司', '纠纷', '仲裁', '开庭', '打官司', '告', '律师', '法院', '争讼', '是非', '口舌', '能不能赢', '判', '起诉', '赔偿', '合同纠纷'],
    main: [3, 12],
    aux: [11, 31, 32, 33],
    unboost: {},
    note: 'SKILL §五「事之成败进退（…官司…）」一条；诉讼以六爻用神（官鬼为官府、父母为状纸）为主，大六壬课体为辅',
  },
  {
    topic: '天时',
    kw: ['天气', '下雨', '台风', '旱', '涝', '收成', '年景', '灾', '地震', '气候', '农', '晴', '阴天', '降温', '汛期'],
    main: [65],
    aux: [34, 35, 53, 54, 17],
    unboost: { 姓名: 0.4 },
    note: 'SKILL §五：「#34–35 太乙｜#17 皇极经世｜#53–54 七政四余/五星占｜#65 五运六气」（天时以五运六气为主法）',
  },
  {
    topic: '国事',
    kw: ['国运', '天下', '战', '政局', '大选', '政策', '经济形势', '大势', '时局', '世界', '大战', '局势', '行情'],
    main: [34, 35, 17],
    aux: [53, 54, 65, 25, 26, 27, 28, 29, 30],
    unboost: { 姓名: 0.3, 相术: 0.3 },
    note: 'SKILL §五：「#34–35 太乙｜#17 皇极经世｜#53–54 七政四余/五星占｜#65 五运六气」',
  },
  {
    topic: '事业',
    kw: ['事业', '工作', '升职', '跳槽', '求职', '面试', '职场', '老板', '上司', '同事', '创业', '公司', '项目', '合作', '合伙', '官运', '仕途', '这份工作', '要不要辞职', '该不该辞职', '离职', 'offer', '入职', '转行', '考核', '绩效', '开业', '开张', '开店', '挂牌'],
    main: [3, 11, 12],
    aux: [25, 26, 27, 28, 29, 30, 31, 32, 33, 68],
    unboost: { 月老: 0.5 },
    note: 'SKILL §五：「六爻三法（#3 纳甲、#11 火珠林、#12 文王卦用神）＋ #25–30 奇门 ＋ #31–33 大六壬」（成败进退/合作/求职/买卖同此）；口语补强：这份工作/要不要辞职/离职',
  },
]

/**
 * 判定问题归类。
 * @param {string} question 所问。
 * @returns {{topic:string, hits:string[], main:number[], aux:number[], boost:Record<string,number>, unboost:Record<string,number>, note:string}}
 */
export function detectTopic(question) {
  const q = String(question ?? '')
  let best = { topic: '综合', hits: [], main: [], aux: [], boost: {}, unboost: {}, note: '未命中任何事类关键词 → 全部法门等权（不加权）' }
  let bestScore = 0
  for (const rule of TOPIC_RULES) {
    const hits = rule.kw.filter((k) => q.includes(k))
    if (hits.length > bestScore) {
      bestScore = hits.length
      best = {
        topic: rule.topic, hits,
        main: rule.main ?? [], aux: rule.aux ?? [],
        boost: rule.boost ?? {}, unboost: rule.unboost ?? {},
        note: rule.note ?? '',
      }
    }
  }
  return best
}

/**
 * 按归类给条目算相关性倍率。
 *
 * 顺序：**主法白名单 → 辅法白名单 → 旧子串 boost（默认空）→ unboost 族级降权**。
 * 主/辅按法号判定（`no` 稳定），不再依赖"术语恰好出现在 name|id|cat|note 里"。
 * @param {object} entry 注册表条目。
 * @param {object} topic detectTopic 的结果。
 * @returns {number} 倍率（0.25..3）。
 */
function relevanceOf(entry, topic) {
  let f = 1
  if (Array.isArray(topic?.main) && topic.main.includes(entry.no)) f = Math.max(f, TOPIC_MAIN_BOOST)
  if (Array.isArray(topic?.aux) && topic.aux.includes(entry.no)) f = Math.max(f, TOPIC_AUX_BOOST)
  const hay = `${entry.name}|${entry.id}|${entry.cat}|${entry.note}`
  for (const [k, v] of Object.entries(topic?.boost ?? {})) {
    if (hay.includes(k)) f = Math.max(f, v)
  }
  for (const [k, v] of Object.entries(topic?.unboost ?? {})) {
    if (hay.includes(k)) f = Math.min(f, v)
  }
  return clamp(f, 0.25, 3)
}

/**
 * 分歧分级 D1–D5（SKILL §六 规格口径）。
 *
 * 判级只读各法**已披露**的字段，机械可复算（不请模型猜）：
 *   · **D4 资料分歧**：任一方 `fidelity === 'approx'`（缺表/辞书/输入）→ 不得当"两法意见不同"；
 *   · **D3 取用分歧**：同门两法所取用神/取象不同（读 `detail.用神` 等）；
 *   · **D2 尺度分歧**：应期的时间单位不同（时辰/日/旬/月/季/年）；
 *   · **D1 口径分歧**：不同 `module`（流派体系），或同门内披露的流派/口径不同；
 *   · **D5 真分歧**：同口径、同尺度、同取用下仍相左 —— 只有这一级才叫真矛盾。
 *
 * 严重度排序（`GRADE_RANK`）：D5 > D1 > D2 > D3 > D4（D4 不是"矛盾"，是"资料不够"）。
 */
const GRADE_RANK = { D5: 5, D1: 4, D2: 3, D3: 2, D4: 1 }

/** 读某法 detail 里第一个非空字符串披露（用神/流派等）。 */
function disclosureOf(outcome, keys) {
  const d = outcome?.detail ?? {}
  for (const k of keys) {
    const v = d[k]
    if (typeof v === 'string' && v.trim() !== '') return v.trim()
  }
  return ''
}

/** 用神/取象类字段名（各族的叫法不一，逐个试）。 */
const YONGSHEN_KEYS = ['用神', '用神取象', '取用', '所取之象', '体用', '取用神']
/** 流派/口径类字段名。 */
const SCHOOL_KEYS = ['流派', '口径', '定元', '起法', '算法']

/** 应期文字里的时间单位。 */
function timingUnitOf(text) {
  const m = /(时辰|小时|时|日|旬|月|季|年)/.exec(String(text ?? ''))
  return m ? m[1] : ''
}

/**
 * 两法（同一门内的一对）的分歧分级。
 * @param {object} a 一法结果（含 entry/outcome）。
 * @param {object} b 另一法结果。
 * @returns {{grade:string, reason:string}} 分级与理由。
 */
function gradeOfPair(a, b) {
  const fa = a.outcome?.fidelity
  const fb = b.outcome?.fidelity
  if (fa === 'approx' || fb === 'approx') {
    const who = fa === 'approx' ? `#${a.entry.no}${a.entry.name}` : `#${b.entry.no}${b.entry.name}`
    return { grade: 'D4', reason: `资料分歧：${who} 为近似实现（缺表/辞书/输入），属资料不足，不得当作两法意见不同` }
  }
  const ya = disclosureOf(a.outcome, YONGSHEN_KEYS)
  const yb = disclosureOf(b.outcome, YONGSHEN_KEYS)
  if (ya && yb && ya !== yb) {
    return { grade: 'D3', reason: `取用分歧：一方取「${ya.slice(0, 18)}」、另一方取「${yb.slice(0, 18)}」——先说明各自取了什么用神` }
  }
  const ua = timingUnitOf(a.outcome?.timing)
  const ub = timingUnitOf(b.outcome?.timing)
  if (ua && ub && ua !== ub) {
    return { grade: 'D2', reason: `尺度分歧：应期单位不同（${ua} vs ${ub}），应先折算到同一尺度再比较` }
  }
  if (a.entry?.module !== b.entry?.module) {
    return { grade: 'D1', reason: `口径分歧：分属不同流派体系（${a.entry?.module ?? '—'} 与 ${b.entry?.module ?? '—'}），同一事实的不同算法，并列不裁决` }
  }
  const sa = disclosureOf(a.outcome, SCHOOL_KEYS)
  const sb = disclosureOf(b.outcome, SCHOOL_KEYS)
  if (sa && sb && sa !== sb) {
    return { grade: 'D1', reason: `口径分歧：同门内所披露口径不同（「${sa.slice(0, 20)}…」 vs 「${sb.slice(0, 20)}…」）` }
  }
  return { grade: 'D5', reason: '真分歧：同口径、同尺度、同取用下仍相左 —— 必须如实并列，并降低置信表述' }
}

/**
 * 两个「门」之间的分歧分级。
 * @param {object} hi 强门（含 cat/score/members）。
 * @param {object} lo 弱门。
 * @returns {{grade:string, reason:string}} 分级与理由。
 */
function gradeOfGatePair(hi, lo) {
  const approxShare = (g) => (g.members.length === 0 ? 0 : g.members.filter((m) => m.outcome.fidelity === 'approx').length / g.members.length)
  const bad = []
  if (approxShare(hi) >= 0.5) bad.push(`${hi.cat}（近似法门占 ${Math.round(approxShare(hi) * 100)}%）`)
  if (approxShare(lo) >= 0.5) bad.push(`${lo.cat}（近似法门占 ${Math.round(approxShare(lo) * 100)}%）`)
  if (bad.length > 0) {
    return { grade: 'D4', reason: `资料分歧：${bad.join('、')} 以近似实现为主，门间差主要反映资料不足，不是"体系打架"` }
  }
  return { grade: 'D1', reason: `口径分歧：${hi.cat} 与 ${lo.cat} 属不同流派体系，门间差是不同算法口径的并列，不裁决` }
}

/**
 * 聚合 108 法结果为一张合盘。
 *
 * @param {object} params 入参。
 * @param {Array<{entry:object, outcome:object|null, error?:string}>} params.results 各法结果（按注册表顺序）。
 * @param {string} params.question 所问。
 * @param {object} params.chart 盘基。
 * @returns {object} 合盘。
 */
export function aggregate({ results, question, chart }) {
  const topic = detectTopic(question)
  const computed = results.filter((r) => r.outcome)
  const skipped = results.filter((r) => !r.outcome)

  /** 逐条加权（门内聚合与逐法口径共用）。 */
  const weighted = computed.map((r) => {
    const rel = relevanceOf(r.entry, topic)
    const ff = FIDELITY_FACTOR[r.outcome.fidelity] ?? 0.85
    const w = r.entry.weight * ff * rel
    return { ...r, weight: w, fidelityFactor: ff, relevance: rel, score: r.outcome.score }
  })

  // ───────────── 两级聚合：门内截尾 → 门间 √n 加权 ─────────────

  /** 各门的聚合结果。 */
  const gates = []
  for (const c of CATEGORIES) {
    const list = weighted.filter((r) => r.entry.cat === c)
    if (list.length === 0) continue
    const scores = list.map((r) => r.score)
    const gateScore = trimmedMean(scores, TRIM)
    const meanFf = list.reduce((s, r) => s + r.fidelityFactor, 0) / list.length
    const meanRel = list.reduce((s, r) => s + r.relevance, 0) / list.length
    // 门权：√n 承认信息量，又不让大族线性碾压小族
    const gateWeight = Math.sqrt(list.length) * meanFf * meanRel
    gates.push({
      cat: c,
      count: list.length,
      score: gateScore,
      weight: gateWeight,
      meanFf,
      meanRel,
      spread: scores.length > 1 ? quantile(scores, 0.9) - quantile(scores, 0.1) : 0,
      agreement: signAgreement(list.map((r) => ({ score: r.score, weight: r.weight }))),
      members: list,
    })
  }

  const score = gates.length === 0 ? 0 : clamp(
    weightedMean(gates.map((g) => ({ value: g.score, weight: g.weight }))), -100, 100,
  )
  /** 逐法口径（v1 语义），作为对照保留。 */
  const rawScore = clamp(
    weightedMean(weighted.map((r) => ({ value: r.score, weight: r.weight }))), -100, 100,
  )
  const familySkew = Math.round((rawScore - score) * 10) / 10

  // ───────────── 一致性 / 置信 ─────────────
  //
  // 规格口径（SKILL §六「票数不构成独立证据」）：108 法**不是** 108 份独立证据——同门高度相关
  // （7 个奇门、5 个六壬、14 个择时）。故**一致性以「门」为独立证据源**计算（每门 1 票），
  // 逐法口径的同号率/离散度只作**诊断量**报出，**不进入** confidence。
  // （delta D-01/§3 末行：旧实现 consistency = 0.5×逐法同号率 + 0.5×逐法离散度，
  //   而逐法同号率正是"票数分量"，与 mingyu「多数意见不构成独立证据」相反。）

  /** 门间一致性（独立证据源口径）：门分数的同号率。 */
  const gateItems = gates.map((g) => ({ score: g.score, weight: g.weight }))
  const gateStd = gates.length === 0 ? 0 : weightedStd(gateItems, score)
  const gateAgr = gates.length === 0 ? 0 : signAgreement(gateItems)
  const gateDispersion = clamp(1 - gateStd / 100, 0, 1)
  /** 门内凝聚度（诊断量）：各门内部同号率的均值——高说明"门内不吵"，但不等于跨门印证。 */
  const gateCohesion = gates.length === 0 ? 0 : gates.reduce((s, g) => s + g.agreement, 0) / gates.length
  // 同号率与离散度各占一半：前者问"方向是否一致"，后者问"幅度是否集中"
  const consistency = clamp(0.5 * gateAgr + 0.5 * gateDispersion, 0, 1)

  /** 逐法口径（诊断量，不参与 confidence）：保留旧字段名与语义，便于对照与复核。 */
  const allItems = weighted.map((r) => ({ score: r.score, weight: r.weight }))
  const std = weightedStd(allItems, rawScore)
  const signAgr = signAgreement(allItems)
  const dispersion = clamp(1 - std / 100, 0, 1)

  const coverage = results.length === 0 ? 0 : computed.length / results.length
  /** 可信度折扣：近似法门按比例折算（全盘近似 → 0.6）。 */
  const trust = weighted.length === 0 ? 0 : weighted.reduce((s, r) => s + r.fidelityFactor, 0) / weighted.length
  const confidence = clamp(consistency * coverage * trust, 0, 1)

  // ───────────── 票型 ─────────────

  const tally = Object.fromEntries(VERDICTS.map((v) => [v, 0]))
  for (const r of computed) tally[r.outcome.verdict] += 1
  const polarity = {
    吉: tally.大吉 + tally.吉 + tally.小吉,
    平: tally.平,
    凶: tally.小凶 + tally.凶 + tally.大凶,
  }

  // ───────────── 五行信号 ─────────────

  const wuxing = Object.fromEntries(WUXING.map((w) => [w, 0]))
  for (const r of computed) {
    for (const w of WUXING) wuxing[w] += Number(r.outcome.wuxing[w]) || 0
  }
  const wxTotal = WUXING.reduce((s, w) => s + wuxing[w], 0)
  const wxNorm = Object.fromEntries(WUXING.map((w) => [w, wxTotal === 0 ? 0 : wuxing[w] / wxTotal]))
  const wxSorted = [...WUXING].sort((a, b) => wxNorm[b] - wxNorm[a])
  const dominant = wxTotal === 0 ? '—' : wxSorted[0]
  const lacking = wxTotal === 0 ? '—' : wxSorted[wxSorted.length - 1]

  // ───────────── 共识关键词（含跨门数） ─────────────

  const keyAgg = new Map()
  for (const r of computed) {
    for (const k of r.outcome.keys) {
      const cur = keyAgg.get(k) ?? { key: k, count: 0, sum: 0, cats: new Set(), fams: new Set() }
      cur.count += 1
      cur.sum += r.outcome.score
      cur.cats.add(r.entry.cat)
      cur.fams.add(r.entry.module)
      keyAgg.set(k, cur)
    }
  }
  const consensusKeys = [...keyAgg.values()]
    .filter((k) => k.count >= 3)
    .map((k) => ({
      key: k.key,
      count: k.count,
      cats: k.cats.size,
      fams: k.fams.size,
      avg: k.count === 0 ? 0 : Math.round(k.sum / k.count),
    }))
    // 先看"跨几个门都出现"（真共识），再看出现次数
    .sort((a, b) => b.cats - a.cats || b.count - a.count || Math.abs(b.avg) - Math.abs(a.avg))
    .slice(0, 10)

  // ───────────── 应期共识 ─────────────

  const timeAgg = new Map()
  for (const r of computed) {
    // 优先用方法层给的结构化应期窗口（detail.timingWindow），退化到字符串
    const win = r.outcome.detail?.timingWindow
    const key = typeof win === 'string' && win.length > 0 ? win : r.outcome.timing
    if (!key) continue
    const cur = timeAgg.get(key) ?? { text: key, count: 0, sum: 0, lo: [], hi: [], provided: 0, derived: 0 }
    cur.count += 1
    cur.sum += r.outcome.score
    let lo = Number(r.outcome.detail?.timingLo)
    let hi = Number(r.outcome.detail?.timingHi)
    if (Number.isFinite(lo) && Number.isFinite(hi)) cur.provided += 1
    else {
      // 过渡版：方法层没给端点时，按**公开折算口径**（tables.DURATION_DAYS）从措辞折出窗口；
      // 措辞无明确日数则仍为 null（不编区间）。
      const span = durationOf(key)
      if (span.lo !== null || span.hi !== null) { lo = span.lo; hi = span.hi; cur.derived += 1 }
    }
    if (Number.isFinite(lo)) cur.lo.push(lo)
    if (Number.isFinite(hi)) cur.hi.push(hi)
    timeAgg.set(key, cur)
  }
  const timing = [...timeAgg.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((t) => ({
      text: t.text,
      count: t.count,
      avg: t.count === 0 ? 0 : Math.round(t.sum / t.count),
      lo: t.lo.length > 0 ? median(t.lo) : null,
      hi: t.hi.length > 0 ? median(t.hi) : null,
      /** 端点来源：方法层给出 / 按措辞折算（过渡版）；全 null 时记 none。 */
      basis: t.provided > 0 ? '方法层 detail.timingLo/timingHi' : (t.derived > 0 ? '按措辞折算（过渡版，见 tables.DURATION_DAYS）' : 'none（只有措辞，无端点）'),
      provided: t.provided,
      derived: t.derived,
      /** 半开区间语义（hi 不含）——SKILL §六 / D-08。 */
      halfOpen: true,
    }))

  // ───────────── 分类倾向 ─────────────

  const byCategory = {}
  for (const g of gates) {
    byCategory[g.cat] = {
      score: Math.round(g.score),
      count: g.count,
      computed: g.count,
      agreement: Math.round(g.agreement * 100) / 100,
      spread: Math.round(g.spread),
    }
  }

  // ───────────── 分歧（含 D1–D5 分级）─────────────
  //
  // 规格口径（SKILL §六「分歧分级 D1–D5」）：先判**原因**再下结论；D1–D4 不得写成"诸法矛盾"，
  // 只有 D5（同口径/同尺度/同取用下仍相左）才叫真分歧。判级只依据各法**已披露**的字段
  // （fidelity / module / timing 单位 / 用神取象 / 流派口径），机械可复算。

  const conflicts = []
  for (const g of gates) {
    const list = g.members.slice().sort((a, b) => b.score - a.score)
    if (list.length < 2) continue
    const hi = list[0]
    const lo = list[list.length - 1]
    if (hi.score - lo.score >= 60) {
      const gr = gradeOfPair(hi, lo)
      conflicts.push({
        cat: g.cat,
        high: { no: hi.entry.no, name: hi.entry.name, score: Math.round(hi.score) },
        low: { no: lo.entry.no, name: lo.entry.name, score: Math.round(lo.score) },
        gap: Math.round(hi.score - lo.score),
        grade: gr.grade,
        reason: gr.reason,
      })
    }
  }
  conflicts.sort((a, b) => GRADE_RANK[b.grade] - GRADE_RANK[a.grade] || b.gap - a.gap)

  /** 门间分歧：最强门与最弱门之差（比门内极值更能说明"体系间是否打架"）。 */
  const gateSorted = gates.slice().sort((a, b) => b.score - a.score)
  const gateGap = gates.length >= 2 ? Math.round(gateSorted[0].score - gateSorted[gateSorted.length - 1].score) : 0
  const gatePair = gates.length >= 2 ? { hi: gateSorted[0], lo: gateSorted[gateSorted.length - 1] } : null

  /**
   * 分歧条目（每条带 grade + reason）——这是 skill 要求的"先判原因"的载体。
   * 数值型字段（familySkew/gateGap/…）保留在原位（向后兼容），原因分类进 `items`。
   */
  const divergenceItems = []
  if (gatePair && gateGap >= 40) {
    const gr = gradeOfGatePair(gatePair.hi, gatePair.lo)
    divergenceItems.push({
      code: 'gateGap', grade: gr.grade, reason: gr.reason,
      detail: `${gatePair.hi.cat}(+${Math.round(gatePair.hi.score)}) 与 ${gatePair.lo.cat}(${Math.round(gatePair.lo.score)}) 相差 ${gateGap} 分`,
    })
  }
  if (Math.abs(familySkew) >= 12) {
    divergenceItems.push({
      code: 'familySkew', grade: 'D1', reason: '逐法口径与分门口径之差来自「法数多的门被重复计数」——属口径（聚合口径）差异，不是两法真矛盾',
      detail: `逐法口径与分门口径相差 ${familySkew} 分：法数多的门正在影响结论，宜以分门口径为准`,
    })
  }
  if (gateDispersion < 0.25) {
    divergenceItems.push({
      code: 'dispersion', grade: 'D5', reason: '门间分数离散度低（门与门方向/幅度都拉开），非同口径可解释，属真分歧',
      detail: `门间离散度 ${Math.round(gateDispersion * 100) / 100}（低于 0.25 即视为分歧明显）`,
    })
  }
  const dominantGrade = divergenceItems.length === 0
    ? null
    : divergenceItems.slice().sort((a, b) => GRADE_RANK[b.grade] - GRADE_RANK[a.grade])[0].grade

  const divergence = {
    familySkew,
    gateGap,
    gateHigh: gatePair ? { cat: gatePair.hi.cat, score: Math.round(gatePair.hi.score) } : null,
    gateLow: gatePair ? { cat: gatePair.lo.cat, score: Math.round(gatePair.lo.score) } : null,
    std: Math.round(std * 10) / 10,
    // 逐法口径（诊断量与向后兼容：旧消费者读的是这两个）
    signAgreement: Math.round(signAgr * 100) / 100,
    dispersion: Math.round(dispersion * 100) / 100,
    // 门口径（独立证据源；consistency / confidence 用的是这一对）
    gateAgreement: Math.round(gateAgr * 100) / 100,
    gateDispersion: Math.round(gateDispersion * 100) / 100,
    gateCohesion: Math.round(gateCohesion * 100) / 100,
    gateStd: Math.round(gateStd * 10) / 10,
    independentSources: gates.length,
    basis: '一致性/置信以「门」为独立证据源（每门 1 票）；signAgreement/dispersion 为逐法诊断量，不参与 confidence',
    grade: dominantGrade,
    grades: divergenceItems.map((d) => `${d.code}:${d.grade}`),
    items: divergenceItems,
    note: divergenceItems.length > 0
      ? divergenceItems.map((d) => `${d.grade} ${d.detail}`).join('；')
      : '无显著分歧（门间差 < 40、口径差 < 12、门间离散度 ≥ 0.25）',
  }

  // ───────────── 出处账本（v2 新增）＋ 证据分层（L1–L5） ─────────────

  const citeAgg = new Map()
  let badCite = 0
  for (const r of computed) {
    const cites = r.outcome.detail?.cite
    const list = Array.isArray(cites) ? cites : (typeof cites === 'string' && cites ? [cites] : [])
    for (const c of list) {
      // 防脏：`null`/`undefined` 语义上是"没填出处"（不计入账本，也不算脏）；
      // 其它非字符串值才是真的脏数据，单独计数以便定位实现缺陷。
      if (c === null || c === undefined) continue
      if (typeof c !== 'string') { badCite += 1; continue }
      const key = c.trim()
      if (key === '' || key === 'undefined' || key === 'null') { badCite += 1; continue }
      citeAgg.set(key, (citeAgg.get(key) ?? 0) + 1)
    }
  }
  const evidenceDigest = [...citeAgg.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
  if (badCite > 0) evidenceDigest.badCite = badCite

  /**
   * 证据分层统计（SKILL §六 L1–L5）。
   * L1 历法/星历事实（整盘 1 份）、L2 各法规则算出的盘面与分值、L3 依据链 `detail.evidence`、
   * L4 出处 `detail.cite`、L5 模型解读（不属插件，恒 0）。
   * **过渡版**：按各法是否给出 evidence/cite 推断层号；规格要求方法层显式标 `detail.evidenceLevel`。
   */
  const evidenceLevels = { L1: computed.length > 0 ? 1 : 0, L2: 0, L3: 0, L4: 0, L5: 0 }
  for (const r of computed) {
    evidenceLevels.L2 += 1
    const ev = r.outcome.detail?.evidence
    if ((Array.isArray(ev) && ev.length > 0) || (typeof ev === 'string' && ev.trim() !== '')) evidenceLevels.L3 += 1
    const ct = r.outcome.detail?.cite
    if ((Array.isArray(ct) && ct.some((c) => typeof c === 'string' && c.trim() !== '')) || (typeof ct === 'string' && ct.trim() !== '')) evidenceLevels.L4 += 1
  }
  evidenceDigest.levels = evidenceLevels

  /**
   * 保真度逐项布尔位汇总（SKILL §六「整法三档 + 逐项布尔位」）。
   * **过渡版**：由各法 fidelity 与 detail 披露**推断**——
   *   · 历法：凡起法成功即 true（一切法都读 chart 的历法层）；
   *   · 星历：西方族或 detail 里确实引了黄经/宿度/星历者；
   *   · 表：给了 cite 且未标「未核实」者；
   *   · 辞书：fidelity !== 'approx' 且无 `detail.未核实`；
   *   · 图像：#103/#104 面相/手相无图像输入 → false。
   * 规格要求权威位登记在 `registry.js`（Lead 独占），故此处只作过渡并在 `basis` 里声明。
   */
  const fidelityBitsSummary = { 历法: 0, 星历: 0, 表: 0, 辞书: 0, 图像: 0 }
  for (const r of computed) {
    const bits = fidelityBitsOf(r)
    for (const k of Object.keys(fidelityBitsSummary)) if (bits[k]) fidelityBitsSummary[k] += 1
  }
  fidelityBitsSummary.basis = '过渡版：由各法 fidelity 与 detail 披露推断（权威值应登记在 registry.js）'
  fidelityBitsSummary.total = computed.length

  // ───────────── 合参矩阵 corroboration（SKILL §六）─────────────

  /**
   * 把「跨门共识」逐条判为 **满足 / 不满足 / 资料不足**。
   * 规格口径：共识必须**跨门**才算印证（同门内 24 法重复不算）；相关法门里有未起或以近似为主时
   * 判「资料不足」，不得当"已被印证"。
   */
  const corroboration = consensusKeys.slice(0, 5).map((k) => {
    const supporters = computed.filter((r) => r.outcome.keys.includes(k.key))
    const approx = supporters.filter((r) => r.outcome.fidelity === 'approx').length
    const approxShare = supporters.length === 0 ? 0 : approx / supporters.length
    const skippedInCats = skipped.filter((r) => supporters.some((s) => s.entry.cat === r.entry.cat))
    let status = '不满足'
    let note = `仅 ${k.count} 法 / ${k.cats} 门，未达「跨门 ≥2 且 ≥3 法」`
    if (approxShare >= 0.5 || skippedInCats.length > 0) {
      status = '资料不足'
      note = `相关法门中 ${skippedInCats.length} 法未起、近似法门占 ${Math.round(approxShare * 100)}%`
    } else if (k.count >= 3 && k.cats >= 2) {
      status = '满足'
      note = `跨 ${k.cats} 门共 ${k.count} 法同现（≥3 法且跨 ≥2 门）`
    }
    return { key: k.key, status, count: k.count, cats: k.cats, fams: k.fams, approxShare: Math.round(approxShare * 100) / 100, note }
  })
  const corroborationOverall = {
    key: '总断',
    status: coverage < 0.8 ? '资料不足' : (coverage >= 0.9 && consistency >= 0.4 && gates.length >= 8 ? '满足' : '不满足'),
    note: `起法覆盖率 ${Math.round(coverage * 100)}%、门间一致性 ${Math.round(consistency * 100) / 100}、独立证据源 ${gates.length} 门`,
  }

  /** 应期语义声明（SKILL §六：半开区间 `[lo, hi)`，`hi` 不含）。 */
  const timingScope = {
    code: 'conditional_timing_candidates_not_guaranteed_dates',
    text: 'time[i].lo / hi 为**半开区间 [lo, hi)**（单位：日；**hi 不含**，即"不早于 lo、早于 hi"）。'
      + '不做加权平均（多法应期取 median 端点）。端点 null 表示该条只给了措辞、未给端点，不得当精确日期。',
    halfOpen: true,
  }

  // ───────────── 最强/最弱 ─────────────

  const ranked = [...computed].sort((a, b) => b.outcome.score - a.outcome.score)
  const top = ranked.slice(0, 5).map(toBrief)
  const bottom = ranked.slice(-5).reverse().map(toBrief)

  const overallVerdict = scoreToVerdict(score)

  /** 分类加权（扁平 cat → 分）—— `buildBoardBrief` 的「分类加权」一行读的是这个字段（旧代码读 `b.categories`，一直是 undefined，此行从未渲染过）。 */
  const categories = Object.fromEntries(Object.entries(byCategory).map(([c, v]) => [c, v.score]))

  /** 主辅法分工（SKILL §五）：把白名单法号映射成 `{no,name}`，供简报与模型点名。 */
  const briefOf = (nos) => nos.map((n) => ENTRIES.find((e) => e.no === n)).filter(Boolean).map((e) => ({ no: e.no, name: e.name }))

  return {
    meta: {
      question,
      topic: topic.topic,
      topicHits: topic.hits,
      topicMain: briefOf(topic.main ?? []),
      topicAux: briefOf(topic.aux ?? []),
      topicNote: topic.note ?? '',
      when: chart?.solar?.text ?? '',
      pillars: (chart?.pillars ?? []).join(' '),
      lunar: chart?.lunar?.text ?? '',
      count: results.length,
      computed: computed.length,
      skipped: skipped.length,
      skippedList: skipped.map((r) => ({ no: r.entry.no, name: r.entry.name, reason: r.error ?? '缺输入' })),
      fidelityTally: countFidelity(computed),
      /** v2：聚合方法与可信度拆解，便于复核。 */
      agreement: {
        consistency: Math.round(consistency * 100) / 100,
        // 门口径（独立证据源）—— consistency / confidence 用的是这一组
        gateAgreement: Math.round(gateAgr * 100) / 100,
        gateDispersion: Math.round(gateDispersion * 100) / 100,
        gateCohesion: Math.round(gateCohesion * 100) / 100,
        gateStd: Math.round(gateStd * 10) / 10,
        independentSources: gates.length,
        // 逐法口径（**诊断量，不参与 confidence**）
        pooledSignAgreement: Math.round(signAgr * 100) / 100,
        pooledDispersion: Math.round(dispersion * 100) / 100,
        std: Math.round(std * 10) / 10,
        coverage: Math.round(coverage * 100) / 100,
        trust: Math.round(trust * 100) / 100,
        voteShare: {
          吉: computed.length === 0 ? 0 : Math.round((polarity.吉 / computed.length) * 100) / 100,
          平: computed.length === 0 ? 0 : Math.round((polarity.平 / computed.length) * 100) / 100,
          凶: computed.length === 0 ? 0 : Math.round((polarity.凶 / computed.length) * 100) / 100,
        },
        method: '门内截尾均值(15%) → 门间 √n 加权；一致性 = 门间同号率与门间离散度各半（**以「门」为独立证据源，不用逐法票数**）',
        note: '票数不构成独立证据：voteShare / pooledSignAgreement 只作诊断报出，不进入 consistency 与 confidence（SKILL §六）',
        gates: gates.length,
      },
      /** 证据分层（过渡版，见 evidenceDigest.levels） */
      evidenceLevels,
      /** 保真度逐项布尔位汇总（过渡版，权威值应在 registry.js） */
      fidelityBitsSummary,
    },
    overall: {
      score: Math.round(score * 10) / 10,
      rawScore: Math.round(rawScore * 10) / 10,
      verdict: overallVerdict,
      consistency: Math.round(consistency * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      coverage: Math.round(coverage * 100) / 100,
    },
    tally,
    polarity,
    wuxing: Object.fromEntries(WUXING.map((w) => [w, Math.round(wxNorm[w] * 1000) / 10])),
    dominant,
    lacking,
    consensusKeys,
    corroboration: [corroborationOverall, ...corroboration],
    timing,
    timingScope,
    categories,
    byCategory,
    conflicts,
    divergence,
    evidenceDigest,
    top,
    bottom,
    advice: buildAdvice({
      score, rawScore, overallVerdict, consistency, confidence, polarity, tally,
      dominant, lacking, consensusKeys, timing, conflicts, byCategory, topic,
      divergence, gates,
    }),
  }
}

/**
 * 单法的保真度逐项布尔位（**过渡版推断**，见 `meta.fidelityBitsSummary` 说明）。
 * @param {object} r 一法结果。
 * @returns {{历法:boolean, 星历:boolean, 表:boolean, 辞书:boolean, 图像:boolean}} 布尔位。
 */
function fidelityBitsOf(r) {
  const d = r.outcome?.detail ?? {}
  const approx = r.outcome?.fidelity === 'approx'
  const unverified = Boolean(d.未核实) || approx
  const s = JSON.stringify(d)
  const isAstro = r.entry?.module === 'western' || r.entry?.module === 'mingli'
    ? /黄经|宿度|星历|行度|astro|入宿/.test(s)
    : /黄经|宿度|星历|入宿/.test(s)
  const isImage = [103, 104].includes(r.entry?.no)
  const hasCite = (Array.isArray(d.cite) && d.cite.length > 0) || (typeof d.cite === 'string' && d.cite.trim() !== '')
  return { 历法: true, 星历: isAstro, 表: hasCite && !unverified, 辞书: !unverified, 图像: !isImage }
}

/** 条目结果 → 紧凑引用。 */
function toBrief(r) {
  return {
    no: r.entry.no,
    name: r.entry.name,
    cat: r.entry.cat,
    score: Math.round(r.outcome.score),
    verdict: r.outcome.verdict,
    essence: r.outcome.essence,
    fidelity: r.outcome.fidelity,
  }
}

/** 分数 → 综合等级（比单法更保守：合盘要的是稳健，不是极端）。 */
function scoreToVerdict(score) {
  if (score >= 55) return '大吉'
  if (score >= 30) return '吉'
  if (score >= 12) return '小吉'
  if (score > -12) return '平'
  if (score > -30) return '小凶'
  if (score > -55) return '凶'
  return '大凶'
}

/** 统计保真度分布。 */
function countFidelity(computed) {
  const out = { full: 0, core: 0, approx: 0 }
  for (const r of computed) out[r.outcome.fidelity] = (out[r.outcome.fidelity] ?? 0) + 1
  return out
}

/**
 * 生成综合断语。
 *
 * **模板化拼接，不是模型生成**：所有句子都由分数、票型、共识、应期这些
 * 已算出的量直接决定，同样的输入必得同样的断语。
 *
 * 分歧措辞按 **D1–D5 分级**分档（SKILL §六）：口径/尺度/取用/资料四类分歧
 * **不得**写成"诸法矛盾"，只有 D5 才用"真分歧"。
 * @param {object} a 聚合量。
 * @returns {string} 断语。
 */
function buildAdvice(a) {
  const parts = []
  const {
    score, consistency, confidence, polarity, dominant, lacking, consensusKeys,
    timing, conflicts, byCategory, topic, divergence,
  } = a
  // topic 是 detectTopic 的结果对象；断语里只用到它的名字。
  const topicName = typeof topic === 'string' ? topic : (topic?.topic ?? '综合')

  parts.push(`合盘总断【${a.overallVerdict}】（分门加权分 ${score > 0 ? '+' : ''}${Math.round(score * 10) / 10}）`)

  // 一致性措辞按**分歧等级**分档（SKILL §六：D1–D4 不得写成"诸法矛盾"，只有 D5 才叫真分歧）
  const worstGrade = divergence?.grade ?? null
  if (confidence >= 0.6) parts.push('诸法高度一致，结论可采信')
  else if (confidence >= 0.4) parts.push('诸法中上一致，结论可参考')
  else if (worstGrade === 'D5') parts.push('诸法真分歧（同口径同尺度下相左），此占不宜作决断依据')
  else if (worstGrade === 'D4') parts.push('部分法门资料不足（未起／近似实现），宜补足输入再占')
  else if (worstGrade === 'D1') parts.push('诸法口径不一（分属不同流派体系），宜并列参看，不作裁决')
  else if (worstGrade === 'D3') parts.push('诸法取用不同（用神取象各异），分歧多由此而来')
  else if (worstGrade === 'D2') parts.push('诸法时间尺度不同，宜先折算到同一尺度再看')
  else parts.push('诸法分歧明显，宜再问或换时再占')

  parts.push(`吉 ${polarity.吉} / 平 ${polarity.平} / 凶 ${polarity.凶}（票型仅作呈现，不作论据）`)

  if (dominant !== '—') parts.push(`气机偏${dominant}${lacking !== '—' ? `，${lacking}不足` : ''}`)

  if (consensusKeys.length > 0) {
    // 报"跨门数"而不是单纯出现次数：同一门里 24 法都提同一个词，不算 24 家共识
    parts.push(`多法同现：${consensusKeys.slice(0, 5).map((k) => `${k.key}(${k.count}法/${k.cats}门)`).join('、')}`)
  }

  if (timing.length > 0) {
    parts.push(`应期倾向：${timing.slice(0, 3).map((t) => `${t.text}(${t.count}法)`).join('、')}`)
  }

  // 类别倾向：报最吉与最凶的类别（签卜在综合问事下噪声大，故只在专门问签时纳入）
  const catList = Object.entries(byCategory).filter(([c]) => c !== '签卜' || topicName !== '综合')
  if (catList.length > 0) {
    const sorted = catList.sort((x, y) => y[1].score - x[1].score)
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]
    if (best[0] !== worst[0]) {
      parts.push(`${best[0]}类偏吉(${best[1].score > 0 ? '+' : ''}${best[1].score})，${worst[0]}类偏凶(${worst[1].score > 0 ? '+' : ''}${worst[1].score})`)
    }
  }

  if (conflicts.length > 0) {
    const c = conflicts[0]
    // 按 D 级分档措辞：D1–D4 不是"矛盾"（口径/取用/尺度/资料），只有 D5 才能说"真分歧"
    const head = { D5: '真分歧', D1: '口径分歧（不同流派，并列不裁决）', D2: '尺度分歧（时间量纲不同）', D3: '取用分歧（用神取象不同）', D4: '资料不足（非意见不同）' }[c.grade] ?? '分歧'
    parts.push(`${head}在${c.cat}：${c.high.name}(+${c.high.score}) 对 ${c.low.name}(${c.low.score})，相差 ${c.gap} 分`)
  }

  // v2：门间打架要单独点名——门内分歧是"同体系不同法"，门间分歧是"体系与体系打架"
  if (divergence?.gateHigh && divergence.gateGap >= 40) {
    const g = divergence.items?.find((x) => x.code === 'gateGap')?.grade ?? 'D1'
    const tag = { D5: '体系真分歧', D1: '体系口径分歧', D2: '体系尺度分歧', D3: '体系取用分歧', D4: '体系资料差异' }[g] ?? '体系分歧'
    parts.push(`${tag}：${divergence.gateHigh.cat}(+${divergence.gateHigh.score}) 与 ${divergence.gateLow.cat}(${divergence.gateLow.score}) 相差 ${divergence.gateGap} 分`)
  }

  if (topicName !== '综合') parts.push(`已按「${topicName}」加权相关术法`)

  return parts.join('；') + '。'
}

/**
 * 按用户指定的范围挑条目。
 * @param {string} scope 'all' | 'strong' | 'weak' | 'category:易卦' | 'no:1,2,3' | 'ids:a,b'
 * @returns {number[]} 选中的编号。
 */
export function selectNos(scope) {
  const s = String(scope ?? 'all').trim()
  if (s === '' || s === 'all') return ENTRIES.map((e) => e.no)
  if (s === 'strong') return ENTRIES.map((e) => e.no)
  if (s.startsWith('category:')) {
    const cat = s.slice('category:'.length)
    return ENTRIES.filter((e) => e.cat === cat).map((e) => e.no)
  }
  if (s.startsWith('no:')) {
    return s.slice(3).split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n))
  }
  if (s.startsWith('ids:')) {
    const ids = s.slice(4).split(',').map((x) => x.trim())
    return ENTRIES.filter((e) => ids.includes(e.id)).map((e) => e.no)
  }
  if (s.startsWith('module:')) {
    const mod = s.slice('module:'.length)
    return ENTRIES.filter((e) => e.module === mod).map((e) => e.no)
  }
  return ENTRIES.map((e) => e.no)
}

export { FIDELITY_LABEL, FIDELITY_FACTOR, relevanceOf, truncate }
