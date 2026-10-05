/**
 * 开发期工具 · 紫微斗数金标准夹具生成器（**不发布**：package.json 的 files 白名单不含 tools/）
 *
 * 为什么要有它：命理族的紫微安星最容易"看着像对、其实错宫"。口头说"用 iztro 对拍"
 * 落不了地，于是这里把 oracle 的答案**离线固化成 fixture**，
 * 实现方与 verifier 都拿同一份 JSON 做 diff，避免"各自解释什么算一致"。
 *
 * 用法：
 *   node tools/oracle-ziwei.mjs            # 生成 200 组
 *   node tools/oracle-ziwei.mjs 500        # 生成 500 组
 *
 * 产出：tools/fixtures/ziwei-oracle.json
 *
 * oracle 来源：iztro@2.6.1（MIT，https://github.com/sylarlight/iztro）
 * 故意不放进 vendor/：它 5.4MB，且只用于开发期校验，不进运行时。
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'fixtures', 'ziwei-oracle.json')
const ORACLE = 'file:///D:/DSH/.divination-v2-deps/node_modules/iztro/lib/index.js'

const count = Number(process.argv[2] ?? 200)

/** 简单的确定性伪随机（夹具必须可复现，不用 Math.random）。 */
function makeRand(seed) {
  let s = seed >>> 0 || 0x9e3779b9
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s >>> 0
  }
}

/**
 * 真太阳时下的时辰索引（iztro 口径）：
 * 0=早子时(00:00–00:59) 1=丑 2=寅 … 11=亥 12=晚子时(23:00–23:59)
 * @param {number} h 小时 0..23。
 * @returns {number} 0..12。
 */
function timeIndexOf(h) {
  if (h === 23) return 12
  if (h === 0) return 0
  return Math.floor((h + 1) / 2)
}

const { astro } = await import(ORACLE)

const rand = makeRand(20261002)
const items = []
let skipped = 0

for (let i = 0; i < count; i += 1) {
  // ⚠ 边缘采样（v2 追加，因为独立验证 ISSUE-01 暴露了"夹具过窄 → 实现对夹具过拟合"）：
  // 每 3 例取一个**晚子时 + 农历下半月**的组合。这正是原夹具（day≤28 且 h 均匀随机）
  // 采不到、却决定了"晚子时是否推进农历月"与"闰月半旬推进"两条口径的样本面。
  const edge = i % 3 === 0
  const y = 1930 + (rand() % 91)          // 1930–2020
  const mo = 1 + (rand() % 12)
  const d = edge ? 25 + (rand() % 4) : 1 + (rand() % 28)
  const h = edge ? 23 : (rand() % 24)
  const mi = edge ? 30 + (rand() % 30) : rand() % 60
  const gender = rand() % 2 === 0 ? '男' : '女'
  const ti = timeIndexOf(h)
  try {
    const a = astro.bySolar(`${y}-${mo}-${d}`, ti, gender, true, 'zh-CN')
    const palaces = {}
    for (const p of a.palaces ?? []) {
      palaces[p.name] = {
        stem: p.heavenlyStem,
        branch: p.earthlyBranch,
        major: (p.majorStars ?? []).map((s) => `${s.name}${s.brightness ?? ''}${s.mutagen ? '化' + s.mutagen : ''}`),
        minor: (p.minorStars ?? []).map((s) => `${s.name}${s.brightness ?? ''}${s.mutagen ? '化' + s.mutagen : ''}`),
      }
    }
    items.push({
      input: { y, mo, d, h, mi, gender, timeIndex: ti },
      expect: {
        mingGong: a.earthlyBranchOfSoulPalace,
        shenGong: a.earthlyBranchOfBodyPalace,
        wuxingJu: a.fiveElementsClass,
        mingZhu: a.soul,
        shenZhu: a.body,
        palaces,
      },
    })
  } catch {
    skipped += 1
  }
}

// ── 固定边缘样例（**回归护栏**）──
// 这些是 v2 期间真实翻过车的日子，随机采样覆盖不到（闰月×晚子时是极小概率交集），
// 但正是它们暴露了"晚子时取月序原值、不做闰月半旬调整"这条口径（verifier ISSUE-01/02）。
// 无论随机种子怎么变，这些样例都必须在夹具里。
const EDGE_CASES = [
  [1998, 7, 20, 23, 48, '男'],   // 农历闰五月廿七 → 常时月6 / 晚子时月5
  [1974, 6, 7, 23, 39, '男'],    // 农历闰四月十七 → 5 / 4
  [1955, 5, 19, 23, 29, '女'],   // 农历闰三月廿八 → 4 / 3
  [1941, 8, 10, 23, 10, '男'],   // 农历闰六月十八 → 7 / 6
  [2026, 2, 16, 23, 10, '女'],   // 农历十二月廿九 → 次日正月初一（月不推进）
  [1998, 11, 18, 23, 33, '男'],  // 农历九月三十 → 次日十月初一（月不推进）
  [1990, 5, 12, 23, 30, '男'],   // 非闰月晚子时（对照）
  [2002, 3, 5, 23, 58, '女'],    // 晚子时日推进（紫微起星用次日日数）
  [2026, 2, 3, 12, 0, '男'],     // 立春前（年柱口径）
  [2026, 2, 5, 12, 0, '男'],     // 立春后（年柱口径）
]

for (const [y, mo, d, h, mi, gender] of EDGE_CASES) {
  const ti = timeIndexOf(h)
  try {
    const a = astro.bySolar(`${y}-${mo}-${d}`, ti, gender, true, 'zh-CN')
    const palaces = {}
    for (const p of a.palaces ?? []) {
      palaces[p.name] = {
        stem: p.heavenlyStem,
        branch: p.earthlyBranch,
        major: (p.majorStars ?? []).map((s) => `${s.name}${s.brightness ?? ''}${s.mutagen ? '化' + s.mutagen : ''}`),
        minor: (p.minorStars ?? []).map((s) => `${s.name}${s.brightness ?? ''}${s.mutagen ? '化' + s.mutagen : ''}`),
      }
    }
    items.push({
      input: { y, mo, d, h, mi, gender, timeIndex: ti, edge: true },
      expect: {
        mingGong: a.earthlyBranchOfSoulPalace,
        shenGong: a.earthlyBranchOfBodyPalace,
        wuxingJu: a.fiveElementsClass,
        mingZhu: a.soul,
        shenZhu: a.body,
        palaces,
      },
    })
  } catch {
    skipped += 1
  }
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify({
  oracle: 'iztro@2.6.1',
  source: 'https://github.com/sylarlight/iztro',
  license: 'MIT',
  generatedAt: new Date().toISOString(),
  count: items.length,
  skipped,
  items,
}, null, 1), 'utf8')

console.log(`iztro 夹具已生成：${items.length} 组（跳过 ${skipped}）`)
console.log(`→ ${OUT}`)
console.log('样例：', JSON.stringify(items[0]?.expect?.wuxingJu), items[0]?.expect?.mingGong, items[0]?.expect?.shenGong)
