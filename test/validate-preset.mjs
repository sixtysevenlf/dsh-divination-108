/**
 * 预设与装配校验器（新架构版）。
 *
 * 跑法： node test/validate-preset.mjs
 *
 * ## 架构（本机实测结论）
 * legacy 目录 `~/.dsh/.agent-presets/` **已不再被任何代码读取**：在 app.asar 全文里
 * `agent.cordis.yml` 只出现 1 次，且就在文档文本中。所以「只有进入预设才启用插件」
 * 的正确实现是：**由 bundle patch 声明一条 `preset-divination`**
 * （`@deepseek-ai/dsh-agent-preset`），108 插件的代码写在那个 preset 的 `plugins`
 * 列表里 —— bundle 层本身**不注册任何宿主级插件行**。
 *
 * 本文件校验这条链的每一环。YAML 解析用 **DSH 自带的 yaml**（从 app.asar 抽出），
 * 因为本机 `profiles/node_modules` 下的 yaml/js-yaml junction 都是失效的
 * （目标 npm 全局 dsh 已被移除）。
 */
import { openSync, readSync, closeSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ASAR = process.env.DSH_ASAR ?? 'D:/DSH DESKTOP/resources/app.asar'
const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN = join(HERE, '..')
const PROFILE_PKG = join(homedir(), '.dsh', 'profiles', 'desktop', 'package.json')
const LEGACY_DIR = join(homedir(), '.dsh', '.agent-presets', 'divination')
const OUT = join(tmpdir(), 'dsh-yaml-probe-vp')

let pass = 0
let fail = 0
const failures = []
function check(name, cond, extra = '') {
  if (cond) { pass += 1; return }
  fail += 1
  failures.push(`${name}${extra ? ' — ' + extra : ''}`)
  console.log(`  x ${name}${extra ? ' — ' + extra : ''}`)
}
function head(t) { console.log(`\n=== ${t} ===`) }

// ─── 0. 用 DSH 自带的 yaml 解析（app.asar 抽出）───
head('0. YAML 解析器')
function readHeader(fd) {
  const h = Buffer.alloc(16); readSync(fd, h, 0, 16, 0)
  const size = h.readUInt32LE(12); const hb = Buffer.alloc(size); readSync(fd, hb, 0, size, 16)
  return { header: JSON.parse(hb.toString('utf8').replace(/\0+$/g, '')), dataStart: 16 + size }
}
function nodeAt(root, parts) { let n = root; for (const p of parts) { n = n?.files?.[p]; if (!n) return null } return n }
function extract(fd, node, ds, dest, d = 0) {
  if (d > 12) return 0
  let c = 0
  for (const [nm, ch] of Object.entries(node.files ?? {})) {
    const t = join(dest, nm)
    if (ch.files) { mkdirSync(t, { recursive: true }); c += extract(fd, ch, ds, t, d + 1) } else {
      mkdirSync(dirname(t), { recursive: true })
      const buf = Buffer.alloc(ch.size); readSync(fd, buf, 0, ch.size, ds + Number(ch.offset)); writeFileSync(t, buf); c += 1
    }
  }
  return c
}
let YAML = null
try {
  mkdirSync(OUT, { recursive: true })
  const fd = openSync(ASAR, 'r')
  try {
    const r = readHeader(fd)
    const dsh = nodeAt(r.header, ['dsh', 'node_modules'])
    extract(fd, dsh.files.yaml, r.dataStart, join(OUT, 'yaml'))
  } finally { closeSync(fd) }
  YAML = await import(pathToFileURL(join(OUT, 'yaml', 'dist', 'index.js')).href)
  console.log('  从 app.asar 抽出 yaml OK')
} catch (err) { console.log('  抽不出 yaml：' + err.message) }
check('YAML 解析器可用', YAML !== null)

const patchFile = join(PLUGIN, 'cordis.patch.yml')
const patchRaw = readFileSync(patchFile, 'utf8')

// ─── 1. bundle patch 结构 ───
head('1. bundle patch（宿主级 uiOnly 面板行 + preset 声明）')
let doc = null
try { doc = YAML.parse(patchRaw.replace(/!!js /g, '')); check('YAML 合法', true) } catch (e) { check('YAML 合法', false, e.message) }
const inserts = doc?.[0]?.insert ?? []
check('顶层是 insert 补丁且含两行', Array.isArray(inserts) && inserts.length === 2, String(inserts.length))
const row = inserts.find((r) => r.id === 'preset-divination') ?? {}
check('插入 preset-divination 声明', row.id === 'preset-divination', String(row.id))
check('用 @deepseek-ai/dsh-agent-preset', row.name === '@deepseek-ai/dsh-agent-preset', String(row.name))
check('config.id = divination', row.config?.id === 'divination', String(row.config?.id))
check('有 name / description / order',
  typeof row.config?.name === 'string' && typeof row.config?.description === 'string' && Number.isFinite(row.config?.order))

// ── 1b. 宿主级 uiOnly「面板行」：客户端 bundle 能否被发现，全看这一行 ──
//
// @deepseek-ai/dsh-client-modules 的宿主半边只扫 **enabled Loader entries（顶层条目）**
// 来组合启动图。预设里的嵌套行扫不到，所以没有这条顶层行 → dsh.client 永不被服务 →
// 右下角 ☯ 永不出现（这就是面板长期不显示的根因）。
const uiRow = inserts.find((r) => r.id === 'dsh-divination-108') ?? {}
check('有顶层插件行 dsh-divination-108（客户端扫描器只认顶层行）', uiRow.id === 'dsh-divination-108', String(uiRow.id))
check('按裸包名挂', uiRow.name === 'dsh-divination-108', String(uiRow.name))
check('顶层行提供工具（不再有 uiOnly：工具归它）', uiRow.config?.uiOnly === undefined, String(uiRow.config?.uiOnly))
check('顶层行 uiEnabled: true（悬浮窗数据端点）', uiRow.config?.uiEnabled === true, String(uiRow.config?.uiEnabled))
check('顶层行 promptEnabled: true（系统提示）', uiRow.config?.promptEnabled === true, String(uiRow.config?.promptEnabled))
// ── 用户已改为「不要传统预设」：preset 行必须停用（loader 跳过 disabled 行）──
check('**preset 行已停用**（disabled: true → 不出现在预设花名册）', row.disabled === true, String(row.disabled))
// 两条行不得同时注册工具：预设行必须没有 uiOnly 标记
check('预设行**没有** uiOnly（工具由预设行提供）', row.config?.uiOnly === undefined, String(row.config?.uiOnly))
check('预设行的 uiEnabled 必须为 false（端点归面板行）', row.config?.plugins?.find((p) => p.id === 'dsh-divination-108')?.config?.uiEnabled === false)

// ─── 2. preset 的 plugins 列表 ───
head('2. preset 的 plugins 列表')
const plugins = row.config?.plugins ?? []
check('plugins 非空数组', Array.isArray(plugins) && plugins.length > 0, String(plugins.length))
const mine = plugins.find((p) => p.id === 'dsh-divination-108')
check('plugins 里有 dsh-divination-108 行', !!mine, plugins.map((p) => p.id).join(','))
check('该行 id 与模块导出 name 一致（dsh-divination-108）', mine?.id === 'dsh-divination-108', String(mine?.id))
// 插件行必须用**裸包名**。实测（set_bundle 热重载后查 list_plugins）：
//   name: dsh-divination-108                              → 注册成功、fiberPhase: active
//   name: D:/DSH/plugins/dsh-divination-108/src/index.js  → 该行注册不上、花名册里根本没有
check('该行 name 是裸包名 dsh-divination-108（实测唯一能注册成功的形式）',
  mine?.name === 'dsh-divination-108', String(mine?.name))
check('uiEnabled=false（面板端点归顶层 uiOnly 行，避免重复注册）', mine?.config?.uiEnabled === false, String(mine?.config?.uiEnabled))
check('预设行不设 uiOnly（它要提供工具）', mine?.config?.uiOnly === undefined, String(mine?.config?.uiOnly))
check('有 toolName / defaultFormat', typeof mine?.config?.toolName === 'string' && typeof mine?.config?.defaultFormat === 'string')
check('含 persona 行', plugins.some((p) => p.name === '@deepseek-ai/dsh-persona'))
check('含 skill-filesystem 行', plugins.some((p) => p.name === '@deepseek-ai/dsh-skill-filesystem'))
check('含 tool-skill 行', plugins.some((p) => p.name === '@deepseek-ai/dsh-tool-skill'))
const ids = plugins.map((p) => p.id)
check('plugins 内 id 无重复', ids.every((v, i) => ids.indexOf(v) === i), ids.join(','))
// 关键：预设里只能出现一次本插件行（重复会双份注册工具）
check('本插件行只出现一次', plugins.filter((p) => p.id === 'dsh-divination-108').length === 1)

// ─── 3. bundle patch 的 !!js 位置 ───
head('3. !!js 位置（序列项会让宿主启动失败）')
const badSeqJs = patchRaw.split('\n').filter((l) => /^\s*-\s*!!js\b/.test(l))
check('没有序列项位置的 !!js', badSeqJs.length === 0, badSeqJs.join(' | '))
const sf = plugins.find((p) => p.name === '@deepseek-ai/dsh-skill-filesystem')
const dirs = sf?.config?.customSkillDirs ?? []
check('customSkillDirs 是普通路径数组', dirs.every((d) => typeof d === 'string'))
check('customSkillDirs 指向存在的目录', dirs.length > 0 && dirs.every((d) => existsSync(d)), dirs.join(','))
check('该目录下有 108-divination/SKILL.md',
  dirs.some((d) => existsSync(join(d, '108-divination', 'SKILL.md'))), dirs.join(','))

// ─── 4. 技能文件随包走 ───
head('4. 技能文件')
const skill = join(PLUGIN, 'skills', '108-divination', 'SKILL.md')
check('SKILL.md 在插件包内', existsSync(skill), skill)
check('SKILL.md 非空且有 frontmatter',
  existsSync(skill) && statSync(skill).size > 500 && readFileSync(skill, 'utf8').startsWith('---'))

// ─── 5. 插件 package.json ───
head('5. 插件 package.json')
const pkg = JSON.parse(readFileSync(join(PLUGIN, 'package.json'), 'utf8'))
check('name = dsh-divination-108', pkg.name === 'dsh-divination-108', String(pkg.name))
check('main 指向 src/index.js', pkg.main === './src/index.js', String(pkg.main))
check('声明 dsh.bundle.patch', pkg.dsh?.bundle?.patch === './cordis.patch.yml')
check('files 含 skills', (pkg.files ?? []).includes('skills'), JSON.stringify(pkg.files))
check('声明 dsh.client（加载右下角合盘面板 bundle）', pkg.dsh?.client?.platform === 'web', JSON.stringify(pkg.dsh?.client))
// immediately: true —— 否则 bundle 惰性执行，要等插件首次被用到才跑，面板不会自动出现
check('dsh.client.immediately: true（启动即加载面板）', pkg.dsh?.client?.immediately === true, String(pkg.dsh?.client?.immediately))
check('dsh.client 不含非法字段（client-modules 会拒绝畸形声明）',
  Object.keys(pkg.dsh?.client ?? {}).every((k) => ['platform', 'inject', 'external', 'immediately'].includes(k)),
  Object.keys(pkg.dsh?.client ?? {}).join(','))
check('客户端 bundle 文件存在', existsSync(join(PLUGIN, 'lib', 'client.js')))

// ─── 6. profile 装配 ───
head('6. profile 装配')
const prof = JSON.parse(readFileSync(PROFILE_PKG, 'utf8'))
check('dependencies 里有它（预设行按裸包名解析需要）',
  prof.dependencies?.['dsh-divination-108'] !== undefined, String(prof.dependencies?.['dsh-divination-108']))
check('dsh.profile.bundles 里**有**它（patch 才会被应用以声明 preset）',
  (prof.dsh?.profile?.bundles ?? []).includes('dsh-divination-108'))
check('node_modules junction 可达',
  existsSync(join(homedir(), '.dsh', 'profiles', 'desktop', 'node_modules', 'dsh-divination-108', 'package.json')))

// ─── 7. legacy 目录已迁移 ───
head('7. legacy 目录（应已迁移删除）')
check('~/.dsh/.agent-presets/divination 不存在（否则可能重复声明）', !existsSync(LEGACY_DIR), LEGACY_DIR)
check('其它预设目录未受影响',
  ['coc-kp', 'harmonyos', 'haruki', 'novelist'].some((d) => existsSync(join(homedir(), '.dsh', '.agent-presets', d))))

console.log(`\n${'='.repeat(52)}`)
console.log(`通过 ${pass} ｜ 失败 ${fail}`)
if (fail > 0) {
  console.log('\n失败项：')
  for (const f of failures) console.log('  - ' + f)
  process.exit(1)
}
console.log('预设与装配校验全部通过')