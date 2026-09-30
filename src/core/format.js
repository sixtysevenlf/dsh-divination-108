/**
 * 术数内核 · 输出层（token 压缩）
 *
 * 这里是"省 token"的第二半。108 法在本地算完后，如果原样把每法的完整盘丢给模型，
 * 一次就是几万 token。本层做三件事：
 *
 * 1. **紧凑表**：每法压成一行 `编号 符号 名称 分值 依据`（≈10-16 token），
 *    108 行合计约 1.2–1.8k token —— 而模型自己推演任何一法都不止这个量；
 * 2. **按需下钻**：`divine_detail` 才展开某法的完整盘，不看不花；
 * 3. **分级输出**：`brief`（只看合盘断语）/ `normal`（+紧凑表）/ `full`（+所有盘）。
 *
 * 输出里所有数字都来自计算结果，本层只排版，不做任何再判断。
 */

import { VERDICT_GLYPH, truncate } from './kit.js'
import { CATEGORIES, FIDELITY_LABEL } from './registry.js'

/** 定宽：按显示宽度补空格（中文算 2 格）。 */
function pad(s, width) {
  const str = String(s ?? '')
  let w = 0
  for (const ch of str) w += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 2 : 1
  return str + ' '.repeat(Math.max(0, width - w))
}

/** 分值带符号。 */
function signed(n) {
  const v = Math.round(n)
  return v > 0 ? `+${v}` : String(v)
}

/**
 * 渲染合盘摘要（不含 108 法明细）。
 * @param {object} board aggregate() 的结果。
 * @returns {string} 文本。
 */
export function renderSummary(board) {
  const m = board.meta
  const o = board.overall
  const L = []
  L.push(`【108法合盘】${m.question || '(未记所问)'}`)
  L.push(`时刻 ${m.when} ${m.pillars} ｜ 农历 ${m.lunar} ｜ 起 ${m.computed}/${m.count} 法${m.skipped > 0 ? `（${m.skipped} 法缺输入未起）` : ''}`)
  if (m.topic !== '综合') L.push(`归类「${m.topic}」（命中：${m.topicHits.join('/')}）—— 相关术法已加权`)
  L.push('')
  L.push(`◆ 综合：${o.verdict} ${signed(o.score)} ｜ 一致性 ${o.consistency} ｜ 置信 ${o.confidence} ｜ 覆盖 ${o.coverage}`)
  L.push(`◆ 票型：吉 ${board.polarity.吉} ｜ 平 ${board.polarity.平} ｜ 凶 ${board.polarity.凶}`)
  L.push(`◆ 五行：${Object.entries(board.wuxing).map(([k, v]) => `${k}${v}%`).join(' ')} → ${board.dominant}旺 ${board.lacking}缺`)
  L.push(`◆ 断语：${board.advice}`)

  if (board.consensusKeys.length > 0) {
    L.push(`◆ 共识：${board.consensusKeys.map((k) => `${k.key}×${k.count}法(${signed(k.avg)})`).join('、')}`)
  }
  if (board.timing.length > 0) {
    L.push(`◆ 应期：${board.timing.map((t) => `${t.text}×${t.count}法`).join('、')}`)
  }
  const cats = Object.entries(board.byCategory)
  if (cats.length > 0) {
    L.push(`◆ 分类：${cats.map(([c, v]) => `${c}${signed(v.score)}`).join(' ')}`)
  }
  if (board.conflicts.length > 0) {
    L.push('◆ 分歧：')
    for (const c of board.conflicts.slice(0, 4)) {
      L.push(`   ${c.cat}：${c.high.name}${signed(c.high.score)} ↔ ${c.low.name}${signed(c.low.score)}（差 ${c.gap}）`)
    }
  }
  if (m.skipped > 0) {
    L.push(`◆ 未起：${m.skippedList.map((s) => `${s.no}${s.name}(${s.reason})`).join(' ')}`)
  }
  const ft = m.fidelityTally
  L.push(`◆ 保真：全算法 ${ft.full} ｜ 核心算法 ${ft.core} ｜ 近似 ${ft.approx}${ft.approx > 0 ? '（近似项输出带 ⚠，勿当实测）' : ''}`)
  return L.join('\n')
}

/**
 * 渲染 108 法紧凑明细表。
 * @param {Array<{entry:object, outcome:object|null}>} results 各法结果。
 * @param {object} [opts] 选项。
 * @param {string} [opts.sort] 'no'（默认，按编号）| 'score'（按分值降序）。
 * @param {number} [opts.limit] 条数上限。
 * @param {number} [opts.essenceMax] 每行依据的字数上限（默认 34；用户要求「应多尽多」，
 *   故不压到 20 —— 每行多出的十来个字换来「看得懂的依据」，比多一轮下钻便宜）。
 * @returns {string} 文本。
 */
export function renderTable(results, opts = {}) {
  const sort = opts.sort === 'score' ? 'score' : 'no'
  const essenceMax = Number.isFinite(opts.essenceMax) ? opts.essenceMax : 34
  let list = results.slice()
  if (sort === 'score') {
    list.sort((a, b) => (b.outcome?.score ?? -999) - (a.outcome?.score ?? -999))
  } else {
    list.sort((a, b) => a.entry.no - b.entry.no)
  }
  if (opts.limit) list = list.slice(0, opts.limit)

  const L = [`━━ 108 法明细（${sort === 'score' ? '按分值' : '按编号'}）━━`]
  for (const r of list) {
    const no = String(r.entry.no).padStart(3, '0')
    const name = pad(r.entry.name, 18)
    if (!r.outcome) {
      L.push(`${no} ${name} —      未起（${r.error ?? '缺输入'}）`)
      continue
    }
    const o = r.outcome
    const glyph = VERDICT_GLYPH[o.verdict] ?? '·'
    const sc = pad(signed(o.score), 5)
    const fid = o.fidelity === 'approx' ? '⚠' : ' '
    L.push(`${no} ${name} ${glyph}${fid}${sc} ${truncate(o.essence, essenceMax)}`)
  }
  return L.join('\n')
}

/**
 * 渲染单法完整盘。
 * @param {object} entry 注册表条目。
 * @param {object} outcome 该法结果。
 * @returns {string} 文本。
 */
export function renderDetail(entry, outcome) {
  if (!outcome) return `#${entry.no} ${entry.name}：未起（${entry.note}）`
  const L = []
  L.push(`━━ #${entry.no} ${entry.name}（${entry.cat}·${FIDELITY_LABEL[entry.fidelity]}）━━`)
  L.push(`断：${outcome.verdict} ${signed(outcome.score)} ｜ ${outcome.essence}`)
  if (outcome.keys.length > 0) L.push(`关键词：${outcome.keys.join('、')}`)
  if (outcome.timing) L.push(`应期：${outcome.timing}`)
  L.push(`说明：${entry.note}`)
  const d = outcome.detail ?? {}
  for (const [k, v] of Object.entries(d)) {
    if (v === null || v === undefined || v === '') continue
    if (Array.isArray(v)) {
      if (v.length === 0) continue
      L.push(`${k}:`)
      for (const item of v) L.push(`   ${typeof item === 'string' ? item : JSON.stringify(item)}`)
    } else if (typeof v === 'object') {
      L.push(`${k}: ${JSON.stringify(v)}`)
    } else {
      L.push(`${k}: ${v}`)
    }
  }
  return L.join('\n')
}

/**
 * 渲染一次求占的完整输出。
 * @param {object} params 入参。
 * @param {object} params.board 合盘。
 * @param {Array<object>} params.results 各法结果。
 * @param {'brief'|'normal'|'full'|'table'} [params.mode] 输出档位。
 * @param {number[]} [params.detailNos] 需要展开完整盘的法号。
 * @param {boolean} [params.showHint] 是否附下钻提示。
 * @returns {string} 文本。
 */
export function render({ board, results, mode = 'normal', detailNos = [], showHint = true }) {
  const L = [renderSummary(board)]
  if (mode === 'table' || mode === 'normal' || mode === 'full') {
    L.push('')
    L.push(renderTable(results))
  }
  if (detailNos.length > 0) {
    L.push('')
    for (const no of detailNos) {
      const r = results.find((x) => x.entry.no === no)
      if (r) {
        L.push('')
        L.push(renderDetail(r.entry, r.outcome))
      }
    }
  }
  if (showHint) {
    L.push('')
    L.push('━━ 下钻 ━━')
    L.push('divine_detail(method="奇门遁甲·时家") 或 divine_detail(no=31) 看某法完整盘')
    L.push('divine(scope="category:命理") 只看某一类；divine(format="brief") 只看断语')
  }
  return L.join('\n')
}

/**
 * 列出 108 法（给 divine_list 用）。
 * @param {object} [opts] 选项。
 * @param {string} [opts.category] 只看某分类。
 * @param {string} [opts.fidelity] 只看某保真度。
 * @returns {string} 文本。
 */
export function renderList(opts = {}) {
  const L = ['【108 术数目录】']
  L.push(`分类：${CATEGORIES.join(' / ')}`)
  L.push('')
  for (const cat of CATEGORIES) {
    if (opts.category && opts.category !== cat) continue
    const items = []
    // 延迟 import 避免循环依赖
    for (const e of LIST_CACHE.entries) {
      if (e.cat !== cat) continue
      if (opts.fidelity && e.fidelity !== opts.fidelity) continue
      items.push(`${String(e.no).padStart(3, '0')}${e.name}${e.fidelity === 'approx' ? '⚠' : ''}`)
    }
    if (items.length === 0) continue
    L.push(`【${cat}】${items.length} 法`)
    L.push('  ' + items.join('  '))
    L.push('')
  }
  L.push('⚠ = 近似（缺秘传表/辞书，按公开可推部分计算）')
  return L.join('\n')
}

/** 注册表缓存（由 index 注入，避免 core 反向依赖）。 */
export const LIST_CACHE = { entries: [] }

/**
 * 注入注册表（供 renderList 使用）。
 * @param {object[]} entries 注册表条目。
 */
export function primeList(entries) {
  LIST_CACHE.entries = entries
}
