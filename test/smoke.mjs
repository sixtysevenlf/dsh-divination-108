/**
 * dsh-divination-108 —— 冒烟测试（纯 Node，不需要 DSH 宿主）
 *
 * 跑法： node test/smoke.mjs
 *
 * 覆盖：
 *  1. 历法层字段齐全（四柱/节气/建除/宿/九星/宜忌/旬空/神煞）
 *  2. 注册表自检（108 条、编号连续、分类合法）
 *  3. 108 法全部可算、结果合规（分数范围、等级一致、essence 非空）
 *  4. 合盘聚合产出（总分/票型/五行/共识/应期/分歧/断语）
 *  5. 确定性：同问同刻两次求占结果完全一致
 *  6. 不同问事得到不同结果（种子确实在起作用）
 *  7. token 预算：紧凑表字符数在阈值内
 */

import { buildChart } from '../src/core/calendar.js'
import { ENTRIES, validateRegistry, CATEGORIES } from '../src/core/registry.js'
import { runMany, validateEngines, resolveMethod } from '../src/core/runner.js'
import { aggregate, detectTopic } from '../src/core/aggregate.js'
import { render, renderSummary, renderTable, renderList, primeList } from '../src/core/format.js'
import { VERDICTS, verdictOf } from '../src/core/kit.js'
import { LIUYAO } from '../src/core/tables.js'

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

// ─────────── 1. 历法层 ───────────
section('1. 历法层')
const chart = buildChart({ question: '这次合作能不能成', when: new Date(2026, 8, 30, 14, 30), longitude: 116.4 })
check('四柱四字齐', chart.pillars.every((p) => p.length === 2), chart.pillars.join(' '))
check('日主有五行', !!chart.dayMasterWx, chart.dayMasterWx)
check('月令五行合法', ['木', '火', '土', '金', '水'].includes(chart.monthWx), chart.monthWx)
check('节气前后有名', !!chart.jieqi.prev && !!chart.jieqi.next, `${chart.jieqi.prev}→${chart.jieqi.next}`)
check('建除十二神有名', !!chart.almanac.zhiXing, chart.almanac.zhiXing)
check('二十八宿有名', !!chart.almanac.xiu, chart.almanac.xiu)
check('九星有名', !!chart.almanac.nineStar, chart.almanac.nineStar)
check('宜忌非空', chart.almanac.yi.length > 0 && chart.almanac.ji.length > 0)
check('旬空两支', chart.xun.kong.length === 2, chart.xun.kong.join(''))
check('神煞四项', Object.keys(chart.shensha).length === 4)
check('五行统计非零', Object.values(chart.wuxing).some((v) => v > 0))

// 立春换年：四柱年柱必须按立春，不是农历正月初一（术数最常踩的坑）
const lichunChart = buildChart({ question: '立春边界', when: new Date(2026, 1, 5, 12, 0) })
check('立春后四柱年柱按立春换年', lichunChart.ganzhi.year === '丙午', lichunChart.ganzhi.year)
check('农历年干支仍为乙巳', lichunChart.lunarYearGZ === '乙巳', lichunChart.lunarYearGZ)
check('标记出年界分歧', lichunChart.yearBoundarySplit === true)
const beforeLichun = buildChart({ question: '立春前', when: new Date(2026, 1, 3, 12, 0) })
check('立春前四柱年柱仍为乙巳', beforeLichun.ganzhi.year === '乙巳', beforeLichun.ganzhi.year)
check('立春前无年界分歧', beforeLichun.yearBoundarySplit === false)

// 六曜异体字：历法库返回「佛灭」，表里若只有「仏灭」会有一天查表落空
check('六曜「佛灭」有别名', LIUYAO['佛灭'] !== undefined && LIUYAO['佛灭'] === LIUYAO['仏灭'])

// ─────────── 2. 注册表 ───────────
section('2. 注册表自检')
const regProblems = validateRegistry()
check('注册表自检通过', regProblems.length === 0, regProblems.join(' | '))
check('条目数 = 108', ENTRIES.length === 108, String(ENTRIES.length))
const engProblems = validateEngines()
check('引擎全部实现', engProblems.length === 0, engProblems.join(' | '))

// ─────────── 3. 跑 108 法 ───────────
section('3. 108 法运行')
const results = runMany({ chart })
check('结果条数 = 108', results.length === 108, String(results.length))

const computed = results.filter((r) => r.outcome)
const skipped = results.filter((r) => !r.outcome)
console.log(`  起 ${computed.length} / 108 法（未起 ${skipped.length}）`)
if (skipped.length > 0) console.log('  未起：' + skipped.map((s) => `#${s.entry.no}${s.entry.name}(${s.error})`).join(' '))

// 命理类需要生日，无生日时应当"未起"而不是报错
const needBirth = ENTRIES.filter((e) => e.need.includes('birth'))
check('缺出生资料时命理类记为未起', results.filter((r) => needBirth.includes(r.entry)).every((r) => !r.outcome))

// 用完整输入再跑一遍，验证需要 birth 的也能算
const fullChart = buildChart({
  question: '这次合作能不能成',
  when: new Date(2026, 8, 30, 14, 30),
  longitude: 116.4,
  gender: '男',
  birth: { y: 1990, m: 5, d: 12, h: 9, mi: 30 },
  numbers: [7, 13, 21],
})
const fullResults = runMany({ chart: fullChart })
const fullComputed = fullResults.filter((r) => r.outcome)
console.log(`  完整输入：起 ${fullComputed.length} / 108 法`)
check('完整输入下 108 法全起', fullComputed.length === 108,
  '未起：' + fullResults.filter((r) => !r.outcome).map((r) => `#${r.entry.no}${r.entry.name}(${r.error})`).join(' '))

// 结果合规
let bad = []
for (const r of fullResults) {
  const o = r.outcome
  if (!o) continue
  if (!(o.score >= -100 && o.score <= 100)) bad.push(`${r.entry.id}:score=${o.score}`)
  if (!VERDICTS.includes(o.verdict)) bad.push(`${r.entry.id}:verdict=${o.verdict}`)
  if (o.verdict !== verdictOf(o.score)) bad.push(`${r.entry.id}:等级与分数不符`)
  if (!o.essence || o.essence.length === 0) bad.push(`${r.entry.id}:essence 空`)
  if (o.essence.length > 60) bad.push(`${r.entry.id}:essence 超长 ${o.essence.length}`)
  if (o.keys.length > 6) bad.push(`${r.entry.id}:keys 超 6`)
  if (!o.detail || typeof o.detail !== 'object') bad.push(`${r.entry.id}:detail 缺失`)
  for (const w of ['木', '火', '土', '金', '水']) {
    if (!Number.isFinite(o.wuxing[w])) bad.push(`${r.entry.id}:wuxing.${w} 非法`)
  }
}
check('108 法结果全部合规', bad.length === 0, bad.slice(0, 8).join(' | '))

// 各法 essence 不应雷同（防止有人偷懒返回常量）
const uniqEssence = new Set(fullResults.filter((r) => r.outcome).map((r) => r.outcome.essence))
check('essence 多样（>60 种）', uniqEssence.size > 60, String(uniqEssence.size))

// 分数不应全同
const scores = fullResults.filter((r) => r.outcome).map((r) => r.outcome.score)
const uniqScores = new Set(scores.map((s) => Math.round(s)))
check('分数多样（>20 种）', uniqScores.size > 20, String(uniqScores.size))

// 每法都必须有自己的 detail 内容（不是空对象）
const emptyDetail = fullResults.filter((r) => r.outcome && Object.keys(r.outcome.detail ?? {}).length === 0)
check('每法都有 detail 内容', emptyDetail.length === 0, emptyDetail.map((r) => r.entry.id).join(','))

// ─────────── 3.5 诚实性：未报的输入必须标注 ───────────
section('3.5 诚实性回归（未报输入必须标注）')
// 用一个既没报外应、也没报姓名、也没要测字的问题
const plainChart = buildChart({ question: '这次合作能不能成', when: new Date(2026, 8, 30, 14, 30), longitude: 116.4, numbers: [7, 13, 21] })
const plainResults = runMany({ chart: plainChart })
const getPlain = (no) => plainResults.find((r) => r.entry.no === no)

// 外应类：用户没说，就必须标「未报外应·取象」并降 approx
for (const no of [95, 96, 97]) {
  const r = getPlain(no)
  check(`#${no} 未报外应时 essence 标注取象`,
    !!r.outcome && r.outcome.essence.startsWith('未报外应·取象：'), r.outcome?.essence ?? r.error)
  check(`#${no} 未报外应时降为 approx`, r.outcome?.fidelity === 'approx', String(r.outcome?.fidelity))
}
// 用户确实报了外应 → 不应标取象
const reportedChart = buildChart({ question: '左眼一直跳，是凶是吉', when: new Date(2026, 8, 30, 14, 30) })
const reportedYan = runMany({ chart: reportedChart }).find((r) => r.entry.no === 96)
check('#96 用户报了左眼跳时不标取象',
  !!reportedYan.outcome && !reportedYan.outcome.essence.startsWith('未报外应'), reportedYan.outcome?.essence)

// 测字类：没给字（也没给报数）就必须标「未报所测之字·取象」
const bareChart = buildChart({ question: '这次合作能不能成', when: new Date(2026, 8, 30, 14, 30), longitude: 116.4 })
const bareResults = runMany({ chart: bareChart })
for (const no of [92, 93]) {
  const r = bareResults.find((x) => x.entry.no === no)
  check(`#${no} 未报字时 essence 标注取象`,
    !!r.outcome && r.outcome.essence.startsWith('未报所测之字·取象：'), r.outcome?.essence ?? r.error)
}
// #92 给了报数时走「报数当笔画」这条正路：不标取象，但 detail 要说明用了报数
const numCezi = getPlain(92)
check('#92 有报数时按报数当笔画（不标取象）',
  !!numCezi.outcome && !numCezi.outcome.essence.startsWith('未报所测之字')
  && JSON.stringify(numCezi.outcome.detail).includes('报数'),
  numCezi.outcome?.essence)
// 给了字 → 不标取象且真的用那个字
const ceziChart = buildChart({ question: '测字：明，问前程', when: new Date(2026, 8, 30, 14, 30) })
const ceziHint = runMany({ chart: ceziChart }).find((r) => r.entry.no === 93)
check('#93 报了「明」时用该字且不标取象',
  !!ceziHint.outcome && !ceziHint.outcome.essence.startsWith('未报所测之字')
  && String(ceziHint.outcome.detail?.所拆之字 ?? '').startsWith('明'),
  `${ceziHint.outcome?.essence} / ${ceziHint.outcome?.detail?.所拆之字}`)

// 姓名类：没问名字时不得把问句片段冒充成姓名（曾把「这次和」当名字）
const wugePlain = JSON.stringify(getPlain(99).outcome?.detail ?? {})
check('#99 未报姓名时不把问句片段冒充姓名', !wugePlain.includes('这次和'), wugePlain.slice(0, 160))
const nameChart = buildChart({ question: '我叫张伟，这个名字好不好', when: new Date(2026, 8, 30, 14, 30) })
const wugeNm = JSON.stringify(runMany({ chart: nameChart }).find((r) => r.entry.no === 99).outcome?.detail ?? {})
check('#99 报了姓名时能提出「张伟」', wugeNm.includes('张伟'), wugeNm.slice(0, 160))

// ─────────── 4. 合盘 ───────────
section('4. 合盘聚合')
const board = aggregate({ results: fullResults, question: fullChart.question, chart: fullChart })
check('合盘总分在范围内', board.overall.score >= -100 && board.overall.score <= 100, String(board.overall.score))
check('票型总数 = 起法数', board.polarity.吉 + board.polarity.平 + board.polarity.凶 === fullComputed.length,
  `${board.polarity.吉}+${board.polarity.平}+${board.polarity.凶} vs ${fullComputed.length}`)
check('五行百分比合计 ≈ 100', Math.abs(Object.values(board.wuxing).reduce((a, b) => a + b, 0) - 100) < 1.5,
  String(Object.values(board.wuxing).reduce((a, b) => a + b, 0)))
check('有旺缺判定', board.dominant !== '—' && board.lacking !== '—')
check('断语非空', board.advice.length > 20)
check('分类统计覆盖 11 类', Object.keys(board.byCategory).length === CATEGORIES.length,
  Object.keys(board.byCategory).join(','))
check('保真度统计合计 = 起法数', board.meta.fidelityTally.full + board.meta.fidelityTally.core + board.meta.fidelityTally.approx === fullComputed.length)
check('问题归类生效', board.meta.topic === '事业', board.meta.topic)
// 防回归：共识/应期的均值必须有限数（曾因误用 r.score 而非 r.outcome.score 得到 NaN）
check('共识均值均为有限数', board.consensusKeys.every((k) => Number.isFinite(k.avg)),
  board.consensusKeys.filter((k) => !Number.isFinite(k.avg)).map((k) => k.key).join(','))
check('应期均值均为有限数', board.timing.every((t) => Number.isFinite(t.avg)),
  board.timing.filter((t) => !Number.isFinite(t.avg)).map((t) => t.text).join(','))
// 防回归：断语里曾出现 `[object Object]`（topic 传了对象而非名字）
check('断语无 [object Object]', !board.advice.includes('[object Object]'), board.advice.slice(0, 120))
check('断语含归类名', board.advice.includes('事业'), board.advice.slice(0, 120))

// ─────────── 5. 确定性 ───────────
section('5. 确定性与随机性')
const chartA = buildChart({ question: '同一问题', when: new Date(2026, 8, 30, 14, 30), longitude: 116.4 })
const chartB = buildChart({ question: '同一问题', when: new Date(2026, 8, 30, 14, 30), longitude: 116.4 })
const rA = runMany({ chart: chartA }).map((r) => r.outcome?.essence + '|' + r.outcome?.score)
const rB = runMany({ chart: chartB }).map((r) => r.outcome?.essence + '|' + r.outcome?.score)
check('同问同刻 → 结果完全一致', JSON.stringify(rA) === JSON.stringify(rB))

const chartC = buildChart({ question: '另一个完全不同的问题', when: new Date(2026, 8, 30, 14, 30), longitude: 116.4 })
const rC = runMany({ chart: chartC }).map((r) => r.outcome?.essence + '|' + r.outcome?.score)
const diffCount = rA.filter((v, i) => v !== rC[i]).length
check('换问题 → 相当比例的法结果改变', diffCount > 30, `变了 ${diffCount}/108`)

// 精确化：依赖随机源的术法必须变；纯历法的术法必须**不**变。
// 这一对断言比「变了多少条」更有意义——它同时证明了「随机确实在起作用」
// 与「历法类没有被随机污染」。
const essenceOf = (list, no) => list[no - 1]
const RANDOM_DEPENDENT = [1 /* 大衍 */, 2 /* 金钱卦 */, 90 /* 掷筊 */, 107 /* 塔罗 */, 108 /* 卢恩 */]
const CALENDAR_ONLY = [59 /* 黄历宜忌 */, 60 /* 建除 */, 61 /* 二十八宿择日 */, 62 /* 黄黑道 */, 69 /* 六曜 */]
for (const no of RANDOM_DEPENDENT) {
  check(`随机类 #${no} 随问题改变`, essenceOf(rA, no) !== essenceOf(rC, no), `${essenceOf(rA, no)} vs ${essenceOf(rC, no)}`)
}
for (const no of CALENDAR_ONLY) {
  check(`历法类 #${no} 不随问题改变`, essenceOf(rA, no) === essenceOf(rC, no), `${essenceOf(rA, no)} vs ${essenceOf(rC, no)}`)
}

// ─────────── 6. 输出与 token 预算 ───────────
section('6. 输出与 token 预算')
primeList(ENTRIES)
const table = renderTable(fullResults)
const summary = renderSummary(board)
const full = render({ board, results: fullResults, mode: 'normal' })
const list = renderList()
console.log(`  摘要 ${summary.length} 字 ｜ 明细表 ${table.length} 字 ｜ 完整输出 ${full.length} 字 ｜ 目录 ${list.length} 字`)
check('108 法明细表 < 9000 字（约 1.5k token 内）', table.length < 9000, String(table.length))
check('完整输出 < 12000 字', full.length < 12000, String(full.length))
check('明细表含 108 行', table.split('\n').length >= 109, String(table.split('\n').length))
check('摘要含关键小节', summary.includes('综合') && summary.includes('票型') && summary.includes('五行'))
check('摘要无 [object Object]', !summary.includes('[object Object]'))
check('摘要共识行无 NaN', !summary.includes('NaN'))
check('完整输出无 [object Object] 与 NaN', !full.includes('[object Object]') && !full.includes('NaN'))
check('目录列出 11 类', CATEGORIES.every((c) => list.includes(c)))

// 下钻
const detailText = render({ board, results: fullResults, mode: 'brief', detailNos: [31, 3] })
check('下钻输出含指定法', detailText.includes('大六壬') && detailText.includes('六爻纳甲'))

// ─────────── 7. 方法解析 ───────────
section('7. 方法选择器')
check('按编号解析', resolveMethod('31').length === 1 && resolveMethod('31')[0].id === 'daliuren')
check('按 id 解析', resolveMethod('qimen-shi').length === 1)
check('按中文名精确解析', resolveMethod('小六壬').length === 1)
check('按中文名模糊解析', resolveMethod('六壬').length >= 4, String(resolveMethod('六壬').length))
check('无效选择器返回空', resolveMethod('不存在的东西xyz').length === 0)

// ─────────── 8. 问题归类 ───────────
section('8. 问题归类')
check('姻缘', detectTopic('我跟他还有姻缘吗').topic === '姻缘')
check('财运', detectTopic('这笔投资能不能赚钱').topic === '财运')
check('健康', detectTopic('这个病能不能好').topic === '健康')
check('综合兜底', detectTopic('嗯').topic === '综合')

// ─────────── 汇总 ───────────
console.log(`\n${'='.repeat(50)}`)
console.log(`通过 ${pass} ｜ 失败 ${fail}`)
if (fail > 0) {
  console.log('\n失败项：')
  for (const f of failures) console.log('  · ' + f)
  process.exit(1)
}
console.log('全部通过 ✅')

// 顺带打印一次真实输出样本（人眼可读性检查）
if (process.env.SHOW_SAMPLE === '1') {
  console.log('\n' + '='.repeat(50) + '\n样例输出：\n')
  console.log(render({ board, results: fullResults, mode: 'normal' }))
}
