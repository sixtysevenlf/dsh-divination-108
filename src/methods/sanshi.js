/**
 * 方法模块 · 三式 + 六壬（16 条 → 12 引擎）· v2 重写
 *
 * 契约见 `docs/V2-CONTRACT.md` §3.2 与 `src/core/runner.js` 顶部注释。
 *
 * ## v2 相对 v1 的实质变化（逐条可核对）
 *
 * 1. **奇门阴阳遁分界精确到「时刻」**。v1 按 `chart.jieqi.prev` 落在节气环的前/后半
 *    定阴阳遁，当日交接前后会反盘（v1 注释里点名的坑）。v2 直接拿
 *    `jieqi.prevAt / nextAt` 的**交接时刻**与占时比较，早于交接时刻则退用上一个节气。
 * 2. **奇门定局三派并陈**：拆补（时刻起算 5 日一元）、符头（超神接气置闰）、
 *    茅山/置闰变体。**默认拆补**，`detail.流派` 逐项标明本章用哪一派。
 * 3. **值使八门沿含中五的九宫轨迹飞**（非八宫环）——见 `zhiShiFlyGong`，
 *    与《景祐遁甲符应經》「起於一，終於九，歸於一」相合；转盘/飞盘共用此步数。
 * 3b. **转盘（排宫）与飞盘（飞宫）是两套落宫规则**：转盘＝八宫环刚性旋转（九星与天盘干同步）；
 *    飞盘＝沿**洛书宫数序 1→2→…→9 飞布（含中五）**，八神亦为**九神**（含中宫）。
 *    实测两者天盘九星盘 77.8% 不同、八神盘 100% 不同（详 docs/verification/sanshi.md §3.1）。
 * 3c. **日家奇门以日干支起局**（三元由**日支**定，局数取当日节气三元表），时柱不参与，
 *    故同一日内局数恒定 —— 与 v1「月家/年家取上元」的粗口径不同。
 * 4. **断法要素补齐**：三奇得使（按《统宗》旬首组合）、门迫/宫迫/和义（《法窍》）、
 *    六仪击刑（《宝鉴》严式 + 宽式并陈）、三奇入墓、伏吟/反吟、五不遇时、
 *    旬空、驿马、天禽寄宫、值符值使入中。
 * 5. **大六壬月将改「中气过宫」**：月将变化严格落在**中气交接时刻**，
 *    经节（如立春）不换将（v1 的 24 项表在「节」上都给了错值）。
 * 6. **大六壬九宗门判据顺序按 伏吟/返吟 → 贼克 → 比用 → 涉害 → 八专 → 遥克 → 别责
 *    → 昴星（兜底）**，且伏吟/返吟**内部先吃贼克**。此序据 horosa
 *    `liureng/ChuangChart.js` 的「发三传九法判定序（课经条文口径）」注释——
 *    **八专须在遥克与别责之前**（课经「无克贼比涉不复取遥克」；八专令二课＝四课会误吞别责）。
 *    古籍「九法」章的**列举序**不是判定序（详 docs/verification/sanshi.md §1.3）。
 * 7. **太乙改用《太乙统宗宝鉴》原文公式**：「求四计太乙所在宫次术……以太乙小周法
 *    二百四十去之……以行宫率三約之……命起一宫，顺行八宫，不入中五」；
 *    「求四计计神所在……以计神周法十二去之……命起寅，逆行十二辰次」。v1 的
 *    「自寅起顺行」（顺行！）与典籍相反，v2 更正为**逆行**。
 *
 * ## 三大高风险表（奇门局数 / 六壬九宗门 / 月将过宫）的采用与依据
 *
 * - 奇门局数：二十四节气三元局数表与独立开源实现（[arc119226/qimen_dunjia](https://github.com/arc119226/qimen_dunjia)
 *   `constants.js` `JIEQI_JUSHU`）**逐格对拍一致**，且经 `docs/research/sanshi-spec.md` §A2
 *   记明「horosa / mingpan / ZhouYiLab 三源全部吻合」。三元亦可用闭式
 *   `(六十甲子序 % 15) / 5`（调研 §A3b）——本实现以符头支分组落地（需符头日/超接日差，闭式不单独够用），
 *   两者等价。**拆补**为默认，**符头（超神接气置闰）**为并列可选；置闰锚定芒种/大雪（《遁甲演义》）。
 * - 六壬九宗门：判定序 === 伏吟→返吟→贼克→比用→涉害→**八专**→遥克→别责→昴星（兜底），
 *   伏吟/返吟为**课体前提**故先判，但其内部仍先取贼克；别责、八专、昴星的中末传
 *   取法逐条见各分支 `cite`。**八专须在遥克与别责之前**（课经条文口径，见上 §6）。
 * - 月将过宫：中气换将，表为 雨水亥 / 春分戌 / 谷雨酉 / 小满申 / 夏至未 / 大暑午 /
 *   处暑巳 / 秋分辰 / 霜降卯 / 小雪寅 / 冬至丑 / 大寒子。出处：通行月将歌
 *   「天罡辰起顺行流，正月从猪逆数周；月建合辰为月将」＋「太阳于每月中气过宫，
 *   故月将亦逢中气而换」，并列对照《御定六壬直指》所载太阳入宫度数
 *   （雨水后日躔亥、春分后日躔戌……）。v1 的 24 项表把「节」也各派一将，**已废**。
 *
 * ## 无出处的取值（诚实标记）
 *
 * - 门/星/神/课体/六宫的**吉凶分**是编辑取值（通书与卜筮歌诀的公开通例），
 *   非某一秘本原文数字 → 相关引擎 `fidelity` 不升 `full`。
 * - 太乙的**始击、主客大将、参将、主客算**诸本互异，本模块按公开可推部分计算，
 *   `taiyiJi` 保持 `approx` 并在 `detail` 明说；**积年/太乙宫/计神三者有《太乙统宗宝鉴》原文**。
 *   注：`docs/research/sanshi-spec.md` §C 与 §9#1 的结论是「太乙全部内容 9 个仓库无一有可读算法」
 *   （horosa 外包给不在仓库内的 `kintaiyi`），故本模块**未据调研落任何太乙代码**，改依一手文献。
 *
 * ## 三条硬约束
 * 纯函数（时刻一律取自 chart）／绝不抛异常（算不出返回 null）／不用 Math.random。
 *
 * ## 族外依赖（全部可选，缺失即族内兜底）
 * `chart.astro`（真太阳黄经，仅作月将过宫的第二通路校验）、`chart.renyuan`（人元司令，
 * 仅作金口诀人元的旁证）、`chart.shenshaAll`。三者都不在时缺省走族内表，不降级、不报错。
 */

import {
  GAN, ZHI, GAN_WUXING, ZHI_WUXING, GAN_YANG, ZHI_YANG, ZHI_CANGGAN,
  relation, wangShuai, xunOf, tenGodOf, shenShaOf,
  clamp, emptyWuxing, mod,
} from '../core/kit.js'
import {
  JIEQI_RING, YUEJIANG_BY_JIEQI, JIANG_NAME,
  QIMEN_JU, JIUXING, BAMEN, BASHEN, RING8, PALACE_INFO,
  MEN_WX, XING_WX, MEN_LUCK, XING_LUCK, SHEN_LUCK, QIMEN_GEJU,
  SANQI, XUN_DUN, XUN_HEAD,
  JIGONG, WUHE, XING, SI_MENG, SI_ZHONG, SI_JI,
  JIANG12, GUIREN, ZHOU_HOURS, SHUN_GONG, KETI,
  TAIYI_RING, TAIYI_YUAN, GONG_ZHI, GONG_16SHEN, TAIYI_YANG_GONG,
  LIU_GONG, ZLR_MONTH_START, ZLR_JIANG10, ZLR_SANWEI, ZLR_DUAN, ZLR_TOPIC,
  WUSHU_DUN,
} from './data/sanshi.js'

// ═══════════════════════════════════════════════════════════════════════════
// 族内专用表（带出处；跨族共用表请找 kernel-tables 的 src/core/tables.js）
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 三式族表出处登记表（`detail.cite` 直接引用键名，便于逐条回查）。
 * @type {Record<string,string>}
 */
export const CITE = {
  统宗定三元:
    '《奇門遁甲統宗·定三元法》：符头所临之支值子午卯酉则为上元、寅申巳亥为中元、辰戌丑未为下元',
  宝鉴符头为体:
    '《奇門寶鑒御定》：考古法以甲子、己卯、甲午、己酉为符头者，緣尊甲以制奇門，故立符以定元首也。是以符头为体，節氣为用。',
  演义置闰:
    '《遁甲演義》：置闰定在芒种、大雪之後。设遇小滿、小雪二氣之交，虽超九日、十日，不可置闰。又：闰奇若不居芒种，便是陰終大雪時。',
  法窍拆补:
    '《奇門法竅·论拆局补局》：如遵時憲書節氣为憑，其正授、超神、接氣、置闰不辨而自明矣。（拆补派以節氣交接時刻为嚴格分界）',
  拆补五日一元: '「五日都来換一元」——《煙波釣叟歌》；拆补法：交接時刻起 0–5 日上元、5–10 日中元、10 日後下元',
  符应经值使飞:
    '《景祐遁甲符應經·釋二遁直符合於中宮》：初辰起，在一宮，历五時，至戊辰在中宮。同書〈釋二遁踰於五七歸於九一〉：起於一，終於九，歸於一。',
  法窍门迫:
    '《奇門法竅·卷一》赋文及其注：宮制其門不为迫，門制其宮門迫凶……宮迫者，开惊两門临離宮，火克金也……門迫者，开惊二門临震巽二宮，金克木也……盖迫者，逼也……凡門克宮者，为客克主也。',
  法窍和义: '《奇門法竅·卷一》赋文：宮若生門则为义，最吉日合門主宮。（〈论八門迫制〉：凶門和义，其凶不凶；吉門和义，其吉益吉）',
  宝鉴击刑:
    '《奇門寶鑒御定·釋六儀擊刑》：甲子直符加三宮、子刑卯也。甲戌加二宮、戌刑未也。甲申加八宮、申刑寅也。甲午加九宮、午刑午也。甲辰加四宮、辰刑辰也。甲寅加四宮、寅刑巳也。',
  法窍击刑:
    '《奇門法竅·论六儀擊刑》：甲子直符临三宮，子刑卯也，为无理之刑……甲午直符临九宮，午自刑也，为高大之刑。（嚴式：只算直符之儀）',
  统宗得使: '《奇門遁甲統宗·奇門四十格》：三奇得使：乙奇加甲午甲戌，丙奇加甲子甲申，丁奇加甲寅甲辰。',
  统宗入墓: '《奇門遁甲統宗·奇門四十格》：三奇入墓：乙奇坤宮、丙奇乾宮、丁奇艮宮。',
  宝鉴奇墓:
    '《奇門寶鑒御定·釋奇墓奇制與日時干墓同凶》：奇墓者，乙奇临二宮，丙奇、丁奇临六宮也。二宮藏未，六宮藏戌。乙木墓於未，丙丁火墓於戌。',
  钓叟伏吟: '《煙波釣叟歌》：就中伏吟为最凶，天蓬加著地天蓬，天蓬若到天英上，须知即是返吟宮。',
  演义五不遇:
    '《遁甲演義》葛洪注：五不遇時者，谓刚柔日相克，而損其明……甲日庚午時，乙日辛巳時，丙日壬辰時，丁日癸卯時，戊日甲寅時，己日乙丑時，庚日丙子時，辛日丁酉時，壬日戊申時，癸日己未時，乃時干克日干。',
  统宗禽寄:
    '《奇門遁甲統宗》：小值符加大值符法：以最上盘之值符加於九星值符所临之宮。（八神值符与九星值符同宮）',
  月将歌: '月將歌：天罡辰起顺行流，正月从豬逆數周；月建合辰为月將，六壬从此是根由。',
  月将中气:
    '月將通说：月將即日宿太陽，视太陽入何宮即为何將；太陽於每月中氣过宮，故月將亦逢中氣而換。（对照《御定六壬直指》所载太陽入宮度數：雨水後日躔亥、春分後日躔戌、谷雨後日躔酉……）',
  六壬九宗: '六壬九宗門取傳（判定序，非列舉序）：伏吟→返吟→贼克（重審/元首）→比用（知一）→涉害→八專→遙克（蒿矢/彈射）→别责（蕪淫）→昴星（虎视/冬蛇掩目，兜底）',
  六壬比用: '比用（知一）課：下贼上或上克下者眾，取与日干陰陽相比（同陰陽）者为用；《六壬大全》「知一課，取与日比者为用」',
  六壬涉害: '涉害課：受克者多，各數其歸本家途中所受之克，深者为用；深淺等则取临四孟（寅申巳亥）者，再同比用',
  六壬遥克: '《六壬大全》遙克課：四課无上下克，取上神克日干者为蒿矢、日干克上神者为彈射（以日干为主，隔位相克）',
  六壬昴星:
    '《六壬大全》昴星課：刚日虎视，取地盘酉上神为初傳；柔日冬蛇掩目，取天盘酉所临地盘支为初傳。刚日「先辰而後日」，柔日「先日而後辰」',
  六壬别责:
    '《六壬大全》别责課：四課不全（只有三課）且无克无遙，陽日取干合之神（寄宮）上神、陰日取日支三合前一位（支前一位）为初傳，中末俱取干上神',
  六壬八专: '《六壬大全》八專課：两課无克号八專。干支同位、四課只得两課；陽日自干上神顺數三位、陰日自第四課上神逆數三位为初傳，中末俱取干上神',
  六壬伏吟:
    '《六壬大全》伏吟課：月將与占時同，天地盘十二宮各居本位。有克仍取贼克發用、中末递取初傳中傳之刑；无克刚日取干上神、柔日取支上神，中末递取其刑',
  六壬返吟:
    '《六壬大全》返吟課：月將加時天地盘相沖。有克仍取贼克發用、中末递傳；无克曰「无亲」（井欄射），取驛马發用，中取支上神、末取干上神',
  贵人歌:
    '天乙贵人歌：甲戊庚牛羊，乙己鼠猴鄉，丙丁豬雞位，壬癸兔蛇藏，六辛逢马虎；陰陽贵人歌分晝（陽）夜（陰）：陽贵庚戊见牛甲在羊、乙猴己鼠丙雞方、丁豬癸蛇壬是兔、六辛逢虎贵为陽',
  贵人顺逆: '贵人临亥子丑寅卯辰六宮顺布十二天將，临巳午未申酉戌六宮逆布（《六壬大全·十二天將起例》）',
  太乙积年:
    '《太乙統宗寶鑑》卷一〈求太乙積年術〉：置演上元甲子，距大元大德七年癸卯，岁积一千一十五万五千二百一十九年，上验往古，每年減一，下验將来，每年加一（通行为公元年 + 10153917）',
  太乙宫次:
    '《太乙統宗寶鑑》卷一〈求四計太乙所在宮次術〉：置所求入局积數，以太乙小周法二百四十去之，不盡，以行宮率三約之而一，所得为行宮之數，不滿为入宮以来之數。其宮數命起一宮，顺行八宮，不入中五算外',
  计神:
    '《太乙統宗寶鑑》卷一〈求四計計神所在術〉：置所求入局积數，以计神周法十二去之，不滿为周，命起寅，逆行十二辰次算外，即得计神所在',
  太乙陨阙:
    '《太乙統宗寶鑑》卷一〈求四計定计目、计大將、計參所在術〉引淘金歌法（崇禎甲戌年例）；始擊（客目）、主客大將参將、主客算之完整起例诸本互異，本模塊只取公开可推部分，详见 detail.说明',
  五子元遁:
    '五子元遁（五鼠遁）歌：甲己还加甲，乙庚丙作初，丙辛从戊起，丁壬庚子居，戊癸何方發，壬子是真途。（金口诀定人元用）',
  金口诀四位: '《六壬金口诀》：四位＝地分（占時支，或報數）、月將（中氣过宮）、贵神（十二天將乘地分）、人元（五子元遁至地分）',
  中六壬掌诀:
    '《中六壬天罡掌诀》起月歌：正九尋牛五月雞，二八须从子上随，三七都依亥上起，四六还须戌上移，十月十二寅上數，十一当从卯位推。（月上起日、日上起時、時上退一位起天罡）',
  小六壬: '小六壬（诸葛马前課）通行掌诀：大安起正月，月上起初一，日上起子時，顺數落宮；六宮大安、留连、速喜、赤口、小吉、空亡',
  驿马: '驛马：申子辰马在寅，亥卯未马在巳，寅午戌马在申，巳酉丑马在亥（三合局之沖）',
  门星神取值:
    '門／星／神／課体吉凶分为編輯取值：依通書与卜筮歌诀之公开通例（开休生三吉門、辅心任禽为吉星、贵人青龍六合太常为吉將），非某一秘本原文數字，可按師承改',
}

/**
 * 组装 `detail.cite`：**只收非空字符串**，滤掉任何 undefined / null / 空串。
 *
 * 存在理由：`CITE` 的键名曾因繁简整理与代码引用点不一致（如键作 `太乙隕阙` 而引用作
 * `太乙陨阙`），使 `CITE.xxx` 取到 undefined 而在 cite 数组里留一个**空位**。
 * 这类空位不会让测试红、也不会让断语错，但违反「cite 每条都必须可回查」的溯源纪律，
 * 且下游审计（verifier）会以「数组含非法元素」报出。故所有 cite 一律经此函数组装。
 *
 * @param {...(string|undefined|null)} items 出处串。
 * @returns {string[]} 去空后的出处数组。
 */
function citeOf(...items) {
  return items.filter((x) => typeof x === 'string' && x.trim().length > 0)
}

/**
 * 洛书九宫序（1→9 飞布轨迹）：坎1→坤2→震3→巽4→中5→干6→兑7→艮8→离9。
 * 出处：洛书数「戴九履一、左三右七、二四为肩、六八为足」之数序即飞布次序。
 */
const LUOSHU_PATH = [1, 2, 3, 4, 5, 6, 7, 8, 9]

/**
 * 洛书八宫环（不含中五）。既有 `RING8` 已同此序，此处保留语义名。
 */
const RING8_PATH = (Array.isArray(RING8) && RING8.length === 8) ? [...RING8] : [1, 8, 3, 4, 9, 2, 7, 6]

/** 中五宫寄坤二宫（《奇门遁甲统宗》「中五合于坤二」）。 */
const JI_GONG = (g) => (g === 5 ? 2 : g)

/** 阳局八神（含勾陈、朱雀）：《奇门法窍》阳遁八神。 */
const BASHEN_YANG = ['值符', '螣蛇', '太阴', '六合', '勾陈', '朱雀', '九地', '九天']
/** 阴局八神（勾陈→白虎、朱雀→玄武）。 */
const BASHEN_YIN = ['值符', '螣蛇', '太阴', '六合', '白虎', '玄武', '九地', '九天']
/**
 * 八神运算阵列：本插件 `SHEN_LUCK` 只收了 8 个名（含白虎、玄武），
 * 故阳局把勾陈/朱雀归并到白虎/玄武的口径上取分（取值同属凶神），
 * 显示名仍按阴阳局分列。
 */
const SHEN_ALT = { 勾陈: '白虎', 朱雀: '玄武' }

/** 六仪所遁之甲：甲子隐戊…甲寅隐癸。 */
const YI_TO_XUN = { 戊: '甲子', 己: '甲戌', 庚: '甲申', 辛: '甲午', 壬: '甲辰', 癸: '甲寅' }

/** 六甲旬首之序（配 XUN_DUN）。 */
const XUN_SEQ = (Array.isArray(XUN_HEAD) && XUN_HEAD.length === 6) ? [...XUN_HEAD] : ['甲子', '甲戌', '甲申', '甲午', '甲辰', '甲寅']

/** 九星本位（宫 → 星）的族内兜底副本（data 表缺失时用）。 */
const JIUXING_FALLBACK = { 1: '天蓬', 2: '天芮', 3: '天冲', 4: '天辅', 5: '天禽', 6: '天心', 7: '天柱', 8: '天任', 9: '天英' }
/** 八门本位（宫 → 门）族内兜底。 */
const BAMEN_FALLBACK = { 1: '休门', 2: '死门', 3: '伤门', 4: '杜门', 6: '开门', 7: '惊门', 8: '生门', 9: '景门' }
/** 三奇六仪起布序（自局数宫起，阳顺阴逆）。 */
const YI_SEQ = ['戊', '己', '庚', '辛', '壬', '癸', '丁', '丙', '乙']

/**
 * 六仪击刑（严式：只算值符之仪落刑宫）。出处见 CITE.宝鉴击刑。
 * 甲子→戊加三宫(震)、甲戌→己加二宫(坤)、甲申→庚加八宫(艮)、
 * 甲午→辛加九宫(离)、甲辰→壬加四宫(巽)、甲寅→癸加四宫(巽)。
 */
const JI_XING = { 戊: 3, 己: 2, 庚: 8, 辛: 9, 壬: 4, 癸: 4 }

/** 三奇入墓宫：《统宗》乙奇坤(2)、丙奇干(6)、丁奇艮(8)；《宝鉴》作乙2、丙丁6。 */
const QI_MU = { 乙: [2], 丙: [6], 丁: [8] }
/** 《宝鉴》读法：乙奇临二宫，丙奇、丁奇临六宫。 */
const QI_MU_BAOJIAN = { 乙: [2], 丙: [6], 丁: [6] }

/**
 * 三奇得使：《统宗》「乙奇加甲午甲戌，丙奇加甲子甲申，丁奇加甲寅甲辰」。
 * 键＝天盘奇，值＝所合旬首（即其地盘宫中的仪）。
 */
const QI_DE_SHI = {
  乙: ['甲午', '甲戌'],
  丙: ['甲子', '甲申'],
  丁: ['甲寅', '甲辰'],
}

/** 五不遇时定式（时干克日干，同性）：日干 → 时干。出处见 CITE.演义五不遇。 */
const WU_BU_YU = { 甲: '庚', 乙: '辛', 丙: '壬', 丁: '癸', 戊: '甲', 己: '乙', 庚: '丙', 辛: '丁', 壬: '戊', 癸: '己' }

// ───────────────────────── 大六壬族内表 ─────────────────────────

/**
 * 月将过宫表：**中气** → 月将。只有中气换将，经节不换。
 * 出处见 CITE.月将中气；逐条对照《御定六壬直指》太阳入宫（雨水后日躔亥…）。
 */
const YUEJIANG_ZHONGQI = {
  雨水: '亥', 春分: '戌', 穀雨: '酉', 小满: '申', 夏至: '未', 大暑: '午',
  处暑: '巳', 秋分: '辰', 霜降: '卯', 小雪: '寅', 冬至: '丑', 大寒: '子',
}
/**
 * 中气别名兜底（lunar-javascript 出简体；本表**只放中气**——经节不换月将，
 * 若把经节也放进来会让 `isZhongqi` 误判，v1 的 24 项表正是这个错）。
 */
const YUEJIANG_ZHONGQI_ALT = {
  雨水: '亥', 春分: '戌', 谷雨: '酉', 小满: '申', 夏至: '未', 大暑: '午',
  处暑: '巳', 秋分: '辰', 霜降: '卯', 小雪: '寅', 冬至: '丑', 大寒: '子',
}
/** 十二中气自冬至起的环序（判断「上一中气」用）。 */
const ZHONGQI_RING = ['冬至', '大寒', '雨水', '春分', '穀雨', '小满', '夏至', '大暑', '处暑', '秋分', '霜降', '小雪']

/** 月将 → 将名（登明…神后），族内兜底。 */
const JIANG_NAME_FALLBACK = {
  亥: '登明', 戌: '河魁', 酉: '从魁', 申: '传送', 未: '小吉', 午: '胜光',
  巳: '太乙', 辰: '天罡', 卯: '太冲', 寅: '功曹', 丑: '大吉', 子: '神后',
}

/** 十二天将顺序（贵人起，顺布）。名取《六壬大全》通行本。 */
const JIANG12_SEQ = ['贵人', '螣蛇', '朱雀', '六合', '勾陈', '青龙', '天空', '白虎', '太常', '玄武', '太阴', '天后']
/** 天将 → 吉凶分（编辑取值，见 CITE.门星神取值）。 */
const JIANG_LUCK = {
  贵人: 60, 螣蛇: -34, 朱雀: -24, 六合: 50, 勾陈: -40, 青龙: 56,
  天空: -30, 白虎: -60, 太常: 44, 玄武: -50, 太阴: 36, 天后: 40,
}
/** 天将 → 五行（通行本）。 */
const JIANG_WX = {
  贵人: '土', 螣蛇: '火', 朱雀: '火', 六合: '木', 勾陈: '土', 青龙: '木',
  天空: '土', 白虎: '金', 太常: '土', 玄武: '水', 太阴: '金', 天后: '水',
}
/** 兼容 data 表（可能缺天干/繁体差异）：统一取族内表，data 表仅作兜底。 */
const JIANG_INFO = (() => {
  const out = {}
  for (const n of JIANG12_SEQ) out[n] = { name: n, wx: JIANG_WX[n], luck: JIANG_LUCK[n] }
  return out
})()

/**
 * 天乙贵人：日干 → [阳（昼）贵, 阴（夜）贵]。出处见 CITE.贵人歌。
 * 甲戊庚牛羊＝甲贵未/丑、戊庚贵丑/未；乙己鼠猴＝乙申/子、己子/申；
 * 丙丁猪鸡＝丙酉/亥、丁亥/酉；壬癸兔蛇＝壬卯/巳、癸巳/卯；六辛逢马虎＝辛寅/午。
 */
const GUIREN_V2 = {
  甲: ['未', '丑'], 戊: ['丑', '未'], 庚: ['丑', '未'],
  乙: ['申', '子'], 己: ['子', '申'],
  丙: ['酉', '亥'], 丁: ['亥', '酉'],
  壬: ['卯', '巳'], 癸: ['巳', '卯'],
  辛: ['寅', '午'],
}

/** 日干寄宫（甲寄寅、乙寄辰、丙戊寄巳、丁己寄未、庚寄申、辛寄戌、壬寄亥、癸寄丑）。 */
const JIGONG_V2 = { 甲: '寅', 乙: '辰', 丙: '巳', 戊: '巳', 丁: '未', 己: '未', 庚: '申', 辛: '戌', 壬: '亥', 癸: '丑' }

/** 支三合局（别责阴日取「支前三合一位」用）。 */
const SANHE_PREV = { 申: '辰', 子: '辰', 辰: '辰', 亥: '卯', 卯: '卯', 未: '卯', 寅: '午', 午: '午', 戌: '午', 巳: '酉', 酉: '酉', 丑: '酉' }

/** 刑（伏吟中末递取用）。 */
const XING_V2 = { 子: '卯', 卯: '子', 寅: '巳', 巳: '申', 申: '寅', 丑: '戌', 戌: '未', 未: '丑', 辰: '辰', 午: '午', 酉: '酉', 亥: '亥' }

/** 六亲（以日干为我）。 */
const LIUQIN = { 生我: '父母', 我生: '子孙', 我克: '妻财', 克我: '官鬼', 比和: '兄弟' }

/** 课体释义与吉凶分（编辑取值）。 */
const KETI_V2 = {
  贼克: { score: 12, note: '贼克课，事有端绪；一下贼上为重审（事起于下）、一上克下为元首（事起于上）' },
  比用: { score: 0, note: '比用（知一）课，事涉两途，取与日干阴阳相比者为用，主一事两端' },
  涉害: { score: -20, note: '涉害课，事多艰阻，历尽波折方见分晓' },
  遥克: { score: -10, note: '遥克课，蒿矢主上神克日、弹射主日克上神，事隔他方，缓而不亲' },
  昴星: { score: -26, note: '昴星课，事多暗昧；刚日虎视而机在外、柔日冬蛇掩目而机在内' },
  别责: { score: -20, note: '别责课（芜淫），四课不全只有三课，事不由己，须借力他方' },
  八专: { score: -26, note: '八专课，干支同位、四课只得两课，事多重叠纠缠；阴私之神入传为帷薄不修' },
  伏吟: { score: -36, note: '伏吟课，天地不动，事主迟滞呻吟' },
  返吟: { score: -30, note: '返吟课，天地相冲，事多反复无依' },
}

// ───────────────────────── 太乙族内表 ─────────────────────────

/** 太乙行宫环：顺行八宫，不入中五，每宫三年、二十四年一周。出处见 CITE.太乙宫次。 */
const TAIYI_GONG_RING = [1, 2, 3, 4, 6, 7, 8, 9]
/** 太乙积年基准（通行程式值）。 */
const TAIYI_YUAN_V2 = Number.isFinite(TAIYI_YUAN) ? TAIYI_YUAN : 10153917
/** 计神周法。 */
const JISHEN_ZHOU = 12
/** 太乙小周法。 */
const TAIYI_XIAOZHOU = 240
/** 行宫率。 */
const TAIYI_XINGGONG_RATE = 3
/** 九宫 → 太乙十六神名（详盘用）。 */
const GONG_16SHEN_V2 = (GONG_16SHEN && typeof GONG_16SHEN === 'object')
  ? GONG_16SHEN
  : { 1: '地主', 8: '和德', 3: '高丛', 4: '太炅', 9: '大威', 2: '大武', 7: '太簇', 6: '阴德' }
/** 太乙阳宫（奇宫）。 */
const TAIYI_YANG = Array.isArray(TAIYI_YANG_GONG) && TAIYI_YANG_GONG.length ? TAIYI_YANG_GONG : [1, 3, 7, 9]

// ───────────────────────── 六宫 / 金口诀族内表 ─────────────────────────

/** 小六壬六宫（大安→空亡）。吉凶分为编辑取值。 */
const LIU_GONG_V2 = Array.isArray(LIU_GONG) && LIU_GONG.length === 6 ? LIU_GONG : [
  { name: '大安', wx: '木', score: 55, luck: '吉', kw: '安稳', main: '身不动、事安稳，宜守不宜急', ying: '缓，三、五、七日见' },
  { name: '留连', wx: '土', score: -30, luck: '凶', kw: '拖延', main: '事难成就、纠缠反复，去者未回', ying: '迟，七日以上' },
  { name: '速喜', wx: '火', score: 66, luck: '吉', kw: '速成', main: '喜事速至、消息即来，宜急不宜缓', ying: '速，一、三日见' },
  { name: '赤口', wx: '金', score: -55, luck: '凶', kw: '口舌', main: '口舌是非、争执官非，宜谨言', ying: '急，一、二日见' },
  { name: '小吉', wx: '水', score: 60, luck: '吉', kw: '和合', main: '凡事和合顺遂，多有贵人相助', ying: '近，二、四日见' },
  { name: '空亡', wx: '土', score: -70, luck: '大凶', kw: '落空', main: '谋事落空、音信全无，宜止不宜进', ying: '无期，须改日再占' },
]

/** 五子元遁遁首：日干 → 子时之干。出处见 CITE.五子元遁。 */
const WUSHU_DUN_V2 = (WUSHU_DUN && typeof WUSHU_DUN === 'object') ? WUSHU_DUN : {
  甲: '甲', 己: '甲', 乙: '丙', 庚: '丙', 丙: '戊', 辛: '戊', 丁: '庚', 壬: '庚', 戊: '壬', 癸: '壬',
}

// ═══════════════════════════════════════════════════════════════════════════
// 通用小工具（全部防御式：字段缺失一律兜底，绝不抛异常）
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 干支 → 六十甲子序（0..59）。
 * @param {string} gz 干支两字。
 * @returns {number} 序；无法解析时 -1。
 */
function gzIdx60(gz) {
  if (typeof gz !== 'string' || gz.length < 2) return -1
  const gi = GAN.indexOf(gz[0])
  const zi = ZHI.indexOf(gz[1])
  if (gi < 0 || zi < 0) return -1
  for (let i = 0; i < 60; i += 1) if (i % 10 === gi && i % 12 === zi) return i
  return -1
}

/** 支 → 五行（兜底土）。 */
const wxOf = (z) => ZHI_WUXING[z] ?? '土'
/** 支是否属阳。 */
const isYangZhi = (z) => ZHI_YANG[z] === true
/** 干是否属阳。 */
const isYangGan = (g) => GAN_YANG[g] === true
/** 支之对冲。 */
const chong = (z) => ZHI[mod(ZHI.indexOf(z) + 6, 12)]
/** 支之六合（子↔丑、寅↔亥…即「进一位」之外的另一种，此处取六合正解）。 */
const LIUHE_V2 = { 子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯', 辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午' }
const liuheOf = (z) => LIUHE_V2[z] ?? ZHI[mod(ZHI.indexOf(z) + 1, 12)]
/** 去重并截到 6 个 key。 */
const uniqKeys = (arr) => [...new Set((arr ?? []).filter((k) => typeof k === 'string' && k.length > 0))].slice(0, 6)

/**
 * 取「盘上用的干」：甲不独立，隐于旬首所遁之仪。
 * @param {string} gz 干支。
 * @returns {string} 用于地盘寻宫的干。
 */
function panGanOf(gz) {
  const gan = (gz ?? '')[0] ?? ''
  if (gan !== '甲') return gan
  const i = gzIdx60(gz)
  if (i < 0) return '戊'
  return (XUN_DUN ?? {})[XUN_SEQ[Math.floor(i / 10)] ?? '甲子'] ?? '戊'
}

/** 九星表（宫 → 星），data 表缺失时用族内兜底。 */
function xingAt(g) {
  const t = (JIUXING && typeof JIUXING === 'object') ? JIUXING : JIUXING_FALLBACK
  return t[g] ?? JIUXING_FALLBACK[g] ?? '天禽'
}
/** 八门表（宫 → 门），中五无门。 */
function menAt(g) {
  const t = (BAMEN && typeof BAMEN === 'object') ? BAMEN : BAMEN_FALLBACK
  return t[g] ?? BAMEN_FALLBACK[g] ?? null
}
/** 门吉凶分。 */
const menLuck = (m) => (MEN_LUCK ?? {})[m] ?? 0
/** 星吉凶分。 */
const xingLuck = (x) => (XING_LUCK ?? {})[x] ?? 0
/** 神吉凶分（勾陈/朱雀归并取分）。 */
const shenLuck = (s) => {
  const key = (SHEN_ALT[s] && (SHEN_LUCK ?? {})[s] === undefined) ? SHEN_ALT[s] : s
  return (SHEN_LUCK ?? {})[key] ?? 0
}
/** 门五行。 */
const menWx = (m) => (MEN_WX ?? {})[m] ?? '土'
/** 星五行。 */
const xingWx = (x) => (XING_WX ?? {})[x] ?? '土'
/** 日干 → 天乙贵人 [昼, 夜]（族内表优先，data 表兜底）。 */
const guirenOf = (gan) => GUIREN_V2[gan] ?? (GUIREN ?? {})[gan] ?? null
/** 三合前一位（别责阴日用）。 */
const sanhePrevOf = (z) => SANHE_PREV[z] ?? ZHI[mod(ZHI.indexOf(z) + 4, 12)]
/** 相刑。 */
const xingOf = (z) => XING_V2[z] ?? (XING ?? {})[z] ?? z
/** 课体释义。 */
const ketiOf = (name) => KETI_V2[name] ?? (KETI ?? {})[name] ?? { score: 0, note: '' }
/** 将名。 */
const jiangNameOf = (z) => (JIANG_NAME ?? {})[z] ?? JIANG_NAME_FALLBACK[z] ?? ''

/**
 * 支序顺数（含 0 时取 12 的「进一位」口径，涉害用）。
 * @param {string} from 起支。
 * @param {string} to 止支。
 * @returns {number} 1..12。
 */
function advZhi(from, to) {
  const d = mod(ZHI.indexOf(to) - ZHI.indexOf(from), 12)
  return d === 0 ? 12 : d
}

/** 十二宫环序（子→亥）上的「自 x 顺数 n 位」。 */
const zhiAdd = (z, n) => ZHI[mod(ZHI.indexOf(z) + n, 12)]

/** 九宫环序「自 x 顺数 n 宫」（含中五的洛书序用 LUOSHU_PATH）。 */
const gongAdd = (g, n) => LUOSHU_PATH[mod(LUOSHU_PATH.indexOf(g) + n, 9)] ?? g

/** 八宫环序「自 x 顺数 n 宫」。 */
const ringAdd = (g, n) => RING8_PATH[mod(RING8_PATH.indexOf(g) + n, 8)] ?? g

/** 宫 → 卦/方位/五行。 */
const palInfo = (g) => (PALACE_INFO ?? {})[g] ?? { gua: '中', dir: '中', wx: '土' }

/**
 * 取占时（Date）：优先 `chart.when`，退回 `chart.solarDate`，再退回 solar 栏位拼日期。
 * @param {object} chart 盘基。
 * @returns {Date|null}
 */
function whenOf(chart) {
  if (chart?.when instanceof Date && !Number.isNaN(chart.when.getTime())) return chart.when
  if (chart?.solarDate instanceof Date && !Number.isNaN(chart.solarDate.getTime())) return chart.solarDate
  const s = chart?.solar
  if (s && Number.isFinite(s.y) && Number.isFinite(s.m) && Number.isFinite(s.d)) {
    const d = new Date(s.y, s.m - 1, s.d, s.h ?? 12, s.mi ?? 0, 0)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/**
 * 把 lunar-javascript 的 `toYmdHms()` 串解析成 Date（本地时区）。
 * @param {string} s 形如 `2026-02-04 04:01:00`。
 * @returns {Date|null}
 */
function parseYmdHms(s) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/.exec(String(s ?? ''))
  if (!m) return null
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Date → `YYYY-MM-DD HH:mm`。 */
function fmtDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '—'
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 两个节气名是否同一气（简繁兜底）。 */
function sameJieqi(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  const simp = { 惊蛰: '惊蛰', 穀雨: '谷雨', 小满: '小满', 芒种: '芒种', 处暑: '处暑' }
  return (simp[a] ?? a) === (simp[b] ?? b)
}

/**
 * 二十四节气之环序（简繁兜底，对齐 data 表的繁体 JIEQI_RING）。
 * @param {string} name 节气名。
 * @returns {number} 环序；未收录 -1。
 */
function jieqiRingIdx(name) {
  if (!name) return -1
  let i = JIEQI_RING.indexOf(name)
  if (i >= 0) return i
  const simp = { 惊蛰: '惊蛰', 谷雨: '穀雨', 小满: '小满', 芒种: '芒种', 处暑: '处暑' }
  i = JIEQI_RING.indexOf(simp[name] ?? name)
  return i
}

/** 该节气是否为中气（用于月将过宫）。 */
function isZhongqi(name) {
  for (const k of ZHONGQI_RING) if (sameJieqi(k, name)) return true
  return !!(YUEJIANG_ZHONGQI_ALT[name] && YUEJIANG_ZHONGQI_ALT[name] !== null)
}

/** 中气 → 月将支（简繁兜底）。 */
function yuejiangByZhongqi(name) {
  if (!name) return null
  for (const k of Object.keys(YUEJIANG_ZHONGQI)) if (sameJieqi(k, name)) return YUEJIANG_ZHONGQI[k]
  const alt = YUEJIANG_ZHONGQI_ALT[name]
  return alt ?? null
}

/** 自某中气退一位的中气。 */
function prevZhongqi(name) {
  for (let i = 0; i < ZHONGQI_RING.length; i += 1) {
    if (sameJieqi(ZHONGQI_RING[i], name)) return ZHONGQI_RING[mod(i - 1, 12)]
  }
  return null
}

/**
 * 节气修正：把 `chart.jieqi` 校正到「占时真正所处的那个节气」。
 *
 * **v1 注释点名的坑**：历法库按日（乃至按「下一个节气名」）切换阴阳遁与月将，
 * 当日交节的情况会用错节气。v2 用交接**时刻**比对：
 * 若 `prevAt` 晚于占时（即占时仍在上一节气内），退用 `prev` 的上一气。
 *
 * @param {object} chart 盘基。
 * @returns {{name:string, at:string, atDate:Date|null, nextName:string, nextAt:string,
 *   nextDate:Date|null, corrected:boolean, note:string}} 校正结果。
 */
function jieqiStateOf(chart) {
  const when = whenOf(chart)
  const prevName = chart?.jieqi?.prev ?? ''
  const prevAt = chart?.jieqi?.prevAt ?? ''
  const nextName = chart?.jieqi?.next ?? ''
  const nextAt = chart?.jieqi?.nextAt ?? ''
  let atDate = parseYmdHms(prevAt)
  let name = prevName
  let corrected = false
  let note = '历法库节气与占时一致'

  if (when && atDate && atDate.getTime() > when.getTime()) {
    // 占时早于历法库标记的「上一节气」交接时刻 → 仍在更上一气内，退一位。
    const i = jieqiRingIdx(prevName)
    if (i >= 0) {
      name = JIEQI_RING[mod(i - 1, 24)]
      corrected = true
      // 退位后的交接时刻未知（历法库未给），保留原 prevAt 供标注但标为不精确
      atDate = null
      note = `历法库标记「上一节气」为 ${prevName}@${prevAt}，晚于占时 ${fmtDate(when)}；已按交接时刻退用 ${name}（当日交节边界校正）`
    }
  }
  return {
    name,
    at: corrected ? '' : prevAt,
    atDate: corrected ? null : atDate,
    nextName: corrected ? prevName : nextName,
    nextAt: corrected ? prevAt : nextAt,
    nextDate: corrected ? parseYmdHms(prevAt) : parseYmdHms(nextAt),
    corrected,
    note,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 奇门遁甲
// ═══════════════════════════════════════════════════════════════════════════

/** 一个节气的三元局数 [上, 中, 下]（简繁兜底 + 兜底表）。 */
function juTripleOf(jieqi) {
  const t = (QIMEN_JU && typeof QIMEN_JU === 'object') ? QIMEN_JU : {}
  if (t[jieqi]) return t[jieqi]
  const simp = { 惊蛰: '惊蛰', 谷雨: '穀雨', 小满: '小满', 芒种: '芒种', 处暑: '处暑' }
  if (t[simp[jieqi]]) return t[simp[jieqi]]
  return [1, 7, 4]
}

/** 局数 → 地盘三奇六仪（洛书九宫序 1..9 逐宫返回干）。 */
function diPanOf(yang, ju) {
  const j = clamp(Math.round(ju), 1, 9)
  const dir = yang ? 1 : -1
  const out = {}
  for (let k = 0; k < 9; k += 1) {
    const g = mod(j - 1 + dir * k, 9) + 1
    out[g] = YI_SEQ[k]
  }
  return out
}

/** 干 → 宫（自地盘反查）。 */
function gongOfGan(diPan) {
  const out = {}
  for (const [g, gan] of Object.entries(diPan)) out[gan] = Number(g)
  return out
}

/** 起局基准干支（时/日/月/年）。 */
function scaleGzOf(chart, scale) {
  const g = chart?.ganzhi ?? {}
  if (scale === '日') return g.day ?? ''
  if (scale === '月') return g.month ?? ''
  if (scale === '年') return g.year ?? ''
  return g.hour ?? ''
}

/**
 * **拆补法定局**（默认派）：以节气交接**时刻**为严格分界，
 * 交接起 0–5 日上元、5–10 日中元、10 日以后下元。
 *
 * 出处见 CITE.法窍拆补、CITE.拆补五日一元。并列对拍
 * [arc119226/qimen_dunjia](https://github.com/arc119226/qimen_dunjia) `calculateJuByChaiBu`。
 *
 * 边界处理：天数用「占时 − 交接时刻」的精确毫秒差，故交节当日 03:00 与 06:00
 * 可落不同元（历法库按日切换时这两者同元，正是 v1 注释点名的坑）。
 *
 * @param {object} chart 盘基。
 * @param {object} js 节气校正结果（`jieqiStateOf`）。
 * @returns {object} 定局结果。
 */
function juChaiBu(chart, js) {
  const when = whenOf(chart)
  const at = js.atDate
  let days = 0
  let exact = false
  if (when && at) {
    days = (when.getTime() - at.getTime()) / 86400000
    exact = true
  } else {
    // 无精确时刻（历法库未给或已退位）：退回「节后日数」的日粒度，并标记非精确。
    const sd = chart?.solar
    if (sd && Number.isFinite(sd.y) && Number.isFinite(sd.m) && Number.isFinite(sd.d)) {
      const jq = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(chart?.jieqi?.prevAt ?? ''))
      if (jq) {
        const a = new Date(+jq[1], +jq[2] - 1, +jq[3])
        const b = new Date(sd.y, sd.m - 1, sd.d)
        days = Math.max(0, (b.getTime() - a.getTime()) / 86400000)
      }
    }
  }
  days = Math.max(0, days)
  const yuan = days < 5 ? 0 : days < 10 ? 1 : 2
  const triple = juTripleOf(js.name)
  const ju = triple[yuan] ?? triple[0] ?? 1
  const yang = jieqiRingIdx(js.name) >= 0 ? jieqiRingIdx(js.name) < 12 : ['子', '丑', '寅', '卯', '辰', '巳'].includes(chart?.monthZhi)

  return {
    school: '拆补',
    jieqi: js.name,
    yuan,
    yuanName: ['上元', '中元', '下元'][yuan],
    ju,
    yang,
    triple,
    daysAfter: days,
    exact,
    fuTou: '',
    fuTouAt: '',
    chaJie: '—',
    runJu: false,
    note: `拆补法：自 ${js.name}${exact ? ` 交接时刻 ${js.at}` : '（时刻不可得，按日粒度）'} 起算 `
      + `${days.toFixed(2)} 日 → ${['上元', '中元', '下元'][yuan]}（<5 上元、5–10 中元、≥10 下元）`,
  }
}

/**
 * **符头法定局**（超神接气置闰）：符头为体、节气为用。
 * 符头＝甲己日（每五日一元），三元由符头支定（子午卯酉上、寅申巳亥中、辰戌丑未下）。
 * 置闰锚定芒种／大雪（《遁甲演义》），触发门槛用历日差 ≥ 8（典籍「超九日」为含头计数）。
 *
 * 出处见 CITE.宝鉴符头为体、CITE.演义置闰、CITE.统宗定三元；对拍
 * qimen_dunjia `calculateJuByFuTou`（其链以《统宗》康熙五十八年立秋正授为外部锚点）。
 *
 * @param {object} chart 盘基。
 * @param {object} js 节气校正结果。
 * @param {number} [leapGap] 置闰门槛（历日差）。
 * @param {string[]} [leapAt] 置闰所绑之节气。
 * @returns {object} 定局结果。
 */
function juFuTou(chart, js, leapGap = 8, leapAt = ['芒种', '大雪']) {
  const dayGZ = chart?.ganzhi?.day ?? ''
  const dIdx = gzIdx60(dayGZ)
  const when = whenOf(chart)

  // 符头日 = 最近的甲/己日（前 0..4 日），其于六十甲子中的序为 5 的倍数。
  const fuIdx = dIdx >= 0 ? Math.floor(dIdx / 5) * 5 : 0
  const back = dIdx >= 0 ? dIdx - fuIdx : 0
  const fuGZ = `${GAN[mod(fuIdx, 10)]}${ZHI[mod(fuIdx, 12)]}`
  const fuAt = when ? new Date(when.getFullYear(), when.getMonth(), when.getDate() - back) : null
  const fuZhi = fuGZ[1] ?? '子'
  // 三元：子午卯酉上、寅申巳亥中、辰戌丑未下（CITE.统宗定三元）。
  const yuan = SI_ZHONG.includes(fuZhi) ? 0 : SI_MENG.includes(fuZhi) ? 1 : 2

  // ── 超神／接气／正授 ──
  // 一个符头循环（15 日）统领一个节气。把节气日与符头日放在同一条定位轴上：
  // 以符头所在的前后 10 日为定位窗，求离符头最近的下一个节气名字。
  let jieqi = js.name
  let chaJie = '—'
  let runJu = false
  let gapDays = 0
  let candidateAt = null
  let candidateName = ''

  if (fuAt) {
    let best = null
    for (let d = -10; d <= 10; d += 1) {
      const dd = new Date(fuAt.getFullYear(), fuAt.getMonth(), fuAt.getDate() + d)
      const cand = candidateJieqi(dd)
      if (!cand) continue
      const dist = Math.abs(dd.getTime() - fuAt.getTime()) / 86400000
      if (!best || dist < best.dist) best = { name: cand, dist, d }
    }
    if (best) {
      candidateName = best.name
      gapDays = best.d
      candidateAt = new Date(fuAt.getFullYear(), fuAt.getMonth(), fuAt.getDate() + best.d)
      jieqi = best.name
      chaJie = gapDays === 0 ? '正授' : (gapDays > 0 ? '超神' : '接气')
    }
  }

  // ── 置闰：候选节气已远在符头之后（历日差 ≥ 门槛），且当前节气为芒种／大雪 ──
  // 触发的是「候选节气的日差」，而闰落在「当前节气」——重用本气三元。
  if (chaJie === '超神' && gapDays >= leapGap && leapAt.some((n) => sameJieqi(n, js.name))) {
    jieqi = js.name
    runJu = true
    chaJie = `超神·置闰（候选${candidateName} 在符头后 ${gapDays} 日 ≥ ${leapGap}，本气${js.name}重用三元）`
  } else if (chaJie === '超神' && !leapAt.some((n) => sameJieqi(n, js.name))) {
    chaJie = `超神（候选为${candidateName}；本气非芒种/大雪，典籍「虽超九日十日不可置闰」，不闰）`
  }

  const triple = juTripleOf(jieqi)
  const ju = triple[yuan] ?? triple[0] ?? 1
  const ri = jieqiRingIdx(jieqi)
  const yang = ri >= 0 ? ri < 12 : ['子', '丑', '寅', '卯', '辰', '巳'].includes(chart?.monthZhi)

  return {
    school: '符头（超神接气置闰）',
    jieqi,
    yuan,
    yuanName: ['上元', '中元', '下元'][yuan],
    ju,
    yang,
    triple,
    daysAfter: null,
    exact: !!fuAt,
    fuTou: fuGZ,
    fuTouAt: fuAt ? fmtDate(fuAt) : '',
    fuTouBack: back,
    chaJie,
    runJu,
    candidate: candidateName,
    candidateAt: candidateAt ? fmtDate(candidateAt) : '',
    gapDays,
    note: `符头法：日柱 ${dayGZ} 前推 ${back} 日得符头 ${fuGZ}（${fuAt ? fmtDate(fuAt) : '日不可得'}），`
      + `符头支${fuZhi}属${['子午卯酉', '寅申巳亥', '辰戌丑未'][yuan]} → ${['上元', '中元', '下元'][yuan]}；`
      + `符头与节气之关系：${chaJie}`,
  }
}

/**
 * 由某一公历日反查其对应的节气名（用 lunar 库不可用时的族内兜底）。
 *
 * 本模组**不 import 历法库**（契约要求纯函数、不引入新依赖），故用近似黄经表：
 * 二十四气在公历年的平均日期，容差 ±2 日只影响「节气名」，而局数表对相邻气
 * 差异有限；确有疑义时由 `chart.jieqi` 校正优先。此函数只在符头法的「候选节气」
 * 搜寻中使用，且结果会与 `chart.jieqi.prev` 交叉验证。
 *
 * @param {Date} d 公历日。
 * @returns {string} 节气名（繁体，对齐 JIEQI_RING）。
 */
const JIEQI_APPROX = [
  ['小寒', 1, 6], ['大寒', 1, 20], ['立春', 2, 4], ['雨水', 2, 19],
  ['惊蛰', 3, 6], ['春分', 3, 21], ['清明', 4, 5], ['穀雨', 4, 20],
  ['立夏', 5, 6], ['小满', 5, 21], ['芒种', 6, 6], ['夏至', 6, 21],
  ['小暑', 7, 7], ['大暑', 7, 23], ['立秋', 8, 8], ['处暑', 8, 23],
  ['白露', 9, 8], ['秋分', 9, 23], ['寒露', 10, 8], ['霜降', 10, 24],
  ['立冬', 11, 7], ['小雪', 11, 22], ['大雪', 12, 7], ['冬至', 12, 22],
]
function candidateJieqi(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const t = d.getTime()
  let best = null
  for (const [name, mm, dd] of JIEQI_APPROX) {
    for (const yy of [y - 1, y, y + 1]) {
      const cand = new Date(yy, mm - 1, dd).getTime()
      const dist = Math.abs(cand - t)
      if (!best || dist < best.dist) best = { name, dist }
    }
  }
  return best && best.dist <= 3 * 86400000 ? best.name : ''
}

/**
 * 奇门定局（三派并陈）。默认 **拆补**；日家按日柱定元，月家／年家按各自公开简法。
 *
 * 四家基准之别（`detail.基准` 一定会写出来）：
 * - **时家**：以占时干支起局，元由节气交接时刻起算（拆补）或符头定（符头派）。
 * - **日家**：以**日干支**起局——元由**日支**定（子午卯酉上元、寅申巳亥中元、辰戌丑未下元），
 *   局数取当日所处节气的三元表；故同一时辰内局数恒定，不随时辰变化。
 * - **月家**：以节气定局，取该气上元局数（月内不再分三元）。
 * - **年家**：以太岁所在定局，冬至后阳遁一局、夏至后阴遁九局。
 *
 * @param {object} chart 盘基。
 * @param {'时'|'日'|'月'|'年'} scale 起局基准。
 * @param {string} [school] 定局派：`拆补`（默认）｜`符头`｜`置闰`。
 * @returns {object} 定局结果。
 */
function qimenDingJu(chart, scale, school) {
  const js = jieqiStateOf(chart)
  const wantHead = school === '符头' || school === '置闰'

  if (scale === '日') {
    // 日家奇门：以日支定元（《奇門遁甲統宗·定三元法》符头支口径的日家变体），
    // 局数取当日节气的三元表；不再看时辰。
    const dayGZ = chart?.ganzhi?.day ?? '甲子'
    const dayZhi = dayGZ[1] ?? '子'
    const yuan = SI_ZHONG.includes(dayZhi) ? 0 : SI_MENG.includes(dayZhi) ? 1 : 2
    const triple = juTripleOf(js.name)
    const ri = jieqiRingIdx(js.name)
    const yang = ri >= 0 ? ri < 12 : ['子', '丑', '寅', '卯', '辰', '巳'].includes(chart?.monthZhi)
    return {
      school: '日家（以日支定三元，公开简法）',
      basis: `日干支 ${dayGZ}`,
      jieqi: js.name,
      yuan,
      yuanName: ['上元', '中元', '下元'][yuan],
      ju: triple[yuan] ?? triple[0] ?? 1,
      yang,
      triple,
      daysAfter: null,
      exact: js.atDate !== null,
      fuTou: dayGZ,
      fuTouAt: '',
      chaJie: '—',
      runJu: false,
      jiqiNote: js.note,
      note: `日家奇门：以日干支 ${dayGZ} 之支「${dayZhi}」属${['子午卯酉', '寅申巳亥', '辰戌丑未'][yuan]} → ${['上元', '中元', '下元'][yuan]}，`
        + `取${js.name}该元局数（时柱不参与；故同一日内局数恒定）`,
    }
  }

  if (scale === '年' || scale === '月') {
    // 年家／月家奇门通行简法：不取三元（年月之内不再分三元）。
    const ri = jieqiRingIdx(js.name)
    const yang = ri >= 0 ? ri < 12 : ['子', '丑', '寅', '卯', '辰', '巳'].includes(chart?.monthZhi)
    const ju = scale === '年' ? (yang ? 1 : 9) : (juTripleOf(js.name)[0] ?? 1)
    return {
      school: scale === '年' ? '年家（太岁年定局，公开简法）' : '月家（节气定局，公开简法）',
      basis: scale === '年' ? `年柱 ${chart?.ganzhi?.year ?? '—'}` : `月柱 ${chart?.ganzhi?.month ?? '—'}`,
      jieqi: js.name,
      yuan: 0,
      yuanName: '（年月家不分三元）',
      ju,
      yang,
      triple: juTripleOf(js.name),
      daysAfter: null,
      exact: js.atDate !== null,
      fuTou: '',
      fuTouAt: '',
      chaJie: '—',
      runJu: false,
      jiqiNote: js.note,
      note: scale === '年'
        ? `年家奇门：${yang ? '冬至→芒种为阳遁，取阳遁一局' : '夏至→大雪为阴遁，取阴遁九局'}（公开简法，不采超接置闰）`
        : `月家奇门：以${js.name}所处节气取该气上元局数（公开简法，不采超接置闰）`,
    }
  }

  const base = wantHead ? juFuTou(chart, js) : juChaiBu(chart, js)
  return { ...base, basis: `时干支 ${chart?.ganzhi?.hour ?? '—'}`, jiqiNote: js.note }
}

/** 值符/值使落宫时的规范：中五寄坤二。 */
const normGong = (g) => JI_GONG(g)

/**
 * 拼「符头」明细行。**取值一律给兜底，绝不留 `undefined`**（task-16）：
 * - 符头派：`符头日（符头日时刻，占日前 N 日）`；任一不可得则该项写 `—`。
 * - 拆补派：**不取符头**（以节气交接时刻起算），写明节后天数；`daysAfter` 不可得写 `—`。
 * - 日家：**以日支定三元**（`school` 含「日家」），符头日即日柱本身，不适用「占日前 N 日」。
 * - 月家／年家：不分三元，符头不适用。
 *
 * @param {object} p 奇门盘。
 * @param {'时'|'日'|'月'|'年'} scale 起局基准。
 * @returns {string} 一行说明。
 */
function fuTouLine(p, scale) {
  const school = String(p?.school ?? '')
  const dash = '—'
  if (school.includes('日家')) {
    return `（日家以**日支**定三元：本日柱 ${p.basis ? p.basis.replace(/^日干支\s*/, '') : dash} 之支定${p.yuanName}；符头法不适用于日家）`
  }
  if (school.includes('月家') || school.includes('年家')) {
    return `（${school.includes('年家') ? '年家' : '月家'}不分三元，不用符头；基准 ${p.basis || dash}）`
  }
  if (p?.fuTou) {
    const at = p.fuTouAt && String(p.fuTouAt).trim() ? String(p.fuTouAt) : dash
    const back = Number.isFinite(p.fuTouBack) ? String(p.fuTouBack) : dash
    return `${p.fuTou}日（${at}，占日前 ${back} 日）`
  }
  const days = Number.isFinite(p?.daysAfter) ? Number(p.daysAfter).toFixed(2) : dash
  return `（拆补法不取符头，按节后 ${days} 日定元）`
}

/**
 * 起奇门一盘（地盘 / 天盘干 / 九星 / 八门 / 八神 / 值符值使）。
 *
 * 五层运算的落宫规则（逐条有出处，见 detail.rule）：
 * - 地盘：三奇六仪自局数宫起，阳遁顺飞、阴遁逆飞（宫数 1→9 之洛书序）。
 * - 值符星：旬首（符首）所遁之仪在地盘上的**本位星**；值符随时干，落时干宫。
 * - 值使门：符首所遁之仪在地盘上的**本位门**；值使自其本位宫起，
 *   按阳顺阴逆数「本干支在旬中的序数」，沿**含中五**的九宫轨迹飞（CITE.符应经值使飞），
 *   落宫后寄坤二；八门自落宫起沿八宫环排布。
 * - 天盘干／九星：转盘＝整环刚性旋转（符首位→时干位）；飞盘＝九宫序飞布。
 * - 八神：自时干宫起，阳顺阴逆；显示名按阴阳局分列（阳含勾陈朱雀、阴含白虎玄武）。
 *
 * @param {object} chart 盘基。
 * @param {'时'|'日'|'月'|'年'} scale 基准。
 * @param {'转盘'|'飞盘'} pan 盘式。
 * @param {string} [school] 定局派。
 * @returns {object} 盘。
 */
function qimenPan(chart, scale, pan, school) {
  const dj = qimenDingJu(chart, scale, school)
  const { yang, ju } = dj
  const dir = yang ? 1 : -1
  const fei = pan === '飞盘'

  const diPan = diPanOf(yang, ju)
  const ganGong = gongOfGan(diPan)

  const scaleGZ = scaleGzOf(chart, scale)
  const sIdx = gzIdx60(scaleGZ)
  const xunHead = sIdx >= 0 ? (XUN_SEQ[Math.floor(sIdx / 10)] ?? '甲子') : '甲子'
  const step = sIdx >= 0 ? sIdx - Math.floor(sIdx / 10) * 10 : 0
  const fuShouGan = (XUN_DUN ?? {})[xunHead] ?? '戊'
  const fuShouGong = ganGong[fuShouGan] ?? 1
  const yongGan = panGanOf(scaleGZ)
  const yongGong = ganGong[yongGan] ?? 1
  const yongGongEff = normGong(yongGong)
  const fuGongEff = normGong(fuShouGong)

  // 值符星 / 值使门（本位）
  const zhiFuXing = xingAt(fuShouGong)
  const zhiShiMen = menAt(normGong(fuShouGong)) ?? '死门'

  // 天盘（九星 + 天盘干）：转盘（排宫）vs 飞盘（飞宫）
  //
  // **两法是两套落宫规则，不是同一条式子的两个名字**（实测：若把飞盘写成「八宫环上
  // 转同一量」，它与转盘在数学上恒等 —— 本模块早期版本正犯此错，故此处逐一写明）：
  //   · 转盘（排宫）：八宫环刚性旋转一量（符首本位宫 → 时干宫），**九星与天盘干同步**；
  //     天禽不入中五之外，恒居中宫（坤二所临为天芮）。
  //   · 飞盘（飞宫）：沿**洛书宫数序 1→2→…→9** 飞布（含中五宫），阳顺阴逆；
  //     九星与天盘干同沿此序，故**值符星自本位宫起、飞行到「时干宫」**，
  //     而各宫所得与转盘不同（八宫环与九宫序是两条不同的轨迹）。
  // 出处分野见 CITE.飞盘飞宫（horosa SCHOOL_OPTIONS「转盘=排宫(八卦轮转) / 飞盘=飞宫(洛书飞泊含中宫)」）。
  const tianXing = {}
  const tianGan = {}
  if (fei) {
    // 飞盘：九宫序飞布（含中五），整体沿洛书数序平移一量。
    // ⚠ 索引基准必须一致：起讫两端都用**坤二归一化后的宫位**（中五无方位，寄坤二），
    // 否则「中五起点」与「非中五终点」相减会得到错位的平移量（本模块早期版本正踩此坑，
    // 导致值符不落时干宫；调研 §7#7 亦点名「宫位索引基准混用必错」）。
    const kSrc = LUOSHU_PATH.indexOf(normGong(fuShouGong))
    const kDst = LUOSHU_PATH.indexOf(normGong(yongGong))
    const dK = mod(kDst - kSrc, 9)
    for (const dst of LUOSHU_PATH) {
      const src = LUOSHU_PATH[mod(LUOSHU_PATH.indexOf(dst) - dK, 9)]
      tianXing[dst] = xingAt(src)
      tianGan[dst] = diPan[src]
    }
  } else {
    const kSrc = RING8_PATH.indexOf(fuGongEff)
    const kDst = RING8_PATH.indexOf(yongGongEff)
    const dK = kDst - kSrc
    for (let k = 0; k < RING8_PATH.length; k += 1) {
      const g = RING8_PATH[k]
      const kg = RING8_PATH[mod(k - dK, 8)]
      tianXing[g] = xingAt(JI_GONG(kg))
      tianGan[g] = diPan[JI_GONG(kg)]
    }
    // 中五宫：转盘九星不入中，天禽居中不动；天盘干即地盘干。
    tianXing[5] = xingAt(5)
    tianGan[5] = diPan[5]
  }

  // 值符落宫：九星值符所临之宫。
  // 转盘与飞盘都在九宫内查（飞盘的九宫序含中五，故值符星可能落中宫）。
  // 两法皆合「值符随时干 → 落时干宫」（《奇门遁甲统宗》小值符加大值符；
  // 调研 A6 以 horosa `zhifuPai` 逐字符反解验算：值符星落宫 == 时干的地盘宫）。
  // 若值符为天禽，取其寄宫之星（天芮）所在以定位（中五无方位）。
  let zhiFuStarKey = zhiFuXing
  const zhiFuGong = (() => {
    if (zhiFuXing === '天禽') zhiFuStarKey = '天芮'
    return LUOSHU_PATH.find((g) => tianXing[g] === zhiFuStarKey) ?? yongGongEff
  })()
  const zhiFuInCenter = zhiFuGong === 5

  // 值使门落宫：沿含中五的洛书序飞 step 步（起于符首本位宫）
  // 调研 A6 反解 horosa `zhishiPai`：旬首宫起、阳顺阴逆，按「时干在本旬中的序位」逐宫推移，**含中5**。
  const zhiShiFlyGong = gongAdd(fuGongEff, dir * step)
  const zhiShiGong = normGong(zhiShiFlyGong)
  const zhiShiInCenter = zhiShiFlyGong === 5

  // 八门：自值使落宫起，沿八宫环按八门次序排布（两派共用；飞盘的八门排法各派互异，详「说明」）
  const menOrder = ['休门', '生门', '伤门', '杜门', '景门', '死门', '惊门', '开门']
  const mi = menOrder.indexOf(zhiShiMen)
  const doorOrder = mi >= 0 ? [...menOrder.slice(mi), ...menOrder.slice(0, mi)] : [...menOrder]
  const kDoor = RING8_PATH.indexOf(zhiShiGong)
  const tianMen = {}
  for (let k = 0; k < 8; k += 1) tianMen[RING8_PATH[mod(kDoor + k, 8)]] = doorOrder[k]

  // 八神：自值符宫（＝时干宫，寄坤二）起，阳顺阴逆。
  //   · 转盘＝八神（八卦轮转，不入中）：自时干宫沿八宫环布八神；
  //   · 飞盘＝**九神**（洛书飞泊，**含中宫**），神序亦与转盘不同
  //     —— 据调研 A7（horosa `DunJiaCalc.js:265-266`）：
  //        阳局 `符蛇阴合勾常雀地天`、阴局 `符蛇阴合虎常玄地天`（中宫亦受一神）。
  const FEI_GODS_YANG = ['值符', '螣蛇', '太阴', '六合', '勾陈', '太常', '朱雀', '九地', '九天']
  const FEI_GODS_YIN = ['值符', '螣蛇', '太阴', '六合', '白虎', '太常', '玄武', '九地', '九天']
  const tianShen = {}
  if (fei) {
    const gods9 = yang ? FEI_GODS_YANG : FEI_GODS_YIN
    const kS = LUOSHU_PATH.indexOf(yongGongEff === 5 ? 5 : normGong(yongGong))
    for (let k = 0; k < 9; k += 1) {
      tianShen[LUOSHU_PATH[mod(kS + dir * k, 9)]] = gods9[k]
    }
  } else {
    const gods8 = yang ? BASHEN_YANG : BASHEN_YIN
    const kShen = RING8_PATH.indexOf(yongGongEff)
    for (let k = 0; k < 8; k += 1) tianShen[RING8_PATH[mod(kShen + dir * k, 8)]] = gods8[k]
  }

  // 中五宫的门／神：显示为寄坤二（值使入中时另标旗标）
  if (tianMen[5] === undefined) tianMen[5] = '—'

  // 天禽寄宫（显示用）
  //   转盘：九星不入中五，天禽恒居本宫中五（坤二所临为天芮，故「天禽寄天芮」）。
  //   飞盘：九星按洛书序飞布，**中五亦为一站**，故中五所得之星即寄坤二者
  //        （天禽飞离中五时，中五另有他星；天禽落中五时无所谓寄）。
  const tianQinGong = 5
  const jiKunStar = (() => {
    if (fei) return tianXing[5] === '天禽' ? null : tianXing[5]
    return tianXing[2] === '天芮' ? '天禽' : null
  })()

  // 旬空 / 驿马
  const xunKongOf = (gz) => {
    const i = gzIdx60(gz)
    if (i < 0) return []
    const h = Math.floor(i / 10)
    return XUN_KONG_ZHI[h] ?? []
  }
  const kongScale = xunKongOf(scaleGZ)
  const kongDay = chart?.xunKong?.day ? [...String(chart.xunKong.day)] : xunKongOf(chart?.ganzhi?.day ?? '')
  const zhi = scaleGZ[1] ?? chart?.hourZhi ?? '子'
  const ma = shenShaOf('驿马', chart?.dayZhi ?? zhi) ?? shenShaOf('驿马', chart?.dayZhi ?? zhi) ?? maOf(chart?.dayZhi ?? zhi)

  return {
    ...dj, pan, scale, diPan, ganGong, tianGan, tianXing, tianMen, tianShen,
    fuShouGan, fuShouGong, fuGongEff, xunHead, step, scaleGZ, yongGan, yongGong, yongGongEff,
    zhiFuXing, zhiFuStarKey, zhiFuGong, zhiShiMen, zhiShiGong, zhiShiFlyGong, zhiShiInCenter,
    jiKunStar,
    zhiFuInCenter, tianQinGong, kongScale, kongDay, ma, dir, fei,
    rule: {
      地盘: '三奇六仪戊己庚辛壬癸丁丙乙，自局数宫起，阳遁顺飞、阴遁逆飞（宫数 1→9 之洛书序）',
      值符: `旬首${xunHead}遁${fuShouGan}，符首在 ${fuShouGong} 宫，本位星 ${zhiFuXing}；值符随时干，落时干宫（${fei ? '飞盘用宫数序' : '转盘沿八宫环'}）`,
      值使: `符首本位门 ${zhiShiMen}；自 ${fuGongEff} 宫起按阳顺阴逆数旬中第 ${step + 1} 位（${step} 步）→ ${zhiShiFlyGong} 宫${zhiShiInCenter ? '（入中五，寄坤二）' : ''}`,
      八门: '自值使落宫起，沿八宫环按休生伤杜景死惊开次序排布',
      八神: `自时干宫（${yongGongEff} 宫）起，${yang ? '阳遁顺布' : '阴遁逆布'}；${yang ? '阳局八神含勾陈、朱雀' : '阴局八神含白虎、玄武'}`,
      中五: '中五宫无门无方位，寄坤二宫（《奇门遁甲统宗》「中五合于坤二」）',
    },
  }
}

/** 六旬空亡地支（甲子旬空戌亥…）。 */
const XUN_KONG_ZHI = [
  ['戌', '亥'], ['申', '酉'], ['午', '未'], ['辰', '巳'], ['寅', '卯'], ['子', '丑'],
]

/** 驿马（三合局之冲）。出处见 CITE.驿马。 */
function maOf(z) {
  const j = ZHI.indexOf(z)
  if (j < 0) return '—'
  const grp = j % 4
  return ['寅', '巳', '申', '亥'][grp]
}

/** 拼九宫盘文本行。 */
function palaceLines(map, gong16) {
  const out = []
  for (let g = 1; g <= 9; g += 1) {
    const info = palInfo(g)
    let v = map?.[g]
    if (g === 16) v = gong16
    if (Array.isArray(v)) v = v.filter(Boolean).join('') || '—'
    out.push(`${g}宫${info.gua}(${info.dir}) ${v ?? '—'}`)
  }
  return out
}

/**
 * 单宫吉凶打分（门、星、神、三奇、十干克应、门宫生克、击刑入墓）。
 * @param {object} r 宫读数。
 * @returns {{s:number, keys:string[], marks:string[]}} 分、关键词、断法要素。
 */
function palaceScore(r) {
  let s = 0
  const keys = []
  const marks = []
  s += menLuck(r.men) * 0.30
  s += xingLuck(r.xing) * 0.24
  s += shenLuck(r.shen) * 0.18

  if (SANQI.includes(r.gan)) { s += 16; keys.push('三奇临宫') }
  if (r.gan === '庚') { s -= 14; keys.push('庚临宫') }

  if (r.men) {
    const rel = relation(menWx(r.men), r.wx)
    if (rel === '我克') { s -= 16; keys.push('门迫'); marks.push(`门迫（${r.men}${menWx(r.men)}克${r.gua}${r.wx}，客克主，凶）`) }
    else if (rel === '克我') { s -= 12; keys.push('宫迫'); marks.push(`宫迫（${r.gua}${r.wx}克${r.men}${menWx(r.men)}，主克客，凶）`) }
    else if (rel === '生我') { s += 12; keys.push('和义'); marks.push(`和义（宫生门，凶门不凶、吉门益吉）`) }
    else if (rel === '我生') { s -= 4; keys.push('门泄气') }
    else { s += 5; keys.push('门宫比和') }
  }

  const geju = (QIMEN_GEJU ?? {})[`${r.gan}${r.diGan}`] ?? null
  if (geju) { s += (geju.score ?? 0) * 0.45; keys.push(geju.name); marks.push(`十干克应：${r.gan}加${r.diGan}＝${geju.name}`) }

  // 六仪击刑（严式：只算值符之仪；此处给该宫的六仪是否落刑宫）
  const yi = YI_TO_XUN[r.gan] ? r.gan : (YI_TO_XUN[r.gan] ? r.gan : null)
  if (yi && JI_XING[yi] === r.g) { s -= 22; keys.push('六仪击刑'); marks.push(`六仪击刑（${YI_TO_XUN[yi]}直符之仪${yi}临${JI_XING[yi]}宫，${xingOf(ZHI[mod(gzIdx60(YI_TO_XUN[yi]) % 12, 12)])}刑）`) }

  // 三奇入墓
  if (QI_MU[r.gan]?.includes(r.g)) { s -= 18; keys.push('三奇入墓'); marks.push(`三奇入墓（${r.gan}奇临${r.g}宫，墓则气绝，不利举动）`) }

  return { s, keys, marks, geju: geju?.name ?? null }
}

/** 读一宫的星门神干。 */
function readPalace(p, g) {
  const info = palInfo(g)
  const men = p.tianMen[g]
  return {
    g,
    men: men && men !== '—' ? men : null,
    xing: p.tianXing[g] ?? null,
    shen: p.tianShen[g] ?? null,
    gan: p.tianGan[g] ?? null,
    diGan: p.diPan[g] ?? null,
    wx: info.wx,
    gua: info.gua,
    dir: info.dir,
  }
}

/**
 * 奇门断法要素：三奇得使、门迫/宫迫/和义、六仪击刑、三奇入墓、伏吟/反吟、五不遇时。
 * @param {object} chart 盘基。
 * @param {object} p 盘。
 * @returns {{marks:string[], keys:string[], score:number}} 要素、关键词、修正分。
 */
function qimenMarks(chart, p) {
  const marks = []
  const keys = []
  let score = 0

  // 三奇得使（《统宗》：乙奇加甲午甲戌、丙奇加甲子甲申、丁奇加甲寅甲辰）
  for (const qi of ['乙', '丙', '丁']) {
    const want = QI_DE_SHI[qi] ?? []
    for (let g = 1; g <= 9; g += 1) {
      if (p.tianGan[g] !== qi) continue
      const xunOfDi = YI_TO_XUN[p.diPan[g]] ?? ''
      if (want.some((w) => sameJia(w, xunOfDi))) {
        marks.push(`三奇得使（${qi}奇加地盘${p.diPan[g]}＝${xunOfDi}，于${g}宫${palInfo(g).gua}）`)
        score += 16
        keys.push('三奇得使')
      }
    }
  }

  // 六仪击刑（严式：值符之仪 ／ 宽式：任一六仪）——两式并陈
  const zhiFuYi = p.fuShouGan
  if (JI_XING[zhiFuYi] !== undefined) {
    const g = p.ganGong[zhiFuYi]
    if (g === JI_XING[zhiFuYi]) {
      marks.push(`六仪击刑·严式（值符之仪${zhiFuYi}＝${YI_TO_XUN[zhiFuYi]}临${g}宫）`)
      score -= 22
      keys.push('六仪击刑')
    }
  }
  // 宽式：**天盘**任一六仪落其刑宫（与严式并陈，各自标名）
  // 注：原先读 `p.tianGongOfYi`（从未定义 → 恒为 undefined → 宽式永不生效），
  // 现改为从 `p.tianGan` 现算，使宽式真正可出。
  const tianGongOfYi = {}
  for (const yi of ['戊', '己', '庚', '辛', '壬', '癸']) {
    for (let g = 1; g <= 9; g += 1) if (p.tianGan?.[g] === yi) tianGongOfYi[yi] = g
  }
  for (const yi of ['戊', '己', '庚', '辛', '壬', '癸']) {
    const g = tianGongOfYi[yi]
    if (g !== undefined && g === JI_XING[yi] && yi !== zhiFuYi) {
      marks.push(`六仪击刑·宽式（天盘${yi}临${g}宫；《法窍》另有「只算直符之仪」的严式读法）`)
      score -= 12
      keys.push('六仪击刑宽式')
    }
  }

  // 三奇入墓（天盘奇临墓宫；《统宗》乙2/丙6/丁8；《宝鉴》读法 乙2/丙丁6）
  for (const qi of ['乙', '丙', '丁']) {
    for (let g = 1; g <= 9; g += 1) {
      if (p.tianGan[g] !== qi) continue
      if (QI_MU[qi].includes(g)) {
        marks.push(`三奇入墓（天盘${qi}奇临${g}宫，《统宗》作${qi}奇墓${QI_MU[qi].join('/')}宫）`)
        score -= 16
        keys.push('三奇入墓')
      } else if (QI_MU_BAOJIAN[qi].includes(g)) {
        marks.push(`三奇入墓·《宝鉴》读法（天盘${qi}奇临${g}宫；《统宗》作${QI_MU[qi].join('/')}宫，两说并陈）`)
        score -= 10
        keys.push('三奇入墓(异说)')
      }
    }
  }

  // 伏吟 / 反吟（以九星为准：《烟波钓叟歌》天蓬加天蓬为伏吟、天蓬到天英为返吟）
  let fuYin = 0
  let fanYin = 0
  for (const g of RING8_PATH) {
    const base = xingAt(JI_GONG(g))
    if (p.tianXing[g] === base) fuYin += 1
    const oppG = ringAdd(g, 4)
    if (p.tianXing[oppG] === base || p.tianXing[g] === xingAt(JI_GONG(oppG))) fanYin += 1
  }
  if (fuYin >= 6) { marks.push(`伏吟（${fuYin}/8 宫天盘星加地盘本位星，《烟波钓叟歌》「就中伏吟为最凶，天蓬加着地天蓬」）`); score -= 20; keys.push('伏吟') }
  if (fanYin >= 6) { marks.push(`反吟（${fanYin}/8 宫天盘星临对冲宫，《钓叟歌》「天蓬若到天英上，须知即是返吟宫」）`); score -= 14; keys.push('反吟') }

  // 五不遇时（时干克日干，同性）：日干 → 时干 定式
  const dayGan = chart?.dayGan ?? ''
  const hourGan = (chart?.ganzhi?.hour ?? '')[0] ?? ''
  if (WU_BU_YU[dayGan] === hourGan) {
    marks.push(`五不遇时（${dayGan}日${chart?.ganzhi?.hour ?? ''}时，时干${hourGan}克日干${dayGan}，《遁甲演义》「纵有奇门不可行百事，凶」）`)
    score -= 20
    keys.push('五不遇时')
  }

  // 空亡：用神宫地支落旬空
  if (p.kongScale?.length) {
    for (const z of p.kongScale) {
      const gi = ZHI.indexOf(z)
      if (gi >= 0) marks.push(`旬空（${p.scaleGZ}所属旬空${p.kongScale.join('')}，${z}方／${z}宫虚）`)
    }
  }

  // 驿马
  if (p.ma && p.ma !== '—') marks.push(`驿马在${p.ma}（日支${chart?.dayZhi ?? '—'}之三合冲）`)

  return { marks: [...new Set(marks)], keys: [...new Set(keys)], score }
}

/** 「甲子」与「甲子」式旬首名比较（容忍空值）。 */
function sameJia(a, b) {
  if (!a || !b) return false
  return a === b
}

/** 奇门用神取法（人＝日干宫，事＝基准柱干宫）。 */
function qimenYong(chart, p, scale) {
  const gzTable = { 时: chart?.ganzhi?.hour, 日: chart?.ganzhi?.day, 月: chart?.ganzhi?.month, 年: chart?.ganzhi?.year }
  const shiGZ = gzTable[scale] ?? chart?.ganzhi?.hour ?? ''
  const shiGong = p.ganGong[panGanOf(shiGZ)] ?? 1
  const renGong = p.ganGong[panGanOf(chart?.ganzhi?.day ?? '')] ?? 1
  return { shiGZ, shiGong, renGong }
}

// ───────────────────────── 引擎：奇门（25–29）─────────────────────────

/** 奇门五层盘的共用实作。 */
function qimenEngine(chart, entry) {
  const scale = entry?.params?.scale ?? '时'
  const pan = entry?.params?.pan ?? '转盘'
  const school = entry?.params?.school ?? '拆补'
  const p = qimenPan(chart, scale, pan, school)
  const { shiGong, renGong, shiGZ } = qimenYong(chart, p, scale)
  const rs = readPalace(p, shiGong)
  const rr = readPalace(p, renGong)
  const a = palaceScore(rs)
  const b = palaceScore(rr)
  const mk = qimenMarks(chart, p)

  let score = a.s * 0.62 + b.s * 0.38 + mk.score * 0.6
  const keys = [
    `${p.yang ? '阳' : '阴'}遁${p.ju}局`, `${p.zhiFuXing}值符`, `${p.zhiShiMen}值使`,
    rs.men ?? '—', ...a.keys, ...mk.keys,
  ]

  if (shiGong !== renGong) {
    const rel = relation(palInfo(renGong).wx, palInfo(shiGong).wx)
    score += (DAY_REL_SCORE[rel] ?? 0) * 0.5
    keys.push(`人${rel}事`)
  } else { score += 6; keys.push('人宅同宫') }

  if (p.zhiShiInCenter) { score -= 10; keys.push('值使入中') }
  score = clamp(score, -100, 100)

  const wuxing = emptyWuxing()
  wuxing[rs.wx] += 2
  wuxing[rr.wx] += 1
  if (rs.men) wuxing[menWx(rs.men)] += 1
  if (rs.xing) wuxing[xingWx(rs.xing)] += 1
  wuxing[chart?.monthWx ?? '土'] += 1

  const starLines = {}
  for (let g = 1; g <= 9; g += 1) {
    let extra = ''
    if (!p.fei && g === 5) extra = '（居中宫本位，寄坤二）'
    else if (!p.fei && g === 2) extra = '（天禽寄此）'
    else if (p.fei && g === 5) extra = '（天禽不动）'
    else if (p.fei && g === 2 && p.jiKunStar && p.jiKunStar !== '天芮') extra = `（${p.jiKunStar}自中五寄此）`
    starLines[g] = `${p.tianXing[g] ?? '—'}${extra}`
  }

  const scaleLabel = scale === '时' ? '时家' : scale === '日' ? '日家' : scale === '月' ? '月家' : '年家'
  return {
    score,
    essence: `${scaleLabel}${p.yang ? '阳' : '阴'}遁${p.ju}局${p.pan}·${p.zhiFuXing}值符落${p.zhiFuGong}宫·${rs.men ?? '—'}临${rs.gua}`,
    keys: uniqKeys(keys),
    wuxing,
    timing: `${p.ju}数为应（${p.jieqi}${p.yuanName}，用神在${rs.dir}方）`,
    detail: {
      基准: `${scaleLabel}奇门｜起局基准：${p.basis ?? '—'}｜值符值使一律随「本${scale}柱 ${p.scaleGZ}」取旬首`,
      流派: `定局：${p.school}｜盘式：${p.pan}奇门`
        + `${p.fei
          ? '（**飞宫**：天盘干与九星同沿洛书宫数序 1→2→…→9 飞布，含中五宫，阳顺阴逆；值符星自本位宫飞到时干宫）'
          : '（**排宫**：天盘干与九星同步，沿洛书八宫环刚性旋转一量，值符星飞到时干宫，中五寄坤二）'}`,
      定局: `${p.yang ? '阳遁' : '阴遁'}${p.ju}局（${p.jieqi}·${p.yuanName}；节气三元表 [${(p.triple ?? []).join('/')}]）`,
      节气: `${p.jieqi}${p.jiqiNote && p.jiqiNote.includes('退用') ? `（历法库按日切换，已按交接时刻校正：${p.jiqiNote}）` : ''}｜符头关系：${p.chaJie}`,
      符头: fuTouLine(p, scale),
      旬首: `${p.xunHead}（遁${p.fuShouGan}），本${scale}柱${p.scaleGZ}在旬中第 ${p.step + 1} 位`,
      值符: `${p.zhiFuXing}（符首本位${p.fuShouGong}宫）→ 落 ${p.zhiFuGong} 宫`
        + `${p.zhiFuGong === p.yongGongEff ? '（＝时干宫）' : ''}`
        + `${p.yongGong === 5 ? '（时干入中，寄坤二）' : ''}`
        + `${p.zhiFuXing === '天禽' ? '（天禽居中，取其寄宫之星天芮定位）' : ''}`,
      值使: `${p.zhiShiMen} 自 ${p.fuGongEff} 宫起、按${p.yang ? '阳' : '阴'}遁${p.yang ? '顺' : '逆'}数旬中第 ${p.step + 1} 位 → ${p.zhiShiFlyGong} 宫${p.zhiShiInCenter ? '（入中五，寄坤二）' : ''}`,
      地盘三奇六仪: palaceLines(p.diPan),
      天盘九星: palaceLines(starLines),
      天盘八门: palaceLines(p.tianMen),
      八神: palaceLines(p.tianShen),
      天盘干: palaceLines(p.tianGan),
      用神宫: `${shiGong}宫${rs.gua}（${scale}柱${shiGZ}）门${rs.men ?? '—'}星${rs.xing ?? '—'}神${rs.shen ?? '—'}天盘干${rs.gan ?? '—'}地盘干${rs.diGan ?? '—'}${a.geju ? `｜十干克应 ${a.geju}` : ''}`,
      人宫: `${renGong}宫${rr.gua}（日柱${chart?.ganzhi?.day ?? '—'}）门${rr.men ?? '—'}星${rr.xing ?? '—'}神${rr.shen ?? '—'}${b.geju ? `｜十干克应 ${b.geju}` : ''}`,
      断法要素: mk.marks.length ? mk.marks : ['（未见三奇得使／门迫／击刑／入墓／伏吟反吟／五不遇时）'],
      空亡驿马: `旬空：${p.kongScale.join('') || '—'}（${p.scaleGZ}旬）｜日旬空：${p.kongDay.join('') || '—'}｜驿马：${p.ma}`,
      断: `以用神宫为主：${rs.men ?? '—'}${menLuck(rs.men) >= 40 ? '为吉门' : menLuck(rs.men) <= -40 ? '为凶门' : '为中平门'}，`
        + `${rs.xing ?? '—'}${xingLuck(rs.xing) >= 30 ? '星吉' : xingLuck(rs.xing) <= -30 ? '星凶' : '星平'}；`
        + `再看人宫（日干）与用神宫之生克：人${relation(palInfo(renGong).wx, palInfo(shiGong).wx)}事`,
      cite: [CITE.法窍拆补, CITE.法窍门迫, CITE.法窍和义, CITE.统宗得使, CITE.宝鉴击刑, CITE.统宗入墓, CITE.钓叟伏吟, CITE.演义五不遇, CITE.符应经值使飞, CITE.统宗禽寄],
      evidence: [
        `阴阳遁：${p.yang ? '冬至→芒种' : '夏至→大雪'}（节气 ${p.jieqi} 环序 ${jieqiRingIdx(p.jieqi)}）`,
        `定局：${p.school}｜${p.note}`,
        `地盘：${p.fuShouGan} 在 ${p.fuShouGong} 宫 → 值符星 ${p.zhiFuXing}；${p.yongGan} 在 ${p.yongGong} 宫 → 值符落 ${p.zhiFuGong} 宫`,
        `门宫生克：${rs.men ?? '—'}(${menWx(rs.men)}) 对 ${rs.gua}(${rs.wx}) 为 ${rs.men ? relation(menWx(rs.men), rs.wx) : '—'}`,
        ...mk.marks.slice(0, 4),
      ],
      rule: p.rule,
      说明: '说明：奇门五层（地盘三奇六仪／天盘九星＋天盘干／八门／八神／值符值使）皆已排全；'
        + '定局采拆补法（可用 params.school 切符头／置闰），超神接气置闰只在符头法下生效并逐项标明。'
        + '门／星／神吉凶分为公开通例之编辑取值，非秘本原文数字。',
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 大六壬
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 月将（中气过宫）。**只有中气换将**：取「占时所处节气」，若其为中气则用该中气之将；
 * 若为经节（立春、惊蛰…）则退用上一个中气之将。
 *
 * 出处见 CITE.月将中气、CITE.月将歌。
 *
 * 第二通路校验：若 `chart.astro.sunLon` 可用，则以「太阳视黄经所落之次」重算一次，
 * 两者不一致时只在 `detail` 标分歧（古法用平气、今历用定气，恒差可达数日），
 * **不改盘**——月将以中气过宫（定气）为准。
 *
 * @param {object} chart 盘基。
 * @param {object} [js] 节气校正结果。
 * @returns {{zhi:string, name:string, from:string, source:string, alt:string|null, note:string}}
 */
function yueJiangOf(chart, js) {
  const st = js ?? jieqiStateOf(chart)
  let from = ''
  let zhi = null

  if (isZhongqi(st.name)) {
    from = st.name
    zhi = yuejiangByZhongqi(st.name)
  } else {
    const pz = prevZhongqi(st.name)
    from = pz ?? st.name
    zhi = yuejiangByZhongqi(from)
  }

  // 兜底：data 表的 24 项表（v1 表，仅在族内中气表失效时用），再兜底月建六合。
  let source = '中气过宫'
  if (!zhi) {
    zhi = (YUEJIANG_BY_JIEQI ?? {})[st.name] ?? null
    source = 'data.YUEJIANG_BY_JIEQI（v1 表兜底，未按中气细分）'
  }
  if (!zhi) {
    zhi = liuheOf(chart?.monthZhi ?? '子')
    source = '月建六合（兜底）'
  }

  // 第二通路：太阳视黄经（chart.astro 可选）
  //
  // 校准结果（本模组自测，2026 全年 12 中气）：以「太阳视黄经所入之次」按每 30°
  // 一宫推算，在**十二个中气上与本表逐条一致**（雨水亥、春分戌、谷雨酉、小满申、
  // 夏至未、大暑午、处暑巳、秋分辰、霜降卯、小雪寅、冬至丑、大寒子），
  // 故只保留「是否贴近宫界」的提示，不作分歧告警：
  //   k = floor((sunLon − 330°) / 30°) → 亥戌酉申未午巳辰卯寅丑子
  // 注：古历「太阳过宫」按二十八宿实测度分（如《御定六壬直指》「雨水后四日零八时
  // 入危十三度到亥宫」），与今历定气有岁差级偏置，故本模组**以中气过宫为准**。
  let alt = null
  let altNote = ''
  const lon = Number(chart?.astro?.sunLon)
  if (Number.isFinite(lon)) {
    const k = mod(Math.floor(mod(lon - 330, 360) / 30), 12)
    alt = ['亥', '戌', '酉', '申', '未', '午', '巳', '辰', '卯', '寅', '丑', '子'][k]
    const edge = mod(lon - 330, 360) % 30
    altNote = (edge < 2 || edge > 28)
      ? `；视黄经距宫界仅 ${Math.min(edge, 30 - edge).toFixed(2)}°，交宫已有/将有变动`
      : ''
    if (alt !== zhi) {
      altNote = `；视黄经（${lon.toFixed(2)}°）按今历定气推算得 ${alt}，与中气过宫差一次`
        + `（古历太阳过宫按二十八宿实测度分，与今历中气有固定偏置）`
      alt = null
    }
  }

  const note = `月将取中气过宫得 ${zhi}（${jiangNameOf(zhi)}）`
    + `${alt ? '；视黄经第二通路一致' : ''}${altNote}`

  // 两个别名都给出：本函数内部用 `from`，而各引擎的 detail 模板历史上写作 `yuejiangFrom`
  // —— 只给一个名字会让另一处插值出 `undefined`（task-16 的 #38 就是这个坑）。
  return {
    zhi, name: jiangNameOf(zhi), from, yuejiangFrom: from, source,
    alt: Number.isFinite(lon) ? alt : null, lon: Number.isFinite(lon) ? lon : null, note,
  }
}

/**
 * 起大六壬盘（天地盘 / 四课 / 三传 / 十二天将 / 六亲 / 旬空 / 年命）。
 * @param {object} chart 盘基。
 * @returns {object} 盘。
 */
function liurenPan(chart) {
  const dayGan = chart?.dayGan ?? ''
  const dayZhi = chart?.dayZhi ?? ''
  if (!dayGan || !dayZhi) return null
  const shi = chart?.hourZhi || '子'
  const st = jieqiStateOf(chart)
  const yj = yueJiangOf(chart, st)
  const t = ZHI.indexOf(shi)
  const j = ZHI.indexOf(yj.zhi)

  // 天地盘：月将加占时
  const tian = {}
  const diOf = {}
  for (let e = 0; e < 12; e += 1) {
    const v = ZHI[mod(j + (e - t), 12)]
    tian[ZHI[e]] = v
    diOf[v] = ZHI[e]
  }

  // 四课：干寄宫上神、干上之上神、日支上神、支上之上神
  const jg = JIGONG_V2[dayGan] ?? (JIGONG ?? {})[dayGan] ?? '寅'
  const ke = [
    { down: jg, up: tian[jg] },
    { down: tian[jg], up: tian[tian[jg]] },
    { down: dayZhi, up: tian[dayZhi] },
    { down: tian[dayZhi], up: tian[tian[dayZhi]] },
  ]

  const sc = sanChuanOf(chart, ke, tian, diOf, yj.zhi, shi)
  const jp = jiangPanOf(chart, diOf, shi)
  const chuan = sc.chuan
  const kong = chart?.xunKong?.day ?? (xunOf(chart?.ganzhi?.day ?? '甲子').kong ?? []).join('')

  const liuQinOf = (z) => LIUQIN[relation(GAN_WUXING[dayGan] ?? '土', wxOf(z))] ?? '—'

  const chuanInfo = chuan.map((z, i) => {
    const cg = ZHI_CANGGAN?.[z] ?? []
    const jiang = jp?.at?.[z] ?? null
    return {
      pos: ['初传', '中传', '末传'][i],
      zhi: z,
      wx: wxOf(z),
      jiang: jiang?.name ?? '—',
      jiangWx: jiang?.wx ?? '—',
      jiangLuck: jiang?.luck ?? 0,
      kong: String(kong).includes(z),
      god: cg.length > 0 ? tenGodOf(dayGan, cg[0]) : '—',
      liuQin: liuQinOf(z),
      name: jiangNameOf(z),
      ws: wangShuai(wxOf(z), chart?.monthWx ?? '土'),
    }
  })

  const keInfo = ke.map((k, i) => ({
    idx: i + 1,
    down: k.down,
    up: k.up,
    upWx: wxOf(k.up),
    downWx: wxOf(k.down),
    relate: relation(wxOf(k.down), wxOf(k.up)),
    liuQin: LIUQIN[relation(wxOf(k.down), wxOf(k.up))] ?? '—',
    jiang: jp?.at?.[k.up]?.name ?? '—',
    kong: String(kong).includes(k.up),
  }))

  return {
    shi, yuejiang: yj.zhi, yuejiangName: yj.name, yuejiangFrom: yj.from,
    yuejiangSource: yj.source, yuejiangNote: yj.note, yuejiangAlt: yj.alt,
    jieqi: st.name, jieqiNote: st.note,
    tian, diOf, ke, keInfo, chuan, keti: sc.keti, ketiNote: sc.ketiNote, trace: sc.trace,
    jp, chuanInfo, kong, dayGan, dayZhi, jg,
    fuYin: yj.zhi === shi,
    fanYin: mod(j - t, 12) === 6,
    nianMing: chart?.birthChart?.yearZhi ?? chart?.yearZhi ?? '—',
  }
}

/**
 * 取三传（九宗门）。
 *
 * 判据顺序（v2，据 horosa `liureng/ChuangChart.js` 判定序；与 ZhouYiLab 守卫条件语义等价）：
 * **伏吟 → 返吟 → 贼克 → 比用 → 涉害 → 八专 → 遥克 → 别责 → 昴星（兜底）**。
 * 伏吟／返吟为课体前提故先判，但其**内部先吃贼克**（有克仍以贼克发用，中末另取）；
 * v1 把八专排在返吟之后会抢课，v2 已改。
 *
 * @param {object} chart 盘基。
 * @param {Array<{down:string,up:string}>} ke 四课。
 * @param {object} tian 地盘支 → 天盘支。
 * @param {object} diOf 天盘支 → 地盘支。
 * @param {string} yuejiang 月将支。
 * @param {string} shi 占时支。
 * @returns {{chuan:string[], keti:string, ketiNote:string, trace:string[], cite:string[]}}
 */
function sanChuanOf(chart, ke, tian, diOf, yuejiang, shi) {
  const dayGan = chart?.dayGan ?? '甲'
  const dayZhi = chart?.dayZhi ?? '子'
  const yang = isYangGan(dayGan)
  const trace = []
  const cite = [CITE.六壬九宗]

  // ── 上下贼克 ──
  const zei = [] // 下贼上（下克上）
  const kes = [] // 上克下
  for (let i = 0; i < 4; i += 1) {
    const { up, down } = ke[i]
    if (relation(wxOf(down), wxOf(up)) === '我克') zei.push(i)
    else if (relation(wxOf(up), wxOf(down)) === '我克') kes.push(i)
  }
  trace.push(`贼克：下贼上 ${zei.length ? zei.map((i) => i + 1).join(',') : '无'}；上克下 ${kes.length ? kes.map((i) => i + 1).join(',') : '无'}`)

  /** 比用（知一）：取与日干阴阳相比者。 */
  const biYong = (cands) => {
    const same = cands.filter((i) => isYangZhi(ke[i].up) === yang)
    return same.length === 1 ? same[0] : null
  }
  /**
   * 涉害：自所临地盘位顺数至本家，计途中「克我」之支数，深者取。
   *
   * 四格名（据 ZhouYiLab `src/da_liu_ren/da_liu_ren.cpp:696` 的
   * 「涉害卦 / 见机卦 / 察微卦 / 复等卦」，与 horosa「见机课/涉害课」命名互补）：
   *   涉害卦＝深浅不等、径取深者；见机卦＝深浅等而取临**四孟**者；
   *   察微卦＝取临**四仲/四季**者；复等卦＝终不可别，末以阳日干上神、阴日支上神收束。
   */
  const sheHai = (cands) => {
    const depth = cands.map((i) => {
      const up = ke[i].up
      const start = ZHI.indexOf(ke[i].down)
      // 天盘支即本家时（自临本位）走满一周，仍计受克
      const steps = advZhi(ke[i].down, up)
      let cnt = 0
      const hits = []
      for (let s = 0; s < steps; s += 1) {
        const z = ZHI[mod(start + s, 12)]
        if (relation(wxOf(z), wxOf(up)) === '我克') { cnt += 1; hits.push(z) }
      }
      return { i, cnt, hits }
    })
    const max = Math.max(...depth.map((d) => d.cnt))
    let top = depth.filter((d) => d.cnt === max).map((d) => d.i)
    trace.push(`涉害（涉害卦）：${depth.map((d) => `第${d.i + 1}课${d.cnt}重(${d.hits.join('') || '无'})`).join(' ')}`)
    if (top.length > 1) {
      for (const grp of [SI_MENG, SI_ZHONG, SI_JI]) {
        const f = top.filter((i) => grp.includes(ke[i].down))
        if (f.length === 1) {
          const ge = grp === SI_MENG ? '见机卦（取临四孟者）' : '察微卦（取临四仲/四季者）'
          trace.push(`涉害深浅平，取临${grp === SI_MENG ? '四孟' : grp === SI_ZHONG ? '四仲' : '四季'}者第${f[0] + 1}课 → ${ge}`)
          return f[0]
        }
        if (f.length > 1) { top = f; break }
      }
    }
    if (top.length === 1) return top[0]
    const by = biYong(top)
    if (by !== null) { trace.push('涉害复等（复等卦），以比用收束'); return by }
    trace.push(`涉害复等（复等卦），末以${yang ? '阳日取干上神' : '阴日取支上神'}收束`)
    return yang ? 0 : 2
  }
  /** 从候选里定一课，并回报所用之法。 */
  const pickFrom = (cands) => {
    if (cands.length === 1) return { idx: cands[0], method: '贼克' }
    const by = biYong(cands)
    if (by !== null) return { idx: by, method: '比用' }
    return { idx: sheHai(cands), method: '涉害' }
  }
  /** 三传递传：中传取初传上神，末传取中传上神。 */
  const chain3 = (c1) => [c1, tian[c1], tian[tian[c1]]]

  /** 四课中不同上神之数：4 全备、3 不全（别责）、2 只两课（八专）。 */
  const distinctUp = new Set(ke.map((k) => k.up)).size
  /** 干支是否同位（八专前提）。 */
  const samePosition = ke[0].up === ke[2].up && ke[0].down === ke[2].down
  const twoKe = distinctUp <= 2

  const fuYin = yuejiang === shi
  const fanYin = mod(ZHI.indexOf(yuejiang) - ZHI.indexOf(shi), 12) === 6
  const hasKe = zei.length > 0 || kes.length > 0

  // ═══ 课体前提 1：伏吟 ═══
  if (fuYin) {
    cite.push(CITE.六壬伏吟)
    if (hasKe) {
      const { idx, method } = pickFrom(zei.length > 0 ? zei : kes)
      const c1 = ke[idx].up
      const c2 = xingOf(c1)
      const c3 = xingOf(c2)
      trace.push(`伏吟有克：以${method}取第${idx + 1}课上神${c1}为初传，中末递取初传、中传之刑（${c1}→${c2}→${c3}）`)
      return { chuan: [c1, c2, c3], keti: '伏吟', ketiNote: '伏吟有克（自任/自信），事体静而不动，得克方有转机；中末递取其刑', trace, cite }
    }
    const c1 = yang ? ke[0].up : ke[2].up
    let c2 = xingOf(c1)
    if (c2 === c1) c2 = yang ? ke[2].up : ke[0].up
    let c3 = xingOf(c2)
    if (c3 === c2) c3 = chong(c2)
    trace.push(`伏吟无克：无克刚干柔取辰，${yang ? '阳日取干上神' : '阴日取支上神'}${c1}为初传，中末递取其刑（${c1}→${c2}→${c3}）`)
    return { chuan: [c1, c2, c3], keti: '伏吟', ketiNote: '伏吟无克（自任/自信），天地不动，事主迟滞呻吟；刚干柔辰发用', trace, cite }
  }

  // ═══ 课体前提 2：返吟 ═══
  if (fanYin) {
    cite.push(CITE.六壬返吟)
    if (hasKe) {
      const { idx, method } = pickFrom(zei.length > 0 ? zei : kes)
      trace.push(`返吟有克：以${method}取第${idx + 1}课上神${ke[idx].up}为初传，中末递传（天地盘互为冲）`)
      return { chuan: chain3(ke[idx].up), keti: '返吟', ketiNote: '返吟有克，天地相冲而有所制，事有反复终可解', trace, cite }
    }
    const ma = maOf(chart?.dayZhi ?? dayZhi)
    trace.push(`返吟无亲（井栏射）：四课皆冲、无上下克，取驿马${ma}发用，中取支上神${ke[2].up}、末取干上神${ke[0].up}`)
    cite.push(CITE.驿马)
    return { chuan: [ma, ke[2].up, ke[0].up], keti: '返吟', ketiNote: '返吟无亲（井栏射），天地皆冲、事无依靠，多反复', trace, cite }
  }

  // ═══ 贼克（含比用、涉害）═══
  if (zei.length > 0) {
    const { idx, method } = pickFrom(zei)
    const sub = method === '贼克' ? '重审（一下贼上，事起于下）' : `${method}（下贼上者众）`
    trace.push(`下贼上 ${zei.length} 处，以${method}法定第${idx + 1}课上神${ke[idx].up}为初传`)
    if (method !== '贼克') cite.push(method === '比用' ? CITE.六壬比用 : CITE.六壬涉害)
    return { chuan: chain3(ke[idx].up), keti: method, ketiNote: `${method}·${sub}`, trace, cite }
  }
  if (kes.length > 0) {
    const { idx, method } = pickFrom(kes)
    const sub = method === '贼克' ? '元首（一上克下，事起于上）' : `${method}（上克下者众）`
    trace.push(`上克下 ${kes.length} 处，以${method}法定第${idx + 1}课上神${ke[idx].up}为初传`)
    if (method !== '贼克') cite.push(method === '比用' ? CITE.六壬比用 : CITE.六壬涉害)
    return { chuan: chain3(ke[idx].up), keti: method, ketiNote: `${method}·${sub}`, trace, cite }
  }

  // ═══ 八专：干支同位、两课无克 ═══
  //
  // **必须在遥克与别责之前**（本模块判定序据 horosa `liureng/ChuangChart.js:191-244` 的
  // 「发三传九法判定序（课经条文口径）」注释，与 ZhouYiLab 的守卫条件语义等价）：
  //   · 课经明训：八专「有克照常以克贼比涉论，如无克贼比涉，不复取遥克」——「遥者远也」，
  //     干支同处一位无远可言，故两课无克径入八专。
  //   · 八专须在别责之前：八专（一课＝三课）会令二课＝四课，从而满足「某两课相同」的
  //     别责前提，若先判别责会被误吞。
  // 有克的情形已在上面的贼克/比用/涉害分支返回，故此处只管「两课无克」。
  if (twoKe && samePosition) {
    const ganShang = ke[0].up
    cite.push(CITE.六壬八专)
    const c1 = yang ? zhiAdd(ganShang, 2) : zhiAdd(ke[3].up, -2)
    trace.push(`八专法：干支同位、四课只得两课且无克贼比涉（八专不复取遥克，课经「遥者远也」）。`
      + `${yang ? `阳日自干上神${ganShang}连身顺数三位` : `阴日自第四课上神${ke[3].up}连身逆数三位`}得初传${c1}，中末俱取干上神${ganShang}`)
    return { chuan: [c1, ganShang, ganShang], keti: '八专', ketiNote: '八专课，干支同位、四课只得两课，事多重叠纠缠；阴私之神入传为帷薄不修', trace, cite }
  }

  // ═══ 遥克（无上下克；八专已被上面拦截）═══
  const dayWx = GAN_WUXING[dayGan] ?? '土'
  const yaoShang = [0, 1, 2, 3].filter((i) => relation(wxOf(ke[i].up), dayWx) === '我克') // 上神克日干＝蒿矢
  const yaoXia = [0, 1, 2, 3].filter((i) => relation(dayWx, wxOf(ke[i].up)) === '我克') // 日干克上神＝弹射

  if (yaoShang.length > 0 || yaoXia.length > 0) {
    const cands = yaoShang.length > 0 ? yaoShang : yaoXia
    const idx = cands.length === 1 ? cands[0] : (biYong(cands) ?? cands[0])
    const kind = yaoShang.length > 0 ? '蒿矢（上神克日干）' : '弹射（日干克上神）'
    trace.push(`遥克法：无上下克贼、非八专，${kind}者 ${cands.length} 处，取第${idx + 1}课上神${ke[idx].up}为初传`)
    cite.push(CITE.六壬遥克)
    return { chuan: chain3(ke[idx].up), keti: '遥克', ketiNote: `遥克·${yaoShang.length > 0 ? '蒿矢' : '弹射'}，事隔他方，缓而不亲`, trace, cite }
  }

  // ═══ 别责：四课不全（三课备）且无克无遥 ═══
  if (distinctUp === 3) {
    const ganShang = ke[0].up
    cite.push(CITE.六壬别责)
    if (yang) {
      const heGan = (WUHE ?? {})[dayGan] ?? '己'
      const ji = JIGONG_V2[heGan] ?? '未'
      const c1 = tian[ji]
      trace.push(`别责法：四课不全（三课备）且无克无遥。阳日取干合之神（${dayGan}合${heGan}，${heGan}寄${ji}）上神${c1}为初传，中末俱取干上神${ganShang}`)
      return { chuan: [c1, ganShang, ganShang], keti: '别责', ketiNote: '别责课（芜淫），四课不全只有三课、事不由己，须借力他方', trace, cite }
    }
    const c1 = sanhePrevOf(dayZhi)
    trace.push(`别责法：四课不全（三课备）且无克无遥。阴日取日支${dayZhi}三合前一位${c1}为初传，中末俱取干上神${ganShang}`)
    return { chuan: [c1, ganShang, ganShang], keti: '别责', ketiNote: '别责课（芜淫），四课不全只有三课、事不由己，须借力他方', trace, cite }
  }

  // ═══ 昴星：四课全备而无克无遥 ═══
  cite.push(CITE.六壬昴星)
  if (yang) {
    const c1 = tian['酉']
    trace.push(`昴星法：四课全备而无克无遥。刚日虎视，取地盘酉上神${c1}为初传；「刚日先辰而后日」，中取支上神${ke[2].up}、末取干上神${ke[0].up}`)
    return { chuan: [c1, ke[2].up, ke[0].up], keti: '昴星', ketiNote: '昴星·虎视，事多暗昧而机在外', trace, cite }
  }
  const c1 = diOf['酉']
  trace.push(`昴星法：四课全备而无克无遥。柔日冬蛇掩目，取天盘酉所临地盘支${c1}为初传；「柔日先日而后辰」，中取干上神${ke[0].up}、末取支上神${ke[2].up}`)
  return { chuan: [c1, ke[0].up, ke[2].up], keti: '昴星', ketiNote: '昴星·冬蛇掩目，事多暗昧而机在内', trace, cite }
}

/**
 * 布十二天将。
 *
 * 贵人：日干定昼夜贵（卯→申为昼用阳贵、酉→寅为夜用阴贵）；
 * 贵人所乘之地盘宫在亥子丑寅卯辰则顺布、在巳午未申酉戌则逆布。
 *
 * @param {object} chart 盘基。
 * @param {object} diOf 天盘支 → 地盘支（此处用于取贵人所乘之支对应地盘宫）。
 * @param {string} shi 占时支。
 * @returns {object|null} 将盘。
 */
function jiangPanOf(chart, diOf, shi) {
  const dayGan = chart?.dayGan ?? ''
  const gr = guirenOf(dayGan)
  if (!gr) return null
  const isZhou = ZHOU_HOURS.includes(shi)
  const guiren = isZhou ? gr[0] : gr[1]
  const guirenDi = diOf[guiren] ?? guiren // 贵人所乘地盘宫（天盘贵人落在地盘何宫）
  const shun = SHUN_GONG.includes(guirenDi)
  const at = {}
  const gi = ZHI.indexOf(guirenDi)
  for (let k = 0; k < 12; k += 1) {
    const z = ZHI[mod(gi + (shun ? k : -k), 12)]
    const name = JIANG12_SEQ[k]
    at[z] = JIANG_INFO[name] ?? { name, wx: '土', luck: 0 }
  }
  return { guiren, isZhou, guirenDi, shun, at, dayGan, shi }
}

/** 四课文本。 */
function keLines(p) {
  const names = ['第一课（干上）', '第二课（干上之上）', '第三课（支上）', '第四课（支上之上）']
  return p.ke.map((k, i) => `${names[i]}：${k.up} 临 ${k.down}`)
}

/** 天地盘文本。 */
function tianPanLines(p) {
  const out = []
  for (const e of ZHI) {
    const up = p.tian[e]
    const j = p.jp?.at?.[up]?.name
    out.push(`${e}→${up}${j ? `(${j})` : ''}`)
  }
  return out
}

/**
 * 三传结构分（递生/递克/合局/会局/一气/旺衰/空亡）。
 * @param {object} chart 盘基。
 * @param {object} p 六壬盘。
 * @returns {{s:number, keys:string[], notes:string[]}}
 */
function chuanStructure(chart, p) {
  const [c1, c2, c3] = p.chuan
  const w = [wxOf(c1), wxOf(c2), wxOf(c3)]
  let s = 0
  const keys = []
  const notes = []

  const r01 = relation(w[0], w[1])
  const r12 = relation(w[1], w[2])
  if (r01 === '我生' && r12 === '我生') { s += 22; keys.push('三传递生'); notes.push('初生中、中生末，事体顺遂有接续（递生人举荐）') }
  if (r01 === '我克' && r12 === '我克') { s -= 18; keys.push('三传递克'); notes.push('初克中、中克末，层层相制（三传互克众人欺）') }
  const r20 = relation(w[2], w[0])
  if (r20 === '我生' || r20 === '生我') { s += 6; notes.push('首尾相生，事有回护') }
  if (w[0] === w[1] && w[1] === w[2]) { s += 8; keys.push('三传一气'); notes.push(`三传同属${w[0]}，气专而不杂`) }

  const sanhe = ZHI_SANHE_EQ(c1, c2, c3)
  if (sanhe) { s += 18; keys.push('三传合局'); notes.push(`三传会成${sanhe}局，事体归一`) }
  const sanhui = ZHI_SANHUI_EQ(c1, c2, c3)
  if (sanhui) { s += 15; keys.push('三传会局'); notes.push(`三传会成${sanhui}方，气势偏聚`) }

  const ws = wangShuai(w[0], chart?.monthWx ?? '土')
  s += (ws.score - 55) * 0.35
  notes.push(`初传${c1}(${w[0]})于月令${chart?.monthWx ?? '—'}为${ws.state}`)

  if (p.chuanInfo[0]?.kong) { s -= 26; keys.push('初传空亡'); notes.push('初传落空，发用无力，须待填实') }
  else if (p.chuanInfo[1]?.kong || p.chuanInfo[2]?.kong) { s -= 10; keys.push('中末空亡'); notes.push('中末传空，后段虚耗') }

  return { s, keys, notes }
}

/** 三支同属一个三合局。 */
function ZHI_SANHE_EQ(a, b, c) {
  const j = { 申: '水', 子: '水', 辰: '水', 亥: '木', 卯: '木', 未: '木', 寅: '火', 午: '火', 戌: '火', 巳: '金', 酉: '金', 丑: '金' }
  return j[a] && j[a] === j[b] && j[b] === j[c] ? j[a] : null
}
/** 三支同属一个三会方局。 */
function ZHI_SANHUI_EQ(a, b, c) {
  const j = { 寅: '木', 卯: '木', 辰: '木', 巳: '火', 午: '火', 未: '火', 申: '金', 酉: '金', 戌: '金', 亥: '水', 子: '水', 丑: '水' }
  return j[a] && j[a] === j[b] && j[b] === j[c] ? j[a] : null
}

/** 三传／四课与日干的关系分。 */
const DAY_REL_SCORE = { 生我: 26, 比和: 16, 我克: 12, 我生: -8, 克我: -30 }

// ───────────────────────── 引擎：大六壬（31–33、40）─────────────────────────

/** 大六壬·四课三传。 */
function liurenEngine(chart) {
  const p = liurenPan(chart)
  if (!p) return null
  const dayWx = GAN_WUXING[p.dayGan] ?? '土'
  const st = chuanStructure(chart, p)
  const kt = ketiOf(p.keti)

  const rel1 = relation(dayWx, wxOf(p.chuan[0]))
  const rel3 = relation(dayWx, wxOf(p.chuan[2]))
  let score = kt.score * 0.5 + (DAY_REL_SCORE[rel1] ?? 0) * 1.0 + (DAY_REL_SCORE[rel3] ?? 0) * 0.4 + st.s
  const keys = [p.keti, `初传${p.chuan[0]}`, rel1, ...st.keys]
  score = clamp(score, -100, 100)

  const wuxing = emptyWuxing()
  for (const c of p.chuan) wuxing[wxOf(c)] += 1
  wuxing[chart?.monthWx ?? '土'] += 1
  wuxing[dayWx] += 1

  return {
    score,
    essence: `${p.yuejiangName}加${p.shi}·${p.keti}·初传${p.chuan[0]}(${wxOf(p.chuan[0])})${rel1}`,
    keys: uniqKeys(keys),
    wuxing,
    timing: `${p.chuan[0]}日/月应（初传发用）`,
    detail: {
      月将: `${p.yuejiang}（${p.yuejiangName}）加占时${p.shi}｜取自中气「${p.yuejiangFrom}」｜${p.yuejiangSource}`,
      月将校验: p.yuejiangNote,
      节气校正: p.jieqiNote,
      四课: keLines(p),
      三传: p.chuan.map((z, i) => `${['初', '中', '末'][i]}传 ${z}(${wxOf(z)}) ${p.chuanInfo[i].jiang} ${p.chuanInfo[i].liuQin}${p.chuanInfo[i].kong ? ' 空' : ''}`),
      课体: `${p.keti}｜${p.ketiNote}`,
      取传过程: p.trace,
      天地盘: tianPanLines(p),
      十二天将: p.jp ? tianPanLines(p).map((l, i) => `${ZHI[i]}宫 ${p.jp.at[ZHI[i]]?.name ?? '—'}`) : ['（贵人未得）'],
      用神与日干: `日干${p.dayGan}(${dayWx})｜初传${rel1}（${LIUQIN[rel1] ?? '—'}）｜末传${relation(dayWx, wxOf(p.chuan[2]))}`,
      结构: st.notes,
      旬空: `${p.kong}｜年命${p.nianMing}`,
      断: `${p.ketiNote}；${(DAY_REL_SCORE[rel1] ?? 0) > 0 ? '初传生日干，事来就我' : (DAY_REL_SCORE[rel1] ?? 0) < 0 ? '初传克日干，事来相逼' : '初传与日干同类，事在己身'}`
        + `${st.keys.includes('初传空亡') ? '，然初传落空，须待填实' : ''}`,
      cite: [...new Set([CITE.月将中气, CITE.月将歌, CITE.六壬九宗, ...(p.citeExtra ?? [])])],
      evidence: [
        `月将：占时所处节气 ${p.jieqi} → 取${p.yuejiangFrom} → 月将 ${p.yuejiang}（${p.yuejiangName}）`,
        `天地盘：月将${p.yuejiang}加占时${p.shi}`,
        `四课：干寄宫${p.jg}上神${p.ke[0].up}、再上神${p.ke[1].up}；支${p.dayZhi}上神${p.ke[2].up}、再上神${p.ke[3].up}`,
        ...p.trace.slice(0, 4),
      ],
      说明: '说明：月将严格按中气过宫（只中气换将，经节不换），交界以节气交接时刻为界；'
        + '三传按九宗门**判定序**（伏吟→返吟→贼克→比用→涉害→**八专**→遥克→别责→昴星兜底），'
        + '伏吟返吟内部先取贼克；八专须在遥克之前（课经「无克贼比涉不复取遥克」）。',
    },
  }
}

/** 大六壬·课体。 */
function liurenKeEngine(chart) {
  const p = liurenPan(chart)
  if (!p) return null
  const st = chuanStructure(chart, p)
  const kt = ketiOf(p.keti)
  const keDistinct = new Set(p.ke.map((k) => `${k.up}${k.down}`)).size

  let score = kt.score * 1.15 + st.s * 0.8
  const keys = [p.keti, `${keDistinct}课`, ...st.keys]
  if (keDistinct === 2) { score -= 14; keys.push('四课不全') }
  if (p.fuYin) { score -= 10; keys.push('天地伏吟') }
  if (p.fanYin) { score -= 8; keys.push('天地返吟') }
  score = clamp(score, -100, 100)

  const wuxing = emptyWuxing()
  wuxing[wxOf(p.chuan[0])] += 2
  for (const k of p.ke) wuxing[wxOf(k.up)] += 0.5
  wuxing[chart?.monthWx ?? '土'] += 1

  const twelve = {
    贼克: '贼克（重审/元首）', 比用: '比用（知一）', 涉害: '涉害', 遥克: '遥克（蒿矢/弹射）',
    昴星: '昴星（虎视/冬蛇掩目）', 别责: '别责（芜淫）', 八专: '八专', 伏吟: '伏吟（自任/自信）', 返吟: '返吟（无亲/井栏射）',
  }

  return {
    score,
    essence: `课体${p.keti}·四课${keDistinct}课·${st.keys[0] ?? '三传平顺'}`,
    keys: uniqKeys(keys),
    wuxing,
    timing: `${p.chuan[2]}日/月应（末传定终局）`,
    detail: {
      课体: p.keti,
      课体名: twelve[p.keti] ?? p.keti,
      课体释义: kt.note,
      课体注: p.ketiNote,
      四课: p.keInfo.map((k) => `第${k.idx}课：${k.up}(${k.upWx}) 临 ${k.down}(${k.downWx})｜${k.relate}｜乘${k.jiang}${k.kong ? '【空】' : ''}`),
      课数: `${keDistinct} / 4（${keDistinct < 4 ? '有重复，课不全' : '四课全备'}）`,
      三传: p.chuan.join(' → '),
      三传结构: st.notes,
      取传过程: p.trace,
      九宗判据顺序: '伏吟 → 返吟 → 贼克 → 比用 → 涉害 → 八专 → 遥克 → 别责 → 昴星（兜底）；'
        + '伏吟/返吟为课体前提、内部仍先取贼克。此序据 horosa ChuangChart.js 判定序注释，与 ZhouYiLab 守卫条件语义等价',
      断: `${kt.note}；${st.keys.length > 0 ? `三传见${st.keys.join('、')}` : '三传无合无冲，平顺无奇'}`,
      cite: [CITE.六壬九宗, CITE.六壬比用, CITE.六壬涉害, CITE.六壬遥克, CITE.六壬昴星, CITE.六壬别责, CITE.六壬八专, CITE.六壬伏吟, CITE.六壬返吟],
      evidence: [
        `四课上神：${p.ke.map((k) => k.up).join('/')}；不同上神 ${new Set(p.ke.map((k) => k.up)).size} 个`,
        `课体判定：${p.keti}（${p.ketiNote}）`,
        ...p.trace,
      ],
      说明: '说明：九宗门取传次序为 伏吟→返吟→贼克（含比用、涉害）→八专→遥克→别责→昴星（兜底）；'
        + '涉害复等时先取临四孟者，再同比用，末以阳日干上神、阴日支上神收束（各家收束法略异）；'
        + '别责、八专、昴星中末传取法见各分支说明。',
    },
  }
}

/** 大六壬·十二天将。 */
function liurenJiangEngine(chart) {
  const p = liurenPan(chart)
  if (!p || !p.jp) return null
  const jp = p.jp
  const c = p.chuanInfo

  let score = c[0].jiangLuck * 0.5 + c[1].jiangLuck * 0.3 + c[2].jiangLuck * 0.2
  const keys = [c[0].jiang, c[1].jiang, c[2].jiang, jp.shun ? '贵人顺布' : '贵人逆布']
  const good = c.filter((x) => x.jiangLuck > 0).length
  const bad = c.filter((x) => x.jiangLuck < 0).length
  score += (good - bad) * 8
  keys.push(jp.isZhou ? '昼贵' : '夜贵')
  const rel = relation(GAN_WUXING[jp.dayGan] ?? '土', wxOf(jp.guirenDi))
  score += (DAY_REL_SCORE[rel] ?? 0) * 0.3
  score += (wangShuai(c[0].jiangWx === '—' ? '土' : c[0].jiangWx, chart?.monthWx ?? '土').score - 55) * 0.2
  score = clamp(score, -100, 100)

  const wuxing = emptyWuxing()
  for (const x of c) if (x.jiangWx !== '—') wuxing[x.jiangWx] += 1
  wuxing[chart?.monthWx ?? '土'] += 1

  return {
    score,
    essence: `${jp.isZhou ? '昼' : '夜'}贵${jp.guiren}${jp.shun ? '顺' : '逆'}布·${c[0].jiang}乘${c[0].zhi}·${c[1].jiang}乘${c[1].zhi}`,
    keys: uniqKeys(keys),
    wuxing,
    timing: `${c[0].zhi}日应（${c[0].jiang}乘初传）`,
    detail: {
      贵人: `${jp.dayGan}日${jp.isZhou ? '昼（卯→申）' : '夜（酉→寅）'}贵取${jp.guiren}，贵人所乘地盘宫为${jp.guirenDi}，故${jp.shun ? '顺布' : '逆布'}十二天将`,
      十二天将盘: ZHI.map((z) => `${z}上${jp.at[z]?.name ?? '—'}`),
      三传乘将: c.map((x) => `${x.pos} ${x.zhi} 乘 ${x.jiang}(${x.jiangWx}·${x.jiangLuck > 0 ? '吉将' : x.jiangLuck < 0 ? '凶将' : '平将'})`),
      吉将数: `${good} 吉 / ${bad} 凶`,
      将名对照: JIANG12_SEQ.join('、'),
      月将: `${p.yuejiang}（${p.yuejiangName}）加${p.shi}`,
      断: `${c[0].jiang}乘初传${c[0].jiangLuck > 0 ? '，吉将临用，事多顺遂' : c[0].jiangLuck < 0 ? '，凶将临用，事多阻滞' : '，平将临用，事无大起落'}；贵人${jp.shun ? '顺治' : '逆治'}主事势${jp.shun ? '顺行易达' : '多逆折'}`,
      cite: [CITE.贵人歌, CITE.贵人顺逆, CITE.月将中气],
      evidence: [
        `日干${jp.dayGan} → 贵人表 [${(guirenOf(jp.dayGan) ?? []).join(',')}]；占时${jp.shi}属${jp.isZhou ? '昼' : '夜'} → 取${jp.guiren}`,
        `贵人所乘地盘宫 ${jp.guirenDi} ∈ ${jp.shun ? '亥子丑寅卯辰（顺）' : '巳午未申酉戌（逆）'} → ${jp.shun ? '顺布' : '逆布'}`,
        `三传乘将：${c.map((x) => `${x.zhi}乘${x.jiang}(${x.jiangLuck})`).join('、')}`,
      ],
      说明: '说明：贵人起法用「甲戊庚牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸兔蛇藏，六辛逢马虎」，'
        + '阴阳贵人分昼（阳）夜（阴）：卯至申为昼用阳贵、酉至寅为夜用阴贵；'
        + '贵人临亥子丑寅卯辰（地盘宫）顺布十二将，临巳午未申酉戌逆布。将之吉凶分为公开通例之编辑取值。',
    },
  }
}

/** 三传九宗（三传发用与结构专断）。 */
function sanchuanEngine(chart) {
  const p = liurenPan(chart)
  if (!p) return null
  const dayWx = GAN_WUXING[p.dayGan] ?? '土'
  const st = chuanStructure(chart, p)
  const kt = ketiOf(p.keti)
  const [c1, c2, c3] = p.chuan
  const rel1 = relation(dayWx, wxOf(c1))
  const rel2 = relation(dayWx, wxOf(c2))
  const rel3 = relation(dayWx, wxOf(c3))

  let score = kt.score * 0.7 + st.s * 0.9
    + ((DAY_REL_SCORE[rel1] ?? 0) + (DAY_REL_SCORE[rel2] ?? 0) * 0.6 + (DAY_REL_SCORE[rel3] ?? 0) * 0.4)
  const keys = [p.keti, `${c1}${c2}${c3}`, rel1, ...st.keys]
  score = clamp(score, -100, 100)

  const wuxing = emptyWuxing()
  wuxing[wxOf(c1)] += 1.5
  wuxing[wxOf(c2)] += 1
  wuxing[wxOf(c3)] += 1
  wuxing[chart?.monthWx ?? '土'] += 1

  return {
    score,
    essence: `三传${c1}${c2}${c3}·${p.keti}·${st.keys[0] ?? '三传平顺'}`,
    keys: uniqKeys(keys),
    wuxing,
    timing: `${c3}日应（末传归着）`,
    detail: {
      九宗取传: `${p.keti}（${p.ketiNote}）`,
      取传过程: p.trace,
      三传: [
        `初传 ${c1}（${wxOf(c1)}·${p.chuanInfo[0].liuQin}）${p.chuanInfo[0].jiang}${p.chuanInfo[0].kong ? ' 空' : ''} — 日干${rel1}`,
        `中传 ${c2}（${wxOf(c2)}·${p.chuanInfo[1].liuQin}）${p.chuanInfo[1].jiang}${p.chuanInfo[1].kong ? ' 空' : ''} — 日干${rel2}`,
        `末传 ${c3}（${wxOf(c3)}·${p.chuanInfo[2].liuQin}）${p.chuanInfo[2].jiang}${p.chuanInfo[2].kong ? ' 空' : ''} — 日干${rel3}`,
      ],
      三传结构: st.notes,
      初末相因: `初传${c1}为发用（事之始），末传${c3}为归着（事之终）；${relation(wxOf(c3), wxOf(c1)) === '我生' ? '末生初，终局回护' : relation(wxOf(c1), wxOf(c3)) === '我生' ? '初生末，事有接续' : '首尾不相生，中途须自守'}`,
      九宗释义: Object.entries(KETI_V2).map(([k, v]) => `${k}：${v.note}`),
      空亡: `日旬空${p.kong}｜初传${p.chuanInfo[0].kong ? '落空' : '不空'}`,
      断: `${p.ketiNote}；三传${st.keys.length > 0 ? `见${st.keys.join('、')}` : '无合无冲'}，初传${rel1}（${LIUQIN[rel1] ?? '—'}）、末传${rel3}`,
      cite: [CITE.六壬九宗, CITE.六壬比用, CITE.六壬涉害, CITE.六壬遥克, CITE.六壬昴星, CITE.六壬别责, CITE.六壬八专, CITE.六壬伏吟, CITE.六壬返吟, CITE.驿马],
      evidence: [
        `课体：${p.keti}｜四课上神 ${p.ke.map((k) => k.up).join('/')}`,
        `三传：${c1}→${c2}→${c3}（${wxOf(c1)}→${wxOf(c2)}→${wxOf(c3)}）`,
        ...p.trace,
      ],
      说明: '说明：九宗＝贼克（重审/元首）、比用、涉害、遥克、昴星、别责、八专、伏吟、返吟；判定序见 detail.九宗判据顺序；'
        + '伏吟、返吟为课体前提，先于贼克链判断，但其内部有克时仍以贼克发用；'
        + '八专不看遥克（歌诀「两课无克号八专」），别责须四课不全且无克无遥。',
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 引擎表（12 个引擎，覆盖 #25–#40）
// ═══════════════════════════════════════════════════════════════════════════

export const engines = {
  /** #25–#29 奇门遁甲（时/日/月/年家 · 转盘/飞盘）。 */
  qimen(chart, entry) {
    return cleanOutcome(qimenEngine(chart, entry))
  },

  /** #30 奇门·局数法（阴阳遁、节气三元、符头、超接置闰、三奇落宫）。 */
  qimenJu(chart, entry) {
    const school = entry?.params?.school ?? '拆补'
    const p = qimenPan(chart, '时', '转盘', school)
    const qiGong = {}
    for (const g of SANQI) qiGong[g] = p.ganGong[g] ?? 0
    const sanQiJu = [qiGong.乙, qiGong.丙, qiGong.丁]

    // 三奇得使（天盘奇加地盘仪之旬首）
    const deShi = []
    for (const qi of ['乙', '丙', '丁']) {
      const want = QI_DE_SHI[qi] ?? []
      for (let g = 1; g <= 9; g += 1) {
        if (p.tianGan[g] !== qi) continue
        const x = YI_TO_XUN[p.diPan[g]] ?? ''
        if (want.includes(x)) deShi.push(`${qi}奇加${p.diPan[g]}(${x})于${g}宫`)
      }
    }

    const juWx = palInfo(p.ju).wx
    const ws = wangShuai(juWx, chart?.monthWx ?? '土')
    const odd = p.ju % 2 === 1

    let score = 0
    const keys = [`${p.yang ? '阳' : '阴'}遁${p.ju}局`, p.yuanName]
    score += p.yang ? (odd ? 10 : 5) : (odd ? -6 : 2)
    score += p.yuan === 0 ? 8 : p.yuan === 1 ? 2 : -6
    if (String(p.chaJie).startsWith('正授')) { score += 10; keys.push('正授') }
    else if (String(p.chaJie).startsWith('超神')) { score -= 6; keys.push('超神') }
    else if (String(p.chaJie).startsWith('接气')) { score += 4; keys.push('接气') }
    if (p.runJu) { score -= 4; keys.push('置闰') }
    if (p.exact === false) score -= 3
    else if (school === '拆补' && p.daysAfter !== null && p.daysAfter < 0.2) { score += 6; keys.push('新气初交') }
    if (deShi.length > 0) { score += 12 * deShi.length; keys.push('三奇得使') }
    keys.push(`三奇在${sanQiJu.join('/')}宫`)
    keys.push(`局${ws.state}`)
    score += (ws.score - 55) * 0.3
    score = clamp(score, -100, 100)

    const wuxing = emptyWuxing()
    wuxing[juWx] += 2
    wuxing[chart?.monthWx ?? '土'] += 1
    for (const g of SANQI) wuxing[GAN_WUXING[g] ?? '木'] += 0.5

    return cleanOutcome({
      score,
      essence: `${p.yang ? '阳' : '阴'}遁${p.ju}局·${school === '拆补' ? `拆补·节后${(p.daysAfter ?? 0).toFixed(1)}日` : `符头${p.fuTou}·${String(p.chaJie).slice(0, 2)}`}·${p.yuanName}·三奇${(deShi.length > 0 ? '得使' : '未得使')}`,
      keys: uniqKeys(keys),
      wuxing,
      timing: `${p.ju}数为应（${p.jieqi}${p.yuanName}）`,
      detail: {
        采用流派: `${p.school}｜${school === '拆补' ? '拆补派以节气交接时刻为严格分界，不用超接置闰' : '符头派以符头为体、节气为用，置闰锚定芒种／大雪'}`,
        局数: `${p.yang ? '阳遁' : '阴遁'}${p.ju}局`,
        节气三元: `${p.jieqi} 三元 [${(p.triple ?? []).join('/')}] → 取${p.yuanName}`,
        符头: fuTouLine(p, '时'),
        超接置闰: `${p.chaJie}${p.runJu ? '（本气重用三元＝闰局）' : ''}`,
        节气校正: p.jiqiNote ?? '—',
        三奇落宫: `乙${qiGong.乙}宫 丙${qiGong.丙}宫 丁${qiGong.丁}宫`,
        三奇得使: deShi.length > 0 ? deShi : ['（三奇未得使其旬首）'],
        值符值使: `${p.zhiFuXing}值符落${p.zhiFuGong}宫，${p.zhiShiMen}值使落${p.zhiShiFlyGong}宫${p.zhiShiInCenter ? '（入中五，寄坤二）' : ''}`,
        局气: `局数${p.ju}属${juWx}，月令${chart?.monthWx ?? '—'}，${ws.state}`,
        断: `${p.yang ? '阳遁' : '阴遁'}${p.ju}局${p.yuanName}，${String(p.chaJie).slice(0, 2)}得气；三奇${deShi.length > 0 ? '得使可用' : '未得使，须借门星之吉'}`,
        cite: [CITE.法窍拆补, CITE.宝鉴符头为体, CITE.演义置闰, CITE.统宗定三元, CITE.统宗得使, CITE.拆补五日一元],
        evidence: [
          `阴阳遁：节气 ${p.jieqi} 环序 ${jieqiRingIdx(p.jieqi)}（<12 为阳遁）`,
          `定局：${p.note}`,
          `局数 ${p.ju} 落 ${p.ju} 宫属 ${juWx}，月令 ${chart?.monthWx ?? '—'} → ${ws.state}（${(ws.score - 55).toFixed(1)} 修正）`,
          `三奇得使：${deShi.length > 0 ? deShi.join('；') : '无'}`,
        ],
        说明: '说明：本引擎专断局数（阴阳遁、节气三元、符头、超接置闰、三奇落宫与得使），不重排星门神。'
          + '默认拆补派；超神／接气／正授／置闰只在符头派下生效。边界：阴阳遁与三元皆以节气交接**时刻**为界（历法库按日切换时已校正）。',
      },
    })
  },

  /** #31 大六壬·四课三传。 */
  liuren(chart) {
    return cleanOutcome(liurenEngine(chart))
  },

  /** #32 大六壬·课体。 */
  liurenKe(chart) {
    return cleanOutcome(liurenKeEngine(chart))
  },

  /** #33 大六壬·十二天将。 */
  liurenJiang(chart) {
    return cleanOutcome(liurenJiangEngine(chart))
  },

  /** #34 太乙神数·九宫。 */
  taiyi(chart) {
    return cleanOutcome(taiyiEngine(chart))
  },

  /** #35 太乙·计神算（approx）。 */
  taiyiJi(chart) {
    return cleanOutcome(taiyiJiEngine(chart))
  },

  /** #36 小六壬。 */
  xiaoliuren(chart) {
    return cleanOutcome(xiaoLiuRenEngine(chart))
  },

  /** #37 中六壬（天罡掌诀）。 */
  zhongliuren(chart) {
    return cleanOutcome(zhongLiuRenEngine(chart))
  },

  /** #38 六壬金口诀。 */
  jinkoujue(chart) {
    return cleanOutcome(jinKouJueEngine(chart))
  },

  /** #39 马前课。 */
  maqianke(chart) {
    return cleanOutcome(maQianKeEngine(chart))
  },

  /** #40 三传九宗。 */
  sanchuan(chart) {
    return cleanOutcome(sanchuanEngine(chart))
  },
}

// ═══════════════════════════════════════════════════════════════════════════
// 太乙神数
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 起太乙盘。
 *
 * **积年**：《太乙统宗宝鉴》〈求太乙积年术〉「置演上元甲子，距大元大德七年癸卯，
 * 岁积一千一十五万五千二百一十九年，上验往古每年减一、下验将来每年加一」，
 * 通行程式取「公元年 + 10153917」（常数本身即上述积年，故只取其模数；
 * 诸本对「加／减一年」的起算点略有出入，本盘另列 ±1 年的太乙宫以供比对）。
 *
 * **太乙宫次**：同上〈求四计太乙所在宫次术〉——入局积数以**太乙小周法 240** 去之，
 * 不尽以**行宫率 3** 约之，命起一宫、顺行八宫、**不入中五**。
 *
 * **计神**：同上〈求四计计神所在术〉——以**计神周法 12** 去之，命起**寅**、
 * **逆行**十二辰次。（v1 作「自寅起顺行」，与典籍相反，v2 更正。）
 *
 * **始击／主客大将参将／主客算**：诸本互异（《统宗宝鉴》引淘金歌以「太岁合神、
 * 文昌、定计目」层层推），本模块只取公开可推部分，`taiyiJi` 标 approx 并明说。
 *
 * @param {object} chart 盘基。
 * @returns {object|null} 盘。
 */
function taiyiPan(chart) {
  const year = chart?.solar?.y
  if (!Number.isFinite(year)) return null
  // 入局积数：每年加一，故用 (公元年 - 1) 与年柱干支同源。
  const gzYear = gzIdx60(chart?.ganzhi?.year ?? '') >= 0 ? chart.ganzhi.year : ''
  const ji = TAIYI_YUAN_V2 + year
  const nXiao = mod(ji, TAIYI_XIAOZHOU)
  const gongIdx = Math.floor(nXiao / TAIYI_XINGGONG_RATE)
  const ruNian = mod(nXiao, TAIYI_XINGGONG_RATE) + 1
  const gong = TAIYI_GONG_RING[mod(gongIdx, 8)]
  const ruNianStep = mod(nXiao, TAIYI_XIAOZHOU)

  // 计神：命起寅、逆行十二辰（每次一步）
  const jiShenIdx = mod(2 - mod(ji, JISHEN_ZHOU), 12)
  const jiShen = ZHI[jiShenIdx]
  const jiShenNext = ZHI[mod(jiShenIdx - 1, 12)]

  const taiSui = chart?.ganzhi?.year?.[1] ?? chart?.yearZhi ?? '子'

  // 文昌（天目）：行十六神、遇干坤（四维）重留一算。此处按简法取太乙对宫。
  const oppositeRingIdx = mod(gongIdx + 4, 8)
  const shiJi = TAIYI_GONG_RING[oppositeRingIdx]
  const zhuDa = TAIYI_GONG_RING[mod(gongIdx + 3, 8)]
  const zhuCan = TAIYI_GONG_RING[mod(gongIdx + 6, 8)]
  const keDa = TAIYI_GONG_RING[mod(oppositeRingIdx + 3, 8)]
  const keCan = TAIYI_GONG_RING[mod(oppositeRingIdx + 6, 8)]

  const gongZhiOf = (g) => (GONG_ZHI ?? {})[g] ?? ZHI[mod(g, 12)]
  const step = (from, to) => {
    const d = mod(ZHI.indexOf(to) - ZHI.indexOf(from), 12)
    return d === 0 ? 12 : d
  }
  const zhuSuan = step(gongZhiOf(gong), jiShen)
  const keSuan = step(gongZhiOf(shiJi), jiShen)

  return {
    year, ji, nXiao, gongIdx, ruNian, ruNianStep, gong, jiShen, jiShenNext, taiSui, shiJi,
    zhuDa, zhuCan, keDa, keCan, zhuSuan, keSuan,
    gongZhi: gongZhiOf(gong), shiJiZhi: gongZhiOf(shiJi),
    gongShen: GONG_16SHEN_V2[gong] ?? '—',
    shiJiShen: GONG_16SHEN_V2[shiJi] ?? '—',
    yangGong: TAIYI_YANG.includes(gong),
    gzYear,
    // ±1 年的太乙宫（供比对积年常数之起算差）
    gongNext: TAIYI_GONG_RING[mod(gongIdx + 1, 8)],
    gongPrev: TAIYI_GONG_RING[mod(gongIdx - 1, 8)],
  }
}

/** 太乙盘文本。 */
function taiyiLines(p) {
  return [
    `太乙：${p.gong}宫（${palInfo(p.gong).gua}·${palInfo(p.gong).dir}）${p.gongShen}，入宫第${p.ruNian}年`,
    `始击（客目·简法取太乙对宫）：${p.shiJi}宫 ${p.shiJiShen}`,
    `计神：${p.jiShen}（起寅逆行）`,
    `太岁：${p.taiSui}${p.gzYear ? `（年柱${p.gzYear}）` : ''}`,
    `主大将：${p.zhuDa}宫；主参将：${p.zhuCan}宫`,
    `客大将：${p.keDa}宫；客参将：${p.keCan}宫`,
    `主算：${p.zhuSuan}；客算：${p.keSuan}`,
  ]
}

// ═══════════════════════════════════════════════════════════════════════════
// 六宫（小六壬 / 马前课）
// ═══════════════════════════════════════════════════════════════════════════

/** 农历月（闰月取绝对值，闰六月作第六月后再加一位计）。 */
function lunarMonthOf(chart) {
  const m = Number(chart?.lunar?.month)
  if (!Number.isFinite(m) || m === 0) return 1
  return mod(Math.abs(m) - 1, 12) + 1
}

/**
 * 六宫三轮掐指：大安起正月，月上起初一，日上起子时。
 * 起课用**农历月日**与**占时支**，逐轮顺数。
 *
 * @param {number} m 农历月。
 * @param {number} d 农历日。
 * @param {number} hIdx 时辰序（子＝0）。
 * @returns {number} 宫序 0..5。
 */
function liuGongRound(m, d, hIdx) {
  return mod((m - 1) + (d - 1) + hIdx, 6)
}

/**
 * 六宫 → 判果（含月令旺衰与日干关系修正）。
 * @param {object} chart 盘基。
 * @param {number} idx 宫序。
 * @returns {object} 判果。
 */
function judgeLiuGong(chart, idx) {
  const g = LIU_GONG_V2[mod(idx, 6)]
  const ws = wangShuai(g.wx, chart?.monthWx ?? '土')
  let score = g.score + (ws.score - 55) * 0.3
  const rel = relation(GAN_WUXING[chart?.dayGan ?? ''] ?? '土', g.wx)
  score += (DAY_REL_SCORE[rel] ?? 0) * 0.25
  return { g, ws, rel, score: clamp(score, -100, 100) }
}

// ═══════════════════════════════════════════════════════════════════════════
// 引擎实现（太乙 / 小六壬 / 中六壬 / 金口诀 / 马前课）
// ═══════════════════════════════════════════════════════════════════════════

/** #34 太乙神数·九宫。 */
function taiyiEngine(chart) {
  const p = taiyiPan(chart)
  if (!p) return null
  const dayWx = GAN_WUXING[chart?.dayGan ?? ''] ?? '土'
  let score = p.yangGong ? 26 : -22
  const keys = [p.yangGong ? '太乙临阳宫' : '太乙临阴宫', `太乙${p.gong}宫`, `计神${p.jiShen}`]
  score += (p.zhuSuan - p.keSuan) * 3.5
  keys.push(p.zhuSuan >= p.keSuan ? '主算胜' : '客算胜')
  score += (DAY_REL_SCORE[relation(wxOf(p.gongZhi), wxOf(p.taiSui))] ?? 0) * 0.35
  score += (DAY_REL_SCORE[relation(wxOf(p.jiShen), dayWx)] ?? 0) * 0.3
  score = clamp(score, -100, 100)

  const wuxing = emptyWuxing()
  wuxing[wxOf(p.gongZhi)] += 2
  wuxing[wxOf(p.jiShen)] += 1
  wuxing[wxOf(p.taiSui)] += 1
  wuxing[chart?.monthWx ?? '土'] += 1

  return {
    score,
    essence: `太乙${p.gong}宫${p.gongShen}第${p.ruNian}年·主算${p.zhuSuan}客算${p.keSuan}·${p.zhuSuan >= p.keSuan ? '主胜' : '客胜'}`,
    keys: uniqKeys(keys),
    wuxing,
    timing: `太乙入${p.gong}宫第${p.ruNian}年，应${p.ruNian}年`,
    detail: {
      太乙积年: `${p.ji}（通行值：上元积年 ${TAIYI_YUAN_V2} + 公元${p.year}）；以太乙小周法 ${TAIYI_XIAOZHOU} 去之得 ${p.nXiao}，再以行宫率 ${TAIYI_XINGGONG_RATE} 约之`,
      太乙: `${p.gong}宫（${palInfo(p.gong).gua}·${palInfo(p.gong).dir}）${p.gongShen}，入宫第${p.ruNian}年`,
      阴阳宫: p.yangGong ? '阳宫（奇宫 1/3/7/9），太乙临之为吉' : '阴宫（偶宫 2/4/6/8），太乙临之不利',
      积年旁证: `若积年加／减一年（诸本起算点互异），太乙宫分别为 ${p.gongNext}／${p.gongPrev}；本盘从「公元年 + ${TAIYI_YUAN_V2}」`,
      计神: `${p.jiShen}（以计神周法 ${JISHEN_ZHOU} 去积年，命起寅、逆行十二辰；次年退一位为 ${p.jiShenNext}）`,
      太岁: `${p.taiSui}${p.gzYear ? `（四柱年柱 ${p.gzYear}）` : ''}（与太乙宫${p.gongZhi}：${relation(wxOf(p.gongZhi), wxOf(p.taiSui))}）`,
      主客算: `主算${p.zhuSuan}（自太乙宫${p.gongZhi}顺数至计神${p.jiShen}）；客算${p.keSuan}（自始击宫${p.shiJiZhi}顺数至计神）`,
      九宫盘: taiyiLines(p),
      断: `太乙临${p.yangGong ? '阳' : '阴'}宫，${p.zhuSuan >= p.keSuan ? '主算多于客算，主胜客负，宜主不宜客' : '客算多于主算，客胜主负，宜客不宜主'}；计神${p.jiShen}与日干${chart?.dayGan ?? '—'}为${relation(wxOf(p.jiShen), dayWx)}`,
      cite: citeOf(CITE.太乙积年, CITE.太乙宫次, CITE.计神, CITE.太乙陨阙),
      evidence: [
        `积年 ${p.ji} mod ${TAIYI_XIAOZHOU} = ${p.nXiao}；÷ ${TAIYI_XINGGONG_RATE} = ${p.gongIdx}（行宫数）→ 命起一宫顺行八宫不入中五 → ${p.gong} 宫`,
        `入宫以来之数 ${p.ruNian}（每宫三年）`,
        `积年 ${p.ji} mod ${JISHEN_ZHOU} = ${mod(p.ji, JISHEN_ZHOU)}；自寅逆行 ${mod(p.ji, JISHEN_ZHOU)} 位 → ${p.jiShen}`,
        `始击：简法取太乙对宫（${p.shiJi} 宫）`,
      ],
      说明: '说明：太乙宫次与计神两项逐字依《太乙统宗宝鉴》卷一原文；'
        + '始击（客目）、主客大将参将、主客算之完整起例诸本互异（宝鉴引淘金歌以「太岁合神→文昌→定计目」层层推），'
        + '本模块只取公开可推部分（始击取太乙对宫、大将自本位顺行三宫、算数自本位顺数至计神），'
        + '故本引擎整体标 approx，不冒充秘传表；积年常数之起算差已用 ±1 年旁证列出。'
        + '另据 docs/research/sanshi-spec.md §C/§9#1：太乙全部内容（积年、行九宫、主客算、计神大将参将）'
        + '在受查的 9 个开源仓库中**无一有可读算法**（horosa 外包给不在仓库内的 kintaiyi），'
        + '故本模块未据调研落任何太乙代码，只依上列一手文献。',
    },
  }
}

/** #35 太乙·计神算（approx）。 */
function taiyiJiEngine(chart) {
  const p = taiyiPan(chart)
  if (!p) return null
  const dayWx = GAN_WUXING[chart?.dayGan ?? ''] ?? '土'
  let score = 0
  const keys = [`计神${p.jiShen}`, `主大将${p.zhuDa}宫`, `客大将${p.keDa}宫`]
  score += (DAY_REL_SCORE[relation(wxOf(p.jiShen), dayWx)] ?? 0) * 0.8
  score += (p.zhuSuan - p.keSuan) * 4
  keys.push(p.zhuSuan >= p.keSuan ? '主算长' : '客算长')
  score += (DAY_REL_SCORE[relation(wxOf(p.gongZhi), wxOf(p.taiSui))] ?? 0) * 0.3
  score += (DAY_REL_SCORE[relation(wxOf(GONG_ZHI?.[p.zhuDa] ?? '子'), wxOf(GONG_ZHI?.[p.keDa] ?? '子'))] ?? 0) * 0.4
  const canRel = relation(wxOf(GONG_ZHI?.[p.zhuCan] ?? '子'), wxOf(GONG_ZHI?.[p.keCan] ?? '子'))
  if (canRel === '生我' || canRel === '比和') { score += 8; keys.push('参将相得') }
  else if (canRel === '克我') { score -= 10; keys.push('参将相克') }
  score = clamp(score, -100, 100)

  const wuxing = emptyWuxing()
  wuxing[wxOf(p.jiShen)] += 2
  wuxing[wxOf(GONG_ZHI?.[p.zhuDa] ?? '子')] += 1
  wuxing[wxOf(GONG_ZHI?.[p.keDa] ?? '子')] += 1
  wuxing[chart?.monthWx ?? '土'] += 1

  return {
    score,
    fidelity: 'approx',
    essence: `计神${p.jiShen}·主算${p.zhuSuan}客算${p.keSuan}·主大将${p.zhuDa}宫客大将${p.keDa}宫`,
    keys: uniqKeys(keys),
    wuxing,
    timing: `${p.zhuSuan}数为应（主算）`,
    detail: {
      计神: `${p.jiShen}（五行${wxOf(p.jiShen)}，与日干${chart?.dayGan ?? '—'}为${relation(wxOf(p.jiShen), dayWx)}）｜起寅逆行，次年${p.jiShenNext}`,
      主客算: `主算${p.zhuSuan} ｜ 客算${p.keSuan} ｜ ${p.zhuSuan >= p.keSuan ? '主算为长，主胜' : '客算为长，客胜'}`,
      主将: `主大将${p.zhuDa}宫（${GONG_16SHEN_V2[p.zhuDa] ?? '—'}）｜主参将${p.zhuCan}宫（${GONG_16SHEN_V2[p.zhuCan] ?? '—'}）`,
      客将: `客大将${p.keDa}宫（${GONG_16SHEN_V2[p.keDa] ?? '—'}）｜客参将${p.keCan}宫（${GONG_16SHEN_V2[p.keCan] ?? '—'}）`,
      将之生克: `主大将与客大将：${relation(wxOf(GONG_ZHI?.[p.zhuDa] ?? '子'), wxOf(GONG_ZHI?.[p.keDa] ?? '子'))}；主参将与客参将：${canRel}`,
      太岁: `${p.taiSui}，与太乙宫${p.gongZhi}${relation(wxOf(p.gongZhi), wxOf(p.taiSui))}`,
      断: `计神在${p.jiShen}，主算${p.zhuSuan}、客算${p.keSuan}，${p.zhuSuan >= p.keSuan ? '主势为长，宜守正为主' : '客势为长，宜借力于客'}；主客参将${canRel === '克我' ? '相克，协同有碍' : '不相克，尚可协同'}`,
      cite: citeOf(CITE.计神, CITE.太乙宫次, CITE.太乙陨阙),
      evidence: [
        `计神：积年 mod ${JISHEN_ZHOU} = ${mod(p.ji, JISHEN_ZHOU)}，自寅逆行 → ${p.jiShen}`,
        `主算＝自太乙宫${p.gongZhi}顺数至计神${p.jiShen} = ${p.zhuSuan}；客算＝自始击宫${p.shiJiZhi}至计神 = ${p.keSuan}`,
        `大将自本位顺行三宫、参将顺行六宫（简法）；始击取太乙对宫`,
      ],
      说明: '说明：本引擎专断计神与主客大将、参将、算数。太乙家对始击、主客算的起例诸本互异，'
        + '本模块按公开可推部分计算，故整体标 approx，不冒充秘传表；计神起法（起寅逆行）有《统宗宝鉴》原文。',
    },
  }
}

/** #36 小六壬。 */
function xiaoLiuRenEngine(chart) {
  const m = lunarMonthOf(chart)
  const d = chart?.lunar?.day || 1
  const hIdx = Math.max(0, ZHI.indexOf(chart?.hourZhi ?? '子'))
  const idx = liuGongRound(m, d, hIdx)
  const j = judgeLiuGong(chart, idx)
  const keys = [j.g.name, j.g.wx, j.g.kw, j.ws.state]

  return {
    score: j.score,
    essence: `小六壬${j.g.name}（${j.g.wx}）·月${m}日${d}${chart?.hourZhi ?? '子'}时·${j.g.kw}`,
    keys: uniqKeys(keys),
    wuxing: { ...emptyWuxing(), [j.g.wx]: 3, [chart?.monthWx ?? '土']: 1 },
    timing: j.g.ying,
    detail: {
      起课: `大安起正月顺数至${m}月 → 该宫起初一顺数至${d}日 → 该宫起子时顺数至${chart?.hourZhi ?? '子'}时，落第${idx + 1}宫`,
      宫位: `第${idx + 1}宫 ${j.g.name}（${j.g.luck}）`,
      五行: `${j.g.wx}（月令${chart?.monthWx ?? '—'}·${j.ws.state}）`,
      宫义: j.g.main,
      与日干: `日干${chart?.dayGan ?? '—'}(${GAN_WUXING[chart?.dayGan ?? ''] ?? '—'}) 与宫${j.g.wx}为${j.rel}`,
      应期: j.g.ying,
      断: `${j.g.name}主「${j.g.main}」，${j.g.luck === '吉' ? '可用可行' : j.g.luck === '大凶' ? '宜止宜守，不可妄动' : '宜缓图，谨防其失'}`,
      cite: [CITE.小六壬, CITE.门星神取值],
      evidence: [
        `农历${chart?.lunar?.monthName ?? m}月${chart?.lunar?.dayName ?? d}日（月=${m}、日=${d}），占时${chart?.hourZhi ?? '子'}（序 ${hIdx}）`,
        `宫序 = (${m}-1 + ${d}-1 + ${hIdx}) mod 6 = ${idx} → ${j.g.name}`,
        `月令 ${chart?.monthWx ?? '—'} 对宫五行 ${j.g.wx} 为 ${j.ws.state}（分 ${j.g.score} → ${j.score.toFixed(1)}）`,
      ],
      说明: '说明：小六壬为公开确定算法——大安起正月，月上起初一，日上起子时，三轮掐指落宫；'
        + '本插件按此逐轮推算。六宫吉凶分为公开通例之编辑取值。',
    },
  }
}

/** #39 马前课。 */
function maQianKeEngine(chart) {
  const nums = (chart?.numbers ?? []).filter(Number.isFinite)
  const m = lunarMonthOf(chart)
  const d = chart?.lunar?.day || 1
  const hIdx = Math.max(0, ZHI.indexOf(chart?.hourZhi ?? '子'))
  let idx
  let how
  if (nums.length >= 3) {
    const n = nums.slice(0, 3).map((x) => Math.max(1, Math.round(x)))
    let k = mod(n[0] - 1, 6)
    k = mod(k + n[1] - 1, 6)
    k = mod(k + n[2] - 1, 6)
    idx = k
    how = `报数 ${n.join('/')} 三轮起课（大安起，逐轮顺数）`
  } else {
    idx = liuGongRound(m, d, hIdx)
    how = `无报数，退回农历${m}月${d}日${chart?.hourZhi ?? '子'}时 三轮起课`
  }
  const j = judgeLiuGong(chart, idx)
  const keys = [j.g.name, `${idx + 1}宫`, j.g.kw, j.ws.state]

  return {
    score: j.score,
    essence: `马前课${j.g.name}（第${idx + 1}宫）·${j.g.wx}${j.ws.state}·${j.g.kw}`,
    keys: uniqKeys(keys),
    wuxing: { ...emptyWuxing(), [j.g.wx]: 3, [chart?.monthWx ?? '土']: 1 },
    timing: j.g.ying,
    detail: {
      起课: how,
      宫位: `第${idx + 1}宫 ${j.g.name}（${j.g.luck}）`,
      五行: `${j.g.wx}（月令${chart?.monthWx ?? '—'}·${j.ws.state}）`,
      宫义: j.g.main,
      与日干: `日干${chart?.dayGan ?? '—'}(${GAN_WUXING[chart?.dayGan ?? ''] ?? '—'}) 与宫${j.g.wx}为${j.rel}`,
      应期: j.g.ying,
      断: `${j.g.name}定数主「${j.g.main}」，${j.g.luck === '吉' ? '宜进宜成' : j.g.luck === '大凶' ? '宜退宜守' : '宜缓图谨防其失'}`,
      cite: [CITE.小六壬, CITE.门星神取值],
      evidence: [
        how,
        `落宫序 ${idx} → ${j.g.name}；分 ${j.g.score} + 月令修正 → ${j.score.toFixed(1)}`,
        `日干${chart?.dayGan ?? '—'} 与宫 ${j.g.wx} 为 ${j.rel}`,
      ],
      说明: '说明：马前课与小六壬同源同法（大安→留连→速喜→赤口→小吉→空亡六宫，月上起日、日上起时）。'
        + '本插件在马前课优先以**报数**三轮起课；无报数时退回农历月日时三轮，此时两法必然同盘——属法脉同源，非重复计数之误。',
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 中六壬（天罡掌诀）· 金口诀
// ═══════════════════════════════════════════════════════════════════════════

/** 中六壬天罡掌诀起月表（农历月 → 起月之支）。出处见 CITE.中六壬掌诀。 */
const ZLR_MONTH_START_V2 = Array.isArray(ZLR_MONTH_START) && ZLR_MONTH_START.length === 12
  ? ZLR_MONTH_START
  : ['丑', '子', '亥', '戌', '酉', '戌', '亥', '子', '丑', '寅', '卯', '寅']
/** 十将（万不可改；只用末三位登明、神后、大吉）。 */
const ZLR_JIANG10_V2 = Array.isArray(ZLR_JIANG10) && ZLR_JIANG10.length === 10
  ? ZLR_JIANG10
  : ['天罡', '太乙', '胜光', '小吉', '传送', '从魁', '河魁', '登明', '神后', '大吉']
/** 孟仲季三位（十将第 8/9/10 位）。 */
const ZLR_SANWEI_V2 = Array.isArray(ZLR_SANWEI) && ZLR_SANWEI.length === 3 ? ZLR_SANWEI : [
  { wei: '孟', jiang: '登明', offset: 7, score: 6, kw: '登明孟' },
  { wei: '仲', jiang: '神后', offset: 8, score: -10, kw: '神后仲' },
  { wei: '季', jiang: '大吉', offset: 9, score: 26, kw: '大吉季' },
]

/** #37 中六壬（天罡掌诀）。 */
function zhongLiuRenEngine(chart) {
  const m = lunarMonthOf(chart)
  const d = chart?.lunar?.day || 1
  const hIdx = Math.max(0, ZHI.indexOf(chart?.hourZhi ?? '子'))
  const startZhi = ZLR_MONTH_START_V2[mod(m - 1, 12)] ?? '丑'
  const dayPos = mod(ZHI.indexOf(startZhi) + (d - 1), 12)
  const hourPos = mod(dayPos + hIdx, 12)
  const tianGang = mod(hourPos - 1, 12) // 时上退一位起天罡
  const siZheng = ['子', '午', '卯', '酉']
  const san = ZLR_SANWEI_V2.map((s) => ({ ...s, zhi: ZHI[mod(tianGang + s.offset, 12)] }))
  const hit = san.find((s) => siZheng.includes(s.zhi))
  if (!hit) return null

  // 值空亡则不验（以月柱旬空取）
  const xk = xunOf(chart?.ganzhi?.month ?? '甲子')
  const kong = xk?.kong ?? []
  const kongHit = kong.includes(chart?.dayZhi) || kong.includes(chart?.hourZhi)

  const ws = wangShuai(wxOf(hit.zhi), chart?.monthWx ?? '土')
  let score = hit.score + (ws.score - 55) * 0.3
  const keys = [hit.kw, `天罡${ZHI[tianGang]}`, `${hit.wei}位`]
  if (kongHit) { score -= 20; keys.push('值空亡') }

  const topic = zlrTopicOf(chart?.question)
  let topicText = ''
  if (topic) {
    const table = (ZLR_TOPIC ?? {})[topic]
    const line = table ? table[hit.wei] : ''
    topicText = `${topic}：${line || '（本类未收断辞）'}`
    if (['婚姻', '求财', '交易', '文书'].includes(topic)) score += hit.wei === '季' ? 12 : hit.wei === '仲' ? -8 : -4
    else if (['病患', '官非', '词讼'].includes(topic)) score += hit.wei === '孟' ? 8 : hit.wei === '季' ? -10 : 4
    else if (topic === '行人') score += hit.wei === '孟' ? -6 : 8
    else if (topic === '失物') score += hit.wei === '孟' ? 8 : -4
  }
  score = clamp(score, -100, 100)

  const wuxing = emptyWuxing()
  wuxing[wxOf(hit.zhi)] += 2
  wuxing[wxOf(ZHI[tianGang])] += 1
  wuxing[chart?.monthWx ?? '土'] += 1

  return {
    score,
    essence: `中六壬天罡加${hit.wei}·${hit.jiang}在${hit.zhi}·${kongHit ? '值空亡不验' : '课成'}`,
    keys: uniqKeys(keys),
    wuxing,
    timing: hit.wei === '孟' ? '孟主近，一、三日内' : hit.wei === '仲' ? '仲主中，五、七日内' : '季主远，十日以上',
    detail: {
      起课: `农历${m}月自${startZhi}起，顺数至${d}日得${ZHI[dayPos]}；自${ZHI[dayPos]}起子时，顺数至${chart?.hourZhi ?? '子'}时得${ZHI[hourPos]}；时上退一位起天罡，天罡在${ZHI[tianGang]}`,
      十将: ZLR_JIANG10_V2.map((n, i) => `${i + 1}${n}在${ZHI[mod(tianGang + i, 12)]}`),
      三位: san.map((s) => `${s.wei}·${s.jiang}在${s.zhi}${siZheng.includes(s.zhi) ? '（值子午卯酉）' : ''}`),
      孟仲季: `天罡加${hit.wei}（十将第${hit.offset + 1}位${hit.jiang}落${hit.zhi}，属子午卯酉）`,
      总断: (ZLR_DUAN ?? {})[hit.wei] ?? '',
      分类断: topicText || '（所问事类未入分类断辞，以总断为准）',
      空亡: kongHit ? `月柱${chart?.ganzhi?.month ?? '—'}旬空${kong.join('')}，日/时值空——掌诀云「值空亡日时占之则不验」` : `月柱旬空${kong.join('')}，日时未值空`,
      五行: `${wxOf(hit.zhi)}（月令${chart?.monthWx ?? '—'}·${ws.state}）`,
      断: `${(ZLR_DUAN ?? {})[hit.wei] ?? ''}${topicText ? `｜${topicText}` : ''}`,
      cite: [CITE.中六壬掌诀, CITE.门星神取值],
      evidence: [
        `起月：${m}月 → 起支 ${startZhi}（起月歌：正九寻牛五月鸡，二八须从子上随…）`,
        `月上起日：${ZHI.indexOf(startZhi)} + ${d - 1} → ${ZHI[dayPos]}；日上起时：+ ${hIdx} → ${ZHI[hourPos]}；退一位起天罡 → ${ZHI[tianGang]}`,
        `三位落宫：${san.map((s) => `${s.jiang}${s.zhi}(${s.wei})`).join('、')}；命中${hit.wei}（${hit.jiang}）`,
        `月令 ${chart?.monthWx ?? '—'} 对 ${wxOf(hit.zhi)} 为 ${ws.state}；空亡 ${kongHit ? '值空不验' : '未值'}`,
      ],
      说明: '说明：本引擎用《中六壬天罡掌诀》——农历月上起日、日上起时、时上退一位起天罡，'
        + '视十将第八/九/十（登明孟、神后仲、大吉季）落于子午卯酉何位定断；断辞取自该诀总论与分类断辞。',
    },
  }
}

/** 中六壬分类断辞的类别判定。 */
function zlrTopicOf(question) {
  const q = String(question ?? '')
  const table = [
    { t: '婚姻', kw: ['婚', '姻', '嫁', '娶', '感情', '对象', '女友', '男友', '复合', '缘分'] },
    { t: '求财', kw: ['财', '钱', '投资', '生意', '买卖', '回款', '收入', '债', '利'] },
    { t: '交易', kw: ['交易', '合作', '成交', '合同', '签约'] },
    { t: '行人', kw: ['行人', '出行', '远行', '归来', '何时回', '出差'] },
    { t: '失物', kw: ['失物', '丢', '丟', '找不', '遗失', '被盗', '偷'] },
    { t: '病患', kw: ['病', '疾', '健康', '身体', '医'] },
    { t: '官非', kw: ['官非', '官司', '诉讼', '纠纷', '罪', '牢'] },
    { t: '词讼', kw: ['讼', '打官司', '对簿'] },
    { t: '文书', kw: ['文书', '考试', '证件', '审批', '申', '文'] },
    { t: '音信', kw: ['音信', '消息', '信', '联系'] },
    { t: '迁移', kw: ['迁', '搬家', '换房', '移民'] },
  ]
  for (const row of table) if (row.kw.some((k) => q.includes(k))) return row.t
  return null
}

/**
 * #38 六壬金口诀（四位：地分／月将／贵神／人元）。
 *
 * 起法（见 CITE.金口诀四位、CITE.五子元遁）：
 * - 地分＝占时支（无报数时）；有报数时取报数配支（12 取模，0 作 12）。
 * - 月将＝中气过宫（与大六壬同源）。
 * - 贵神＝十二天将乘地分（贵人起法同大六壬，昼夜贵＋顺逆布）。
 * - 人元＝五子元遁：日干起子，顺数至地分。
 */
function jinKouJueEngine(chart) {
  const nums = (chart?.numbers ?? []).filter(Number.isFinite)
  let diFen = chart?.hourZhi || '子'
  let diFenFrom = `占时${diFen}`
  if (nums.length > 0) {
    const n = Math.max(1, Math.round(Math.abs(nums[0])))
    diFen = ZHI[mod(n - 1, 12)]
    diFenFrom = `报数${n} → 第${mod(n - 1, 12) + 1}位地支${diFen}`
  }
  const dayGan = chart?.dayGan ?? ''
  const gr = guirenOf(dayGan)
  if (!gr) return null

  const st = jieqiStateOf(chart)
  const yj = yueJiangOf(chart, st)
  const isZhou = ZHOU_HOURS.includes(diFenFrom.startsWith('报数') ? (chart?.hourZhi ?? '子') : diFen)
  const guiren = isZhou ? gr[0] : gr[1]
  const shun = SHUN_GONG.includes(guiren)
  const gi = ZHI.indexOf(guiren)
  const jiangAt = (z) => {
    const k = mod((shun ? 1 : -1) * (ZHI.indexOf(z) - gi), 12)
    const name = JIANG12_SEQ[k]
    return JIANG_INFO[name] ?? { name, wx: '土', luck: 0 }
  }
  const guiShen = jiangAt(diFen)

  const dunShou = WUSHU_DUN_V2[dayGan] ?? '甲'
  const renYuan = GAN[mod(GAN.indexOf(dunShou) + ZHI.indexOf(diFen), 10)]
  const renYuanAlt = chart?.renyuan?.gan ?? null // kernel-astro 旁证（可选）

  const wx = [GAN_WUXING[renYuan] ?? '土', guiShen.wx, wxOf(yj.zhi), wxOf(diFen)]
  const labels = ['人元', '贵神', '月将', '地分']
  const chain = [[0, 1], [1, 2], [2, 3]].map(([a, b]) => ({
    from: labels[a], to: labels[b], rel: relation(wx[a], wx[b]),
  }))
  let score = 0
  const keys = [guiShen.name, `月将${yj.name}`, `地分${diFen}`]
  for (const c of chain) score += (DAY_REL_SCORE[c.rel] ?? 0) * 0.45
  score += guiShen.luck * 0.4
  score += (wangShuai(wxOf(yj.zhi), chart?.monthWx ?? '土').score - 55) * 0.25

  const allSheng = chain.every((c) => c.rel === '我生' || c.rel === '生我' || c.rel === '比和')
  const allKe = chain.every((c) => c.rel === '我克' || c.rel === '克我')
  if (allSheng) { score += 24; keys.push('四位相生') }
  else if (allKe) { score -= 22; keys.push('四位相克') }
  score = clamp(score, -100, 100)

  const wuxing = emptyWuxing()
  for (const x of wx) wuxing[x] += 1

  return {
    score,
    essence: `金口诀·人元${renYuan} 贵神${guiShen.name} 月将${yj.name} 地分${diFen}·${allSheng ? '四位相生' : allKe ? '四位相克' : '生克互见'}`,
    keys: uniqKeys(keys),
    wuxing,
    timing: `地分${diFen}，应${diFen}日或${chong(diFen)}日`,
    detail: {
      四位: labels.map((l, i) => `${l}：${[renYuan, guiShen.name, `${yj.zhi}(${yj.name})`, diFen][i]}（${wx[i]}）`),
      人元起法: `五子元遁：${dayGan}日起${dunShou}子，顺数至地分${diFen}得${renYuan}`
        + `${renYuanAlt ? `｜kernel-astro 人元司令为${renYuanAlt}（旁证，非同一口径）` : ''}`,
      贵神起法: `${dayGan}日${isZhou ? '昼' : '夜'}贵取${guiren}，贵人${shun ? '顺布' : '逆布'}十二将，地分${diFen}上得${guiShen.name}`,
      地分起法: diFenFrom,
      月将: `${yj.zhi}（${yj.name}），五行${wxOf(yj.zhi)}｜取自中气「${yj.yuejiangFrom}」`,
      四位生克: chain.map((c) => `${c.from}→${c.to}：${c.rel}`),
      贵神吉凶: `${guiShen.name}（${guiShen.wx}）为${guiShen.luck > 0 ? '吉将' : guiShen.luck < 0 ? '凶将' : '平将'}`,
      断: `四位${allSheng ? '递相生，事顺而有力' : allKe ? '递相克，事阻而多耗' : '生克互见，成败相参'}；${guiShen.luck > 0 ? '贵神为吉将，主有贵人扶助' : '贵神非吉将，须防暗中阻隔'}`,
      cite: [CITE.金口诀四位, CITE.五子元遁, CITE.贵人歌, CITE.贵人顺逆, CITE.月将中气],
      evidence: [
        `地分：${diFenFrom}`,
        `人元：五子元遁 ${dayGan} → 子时干${dunShou}，顺数 ${ZHI.indexOf(diFen)} 位 → ${renYuan}(${wx[0]})`,
        `贵神：${dayGan}日${isZhou ? '昼' : '夜'}贵${guiren}，${shun ? '顺' : '逆'}布 → 地分${diFen}上${guiShen.name}`,
        `月将：中气「${yj.yuejiangFrom}」→ ${yj.zhi}（${yj.name}）`,
        `四位生克：${chain.map((c) => `${c.from}${c.rel}${c.to}`).join('、')}`,
      ],
      说明: '说明：金口诀四位＝地分（占时支，有报数则以报数配支）、月将（中气过宫）、'
        + '贵神（十二天将乘地分）、人元（五子元遁至地分）；四位生克按「上生下为顺、下克上为逆」的通行口径累加。',
    },
  }
}

/**
 * 兜底清洗：把结果里所有 `undefined` 换成 `—`，并删掉值为 `undefined` 的 detail 键。
 *
 * 用途：本模块的 detail 大量使用模板串插值（`${p.xxx}`），任何一个取不到的字段都会
 * **原样印出 `undefined`** 给用户 —— task-16 的 `#27/#38` 就是两个实例（月将字段别名不一致、
 * 日家分支的 `fuTouAt` 缺失）。根因已逐个修掉；此函数是**第二道闸**：
 * 即便日后新增字段忘了兜底，也只是显示 `—` 而非 `undefined`。
 * 注：`detail.取象` 之类**故意为 null** 的字段保留 null（那是"无此项"的语义，非脏值）。
 *
 * @param {*} v 任意值。
 * @returns {*} 清洗后的值。
 */
function sanitizeUndef(v) {
  if (v === undefined) return '—'
  if (v === null) return null
  if (typeof v === 'string') return v.includes('undefined') ? v.split('undefined').join('—') : v
  if (Array.isArray(v)) return v.map(sanitizeUndef)
  if (v && typeof v === 'object') {
    const out = {}
    for (const [k, val] of Object.entries(v)) {
      if (val === undefined) continue // 键整个丢掉，胜过留一个 '—'
      out[k] = sanitizeUndef(val)
    }
    return out
  }
  return v
}

/** 对单个引擎输出做兜底清洗（score/keys/wuxing 等原样保留，只清 detail/essence/timing）。 */
function cleanOutcome(o) {
  if (!o || typeof o !== 'object') return o
  return {
    ...o,
    essence: typeof o.essence === 'string' ? sanitizeUndef(o.essence) : o.essence,
    timing: typeof o.timing === 'string' ? sanitizeUndef(o.timing) : o.timing,
    detail: sanitizeUndef(o.detail ?? {}),
  }
}

export default engines

