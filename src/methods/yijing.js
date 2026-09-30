/**
 * 方法模块 · 易卦类（24 法）
 *
 * 这是**参考实现**：其余 7 个模块都照这个结构写。
 *
 * ## 契约
 * ```js
 * export const engines = { 引擎名(chart, entry, rand) { ... return 结果对象 } }
 * ```
 * 结果对象字段：`score`(-100..100) / `essence`(一句话，≤60字) / `keys`(共识关键词)
 * / `wuxing`(五行信号) / `timing`(应期) / `detail`(完整盘) / `fidelity`(可覆盖条目默认)。
 * 返回 `null` 表示本法此局无解（运行器记为「未起」）。**禁止抛异常**。
 *
 * ## 本模块共用的起卦与断卦口径（写在明处）
 * - 爻值：6 老阴(动) / 7 少阳 / 8 少阴 / 9 老阳(动)；1 = 阳，0 = 阴。
 * - 动爻：6 与 9。变卦 = 动爻取反。
 * - 断分三源叠加：**卦气**（月令旺衰）×0.5 + **卦德**（六十四卦吉凶倾向）×1.0
 *   + **体用**（梅花）/ **世应**（六爻）。这是公开通例的组合方式，可改。
 */

import {
  makeOutcome, SHENG, KE, relation, wangShuai, relationScore, mod,
  emptyWuxing, ZHI_WUXING, GAN_WUXING, GAN, ZHI, xunOf, clamp,
} from '../core/kit.js'
import {
  TRIGRAMS, TRI_BY_NAME, hexNameOf, hexNameOfBits, hexInfoOf, HEX_POLARITY,
  HEX_ORDER, najiaOf, liuQinOf, PALACES, HEX_PALACE, TAIXUAN_81, LINGQI_POS,
} from '../core/tables.js'

// ───────────────────────── 起卦原语 ─────────────────────────

/**
 * 大衍筮法掷一爻（三变成一爻）。
 * 第一变 49 策 → 挂一 → 左右各数四 → 余策 44/40；二三变类推，末得 36/32/28/24 ÷ 4。
 * @param {import('../core/kit.js').Rand} rand 随机源。
 * @returns {number} 爻值 6/7/8/9。
 */
function yarrowLine(rand) {
  let sticks = 49
  for (let k = 0; k < 3; k += 1) {
    // 分二：左右两堆，右堆挂一
    const left = 1 + rand.below(Math.max(1, sticks - 2))
    const right = sticks - left - 1
    // 揲四：左右各以四为组取余（余 0 作 4），加挂一之策
    const take = ((left % 4) || 4) + ((right % 4) || 4) + 1
    sticks -= take
  }
  return sticks / 4
}

/**
 * 三枚铜钱掷一爻。背 = 3 分，字 = 2 分；三背 9 老阳、两背 8 少阴、一背 7 少阳、零背 6 老阴。
 * @param {import('../core/kit.js').Rand} rand 随机源。
 * @returns {{value:number, coins:number[]}} 爻值与背数。
 */
function coinLine(rand) {
  let backs = 0
  for (let i = 0; i < 3; i += 1) if (rand.chance(0.5)) backs += 1
  return { value: 6 + backs, coins: [backs] }
}

/** 爻值 → 阴阳位（1 阳 / 0 阴）。 */
const bitOf = (v) => (v === 7 || v === 9 ? 1 : 0)
/** 爻值 → 是否动爻。 */
const isMoving = (v) => v === 6 || v === 9

/**
 * 六爻掷卦。
 * @param {import('../core/kit.js').Rand} rand 随机源。
 * @param {'yarrow'|'coin'} method 起卦法。
 * @param {number[]} [fixed] 指定爻值（回放）。
 * @returns {{values:number[], bits:number[], changed:number[], moving:number[]}} 卦。
 */
function castSix(rand, method, fixed) {
  const values = []
  for (let i = 0; i < 6; i += 1) {
    if (fixed && Number.isFinite(fixed[i])) values.push(fixed[i])
    else values.push(method === 'yarrow' ? yarrowLine(rand) : coinLine(rand).value)
  }
  const bits = values.map(bitOf)
  const changed = bits.map((b, i) => (isMoving(values[i]) ? 1 - b : b))
  const moving = values.map((v, i) => (isMoving(v) ? i + 1 : 0)).filter((x) => x > 0)
  return { values, bits, changed, moving }
}

/**
 * 由三数起卦（梅花/报数/测字通用）。
 * @param {number} a 上卦数。
 * @param {number} b 下卦数。
 * @param {number} c 动爻数。
 * @returns {{bits:number[], changed:number[], movePos:number}} 卦。
 */
function guaFromNumbers(a, b, c) {
  const up = mod(Math.round(a) - 1, 8) + 1
  const lo = mod(Math.round(b) - 1, 8) + 1
  const mv = mod(Math.round(c) - 1, 6) + 1
  const upT = TRIGRAMS.find((t) => t.xian === up) ?? TRIGRAMS[0]
  const loT = TRIGRAMS.find((t) => t.xian === lo) ?? TRIGRAMS[0]
  const bits = [...loT.bits, ...upT.bits]
  const changed = bits.slice()
  changed[mv - 1] = 1 - changed[mv - 1]
  return { bits, changed, movePos: mv }
}

/** 互卦：二三四爻为下卦，三四五爻为上卦。 */
function huGua(bits) {
  return [bits[1], bits[2], bits[3], bits[2], bits[3], bits[4]]
}

/** 错卦（六爻全变）。 */
const cuoGua = (bits) => bits.map((b) => 1 - b)
/** 综卦（六爻倒置）。 */
const zongGua = (bits) => bits.slice().reverse()

/**
 * 体用：动爻在下卦（1-3）则下卦为用、上卦为体；反之亦然。
 * @param {number[]} bits 本卦六爻。
 * @param {number} movePos 动爻位（1..6）。
 * @returns {{ti:string, yong:string, tiWx:string, yongWx:string, rel:string, score:number}}
 */
function tiYongOf(bits, movePos) {
  const upName = TRIGRAMS.find((t) => t.bits.join('') === bits.slice(3, 6).join(''))?.name ?? '乾'
  const loName = TRIGRAMS.find((t) => t.bits.join('') === bits.slice(0, 3).join(''))?.name ?? '乾'
  const ti = movePos <= 3 ? upName : loName
  const yong = movePos <= 3 ? loName : upName
  const tiWx = TRI_BY_NAME[ti]?.wx ?? '土'
  const yongWx = TRI_BY_NAME[yong]?.wx ?? '土'
  const rel = relation(tiWx, yongWx)
  // 体用吉凶：用生体最吉、比和次吉、体克用小吉、体生用小凶、用克体大凶
  const score = { 生我: 70, 比和: 45, 我克: 25, 我生: -15, 克我: -75 }[rel] ?? 0
  return { ti, yong, tiWx, yongWx, rel, score }
}

/**
 * 通用断卦：卦德 + 卦气 + 动爻数 + 体用。
 * @param {object} chart 盘基。
 * @param {number[]} bits 本卦。
 * @param {number} movePos 动爻位。
 * @param {object} [opts] 选项。
 * @returns {{score:number, keys:string[], detail:object, info:object}} 断果。
 */
function judgeGua(chart, bits, movePos, opts = {}) {
  const info = hexInfoOf(bits)
  const changed = bits.slice()
  changed[movePos - 1] = 1 - changed[movePos - 1]
  const bianInfo = hexInfoOf(changed)
  const hu = hexInfoOf(huGua(bits))
  const ty = tiYongOf(bits, movePos)

  const gas = wangShuai(info.wuxing || '土', chart.monthWx)   // 卦气（月令）
  const gasPart = (gas.score - 55) * 0.5                      // 55 为中性基准
  const dePart = info.polarity                                // 卦德
  const tyPart = (ty.score - 20) * 0.45                       // 体用（20 为中性基准）
  const bianPart = bianInfo.polarity * 0.3                    // 变卦（事之趋向）

  let score = dePart * 0.5 + gasPart + tyPart + bianPart
  // 动爻数修正：一爻动最专，多爻动则杂
  const moveCount = opts.moveCount ?? 1
  if (moveCount === 1) score += 5
  else if (moveCount >= 4) score -= 8
  if (moveCount === 6) score -= 6

  score = clamp(score, -100, 100)

  const keys = []
  keys.push(`${info.name}`)
  if (bianInfo.name !== info.name) keys.push(`之${bianInfo.name}`)
  keys.push(ty.rel)
  keys.push(gas.state)
  if (hu.wuxing && hu.wuxing !== info.wuxing) keys.push(`互${hu.name}`)

  const wuxing = emptyWuxing()
  wuxing[info.wuxing] = (wuxing[info.wuxing] ?? 0) + 2
  wuxing[bianInfo.wuxing] = (wuxing[bianInfo.wuxing] ?? 0) + 1
  wuxing[chart.monthWx] = (wuxing[chart.monthWx] ?? 0) + 1

  return {
    score,
    keys,
    info,
    detail: {
      本卦: `${info.name}（序${info.order}，上${info.upper}下${info.lower}，${info.wuxing}）`,
      卦画: info.lines,
      动爻: `第${movePos}爻`,
      变卦: `${bianInfo.name}（${bianInfo.wuxing}）`,
      互卦: `${hu.name}（${hu.wuxing}）`,
      体用: `体${ty.ti}(${ty.tiWx}) 用${ty.yong}(${ty.yongWx}) → ${ty.rel}`,
      卦气: `${gas.state}（月令${chart.monthWx}）`,
      错卦: hexNameOfBits(cuoGua(bits)),
      综卦: hexNameOfBits(zongGua(bits)),
    },
    wuxing,
  }
}

/**
 * 按所问事类取用神（六爻）。
 * @param {string} question 所问。
 * @returns {{god:string, why:string}} 用神。
 */
function useGodOf(question) {
  const q = String(question ?? '')
  const table = [
    { god: '妻财', kw: ['财', '钱', '投资', '生意', '买卖', '回款', '收入', '价', '工资', '奖金'], why: '问财以妻财为用' },
    { god: '官鬼', kw: ['工作', '事业', '官', '升职', '考试', '诉讼', '官司', '病', '疾', '鬼', '上司', '职位'], why: '问官鬼之事以官鬼为用' },
    { god: '父母', kw: ['房', '宅', '文书', '合同', '学业', '父母', '车', '消息', '信', '证件'], why: '问文书房产以父母为用' },
    { god: '子孙', kw: ['子', '女', '孕', '健康', '平安', '福', '医药', '解', '顺'], why: '问子孙福泽以子孙为用' },
    { god: '兄弟', kw: ['兄弟', '朋友', '竞争', '合伙', '同事', '同行', '同学'], why: '问同辈竞争以兄弟为用' },
  ]
  for (const t of table) if (t.kw.some((k) => q.includes(k))) return { god: t.god, why: t.why }
  return { god: '世爻', why: '事类不明，以世爻为用' }
}

// ───────────────────────── 引擎实现 ─────────────────────────

export const engines = {
  // ── 1 大衍筮法 ──
  yarrow(chart, entry, rand) {
    const g = castSix(rand, 'yarrow', chart.coins.length >= 6 ? chart.coins : undefined)
    const movePos = g.moving[0] ?? 0
    if (movePos === 0) {
      const info = hexInfoOf(g.bits)
      return {
        score: info.polarity * 0.8,
        essence: `${info.name}·六爻安静，以卦德断`,
        keys: [info.name, '安静', '守常'],
        wuxing: { [info.wuxing]: 3 },
        timing: null,
        detail: { 得策: g.values.join(' '), 卦: `${info.name}（序${info.order}）`, 卦画: info.lines, 断: '六爻不动，事无变更，以卦德与月令断' },
      }
    }
    const j = judgeGua(chart, g.bits, movePos, { moveCount: g.moving.length })
    return {
      score: j.score,
      essence: `${j.info.name}之${hexInfoOf(g.changed).name}·${j.detail.体用}`,
      keys: j.keys,
      wuxing: j.wuxing,
      timing: null,
      detail: { 得策: g.values.join(' ') + '（6老阴7少阳8少阴9老阳）', 动爻: g.moving.join(','), ...j.detail },
    }
  },

  // ── 2 金钱卦 ──
  coinHex(chart, entry, rand) {
    const g = castSix(rand, 'coin', chart.coins.length >= 6 ? chart.coins : undefined)
    const movePos = g.moving[0] ?? 0
    const info = hexInfoOf(g.bits)
    if (movePos === 0) {
      return {
        score: info.polarity * 0.85,
        essence: `${info.name}·无动爻，静守之象`,
        keys: [info.name, '安静'],
        wuxing: { [info.wuxing]: 3 },
        timing: null,
        detail: { 六掷: g.values.join(' '), 卦: `${info.name}（序${info.order}）`, 卦画: info.lines },
      }
    }
    const j = judgeGua(chart, g.bits, movePos, { moveCount: g.moving.length })
    return {
      score: j.score,
      essence: `${j.info.name}之${hexInfoOf(g.changed).name}·动${g.moving.length}爻`,
      keys: j.keys,
      wuxing: j.wuxing,
      timing: null,
      detail: { 六掷: g.values.join(' '), 动爻: g.moving.join(','), ...j.detail },
    }
  },

  // ── 3 六爻纳甲 ──
  najia(chart, entry, rand) {
    const g = castSix(rand, 'coin', chart.coins.length >= 6 ? chart.coins : undefined)
    const gua = najiaOf(g.bits, chart.dayGan)
    const ug = useGodOf(chart.question)
    const bianGua = najiaOf(g.changed, chart.dayGan)

    // 用神所在爻
    const yongLine = ug.god === '世爻'
      ? gua.lines.find((l) => l.isShi)
      : gua.lines.find((l) => l.qin === ug.god)

    const linesTxt = gua.lines.map((l) => {
      const mov = isMoving(g.values[l.pos - 1]) ? '○动' : ''
      const kong = (chart.xunKong.day ?? '').includes(l.zhi) ? '空' : ''
      return `${l.posName}${l.yang ? '阳' : '阴'} ${l.gan}${l.zhi}${l.wuxing} ${l.qin}${l.shen}${l.isShi ? '世' : ''}${l.isYing ? '应' : ''}${mov}${kong}`
    })

    let score = hexInfoOf(g.bits).polarity * 0.35
    const keys = [gua.name, `${gua.palace}宫${gua.stage}`, ug.god]

    if (yongLine) {
      const ws = wangShuai(yongLine.wuxing, chart.monthWx)
      score += (ws.score - 55) * 0.8
      keys.push(`用神${ws.state}`)
      // 日辰生克用神
      const dayWx = ZHI_WUXING[chart.dayZhi] ?? '土'
      const r = relation(dayWx, yongLine.wuxing)
      if (r === '生我') { score += 18; keys.push('日辰生用') }
      if (r === '克我') { score -= 22; keys.push('日辰克用') }
      if (r === '比和') { score += 10; keys.push('日辰比用') }
      // 空亡
      if ((chart.xunKong.day ?? '').includes(yongLine.zhi)) { score -= 20; keys.push('用神空亡') }
      // 入墓 / 逢冲
      if ((chart.ganzhi.day[1] ?? '') && (ZHI_WUXING[chart.ganzhi.day[1]] === yongLine.wuxing) && chart.ganzhi.day[1] === yongLine.zhi) {
        score += 15; keys.push('用神值日')
      }
    } else {
      keys.push('用神不上卦')
      score -= 12
    }

    // 世应关系
    const shi = gua.lines.find((l) => l.isShi)
    const ying = gua.lines.find((l) => l.isYing)
    if (shi && ying) {
      const r = relation(shi.wuxing, ying.wuxing)
      score += relationScore(r, { 比和: 15, 生我: 30, 我生: -5, 我克: 20, 克我: -35 }) * 0.5
      keys.push(`世应${r}`)
    }

    // 动爻对用神的生克
    if (yongLine) {
      for (const pos of g.moving) {
        const ml = gua.lines[pos - 1]
        if (!ml || ml.pos === yongLine.pos) continue
        const r = relation(ml.wuxing, yongLine.wuxing)
        if (r === '生我') { score += 14; keys.push('动爻生用') }
        if (r === '克我') { score -= 16; keys.push('动爻克用') }
      }
    }

    score = clamp(score, -100, 100)
    const wuxing = emptyWuxing()
    for (const l of gua.lines) wuxing[l.wuxing] += 0.5
    wuxing[chart.monthWx] += 1

    return {
      score,
      essence: `${gua.name}(${gua.palace}宫${gua.stage}) ${ug.god}${yongLine ? wangShuai(yongLine.wuxing, chart.monthWx).state : '不上卦'}`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing,
      timing: yongLine ? `${['初', '二', '三', '四', '五', '上'][yongLine.pos - 1]}爻${yongLine.zhi}日应` : null,
      detail: {
        六掷: g.values.join(' '),
        卦: `${gua.name}（${gua.palace}宫·${gua.stage}）`,
        变卦: bianGua.name,
        用神: `${ug.god} — ${ug.why}`,
        用神爻: yongLine ? `${yongLine.posName}爻 ${yongLine.gan}${yongLine.zhi}(${yongLine.wuxing})` : '不上卦',
        世应: `世${gua.shiPos} 应${gua.yingPos}`,
        装卦: linesTxt,
        旬空: chart.xunKong.day,
      },
    }
  },

  // ── 4 世应六亲 ──
  shiying(chart, entry, rand) {
    const g = castSix(rand, 'coin')
    const gua = najiaOf(g.bits, chart.dayGan)
    const shi = gua.lines.find((l) => l.isShi)
    const ying = gua.lines.find((l) => l.isYing)
    const rel = relation(shi.wuxing, ying.wuxing)
    let score = relationScore(rel, { 比和: 40, 生我: 65, 我生: -10, 我克: 45, 克我: -60 })
    const keys = [`世应${rel}`, `${gua.palace}宫`, gua.stage]

    const wsShi = wangShuai(shi.wuxing, chart.monthWx)
    score += (wsShi.score - 55) * 0.4
    keys.push(`世${wsShi.state}`)

    // 世爻空亡
    if ((chart.xunKong.day ?? '').includes(shi.zhi)) { score -= 25; keys.push('世空') }
    // 世爻受动爻克
    for (const pos of g.moving) {
      const ml = gua.lines[pos - 1]
      if (ml && ml.pos !== shi.pos && relation(ml.wuxing, shi.wuxing) === '克我') { score -= 18; keys.push('动克世') }
    }

    return {
      score: clamp(score, -100, 100),
      essence: `世${shi.qin}${shi.zhi} 应${ying.qin}${ying.zhi}·${rel}`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: { [shi.wuxing]: 2, [ying.wuxing]: 1 },
      timing: null,
      detail: {
        卦: gua.name,
        世爻: `${shi.posName}爻 ${shi.gan}${shi.zhi}(${shi.wuxing}) ${shi.qin} ${shi.shen}`,
        应爻: `${ying.posName}爻 ${ying.gan}${ying.zhi}(${ying.wuxing}) ${ying.qin} ${ying.shen}`,
        世应关系: rel,
        六亲: gua.lines.map((l) => `${l.posName}:${l.qin}`).join(' '),
        断: rel === '生我' ? '应生世，他方助我，事可成' : rel === '克我' ? '应克世，他方制我，事多阻' : rel === '比和' ? '世应比和，同心可成' : '世应相制，宜自守',
      },
    }
  },

  // ── 5-8 梅花易数（时间/报数/外应/字占） ──
  meihua(chart, entry, rand) {
    const mode = entry.params?.mode ?? 'time'
    let a; let b; let c; let how

    if (mode === 'number' && chart.numbers.length >= 2) {
      a = chart.numbers[0]
      b = chart.numbers[1]
      c = chart.numbers[2] ?? (a + b + (chart.numbers[3] ?? 0))
      how = `报数 ${chart.numbers.join('/')}`
    } else if (mode === 'word') {
      // 字占：以字取数。默认用字码（确定性、可复现），可用 numbers 传笔画覆盖。
      const chars = [...(chart.question || '占')].filter((ch) => /\S/.test(ch))
      if (chart.numbers.length >= 2) {
        a = chart.numbers[0]; b = chart.numbers[1]; c = chart.numbers[2] ?? (a + b)
        how = `笔画(用户给) ${chart.numbers.join('/')}`
      } else {
        const code = (ch) => ch.codePointAt(0) % 100
        const half = Math.max(1, Math.ceil(chars.length / 2))
        const up = chars.slice(0, half).reduce((s, ch) => s + code(ch), 0)
        const lo = chars.slice(half).reduce((s, ch) => s + code(ch), 0) || up
        a = up; b = lo; c = up + lo + (chart.hourZhi ? ZHI.indexOf(chart.hourZhi) + 1 : 0)
        how = `字码取数（「${chars.join('')}」；如需传统笔画法请传 numbers）`
      }
    } else if (mode === 'waiying') {
      // 外应：以时刻之外物取数——此处取「时辰序 + 日支序 + 随机外应」三数
      const h = ZHI.indexOf(chart.hourZhi) + 1
      const d = ZHI.indexOf(chart.dayZhi) + 1
      const wai = 1 + rand.below(8)
      a = h + d
      b = h + d + wai
      c = a + b
      how = `外应取数（时${chart.hourZhi}${h} + 日支${chart.dayZhi}${d} + 外物${wai}）`
    } else {
      // 时间起卦：年支序 + 农历月 + 农历日，加时数
      const y = ZHI.indexOf(chart.yearZhi) + 1
      const mo = Math.abs(chart.lunar.month) || 1
      const d = chart.lunar.day || 1
      const h = ZHI.indexOf(chart.hourZhi) + 1
      a = y + mo + d
      b = a + h
      c = b
      how = `时间起卦（年支${y} + 月${mo} + 日${d} = ${a}；加${chart.hourZhi}时${h} = ${b}）`
    }

    const g = guaFromNumbers(a, b, c)
    const j = judgeGua(chart, g.bits, g.movePos)
    const ty = tiYongOf(g.bits, g.movePos)
    const bianInfo = hexInfoOf(g.changed)

    return {
      score: j.score,
      essence: `${j.info.name}之${bianInfo.name}·体${ty.ti}用${ty.yong}${ty.rel}`,
      keys: j.keys,
      wuxing: j.wuxing,
      timing: null,
      detail: {
        起卦: how,
        上卦: `${TRIGRAMS.find((t) => t.xian === (mod(a - 1, 8) + 1))?.name}（${a}÷8）`,
        下卦: `${TRIGRAMS.find((t) => t.xian === (mod(b - 1, 8) + 1))?.name}（${b}÷8）`,
        动爻: `第${g.movePos}爻（${c}÷6）`,
        ...j.detail,
      },
    }
  },

  // ── 9 体用生克 ──
  tiyong(chart, entry, rand) {
    const y = ZHI.indexOf(chart.yearZhi) + 1
    const mo = Math.abs(chart.lunar.month) || 1
    const d = chart.lunar.day || 1
    const h = ZHI.indexOf(chart.hourZhi) + 1
    const g = guaFromNumbers(y + mo + d, y + mo + d + h, y + mo + d + h)
    const ty = tiYongOf(g.bits, g.movePos)
    const j = judgeGua(chart, g.bits, g.movePos)
    const gasTi = wangShuai(ty.tiWx, chart.monthWx)
    const gasYong = wangShuai(ty.yongWx, chart.monthWx)

    return {
      score: clamp(ty.score + (gasTi.score - 55) * 0.4 - (gasYong.score - 55) * 0.3, -100, 100),
      essence: `体${ty.ti}(${ty.tiWx})${gasTi.state} 用${ty.yong}(${ty.yongWx})${gasYong.state} → ${ty.rel}`,
      keys: [`体${ty.ti}`, `用${ty.yong}`, ty.rel, `体${gasTi.state}`],
      wuxing: { [ty.tiWx]: 2, [ty.yongWx]: 1, [chart.monthWx]: 1 },
      timing: null,
      detail: {
        卦: j.info.name,
        体: `${ty.ti}（${ty.tiWx}·${gasTi.state}）`,
        用: `${ty.yong}（${ty.yongWx}·${gasYong.state}）`,
        关系: ty.rel,
        互卦: j.detail.互卦,
        变卦: j.detail.变卦,
        断: {
          生我: '用生体，得外力之助，大吉',
          比和: '体用比和，事顺而缓',
          我克: '体克用，我能制事，小吉',
          我生: '体生用，耗我之力，小凶',
          克我: '用克体，事来克我，大凶',
        }[ty.rel],
      },
    }
  },

  // ── 10 京房八宫 ──
  palace(chart, entry, rand) {
    const g = castSix(rand, 'coin')
    const info = hexInfoOf(g.bits)
    const pal = HEX_PALACE[info.name]
    if (!pal) return null
    const shiLine = najiaOf(g.bits, chart.dayGan).lines.find((l) => l.isShi)
    const ws = wangShuai(shiLine.wuxing, chart.monthWx)
    // 世爻位次：本宫世六最稳，游魂归魂多变
    const stageBonus = { 本宫: 20, 一世: 8, 二世: 5, 三世: 0, 四世: -5, 五世: -10, 游魂: -18, 归魂: -8 }
    return {
      score: clamp(info.polarity * 0.6 + (ws.score - 55) * 0.5 + (stageBonus[pal.stage] ?? 0), -100, 100),
      essence: `${pal.palace}宫${pal.stage}·世${pal.shi}爻${shiLine.qin}${ws.state}`,
      keys: [`${pal.palace}宫`, pal.stage, `世${shiLine.qin}`],
      wuxing: { [TRI_BY_NAME[pal.palace].wx]: 3 },
      timing: null,
      detail: {
        卦: info.name,
        宫: `${pal.palace}宫`,
        位次: pal.stage,
        世爻: `第${pal.shi}爻`,
        应爻: `第${((pal.shi - 1 + 3) % 6) + 1}爻`,
        五行: TRI_BY_NAME[pal.palace].wx,
        八宫位: PALACES[pal.palace].join(' → '),
      },
    }
  },

  // ── 11 火珠林古法 ──
  huozhulin(chart, entry, rand) {
    const g = castSix(rand, 'coin')
    const gua = najiaOf(g.bits, chart.dayGan)
    const ug = useGodOf(chart.question)
    const yong = ug.god === '世爻' ? gua.lines.find((l) => l.isShi) : gua.lines.find((l) => l.qin === ug.god)
    // 古法重「日月建」：以月建为提纲、日辰为主宰
    let score = 0
    const keys = [gua.name, '日月为纲']
    if (yong) {
      const mws = wangShuai(yong.wuxing, chart.monthWx)
      const dws = wangShuai(yong.wuxing, ZHI_WUXING[chart.dayZhi] ?? '土')
      score += (mws.score - 55) * 0.6 + (dws.score - 55) * 0.6
      keys.push(`月${mws.state}`, `日${dws.state}`)
      if (mws.state === '旺' && dws.state === '旺') { score += 20; keys.push('旺相得令') }
      if (mws.state === '死' || mws.state === '囚') { score -= 15; keys.push('失令') }
    } else { score -= 15; keys.push('用神不上卦') }
    return {
      score: clamp(score, -100, 100),
      essence: `${gua.name}·${ug.god}${yong ? wangShuai(yong.wuxing, chart.monthWx).state : '不上卦'}`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: { [chart.monthWx]: 2, [ZHI_WUXING[chart.dayZhi] ?? '土']: 2 },
      timing: null,
      detail: {
        卦: gua.name,
        月建: chart.ganzhi.month,
        日辰: chart.ganzhi.day,
        用神: `${ug.god}（${ug.why}）`,
        装卦: gua.lines.map((l) => `${l.posName} ${l.gan}${l.zhi}${l.wuxing} ${l.qin}`).join(' | '),
        古法要旨: '火珠林以钱代蓍，重月建提纲、日辰主宰，用神得日月生扶则吉',
      },
    }
  },

  // ── 12 文王卦用神法 ──
  yongshen(chart, entry, rand) {
    const g = castSix(rand, 'coin')
    const gua = najiaOf(g.bits, chart.dayGan)
    const ug = useGodOf(chart.question)
    const yong = ug.god === '世爻' ? gua.lines.find((l) => l.isShi) : gua.lines.find((l) => l.qin === ug.god)
    const yuan = gua.lines.find((l) => relation(l.wuxing, yong?.wuxing ?? '土') === '生我')
    const ji = gua.lines.find((l) => relation(l.wuxing, yong?.wuxing ?? '土') === '克我')
    let score = yong ? wangShuai(yong.wuxing, chart.monthWx).score - 40 : -20
    const keys = [ug.god]
    if (yuan) { score += 22; keys.push('原神有力') }
    if (ji) { score -= 25; keys.push('忌神当权') }
    if (yong && !yuan && !ji) keys.push('无原无忌')
    return {
      score: clamp(score, -100, 100),
      essence: `用神${ug.god}${yong ? `(${yong.gan}${yong.zhi}${yong.wuxing})` : '不上卦'}${yuan ? '·原神生扶' : ''}${ji ? '·忌神克害' : ''}`,
      keys: [...new Set(keys)].slice(0, 6),
      wuxing: yong ? { [yong.wuxing]: 3 } : emptyWuxing(),
      timing: null,
      detail: {
        卦: gua.name,
        用神: `${ug.god} — ${ug.why}`,
        用神爻: yong ? `${yong.posName}爻 ${yong.gan}${yong.zhi}(${yong.wuxing}) ${yong.shen}` : '不上卦',
        原神: yuan ? `${yuan.posName}爻 ${yuan.qin}${yuan.zhi}(${yuan.wuxing})` : '无',
        忌神: ji ? `${ji.posName}爻 ${ji.qin}${ji.zhi}(${ji.wuxing})` : '无',
        世应: `世${gua.shiPos}应${gua.yingPos}`,
        断: '文王卦以用神为核心：用神旺相有原神生扶则吉，忌神当权则凶',
      },
    }
  },

  // ── 13 焦氏易林 ──
  yilin(chart, entry, rand) {
    const g = castSix(rand, 'coin')
    const ben = hexInfoOf(g.bits)
    const bian = hexInfoOf(g.changed)
    const linIndex = HEX_ORDER[ben.name] * 64 + HEX_ORDER[bian.name]
    // 无 4096 林辞原文，按卦象推：本卦德 × 变卦德 + 变卦方向
    const score = clamp(ben.polarity * 0.5 + bian.polarity * 0.5, -100, 100)
    return {
      score,
      essence: `${ben.name}之${bian.name}（林序${linIndex}）·${score > 15 ? '吉' : score < -15 ? '凶' : '中平'}`,
      keys: [ben.name, `之${bian.name}`, '卦变'],
      wuxing: { [ben.wuxing]: 2, [bian.wuxing]: 2 },
      timing: null,
      fidelity: 'approx',
      detail: {
        本卦: `${ben.name}（序${ben.order}）`,
        变卦: `${bian.name}（序${bian.order}）`,
        林序: `${linIndex} / 4096`,
        说明: '焦氏易林共 4096 林辞，本插件未内置辞书原文；此处以「本卦德 × 变卦德」的卦变关系断吉凶，不冒充林辞。',
      },
    }
  },

  // ── 14 太玄数 ──
  taixuan(chart, entry, rand) {
    const y = ZHI.indexOf(chart.yearZhi) + 1
    const mo = Math.abs(chart.lunar.month) || 1
    const d = chart.lunar.day || 1
    const n = (y * mo + d + rand.below(81)) % 81
    const shou = TAIXUAN_81[n === 0 ? 80 : n - 1]
    const fang = Math.floor((n === 0 ? 80 : n - 1) / 27) + 1
    const zhou = Math.floor(((n === 0 ? 80 : n - 1) % 27) / 9) + 1
    const bu = (((n === 0 ? 80 : n - 1) % 9)) + 1
    // 首序奇偶 + 五行配属定吉凶（公开近似）
    const odd = (n % 2) === 1
    const score = clamp((odd ? 20 : -20) + (bu <= 5 ? 15 : -10) + (fang === 2 ? 10 : 0), -100, 100)
    return {
      score,
      essence: `太玄首「${shou}」·${fang}方${zhou}州${bu}部·${odd ? '奇' : '偶'}`,
      keys: [`首${shou}`, `${fang}方`, odd ? '奇' : '偶'],
      wuxing: { [['木', '火', '土', '金', '水'][(n % 5)] ]: 3 },
      timing: null,
      fidelity: 'approx',
      detail: {
        首名: shou,
        方州部: `${fang}方 ${zhou}州 ${bu}部`,
        首序: n === 0 ? 81 : n,
        说明: '太玄八十一首，本插件按「三方九州二十七部」定首与部位；首辞原文未内置，吉凶按奇偶与部位通例取值。',
      },
    }
  },

  // ── 15 元包数 ──
  yuanbao(chart, entry, rand) {
    const g = castSix(rand, 'coin')
    // 元包以坤为首，卦序与周易不同：以坤卦序（2）为起点重排
    const ben = hexInfoOf(g.bits)
    const yuanbaoOrder = mod(HEX_ORDER[ben.name] - HEX_ORDER['坤为地'], 64) + 1
    const score = clamp(ben.polarity * 0.7, -100, 100)
    return {
      score,
      essence: `元包${yuanbaoOrder}·${ben.name}·以坤为首`,
      keys: [ben.name, '元包'],
      wuxing: { [ben.wuxing]: 3 },
      timing: null,
      fidelity: 'approx',
      detail: { 卦: ben.name, 元包序: yuanbaoOrder, 说明: '元包以坤为首重排六十四卦；本插件按重排序位与卦德断，未内置元包原辞。' },
    }
  },

  // ── 16 潜虚数 ──
  qianxu(chart, entry, rand) {
    const g = castSix(rand, 'coin')
    const ben = hexInfoOf(g.bits)
    const n = mod(HEX_ORDER[ben.name] * 7 + rand.below(55), 55) + 1
    const score = clamp(ben.polarity * 0.6, -100, 100)
    return {
      score,
      essence: `潜虚名${n}·${ben.name}`,
      keys: [ben.name, '潜虚'],
      wuxing: { [ben.wuxing]: 3 },
      timing: null,
      fidelity: 'approx',
      detail: { 卦: ben.name, 潜虚名序: `${n} / 55`, 说明: '司马光潜虚五十五名，原文未内置；按名序与卦德近似取值。' },
    }
  },

  // ── 17 皇极经世 ──
  huangji(chart, entry, rand) {
    // 元会运世：1 元 = 12 会 = 360 运 = 4320 世；1 世 = 30 年
    const year = chart.solar.y
    const base = 67017 // 邵雍纪年基准（公元 1 年前 67017 年为一元之始）
    const elapsed = year + base
    const shi = Math.floor(elapsed / 30)
    const yun = Math.floor(shi / 12)
    const hui = Math.floor(yun / 30)
    const yuan = Math.floor(hui / 12)
    const nowHui = hui % 12
    const nowYun = yun % 30
    const nowShi = shi % 12
    // 会运世所处位置的阴阳消长：子会一阳生（吉）→ 午会一阴生（衰）
    const phase = ['长', '盛', '衰', '消']
    const phaseIdx = nowHui < 3 ? 0 : nowHui < 6 ? 1 : nowHui < 9 ? 2 : 3
    const score = clamp([35, 55, -25, -50][phaseIdx] + (nowYun < 15 ? 10 : -10), -100, 100)
    return {
      score,
      essence: `第${yuan}元${nowHui}会${nowYun}运${nowShi}世·气${phase[phaseIdx]}`,
      keys: [`${nowHui}会`, phase[phaseIdx], '元会运世'],
      wuxing: { [['水', '木', '火', '土'][nowHui % 4]]: 3 },
      timing: null,
      detail: {
        元会运世: `${yuan}元 ${nowHui}会 ${nowYun}运 ${nowShi}世`,
        值年: year,
        气运: `${phase[phaseIdx]}（${nowHui < 6 ? '阳长' : '阴长'}之期）`,
        说明: '以 1 世 30 年、1 运 12 世、1 会 30 运、1 元 12 会推算，纪年基准取邵雍通行值。',
      },
    }
  },

  // ── 18 河洛理数 ──
  heluo(chart, entry, rand) {
    const y = ZHI.indexOf(chart.yearZhi) + 1
    const mo = Math.abs(chart.lunar.month) || 1
    const d = chart.lunar.day || 1
    const sum = y + mo + d
    const up = mod(sum, 8) || 8
    const lo = mod(sum + 5, 8) || 8
    const g = guaFromNumbers(up, lo, mod(sum, 6) || 6)
    const j = judgeGua(chart, g.bits, g.movePos)
    // 河图数：1/6 水 2/7 火 3/8 木 4/9 金 5/10 土
    const wxOf = (n) => (['水', '火', '木', '金', '土'][((n - 1) % 5)])
    const wx = wxOf(up)
    return {
      score: clamp(j.score + (wangShuai(wx, chart.monthWx).score - 55) * 0.4, -100, 100),
      essence: `河洛${sum}→${j.info.name}·${wx}${wangShuai(wx, chart.monthWx).state}`,
      keys: [j.info.name, `河洛${wx}`, wangShuai(wx, chart.monthWx).state],
      wuxing: { [wx]: 3 },
      timing: null,
      detail: { 数: `年支${y}+月${mo}+日${d}=${sum}`, 上卦: up, 下卦: lo, 五行: wx, ...j.detail },
    }
  },

  // ── 19 灵棋经 ──
  lingqi(chart, entry, rand) {
    // 十二棋分上中下三组，每组四枚；正为阳、反为阴
    const groups = LINGQI_POS.map((pos) => {
      const coins = [0, 1, 2, 3].map(() => (rand.chance(0.5) ? 1 : 0))
      return { pos, coins, yang: coins.reduce((a, b) => a + b, 0) }
    })
    const totalYang = groups.reduce((s, g) => s + g.yang, 0)
    // 124 课按三组阳数组合判定；此处按阳数多寡与上中下顺序断
    const score = clamp((totalYang - 6) * 12, -100, 100)
    return {
      score,
      essence: `灵棋${groups.map((g) => g.yang).join('-')}·${totalYang > 6 ? '阳盛主吉' : totalYang < 6 ? '阴盛主凶' : '阴阳相半'}`,
      keys: [`阳${totalYang}`, totalYang >= 6 ? '阳盛' : '阴盛'],
      wuxing: { [totalYang >= 6 ? '火' : '水']: 3 },
      timing: null,
      fidelity: 'approx',
      detail: {
        十二棋: groups.map((g) => `${g.pos}: ${g.coins.map((c) => (c ? '正' : '反')).join('')}（阳${g.yang}）`).join(' | '),
        阳数: `${totalYang} / 12`,
        说明: '灵棋经共 124 课，课辞未内置；此处按三组正反之阳数多寡断吉凶。',
      },
    }
  },

  // ── 20 先天易数 ──
  xiantian(chart, entry, rand) {
    const y = ZHI.indexOf(chart.yearZhi) + 1
    const mo = Math.abs(chart.lunar.month) || 1
    const d = chart.lunar.day || 1
    const h = ZHI.indexOf(chart.hourZhi) + 1
    // 先天数：乾1兑2离3震4巽5坎6艮7坤8
    const up = mod(y + mo, 8) || 8
    const lo = mod(mo + d, 8) || 8
    const mv = mod(d + h, 6) || 6
    const g = guaFromNumbers(up, lo, mv)
    const j = judgeGua(chart, g.bits, g.movePos)
    return {
      score: j.score,
      essence: `先天${j.info.name}·${j.detail.体用}`,
      keys: j.keys,
      wuxing: j.wuxing,
      timing: null,
      detail: { 起数: `上${y}+${mo}=${up} 下${mo}+${d}=${lo} 动${d}+${h}=${mv}`, ...j.detail },
    }
  },

  // ── 21 大象占 ──
  daxiang(chart, entry, rand) {
    const y = ZHI.indexOf(chart.yearZhi) + 1
    const mo = Math.abs(chart.lunar.month) || 1
    const d = chart.lunar.day || 1
    const up = mod(y + mo + d, 8) || 8
    const lo = mod(y + mo + d + 1, 8) || 8
    const upT = TRIGRAMS.find((t) => t.xian === up)
    const loT = TRIGRAMS.find((t) => t.xian === lo)
    const wx = upT.wx
    const gas = wangShuai(wx, chart.monthWx)
    const rel = relation(upT.wx, loT.wx)
    const score = clamp(relationScore(rel, { 比和: 40, 生我: 60, 我生: -10, 我克: 30, 克我: -55 }) * 0.6 + (gas.score - 55) * 0.6, -100, 100)
    return {
      score,
      essence: `上${upT.name}${upT.xiang}下${loT.name}${loT.xiang}·${rel}`,
      keys: [`${upT.name}${upT.xiang}`, `${loT.name}${loT.xiang}`, rel],
      wuxing: { [upT.wx]: 2, [loT.wx]: 2 },
      timing: null,
      detail: {
        上卦: `${upT.name}（${upT.sym}）象${upT.xiang}·${upT.wx}·${upT.dir}·${upT.fam}·德${upT.virtue}`,
        下卦: `${loT.name}（${loT.sym}）象${loT.xiang}·${loT.wx}·${loT.dir}·${loT.fam}·德${loT.virtue}`,
        组合: `${upT.xiang}${loT.xiang}相叠（${hexNameOf(upT.name, loT.name)}）`,
        关系: rel,
        断: `大象取上下卦类象：${upT.xiang}在上主外主远，${loT.xiang}在下主内主近`,
      },
    }
  },

  // ── 22 爻辞占 ──
  yaoci(chart, entry, rand) {
    const g = castSix(rand, 'coin')
    const info = hexInfoOf(g.bits)
    if (g.moving.length === 0) {
      return {
        score: info.polarity * 0.8,
        essence: `${info.name}·六爻安静，取彖辞断`,
        keys: [info.name, '彖辞'],
        wuxing: { [info.wuxing]: 3 },
        timing: null,
        detail: { 卦: info.name, 断: '六爻不动，取彖辞（卦辞）断一卦之全体' },
      }
    }
    if (g.moving.length === 1) {
      const j = judgeGua(chart, g.bits, g.moving[0])
      const posName = ['初', '二', '三', '四', '五', '上'][g.moving[0] - 1]
      return {
        score: j.score,
        essence: `${j.info.name}·${posName}爻独发`,
        keys: [...j.keys, `${posName}爻动`],
        wuxing: j.wuxing,
        timing: null,
        detail: { 卦: info.name, 动爻: `${posName}爻`, 断: '独发之爻取爻辞，一爻专断', ...j.detail },
      }
    }
    // 多爻动：取变卦彖辞
    const bian = hexInfoOf(g.changed)
    const score = clamp(info.polarity * 0.35 + bian.polarity * 0.45 + (g.moving.length >= 4 ? -10 : 0), -100, 100)
    return {
      score,
      essence: `${info.name}动${g.moving.length}爻之${bian.name}·取变卦彖`,
      keys: [info.name, `之${bian.name}`, '多爻动'],
      wuxing: { [info.wuxing]: 2, [bian.wuxing]: 2 },
      timing: null,
      detail: { 本卦: info.name, 变卦: bian.name, 动爻: g.moving.join(','), 断: '多爻动取变卦彖辞，观事之终局' },
    }
  },

  // ── 23 之卦占 ──
  zhigua(chart, entry, rand) {
    const g = castSix(rand, 'coin')
    const ben = hexInfoOf(g.bits)
    const bian = hexInfoOf(g.changed)
    // 之卦：本卦为现在，变卦为将来；看两者卦德落差
    const delta = bian.polarity - ben.polarity
    const score = clamp(ben.polarity * 0.35 + bian.polarity * 0.55 + delta * 0.2, -100, 100)
    return {
      score,
      essence: `${ben.name}→${bian.name}·${delta > 15 ? '趋吉' : delta < -15 ? '转凶' : '平变'}`,
      keys: [ben.name, `之${bian.name}`, delta > 15 ? '趋吉' : delta < -15 ? '转凶' : '平变'],
      wuxing: { [ben.wuxing]: 2, [bian.wuxing]: 2 },
      timing: null,
      detail: {
        本卦: `${ben.name}（现况·${ben.wuxing}）`,
        变卦: `${bian.name}（趋向·${bian.wuxing}）`,
        卦德落差: `${ben.polarity} → ${bian.polarity}（${delta > 0 ? '+' : ''}${delta}）`,
        动爻: g.moving.join(',') || '无（无动则不变）',
        断: delta > 15 ? '由滞转通，事态向好' : delta < -15 ? '由顺转逆，宜早收手' : '事态平稳，无大起落',
      },
    }
  },

  // ── 24 互卦占 ──
  huagua(chart, entry, rand) {
    const g = castSix(rand, 'coin')
    const ben = hexInfoOf(g.bits)
    const hu = hexInfoOf(huGua(g.bits))
    const score = clamp(ben.polarity * 0.4 + hu.polarity * 0.6, -100, 100)
    return {
      score,
      essence: `${ben.name}·互${hu.name}（中程${hu.polarity > 20 ? '顺' : hu.polarity < -20 ? '滞' : '平'}）`,
      keys: [ben.name, `互${hu.name}`, '中程'],
      wuxing: { [ben.wuxing]: 2, [hu.wuxing]: 2 },
      timing: null,
      detail: {
        本卦: ben.name,
        互卦: `${hu.name}（上${hu.upper}下${hu.lower}）`,
        说明: '互卦取二三四爻为下、三四五爻为上，主事情的中段过程与内部情由',
        断: hu.polarity > 20 ? '中程顺遂，过程无阻' : hu.polarity < -20 ? '中程多阻，事有反复' : '中程平常',
      },
    }
  },
}

export default engines
