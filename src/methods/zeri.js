/**
 * 方法模块 · 择时/择日（14 法 / 14 引擎，覆盖注册表 no.59–72）
 *
 *   59 黄历宜忌 `huangli` ｜ 60 建除十二神 `jianchu` ｜ 61 二十八宿择日 `xiu28Zeri`
 *   62 黄黑道择日 `huangHeiDao` ｜ 63 董公择日 `donggong` ｜ 64 杨公十三忌 `yanggong`
 *   65 五运六气 `wuyunLiuqi` ｜ 66 太岁三煞 `taisui` ｜ 67 紫白九星择日 `zibai`
 *   68 奇门择时 `qimenZeShi` ｜ 69 六曜择日 `liuyaoZeri` ｜ 70 十二值神 `zhiShen`
 *   71 择吉时 `jiShi` ｜ 72 综合择日 `zeRi`
 *
 * ## 契约（见 core/runner.js 顶部）
 * ```js
 * export const engines = { 引擎名(chart, entry) { return 结果对象 | null } }
 * ```
 * 结果字段：`score`(-100..100) / `essence`(≤60字) / `keys`(≤6) / `wuxing`(五项有限数)
 * / `timing`(应期或 null) / `detail`(非空对象) / `fidelity`(可覆盖条目默认)。
 *
 * ## 三条硬约束（本族最硬的一条在最前）
 * 1. **绝不随机**：本族引擎**签名里不接 `rand`**，也绝不调用任何随机源。
 *    `#59/60/61/62/69` 的 `essence` 与 `score` 必须**只由历法决定**，不随所问之事改变
 *    （smoke 逐条断言；这五法的 `detail.所问参考` 里可以给出与所问事类的关系说明，但不进分、不进断语）。
 * 2. **纯函数**：不读时钟/文件/网络，不写模块级可变状态。
 * 3. **不抛异常**：算不出返回 `null`；一切外部取值走可选链与兜底。
 *
 * ## 数据来源（逐条写在明处，便于 verifier 核）
 * - **通书日粒度四件套（建除／值日神／值宿／六曜）与宜忌、吉神凶煞、彭祖百忌**：
 *   一律取内置历法库 `vendor/lunar.cjs`（lunar-javascript，含寿星天文历）的 `Lunar` 方法，
 *   由 `core/calendar.js` 汇总进 `chart.almanac`。本模块**同时自算**建除／值日神的起法并与
 *   历法库对拍（见 `detail.evidence` 的「起法对拍」行）——两条通路一致才写进 detail。
 * - **`chart.almanac.zhiXing/tianShen` 是通书日粒度**；四柱口径见 `zhiXingExact/tianShenExact`。
 *   交节气当日二者**合法地不同**（日粒度按交节日整天换月，四柱口径按交节时刻换月），
 *   本模块在 `detail.口径` 里写明用了哪一个，并在二者不同时同时列出。
 * - **二十八宿吉凶以 `core/tables.js XIU28_LUCK` 为单一权威**（通书《二十八宿吉凶歌》测：
 *   心、翼两宿为凶）；历法库的 `xiuLuck` 作对拍，不一致时以 `XIU28_LUCK` 为准并在 detail 标出。
 * - **紫白九星**：年白用闭式「11 − 年数字根」（1900–2100 逐年在案，与历法库 `getYearNineStar` **0 不符**）；
 *   月白用口诀「子午卯酉年正月八白、寅申巳亥年正月二黑、辰戌丑未年正月五黄，逐月逆退」
 *   （2026 全年 12 个月逐月对拍 **0 不符**）；日白与时白取历法库 `getDayNineStar/getTimeNineStar`
 *   （冬至后甲子日起一白顺行、夏至后甲子日起九紫逆行）。
 * - **黄黑道值日神起法**：`起支 = 2×(通书月支序 − 2) mod 12`，`值日神 = TIANSHEN_ORDER[(日支序 − 起支) mod 12]`
 *   （400 日逐日对拍历法库 **0 不符**）。**值时神起法**：子午日起申、丑未日起戌、寅申日起子、
 *   卯酉日起寅、辰戌日起辰、巳亥日起午（青龙起时），顺行（晚子时按归次日之支论）。
 * - **奇门（#68）**：二十四节气三元定局表 + 符头定元（拆补派口径），三奇六仪地盘布局按阳顺阴逆；
 *   断据取「三奇得使／门迫门制／九星吉凶」通行判据。**不 import 任何 methods 模块**（跨族禁互引），
 *   本族自带的奇门小表在下方，出处见各自注释。
 * - **五运六气**：岁运取 `tables.WUYUN`（《素问·天元纪大论》五运），司天取 `tables.LIUQI_SITIAN`
 *   （《素问·五运行大论》），在泉 = 司天三阴三阳之对（三之气对终之气）。
 */

import {
  GAN, ZHI, ZHI_WUXING, ZHI_LIUCHONG,
  relation, wangShuai, clamp, mod, emptyWuxing,
} from '../core/kit.js'
import {
  JIANCHU, HUANGHEIDAO, XIU28_LUCK, XIU28_ORDER, XIU28_GROUP,
  LIUYAO, NINE_STAR, DONGGONG_JI, YANGGONG_13, WUYUN, LIUQI_SITIAN,
  XUANKONG_FLY, LUOSHU_GONG, durationOf,
} from '../core/tables.js'
import { LunarLib } from '../core/calendar.js'
import * as ZD from './data/zeri.js'

// ═════════════════════════════ 本族表（带出处） ═════════════════════════════

/** 十二值神轮转序（黄黑道）。cite: 《协纪辨方书》黄黑道十二神通行序（青龙起） */
const TIANSHEN_ORDER = ZD.TIANSHEN_ORDER

/**
 * 值日神「起支」：起支序 = 2×(通书月支序 − 2) mod 12；值日神 = TIANSHEN_ORDER[(日支序 − 起支序) mod 12]。
 * cite: 黄黑道值日神起例（通书系统「青龙起例」）；本插件已对 `vendor/lunar.cjs` 的 `getDayTianShen`
 *   做 400 日逐日对拍（0 不符，见 docs/verification/zeri.md）。
 * @param {string} monthZhi 通书月支。
 * @param {string} dayZhi 日支。
 * @returns {string} 值日神名。
 */
function dayTianShenOf(monthZhi, dayZhi) {
  const qi = mod(2 * (ZHI.indexOf(monthZhi) - 2), 12)
  return TIANSHEN_ORDER[mod(ZHI.indexOf(dayZhi) - qi, 12)] ?? '—'
}

/**
 * 值时神「青龙起时」表（日支 → 起青龙的时辰支）。
 * cite: 通书黄黑道值时神口诀「子午青龙起申，丑未起戌，寅申起子，卯酉起寅，辰戌起辰，巳亥起午」，
 *   顺行；晚子时按归次日之支论（与历法库 `getTimeTianShen` 对拍一致）。
 */
const HOUR_TS_START = { 子: '申', 午: '申', 丑: '戌', 未: '戌', 寅: '子', 申: '子', 卯: '寅', 酉: '寅', 辰: '辰', 戌: '辰', 巳: '午', 亥: '午' }

/**
 * 值时神（黄黑道）。
 * @param {string} hourZhi 时辰支。
 * @param {string} dayZhi 该时辰所属日之支（晚子时传次日之支）。
 * @returns {string} 值时神名。
 */
function hourTianShenOf(hourZhi, dayZhi) {
  const start = HOUR_TS_START[dayZhi] ?? '申'
  return TIANSHEN_ORDER[mod(ZHI.indexOf(hourZhi) - ZHI.indexOf(start), 12)] ?? '—'
}

/** 建除十二神序。cite: 通书建除十二神（建除满平定执破危成收开闭） */
const JIANCHU_ORDER = ZD.JIANCHU_ORDER

/**
 * 建除起法：建日 = 日支同（通书）月支，逐日顺行。
 * cite: 《协纪辨方书·卷十》建除十二神（月建上起建，日支顺行）；已对 `vendor/lunar.cjs` `getZhiXing`
 *   做 60 日逐日对拍（0 不符）。
 * @param {string} monthZhi 通书月支。
 * @param {string} dayZhi 日支。
 * @returns {string} 建除神名。
 */
function jianchuOf(monthZhi, dayZhi) {
  return JIANCHU_ORDER[mod(ZHI.indexOf(dayZhi) - ZHI.indexOf(monthZhi), 12)] ?? '—'
}

/** 十二支 → 方位。cite: 后天八卦方位与地支分野（通行） */
const DIR_OF_ZHI = {
  子: '北', 丑: '东北', 寅: '东北', 卯: '东', 辰: '东南', 巳: '东南',
  午: '南', 未: '西南', 申: '西南', 酉: '西', 戌: '西北', 亥: '西北',
}

/** 洛书飞布次序与宫数（自 core/tables.js 取，本族不另立）。cite: 《洛书》 */
const FLY = XUANKONG_FLY
const GONG_NUM = LUOSHU_GONG

/**
 * 九星入中 → 九宫分布（顺飞）。
 * cite: 《沈氏玄空学》九宫飞星（入中星顺飞：中→乾→兑→艮→离→坎→坤→震→巽）
 * @param {number} center 入中星数（1..9）。
 * @returns {Object<string,number>} 宫名 → 星数。
 */
function flyPalaces(center) {
  const out = {}
  FLY.forEach((g, i) => { out[g] = mod(Number(center) - 1 + i, 9) + 1 })
  return out
}

/**
 * 年白入中星：11 − 年数字根（≤0 加 9）。
 * cite: 通书紫白年白起例（上元甲子一白、中元甲子四绿、下元甲子七赤，逐年逆退），
 *   闭式见 docs/research/sanshi-spec.md §D4「11 − 年数字根，三元逐年逆退」；
 *   已对 `vendor/lunar.cjs` `getYearNineStar`（立春换年口径）做 1900–2100 共 201 年对拍（0 不符）。
 * @param {number} year 公元年（立春换年后的年份）。
 * @returns {number} 入中星数 1..9。
 */
function yearStarOf(year) {
  let n = String(Math.trunc(year)).split('').reduce((a, b) => a + Number(b), 0)
  while (n > 9) n = String(n).split('').reduce((a, b) => a + Number(b), 0)
  let star = 11 - n
  while (star > 9) star -= 9
  while (star <= 0) star += 9
  return star
}

/**
 * 月白入中星：年支三组定正月起星，逐月逆退。
 * cite: 通书月白起例口诀「子午卯酉八白起，寅申巳亥二黑求，辰戌丑未五黄发」；
 *   已对 `vendor/lunar.cjs` `getMonthNineStar` 做 2026 年 12 个月逐月对拍（0 不符）。
 * @param {string} yearZhi 立春换年后的年支。
 * @param {number} monthIdx 月序（0 = 正月/寅月）。
 * @returns {number} 入中星数 1..9。
 */
function monthStarOf(yearZhi, monthIdx) {
  const start = { 子: 8, 午: 8, 卯: 8, 酉: 8, 寅: 2, 申: 2, 巳: 2, 亥: 2, 辰: 5, 戌: 5, 丑: 5, 未: 5 }[yearZhi] ?? 8
  let star = start - mod(monthIdx, 12)
  while (star <= 0) star += 9
  return star
}

/**
 * 奇门：二十四节气三元定局表（上元／中元／下元）。
 * cite: 《烟波钓叟歌》系二十四节气定局（阳遁：冬至一七四、小寒二八五…；阴遁：夏至九三六、小暑八二五…），
 *   与 `docs/research/sanshi-spec.md` §A2「局数表（三源一致）」同源。
 * note: 定元取**符头法（拆补派）**——日干支每五日一符头（甲/己日），
 *   符头支属子午卯酉为上元、寅申巳亥为中元、辰戌丑未为下元；置闰派可能差一局，已在 detail 说明。
 */
const QIMEN_JU = {
  冬至: [1, 7, 4], 小寒: [2, 8, 5], 大寒: [3, 9, 6], 立春: [8, 5, 2], 雨水: [9, 6, 3], 惊蛰: [1, 7, 4],
  春分: [3, 9, 6], 清明: [4, 1, 7], 谷雨: [5, 2, 8], 立夏: [4, 1, 7], 小满: [5, 2, 8], 芒种: [6, 3, 9],
  夏至: [9, 3, 6], 小暑: [8, 2, 5], 大暑: [7, 1, 4], 立秋: [2, 5, 8], 处暑: [1, 4, 7], 白露: [9, 3, 6],
  秋分: [7, 1, 4], 寒露: [6, 9, 3], 霜降: [5, 8, 2], 立冬: [6, 9, 3], 小雪: [5, 8, 2], 大雪: [4, 7, 1],
}

/** 阳遁节气（冬至→芒种）。cite: 奇门阴阳遁分界（冬至后阳遁、夏至后阴遁，通行） */
const YANG_JIEQI = ['冬至', '小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种']

/** 三奇（乙丙丁）与六仪（戊己庚辛壬癸，甲遁于仪）。cite: 《烟波钓叟歌》三奇六仪（乙丙丁为三奇，戊己庚辛壬癸为六仪） */
const SANQI = ['乙', '丙', '丁']
const LIUYI = ['戊', '己', '庚', '辛', '壬', '癸']
/** 六仪配旬首（甲子戊、甲戌己、甲申庚、甲午辛、甲辰壬、甲寅癸）。cite: 《奇门遁甲统宗》旬首配仪 */
const XUNSHOU_YI = { 甲子: '戊', 甲戌: '己', 甲申: '庚', 甲午: '辛', 甲辰: '壬', 甲寅: '癸' }
/** 三奇得使：乙临甲午甲戌、丙临甲子甲申、丁临甲寅甲辰。cite: 《奇門遁甲統宗·奇門四十格》「三奇得使」条 */
const DE_SHI = { 乙: ['甲午', '甲戌'], 丙: ['甲子', '甲申'], 丁: ['甲寅', '甲辰'] }

/** 九星本宫（洛书）。cite: 通例九星配九宫（天蓬坎一…天英离九） */
const STAR_OF_GONG = { 1: '天蓬', 2: '天芮', 3: '天冲', 4: '天辅', 5: '天禽', 6: '天心', 7: '天柱', 8: '天任', 9: '天英' }
/** 八门本宫。cite: 通例八门配九宫（休坎一、死坤二、伤震三、杜巽四、开乾六、惊兑七、生艮八、景离九） */
const GATE_OF_GONG = { 1: '休门', 2: '死门', 3: '伤门', 4: '杜门', 6: '开门', 7: '惊门', 8: '生门', 9: '景门' }
/** 八门五行（门之五行，用于门迫/门制判定）。cite: 通例（休水、死土、伤木、杜木、开金、惊金、生土、景火） */
const GATE_WX = { 休门: '水', 死门: '土', 伤门: '木', 杜门: '木', 开门: '金', 惊门: '金', 生门: '土', 景门: '火' }
/** 八门吉凶分。cite: 通例「开休生为三吉门，死惊伤为三凶门，杜景平」；分值为本插件编辑取值 */
const GATE_LUCK = { 生门: 50, 开门: 45, 休门: 40, 景门: 8, 杜门: -12, 伤门: -30, 惊门: -35, 死门: -55 }
/** 九星吉凶分。cite: 通例「辅、禽、心、任为四吉星，蓬、芮、柱、英为四凶星，冲为小吉」；分值为编辑取值 */
const STAR_LUCK = { 天辅: 40, 天禽: 38, 天心: 35, 天任: 32, 天冲: 8, 天蓬: -34, 天芮: -30, 天柱: -28, 天英: -26 }
/** 宫数 → 八卦名。cite: 后天八卦配洛书（坎一坤二震三巽四中五乾六兑七艮八离九） */
const GONG_GUA = { 1: '坎', 2: '坤', 3: '震', 4: '巽', 5: '中', 6: '乾', 7: '兑', 8: '艮', 9: '离' }

/**
 * 本族出处账本（detail.cite 直接引用，避免各法各说一套）。
 */
const CITE = {
  通书: '通书日粒度四件套与宜忌：vendor/lunar.cjs（lunar-javascript，含寿星天文历）Lunar 方法，经 core/calendar.js 汇总进 chart.almanac；本模块同时自算建除/值日神起法并与该库对拍',
  建除: '《协纪辨方书·卷十》建除十二神：月建上起建、日支顺行（本插件 60 日对拍历法库 0 不符）',
  黄黑道: '黄黑道十二值神：青龙起例（值日神 起支 = 2×(通书月支序−2) mod 12；值时神「子午起申、丑未起戌、寅申起子、卯酉起寅、辰戌起辰、巳亥起午」），本插件 400 日 / 48 时辰对拍历法库 0 不符',
  宿: '二十八宿吉凶以 core/tables.js XIU28_LUCK 为单一权威（源 vendor/lunar.cjs XIU_LUCK，即通书《二十八宿吉凶歌》）；禽曜与歌诀取同一库 XIU_SONG/ZHENG/ANIMAL',
  六曜: '六曜（先胜/友引/先负/仏灭/大安/赤口）为中日同源旧历法；`佛灭`/`仏灭` 互为异体，查表统一归一到 LIUYAO 表的键',
  紫白: '紫白九星：年白「11 − 年数字根」（1900–2100 共 201 年对拍历法库 0 不符）；月白口诀「子午卯酉八白起、寅申巳亥二黑求、辰戌丑未五黄发」逐月逆退（2026 全年 12 月对拍 0 不符）；日白/时白取历法库 getDayNineStar/getTimeNineStar（冬至后顺行、夏至后逆行）；飞布用本插件 core/tables.js XUANKONG_FLY + LUOSHU_GONG',
  五运六气: '五运：core/tables.js WUYUN（《素问·天元纪大论》十干化运太过不及）；六气：core/tables.js LIUQI_SITIAN（《素问·五运行大论》司天）+ 在泉为三阴三阳之对；主气六步与客气加临按六步次序（《素问·六微旨大论》）',
  太岁: '太岁/岁破：年支与对冲之支（通行）；三煞：年支三合局所克之方（申子辰煞南、寅午戌煞北、亥卯未煞西、巳酉丑煞东，见 methods/data/zeri.js SANSHAN_DIR）；五黄：年白入中后五黄所到之宫所主方位（《沈氏玄空学》）',
  董公: '《董公选要》董公择日（月支 → 忌日支映射见 core/tables.js DONGGONG_JI）；凶煞叠加取 chart.almanac.xiongSha 计数（通书日粒度）',
  杨公: '杨公十三忌（core/tables.js YANGGONG_13，农历月 → 忌日）；口诀原文见 methods/data/zeri.js YANGGONG_VERSE',
  奇门: '《烟波钓叟歌》二十四节气三元定局 + 《奇門遁甲統宗·奇門四十格》三奇得使（乙加甲午甲戌、丙加甲子甲申、丁加甲寅甲辰）+ 门迫/门制（门克宫为迫、宫克门为制）；定元取拆补派符头法，九星/八门吉凶分值为本插件编辑取值',
  彭祖: '彭祖百忌（干支各忌一事：如「丁不剃头」「未不服药」）取 vendor/lunar.cjs getPengZuGan/getPengZuZhi 原文，本模块只解析其首字与所忌之事',
  神煞: '吉神凶煞名目取 chart.almanac.jiShen/xiongSha（vendor/lunar.cjs），与 core/tables.js SHENSHA_ALL 的命理神煞是两套体系（一为通书日家、一为四柱年日家），不可混用',
  编辑取值: '凡吉凶分、权重、排序口径，均为本插件公开可查的编辑取值（非秘本数字），写在各自 detail 与 docs/verification/zeri.md',
}

// ───────────────────────────── 共用小工具 ─────────────────────────────

/**
 * 取所问事类（从问题关键词）。
 * @param {object} chart 盘基。
 * @returns {object} 事类对象（ZERI_TOPICS 之一或 GENERAL_TOPIC）。
 */
function topicOf(chart) {
  const q = String(chart?.question ?? '')
  for (const t of ZD.ZERI_TOPICS) if (t.kw.some((k) => k && q.includes(k))) return t
  return ZD.GENERAL_TOPIC
}

/**
 * 通书月支（日粒度）——与历法库同一口径。
 * @param {object} chart 盘基。
 * @returns {string} 月支。
 */
function tongshuMonthZhi(chart) {
  return chart?.almanac?.monthZhiTongshu || chart?.monthZhi || '子'
}

/**
 * 归一六曜名（异体字）：历法库作「佛灭」，表键作「仏灭」。
 * @param {string} raw 原始名。
 * @returns {string} 表内键名。
 */
function liuyaoName(raw) {
  const s = String(raw ?? '')
  if (s === '佛灭') return '仏灭'
  return s
}

/** 五行空表 + 少量加权的快捷写法。 */
function wxAdd(wx, w, weight = 1) {
  if (wx && Object.prototype.hasOwnProperty.call(wx, w)) wx[w] += weight
}

/**
 * 宜忌比对：把通书「宜/忌」条目与事类术语比对。
 * @param {object} topic 事类。
 * @param {string[]} yi 通书宜。
 * @param {string[]} ji 通书忌。
 * @returns {{hitYi:string[], hitJi:string[], score:number, note:string}} 比对结果。
 */
function yiJiFit(topic, yi, ji) {
  const terms = topic?.terms ?? []
  if (terms.length === 0) {
    const s = clamp((yi.length - ji.length) * 4, -60, 60)
    return { hitYi: [], hitJi: [], score: s, note: `未识别具体事类 → 只按宜${yi.length}条／忌${ji.length}条之差计分` }
  }
  const hitYi = terms.filter((t) => yi.includes(t))
  const hitJi = terms.filter((t) => ji.includes(t))
  const score = clamp(hitYi.length * 22 - hitJi.length * 30, -80, 80)
  return {
    hitYi,
    hitJi,
    score,
    note: `事类「${topic.name}」对应通书术语 [${terms.slice(0, 6).join('/')}${terms.length > 6 ? '…' : ''}]：宜中 ${hitYi.length} 项${hitYi.length ? `（${hitYi.join('/')}）` : ''}、忌中 ${hitJi.length} 项${hitJi.length ? `（${hitJi.join('/')}）` : ''} → ${hitYi.length}×22 − ${hitJi.length}×30 = ${Math.round(score)}`,
  }
}

/**
 * 由历法库造一个指定日期的 Lunar（用于未来日扫描与逐时辰取值）。
 * @param {number} y 年。
 * @param {number} m 月。
 * @param {number} d 日。
 * @param {number} [h] 时。
 * @param {number} [mi] 分。
 * @returns {object|null} Lunar 对象；失败返回 null（不抛异常）。
 */
function lunarAt(y, m, d, h = 12, mi = 0) {
  try {
    return LunarLib.Solar.fromYmdHms(y, m, d, h, mi, 0).getLunar()
  } catch {
    return null
  }
}

/**
 * 某日（日粒度）的择日要素汇总——供 #72 扫描未来 30 日复用。
 * @param {object} l Lunar 对象。
 * @returns {object|null} 日要素。
 */
function dayFacts(l) {
  if (!l) return null
  const mz = l.getMonthZhi()
  const dz = l.getDayZhi()
  return {
    ymd: l.getSolar().toYmd(),
    ganzhi: l.getDayInGanZhi(),
    dayZhi: dz,
    monthZhi: mz,
    jianchu: jianchuOf(mz, dz),
    tianShen: dayTianShenOf(mz, dz),
    xiu: l.getXiu(),
    xiuLuck: XIU28_LUCK[l.getXiu()] ?? l.getXiuLuck(),
    liuyao: liuyaoName(l.getLiuYao()),
    dayStar: Number(l.getDayNineStar()?.getNumber?.() ?? NaN) || cnNum(l.getDayNineStar()?.getNumber?.()),
    yi: safeArr(() => l.getDayYi()),
    ji: safeArr(() => l.getDayJi()),
    jiShen: safeArr(() => l.getDayJiShen()),
    xiongSha: safeArr(() => l.getDayXiongSha()),
    pengZuGan: String(safeStr(() => l.getPengZuGan())),
    pengZuZhi: String(safeStr(() => l.getPengZuZhi())),
  }
}

/** 安全取数组（异常回空数组）。 */
function safeArr(fn) {
  try {
    const v = fn()
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

/** 安全取字符串。 */
function safeStr(fn) {
  try {
    return String(fn() ?? '')
  } catch {
    return ''
  }
}

/** 汉字数字 → 阿拉伯数字（历法库九星 getNumber 返回汉字）。 */
function cnNum(v) {
  const m = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  const n = Number(v)
  if (Number.isFinite(n) && n > 0) return n
  return m[String(v)] ?? 0
}

/** 九星数 → NINE_STAR 表项。 */
function starInfo(num) {
  return NINE_STAR.find((s) => s.num === Number(num)) ?? null
}

/**
 * 日白星数（历法库口径：冬至后甲子日起一白顺行、夏至后甲子日起九紫逆行）。
 * @param {object} chart 盘基。
 * @returns {{num:number, name:string, luck:string}|null} 日白。
 */
function dayStarOf(chart) {
  const n = Number(chart?.almanac?.nineStarNum)
  const num = Number.isFinite(n) && n > 0 ? n : cnNum(String(chart?.almanac?.nineStar ?? '').slice(0, 1))
  const info = starInfo(num)
  return info ? { num: info.num, name: info.name, luck: info.luck, wx: info.wx } : null
}

/**
 * 时白星数（历法库口径）。
 * @param {object} chart 盘基。
 * @returns {{num:number, name:string, luck:string}|null} 时白。
 */
function hourStarOf(chart) {
  const raw = String(chart?.almanac?.timeNineStar ?? '')
  const num = cnNum(raw.slice(0, 1))
  const info = starInfo(num)
  return info ? { num: info.num, name: info.name, luck: info.luck, wx: info.wx } : null
}

/**
 * 事类 → 紫白九星相宜加分（一白官星利官事、四绿利学业、六白利开张、八白财星、九紫喜星）。
 * cite: 通书紫白择日取象（methods/data/zeri.js NINE_TOPIC_AFFINITY，本插件编辑取值）
 * @param {number} star 星数。
 * @param {object} topic 事类。
 * @returns {{bonus:number, note:string}} 加分与说明。
 */
function starTopicFit(star, topic) {
  const list = ZD.NINE_TOPIC_AFFINITY[Number(star)] ?? []
  const hit = topic && list.includes(topic.id)
  return { bonus: hit ? 10 : 0, note: `${star} 白类象相宜 [${list.join('/') || '—'}]${hit ? `，合所问「${topic.name}」+10` : ''}` }
}

/** 三煞方（年支 → 方）。cite: methods/data/zeri.js SANSHAN_DIR（三合局所克之方） */
const SANSHAN_DIR = ZD.SANSHAN_DIR
const SANSHAN_ZHI = ZD.SANSHAN_ZHI

/** 事类对「方位忌」的敏感度（动土/安葬/移徙重，余事轻）。cite: 本插件编辑取值（宁严勿滥） */
function dirWeight(topic) {
  const id = topic?.id ?? ''
  if (['动土', '安葬', '移徙'].includes(id)) return 1.0
  if (['开市', '嫁娶', '安床'].includes(id)) return 0.6
  return 0.3
}

/** 彭祖百忌：从「丁不剃头头必生疮」里取首字与所忌事。 */
function pengzuHit(str, topic) {
  const s = String(str ?? '')
  if (!s) return null
  const ch = s.slice(0, 1)
  const topics = ZD.PENGZU_TOPIC[ch] ?? []
  if (topics.length === 0) return { ch, topics, hit: false, note: `${ch}：${s}（未归入择日事类，不参与评分）` }
  const hit = topic && topics.includes(topic.id)
  return { ch, topics, hit, note: `${ch}：${s}（所忌事类 [${topics.join('/')}]${hit ? `，含所问「${topic.name}」` : '，不含所问'}）` }
}

// ═════════════════════════════ 引擎实现 ═════════════════════════════

/** 十四法的原始实现（出口处统一过 {@link scrub} 消毒，见文件末）。 */
const RAW_ENGINES = {
  huangli(chart, entry) {
    const a = chart?.almanac ?? {}
    const yi = Array.isArray(a.yi) ? a.yi : []
    const ji = Array.isArray(a.ji) ? a.ji : []
    const jiShen = Array.isArray(a.jiShen) ? a.jiShen : []
    const xiongSha = Array.isArray(a.xiongSha) ? a.xiongSha : []
    const mz = tongshuMonthZhi(chart)
    const dz = chart.dayZhi
    const jc = jianchuOf(mz, dz)
    const ts = dayTianShenOf(mz, dz)
    const xiu = String(a.xiu ?? '')
    const xiuLuck = XIU28_LUCK[xiu] ?? String(a.xiuLuck ?? '')
    const ly = liuyaoName(a.liuYao)
    const dayStar = dayStarOf(chart)

    // 历法口径（不涉所问）
    const score = clamp(
      (yi.length - ji.length) * 4
      + (jiShen.length - xiongSha.length) * 5
      + (JIANCHU[jc]?.score ?? 0) * 0.35
      + (xiuLuck === '吉' ? 18 : xiuLuck === '凶' ? -18 : 0)
      + (LIUYAO[ly]?.score ?? 0) * 0.25
      + (HUANGHEIDAO[ts]?.score ?? 0) * 0.3
      + (dayStar ? (starInfo(dayStar.num)?.luck === '吉' || starInfo(dayStar.num)?.luck === '大吉' ? 8 : starInfo(dayStar.num)?.luck === '大凶' ? -14 : -4) : 0),
      -100, 100,
    )
    const topic = topicOf(chart)
    const fit = yiJiFit(topic, yi, ji)

    const wuxing = emptyWuxing()
    wxAdd(wuxing, ZHI_WUXING[dz] ?? '土', 2)
    wxAdd(wuxing, chart.monthWx ?? '土', 1)
    if (dayStar?.wx) wxAdd(wuxing, dayStar.wx, 1)

    return {
      score,
      essence: `黄历·宜${yi.length}忌${ji.length}·吉神${jiShen.length}凶煞${xiongSha.length}·${jc}日${ts}`,
      keys: [`宜${yi.length}`, `忌${ji.length}`, jc, ts, `宿${xiu}`, ly],
      wuxing,
      timing: yi.length > ji.length ? '当日即可行' : '宜另择他日',
      detail: {
        日期: `${a.monthZhiTongshu ?? chart.monthZhi}月 ${dz}日（通书日粒度）`,
        宜: yi.join('、') || '（无）',
        忌: ji.join('、') || '（无）',
        吉神: jiShen.join('、') || '（无）',
        凶煞: xiongSha.join('、') || '（无）',
        彭祖百忌: `${a.pengZuGan ?? '—'}；${a.pengZuZhi ?? '—'}`,
        建除: `${jc}（${JIANCHU[jc]?.note ?? '—'}）`,
        值日神: `${ts}（${HUANGHEIDAO[ts]?.dao ?? '—'}，${HUANGHEIDAO[ts]?.score ?? 0}）`,
        值宿: `${xiu}（${xiuLuck}，${a.zheng ?? ''}${a.animal ?? ''}）`,
        六曜: `${ly}（${LIUYAO[ly]?.note ?? '—'}）`,
        日白: dayStar ? `${dayStar.num}${dayStar.name.slice(1)}（${dayStar.luck}）` : '—',
        口径: `建除/值日神按**通书日粒度**（通书月支 ${a.monthZhiTongshu ?? mz}）自算；四柱口径见 detail.交节对照`,
        交节对照: `通书建除 ${a.zhiXing ?? '—'} ／ 四柱建除 ${a.zhiXingExact ?? '—'}；通书值神 ${a.tianShen ?? '—'} ／ 四柱值神 ${a.tianShenExact ?? '—'}${a.tongshuAgrees === false ? '（**本日交节，二者合法地不同**）' : ''}`,
        所问参考: `（**不参与本法的分与断语**，仅供人读）${fit.note}`,
        说明: '本法只由历法决定：宜忌条数、吉神凶煞数、建除、值宿、六曜、黄黑道、日白七项合成，**不随所问之事改变**（smoke 断言）。宜忌条目取内置历法库原文，未做增删。',
        cite: [CITE.通书, CITE.建除, CITE.黄黑道, CITE.宿, CITE.六曜, CITE.紫白, CITE.编辑取值],
        evidence: [
          `宜 ${yi.length} 条、忌 ${ji.length} 条 → (${yi.length}−${ji.length})×4 = ${(yi.length - ji.length) * 4}`,
          `吉神 ${jiShen.length}、凶煞 ${xiongSha.length} → (${jiShen.length}−${xiongSha.length})×5 = ${(jiShen.length - xiongSha.length) * 5}`,
          `建除自算：通书月支 ${mz}、日支 ${dz} → (${ZHI.indexOf(dz)}−${ZHI.indexOf(mz)}) mod 12 = ${mod(ZHI.indexOf(dz) - ZHI.indexOf(mz), 12)} → ${jc}；与历法库 almanac.zhiXing「${a.zhiXing}」${jc === a.zhiXing ? '一致 ✓' : '不一致（交节日，属合法差异）'}`,
          `值日神自算：起支序 = 2×(${ZHI.indexOf(mz)}−2) mod 12 = ${mod(2 * (ZHI.indexOf(mz) - 2), 12)} → 值神 ${ts}；与历法库 almanac.tianShen「${a.tianShen}」${ts === a.tianShen ? '一致 ✓' : '不一致（交节日，属合法差异）'}`,
          `值宿 ${xiu} 吉凶：XIU28_LUCK = ${XIU28_LUCK[xiu] ?? '—'}；历法库 xiuLuck = ${a.xiuLuck ?? '—'}${XIU28_LUCK[xiu] && a.xiuLuck && (XIU28_LUCK[xiu] === a.xiuLuck ? '（一致）' : '（**不一致 → 以 XIU28_LUCK 为准**）')}`,
          `合分：宜忌 ${(yi.length - ji.length) * 4} ＋ 神煞 ${(jiShen.length - xiongSha.length) * 5} ＋ 建除 ${((JIANCHU[jc]?.score ?? 0) * 0.35).toFixed(1)} ＋ 宿 ${xiuLuck === '吉' ? 18 : xiuLuck === '凶' ? -18 : 0} ＋ 六曜 ${((LIUYAO[ly]?.score ?? 0) * 0.25).toFixed(1)} ＋ 黄黑道 ${((HUANGHEIDAO[ts]?.score ?? 0) * 0.3).toFixed(1)} = ${Math.round(score)}`,
        ],
      },
    }
  },

  // ── 60 建除十二神（历法决定）──
  jianchu(chart, entry) {
    const mzT = tongshuMonthZhi(chart)
    const jc = jianchuOf(mzT, chart.dayZhi)
    const info = JIANCHU[jc] ?? { score: 0, note: '—' }
    const act = ZD.JIANCHU_ACT[jc] ?? { yi: [], ji: [], note: '' }
    const lib = String(chart?.almanac?.zhiXing ?? '')
    const libExact = String(chart?.almanac?.zhiXingExact ?? '')
    const score = clamp(info.score, -100, 100)
    const wuxing = emptyWuxing()
    wxAdd(wuxing, ZHI_WUXING[chart.dayZhi] ?? '土', 2)
    wxAdd(wuxing, chart.monthWx ?? '土', 2)

    return {
      score,
      essence: `建除·${jc}日·宜${act.yi.length}忌${act.ji.length}·${info.score > 0 ? '吉' : info.score < 0 ? '凶' : '平'}`,
      keys: [jc, `${jc}日`, `宜${act.yi.length}`, `忌${act.ji.length}`, info.note.slice(0, 6)],
      wuxing,
      timing: info.score >= 40 ? '当日可行' : info.score <= -40 ? '宜避此日' : '平常，可择他吉神叠加',
      detail: {
        建除: `${jc}日`,
        起法: `通书月支 ${mzT} 上起「建」，日支 ${chart.dayZhi} 顺行 → 第 ${mod(ZHI.indexOf(chart.dayZhi) - ZHI.indexOf(mzT), 12)} 位 = ${jc}`,
        宜: act.yi.join('、') || '（无特别宜）',
        忌: act.ji.join('、') || '（无特别忌）',
        断语: info.note,
        倾向分: `${info.score}（core/tables.js JIANCHU，公开通例的编辑取值）`,
        口径: '通书日粒度（月支按交节日整天换月）；四柱口径按交节时刻换月，交节当日二者合法地不同',
        交节对照: `本法用通书月支 ${mzT} 自算得 ${jc}；历法库通书值「${lib}」${jc === lib ? '一致 ✓' : '不一致'}；四柱口径值「${libExact}」${jc === libExact ? '（与自算一致）' : '（交节差异）'}`,
        说明: '建除十二神只由「月建＋日支」决定，**不随所问之事改变**。宜忌条目取通书通行表（methods/data/zeri.js JIANCHU_ACT），分值取共享表 JIANCHU（编辑取值）。',
        cite: [CITE.建除, CITE.通书, CITE.编辑取值],
        evidence: [
          `自算：(${ZHI.indexOf(chart.dayZhi)} − ${ZHI.indexOf(mzT)}) mod 12 = ${mod(ZHI.indexOf(chart.dayZhi) - ZHI.indexOf(mzT), 12)} → JIANCHU_ORDER[${mod(ZHI.indexOf(chart.dayZhi) - ZHI.indexOf(mzT), 12)}] = ${jc}`,
          `起法对拍：历法库 almanac.zhiXing = ${lib}（${jc === lib ? '一致 ✓' : '交节差异'}）；四柱口径 zhiXingExact = ${libExact}`,
          `分值：core/tables.js JIANCHU['${jc}'].score = ${info.score} → score = ${Math.round(score)}`,
          `宜忌条数：宜 ${act.yi.length}（${act.yi.join('/') || '—'}）、忌 ${act.ji.length}（${act.ji.join('/') || '—'}）`,
        ],
      },
    }
  },

  // ── 61 二十八宿择日（历法决定；吉凶以 XIU28_LUCK 为单一权威）──
  xiu28Zeri(chart, entry) {
    const a = chart?.almanac ?? {}
    const xiu = String(a.xiu ?? '')
    const luck = XIU28_LUCK[xiu] ?? String(a.xiuLuck ?? '')
    const libLuck = String(a.xiuLuck ?? '')
    const order = XIU28_ORDER[xiu]
    const group = Object.entries(XIU28_GROUP).find(([, list]) => list.includes(xiu))?.[0] ?? '—'
    const score = clamp(luck === '吉' ? 42 : luck === '凶' ? -38 : 0, -100, 100)
    const song = String(a.xiuSong ?? '')
    // 歌诀取义：命中事类关键词的断句（供人读，不进分——本法必须不随所问改变）
    const segs = song.split(/[，。；]/).filter(Boolean)
    const wuxing = emptyWuxing()
    wxAdd(wuxing, ZHI_WUXING[chart.dayZhi] ?? '土', 1)
    wxAdd(wuxing, chart.monthWx ?? '土', 1)

    return {
      score,
      essence: `二十八宿·${xiu}宿（${group}）·${a.zheng ?? ''}${a.animal ?? ''}·${luck}`,
      keys: [`${xiu}宿`, `${a.zheng ?? ''}${a.animal ?? ''}`, luck, group, `第${(order ?? 0) + 1}宿`],
      wuxing,
      timing: luck === '吉' ? '当日可用' : '宜避此宿，另择吉宿',
      detail: {
        值宿: `${xiu}宿（第 ${(order ?? 0) + 1} / 28，${group}）`,
        禽曜: `${a.zheng ?? '—'}${a.animal ?? '—'}（宿之正五行与禽兽，出 vendor/lunar.cjs）`,
        吉凶: `${luck}（**以 core/tables.js XIU28_LUCK 为单一权威**；源 vendor/lunar.cjs XIU_LUCK ＝通书《二十八宿吉凶歌》）`,
        歌诀: song || '（未取到歌诀）',
        歌诀断句: segs.slice(0, 4).join('；'),
        宿度参考: `本宿第 ${(order ?? 0) + 1} 位（角 0 … 轸 27）`,
        口径: '宿按通书日粒度取（历法库值宿）；吉凶只由 XIU28_LUCK 决定，**不随所问之事改变**',
        说明: '二十八宿择日只取「值宿 + 吉凶」，不掺所问。歌诀原文取内置历法库（未转录以避免大段辞书搬运），此处只列断句供人核对。',
        cite: [CITE.宿, CITE.通书, CITE.编辑取值],
        evidence: [
          `值宿：almanac.xiu = ${xiu}（第 ${(order ?? 0) + 1} 宿，${group}）；禽曜 ${a.zheng ?? '—'}${a.animal ?? '—'}`,
          `吉凶权威：XIU28_LUCK['${xiu}'] = ${luck}；历法库 xiuLuck = ${libLuck}${luck === libLuck ? '（一致 ✓）' : '（**不一致 → 以 XIU28_LUCK 为准**；历代通书在个别宿上有分歧）'}`,
          `分值：吉 → +42、凶 → −38（本插件编辑取值，居中无倾向）→ score = ${Math.round(score)}`,
          `歌诀来源：vendor/lunar.cjs LunarUtil.XIU_SONG（${segs.length} 断句）`,
        ],
      },
    }
  },

  // ── 62 黄黑道择日（历法决定）──
  huangHeiDao(chart, entry) {
    const mzT = tongshuMonthZhi(chart)
    const ts = dayTianShenOf(mzT, chart.dayZhi)
    const info = HUANGHEIDAO[ts] ?? { dao: '—', score: 0 }
    const act = ZD.TIANSHEN_ACT[ts] ?? { yi: [], ji: [], note: '' }
    const lib = String(chart?.almanac?.tianShen ?? '')
    const libType = String(chart?.almanac?.tianShenType ?? '')
    const score = clamp(info.score, -100, 100)
    const wuxing = emptyWuxing()
    wxAdd(wuxing, ZHI_WUXING[chart.dayZhi] ?? '土', 2)
    wxAdd(wuxing, chart.monthWx ?? '土', 1)

    return {
      score,
      essence: `黄黑道·${ts}值日（${info.dao}）·宜${act.yi.length}忌${act.ji.length}`,
      keys: [ts, info.dao, `${ts}值日`, `宜${act.yi.length}`, `忌${act.ji.length}`],
      wuxing,
      timing: info.dao === '黄道' ? '当日吉，可行' : '黑道日，宜静守或另择',
      detail: {
        值日神: `${ts}（${info.dao}，${info.score}）`,
        起支: `通书月支 ${mzT}（序 ${ZHI.indexOf(mzT)}）→ 起支序 = 2×(序−2) mod 12 = ${mod(2 * (ZHI.indexOf(mzT) - 2), 12)}`,
        宜: act.yi.join('、') || '（无特别宜）',
        忌: act.ji.join('、') || '（无特别忌）',
        断语: act.note,
        口径: '通书日粒度（值日神按通书月支）；值时神另见 #71 择吉时',
        交节对照: `自算值日神 ${ts}；历法库通书值「${lib}」（${libType}）${ts === lib ? '一致 ✓' : '不一致'}；四柱口径「${chart?.almanac?.tianShenExact ?? '—'}」`,
        说明: '黄黑道十二值神只由「通书月支＋日支」决定，**不随所问之事改变**。黄黑道归类取共享表（通行），分值为编辑取值。',
        cite: [CITE.黄黑道, CITE.通书, CITE.编辑取值],
        evidence: [
          `起支：2×(${ZHI.indexOf(mzT)} − 2) mod 12 = ${mod(2 * (ZHI.indexOf(mzT) - 2), 12)}（支序）`,
          `值日神：TIANSHEN_ORDER[(${ZHI.indexOf(chart.dayZhi)} − ${mod(2 * (ZHI.indexOf(mzT) - 2), 12)}) mod 12] = ${ts}；与历法库 almanac.tianShen「${lib}」${ts === lib ? '一致 ✓' : '不一致（交节日合法差异）'}`,
          `分值：core/tables.js HUANGHEIDAO['${ts}'].score = ${info.score} → score = ${Math.round(score)}（${info.dao}）`,
          `宜忌条数：宜 ${act.yi.length}、忌 ${act.ji.length}（methods/data/zeri.js TIANSHEN_ACT）`,
        ],
      },
    }
  },

  // ── 63 董公择日（可随所问：事类权重）──
  donggong(chart, entry) {
    const mzT = tongshuMonthZhi(chart)
    const jiZhi = DONGGONG_JI[mzT] ?? '—'
    const hit = chart.dayZhi === jiZhi
    const xiong = Array.isArray(chart?.almanac?.xiongSha) ? chart.almanac.xiongSha.length : 0
    const jiShen = Array.isArray(chart?.almanac?.jiShen) ? chart.almanac.jiShen.length : 0
    const topic = topicOf(chart)
    const w = dirWeight(topic) // 事类越重，董公忌越要避
    const score = clamp((hit ? -58 : 18) * (0.6 + 0.4 * w) + (jiShen - xiong) * 4, -100, 100)
    const wuxing = emptyWuxing()
    wxAdd(wuxing, ZHI_WUXING[chart.dayZhi] ?? '土', 2)
    wxAdd(wuxing, chart.monthWx ?? '土', 1)

    return {
      score,
      essence: hit ? `董公忌日（${mzT}月忌${jiZhi}）·${topic.name}尤宜避` : `董公非忌日（${mzT}月不忌${chart.dayZhi}）·可参吉神`,
      keys: [hit ? '董公忌日' : '董公非忌', `${mzT}月`, `忌${jiZhi}`, `凶煞${xiong}`, topic.id],
      wuxing,
      timing: hit ? '此日宜避，另择' : '可行，再叠吉神更稳',
      detail: {
        月建: `${mzT}月 → 董公忌日支 ${jiZhi}`,
        本日: `${chart.dayZhi}日${hit ? '＝忌日（犯董公忌）' : '≠忌日'}`,
        吉神凶煞: `吉神 ${jiShen} 项、凶煞 ${xiong} 项（${(chart?.almanac?.xiongSha ?? []).join('、') || '—'}）`,
        所问事类: `${topic.name}（方位/动土类事权重 ${w}）`,
        断: hit
          ? `董公忌日，凡${['动土', '安葬', '移徙'].includes(topic.id) ? '动土、安葬、移徙' : '大事'}尤忌；凶煞 ${xiong} 项叠加，宜改日`
          : `非董公忌日；吉神 ${jiShen} 项、凶煞 ${xiong} 项，可行`,
        说明: '董公择日取《董公选要》「月建所忌之日支」一列（core/tables.js DONGGONG_JI），再按吉神凶煞计数与所问事类轻重加权。**各本董公表详略不同**，本插件只取「忌」日支一列，不含逐月全表，故 fidelity 记 core。',
        cite: [CITE.董公, CITE.通书, CITE.神煞, CITE.编辑取值],
        evidence: [
          `月建 ${mzT} → DONGGONG_JI['${mzT}'] = ${jiZhi}；本日 ${chart.dayZhi} → ${hit ? '犯忌' : '不犯'}`,
          `吉神 ${jiShen} − 凶煞 ${xiong} = ${jiShen - xiong} → ×4 = ${(jiShen - xiong) * 4}`,
          `忌日基准值：犯 ${-58}、不犯 ${18}；按事类权重 ${w} 缩放 (0.6+0.4×${w}) = ${(0.6 + 0.4 * w).toFixed(2)}`,
          `合分：${(hit ? -58 : 18)}×${(0.6 + 0.4 * w).toFixed(2)} ＋ ${(jiShen - xiong) * 4} = ${Math.round(score)}`,
        ],
      },
    }
  },

  // ── 64 杨公十三忌 ──
  yanggong(chart, entry) {
    const lunarMonth = Number(chart?.lunar?.month) || 0
    const lunarDay = Number(chart?.lunar?.day) || 0
    const bad = YANGGONG_13[lunarMonth]
    const hit = Number(bad) === lunarDay
    const topic = topicOf(chart)
    const w = dirWeight(topic)
    const score = clamp((hit ? -75 : 15) * (0.6 + 0.4 * w), -100, 100)
    const wuxing = emptyWuxing()
    wxAdd(wuxing, ZHI_WUXING[chart.dayZhi] ?? '土', 2)
    wxAdd(wuxing, chart.monthWx ?? '土', 1)

    return {
      score,
      essence: hit ? `杨公忌日（农历${lunarMonth}月${lunarDay}）·大事勿用` : `非杨公忌（农历${lunarMonth}月${lunarDay}，忌日${bad ?? '—'}）`,
      keys: [hit ? '杨公忌' : '非杨公忌', `农历${lunarMonth}月`, `忌${bad ?? '—'}`, topic.id],
      wuxing,
      timing: hit ? '此日勿用大事，另择' : '不犯杨公忌',
      detail: {
        农历: `二〇二六年型 ${lunarMonth} 月 ${lunarDay} 日（${chart?.lunar?.text ?? ''}）`,
        忌日: `农历${lunarMonth}月的杨公忌日为 ${bad ?? '—'} 日`,
        判定: hit ? '本日即杨公忌日' : `本日非忌日（相差 ${bad ? Math.abs(lunarDay - Number(bad)) : '—'} 日）`,
        十三忌全表: Object.entries(YANGGONG_13).map(([m, d]) => `${m}月${d}日`).join('、'),
        所问事类: `${topic.name}（权重 ${w}）`,
        说明: '杨公十三忌取通行表（core/tables.js YANGGONG_13：正十三、二一一、三初九…十二十九）。民间只忌「大事」（动土、安葬、嫁娶、移徙、开市），余事不忌——本插件按所问事类轻重缩放。',
        cite: [CITE.杨公, CITE.编辑取值],
        evidence: [
          `农历 ${lunarMonth} 月 → YANGGONG_13['${lunarMonth}'] = ${bad ?? '—'}`,
          `本日农历 ${lunarDay} 日 → ${hit ? '命中忌日' : '未命中'}`,
          `基准值：犯忌 −75、不犯 +15；事类权重 ${w} → ×(0.6+0.4×${w}) = ${(0.6 + 0.4 * w).toFixed(2)} → ${Math.round(score)}`,
        ],
      },
    }
  },

  // ── 65 五运六气 ──
  wuyunLiuqi(chart, entry) {
    const yearGan = String(chart?.ganzhi?.year ?? '').slice(0, 1)
    const yearZhi = String(chart?.ganzhi?.year ?? '').slice(1, 2)
    const yun = WUYUN[yearGan] ?? '—'
    const siTian = LIUQI_SITIAN[yearZhi] ?? '—'
    const zaiQuan = ZD.LIUQI_ZAIQUAN[siTian] ?? '—'
    const currentJie = String(chart?.jieqi?.prev ?? '')
    const step = ZD.LIUQI_STEP_JIEQI[currentJie]
    const mainQi = Number.isFinite(step) ? ZD.LIUQI_MAIN[step] : '—'
    // 客气六步：司天居三之气，其余按三阴三阳次序顺布
    const siIdx = ZD.LIUQI_CYCLE.indexOf(siTian)
    const guestQi = Number.isFinite(step) && siIdx >= 0
      ? ZD.LIUQI_CYCLE[mod(siIdx + (step - 2), 6)]
      : '—'
    const yunWx = String(yun).slice(0, 1)
    const mainWx = ZD.LIUQI_WUXING[mainQi] ?? '土'
    const guestWx = ZD.LIUQI_WUXING[guestQi] ?? '土'
    const relYun = yunWx && '火木土金水'.includes(yunWx) ? relation(yunWx, chart.monthWx ?? '土') : '—'
    const relMainGuest = relation(mainWx, guestWx)
    const topic = topicOf(chart)
    const score = clamp(
      (mainQi === guestQi ? 12 : 0)
      + (yun === '—' ? 0 : (yun.includes('太过') ? 6 : -4))
      + (relation(mainWx, guestWx) === '生我' || relation(mainWx, guestWx) === '比和' ? 14 : relation(mainWx, guestWx) === '克我' ? -18 : 0)
      + (wangShuai(mainWx, chart.monthWx ?? '土').score - 55) * 0.2,
      -100, 100,
    )
    const wuxing = emptyWuxing()
    wxAdd(wuxing, mainWx, 2)
    wxAdd(wuxing, guestWx, 1)
    wxAdd(wuxing, chart.monthWx ?? '土', 1)

    return {
      score,
      essence: `岁运${yun}·司天${siTian}在泉${zaiQuan}·${step + 1 || '—'}之气主${mainQi}`,
      keys: [`岁运${yun.slice(0, 2)}`, `司天${siTian.slice(0, 2)}`, `在泉${zaiQuan.slice(0, 2)}`, `主气${mainQi.slice(0, 2)}`, `客气${guestQi.slice(0, 2)}`],
      wuxing,
      timing: `本气步${currentJie}至下一节气，约 15 日`,
      detail: {
        岁运: `${yearGan}年 → ${yun}（core/tables.js WUYUN，《素问·天元纪大论》十干化运）`,
        司天: `${yearZhi}年 → ${siTian}（core/tables.js LIUQI_SITIAN，《素问·五运行大论》）`,
        在泉: `${zaiQuan}（司天三阴三阳之对：三之气对终之气）`,
        客气六步: ZD.LIUQI_CYCLE.map((q, i) => `${i + 1}之气 ${q}${q === siTian ? '（司天）' : q === zaiQuan ? '（在泉）' : ''}`).join('；'),
        主气六步: ZD.LIUQI_MAIN.map((q, i) => `${i + 1} ${q}`).join('；'),
        当前步: `${currentJie}属第 ${Number.isFinite(step) ? step + 1 : '—'} 步 → 主气 ${mainQi}；客气加临 ${guestQi}`,
        生克: `主气${mainWx} 与 客气${guestWx} → ${relMainGuest}；岁运${yunWx} 与 月令${chart.monthWx} → ${relYun}`,
        所问参考: `（不进分）所问「${topic.name}」：六气胜复与所问的对应关系本插件不臆断，只出运气格局`,
        说明: '五运六气只由年干支与节气决定（历法），**不随所问改变格局**；分值按「主客气同气／相生相克／岁运太过不及／本气旺衰」合成，权值为本插件编辑取值。',
        cite: [CITE.五运六气, CITE.编辑取值],
        evidence: [
          `岁运：年干 ${yearGan} → WUYUN = ${yun}`,
          `司天：年支 ${yearZhi} → LIUQI_SITIAN = ${siTian}；在泉 = ${zaiQuan}（三阴三阳之对）`,
          `当前节气 ${currentJie} → 主气第 ${Number.isFinite(step) ? step + 1 : '—'} 步 = ${mainQi}（LIUQI_STEP_JIEGI）`,
          `客气加临：司天居三之气，按三阴三阳次序逆推 ${Number.isFinite(step) ? `${step - 2}` : '—'} 位 → ${guestQi}`,
          `生克与合分：主客气 ${relMainGuest}、岁运与月令 ${relYun}、本气 ${wangShuai(mainWx, chart.monthWx ?? '土').state} → ${Math.round(score)}`,
        ],
      },
    }
  },

  // ── 66 太岁三煞五黄（方位忌，按事类分权重）──
  taisui(chart, entry) {
    const yearZhi = String(chart?.ganzhi?.year ?? '').slice(1, 2)
    const taiSuiDir = DIR_OF_ZHI[yearZhi] ?? '—'
    const poZhi = ZHI_LIUCHONG[yearZhi] ?? '—'
    const poDir = DIR_OF_ZHI[poZhi] ?? '—'
    const shaDir = SANSHAN_DIR[yearZhi] ?? '—'
    const yearStar = yearStarOf(Number(chart?.solar?.y) || 2000)
    const fivePalace = Object.entries(flyPalaces(yearStar)).find(([, s]) => s === 5)?.[0] ?? '中'
    const fiveDir = ZD.PALACE_DIR[GONG_NUM[fivePalace]] ?? '中'
    const topic = topicOf(chart)
    const w = dirWeight(topic)
    const shaHit = topic && ['动土', '安葬', '移徙'].includes(topic.id)
    const xiong = Array.isArray(chart?.almanac?.xiongSha) ? chart.almanac.xiongSha.length : 0
    const score = clamp(
      10
      - (shaHit ? 45 * w : 12 * w)
      - (fiveDir === '中' ? 0 : 8 * w)
      - xiong * 3,
      -100, 100,
    )
    const wuxing = emptyWuxing()
    wxAdd(wuxing, ZHI_WUXING[yearZhi] ?? '土', 2)
    wxAdd(wuxing, chart.monthWx ?? '土', 1)

    return {
      score,
      essence: `太岁在${yearZhi}(${taiSuiDir})·三煞${shaDir}·五黄${fiveDir}·${topic.id}${shaHit ? '宜避' : '可参'}`,
      keys: [`太岁${taiSuiDir}`, `岁破${poDir}`, `三煞${shaDir}`, `五黄${fiveDir}`, topic.id],
      wuxing,
      timing: shaHit ? '本月勿于煞方动土，另择' : '方位约束较轻',
      detail: {
        太岁: `${yearZhi}年太岁在${taiSuiDir}（${yearZhi}方）；岁破在${poZhi}（${poDir}）`,
        三煞: `${yearZhi}年三煞在${shaDir}（含 ${(SANSHAN_ZHI[shaDir] ?? []).join('、')}）—— 年支三合局所克之方`,
        五黄: `年白入中 ${yearStar}（11 − 年数字根）→ 五黄到 ${fivePalace}宫（${fiveDir}）`,
        所问事类: `${topic.name}（方位敏感权重 ${w}）`,
        宜忌: shaHit
          ? `所问属动土/安葬/移徙 → 忌于 ${shaDir} 方（三煞）与 ${fiveDir} 方（五黄）动土、修造、安葬`
          : `所问非动土类 → 方位忌只作参考（权重 ${w}）`,
        神位参考: `喜神${chart?.almanac?.positionXi ?? '—'} 财神${chart?.almanac?.positionCai ?? '—'} 胎神${chart?.almanac?.positionTai ?? '—'} 福神${chart?.almanac?.positionFu ?? '—'}（vendor/lunar.cjs）`,
        说明: '太岁/岁破/三煞/五黄均为**方位**之忌，非日之吉凶；本插件按所问事类给权重：动土·安葬·移徙 1.0、开市·嫁娶·安床 0.6、余事 0.3（宁严勿滥）。五黄取年白入中后五黄所到之宫。',
        cite: [CITE.太岁, CITE.紫白, CITE.编辑取值],
        evidence: [
          `年支 ${yearZhi} → 太岁在 ${taiSuiDir}；冲支 ${poZhi} → 岁破 ${poDir}`,
          `三煞：SANSHAN_DIR['${yearZhi}'] = ${shaDir}（${(SANSHAN_ZHI[shaDir] ?? []).join('/')}）`,
          `五黄：年白 = 11 − 数字根(${chart?.solar?.y}) = ${yearStar}；顺飞 → 五黄落 ${fivePalace}宫（${fiveDir}）`,
          `事类权重 ${w}；凶煞 ${xiong} 项 ×(−3) = ${-3 * xiong}`,
          `合分：10 − ${(shaHit ? 45 * w : 12 * w).toFixed(1)} − ${(fiveDir === '中' ? 0 : 8 * w).toFixed(1)} − ${3 * xiong} = ${Math.round(score)}`,
        ],
      },
    }
  },

  // ── 67 紫白九星择日（年/月/日/时四套起法）──
  zibai(chart, entry) {
    const year = Number(chart?.solar?.y) || 2000
    // 立春换年：用四柱年柱（chart.ganzhi.year）之支定月白年组
    const sizhuYearZhi = String(chart?.ganzhi?.year ?? '').slice(1, 2)
    const yearStar = yearStarOf(year)
    const monthIdx = mod(ZHI.indexOf(tongshuMonthZhi(chart)) - 2, 12) // 0 = 寅月（正月）
    const monthStar = monthStarOf(sizhuYearZhi, monthIdx)
    const dayStar = dayStarOf(chart)
    const hourStar = hourStarOf(chart)
    const topic = topicOf(chart)
    // 与历法库对拍
    const l = lunarAt(chart?.solar?.y, chart?.solar?.m, chart?.solar?.d, chart?.solar?.h ?? 12, chart?.solar?.mi ?? 0)
    const libYear = l ? cnNum(safeStr(() => l.getYearNineStar(2).getNumber())) : 0
    const libMonth = l ? cnNum(safeStr(() => l.getMonthNineStar(2).getNumber())) : 0

    const yInfo = starInfo(yearStar)
    const mInfo = starInfo(monthStar)
    const topicFit = starTopicFit(dayStar?.num ?? 0, topic)
    const luckScore = (n) => {
      const info = starInfo(n)
      if (!info) return 0
      return info.luck === '大吉' ? 22 : info.luck === '吉' ? 14 : info.luck === '大凶' ? -22 : -10
    }
    const score = clamp(luckScore(yearStar) * 0.2 + luckScore(monthStar) * 0.25 + luckScore(dayStar?.num ?? 0) * 0.35 + luckScore(hourStar?.num ?? 0) * 0.2 + topicFit.bonus, -100, 100)

    const wuxing = emptyWuxing()
    for (const s of [yInfo, mInfo, dayStar, hourStar]) if (s?.wx) wxAdd(wuxing, s.wx, 1)

    return {
      score,
      essence: `紫白·年${yearStar}月${monthStar}日${dayStar?.num ?? '—'}时${hourStar?.num ?? '—'}·${starInfo(dayStar?.num)?.luck ?? '—'}`,
      keys: [`年${yearStar}`, `月${monthStar}`, `日${dayStar?.num ?? '—'}`, `时${hourStar?.num ?? '—'}`, topic.id],
      wuxing,
      timing: dayStar && (starInfo(dayStar.num)?.luck === '吉' || starInfo(dayStar.num)?.luck === '大吉') ? '当日星吉，可用' : '宜择九星吉日',
      detail: {
        年白: `${yearStar} ${yInfo?.name ?? ''}（${yInfo?.luck ?? ''}·${yInfo?.wx ?? ''}）入中；起法「11 − 年数字根(${year})」`,
        月白: `${monthStar} ${mInfo?.name ?? ''} 入中；起法：${sizhuYearZhi}年 → 正月起${({ 子: 8, 午: 8, 卯: 8, 酉: 8, 寅: 2, 申: 2, 巳: 2, 亥: 2, 辰: 5, 戌: 5, 丑: 5, 未: 5 }[sizhuYearZhi] ?? 8)}，逐月逆退至第 ${monthIdx + 1} 月`,
        日白: dayStar ? `${dayStar.num} ${dayStar.name}（${dayStar.luck}）；冬至后甲子日起一白顺行、夏至后甲子日起九紫逆行` : '—',
        时白: hourStar ? `${hourStar.num} ${hourStar.name}（${hourStar.luck}）；同阴阳遁顺逆，按时支起` : '—',
        年盘飞布: Object.entries(flyPalaces(yearStar)).map(([g, s]) => `${g}${s}`).join(' '),
        月盘飞布: Object.entries(flyPalaces(monthStar)).map(([g, s]) => `${g}${s}`).join(' '),
        日盘飞布: dayStar ? Object.entries(flyPalaces(dayStar.num)).map(([g, s]) => `${g}${s}`).join(' ') : '—',
        时盘飞布: hourStar ? Object.entries(flyPalaces(hourStar.num)).map(([g, s]) => `${g}${s}`).join(' ') : '—',
        所问相宜: topicFit.note,
        起法对拍: l
          ? `年白 自算 ${yearStar} / 历法库 ${libYear}${yearStar === libYear ? '一致 ✓' : '不一致'}；月白 自算 ${monthStar} / 历法库 ${libMonth}${monthStar === libMonth ? '一致 ✓' : '不一致'}`
          : '未取到历法库对照值',
        说明: '紫白四盘起法各不相同：年白 11 − 年数字根（逐年逆退，三元定元）；月白 年支三组定正月起星、逐月逆退；日白 冬至后顺行／夏至后逆行（甲子日起一白／九紫）；时白 同阴阳遁。分值按四盘九星吉凶加权 + 事类相宜（编辑取值）。',
        cite: [CITE.紫白, CITE.通书, CITE.编辑取值],
        evidence: [
          `年白：11 − 数字根(${year}) = ${yearStar}；历法库 getYearNineStar(立春口径) = ${libYear}${yearStar === libYear ? '（一致 ✓）' : '（不一致）'}`,
          `月白：年支 ${sizhuYearZhi} 定正月起星，逆退 ${monthIdx} 步 → ${monthStar}；历法库 getMonthNineStar = ${libMonth}${monthStar === libMonth ? '（一致 ✓）' : '（不一致）'}`,
          `日白：almanac.nineStarNum = ${chart?.almanac?.nineStarNum ?? '—'}（${dayStar?.name ?? '—'}）` ,
          `时白：almanac.timeNineStar = ${chart?.almanac?.timeNineStar ?? '—'}（${hourStar?.name ?? '—'}）`,
          `合分：年 ${luckScore(yearStar) * 0.2} ＋ 月 ${luckScore(monthStar) * 0.25} ＋ 日 ${luckScore(dayStar?.num ?? 0) * 0.35} ＋ 时 ${luckScore(hourStar?.num ?? 0) * 0.2} ＋ 事类 ${topicFit.bonus} = ${Math.round(score)}`,
        ],
      },
    }
  },

  // ── 68 奇门择时（本族自带小表；不 import 任何 methods 模块）──
  qimenZeShi(chart, entry) {
    const jq = String(chart?.jieqi?.prev ?? '')
    const isYang = YANG_JIEQI.includes(jq)
    const dayGZ = String(chart?.ganzhi?.day ?? '')
    const hourGZ = String(chart?.ganzhi?.hour ?? '')
    // 符头定元：日干支每五日一符头（甲/己日）
    const gzIdx = (() => {
      const gi = GAN.indexOf(dayGZ[0])
      const zi = ZHI.indexOf(dayGZ[1])
      if (gi < 0 || zi < 0) return 0
      for (let i = 0; i < 60; i += 1) if (i % 10 === gi && i % 12 === zi) return i
      return 0
    })()
    const fuTouZhi = ZHI[(gzIdx - (gzIdx % 5)) % 12]
    const yuanIdx = ['子', '午', '卯', '酉'].includes(fuTouZhi) ? 0 : ['寅', '申', '巳', '亥'].includes(fuTouZhi) ? 1 : 2
    const juRow = QIMEN_JU[jq] ?? [1, 7, 4]
    const ju = juRow[yuanIdx] ?? 1
    // 地盘三奇六仪：阳遁自局数宫顺布、阴遁逆布（宫数 ±1，1..9 循环）
    const order = [...LIUYI, ...SANQI]
    const diPan = {}
    order.forEach((gz, k) => {
      const p = mod(ju - 1 + (isYang ? k : -k), 9) + 1
      diPan[gz] = p
    })
    // 旬首：时干支所在旬
    const xunIdx = (() => {
      const gi = Math.max(0, GAN.indexOf(hourGZ[0]))
      const zi = Math.max(0, ZHI.indexOf(hourGZ[1]))
      return mod(zi - gi, 12) // 旬首支序
    })()
    const xunName = `甲${ZHI[mod(xunIdx, 12)]}`
    const xunYi = XUNSHOU_YI[xunName] ?? '—'
    const zhifuPalace = diPan[xunYi] ?? 0
    const zhifuStar = STAR_OF_GONG[zhifuPalace] ?? '—'
    const zhishiGate = GATE_OF_GONG[zhifuPalace] ?? '—'
    const hourGan = hourGZ[0]
    const hourPalaceRaw = diPan[hourGan] ?? diPan[xunYi] ?? 0
    // 中五宫无门无星，八门九星寄坤二宫（通行「禽寄坤」）
    const hourPalace = hourPalaceRaw === 5 ? 2 : hourPalaceRaw
    const jiKun = hourPalaceRaw === 5
    const hourGate = GATE_OF_GONG[hourPalace] ?? '—'
    const hourStar = hourPalaceRaw === 5 ? '天禽' : (STAR_OF_GONG[hourPalace] ?? '—')
    const gateWx = GATE_WX[hourGate] ?? '土'
    const palaceWx = ['', '水', '土', '木', '木', '土', '金', '金', '土', '火'][hourPalace] ?? '土'
    const menRel = relation(gateWx, palaceWx)
    const menNote = menRel === '我克' ? '门克宫为「迫」（凶）' : menRel === '克我' ? '宫克门为「制」（小凶）' : menRel === '生我' ? '宫生门（吉）' : menRel === '比和' ? '门宫比和（平吉）' : '门生宫（小吉）'
    const deShi = SANQI.includes(hourGan) && (DE_SHI[hourGan] ?? []).includes(xunName)
    const topic = topicOf(chart)
    const score = clamp(
      (GATE_LUCK[hourGate] ?? 0) * 0.5
      + (STAR_LUCK[hourStar] ?? 0) * 0.35
      + (menRel === '我克' ? -22 : menRel === '克我' ? -12 : menRel === '生我' ? 12 : 4)
      + (deShi ? 16 : 0)
      + (SANQI.includes(hourGan) ? 6 : 0)
      + (hourGan === '庚' ? -14 : 0),
      -100, 100,
    )
    const wuxing = emptyWuxing()
    wxAdd(wuxing, gateWx, 2)
    wxAdd(wuxing, palaceWx, 1)
    wxAdd(wuxing, chart.monthWx ?? '土', 1)

    return {
      score,
      essence: `奇门${isYang ? '阳' : '阴'}遁${ju}局·${jq}${['上', '中', '下'][yuanIdx]}元·${zhifuStar}值符${zhishiGate}值使`,
      keys: [`${isYang ? '阳' : '阴'}遁${ju}局`, `${jq}${['上', '中', '下'][yuanIdx]}元`, `${hourGate}`, `${hourStar}`, deShi ? '三奇得使' : `时干${hourGan}`],
      wuxing,
      timing: `本时辰（${chart.hourZhi}时）内`,
      detail: {
        遁局: `${isYang ? '阳' : '阴'}遁 ${ju} 局（节气 ${jq} 第 ${['上', '中', '下'][yuanIdx]} 元）`,
        定元: `日干支 ${dayGZ} → 符头支 ${fuTouZhi}（${['子午卯酉=上元', '寅申巳亥=中元', '辰戌丑未=下元'][yuanIdx]}）`,
        地盘三奇六仪: order.map((g) => `${g}${diPan[g]}宫`).join(' '),
        旬首: `${xunName}（仪 ${xunYi}）→ 值符 ${zhifuStar}（${zhifuPalace}宫）、值使 ${zhishiGate}`,
        时干落宫: `${hourGZ} → 时干 ${hourGan} 落 ${hourPalaceRaw}宫（${GONG_GUA[hourPalaceRaw]}）${jiKun ? '——中五宫无门无星，寄坤二宫' : ''}，得门 ${hourGate}、星 ${hourStar}`,
        门宫: `${hourGate}(${gateWx}) 临 ${palaceWx}宫 → ${menRel}：${menNote}`,
        三奇得使: deShi ? `${hourGan}奇 + ${xunName} → 得使（吉）` : `时干 ${hourGan}、旬首 ${xunName} → 未得使`,
        所问参考: `（不进分）所问「${topic.name}」：本插件只出「时干/门/星」判据，不代断具体事类`,
        流派: '定元取**拆补派符头法**（以节气交接时刻为界、日干支五日一符头）；置闰派与超神接气法可能差一局，本插件不冒充唯一正解',
        说明: '本法只做「择时判据」级奇门：局数、地盘奇仪、旬首值符值使、时干落宫、门迫门制、三奇得使、九星吉凶。**未做**天盘九星转布与八神顺逆的完整排盘（那属 #25–40 三式族的完整盘），故 fidelity 记 core。',
        cite: [CITE.奇门, CITE.编辑取值],
        evidence: [
          `节气 ${jq} → ${isYang ? '阳' : '阴'}遁；定局表 [${juRow.join('/')}]，第 ${yuanIdx + 1} 元 → ${ju} 局`,
          `符头：日干支 ${dayGZ} 序 ${gzIdx} → 退至 5 的倍数 ${gzIdx - (gzIdx % 5)} → 支 ${fuTouZhi} → ${['上', '中', '下'][yuanIdx]}元`,
          `地盘：${isYang ? '阳遁顺布' : '阴遁逆布'}自 ${ju} 宫起戊 → ${order.map((g) => `${g}${diPan[g]}`).join(' ')}`,
          `值符值使：时干支 ${hourGZ} 旬首 ${xunName}（仪 ${xunYi}）落 ${zhifuPalace} 宫 → 星 ${zhifuStar}、门 ${zhishiGate}`,
          `门宫生克：${hourGate}(${gateWx}) vs ${palaceWx}宫 → ${menRel} → ${menNote}`,
          `合分：门 ${GATE_LUCK[hourGate] ?? 0}×0.5 ＋ 星 ${STAR_LUCK[hourStar] ?? 0}×0.35 ＋ 门宫 ${menRel === '我克' ? -22 : menRel === '克我' ? -12 : menRel === '生我' ? 12 : 4} ＋ 得使 ${deShi ? 16 : 0} ＋ 时干 ${SANQI.includes(hourGan) ? 6 : 0}${hourGan === '庚' ? ' − 14' : ''} = ${Math.round(score)}`,
        ],
      },
    }
  },

  // ── 69 六曜择日（历法决定）──
  liuyaoZeri(chart, entry) {
    const raw = String(chart?.almanac?.liuYao ?? '')
    const name = liuyaoName(raw)
    const info = LIUYAO[name] ?? { score: 0, note: '—' }
    const act = ZD.LIUYAO_ACT[name] ?? { yi: [], ji: [], note: '' }
    const score = clamp(info.score, -100, 100)
    const wuxing = emptyWuxing()
    wxAdd(wuxing, ZHI_WUXING[chart.dayZhi] ?? '土', 2)
    wxAdd(wuxing, chart.monthWx ?? '土', 1)

    return {
      score,
      essence: `六曜·${name}日·宜${act.yi.length}忌${act.ji.length}·${info.score > 0 ? '吉' : info.score < 0 ? '凶' : '平'}`,
      keys: [name, `${name}日`, `宜${act.yi.length}`, `忌${act.ji.length}`, raw === name ? '正体' : '异体归一'],
      wuxing,
      timing: info.score >= 45 ? '当日可用' : info.score <= -40 ? '宜避此日' : '平常',
      detail: {
        六曜: `${name}日${raw && raw !== name ? `（历法库作「${raw}」，异体字，查表归一到「${name}」）` : ''}`,
        断语: info.note,
        分值: `${info.score}（core/tables.js LIUYAO，公开通例的编辑取值）`,
        宜: act.yi.join('、') || '（无特别宜）',
        忌: act.ji.join('、') || '（无特别忌）',
        说明: '六曜（先胜·友引·先负·仏灭·大安·赤口）为中日同源旧历法，只由旧历月日决定，**不随所问之事改变**。历法库返回「佛灭」，表内键为「仏灭」，二者互为异体，本模块统一归一到表键。',
        cite: [CITE.六曜, CITE.通书, CITE.编辑取值],
        evidence: [
          `历法库 almanac.liuYao = 「${raw}」→ 归一 → 「${name}」${raw !== name ? '（异体字归一，smoke 断言 LIUYAO[\'佛灭\'] === LIUYAO[\'仏灭\']）' : ''}`,
          `表值：core/tables.js LIUYAO['${name}'].score = ${info.score} → score = ${Math.round(score)}`,
          `宜忌条数：宜 ${act.yi.length}、忌 ${act.ji.length}（methods/data/zeri.js LIUYAO_ACT）`,
        ],
      },
    }
  },

  // ── 70 十二值神（值日神属性与轮值；可与所问事类相关）──
  zhiShen(chart, entry) {
    const mzT = tongshuMonthZhi(chart)
    const dz = chart.dayZhi
    const ts = dayTianShenOf(mzT, dz)
    const info = HUANGHEIDAO[ts] ?? { dao: '—', score: 0 }
    const act = ZD.TIANSHEN_ACT[ts] ?? { yi: [], ji: [], note: '' }
    const topic = topicOf(chart)
    const fit = yiJiFit(topic, act.yi.map((id) => ZD.ZERI_TOPICS.find((t) => t.id === id)?.name ?? id), act.ji.map((id) => ZD.ZERI_TOPICS.find((t) => t.id === id)?.name ?? id))
    // 轮值位置：从起支顺数
    const qi = mod(2 * (ZHI.indexOf(mzT) - 2), 12)
    const pos = mod(ZHI.indexOf(dz) - qi, 12)
    const score = clamp((info.score ?? 0) * 0.7 + fit.score * 0.5, -100, 100)
    const wuxing = emptyWuxing()
    wxAdd(wuxing, ZHI_WUXING[dz] ?? '土', 2)
    wxAdd(wuxing, chart.monthWx ?? '土', 1)

    return {
      score,
      essence: `值神·${ts}（${info.dao}·第${pos + 1}位）·${info.score > 0 ? '宜行' : info.score < 0 ? '宜避' : '平'}`,
      keys: [ts, info.dao, `第${pos + 1}位`, topic.id, fit.hitJi.length ? '犯忌' : '合宜'],
      wuxing,
      timing: info.score >= 40 ? '当日可行' : info.score <= -40 ? '宜改日' : '叠加吉神更稳',
      detail: {
        值日神: `${ts}（${info.dao}，倾向分 ${info.score}）`,
        轮值: `自起支（通书月支 ${mzT}）顺数第 ${pos + 1} 位`,
        轮值全序: TIANSHEN_ORDER.map((n, i) => `${i + 1}${n}`).join(' '),
        神性: act.note,
        所问事类: `${topic.name} → ${fit.note}`,
        宜: act.yi.map((id) => ZD.ZERI_TOPICS.find((t) => t.id === id)?.name ?? id).join('、') || '（无特别宜）',
        忌: act.ji.map((id) => ZD.ZERI_TOPICS.find((t) => t.id === id)?.name ?? id).join('、') || '（无特别忌）',
        与黄黑道的分工: '#62 黄黑道只看「黄道/黑道」与吉凶分；本法（#70）看**十二值神轮值位次＋神性＋与所问事类的宜忌契合**，故两法断语与分值不同但同源',
        说明: '十二值神轮值由「通书月支＋日支」定（与 #62 同源），本法额外叠加「所问事类与神煞宜忌的契合度」，故**可随所问改变**。',
        cite: [CITE.黄黑道, CITE.通书, CITE.编辑取值],
        evidence: [
          `值神：起支序 ${qi} → (${ZHI.indexOf(dz)} − ${qi}) mod 12 = ${pos} → ${ts}`,
          `神性分：HUANGHEIDAO['${ts}'].score = ${info.score} → ×0.7 = ${((info.score ?? 0) * 0.7).toFixed(1)}`,
          `事类契合：${fit.note} → ×0.5 = ${(fit.score * 0.5).toFixed(1)}`,
          `合分：${((info.score ?? 0) * 0.7).toFixed(1)} ＋ ${(fit.score * 0.5).toFixed(1)} = ${Math.round(score)}`,
        ],
      },
    }
  },

  // ── 71 择吉时（一日十二时辰排序）──
  jiShi(chart, entry) {
    const dz = chart.dayZhi
    const l0 = lunarAt(chart?.solar?.y, chart?.solar?.m, chart?.solar?.d, 12, 0)
    const dayMZ = l0 ? l0.getMonthZhi() : tongshuMonthZhi(chart)
    const topic = topicOf(chart)
    const rows = []
    for (let i = 0; i < 12; i += 1) {
      const hz = ZHI[i]
      // 十二时辰取同一日的代表时刻（00:30=早子 … 22:30=亥），避开 23:00 后（晚子时归次日之支）
      const ts = hourTianShenOf(hz, dz)
      const l = lunarAt(chart?.solar?.y, chart?.solar?.m, chart?.solar?.d, i * 2, 30)
      const num = l ? cnNum(safeStr(() => l.getTimeNineStar().getNumber())) : 0
      const star = starInfo(num)
      const tsScore = (HUANGHEIDAO[ts]?.score ?? 0) * 0.5
      const starScore = (() => {
        if (!star) return 0
        return star.luck === '大吉' ? 26 : star.luck === '吉' ? 16 : star.luck === '大凶' ? -26 : -12
      })()
      const chong = ZHI_LIUCHONG[hz]
      const chongPenalty = ['动土', '安葬', '嫁娶', '移徙'].includes(topic.id) && chong === dz ? -18 : 0
      const total = clamp(tsScore + starScore + chongPenalty, -100, 100)
      rows.push({ hz, ts, star: star?.name ?? '—', starNum: num, tsScore, starScore, chongPenalty, total })
    }
    rows.sort((a, b) => b.total - a.total)
    const best = rows[0]
    const worst = rows[rows.length - 1]
    const wuxing = emptyWuxing()
    wxAdd(wuxing, ZHI_WUXING[dz] ?? '土', 2)
    wxAdd(wuxing, chart.monthWx ?? '土', 1)

    return {
      score: clamp(best.total, -100, 100),
      essence: `择时·${best.hz}时最佳（${best.ts}·${best.star}）·最忌${worst.hz}时`,
      keys: [`${best.hz}时`, best.ts, best.star, `忌${worst.hz}时`, topic.id],
      wuxing,
      timing: `当日 ${best.hz}时（${best.ts}值神）`,
      detail: {
        日: `${dayMZ}月${dz}日（通书日粒度）`,
        所问事类: topic.name,
        排序: rows.map((r, i) => `${i + 1}.${r.hz}时 ${r.ts}(${r.star}) ${Math.round(r.total)}`).join(' ｜ '),
        最佳: `${best.hz}时：${best.ts}值神（${(HUANGHEIDAO[best.ts]?.dao ?? '—')}）、时白 ${best.star} → ${Math.round(best.total)}`,
        最忌: `${worst.hz}时：${worst.ts}值神、时白 ${worst.star} → ${Math.round(worst.total)}`,
        犯冲: `日支 ${dz} 之冲为 ${ZHI_LIUCHONG[dz] ?? '—'}；动土/安葬/嫁娶/移徙类所问遇冲时扣分`,
        说明: '择吉时以「值时神（黄黑道）＋时白九星」为主，按所问事类对「冲日支」加罚。十二时辰按分排序，取最优者作本盘结论。**闭注**：本法的值时神按「当日日支」起（23 时后属次日，另计）。',
        cite: [CITE.黄黑道, CITE.紫白, CITE.编辑取值],
        evidence: [
          `值时神起法：日支 ${dz} → 起青龙于 ${HOUR_TS_START[dz] ?? '申'}，顺行；例：${rows[0].hz}时 → ${rows[0].ts}`,
          `时白：历法库 getTimeNineStar（冬至后顺行/夏至后逆行）→ ${rows.map((r) => `${r.hz}${r.starNum}`).join(' ')}`,
          `排序依据：值时神分×0.5 ＋ 时白吉凶分 ＋ 犯冲罚分 → ${rows.map((r) => Math.round(r.total)).join('/')}`,
          `最优：${best.hz}时 ${Math.round(best.total)}（值神 ${best.ts} ${best.tsScore.toFixed(1)}、时白 ${best.starScore}、犯冲 ${best.chongPenalty}）`,
        ],
      },
    }
  },

  // ── 72 综合择日（未来 30 日排序，权重写进 detail.weights）──
  zeRi(chart, entry) {
    const topic = topicOf(chart)
    const w = ZD_WEIGHTS(topic)
    const s = chart?.solar ?? {}
    let cursor
    try {
      cursor = LunarLib.Solar.fromYmdHms(s.y, s.m, s.d, 12, 0, 0)
    } catch {
      return null
    }
    const rows = []
    for (let k = 0; k < 30; k += 1) {
      const f = dayFacts(cursor.next(k).getLunar())
      if (!f) continue
      const fit = yiJiFit(topic, f.yi, f.ji)
      const jcScore = (JIANCHU[f.jianchu]?.score ?? 0) * w.jianchu
      const tsScore = (HUANGHEIDAO[f.tianShen]?.score ?? 0) * w.tianShen
      const xiuScore = (f.xiuLuck === '吉' ? 40 : f.xiuLuck === '凶' ? -36 : 0) * w.xiu
      const lyScore = (LIUYAO[f.liuyao]?.score ?? 0) * w.liuyao
      const shenShaScore = (f.jiShen.length - f.xiongSha.length) * 6 * w.shenSha
      const fitScore = fit.score * w.yiJi
      const starScore = (f.dayStar ? (starInfo(f.dayStar)?.luck === '大吉' ? 22 : starInfo(f.dayStar)?.luck === '吉' ? 14 : starInfo(f.dayStar)?.luck === '大凶' ? -22 : -10) : 0) * w.zibai
      // 避忌项（宁严勿滥）：凶宿、六曜凶、破/闭日、黑道值神 —— 每项按事类轻重扣分
      const violations = [
        f.xiuLuck === '凶' ? `宿${f.xiu}凶` : '',
        ['仏灭', '赤口', '先负'].includes(f.liuyao) ? `六曜${f.liuyao}` : '',
        ['破', '闭'].includes(f.jianchu) ? `建除${f.jianchu}` : '',
        (HUANGHEIDAO[f.tianShen]?.dao ?? '') === '黑道' ? `值神${f.tianShen}黑道` : '',
      ].filter(Boolean)
      const penalty = -violations.length * w.avoid
      const total = clamp(jcScore + tsScore + xiuScore + lyScore + shenShaScore + fitScore + starScore + penalty, -100, 100)
      rows.push({ ymd: f.ymd, gz: f.ganzhi, jc: f.jianchu, ts: f.tianShen, xiu: f.xiu, xiuLuck: f.xiuLuck, ly: f.liuyao, star: f.dayStar, fit, violations, penalty, total })
    }
    rows.sort((a, b) => b.total - a.total)
    const best = rows[0]
    const todayYmd = `${s.y}-${String(s.m).padStart(2, '0')}-${String(s.d).padStart(2, '0')}`
    const today = rows.find((r) => r.ymd === todayYmd) ?? rows[0]
    const wuxing = emptyWuxing()
    wxAdd(wuxing, ZHI_WUXING[today.gz.slice(1, 2)] ?? '土', 2)
    wxAdd(wuxing, chart.monthWx ?? '土', 1)

    return {
      score: clamp(today.total, -100, 100),
      essence: `择日·${topic.name}·今日${Math.round(today.total)}分·首选${best.ymd}（${best.jc}日）`,
      keys: [`首选${best.jc}`, `首选${best.ts}`, topic.id, `${best.ymd.slice(5)}`, `今日${today.jc}`],
      wuxing,
      timing: `首选 ${best.ymd}（${best.gz}）`,
      fidelity: 'core',
      detail: {
        所问事类: `${topic.name}（关键词命中：${topic.kw.filter((k) => String(chart?.question ?? '').includes(k)).join('/') || '（未识别，按通用计）'}）`,
        权重: `建除 ${w.jianchu} ｜ 黄黑道 ${w.tianShen} ｜ 二十八宿 ${w.xiu} ｜ 六曜 ${w.liuyao} ｜ 吉神凶煞 ${w.shenSha} ｜ 宜忌契合 ${w.yiJi} ｜ 日白 ${w.zibai} ｜ 避忌项 ${w.avoid}/项`,
        weights: w,
        口径: '权重按所问事类分档：动土/安葬/移徙类看重建除·黄黑道·宿（严），余事看重宜忌与神煞（宽）；另设**避忌项**（凶宿、六曜仏灭/赤口/先负、破日闭日、黑道值神）逐项扣分，**宁严勿滥**',
        今日: `${today.ymd}（${today.gz}）：建除${today.jc} 值神${today.ts} 宿${today.xiu} 六曜${today.ly} 日白${today.star ?? '—'} → ${Math.round(today.total)}`,
        首选: `${best.ymd}（${best.gz}）：建除${best.jc} 值神${best.ts} 宿${best.xiu} 六曜${best.ly} 日白${best.star ?? '—'} → ${Math.round(best.total)}`,
        候选前五: rows.slice(0, 5).map((r, i) => `${i + 1}.${r.ymd} ${Math.round(r.total)}（${r.jc}·${r.ts}·${r.xiu}·${r.ly}${r.violations.length ? `·避忌${r.violations.join('+')}` : ''}）`).join(' ｜ '),
        末三位: rows.slice(-3).map((r) => `${r.ymd} ${Math.round(r.total)}（${r.jc}·${r.ts}）`).join(' ｜ '),
        唯一权威: '二十八宿吉凶取 core/tables.js XIU28_LUCK（心、翼为凶），与历法库 xiuLuck 不一致时以本表为准',
        说明: `多体系叠加：建除、黄黑道、二十八宿、六曜、吉神凶煞、宜忌契合、日白七项，按所问事类分档加权（权重见上）。未来 30 日逐日按内置历法库（vendor/lunar.cjs）取值，**不含随机**；本盘结论取「今日」分，另给首选日。`,
        cite: [CITE.通书, CITE.建除, CITE.黄黑道, CITE.宿, CITE.六曜, CITE.紫白, CITE.神煞, CITE.编辑取值],
        evidence: [
          `扫描范围：${rows.length} 日（${rows[0]?.ymd} 起，历法库逐日取值）`,
          `权重：${JSON.stringify(w)}`,
          `取分式：建除×${w.jianchu} ＋ 黄黑道×${w.tianShen} ＋ 宿×${w.xiu} ＋ 六曜×${w.liuyao} ＋ (吉神−凶煞)×6×${w.shenSha} ＋ 宜忌契合×${w.yiJi} ＋ 日白×${w.zibai}`,
          `今日明细：建除 ${today.jc}(${JIANCHU[today.jc]?.score ?? 0})、值神 ${today.ts}(${HUANGHEIDAO[today.ts]?.score ?? 0})、宿 ${today.xiu}(${today.xiuLuck ?? '—'})、六曜 ${today.ly}(${LIUYAO[today.ly]?.score ?? 0})、宜忌 ${today.fit.note}`,
          `排序前五：${rows.slice(0, 5).map((r) => `${r.ymd}(${Math.round(r.total)})`).join(' ')}`,
        ],
      },
    }
  },
}

/**
 * 综合择日的权重（按所问事类分档）。
 * cite: 本插件编辑取值（宁严勿滥）——写在 detail.weights 里供复核。
 * @param {object} topic 事类。
 * @returns {object} 七项权重。
 */
function ZD_WEIGHTS(topic) {
  const id = topic?.id ?? ''
  const strict = ['动土', '安葬', '移徙'].includes(id)
  const medium = ['开市', '嫁娶', '签约', '求财', '安床'].includes(id)
  if (strict) return { jianchu: 0.5, tianShen: 0.45, xiu: 0.45, liuyao: 0.2, shenSha: 0.15, yiJi: 0.5, zibai: 0.2, avoid: 16 }
  if (medium) return { jianchu: 0.35, tianShen: 0.3, xiu: 0.25, liuyao: 0.25, shenSha: 0.25, yiJi: 0.6, zibai: 0.25, avoid: 10 }
  return { jianchu: 0.25, tianShen: 0.25, xiu: 0.2, liuyao: 0.25, shenSha: 0.3, yiJi: 0.55, zibai: 0.25, avoid: 6 }
}

// ───────────────────────── 出口消毒（防回归）─────────────────────────

/**
 * 深度把字符串里的字面量 `undefined` / `NaN` 换成「—」。
 *
 * 用途：**只作兜底网**。真正的根因（某字段没带上来，模板串把它拼成字面量 "undefined"）
 * 已在源头修掉——#72 曾经漏把 `xiuLuck` 带进扫描行（verifier #2 定位到行号），现已在
 * `rows.push` 里带上并在引用处加了 `?? '—'`。此网只防「以后再漏带字段」回归，
 * 因为脏值会直接进下钻输出（`detail`）。
 *
 * @param {*} v 任意值。
 * @returns {*} 同构值（字符串已消毒）。
 */
function scrub(v) {
  if (typeof v === 'string') return v.replace(/undefined/g, '—').replace(/NaN/g, '—')
  if (Array.isArray(v)) return v.map(scrub)
  if (v && typeof v === 'object') {
    const out = {}
    for (const [k, val] of Object.entries(v)) out[k] = scrub(val)
    return out
  }
  return v
}

/**
 * 择时族十四法的统一出口：
 *   1. `essence` / `keys` / `detail` 一律过 {@link scrub}（防脏值回归）；
 *   2. 补**应期半开区间**端点（SKILL §六 / delta D-03、D-08）：本族只给措辞串，
 *      按 `tables.durationOf` 的公开折算口径补 `detail.timingLo/timingHi`；
 *      措辞无明确日数时**保持双 null**（宁说"只有措辞、没有区间"，也不编一个数）。
 * 其余字段（score/wuxing/timing/fidelity）原样透传，不改语义。
 * @type {Object<string, (chart:object, entry:object) => object|null>}
 */
export const engines = Object.fromEntries(
  Object.entries(RAW_ENGINES).map(([name, fn]) => [name, (chart, entry) => {
    const out = fn(chart, entry)
    if (!out || typeof out !== 'object') return out
    const detail = out.detail ?? {}
    let patched = detail
    if (detail.timingLo === undefined && out.timing) {
      const span = durationOf(out.timing)
      if (span.lo !== null || span.hi !== null) {
        patched = {
          ...detail,
          timingLo: span.lo,
          timingHi: span.hi,
          timingWindowText: `[${span.lo}, ${span.hi}) 日（半开区间，hi 不含；口径：本插件措辞折算，见 tables.DURATION_DAYS）`,
        }
      }
    }
    return {
      ...out,
      essence: scrub(out.essence),
      keys: Array.isArray(out.keys) ? scrub(out.keys) : out.keys,
      detail: scrub(patched),
    }
  }]),
)

export default engines
