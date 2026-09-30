/**
 * 样例输出生成器：把一次真实求占的完整输出打到 stdout，便于人眼检查。
 *
 * 跑法：
 *   node test/sample.mjs                       # 默认：带生日与报数的完整求占
 *   node test/sample.mjs "问 1990-05-12 09:30" # 自定义（第一个参数是所问）
 *
 * 不参与断言，只出样本。
 */
import { buildChart } from '../src/core/calendar.js'
import { runMany } from '../src/core/runner.js'
import { aggregate } from '../src/core/aggregate.js'
import { render, renderList, primeList } from '../src/core/format.js'
import { ENTRIES } from '../src/core/registry.js'
import { validateEngines } from '../src/core/runner.js'

primeList(ENTRIES)

const question = process.argv[2] ?? '这次和张三的合作能不能成'
const when = process.argv[3] ?? '2026-09-30 14:30'

/** 解析 `YYYY-MM-DD HH:mm` 为本地 Date。 */
function parseWhen(s) {
  const m = String(s).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/)
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 12), +(m[5] ?? 0)) : new Date(s)
}

const problems = validateEngines()
console.log(`引擎自检：${problems.length === 0 ? '108 法全部实现 ✅' : `缺 ${problems.length} 个 ❌\n  ${problems.join('\n  ')}`}\n`)

const chart = buildChart({
  question,
  when: parseWhen(when),
  longitude: 116.4,
  gender: '男',
  birth: { y: 1990, m: 5, d: 12, h: 9, mi: 30 },
  numbers: [7, 13, 21],
})

const results = runMany({ chart })
const board = aggregate({ results, question, chart })

const line = '─'.repeat(72)
console.log(line)
console.log(`所问：${question}`)
console.log(`时刻：${chart.solar.text}　四柱：${chart.pillars.join(' ')}　农历：${chart.lunar.text}`)
console.log(`真太阳时校正：${chart.solarNote}`)
console.log(`节气：${chart.jieqi.prev} → ${chart.jieqi.next}　值日：${chart.almanac.zhiXing}·${chart.almanac.tianShen}(${chart.almanac.tianShenType})　宿：${chart.almanac.xiu}(${chart.almanac.xiuLuck})　九星：${chart.almanac.nineStar}`)
console.log(`旬空：${chart.xunKong.day}　六曜：${chart.almanac.liuYao}`)
console.log(line)
console.log()
console.log(render({ board, results, mode: 'normal', detailNos: [31, 3], showHint: true }))
console.log()
console.log(line)
console.log('目录（divine_list 的输出）：')
console.log(line)
console.log(renderList())
