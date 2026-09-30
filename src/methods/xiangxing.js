/**
 * 方法模块 · 姓名学与相术（6 法）
 *
 * 条目：99 五格剖象 / 100 三才配置 / 101 生肖姓名学 / 102 八字姓名补益
 *      / 103 面相十二宫 / 104 手相掌纹
 *
 * ## 契约
 * ```js
 * export const engines = { 引擎名(chart, entry, rand) { ... return 结果对象 } }
 * ```
 * 结果对象字段：`score`(-100..100) / `essence`(≤60字) / `keys`(≤6) / `wuxing`(非负五项)
 * / `timing`(应期或 null) / `detail`(非空对象，中文键名) / `fidelity`(可覆盖条目默认)。
 * 返回 `null` 表示此局无解（运行器记为「未起」）。**禁止抛异常**，**禁止 Math.random**。
 *
 * ## 姓名从哪里来（本模块的关键设计）
 * 插件没有独立的「姓名」参数，所以姓名一律从 `chart.question` 里提取：
 *  1. 先按常见问法匹配（「我叫张三」「名字 李小明」「测名：王五」「欧阳修这个名字如何」…）；
 *  2. 再兜底：问句里长度 2..4 且不含问句虚词的汉字片段；
 *  3. 提不出姓名时**不编造**：
 *     - 若 `chart.numbers` 有值 → 用报数当笔画（格局按报数个数定）；
 *     - 否则用所问文字的字码取数当「名义笔画」，`detail.说明` 写明并降 `fidelity` 为 `approx`；
 *     - 连一个汉字都没有 → 返回 `null`。
 *
 * ## 笔画
 * 内置常用字笔画表（康熙笔画为主）在 `methods/data/xiangxing.js`；未收录的字按
 * **字码取数**（确定性、可复现）并在输出里如实标注 —— 不假装知道康熙笔画。
 *
 * ## 保真度诚实原则
 * - 五格 / 三才 / 生肖 / 八字补益：算法与 81 数理表是公开的，姓名可提取时 `fidelity: core`；
 *   笔画或姓名属「名义」时降为 `approx`。
 * - 面相 / 手相：**没有图像输入**，只能「随机取相 + 部位通例」出断，`fidelity` 恒为 `approx`，
 *   `detail.说明` 一律写明「无图像输入，按通例随机取相，仅供娱乐；如需精断请提供照片」。
 */

import {
  relation, relationScore, wangShuai, emptyWuxing, mod, clamp,
  ZHI_ANIMAL, ZHI_WUXING, GAN_WUXING, SHENG, KE, SHENG_BY, KE_BY, ganzhiOf,
} from '../core/kit.js'
import {
  SHULI_81, FU_XING, SANCAI_MATRIX, SANCAI_REL_TH, SANCAI_REL_HD,
  SHENGXIAO, RADICAL_CHARS, RADICAL_WUXING, STROKE_TABLE,
  MIANXIANG_12, FACE_TYPES, SHOUXIANG_LINES, PALM_TYPES,
  NO_IMAGE_NOTE, sanCaiWord,
} from './data/xiangxing.js'

// ───────────────────────── 姓名提取 ─────────────────────────

/** 常见问法（第 1 组为「提示词 + 姓名」，第 2 组为「姓名 + 提示词」，第 3 组为单字「叫」）。 */
const NAME_PATTERNS = [
  /(?:我叫|我的名字叫|我名字叫|名字是|名字叫|名叫|名为|姓名是|姓名|测名|名字|叫)\s*[:：]?\s*([\u4e00-\u9fff]{2,4})/,
  /([\u4e00-\u9fff]{2,4})(?:这个名字|这名字|的名字)/,
  /(?:^|[^叫])叫\s*[:：]?\s*([\u4e00-\u9fff]{2,4})/,
]

/** 问句词（出现在候选姓名里就判为「不是姓名」）。 */
const NAME_STOP = [
  '好不好', '怎么样', '怎样', '如何', '看看', '帮我', '帮忙', '名字', '姓名', '测名', '什么',
  '可以', '是不是', '谢谢', '请问', '一下', '这个', '那个', '哪里', '多少', '老师', '麻烦',
  '分析', '点评', '测算', '八字', '算命', '占卜', '术数', '我的', '我是', '你好', '想看',
]

/** 兜底提取时要滤掉的问句虚词（单字）。 */
const NAME_STOP_CHARS = new Set([...'这那的了么吗呢吧我你他她它是不有能会要个来去给把和与就都也还很太真请问想看测算好名字姓师老麻烦谢谢您呀啊哦嗯'])

/**
 * 「问名意图」关键词：只有问句里出现其中之一，才认为用户是在问姓名。
 * 没有这个闸门，「这次和张三的合作能不能成」会被兜底逻辑误判成一个姓名。
 */
const NAME_INTENT = [
  '名字', '姓名', '测名', '取名', '改名', '起名', '名叫', '名为', '名叫',
  '我叫', '五格', '三才', '笔画', '名字学', '姓名学', '这名字', '这个名字', '乳名', '笔名',
]

/**
 * 候选是否像「问句词」而非姓名。
 * @param {string} s 候选。
 * @returns {boolean} true = 判为问句词。
 */
function isStopName(s) {
  return NAME_STOP.some((w) => s.includes(w))
}

/**
 * 从问句里提取姓名（汉字数组）。
 *
 * **必须问句里有「问名意图」才做正则提取**：否则像「这次和张三的合作能不能成」
 * 这种句子会被误判出一个「姓名」（假阳性），进而让姓名学假装算的是用户的名字。
 * 无意图时返回 null，交由 {@link resolveName} 走「名义取数」并如实标注。
 * @param {string} text 所问。
 * @returns {string[]|null} 姓名各字，提不出返回 null。
 */
function extractNameFromText(text) {
  const q = String(text ?? '')
  if (!q) return null
  // 问名意图闸门：没有这些词就不认为是「问姓名」的句子。
  if (!NAME_INTENT.some((w) => q.includes(w))) return null
  for (const re of NAME_PATTERNS) {
    const cand = q.match(re)?.[1]
    if (cand && cand.length >= 2 && cand.length <= 4 && !isStopName(cand)) return [...cand]
  }
  // 兜底：整段汉字（≤6 字）滤去虚词后恰好剩 2..4 字，才算姓名
  const runs = q.match(/[\u4e00-\u9fff]+/g) ?? []
  const cands = []
  for (const run of runs) {
    if (run.length > 6) continue
    const seg = [...run].filter((ch) => !NAME_STOP_CHARS.has(ch)).join('')
    if (seg.length >= 2 && seg.length <= 4 && !isStopName(seg)) cands.push(seg)
  }
  if (cands.length === 0) return null
  cands.sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
  return [...cands[0]]
}

/**
 * 取用户所报数字（正数）。
 * @param {object} chart 盘基。
 * @returns {number[]} 报数。
 */
function numberList(chart) {
  return (Array.isArray(chart?.numbers) ? chart.numbers : [])
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.round(n))
}

/**
 * 定姓名（或名义姓名）。
 * @param {object} chart 盘基。
 * @returns {{chars:string[], label:string, source:'name'|'numbers'|'text', note:string}|null} 姓名信息。
 */
function resolveName(chart) {
  const q = String(chart?.question ?? '')
  const nums = numberList(chart)
  const named = extractNameFromText(q)
  if (named) return { chars: named, label: named.join(''), source: 'name', note: '' }
  if (nums.length >= 2) {
    // 只借报数当笔画，**不**把问句里的字当姓名——那会把「这次和」这种问句片段
    // 显示成用户的名字。名义占位符用中性符号，避免误导。
    const width = Math.max(2, Math.min(4, nums.length))
    const chars = Array.from({ length: width }, (_, i) => `报${nums[i] ?? nums[nums.length - 1]}`)
    return {
      chars,
      label: `报数${nums.slice(0, width).join('/')}`,
      source: 'numbers',
      note: `未提供姓名，按所报数字（${nums.join('/')}）取笔画；五格按报数直算，非真实姓名`,
    }
  }
  const chars = (q.match(/[\u4e00-\u9fff]/g) ?? []).filter((ch) => !NAME_STOP_CHARS.has(ch)).slice(0, 3)
  if (chars.length === 0) return null
  return {
    chars,
    label: chars.join(''),
    source: 'text',
    note: '未提供姓名，已按所问文字取数（**非**用户姓名）；建议注明姓名以得精确结果',
  }
}

/**
 * 定笔画（报数 > 内置笔画表 > 字码取数）。
 * @param {object} chart 盘基。
 * @param {{chars:string[], source:string, note:string}} nm 姓名信息。
 * @returns {{strokes:number[], list:Array<{ch:string,n:number,src:string}>, approx:boolean, note:string}} 笔画。
 */
function resolveStrokes(chart, nm) {
  const nums = numberList(chart)
  if (nm.source === 'numbers') {
    const strokes = nums.slice(0, 4)
    while (strokes.length < 2) strokes.push(strokes[strokes.length - 1] ?? 1)
    return {
      strokes,
      list: strokes.map((n, i) => ({ ch: nm.chars[i] ?? '·', n, src: '报数' })),
      approx: false,
      note: '笔画取自用户所报数字，五格按报数直算',
    }
  }
  const list = []
  let missing = 0
  nm.chars.forEach((ch, i) => {
    const t = STROKE_TABLE[ch]
    if (Number.isFinite(t)) { list.push({ ch, n: t, src: '笔画表' }); return }
    if (nums.length === nm.chars.length && nums[i]) { list.push({ ch, n: nums[i], src: '报数' }); return }
    list.push({ ch, n: 1 + (ch.codePointAt(0) % 28), src: '字码' })
    missing += 1
  })
  const notes = []
  if (nm.note) notes.push(nm.note)
  if (missing > 0) {
    const bad = list.filter((x) => x.src === '字码').map((x) => x.ch).join('')
    notes.push(`「${bad}」未收录于内置笔画表，已按字码取数（非真实笔画）`)
  }
  if (nm.source === 'text') notes.push('结果按所问文字的名义笔画推算，仅作示意')
  return {
    strokes: list.map((x) => x.n),
    list,
    approx: missing > 0 || nm.source === 'text',
    note: notes.join('；'),
  }
}

// ───────────────────────── 五格 / 数理 ─────────────────────────

/**
 * 数理 → 五行（1/2 木、3/4 火、5/6 土、7/8 金、9/10 水；十以上取个位）。
 * @param {number} n 数理。
 * @returns {string} 五行。
 */
function shuWuxing(n) {
  return ['水', '木', '木', '火', '火', '土', '土', '金', '金', '水'][mod(Math.round(n), 10)]
}

/**
 * 数理 → 81 数理吉凶（超 81 者循环）。
 * @param {number} n 数理。
 * @returns {{n:number, name:string, luck:string, score:number}} 数理信息。
 */
function luckOf(n) {
  const k = mod(Math.round(n) - 1, 81) + 1
  return SHULI_81[k] ?? { n: k, name: '—', luck: '半吉', score: 0 }
}

/**
 * 定格局并算五格。
 * 单姓单名：天=姓+1、人=姓+名、地=名+1、外=2、总=姓+名。
 * 单姓双名：天=姓+1、人=姓+名1、地=名1+名2、外=名2+1、总=全部。
 * 单姓三名：天=姓+1、人=姓+名1、地=名1+名2+名3、外=名2+名3+1、总=全部。
 * 复姓单名：天=姓1+姓2、人=姓2+名、地=名+1、外=姓1+1、总=全部。
 * 复姓双名：天=姓1+姓2、人=姓2+名1、地=名1+名2、外=姓1+名2、总=全部。
 * @param {number[]} strokesIn 笔画。
 * @param {string[]} chars 姓名各字（判复姓用）。
 * @returns {{layout:string, tian:number, ren:number, di:number, wai:number, zong:number}} 五格。
 */
function fiveGe(strokesIn, chars) {
  const s = (Array.isArray(strokesIn) ? strokesIn : [])
    .slice(0, 4)
    .map((n) => Math.max(1, Math.round(Number(n) || 1)))
  while (s.length < 2) s.push(s[s.length - 1] ?? 1)
  const n = s.length
  const sum = s.reduce((a, b) => a + b, 0)
  const fu = n >= 3 && Array.isArray(chars) && chars.length >= 2 && FU_XING.includes(chars[0] + chars[1])
  if (fu && n === 3) return { layout: '复姓单名', tian: s[0] + s[1], ren: s[1] + s[2], di: s[2] + 1, wai: s[0] + 1, zong: sum }
  if (fu) return { layout: '复姓双名', tian: s[0] + s[1], ren: s[1] + s[2], di: s[2] + s[3], wai: s[0] + s[3], zong: sum }
  if (n === 2) return { layout: '单姓单名', tian: s[0] + 1, ren: s[0] + s[1], di: s[1] + 1, wai: 2, zong: sum }
  if (n === 3) return { layout: '单姓双名', tian: s[0] + 1, ren: s[0] + s[1], di: s[1] + s[2], wai: s[2] + 1, zong: sum }
  return { layout: '单姓三名', tian: s[0] + 1, ren: s[0] + s[1], di: s[1] + s[2] + s[3], wai: s[2] + s[3] + 1, zong: sum }
}

/**
 * 取判姓名的月令五行（有出生盘用生月，否则用求占月）。
 * @param {object} chart 盘基。
 * @returns {string} 五行。
 */
function monthWxOf(chart) {
  const zhi = chart?.birthChart?.monthZhi || chart?.monthZhi
  return ZHI_WUXING[zhi] ?? chart?.monthWx ?? '土'
}

// ───────────────────────── 字根（部首）近似识别 ─────────────────────────

/**
 * 某字是否带某字根。
 * @param {string} ch 字。
 * @param {string} root 字根（{@link RADICAL_CHARS} 的键，或单字）。
 * @returns {boolean} 是否命中。
 */
function hitRoot(ch, root) {
  if (ch === root) return true
  const list = RADICAL_CHARS[root]
  return Array.isArray(list) && list.includes(ch)
}

/**
 * 字根 → 五行（由 {@link RADICAL_WUXING} 反查，模块加载时算一次；只读，不是可变状态）。
 * @type {Record<string, string>}
 */
const ROOT_WUXING = (() => {
  const out = {}
  for (const [w, list] of Object.entries(RADICAL_WUXING)) {
    for (const r of list) if (!out[r]) out[r] = w
  }
  return out
})()

/**
 * 字根所属五行。
 * @param {string} root 字根。
 * @returns {string|null} 五行；未归类返回 null。
 */
function rootWuxing(root) {
  return ROOT_WUXING[root] ?? null
}

/**
 * 按内置字根表推字的五行。
 * @param {string} ch 字。
 * @returns {string|null} 五行；识别不出返回 null（不猜）。
 */
function charWuxing(ch) {
  for (const root of Object.keys(RADICAL_CHARS)) {
    if (hitRoot(ch, root)) {
      const w = ROOT_WUXING[root]
      if (w) return w
    }
  }
  return null
}

/**
 * 一组字里出现最多的字根五行。
 * @param {string[]} chars 字。
 * @returns {string|null} 五行；一个都识别不出返回 null。
 */
function dominantWuxing(chars) {
  const tally = {}
  for (const ch of chars) {
    const w = charWuxing(ch)
    if (w) tally[w] = (tally[w] ?? 0) + 1
  }
  const keys = Object.keys(tally)
  if (keys.length === 0) return null
  keys.sort((a, b) => tally[b] - tally[a] || (a < b ? -1 : 1))
  return keys[0]
}

// ───────────────────────── 相术公用 ─────────────────────────

/**
 * 按权重取相（权重 `w`，缺省 1）。
 * @param {Array<{w?:number}>} list 相表。
 * @param {import('../core/kit.js').Rand} rand 随机源。
 * @returns {object} 取中的相。
 */
function pickWeighted(list, rand) {
  const arr = Array.isArray(list) ? list : []
  if (arr.length === 0) return null
  const total = arr.reduce((s, x) => s + (Number(x.w) || 1), 0)
  let t = rand.float() * total
  for (const x of arr) {
    t -= Number(x.w) || 1
    if (t <= 0) return x
  }
  return arr[arr.length - 1]
}

/**
 * 所问事类 → 相术部位加权（问什么就看什么宫，不问则均看）。
 * @param {string} question 所问。
 * @returns {Record<string, number>} 宫名 → 权重倍数。
 */
function topicBoost(question) {
  const s = String(question ?? '')
  const out = {}
  if (/财|钱|收入|投资|生意|买卖|奖金|工资|回款/.test(s)) { out['财帛宫'] = 1.8; out['田宅宫'] = 1.3 }
  if (/事业|工作|官|升|职|学业|读书|考试|考/.test(s)) { out['官禄宫'] = 1.8; out['命宫'] = 1.2 }
  if (/婚|感情|夫妻|对象|恋爱|姻缘|嫁|娶/.test(s)) { out['夫妻宫'] = 1.8; out['子女宫'] = 1.2 }
  if (/健康|病|身体|疾|寿|养/.test(s)) { out['疾厄宫'] = 1.8; out['福德宫'] = 1.3 }
  if (/父母|长辈|家人|亲/.test(s)) { out['父母宫'] = 1.8; out['兄弟宫'] = 1.3 }
  if (/朋友|合作|合伙|同事|小人|同辈/.test(s)) { out['交友宫'] = 1.8; out['兄弟宫'] = 1.4 }
  if (/外出|出行|搬|迁移|出国|远方|旅行/.test(s)) { out['迁移宫'] = 1.8 }
  if (/孩子|子女|怀孕|生育/.test(s)) { out['子女宫'] = 1.8 }
  return out
}

// ───────────────────────── 引擎实现 ─────────────────────────

export const engines = {
  // ── 99 五格剖象（熊崎氏） ──
  wuGe(chart, entry, rand) {
    const nm = resolveName(chart)
    if (!nm) return null
    const st = resolveStrokes(chart, nm)
    const ge = fiveGe(st.strokes, nm.chars)
    const monthWx = monthWxOf(chart)

    const rows = [
      { label: '天格', n: ge.tian, w: 0.13 },
      { label: '人格', n: ge.ren, w: 0.32 },
      { label: '地格', n: ge.di, w: 0.18 },
      { label: '外格', n: ge.wai, w: 0.13 },
      { label: '总格', n: ge.zong, w: 0.24 },
    ]
    const wuxing = emptyWuxing()
    const parts = []
    let score = 0
    for (const r of rows) {
      const info = luckOf(r.n)
      const wx = shuWuxing(r.n)
      score += info.score * r.w
      wuxing[wx] += 1
      parts.push(`${r.label}${r.n}「${info.name}」${info.luck}·${wx}`)
    }
    const renWx = shuWuxing(ge.ren)
    const ws = wangShuai(renWx, monthWx)
    score = clamp(score + (ws.score - 55) * 0.18, -100, 100)

    const renInfo = luckOf(ge.ren)
    const zongInfo = luckOf(ge.zong)
    const diInfo = luckOf(ge.di)
    const nominal = nm.source !== 'name'
    const jie = renInfo.luck === '吉' && zongInfo.luck === '吉'
      ? '人格总格俱吉，主运顺遂，名可久用'
      : renInfo.luck === '凶'
        ? `人格${ge.ren}数「${renInfo.name}」为凶，主运多阻，宜改字或加字以调剂`
        : `人格${ge.ren}数「${renInfo.name}」${renInfo.luck}，总格${ge.zong}数「${zongInfo.name}」${zongInfo.luck}，吉凶相参，宜以行运补之`

    return {
      score,
      essence: `五格 天${ge.tian}人${ge.ren}地${ge.di}外${ge.wai}总${ge.zong}·人格${renInfo.luck}`,
      keys: [
        `人格${ge.ren}${renInfo.luck}`,
        `总格${ge.zong}${zongInfo.luck}`,
        `地格${ge.di}${diInfo.luck}`,
        ge.layout,
        nominal ? '名义笔画' : '笔画正算',
      ].slice(0, 6),
      wuxing,
      timing: null,
      fidelity: st.approx ? 'approx' : 'core',
      detail: {
        姓名: nm.label || '（未提供）',
        取字: st.list.map((x) => x.ch).join(' ') || '（无）',
        笔画: st.list.map((x) => `${x.ch}${x.n}(${x.src})`).join(' '),
        格局: ge.layout,
        五格: `天格${ge.tian} 人格${ge.ren} 地格${ge.di} 外格${ge.wai} 总格${ge.zong}`,
        数理吉凶: parts.join(' | '),
        人格五行: `${renWx}（${ws.state}·月令${monthWx}）`,
        断: jie,
        说明: st.note || '姓名笔画取自内置常用字笔画表（康熙笔画为主）',
      },
    }
  },

  // ── 100 三才配置 ──
  sanCai(chart, entry, rand) {
    const nm = resolveName(chart)
    if (!nm) return null
    const st = resolveStrokes(chart, nm)
    const ge = fiveGe(st.strokes, nm.chars)
    const t = shuWuxing(ge.tian)
    const r = shuWuxing(ge.ren)
    const d = shuWuxing(ge.di)
    const relTH = relation(t, r)
    const relHD = relation(r, d)
    const base = SANCAI_MATRIX[relTH]?.[relHD] ?? 0
    const monthWx = monthWxOf(chart)
    const ws = wangShuai(r, monthWx)
    const renInfo = luckOf(ge.ren)
    const diInfo = luckOf(ge.di)
    const score = clamp(
      base * 0.85 + renInfo.score * 0.1 + diInfo.score * 0.1 + (ws.score - 55) * 0.15,
      -100,
      100,
    )
    const word = sanCaiWord(base)
    const wuxing = emptyWuxing()
    wuxing[t] += 1
    wuxing[r] += 1.5
    wuxing[d] += 1
    const nominal = nm.source !== 'name'

    return {
      score,
      essence: `三才${t}${r}${d}·天${relTH}/地${relHD}·${word}`,
      keys: [`三才${t}${r}${d}`, `天人${relTH}`, `人地${relHD}`, word, nominal ? '名义笔画' : '笔画正算'].slice(0, 6),
      wuxing,
      timing: null,
      fidelity: st.approx ? 'approx' : 'core',
      detail: {
        姓名: nm.label || '（未提供）',
        三才: `${t}（天${ge.tian}）· ${r}（人${ge.ren}）· ${d}（地${ge.di}）`,
        天人关系: `${relTH} — ${SANCAI_REL_TH[relTH] ?? ''}`,
        人地关系: `${relHD} — ${SANCAI_REL_HD[relHD] ?? ''}`,
        三才吉凶: `${word}（矩阵取值 ${base}）`,
        人格五行: `${r}（${ws.state}·月令${monthWx}）`,
        数理: `人格${ge.ren}「${renInfo.name}」${renInfo.luck}；地格${ge.di}「${diInfo.name}」${diInfo.luck}`,
        断: base >= 45
          ? '三才相生，根基与基业皆得养，为吉配'
          : base >= 0
            ? '三才虽不全顺，尚无重克，宜守中道'
            : '三才有相克之患，主根基或基业受制，宜以行运、居处调剂',
        说明: `${st.note || '姓名笔画取自内置常用字笔画表'}；三才矩阵为公开通例的编辑取值，可按师承调整`,
      },
    }
  },

  // ── 101 生肖姓名学 ──
  shengXiaoName(chart, entry, rand) {
    const nm = resolveName(chart)
    if (!nm || nm.chars.length === 0) return null
    const zhi = chart?.birthChart?.yearZhi || chart?.yearZhi || ''
    const animal = ZHI_ANIMAL[zhi]
    const cfg = animal ? SHENGXIAO[animal] : null
    if (!cfg) return null

    // 两级识别：① 字根例字表直接命中；② 命中不到时，按「字的部首五行」与
    // 喜/忌字根的五行同类做**五行推断**（弱命中，权重减半，输出里标出）。
    // 若喜、忌两侧都有同五行的字根，则判为「两可」，如实标出而不计分（不猜）。
    const rows = nm.chars.map((ch) => {
      const like = cfg.like.filter((k) => hitRoot(ch, k))
      const dislike = cfg.dislike.filter((k) => hitRoot(ch, k))
      let via = ''
      if (like.length === 0 && dislike.length === 0) {
        const w = charWuxing(ch)
        if (w) {
          const likeW = cfg.like.filter((k) => rootWuxing(k) === w)
          const disW = cfg.dislike.filter((k) => rootWuxing(k) === w)
          if (likeW.length > 0 && disW.length > 0) via = `两可（${w}）`
          else if (likeW.length > 0) { like.push(likeW[0]); via = '五行推断' } else if (disW.length > 0) { dislike.push(disW[0]); via = '五行推断' }
        }
      }
      return { ch, like, dislike, via }
    })
    const total = rows.length
    const hitW = (x) => (x.via === '五行推断' ? 0.5 : 1)
    const likeScore = rows.reduce((s, x) => s + (x.like.length > 0 ? hitW(x) : 0), 0)
    const dislikeScore = rows.reduce((s, x) => s + (x.dislike.length > 0 ? hitW(x) : 0), 0)
    const likeChars = rows.filter((x) => x.like.length > 0).length
    const dislikeChars = rows.filter((x) => x.dislike.length > 0).length
    const unknown = rows.filter((x) => x.like.length === 0 && x.dislike.length === 0).length

    const animalWx = ZHI_WUXING[zhi] ?? '土'
    const nameWx = dominantWuxing(nm.chars)
    const rel = nameWx ? relation(animalWx, nameWx) : '比和'
    let score = 25 + (likeScore / total) * 45 - (dislikeScore / total) * 70
    score += relationScore(rel, { 比和: 12, 生我: 15, 我生: -6, 我克: 8, 克我: -12 })
    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[animalWx] += 1.5
    if (nameWx) wuxing[nameWx] += 1.5
    for (const ch of nm.chars) {
      const w = charWuxing(ch)
      if (w) wuxing[w] += 0.5
    }

    const likeHit = [...new Set(rows.flatMap((x) => x.like))]
    const dislikeHit = [...new Set(rows.flatMap((x) => x.dislike))]
    const nominal = nm.source !== 'name'

    return {
      score,
      essence: `属${animal}（${zhi}）名「${nm.label}」·宜${likeChars}忌${dislikeChars}/${total}字`,
      keys: [
        `属${animal}`,
        `宜${likeHit.join('') || '—'}`,
        `忌${dislikeHit.join('') || '无'}`,
        `${nameWx ?? '字根未识'}名`,
        nominal ? '名义取字' : '实名取字',
      ].slice(0, 6),
      wuxing,
      timing: null,
      fidelity: nominal ? 'approx' : 'core',
      detail: {
        生肖: `${animal}（年支${zhi}·本气${animalWx}）`,
        姓名: nm.label,
        宜用字根: cfg.like.join('、'),
        忌用字根: cfg.dislike.join('、'),
        逐字判定: rows.map((x) => `${x.ch}：宜[${x.like.join('') || '—'}] 忌[${x.dislike.join('') || '—'}]${x.via ? `（${x.via}）` : ''}`).join(' | '),
        五行关系: nameWx ? `生肖${animalWx} 与 名字${nameWx} → ${rel}` : '字根五行未能识别，按中性论',
        断: dislikeChars > 0
          ? `名中见忌用字根（${dislikeHit.join('、')}），主与生肖相冲相害，宜避或加字化解`
          : likeChars > 0
            ? `名中见喜用字根（${likeHit.join('、')}），与生肖得地得食，为吉`
            : '名中未见明显喜忌字根，生肖一层无大吉亦无大凶',
        说明: [
          cfg.note,
          unknown > 0 ? `${unknown} 字未收录于内置字根表，未计入宜忌` : '',
          nominal ? nm.note : '',
          '字根识别基于内置常用字根字表（近似），非逐字部件拆解；「五行推断」是按字的部首五行与喜忌字根同类推出的弱命中',
        ].filter(Boolean).join('；'),
      },
    }
  },

  // ── 102 八字姓名补益 ──
  baziName(chart, entry, rand) {
    const bc = chart?.birthChart
    if (!bc) return null
    const me = GAN_WUXING[bc.dayGan] || chart?.dayMasterWx
    if (!me) return null
    const wx = bc.wuxing ?? chart?.wuxing ?? emptyWuxing()
    const monthWx = monthWxOf(chart)
    const yin = SHENG_BY[me]                       // 生我者为印
    const tongDang = (Number(wx[me]) || 0) + (Number(wx[yin]) || 0)
    const all = Object.values(wx).reduce((a, b) => a + (Number(b) || 0), 0)
    const yiDang = Math.max(0, all - tongDang)
    const monthHelp = (monthWx === me || monthWx === yin) ? 1 : 0
    const strong = tongDang + monthHelp * 1.2 >= yiDang
    // 身强喜克泄耗（食伤/财/官杀），身弱喜生扶（印/比劫）
    const xi = strong ? [SHENG[me], KE[me], KE_BY[me]] : [SHENG_BY[me], me]
    const ji = strong ? [SHENG_BY[me], me] : [SHENG[me], KE[me], KE_BY[me]]

    const nm = resolveName(chart)
    const st = nm ? resolveStrokes(chart, nm) : null
    const ge = st ? fiveGe(st.strokes, nm.chars) : null
    const signals = []
    if (nm) {
      for (const ch of nm.chars) {
        const w = charWuxing(ch)
        if (w) signals.push({ w, src: `字根「${ch}」` })
      }
    }
    if (ge) {
      signals.push({ w: shuWuxing(ge.ren), src: `人格${ge.ren}` })
      signals.push({ w: shuWuxing(ge.di), src: `地格${ge.di}` })
      signals.push({ w: shuWuxing(ge.zong), src: `总格${ge.zong}` })
    }
    let good = 0
    let bad = 0
    const goodList = []
    const badList = []
    for (const s of signals) {
      if (xi.includes(s.w)) { good += 1; goodList.push(`${s.src}${s.w}`) } else if (ji.includes(s.w)) { bad += 1; badList.push(`${s.src}${s.w}`) }
    }
    let score = 30 + good * 11 - bad * 13
    // 身强身弱与补益方向的匹配度（补得越准越好）
    if (strong && good >= 2) score += 8
    if (!strong && good >= 2) score += 8
    if (bad >= 2) score -= 6
    score = clamp(score, -100, 100)

    // 应期：近十二年里年干五行属喜用的年份
    const years = []
    const y0 = chart?.solar?.y ?? 2000
    for (let k = 0; k < 12 && years.length < 3; k += 1) {
      const y = y0 + k
      const gz = ganzhiOf(mod(y - 4, 60))
      if (xi.includes(GAN_WUXING[gz[0]])) years.push(y)
    }
    const timing = years.length > 0 ? `逢${xi.join('/')}年（${years.join('、')}）得助` : null

    const wuxing = emptyWuxing()
    wuxing[me] += 1
    for (const w of xi) wuxing[w] += 0.5
    if (nm) {
      for (const ch of nm.chars) {
        const w = charWuxing(ch)
        if (w) wuxing[w] += 0.5
      }
    }

    const nominal = !nm || nm.source !== 'name'

    return {
      score,
      essence: `日主${me}${strong ? '身强' : '身弱'}·喜${xi.join('')}·名补${good}忌${bad}`,
      keys: [
        `日主${me}`,
        strong ? '身强喜克泄' : '身弱喜生扶',
        `喜${xi.join('')}`,
        `补${good}处`,
        `忌${bad}处`,
      ].slice(0, 6),
      wuxing,
      timing,
      fidelity: nominal ? 'approx' : 'core',
      detail: {
        八字: Array.isArray(bc.pillars) ? bc.pillars.join(' ') : '（盘基缺四柱）',
        日主: `${bc.dayGan ?? '—'}（${me}）·${bc.monthZhi ?? '—'}月`,
        身强弱: `${strong ? '身强' : '身弱'}（同党${tongDang.toFixed(1)} 异党${yiDang.toFixed(1)}，月令${monthWx}${monthHelp ? '助身' : '不助身'}）`,
        五行分布: `木${(wx['木'] ?? 0).toFixed(1)} 火${(wx['火'] ?? 0).toFixed(1)} 土${(wx['土'] ?? 0).toFixed(1)} 金${(wx['金'] ?? 0).toFixed(1)} 水${(wx['水'] ?? 0).toFixed(1)}`,
        喜用五行: xi.join('、'),
        忌神五行: ji.join('、'),
        姓名: nm ? nm.label : '（未提供）',
        姓名五行信号: signals.map((s) => `${s.src}${s.w}`).join(' ') || '（无）',
        补益判定: `补喜用：${goodList.join('、') || '无'}；犯忌神：${badList.join('、') || '无'}`,
        应期: timing ?? '近十二年未见喜用之年',
        断: good > bad
          ? `名字五行偏补喜用（${xi.join('、')}），于八字有扶抑之功`
          : bad > good
            ? `名字五行偏助忌神（${ji.join('、')}），于八字无益，宜改字以补${xi.join('、')}`
            : '名字五行补忌相抵，宜再以字号、居处、行运调剂',
        说明: [
          nm ? nm.note : '未提供姓名，仅按八字论喜用，姓名一层未参与',
          st && st.approx ? '部分笔画按字码取数，数理五行仅供参考' : '',
          '字根五行按内置部首表推定，与字义五行或有出入',
        ].filter(Boolean).join('；'),
      },
    }
  },

  // ── 103 面相十二宫（无图像输入，按通例随机取相） ──
  mianXiang(chart, entry, rand) {
    const face = pickWeighted(FACE_TYPES, rand)
    const rows = MIANXIANG_12.map((p) => ({ ...p, pick: pickWeighted(p.xiang, rand) })).filter((r) => r.pick)
    if (!face || rows.length === 0) return null
    const boost = topicBoost(chart?.question)

    let num = 0
    let den = 0
    for (const r of rows) {
      const w = (boost[r.gong] ?? 1) * (r.gong === '命宫' ? 1.2 : 1)
      num += r.pick.score * w
      den += w
    }
    const score = clamp(num / den + (face.score - 50) * 0.3, -100, 100)

    const sorted = rows.slice().sort((a, b) => b.pick.score - a.pick.score)
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]
    const ming = rows.find((r) => r.gong === '命宫')

    const wuxing = emptyWuxing()
    wuxing[face.wx] += 3

    return {
      score,
      essence: `面型${face.wx}·${best.gong}${best.pick.name}·${worst.gong}${worst.pick.name}`,
      keys: [
        `面型${face.wx}`,
        `命宫${ming?.pick.name ?? '—'}`,
        `最旺${best.gong}`,
        `最弱${worst.gong}`,
        '通例取相',
      ].slice(0, 6),
      wuxing,
      timing: `${best.gong}应于${best.age}岁前后`,
      fidelity: 'approx',
      detail: {
        面型: `${face.name}·${face.wx} — ${face.duan}`,
        十二宫: rows.map((r) => `${r.gong}（${r.buwei}·${r.age}岁）${r.pick.name}：${r.pick.duan}`).join(' ‖ '),
        最旺之宫: `${best.gong}（${best.buwei}）${best.pick.name}`,
        最弱之宫: `${worst.gong}（${worst.buwei}）${worst.pick.name}`,
        流年应期: `${best.gong}应${best.age}岁前后；${worst.gong}应${worst.age}岁前后宜留意`,
        问事侧重: Object.keys(boost).length > 0 ? `按所问加重：${Object.keys(boost).join('、')}` : '所问未指明事类，十二宫均看',
        断: score >= 40
          ? '十二宫多明，相属上格，宜守正进取'
          : score >= 10
            ? '十二宫平顺，无大缺陷，宜循分而行'
            : score >= -20
              ? '十二宫互见，吉凶相参，宜补其不足'
              : '十二宫多滞，相带滞气，宜修心养身、早作调理',
        说明: NO_IMAGE_NOTE,
      },
    }
  },

  // ── 104 手相掌纹（无图像输入，按通例随机取相） ──
  shouXiang(chart, entry, rand) {
    const palm = pickWeighted(PALM_TYPES, rand)
    const rows = SHOUXIANG_LINES.map((l) => ({ ...l, pick: pickWeighted(l.xiang, rand) })).filter((r) => r.pick)
    if (!palm || rows.length === 0) return null
    const q = String(chart?.question ?? '')

    // 所问事类 → 对应掌纹加权
    const lineBoost = {
      '生命线（地纹）': /健康|病|身体|寿|养/.test(q) ? 1.6 : 1,
      '智慧线（人纹）': /学业|考试|读书|思路|决策/.test(q) ? 1.6 : 1,
      '感情线（天纹）': /婚|感情|夫妻|对象|恋爱|姻缘/.test(q) ? 1.6 : 1,
      '事业线（玉柱纹）': /事业|工作|官|升|职|财|生意/.test(q) ? 1.6 : 1,
      '婚姻线（家风纹）': /婚|嫁|娶|家庭/.test(q) ? 1.6 : 1,
    }

    let num = 0
    let den = 0
    for (const r of rows) {
      const w = (Number(r.weight) || 1) * (lineBoost[r.name] ?? 1)
      num += r.pick.score * w
      den += w
    }
    const score = clamp(num / den + (palm.score - 50) * 0.3, -100, 100)

    const sorted = rows.slice().sort((a, b) => b.pick.score - a.pick.score)
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]
    const life = rows.find((r) => r.name.startsWith('生命线'))
    const heart = rows.find((r) => r.name.startsWith('感情线'))
    const smart = rows.find((r) => r.name.startsWith('智慧线'))

    const wuxing = emptyWuxing()
    wuxing[palm.wx] += 3

    return {
      score,
      essence: `掌型${palm.wx}形·生命线${life?.pick.name ?? '—'}·感情线${heart?.pick.name ?? '—'}`,
      keys: [
        `掌型${palm.wx}形`,
        `生命线${(life?.pick.name ?? '—').slice(0, 4)}`,
        `智慧线${(smart?.pick.name ?? '—').slice(0, 4)}`,
        `感情线${(heart?.pick.name ?? '—').slice(0, 4)}`,
        `最旺${best.name.slice(0, 3)}`,
        '通例取相',
      ].slice(0, 6),
      wuxing,
      timing: null,
      fidelity: 'approx',
      detail: {
        掌型: `${palm.name}·${palm.wx} — ${palm.duan}`,
        掌纹: rows.map((r) => `${r.name}（权${r.weight}）${r.pick.name}：${r.pick.duan}`).join(' ‖ '),
        最旺之纹: `${best.name}${best.pick.name}`,
        最弱之纹: `${worst.name}${worst.pick.name}`,
        问事侧重: Object.entries(lineBoost).some(([, v]) => v > 1)
          ? `按所问加重：${Object.entries(lineBoost).filter(([, v]) => v > 1).map(([k]) => k).join('、')}`
          : '所问未指明事类，五纹均看',
        断: score >= 40
          ? '三大主线深明，掌属上格，主身心事业皆顺'
          : score >= 10
            ? '掌纹平顺，无大破败，宜循序而进'
            : score >= -20
              ? '掌纹互见，吉凶相参，宜补其不足'
              : '掌纹多滞，主线欠明，宜养身节劳、稳守待时',
        说明: NO_IMAGE_NOTE,
      },
    }
  },
}

export default engines
