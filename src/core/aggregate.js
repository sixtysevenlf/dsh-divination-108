/**
 * 术数内核 · 合盘聚合引擎
 *
 * 把 108 法的各自结论**收敛成一张合盘**：总分、票型、五行、共识、应期、分歧、类别倾向。
 * 全程纯计算，不调用模型 —— 这正是"省 token"的关键：108 法在本地算完，
 * 模型只读这张合盘，不必在思维链里推任何一法。
 *
 * ## 聚合口径（写在明处，便于复核）
 * - 每条结果先按 `weight × fidelityFactor` 加权（full=1.0, core=0.85, approx=0.6）；
 * - 总分 = 加权平均，范围 -100..100；
 * - 一致性 = 1 − 加权标准差/100，越低说明各法分歧越大；
 * - 置信度 = 一致性 × 起卦覆盖率（算出结果的法数 / 108）；
 * - 五行信号按各法给的 wuxing 累加后归一，报「最旺」与「最缺」；
 * - 共识关键词按出现次数排序，只报 ≥3 法同现的；
 * - 分歧 = 同类别内两条结论分差 ≥ 60 的极端对。
 */

import { VERDICT_VALUE, VERDICTS, WUXING, clamp, truncate } from './kit.js'
import { ENTRIES, CATEGORIES, FIDELITY_LABEL } from './registry.js'

/** 保真度权重系数。 */
const FIDELITY_FACTOR = { full: 1.0, core: 0.85, approx: 0.6 }

/**
 * 问题归类：按关键词判断所问何事，用于给相关术法加权。
 * 这不是模型判断，是一张**公开的关键词表**，可自行增补。
 */
const TOPIC_RULES = [
  {
    topic: '姻缘',
    kw: ['姻缘', '感情', '婚姻', '结婚', '恋爱', '对象', '女友', '男友', '夫妻', '复合', '脱单', '相亲', '桃花', '离婚', '正缘'],
    boost: { 月老: 2.2, 咸: 1.8, 桃花: 1.8, 夫妻: 1.8, 六合: 1.5 },
    unboost: { 择时: 0.7 },
  },
  {
    topic: '事业',
    kw: ['事业', '工作', '升职', '跳槽', '求职', '面试', '职场', '老板', '上司', '同事', '创业', '公司', '项目', '合作', '合伙', '官运', '仕途'],
    boost: { 官鬼: 1.8, 官禄: 1.8, 奇门: 1.5, 六壬: 1.4, 事业: 1.5, 太乙: 1.3 },
    unboost: { 月老: 0.5 },
  },
  {
    topic: '财运',
    kw: ['财运', '钱', '财', '投资', '股票', '基金', '生意', '买卖', '回款', '欠款', '债', '收入', '赚钱', '亏', '发财', '彩票', '理财'],
    boost: { 妻财: 1.9, 财帛: 1.8, 财星: 1.6, 八白: 1.4 },
    unboost: {},
  },
  {
    topic: '健康',
    kw: ['健康', '病', '身体', '疾', '手术', '康复', '疼', '痛', '医院', '中医', '吃药', '养生', '体检'],
    boost: { 疾厄: 1.9, 病符: 1.6, 五运六气: 1.8, 医: 1.4 },
    unboost: { 择时: 0.6, 财运: 0.6 },
  },
  {
    topic: '出行',
    kw: ['出行', '出门', '旅行', '旅游', '搬迁', '搬家', '移民', '出国', '回国', '航班', '车', '船', '路', '途中', '动身'],
    boost: { 驿马: 1.9, 迁移: 1.8, 出行: 1.5, 二十八宿: 1.2 },
    unboost: {},
  },
  {
    topic: '考试',
    kw: ['考试', '考', '升学', '考研', '公考', '面试', '学位', '论文', '答辩', '证书', '录取', '成绩'],
    boost: { 文昌: 1.9, 父母: 1.7, 文曲: 1.6, 四绿: 1.5, 官鬼: 1.4 },
    unboost: {},
  },
  {
    topic: '诉讼',
    kw: ['诉讼', '官司', '纠纷', '仲裁', '开庭', '打官司', '告', '律师', '法院', '争讼', '是非', '口舌'],
    boost: { 官鬼: 1.8, 讼: 1.9, 白虎: 1.5, 赤口: 1.4 },
    unboost: {},
  },
  {
    topic: '寻物',
    kw: ['寻物', '找', '丢了', '遗失', '失物', '不见', '下落', '寻人', '走失', '找回'],
    boost: { 妻财: 1.5, 玄武: 1.5, 寻: 1.4 },
    unboost: {},
  },
  {
    topic: '家宅',
    kw: ['家宅', '房子', '买房', '装修', '风水', '宅', '搬家', '租房', '户型', '坐向', '祖坟', '阴宅'],
    boost: { 风水: 1.8, 八宅: 1.8, 玄空: 1.7, 田宅: 1.6, 阳宅: 1.6 },
    unboost: { 月老: 0.6 },
  },
  {
    topic: '孕产',
    kw: ['怀孕', '孕', '生子', '求子', '生育', '胎儿', '产', '坐月子', '宝宝'],
    boost: { 子孙: 1.9, 子女: 1.8, 胎: 1.6 },
    unboost: {},
  },
  {
    topic: '天时',
    kw: ['天气', '下雨', '台风', '旱', '涝', '收成', '年景', '灾', '地震', '气候', '农'],
    boost: { 五运六气: 1.8, 太乙: 1.5, 五星: 1.5 },
    unboost: { 姓名: 0.4 },
  },
  {
    topic: '国事',
    kw: ['国运', '天下', '战', '政局', '大选', '政策', '经济形势', '大势', '时局', '世界'],
    boost: { 太乙: 1.9, 皇极经世: 1.8, 五星: 1.6, 奇门: 1.4 },
    unboost: { 姓名: 0.3, 相术: 0.3 },
  },
]

/**
 * 判定问题归类。
 * @param {string} question 所问。
 * @returns {{topic:string, hits:string[], boost:Record<string,number>, unboost:Record<string,number>}}
 */
export function detectTopic(question) {
  const q = String(question ?? '')
  let best = { topic: '综合', hits: [], boost: {}, unboost: {} }
  let bestScore = 0
  for (const rule of TOPIC_RULES) {
    const hits = rule.kw.filter((k) => q.includes(k))
    if (hits.length > bestScore) {
      bestScore = hits.length
      best = { topic: rule.topic, hits, boost: rule.boost ?? {}, unboost: rule.unboost ?? {} }
    }
  }
  return best
}

/**
 * 按归类给条目算相关性倍率。
 * @param {object} entry 注册表条目。
 * @param {object} topic detectTopic 的结果。
 * @returns {number} 倍率（0.3..3）。
 */
function relevanceOf(entry, topic) {
  let f = 1
  const hay = `${entry.name}|${entry.id}|${entry.cat}|${entry.note}`
  for (const [k, v] of Object.entries(topic.boost)) {
    if (hay.includes(k)) f = Math.max(f, v)
  }
  for (const [k, v] of Object.entries(topic.unboost)) {
    if (hay.includes(k)) f = Math.min(f, v)
  }
  return clamp(f, 0.25, 3)
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

  /** 逐条加权。 */
  const weighted = computed.map((r) => {
    const rel = relevanceOf(r.entry, topic)
    const w = r.entry.weight * FIDELITY_FACTOR[r.outcome.fidelity] * rel
    return { ...r, weight: w, score: r.outcome.score }
  })

  const totalW = weighted.reduce((s, r) => s + r.weight, 0)
  const score = totalW === 0 ? 0 : clamp(weighted.reduce((s, r) => s + r.score * r.weight, 0) / totalW, -100, 100)

  // 加权标准差 → 一致性
  const variance = totalW === 0 ? 0 : weighted.reduce((s, r) => s + r.weight * (r.score - score) ** 2, 0) / totalW
  const std = Math.sqrt(variance)
  const consistency = clamp(1 - std / 100, 0, 1)
  const coverage = results.length === 0 ? 0 : computed.length / results.length
  const confidence = clamp(consistency * coverage, 0, 1)

  // 票型
  const tally = Object.fromEntries(VERDICTS.map((v) => [v, 0]))
  for (const r of computed) tally[r.outcome.verdict] += 1
  const polarity = {
    吉: tally.大吉 + tally.吉 + tally.小吉,
    平: tally.平,
    凶: tally.小凶 + tally.凶 + tally.大凶,
  }

  // 五行信号
  const wuxing = Object.fromEntries(WUXING.map((w) => [w, 0]))
  for (const r of computed) {
    for (const w of WUXING) wuxing[w] += Number(r.outcome.wuxing[w]) || 0
  }
  const wxTotal = WUXING.reduce((s, w) => s + wuxing[w], 0)
  const wxNorm = Object.fromEntries(WUXING.map((w) => [w, wxTotal === 0 ? 0 : wuxing[w] / wxTotal]))
  const wxSorted = [...WUXING].sort((a, b) => wxNorm[b] - wxNorm[a])
  const dominant = wxTotal === 0 ? '—' : wxSorted[0]
  const lacking = wxTotal === 0 ? '—' : wxSorted[wxSorted.length - 1]

  // 共识关键词：次数 × 平均分（同现越多越可信）
  const keyAgg = new Map()
  for (const r of computed) {
    for (const k of r.outcome.keys) {
      const cur = keyAgg.get(k) ?? { key: k, count: 0, sum: 0 }
      cur.count += 1
      cur.sum += r.outcome.score
      keyAgg.set(k, cur)
    }
  }
  const consensusKeys = [...keyAgg.values()]
    .filter((k) => k.count >= 3)
    .map((k) => ({ key: k.key, count: k.count, avg: Math.round(k.sum / k.count) }))
    .sort((a, b) => b.count - a.count || Math.abs(b.avg) - Math.abs(a.avg))
    .slice(0, 10)

  // 应期共识
  const timeAgg = new Map()
  for (const r of computed) {
    if (!r.outcome.timing) continue
    const cur = timeAgg.get(r.outcome.timing) ?? { text: r.outcome.timing, count: 0, sum: 0 }
    cur.count += 1
    cur.sum += r.outcome.score
    timeAgg.set(r.outcome.timing, cur)
  }
  const timing = [...timeAgg.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((t) => ({ text: t.text, count: t.count, avg: Math.round(t.sum / t.count) }))

  // 类别倾向
  const byCategory = {}
  for (const c of CATEGORIES) {
    const list = weighted.filter((r) => r.entry.cat === c)
    if (list.length === 0) continue
    const w = list.reduce((s, r) => s + r.weight, 0)
    const sc = w === 0 ? 0 : list.reduce((s, r) => s + r.score * r.weight, 0) / w
    byCategory[c] = { score: Math.round(sc), count: list.length, computed: list.length }
  }

  // 分歧：同类别内分差 ≥ 60 的极端对
  const conflicts = []
  for (const c of CATEGORIES) {
    const list = computed.filter((r) => r.entry.cat === c).sort((a, b) => b.outcome.score - a.outcome.score)
    if (list.length < 2) continue
    const hi = list[0]
    const lo = list[list.length - 1]
    if (hi.outcome.score - lo.outcome.score >= 60) {
      conflicts.push({
        cat: c,
        high: { no: hi.entry.no, name: hi.entry.name, score: Math.round(hi.outcome.score) },
        low: { no: lo.entry.no, name: lo.entry.name, score: Math.round(lo.outcome.score) },
        gap: Math.round(hi.outcome.score - lo.outcome.score),
      })
    }
  }
  conflicts.sort((a, b) => b.gap - a.gap)

  // 最强/最弱三法
  const ranked = [...computed].sort((a, b) => b.outcome.score - a.outcome.score)
  const top = ranked.slice(0, 5).map(toBrief)
  const bottom = ranked.slice(-5).reverse().map(toBrief)

  const overallVerdict = scoreToVerdict(score)

  return {
    meta: {
      question,
      topic: topic.topic,
      topicHits: topic.hits,
      when: chart?.solar?.text ?? '',
      pillars: (chart?.pillars ?? []).join(' '),
      lunar: chart?.lunar?.text ?? '',
      count: results.length,
      computed: computed.length,
      skipped: skipped.length,
      skippedList: skipped.map((r) => ({ no: r.entry.no, name: r.entry.name, reason: r.error ?? '缺输入' })),
      fidelityTally: countFidelity(computed),
    },
    overall: {
      score: Math.round(score * 10) / 10,
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
    timing,
    byCategory,
    conflicts,
    top,
    bottom,
    advice: buildAdvice({
      score, overallVerdict, consistency, confidence, polarity, tally,
      dominant, lacking, consensusKeys, timing, conflicts, byCategory, topic,
    }),
  }
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
 * @param {object} a 聚合量。
 * @returns {string} 断语。
 */
function buildAdvice(a) {
  const parts = []
  const { score, overallVerdict: v, consistency, confidence, polarity, dominant, lacking, consensusKeys, timing, conflicts, byCategory, topic } = a
  // topic 是 detectTopic 的结果对象；断语里只用到它的名字。
  const topicName = typeof topic === 'string' ? topic : (topic?.topic ?? '综合')

  parts.push(`合盘总断【${v}】（加权分 ${score > 0 ? '+' : ''}${Math.round(score * 10) / 10}）`)

  if (confidence >= 0.6) parts.push('诸法高度一致，结论可采信')
  else if (confidence >= 0.4) parts.push('诸法中上一致，结论可参考')
  else if (confidence >= 0.25) parts.push('诸法分歧明显，宜再问或换时再占')
  else parts.push('诸法严重分歧，此占不宜作决断依据')

  parts.push(`吉 ${polarity.吉} / 平 ${polarity.平} / 凶 ${polarity.凶}`)

  if (dominant !== '—') parts.push(`气机偏${dominant}${lacking !== '—' ? `，${lacking}不足` : ''}`)

  if (consensusKeys.length > 0) {
    parts.push(`多法同现：${consensusKeys.slice(0, 5).map((k) => `${k.key}(${k.count}法)`).join('、')}`)
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
    parts.push(`最大分歧在${c.cat}：${c.high.name}(+${c.high.score}) 对 ${c.low.name}(${c.low.score})，相差 ${c.gap} 分`)
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
