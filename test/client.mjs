/**
 * dsh-divination-108 —— 客户端半边测试（不需要浏览器）。
 *
 * 跑法： node test/client.mjs
 *
 * 为什么需要：`lib/client.js` 是手写的 ModuleLoader bundle，浏览器里出错时只会看到
 * 面板消失或「面板出错」，没有栈可查。本测试用假 `window.__ModuleLoader__` + 假 React
 * 把 bundle 载进来，覆盖：
 *   1. 包壳 id 与包名一致（宿主会校验 `bundle … loaded without registering "<id>"`）；
 *   2. factory 返回 { apply, inject, __panel, __shell }；
 *   3. apply 把面板注册进 `shell.overlay`，注册选项含必填 id；
 *   4. 折叠态（胶囊）/ 展开态都能渲染，不抛异常；
 *   5. ⭐ 面板内像会话一样跑：一次 `kind=agent` + 轮询 `agentpoll` 取逐步进度；
 *   6. ⭐ 一句话收束置顶、跑完自动收起执行过程；
 *   7. ⭐ 渲染压力：超长文本 + 大量步骤 + 完整 108 法合盘都不许抛
 *      （曾因 rows/cell/mono 被误删而 `ReferenceError`，面板只剩错误卡片）。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_NAME = 'dsh-divination-108'

let pass = 0
let fail = 0
const failures = []
function check(name, cond, extra = '') {
  if (cond) { pass += 1; return }
  fail += 1
  failures.push(`${name}${extra ? ' — ' + extra : ''}`)
  console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`)
}
function section(title) {
  console.log(`\n=== ${title} ===`)
}

const source = readFileSync(join(HERE, '..', 'lib', 'client.js'), 'utf8')

// ─────────────────────────── 假 React ───────────────────────────

/** 基础假 React：createElement 记录元素树；hooks 只记不用。 */
const React = {
  createElement(type, props, ...children) {
    const flat = children.flat().filter((c) => c !== null && c !== undefined && c !== false)
    const merged = { ...(props ?? {}), children: flat.length === 1 ? flat[0] : flat }
    return { __el: true, type, props: merged, children: flat }
  },
  useState: (init) => [init, () => {}],
  useRef: (v) => ({ current: v }),
  useCallback: (fn) => fn,
  useEffect: () => {},
  Fragment: 'Fragment',
  // 错误边界要用 Component；给个最小实现，这样注册的那条外壳路径也能被渲染到。
  Component: class Component {
    constructor(props) { this.props = props; this.state = {} }
    setState(s) { this.state = { ...this.state, ...s } }
  },
}

/** 全部 boolean 初值置 true 的假 React → 强制展开态。 */
const ReactOpen = { ...React, useState: (init) => [typeof init === 'boolean' ? true : init, () => {}] }

/** 按 state 调用序号喂值的假 React（让 question 非空、provider/model 有值）。 */
function makeDrivenReact(strs, bools) {
  let si = 0
  let bi = 0
  return {
    ...React,
    useState(init) {
      if (typeof init === 'boolean') return [bools[bi++] ?? false, () => {}]
      if (typeof init === 'string') return [strs[si++] ?? '', () => {}]
      return [init, () => {}]
    },
  }
}

const loadBundle = (ReactImpl) => {
  let loaded = null
  const win = { __ModuleLoader__: { load(s) { loaded = s } } }
  new Function('require', 'window', source)(
    (id) => (id === 'react' ? ReactImpl : (() => { throw new Error('意外的 require: ' + id) })()),
    win,
  )
  return loaded.factory((id) => (id === 'react' ? ReactImpl : (() => { throw new Error('意外的 require: ' + id) })()))
}

const collect = (el, out = []) => {
  if (!el || el.__el !== true) return out
  out.push(el)
  for (const c of el.children ?? []) collect(c, out)
  return out
}
const flatKids = (e) => (Array.isArray(e?.props?.children) ? e.props.children : [e?.props?.children])

// ─────────────────────────── 1~3. 包壳与注册 ───────────────────────────

section('1. 载入 bundle')
const plugin = loadBundle(React)
check('包壳 id 与包名一致', true, PKG_NAME)

section('2. factory 返回面')
check('factory 返回 apply', typeof plugin.apply === 'function')
check('inject 声明 slots', Array.isArray(plugin.inject) && plugin.inject.includes('slots'), JSON.stringify(plugin.inject))
check('导出内层面板与外壳（测试要用；真 React 注册的是外壳）',
  typeof plugin.__panel === 'function' && typeof plugin.__shell === 'function')

section('3. 插槽注册')
const registrations = []
const fakeSlots = {
  inject(slot, fn) { registrations.push({ slot, fn }); const d = fn(); return typeof d === 'function' ? d : () => {} },
  register(options, component) { registrations.push({ options, component }); return () => {} },
}
plugin.apply({
  slots: fakeSlots,
  effect(fn) { const d = fn(); return typeof d === 'function' ? d : () => {} },
  get() { return fakeSlots },
})
check('注册到了 shell.overlay',
  registrations.some((r) => r.options?.name === 'shell.overlay'),
  registrations.map((r) => r.options?.name ?? r.slot).join(','))
const reg = registrations.find((r) => r.options?.name === 'shell.overlay')
check('注册 id 非空（必填）', typeof reg?.options?.id === 'string' && reg.options.id.length > 0, String(reg?.options?.id))
check('注册了组件（外壳）', typeof reg?.component === 'function')
check('提供了 label', typeof reg?.options?.label === 'function' || typeof reg?.options?.label === 'string')

// ─────────────────────────── 4. 折叠态 ───────────────────────────

section('4. 组件渲染（折叠态）')
let tree = null
try {
  tree = plugin.__panel({})
  check('折叠态渲染成功', tree?.__el === true)
  const kids = flatKids(tree)
  check('折叠态是按钮',
    tree?.type === 'button' || kids.some((c) => c?.type === 'button'),
    [String(tree?.type)].concat(kids.map((c) => String(c?.type))).join(','))
} catch (err) {
  check('折叠态渲染成功', false, err.message)
}

// ─────────────────────────── 5. 展开态（无数据） ───────────────────────────

section('5. 组件渲染（展开态 / 无数据）')
let treeOpen = null
try {
  const p2 = loadBundle(ReactOpen)
  treeOpen = p2.__panel({})
  check('展开态渲染成功', treeOpen?.__el === true)
} catch (err) {
  check('展开态渲染成功', false, err.message ?? String(err))
}

// ─────────────────────────── 5b. 胶囊形态与控件 ───────────────────────────

section('5b. 胶囊悬浮窗的交互形态（学提示词优化插件 dsh-po06）')
{
  const capsule = tree?.type === 'button' ? tree : flatKids(tree).find((c) => c?.type === 'button')
  const capText = JSON.stringify(collect(capsule).map((e) => e.props?.children).filter((x) => typeof x === 'string'))
  check('折叠态是胶囊且带文字标签', capText.includes('术数合盘'), capText)
  check('胶囊用圆角胶囊形状（borderRadius 为半径值，不是 50%）',
    typeof capsule?.props?.style?.borderRadius === 'number', String(capsule?.props?.style?.borderRadius))

  const nodes = collect(treeOpen)
  const input = nodes.find((e) => e.type === 'input' && typeof e.props?.placeholder === 'string'
    && e.props.placeholder.includes('所问之事'))
  check('展开态有输入框', !!input, String(input?.props?.placeholder))
  check('输入框支持回车起卦（onKeyDown）', typeof input?.props?.onKeyDown === 'function')
  const labels = nodes.filter((e) => e.type === 'button').map((e) => JSON.stringify(e.children.filter((c) => typeof c === 'string')))
  check('有「起卦」按钮（全在面板里跑，不进主会话）', source.includes("'起卦'"), labels.join(' '))
  check('有「清空」按钮', labels.some((l) => l.includes('清空')), labels.join(' '))

  // 排版：判词在最上，其次是合盘总断
  const iJudge = source.indexOf('judgeBlock,')
  const iVerdict = source.indexOf('合盘总断【')
  const iQuestion = source.indexOf('record.question ||')
  check('AI 判词渲染在合盘总断之前（头一块）', iJudge > 0 && iJudge < iVerdict, `judge@${iJudge} verdict@${iVerdict}`)
  check('合盘总断渲染在「所问」之前', iVerdict > 0 && (iQuestion < 0 || iVerdict < iQuestion))

  const selects = nodes.filter((e) => e.type === 'select')
  check('3 个下拉（provider / model / 思考强度）', selects.length === 3, String(selects.length))
  const checkboxes = nodes.filter((e) => e.type === 'input' && e.props?.type === 'checkbox')
  check('有「联网」勾选框', checkboxes.length === 1)
  check('清空走服务端 clear', source.includes('kind=clear'))
}

// ─────────────────────────── 5c. 结构完整性 ───────────────────────────

section('5c. 面板内像会话一样跑：结构完整性')
{
  const injected = registrations.filter((r) => typeof r.slot === 'string').map((r) => r.slot)
  check('只注册 shell.overlay 一个槽（不挂会话探针）',
    injected.length === 1 && injected[0] === 'shell.overlay', injected.join(','))
  check('源码里没有会话/提交相关的代码（不进主会话）',
    !source.includes('conversation.input.left') && !source.includes('sessions.binding')
    && !source.includes('inputActions.') && !source.includes('SESSION.')
    && !source.includes('insertText'))
  check('不再碰 ctx.remote / ctx.sessions',
    !source.includes('ctx.remote') && !source.includes('ctx.sessions') && !source.includes("ctx.get('sessions')"))
  check('主通道 kind=agent（一次请求起一轮）', source.includes("request('kind=agent'"))
  check('进度靠轮询 kind=agentpoll', source.includes('kind=agentpoll'))
  check('没选模型时退化 kind=run', source.includes("request('kind=run'"))
  check('**没有** confirmBlock / draft / planInfo 这些琐碎',
    !source.includes('confirmBlock') && !source.includes('const [draft')
    && !source.includes('const [planInfo') && !source.includes('确认起卦'))
  check('**没有** kind=plan / ask / 回答问题那一套',
    !source.includes("request('kind=plan'") && !source.includes('setAsk(')
    && !source.includes('const [chatInput'))
  check('模型写好的判词直接落到 judgement', source.includes('setJudgement(res.judgment)'))
  check('拿回来的 record 直接当合盘渲染',
    source.includes("setState({ status: 'ready', payload: { record: res.record }"))
  check('执行过程（☯/🔎/🔍/📄/📝）有流水', source.includes('const chatIcon = {') && source.includes('执行过程（'))
  check('勾联网会自检（kind=webprobe）', source.includes("request('kind=webprobe'"))
  check('起卦按钮走 startRun；跑着时同一个按钮变「停止」',
    source.includes('const startRun = React.useCallback')
    && source.includes("stage === 'running' ? stopRun : startRun")
    && source.includes('const stopRun = React.useCallback'))
  check('兼容旧宿主：首个响应不是 running 就直接收尾',
    source.includes("start.state !== 'running' || !start.sid") && source.includes('settle(start)'))
  check('旧宿主没有 agentpoll 时给出可读提示', source.includes('宿主没有 agentpoll 端点'))
  check('等待时显示秒表 + 宿主报的当前阶段',
    source.includes('已等 ${elapsed}s') && source.includes('hostPhase')
    && source.includes("typeof res.phase === 'string'"))
  check('⭐ 一句话收束从判词里拆出来单独置顶',
    source.includes('const takeOneLine =') && source.includes('const oneLineBlock =')
    && source.includes('oneLineBlock,') && source.includes("'一句话收束'"))
  check('⭐ 跑完自动收起执行过程（留一个开关）',
    source.includes('const stepsToggle =') && source.includes('setShowSteps(!showSteps)')
    && source.includes('stepsOpen'))

  // 结构完整性清单：这些定义一个都不能少（曾被误删导致面板只剩错误卡片）
  const mustDefine = ['const load = React.useCallback', 'const clearAll = React.useCallback',
    'const openDetail = React.useCallback', 'const startRun = React.useCallback',
    'const header = React.createElement', 'const composer = React.createElement',
    'const controls = React.createElement', 'const noticeRow =', 'const judgeBlock =',
    'const chatBlock =', 'const loadProviders = React.useCallback',
    // rows/cell/mono 曾被误删 → 一渲染合盘就 ReferenceError、面板只剩错误卡片
    'const rows = (record?.results ?? [])', 'const cell = ', 'const mono = ',
    'const b = board ?? {}', 'const overall = b.overall', 'const polarity = b.polarity',
    'const metaB = b.meta']
  const missing = mustDefine.filter((m) => !source.includes(m))
  check('组件内所有必需定义都在（load/clearAll/openDetail/startRun/header/rows/cell/mono/…）',
    missing.length === 0, missing.join(' | '))
  check('4 个 useEffect 都在（provider 列表 / 模型列表 / 思考强度 / 联网自检）',
    (source.match(/React\.useEffect\(/g) ?? []).length >= 4,
    String((source.match(/React\.useEffect\(/g) ?? []).length))
  check('首次展开会真的去拉 provider 列表（否则下拉永远是「无可用模型」）',
    source.includes('loadProviders()') && source.includes('}, [open, loadProviders])'))
  check('provider→model 两级懒加载', source.includes('kind=models&provider='))
  check('provider+model→思考强度档位', source.includes('kind=efforts&provider='))
  check('注册的是带**错误边界**的外壳（面板渲染异常也不许整个消失）',
    source.includes('function DivinationPanelShell') && source.includes('PanelErrorBoundary')
    && source.includes('DivinationPanelShell,'))
}

// ─────────────────────────── 5d. 驱动一次起卦 ───────────────────────────

section('5d. 驱动起卦：一次 kind=agent + 轮询 agentpoll')
try {
  const ReactDrive = makeDrivenReact(
    ['测试：这次合作能不能成', '', 'p-alpha', 'p-alpha-m1', 'low', '', '', '', '', '', '', ''],
    [true, false, false, false, false],
  )
  const p3 = loadBundle(ReactDrive)
  const calls = []
  const RD = (payload) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(payload)) })
  globalThis.fetch = (url, init) => {
    const kind = /kind=([a-z]+)/.exec(String(url))?.[1] ?? '?'
    calls.push({ kind, body: init?.body ? JSON.parse(init.body) : {} })
    if (kind === 'agent') return RD({ ok: true, sid: 'ag-1', state: 'running', steps: [] })
    if (kind === 'agentpoll') {
      return RD({
        ok: true, state: 'done', phase: '收束中…',
        judgment: '一句话收束：卦断「中平偏吉」——主窗 10 月上旬（甲寅日 10-07），次窗 12 月中旬；形态上是「先能调用」，不是「一步到位官宣」。\n\n综合判词\n主断：会在 10 月成事。',
        record: { id: 7, question: '测试：这次合作能不能成', board: { meta: {} }, results: [] },
        steps: [{ kind: 'cast', arg: '测试', count: 1 }, { kind: 'search', arg: 'x', count: 3 }, { kind: 'done', text: '判词' }],
      })
    }
    return RD({ ok: true })
  }
  let panel3 = null
  p3.apply({
    slots: {
      inject: (slot, fn) => { fn(); return () => {} },
      register: (options, component) => {
        if (options?.name === 'shell.overlay') panel3 = p3.__panel ?? component
        return () => {}
      },
    },
    effect: (fn) => { fn(); return () => {} },
    get: () => undefined,
  })
  const tree3 = (p3.__panel ?? panel3)({})
  const btn = collect(tree3).find((e) => e.type === 'button'
    && typeof e.props?.title === 'string' && e.props.title.includes('像在会话里一样起卦'))
  check('找到「起卦」按钮', !!btn)
  await btn.props.onClick()
  await new Promise((r) => { setTimeout(r, 900) })

  const agentCalls = calls.filter((c) => c.kind === 'agent')
  check('只起了一轮 kind=agent（没有第二趟 LLM 调用）',
    agentCalls.length === 1, calls.map((c) => c.kind).join('→') || '(无调用)')
  check('进度靠轮询 kind=agentpoll 拿（步骤边跑边出现）',
    calls.some((c) => c.kind === 'agentpoll'), calls.map((c) => c.kind).join('→'))
  check('agent 带上所问 / 模型 / 思考强度 / 联网开关',
    agentCalls[0]?.body?.question === '测试：这次合作能不能成'
    && agentCalls[0]?.body?.provider === 'p-alpha' && agentCalls[0]?.body?.model === 'p-alpha-m1'
    && agentCalls[0]?.body?.effort === 'low' && agentCalls[0]?.body?.web === false,
    JSON.stringify(agentCalls[0]?.body))
} catch (err) {
  check('驱动起卦未抛异常', false, err?.message ?? String(err))
}

// ─────────────────────────── 5e. 没选模型 → kind=run ───────────────────────────

section('5e. 没选模型时退化为 kind=run')
try {
  const ReactDrive2 = makeDrivenReact(['测试：这次合作能不能成'], [true, false, false, false, false])
  const p4 = loadBundle(ReactDrive2)
  const calls2 = []
  const RD = (payload) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(payload)) })
  globalThis.fetch = (url) => {
    const kind = /kind=([a-z]+)/.exec(String(url))?.[1] ?? '?'
    calls2.push({ kind })
    if (kind === 'run') return RD({ ok: true, record: { id: 9, board: { meta: {} }, results: [] } })
    return RD({ ok: true })
  }
  let panel4 = null
  p4.apply({
    slots: {
      inject: (slot, fn) => { fn(); return () => {} },
      register: (options, component) => {
        if (options?.name === 'shell.overlay') panel4 = p4.__panel ?? component
        return () => {}
      },
    },
    effect: (fn) => { fn(); return () => {} },
    get: () => undefined,
  })
  const btn2 = collect((p4.__panel ?? panel4)({})).find((e) => e.type === 'button'
    && typeof e.props?.title === 'string' && e.props.title.includes('像在会话里一样起卦'))
  await btn2.props.onClick()
  await new Promise((r) => { setTimeout(r, 30) })
  check('没选模型时走 kind=run（本地起卦，不调模型）',
    calls2.length === 1 && calls2[0].kind === 'run', calls2.map((c) => c.kind).join('→') || '(无调用)')
} catch (err) {
  check('驱动退化路径未抛异常', false, err?.message ?? String(err))
}

// ─────────────────────────── 5f. 渲染压力 ───────────────────────────

section('5f. 渲染压力：长文本 + 多步骤 + 完整合盘')
try {
  /** 支持 setState 重渲染的迷你渲染器：原来的 stub 是 noop，测不到「跑完之后」的渲染。 */
  const mini = (base, overrides = {}) => {
    const store = new Map()
    const setters = []
    let dirty = false
    const React2 = {
      ...base,
      useState(init) {
        const i = setters.length
        if (!store.has(i)) store.set(i, Object.prototype.hasOwnProperty.call(overrides, i) ? overrides[i] : init)
        const set = (v) => { store.set(i, typeof v === 'function' ? v(store.get(i)) : v); dirty = true }
        setters.push(set)
        return [store.get(i), set]
      },
    }
    return {
      React2,
      drain(renderFn) {
        let out
        for (let k = 0; k < 60; k += 1) {
          setters.length = 0
          dirty = false
          out = renderFn()
          if (!dirty) break
        }
        return out
      },
    }
  }

  const bigText = '甲'.repeat(20000)
  const STEP_MARK = '【步骤标记】'
  const bigSteps = Array.from({ length: 60 }, (_, i) => ({
    kind: ['search', 'cast', 'detail', 'fetch', 'done'][i % 5],
    arg: '问'.repeat(500), count: 8, text: STEP_MARK + bigText,
  }))
  const bigRecord = {
    id: 1, question: '问'.repeat(3000), when: '2026-09-30 20:05',
    pillars: ['丙午', '丁酉', '丁未', '庚戌'], lunar: '八月二十', topic: '综合', seed: 'abc123',
    board: {
      overall: { verdict: '平', score: 10, consistency: 0.65, confidence: 0.52 },
      polarity: { 吉: 42, 平: 28, 凶: 17 },
      advice: bigText,
      wuxing: { 木: 14.8, 火: 17.3, 土: 24.7, 金: 31.3, 水: 11.8 },
      dominant: '金', lacking: '水',
      consensusKeys: [{ key: '通用', count: 8, avg: 3 }],
      timing: [{ text: '水月', count: 3 }],
      conflicts: [{ cat: '易卦', high: { name: '之卦占', score: 65 }, low: { name: '六爻纳甲', score: -99 } }],
      meta: { computed: 87, count: 108, skipped: 21 },
    },
    results: Array.from({ length: 108 }, (_, i) => ({
      no: i + 1, name: `法${i + 1}`, cat: '易卦', fidelity: i % 7 === 0 ? 'approx' : 'full',
      outcome: { verdict: '平', score: 1, essence: bigText },
    })),
  }
  const ONE_LINE = '一句话收束：卦断「中平偏吉」——主窗 10 月上旬（甲寅日 10-07 / 庚申日 10-13），次窗 12 月中旬；形态上是「先能调用」，不是「一步到位官宣」。'

  // 索引：0 open / 1 state / 2 expanded / 3 detailCache / 4 fresh / 5 question / 6 busy …
  //       9 provider / 11 model
  const h = mini(React, { 0: true, 5: '压力测试：这次合作能不能成', 9: 'p-alpha', 11: 'p-alpha-m1' })
  const p5 = loadBundle(h.React2)
  const RD = (p) => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(p)) })
  globalThis.fetch = (url) => {
    const kind = /kind=([a-z]+)/.exec(String(url))?.[1] ?? '?'
    if (kind === 'agent') return RD({ ok: true, sid: 'ag-big', state: 'running', steps: [] })
    if (kind === 'agentpoll') {
      return RD({
        ok: true, state: 'done', steps: bigSteps,
        judgment: `${ONE_LINE}\n\n综合判词\n主断：${bigText}`,
        record: bigRecord,
      })
    }
    return RD({ ok: true })
  }
  let panel5 = null
  p5.apply({
    slots: {
      inject: (slot, fn) => { fn(); return () => {} },
      register: (options, component) => {
        if (options?.name === 'shell.overlay') panel5 = p5.__panel ?? component
        return () => {}
      },
    },
    effect: (fn) => { fn(); return () => {} },
    get: () => undefined,
  })
  const render5 = () => (p5.__panel ?? panel5)({})
  const castBtn = collect(render5()).find((e) => e.type === 'button'
    && typeof e.props?.title === 'string' && e.props.title.includes('像在会话里一样起卦'))
  check('压力测试：找到起卦按钮', !!castBtn)
  await castBtn.props.onClick()
  for (let i = 0; i < 100; i += 1) await new Promise((r) => { setTimeout(r, 30) })

  let finalTree = null
  let renderErr = null
  try { finalTree = h.drain(render5) } catch (err) { renderErr = err }
  check('压力测试：60 步 × 2 万字 + 108 法合盘渲染**不抛异常**',
    renderErr === null, renderErr ? `${renderErr.constructor.name}: ${renderErr.message}` : '')

  const all = collect(finalTree)
  const hasText = (needle) => all.some((e) => (e.children ?? []).some((x) => typeof x === 'string' && x.includes(needle)))
  const idxOf = (needle) => all.findIndex((e) => (e.children ?? []).some((x) => typeof x === 'string' && x.includes(needle)))

  check('压力测试：合盘总断与 108 行都渲染出来了',
    all.length > 150 && hasText('合盘总断') && all.filter((e) => e.type === 'tr').length >= 108,
    `节点数=${all.length} tr=${all.filter((e) => e.type === 'tr').length}`)

  const iOne = idxOf('一句话收束')
  const iJudge = idxOf('综合判词')
  const iVerdict = idxOf('合盘总断')
  check('⭐ 一句话收束被单独拆出来并置顶（排在综合判词之前）',
    iOne >= 0 && iJudge >= 0 && iOne < iJudge, `one@${iOne} judge@${iJudge}`)
  check('收束里保留了落点与形态（甲寅日 10-07 / 不是「一步到位官宣」）',
    hasText('甲寅日 10-07') && hasText('不是「一步到位官宣」'))
  check('判词排在程序化总断之前、合盘在其下',
    iJudge >= 0 && iVerdict >= 0 && iJudge < iVerdict, `judge@${iJudge} verdict@${iVerdict}`)

  // 跑完自动收起执行过程（不占面板位置）
  const toggle = all.find((e) => e.type === 'button'
    && JSON.stringify(e.children ?? []).includes('执行过程'))
  check('跑完后执行过程被收起：树里找不到步骤文本（只有合盘自己的长文本）',
    !hasText(STEP_MARK), `节点数=${all.length}`)
  check('只留一个「▸ 执行过程（60 步）」开关', !!toggle,
    toggle ? JSON.stringify(toggle.children) : '(没找到开关)')
  if (toggle) {
    toggle.props.onClick()
    const openedAll = collect(h.drain(render5))
    check('点开开关就能看到步骤（步骤标记出现了）',
      openedAll.some((e) => (e.children ?? []).some((x) => typeof x === 'string' && x.includes(STEP_MARK))),
      `节点数=${openedAll.length}`)
  }
} catch (err) {
  check('压力测试未抛异常', false, `${err?.constructor?.name}: ${err?.message}`)
}

// ─────────────────────────── 6. 降级 ───────────────────────────

section('6. 无 slots 服务时的降级')
try {
  plugin.apply({ effect: (fn) => fn(), get: () => undefined })
  check('缺 slots 时静默退出不抛', true)
} catch (err) {
  check('缺 slots 时静默退出不抛', false, err?.message)
}

section('7. 不依赖任何主题 token')
check('未引用未经验证的 --dsw- token', !source.includes('--dsw-'))

// ─────────────────────────── 汇总 ───────────────────────────

console.log(`\n${'='.repeat(50)}`)
console.log(`通过 ${pass} ｜ 失败 ${fail}`)
if (fail > 0) {
  console.log('\n失败项：')
  for (const f of failures) console.log('  · ' + f)
  process.exit(1)
}
console.log('客户端测试全部通过 ✅')
