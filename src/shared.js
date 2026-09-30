/**
 * dsh-divination-108 —— 共享依赖定位。
 *
 * 本插件装在 `D:\DSH\plugins\` 下，是**工作区外**的包：loader 对裸包名
 * `@deepseek-ai/dsh-tools` 的解析并不可靠（Node ESM 的解析基准是文件位置而非 cwd，
 * 而这里既不在任何 node_modules 树下，也不是 pnpm workspace 成员）。
 *
 * 做法与本机已验证的 `dsh-shell-switch/lib/shared.js`、`dsh-git-bash/lib/executor.js`
 * 一致：按已知根目录列表逐个探测，找到含 package.json 的那个，再解析成绝对 file:// URL
 * 用动态 import() 载入。探到同一个真实路径时 Node 模块缓存会复用宿主那份实例。
 */
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

/**
 * 列出所有可能存放共享依赖的 `node_modules` 根，按可信度排序。
 *
 * ⚠ 这份清单是**本插件能否激活的命门**：漏掉任何一个真实位置，插件就会在
 * `apply()` 里抛「找不到共享依赖 @deepseek-ai/dsh-tools」，而宿主把它记成
 * preset 的 `broken`，设置页就显示「（加载失败）」。
 *
 * 本机实测（2026-09）：`~/.dsh/profiles/node_modules/@deepseek-ai/*` 与
 * `~/.dsh/profiles/<profile>/node_modules/@deepseek-ai/*` 全是**悬空 junction**，
 * 指向已被移除的 npm 全局安装（`%APPDATA%\npm\node_modules\@deepseek-ai\dsh\...`），
 * 所以那两组根**永远探不到**。`dsh-tools` 实际只在 **app.asar 里**：
 *   `D:\DSH DESKTOP\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-tools`
 * Electron 的 asar 补丁让 `existsSync` 能看见它，所以必须用
 * `process.resourcesPath`（Electron 专用）把它加进来。
 *
 * @param {object} [env] 注入点（测试用）。
 * @returns {string[]} 去重后的根目录列表。
 */
export function sharedRoots(env = process.env) {
  const roots = []
  const seen = new Set()
  const push = (value) => {
    if (typeof value !== 'string' || value.length === 0) return
    const normalized = value.replace(/[\\/]+$/, '')
    if (seen.has(normalized)) return
    seen.add(normalized)
    roots.push(normalized)
  }

  // 1. 从 cwd 逐级向上：宿主从 D:\DSH 启动时能命中工作区自己的 node_modules。
  let dir = process.cwd()
  for (let depth = 0; depth < 10; depth += 1) {
    push(join(dir, 'node_modules'))
    const parent = join(dir, '..')
    if (parent === dir) break
    dir = parent
  }

  // 2. 本模块自己所在位置向上：插件装在 `<ws>/plugins/<pkg>` 时能找到 `<ws>/node_modules`。
  try {
    const selfDir = dirname(fileURLToPath(import.meta.url))
    let d = selfDir
    for (let depth = 0; depth < 10; depth += 1) {
      push(join(d, 'node_modules'))
      const parent = join(d, '..')
      if (parent === d) break
      d = parent
    }
  } catch { /* 非 file: URL 时跳过 */ }

  // 3. 显式 checkout 提示（测试与自定义部署用）。
  push(env.DSH_CHECKOUT)
  push(env.DSH_ASAR)
  push(env.DSH_SHARED_ROOT)

  // 4. ⭐ Electron：asar 内的 dsh 安装 —— 本部署里唯一真实存在的位置。
  //    process.resourcesPath 在 Electron 的主/工具进程里是 `<app>/resources`。
  const resources = process.resourcesPath
  if (typeof resources === 'string' && resources.length > 0) {
    push(join(resources, 'app.asar', 'dsh', 'node_modules'))
    push(join(resources, 'app', 'dsh', 'node_modules'))
    push(join(resources, 'dsh', 'node_modules'))
    push(join(resources, 'app.asar', 'node_modules'))
  }
  // 5. 从可执行文件位置推断（resourcesPath 不可用时的兜底）。
  if (typeof process.execPath === 'string' && process.execPath.length > 0) {
    const exeDir = dirname(process.execPath)
    push(join(exeDir, 'resources', 'app.asar', 'dsh', 'node_modules'))
    push(join(exeDir, 'resources', 'app', 'dsh', 'node_modules'))
  }

  // 6. 本部署的 profile 级位置（当前是悬空 junction，但装上 npm 版 dsh 后会是真的）。
  const home = env.DSH_HOME
  if (typeof home === 'string' && home.length > 0) {
    push(join(home, 'profiles', 'node_modules'))
    const profile = env.DSH_PROFILE
    if (typeof profile === 'string' && profile.length > 0) {
      push(join(home, 'profiles', profile, 'node_modules'))
    }
  }

  // 7. 兜底：npm 全局安装的 DSH 副本。
  if (typeof env.APPDATA === 'string' && env.APPDATA.length > 0) {
    push(join(env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules'))
    push(join(env.APPDATA, 'npm', 'node_modules'))
  }

  return roots
}

/**
 * 定位一个共享依赖包的绝对目录。
 * @param {string[]} parts 包名分段，如 `['@deepseek-ai','dsh-tools']`。
 * @param {object} [options] 注入点（测试用）。
 * @returns {string} 包目录绝对路径。
 */
export function resolveSharedPackage(parts, options = {}) {
  const env = options.env ?? process.env
  const exists = options.exists ?? existsSync
  const roots = sharedRoots(env)
  const tried = []
  for (const root of roots) {
    const candidate = join(root, ...parts)
    tried.push(candidate)
    if (exists(join(candidate, 'package.json'))) return candidate
  }
  throw new Error(
    `dsh-divination-108: 找不到共享依赖 ${parts.join('/')}`
    + `（试过 ${tried.length} 个 node_modules 根；首个候选：${tried[0] ?? '(none)'}）`,
  )
}

/**
 * 把一个共享包的入口解析成绝对 file:// URL。
 * @param {string[]} parts 包名分段。
 * @param {string} [entry] 包内入口相对路径。
 * @param {object} [options] 透传。
 * @returns {string} 可直接 import() 的 URL。
 */
export function sharedUrl(parts, entry = 'lib/index.js', options = {}) {
  return pathToFileURL(join(resolveSharedPackage(parts, options), ...entry.split('/'))).href
}

/**
 * 载入 `defineTool`。
 *
 * 策略：**先裸 `import()`**（宿主若能直接解析就用宿主那份实例，Node 模块缓存会复用，
 * 避免出现两份 dsh-tools 导致 instanceof / 注册表不一致），失败再按 `sharedRoots()`
 * 逐个探测——探测路径里包含 `process.resourcesPath` 推出的 **app.asar** 位置，
 * 那是本部署里唯一真实存在 dsh-tools 的地方。
 *
 * 探测失败时抛出可读错误（而不是让插件静默死掉）。
 * @returns {Promise<Function>} defineTool。
 */
export async function loadDefineTool() {
  let lastError
  try {
    const bare = await import('@deepseek-ai/dsh-tools')
    const fn = bare.defineTool ?? bare.default?.defineTool
    if (typeof fn === 'function') return fn
    lastError = new Error('未导出 defineTool')
  } catch (err) { lastError = err }

  const roots = sharedRoots()
  const tried = []
  for (const root of roots) {
    const candidate = pathToFileURL(join(root, '@deepseek-ai', 'dsh-tools', 'lib', 'index.js')).href
    tried.push(candidate)
    try {
      const mod = await import(candidate)
      const fn = mod.defineTool ?? mod.default?.defineTool
      if (typeof fn === 'function') return fn
      lastError = new Error('未导出 defineTool')
    } catch (err) { lastError = err }
  }

  throw new Error(
    'dsh-divination-108: 找不到共享依赖 @deepseek-ai/dsh-tools'
    + `（裸 import 失败：${lastError?.message ?? lastError}；`
    + `另试过 ${tried.length} 个根，首个：${tried[0] ?? '(none)'}）`,
  )
}

/**
 * 载入 schemastery 的 `z`（Config schema 用）。失败返回一个**可链式调用**的最小替身，
 * 保证没有它时插件仍能加载：配置校验降级为「原样透传」，但工具照常可用。
 * @returns {Promise<any>} z。
 */
export async function loadSchema() {
  try {
    const mod = await import(sharedUrl(['@deepseek-ai', 'schemastery'], 'lib/index.mjs'))
    const z = mod.default ?? mod
    if (z && typeof z.object === 'function') return z
  } catch { /* 落到替身 */ }

  // 最小替身：每个构造器都返回同一个可链式的惰性节点，
  // 这样 `z.object({...})` / `z.union([...]).default(x)` / `z.number().min(0)` 都不会炸。
  const node = () => {
    const self = { __schema: true }
    for (const m of ['default', 'min', 'max', 'required', 'description', 'optional']) {
      self[m] = () => self
    }
    return self
  }
  return {
    object: node, string: node, number: node, boolean: node,
    array: node, dict: node, union: node, const: node, any: node,
  }
}
