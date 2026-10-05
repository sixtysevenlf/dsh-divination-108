/**
 * dsh-divination-108 · v2 验收审计（Lead 用；**不随包发布**）
 *
 * 它不重复 smoke 的"能不能算"，而是回答三个 smoke 答不了的问题：
 *   1. 算出来的东西**有出处吗**（detail.cite）、有证据链吗（detail.evidence）；
 *   2. **保真度有没有偷偷降级**（对比 baseline-v1 标签）；
 *   3. 有没有**偷懒信号**（两法吐逐字相同的断语、分数全同、essence 全同）。
 *
 * 用法：node test/v2-audit.mjs
 * 退出码：0 = 无硬失败；1 = 有硬失败（算错/未起/降级未申报）
 */
import { execSync } from 'node:child_process'
import { buildChart } from '../src/core/calendar.js'
import { ENTRIES } from '../src/core/registry.js'
import { runMany, auditResults } from '../src/core/runner.js'
import { aggregate } from '../src/core/aggregate.js'
import { render } from '../src/core/format.js'

const problems = []
const warnings = []

/** 从 baseline-v1 标签里取每法保真度（只看，不改任何东西）。 */
function baselineFidelity() {
  try {
    const src = execSync('git show baseline-v1:src/core/registry.js', {
      cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    })
    const map = {}
    const re = /\{\s*no:\s*(\d+).*?fidelity:\s*'(full|core|approx)'/gs
    let m
    while ((m = re.exec(src)) !== null) map[Number(m[1])] = m[2]
    return map
  } catch (err) {
    warnings.push(`无法读取 baseline-v1 保真度表：${err.message}`)
    return null
  }
}

const chart = buildChart({
  question: '这次合作能不能成',
  when: new Date(2026, 8, 30, 14, 30),
  longitude: 116.4,
  gender: '男',
  birth: { y: 1990, m: 5, d: 12, h: 9, mi: 30 },
  numbers: [7, 13, 21],
})
const results = runMany({ chart })
const board = aggregate({ results, question: chart.question, chart })
const audit = auditResults(results)

console.log('══ v2 验收审计 ══')
console.log(`起法 ${audit.computed}/${audit.total}（未起 ${audit.skipped}）`)
console.log(`合盘：${board.overall.verdict} ${board.overall.score}（逐法口径 ${board.overall.rawScore}｜门间差 ${board.divergence.familySkew}）`)
console.log(`一致性 ${board.overall.consistency}（同号 ${board.meta.agreement.signAgreement}/离散 ${board.meta.agreement.dispersion}）｜置信 ${board.overall.confidence}｜可信折扣 ${board.meta.agreement.trust}`)
console.log('')

// ── 1. 硬失败：算错 / 未起 ──
if (audit.errors.length > 0) {
  problems.push(`${audit.errors.length} 法未起/算错：${audit.errors.map((e) => `#${e.no}${e.name}(${e.error})`).join(' ')}`)
}

// ── 2. 出处与证据链 ──
const citeMissing = audit.missingCite
const evMissing = audit.missingEvidence
console.log(`出处(cite)：${108 - citeMissing.length}/108 有`)
if (citeMissing.length > 0) {
  console.log(`  缺出处：${citeMissing.join(',')}`)
  warnings.push(`${citeMissing.length} 法没给出处(detail.cite)`)
}
console.log(`证据链(evidence)：${108 - evMissing.length}/108 有`)
if (evMissing.length > 0) {
  console.log(`  缺证据链：${evMissing.join(',')}`)
  warnings.push(`${evMissing.length} 法没给证据链(detail.evidence)`)
}
console.log('')

// ── 3.5 运行时降级（v2 新增） ──
// 注册表声明的是"输入齐备时能到的保真度"，方法层还会按实际数据来源再降一档
// （例：#7 外应未报 → approx；#92 未报字 → approx）。这类降级**不体现在注册表对比里**，
// 必须单独抓：否则"诚实降级"会变成"静默降级"，正是本次重写要防的东西。
{
  const runtimeDown = results
    .filter((r) => r.outcome && r.outcome.fidelity !== r.entry.fidelity)
    .map((r) => ({ no: r.entry.no, name: r.entry.name, declared: r.entry.fidelity, actual: r.outcome.fidelity, why: r.outcome.essence.slice(0, 34) }))
  console.log(`运行时降级（实际 fidelity 低于注册表声明）：${runtimeDown.length} 法`)
  for (const d of runtimeDown) console.log(`   #${String(d.no).padStart(3)} ${d.name.padEnd(12)} ${d.declared}→${d.actual}  「${d.why}」`)
  if (runtimeDown.length > 0) warnings.push(`${runtimeDown.length} 法在本盘按实际数据来源降到更低保真度（多为输入未报，属诚实降级，需在文档中说明）`)
  console.log('')
}
// ── 4. 保真度升降（**声明值**，对比 baseline-v1） ──
const base = baselineFidelity()
if (base) {
  const rank = { approx: 0, core: 1, full: 2 }
  const up = []
  const down = []
  for (const e of ENTRIES) {
    const b = base[e.no]
    if (!b) continue
    if (rank[e.fidelity] > rank[b]) up.push(`#${e.no}${e.name} ${b}→${e.fidelity}`)
    else if (rank[e.fidelity] < rank[b]) down.push(`#${e.no}${e.name} ${b}→${e.fidelity}`)
  }
  console.log(`保真度：升 ${up.length} 项 ｜ 降 ${down.length} 项`)
  if (up.length > 0) console.log(`  升：${up.join('、')}`)
  if (down.length > 0) {
    console.log(`  降：${down.join('、')}`)
    // 注册表里带 `fidelityNote` 的降级 = **已申报**（Lead 在 registry 里写明理由），不算问题；
    // 没申报的降级才是需要人解释的意外。
    const undeclared = down.filter((d) => {
      const no = Number(/^#(\d+)/.exec(d)?.[1])
      return !ENTRIES.find((e) => e.no === no)?.fidelityNote
    })
    const declared = down.length - undeclared.length
    if (declared > 0) console.log(`  其中 ${declared} 项为**已申报降级**（registry 有 fidelityNote）`)
    if (undeclared.length > 0) {
      console.log(`  ⚠ 未申报降级：${undeclared.join('、')}`)
      problems.push(`有 ${undeclared.length} 法保真度降级且未申报：${undeclared.join('、')}`)
    }
  }
}
console.log('')

// ── 4. 偷懒信号 ──
console.log(`断语去重：${new Set(results.filter((r) => r.outcome).map((r) => r.outcome.essence)).size} 种`)
console.log(`分数去重：${new Set(results.filter((r) => r.outcome).map((r) => Math.round(r.outcome.score))).size} 种`)
if (audit.duplicateEssence.length > 0) {
  const worst = audit.duplicateEssence.slice(0, 5)
  console.log('  逐字相同的断语：')
  for (const d of worst) console.log(`    「${d.essence}」 ← #${d.nos.join(',#')}`)
  warnings.push(`${audit.duplicateEssence.length} 组断语逐字相同（可能是同族共用模板）`)
}
if (audit.nanWuxing > 0) problems.push(`有 ${audit.nanWuxing} 个非有限五行信号`)
console.log('')

// ── 5. 输出体积 ──
const full = render({ board, results, mode: 'normal' })
console.log(`输出体积：normal ${full.length} 字（阈值 12000）`)
if (full.length >= 12000) problems.push(`normal 输出超预算：${full.length} 字`)

// ── 6. 出处账本 ──
if (board.evidenceDigest.length > 0) {
  console.log('')
  console.log('出处账本（本盘引证最多的经典）：')
  for (const e of board.evidenceDigest.slice(0, 8)) console.log(`  ${e.count}× ${e.source}`)
  if (board.evidenceDigest.badCite) {
    console.log(`  ⚠ 另有 ${board.evidenceDigest.badCite} 条 cite 不是合法字符串（已排除，不计入账本）`)
    warnings.push(`${board.evidenceDigest.badCite} 条 detail.cite 含非字符串/空值`)
  }
} else {
  warnings.push('出处账本为空：所有方法的 detail.cite 都还没接上')
}

console.log('')
console.log('═'.repeat(50))

// ── 7. 随机化稳健性审计（v2 新增） ──
// 单盘审计只能证明"这一盘没问题"。这一段用 N 组随机问题+时刻反复跑，
// 检查的是**契约在样本外的稳健性**：确定性、诚实降级、非有限分数、断语雷同。
const N = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 40
const QUESTIONS = [
  '这次合作能不能成', '我跟他还有姻缘吗', '这笔投资能不能赚钱', '这个病能不能好',
  '该不该跳槽', '官司能赢吗', '东西丢哪了', '今年运势如何',
  '', '   ', '。', '？', '嗯',
  '我叫张伟，这个名字好不好', '测字：明，问前程', '左眼一直跳，是凶是吉',
  '1990年5月12日出生的人今年如何', '明天适不适合搬家', '这个项目什么时候能上线',
  '最近有点焦虑', 'a'.repeat(300), '1,2,3', '帮我看下财运和感情',
  '下个月初八开业好不好', '找一个人，走失三天了', '怀孕了，想看男女',
]
let rProblems = 0
let rRandomStuck = 0
let rDup = 0
let rNotDet = 0
for (let i = 0; i < N; i += 1) {
  const q = QUESTIONS[i % QUESTIONS.length] + (i >= QUESTIONS.length ? `_${i}` : '')
  const when = new Date(2026, 8, 30, 14, 30)
  // ⚠ 口径变更（用户 2026-10-02 更正）：**默认即真随机，一致性不再被保证**。
  // 故本段分两种模式检查：
  //   · seed 模式（显式 seed）→ 断言"两次完全一致"（这是"管线可复现"的判据）
  //   · 默认模式（不给 seed）→ 断言"多次调用允许出现不同"（这是"真随机确实生效"的判据）
  const mk = (extra = {}) => buildChart({ question: q, when, longitude: 116.4, gender: i % 2 ? '女' : '男', numbers: [7, 13, 21], birth: { y: 1990, m: 5, d: 12, h: 9, mi: 30 }, ...extra })
  const key = (rs) => rs.map((r) => `${r.outcome?.score}|${r.outcome?.essence}|${r.outcome?.fidelity}`).join('~')
  // A 类：seed 模式必须逐字一致
  const s1 = runMany({ chart: mk({ seed: `audit-${i}` }) })
  const s2 = runMany({ chart: mk({ seed: `audit-${i}` }) })
  if (key(s1) !== key(s2)) { rProblems += 1; console.log(`  ✗ seed 模式下非确定性：问题「${q.slice(0, 12)}」两次结果不同`) }
  // B 类：默认模式应允许不同（统计型：5 次里至少出现 2 种）
  const variants = new Set()
  for (let k = 0; k < 5; k += 1) variants.add(key(runMany({ chart: mk() })))
  if (variants.size < 2) { rRandomStuck += 1; console.log(`  ✗ 默认模式下 5 次调用结果全同（疑似仍确定性）：问题「${q.slice(0, 12)}」`) }
  const r1 = s1
  if (r1.filter((r) => r.outcome).length !== 108) { rProblems += 1; console.log(`  ✗ 起法不足 108：问题「${q.slice(0, 12)}」`) }
  const seen = new Map()
  for (const r of r1) {
    if (!r.outcome) continue
    if (!Number.isFinite(r.outcome.score)) { rProblems += 1; break }
    seen.set(r.outcome.essence, (seen.get(r.outcome.essence) ?? 0) + 1)
  }
  for (const [, c] of seen) if (c > 0) rDup += Math.max(0, c - 1)
  // 诚实性：没报字/没报外应时，必须有「取象」标注（凡报数给了，测字走正路）
  const g = (no) => r1.find((r) => r.entry.no === no)?.outcome
  if (g(93) && !String(g(93).essence).startsWith('未报所测之字·取象：') && !/明/.test(q)) rNotDet += 1
}
console.log(`随机化稳健性（${N} 组问题×108 法）：`)
console.log(`  确定性/起法数异常：${rProblems} 例 ${rProblems === 0 ? '✅' : '✗'}`)
console.log(`  默认模式疑似仍确定性（5 次调用全同）：${rRandomStuck} 例 ${rRandomStuck === 0 ? '✅' : '✗'}`)
console.log(`  组内断语重复（雷同信号）：${rDup} 处 ${rDup === 0 ? '✅' : '（同族共用模板时会出现，需人工判读）'}`)
console.log(`  测字未标取象（未报字时）：${rNotDet} 例 ${rNotDet === 0 ? '✅' : '✗'}`)
if (rProblems > 0) problems.push(`随机化审计发现 ${rProblems} 例非确定性/起法不足`)
if (rRandomStuck > 0) problems.push(`随机化审计发现 ${rRandomStuck} 例默认模式下仍确定性（真随机未生效）`)
if (rNotDet > 0) problems.push(`随机化审计发现 ${rNotDet} 例未按诚实降级标注`)

console.log('')
console.log('═'.repeat(50))
if (problems.length === 0) {
  console.log(`硬失败 0 ｜ 提示 ${warnings.length}`)
  for (const w of warnings) console.log(`  · ${w}`)
  console.log('v2 审计通过（提示项不阻塞）')
  process.exit(0)
}
console.log(`硬失败 ${problems.length}：`)
for (const p of problems) console.log(`  ✗ ${p}`)
for (const w of warnings) console.log(`  · ${w}`)
process.exit(1)
