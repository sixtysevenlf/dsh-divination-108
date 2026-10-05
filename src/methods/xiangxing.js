/**
 * 方法模块 · 姓名学与相术（6 法 / 条目 #99–#104）· v2 重写
 *
 * 契约见 `docs/V2-CONTRACT.md` §3.2：
 * 返回 `{ score, essence, keys, wuxing, timing, detail, fidelity }`；
 * **纯函数、不抛异常、不读时钟/文件/网络**；无法计算返回 null（运行器记「未起」）。
 * `#103 面相` / `#104 手相` 按条目通例可用 `rand`（确定性随机源，非 Math.random）；
 * 其余四法**一律不用随机**。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 一、姓名从哪里来（v1 最出名的一处 bug，v2 保留其防线）
 * ═══════════════════════════════════════════════════════════════════════
 * 插件没有独立的「姓名」参数，姓名一律从 `chart.question` 里提取，分三步：
 *   1. **问名意图闸门**：问句里必须先出现「名字／姓名／测名／取名／改名／起名／名叫／名为／
 *      我叫／五格／三才／笔画／乳名／笔名」之一，否则**不做任何正则提取**。
 *      没有这道闸门，「这次和张三的合作能不能成」会被兜底逻辑误判出一个"姓名"
 *      ——v1 曾把「这次和」当成用户的名字（`test/smoke.mjs` 有回归断言）。
 *   2. 命中意图后按常见问法匹配（「我叫张三」「名字：李小明」「欧阳修这个名字如何」…），
 *      候选长度 2..4 个汉字且不得含问句虚词。
 *   3. 仍提不出 → **不编造**：
 *      · `chart.numbers` 有 ≥2 个报数 → 借报数当笔画（**不**把问句里的字当姓名）；
 *      · 否则从问句里取非虚词汉字（≤3 字）当「名义取字」，`fidelity` 降 `approx` 并明说；
 *      · 一个汉字都取不出 → 返回 `null`（运行器记「未起」）。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 二、各法口径与出处
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ### 1) 五格剖象（#99）
 * - **五格算法**（单姓单名／单姓双名／单姓三名／复姓单名／复姓双名）见 {@link fiveGe}，逐格写明。
 * - **81 数理吉凶表**：**必须来源可查**，故 v2 **不再使用族内 `data/xiangxing.js` 的
 *   `SHULI_81`**（该表 file 头自称"通行标注"但无可核出处），改为主用 `core/tables.js` 的
 *   `WUGE_81`。该表的溯源（见 `tables.js` 表头与 `TABLES_META.WUGE_81`）：
 *   · 体系出自熊崎健翁《姓名の神秘》（1929）「五格剖象法」81 数理；
 *   · 取值汇编自两处公开来源并逐数对照：
 *     [1] 琴鹤堂国学《五格剖象姓名学81数理吉凶表》 https://m.sohu.com/a/448617276_100084723/
 *     [2] 顺时知识库《八十一數理》 https://shunshi.ai/zh-tw/wiki/naming/wuge/shuli_81
 *     （`verified: 'partial'`：网络二手汇编互校，非原书影印；16 数两源档位不同已记 `alt`，
 *      其中 9 数跨侧冲突已标 `disputed`：27·36·40·42·53·55·72·75·78）
 *   · **冲突与疑似错漏如实转述**：本实现在 `detail.数理吉凶` 里对 `disputed` 之数标「⚠争议」、
 *     对两源档位不同者标「另作X」，**不替用户选边**。
 *   · 超过 81 者按行规「减 80 复归」（`tables.wugeReduce`，来源同 [2]）。
 * - **数理五行**：按尾数 1·2 木、3·4 火、5·6 土、7·8 金、9·0 水（`tables.wugeWuxingOf`，来源同 [2]）。
 * - **族内兜底**：`WUGE_81` / `wugeReduce` / `wugeWuxingOf` 缺失时回落到
 *   `data/xiangxing.js` 的 `SHULI_81` + `shuWuxing`，并在 `detail.说明` 注明「回落族内表（出处较弱）」。
 *
 * ### 2) 三才配置（#100）
 * - 三才 = 天格·人格·地格三数的**数理五行**；吉凶取三格之间的生克关系。
 * - **⚠ 本插件不内置「125 组三才吉凶表」**：`tables.SANCAI_TABLE === null`
 *   （熊崎原表与中文各传本《姓名学宝典》《慧缘姓名学》等并不一致，无可核原表）。
 *   故 v2 **弃用族内 `data/xiangxing.js` 的 `SANCAI_MATRIX` 数值矩阵**（该矩阵系编辑取值），
 *   改为按 `tables.SANCAI_RULE` 的**可推导判据**定四档：
 *   `三才相生（吉）／三才比和（吉）／一克一生（半吉）／三才相克（凶）`，
 *   并如实标 `fidelity: 'approx'`、`detail.未核实` 明写「各谱档位互异，本插件只给关系判据，不下数值」。
 *
 * ### 3) 生肖姓名学（#101）
 * - 生肖由**出生年支**定（无出生资料时退回求占年支并标 approx）。
 * - **⚠ 喜忌字根表**：`tables.SHENGXIAO_BUSHOU === null`（生肖姓名学用字宜忌属近代俗说、
 *   各谱互异、无可核出处）。v2 保留族内表但**降级使用**：
 *   · 族内表新增 `cite` 字段，逐生肖注明公开来源（科技紫微星座网《十二生肖姓名分析》
 *     https://m.sohu.com/a/379086955_102265/ ），并如实标注**与古籍无涉、各谱互异**；
 *   · 若族内表缺字根而只能靠「部首五行同类」推断，则该字记为**推断命中（半权）**，
 *     且整条 `fidelity` 降 `approx`；全部为直接命中时保持 `core`。
 * - **字根识别是近似的**：JS 无法拆汉字部件，族内 `RADICAL_CHARS` 是「字根 → 常用例字」的
 *   **举例性**对照表，未收录的字识别不出（如实标注、不猜）。
 * - **⚠ 字根 → 五行表**（`RADICAL_WUXING`）是**本插件编辑取值、无可核出处**，
 *   仅用于上面那条「推断命中」，因此凡用到它的结论都已在 `detail.说明` 标出。
 *
 * ### 4) 八字姓名补益（#102）
 * - **v2 的实质改动**：v1 直接吃 `chart.birthChart`（其四柱走**农历年**换年），
 *   v2 与命理族 v2 同一口径，**本族自己排四柱**（`EightChar`：立春换年 + 节气换月 + 可选真太阳时），
 *   避免出现「八字族说年柱丙午、姓名族说年柱乙巳」这种自相矛盾。
 * - **用神**取扶抑（身强取克泄耗、身弱取生扶）→ 冲突时**调候优先**（冬火夏水），
 *   与 `mingli.js` v2 的三义取舍一致；判据与取值全部进 `detail.evidence`。
 * - 补益信号 = 姓名字根五行 + 五格数理五行（人格/地格/总格），命中喜用为补、命中忌神为损。
 * - **无出生资料**时 `need: ['birth']` 已由运行器拦下（记「未起」）；
 *   有出生资料但四柱排不出 → 返回 null（不硬算）。
 *
 * ### 5) 面相十二宫（#103）／6) 手相三大主线（#104）
 * - **⚠ 本插件没有图像输入**：面相/手相**不是"看"出来的**，是按通例取相后依部位通例出断。
 *   故两法 `fidelity` **恒为 `approx`**，`detail.说明` 一律写明
 *   「无图像输入，按通例取相，仅供娱乐；如需精断请提供照片」。**不假装看了图。**
 * - 取相用 `rand`（确定性随机源，同问同刻必得同一结果），按部位权重取。
 * - 十二宫名与部位、流年（岁）取通行相术典籍之说，逐条 `cite`；`交友宫` 在旧籍作 `奴仆宫`，
 *   此处从今名并注明。手相三大主线（生命线/智慧线/感情线）另有事业线、婚姻线，权重较低。
 */

import {
  relation, wangShuai, emptyWuxing, mod, clamp, GAN, ZHI, ZHI_ANIMAL, ZHI_WUXING,
  GAN_WUXING, SHENG, KE, SHENG_BY, KE_BY, ganzhiOf, ZHI_CANGGAN,
  hash32, makeRand, evidence,
} from '../core/kit.js'
import { WUGE_81, wugeReduce, wugeWuxingOf, XIU28 } from '../core/tables.js'
import { LunarLib } from '../core/calendar.js'
import * as D from './data/xiangxing.js'

// ═══════════════════════════════════════════════════════════════════
// 族内兜底表
// ═══════════════════════════════════════════════════════════════════

/**
 * 五格 81 数理（**族内兜底**，仅在 `tables.WUGE_81` 缺失时启用）。
 * ⚠ 本表**出处较弱**（file 头自称"公开表"但无可核引用），启用时输出里会注明。
 * cite: 熊崎健翁《姓名の神秘》(1929) 五格剖象法 81 数理体系（体系名可考；本兜底表取值不可考）
 */
const SHULI_FB = D.SHULI_81

/** 数理吉凶档 → 分（族内兜底用；主路径走 tables.WUGE_LUCK_SCORE 的取值）。 */
const LUCK_SCORE_FB = { 吉: 55, 半吉: 10, 凶: -55 }
const luckScore = (luck) => D.SHULI_LUCK_SCORE?.[luck] ?? LUCK_SCORE_FB[luck] ?? 0

/** 数理五行（族内兜底：1·2 木、3·4 火、5·6 土、7·8 金、9·0 水）。 */
const shuWuxingFb = (n) => ['水', '木', '木', '火', '火', '土', '土', '金', '金', '水'][mod(Math.round(Number(n) || 1), 10)]

/** 五格名与权重（人格为主运、总格为后运，权重最高）。**本插件编辑取值**。 */
const GE_ROWS = [
  { label: '天格', key: 'tian', w: 0.13, note: '祖运，先天所承' },
  { label: '人格', key: 'ren', w: 0.32, note: '主运，一生之枢' },
  { label: '地格', key: 'di', w: 0.18, note: '前运，主中年以前' },
  { label: '外格', key: 'wai', w: 0.13, note: '副运，主社交外缘' },
  { label: '总格', key: 'zong', w: 0.24, note: '后运，主中年以后' },
]

/** 复姓表（族内兜底，用于判定单姓/复姓格局）。cite: 通行百家姓复姓 */
const FU_XING_FB = D.FU_XING

/** 生肖喜忌字根（族内表，逐条已加 cite）。 */
const SHENGXIAO_T = D.SHENGXIAO
/** 字根 → 常用例字（近似识别表）。 */
const RADICAL_CHARS_T = D.RADICAL_CHARS
/** 字根 → 五行（**本插件编辑取值，无可核出处**）。 */
const RADICAL_WUXING_T = D.RADICAL_WUXING
/** 笔画表（康熙笔画为主）。 */
const STROKE_TABLE_T = D.STROKE_TABLE
/** 相术表。 */
const MIANXIANG_T = D.MIANXIANG_12
const FACE_TYPES_T = D.FACE_TYPES
const SHOUXIANG_T = D.SHOUXIANG_LINES
const PALM_TYPES_T = D.PALM_TYPES

/** 面相/手相诚实声明。 */
const NO_IMAGE_NOTE = '⚠ 无图像输入：本插件**没有**任何照片/图像数据，十二宫与掌纹均为「按通例取相」，非实测观看；仅供娱乐，如需精断请提供照片。'

/** 「天 → 人」关系断语（只描述关系，不造等级）。cite: 五行生克通义 */
const REL_NOTE_TH = {
  我生: '天生人格，根基得助（顺生）', 比和: '天人同气，根基平顺', 生我: '人格生天，力多外耗（逆生）',
  我克: '天格克人，根基受制', 克我: '人格克天，逆上多争',
}
/** 「人 → 地」关系断语。cite: 五行生克通义 */
const REL_NOTE_HD = {
  我生: '人格生地，晚运得养（顺生）', 比和: '人地同气，基业安稳', 生我: '地格生人，得下之助（逆生）',
  我克: '人格克地，基业多耗', 克我: '地格克人，根基不稳',
}

/** 本族引用的出处（detail.cite 用）。 */
const CITE = {
  五格: '熊崎健翁《姓名の神秘》(1929) 五格剖象法；81 数理取值汇编：琴鹤堂国学 https://m.sohu.com/a/448617276_100084723/ ／ 顺时知识库《八十一數理》 https://shunshi.ai/zh-tw/wiki/naming/wuge/shuli_81',
  五格行规: '顺时知识库《八十一數理·超過 81 減 80 復歸》《數理五行》 https://shunshi.ai/zh-tw/wiki/naming/wuge/shuli_81',
  三才: '顺时知识库《五格剖象·三才配置》 https://shunshi.ai/zh-tw/wiki/naming/wuge/sancai_intro（只给「相生相比为吉、相克为凶」判据，125 组档位各谱互异故本插件不下数值）',
  生肖: '科技紫微星座网《十二生肖姓名分析》 https://m.sohu.com/a/379086955_102265/ （现代通俗说法，各谱互异，与古籍无涉）',
  字根: '字根→例字对照表为本插件近似识别表（汉字无法在 JS 内拆部件）；字根→五行为本插件编辑取值，无可核出处',
  八字: 'lunar-javascript 寿星天文历 EightChar（立春换年、节气换月）；《滴天髓》扶抑/调候取用',
  旺衰: '《渊海子平》《三命通会》通根透干通例；与 mingli.js v2 同口径',
  面相: '相术通行十二宫之说（命宫印堂、财帛宫鼻、兄弟宫眉、田宅宫眼睑、男女宫泪堂、奴仆宫地阁、妻妾宫鱼尾、疾厄宫山根、迁移宫天仓、官禄宫中正、福德宫地阁、父母宫日月角）',
  手相: '相术通行掌纹之说（三大主线：生命线／地纹、智慧线／人纹、感情线／天纹；辅以事业线／玉柱纹、婚姻线／家风纹）',
}

// ═══════════════════════════════════════════════════════════════════
// 姓名提取（问名意图闸门 + 报数 + 名义取字）
// ═══════════════════════════════════════════════════════════════════

/**
 * 问名意图关键词：**只有问句里出现其中之一，才做姓名正则提取**。
 * 没有这道闸门，「这次和张三的合作能不能成」会被兜底逻辑误判出一个"姓名"
 * ——v1 曾把「这次和」当成用户的名字。
 */
const NAME_INTENT = [
  '名字', '姓名', '测名', '取名', '改名', '起名', '名叫', '名为',
  '我叫', '五格', '三才', '笔画', '姓名学', '这名字', '这个名字', '乳名', '笔名',
]

/** 常见问法：提示词 + 姓名（用后视断言防把标点吃进来）。 */
const NAME_PATTERNS = [
  /(?:我叫|我的名字叫|我名字叫|名字是|名字叫|名叫|名为|姓名是|姓名|测名|名字|叫)\s*[:：]?\s*([\u4e00-\u9fff]{2,4})(?=[，,。！？、；;\s]|$)/,
  /([\u4e00-\u9fff]{2,4})(?=这个名字|这名字|的名字)/,
]

/**
 * 「我叫XXX这个名字如何」型：`名字` 在 `叫` 之后时，第一个模式的后视断言会落空
 * （后随字是 `这` 而非标点），于是前面的 `[^叫]叫` 会贪到 `叫司马光`。
 * 这条正则专门吃掉「我叫」整个词，避免把 `叫` 当成名字首字。
 */
const RE_WO_JIAO = /我(?:的名字)?叫\s*[:：]?\s*([\u4e00-\u9fff]{2,4})(?=这个名字|这名字|的名字|的名|，|,|。|\s|$)/

/** 问句词（出现在候选姓名里就判为「不是姓名」）。 */
const NAME_STOP = [
  '好不好', '怎么样', '怎样', '如何', '看看', '帮我', '帮忙', '名字', '姓名', '测名', '什么',
  '可以', '是不是', '谢谢', '请问', '一下', '这个', '那个', '哪里', '多少', '老师', '麻烦',
  '分析', '点评', '测算', '八字', '算命', '占卜', '术数', '我的', '我是', '你好', '想看',
]

/** 兜底提取时要滤掉的问句虚词（单字）。 */
const NAME_STOP_CHARS = new Set([...'这那的了么吗呢吧我你他她它是不有能会要个来去给把和与就都也还很太真请问想看测算好名字姓师老麻烦谢谢您呀啊哦嗯时候后前对为以所之其而在'])

/** 候选是否像问句词而非姓名。 */
const isStopName = (s) => NAME_STOP.some((w) => s.includes(w))

/**
 * 从问句里提取姓名（汉字数组）。
 *
 * **必须问句里有「问名意图」才做正则提取**：否则像「这次和张三的合作能不能成」
 * 这种句子会被误判出一个「姓名」（假阳性），进而让姓名学假装算的是用户的名字。
 * @param {string} text 所问。
 * @returns {string[]|null} 姓名各字，提不出返回 null。
 */
function extractNameFromText(text) {
  const q = String(text ?? '')
  if (!q) return null
  if (!NAME_INTENT.some((w) => q.includes(w))) return null
  // 「我叫X这个名字如何」先走专用正则（否则 `这` 会把第一个模式的后视断言卡掉）
  const woJiao = RE_WO_JIAO.exec(q)?.[1]
  if (woJiao && woJiao.length >= 2 && woJiao.length <= 4 && !isStopName(woJiao)) return [...woJiao]
  for (const re of NAME_PATTERNS) {
    const cand = q.match(re)?.[1]
    if (cand && cand.length >= 2 && cand.length <= 4 && !isStopName(cand) && !cand.includes('名字')) return [...cand]
  }
  // 兜底：整段汉字（≤6 字）滤去虚词后恰好剩 2..4 字，才算姓名
  const runs = q.match(/[\u4e00-\u9fff]+/g) ?? []
  const cands = []
  for (const run of runs) {
    if (run.length > 6) continue
    const seg = [...run].filter((ch) => !NAME_STOP_CHARS.has(ch)).join('')
    if (seg.length >= 2 && seg.length <= 4 && !isStopName(seg)) cands.push(seg)
  }
  if (cands.length === 0) return null
  cands.sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
  return [...cands[0]]
}

/** 取用户所报数字（正数）。 */
function numberList(chart) {
  return (Array.isArray(chart?.numbers) ? chart.numbers : [])
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.round(n))
}

/**
 * 定姓名（或名义姓名）。
 *
 * **绝不把问句片段当姓名**：无意图时只用报数或中性占位符，并在 `note` 里写明。
 * @param {object} chart 盘基。
 * @returns {{chars:string[], label:string, source:'name'|'numbers'|'text', note:string, approx:boolean, real:boolean}|null} 姓名信息。
 */
function resolveName(chart) {
  const q = String(chart?.question ?? '')
  const nums = numberList(chart)
  const named = extractNameFromText(q)
  if (named) return { chars: named, label: named.join(''), source: 'name', note: '', approx: false, real: true }
  if (nums.length >= 2) {
    // 只借报数当笔画，**不**把问句里的字当姓名——那会把「这次和」这种问句片段
    // 显示成用户的名字。名义占位符用中性符号，避免误导。
    const width = Math.max(2, Math.min(4, nums.length))
    const chars = Array.from({ length: width }, (_, i) => `第${i + 1}字`)
    return {
      chars,
      label: `（未报姓名·按报数 ${nums.slice(0, width).join('/')} 取笔画）`,
      source: 'numbers',
      note: `未提供姓名，按所报数字（${nums.join('/')}）取笔画；五格按报数直算，**非**真实姓名`,
      approx: true,
      real: false,
      xiang: true,
      xiangNote: `以所报数字（${nums.join('/')}）代姓名之笔画（**非**真实姓名）`,
    }
  }
  const chars = (q.match(/[\u4e00-\u9fff]/g) ?? []).filter((ch) => !NAME_STOP_CHARS.has(ch)).slice(0, 3)
  if (chars.length > 0) {
    return {
      chars,
      label: `（未报姓名·按所问文字取数：${chars.join('')}）`,
      source: 'text',
      note: '未提供姓名，已按所问文字取数（**非**用户姓名）；建议注明姓名以得精确结果',
      approx: true,
      real: false,
      xiang: true,
      xiangNote: `以所问文字「${chars.join('')}」代姓名（**非**用户姓名）`,
    }
  }

  // ── 连问句文字也没有（空问句／纯标点／纯语气词）→ **不可返回 null** ──
  //
  // 「没报姓名」不等于「本法无解」（契约 §2.2：没报的输入不许假装有，但也不许因此不算）。
  // 此处按**盘上自有的时间信息**取象成一个名义姓名，并三重标注：
  //   `source: 'text'` → resolveStrokes 走字码取数并置 approx；
  //   `label` 带「未报姓名·取象：」前缀（与 #92/#93/#95/#96/#97 的取象前缀同一风格）；
  //   三引擎的 essence 冠以「未报姓名·取象：」，`detail.取象` 明说被什么替代。
  // **绝不从问句里取字**（问句此分支已无汉字可滤），故不会重演「把『这次和』当姓名」的错。
  const dayGan = String(chart?.dayGan ?? '').slice(0, 1)
  const hourZhi = String(chart?.hourZhi ?? '').slice(0, 1)
  const dai = [dayGan, hourZhi].filter((c) => /[\u4e00-\u9fff]/.test(c))
  const xi = dai.length > 0 ? dai : ['甲', '子']
  return {
    chars: xi,
    label: `（未报姓名·取象：日干${xi[0]}为姓、时支${xi[1] ?? ''}为名，代其笔画）`,
    source: 'text',
    note: `未报姓名，且问句中亦无可取之字；已取象为「${xi.join('')}」——`
      + '以日干代姓、时支代名，按字码取笔画（**非**任何真实姓名，五格数理仅作示意）',
    approx: true,
    real: false,
    xiang: true,
    xiangNote: `以日干「${xi[0]}」代姓、时支「${xi[1] ?? '—'}」代名（**非**任何真实姓名，仅借盘上时间信息取象）`,
  }
}

/**
 * 定笔画（报数 > 内置笔画表 > 字码取数）。
 * @param {object} chart 盘基。
 * @param {{chars:string[], source:string, note:string}} nm 姓名信息。
 * @returns {{strokes:number[], list:Array<{ch:string,n:number,src:string}>, approx:boolean, note:string}} 笔画。
 */
function resolveStrokes(chart, nm) {
  const nums = numberList(chart)
  if (nm.source === 'numbers') {
    const strokes = nums.slice(0, 4)
    while (strokes.length < 2) strokes.push(strokes[strokes.length - 1] ?? 1)
    return {
      strokes,
      list: strokes.map((n, i) => ({ ch: nm.chars[i] ?? '·', n, src: '报数' })),
      approx: false,
      note: '笔画取自用户所报数字，五格按报数直算',
    }
  }
  const list = []
  let missing = 0
  nm.chars.forEach((ch, i) => {
    const t = STROKE_TABLE_T?.[ch]
    if (Number.isFinite(t)) { list.push({ ch, n: t, src: '楷体笔画表' }); return }
    if (nums.length === nm.chars.length && nums[i]) { list.push({ ch, n: nums[i], src: '报数' }); return }
    list.push({ ch, n: 1 + (ch.codePointAt(0) % 28), src: '字码' })
    missing += 1
  })
  const notes = []
  if (nm.note) notes.push(nm.note)
  if (missing > 0) {
    const bad = list.filter((x) => x.src === '字码').map((x) => x.ch).join('')
    notes.push(`⚠「${bad}」未收录于内置笔画表，已按字码取数（**非**真实笔画，数理吉凶仅供参考）`)
  }
  if (nm.source === 'text') notes.push('结果按所问文字的名义笔画推算，仅作示意')
  return {
    strokes: list.map((x) => x.n),
    list,
    approx: missing > 0 || nm.source === 'text',
    note: notes.join('；'),
  }
}

// ═══════════════════════════════════════════════════════════════════
// 五格 / 数理
// ═══════════════════════════════════════════════════════════════════

/**
 * 取 81 数理的吉凶信息。
 *
 * 主路径走 `tables.WUGE_81`（**有出处、已两源互校**）；缺则回落族内 `SHULI_81`（出处较弱）。
 * @param {number} n 格数。
 * @returns {{n:number, name:string, luck:string, score:number, alt:string|null, disputed:boolean, from:string}} 数理信息。
 */
function luckOf(n) {
  const raw = Math.trunc(Number(n) || 1)
  const reduced = typeof wugeReduce === 'function' ? wugeReduce(raw) : (mod(raw - 1, 81) + 1)
  const k = clamp(reduced || 1, 1, 81)
  const t = WUGE_81?.[k]
  if (t && t.luck) {
    return {
      n: raw,
      k,
      name: t.name ?? '—',
      luck: t.luck,
      score: luckScore(t.luck),
      alt: t.alt ?? null,
      disputed: t.disputed === true,
      from: 'tables.WUGE_81（两源互校）',
    }
  }
  const fb = SHULI_FB?.[k]
  if (fb) {
    return {
      n: raw,
      k,
      name: fb.name ?? '—',
      luck: fb.luck ?? '半吉',
      score: Number.isFinite(fb.score) ? fb.score : luckScore(fb.luck),
      alt: null,
      disputed: false,
      from: '族内兜底表（出处较弱）',
    }
  }
  return { n: raw, k, name: '—', luck: '半吉', score: 0, alt: null, disputed: false, from: '无表可用' }
}

/** 数理 → 五行（主路径走 tables.wugeWuxingOf）。 */
function shuWuxing(n) {
  const v = typeof wugeWuxingOf === 'function' ? wugeWuxingOf(n) : ''
  return v || shuWuxingFb(n)
}

/**
 * 五格算法（熊崎氏定型）。
 *
 * | 格局 | 天格 | 人格 | 地格 | 外格 | 总格 |
 * |---|---|---|---|---|---|
 * | 单姓单名 | 姓+1 | 姓+名 | 名+1 | 2 | 姓+名 |
 * | 单姓双名 | 姓+1 | 姓+名1 | 名1+名2 | 名2+1 | 全部 |
 * | 单姓三名 | 姓+1 | 姓+名1 | 名1+名2+名3 | 名2+名3+1 | 全部 |
 * | 复姓单名 | 姓1+姓2 | 姓2+名 | 名+1 | 姓1+1 | 全部 |
 * | 复姓双名 | 姓1+姓2 | 姓2+名1 | 名1+名2 | 姓1+名2 | 全部 |
 *
 * cite: 熊崎健翁《姓名の神秘》(1929) 五格剖象法
 * @param {number[]} strokesIn 笔画。
 * @param {string[]} chars 姓名各字（判复姓用）。
 * @returns {{layout:string, tian:number, ren:number, di:number, wai:number, zong:number}} 五格。
 */
function fiveGe(strokesIn, chars) {
  const s = (Array.isArray(strokesIn) ? strokesIn : [])
    .slice(0, 4)
    .map((n) => Math.max(1, Math.round(Number(n) || 1)))
  while (s.length < 2) s.push(s[s.length - 1] ?? 1)
  const n = s.length
  const sum = s.reduce((a, b) => a + b, 0)
  const fuList = Array.isArray(FU_XING_FB) ? FU_XING_FB : []
  const fu = n >= 3 && Array.isArray(chars) && chars.length >= 2 && fuList.includes(chars[0] + chars[1])
  if (fu && n === 3) return { layout: '复姓单名', tian: s[0] + s[1], ren: s[1] + s[2], di: s[2] + 1, wai: s[0] + 1, zong: sum }
  if (fu) return { layout: '复姓双名', tian: s[0] + s[1], ren: s[1] + s[2], di: s[2] + s[3], wai: s[0] + s[3], zong: sum }
  if (n === 2) return { layout: '单姓单名', tian: s[0] + 1, ren: s[0] + s[1], di: s[1] + 1, wai: 2, zong: sum }
  if (n === 3) return { layout: '单姓双名', tian: s[0] + 1, ren: s[0] + s[1], di: s[1] + s[2], wai: s[2] + 1, zong: sum }
  return { layout: '单姓三名', tian: s[0] + 1, ren: s[0] + s[1], di: s[1] + s[2] + s[3], wai: s[2] + s[3] + 1, zong: sum }
}

/** 取判姓名的月令五行（有出生盘用生月，否则用求占月）。 */
function monthWxOf(chart) {
  const zhi = chart?.birthChart?.monthZhi || chart?.monthZhi
  return ZHI_WUXING[zhi] ?? chart?.monthWx ?? '土'
}

// ═══════════════════════════════════════════════════════════════════
// 字根（部首）近似识别
// ═══════════════════════════════════════════════════════════════════

/** 某字是否带某字根（族内近似表：字出现在该字根的例字里即算命中）。 */
function hitRoot(ch, root) {
  if (ch === root) return true
  const list = RADICAL_CHARS_T?.[root]
  return Array.isArray(list) && list.includes(ch)
}

/** 字根 → 五行（由 RADICAL_WUXING 反查；模块加载时算一次，只读）。 */
const ROOT_WUXING = (() => {
  const out = {}
  for (const [w, list] of Object.entries(RADICAL_WUXING_T ?? {})) {
    for (const r of list) if (!out[r]) out[r] = w
  }
  return out
})()

/** 字根所属五行（**本插件编辑取值**，未归类返回 null）。 */
const rootWuxing = (root) => ROOT_WUXING[root] ?? null

/**
 * 按内置字根表推字的五行。
 * @param {string} ch 字。
 * @returns {string|null} 五行；识别不出返回 null（不猜）。
 */
function charWuxing(ch) {
  for (const root of Object.keys(RADICAL_CHARS_T ?? {})) {
    if (hitRoot(ch, root)) {
      const w = ROOT_WUXING[root]
      if (w) return w
    }
  }
  return null
}

/** 一组字里出现最多的字根五行（一个都识别不出返回 null）。 */
function dominantWuxing(chars) {
  const tally = {}
  for (const ch of chars) {
    const w = charWuxing(ch)
    if (w) tally[w] = (tally[w] ?? 0) + 1
  }
  const keys = Object.keys(tally)
  if (keys.length === 0) return null
  keys.sort((a, b) => tally[b] - tally[a] || (a < b ? -1 : 1))
  return keys[0]
}

// ═══════════════════════════════════════════════════════════════════
// 本族自排四柱（与 mingli.js v2 同口径：#102 不另立一套八字）
// ═══════════════════════════════════════════════════════════════════

/** 从 birthChart.solar 解析出生公历分量。 */
function birthSolar(chart) {
  const m = /(\d{1,4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})/.exec(String(chart?.birthChart?.solar ?? ''))
  if (!m) return null
  const v = { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] }
  if (!Number.isFinite(v.y) || v.y < 1) return null
  return v
}

/**
 * 排本族四柱（**立春换年 + 节气换月 + 可选真太阳时**）。
 * cite: lunar-javascript（寿星天文历）EightChar（getYear 按立春、getMonth 按节气）
 * @param {object} chart 盘基。
 * @returns {object|null} { pillars, dayGan, monthZhi, solarTrue, solarNote, jieqi }。
 */
function natalPillars(chart) {
  const s = birthSolar(chart)
  if (!s) return null
  let offsetMin = 0
  let note = '未校正（未提供经度）'
  if (Number.isFinite(chart?.longitude)) {
    const lonPart = (chart.longitude - 120) * 4
    const eot = Number(chart?.astro?.eotMin)
    offsetMin = lonPart + (Number.isFinite(eot) ? eot : 0)
    note = `经度差 ${lonPart >= 0 ? '+' : ''}${lonPart.toFixed(1)}′${Number.isFinite(eot) ? ` 均时差 ${eot >= 0 ? '+' : ''}${eot.toFixed(1)}′` : '（均时差待天文层提供）'}`
  }
  const dt = new Date(Date.UTC(s.y, s.mo - 1, s.d, s.h, s.mi) + Math.round(offsetMin) * 60000)
  const sy = dt.getUTCFullYear(); const smo = dt.getUTCMonth() + 1; const sd = dt.getUTCDate()
  const sh = dt.getUTCHours(); const smi = dt.getUTCMinutes()
  try {
    const solar = LunarLib.Solar.fromYmdHms(sy, smo, sd, sh, smi, 0)
    const lunar = solar.getLunar()
    const ec = lunar.getEightChar()
    const pillars = [ec.getYear(), ec.getMonth(), ec.getDay(), ec.getTime()]
    if (pillars.some((p) => typeof p !== 'string' || p.length < 2)) return null
    return {
      pillars,
      offsetMin,
      solarTrue: `${sy}-${String(smo).padStart(2, '0')}-${String(sd).padStart(2, '0')} ${String(sh).padStart(2, '0')}:${String(smi).padStart(2, '0')}`,
      solarNote: note,
      lunarText: lunar.toString(),
      jieqi: `${lunar.getPrevJieQi()?.getName?.() ?? ''}→${lunar.getNextJieQi()?.getName?.() ?? ''}`,
    }
  } catch {
    return null
  }
}

/** 藏干力量（本气/中气/余气）。cite: 命理通例 */
const CG_W = [1, 0.4, 0.2]

/**
 * 八字用神（扶抑 → 调候优先 → 与 mingli.js v2 同一取舍）。
 * @param {string[]} ps 四柱。
 * @returns {object|null} { dayGan, me, strong, level, yong, tiaohou, xi, ji, season, evidence }。
 */
function yongShenOf(ps) {
  const dayGan = ps[2]?.[0]
  const me = GAN_WUXING[dayGan]
  if (!me) return null
  const ev = []
  const monthZhi = ps[1]?.[1] ?? '子'
  const monthWx = ZHI_WUXING[monthZhi] ?? '土'
  const rel = relation(me, monthWx)

  // 得令（0..45）
  const LING = { 比和: 45, 生我: 38, 我生: 26, 我克: 16, 克我: 9 }
  const deLing = LING[rel] ?? 20
  ev.push(evidence('得令·月令本气（月支五行对日主：同我/生我/我生/我克/克我）', `${monthZhi}${monthWx}·${rel} → ${deLing}`, '月令为提纲，权重最重'))

  // 得地（0..35）：四支藏干中同党之根，日支月支 ×1.3
  let deDiRaw = 0
  const roots = []
  ps.forEach((gz, i) => {
    if (i === 2) return
    const w = (i === 1 || i === 2) ? 1.3 : 1.0
    ;(ZHI_CANGGAN[gz?.[1]] ?? []).forEach((hg, k) => {
      const hw = GAN_WUXING[hg]
      if (!(hw === me || SHENG_BY[me] === hw)) return
      deDiRaw += (CG_W[k] ?? 0.2) * w
      roots.push(`${gz[1]}藏${hg}(${k === 0 ? '本气' : k === 1 ? '中气' : '余气'})`)
    })
  })
  const deDi = clamp(Math.round(deDiRaw * 14), 0, 35)
  ev.push(evidence('得地·通根（四支藏干中同党之根加权：本气1.0/中气0.4/余气0.2，日支月支×1.3）', roots.length > 0 ? roots.join('、') : '无根', `加权 ${deDiRaw.toFixed(2)} → ${deDi}`))

  // 得势（0..20）：年月时三干同党之数
  let sameGan = 0
  const ganList = []
  ps.forEach((gz, i) => {
    if (i === 2) return
    const gw = GAN_WUXING[gz?.[0]]
    const same = gw === me || SHENG_BY[me] === gw
    ganList.push(`${gz}${same ? '同' : '异'}`)
    if (same) sameGan += 1
  })
  const deShi = clamp(Math.round((sameGan / 3) * 20), 0, 20)
  ev.push(evidence('得势·透干（年月时三干中同党之数，满分三干）', ganList.join('、'), `${sameGan}/3 → ${deShi}`))

  const power = clamp(deLing + deDi + deShi, 0, 100)
  const strong = power >= 50
  const level = power >= 70 ? '极强' : power >= 55 ? '偏强' : power >= 45 ? '中和' : power >= 30 ? '偏弱' : '极弱'

  // 扶抑取用
  const groups = { 比劫: me, 印: SHENG_BY[me], 食伤: SHENG[me], 财: KE[me], 官杀: KE_BY[me] }
  const order = strong ? ['官杀', '食伤', '财'] : ['印', '比劫']
  const picked = order[0]
  const yong = groups[picked]
  ev.push(evidence(`扶抑取用（${strong ? '身强取克泄耗' : '身弱取生扶'}）`, `取${picked} → ${yong}`, '扶抑为取用第一义'))

  // 调候（冬火夏水），冲突时优先
  const SEASON = { 寅: '春', 卯: '春', 辰: '春', 巳: '夏', 午: '夏', 未: '夏', 申: '秋', 酉: '秋', 戌: '秋', 亥: '冬', 子: '冬', 丑: '冬' }
  const season = SEASON[monthZhi] ?? '春'
  let tiaohou = null
  if (season === '冬') { tiaohou = '火'; ev.push(evidence('调候（冬生喜火，亥子丑月寒，需火暖局）', `${monthZhi}月属冬 → 火`, '冬生无火则滞')) }
  else if (season === '夏') { tiaohou = '水'; ev.push(evidence('调候（夏生喜水，巳午未月燥，需水润局）', `${monthZhi}月属夏 → 水`, '夏生无水则枯')) }
  const conflict = Boolean(tiaohou) && tiaohou !== yong
  const finalYong = conflict ? tiaohou : yong
  if (conflict) ev.push(evidence('调候与扶抑冲突的取舍', `扶抑取${yong}，调候取${tiaohou} → 从调候`, '调候关乎寒暖生死，优先于扶抑'))

  // 喜用 / 忌神。
  // 先按「十神 → 五行」列出身强/身弱各取哪几类，再统一去重——
  // 否则「调候用神」可能与扶抑所取那一类**同五行**（如日主金、调候取水，而水正是食伤），
  // 去重前会输出「喜 水、水、木」这种自相矛盾的字面。
  const xiRaw = strong ? [groups.官杀, groups.食伤, groups.财] : [groups.印, groups.比劫]
  const xi = [...new Set(conflict ? [finalYong, ...xiRaw] : xiRaw)]
  const ji = strong ? [me, SHENG_BY[me]] : [SHENG[me], KE[me], KE_BY[me]]

  return {
    dayGan, me, monthZhi, monthWx, strong, level, power, deLing, deDi, deShi,
    yong: finalYong, tiaohou, conflict, season, xi, ji, roots, evidence: ev,
  }
}

// ═══════════════════════════════════════════════════════════════════
// 相术公用
// ═══════════════════════════════════════════════════════════════════

/**
 * 按权重取相（权重 `w`，缺省 1）。走注入的确定性随机源。
 * @param {Array<{w?:number}>} list 相表。
 * @param {import('../core/kit.js').Rand} rand 随机源。
 * @returns {object|null} 取中的相。
 */
function pickWeighted(list, rand) {
  const arr = Array.isArray(list) ? list : []
  if (arr.length === 0) return null
  const total = arr.reduce((s, x) => s + (Number(x.w) || 1), 0)
  const t = (rand?.float?.() ?? 0) * total
  let acc = 0
  for (const x of arr) {
    acc += Number(x.w) || 1
    if (t < acc) return x
  }
  return arr[arr.length - 1]
}

/**
 * 造本法的取相随机源：**把所问算进种子，并把取象依据锚定到「日干支 + 时支」，不含分钟**。
 *
 * 为什么必须把所问算进种子：运行器给的 `rand` 种子是「盘基 + 法号」，与所问无关；
 * 若只用它，用户换个问题问面相，取到的相完全一样——那等于**没在按问题取相**。
 * 相术的取相本无实测可言，至少应当随所问而变（问财看财帛宫、问婚看妻妾宫）。
 *
 * 为什么必须锚到「日干支 + 时支」而非运行器给的 `rand`：
 * 运行器的种子含 `solarDate.toISOString()`，**带分钟**。于是同一时辰内 14:30 与 14:31
 * 会取到两套完全不同的相 —— 而面相/掌纹是**看**出来的东西，不会一分钟一变；
 * 「按通例取相」的通例也不以分钟为单位。锚到日干支 + 时支后：
 * **同辰稳定（乃至同日内不同辰仍可变）、跨日可变**，且仍完全确定（不用 `Math.random`）。
 *
 * @param {object} chart 盘基（取其 `ganzhi.day` / `ganzhi.hour` 作锚）。
 * @param {string} question 所问。
 * @param {string} tag 法名（避免两法共用同一序列）。
 * @returns {import('../core/kit.js').Rand} 本法专用随机源。
 */
function faceRand(chart, question, tag) {
  // 锚点只用「日干支 + 时支」这类**时辰级**信息；缺失时退回年/月/日/时数字（仍不含分钟）。
  const gz = chart?.ganzhi ?? {}
  const s = chart?.solar ?? {}
  const anchor = [
    gz.day || `${s.y ?? 0}-${s.m ?? 0}-${s.d ?? 0}`,
    gz.hour || `${s.h ?? 0}`,
  ].join('|')
  return makeRand(hash32(`${String(question ?? '').slice(0, 40)}|${anchor}|${tag}`))
}

/**
 * 所问事类 → 面相宫位加权（问什么就看什么宫，不问则均看）。
 * @param {string} question 所问。
 * @returns {Record<string, number>} 宫名 → 权重倍数。
 */
function topicBoost(question) {
  const s = String(question ?? '')
  const out = {}
  if (/财|钱|收入|投资|生意|买卖|奖金|工资|回款/.test(s)) { out['财帛宫'] = 1.8; out['田宅宫'] = 1.3 }
  if (/事业|工作|官|升|职|学业|读书|考试|考/.test(s)) { out['官禄宫'] = 1.8; out['命宫'] = 1.2 }
  if (/婚|感情|夫妻|对象|恋爱|姻缘|嫁|娶/.test(s)) { out['妻妾宫'] = 1.8; out['男女宫'] = 1.2 }
  if (/健康|病|身体|疾|寿|养/.test(s)) { out['疾厄宫'] = 1.8; out['福德宫'] = 1.3 }
  if (/父母|长辈|家人|亲/.test(s)) { out['父母宫'] = 1.8; out['兄弟宫'] = 1.3 }
  if (/朋友|合作|合伙|同事|小人|同辈/.test(s)) { out['奴仆宫'] = 1.8; out['兄弟宫'] = 1.4 }
  if (/外出|出行|搬|迁移|出国|远方|旅行/.test(s)) { out['迁移宫'] = 1.8 }
  if (/孩子|子女|怀孕|生育/.test(s)) { out['男女宫'] = 1.8 }
  return out
}

// ═══════════════════════════════════════════════════════════════════
// 引擎实现（6 法）
// ═══════════════════════════════════════════════════════════════════

export const engines = {
  // ── 99 五格剖象（熊崎氏） ──
  /**
   * 天格人格地格外格总格算法 + 81 数理吉凶（来源可查）+ 人格五行月令旺衰。
   * @param {object} chart 盘基。
   * @param {object} entry 条目。
   * @returns {object|null} 结果。
   */
  wuGe(chart, entry) {
    const nm = resolveName(chart)
    if (!nm) return null
    const st = resolveStrokes(chart, nm)
    const ge = fiveGe(st.strokes, nm.chars)
    const monthWx = monthWxOf(chart)

    const wuxing = emptyWuxing()
    const rows = []
    let score = 0
    const conflicts = []
    for (const r of GE_ROWS) {
      const n = ge[r.key]
      const info = luckOf(n)
      const wx = shuWuxing(n)
      score += info.score * r.w
      wuxing[wx] += 1
      if (info.disputed) conflicts.push(`${r.label}${info.k}(${info.luck}／另作${info.alt ?? '—'})`)
      rows.push({
        label: r.label, note: r.note, w: r.w, n, k: info.k, name: info.name,
        luck: info.luck, wx, alt: info.alt, disputed: info.disputed, from: info.from,
      })
    }
    const renWx = shuWuxing(ge.ren)
    const ws = wangShuai(renWx, monthWx)
    score = clamp(score + (ws.score - 55) * 0.18, -100, 100)

    const ren = rows.find((r) => r.label === '人格')
    const zong = rows.find((r) => r.label === '总格')
    const di = rows.find((r) => r.label === '地格')
    const jie = ren.luck === '吉' && zong.luck === '吉'
      ? '人格总格俱吉，主运顺遂，名可久用'
      : ren.luck === '凶'
        ? `人格${ren.n}数「${ren.name}」为凶，主运多阻，宜改字或加字以调剂`
        : `人格${ren.n}数「${ren.name}」${ren.luck}，总格${zong.n}数「${zong.name}」${zong.luck}，吉凶相参，宜以行运补之`

    const notes = []
    if (st.note) notes.push(st.note)
    if (rows.some((r) => r.from.includes('族内兜底'))) notes.push('⚠ 共享表 WUGE_81 不可用，已回落族内兜底表（出处较弱）')
    notes.push('81 数理表出处：熊崎健翁《姓名の神秘》(1929) 体系；取值汇编自琴鹤堂国学与顺时知识库两源并逐数互校（verified: partial），非原书影印')

    return {
      score,
      essence: `${nm.xiang ? '未报姓名·取象：' : ''}五格 天${ge.tian}人${ge.ren}地${ge.di}外${ge.wai}总${ge.zong}·人格${ren.luck}`,
      keys: [
        `人格${ge.ren}${ren.luck}`,
        `总格${ge.zong}${zong.luck}`,
        `地格${ge.di}${di.luck}`,
        ge.layout,
        nm.real ? '实名正算' : '名义笔画',
      ].slice(0, 6),
      wuxing,
      timing: null,
      fidelity: (st.approx || nm.approx) ? 'approx' : (entry?.fidelity === 'approx' ? 'approx' : 'core'),
      detail: {
        姓名: nm.label,
        取象: nm.xiang ? nm.xiangNote : null,
        取字: st.list.map((x) => x.ch).join(' ') || '（无）',
        笔画: st.list.map((x) => `${x.ch}${x.n}(${x.src})`).join(' '),
        格局: ge.layout,
        五格: `天格${ge.tian} 人格${ge.ren} 地格${ge.di} 外格${ge.wai} 总格${ge.zong}`,
        数理吉凶: rows.map((r) => `${r.label}${r.n}→${r.k}「${r.name}」${r.luck}·${r.wx}${r.disputed ? `（⚠争议：另作${r.alt}）` : r.alt ? `（另作${r.alt}）` : ''}`).join(' | '),
        争议数理: conflicts.length > 0 ? `以下格位落在两源跨侧冲突之数，各谱判法确有分歧，请按师承取舍：${conflicts.join('、')}` : '无（各格均不在 9 个争议数之列）',
        人格五行: `${renWx}（${ws.state}·月令${monthWx}）`,
        断: jie,
        说明: notes.join('；'),
        cite: [CITE.五格, CITE.五格行规],
        evidence: [
          evidence('五格取数（熊崎氏定型：天格＝姓+1，人格＝姓末+名首，地格＝名之和(+1)，外格＝名末+1（单姓单名取2），总格＝笔画总和）', `${ge.layout}：天${ge.tian} 人${ge.ren} 地${ge.di} 外${ge.wai} 总${ge.zong}`, '人格权重 0.32、总格 0.24、地格 0.18、天格 0.13、外格 0.13'),
          evidence('81 数理吉凶（超 81 者减 80 复归）', rows.map((r) => `${r.label}${r.n}→${r.k}=${r.luck}(${luckScore(r.luck)})`).join('、'), `加权和 = ${rows.reduce((s, r) => s + luckScore(r.luck) * r.w, 0).toFixed(1)}`),
          evidence('数理五行（按尾数 1·2 木、3·4 火、5·6 土、7·8 金、9·0 水）', rows.map((r) => `${r.label}${r.n}→${r.wx}`).join('、'), `人格五行 ${renWx} 于月令为「${ws.state}」`),
          evidence('人格五行月令旺衰加成', `人格${renWx}于${monthWx}月为「${ws.state}」`, `(${ws.score}−55)×0.18 = ${((ws.score - 55) * 0.18).toFixed(1)}`),
        ],
      },
    }
  },

  // ── 100 三才配置 ──
  /**
   * 天人地三才五行 + 生克判据（**不内置 125 组档位表**，如实降 approx）。
   * @param {object} chart 盘基。
   * @param {object} entry 条目。
   * @returns {object|null} 结果。
   */
  sanCai(chart) {
    const nm = resolveName(chart)
    if (!nm) return null
    const st = resolveStrokes(chart, nm)
    const ge = fiveGe(st.strokes, nm.chars)
    const t = shuWuxing(ge.tian)
    const r = shuWuxing(ge.ren)
    const d = shuWuxing(ge.di)
    const relTH = relation(t, r)   // 天 → 人
    const relHD = relation(r, d)   // 人 → 地
    const monthWx = monthWxOf(chart)
    const ws = wangShuai(r, monthWx)
    const renInfo = luckOf(ge.ren)
    const diInfo = luckOf(ge.di)

    /**
     * 三才定档（**只依可推导的关系判据，不查无可核原表**）。
     * cite: tables.SANCAI_RULE（相生相比为吉、相克为凶；四档）
     */
    const SHENG_REL = new Set(['我生', '生我'])
    const KE_REL = new Set(['我克', '克我'])
    const goodTH = SHENG_REL.has(relTH) || relTH === '比和'
    const goodHD = SHENG_REL.has(relHD) || relHD === '比和'
    const keTH = KE_REL.has(relTH)
    const keHD = KE_REL.has(relHD)
    let level
    let base
    if (goodTH && goodHD) {
      const bothSheng = SHENG_REL.has(relTH) && SHENG_REL.has(relHD)
      level = bothSheng ? '三才相生（吉）' : '三才比和（吉）'
      base = bothSheng ? 70 : 55
    } else if (keTH && keHD) {
      level = '三才相克（凶）'
      base = -65
    } else {
      level = '一克一生（半吉）'
      base = 8
    }
    const score = clamp(base + renInfo.score * 0.1 + diInfo.score * 0.1 + (ws.score - 55) * 0.15, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[t] += 1
    wuxing[r] += 1.5
    wuxing[d] += 1

    const notes = []
    if (st.note) notes.push(st.note)
    notes.push('⚠ 本插件**不内置**「125 组三才吉凶表」：熊崎原表与中文各传本（《姓名学宝典》《慧缘姓名学》等）并不一致，无可核原表（tables.SANCAI_TABLE === null）。故此处只按「相生相比为吉、相克为凶」的关系判据定四档，不下具体数值')

    return {
      score,
      essence: `${nm.xiang ? '未报姓名·取象：' : ''}三才${t}${r}${d}·天人${relTH}/人地${relHD}·${level}`,
      keys: [`三才${t}${r}${d}`, `天人${relTH}`, `人地${relHD}`, level, nm.real ? '实名正算' : '名义笔画'].slice(0, 6),
      wuxing,
      timing: null,
      fidelity: 'approx',
      detail: {
        姓名: nm.label,
        取象: nm.xiang ? nm.xiangNote : null,
        三才: `${t}（天格${ge.tian}）· ${r}（人格${ge.ren}）· ${d}（地格${ge.di}）`,
        天人关系: `${relTH} — 以天格${t}为主、人格${r}为客：${REL_NOTE_TH[relTH] ?? ''}`,
        人地关系: `${relHD} — 以人格${r}为主、地格${d}为客：${REL_NOTE_HD[relHD] ?? ''}`,
        三才档位: `${level}（可推导判据，非查表；矩阵取值 ${base}）`,
        人格五行: `${r}（${ws.state}·月令${monthWx}）`,
        数理: `人格${ge.ren}「${renInfo.name}」${renInfo.luck}；地格${ge.di}「${diInfo.name}」${diInfo.luck}`,
        未核实: '⚠ 125 组三才吉凶档位表各谱互异，本插件无可核原表，**故意不下数值**；本条 fidelity 恒为 approx',
        断: base >= 55
          ? '三才相生，根基与基业皆得养，为吉配'
          : base >= 0
            ? '三才虽不全顺，尚无重克，宜守中道'
            : '三才有相克之患，主根基或基业受制，宜以行运、居处调剂',
        说明: notes.join('；'),
        cite: [CITE.三才, CITE.五格],
        evidence: [
          evidence('三才取数（天格·人格·地格各自的数理五行）', `天格${ge.tian}→${t}、人格${ge.ren}→${r}、地格${ge.di}→${d}`, '三才即此三格五行'),
          evidence('三才判据（相生相比为吉、相克为凶，只给关系不给数值）', `天人${relTH}（${goodTH ? '顺' : keTH ? '克' : '—'}）、人地${relHD}（${goodHD ? '顺' : keHD ? '克' : '—'}）`, `→ ${level}（矩阵取值 ${base}）`),
          evidence('人格五行月令旺衰加成', `人格${r}于${monthWx}月为「${ws.state}」`, `(${ws.score}−55)×0.15 = ${((ws.score - 55) * 0.15).toFixed(1)}`),
          evidence('数理吉凶小幅参与（人格、地格各 0.1 权）', `人格${ge.ren}=${renInfo.luck}、地格${ge.di}=${diInfo.luck}`, `${(renInfo.score * 0.1 + diInfo.score * 0.1).toFixed(1)}`),
        ],
      },
    }
  },

  // ── 101 生肖姓名学 ──
  /**
   * 生肖喜忌字根校验（直接命中为主，五行同类推断为辅并降级）。
   * @param {object} chart 盘基。
   * @param {object} entry 条目。
   * @returns {object|null} 结果。
   */
  shengXiaoName(chart) {
    const nm = resolveName(chart)
    if (!nm || nm.chars.length === 0) return null
    const zhi = chart?.birthChart?.yearZhi || chart?.yearZhi || ''
    const animal = ZHI_ANIMAL[zhi]
    const cfg = animal ? SHENGXIAO_T?.[animal] : null
    if (!cfg) return null
    const yearFromBirth = Boolean(chart?.birthChart?.yearZhi)

    // 两级识别：① 字根例字表直接命中；② 命中不到时按「字的部首五行」与喜/忌字根同类做
    // **五行推断**（弱命中，权重减半，输出里标出并降 fidelity）。
    // 若喜、忌两侧都有同五行的字根，则判为「两可」，如实标出而不计分（不猜）。
    const rows = nm.chars.map((ch) => {
      const like = cfg.like.filter((k) => hitRoot(ch, k))
      const dislike = cfg.dislike.filter((k) => hitRoot(ch, k))
      let via = ''
      if (like.length === 0 && dislike.length === 0) {
        const w = charWuxing(ch)
        if (w) {
          const likeW = cfg.like.filter((k) => rootWuxing(k) === w)
          const disW = cfg.dislike.filter((k) => rootWuxing(k) === w)
          if (likeW.length > 0 && disW.length > 0) via = `两可（${w}，喜忌两侧同五行，不计分）`
          else if (likeW.length > 0) { like.push(likeW[0]); via = `五行推断（${w}）` }
          else if (disW.length > 0) { dislike.push(disW[0]); via = `五行推断（${w}）` }
        }
      }
      return { ch, like, dislike, via }
    })
    const total = rows.length
    const inferred = rows.filter((x) => x.via.startsWith('五行推断')).length
    const hitW = (x) => (x.via.startsWith('五行推断') ? 0.5 : 1)
    const likeScore = rows.reduce((s, x) => s + (x.like.length > 0 ? hitW(x) : 0), 0)
    const dislikeScore = rows.reduce((s, x) => s + (x.dislike.length > 0 ? hitW(x) : 0), 0)
    const likeChars = rows.filter((x) => x.like.length > 0).length
    const dislikeChars = rows.filter((x) => x.dislike.length > 0).length
    const unknown = rows.filter((x) => x.like.length === 0 && x.dislike.length === 0).length

    const animalWx = ZHI_WUXING[zhi] ?? '土'
    const nameWx = dominantWuxing(nm.chars)
    const rel = nameWx ? relation(animalWx, nameWx) : '比和'
    let score = 25 + (likeScore / total) * 45 - (dislikeScore / total) * 70
    score += ({ 比和: 12, 生我: 15, 我生: -6, 我克: 8, 克我: -12 }[rel] ?? 0)
    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[animalWx] += 1.5
    if (nameWx) wuxing[nameWx] += 1.5
    for (const ch of nm.chars) {
      const w = charWuxing(ch)
      if (w) wuxing[w] += 0.5
    }

    const likeHit = [...new Set(rows.flatMap((x) => x.like))]
    const dislikeHit = [...new Set(rows.flatMap((x) => x.dislike))]
    const approxFid = !nm.real || !yearFromBirth || inferred > 0

    const notes = [
      cfg.note,
      unknown > 0 ? `${unknown} 字未收录于内置字根表，未计入宜忌（不猜）` : '',
      !nm.real ? nm.note : '',
      !yearFromBirth ? '⚠ 未提供出生资料，生肖取**求占年支**（非生年），结果属近似' : '',
      inferred > 0 ? `⚠ 有 ${inferred} 字未直接命中字根，改按「部首五行同类」推断（半权计分），字根→五行表为本插件编辑取值、无可核出处` : '',
      '⚠ 喜忌字根表属近代通俗说法（各谱互异，与古籍无涉）；字根识别基于「字根→常用例字」近似对照表（非逐字部件拆解），未收录之字识别不出',
    ].filter(Boolean)

    return {
      score,
      essence: `${nm.xiang ? '未报姓名·取象：' : ''}属${animal}（${zhi}）名「${nm.label}」·宜${likeChars}忌${dislikeChars}/${total}字`,
      keys: [
        `属${animal}`,
        `宜${likeHit.join('') || '—'}`,
        `忌${dislikeHit.join('') || '无'}`,
        `${nameWx ?? '字根未识'}名`,
        nm.real ? '实名取字' : '名义取字',
      ].slice(0, 6),
      wuxing,
      timing: null,
      fidelity: (approxFid || nm.approx) ? 'approx' : 'core',
      detail: {
        生肖: `${animal}（${yearFromBirth ? '出生年' : '求占年'}支${zhi}·本气${animalWx}）`,
        姓名: nm.label,
        取象: nm.xiang ? nm.xiangNote : null,
        宜用字根: cfg.like.join('、'),
        忌用字根: cfg.dislike.join('、'),
        逐字判定: rows.map((x) => `${x.ch}：宜[${x.like.join('') || '—'}] 忌[${x.dislike.join('') || '—'}]${x.via ? `（${x.via}）` : ''}`).join(' | '),
        五行关系: nameWx ? `生肖${animalWx} 与 名字${nameWx} → ${rel}` : '字根五行未能识别，按中性论',
        断: dislikeChars > 0
          ? `名中见忌用字根（${dislikeHit.join('、')}），主与生肖相冲相害，宜避或加字化解`
          : likeChars > 0
            ? `名中见喜用字根（${likeHit.join('、')}），与生肖得地得食，为吉`
            : '名中未见明显喜忌字根，生肖一层无大吉亦无大凶',
        说明: notes.join('；'),
        cite: [CITE.生肖, CITE.字根],
        evidence: [
          evidence('生肖取年支（有出生资料取生年支，否则取求占年支）', `${yearFromBirth ? '出生年' : '求占年'}支${zhi} → ${animal}（本气${animalWx}）`, yearFromBirth ? '取自 birthChart.yearZhi' : '无出生资料 → fidelity 降 approx'),
          evidence('喜忌字根直接命中（字根→例字近似对照表）', rows.map((x) => `${x.ch} 宜[${x.like.join('') || '—'}] 忌[${x.dislike.join('') || '—'}]`).join('；'), `宜 ${likeScore.toFixed(1)}、忌 ${dislikeScore.toFixed(1)}（推断命中半权）`),
          evidence('名字五行与生肖本气的关系', nameWx ? `生肖${animalWx} 对 名字${nameWx} 为${rel}` : '未识别', `关系项 ${{ 比和: 12, 生我: 15, 我生: -6, 我克: 8, 克我: -12 }[rel] ?? 0}`),
          evidence('未核实项（如实标注）', `喜忌表出处：${CITE.生肖}；字根→五行表：本插件编辑取值`, inferred > 0 ? `本条有 ${inferred} 字靠五行推断 → fidelity 降 approx` : '本条全部为字根直接命中'),
        ],
      },
    }
  },

  // ── 102 八字姓名补益 ──
  /**
   * 以本族自排的四柱取用神，再用姓名字根五行 + 五格数理五行校验补益。
   * 缺出生资料由运行器拦下（need: ['birth']）→ 记「未起」。
   * @param {object} chart 盘基。
   * @param {object} entry 条目。
   * @returns {object|null} 结果。
   */
  baziName(chart) {
    const natal = natalPillars(chart)
    if (!natal) return null
    const ps = natal.pillars
    const ys = yongShenOf(ps)
    if (!ys) return null

    const nm = resolveName(chart)
    const st = nm ? resolveStrokes(chart, nm) : null
    const ge = st ? fiveGe(st.strokes, nm.chars) : null

    const signals = []
    if (nm) {
      for (const ch of nm.chars) {
        const w = charWuxing(ch)
        if (w) signals.push({ w, src: `字根「${ch}」` })
      }
    }
    if (ge) {
      signals.push({ w: shuWuxing(ge.ren), src: `人格${ge.ren}` })
      signals.push({ w: shuWuxing(ge.di), src: `地格${ge.di}` })
      signals.push({ w: shuWuxing(ge.zong), src: `总格${ge.zong}` })
    }
    let good = 0
    let bad = 0
    const goodList = []
    const badList = []
    for (const s of signals) {
      if (!s.w) continue
      if (ys.xi.includes(s.w)) { good += 1; goodList.push(`${s.src}${s.w}`) }
      else if (ys.ji.includes(s.w)) { bad += 1; badList.push(`${s.src}${s.w}`) }
    }
    let score = 30 + good * 11 - bad * 13
    if (good >= 2) score += 8
    if (bad >= 2) score -= 6
    score = clamp(score, -100, 100)

    // 应期：近十二年里年干五行属喜用的年份
    const years = []
    const y0 = chart?.solar?.y ?? 2000
    for (let k = 0; k < 12 && years.length < 3; k += 1) {
      const y = y0 + k
      const gz = ganzhiOf(mod(y - 4, 60))
      if (ys.xi.includes(GAN_WUXING[gz[0]])) years.push(`${y}(${gz})`)
    }
    const timing = years.length > 0 ? `逢${ys.xi.join('/')}年（${years.join('、')}）得助` : null

    const wuxing = emptyWuxing()
    wuxing[ys.me] += 1
    for (const w of ys.xi) wuxing[w] += 0.5
    if (nm) {
      for (const ch of nm.chars) {
        const w = charWuxing(ch)
        if (w) wuxing[w] += 0.5
      }
    }
    for (const s of signals) if (s.w) wuxing[s.w] += 0.25

    const approx = !nm || !nm.real || Boolean(st?.approx)

    const notes = [
      nm ? nm.note : '未提供姓名，仅按八字论喜用，姓名一层未参与',
      st?.approx ? '⚠ 部分笔画按字码取数，数理五行仅供参考' : '',
      '字根五行按族内部首表推定（本插件编辑取值，无可核出处），与字义五行或有出入',
      '四柱为本族自排（立春换年 + 节气换月' + (Number.isFinite(chart?.longitude) ? ' + 真太阳时' : '') + '），与命理族 v2 同口径',
    ].filter(Boolean)

    return {
      score,
      essence: `日主${ys.me}${ys.strong ? '身强' : '身弱'}·喜${ys.xi.join('')}·名补${good}忌${bad}`,
      keys: [
        `日主${ys.me}`,
        ys.strong ? '身强喜克泄' : '身弱喜生扶',
        `喜${ys.xi.join('')}`,
        `补${good}处`,
        `忌${bad}处`,
      ].slice(0, 6),
      wuxing,
      timing,
      fidelity: approx ? 'approx' : 'core',
      detail: {
        四柱: ps.join(' '),
        真太阳时: natal.solarTrue,
        时校: natal.solarNote,
        节气: natal.jieqi,
        日主: `${ys.dayGan}（${ys.me}）·${ys.monthZhi}月（${ys.monthWx}）`,
        旺衰: `${ys.level}（得令${ys.deLing}+得地${ys.deDi}+得势${ys.deShi}=${ys.power}/100）`,
        通根: ys.roots.length > 0 ? ys.roots.join('、') : '无根（虚浮）',
        用神: `${ys.yong}${ys.tiaohou ? `（调候${ys.tiaohou}）` : ''}${ys.conflict ? '·调候与扶抑冲突，从调候' : ''}·${ys.season}生`,
        喜用五行: ys.xi.join('、'),
        忌神五行: ys.ji.join('、'),
        姓名: nm ? nm.label : '（未提供）',
        姓名五行信号: signals.map((s) => `${s.src}${s.w}`).join(' ') || '（无）',
        补益判定: `补喜用：${goodList.join('、') || '无'}；犯忌神：${badList.join('、') || '无'}`,
        应期: timing ?? '近十二年未见喜用之年',
        断: good > bad
          ? `名字五行偏补喜用（${ys.xi.join('、')}），于八字有扶抑之功`
          : bad > good
            ? `名字五行偏助忌神（${ys.ji.join('、')}），于八字无益，宜改字以补${ys.xi.join('、')}`
            : '名字五行补忌相抵，宜再以字号、居处、行运调剂',
        说明: notes.join('；'),
        cite: [CITE.八字, CITE.旺衰, CITE.字根],
        evidence: [
          ...ys.evidence,
          evidence('姓名五行信号（字根五行 + 五格数理五行）', signals.map((s) => `${s.src}${s.w}`).join('、') || '无', `补喜用 ${good} 处 (+${good * 11})、犯忌神 ${bad} 处 (−${bad * 13})`),
          evidence('应期（近十二年中年干五行属喜用者）', years.join('、') || '无', timing ?? '未见喜用之年'),
        ],
      },
    }
  },

  // ── 103 面相十二宫（无图像输入，按通例取相） ──
  /**
   * 十二宫部位 + 按通例取相 + 流年应期。
   * ⚠ 本插件**没有图像输入**，取相为通例推定，`fidelity` 恒为 `approx`。
   * @param {object} chart 盘基。
   * @param {object} entry 条目。
   * @param {import('../core/kit.js').Rand} rand 随机源。
   * @returns {object|null} 结果。
   */
  mianXiang(chart, entry, rand) {
    const pr = faceRand(chart, chart?.question, 'mianxiang')
    const face = pickWeighted(FACE_TYPES_T, pr)
    const rows = (MIANXIANG_T ?? []).map((p) => ({ ...p, pick: pickWeighted(p.xiang, pr) })).filter((r) => r.pick)
    if (!face || rows.length === 0) return null
    const boost = topicBoost(chart?.question)

    let num = 0
    let den = 0
    for (const r of rows) {
      const w = (boost[r.gong] ?? 1) * (r.gong === '命宫' ? 1.2 : 1)
      num += r.pick.score * w
      den += w
    }
    const score = clamp(num / den + (face.score - 50) * 0.3, -100, 100)

    const sorted = rows.slice().sort((a, b) => b.pick.score - a.pick.score)
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]
    const ming = rows.find((r) => r.gong === '命宫')

    const wuxing = emptyWuxing()
    wuxing[face.wx] += 3

    return {
      score,
      essence: `（通例取相）面型${face.wx}·${best.gong}${best.pick.name}·${worst.gong}${worst.pick.name}`,
      keys: [
        `面型${face.wx}`,
        `命宫${(ming?.pick.name ?? '—').slice(0, 5)}`,
        `最旺${best.gong}`,
        `最弱${worst.gong}`,
        '通例取相',
      ].slice(0, 6),
      wuxing,
      timing: `${best.gong}应于${best.age}岁前后`,
      fidelity: 'approx',
      detail: {
        面型: `${face.name}·${face.wx} — ${face.duan}`,
        十二宫: rows.map((r) => `${r.gong}（${r.buwei}·${r.age}岁）${r.pick.name}：${r.pick.duan}`).join(' ‖ '),
        最旺之宫: `${best.gong}（${best.buwei}）${best.pick.name}`,
        最弱之宫: `${worst.gong}（${worst.buwei}）${worst.pick.name}`,
        流年应期: `${best.gong}应${best.age}岁前后；${worst.gong}应${worst.age}岁前后宜留意`,
        宫名说明: '十二宫从今名；旧籍「奴仆宫」即今「交友宫」，「男女宫」即今「子女宫」，「妻妾宫」即今「夫妻宫」',
        问事侧重: Object.keys(boost).length > 0 ? `按所问加重：${Object.keys(boost).join('、')}` : '所问未指明事类，十二宫均看',
        断: score >= 40
          ? '十二宫多明，相属上格，宜守正进取'
          : score >= 10
            ? '十二宫平顺，无大缺陷，宜循分而行'
            : score >= -20
              ? '十二宫互见，吉凶相参，宜补其不足'
              : '十二宫多滞，相带滞气，宜修心养身、早作调理',
        说明: NO_IMAGE_NOTE,
        cite: [CITE.面相],
        evidence: [
          evidence('无图像输入（本条最关键的诚实标记）', '本插件没有任何照片/图像数据', '取相为通例推定 → fidelity 恒 approx'),
          evidence('十二宫部位与流年（相术通行之说）', rows.map((r) => `${r.gong}=${r.buwei}(${r.age}岁)`).join('、'), '按部位加权取相'),
          evidence('问事加权（问什么就看什么宫）', Object.keys(boost).length > 0 ? Object.entries(boost).map(([k, v]) => `${k}×${v}`).join('、') : '均看', '命宫权重再 ×1.2'),
          evidence('面型五行参与（面型 5 种按权重取）', `${face.name}·${face.wx}（面型分 ${face.score}）`, `(${face.score}−50)×0.3 = ${((face.score - 50) * 0.3).toFixed(1)}`),
        ],
      },
    }
  },

  // ── 104 手相掌纹（无图像输入，按通例取相） ──
  /**
   * 三大主线（生命线/智慧线/感情线）+ 事业线/婚姻线 + 掌型。
   * ⚠ 本插件**没有图像输入**，取相为通例推定，`fidelity` 恒为 `approx`。
   * @param {object} chart 盘基。
   * @param {object} entry 条目。
   * @param {import('../core/kit.js').Rand} rand 随机源。
   * @returns {object|null} 结果。
   */
  shouXiang(chart, entry, rand) {
    const pr = faceRand(chart, chart?.question, 'shouxiang')
    const palm = pickWeighted(PALM_TYPES_T, pr)
    const rows = (SHOUXIANG_T ?? []).map((l) => ({ ...l, pick: pickWeighted(l.xiang, pr) })).filter((r) => r.pick)
    if (!palm || rows.length === 0) return null
    const q = String(chart?.question ?? '')

    // 所问事类 → 对应掌纹加权
    const lineBoost = {
      '生命线（地纹）': /健康|病|身体|寿|养/.test(q) ? 1.6 : 1,
      '智慧线（人纹）': /学业|考试|读书|思路|决策/.test(q) ? 1.6 : 1,
      '感情线（天纹）': /婚|感情|夫妻|对象|恋爱|姻缘/.test(q) ? 1.6 : 1,
      '事业线（玉柱纹）': /事业|工作|官|升|职|财|生意/.test(q) ? 1.6 : 1,
      '婚姻线（家风纹）': /婚|嫁|娶|家庭/.test(q) ? 1.6 : 1,
    }

    let num = 0
    let den = 0
    for (const r of rows) {
      const w = (Number(r.weight) || 1) * (lineBoost[r.name] ?? 1)
      num += r.pick.score * w
      den += w
    }
    const score = clamp(num / den + (palm.score - 50) * 0.3, -100, 100)

    const sorted = rows.slice().sort((a, b) => b.pick.score - a.pick.score)
    const best = sorted[0]
    const worst = sorted[sorted.length - 1]
    const life = rows.find((r) => r.name.startsWith('生命线'))
    const heart = rows.find((r) => r.name.startsWith('感情线'))
    const smart = rows.find((r) => r.name.startsWith('智慧线'))

    const wuxing = emptyWuxing()
    wuxing[palm.wx] += 3

    return {
      score,
      essence: `（通例取相）掌型${palm.wx}形·生命线${(life?.pick.name ?? '—').slice(0, 6)}·感情线${(heart?.pick.name ?? '—').slice(0, 6)}`,
      keys: [
        `掌型${palm.wx}形`,
        `生命线${(life?.pick.name ?? '—').slice(0, 4)}`,
        `智慧线${(smart?.pick.name ?? '—').slice(0, 4)}`,
        `感情线${(heart?.pick.name ?? '—').slice(0, 4)}`,
        `最旺${best.name.slice(0, 3)}`,
        '通例取相',
      ].slice(0, 6),
      wuxing,
      timing: null,
      fidelity: 'approx',
      detail: {
        掌型: `${palm.name}·${palm.wx} — ${palm.duan}`,
        掌纹: rows.map((r) => `${r.name}（权${r.weight}）${r.pick.name}：${r.pick.duan}`).join(' ‖ '),
        三大主线: `生命线（地纹）：${life?.pick.name ?? '—'}；智慧线（人纹）：${smart?.pick.name ?? '—'}；感情线（天纹）：${heart?.pick.name ?? '—'}`,
        最旺之纹: `${best.name}${best.pick.name}`,
        最弱之纹: `${worst.name}${worst.pick.name}`,
        问事侧重: Object.entries(lineBoost).some(([, v]) => v > 1)
          ? `按所问加重：${Object.entries(lineBoost).filter(([, v]) => v > 1).map(([k]) => k).join('、')}`
          : '所问未指明事类，五纹均看',
        断: score >= 40
          ? '三大主线深明，掌属上格，主身心事业皆顺'
          : score >= 10
            ? '掌纹平顺，无大破败，宜循序而进'
            : score >= -20
              ? '掌纹互见，吉凶相参，宜补其不足'
              : '掌纹多滞，主线欠明，宜养身节劳、稳守待时',
        说明: NO_IMAGE_NOTE,
        cite: [CITE.手相],
        evidence: [
          evidence('无图像输入（本条最关键的诚实标记）', '本插件没有任何照片/图像数据', '取相为通例推定 → fidelity 恒 approx'),
          evidence('掌纹与权重（三大主线各 1.2，事业线与婚姻线各 0.8）', rows.map((r) => `${r.name}权${r.weight}`).join('、'), '加权平均取断'),
          evidence('问事加权（问什么就看哪条线）', Object.entries(lineBoost).some(([, v]) => v > 1) ? Object.entries(lineBoost).filter(([, v]) => v > 1).map(([k, v]) => `${k}×${v}`).join('、') : '均看', '所问侧重参与加权'),
          evidence('掌型五行参与（掌型 5 种按权重取）', `${palm.name}·${palm.wx}（掌型分 ${palm.score}）`, `(${palm.score}−50)×0.3 = ${((palm.score - 50) * 0.3).toFixed(1)}`),
        ],
      },
    }
  },
}

export default engines
