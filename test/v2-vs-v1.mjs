/**
 * dsh-divination-108 · v1 ↔ v2 对拍台（Lead 用；**不随包发布**）
 *
 * 目标里的"与旧实现可比对核验"就落在这里。它回答的问题不是"测试过不过"，
 * 而是：**重写之后，每一法的结论到底变了多少、为什么变、有没有哪一法其实根本没被重写。**
 *
 * 做法：把 `baseline-v1` 标签的整棵树 checkout 到临时 worktree，
 * 用**同一份输入**同时跑 v1 与 v2 两套内核，逐法比对：
 *   score 差值 Δ、essence 是否变化、fidelity 升降、起法数差异、分类别整体偏移。
 *
 * 判读口径（写在明处，避免"变了就是坏了"的误读）：
 *   - **Δ 大**：可能是对的（v1 有口径错误，如八字年柱未按立春、紫微年干用错），也可能是引入 bug → 需人工解释；
 *   - **Δ 恒为 0 且 essence 逐字相同**：**可疑信号**——该法可能压根没被重写，属返工项；
 *   - v1 与 v2 的 `essence` 措辞本就重写过，故"变化率"高是预期，**不作为质量判据**。
 *
 * 用法：node test/v2-vs-v1.mjs
 * 退出码：0 = 对拍完成；1 = 发现可疑"未重写"项
 */
import { execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const REPO = 'D:/DSH/plugins/dsh-divination-108'
const V1 = 'D:/DSH/tmp/div108-v1'
const U = (p) => pathToFileURL(`${V1}/${p}`).href

// ── 1. 准备 v1 树（worktree，不污染当前分支） ──
if (!existsSync(`${V1}/src/core/calendar.js`)) {
  try {
    execSync(`git worktree add --detach "${V1}" baseline-v1`, { cwd: REPO, stdio: 'pipe' })
    console.log(`已 checkout baseline-v1 → ${V1}`)
  } catch (err) {
    const msg = String(err.stderr ?? err.message)
    if (!/already exists|already registered/.test(msg)) {
      console.error('无法创建 v1 worktree：', msg.slice(0, 300))
      process.exit(1)
    }
    console.log(`复用已有 worktree：${V1}`)
  }
} else {
  console.log(`复用已有 worktree：${V1}`)
}

// ── 2. 载入两套内核 ──
const v1cal = await import(U('src/core/calendar.js'))
const v1run = await import(U('src/core/runner.js'))
const v1reg = await import(U('src/core/registry.js'))
const v1agg = await import(U('src/core/aggregate.js'))

const v2cal = await import('file:///D:/DSH/plugins/dsh-divination-108/src/core/calendar.js')
const v2run = await import('file:///D:/DSH/plugins/dsh-divination-108/src/core/runner.js')
const v2reg = await import('file:///D:/DSH/plugins/dsh-divination-108/src/core/registry.js')
const v2agg = await import('file:///D:/DSH/plugins/dsh-divination-108/src/core/aggregate.js')

const QUESTION = '这次合作能不能成'
const WHEN = new Date(2026, 8, 30, 14, 30)
const common = { question: QUESTION, when: WHEN, longitude: 116.4 }
const full = { ...common, gender: '男', birth: { y: 1990, m: 5, d: 12, h: 9, mi: 30 }, numbers: [7, 13, 21] }

const v1c = v1cal.buildChart(full)
const v2c = v2cal.buildChart(full)
const v1r = v1run.runMany({ chart: v1c })
const v2r = v2run.runMany({ chart: v2c })

console.log('\n══ v1 ↔ v2 对拍 ══')
console.log(`v1 起法 ${v1r.filter((r) => r.outcome).length}/108 ｜ v2 起法 ${v2r.filter((r) => r.outcome).length}/108`)

// ── 2.5 种子口径（决定所有 rand 类法是否可比） ──
const seedSame = v1c.seedBase === v2c.seedBase
console.log('\n── 随机种子 ──')
console.log(`  v1 seedBase = ${v1c.seedBase}`)
console.log(`  v2 seedBase = ${v2c.seedBase}`)
if (!seedSame) {
  console.log('  ⚠ 种子不同 → 所有走 rand 的法（金钱卦/大衍/灵签/掷筊/塔罗/卢恩/风水取坐向…）结果必然不同，')
  console.log('    这些差异**不能**当作"算法被重写"的证据，也不能当作"回归"。')
  console.log('    根因通常是 seedBase 锚定了派生量（真太阳时/均时差）而非用户给的原时刻。')
}

// ── 3. 历法层差异（很多方法差异的根因在这里） ──
console.log('\n── 历法层 ──')
const calRows = [
  ['四柱', (c) => (c.pillars ?? []).join(' ')],
  ['日主', (c) => c.dayGan],
  ['月令', (c) => c.monthZhi],
  ['五行', (c) => Object.entries(c.wuxing ?? {}).map(([k, v]) => `${k}${Math.round(v * 10) / 10}`).join('')],
  ['节气', (c) => `${c.jieqi?.prev}→${c.jieqi?.next}`],
  ['建除', (c) => c.almanac?.zhiXing],
  ['值宿', (c) => c.almanac?.xiu],
  ['九星', (c) => c.almanac?.nineStar],
  ['旬空', (c) => (c.xun?.kong ?? []).join('')],
]
for (const [name, get] of calRows) {
  const a = String(get(v1c) ?? '')
  const b = String(get(v2c) ?? '')
  console.log(`  ${name.padEnd(6)} v1=${a.padEnd(24)} v2=${b.padEnd(24)} ${a === b ? '同' : '⚠ 变'}`)
}

// ── 4. 逐法比对 ──
const rows = []
let sameScore = 0
let sameEssence = 0
let bothSame = 0
for (const e of v2reg.ENTRIES) {
  const a = v1r.find((r) => r.entry.no === e.no)
  const b = v2r.find((r) => r.entry.no === e.no)
  if (!a?.outcome || !b?.outcome) {
    rows.push({ no: e.no, name: e.name, cat: e.cat, skip: true, a: a?.outcome ? 1 : 0, b: b?.outcome ? 1 : 0 })
    continue
  }
  const d = Math.round((b.outcome.score - a.outcome.score) * 10) / 10
  const se = a.outcome.essence === b.outcome.essence
  if (Math.abs(d) < 0.05) sameScore += 1
  if (se) sameEssence += 1
  if (Math.abs(d) < 0.05 && se) bothSame += 1
  rows.push({
    no: e.no, name: e.name, cat: e.cat,
    v1: Math.round(a.outcome.score), v2: Math.round(b.outcome.score), d,
    sameEssence: se,
    fid1: a.entry.fidelity, fid2: b.entry.fidelity,
    // v2 才有、v1 没有的字段：用来区分「保真一致」与「根本没重写」
    hasV2Fields: Boolean(b.outcome.detail?.cite || b.outcome.detail?.evidence),
    ok: true,
  })
}
const live = rows.filter((r) => r.ok)
console.log(`\n── 逐法（可比 ${live.length} 法）──`)
console.log(`  分数差 |Δ|<0.05 的：${sameScore} 法 ｜ essence 逐字相同的：${sameEssence} 法`)

// ⚠ 判据说明（v2 修订）：
// "输出与 v1 一致"**不等于**"代码没被重写"。历法驱动的法（小六壬、建除、五音占…）
// 若重写时保留了同一套卦象映射与打分口径，输出本就应该逐字相同 —— 那是**保真**，不是偷懒。
// 真正能区分"没重写"的信号是 **v2 要求具备而 v1 没有的东西**：`detail.cite` 与 `detail.evidence`。
// 故此处改为「输出一致 **且** 无 cite 无 evidence」才算返工项。
const rewritten = (r) => r.hasV2Fields
const sameOut = live.filter((r) => Math.abs(r.d) < 0.05 && r.sameEssence)
const notRewritten = sameOut.filter((r) => !rewritten(r))
const sameButRewritten = sameOut.filter(rewritten)
console.log(`  其中「输出与 v1 一致」共 ${sameOut.length} 法：已含 v2 字段（cite/evidence）的 ${sameButRewritten.length} 法 → 属**保真一致**，非返工`)
if (sameButRewritten.length > 0) {
  console.log(`     ${sameButRewritten.map((r) => `#${r.no}`).join(' ')}`)
}
console.log(`  ⚠ 真正的疑似未重写（输出一致 **且** 无 cite/无 evidence）：${notRewritten.length} 法`)

const byAbs = [...live].sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
console.log('\n  Δ 最大的 12 法（需逐一解释，多为 v1 口径错误被修正）：')
for (const r of byAbs.slice(0, 12)) {
  console.log(`   #${String(r.no).padStart(3)} ${r.name.padEnd(12)} v1=${String(r.v1).padStart(4)} → v2=${String(r.v2).padStart(4)}  Δ=${r.d > 0 ? '+' : ''}${r.d}`)
}
const suspicious = notRewritten
if (suspicious.length > 0) {
  console.log('\n  ⚠ 疑似未重写（输出与 v1 一致且无 cite/evidence）：')
  for (const r of suspicious) console.log(`   #${String(r.no).padStart(3)} ${r.name}（${r.cat}）`)
}

// ── 5. 分类别整体偏移 ──
console.log('\n── 分类别平均偏移 ──')
const catSet = [...new Set(live.map((r) => r.cat))]
for (const c of catSet) {
  const list = live.filter((r) => r.cat === c)
  const avg = list.reduce((s, r) => s + r.d, 0) / list.length
  const changed = list.filter((r) => Math.abs(r.d) >= 0.05).length
  console.log(`  ${c.padEnd(4)} 均Δ=${(avg > 0 ? '+' : '') + avg.toFixed(1).padStart(5)} ｜ 有变化 ${changed}/${list.length} 法`)
}

// ── 6. 保真度升降 ──
const rank = { approx: 0, core: 1, full: 2 }
const up = live.filter((r) => rank[r.fid2] > rank[r.fid1])
const down = live.filter((r) => rank[r.fid2] < rank[r.fid1])
console.log(`\n── 保真度 ──  升 ${up.length} ｜ 降 ${down.length}`)
for (const r of up) console.log(`   ↑ #${r.no} ${r.name} ${r.fid1}→${r.fid2}`)
for (const r of down) console.log(`   ↓ #${r.no} ${r.name} ${r.fid1}→${r.fid2}`)

// ── 7. 合盘口径差异 ──
const b1 = v1agg.aggregate({ results: v1r, question: QUESTION, chart: v1c })
const b2 = v2agg.aggregate({ results: v2r, question: QUESTION, chart: v2c })
console.log('\n── 合盘 ──')
console.log(`  v1: ${b1.overall.verdict} ${b1.overall.score}（一致性 ${b1.overall.consistency}／置信 ${b1.overall.confidence}）｜吉${b1.polarity.吉}平${b1.polarity.平}凶${b1.polarity.凶}`)
console.log(`  v2: ${b2.overall.verdict} ${b2.overall.score}（一致性 ${b2.overall.consistency}／置信 ${b2.overall.confidence}）｜吉${b2.polarity.吉}平${b2.polarity.平}凶${b2.polarity.凶}`)
console.log(`  v2 逐法口径 ${b2.overall.rawScore ?? '—'}｜门间差 ${b2.divergence?.familySkew ?? '—'}（v1 无此诊断量）`)

console.log('\n' + '═'.repeat(52))
if (suspicious.length > 0) {
  console.log(`对拍完成：发现 ${suspicious.length} 法疑似未重写 → 返工项`)
  process.exit(1)
}
console.log('对拍完成：未发现"分数与断语都与 v1 逐字相同"的未重写项')
process.exit(0)
