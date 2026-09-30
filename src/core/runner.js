/**
 * 术数内核 · 运行器
 *
 * 把注册表里的 108 条分发给 8 个方法模块，收集结果。
 *
 * ## 方法模块契约（新增/修改术法只需遵守这一条）
 * ```js
 * export const engines = {
 *   // chart: 盘基（core/calendar.js 的 buildChart 结果）
 *   // entry: 注册表条目（含 params / fidelity / note）
 *   // rand:  确定性随机源（同问 + 同时刻 + 同法号 → 同序列）
 *   engineName(chart, entry, rand) {
 *     return { score, essence, keys, wuxing, timing, detail, fidelity }
 *   },
 * }
 * ```
 * 返回值会被 `makeOutcome` 归一化：分数夹到 -100..100、等级由分数推导、
 * essence 截到 60 字、keys 最多 6 个。**不要自己造等级字符串。**
 *
 * ## 三条硬约束
 * 1. **纯函数**：不得读时钟/文件/网络，不得写全局状态。时刻从 chart 取。
 * 2. **不得抛异常**：确实无法计算时返回 `null`，运行器记为「未起」。
 * 3. **确定性**：一切随机走 `rand`，不要用 `Math.random()`。
 */

import { makeRand, makeOutcome } from './kit.js'
import { ENTRIES, ENTRY_BY_NO, ENTRY_BY_ID } from './registry.js'

import { engines as yijing } from '../methods/yijing.js'
import { engines as sanshi } from '../methods/sanshi.js'
import { engines as mingli } from '../methods/mingli.js'
import { engines as zeri } from '../methods/zeri.js'
import { engines as fengshui } from '../methods/fengshui.js'
import { engines as zhanbu } from '../methods/zhanbu.js'
import { engines as xiangxing } from '../methods/xiangxing.js'
import { engines as western } from '../methods/western.js'

/** 模块名 → 引擎表。 */
export const MODULES = { yijing, sanshi, mingli, zeri, fengshui, zhanbu, xiangxing, western }

/**
 * 检查某条目的输入需求是否满足。
 * @param {object} entry 条目。
 * @param {object} chart 盘基。
 * @returns {string[]} 缺失项（空 = 满足）。
 */
export function missingInput(entry, chart) {
  const need = entry.need ?? []
  const miss = []
  for (const n of need) {
    if (n === 'birth' && !chart?.birthChart) miss.push('出生资料')
    if (n === 'numbers' && (!chart?.numbers || chart.numbers.length === 0)) miss.push('报数')
    if (n === 'coins' && (!chart?.coins || chart.coins.length < 6)) miss.push('钱面')
    if (n === 'gender' && !chart?.gender) miss.push('性别')
  }
  return miss
}

/**
 * 跑单条术法。
 * @param {object} entry 条目。
 * @param {object} chart 盘基。
 * @returns {{entry:object, outcome:object|null, error?:string}} 结果。
 */
export function runOne(entry, chart) {
  const mod = MODULES[entry.module]
  const fn = mod?.[entry.engine]
  if (typeof fn !== 'function') {
    return { entry, outcome: null, error: `引擎未实现(${entry.module}.${entry.engine})` }
  }
  const miss = missingInput(entry, chart)
  if (miss.length > 0) {
    return { entry, outcome: null, error: `缺${miss.join('/')}` }
  }
  const rand = makeRand(`${chart.seedBase}|${entry.id}`)
  let raw
  try {
    raw = fn(chart, entry, rand)
  } catch (err) {
    return { entry, outcome: null, error: `算错:${err?.message ?? String(err)}` }
  }
  if (!raw) return { entry, outcome: null, error: '本法无解' }
  return { entry, outcome: makeOutcome({ fidelity: entry.fidelity, ...raw }) }
}

/**
 * 跑一批术法。
 * @param {object} params 入参。
 * @param {object} params.chart 盘基。
 * @param {number[]} [params.nos] 要跑的编号（缺省全 108）。
 * @returns {Array<{entry:object, outcome:object|null, error?:string}>} 结果。
 */
export function runMany({ chart, nos }) {
  const list = Array.isArray(nos) && nos.length > 0
    ? nos.map((n) => ENTRY_BY_NO[n]).filter(Boolean)
    : ENTRIES
  return list.map((e) => runOne(e, chart))
}

/**
 * 解析用户给的方法选择器 → 条目。
 * 支持：中文名（含模糊）、英文 id、编号。
 * @param {string} sel 选择器。
 * @returns {object[]} 命中的条目。
 */
export function resolveMethod(sel) {
  const s = String(sel ?? '').trim()
  if (s === '') return []
  if (/^\d+$/.test(s)) {
    const e = ENTRY_BY_NO[Number(s)]
    return e ? [e] : []
  }
  if (ENTRY_BY_ID[s]) return [ENTRY_BY_ID[s]]
  const exact = ENTRIES.filter((e) => e.name === s)
  if (exact.length > 0) return exact
  const fuzzy = ENTRIES.filter((e) => e.name.includes(s) || e.id.includes(s) || e.note.includes(s))
  return fuzzy
}

/**
 * 自检：注册表里每个引擎都能在模块里找到。
 * @returns {string[]} 缺失列表（空 = 通过）。
 */
export function validateEngines() {
  const problems = []
  for (const e of ENTRIES) {
    const mod = MODULES[e.module]
    if (!mod) { problems.push(`模块缺失: ${e.module}`); continue }
    if (typeof mod[e.engine] !== 'function') problems.push(`引擎缺失: ${e.id} → ${e.module}.${e.engine}`)
  }
  return problems
}
