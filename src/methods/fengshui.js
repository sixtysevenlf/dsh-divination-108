/**
 * 方法模块 · 风水（10 法 / 条目 #73–#82）· v2 重写
 *
 * 契约见 `docs/V2-CONTRACT.md` §3.2：
 * 返回 `{ score, essence, keys, wuxing, timing, detail, fidelity }`；
 * **纯函数、不抛异常、不读时钟/文件/网络、不用 Math.random**；无法计算返回 null（运行器记「未起」）。
 * 确定性随机只走 `rand`。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 一、坐向从哪来（本模块最关键的一处工程决定，v2 保留 v1 口径）
 * ═══════════════════════════════════════════════════════════════════════
 * 插件没有独立的「坐向」参数，故从 `chart.question` 里用正则提坐向，支持四种写法：
 *   · 山向式 `卯山酉向`      · 坐向式 `坐子向午` / `坐子`
 *   · 坐朝式 `坐北朝南` / `坐东南向西北`   · 只给向 `朝南` / `东南向`
 * 四正四维映射：北→子 南→午 东→卯 西→酉 东北→艮 东南→巽 西南→坤 西北→乾。
 * 只给坐山则向取对宫，反之亦然；所给向与坐山非对宫时按坐山取对宫并在 detail 记明。
 * **提不出坐向时**：用 `rand` 从二十四山取一坐山，`fidelity` 降为 `approx`，并在
 * `detail.说明` 写明「未提供坐向，已随机取山：X；如需精确请注明坐向」。
 * 这是**如实降级**：没有坐向就没有风水盘，随机取山只是把盘排出来让人看结构，不是实测。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 二、本族各法口径与出处（全部写在明处，不冒充秘传）
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ### 1) 八宅明镜（#73）
 * - **大游年九星方位表**：以「大游年歌」定八宫九星。歌诀原文见下表 `BAZHAI_SONG` 的 `// cite:`。
 *   歌诀的配宫次序为「后天八卦顺时针 坎艮震巽离坤兑乾，自伏位卦之后一位起」。
 *   v2 用**两条独立通路互证**（见 `docs/verification/fengshui-xiangxing.md` §1）：
 *   ① 歌诀直读；② **变爻翻卦**：自伏位卦起，依次翻「上中下中上中下」七爻，
 *      所生七卦按 **伏位→生气→五鬼→延年→六煞→祸害→天医→绝命** 配星
 *      （此星序由八宅歌诀反推得到，非先验假定：乾宅首翻上爻得兑＝生气，与原文「乾…延生」末字合）。
 *   两路 8×8 = 64 格**逐格一致**（已机械校验，0 处不一致），且与《卜居秘髓·阳宅大游年》
 *   所载歌诀一致、每宅八星各一（无重复无缺）。
 * - **东四命 / 西四命**：坎离震巽为东四，乾坤艮兑为西四（`cite: 《八宅明镜》东西四宅`）。
 *   命卦由**出生年 + 性别**定（男 (100−年末两位) mod 9、女 (年末两位+5) mod 9；余 0 作 9、
 *   余 5 男坤女艮）。**未提供出生年时**退回「以流年支所属卦代命卦」并降 approx。
 * - **门主灶**（#79 阳宅三要）：门取向首、主取坐山、灶取门卦大游年**生气方**；
 *   三者五行两两相生相克（`cite: 《阳宅三要》门主灶论`）。
 *
 * ### 2) 玄空运盘 / 山向飞星（#74 #75）
 * - **三元九运时间表**：上元一运起 1864 年（甲子），每运 20 年，九运一周 180 年。
 *   `cite: 《沈氏玄空学·论三元九运》`；锚点可验：1864 确为甲子年。
 *   本实现按**公元年 1 月 1 日**分界（非立春分界），与共享表 `tables.XUANKONG_YUN` 同口径。
 * - **运盘**：当运星入中**顺飞**，轨迹 `中→乾→兑→艮→离→坎→坤→震→巽`（洛书 5→6→7→8→9→1→2→3→4）。
 *   `cite: 《沈氏玄空学》九宫飞星图`。
 * - **山星 / 向星**：山星入中数 = 运盘在**坐山宫**之数；向星入中数 = 运盘在**向首宫**之数；
 *   顺逆取**三元龙阴阳**（八干四维为阳→顺飞，十二地支为阴→逆飞）。
 *   `cite: 《沈氏玄空学·论三元龙》`。
 * - **旺山旺向 / 上山下水**：山星盘中坐山宫之星为当运星（山星到山）且向星盘中向首宫之星为
 *   当运星（向星到向）→ 旺山旺向；二者皆不备 → 上山下水；只备其一 → 旺山不旺向 / 旺向不旺山。
 * - **⚠ 兼向替卦（起星）**：本插件**没有可核的替卦原表**，`tables.XUANKONG_TIGUA === null`。
 *   故兼向（偏离山中心 3°~7.5°）时本实现**按下卦（正卦）飞布**，并在
 *   `detail.替卦` 与 `detail.未核实` 里明写「替卦表未内置，兼向按下卦处理，结果不可据此断吉凶」。
 *   **不编造替卦数**。此时该法 `fidelity: 'approx'`。
 *
 * ### 3) 三合派二十四山（#76）
 * - **双山五行**（三合局）：坤申·壬子·乙辰属水，艮寅·丙午·辛戌属火，
 *   巽巳·庚酉·癸丑属金，乾亥·甲卯·丁未属木。
 *   `cite: 《地理五诀·卷三》双山五行（坤壬乙辰水、艮丙辛戌火、巽庚癸丑金、乾甲丁未木）`。
 * - **十二长生水法**：火局长生艮寅、水局坤申、木局乾亥、金局巽巳；以**向首双山定局**、
 *   坐山为入首龙，顺排十二长生。来水宜长生/冠带/临官/帝旺，去水宜衰/病/死/墓/绝。
 *   `cite: 《地理五诀·卷四·十二长生水法》`。
 * - **⚠ 水口方位未提供**：本盘按「水自坐山方来、向首方去」的公开简化口径取值，并在
 *   `detail.说明` 明写。实际应以实测水口与来去水方位核对。
 *
 * ### 4) 三元派三般卦（#77）
 * - 三般卦分组 1-4-7 / 2-5-8 / 3-6-9：运星、山星、向星三数同组为父母三般卦，
 *   山向两星同组为连珠三般卦。**各派对成立条件（是否须同宫相连、是否兼看零正）说法不一**，
 *   本盘取上述可复核的取值法，故本条 `fidelity: 'approx'`。
 * - **三元零正**：正神 = 当运星之后天卦，零神 = 其对宫；五运居中无零正，本盘不判。
 *
 * ### 5) 九星水法（#78）
 * - 八星翻卦以**向首卦起辅弼（伏位）**，星名与八宅游年同源：
 *   辅弼=伏位、武曲=延年、贪狼=生气、巨门=天医、禄存=祸害、文曲=六煞、廉贞=五鬼、破军=绝命。
 * - 另附**二十四山辅星盘**，口诀「辅武破廉贪巨禄文」，依净阴净阳（阳顺阴逆），每山一星、循环三周。
 *   **各派辅星排法起甲不同**，故本条 `fidelity: 'approx'`。
 *
 * ### 6) 形势派四灵（#80）
 * - 玄武（后=坐）／朱雀（前=向）／青龙（左，坐山 +6 山）／白虎（右，坐山 +18 山）。
 * - **⚠ 本插件没有形峦实测数据**（山体高低、水路走向、远近逼压）：四灵只按坐向定**方位**，
 *   以五行旺衰拟「势」之强弱。这是**结构性推断，不是看过的地**，`detail.说明` 明写。
 *
 * ### 7) 罗盘二十四山（#81）
 * - 每山 15°，子山中心 = 正北 0°，顺时针递加。正针立向取山中心。
 * - 大空亡 = 八卦分界（22.5° + 45k，共八线）；小空亡 = 本卦内三山交界（共十六线）。
 * - 三元龙：天元=四正四维、地元=四孟之干与四库、人元=四生与四仲之干。
 * - 出卦 = 山向元龙不一；阴阳差错 = 山向净阴净阳不一。
 *
 * ### 8) 六十甲子分金 / 一百二十分金（#82）
 * - **分类口诀**（原文可核）：
 *   「甲壬阳孤乙癸虚，龟甲空亡戊己推；丙丁庚辛虽旺相，刑冲两害亦莫为。」
 *   `cite: 琴鹤堂国学《地盘正针一百二十分金歌解》shou.com/a/1015367722_100084723（引地盘正针歌诀原文）；
 *         理据为《周易纳甲歌》「乾纳甲壬、坤纳乙癸、坎纳戊、离纳己、震纳庚、巽纳辛、艮纳丙、兑纳丁」`
 *   → 甲壬=阳孤、乙癸=阴虚（合称**孤虚**）、戊己=**龟甲空亡**、丙丁庚辛=**旺相**。
 * - **几何排布**：二十四山每山五分金、每位 3°，共 120 位；甲子起子山起点 352.5°，顺行六十甲子两轮。
 *   `cite: 琴鹤堂国学同上（「二十四山各山五个分金即：两个旺相分金可用，其他三个分别为阳孤、
 *         阴虚、龟甲空亡」）；罗盘讲解6 `sohu.com/a/348732350_435999`（正针一百二十龙每山五位、每位三度）`
 * - **可核的两条结构规则（v2 已机械校验，见核验文档 §4）**：
 *   ① 十二**支山**（子丑寅…亥）的分金**支同本山**——子山排甲子、丙子、戊子、庚子、壬子，
 *      丑山排乙丑、丁丑、己丑、辛丑、癸丑（原文如此），恰为「阳支顺排甲丙戊庚壬、
 *      阴支顺排乙丁己辛癸」；
 *   ② 每山的旺相天干恰为二位：**阳支山丙庚、阴支山丁辛**，十二支山共 24 个旺相格
 *      （与「丙丁庚辛虽旺相」「每山只有丙庚或丁辛两位」两处记载一致）。
 * - **⚠ 本实现的取值边界（重要，勿当定理）**：两个可查来源只给上述结构规则，
 *   **未给逐格干支的完整原表**，且对**八干四维山**（甲庚壬丙乙辛丁癸乾坤艮巽）无可查规则。
 *   故本实现取：
 *   · 120 位一律按 3° 网格排在**本山范围内**（k = 5i + j，位置 = 352.5° + 3k），
 *     每山五位，与「每山五位、每位三度」一致；
 *   · 干支名取该位在六十甲子中的**甲子锚点**表 `FENJIN_ANCHOR`（该表即由规则①逐支精确复现，
 *     已机械校验：12 支山 × 5 位 = 60 条干支名与规则①**逐字一致**）；
 *   · 干维山按同一张锚点表**连续排布**（无独立原文可依，如实标 `未核实`）。
 *   等级只由**天干**定，故旺相数与位置由上述规则确定，不另设。
 *   逐格（尤其干维山）**未能与某一原表逐字对校**，故 `detail.未核实` 明写、本条 `fidelity: 'core'`
 *   （结构性取值；若需与某师承原表逐字相符，请替换族内 `FENJIN_ANCHOR` 表，勿改算法）。
 */

import {
  GAN, ZHI, WUXING, GAN_WUXING, ZHI_WUXING, relation, wangShuai, mod, clamp,
  emptyWuxing, nayinOf, ganzhiOf, evidence,
} from '../core/kit.js'
import {
  TRIGRAMS, TRI_BY_NAME, SHAN24, SHAN_PALACE, EAST_WEST, NINE_STAR,
  XUANKONG_YUN, XUANKONG_FLY, LUOSHU_GONG, SHAN24_SANYUAN, SHAN24_SANHE,
} from '../core/tables.js'
import {
  HOU2TRI, FLY_ORDER, YUN_START, YUN_SPAN, SAN_YUAN_NAME,
  STAR_WX, STAR_NAME, BAZHAI_SONG, YOU_NIAN_ORDER, STAR_FULL, STAR_SCORE,
  STAR_TO_FUXING, ZHI_GUA,
  SHUANG_SHAN, SHAN2SHUANG, SHUANG_SHAN_WX, JU_CHANGSHENG_START, JU_MU, JU_DIWANG,
  CHANGSHENG_SCORE, JI_SHUI, FU_XING_ORDER, FU_XING_SCORE, FU_XING_JI,
  YUAN_LONG, SHAN_YANG, JING_YANG, FENJIN_GRADE, FENJIN_SCORE, FENJIN_NOTE,
  FENJIN_START_DEG, FENJIN_STEP, SEASON_OF_WX,
} from './data/fengshui.js'

// ═══════════════════════════════════════════════════════════════════
// 族内兜底表
// 说明：`core/tables.js`（kernel-tables 批）可能尚未落盘或字段名有出入，
// 故凡是共享表覆盖得到的，都在这里用**逐键相等**的族内表兜底；一律走可选链。
// ═══════════════════════════════════════════════════════════════════

/** 二十四山（族内兜底，与 tables.SHAN24 逐字相同）。cite: 罗盘二十四山（八干四维十二支） */
const SHAN_FALLBACK = ('子 癸 丑 艮 寅 甲 卯 乙 辰 巽 巳 丙 午 丁 未 坤 申 庚 酉 辛 戌 乾 亥 壬').split(' ')
const SHAN = Array.isArray(SHAN24) && SHAN24.length === 24 ? SHAN24 : SHAN_FALLBACK

/**
 * 二十四山 → 八卦宫（族内兜底）。
 * cite: 罗盘分宫「壬子癸坎、丑艮寅艮、甲卯乙震、辰巽巳巽、丙午丁离、未坤申坤、庚酉辛兑、戌乾亥乾」
 */
const SHAN_PALACE_FB = (() => {
  const out = {}
  const groups = [['坎', '壬', '子', '癸'], ['艮', '丑', '艮', '寅'], ['震', '甲', '卯', '乙'], ['巽', '辰', '巽', '巳'],
    ['离', '丙', '午', '丁'], ['坤', '未', '坤', '申'], ['兑', '庚', '酉', '辛'], ['乾', '戌', '乾', '亥']]
  for (const [g, ...list] of groups) for (const s of list) out[s] = g
  return out
})()

/**
 * 二十四山三元龙与阴阳（族内兜底）。
 * cite: 《沈氏玄空学·论三元龙》；天元＝子午卯酉（阴）乾坤艮巽（阳），
 *       地元＝辰戌丑未（阴）甲庚壬丙（阳），人元＝寅申巳亥（阴）乙辛丁癸（阳）
 * 即「八干四维为阳、十二地支为阴」，这是玄空飞星阳顺阴逆的判据。
 */
const SANYUAN_FB = (() => {
  const out = {}
  const set = (list, long, yy) => { for (const s of list) out[s] = { long, yinyang: yy } }
  set(['乾', '坤', '艮', '巽'], '天元', '阳')
  set(['子', '午', '卯', '酉'], '天元', '阴')
  set(['甲', '庚', '丙', '壬'], '地元', '阳')
  set(['辰', '戌', '丑', '未'], '地元', '阴')
  set(['寅', '申', '巳', '亥'], '人元', '阳')
  set(['乙', '辛', '丁', '癸'], '人元', '阴')
  return out
})()

/**
 * 双山五行（三合局，族内兜底，与 tables.SHAN24_SANHE 逐键相同）。
 * cite: 《地理五诀·卷三》双山五行（坤壬乙辰水、艮丙辛戌火、巽庚癸丑金、乾甲丁未木）
 */
const SANHE_FB = (() => {
  const out = {}
  const groups = [
    ['水', ['坤', '申', '壬', '子', '乙', '辰']],
    ['火', ['艮', '寅', '丙', '午', '辛', '戌']],
    ['金', ['巽', '巳', '庚', '酉', '癸', '丑']],
    ['木', ['乾', '亥', '甲', '卯', '丁', '未']],
  ]
  for (const [wx, list] of groups) for (const s of list) out[s] = wx
  return out
})()

/**
 * 三元九运（族内兜底）。
 * cite: 《沈氏玄空学·论三元九运》——上元一运起 1864 年甲子，每运 20 年，九运一周 180 年。
 */
const YUN_FB = (() => {
  const out = []
  const yuan = ['上元', '上元', '上元', '中元', '中元', '中元', '下元', '下元', '下元']
  for (let i = 0; i < 9; i += 1) {
    const from = 1864 + i * 20
    out.push({ yuan: yuan[i], yun: i + 1, from, to: from + 19 })
  }
  return out
})()

/**
 * 六十甲子锚点：每个**地支山**的五个分金在六十甲子中的起点序号（步长 +12，故支同本山、干走二位）。
 *
 * 该表不是"凭记忆编的数"，而是由可核结构规则**精确复现**：
 *   规则①「阳支顺排甲丙戊庚壬、阴支顺排乙丁己辛癸」——即地支山的分金**支同本山**；
 *   规则②「每山只有丙庚或丁辛两位」——即旺相天干恰为二位。
 * 六十甲子中以某支为支的干支恰有五个（甲子、丙子、戊子、庚子、壬子…），步长 12 即得全列。
 *
 * 已机械校验（见 docs/verification/fengshui-xiangxing.md §4）：
 *   · 12 支山 × 5 位 = 60 条干支名与规则①**逐字一致**；
 *   · 12 支山的旺相天干恰为「阳支丙庚、阴支丁辛」，共 24 格，与规则②一致。
 *
 * cite: 琴鹤堂国学《地盘正针一百二十分金歌解》 https://www.sohu.com/a/1015367722_100084723 （引原文
 *       「如子山排甲子、丙子、戊子、庚子、壬子；癸山继排…」「每山只有丙庚或丁辛两位干支，
 *        共四十八干支可用」——四十八之数含缝针/中针两盘，本盘只取正针一盘，故为 24）
 * @type {Object<string,string[]>}
 */
const FENJIN_ANCHOR = {
  子: ['甲子', '丙子', '戊子', '庚子', '壬子'],
  丑: ['乙丑', '丁丑', '己丑', '辛丑', '癸丑'],
  寅: ['丙寅', '戊寅', '庚寅', '壬寅', '甲寅'],
  卯: ['丁卯', '己卯', '辛卯', '癸卯', '乙卯'],
  辰: ['戊辰', '庚辰', '壬辰', '甲辰', '丙辰'],
  巳: ['己巳', '辛巳', '癸巳', '乙巳', '丁巳'],
  午: ['庚午', '壬午', '甲午', '丙午', '戊午'],
  未: ['辛未', '癸未', '乙未', '丁未', '己未'],
  申: ['壬申', '甲申', '丙申', '戊申', '庚申'],
  酉: ['癸酉', '乙酉', '丁酉', '己酉', '辛酉'],
  戌: ['甲戌', '丙戌', '戊戌', '庚戌', '壬戌'],
  亥: ['乙亥', '丁亥', '己亥', '辛亥', '癸亥'],
}

/** 八卦 → 五行（族内兜底）。cite: 《周易·说卦传》乾兑金、震巽木、坎水、离火、艮坤土 */
const GUA_WX_FB = { 乾: '金', 兑: '金', 离: '火', 震: '木', 巽: '木', 坎: '水', 艮: '土', 坤: '土' }
/** 八卦 → 方位。cite: 后天八卦方位（震东、巽东南、离南、坤西南、兑西、乾西北、坎北、艮东北） */
const GUA_DIR_FB = { 乾: '西北', 兑: '西', 离: '南', 震: '东', 巽: '东南', 坎: '北', 艮: '东北', 坤: '西南' }
/** 九星号 → 五行。cite: 紫白九星（一白水、二黑土、三碧木、四绿木、五黄土、六白金、七赤金、八白土、九紫火） */
const STAR_WX_FB = { 1: '水', 2: '土', 3: '木', 4: '木', 5: '土', 6: '金', 7: '金', 8: '土', 9: '火' }
/** 九星号 → 星名。cite: 紫白九星名（一白贪狼…九紫右弼） */
const STAR_NAME_FB = { 1: '一白', 2: '二黑', 3: '三碧', 4: '四绿', 5: '五黄', 6: '六白', 7: '七赤', 8: '八白', 9: '九紫' }
/** 洛书数 → 后天八卦。cite: 《洛书》戴九履一、左三右七、二四为肩、六八为足 */
const HOU2TRI_FB = { 1: '坎', 2: '坤', 3: '震', 4: '巽', 6: '乾', 7: '兑', 8: '艮', 9: '离' }
/** 飞星轨迹（洛书 5→6→7→8→9→1→2→3→4）。cite: 《沈氏玄空学》九宫飞星图 */
const FLY_FB = ['中', '乾', '兑', '艮', '离', '坎', '坤', '震', '巽']
/** 宫 → 洛书数（FLY 的逆）。cite: 同《洛书》 */
const LUOSHU_FB = { 中: 5, 乾: 6, 兑: 7, 艮: 8, 离: 9, 坎: 1, 坤: 2, 震: 3, 巽: 4 }
/** 东四/西四。cite: 《八宅明镜》坎离震巽为东四、乾坤艮兑为西四 */
const EAST_WEST_FB = { 东四: ['坎', '离', '震', '巽'], 西四: ['乾', '坤', '艮', '兑'] }

/** 五行 → 当令月支（应期用）。cite: 五行旺于当令之月 */
const SEASON_WX_FB = {
  木: { season: '春', text: '寅卯月' }, 火: { season: '夏', text: '巳午月' },
  金: { season: '秋', text: '申酉月' }, 水: { season: '冬', text: '亥子月' },
  土: { season: '四季', text: '辰戌丑未月' },
}

// ═══════════════════════════════════════════════════════════════════
// 共享表取值（一律可选链 + 族内兜底）
// ═══════════════════════════════════════════════════════════════════

/** 山 → 索引（0 = 子，顺时针每山 15°）。 */
const SHAN_INDEX = (() => {
  const out = {}
  SHAN.forEach((s, i) => { out[s] = i })
  return out
})()
/** 二十四山字集（供正则用）。 */
const SHAN_CHARS = '子丑寅卯辰巳午未申酉戌亥艮巽乾坤甲庚壬丙乙辛丁癸'
/** 方位词 → 二十四山。cite: 后天八卦方位 */
const DIR2SHAN = { 北: '子', 南: '午', 东: '卯', 西: '酉', 东北: '艮', 东南: '巽', 西南: '坤', 西北: '乾' }
/** 方位词正则（长的在前，避免「东北」被「东」抢先）。 */
const DIR_RE = '东北|东南|西北|西南|北|南|东|西'
/** 十二地支山（正针得旺相分金者）。 */
const ZHI_SHAN = ZHI.slice()

/** 取第 i 山（环形）。 */
const shanAt = (i) => SHAN[mod(i, 24)]
/** 对宫山（罗盘 180° 对山）。 */
const oppositeShan = (s) => shanAt(mod(SHAN_INDEX[s] ?? 0, 24) + 12)
/** 山所属八卦宫。 */
const palaceOf = (s) => SHAN_PALACE?.[s] ?? SHAN_PALACE_FB[s] ?? '坎'
/** 宫 → 五行（先查共享 TRIGRAMS，再查族内兜底）。 */
const guaWx = (g) => TRI_BY_NAME?.[g]?.wx ?? GUA_WX_FB[g] ?? '土'
/** 宫 → 方位。 */
const guaDir = (g) => TRI_BY_NAME?.[g]?.dir ?? GUA_DIR_FB[g] ?? ''
/** 山所属八卦的五行。 */
const guaWxOf = (s) => guaWx(palaceOf(s))
/** 山度（中心，子 = 0°）。 */
const degOf = (s) => mod((SHAN_INDEX[s] ?? 0) * 15, 360)
/** 三元龙。 */
const yuanLongOf = (s) => SHAN24_SANYUAN?.[s]?.long ?? YUAN_LONG?.[s] ?? SANYUAN_FB[s]?.long ?? '天元'
/** 三元龙阴阳（true = 阳）。 */
const isYangShan = (s) => {
  const y = SHAN24_SANYUAN?.[s]?.yinyang
  if (y === '阳') return true
  if (y === '阴') return false
  if (SHAN_YANG?.[s] === true) return true
  return SANYUAN_FB[s]?.yinyang === '阳'
}
/** 净阴净阳（三合红黑字）。 */
const isJingYang = (s) => (Array.isArray(JING_YANG) ? JING_YANG.includes(s) : SANYUAN_FB[s]?.yinyang === '阳')
/** 九星五行。 */
const starWx = (n) => STAR_WX?.[n] ?? STAR_WX_FB[n] ?? '土'
/** 九星星名。 */
const starName = (n) => STAR_NAME?.[n] ?? STAR_NAME_FB[n] ?? String(n)
/** 洛书数 → 卦。 */
const hou2tri = (n) => HOU2TRI?.[n] ?? HOU2TRI_FB[n] ?? null
/** 宫 → 洛书数。 */
const luoshuOf = (g) => LUOSHU_GONG?.[g] ?? LUOSHU_FB[g] ?? 5
/** 飞星轨迹。 */
const FLY = Array.isArray(FLY_ORDER) && FLY_ORDER.length === 9 ? FLY_ORDER : (Array.isArray(XUANKONG_FLY) && XUANKONG_FLY.length === 9 ? XUANKONG_FLY : FLY_FB)
/** 东四 / 西四。 */
const eastWestOf = (gua) => ((EAST_WEST?.东四 ?? EAST_WEST_FB.东四).includes(gua) ? '东四' : '西四')
/** 双山五行。 */
const shuangWxOf = (shan) => SANHE_FB[shan] ?? (SHAN24_SANHE?.[shan] ?? '土')
/** 山 → 双山。 */
const shuangOf = (s) => SHAN2SHUANG?.[s] ?? null
/** 五行 → 应期文本。 */
const seasonOf = (wx) => SEASON_OF_WX?.[wx] ?? SEASON_WX_FB[wx] ?? null
/** 纳音名 → 五行（末字）。 */
const nayinWx = (n) => (typeof n === 'string' && n.length > 0 ? n[n.length - 1] : '土')

/** 本族引用的经典（detail.cite 用）。 */
const CITE = {
  八宅: '《八宅明镜》大游年歌（原文见族内 BAZHAI_SONG 注释）；《卜居秘髓·阳宅大游年》',
  东西四: '《八宅明镜》东西四宅（坎离震巽东四、乾坤艮兑西四）',
  命卦: '《八宅明镜》命卦起例（男 (100−年末两位) mod 9、女 (年末两位+5) mod 9，余五男坤女艮）',
  阳宅三要: '《阳宅三要》门主灶论（门为向首、主为坐山、灶宜门卦生气方）',
  三元九运: '《沈氏玄空学·论三元九运》（1864 甲子起一运，每运 20 年）',
  飞星: '《沈氏玄空学》九宫飞星图（中→乾→兑→艮→离→坎→坤→震→巽）',
  三元龙: '《沈氏玄空学·论三元龙》（八干四维阳、十二地支阴；阳顺阴逆）',
  零正: '《沈氏玄空学》三元零正（正神＝当运星之后天卦，零神＝其对宫）',
  替卦: '《沈氏玄空学》兼向替卦（起星）——本插件无可核原表，故意留空',
  三合: '《地理五诀·卷三》双山五行（坤壬乙辰水、艮丙辛戌火、巽庚癸丑金、乾甲丁未木）',
  长生: '《地理五诀·卷四·十二长生水法》',
  辅星: '《地理五诀》辅星水法八星（辅武破廉贪巨禄文），星名与八宅游年同源',
  四灵: '形势派四灵（《葬书》「玄武垂头、朱雀翔舞、青龙蜿蜒、白虎驯俯」之方位义）',
  罗盘: '罗盘二十四山（八干四维十二支，每山 15°）；空亡线见《罗经解定》',
  分金: '琴鹤堂国学《地盘正针一百二十分金歌解》（引地盘正针歌诀「甲壬阳孤乙癸虚，龟甲空亡戊己推；丙丁庚辛虽旺相，刑冲两害亦莫为」）https://www.sohu.com/a/1015367722_100084723',
  分金排布: '罗盘讲解6《三合盘-正针百二十龙》 https://www.sohu.com/a/348732350_435999（二十四山每山五位、每位三度）',
}

// ═══════════════════════════════════════════════════════════════════
// 坐向提取
// ═══════════════════════════════════════════════════════════════════

const RE_SHAN_XIANG = new RegExp(`([${SHAN_CHARS}])\\s*山\\s*([${SHAN_CHARS}])\\s*向`)
const RE_ZUO_XIANG = new RegExp(`坐\\s*([${SHAN_CHARS}])\\s*(?:山)?(?:\\s*向\\s*([${SHAN_CHARS}]))?`)
const RE_ZUO_DIR = new RegExp(`坐\\s*(${DIR_RE})(?:\\s*(?:朝|向|望)\\s*(${DIR_RE}))?`)
const RE_DIR_XIANG = new RegExp(`(${DIR_RE})\\s*向`)
const RE_CHAO = new RegExp(`(?:朝|向)\\s*(${DIR_RE})`)

/**
 * 从所问里提坐向；提不出则随机取山（并标记 approx）。
 * @param {object} chart 盘基。
 * @param {import('../core/kit.js').Rand} rand 随机源。
 * @returns {{zuo:string, xiang:string, source:string, approx:boolean, how:string, note:string}} 坐向。
 */
function resolveOrientation(chart, rand) {
  const q = String(chart?.question ?? '')
  let zuo = null
  let xiang = null
  let how = ''
  let matched = false

  let m = RE_SHAN_XIANG.exec(q)
  if (m) { zuo = m[1]; xiang = m[2]; how = `山向式「${m[0]}」`; matched = true }

  if (!zuo) {
    m = RE_ZUO_XIANG.exec(q)
    if (m) { zuo = m[1]; xiang = m[2] ?? null; how = `坐向式「${m[0]}」`; matched = true }
  }
  if (!zuo) {
    m = RE_ZUO_DIR.exec(q)
    if (m && DIR2SHAN[m[1]]) {
      zuo = DIR2SHAN[m[1]]
      xiang = m[2] ? (DIR2SHAN[m[2]] ?? null) : null
      how = `坐朝式「${m[0]}」（${m[1]}→${zuo}${m[2] ? `，${m[2]}→${xiang}` : ''}）`
      matched = true
    }
  }
  if (!zuo && !xiang) {
    m = RE_DIR_XIANG.exec(q)
    if (m && DIR2SHAN[m[1]]) { xiang = DIR2SHAN[m[1]]; how = `向首式「${m[0]}」`; matched = true }
  }
  if (!zuo && !xiang) {
    m = RE_CHAO.exec(q)
    if (m && DIR2SHAN[m[1]]) { xiang = DIR2SHAN[m[1]]; how = `朝向式「${m[0]}」`; matched = true }
  }

  if (zuo && !xiang) xiang = oppositeShan(zuo)
  if (xiang && !zuo) zuo = oppositeShan(xiang)

  if (!zuo) {
    const z = rand?.pick?.(SHAN) ?? '子'
    return {
      zuo: z,
      xiang: oppositeShan(z),
      source: 'random',
      approx: true,
      how: '未提供坐向（随机取山）',
      note: `未提供坐向，已随机取山：${z}（向${oppositeShan(z)}）；如需精确请注明坐向（如「坐子向午」「坐北朝南」「卯山酉向」）`,
    }
  }

  const notes = []
  const opp = oppositeShan(zuo)
  if (xiang !== opp) {
    notes.push(`所给向首${xiang}与坐山${zuo}非对宫，已按坐山取对宫${opp}为向`)
    xiang = opp
  }
  if (!matched) notes.push('坐向由推断得出，请核对')
  return { zuo, xiang, source: 'question', approx: false, how, note: notes.join('；') }
}

/** 坐向说明文本（进 detail.坐向）。 */
function orText(or) {
  return `坐${or.zuo}山（${degOf(or.zuo)}°·${palaceOf(or.zuo)}宫）向${or.xiang}（${degOf(or.xiang)}°·${palaceOf(or.xiang)}宫），取自${or.how}`
}

/**
 * 保真度：提不出坐向一律降 approx；`extra` 为 true 时也降。
 * @param {object} entry 条目。
 * @param {object} or 坐向。
 * @param {boolean} [extra] 是否另有近似因素。
 * @returns {'full'|'core'|'approx'} 保真度。
 */
function fidOf(entry, or, extra) {
  if (or?.approx || extra) return 'approx'
  const f = entry?.fidelity
  return f === 'full' || f === 'core' || f === 'approx' ? f : 'core'
}

/** 五行信号。 */
function wxSignal(pairs) {
  const out = emptyWuxing()
  for (const [w, v] of pairs) if (WUXING.includes(w)) out[w] += Number(v) || 0
  return out
}

// ═══════════════════════════════════════════════════════════════════
// 八宅原语（#73 #79）
// ═══════════════════════════════════════════════════════════════════

/** 游年九星序（后天八卦顺时针）。cite: 大游年歌配宫次序 */
const YOU_NIAN_SEQ = Array.isArray(YOU_NIAN_ORDER) && YOU_NIAN_ORDER.length === 8
  ? YOU_NIAN_ORDER
  : ['坎', '艮', '震', '巽', '离', '坤', '兑', '乾']

/** 简写 → 游年九星全名。cite: 大游年歌简写（六=六煞 天=天医 五=五鬼 祸=祸害 绝=绝命 延=延年 生=生气） */
const STAR_FULL_FB = { 伏: '伏位', 生: '生气', 延: '延年', 天: '天医', 绝: '绝命', 五: '五鬼', 六: '六煞', 祸: '祸害' }

/**
 * 大游年歌（八宅明镜）。**本表为主体，不依赖外部方案**。
 *
 * 歌诀原文（错讹与断句依刻本原样，本表只取其字）：
 *   乾六天五祸绝延生，坎五天生延绝祸六，艮六绝祸生延天五，震延生祸绝五天六，
 *   巽天五六祸生绝延，离六五绝延祸生天，坤天延绝生祸五六，兑生祸延绝六五天。
 *
 * **配宫规则**：每行首字为该宅「伏位卦」，其后七字依次配给后天八卦顺时针
 * 坎→艮→震→巽→离→坤→兑→乾 中「自伏位卦之后一位起」的七宫。
 * 该规则已被 v2 用「上中下中上中下」变爻翻卦独立复算，64 格逐格一致（见核验文档 §1），
 * 且与《卜居秘髓·阳宅大游年》所载歌诀完全相同。
 *
 * cite: 《八宅明镜》大游年歌；《卜居秘髓·阳宅大游年》（明·造福散人辑，识典古籍 SDZJ0496）
 *       https://www.shidianguji.com/mid-page/7556734446286094363
 */
const BAZHAI_SONG_FB = {
  乾: '六天五祸绝延生',
  坎: '五天生延绝祸六',
  艮: '六绝祸生延天五',
  震: '延生祸绝五天六',
  巽: '天五六祸生绝延',
  离: '六五绝延祸生天',
  坤: '天延绝生祸五六',
  兑: '生祸延绝六五天',
}

/** 游年九星吉凶分（-100..100，**本插件编辑取值**，见族内表说明）。 */
const STAR_SCORE_FB = { 伏位: 30, 生气: 90, 延年: 75, 天医: 65, 绝命: -85, 五鬼: -75, 六煞: -55, 祸害: -45 }
const starScore = (s) => STAR_SCORE?.[s] ?? STAR_SCORE_FB[s] ?? 0

/** 游年九星 → 九星水法八星。cite: 两套名号同源（辅弼=伏位、武曲=延年、贪狼=生气、巨门=天医、禄存=祸害、文曲=六煞、廉贞=五鬼、破军=绝命） */
const STAR_TO_FU_FB = { 伏位: '辅弼', 生气: '贪狼', 延年: '武曲', 天医: '巨门', 绝命: '破军', 五鬼: '廉贞', 六煞: '文曲', 祸害: '禄存' }
const toFuXing = (s) => STAR_TO_FUXING?.[s] ?? STAR_TO_FU_FB[s] ?? '辅弼'

/** 年支 → 后天卦（兜底口径，非命卦正法）。cite: 后天八卦配十二支（子坎、丑寅艮、卯震、辰巳巽、午离、未申坤、酉兑、戌亥乾） */
const ZHI_GUA_FB = { 子: '坎', 丑: '艮', 寅: '艮', 卯: '震', 辰: '巽', 巳: '巽', 午: '离', 未: '坤', 申: '坤', 酉: '兑', 戌: '乾', 亥: '乾' }

/**
 * 大游年：由伏位卦翻出八卦各自的游年九星。
 * @param {string} gua 伏位卦（宅卦或门卦）。
 * @returns {Object<string,string>} 卦名 → 游年九星名。
 */
function youNianOf(gua) {
  const out = { [gua]: '伏位' }
  const song = BAZHAI_SONG?.[gua] ?? BAZHAI_SONG_FB[gua]
  if (!song) return out
  const i0 = YOU_NIAN_SEQ.indexOf(gua)
  if (i0 < 0) return out
  const chars = [...song]
  for (let k = 1; k < 8; k += 1) {
    const g = YOU_NIAN_SEQ[mod(i0 + k, 8)]
    out[g] = STAR_FULL?.[chars[k - 1]] ?? STAR_FULL_FB[chars[k - 1]] ?? '伏位'
  }
  return out
}

/** 游年九星盘 → 可读串（按后天八卦宫序）。 */
const youNianText = (yn) => YOU_NIAN_SEQ.map((g) => `${g}${yn[g] ?? '—'}`).join(' ')

/**
 * 命卦：出生年 + 性别。男 (100−年末两位) mod 9，女 (年末两位+5) mod 9；
 * 余 0 作 9，余 5 男作坤、女作艮。
 * cite: 《八宅明镜》命卦起例（野马跳涧诀之数值化）
 * @param {number} year 出生年。
 * @param {string} gender 性别（`女` 走女命）。
 * @returns {string} 命卦名。
 */
function mingGuaFromYear(year, gender) {
  const yy = mod(Math.trunc(Number(year) || 0), 100)
  const r0 = gender === '女' ? mod(yy + 5, 9) : mod(100 - yy, 9)
  const r = r0 === 0 ? 9 : r0
  if (r === 5) return gender === '女' ? '艮' : '坤'
  return hou2tri(r) ?? '坎'
}

/**
 * 取命卦（优先出生年，无出生资料则用流年支所属卦兜底并标 approx）。
 * @param {object} chart 盘基。
 * @returns {{gua:string, from:string, approx:boolean}} 命卦。
 */
function mingGuaOf(chart) {
  const solar = chart?.birthChart?.solar
  const m = /(\d{4})/.exec(String(solar ?? ''))
  if (m) {
    const y = Number(m[1])
    return { gua: mingGuaFromYear(y, chart?.gender), from: `出生年${y}（${chart?.gender === '女' ? '女' : '男'}命）`, approx: false }
  }
  const g = ZHI_GUA?.[chart?.yearZhi] ?? ZHI_GUA_FB[chart?.yearZhi]
  if (g) return { gua: g, from: `未提供出生年，以流年支${chart?.yearZhi}所属${g}卦代命卦（非命卦正法）`, approx: true }
  return { gua: '坎', from: '出生年与流年支皆不可得，暂以坎卦代命卦（非命卦正法）', approx: true }
}

// ═══════════════════════════════════════════════════════════════════
// 玄空原语（#74 #75 #77）
// ═══════════════════════════════════════════════════════════════════

/**
 * 飞星盘：入中之数按洛书轨迹顺飞或逆飞。
 * cite: 《沈氏玄空学》九宫飞星图（顺飞 中→乾→兑→艮→离→坎→坤→震→巽，逆飞反之）
 * @param {number} center 入中之数（1..9）。
 * @param {boolean} forward 是否顺飞。
 * @returns {Object<string,number>} 宫 → 星数。
 */
function flyPan(center, forward) {
  const out = {}
  for (let k = 0; k < FLY.length; k += 1) {
    out[FLY[k]] = mod(Number(center) - 1 + (forward ? k : -k), 9) + 1
  }
  return out
}

/**
 * 由公元年定元运（先查共享表 XUANKONG_YUN，缺则按 1864 起一运、每运 20 年推）。
 * @param {number} year 公元年。
 * @returns {{yun:number, start:number, end:number, yuan:string, from:string}} 元运。
 */
function yunOf(year) {
  const y = Number.isFinite(Number(year)) ? Math.trunc(Number(year)) : 2024
  const table = Array.isArray(XUANKONG_YUN) && XUANKONG_YUN.length >= 9 ? XUANKONG_YUN : YUN_FB
  const hit = table.find((r) => y >= r.from && y <= r.to)
  if (hit) return { yun: hit.yun, start: hit.from, end: hit.to, yuan: hit.yuan, from: '共享表 XUANKONG_YUN' }
  const raw = Math.floor((y - YUN_START) / YUN_SPAN)
  const yun = mod(raw, 9) + 1
  const start = YUN_START + raw * YUN_SPAN
  return { yun, start, end: start + YUN_SPAN - 1, yuan: SAN_YUAN_NAME?.[yun] ?? ['上元', '上元', '上元', '中元', '中元', '中元', '下元', '下元', '下元'][yun - 1], from: `按 ${YUN_START} 年起一运、每运 ${YUN_SPAN} 年推算（超出共享表范围）` }
}

/** 九宫盘 → 传统布局串（巽离坤／震中兑／艮坎乾）。 */
const panText = (pan) => `巽${pan.巽} 离${pan.离} 坤${pan.坤} ｜ 震${pan.震} 中${pan.中} 兑${pan.兑} ｜ 艮${pan.艮} 坎${pan.坎} 乾${pan.乾}`

/**
 * 星数相对当运的生旺退死（「当运者旺、将来者生、已过者退、久过者死」）。
 * cite: 《沈氏玄空学》生旺退死诸气法则（当运主气为旺、下一运为生气）
 * @param {number} star 星数。
 * @param {number} yun 当运。
 * @returns {{name:string, score:number}} 气与分。
 */
function yunQiOf(star, yun) {
  const d = mod(star - yun, 9)
  if (d === 0) return { name: '当旺', score: 90 }
  if (d === 1) return { name: '生气', score: 65 }
  if (d === 2) return { name: '未来气', score: 25 }
  if (d === 3) return { name: '未来气', score: 5 }
  if (d === 4) return { name: '平气', score: -15 }
  if (d === 5) return { name: '平气', score: -25 }
  if (d === 6) return { name: '死气', score: -70 }
  if (d === 7) return { name: '衰气', score: -65 }
  return { name: '退气', score: -45 }
}

/**
 * 三元零正：正神卦 = 当运星之后天卦，零神卦 = 其对宫（五运居中无零正）。
 * cite: 《沈氏玄空学》三元零正（一运正神坎零神离、二运正神坤零神艮…九运正神离零神坎）
 * @param {number} yun 当运。
 * @returns {{zheng:string|null, ling:string|null}} 零正卦。
 */
function lingZhengOf(yun) {
  return { zheng: hou2tri(yun), ling: yun === 5 ? null : hou2tri(10 - yun) }
}

/**
 * 兼向判定：坐山偏离本山中心 3°~7.5° 视为兼向（下卦用正卦，兼向须起替卦）。
 * cite: 《罗经解定》二百四十分金（本位正中十分、偏三分以上入兼）；《沈氏玄空学》兼向替卦
 * @param {string} shan 山。
 * @returns {{jian:boolean, offset:number, note:string}} 判定。
 */
function jianXiangOf(shan) {
  const d = degOf(shan)
  const off = mod(d + 7.5, 360)
  return {
    jian: off > 3 && off < 7.5,
    offset: off,
    note: '正针立向取山中心（偏移 0°）；偏移 3°~7.5° 为兼向，兼向须起替卦——本插件无替卦原表',
  }
}

// ═══════════════════════════════════════════════════════════════════
// 三合 / 九星水法原语（#76 #78）
// ═══════════════════════════════════════════════════════════════════

/** 十二双山（三合盘的「山」单位）。cite: 《地理五诀》双山（两山一局） */
const SHUANG = Array.isArray(SHUANG_SHAN) && SHUANG_SHAN.length === 12
  ? SHUANG_SHAN
  : ['壬子', '癸丑', '艮寅', '甲卯', '乙辰', '巽巳', '丙午', '丁未', '坤申', '庚酉', '辛戌', '乾亥']

/** 四局长生起点（双山）。cite: 《地理五诀·卷四》火局长生艮寅、水局坤申、木局乾亥、金局巽巳 */
const JU_CS_FB = { 火: '艮寅', 水: '坤申', 木: '乾亥', 金: '巽巳' }
/** 四局墓库。cite: 《地理五诀·卷四》水墓乙辰、木墓丁未、火墓辛戌、金墓癸丑 */
const JU_MU_FB = { 水: '乙辰', 木: '丁未', 火: '辛戌', 金: '癸丑' }
/** 四局帝旺。cite: 《地理五诀·卷四》水旺壬子、木旺甲卯、火旺丙午、金旺庚酉 */
const JU_DIWANG_FB = { 水: '壬子', 木: '甲卯', 火: '丙午', 金: '庚酉' }
/** 十二长生序。cite: 《三命通会·卷一》十二长生 */
const CS_SEQ = ['长生', '沐浴', '冠带', '临官', '帝旺', '衰', '病', '死', '墓', '绝', '胎', '养']
/** 十二长生吉凶分（对来水/来龙而言）。**本插件编辑取值**。 */
const CS_SCORE_FB = { 长生: 90, 沐浴: -25, 冠带: 70, 临官: 85, 帝旺: 100, 衰: -35, 病: -55, 死: -70, 墓: -45, 绝: -85, 胎: -10, 养: 30 }
/** 三合四大吉水位。cite: 《地理五诀·卷四》水法以长生、冠带、临官、帝旺为吉 */
const JI_SHUI_FB = ['长生', '冠带', '临官', '帝旺']

const shuangNameOf = (s) => shuangOf(s) ?? (SHUANG[Math.floor(mod(SHAN_INDEX[s] ?? 0, 24) / 2)] ?? '壬子')
const csScore = (cs) => CHANGSHENG_SCORE?.[cs] ?? CS_SCORE_FB[cs] ?? 0
const isJiShui = (cs) => (Array.isArray(JI_SHUI) ? JI_SHUI : JI_SHUI_FB).includes(cs)

/**
 * 双山在指定局里的十二长生位（阳局顺行）。
 * @param {string} shan 二十四山之一。
 * @param {string} ju 局五行（水/木/火/金）。
 * @returns {string} 十二长生之一；数据不足返回 `—`。
 */
function changShengShan(shan, ju) {
  const startName = JU_CHANGSHENG_START?.[ju] ?? JU_CS_FB[ju]
  const start = SHUANG.indexOf(startName)
  const cur = SHUANG.indexOf(shuangNameOf(shan))
  if (start < 0 || cur < 0) return '—'
  return CS_SEQ[mod(cur - start, 12)] ?? '—'
}

/** 某局十二长生盘（十二双山）。 */
function juPanText(ju) {
  const startName = JU_CHANGSHENG_START?.[ju] ?? JU_CS_FB[ju]
  const start = SHUANG.indexOf(startName)
  if (start < 0) return '—'
  return SHUANG.map((ss, i) => `${ss}${CS_SEQ[mod(i - start, 12)]}`).join(' ')
}

/** 八星次序口诀。cite: 《地理五诀》辅星水法「辅武破廉贪巨禄文」 */
const FU_ORDER = Array.isArray(FU_XING_ORDER) && FU_XING_ORDER.length === 8
  ? FU_XING_ORDER
  : ['辅弼', '武曲', '破军', '廉贞', '贪狼', '巨门', '禄存', '文曲']
/** 八星吉凶分。**本插件编辑取值**。 */
const FU_SCORE_FB = { 辅弼: 85, 武曲: 80, 贪狼: 75, 巨门: 70, 禄存: -45, 文曲: -55, 廉贞: -70, 破军: -85 }
/** 八星吉凶归类。cite: 《地理五诀》辅弼武曲贪狼巨门为吉、破军禄存文曲廉贞为凶 */
const FU_JI_FB = { 辅弼: true, 武曲: true, 贪狼: true, 巨门: true, 禄存: false, 文曲: false, 廉贞: false, 破军: false }
/** 八星五行。cite: 九星五行（辅弼水、武曲金、破军金、廉贞火、贪狼木、巨门土、禄存土、文曲水） */
const FU_WX = { 辅弼: '水', 武曲: '金', 破军: '金', 廉贞: '火', 贪狼: '木', 巨门: '土', 禄存: '土', 文曲: '水' }
const fuScore = (s) => FU_XING_SCORE?.[s] ?? FU_SCORE_FB[s] ?? 0
const fuJi = (s) => FU_XING_JI?.[s] ?? FU_JI_FB[s] ?? false
const fuWx = (s) => FU_WX[s] ?? '土'

/**
 * 辅星水法二十四山盘：自向首起辅弼，依净阴净阳（阳顺阴逆），八星循环三周。
 * cite: 《地理五诀》辅星水法口诀「辅武破廉贪巨禄文」＋净阴净阳顺逆
 * 说明：**各派起甲不同**，本盘取「以向首为辅弼、阳顺阴逆」一派，故本条 fidelity 为 approx。
 * @param {string} xiangShan 向首山。
 * @returns {Object<string,string>} 二十四山 → 八星名。
 */
function fuXingPan(xiangShan) {
  const i0 = SHAN_INDEX[xiangShan] ?? 0
  const forward = isJingYang(xiangShan)
  const out = {}
  for (let j = 0; j < 24; j += 1) {
    out[SHAN[j]] = FU_ORDER[forward ? mod(j - i0, 8) : mod(i0 - j, 8)] ?? '辅弼'
  }
  return out
}

/** 八星盘 → 可读串。 */
const fuXingText = (pan) => SHAN.map((s) => `${s}${pan[s]}`).join(' ')

// ═══════════════════════════════════════════════════════════════════
// 一百二十分金（#82）
// ═══════════════════════════════════════════════════════════════════

/** 天干 → 分金等级。cite: 地盘正针歌诀「甲壬阳孤乙癸虚，龟甲空亡戊己推；丙丁庚辛虽旺相」 */
const GRADE_FB = { 甲: '孤虚', 乙: '孤虚', 丙: '旺相', 丁: '旺相', 戊: '龟甲空亡', 己: '龟甲空亡', 庚: '旺相', 辛: '旺相', 壬: '孤虚', 癸: '孤虚' }
/** 孤虚的细分（阳孤 / 阴虚）。cite: 同歌诀「甲壬阳孤乙癸虚」 */
const GU_XU_KIND = { 甲: '阳孤', 壬: '阳孤', 乙: '阴虚', 癸: '阴虚' }
/** 分金等级 → 吉凶分。**本插件编辑取值**（依「丙丁庚辛可用、余皆不可用」定为三档）。 */
const GRADE_SCORE = { 旺相: 45, 孤虚: 0, 龟甲空亡: -55 }
/** 旧表把「龟甲空亡」简写作「空亡」，此处做别名归并（v1 数据兼容）。 */
const GRADE_ALIAS = { 空亡: '龟甲空亡' }
/** 分金等级 → 说明。cite: 同歌诀及其注解 */
const GRADE_NOTE = {
  旺相: '丙丁庚辛为旺相分金，立向可用',
  孤虚: '甲壬阳孤、乙癸阴虚（合称孤虚），孤阳不生孤阴不长，不可用',
  龟甲空亡: '戊己为龟甲中央，不在八方之列为空亡，不可用',
}

/** 取分金等级（先查共享表，缺则查族内兜底表；`空亡` 归一为 `龟甲空亡`）。 */
function gradeOf(gan) {
  const raw = FENJIN_GRADE?.[gan] ?? GRADE_FB[gan] ?? '孤虚'
  return GRADE_ALIAS[raw] ?? raw
}
const gradeScore = (g) => FENJIN_SCORE?.[g] ?? GRADE_SCORE[g] ?? 0
const gradeNote = (g) => FENJIN_NOTE?.[g] ?? GRADE_NOTE[g] ?? ''

/** 分金起点度与格宽。cite: 罗盘讲解6——甲子起正针子位之初，每格三度，六十甲子倍之为一百二十 */
const FJ_START = Number.isFinite(FENJIN_START_DEG) ? FENJIN_START_DEG : 352.5
const FJ_STEP = Number.isFinite(FENJIN_STEP) && FENJIN_STEP > 0 ? FENJIN_STEP : 3

/** 十二地支（判某山是否为支山）。 */
const ZHI_SET = new Set(ZHI)

/**
 * 某山的五位分金**干支名**。
 *
 * · 地支山：直接取 {@link FENJIN_ANCHOR}（规则①精确复现，已逐字校验）。
 * · 八干四维山：无查到的独立原文可依，按同一张锚点表**连续排布**
 *   （自子山序列起算，按山序 5 位一续），并在 `detail.未核实` 明写。
 *
 * @param {string} shan 二十四山之一。
 * @param {number} i 山序（0 = 子）。
 * @returns {string[]} 五个干支名。
 */
function fenjinNames(shan, i) {
  if (ZHI_SET.has(shan) && FENJIN_ANCHOR[shan]) return FENJIN_ANCHOR[shan].slice()
  // 干维山：自子山锚点起连续 5 位一续（甲子序列首尾相接）
  const base = 5 * i
  return Array.from({ length: 5 }, (_, j) => ganzhiOf(base + j))
}

/**
 * 某山的五分金（一百二十分金）。
 *
 * 排布：二十四山每山五位、每位 3°，本山范围内连续；甲子起子山起点（352.5°）顺行六十甲子两轮，共 120 位。
 * 等级：**只由该格天干定**（丙丁庚辛旺相、甲壬阳孤、乙癸阴虚、戊己龟甲空亡）——歌诀如此，故此处不另设规则。
 *
 * ⚠ 逐格干支名（尤其八干四维山）未能与某一原表逐字对校；见族内 `FENJIN_ANCHOR` 的说明与本文件头。
 *
 * cite: 琴鹤堂国学《地盘正针一百二十分金歌解》 https://www.sohu.com/a/1015367722_100084723 ；
 *       罗盘讲解6《三合盘-正针百二十龙》 https://www.sohu.com/a/348732350_435999
 * @param {string} shan 二十四山之一。
 * @returns {Array<{gz:string, gan:string, zhi:string, grade:string, kind:string, score:number, nayin:string, from:number, to:number, slot:number, center:boolean, verified:boolean}>} 五个分金。
 */
function fenjinOf(shan) {
  const i = SHAN_INDEX[shan] ?? 0
  const names = fenjinNames(shan, i)
  const verified = ZHI_SET.has(shan)
  const out = []
  const c = degOf(shan)
  for (let j = 0; j < 5; j += 1) {
    const gz = names[j] ?? ganzhiOf(5 * i + j)
    const gan = gz[0]
    const grade = gradeOf(gan)
    // 五位等分本山 15°：位 j 的中心 = 山中心 + (j−2)×3
    const mid = mod(c + (j - 2) * 3, 360)
    out.push({
      gz,
      gan,
      zhi: gz[1],
      grade,
      kind: GU_XU_KIND[gan] ?? grade,
      score: gradeScore(grade),
      nayin: nayinOf(gz),
      from: mod(mid - 1.5, 360),
      to: mod(mid + 1.5, 360),
      mid,
      slot: j + 1,
      center: j === 2,
      verified,
    })
  }
  return out
}

/** 分金表 → 可读串。 */
const fenjinText = (list) => list.map((f) => `${f.gz}(${f.grade}·${f.nayin}·${f.from}°~${f.to}°)`).join(' ')

// ═══════════════════════════════════════════════════════════════════
// 引擎实现（10 法）
// ═══════════════════════════════════════════════════════════════════

export const engines = {
  // ── 73 八宅明镜 ──
  /**
   * 东四命西四命判法 + 大游年九星吉凶方位表 + 门主灶相生克（门向所临之星、命卦所临之星、宅卦月令旺衰）。
   * @param {object} chart 盘基。
   * @param {object} entry 条目。
   * @param {import('../core/kit.js').Rand} rand 随机源。
   * @returns {object} 结果。
   */
  bazhai(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const zhai = palaceOf(or.zuo)                 // 宅卦 = 坐山所属卦
    const ming = mingGuaOf(chart)                 // 命卦
    const yn = youNianOf(zhai)                    // 大游年九星方位表（宅卦翻卦）
    const menGua = palaceOf(or.xiang)             // 门 = 向首
    const menStar = yn[menGua] ?? '伏位'
    const mingStar = yn[ming.gua] ?? '伏位'
    const compat = eastWestOf(zhai) === eastWestOf(ming.gua)

    const zhaiWx = guaWxOf(or.zuo)
    const ws = wangShuai(zhaiWx, chart?.monthWx ?? '土')

    let score = compat ? 42 : -38
    score += starScore(menStar) * 0.32
    score += starScore(mingStar) * 0.22
    score += (ws.score - 55) * 0.3
    score = clamp(score, -100, 100)

    const notes = []
    if (or.note) notes.push(or.note)
    if (ming.approx) notes.push(`命卦取法：${ming.from}，属近似`)
    notes.push('八宅以宅卦（坐山）翻大游年定八宫九星；门向所临之星与命卦所临之星并重。东四命宜居东四宅，西四命宜居西四宅。')

    const timing = (() => {
      const s = seasonOf(guaWxOf(or.xiang))
      return s ? `门方属${guaWxOf(or.xiang)}，应于${s.text}（${s.season}）` : null
    })()

    return {
      score,
      essence: `宅卦${zhai}·命卦${ming.gua}（${eastWestOf(ming.gua)}命）门临${menStar}${compat ? '·命宅相配' : '·命宅相违'}`,
      keys: [`宅${zhai}`, `命${ming.gua}`, `${eastWestOf(zhai)}宅`, menStar, mingStar, compat ? '命宅相配' : '命宅相违'],
      wuxing: wxSignal([[zhaiWx, 2], [guaWxOf(or.xiang), 1], [chart?.monthWx, 1]]),
      timing,
      fidelity: fidOf(entry, or, ming.approx),
      detail: {
        坐向: orText(or),
        宅卦: `${zhai}（${eastWestOf(zhai)}宅·${zhaiWx}·月令为${ws.state}）`,
        命卦: `${ming.gua}（${eastWestOf(ming.gua)}命）— ${ming.from}`,
        命宅相配: compat ? '相配（命宅同东西四，吉）' : '不相配（命宅异东西四，凶）',
        门位: `向首${or.xiang}属${menGua}宫，游年得「${menStar}」（${starScore(menStar)} 分）`,
        命卦方位: `${ming.gua}宫游年得「${mingStar}」（${starScore(mingStar)} 分）`,
        游年九星方位表: youNianText(yn),
        八星对应: '伏位=辅弼 生气=贪狼 延年=武曲 天医=巨门 绝命=破军 五鬼=廉贞 六煞=文曲 祸害=禄存',
        断: compat
          ? `${eastWestOf(ming.gua)}命居${eastWestOf(zhai)}宅，命宅一气；门临${menStar}，${starScore(menStar) >= 60 ? '纳吉气' : starScore(menStar) >= 0 ? '气平' : '纳凶气'}`
          : `${eastWestOf(ming.gua)}命居${eastWestOf(zhai)}宅，命宅相违，纵门星吉亦难全美`,
        说明: notes.join(' '),
        cite: [CITE.八宅, CITE.东西四, CITE.命卦],
        evidence: [
          evidence('宅卦取坐山所属后天八卦', `坐${or.zuo} → ${zhai}宫 → 伏位卦`, `游年由此翻出八宫九星`),
          evidence('大游年歌配宫（首字为伏位卦，余七字依次配后天八卦自伏位之后一位起的七宫）', `BAZHAI_SONG.${zhai} = 「${BAZHAI_SONG?.[zhai] ?? BAZHAI_SONG_FB[zhai]}」 → ${youNianText(yn)}`, `门临${menStar}(${starScore(menStar)})、命临${mingStar}(${starScore(mingStar)})`),
          evidence('命卦起例（男 (100−年末两位) mod 9、女 (年末两位+5) mod 9；余五男坤女艮）', `${ming.from} → ${ming.gua}（${eastWestOf(ming.gua)}命）`, compat ? '+42（命宅相配）' : '−38（命宅相违）'),
          evidence('宅卦五行月令旺衰', `坐卦${zhaiWx}于${chart?.monthWx ?? '—'}月为「${ws.state}」`, `(${ws.score}−55)×0.3 = ${((ws.score - 55) * 0.3).toFixed(1)}`),
        ],
      },
    }
  },

  // ── 74 玄空·运盘 ──
  /**
   * 三元九运时间表 + 运星入中飞布 + 坐向宫得气 + 三元零正。
   * @param {object} chart 盘基。
   * @param {object} entry 条目。
   * @param {import('../core/kit.js').Rand} rand 随机源。
   * @returns {object} 结果。
   */
  xuankongYun(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const y = yunOf(chart?.solar?.y ?? 2024)
    const pan = flyPan(y.yun, true)
    const zuoPalace = palaceOf(or.zuo)
    const xiangPalace = palaceOf(or.xiang)
    const qZuo = yunQiOf(pan[zuoPalace], y.yun)
    const qXiang = yunQiOf(pan[xiangPalace], y.yun)
    const qZhong = yunQiOf(pan.中, y.yun)
    const lz = lingZhengOf(y.yun)

    let score = 0.42 * qZuo.score + 0.42 * qXiang.score + 0.16 * qZhong.score
    if (lz.zheng && zuoPalace === lz.zheng) score += 14
    if (lz.ling && xiangPalace === lz.ling) score += 14
    if (lz.zheng && xiangPalace === lz.zheng) score -= 12
    if (lz.ling && zuoPalace === lz.ling) score -= 12
    score = clamp(score, -100, 100)

    const nextYun = mod(y.yun, 9) + 1
    const notes = []
    if (or.note) notes.push(or.note)
    notes.push(`三元九运：${YUN_START} 年起一运、每运 ${YUN_SPAN} 年；运盘为当运星入中顺飞（中→乾→兑→艮→离→坎→坤→震→巽）。按公元年 1 月 1 日分界（非立春分界）。`)

    return {
      score,
      essence: `${y.yun}运（${y.yuan}）·坐${zuoPalace}${starName(pan[zuoPalace])}${qZuo.name}·向${xiangPalace}${starName(pan[xiangPalace])}${qXiang.name}`,
      keys: [`${y.yun}运`, y.yuan, `${qZuo.name}到坐`, `${qXiang.name}到向`, lz.zheng ? `正神${lz.zheng}` : '五运无零正'],
      wuxing: wxSignal([[starWx(pan[zuoPalace]), 2], [starWx(pan[xiangPalace]), 2], [chart?.monthWx, 1]]),
      timing: `${y.end + 1}年交${nextYun}运`,
      fidelity: fidOf(entry, or),
      detail: {
        坐向: orText(or),
        当运: `${y.yun}运（${y.yuan}）${y.start}–${y.end} 年`,
        运盘: panText(pan),
        坐山宫: `${zuoPalace}宫得${starName(pan[zuoPalace])}（${starWx(pan[zuoPalace])}）·${qZuo.name}`,
        向首宫: `${xiangPalace}宫得${starName(pan[xiangPalace])}（${starWx(pan[xiangPalace])}）·${qXiang.name}`,
        中宫: `${starName(pan.中)}（当运星入中，${qZhong.name}）`,
        三元零正: lz.zheng ? `正神在${lz.zheng}（宜山宜高），零神在${lz.ling}（宜水宜低）` : '五运居中，零正寄坤艮，此盘不判',
        三元九运表: (Array.isArray(XUANKONG_YUN) && XUANKONG_YUN.length >= 9 ? XUANKONG_YUN : YUN_FB).map((r) => `${r.yun}运${r.from}-${r.to}(${r.yuan})`).join(' '),
        断: `坐山宫${qZuo.name}、向首宫${qXiang.name}；${qZuo.score + qXiang.score >= 90 ? '坐向皆得生旺，当运可用' : qZuo.score + qXiang.score >= 0 ? '坐向气平，需配合形峦' : '坐向落衰死，宜待运或改造'}；${y.end + 1}年交${nextYun}运，气数将变`,
        说明: notes.join(' '),
        cite: [CITE.三元九运, CITE.飞星, CITE.零正],
        evidence: [
          evidence('三元九运（1864 甲子起一运、每运二十年）', `求占年 ${chart?.solar?.y ?? '—'} → ${y.yun}运（${y.yuan}）${y.start}–${y.end}（取法：${y.from}）`, `当运星 ${y.yun} 入中`),
          evidence('运盘飞布（当运星入中顺飞，洛书轨迹）', `${panText(pan)}`, `坐山宫${zuoPalace}=${pan[zuoPalace]}、向首宫${xiangPalace}=${pan[xiangPalace]}`),
          evidence('生旺退死（当运者旺、将来者生、已过者退、久过者死）', `坐山宫${qZuo.name}(${qZuo.score})、向首宫${qXiang.name}(${qXiang.score})、中宫${qZhong.name}(${qZhong.score})`, `0.42×${qZuo.score}+0.42×${qXiang.score}+0.16×${qZhong.score}`),
          evidence('三元零正（正神＝当运星之后天卦、零神＝其对宫）', lz.zheng ? `正神${lz.zheng}、零神${lz.ling}；坐山宫${zuoPalace}、向首宫${xiangPalace}` : '五运无零正', `零正得位 +14、失位 −12`),
        ],
      },
    }
  },

  // ── 75 玄空·山向飞星 ──
  /**
   * 山星向星飞布 + 旺山旺向 / 上山下水判定 + 兼向替卦（无原表，如实降级）。
   * @param {object} chart 盘基。
   * @param {object} entry 条目。
   * @param {import('../core/kit.js').Rand} rand 随机源。
   * @returns {object} 结果。
   */
  xuankongShanXiang(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const y = yunOf(chart?.solar?.y ?? 2024)
    const yunPan = flyPan(y.yun, true)
    const zuoPalace = palaceOf(or.zuo)
    const xiangPalace = palaceOf(or.xiang)

    const ns = yunPan[zuoPalace]                 // 山星入中数 = 运盘坐山宫之数
    const nw = yunPan[xiangPalace]               // 向星入中数 = 运盘向首宫之数
    const zuoFwd = isYangShan(or.zuo)            // 三元龙阴阳：阳顺阴逆
    const xiangFwd = isYangShan(or.xiang)
    const shanPan = flyPan(ns, zuoFwd)
    const xiangPan = flyPan(nw, xiangFwd)

    const wangShan = shanPan[zuoPalace] === y.yun
    const wangXiang = xiangPan[xiangPalace] === y.yun

    let score = 0
    if (wangShan && wangXiang) score += 55
    else if (wangShan || wangXiang) score += 18
    else score -= 45
    score += simQiScore(shanPan[zuoPalace], y.yun) * 0.22
    score += simQiScore(xiangPan[xiangPalace], y.yun) * 0.22
    score += (wangShuai(guaWxOf(or.zuo), chart?.monthWx ?? '土').score - 55) * 0.3
    score += (wangShuai(guaWxOf(or.xiang), chart?.monthWx ?? '土').score - 55) * 0.3
    score = clamp(score, -100, 100)

    const pattern = wangShan && wangXiang ? '旺山旺向（到山到向）'
      : (!wangShan && !wangXiang) ? '上山下水'
        : (wangShan ? '旺山不旺向' : '旺向不旺山')

    const jian = jianXiangOf(or.zuo)
    const notes = []
    if (or.note) notes.push(or.note)
    notes.push(`山星入中=${ns}（坐山宫运盘数），向星入中=${nw}（向首宫运盘数）；顺逆取三元龙阴阳：坐山${or.zuo}属${yuanLongOf(or.zuo)}为${zuoFwd ? '阳→顺飞' : '阴→逆飞'}，向首${or.xiang}属${yuanLongOf(or.xiang)}为${xiangFwd ? '阳→顺飞' : '阴→逆飞'}。`)
    notes.push('旺山旺向判定：山星盘中坐山宫之星为当运星（山星到山）、向星盘中向首宫之星为当运星（向星到向），二者兼备为旺山旺向，皆不备为上山下水。')
    notes.push(`${jian.note}。`)

    return {
      score,
      essence: `${or.zuo}山${or.xiang}向·${y.yun}运·山${ns}向${nw}·${pattern}`,
      keys: [`${y.yun}运`, pattern, `山星${ns}`, `向星${nw}`, wangShan ? '山星到山' : '山星不到山', wangXiang ? '向星到向' : '向星不到向'],
      wuxing: wxSignal([[starWx(shanPan[zuoPalace]), 2], [starWx(xiangPan[xiangPalace]), 2], [chart?.monthWx, 1]]),
      timing: (() => {
        const s = seasonOf(starWx(y.yun))
        return s ? `当运星${starName(y.yun)}属${starWx(y.yun)}，应于${s.text}（${s.season}）` : null
      })(),
      fidelity: fidOf(entry, or, jian.jian),
      detail: {
        坐向: orText(or),
        当运: `${y.yun}运（${y.yuan}）`,
        运盘: panText(yunPan),
        山星盘: `${panText(shanPan)}（入中${ns}，${zuoFwd ? '顺飞' : '逆飞'}）`,
        向星盘: `${panText(xiangPan)}（入中${nw}，${xiangFwd ? '顺飞' : '逆飞'}）`,
        坐山宫: `山星${starName(shanPan[zuoPalace])} 向星${starName(xiangPan[zuoPalace])}`,
        向首宫: `山星${starName(shanPan[xiangPalace])} 向星${starName(xiangPan[xiangPalace])}`,
        格局: pattern,
        替卦: jian.jian
          ? '本盘为兼向，须起替卦，而本插件无替卦原表（tables.XUANKONG_TIGUA 故意留空），故仍按下卦（正卦）飞布'
          : '正针下卦（非兼向），不需替卦',
        未核实: '⚠ 兼向替卦（起星）各谱（《沈氏玄空学》与中州派、无常派）取替规则互异，本插件无可核原表，**不编造替卦数**；兼向之盘仅供参考，不可据此断吉凶',
        断: wangShan && wangXiang
          ? '山星到山、向星到向，人丁财禄两旺，为当运首选之局'
          : (!wangShan && !wangXiang)
            ? '山上龙神下水、水里龙神上山，丁财两败，宜以形峦裁剪或换运再议'
            : '一旺一衰，偏于丁或偏于财，宜补其不足之处',
        说明: notes.join(' '),
        cite: [CITE.三元九运, CITE.飞星, CITE.三元龙, CITE.替卦],
        evidence: [
          evidence('山星入中数＝运盘在坐山宫之数；向星入中数＝运盘在向首宫之数', `运盘${zuoPalace}=${ns}（山星入中）、${xiangPalace}=${nw}（向星入中）`, '定山向两盘的入中之数'),
          evidence('三元龙阴阳定顺逆（八干四维阳顺、十二地支阴逆）', `坐山${or.zuo}（${yuanLongOf(or.zuo)}·${zuoFwd ? '阳' : '阴'}）${zuoFwd ? '顺' : '逆'}飞；向首${or.xiang}（${yuanLongOf(or.xiang)}·${xiangFwd ? '阳' : '阴'}）${xiangFwd ? '顺' : '逆'}飞`, `山星盘坐山宫=${shanPan[zuoPalace]}、向星盘向首宫=${xiangPan[xiangPalace]}`),
          evidence('旺山旺向／上山下水判定', `坐山宫山星${shanPan[zuoPalace]}${wangShan ? '＝' : '≠'}当运${y.yun}；向首宫向星${xiangPan[xiangPalace]}${wangXiang ? '＝' : '≠'}当运${y.yun}`, `→ ${pattern}（${wangShan && wangXiang ? '+55' : wangShan || wangXiang ? '+18' : '−45'}）`),
          evidence('兼向判定（正针取山中心，偏移 3°~7.5° 为兼向）', `${or.zuo}山中心 ${degOf(or.zuo)}°，本盘正针偏移 ${jian.offset}° → ${jian.jian ? '兼向' : '下卦'}`, jian.jian ? '须替卦但无原表 → fidelity 降 approx' : '不需替卦'),
        ],
      },
    }
  },

  // ── 76 三合派·二十四山 ──
  /**
   * 三合局（双山五行）+ 十二长生水法（来水宜四大吉位、去水宜衰病死墓绝）+ 墓库去水。
   * @param {object} chart 盘基。
   * @param {object} entry 条目。
   * @param {import('../core/kit.js').Rand} rand 随机源。
   * @returns {object} 结果。
   */
  sanhe(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const ju = shuangWxOf(or.xiang)                        // 以向首双山定局
    const juShuang = shuangNameOf(or.xiang)
    const zuoCs = changShengShan(or.zuo, ju)               // 坐山（入首龙）在该局的长生位
    const xiangCs = changShengShan(or.xiang, ju)
    const zuoScore = csScore(zuoCs)
    const xiangScore = csScore(xiangCs)
    const ws = wangShuai(ju, chart?.monthWx ?? '土')

    // 来水（按坐方来）宜吉位；去水（按向方去）宜凶位。
    let score = 0.5 * zuoScore + 0.3 * -xiangScore + 0.2 * (ws.score - 55)
    if (isJiShui(zuoCs)) score += 8
    if (!isJiShui(xiangCs)) score += 6
    score = clamp(score, -100, 100)

    const mu = JU_MU?.[ju] ?? JU_MU_FB[ju] ?? '—'
    const muZhi = mu[1] ?? ''

    const notes = []
    if (or.note) notes.push(or.note)
    notes.push('⚠ 水口方位未提供，本盘按「水自坐山方来、向首方去」的公开简化口径取值；实际应以实测水口与来去水方位核对。')
    notes.push('三合局：申子辰水、亥卯未木、寅午戌火、巳酉丑金；双山五行每两山一局（坤壬乙辰水、艮丙辛戌火、巽庚癸丑金、乾甲丁未木）。以向首双山定局、坐山为入首龙，顺排十二长生。')

    return {
      score,
      essence: `${ju}局·坐${or.zuo}${zuoCs} 向${or.xiang}${xiangCs}（水出${mu}）`,
      keys: [`${ju}局`, `坐${zuoCs}`, `向${xiangCs}`, isJiShui(zuoCs) ? '龙得吉位' : '龙失吉位', `水出${mu}`],
      wuxing: wxSignal([[ju, 3], [chart?.monthWx, 1]]),
      timing: `${ju}局墓库在${mu}，应于${muZhi}月`,
      fidelity: fidOf(entry, or),
      detail: {
        坐向: orText(or),
        三合局: `${ju}局（向首${or.xiang}属${juShuang}·${ju}）`,
        双山: `坐山双山${shuangNameOf(or.zuo)}（${shuangWxOf(or.zuo)}）·向首双山${juShuang}（${ju}）`,
        坐山长生: `${or.zuo}（${shuangNameOf(or.zuo)}）在${ju}局为「${zuoCs}」（${zuoScore >= 70 ? '吉' : zuoScore >= 0 ? '平' : '凶'}）`,
        向首长生: `${or.xiang}（${juShuang}）在${ju}局为「${xiangCs}」（去水宜凶，${xiangScore <= 0 ? '合宜' : '不宜'}）`,
        局旺衰: `${ju}于${chart?.monthWx ?? '—'}月为「${ws.state}」`,
        墓库: `${mu}（去水宜出此方）`,
        帝旺: JU_DIWANG?.[ju] ?? JU_DIWANG_FB[ju] ?? '—',
        十二长生盘: juPanText(ju),
        断: isJiShui(zuoCs)
          ? `来龙（坐山）得${zuoCs}吉位，去水出${mu}墓库，三合联珠之象`
          : `来龙（坐山）落${zuoCs}，龙气不足；去水出${mu}${xiangScore <= 0 ? '尚合' : '，水法欠妥'}`,
        说明: notes.join(' '),
        cite: [CITE.三合, CITE.长生],
        evidence: [
          evidence('双山五行定局（以向首双山定局）', `向首${or.xiang}属双山${juShuang} → ${ju}局`, '局定则十二长生位定'),
          evidence('十二长生水法（阳局顺行，长生起艮寅/坤申/乾亥/巽巳）', `坐山${or.zuo}（${shuangNameOf(or.zuo)}）→ ${zuoCs}(${zuoScore})；向首${or.xiang}（${juShuang}）→ ${xiangCs}(${xiangScore})`, `0.5×${zuoScore}+0.3×${-xiangScore}+0.2×(${ws.score}−55)`),
          evidence('四大吉水与去水取反（长生冠带临官帝旺为吉，衰病死墓绝宜去水）', `来水${zuoCs}${isJiShui(zuoCs) ? '吉' : '非吉'}、去水${xiangCs}${isJiShui(xiangCs) ? '吉（去水不宜）' : '非吉（去水合宜）'}`, `${isJiShui(zuoCs) ? '+8' : '0'} / ${!isJiShui(xiangCs) ? '+6' : '0'}`),
        ],
      },
    }
  },

  // ── 77 三元派·三般卦 ──
  /**
   * 三般卦（父母 / 连珠 / 半合）+ 三元零正得失。
   * @param {object} chart 盘基。
   * @param {object} entry 条目。
   * @param {import('../core/kit.js').Rand} rand 随机源。
   * @returns {object} 结果。
   */
  sanyuan(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const y = yunOf(chart?.solar?.y ?? 2024)
    const yunPan = flyPan(y.yun, true)
    const zuoPalace = palaceOf(or.zuo)
    const xiangPalace = palaceOf(or.xiang)
    const ns = yunPan[zuoPalace]
    const nw = yunPan[xiangPalace]

    // 三般卦分组：1-4-7 / 2-5-8 / 3-6-9
    const groupOf = (n) => mod(Number(n) - 1, 3)
    const gName = ['一四七', '二五八', '三六九']
    const gY = groupOf(y.yun)
    const gS = groupOf(ns)
    const gX = groupOf(nw)
    let guaKind = '不成三般卦'
    let guaScore = 0
    if (gY === gS && gS === gX) { guaKind = '父母三般卦'; guaScore = 90 }
    else if (gS === gX) { guaKind = '连珠三般卦'; guaScore = 60 }
    else if (gY === gS || gY === gX) { guaKind = '半合三般卦'; guaScore = 30 }

    const lz = lingZhengOf(y.yun)
    const zhengDeShan = !!lz.zheng && zuoPalace === lz.zheng
    const lingDeShui = !!lz.ling && xiangPalace === lz.ling
    const lzScore = (zhengDeShan ? 40 : -25) + (lingDeShui ? 40 : -25)

    const ws = wangShuai(guaWxOf(or.zuo), chart?.monthWx ?? '土')
    const score = clamp(0.45 * guaScore + 0.55 * lzScore + (ws.score - 55) * 0.2, -100, 100)

    const lingWx = lz.ling ? guaWx(lz.ling) : null

    const notes = []
    if (or.note) notes.push(or.note)
    notes.push('三般卦按公开分组 1-4-7／2-5-8／3-6-9：运星、山星、向星三数同组为父母三般卦，山向两星同组为连珠三般卦，仅两数同组为半合。')
    notes.push('⚠ 各派对三般卦的成立条件（是否须同宫相连、是否兼看零正）说法不一，本盘取上述可复核的取值法，故本条 fidelity 标 approx。')

    return {
      score,
      essence: `${guaKind}（${gName[gY]}）·${y.yun}运山${ns}向${nw}·零正${zhengDeShan && lingDeShui ? '得位' : '有失'}`,
      keys: [guaKind, gName[gY], `山${ns}`, `向${nw}`, zhengDeShan ? '正神得山' : '正神失位', lingDeShui ? '零神得水' : '零神失位'],
      wuxing: wxSignal([[guaWxOf(or.zuo), 2], [guaWxOf(or.xiang), 1], [chart?.monthWx, 1]]),
      timing: lingWx ? (() => {
        const s = seasonOf(lingWx)
        return s ? `零神方属${lingWx}，应于${s.text}（${s.season}）` : null
      })() : null,
      fidelity: fidOf(entry, or, true),
      detail: {
        坐向: orText(or),
        三元: `${y.yun}运（${y.yuan}）`,
        三数: `运星${y.yun}、山星${ns}（＝运盘${zuoPalace}宫）、向星${nw}（＝运盘${xiangPalace}宫）`,
        三般卦: `${guaKind}（运星属${gName[gY]}，山星属${gName[gS]}，向星属${gName[gX]}）`,
        三元零正: lz.zheng ? `正神${lz.zheng}（宜山）、零神${lz.ling}（宜水）` : '五运无零正',
        零正得失: `坐山宫${zuoPalace}${zhengDeShan ? '得正神' : '非正神'}；向首宫${xiangPalace}${lingDeShui ? '得零神' : '非零神'}`,
        运盘: panText(yunPan),
        断: `${guaKind}；${zhengDeShan && lingDeShui ? '正神得山、零神得水，三元不败之局' : zhengDeShan || lingDeShui ? '零正只得其一，福力减半' : '零正两失，宜改向或待运'}；坐山${guaWxOf(or.zuo)}于月令为「${ws.state}」`,
        说明: notes.join(' '),
        cite: [CITE.三元九运, CITE.飞星, CITE.零正],
        evidence: [
          evidence('三般卦分组（1-4-7／2-5-8／3-6-9，取三数同余类）', `运星${y.yun}∈${gName[gY]}、山星${ns}∈${gName[gS]}、向星${nw}∈${gName[gX]}`, `→ ${guaKind}（${guaScore}）`),
          evidence('三元零正得失（正神宜山、零神宜水）', lz.zheng ? `正神${lz.zheng}${zhengDeShan ? '＝' : '≠'}坐山宫${zuoPalace}；零神${lz.ling}${lingDeShui ? '＝' : '≠'}向首宫${xiangPalace}` : '五运无零正', `零正分 ${lzScore}（各 ±40／−25）`),
          evidence('坐卦五行月令旺衰', `坐卦${guaWxOf(or.zuo)}于${chart?.monthWx ?? '—'}月为「${ws.state}」`, `(${ws.score}−55)×0.2`),
        ],
      },
    }
  },

  // ── 78 九星水法 ──
  /**
   * 辅星水法八星翻卦（以向首卦起辅弼）+ 二十四山辅星盘 + 来去水吉凶。
   * @param {object} chart 盘基。
   * @param {object} entry 条目。
   * @param {import('../core/kit.js').Rand} rand 随机源。
   * @returns {object} 结果。
   */
  jiuxingShuiFa(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const xiangGua = palaceOf(or.xiang)
    const zuoGua = palaceOf(or.zuo)
    // 八星翻卦：以向首卦起辅弼（伏位），八星名与八宅游年九星同源。
    const yn = youNianOf(xiangGua)
    const zuoStar = toFuXing(yn[zuoGua] ?? '伏位')
    const xiangStar = toFuXing(yn[xiangGua] ?? '伏位')
    const zuoScore = fuScore(zuoStar)
    const xiangScore = fuScore(xiangStar)
    // 二十四山辅星盘（口诀「辅武破廉贪巨禄文」，净阴净阳顺逆）
    const pan = fuXingPan(or.xiang)
    const shanStar = pan[or.zuo] ?? '辅弼'
    const shanScore = fuScore(shanStar)

    const wx = fuWx(shanStar)
    const ws = wangShuai(wx, chart?.monthWx ?? '土')

    const score = clamp(0.6 * zuoScore + 0.2 * shanScore + 0.2 * (ws.score - 55) - 18, -100, 100)

    const notes = []
    if (or.note) notes.push(or.note)
    notes.push('⚠ 水口方位未提供：本盘以坐山方为「来水／来龙」、向首方为「去水」。来水宜贪狼巨门武曲辅弼，去水宜破军禄存文曲廉贞；因起卦以向首为辅弼，去水方恒得吉星，故统一减分。实际请按实测水口方位在下表核对。')
    notes.push('主判取八星翻卦（以向首卦起辅弼，星名与八宅游年同源：辅弼=伏位、武曲=延年、贪狼=生气、巨门=天医、禄存=祸害、文曲=六煞、廉贞=五鬼、破军=绝命）。')
    notes.push('另附二十四山辅星盘，取口诀「辅武破廉贪巨禄文」，依净阴净阳（阳顺阴逆）每山一星、循环三周；⚠ 各派辅星排法起甲不同，故本条 fidelity 标 approx。')

    return {
      score,
      essence: `坐${or.zuo}${zuoStar}·向${or.xiang}${xiangStar}（来水${fuJi(zuoStar) ? '吉星' : '凶星'}）`,
      keys: [`坐${zuoStar}`, `向${xiangStar}`, fuJi(zuoStar) ? '来水吉星' : '来水凶星', fuJi(xiangStar) ? '去水吉星' : '去水凶星', `山盘${shanStar}`],
      wuxing: wxSignal([[wx, 2], [chart?.monthWx, 1]]),
      timing: (() => {
        const s = seasonOf(wx)
        return s ? `坐山星属${wx}，应于${s.text}（${s.season}）` : null
      })(),
      fidelity: fidOf(entry, or, true),
      detail: {
        坐向: orText(or),
        八星翻卦: `以向首${xiangGua}卦起辅弼，翻得：${YOU_NIAN_SEQ.map((g) => `${g}${toFuXing(yn[g] ?? '伏位')}`).join(' ')}`,
        坐山星: `${or.zuo}（${zuoGua}宫）得「${zuoStar}」（${zuoScore} 分，${fuJi(zuoStar) ? '吉星' : '凶星'}）`,
        向首星: `${or.xiang}（${xiangGua}宫）得「${xiangStar}」（${xiangScore} 分，${fuJi(xiangStar) ? '吉星' : '凶星'}）`,
        二十四山辅星盘: fuXingText(pan),
        坐山辅星: `${or.zuo}在辅星盘得「${shanStar}」（${shanScore} 分，属${wx}·${ws.state}）`,
        断: fuJi(zuoStar)
          ? `来水得${zuoStar}吉星，水聚生财；去水临${xiangStar}${fuJi(xiangStar) ? '（吉星，去水不宜，主财来财去）' : '（凶星，去水合宜，煞随水去）'}`
          : `来水得${zuoStar}凶星，主破耗疾病；去水临${xiangStar}${fuJi(xiangStar) ? '（吉星，吉水外流，财不聚）' : '（凶星，去水合宜）'}`,
        说明: notes.join(' '),
        cite: [CITE.辅星, CITE.八宅],
        evidence: [
          evidence('八星翻卦（以向首卦起辅弼＝伏位，星名与八宅游年同源）', `向首${xiangGua}卦起辅弼 → 坐山${zuoGua}宫得${zuoStar}(${zuoScore})、向首${xiangGua}宫得${xiangStar}(${xiangScore})`, `0.6×${zuoScore}+0.2×${shanScore}+0.2×(${ws.score}−55)−18`),
          evidence('八星吉凶归类（辅弼武曲贪狼巨门吉，破军禄存文曲廉贞凶）', `来水${zuoStar}${fuJi(zuoStar) ? '吉' : '凶'}、去水${xiangStar}${fuJi(xiangStar) ? '吉（去水不宜）' : '凶（去水合宜）'}`, '来水宜吉、去水宜凶'),
          evidence('二十四山辅星盘（口诀辅武破廉贪巨禄文，净阴净阳阳顺阴逆，每山一星循环三周）', `向首${or.xiang}（${isJingYang(or.xiang) ? '净阳→顺行' : '净阴→逆行'}）起辅弼 → 坐山${or.zuo}得${shanStar}`, `坐山辅星属${wx}·${ws.state} → (${ws.score}−55)×0.2`),
        ],
      },
    }
  },

  // ── 79 阳宅三要 ──
  /**
   * 门（向首）／主（坐山）／灶（门卦游年生气方）三者的五行生克 + 命宅相配。
   * @param {object} chart 盘基。
   * @param {object} entry 条目。
   * @param {import('../core/kit.js').Rand} rand 随机源。
   * @returns {object} 结果。
   */
  yangzhai(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const menGua = palaceOf(or.xiang)
    const zhuGua = palaceOf(or.zuo)
    const yn = youNianOf(menGua)
    const zaoGua = Object.keys(yn).find((g) => yn[g] === '生气') ?? menGua

    const menWx = guaWx(menGua)
    const zhuWx = guaWx(zhuGua)
    const zaoWx = guaWx(zaoGua)

    const r1 = relation(menWx, zhuWx)  // 门 → 主
    const r2 = relation(zhuWx, zaoWx)  // 主 → 灶
    const r3 = relation(zaoWx, menWx)  // 灶 → 门
    const bias = { 生我: 75, 我生: 65, 比和: 45, 我克: -35, 克我: -55 }
    const relScore = (r) => bias[r] ?? 0

    const allSheng = [r1, r2, r3].every((r) => r === '生我' || r === '我生' || r === '比和')
    const allKe = [r1, r2, r3].every((r) => r === '我克' || r === '克我')
    let score = (relScore(r1) + relScore(r2) + relScore(r3)) / 3
    if (allSheng) score += 12
    if (allKe) score -= 12
    const ming = mingGuaOf(chart)
    const mingMatch = eastWestOf(zhuGua) === eastWestOf(ming.gua)
    score += mingMatch ? 8 : -8
    score = clamp(score, -100, 100)

    const notes = []
    if (or.note) notes.push(or.note)
    notes.push('门、主、灶三方位：门取向首、主取坐山、灶取门卦大游年「生气」方。⚠ 实际灶位与主房位置应由户型图核对，本盘为结构推断。')
    if (ming.approx) notes.push(`命卦取法：${ming.from}，属近似`)

    return {
      score,
      essence: `门${menGua}(${menWx}) 主${zhuGua}(${zhuWx}) 灶${zaoGua}(${zaoWx})·${allSheng ? '三要相生' : allKe ? '三要相克' : '生克互见'}`,
      keys: [`门${menGua}`, `主${zhuGua}`, `灶${zaoGua}`, allSheng ? '三要相生' : allKe ? '三要相克' : '生克互见', r1, r2],
      wuxing: wxSignal([[menWx, 1], [zhuWx, 1], [zaoWx, 1], [chart?.monthWx, 1]]),
      timing: (() => {
        const s = seasonOf(zaoWx)
        return s ? `灶方属${zaoWx}，应于${s.text}（${s.season}）` : null
      })(),
      fidelity: fidOf(entry, or, ming.approx),
      detail: {
        坐向: orText(or),
        门: `${or.xiang}属${menGua}宫（${menWx}·${guaDir(menGua)}）`,
        主: `${or.zuo}属${zhuGua}宫（${zhuWx}·${guaDir(zhuGua)}）`,
        灶: `${zaoGua}宫（${zaoWx}·门卦${menGua}之生气方·${guaDir(zaoGua)}）`,
        门主关系: `门${menWx} → 主${zhuWx}：${r1}`,
        主灶关系: `主${zhuWx} → 灶${zaoWx}：${r2}`,
        灶门关系: `灶${zaoWx} → 门${menWx}：${r3}`,
        命宅: `${ming.gua}（${eastWestOf(ming.gua)}命）居${eastWestOf(zhuGua)}宅，${mingMatch ? '相配' : '不相配'}`,
        游年九星方位表: youNianText(yn),
        断: allSheng
          ? '门主灶三者循环相生，人口安泰、财禄渐旺'
          : allKe
            ? '门主灶三者循环相克，主口舌疾病、财丁不聚，宜改门或移灶'
            : `三者生克互见（${r1}／${r2}／${r3}），吉凶相半，宜就凶处调理`,
        说明: notes.join(' '),
        cite: [CITE.阳宅三要, CITE.八宅, CITE.命卦],
        evidence: [
          evidence('门主灶定位（门取向首、主取坐山、灶取门卦生气方）', `门${or.xiang}→${menGua}；主${or.zuo}→${zhuGua}；门卦${menGua}翻卦生气在${zaoGua}`, `三卦五行 ${menWx}/${zhuWx}/${zaoWx}`),
          evidence('三者两两生克（生我75 我生65 比和45 我克−35 克我−55，取三者均值）', `门→主 ${r1}(${relScore(r1)})、主→灶 ${r2}(${relScore(r2)})、灶→门 ${r3}(${relScore(r3)})`, `均值 ${((relScore(r1) + relScore(r2) + relScore(r3)) / 3).toFixed(1)}${allSheng ? '，三要相生 +12' : allKe ? '，三要相克 −12' : ''}`),
          evidence('命宅东西四相配', `${ming.from} → ${ming.gua}（${eastWestOf(ming.gua)}命）vs 主卦${zhuGua}（${eastWestOf(zhuGua)}宅）`, mingMatch ? '相配 +8' : '不相配 −8'),
        ],
      },
    }
  },

  // ── 80 形势派·四灵 ──
  /**
   * 玄武（坐）／朱雀（向）／青龙（左）／白虎（右）四灵方位，以五行旺衰拟势之强弱。
   * ⚠ 无形峦实测数据，属结构性推断。
   * @param {object} chart 盘基。
   * @param {object} entry 条目。
   * @param {import('../core/kit.js').Rand} rand 随机源。
   * @returns {object} 结果。
   */
  xingshi(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const i = SHAN_INDEX[or.zuo] ?? 0
    const xuanwu = shanAt(i)            // 后（坐）
    const zhuque = shanAt(i + 12)       // 前（向）
    const qinglong = shanAt(i + 6)      // 左
    const baihu = shanAt(i + 18)        // 右

    const wxXuan = guaWxOf(xuanwu)
    const wxQing = guaWxOf(qinglong)
    const wxBai = guaWxOf(baihu)
    const wxZhu = guaWxOf(zhuque)

    const sXuan = wangShuai(wxXuan, chart?.monthWx ?? '土')
    const sQing = wangShuai(wxQing, chart?.monthWx ?? '土')
    const sBai = wangShuai(wxBai, chart?.monthWx ?? '土')
    const sZhu = wangShuai(wxZhu, chart?.monthWx ?? '土')

    const xuanPart = clamp((sXuan.score - 55) * 0.9, -50, 50)
    const d = sQing.score - sBai.score
    const longHuPart = clamp(40 - Math.abs(d - 25) * 0.8, -50, 50)        // 龙宜略强于虎
    const zhuPart = clamp(35 - Math.abs(sZhu.score - 60) * 0.6, -50, 50)  // 明堂宜开阔平和

    const relA = relation(wxXuan, wxQing)  // 后 → 左
    const relB = relation(wxQing, wxZhu)   // 左 → 前
    const flowScore = { 我生: 35, 比和: 28, 生我: 18, 我克: -12, 克我: -28 }
    const flowPart = ((flowScore[relA] ?? 0) + (flowScore[relB] ?? 0)) / 2

    const score = clamp(0.3 * xuanPart + 0.3 * longHuPart + 0.2 * zhuPart + 0.2 * flowPart, -100, 100)

    const notes = []
    if (or.note) notes.push(or.note)
    notes.push('⚠ 形峦（山体高低、水路走向、远近逼压）须实地勘察，本插件**没有形峦实测数据**：四灵只按坐向定方位，以五行旺衰拟「势」之强弱，属结构性推断，不代替现场目验。')

    return {
      score,
      essence: `玄武${xuanwu}(${sXuan.state}) 青龙${qinglong}(${sQing.state}) 白虎${baihu}(${sBai.state}) 朱雀${zhuque}(${sZhu.state})`,
      keys: [`玄武${sXuan.state}`, `青龙${sQing.state}`, `白虎${sBai.state}`, `朱雀${sZhu.state}`, d > 0 ? '龙强虎弱' : '虎强龙弱'],
      wuxing: wxSignal([[wxXuan, 1], [wxQing, 1], [wxBai, 1], [wxZhu, 1]]),
      timing: (() => {
        const s = seasonOf(wxXuan)
        return s ? `玄武靠山属${wxXuan}，应于${s.text}（${s.season}）` : null
      })(),
      fidelity: fidOf(entry, or),
      detail: {
        坐向: orText(or),
        玄武: `后·${xuanwu}（${wxXuan}·${palaceOf(xuanwu)}宫）${sXuan.state} — 宜高耸有靠`,
        朱雀: `前·${zhuque}（${wxZhu}·${palaceOf(zhuque)}宫）${sZhu.state} — 宜开阔明亮、有水有情`,
        青龙: `左·${qinglong}（${wxQing}·${palaceOf(qinglong)}宫）${sQing.state} — 宜蜿蜒略高`,
        白虎: `右·${baihu}（${wxBai}·${palaceOf(baihu)}宫）${sBai.state} — 宜低伏驯顺`,
        龙虎之势: `青龙${sQing.score} 对 白虎${sBai.score}（差 ${d > 0 ? '+' : ''}${d}）→ ${d > 40 ? '青龙过强，恐欺主' : d < 0 ? '白虎抬头，主是非破财' : '龙虎相安，龙略胜虎为佳'}`,
        五行流通: `玄武${wxXuan} → 青龙${wxQing}：${relA}；青龙${wxQing} → 朱雀${wxZhu}：${relB}`,
        断: [
          sXuan.score >= 75 ? '玄武得令，靠山有力，人丁安稳' : sXuan.score <= 40 ? '玄武失令，后靠空虚，主根基不固' : '玄武平平，后靠尚可',
          d < 0 ? '白虎强于青龙，宜于右侧植绿、减其锐气' : '青龙不弱于白虎，四灵得序',
          sZhu.score >= 75 ? '朱雀过旺，明堂有逼压之嫌' : '朱雀平和，明堂开阔',
        ].join('；'),
        说明: notes.join(' '),
        cite: [CITE.四灵],
        evidence: [
          evidence('四灵方位（玄武＝坐、朱雀＝向、青龙＝坐山＋6 山、白虎＝坐山＋18 山）', `坐${or.zuo} → 玄武${xuanwu}、朱雀${zhuque}、青龙${qinglong}、白虎${baihu}`, '四灵只定方位，不含形峦实测'),
          evidence('以五行旺衰拟四灵之势（月令旺相休囚死）', `玄武${wxXuan}${sXuan.state}(${sXuan.score})、青龙${wxQing}${sQing.state}(${sQing.score})、白虎${wxBai}${sBai.state}(${sBai.score})、朱雀${wxZhu}${sZhu.state}(${sZhu.score})`, `玄武项 ${xuanPart.toFixed(1)}、龙虎项 ${longHuPart.toFixed(1)}、朱雀项 ${zhuPart.toFixed(1)}`),
          evidence('龙宜略强于虎（龙虎分差以 +25 为最宜）', `青龙−白虎 = ${d}`, `40−|${d}−25|×0.8 = ${longHuPart.toFixed(1)}`),
          evidence('四灵五行流通（后→左→前）', `玄武${wxXuan}→青龙${wxQing}：${relA}；青龙${wxQing}→朱雀${wxZhu}：${relB}`, `流通项 ${flowPart.toFixed(1)}`),
        ],
      },
    }
  },

  // ── 81 罗盘二十四山 ──
  /**
   * 二十四山定位（每山 15°、子山中心 0°）、八卦分宫、三元龙阴阳、出卦与阴阳差错、空亡线。
   * @param {object} chart 盘基。
   * @param {object} entry 条目。
   * @param {import('../core/kit.js').Rand} rand 随机源。
   * @returns {object} 结果。
   */
  luopan(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const iz = SHAN_INDEX[or.zuo] ?? 0
    const zuoGua = palaceOf(or.zuo)
    const xiangGua = palaceOf(or.xiang)
    const zuoYuan = yuanLongOf(or.zuo)
    const xiangYuan = yuanLongOf(or.xiang)
    const chuGua = zuoYuan !== xiangYuan
    const chaCuo = isYangShan(or.zuo) !== isYangShan(or.xiang)

    // 山界空亡：界 m 位于 7.5 + 15m 度；m ≡ 1 (mod 3) 为大空亡（八宫交界），余为小空亡。
    const boundary = (mm) => ({ deg: mod(7.5 + 15 * mm, 360), big: mod(mm, 3) === 1 })
    const bl = boundary(mod(iz - 1, 24))
    const br = boundary(mod(iz, 24))
    const zuoBig = bl.big || br.big

    const zuoWx = guaWxOf(or.zuo)
    const xiangWx = guaWxOf(or.xiang)
    const ws = wangShuai(zuoWx, chart?.monthWx ?? '土')
    const rel = relation(zuoWx, xiangWx)

    let score = 30
    score += chuGua ? -30 : 12
    score += chaCuo ? -25 : 8
    if (zuoBig) score -= 8
    score += (ws.score - 55) * 0.35
    score += ({ 比和: 15, 生我: 20, 我生: 5, 我克: -5, 克我: -18 }[rel] ?? 0)
    if (!ZHI_SHAN.includes(or.zuo)) score -= 6
    score = clamp(score, -100, 100)

    const notes = []
    if (or.note) notes.push(or.note)
    notes.push('二十四山每山 15°，子山中心为正北 0°，顺时针递加。正针立向取山中心；兼针（偏 3°~7.5°）须与邻山同元龙，否则出卦。')
    notes.push('大空亡 = 八卦分界（22.5°+45k 共八线）；小空亡 = 本卦内三山交界（共十六线）。正针落山中心，距两界各 7.5°，故不犯空亡。')

    return {
      score,
      essence: `坐${or.zuo}（${degOf(or.zuo)}°·${zuoGua}宫·${zuoYuan}）向${or.xiang}（${degOf(or.xiang)}°·${xiangGua}宫）${chuGua ? '出卦' : '不出卦'}`,
      keys: [`坐${or.zuo}`, `向${or.xiang}`, `${zuoGua}宫`, zuoYuan, chuGua ? '出卦' : '不出卦', chaCuo ? '阴阳差错' : '净阴净阳'],
      wuxing: wxSignal([[zuoWx, 2], [xiangWx, 1], [chart?.monthWx, 1]]),
      timing: (() => {
        const s = seasonOf(zuoWx)
        return s ? `坐卦属${zuoWx}，应于${s.text}（${s.season}）` : null
      })(),
      fidelity: fidOf(entry, or),
      detail: {
        坐向: orText(or),
        坐山: `${or.zuo}山 ${degOf(or.zuo)}°（${mod(degOf(or.zuo) - 7.5, 360)}°~${mod(degOf(or.zuo) + 7.5, 360)}°）属${zuoGua}宫（${zuoWx}·${zuoYuan}·${isYangShan(or.zuo) ? '阳' : '阴'}）`,
        向首: `${or.xiang}山 ${degOf(or.xiang)}°属${xiangGua}宫（${xiangWx}·${xiangYuan}·${isYangShan(or.xiang) ? '阳' : '阴'}）`,
        八卦分宫: TRIGRAMS.map((t) => `${t.name}${t.dir}`).join(' '),
        本卦三山: `${zuoGua}宫管${SHAN.filter((s) => palaceOf(s) === zuoGua).join('、')}`,
        出卦差错: `坐山${zuoYuan}${isYangShan(or.zuo) ? '阳' : '阴'}，向首${xiangYuan}${isYangShan(or.xiang) ? '阳' : '阴'} → ${chuGua ? '出卦（元龙不一）' : '不出卦'}、${chaCuo ? '阴阳差错' : '净阴净阳'}`,
        空亡线: `左界 ${bl.deg}°（${bl.big ? '大空亡·八宫交界' : '小空亡·本卦三山交界'}）、右界 ${br.deg}°（${br.big ? '大空亡·八宫交界' : '小空亡·本卦三山交界'}）`,
        立向区间: `正针安全区 ${mod(degOf(or.zuo) - 3, 360)}°~${mod(degOf(or.zuo) + 3, 360)}°；超出则入兼针，须同元龙`,
        卦关系: `坐卦${zuoWx} 与 向卦${xiangWx}：${rel}`,
        断: `${chuGua ? '山向元龙不一，为出卦，主长幼失序、人丁不安' : '山向同元龙，不出卦'}；${chaCuo ? '阴阳混杂为差错，主家宅不宁' : '净阴净阳，气纯'}；坐山${zuoWx}于月令为「${ws.state}」${zuoBig ? '；两侧邻大空亡线，兼针须谨慎' : ''}`,
        说明: notes.join(' '),
        cite: [CITE.罗盘, CITE.三元龙],
        evidence: [
          evidence('二十四山定位（每山 15°，子山中心＝正北 0°）', `坐${or.zuo}=${degOf(or.zuo)}°（${zuoGua}宫）、向${or.xiang}=${degOf(or.xiang)}°（${xiangGua}宫）`, '度数决定兼针与空亡'),
          evidence('三元龙（天元＝四正四维、地元＝四孟干与四库、人元＝四生与四仲干）', `坐山${or.zuo}属${zuoYuan}、向首${or.xiang}属${xiangYuan}`, chuGua ? '出卦 −30' : '不出卦 +12'),
          evidence('净阴净阳（八干四维阳、十二地支阴）', `坐山${isYangShan(or.zuo) ? '阳' : '阴'}、向首${isYangShan(or.xiang) ? '阳' : '阴'}`, chaCuo ? '阴阳差错 −25' : '净阴净阳 +8'),
          evidence('空亡线（界 m 在 7.5+15m 度；m≡1 mod 3 为大空亡·八宫交界，余为小空亡）', `左界${bl.deg}°（${bl.big ? '大' : '小'}）、右界${br.deg}°（${br.big ? '大' : '小'}）`, zuoBig ? '邻大空亡 −8' : '不邻大空亡'),
        ],
      },
    }
  },

  // ── 82 六十甲子分金 ──
  /**
   * 一百二十分金（每山五位分金、每位 3°）：旺相／孤虚／龟甲空亡 + 分金纳音五行 + 坐卦生克。
   * @param {object} chart 盘基。
   * @param {object} entry 条目。
   * @param {import('../core/kit.js').Rand} rand 随机源。
   * @returns {object} 结果。
   */
  fenjin(chart, entry, rand) {
    const or = resolveOrientation(chart, rand)
    const zuoList = fenjinOf(or.zuo)
    const xiangList = fenjinOf(or.xiang)
    const zuoZheng = zuoList.find((f) => f.center) ?? zuoList[0]
    const xiangZheng = xiangList.find((f) => f.center) ?? xiangList[0]
    const zhengWx = nayinWx(zuoZheng?.nayin)
    const ws = wangShuai(zhengWx, chart?.monthWx ?? '土')
    const guaWxZuo = guaWxOf(or.zuo)
    const rel = relation(zhengWx, guaWxZuo)

    // 五格纳音中「生我／比和」坐卦的格数（多则助坐山）
    const helpCount = (list) => list.filter((f) => {
      const r = relation(nayinWx(f.nayin), guaWxZuo)
      return r === '生我' || r === '比和'
    }).length
    const helpZuo = helpCount(zuoList)
    const helpXiang = helpCount(xiangList)
    const kongList = zuoList.filter((f) => f.grade === '龟甲空亡')
    const wangList = zuoList.filter((f) => f.grade === '旺相')

    let score = 10
    score += gradeScore(zuoZheng?.grade)         // 正针（山中心）一格自身之等级
    score += (ws.score - 55) * 0.45
    score += ({ 生我: 20, 比和: 12, 我生: -5, 我克: -12, 克我: -25 }[rel] ?? 0)
    score += (helpZuo - 2.5) * 6
    score += (helpXiang - 2.5) * 3
    score = clamp(score, -100, 100)

    // ⚠ 实测（本表 24 山全部枚举）：十二地支山的**山中心**一格恒为龟甲空亡（子寅辰午申戌）
    //    或孤虚（丑卯巳未酉亥），**从不落旺相**；本山的两个旺相格在山中心 ±3° 或 ±6° 处。
    //    这与罗盘实物「孤虚／龟甲空亡不标注、只标丙丁庚辛」的做法一致——立向时是把线压在
    //    旺相格上，而非压在几何山中心上。此处照实输出，不把中心美化成功。
    const centerIsWang = zuoZheng?.grade === '旺相'
    const gradeTxt = centerIsWang
      ? '坐山正针（几何山中心）落旺相分金，立向可用'
      : zuoZheng?.grade === '龟甲空亡'
        ? `坐山正针（几何山中心）压龟甲空亡分金，立向大忌；本山旺相格在 ${wangList.map((f) => `${f.gz}(${f.mid}°)`).join('、')}，放线宜压旺相格而非几何中心`
        : `坐山正针（几何山中心）落孤虚分金，孤阳不生／孤阴不长，不可用；本山旺相格在 ${wangList.map((f) => `${f.gz}(${f.mid}°)`).join('、')}，放线宜压旺相格而非几何中心`

    const notes = []
    if (or.note) notes.push(or.note)
    notes.push(`一百二十分金：二十四山每山五位分金、每位 ${FJ_STEP}°，本山范围内连续；甲子起子山起点 ${FJ_START}° 顺行六十甲子两轮，共 120 位。`)
    notes.push('分类取地盘正针歌诀「甲壬阳孤乙癸虚，龟甲空亡戊己推；丙丁庚辛虽旺相，刑冲两害亦莫为」：丙丁庚辛旺相可用、甲壬乙癸孤虚不可用、戊己龟甲空亡不可用。')
    notes.push('⚠ 另有「透地六十龙」只排十二地支山（每山五龙，支同本山），与本盘排法不同派，此处不取。')

    return {
      score,
      essence: `坐${or.zuo}正针分金${zuoZheng?.gz}（${zuoZheng?.grade}·${zuoZheng?.nayin}）向${xiangZheng?.gz}`,
      keys: [`${or.zuo}山${zuoZheng?.gz}`, zuoZheng?.grade ?? '—', zuoZheng?.nayin ?? '—', `向${xiangZheng?.gz}`, `纳音${zhengWx}${ws.state}`],
      wuxing: wxSignal([[zhengWx, 3], [guaWxZuo, 1], [chart?.monthWx, 1]]),
      timing: (() => {
        const s = seasonOf(zhengWx)
        return s ? `正针分金纳音属${zhengWx}，应于${s.text}（${s.season}）` : null
      })(),
      fidelity: fidOf(entry, or),
      detail: {
        坐向: orText(or),
        正针分金: `${or.zuo}山正中 ${degOf(or.zuo)}° 落 ${zuoZheng?.gz}（${zuoZheng?.grade}·${zuoZheng?.kind}·${zuoZheng?.nayin}·${zuoZheng?.from}°~${zuoZheng?.to}°）`,
        向首分金: `${or.xiang}山正中 ${degOf(or.xiang)}° 落 ${xiangZheng?.gz}（${xiangZheng?.grade}·${xiangZheng?.kind}·${xiangZheng?.nayin}）`,
        坐山五分金: fenjinText(zuoList),
        向首五分金: fenjinText(xiangList),
        纳音五行: `${zuoZheng?.nayin}属${zhengWx}，于${chart?.monthWx ?? '—'}月为「${ws.state}」；与坐卦${guaWxZuo}关系：${rel}`,
        吉凶等级: gradeNote(zuoZheng?.grade ?? '孤虚'),
        旺相格: wangList.length > 0 ? `${or.zuo}山五位中旺相者为 ${wangList.map((f) => f.gz).join('、')}（第 ${wangList.map((f) => f.slot).join('、')} 位）` : '本山无旺相格',
        未核实: `${zuoZheng?.verified ? '本山为十二地支山，五位分金干支名与《地盘正针一百二十分金歌解》所引原文逐字一致（已机械校验）；' : '⚠ 本山为八干四维山，可查来源未给该山的逐格干支名，本实现按甲子锚点表连续排布（本插件推断）；'}⚠ 逐格度数与完整原表未逐字对校，要与某师承原表相符请替换族内 FENJIN_ANCHOR 表，勿改算法`,
        断: `${gradeTxt}；本山龟甲空亡格${kongList.length > 0 ? `在第 ${kongList.map((f) => f.slot).join('、')} 位（${kongList.map((f) => f.gz).join('、')}）` : '不落本山五位'}，放线时尤须避开该 ${FJ_STEP}° 带`,
        说明: notes.join(' '),
        cite: [CITE.分金, CITE.分金排布],
        evidence: [
          evidence('分金分类（歌诀：甲壬阳孤、乙癸阴虚、戊己龟甲空亡、丙丁庚辛旺相）', `坐山正针 ${zuoZheng?.gz} 天干${zuoZheng?.gan} → ${zuoZheng?.grade}（${zuoZheng?.kind}）`, `等级分 ${gradeScore(zuoZheng?.grade)}（旺相+45／孤虚0／龟甲空亡−55），直接计入总分`),
          evidence('分金排布（二十四山每山五位、每位三度，本山范围内连续；共 120 位）', `${or.zuo}山五位：${zuoList.map((f) => `${f.gz}(${f.grade})`).join('、')}`, `山中心 ${degOf(or.zuo)}° 落第 ${zuoZheng?.slot} 位`),
          evidence('地支山分金支同本山（规则①：阳支顺排甲丙戊庚壬、阴支顺排乙丁己辛癸）', FENJIN_ANCHOR[or.zuo] ? `${or.zuo}山：${FENJIN_ANCHOR[or.zuo].join('、')}（与原文逐字一致）` : `${or.zuo}为八干四维山，无原文可依 → 按锚点表连续排布`, `旺相天干 ${wangList.map((f) => f.gan).join('')}`),
          evidence('正针分金纳音五行与坐卦生克', `${zuoZheng?.nayin}属${zhengWx}，月令为${ws.state}；对坐卦${guaWxZuo}为${rel}`, `(${ws.score}−55)×0.45=${((ws.score - 55) * 0.45).toFixed(1)}，生克项 ${{ 生我: 20, 比和: 12, 我生: -5, 我克: -12, 克我: -25 }[rel] ?? 0}`),
          evidence('五格纳音助坐卦之数（生我/比和者计一，以 2.5 为中）', `坐山${helpZuo}/5、向首${helpXiang}/5`, `坐山 (${helpZuo}−2.5)×6=${((helpZuo - 2.5) * 6).toFixed(1)}、向首 (${helpXiang}−2.5)×3=${((helpXiang - 2.5) * 3).toFixed(1)}`),
        ],
      },
    }
  },
}

/**
 * 九星相对当运的吉凶分（供山向飞星用；与 {@link yunQiOf} 同一套取值，
 * 单列出来是为了让 `#75` 的分项能直接引用，不重复算 name）。
 * @param {number} star 星数。
 * @param {number} yun 当运。
 * @returns {number} 分。
 */
function simQiScore(star, yun) {
  return yunQiOf(star, yun).score
}

export default engines
