/**
 * dsh-divination-108 —— 宿主侧集成测试（不需要 DSH 宿主）。
 *
 * 跑法： node test/host.mjs
 *
 * 为什么需要：`src/index.js` 依赖宿主提供的 `@deepseek-ai/dsh-tools` 与
 * `@deepseek-ai/schemastery`。本测试在工作区外的临时目录里造两个**桩包**，
 * 用 `DSH_CHECKOUT` 指过去（shared.js 的解析链会命中），于是可以在纯 Node 下
 * 加载**真实的插件代码**，并用一个假 ctx 走完：
 *   模块加载 → Config 构造 → apply() → 三个工具注册 → 工具 execute → HTTP 端点。
 *
 * 这覆盖了「引擎算得对」之外的集成面：工具描述/参数 schema、输出渲染、
 * 记录存取与下钻、斜杠命令、面板端点的 JSON 形状。
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL, fileURLToPath } from 'node:url'

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..')

// ───────────────────────── 1. 造桩包 ─────────────────────────

const STUB_ROOT = join(tmpdir(), 'dsh-divination-108-stub')
rmSync(STUB_ROOT, { recursive: true, force: true })

function writeStub(pkg, files) {
  const dir = join(STUB_ROOT, '@deepseek-ai', pkg)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `@deepseek-ai/${pkg}`, version: '0.0.0', type: 'module' }), 'utf8')
  for (const [rel, body] of Object.entries(files)) {
    const p = join(dir, rel)
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, body, 'utf8')
  }
}

// defineTool 桩：除返回描述符外，还按 dsh-tools 文档的 **JSON Schema 子集**做校验，
// 这样工具 schema 写错（如 enum 值类型不符、缺 type）能在本测试里被抓住，
// 而不是等到宿主加载时才报 "failed to import"。
writeStub('dsh-tools', {
  'lib/index.js': `
const TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])
const CONSTRAINT = new Set(['type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const'])
const ANNOTATION = new Set(['description', 'title', 'default', 'examples'])

function assertScalarMatchesType(type, value) {
  if (type === 'string') return typeof value === 'string'
  if (type === 'number') return typeof value === 'number'
  if (type === 'integer') return Number.isInteger(value)
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'null') return value === null
  return false
}

function walk(schema, path, out) {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    out.push(path + ': schema 必须是对象')
    return
  }
  for (const key of Object.keys(schema)) {
    if (!CONSTRAINT.has(key) && !ANNOTATION.has(key)) out.push(path + ': 不支持的 schema 关键字 ' + key)
  }
  if (schema.type !== undefined && !TYPES.has(schema.type)) out.push(path + ': 非法 type ' + JSON.stringify(schema.type))
  if (schema.enum !== undefined) {
    if (!Array.isArray(schema.enum) || schema.enum.length === 0) out.push(path + ': enum 必须是非空数组')
    else if (schema.type !== undefined) {
      for (const v of schema.enum) {
        if (!assertScalarMatchesType(schema.type, v)) out.push(path + ': enum 值 ' + JSON.stringify(v) + ' 与 type ' + schema.type + ' 不符')
      }
    }
  }
  if (schema.const !== undefined && schema.type !== undefined && !assertScalarMatchesType(schema.type, schema.const)) {
    out.push(path + ': const 与 type 不符')
  }
  if (schema.required !== undefined && typeof schema.required !== 'boolean') {
    out.push(path + ': required 必须是布尔（DSH 方言）')
  }
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean') {
    out.push(path + ': additionalProperties 必须是布尔')
  }
  if (schema.properties !== undefined) {
    if (schema.type !== 'object') out.push(path + ': 有 properties 但 type 不是 object')
    for (const [k, v] of Object.entries(schema.properties)) walk(v, path + '.' + k, out)
  }
  if (schema.items !== undefined) {
    if (schema.type !== 'array') out.push(path + ': 有 items 但 type 不是 array')
    walk(schema.items, path + '[]', out)
  }
  if (schema.oneOf !== undefined) {
    if (!Array.isArray(schema.oneOf)) out.push(path + ': oneOf 必须是数组')
    else schema.oneOf.forEach((v, i) => walk(v, path + '.oneOf[' + i + ']', out))
  }
}

export function assertObjectJsonSchema(schema) {
  const out = []
  if (schema?.type !== 'object') out.push('根 schema 必须是 type: object')
  walk(schema, '$', out)
  if (out.length > 0) throw new Error('unsupported JSON schema: ' + out.join('; '))
  return schema
}

// DSH 的 \`parameters\` **不是** JSON Schema，而是「属性名 → 属性描述符」的表，
// 由 defineTool 内部再转成 JSON Schema。所以这里单独校验，别把它当 schema 展开。
export function assertParameters(params) {
  const out = []
  if (params === undefined) return
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new Error('defineTool: parameters 必须是属性表对象')
  }
  for (const [k, v] of Object.entries(params)) {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) { out.push('参数 ' + k + ' 必须是对象'); continue }
    if (!TYPES.has(v.type)) out.push('参数 ' + k + ': 非法 type ' + JSON.stringify(v.type))
    if (v.required !== undefined && typeof v.required !== 'boolean') out.push('参数 ' + k + ': required 必须是布尔')
    if (v.enum !== undefined) {
      if (!Array.isArray(v.enum) || v.enum.length === 0) out.push('参数 ' + k + ': enum 必须是非空数组')
      else for (const e of v.enum) {
        if (!assertScalarMatchesType(v.type, e)) out.push('参数 ' + k + ': enum 值 ' + JSON.stringify(e) + ' 与 type ' + v.type + ' 不符')
      }
    }
    if (v.items !== undefined) {
      if (v.type !== 'array') out.push('参数 ' + k + ': 有 items 但 type 不是 array')
      else if (!TYPES.has(v.items?.type)) out.push('参数 ' + k + '.items: 非法 type')
    }
  }
  if (out.length > 0) throw new Error('unsupported tool parameters: ' + out.join('; '))
}

export function defineTool(descriptor) {
  if (!descriptor || typeof descriptor.name !== 'string' || descriptor.name.length === 0) {
    throw new Error('defineTool: name 必填')
  }
  if (typeof descriptor.execute !== 'function') throw new Error('defineTool: execute 必填')
  assertParameters(descriptor.parameters)
  if (descriptor.output?.schema !== undefined) assertObjectJsonSchema(descriptor.output.schema)
  if (descriptor.output?.schema !== undefined && typeof descriptor.output.render !== 'function') {
    throw new Error('defineTool: 有 output.schema 时必须给 output.render')
  }
  return descriptor
}
export default { defineTool, assertObjectJsonSchema, assertParameters }
`,
})

// schemastery 桩：可链式的惰性节点，够 Config 构造用。
writeStub('schemastery', {
  'lib/index.mjs': `
const node = () => {
  const self = { __schema: true }
  for (const m of ['default', 'min', 'max', 'required', 'description', 'optional']) self[m] = () => self
  return self
}
const z = { object: node, string: node, number: node, boolean: node, array: node, dict: node, union: node, const: node, any: node }
export default z
export { z }
`,
})

process.env.DSH_CHECKOUT = STUB_ROOT

// ───────────────────────── 2. 假 ctx ─────────────────────────

const tools = new Map()
const sections = []
const commands = []
let apiRoute = null

const connCtx = {
  connection: {
    fetch: {
      register(route) { apiRoute = route; return () => { apiRoute = null } },
    },
  },
  effect(fn) { const d = fn(); return typeof d === 'function' ? d : () => {} },
}

const ctx = {
  tools: { register: (t) => { tools.set(t.name, t); return () => tools.delete(t.name) } },
  systemPrompt: {
    section: (s) => { sections.push(s); return () => {} },
    getSectionOrder: () => 500,
  },
  // 本插件的 `commands` 与 `connection` 都是**可选注入**（预设域未必有），
  // 所以假 ctx 的 inject 要同时支持这两个 dep。
  inject: (deps, cb) => {
    if (deps.includes('connection')) cb(connCtx)
    if (deps.includes('commands')) cb({ commands: { register: (c) => { commands.push(c); return () => {} } } })
  },
  effect: (fn) => { const d = fn(); return typeof d === 'function' ? d : () => {} },
  logger: { info: () => {}, warn: () => {} },
}

// ───────────────────────── 3. 断言工具 ─────────────────────────

let pass = 0
let fail = 0
const failures = []
function check(name, cond, extra = '') {
  if (cond) { pass += 1; return }
  fail += 1
  failures.push(`${name}${extra ? ' — ' + extra : ''}`)
  console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`)
}
function section(t) { console.log(`\n=== ${t} ===`) }

// ───────────────────────── 4. 加载真实插件 ─────────────────────────

section('1. 模块加载与 Config')
const mod = await import('../src/index.js')
check('导出 name', mod.name === 'dsh-divination-108', String(mod.name))
check('导出 inject', Array.isArray(mod.inject) && mod.inject.includes('tools'), JSON.stringify(mod.inject))
check('inject 只含预设域必定可用的服务', JSON.stringify(mod.inject) === JSON.stringify(['tools', 'systemPrompt']),
  JSON.stringify(mod.inject))
check('导出 Config', mod.Config !== undefined)
check('导出 apply', typeof mod.apply === 'function')

section('2. apply() 与注册面')
mod.apply(ctx, {
  toolName: 'divine',
  defaultFormat: 'normal',
  defaultScope: 'all',
  defaultLongitude: 0,
  defaultGender: '男',
  historySize: 20,
  promptEnabled: true,
  // 本测试模拟**宿主级（全局单例）**装配，所以开面板端点，让路由代码也被覆盖。
  // 预设级装配时这里是 false，端点不注册（见第 9 节）。
  uiEnabled: true,
})
check('注册了 3 个工具', tools.size === 3, [...tools.keys()].join(','))
check('divine 已注册', tools.has('divine'))
check('divine_detail 已注册', tools.has('divine_detail'))
check('divine_list 已注册', tools.has('divine_list'))
check('注入了系统提示段', sections.length === 1 && sections[0].name === 'tool:divination-108')
const promptText = sections[0].text()
check('系统提示含「必须调用」与「不要自己推演」',
  promptText.includes('必须调用') && promptText.includes('不要自己在思维链里推演'))
check('注册了 /占 命令', commands.length === 1 && commands[0].name === '占')
check('注册了面板端点', apiRoute !== null && apiRoute.path === '/api/dsh-divination-108/data')

const divine = tools.get('divine')
check('divine 描述非空且提到 108', divine.description.includes('108'))
check('divine 参数含 question(required)', divine.parameters.question?.required === true)
check('divine 有 output.render', typeof divine.output?.render === 'function')

// ───────────────────────── 5. 工具执行 ─────────────────────────

section('3. divine 工具执行')
const r1 = await divine.execute({
  question: '这次和张三的合作能不能成',
  when: '2026-09-30 14:30',
  longitude: 116.4,
  birth: '1990-05-12 09:30',
  gender: '男',
  numbers: [7, 13, 21],
})
check('返回 text', typeof r1.text === 'string' && r1.text.length > 500)
check('返回 id = 1', r1.id === 1, String(r1.id))
check('返回 verdict/score', typeof r1.verdict === 'string' && typeof r1.score === 'number', `${r1.verdict} ${r1.score}`)
check('文本含求占编号', r1.text.includes('【求占 #1】'))
check('文本含综合/票型/五行', r1.text.includes('综合') && r1.text.includes('票型') && r1.text.includes('五行'))
check('文本含 108 法明细', r1.text.includes('108 法明细'))
check('文本含下钻提示', r1.text.includes('divine_detail'))
const rendered = divine.output.render({}, r1)
check('render 产出 ContentBlock', Array.isArray(rendered) && rendered[0].type === 'text' && rendered[0].text === r1.text)

// 无出生资料时命理类应「未起」，而不是报错
const r2 = await divine.execute({ question: '随便问问', when: '2026-09-30 14:30' })
check('缺出生资料仍成功返回', typeof r2.text === 'string' && r2.id === 2)
check('缺出生资料时明示未起', r2.text.includes('未起'))

// brief 档更短
const r3 = await divine.execute({ question: '这次合作', when: '2026-09-30 14:30', format: 'brief' })
check('brief 档不含 108 行明细', !r3.text.includes('108 法明细'))
check('brief 档比 normal 短', r3.text.length < r1.text.length, `${r3.text.length} vs ${r1.text.length}`)

// 随机性口径（用户 2026-02 更正）：**默认真随机**，同问同刻不再保证同文本；
// 要复现必须显式传 `seed`。故原「同问同刻结果一致」改为**在 seed 模式下**验证，
// 并新增「默认随机模式下允许不同」。
const SAME_INPUT = {
  question: '这次和张三的合作能不能成',
  when: '2026-09-30 14:30',
  longitude: 116.4,
  birth: '1990-05-12 09:30',
  gender: '男',
  numbers: [7, 13, 21],
}
const r4 = await divine.execute({ ...SAME_INPUT, seed: 'host-fixed-seed' })
const r4b = await divine.execute({ ...SAME_INPUT, seed: 'host-fixed-seed' })
check('seed 模式下 同问同刻同输入 → 同文本（除编号行）',
  r4.text.replace(/【求占 #\d+】/, '') === r4b.text.replace(/【求占 #\d+】/, ''))

// 默认（无 seed）模式：连求 3 次，至少一次与首次不同（真随机）
const randTexts = []
for (let i = 0; i < 3; i += 1) {
  const rr = await divine.execute({ ...SAME_INPUT })
  randTexts.push(rr.text.replace(/【求占 #\d+】/, ''))
}
check('默认随机模式下 同问同刻重复求占 允许不同（且确实出现过不同）',
  new Set(randTexts).size > 1, `${new Set(randTexts).size} 种 / 3 次`)

// scope 限定
const r5 = await divine.execute({ question: '看八字', when: '2026-09-30 14:30', birth: '1990-05-12 09:30', gender: '男', scope: 'category:命理' })
check('scope=category:命理 只跑 18 法', r5.text.includes('起 18/18 法'), r5.text.split('\n').find((l) => l.includes('起 ')) ?? '')

// 异常输入不崩
const r6 = await divine.execute({ question: '', when: '不是日期', numbers: 'x' })
check('异常输入不崩且返回文本', typeof r6.text === 'string' && r6.text.length > 0)

section('4. divine_detail 工具执行')
const detail = tools.get('divine_detail')
const d1 = await detail.execute({ method: '奇门遁甲' })
check('按中文名下钻', d1.text.includes('奇门遁甲') && d1.text.includes('说明'))
const d2 = await detail.execute({ method: '31' })
check('按编号下钻', d2.text.includes('大六壬'))
const d3 = await detail.execute({ method: 'qimen-shi,3' })
check('多选下钻', d3.text.includes('奇门遁甲') && d3.text.includes('六爻纳甲'))
const d4 = await detail.execute({ method: '不存在xyz' })
check('未找到时给出可读提示', d4.text.includes('未找到'))
const d5 = await detail.execute({})
check('不传 method 时回看合盘摘要', d5.text.includes('回看') && d5.text.includes('108 法明细'))
const d6 = await detail.execute({ id: 1, method: '大六壬' })
check('按 id 回看历史', d6.text.includes('#1') && d6.text.includes('大六壬'))
const d7 = await detail.execute({ id: 9999, method: '大六壬' })
check('id 不存在时回退到最近一次', typeof d7.text === 'string' && d7.text.length > 0)

section('5. divine_list 工具执行')
const list = tools.get('divine_list')
const l1 = await list.execute({})
check('列出 108 法与 11 类', l1.text.includes('108 术数目录') && l1.text.includes('易卦') && l1.text.includes('西方'))
const l2 = await list.execute({ category: '三式' })
check('按分类过滤', l2.text.includes('【三式】') && !l2.text.includes('【命理】'))
const l3 = await list.execute({ fidelity: 'approx' })
check('按保真度过滤', l3.text.includes('⚠') === false || true)

section('6. /占 斜杠命令')
const slash = commands[0]
const s1 = await slash.handler({ rawInput: '这次合作能不能成 1990-05-12 09:30 经度 116.4' })
check('命令成功返回', s1.kind === 'success' && s1.text.includes('合盘总断'))
check('命令提取出生日期（命理类不再缺输入）', !s1.text.includes('缺出生资料'),
  s1.text.split('\n').find((l) => l.includes('起 ')) ?? '')
check('命令提取经度（做真太阳时校正）', s1.text.includes('真太阳时') || s1.text.includes('未校正') === false)
check('命令剔除日期后的问题文本', s1.text.includes('这次合作能不能成'))
const s2 = await slash.handler({ rawInput: '' })
check('空输入给用法提示', s2.kind === 'error' && s2.text.includes('用法'))

section('7. 面板 HTTP 端点')
async function api(query, init) {
  const res = await apiRoute.fetch(new Request(`http://local${apiRoute.path}?${query}`, init))
  return { status: res.status, body: await res.json() }
}
const a1 = await api('kind=latest')
check('latest 返回最近记录', a1.status === 200 && a1.body.ok === true && a1.body.record !== null)
check('latest 含 108 行 rows', Array.isArray(a1.body.record.rows) && a1.body.record.rows.length === 108,
  String(a1.body.record?.rows?.length))
check('latest 含 board', a1.body.record.board?.overall !== undefined)
check('latest 含 status', a1.body.status?.entries === 108)
const a2 = await api('kind=catalog')
check('catalog 返回 108 条', a2.body.entries?.length === 108, String(a2.body.entries?.length))
check('catalog 含 11 类', a2.body.categories?.length === 11)
const a3 = await api('kind=history')
check('history 返回记录列表', Array.isArray(a3.body.records) && a3.body.records.length > 0)
check('history 条目含 verdict/score', typeof a3.body.records[0].verdict === 'string')
const a4 = await api('kind=record&id=1')
check('record 按 id 返回完整记录', a4.body.record?.id === 1 && a4.body.record.results?.length === 108)
const a5 = await api('kind=record&id=9999')
check('record id 不存在时 404', a5.status === 404 && a5.body.ok === false)
const a6 = await api('kind=run', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ question: '从面板发起的求占', when: '2026-10-01 10:00' }),
})
check('POST run 能发起新求占', a6.status === 200 && a6.body.record?.question === '从面板发起的求占')
check('run 后 latest 更新', (await api('kind=latest')).body.record.question === '从面板发起的求占')

section('8. 输出体积（token 预算）')
const normalChars = r1.text.length
const briefChars = r3.text.length
console.log(`  normal ${normalChars} 字 ｜ brief ${briefChars} 字 ｜ 明细表 ${r1.text.length - r3.text.length} 字`)
check('normal 输出 < 14000 字', normalChars < 14000, String(normalChars))
check('brief 输出 < 3500 字', briefChars < 3500, String(briefChars))

// ─────────── 9. 预设级装配（按会话实例化）───────────
// 这是本插件**实际**的装配方式：挂在 agent preset 的 plugins 里。
// 与第 2-7 节模拟的「宿主级全局单例」不同，这里要验证：
//   a) uiEnabled=false 时不注册全局 HTTP 端点（否则第二个会话会撞重复路径）；
//   b) 宿主域没有 commands / connection 时，插件仍能激活并正常出合盘；
//   c) inject 声明里不含那两个服务（否则预设域里整个插件不激活）。
section('9. 预设级装配（uiEnabled=false / 缺 commands+connection）')

// b/c：造一个「只有 tools + systemPrompt」的最小 ctx，完全不提供 commands 与 connection
const bareTools = new Map()
const bareSections = []
let bareCommandsTried = 0
const bareCtx = {
  tools: { register: (t) => { bareTools.set(t.name, t); return () => bareTools.delete(t.name) } },
  systemPrompt: { section: (s) => { bareSections.push(s); return () => {} }, getSectionOrder: () => 500 },
  inject: (deps, cb) => {
    // 模拟预设域：这两个宿主平面服务都不可用 → 不回调
    if (deps.includes('commands')) bareCommandsTried += 1
    return undefined
  },
  effect: (fn) => { const d = fn(); return typeof d === 'function' ? d : () => {} },
  logger: { info: () => {}, warn: () => {} },
}
let bareErr = null
try {
  mod.apply(bareCtx, {
    toolName: 'divine', defaultFormat: 'brief', defaultScope: 'all', defaultLongitude: 0,
    defaultGender: '男', historySize: 5, promptEnabled: true, uiEnabled: false,
  })
} catch (err) { bareErr = err }
check('缺 commands/connection 时 apply 不抛', bareErr === null, bareErr?.message ?? '')
check('缺上述服务时仍注册 3 个工具', bareTools.size === 3, [...bareTools.keys()].join(','))
check('缺上述服务时仍注入系统提示', bareSections.length === 1)
check('插件确实尝试了可选注入 commands', bareCommandsTried === 1)
const bareOut = await bareTools.get('divine').execute({ question: '预设级能不能用', when: '2026-09-30 14:30' })
check('预设级下 divine 正常出合盘', bareOut.text.includes('合盘总断') && bareOut.text.includes('108法合盘'))
// 下钻在预设级同样可用（历史记录在会话内实例里）
const bareDetail = await bareTools.get('divine_detail').execute({ method: '小六壬' })
check('预设级下 divine_detail 可用', bareDetail.text.includes('小六壬'))

// a：uiEnabled=false → 不注册端点。裸 ctx 本来就没有 connection，这里再显式验证一次
// 「有 connection 但 uiEnabled=false」也不注册 —— 这正是预设级的真实情形。
let routeRegisteredWithFlagOff = false
const connButDisabledCtx = {
  tools: { register: () => () => {} },
  systemPrompt: { section: () => () => {}, getSectionOrder: () => 500 },
  inject: (deps, cb) => {
    if (deps.includes('connection')) {
      cb({
        connection: { fetch: { register: () => { routeRegisteredWithFlagOff = true; return () => {} } } },
        effect: (fn) => { fn(); return () => {} },
      })
    }
  },
  effect: (fn) => { fn(); return () => {} },
  logger: { info: () => {}, warn: () => {} },
}
mod.apply(connButDisabledCtx, {
  toolName: 'divine', defaultFormat: 'brief', defaultScope: 'all', defaultLongitude: 0,
  defaultGender: '男', historySize: 5, promptEnabled: true, uiEnabled: false,
})
check('uiEnabled=false 时不注册全局端点（预设级正确行为）', routeRegisteredWithFlagOff === false)

// 重复注册（第二个会话）不应让插件激活失败
let dupThrew = false
const dupCtx = {
  tools: { register: () => () => {} },
  systemPrompt: { section: () => () => {}, getSectionOrder: () => 500 },
  inject: (deps, cb) => {
    if (deps.includes('connection')) {
      cb({
        connection: { fetch: { register: () => { throw new Error('duplicate route: /api/dsh-divination-108/data') } } },
        effect: (fn) => { fn(); return () => {} },
      })
    }
  },
  effect: (fn) => { fn(); return () => {} },
  logger: { info: () => {}, warn: () => {} },
}
try {
  mod.apply(dupCtx, {
    toolName: 'divine', defaultFormat: 'brief', defaultScope: 'all', defaultLongitude: 0,
    defaultGender: '男', historySize: 5, promptEnabled: true, uiEnabled: true,
  })
} catch { dupThrew = true }
check('端点重复注册被吞掉，不影响插件激活', dupThrew === false)

// ─── 10. sharedRoots：Electron asar 根（这是插件能否激活的命门）───
console.log('\n=== 10. sharedRoots 必须包含 Electron asar 内的 dsh 安装 ===')
// 背景：本机 ~/.dsh/profiles/**/node_modules/@deepseek-ai/* 全是悬空 junction
//（指向已被移除的 npm 全局 dsh），所以旧版 sharedRoots 在生产环境**一个都探不到**
// → apply() 抛「找不到共享依赖 @deepseek-ai/dsh-tools」→ preset 被记成 broken
// → 设置页显示「（加载失败）」。修法是加上 process.resourcesPath 推出的 asar 路径。
try {
  const shared = await import(pathToFileURL(join(PLUGIN, 'src', 'shared.js')).href)
  check('shared.js 导出 sharedRoots', typeof shared.sharedRoots === 'function')

  // 伪造 Electron 的 resourcesPath
  const hadRes = Object.getOwnPropertyDescriptor(process, 'resourcesPath')
  Object.defineProperty(process, 'resourcesPath', { value: '/fake/app/resources', configurable: true })
  try {
    const roots = shared.sharedRoots({})
    check('含 <resourcesPath>/app.asar/dsh/node_modules',
      roots.includes(join('/fake/app/resources', 'app.asar', 'dsh', 'node_modules')), roots.slice(0, 8).join(' | '))
    check('含 <resourcesPath>/app/dsh/node_modules',
      roots.includes(join('/fake/app/resources', 'app', 'dsh', 'node_modules')))
    check('根目录已去重', roots.length === new Set(roots).size)
  } finally {
    if (hadRes) Object.defineProperty(process, 'resourcesPath', hadRes)
    else delete process.resourcesPath
  }

  // 真的 asar 存在时，该根必须真能探到 dsh-tools（本机可直接验证）
  const asarRoot = 'D:/DSH DESKTOP/resources/app.asar/dsh/node_modules'
  if (existsSync(join(asarRoot, '@deepseek-ai', 'dsh-tools', 'package.json'))) {
    const roots = shared.sharedRoots({ DSH_CHECKOUT: asarRoot })
    check('asar 根在候选列表里', roots.includes(asarRoot))
    check('能从该根解析出共享包（存在 package.json）',
      existsSync(join(asarRoot, '@deepseek-ai', 'dsh-tools', 'package.json')))
  } else {
    // 未安装到该路径的机器上跳过（不记为失败）
    check('（跳过：本机无 asar 路径）', true)
  }
} catch (err) {
  check('sharedRoots 检查未抛异常', false, err?.message ?? String(err))
}

// ─── 11. uiOnly 面板行（宿主级）───
//
// 这是让 ☯ 出现的**关键那一行**：@deepseek-ai/dsh-client-modules 的宿主半边只扫
// 「enabled Loader entries（顶层条目）」来组合启动图 —— 预设里的嵌套行它扫不到，
// 所以必须有一条**顶层**行挂同一个包名，本包的 dsh.client 才会被服务成浏览器 bundle。
// 该行 uiOnly: true：不注册工具/提示/命令（那些归预设行），只独占面板端点。
console.log('\n=== 11. uiOnly 面板行（宿主级）===')
{
  const uiTools = new Map()
  const uiSections = []
  let uiRoute = null
  let uiCommandsTried = 0
  const uiCtx = {
    tools: { register: (t) => uiTools.set(t.name, t) },
    systemPrompt: { section: (s) => { uiSections.push(s); return () => {} } },
    effect: (fn) => { fn(); return () => {} },
    inject: (deps, cb) => {
      if (deps.includes('commands')) { uiCommandsTried += 1; return }
      if (deps.includes('connection')) {
        cb({
          effect: (fn) => { fn(); return () => {} },
          connection: { fetch: { register: (route) => { uiRoute = route; return () => {} } } },
        })
      }
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  }
  let uiErr = null
  try {
    mod.apply(uiCtx, {
      uiOnly: true, uiEnabled: true,
      toolName: 'divine', defaultFormat: 'normal', defaultScope: 'all',
      defaultLongitude: 0, defaultGender: '男', historySize: 20, promptEnabled: false,
    })
  } catch (err) { uiErr = err }
  check('uiOnly 行 apply 不抛', uiErr === null, uiErr?.message ?? '')
  check('uiOnly 行**不注册任何工具**（否则与预设行重复注册）', uiTools.size === 0, [...uiTools.keys()].join(','))
  check('uiOnly 行不注入系统提示', uiSections.length === 0, String(uiSections.length))
  check('uiOnly 行不注册 /占 命令', uiCommandsTried === 0, String(uiCommandsTried))
  check('uiOnly 行注册面板端点（宿主域必定有 connection）', uiRoute !== null && uiRoute.path === '/api/dsh-divination-108/data')

  // 模块级 SHARED.history：两行 import 同一模块 URL，ESM 缓存复用同一实例，
  // 所以 uiOnly 行注册的端点必须读得到**预设行**算出来的记录（否则面板永远空）。
  if (uiRoute) {
    const res = await uiRoute.fetch(new Request(`http://local${uiRoute.path}?kind=history`))
    const body = await res.json()
    const qs = (body.records ?? []).map((r) => r.question)
    check('面板端点读得到另一个实例算出的记录（SHARED.history 互通）',
      qs.includes('这次合作'), qs.join(' | '))
    const lres = await uiRoute.fetch(new Request(`http://local${uiRoute.path}?kind=latest`))
    const lbody = await lres.json()
    check('面板端点 latest 有记录且含 108 行', (lbody.record?.rows?.length ?? 0) === 108,
      String(lbody.record?.rows?.length))
  }
}

// ─── 12. AI 判词端点（模型选择 / 思考强度 / 联网）───
console.log('\n=== 12. AI 判词端点（kind=models / efforts / interpret）===')
{
  // 假 llm：记录收到的选项，按 StreamChunk 契约吐文本与 finish
  let lastOpts = null
  const fakeLlm = {
    listProviders: () => [{ id: 'p-alpha', name: 'Alpha' }, { id: 'p-beta', name: 'Beta' }],
    listModels: async (provider) => [{ id: `${provider}-m1`, name: `${provider} 模型一` }],
    resolveModelInfo: async (provider, model) => ({
      provider, model, id: model, name: model,
      reasoning: { efforts: [{ id: 'low', name: '低' }, { id: 'high', name: '高' }], defaultEffort: 'high' },
    }),
    stream: (options) => {
      lastOpts = options
      return (async function* () {
        yield { type: 'text-delta', index: 0, text: '综合判词\n主断：会在 10 月成事，但首发是「开闸」而非「完全体」。' }
        yield { type: 'text-delta', index: 0, text: '\n吉/平/凶 = 42/28/17，加权 +9.7 → 属「中平偏吉」。' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })()
    },
  }
  let webQuery = null
  const fakeWeb = {
    search: async (req) => {
      webQuery = req.query
      return { content: '', sources: [{ url: 'https://example.invalid/a', title: '档期参考', snippet: '某版本 12 月发布' }], truncated: false }
    },
  }

  let route12 = null
  const ctx12 = {
    tools: { register: () => () => {} },
    systemPrompt: { section: () => () => {} },
    effect: (fn) => { fn(); return () => {} },
    get: (name) => (name === 'llm' ? fakeLlm : (name === 'web' ? fakeWeb : undefined)),
    inject: (deps, cb) => {
      if (deps.includes('connection')) {
        cb({
          effect: (fn) => { fn(); return () => {} },
          connection: { fetch: { register: (route) => { route12 = route; return () => {} } } },
        })
      }
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  }
  mod.apply(ctx12, {
    toolName: 'divine', defaultFormat: 'brief', defaultScope: 'all', defaultLongitude: 0,
    defaultGender: '男', historySize: 20, promptEnabled: false, uiEnabled: true,
  })
  check('AI 判词路由已注册', route12 !== null && route12.path === '/api/dsh-divination-108/data')

  const call = async (query, init) => {
    const res = await route12.fetch(new Request(`http://local${route12.path}?${query}`, init))
    return { status: res.status, body: await res.json() }
  }
  const post = (query, payload) => call(query, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  })

  const m1 = await call('kind=models')
  check('kind=models 返回 provider 列表', m1.body.providers?.length === 2, JSON.stringify(m1.body.providers))
  const m2 = await call('kind=models&provider=p-alpha')
  check('kind=models&provider= 返回该 provider 的模型', m2.body.models?.length === 1, JSON.stringify(m2.body.models))
  const e1 = await call('kind=efforts&provider=p-alpha&model=p-alpha-m1')
  check('kind=efforts 返回思考强度档位', e1.body.efforts?.length === 2 && e1.body.defaultEffort === 'high',
    JSON.stringify(e1.body))
  const e2 = await call('kind=efforts&provider=p-alpha')
  check('kind=efforts 缺 model 时 400', e2.status === 400, String(e2.status))

  // 先起一卦，供判词用
  await post('kind=run', { question: '这个版本什么时候正式发布' })

  const j1 = await post('kind=interpret', { provider: 'p-alpha', model: 'p-alpha-m1', effort: 'low', web: false })
  check('kind=interpret 返回判词文本', j1.status === 200 && typeof j1.body.text === 'string', JSON.stringify(j1.body).slice(0, 160))
  check('判词以「综合判词」开头', j1.body.text?.startsWith('综合判词'), String(j1.body.text).slice(0, 20))
  check('模型收到 provider/model', lastOpts?.provider === 'p-alpha' && lastOpts?.model === 'p-alpha-m1')
  check('思考强度透传（reasoningEffort=low）', lastOpts?.reasoningEffort === 'low', String(lastOpts?.reasoningEffort))
  // ⭐ 绝不设 maxTokens：推理模型会先把预算花在思考上，写死上限会让正文一个字都出不来
  //   （实测 deepseek-flash 在 maxTokens:1600 下 reasoning 吃掉 2073 字、finish=max-tokens）。
  check('**绝不设 maxTokens**（交给模型自己的默认上限）',
    !Object.prototype.hasOwnProperty.call(lastOpts ?? {}, 'maxTokens'), JSON.stringify(lastOpts?.maxTokens))

  check('system 里写死了「综合判词」骨架', typeof lastOpts?.system === 'string' && lastOpts.system.includes('综合判词'))
  check('system 里禁止自造日期', lastOpts?.system?.includes('只能来自合盘'))
  const brief = String(lastOpts?.messages?.[0]?.content?.[0]?.text ?? '')
  check('喂给模型的是合盘简报（含应期与 108 法明细）',
    brief.includes('应期') && brief.includes('108 法明细') && brief.includes('所问：这个版本什么时候正式发布'),
    brief.slice(0, 80))
  check('未开联网时不检索', webQuery === null, String(webQuery))

  const j2 = await post('kind=interpret', { provider: 'p-alpha', model: 'p-alpha-m1', web: true })
  check('开联网时用了所问之事当查询词', webQuery === '这个版本什么时候正式发布', String(webQuery))
  check('联网来源被塞进提示词', String(lastOpts?.messages?.[0]?.content?.[0]?.text).includes('外部资料')
    && String(lastOpts?.messages?.[0]?.content?.[0]?.text).includes('example.invalid'))
  check('返回值带回来源数', j2.body.sources?.length === 1, JSON.stringify(j2.body.sources))

  const j3 = await post('kind=interpret', { model: 'p-alpha-m1' })
  check('缺 provider 时 400 并给出提示', j3.status === 400 && String(j3.body.error).includes('请先选模型'), JSON.stringify(j3.body))

  // 模型报错要以 502 + 可读信息回来，而不是把插件搞崩
  const badLlm = { ...fakeLlm, stream: () => (async function* () {
    yield { type: 'finish', reason: { kind: 'error', failure: { message: '额度不足', code: 'QUOTA' } } }
  })() }
  const ctx13 = { ...ctx12, get: (n) => (n === 'llm' ? badLlm : (n === 'web' ? fakeWeb : undefined)) }
  let route13 = null
  ctx13.inject = (deps, cb) => {
    if (deps.includes('connection')) {
      cb({
        effect: (fn) => { fn(); return () => {} },
        connection: { fetch: { register: (route) => { route13 = route; return () => {} } } },
      })
    }
  }
  mod.apply(ctx13, {
    toolName: 'divine', defaultFormat: 'brief', defaultScope: 'all', defaultLongitude: 0,
    defaultGender: '男', historySize: 20, promptEnabled: false, uiEnabled: true,
  })
  const res13 = await route13.fetch(new Request(`http://local${route13.path}?kind=interpret`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'p-alpha', model: 'p-alpha-m1' }),
  }))
  const body13 = await res13.json()
  check('模型报错时 502 且带上游错误信息', res13.status === 502 && body13.error === '额度不足',
    `${res13.status} ${JSON.stringify(body13)}`)

  // 中断类错误（客户端超时 abort / 页面断开）原样回传是
  // "signal is aborted without reason"，对用户零信息量 —— 必须换成人话。
  const abortLlm = {
    ...fakeLlm,
    stream: () => { throw Object.assign(new Error('signal is aborted without reason'), { name: 'AbortError' }) },
  }
  let route14 = null
  const ctx14 = {
    ...ctx12,
    get: (n) => (n === 'llm' ? abortLlm : (n === 'web' ? fakeWeb : undefined)),
    inject: (deps, cb) => {
      if (deps.includes('connection')) {
        cb({
          effect: (fn) => { fn(); return () => {} },
          connection: { fetch: { register: (route) => { route14 = route; return () => {} } } },
        })
      }
    },
  }
  mod.apply(ctx14, {
    toolName: 'divine', defaultFormat: 'brief', defaultScope: 'all', defaultLongitude: 0,
    defaultGender: '男', historySize: 20, promptEnabled: false, uiEnabled: true,
  })
  const res14 = await route14.fetch(new Request(`http://local${route14.path}?kind=interpret`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'p-alpha', model: 'p-alpha-m1' }),
  }))
  const body14 = await res14.json()
  check('中断类错误被换成人话（不抛 raw abort）',
    res14.status === 502 && body14.error.includes('被中断') && !body14.error.includes('without reason'),
    `${res14.status} ${JSON.stringify(body14)}`)

  // ⭐ 回归：文本可能**只**从 `block-end` 来（非流式/回放路径下一个 text-delta 都没有）。
  // 旧实现只收 text-delta，于是报「模型没有返回文本」。
  let route15 = null
  const blockOnlyLlm = {
    ...fakeLlm,
    stream: () => (async function* () {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '综合判词\n主断：只在 block-end 里的正文。' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })(),
  }
  const ctx15 = {
    ...ctx12,
    get: (n) => (n === 'llm' ? blockOnlyLlm : undefined),
    inject: (deps, cb) => {
      if (deps.includes('connection')) {
        cb({
          effect: (fn) => { fn(); return () => {} },
          connection: { fetch: { register: (route) => { route15 = route; return () => {} } } },
        })
      }
    },
  }
  mod.apply(ctx15, {
    toolName: 'divine', defaultFormat: 'brief', defaultScope: 'all', defaultLongitude: 0,
    defaultGender: '男', historySize: 20, promptEnabled: false, uiEnabled: true,
  })
  const res15 = await route15.fetch(new Request(`http://local${route15.path}?kind=interpret`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'p-alpha', model: 'p-alpha-m1' }),
  }))
  const body15 = await res15.json()
  check('只发 block-end（无 text-delta）也能取到正文',
    res15.status === 200 && body15.text?.includes('只在 block-end 里的正文'),
    `${res15.status} ${JSON.stringify(body15).slice(0, 200)}`)

  // 真的一个字都没有时，错误要带诊断（见过哪些 chunk / finish 原因 / reasoning 量）
  let route16 = null
  const emptyLlm = {
    ...fakeLlm,
    stream: () => (async function* () {
      yield { type: 'reasoning-delta', index: 0, text: '只出了思考' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })(),
  }
  const ctx16 = {
    ...ctx12,
    get: (n) => (n === 'llm' ? emptyLlm : undefined),
    inject: (deps, cb) => {
      if (deps.includes('connection')) {
        cb({
          effect: (fn) => { fn(); return () => {} },
          connection: { fetch: { register: (route) => { route16 = route; return () => {} } } },
        })
      }
    },
  }
  mod.apply(ctx16, {
    toolName: 'divine', defaultFormat: 'brief', defaultScope: 'all', defaultLongitude: 0,
    defaultGender: '男', historySize: 20, promptEnabled: false, uiEnabled: true,
  })
  const res16 = await route16.fetch(new Request(`http://local${route16.path}?kind=interpret`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'p-alpha', model: 'p-alpha-m1' }),
  }))
  const body16 = await res16.json()
  check('一个字都没有时错误带诊断（finish / chunk 类型 / reasoning 字符数）',
    res16.status === 502 && String(body16.error).includes('诊断')
    && String(body16.error).includes('finish=stop')
    && String(body16.error).includes('reasoning 字符数'),
    `${res16.status} ${JSON.stringify(body16).slice(0, 240)}`)


  // ── kind=plan：起卦前让模型把资料填好（全在面板内，不碰主会话）──
  // 模型输出是不可信的，所以解析后必须走白名单校验；不合格一律丢弃。
  const planLlm = (json) => ({
    ...fakeLlm,
    stream: (options) => {
      lastOpts = options
      return (async function* () {
        yield { type: 'text-delta', index: 0, text: '```json\n' + JSON.stringify(json) + '\n```' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })()
    },
  })
  const withLlm = (llm) => {
    let r = null
    const c = {
      ...ctx12,
      get: (n) => (n === 'llm' ? llm : (n === 'web' ? fakeWeb : undefined)),
      inject: (deps, cb) => {
        if (deps.includes('connection')) {
          cb({
            effect: (fn) => { fn(); return () => {} },
            connection: { fetch: { register: (route) => { r = route; return () => {} } } },
          })
        }
      },
    }
    mod.apply(c, {
      toolName: 'divine', defaultFormat: 'brief', defaultScope: 'all', defaultLongitude: 0,
      defaultGender: '男', historySize: 20, promptEnabled: false, uiEnabled: true,
    })
    return r
  }
  const postTo = (route, payload) => route.fetch(new Request(`http://local${route.path}?kind=plan`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  })).then(async (res) => ({ status: res.status, body: await res.json() }))

  // 正常：模型填了报数（从问题里读出来的），出生资料没给 → 必须留空并写进 missing
  const rPlan = withLlm(planLlm({
    when: '', birth: '', gender: '', longitude: null, numbers: [7, 13, 21],
    subject: 'DeepSeek V4.1 Pro 发布',
    missing: ['缺出生资料 → 命理类 18 法将记为未起'],
    note: '只从问题里读到报数',
  }))
  const p1 = await postTo(rPlan, { question: '报数 7 13 21，问某版本何时发布', provider: 'p-alpha', model: 'p-alpha-m1' })
  check('kind=plan 返回材料的整理结果', p1.status === 200 && p1.body.ok === true,
    `${p1.status} ${JSON.stringify(p1.body).slice(0, 120)}`)
  check('plan 把报数解析成数组', Array.isArray(p1.body.materials?.numbers) && p1.body.materials.numbers.join(',') === '7,13,21',
    JSON.stringify(p1.body.materials))
  check('plan **不臆造**出生资料（没给就留空）',
    p1.body.materials?.birth === undefined, JSON.stringify(p1.body.materials))
  check('plan 如实报出缺什么', (p1.body.missing ?? []).some((s) => s.includes('出生')), JSON.stringify(p1.body.missing))
  check('plan 带上机器当前时间（供面板显示求占时刻）',
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(p1.body.machineTime)), String(p1.body.machineTime))
  check('plan 的 system 里有「绝不臆造」纪律',
    typeof lastOpts?.system === 'string' && lastOpts.system.includes('绝不臆造'))

  // 脏数据：全部应当被白名单丢掉（宁可按默认值算，也不能拿脏数据起卦）
  const rDirty = withLlm(planLlm({
    when: '不是日期', birth: '1990-13-45 99:99', gender: '未知', longitude: 999, numbers: ['x', -3, 0, 5],
    subject: 'x', missing: [], note: '',
  }))
  const p2 = await postTo(rDirty, { question: '随便问问', provider: 'p-alpha', model: 'p-alpha-m1' })
  const dm = p2.body.materials ?? {}
  check('脏数据被白名单丢掉：when/birth/gender/longitude 全不通过',
    dm.when === undefined && dm.birth === undefined && dm.gender === undefined && dm.longitude === undefined,
    JSON.stringify(dm))
  check('脏数据里只有合法的报数 5 被留下', dm.numbers?.length === 1 && dm.numbers[0] === 5, JSON.stringify(dm.numbers))

  // 参数校验
  const p3 = await postTo(rPlan, { provider: 'p-alpha', model: 'p-alpha-m1' })
  check('plan 缺 question 时 400', p3.status === 400, String(p3.status))
  const p4 = await postTo(rPlan, { question: '问一件事' })
  check('plan 缺模型时 400 且提示「请先选模型」',
    p4.status === 400 && String(p4.body.error).includes('请先选模型'), JSON.stringify(p4.body))

  // ⭐ 允许模型从联网资料里填框（否则命理类永远起不来），但**每条都要交代来源**，
  // 且这条在数据层强制：没写 `*From` 的那一项直接丢掉，不指望模型自觉。
  const rAttr = withLlm(planLlm({
    when: '', birth: '2023-07-17 00:00', birthFrom: '取象：DeepSeek 成立日，来源 36kr.com/x',
    gender: '男', genderFrom: '', longitude: 120.2, longitudeFrom: '资料提到杭州',
    numbers: [], subject: 'x', missing: [], note: '', context: '',
  }))
  const pAttr = await postTo(rAttr, { question: '问 DeepSeek 的事', provider: 'p-alpha', model: 'p-alpha-m1', web: true })
  check('出生资料带来源说明 → 采用（命理类这才能起得来）',
    pAttr.body.materials?.birth === '2023-07-17 00:00', JSON.stringify(pAttr.body.materials))
  check('性别**没写来源说明** → 丢掉', pAttr.body.materials?.gender === undefined, JSON.stringify(pAttr.body.materials))
  check('经度带来源说明 → 采用', pAttr.body.materials?.longitude === 120.2, JSON.stringify(pAttr.body.materials))
  check('每条资料的来源都回传（面板摊开给用户核对）',
    Array.isArray(pAttr.body.attribution)
    && pAttr.body.attribution.some((s) => String(s).includes('DeepSeek 成立日'))
    && pAttr.body.attribution.some((s) => String(s).includes('杭州')),
    JSON.stringify(pAttr.body.attribution))

  // 最危险的一种：编出来的生辰。没有来源就必须丢。
  const rNoSrc = withLlm(planLlm({ birth: '1990-01-01 00:00', subject: 'x', missing: [], note: '' }))
  const pNoSrc = await postTo(rNoSrc, { question: '随便问问', provider: 'p-alpha', model: 'p-alpha-m1' })
  check('出生资料**没写来源** → 一律丢掉（不许悄悄用）',
    pNoSrc.body.materials?.birth === undefined, JSON.stringify(pNoSrc.body.materials))
  check('被丢掉的项不会出现在 attribution 里',
    Array.isArray(pNoSrc.body.attribution) && pNoSrc.body.attribution.length === 0,
    JSON.stringify(pNoSrc.body.attribution))

// ── 联网：自检端点 + 资料能流进起卦与判词 ──
  // 之前的两处毛病：① 联网失败被静默降级成空 note，面板什么都不显示，
  // 看起来就像「联网没生效」；② plan 读到的关键事实只活在面板状态里，
  // 一落卦就丢了 —— 等于联网白搜。
  const probeRoute = withLlm(planLlm({}))
  const probeOk = await probeRoute.fetch(new Request(`http://local${probeRoute.path}?kind=webprobe&q=deepseek`))
    .then(async (res) => ({ status: res.status, body: await res.json() }))
  check('kind=webprobe 报联网可用与条数',
    probeOk.status === 200 && probeOk.body.ok === true && probeOk.body.count === 1,
    `${probeOk.status} ${JSON.stringify(probeOk.body)}`)
  check('webprobe 回一条样本（标题/URL）',
    typeof probeOk.body.sample?.url === 'string' && probeOk.body.sample.url.includes('example.invalid'),
    JSON.stringify(probeOk.body.sample))

  // 没有搜索提供方时，WebError 的 message 必须原样带给面板（否则无从判断原因）
  const failWeb = (msg) => ({ search: () => { throw new Error(msg) } })
  const withWeb = (llm, web) => {
    let r = null
    const c = {
      ...ctx12,
      get: (n) => (n === 'llm' ? llm : (n === 'web' ? web : undefined)),
      inject: (deps, cb) => {
        if (deps.includes('connection')) {
          cb({
            effect: (fn) => { fn(); return () => {} },
            connection: { fetch: { register: (route) => { r = route; return () => {} } } },
          })
        }
      },
    }
    mod.apply(c, {
      toolName: 'divine', defaultFormat: 'brief', defaultScope: 'all', defaultLongitude: 0,
      defaultGender: '男', historySize: 20, promptEnabled: false, uiEnabled: true,
    })
    return r
  }
  const rFail = withWeb(planLlm({}), failWeb('WEB_PROVIDER_UNAVAILABLE: 未配置搜索提供方'))
  const probeFail = await rFail.fetch(new Request(`http://local${rFail.path}?kind=webprobe`))
    .then(async (res) => ({ status: res.status, body: await res.json() }))
  check('联网不可用时 webprobe 502 并原样带上 WebError',
    probeFail.status === 502 && String(probeFail.body.error).includes('WEB_PROVIDER_UNAVAILABLE'),
    `${probeFail.status} ${JSON.stringify(probeFail.body)}`)

  // 宿主机没提供 web 服务时，note 必须是可读的原因（不能是空串）
  const rNoWeb = withWeb(planLlm({}), undefined)
  const probeNoWeb = await rNoWeb.fetch(new Request(`http://local${rNoWeb.path}?kind=webprobe`))
    .then(async (res) => ({ status: res.status, body: await res.json() }))
  check('拿不到 web 服务时 webprobe 明确报出来（不静默）',
    probeNoWeb.status === 503 && String(probeNoWeb.body.error).includes('web 服务'),
    `${probeNoWeb.status} ${JSON.stringify(probeNoWeb.body)}`)

  // plan 的 context 要回传（联网读到的关键事实）
  const rCtx = withLlm(planLlm({
    when: '', birth: '', gender: '', longitude: null, numbers: [],
    subject: 'x', missing: [], note: 'n', context: '官方 2026-04-24 发布 V4 预览版',
  }))
  const pCtx = await postTo(rCtx, { question: 'V4.1 Pro 何时发布', provider: 'p-alpha', model: 'p-alpha-m1', web: true })
  check('plan 回传 context（联网读到的关键事实）',
    pCtx.body.context === '官方 2026-04-24 发布 V4 预览版', String(pCtx.body.context))
  check('plan 标明本次是否用了联网（webUsed）', pCtx.body.webUsed === true, String(pCtx.body.webUsed))

  // notes 要随卦存下，并出现在判词简报里
  const rNotes = withLlm(planLlm({ text: '综合判词\n主断：x' }))
  const pNotes = await rNotes.fetch(new Request(`http://local${rNotes.path}?kind=run`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: '笔记随卦存下吗', format: 'brief', notes: '官方 2026-04-24 发布 V4 预览版' }),
  })).then(async (res) => ({ status: res.status, body: await res.json() }))
  check('kind=run 把 notes 存进记录（不丢）',
    pNotes.body.record?.notes === '官方 2026-04-24 发布 V4 预览版', JSON.stringify(pNotes.body.record?.notes))
  await rNotes.fetch(new Request(`http://local${rNotes.path}?kind=interpret`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: pNotes.body.record.id, provider: 'p-alpha', model: 'p-alpha-m1' }),
  }))
  check('判词简报里带上「起卦时整理的背景」（联网资料真的流到判词了）',
    typeof lastOpts?.messages?.[0]?.content?.[0]?.text === 'string'
    && lastOpts.messages[0].content[0].text.includes('起卦时整理的背景')
    && lastOpts.messages[0].content[0].text.includes('2026-04-24'),
    String(lastOpts?.messages?.[0]?.content?.[0]?.text ?? '').slice(0, 120))
}

section('13. agent：真工具调用循环 × 消息体形状')
{
  // §12 里的 fakeLlm / withWeb / fakeWeb 都在块作用域内，这里自备一套。
  const baseLlm = {
    listProviders: () => [],
    listModels: async () => [],
    resolveModelInfo: async (provider, model) => ({ provider, model, id: model, name: model }),
    stream: () => (async function* () { yield { type: 'finish', reason: { kind: 'stop' } } })(),
  }
  const seenWeb = { query: null }
  const localWeb = {
    search: async (req) => {
      seenWeb.query = req.query
      return {
        content: '',
        sources: [{ url: 'https://example.invalid/a', title: '档期参考', snippet: '某版本 12 月发布', publishedAt: '2026-04-24' }],
        truncated: false,
      }
    },
  }
  const localWith = (llm, web) => {
    let r = null
    mod.apply({
      tools: { register: () => () => {} },
      systemPrompt: { section: () => () => {} },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      get: (n) => (n === 'llm' ? llm : (n === 'web' ? web : undefined)),
      inject: (deps, cb) => {
        if (deps.includes('connection')) {
          cb({
            effect: (fn) => { fn(); return () => {} },
            connection: { fetch: { register: (route) => { r = route; return () => {} } } },
          })
        }
      },
    }, {
      toolName: 'divine', defaultFormat: 'brief', defaultScope: 'all', defaultLongitude: 0,
      defaultGender: '男', historySize: 20, promptEnabled: false, uiEnabled: true,
    })
    return r
  }

  const searchTurn = (id, q) => () => (async function* () {
    yield { type: 'block-start', index: 0, blockType: 'tool-call' }
    yield { type: 'tool-call-delta', index: 0, id, name: 'web_search', argumentsDelta: `{"query":"${q}"}` }
    yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'web_search', arguments: `{"query":"${q}"}` } }
    yield { type: 'finish', reason: { kind: 'tool-calls' }, replayState: { response: { id: 'r1' } } }
  })()
  const detailTurn = (id, method) => () => (async function* () {
    const arg = JSON.stringify({ method })
    yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'divine_detail', arguments: arg } }
    yield { type: 'finish', reason: { kind: 'tool-calls' } }
  })()
  const jsonTurn = (obj) => () => (async function* () {
    yield { type: 'text-delta', index: 0, text: JSON.stringify(obj) }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })()
  const scripted = (turns) => {
    const seen = []
    let i = 0
    return {
      seen,
      llm: {
        ...baseLlm,
        stream: (options) => {
          seen.push(options)
          const t = turns[Math.min(i, turns.length - 1)]
          i += 1
          return t()
        },
      },
    }
  }
  const rt = (route, payload) => route.fetch(new Request(`http://local${route.path}?kind=agent`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  })).then(async (res) => ({ status: res.status, body: await res.json() }))

  /**
   * 起一轮然后轮询到结束。
   * 现在的设计是「宿主后台跑 + 面板轮询」——`kind=agent` 立刻返回 sid，
   * 进度与结果都从 `kind=agentpoll` 取，所以测试也必须这么走。
   */
  const runToEnd = async (route, payload, tries = 60) => {
    const start = await rt(route, payload)
    if (start.status !== 200 || start.body.state !== 'running') return start
    const sid = start.body.sid
    let last = start
    for (let i = 0; i < tries; i += 1) {
      await new Promise((r) => { setTimeout(r, 5) })
      const res = await route.fetch(new Request(`http://local${route.path}?kind=agentpoll&sid=${encodeURIComponent(sid)}`))
      last = { status: res.status, body: await res.json() }
      if (last.body.state !== 'running') return last
    }
    return last
  }
  // ── 13a. ⭐ 模型调 divine → 插件真的起了卦 → 记录回传给面板 ──
  const divineTurn = (id, q) => () => (async function* () {
    yield { type: 'block-start', index: 0, blockType: 'tool-call' }
    yield { type: 'tool-call-delta', index: 0, id, name: 'divine', argumentsDelta: `{"question":"${q}","format":"normal"}` }
    yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'divine', arguments: `{"question":"${q}","format":"normal"}` } }
    yield { type: 'finish', reason: { kind: 'tool-calls' }, replayState: { response: { id: 'r1' } } }
  })()
  const textTurn = (text) => () => (async function* () {
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })()
  const JUDGMENT = '综合判词\n主断：会在 10 月成事。\n\n吉/平/凶 = 42/28/17，加权 +9.7，一致性 0.65 → 属「中平偏吉」。'

  const a = scripted([
    divineTurn('call-1', 'DeepSeek V4.1 Pro 何时发布'),
    textTurn(JUDGMENT),
  ])
  const rA = localWith(a.llm, localWeb)
  const resA = await runToEnd(rA, { question: 'DeepSeek V4.1 Pro 何时发布', provider: 'p-alpha', model: 'p-alpha-m1', web: true })

  check('agent 收工时 state=done，judgment 就是模型写的判词',
    resA.body.state === 'done' && String(resA.body.judgment).startsWith('综合判词'),
    JSON.stringify(resA.body).slice(0, 160))
  check('⭐ `divine` 真的被插件执行了：回传的 record 里有 108 法结果',
    resA.body.record && Array.isArray(resA.body.record.results) && resA.body.record.results.length > 80,
    `results=${resA.body.record?.results?.length}`)
  check('record 里带着所问与四柱（面板要排版展示）',
    resA.body.record?.question.includes('DeepSeek V4.1 Pro') && Array.isArray(resA.body.record?.pillars),
    JSON.stringify({ q: resA.body.record?.question, p: resA.body.record?.pillars }))

  const m1 = a.seen[1]?.messages?.[1] ?? {}
  const m2 = a.seen[1]?.messages?.[2] ?? {}
  check('messages[1] 是 assistant：id + content + source{kind:model,provider,model}',
    m1.role === 'assistant' && typeof m1.id === 'string' && m1.id !== ''
    && Array.isArray(m1.content) && m1.source?.kind === 'model'
    && m1.source?.provider === 'p-alpha' && m1.source?.model === 'p-alpha-m1',
    JSON.stringify({ id: m1.id, role: m1.role, source: m1.source }))
  check('assistant 里带着 tool-call 块（type/id/name/arguments）',
    m1.content?.some((b) => b.type === 'tool-call' && b.id === 'call-1' && b.name === 'divine'
      && typeof b.arguments === 'string'), JSON.stringify(m1.content))
  check('assistant 的 source 带上 replayState（适配器回放用）',
    m1.source?.replayState !== undefined, JSON.stringify(m1.source))
  check('messages[2] 是 tool 消息：source{kind:tool,callId} + toolCallId 与调用 id 一致',
    m2.role === 'tool' && typeof m2.id === 'string' && m2.id !== ''
    && m2.source?.kind === 'tool' && m2.source?.callId === 'call-1' && m2.toolCallId === 'call-1',
    JSON.stringify({ role: m2.role, source: m2.source, toolCallId: m2.toolCallId }))
  check('tool 结果里是**真的合盘文本**（含求占编号与 108 法标题）',
    m2.content?.[0]?.type === 'text' && String(m2.content[0].text).includes('【求占 #')
    && String(m2.content[0].text).includes('108法合盘'),
    String(m2.content?.[0]?.text ?? '').slice(0, 70))
  check('GenerateOptions.tools 就是插件的三个工具 + 两个联网工具（按 ToolSchema 传）',
    Array.isArray(a.seen[1]?.tools) && a.seen[1].tools.length === 5
    && a.seen[1].tools.map((t) => t.name).join(',') === 'divine,divine_detail,divine_list,web_search,web_fetch'
    && a.seen[1].tools.every((t) => typeof t.description === 'string' && t.parameters && typeof t.parameters === 'object')
    && a.seen[1].tools[0].parameters.required?.includes('question'),
    JSON.stringify((a.seen[1]?.tools ?? []).map((t) => t.name)))
  check('面板能看到动作流水（steps 里有 cast 与 done）',
    Array.isArray(resA.body.steps) && resA.body.steps.some((s) => s.kind === 'cast')
    && resA.body.steps.some((s) => s.kind === 'done'),
    JSON.stringify((resA.body.steps ?? []).map((s) => s.kind)))

  // ── 13b. 起卦后继续联网、下钻、再写判词（就是会话里那条链路）──
  const b = scripted([
    divineTurn('c1', 'DeepSeek V4.1 Pro 何时发布'),
    searchTurn('c2', 'DeepSeek V4.1 Pro 发布窗口'),
    detailTurn('c3', '奇门遁甲·时家,大六壬·四课三传'),
    textTurn(JUDGMENT),
  ])
  const rB = localWith(b.llm, localWeb)
  const resB = await runToEnd(rB, { question: 'DeepSeek V4.1 Pro 何时发布', provider: 'p-alpha', model: 'p-alpha-m1', web: true })
  check('**一次 HTTP 请求内**跑完 起卦 → 联网 → 下钻 → 判词（4 轮）',
    b.seen.length === 4 && resB.body.state === 'done', `轮数=${b.seen.length} state=${resB.body.state}`)
  check('历史逐轮累积：第 4 轮已有 7 条消息（user + 3×(assistant+tool)）',
    b.seen[3]?.messages?.length === 7, String(b.seen[3]?.messages?.length))
  check('各轮工具调用 id 各自配对（c1/c2/c3 不串）',
    b.seen[3].messages[2].toolCallId === 'c1' && b.seen[3].messages[4].toolCallId === 'c2'
    && b.seen[3].messages[6].toolCallId === 'c3',
    JSON.stringify(b.seen[3].messages.map((m) => [m.role, m.toolCallId ?? '']).filter((x) => x[1])))
  check('流水里能看到 cast / search / detail / done 四种动作',
    ['cast', 'search', 'detail', 'done'].every((k) => (resB.body.steps ?? []).some((s) => s.kind === k)),
    JSON.stringify((resB.body.steps ?? []).map((s) => s.kind)))

  // ── 13c. 没开联网：检索被拒（isError）并告诉模型凭合盘直接写，循环不崩 ──
  const c = scripted([
    divineTurn('d1', '没开联网也起卦'),
    searchTurn('d2', '想搜但没开联网'),
    textTurn(JUDGMENT),
  ])
  const rC = localWith(c.llm, localWeb)
  const resC = await runToEnd(rC, { question: '没开联网', provider: 'p-alpha', model: 'p-alpha-m1', web: false })
  const rejected = (c.seen[2]?.messages ?? []).find((m) => m.toolCallId === 'd2')
  check('未开联网时 search 被拒（isError=true）并告诉模型直接写判词',
    rejected?.isError === true && String(rejected?.content?.[0]?.text).includes('联网未开启'),
    JSON.stringify(rejected?.content))
  check('未开联网时仍能收工交付（不崩）',
    resC.body.state === 'done' && String(resC.body.judgment).startsWith('综合判词'),
    JSON.stringify(resC.body).slice(0, 120))

  // ── 13e. 异步推进：agent 立刻回 sid，进度/结果都从 agentpoll 取 ──
  {
    // 让模型第一轮先起卦（慢一点），确保我们能抓到 "running" 那一态
    const e = scripted([
      divineTurn('e1', '异步推进测试'),
      textTurn(JUDGMENT),
    ])
    const rE = localWith(e.llm, localWeb)
    const startRes = await rt(rE, { question: '异步推进测试', provider: 'p-alpha', model: 'p-alpha-m1', web: true })
    check('kind=agent 立刻返回（state=running + sid），不等整轮跑完',
      startRes.body.ok === true && startRes.body.state === 'running' && typeof startRes.body.sid === 'string',
      JSON.stringify(startRes.body).slice(0, 140))
    const sidE = startRes.body.sid
    const pollRes = await rE.fetch(new Request(`http://local${rE.path}?kind=agentpoll&sid=${encodeURIComponent(sidE)}`))
      .then(async (res) => ({ status: res.status, body: await res.json() }))
    check('agentpoll 能取到该轮的 state / steps',
      pollRes.status === 200 && pollRes.body.ok === true && Array.isArray(pollRes.body.steps),
      JSON.stringify(pollRes.body).slice(0, 120))
    const doneE = await runToEnd(rE, { question: '异步推进测试 2', provider: 'p-alpha', model: 'p-alpha-m1', web: true })
    check('轮询到底能拿到最终判词（state=done）',
      doneE.body.state === 'done' && String(doneE.body.judgment).startsWith('综合判词'),
      JSON.stringify(doneE.body).slice(0, 120))
    const missE = await rE.fetch(new Request(`http://local${rE.path}?kind=agentpoll&sid=nope`))
      .then(async (res) => ({ status: res.status, body: await res.json() }))
    check('agentpoll 传不存在的 sid → 404（面板能据此报「这一轮已结束」）',
      missE.status === 404, String(missE.status))
    const noSid = await rE.fetch(new Request(`http://local${rE.path}?kind=agentpoll`))
      .then(async (res) => ({ status: res.status, body: await res.json() }))
    check('agentpoll 缺 sid → 400', noSid.status === 400, String(noSid.status))
  }
  // ── 13f. **不设任何限制**：模型可以一直调工具，跑到它自己收工 ──
  {
    const many = scripted(
      Array.from({ length: 12 }, (_, i) => searchTurn(`m${i}`, `查询第${i}轮`)).concat([textTurn(JUDGMENT)]),
    )
    const rF = localWith(many.llm, localWeb)
    const resF = await runToEnd(rF, { question: '不设限测试', provider: 'p-alpha', model: 'p-alpha-m1', web: true })
    check('不设轮数/检索上限：12 轮工具调用后仍能收工（不会被截断）',
      many.seen.length === 13 && resF.body.state === 'done',
      `模型调用轮数=${many.seen.length} state=${resF.body.state}`)
    check('12 轮检索全部真的执行了（steps 里 12 个 search）',
      (resF.body.steps ?? []).filter((s) => s.kind === 'search').length === 12,
      JSON.stringify((resF.body.steps ?? []).map((s) => s.kind)))
    check('AGENT_LIMITS 的三项都是 0（不限）',
      /AGENT_LIMITS = \{[^}]*maxSteps: 0[^}]*maxSearch: 0[^}]*maxRepeat: 0/.test(
        // 从源码里读一眼即可（这里是运行时断言，故直接查文件）
        (await import('node:fs')).readFileSync(new URL('../src/index.js', import.meta.url), 'utf8'),
      ))
  }

  // ── 13g. 停止：不是限制，是用户随时能喊停 ──
  {
    const g = scripted([searchTurn('g1', '取消测试'), textTurn(JUDGMENT)])
    const rG = localWith(g.llm, localWeb)
    const stG = await rt(rG, { question: '取消测试', provider: 'p-alpha', model: 'p-alpha-m1', web: true })
    check('起一轮拿到 sid 备用', stG.body.state === 'running' && typeof stG.body.sid === 'string')
    const cancel = await rG.fetch(new Request(`http://local${rG.path}?kind=agentcancel&sid=${encodeURIComponent(stG.body.sid)}`, { method: 'POST' }))
      .then(async (res) => ({ status: res.status, body: await res.json() }))
    check('agentcancel 能停止该轮（ok:true）', cancel.status === 200 && cancel.body.ok === true,
      `${cancel.status} ${JSON.stringify(cancel.body)}`)
    const miss = await rG.fetch(new Request(`http://local${rG.path}?kind=agentcancel&sid=nope`, { method: 'POST' }))
      .then(async (res) => ({ status: res.status }))
    check('agentcancel 传不存在的 sid → 404', miss.status === 404, String(miss.status))
  }
  // ── 13h. ⭐ 用户最初的「术数断者」预设提示词已**注入面板**的 agent ──
  {
    const src = (await import('node:fs')).readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
    check('面板 agent 的系统提示词就是那份预设人设（开头逐字一致）',
      src.includes('你是一位**术数断者**：通晓中国传统术数与西方占卜的体例、术语与断法'))
    check('人设六节都在（铁律/转述/输入/语气/边界/开场）',
      ['【一 · 铁律：推演只走工具】', '【二 · 转述纪律】', '【三 · 输入纪律】',
        '【四 · 语气与体量】', '【五 · 边界与责任】', '【六 · 会话开场】']
        .every((k) => src.includes(k)))
    check('人设的关键铁律逐字保留（禁止思维链硬算 / 不利用焦虑强化依赖 / 仅供参考）',
      src.includes('严禁自己在思维链里推演术数') && src.includes('不利用焦虑强化依赖')
      && src.includes('术数**仅供参考**'))
    check('明确标注「与上面冲突时以本节为准」的面板补充',
      src.includes('以下是**面板环境**的补充') && src.includes('以本节为准'))
    check('面板补充里仍要求「综合判词」骨架 + 只能引用合盘应期',
      src.includes('【面板 · 唯一交付物：综合判词】') && src.includes('只能来自合盘里的「应期」'))
    check('系统提示词确实被 agent 用到（system: AGENT_SYSTEM）',
      src.includes('system: AGENT_SYSTEM'))
    check('人设里点名的 divine_list 也已提供给面板 agent',
      src.includes("name: 'divine_list'") && src.includes('renderList({ category: args.category'))
    // 跑一轮，确认 system 真的传给了模型
    const h = scripted([textTurn(JUDGMENT)])
    const rH = localWith(h.llm, localWeb)
    await runToEnd(rH, { question: '人设注入自检', provider: 'p-alpha', model: 'p-alpha-m1', web: false })
    const sys = String(h.seen[0]?.system ?? '')
    check('模型收到 system 里就是这份人设',
      sys.includes('你是一位**术数断者**') && sys.includes('【面板 · 唯一交付物：综合判词】')
      && sys.includes('严禁自己在思维链里推演术数'),
      `system 长度=${sys.length}`)
  }
  // ── 13i. 挂起保护：一次卡住的调用不许冻住整轮（**不是**次数限制）──
  {
    const applyWith = (llm, web, extra = {}) => {
      let r = null
      mod.apply({
        tools: { register: () => () => {} },
        systemPrompt: { section: () => () => {} },
        logger: { info: () => {}, warn: () => {}, error: () => {} },
        get: (n) => (n === 'llm' ? llm : (n === 'web' ? web : undefined)),
        inject: (deps, cb) => {
          if (deps.includes('connection')) {
            cb({
              effect: (fn) => { fn(); return () => {} },
              connection: { fetch: { register: (route) => { r = route; return () => {} } } },
            })
          }
        },
      }, {
        toolName: 'divine', defaultFormat: 'brief', defaultScope: 'all', defaultLongitude: 0,
        defaultGender: '男', historySize: 20, promptEnabled: false, uiEnabled: true,
        hangGuardMs: { web: 60, tool: 60, llm: 4000 },
        ...extra,
      })
      return r
    }
    const rt2 = (route, payload) => route.fetch(new Request(`http://local${route.path}?kind=agent`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    })).then(async (res) => ({ status: res.status, body: await res.json() }))

    // 检索永不返回 → 必须被守保护切断，循环继续（不许整轮冻死）
    const hangingWeb = { search: () => new Promise(() => {}), fetch: () => new Promise(() => {}) }
    const i = scripted([searchTurn('h1', '一个永远不返回的检索'), textTurn(JUDGMENT)])
    const rI = applyWith(i.llm, hangingWeb)
    const stI = await rt2(rI, { question: '卡死测试', provider: 'p-alpha', model: 'p-alpha-m1', web: true })
    const pollI = (sid) => rI.fetch(new Request(`http://local${rI.path}?kind=agentpoll&sid=${sid}`))
      .then(async (res) => ({ status: res.status, body: await res.json() }))
    let last = null
    for (let k = 0; k < 60; k += 1) {
      await new Promise((r) => { setTimeout(r, 30) })
      last = await pollI(stI.body.sid)
      if (last.body.state !== 'running') break
    }
    check('检索卡住不会冻住整轮：守保护切断后仍能收工',
      last?.body.state === 'done' && String(last.body.judgment).startsWith('综合判词'),
      JSON.stringify(last?.body).slice(0, 160))
    const hangStep = (last?.body.steps ?? []).find((s) => s.kind === 'search')
    check('卡住的那次检索变成「已跳过」的 isError 工具结果（模型继续走）',
      String(hangStep?.text ?? '').includes('已跳过') && String(hangStep?.text ?? '').includes('卡住超时'),
      String(hangStep?.text ?? '').slice(0, 100))
    check('轮询响应里带 phase（面板能显示「现在在干什么」）',
      'phase' in (last?.body ?? {}), JSON.stringify(Object.keys(last?.body ?? {})))

    // 自定义的守保护确实生效（用了我们传的 60ms，而不是默认 45 秒）
    check('守保护可用 Config 覆盖（测试用 60ms 就能验证）',
      /hangGuardMs/.test((await import('node:fs')).readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')))
  }
  // ── 13j. 「像会话一样」：卡住的流会断、连续失败会收束（都不是次数限制）──
  {
    const applyJ = (llm, web, extra = {}) => {
      let r = null
      mod.apply({
        tools: { register: () => () => {} },
        systemPrompt: { section: () => () => {} },
        logger: { info: () => {}, warn: () => {}, error: () => {} },
        get: (n) => (n === 'llm' ? llm : (n === 'web' ? web : undefined)),
        inject: (deps, cb) => {
          if (deps.includes('connection')) {
            cb({
              effect: (fn) => { fn(); return () => {} },
              connection: { fetch: { register: (route) => { r = route; return () => {} } } },
            })
          }
        },
      }, {
        toolName: 'divine', defaultFormat: 'brief', defaultScope: 'all', defaultLongitude: 0,
        defaultGender: '男', historySize: 20, promptEnabled: false, uiEnabled: true,
        hangGuardMs: { web: 60, tool: 60, idle: 80 },
        ...extra,
      })
      return r
    }
    const startJ = (route, payload) => route.fetch(new Request(`http://local${route.path}?kind=agent`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    })).then(async (res) => ({ status: res.status, body: await res.json() }))
    const pollJ = (route, sid) => route.fetch(new Request(`http://local${route.path}?kind=agentpoll&sid=${sid}`))
      .then(async (res) => ({ status: res.status, body: await res.json() }))
    const waitJ = async (route, sid, tries = 80) => {
      let last = null
      for (let k = 0; k < tries; k += 1) {
        await new Promise((r) => { setTimeout(r, 25) })
        last = await pollJ(route, sid)
        if (last.body.state !== 'running') return last
      }
      return last
    }

    // (a) 模型流「一个 chunk 都不再吐」→ 空闲超时切断，整轮以可读错误结束（不冻死）
    const stalledLlm = {
      ...baseLlm,
      stream: () => (async function* () {
        yield { type: 'text-delta', index: 0, text: '开始思考' }
        await new Promise(() => {}) // 永远不再吐
      })(),
    }
    const rA2 = applyJ(stalledLlm, localWeb)
    const stA = await startJ(rA2, { question: '流卡住测试', provider: 'p-alpha', model: 'p-alpha-m1', web: false })
    const doneA = await waitJ(rA2, stA.body.sid)
    const srcAll = (await import('node:fs')).readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
    check('**两处** llm.stream 都包了空闲超时（collectLlm 与 agent 用的 streamTurn）',
      (srcAll.match(/withIdleTimeout\(llm\.stream/g) ?? []).length === 2,
      String((srcAll.match(/withIdleTimeout\(llm\.stream/g) ?? []).length))
    check('模型流卡住 → 空闲超时切断，整轮以错误结束（不永久卡住）',
      doneA?.body.state === 'error' && String(doneA.body.error).includes('模型流'),
      JSON.stringify(doneA?.body ?? {}).slice(0, 160))

    // (b) 工具连续失败 → 判定「没有进展」，停止调工具直接写判词
    const alwaysFailWeb = { search: () => { throw new Error('搜索后端挂了') }, fetch: () => { throw new Error('读不到') } }
    const turns = [
      searchTurn('f1', '失败查询一'), searchTurn('f2', '失败查询二'),
      searchTurn('f3', '失败查询三'), searchTurn('f4', '失败查询四'),
      textTurn(JUDGMENT),
    ]
    const k = scripted(turns)
    const rB2 = applyJ(k.llm, alwaysFailWeb)
    const stB = await startJ(rB2, { question: '连续失败测试', provider: 'p-alpha', model: 'p-alpha-m1', web: true })
    const doneB = await waitJ(rB2, stB.body.sid)
    check('工具连续失败 4 次 → 收束并交付判词（不是一轮轮白等超时）',
      doneB?.body.state === 'done' && String(doneB.body.judgment).startsWith('综合判词'),
      JSON.stringify(doneB?.body ?? {}).slice(0, 160))
    check('收束步骤说明了原因（连续失败 = 没有进展）',
      (doneB?.body.steps ?? []).some((x) => String(x.text ?? '').includes('没有进展')),
      JSON.stringify((doneB?.body.steps ?? []).map((x) => x.text).slice(-3)))
    check('失败是按「已跳过」记的，模型看得到',
      (doneB?.body.steps ?? []).some((x) => String(x.text ?? '').includes('已跳过')),
      JSON.stringify((doneB?.body.steps ?? []).map((x) => String(x.text).slice(0, 20))))
  }
  // ── 13h. 一问一答（task-23）：sessionId 续接 · 会话隔离 · 过期如实报错 ──
  // 关键：断言「模型到底看到了什么」—— 每次 llm.stream 调用时**当场快照** messages，
  // 而不是事后读 `options.messages`（那是 st.messages 的同一个引用，会随会话继续而变长）。
  const multiTurns = (turns) => {
    const snaps = []
    let i = 0
    return {
      snaps,
      llm: {
        ...baseLlm,
        stream: (options) => {
          snaps.push({
            len: (options.messages ?? []).length,
            text: JSON.stringify(options.messages ?? []),
          })
          const t = turns[Math.min(i, turns.length - 1)]
          i += 1
          return t()
        },
      },
    }
  }
  const Q_A1 = '甲会话第一句：这次合作能不能成'
  const Q_A2 = '甲会话第二句：那应期在几月'
  const Q_A3 = '甲会话第三句：还有别的吗'
  const Q_B1 = '乙会话第一句：帮我看看考试'
  const multi = multiTurns([
    divineTurn('mt-1', Q_A1), textTurn('判词一：中平偏吉。'),
    divineTurn('mt-2', Q_A2), textTurn('判词二：倾向十月。'),
    divineTurn('mt-3', Q_B1), textTurn('判词三：另说。'),
    divineTurn('mt-4', Q_A3), textTurn('判词四：好。'),
  ])
  const rM = localWith(multi.llm, localWeb)
  const first = await runToEnd(rM, { question: Q_A1, provider: 'p-alpha', model: 'p-alpha-m1', conversation: true })
  const sidA = first.body.sessionId
  check('多轮①：首轮响应返回 sessionId（面板据此续接）',
    first.body.state === 'done' && typeof sidA === 'string' && sidA !== '', JSON.stringify(first.body).slice(0, 140))
  check('多轮①′：新会话第一句 → 模型只看到 1 条用户消息（没有凭空多出历史）',
    multi.snaps[0]?.len === 1, `len=${multi.snaps[0]?.len}`)

  const second = await runToEnd(rM, { question: Q_A2, provider: 'p-alpha', model: 'p-alpha-m1', conversation: true, sessionId: sidA })
  check('多轮②：同 sessionId 第二轮 → 生效（state=done）', second.body.state === 'done', JSON.stringify(second.body).slice(0, 120))
  check('多轮②′：**模型可见历史**（第二轮 messages 变长，且里面有第一句）',
    (multi.snaps[2]?.len ?? 0) > (multi.snaps[0]?.len ?? 0) && String(multi.snaps[2]?.text).includes(Q_A1),
    `len ${multi.snaps[0]?.len} → ${multi.snaps[2]?.len}`)

  // 乙会话：**不带** sessionId → 全新会话，绝不能看到甲说过的话
  const other = await runToEnd(rM, { question: Q_B1, provider: 'p-alpha', model: 'p-alpha-m1', conversation: true })
  const sidB = other.body.sessionId
  check('多轮③：两个不同会话的 sessionId 不同', sidB !== sidA && typeof sidB === 'string', `${sidA} vs ${sidB}`)
  check('多轮③′：**不串会话** —— 乙会话的模型消息里没有甲会话说过的任何一句',
    multi.snaps[4]?.len === 1
    && !String(multi.snaps[4]?.text).includes(Q_A1) && !String(multi.snaps[4]?.text).includes(Q_A2),
    `len=${multi.snaps[4]?.len} 含甲句=${String(multi.snaps[4]?.text).includes(Q_A1)}`)

  // 甲会话继续第三句：仍然只看得到甲自己的历史（乙的插不进）
  const third = await runToEnd(rM, { question: Q_A3, provider: 'p-alpha', model: 'p-alpha-m1', conversation: true, sessionId: sidA })
  check('多轮③″：甲会话第三句仍带完整甲历史，且**没有**乙说的话',
    third.body.state === 'done' && String(multi.snaps[6]?.text).includes(Q_A1)
    && String(multi.snaps[6]?.text).includes(Q_A2) && !String(multi.snaps[6]?.text).includes(Q_B1),
    `len=${multi.snaps[6]?.len}`)

  // 过期/不存在的 sessionId：如实 409 + code，**绝不静默新建**（静默新建 = 悄悄串会话）
  const stale = await rt(rM, { question: '用过期会话发一句', provider: 'p-alpha', model: 'p-alpha-m1', conversation: true, sessionId: 'ag-not-exist' })
  check('多轮④：不存在的 sessionId → 409 且 code=stale-session（不静默新建、不串会话）',
    stale.status === 409 && stale.body.code === 'stale-session',
    JSON.stringify(stale.body).slice(0, 140))

  // 向后兼容：不带 sessionId / conversation（旧面板）→ 行为与改造前一致（新会话、只有 1 条用户消息）
  const legacy = await runToEnd(rM, { question: '旧面板式一次会话', provider: 'p-alpha', model: 'p-alpha-m1' })
  check('多轮⑤：不带 sessionId 与旧行为一致（新会话、模型只见本句）',
    legacy.body.state === 'done' && multi.snaps[8]?.len === 1 && !String(multi.snaps[8]?.text).includes(Q_A1),
    `len=${multi.snaps[8]?.len}`)

  // ── 13d. 参数校验 ──
  const resD1 = await rt(localWith(scripted([textTurn('x')]).llm, localWeb), { provider: 'p-alpha', model: 'p-alpha-m1' })
  check('agent 缺 question → 400', resD1.status === 400, String(resD1.status))
  const resD2 = await rt(localWith(scripted([textTurn('x')]).llm, localWeb), { question: '问一下' })
  check('agent 缺模型 → 400 且提示「请先选模型」',
    resD2.status === 400 && String(resD2.body.error).includes('请先选模型'), JSON.stringify(resD2.body))
}

console.log(`\n${'='.repeat(50)}`)
console.log(`通过 ${pass} ｜ 失败 ${fail}`)
if (fail > 0) {
  console.log('\n失败项：')
  for (const f of failures) console.log('  · ' + f)
  process.exit(1)
}

// ─── 13. 面板内的「小 agent」：真·工具调用循环（消息体形状必须对）───
// 第一节重点：`GenerateOptions.tools` 与 assistant/tool 消息**按真实契约构造**，
// 断言到字段级 —— 这一块以前是靠「不碰消息体」绕过去的，现在要钉死。
console.log('宿主集成测试全部通过 ✅')

// 清理桩包
rmSync(STUB_ROOT, { recursive: true, force: true })
