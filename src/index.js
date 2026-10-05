/**
 * dsh-divination-108 —— 宿主侧（108 种术数合盘）
 *
 * ## 它解决什么
 * 术数求占最贵的是**推演**：六爻装卦、奇门起局、六壬发三传、八字取用神……
 * 每一步都靠模型在思维链里硬算，又慢又贵，还容易算错。
 *
 * 本插件把这 108 法**全部程序化**：
 * - 模型只调一次 `divine`，插件在本地把 108 法算完；
 * - 输出是一张**压缩过的合盘**（总断/票型/五行/共识/应期/分歧 + 108 行紧凑明细，
 *   约 1.2–1.8k token），模型不需要在思维链里推任何一法；
 * - 需要看某一法的完整盘时再调 `divine_detail` 下钻，不看就不花 token。
 *
 * ## 装配面
 * | 一半 | 作用 |
 * |---|---|
 * | `ctx.tools.register` | 三个工具：`divine`（合盘）/ `divine_detail`（下钻）/ `divine_list`（目录） |
 * | `ctx.systemPrompt.section` | 告诉模型「问卜一律先调 divine，禁止自行推演」 |
 * | `ctx.commands.register` | `/占 <所问>` 斜杠命令 |
 * | `ctx.connection.fetch` | 客户端面板用的 HTTP 端点（走宿主鉴权，不绕过 admit） |
 *
 * ## 确定性（重要）
 * 同一个「问题 + 时刻 + 法号」必得同一结果：随机数由 `hash32(问题|时刻|经度|法号)` 派生。
 * 因此同一卦可复核、可回放；换问题则结果改变。想固定某一次的结果，把 `divine` 返回的
 * `seed` 记下来，下次传 `seed` 即可复现。
 *
 * ## 保真度（诚实声明）
 * 108 法分三档：`full` 公开算法完整实现 / `core` 核心公开算法 / `approx` 缺秘传表或辞书
 * 的近似实现。`approx` 项在输出里带 ⚠，`detail` 里写明「近似在哪里」。插件**不伪造**
 * 签诗原文、秘传条文与星历表。
 */

import { buildChart } from './core/calendar.js'
import { ENTRIES, CATEGORIES, FIDELITY_LABEL, ENTRY_BY_NO, ENTRY_BY_ID } from './core/registry.js'
import { runMany, runOne, resolveMethod, validateEngines } from './core/runner.js'
import { aggregate, selectNos, detectTopic } from './core/aggregate.js'
import { render, renderSummary, renderTable, renderDetail, renderList, primeList } from './core/format.js'
import { loadDefineTool, loadSchema } from './shared.js'

export const name = 'dsh-divination-108'

/**
 * 声明的能力（**只保留在会话级隔离域里必定存在的两个**）。
 *
 * 本插件现在是**预设级**装配（`~/.dsh/.agent-presets/divination/agent.cordis.yml`
 * 的 `plugins` 列表），按会话实例化。`tools` 与 `systemPrompt` 在预设域里必定可用
 * （同预设的 persona / 工具行就靠它们）；而 `commands` 与 `connection` 是宿主平面
 * 的服务，在会话域里**未必注入得到**——所以它们改走下面的**可选注入**：
 * 拿得到就注册 `/占` 与面板端点，拿不到就不注册，插件本体照常工作。
 * 若把这两个放进硬 `inject`，一旦某个服务在预设域不可见，整个插件会**不激活**。
 */
export const inject = ['tools', 'systemPrompt']

/**
 * **模块级**共享状态：预设行（工具）与宿主级 UI 行（面板）是两条独立的 cordis 行，
 * 但 import 的是同一个模块 URL，ESM 缓存保证模块体只求值一次 —— 所以这里的状态
 * 天然被两行共享。面板因此能看到预设行算出来的求占记录。
 * @type {{history: object[], seq: number, limit: number}}
 */
const SHARED = { history: [], seq: 0, limit: 20 }

/**
 * 安全记一行日志。
 *
 * ⚠ cordis 有**服务守卫**：没在 `inject` 里声明的服务，用属性访问会直接抛
 * `cannot get property "xxx" without inject`。`logger` 虽然是内置服务、通常可以直接用，
 * 但**不值得赌** —— 一旦它也被守卫，这行日志就会把整个 `apply()` 带崩。
 * 包一层 try/catch：记不上就算了，绝不因为日志让插件失效。
 *
 * @param {any} ctx cordis 上下文。
 * @param {'info'|'warn'|'error'} level 级别。
 * @param {string} text 内容。
 */
function logLine(ctx, level, text) {
  try { ctx?.logger?.[level]?.(text) } catch { /* 记不上就算了 */ }
}

let z
let defineTool
try {
  z = await loadSchema()
} catch (err) {
  throw new Error(`dsh-divination-108: 载入 schemastery 失败：${err?.message ?? err}`)
}
try {
  defineTool = await loadDefineTool()
} catch (err) {
  throw new Error(`dsh-divination-108: 载入 @deepseek-ai/dsh-tools 失败：${err?.message ?? err}`)
}

primeList(ENTRIES)

export const Config = z.object({
  /** 模型看到的工具名（`divine` / `divine_detail` / `divine_list` 的前缀）。 */
  toolName: z.string().default('divine'),
  /** 默认输出档位：brief 只看断语 / normal 加 108 行紧凑表 / full 全展开。 */
  defaultFormat: z.union(['brief', 'normal', 'full']).default('normal'),
  /** 默认起法范围：all / category:命理 / module:yijing / ids:…。 */
  defaultScope: z.string().default('all'),
  /** 默认经度（东经为正）。0 = 不做真太阳时校正。 */
  defaultLongitude: z.number().default(0),
  /** 默认性别（命理类用）。 */
  defaultGender: z.union(['男', '女']).default('男'),
  /** 内存里保留多少次求占记录（供下钻与 UI 回看）。 */
  historySize: z.number().default(20),
  /** 是否在系统提示里插入「问卜先调 divine」的指令。 */
  promptEnabled: z.boolean().default(true),
  /**
   * 是否注册胶囊悬浮窗的数据端点（`/api/dsh-divination-108/data`）。
   *
   * 这条路由是**全局** HTTP 路径，同一路径只能注册一次。现在是**唯一那条宿主级
   * 行**（`cordis.patch.yml` 里的 `dsh-divination-108`）开着它 —— 插件已改为
   * 宿主级装配（不再挂在 agent preset 里），工具与悬浮窗都由那一条行提供。
   */
  uiEnabled: z.boolean().default(false),

  /**
   * 只做 UI：**不注册工具、不注入系统提示、不注册斜杠命令**，只保留
   * 「让 `dsh-client-modules` 扫到本包的 `dsh.client`」+「注册面板端点」。
   *
   * 当前装配**没有用**它（只有一条行，工具与 UI 都归它）。保留是因为它是一条
   * 有用的降级路径：若将来想再拆成「宿主行供面板 + 预设行供工具」，就把宿主行设
   * `uiOnly: true`、预设行设 `uiEnabled: false` —— 两边共享同一份求占记录，
   * 因为两行 import 的是同一个模块 URL，ESM 缓存复用同一实例，模块级 `SHARED`
   * 天然互通（`test/host.mjs` 第 11 节验证了这条）。
   *
   * 若同一份配置里出现两条**都注册工具**的行，宿主会抛
   * `tool "divine" is already registered`。
   */
  uiOnly: z.boolean().default(false),
})

/**
 * 解析用户给的时刻字符串。
 * @param {string|undefined} s 时刻（ISO 或 `YYYY-MM-DD HH:mm`）。
 * @returns {Date|undefined} Date 或 undefined（用当前时刻）。
 */
function parseWhen(s) {
  if (typeof s !== 'string' || s.trim() === '') return undefined
  const t = s.trim()
  // `YYYY-MM-DD HH:mm(:ss)` 按**本地时间**解析（求占看的是当地时间，不是 UTC）
  const m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 12), +(m[5] ?? 0), +(m[6] ?? 0))
  }
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/**
 * 解析出生资料字符串 `YYYY-MM-DD [HH:mm]`。
 * @param {string|object|undefined} s 出生资料。
 * @returns {object|undefined} `{y,m,d,h,mi}`。
 */
function parseBirth(s) {
  if (s === undefined || s === null) return undefined
  if (typeof s === 'object' && Number.isFinite(s.y)) {
    return { y: s.y, m: s.m ?? 1, d: s.d ?? 1, h: s.h ?? 12, mi: s.mi ?? 0 }
  }
  const t = String(s).trim()
  if (t === '') return undefined
  const m = t.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?(?:[ T]?(\d{1,2}):?(\d{2})?)?/)
  if (!m) return undefined
  return { y: +m[1], m: +m[2], d: +m[3], h: +(m[4] ?? 12), mi: +(m[5] ?? 0) }
}

/**
 * 把工具参数整理成 buildChart 的输入。
 * @param {object} args 工具参数。
 * @param {object} config 插件配置。
 * @returns {object} buildChart 输入。
 */
function toChartInput(args, config) {
  const longitude = Number.isFinite(args.longitude) ? args.longitude
    : (config.defaultLongitude !== 0 ? config.defaultLongitude : undefined)
  return {
    question: typeof args.question === 'string' ? args.question : '',
    when: parseWhen(args.when),
    longitude,
    // 经度来源如实透传（面板传「用户当前位置」；显式给了经度但没说明 → calendar 按"手动指定"推定）
    longitudeFrom: typeof args.longitudeFrom === 'string' ? args.longitudeFrom : undefined,
    gender: args.gender === '女' ? '女' : (args.gender === '男' ? '男' : config.defaultGender),
    birth: parseBirth(args.birth),
    numbers: Array.isArray(args.numbers) ? args.numbers : undefined,
    coins: Array.isArray(args.coins) ? args.coins : undefined,
    seed: args.seed,
  }
}

// ─────────────────────────── 「一句话收束」总断解读 ───────────────────────────
//
// 插件本身只做**程序化推演**；把合盘读成用户要的那种一句话收束，必须由模型做。
// 用户要的形态：
//   一句话收束：卦断「10 月开闸，子月大成」——主窗 10 月上旬（甲寅日 10-07 /
//   庚申日 10-13 两个落点），次窗 12 月中旬（子月，与 V3、V3.2 的 12 月档期重合）；
//   形态上是「先能调用、后给名分」，不是一步到位的官宣。
//
// 联网**不做 tool-call 循环**：`GenerateOptions.tools` 虽然支持工具调用，但要实现
// 「发调用 → 执行 → 回填 tool 消息 → 再流式」得精确构造 assistant/tool 消息体，
// 而消息体形状没有类型声明可核对，猜错会被真实适配器直接抛错。所以改成**宿主侧
// 直接检索**（`ctx.web.search`）再把资料当上下文塞进提示词 —— 少一层协议，稳得多。

/**
 * 综合判词的口吻与格式（用户指定的结构，照抄这个骨架）。
 *
 * v2 重写（task-18）：在**不动用户指定骨架、不动三条既有红线**的前提下，把调研来的
 * 「票数不构成独立证据 / 确定性事实不可改写 / 口径诚实 / 应期不做加权平均 / 禁止合成虚构分数 /
 * 不声称做过未实现的分级」写进骨架。每条新增条款对应哪个项目的哪条做法，见
 * `docs/verification/interpret-system-rewrite.md`（出处写在文档而非提示词里：
 * 提示词是给模型看的，塞仓库名只会诱使模型在判词里复述这些名字）。
 *
 * ⚠ 两条硬约束（改这个常量前先读）：
 * 1. **只能引用 `buildBoardBrief()` 真会喂给模型的字段** —— 综合(判定/分门加权分/一致性/置信)、
 *    票型、五行(旺缺)、断语、多法共识(key×N法)、应期(text×N法)、分类加权、最大分歧、
 *    108 法明细(编号/名称/⚠/判定/分值/依据，含「未起」)、以及断语里内嵌的「N法/M门」「体系分歧」。
 *    `divergence.familySkew`、`overall.rawScore`、`consensusKeys.fams`、`evidenceDigest`、
 *    `meta.agreement` **都没有进简报** —— 写进骨架模型也看不到，只会逼它编。
 * 2. `test/host.mjs` 断言本常量含字面量 `综合判词`（骨架标题）与 `只能来自合盘`（红线 1）。
 */
const INTERPRET_SYSTEM = [
  '你是术数断者。下面是 dsh-divination-108 插件在本地程序化算出的 108 法合盘 —— 数值、票型、',
  '共识、应期、逐法依据全部来自插件，你**不得**重新推演、不得改动分数。',
  '',
  '你的唯一任务：把这张合盘读成一份**综合判词**。**严格照这个骨架输出**（行数与层次都照抄，',
  '标题与「主断：」两个字不要改；每一块只写该块该说的东西）：',
  '',
  '第一行必须是「一句话收束」（把整张合盘压成一句人能记住的话）：',
  '一句话收束：卦断「<四到八字定性>」——主窗 <时间窗>（<落点>），次窗 <时间窗>；形态上是「<A>」，不是「<B>」。',
  '（时间窗/干支/落点只能来自合盘的应期；合盘没给就不写括号里的落点。）',
  '',
  '然后空一行，再写：',
  '',
  '综合判词',
  '主断：<一句话把「什么时候成、成到什么程度、真正的节点落在哪」讲清楚，含具体时间窗与干支/日期落点>',
  '',
  '吉/平/凶 = <票型数字>，加权 <带符号的分数>，一致性 <数字> → 属「<四到八字定性，如：中平偏吉、过程反复、结果成立>」。',
  '<最大分歧的那一对> 的 <分数差> 分分歧，本质是「<A 这条线>（<该法的依据>）」与「<B 这条线>（<该法的依据>）」的分歧 —— 即：<这说明什么>。',
  '<把易卦类的卦象串成一条链，如 火水未济 → 山水蒙 + 大畜 → 蛊>：<这条链怎么读>。',
  '<五行 某旺某缺>：<现在的气机是什么、待什么月方见转机>。',
  '',
  '硬性要求（1–7 为既有红线，8–13 为 v2 追加，全部等同硬性）：',
  '1. **时间窗、干支、日期落点只能来自合盘里的「应期」与逐法明细**。合盘没给的一律不许出现；',
  '   若合盘只给了粗粒度应期（如「火月」），就照实说粗粒度，不要编出具体日子。',
  '2. 合盘是**确定性事实**：每一个数字（票型/加权分/一致性/分值差）、票型、保真度标记（`⚠`）、',
  '   盘面事实都必须**原样引用** —— 不许重算、不许四舍五入成别的数、不许改值、不许按你的判断调分。',
  '3. 「最大分歧」那一条要取合盘里分差最大的那一对，并且**解释它在事上意味着什么**（不是复述数字）。',
  '4. 「卦象链」那一条优先用易卦类（之卦占 / 互卦占 / 大象占 / 六爻纳甲）的依据串起来；',
  '   若合盘里那几法没有可串的卦名，就改说该类的共识，不要硬编卦名。',
  '5. 主断要**可被证伪**（做什么、什么时候、什么形态），不要写「顺其自然」这类空话。',
  '6. 不要罗列 108 法，不要复述全部明细，不要加额外的标题或前后缀。',
  '7. 涉及医疗、法律、重大投资时，末尾另起一行点一句「仅供参考，请咨询专业人士」。',
  '8. **票型不是证据**：「吉 N 法」多不等于结论成立（同一法门内部 24 法会大量同票），',
  '   主断必须以「综合」行里的**分门加权分**与「多法共识」的**跨门数**（断语里写作 `N法/M门`）为准；',
  '   票型只作呈现，不许把票数多的那一边直接当结论，也不许用票数另算一个分数。',
  '9. **某一法门在影响结论时必须点名**：若「断语」里出现「体系分歧：…相差 N 分」，或「分类加权」',
  '   里某一门与综合分明显背离，就要在判词里显式说明是哪个门在拉动结论 —— 这是结论可信度的关键信息，',
  '   不许略过不提。',
  '10. **口径诚实**：带 `⚠` 的是**近似实现**，不得当成实测结论陈述；「未起」的法必须如实点名',
  '   （说明它未计入，而不是当成"没有不同意见"）；合盘没写的一律不补全、不含糊带过。',
  '11. **分歧必须标等级**：合盘的「最大分歧」「体系分歧」与断语里带 **D1–D5 分级**',
  '   （D1 口径分歧／D2 尺度分歧／D3 取用分歧／D4 资料不足／D5 真分歧）。引用时**照抄合盘给的等级**，',
  '   并且只有 **D5 才可写成"诸法真分歧"**；D1–D4 不是"诸法矛盾"（分别是流派口径、时间量纲、用神取象、',
  '   资料不足），不得混为一谈。合盘没给等级的分歧，就说"分歧项"，**不要自己编一个 D 级别**。',
  '12. **应期不做加权平均、不编区间**：只能引用合盘给的应期文字与「多少法同指」（`×N法`）；',
  '   不许把多个应期自己平均成一个，也不许在合盘没给区间时编出区间或置信范围。',
  '13. **禁止合成虚构数字**：不得出现「综合可信度 87 分」「成功率约七成」这类由你生成的量化值。',
  '   合盘没算的量就不写数，宁可用「偏吉/偏凶/不确定」这类定性词。',
  '14. **本次的随机性模式已在合盘里自证**（「模式：随机模式 / seed 复现模式」一行）。',
  '   若是**随机模式**：不要向用户承诺"同一问题同一时刻必然同结果"——重复求占本就可能不同；',
  '   若用户想复现，把合盘给的 `seed` 告诉他，下次带上即可。若是 **seed 复现模式**：如实说明"本次按 seed 复现"。',
  '   这一条与条款 2 不冲突：条款 2 管的是"别改合盘给的数字"，本条管的是"别改口径承诺"。',
  '',
  '若下面的「外部资料」非空，可以用它把判词落得更实（例如核对某个档期），',
  '但**不得**因外部资料改动合盘的分数或应期；两者冲突时以合盘为准并指出冲突。',
].join('\n')

/**
 * 「起卦资料」整理步骤的提示词。
 *
 * 这一步的存在意义：起卦要用的资料（时刻/出生/性别/经度/报数）必须在**起卦之前**就位，
 * 否则 108 法只能按默认值算、命理类还会记「未起」。所以起卦前先让模型读一遍问题，
 * 把它**能从问题里读出来**的资料填进去；读不出来的**一律留空并说明缺什么**，
 * **绝不臆造**（尤其出生资料：编一个生辰等于编一整套命盘）。
 */
const PLAN_SYSTEM = [
  '你是 dsh-divination-108 插件的起卦前置步骤。任务：从用户的问题里**提取**起卦所需资料。',
  '',
  '**只输出一个 JSON 对象**，不要任何解释、不要 markdown 代码块、不要前后缀。字段：',
  '{',
  '  "when": "YYYY-MM-DD HH:mm 或空串",     // 求占时刻。**永远不从外部资料填**（见下）',
  '                                        //   空串表示「用这台机器的当前时间」，这是正确的',
  '  "birth": "YYYY-MM-DD HH:mm 或空串",    // 出生/成立/立项日时。用户给了就用；',
  '                                        //   用户没给但**外部资料里明确写了**，也可以填（见下）',
  '  "birthFrom": "这个 birth 从哪来的",      // 填了 birth 就必须填这个（用户亲口给就写「用户所给」）',
  '  "gender": "男" | "女" | "",            // 同上；填了就必须填 genderFrom',
  '  "genderFrom": "来源说明",',
  '  "longitude": 数字 或 null,             // 经度；填了就必须填 longitudeFrom',
  '  "longitudeFrom": "来源说明",',
  '  "numbers": [数字] 或 [],               // 报数：**永远不从外部资料填**（见下）',
  '  "subject": "问题的主体是谁/什么",       // 如「DeepSeek V4.1 Pro 发布」',
  '  "context": "从外部资料里读到的关键事实",   // 见下面的「外部资料」规则；没有就空串',
  '  "missing": ["缺什么"],                 // 例如命理类需要的出生资料缺失、报数缺失',
  '  "note": "一句话说明你填了什么、为什么"',
  '}',
  '',
  '**外部资料（若有）怎么用 —— 这是重点：**',
  '上面可能会附一段「外部资料」（插件刚替你联网检索的）。你要做两件事：',
  '',
  '(A) 把**与本次所求之事直接相关的、资料里明写的事实**整理成 `context`，例如：',
  '    · 目标对象的关键时间点（官宣日、预览版发布日、已公开的路线图/档期）',
  '    · 官方口径与传闻的区别（谁说的、哪一天说的）',
  '    · 与「所求之事」直接冲突或印证的硬信息',
  '    `context` 的每条都要能对上资料来源；**资料里没写的，一个字都不许加**。',
  '',
  '(B) 把资料里**明确写着、可以直接当起卦资料用**的东西，**填进对应的框**，并且必须交代来源：',
  '    · `birth` ← 资料给出明确日期时（人物生辰 / 公司成立日 / 产品立项日 / 首发日…）',
  '      例：`"birth": "2023-07-17 00:00"`, `"birthFrom": "取象：DeepSeek 成立日，来源 36kr.com/..."`',
  '      若这是**公司/产品/事件**，请在 `birthFrom` 里写清「取象：以 X 之日为生时」。',
  '    · `longitude` ← 资料给出地点时填该地经度（如杭州 120.2），并写 `longitudeFrom`。',
  '    · `gender` ← 资料明确写出人物性别时才填，并写 `genderFrom`。',
  '    · **`when` 永远不从外部资料填** —— 求占时刻就是「现在」，不是新闻里的日期。',
  '    · **`numbers` 永远不从外部资料填** —— 报数是求占人当场报的数。',
  '    · 资料里**没有明确写**的，一律留空；**写不出 `*From` 来源说明的，就不许填**。',
  '    · 若是**具体人物**的命理问题，而资料里同名人物不止一个 / 无法确定就是本人，',
  '      就**留空**并在 `missing` 里写「身份存疑，未取网上生辰」—— 这类不要赌。',
  '',
  '这一步填进去的东西会**原样显示给用户核对**，所以宁可少填、错填更糟；但也不要因为保守',
  '就把资料里写得清清楚楚的日期放着不用 —— 那些填上去了，命理类才起得来。',
  '',
  '',
  '**硬性纪律：**',
  '1. **绝不臆造**：出生资料/性别/经度/报数，**用户没给、外部资料里也没明写**的，就是没有。',
  '   宁可留空并写进 missing，也不许猜、不许凑。编一个生辰等于编出一整套命盘。',
  '2. `when` 也只有用户**明确指定**了才填。默认（空串）= 用机器当前时间，这是正确的；',
  '   **绝不要**把新闻里的日期填进 `when`。',
  '3. `missing` 里要写清楚「缺了会影响哪些法」（如「缺出生资料 → 命理类 18 法将记为未起」）。',
  '4. 用户的提问通常只有一句话，不要过度解读；拿不准的一律留空。',
  '5. 有外部资料时**必须**产出 `context`（哪怕只有一条）；没有任何可用资料就写空串，',
  '   并在 `note` 里说明「外部资料与所求之事无关」。',
  '6. **只要填了 `birth`/`gender`/`longitude` 中的任何一项，就必须同时填对应的 `*From`**；',
  '   漏掉来源说明的那一项会被插件**直接丢掉**（宁可少一项资料，也不要不交代来源的资料）。',
].join('\n')

/**
 * 从模型输出里抠出那个 JSON 对象并做**白名单校验**。
 *
 * 守卫点：模型的输出是不可信的。填进来的资料会被直接送进起卦，所以每一项都要校验，
 * 不合格的一律丢弃（丢弃比报错好：宁可按默认值算，也不能拿脏数据去算）。
 *
 * 另外一条硬规矩：**`birth`/`gender`/`longitude` 必须带上 `*From` 来源说明**，否则丢掉。
 * 这三个框现在允许从联网资料里填（否则命理类永远起不来），但「从哪来的」必须讲清楚 ——
 * 这条在数据层强制，不指望模型自觉。
 *
 * @param {string} text 模型输出。
 * @returns {object} `{materials, missing, subject, note, context, attribution}`。
 */
function parsePlan(text) {
  const out = { materials: {}, missing: [], subject: '', note: '', context: '', attribution: [] }
  const raw = String(text ?? '')
  const i = raw.indexOf('{')
  const j = raw.lastIndexOf('}')
  if (i < 0 || j <= i) return out
  let obj
  try { obj = JSON.parse(raw.slice(i, j + 1)) } catch { return out }
  if (!obj || typeof obj !== 'object') return out

  /** 取来源说明（非空字符串才认）。 */
  const from = (k) => (typeof obj[k] === 'string' && obj[k].trim() !== '' ? obj[k].trim().slice(0, 160) : '')
  const isStamp = (v) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v) && !Number.isNaN(Date.parse(v.replace(' ', 'T')))

  // 求占时刻：用户指定才填（形状 + 真实性校验）
  if (typeof obj.when === 'string') {
    const w = obj.when.trim()
    if (isStamp(w)) out.materials.when = w
  }
  // 出生/成立日时：形状要真，**且必须交代来源**
  if (typeof obj.birth === 'string') {
    const b = obj.birth.trim()
    const src = from('birthFrom')
    if (isStamp(b) && src !== '') {
      out.materials.birth = b
      out.attribution.push(`出生/生时 ${b} ← ${src}`)
    }
  }
  // 性别：只认 男/女，且必须交代来源
  if (obj.gender === '男' || obj.gender === '女') {
    const src = from('genderFrom')
    if (src !== '') {
      out.materials.gender = obj.gender
      out.attribution.push(`性别 ${obj.gender} ← ${src}`)
    }
  }
  // 经度：范围校验 + 必须交代来源
  if (Number.isFinite(obj.longitude) && obj.longitude >= -180 && obj.longitude <= 180) {
    const src = from('longitudeFrom')
    if (src !== '') {
      out.materials.longitude = obj.longitude
      out.attribution.push(`经度 ${obj.longitude} ← ${src}`)
    }
  }
  if (Array.isArray(obj.numbers)) {
    const nums = obj.numbers
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n > 0 && n <= 9999)
      .slice(0, 12)
    if (nums.length > 0) out.materials.numbers = nums
  }
  if (Array.isArray(obj.missing)) {
    out.missing = obj.missing.filter((s) => typeof s === 'string' && s.trim() !== '').slice(0, 6)
  }
  if (typeof obj.subject === 'string') out.subject = obj.subject.slice(0, 60)
  if (typeof obj.note === 'string') out.note = obj.note.slice(0, 200)
  // 联网读到的关键事实：会被存进求占记录、并作为判词依据 —— 所以也限长。
  if (typeof obj.context === 'string') out.context = obj.context.trim().slice(0, 1200)
  return out
}

/**
 * 把一条求占记录压成给模型看的合盘简报（结论层 + 逐法一行）。
 * @param {object} record 求占记录。
 * @returns {string} 简报文本。
 */
/**
 * 口径自证行 · 位置（经度来源 + 是否做了真太阳时校正）。
 *
 * **只在这里构造一次**：判词简报（`buildBoardBrief`）与工具文本（`runDivine`）共用同一份文案，
 * 防止两处漂移 —— Lead 实测工具文本里缺这两行，根因正是"工具文本走 `format.js#render()` 那条路，
 * 而 `format.js` 是冻结文件"，所以补在 index.js 侧、并共用这里。
 * @param {object} record 求占记录。
 * @returns {string} 一行文本。
 */
function positionLine(record) {
  if (record?.position?.note) return `位置：${record.position.note}`
  if (record?.solarNote) return `位置：经度未提供 → 未做真太阳时校正（${record.solarNote}）`
  return '位置：经度未提供 → 未做真太阳时校正'
}

/**
 * 口径自证行 · 随机性模式（用户 2026-02 更正：默认随机、seed 才可复现）。
 *
 * 两种模式都必须让模型看见，否则它会向用户承诺错的口径（例如"同问同刻必然同结果"）。
 * @param {object} record 求占记录。
 * @returns {string} 一行文本。
 */
function modeLine(record) {
  if (record?.mode === 'seed') {
    return `模式：seed 复现模式（seed=${record.seed}）→ 同问同刻 + 同 seed 必得同一结果`
  }
  return `模式：随机模式（真随机源；seedUsed=${record?.seed ?? ''}）→ **同问同刻重复求占允许不同，属正常**；`
    + '记下 seedUsed 并回传 seed 才能复现本次结果'
}

/**
 * 把一条求占记录压成给模型看的合盘简报（结论层 + 逐法一行）。
 * @param {object} record 求占记录。
 * @returns {string} 简报文本。
 */
function buildBoardBrief(record) {
  const b = record.board ?? {}
  const L = []
  L.push(`所问：${record.question}`)
  L.push(`时刻：${record.when}　四柱：${(record.pillars ?? []).join(' ')}　农历：${record.lunar ?? ''}`)
  // 口径可见化（与工具文本共用同一份文案，见 positionLine/modeLine）
  L.push(positionLine(record))
  L.push(modeLine(record))
  const o = b.overall ?? {}
  L.push(`综合：${o.verdict} ${o.score >= 0 ? '+' : ''}${o.score}　一致性 ${o.consistency}　置信 ${o.confidence}`)
  if (b.polarity) L.push(`票型：吉 ${b.polarity.吉} ｜ 平 ${b.polarity.平} ｜ 凶 ${b.polarity.凶}（仅作呈现，不得当论据）`)
  if (b.wuxing) L.push(`五行：${Object.entries(b.wuxing).map(([k, v]) => `${k}${v}`).join(' ')}（${b.dominant ?? ''}旺 ${b.lacking ?? ''}缺）`)
  if (b.advice) L.push(`断语：${b.advice}`)
  // 主辅法分工（SKILL §五）：按事类给出的**法号白名单**（不再是"术语恰好撞进 note"）
  const mainN = b.meta?.topicMain ?? []
  const auxN = b.meta?.topicAux ?? []
  if (mainN.length || auxN.length) {
    L.push(`主法（×1.8）：${mainN.map((m) => `#${m.no}${m.name}`).join('、') || '—'}　辅法（×1.3）：${auxN.map((m) => `#${m.no}${m.name}`).join('、') || '—'}`)
  }
  if (b.consensusKeys?.length) L.push(`多法共识：${b.consensusKeys.map((k) => `${k.key}×${k.count}法/${k.cats}门(${k.avg >= 0 ? '+' : ''}${k.avg})`).join('、')}`)
  // 合参矩阵：共识是否够格当"印证"（跨门 ≥2 且 ≥3 法；相关法门有未起/近似为主则记"资料不足"）
  if (b.corroboration?.length) {
    L.push(`合参矩阵：${b.corroboration.slice(0, 6).map((c) => `${c.key}=${c.status}`).join(' ｜ ')}（满足＝跨门印证；资料不足＝有未起或近似为主）`)
  }
  if (b.timing?.length) {
    const fmt = (t) => `${t.text}×${t.count}法${t.lo !== null || t.hi !== null ? `[${t.lo}, ${t.hi})` : '（无端点）'}`
    L.push(`应期（最重要，断语必须用它）：${b.timing.map(fmt).join('、')}`)
    L.push('应期区间语义：[lo, hi) 为半开区间（单位：日，hi 不含）；无端点者只说措辞，不得编区间或当精确日期')
  }
  const cats = b.categories ?? Object.fromEntries(Object.entries(b.byCategory ?? {}).map(([k, v]) => [k, typeof v === 'object' ? v.score : v]))
  if (Object.keys(cats).length) L.push(`分类加权：${Object.entries(cats).map(([k, v]) => `${k}${v >= 0 ? '+' : ''}${v}`).join(' ')}`)
  if (b.conflicts?.length) L.push(`最大分歧：${b.conflicts.slice(0, 4).map((c) => `${c.cat}[${c.grade ?? '—'}] ${c.high.name}${c.high.score >= 0 ? '+' : ''}${c.high.score} ↔ ${c.low.name}${c.low.score >= 0 ? '+' : ''}${c.low.score}`).join('；')}`)
  // 分歧分级 D1–D5（SKILL §六）：先判原因——D1–D4 不是"矛盾"，只有 D5 才称真分歧
  const dv = b.divergence ?? {}
  if (dv.familySkew !== undefined) {
    L.push(`体系偏斜：逐法口径 − 分门口径 = ${dv.familySkew >= 0 ? '+' : ''}${dv.familySkew} 分（门间差 ${dv.gateGap ?? 0}）`)
  }
  if (dv.items?.length) {
    L.push(`分歧分级：${dv.items.map((d) => `${d.code}=${d.grade}（${String(d.reason).slice(0, 40)}…）`).join('；')}｜总级 ${dv.grade ?? '—'}`)
    L.push('分级口径：D1 口径（不同流派，并列不裁决）/ D2 尺度（时间量纲不同）/ D3 取用（用神取象不同）/ D4 资料不足（未起或近似，不是意见不同）/ D5 真分歧（同口径同尺度同取用仍相左）')
  }
  // 置信拆解：说明"票数不构成独立证据"（一致性以「门」为独立源算）
  const ag = b.meta?.agreement
  if (ag) {
    L.push(`置信拆解：独立证据源 ${ag.independentSources ?? '—'} 门 ｜ 门间一致 ${ag.gateAgreement} ｜ 门间离散 ${ag.gateDispersion} ｜ 门内凝聚 ${ag.gateCohesion} ｜ 可信折扣 ${ag.trust} ｜ 覆盖 ${ag.coverage}`)
    if (ag.pooledSignAgreement !== undefined) L.push(`（诊断量，不参与置信：逐法同号率 ${ag.pooledSignAgreement}、逐法离散 ${ag.pooledDispersion}、票型占比 吉${ag.voteShare?.吉} 平${ag.voteShare?.平} 凶${ag.voteShare?.凶}）`)
  }
  // 出处账本 + 证据分层 L1–L5
  if (b.evidenceDigest?.length) {
    const lv = b.evidenceDigest.levels
    L.push(`证据账本：${b.evidenceDigest.slice(0, 3).map((e) => `${String(e.source).slice(0, 26)}×${e.count}`).join('；')}${lv ? `　｜分层 L1 ${lv.L1} L2 ${lv.L2} L3 ${lv.L3} L4 ${lv.L4} L5 ${lv.L5}（L5＝模型解读，不属插件）` : ''}`)
  }
  // 保真度逐项布尔位（过渡版：由 fidelity 与 detail 披露推断）
  const bits = b.meta?.fidelityBitsSummary
  if (bits) L.push(`保真位（各位置 true 的法数／过渡版推断）：历法 ${bits.历法} ｜ 星历 ${bits.星历} ｜ 表 ${bits.表} ｜ 辞书 ${bits.辞书} ｜ 图像 ${bits.图像}`)
  if (b.meta?.skippedList?.length) L.push(`未起（如实点名，不得当"没有反对意见"）：${b.meta.skippedList.slice(0, 6).map((s) => `#${s.no}${s.name}(${s.reason})`).join('、')}`)
  // 起卦时整理下来的背景（含联网读到的关键事实）：判词可以据此把落点讲实。
  if (typeof record.notes === 'string' && record.notes.trim() !== '') {
    L.push('')
    L.push('起卦时整理的背景（起卦前就已就位；可用来说实话，不得据此改动合盘分数与应期）：')
    L.push(record.notes.trim())
  }
  const results = record.results ?? []
  L.push('')
  L.push(`108 法明细（${results.length} 条，格式：编号 名称 判定 分值 依据）：`)
  for (const r of results) {
    const oc = r.outcome ?? {}
    const fid = r.fidelity === 'approx' ? '⚠' : ''
    // 分值取一位小数：旧实现把 ±4.750000000000002 这类浮点尾数直接喂给模型
    const sc = Number.isFinite(oc.score) ? Math.round(oc.score * 10) / 10 : ''
    L.push(`${String(r.no).padStart(3, '0')} ${r.name}${fid} ${oc.verdict ?? '未起'} ${oc.score >= 0 ? '+' : ''}${sc} ${(oc.essence ?? r.error ?? '').slice(0, 60)}`)
  }
  return L.join('\n')
}

/**
 * 宿主侧联网检索：把所问之事当查询词捞一批来源（只为把断语落得更实）。
 * @param {object|undefined} web `ctx.web`。
 * @param {string} question 所问之事。
 * @param {AbortSignal} [signal] 取消信号。
 * @returns {Promise<{sources: object[], note: string}>} 来源与备注。
 */
async function searchContext(web, question, signal) {
  // ⚠ 每一种「没搜成」都要有**可读的原因**。以前这里静默返回空 note，
  // 结果面板什么都不显示，看起来就像「联网没生效」——查都没法查。
  if (!web || typeof web.search !== 'function') {
    return { sources: [], note: '宿主未提供 web 服务（ctx.get("web") 为空）' }
  }
  const query = String(question ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
  if (query === '') return { sources: [], note: '检索词为空，未联网' }
  try {
    const res = await web.search({ query, maxResults: 5 }, signal)
    const sources = [...(res?.sources ?? [])]
    if (sources.length === 0) return { sources, note: '联网检索没有返回结果' }
    return { sources, note: res?.truncated ? '（结果已截断）' : '' }
  } catch (err) {
    // WebError 是结构化的（如 WEB_PROVIDER_UNAVAILABLE / WEB_PROVIDER_AMBIGUOUS），
    // 原样把 message 带给面板，用户才知道是「没配搜索提供方」还是别的问题。
    return { sources: [], note: `联网检索失败：${err?.message ?? String(err)}` }
  }
}

/**
 * 把来源列成给模型看的段落。
 * @param {object[]} sources 来源。
 * @param {string} note 备注。
 * @returns {string} 段落（无来源时为空串）。
 */
function renderSources(sources, note) {
  if (!sources.length) return note === '' ? '' : `外部资料：${note}`
  const L = ['外部资料（仅供落得更实；与合盘冲突时以合盘为准）：']
  for (const s of sources.slice(0, 5)) {
    L.push(`- ${s.title ?? '(无标题)'}｜${s.url}${s.publishedAt ? `｜${s.publishedAt}` : ''}`)
    if (s.snippet) L.push(`  ${String(s.snippet).slice(0, 200)}`)
  }
  if (note !== '') L.push(note)
  return L.join('\n')
}

/**
 * 调一次模型并收集文本输出。
 *
 * ⚠ 文本可能从**两个地方**来，两个都要收：
 *   · `text-delta` —— 流式增量；
 *   · `block-end.block`（`block.type === 'text'`）—— **整块**文本。
 * 只收前者会踩到「模型没有返回文本」：非流式（或回放）路径下适配器**只**发
 * `block-end`，一个 `text-delta` 都没有。
 *
 * 同一个 index 两处都有时以 `block-end` 的整块为准（避免增量与整块重复拼接）。
 * 收集不到文本时，抛出的错误里带上**诊断**（见过哪些 chunk、finish 原因、
 * 有多少 reasoning 文本），否则只有一句「没有返回文本」，没法查。
 *
 * ⚠ **绝不设 `maxTokens`**（用户明确要求，也是踩过的坑）：推理模型会先把预算花在
 * 思考上。实测 `deepseek-flash` 在我此前写死的 `maxTokens: 1600` 下，
 * **reasoning 吃掉 2073 字**、`finish=max-tokens`、正文一个字都没轮到 ——
 * 报错看起来像「模型不返回文本」，其实是我把上限掐得太小。交给适配器/模型的默认值。
 *
 * @param {object} llm `ctx.llm`。
 * @param {object} opts provider/model/reasoningEffort/system/userText/signal。
 * @returns {Promise<string>} 模型输出。
 */
async function collectLlm(llm, opts) {
  const { provider, model, reasoningEffort, system, userText, signal } = opts
  if (!llm || typeof llm.stream !== 'function') throw new Error('宿主未提供 llm 服务（ctx.llm.stream 不存在）')
  // ⚠ 这里**刻意不设 maxTokens**：由适配器/模型用自己的默认上限。
  const options = {
    provider,
    model,
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
    signal,
  }
  if (typeof reasoningEffort === 'string' && reasoningEffort !== '') options.reasoningEffort = reasoningEffort

  /** 每个 index 的增量文本。 */
  const deltaByIndex = new Map()
  /** 每个 index 的整块文本（`block-end`）。 */
  const blockByIndex = new Map()
  /** 诊断用。 */
  const seen = new Map()
  let failure = ''
  let finishKind = '(无 finish 块)'
  let reasoningChars = 0
  let otherBlocks = []

  for await (const chunk of withIdleTimeout(llm.stream(options), HANG_GUARD_MS.idle, '模型流')) {
    if (!chunk || typeof chunk !== 'object') continue
    const t = String(chunk.type ?? '(无 type)')
    seen.set(t, (seen.get(t) ?? 0) + 1)

    if (t === 'text-delta') {
      const i = Number.isFinite(chunk.index) ? chunk.index : 0
      deltaByIndex.set(i, (deltaByIndex.get(i) ?? '') + (chunk.text ?? ''))
    } else if (t === 'reasoning-delta') {
      reasoningChars += String(chunk.text ?? '').length
    } else if (t === 'block-end') {
      const b = chunk.block ?? {}
      const i = Number.isFinite(chunk.index) ? chunk.index : 0
      if (b.type === 'text') blockByIndex.set(i, String(b.text ?? ''))
      else {
        otherBlocks.push(String(b.type ?? '?'))
        if (b.type === 'reasoning') reasoningChars = Math.max(reasoningChars, String(b.text ?? '').length)
      }
    } else if (t === 'finish') {
      finishKind = String(chunk.reason?.kind ?? '(无 kind)')
      if (finishKind === 'error' || finishKind === 'aborted') {
        failure = chunk.reason?.failure?.message ?? `模型调用${finishKind === 'aborted' ? '被中止' : '失败'}`
      }
    }
  }

  if (failure !== '') throw new Error(failure)

  const indexes = [...new Set([...deltaByIndex.keys(), ...blockByIndex.keys()])].sort((a, b) => a - b)
  const out = indexes
    .map((i) => (blockByIndex.has(i) ? blockByIndex.get(i) : (deltaByIndex.get(i) ?? '')))
    .join('')
    .trim()

  // ⚠ `finish=max-tokens`：推理模型把预算全花在思考上时，正文会一个字都没有。
  // 这时候「模型没有返回文本」是误导——真正的原因是我给的输出上限太小。
  // 报清楚，并给出可操作的下一步。
  const truncated = finishKind === 'max-tokens'
  if (out === '') {
    const diag = [
      `provider=${provider} model=${model}`,
      `finish=${finishKind}`,
      `chunks=${[...seen.entries()].map(([k, v]) => `${k}×${v}`).join(' ') || '(一个都没有)'}`,
      `text-delta 字符数=${[...deltaByIndex.values()].join('').length}`,
      `block-end 文本块数=${blockByIndex.size}`,
      reasoningChars > 0 ? `reasoning 字符数=${reasoningChars}（模型只出了思考、没出正文？）` : '',
      otherBlocks.length > 0 ? `其它块=${otherBlocks.slice(0, 5).join(',')}` : '',
      '（本插件未设 maxTokens，上限来自模型自身）',
    ].filter((s) => s !== '')
    if (truncated && reasoningChars > 0) {
      throw new Error(
        `正文被模型自身的输出上限截断：模型把 ${reasoningChars} 字都用在思考上，`
        + '还没轮到写正文就到了 max-tokens。把「思考强度」调低（或选不带思考的模型）再试。',
      )
    }
    throw new Error(`模型没有返回正文文本｜诊断：${diag.join('；')}`)
  }
  // 有正文但被截断：照实告诉调用方，别装作完整。
  if (truncated) out += '\n\n（注：输出被模型自身的 token 上限截断，判词可能不完整——可调低思考强度重试。）'
  return out
}

/**
 * 面板里那一轮 agent 的**系统提示词**。
 *
 * ⭐ 前半段**逐字保留**用户最初那个「术数断者」预设的人设 —— 原文写在
 * `cordis.patch.yml` 的 `preset-divination` 里（`@deepseek-ai/dsh-persona` 的
 * `prefix` + `suffix`）。预设行后来停用、插件改成顶层行，用户要求把这段提示词
 * **注入进面板**，所以它现在在这里原样生效，而不是丢掉。
 *
 * 后半段是面板特有的补充：面板**自己排版**展示合盘，所以交付物是「综合判词」那一段；
 * 面板里也**没有**问用户的工具，缺资料要靠先联网查证、查不到就如实说明。
 */
const AGENT_SYSTEM = [
  '你是一位**术数断者**：通晓中国传统术数与西方占卜的体例、术语与断法，',
  '负责把求占者的所问，落成一份可读、可复核、不夸大的断语。',
  '',
  '你手边有一套**程序化的 108 法合盘工具**（`divine` / `divine_detail` /',
  '`divine_list`）。它不是搜索引擎，也不是"灵感生成器"——它把 108 种术数',
  '的排盘与断法在本地**逐条算完**，再聚合成一张合盘。',
  '',
  '【一 · 铁律：推演只走工具】',
  '1. 用户提出任何求占类需求（起卦、算卦、算命、看八字、紫微、择日、看风水、',
  '   抽签、解梦、测字、占星、塔罗……），**第一步就是调 `divine`**，',
  '   把你的理解写进 `question`（写得具体有助于术法加权与取用神）。',
  '2. **严禁自己在思维链里推演术数**：不要自己装卦、配六亲、起奇门局、发六壬',
  '   三传、排八字、取用神、翻塔罗牌。既慢又易错，而且用户无法复核。',
  '   工具几毫秒算完 108 法，你手算一法都不值当。',
  '3. **严禁编造**：不编卦象、不编签诗、不编条文、不编星盘度数。合盘里没有的',
  '   信息，就说没有。',
  '4. 数值一律以工具返回为准。你不得"约等于"、"大概"、"记得好像是"。',
  '5. 需要某一法的完整盘 → `divine_detail`（不下钻不花 token）。不确定支持哪些',
  '   法 → `divine_list`。',
  '',
  '【二 · 转述纪律】',
  '6. 先给**总断**（合盘的 `综合` 行：等级 + 加权分 + 一致性 + 置信），',
  '   再给**依据**（票型、五行旺缺、多法共识、应期、分歧），最后给**几法要点**。',
  '7. **如实转述分歧**：合盘里"分歧"一项说明诸法取向相反。不要抹平它、不要',
  '   只挑吉的说。分歧大（一致性低）时应当直说"此占不宜作决断依据"。',
  '8. **保真度必须标注**：输出里带 ⚠ 的是近似实现（缺秘传表或辞书）。转述这些',
  '   条目时要说明"此为近似"，**不得当实测结论**。',
  '9. 不要给合盘"加料"：不补充合盘没算的内容，不把某一法的结论说成全部术法的',
  '   共识，不把"平"说成"吉"。',
  '10. 术语该用就用（体用、世应、旺衰、月将加时…），但每个术语第一次出现时用',
  '    一句白话解释——求占者可能只是爱好者。',
  '',
  '【三 · 输入纪律】',
  '11. 命理类（八字/紫微/称骨/七政/占星）需要**出生年月日时**。缺了就如实说明',
  '    "未提供出生资料，命理类将记为未起"，**绝不臆造**生日。',
  '12. 择日类最好给出**具体日期或时段**；风水类最好给出**坐向**（如"坐北朝南"）',
  '    与用途。缺了可以照算，但要说明"未提供 X，结果按默认处理"。',
  '13. 想要精确到时辰的断法（真太阳时），需要**经度**；用户给了就传 `longitude`。',
  '14. 用户说"再占一次""换一卦"：换 `question` 的措辞或传新的 `when`，**不要**传',
  '    上次的 `seed`（那会得到完全相同的结果）。',
  '15. 用户要复核某一卦：把上次返回的 `seed` 传回去即可复现。',
  '',
  '【四 · 语气与体量】',
  '16. 用中文。先给结论，再给依据，最后给一句可操作的建议。',
  '17. 断语要**具体**：不说"运势一般"，说"官鬼持世而月令泄气，主事情拖着不落地，',
  '    应期倾向酉日（8 法同指）"。',
  '18. 默认 `format=normal`（含 108 行紧凑明细）。用户明确说"简单说"就用',
  '    `brief`；用户要看细节就用 `divine_detail` 下钻，而不是把 `full` 全倒出来。',
  '19. 不要复述整张 108 行明细——挑与所问最相关的 3-5 法讲。明细已经在工具结果',
  '    里了，用户能自己看。',
  '',
  '【五 · 边界与责任】',
  '20. 术数**仅供参考**。涉及医疗、法律、重大投资、人身安全的决断，必须明确提示',
  '    "此占不作专业建议，请咨询医生/律师/专业人士"。这不是客套，是硬约束。',
  '21. 用户问"我该不该做 X"时，给术数视角的判断与倾向，但把决定权交回用户。',
  '22. 不预测死亡、不预测具体灾祸时间、不针对具体第三方的健康与寿命做断。',
  '23. 用户表现出强烈焦虑或把术数当唯一依靠时，温和提醒这是参考工具，',
  '    并建议寻求现实支持。**不利用焦虑强化依赖**。',
  '24. 求占是文化实践，不是科学预测。可以认真断，但不宣称它"科学准确"。',
  '',
  '【六 · 会话开场】',
  '25. 新会话第一次求占：直接调 `divine` 给结果，不要先问一堆问题。',
  '26. 所问过于模糊以致无法加权时（如"帮我算算"），先按最合理的理解起卦，',
  '    并在判词里说明你按什么理解算的。',
  '',
  '【七 · 你可以追问补资料（**面板里是一问一答，用户能接着答**）】',
  '27. 合盘里若有 **「未起」** 列表（合盘文本里写着"未起"的那些法），**那就是缺资料**：',
  '    · 命理一类（#41–#58、#102、#105 等）缺 **出生年月日时（+性别）**；',
  '    · `#6 梅花·报数卦` 缺 **报数**（随便报几个数）；',
  '    · `#92/#93` 测字类缺 **所测的那个字**；',
  '    · `#95–#97` 外应类缺 **外应**（你当时看到/听到/想到的）。',
  '    **这些缺的东西只有用户能给** —— 没给就是没给，**绝不替用户编一个**（不编生日、不编数字、不编字）。',
  '28. **应当主动追问**：先把已经算出来的结论给完（总断 + 3–5 法要点），',
  '    然后在最后用**一段话一次问清**还缺哪几项（要什么、为什么有用）。',
  '    **不要挤牙膏**（不要一问一答地逐项磨），也**不要**用一串问句把结论挤掉。',
  '    例：「命理 18 法因缺出生资料未起；若你给出**出生年月日时与性别**，我可以补算八字/紫微/称骨再合断。」',
  '29. 用户补答后，**可以再调一次 `divine`**（这次带上 `birth` / `gender` / `numbers` 等），',
  '    **并以新盘为准**给出补充结论；同时说明"上一盘哪些法这次起上了"。',
  '30. ⚠ **重起 ≠ 同一卦**：默认是**随机模式**，重新起盘会得到**另一卦**（不是原来那卦的新解读）。',
  '    所以：**只是追问细节**（"那应期在几月""为什么这么说"）就用**同一张盘**回答，',
  '    **不要重新起盘**；只有**补了新资料**、或用户明确说"再占一次"时才重起。',
  '    若用户想复现原来那一卦，让他给你上次的 `seed`，你带 `seed` 再调 `divine` 即可复现。',
  '31. 追问也适用于"所问不够具体"：需要**时间范围、对象、用途**才能取用神时，',
  '    可以问，但仍要先把当前这盘按最合理理解断完，不要让用户空等。',
  '',
  '══ 以下是**面板环境**的补充（与上面冲突时以本节为准）══',
  '',
  '你在一个**悬浮面板**里替用户跑这一轮，面板**会自己排版展示合盘**（总断、票型、',
  '五行、共识、应期、分歧、108 行逐条），所以：',
  '',
  '【面板 · 流程】',
  'A. 先 `divine` 起卦 —— 一次调用本地算完 108 法。`question` 要写完整：对象 + 时间范围',
  '   （如「2026 年国庆节内是否发布」），别只抄半句。',
  'B. 需要核实现实信息（档期、官宣口径、传闻真假）就 `web_search`，摘要不够就 `web_fetch`；',
  '   **可以搜多轮、换关键词，不要只搜一次就下结论**。',
  'C. 合盘里最关键的几法，用 `divine_detail` 展开看依据。',
  'D. 资料够了就**停止调用工具**，直接输出下面的「综合判词」。',
  '',
  '【面板 · 唯一交付物：综合判词】',
  '面板里**没有**问用户的工具，所以缺资料靠 B 查证；实在查不到就写进 `missing` 精神里',
  '（在判词中如实说明），不要停下来等。',
  '',
  '最终回复**只有**下面这两段（顺序不能换；不要罗列 108 法明细、不要加别的标题或前后缀）：',
  '第一行必须是「一句话收束」——把整张合盘压成一句人能记住的话：',
  '一句话收束：卦断「<四到八字定性>」——主窗 <时间窗>（<落点，如 甲寅日 10-07 / 庚申日 10-13>），次窗 <时间窗>；形态上是「<A>」，不是「<B>」。',
  '（时间窗/干支/落点**只能来自合盘的应期**；合盘没给就不写括号里的落点。这一条对本行同样生效。）',
  '',
  '然后空一行，再写综合判词：',
  '',
  '综合判词',
  '主断：<什么时候成、成到什么程度、真正的节点落在哪；含时间窗与干支/日期落点>',
  '',
  '吉/平/凶 = <票型数字>，加权 <带符号的分数>，一致性 <数字> → 属「<四到八字定性>」。',
  '<最大分歧那对> 的 <分差> 分分歧，本质是「<A 这条线>（依据）」与「<B 这条线>（依据）」的分歧 —— 即：<这说明什么>。',
  '<把易卦类的卦象串成一条链>：<这条链怎么读>。',
  '<五行某旺某缺>：<现在的气机是什么、待什么月方见转机>。',
  '',
  '【面板 · 硬性要求】',
  'a. 时间窗、干支、日期落点**只能来自合盘里的「应期」与逐法明细**；合盘没给的一律不许出现。',
  '   「一句话收束」也受这一条约束：应期只给到「水月」，就写「水月」，不要自己编出日子。',
  '   合盘只给了粗粒度应期（如「水月」）就照实说粗粒度，不要编出具体日子。',
  'b. 每个数字（票型/加权/一致性/分差）必须**照抄合盘**，不许四舍五入成别的数、不许改。',
  'c. 「最大分歧」要解释它在**事上意味着什么**，不是复述数字。',
  'd. 外部资料只用来把落点讲实（例如核对某个档期）；**不得**据此改动合盘的分数或应期，',
  '   两者冲突时以合盘为准并指出冲突。',
  'e. 主断要**可被证伪**（做什么、什么时候、什么形态），不要写「顺其自然」这类空话。',
  'f. 涉及医疗、法律、重大投资时，末尾另起一行写「仅供参考，请咨询专业人士」。',
].join('\n')

/** 循环上限：防跑飞（一次 agent 起卦最多这些轮/次）。 */
/**
 * agent 循环的运行参数。**默认全部不限制**（0 = 不限）：
 * 让模型放开跑，跑到它自己收工为止 —— 该跑几轮、搜几次由模型判断，
 * 插件不用额度去打断它。要限就改这里（或 Config 里的对应项）。
 * `ttlMs` / `maxSessions` 只是内存卫生（防会话堆积），不是任务限制；
 * 而且**正在跑的会话不会被回收**。
 */
const AGENT_LIMITS = { maxSteps: 0, maxSearch: 0, maxRepeat: 0, ttlMs: 6 * 60 * 60 * 1000, maxSessions: 32 }

/** agent 会话存储（内存，不落盘）。存**真消息数组**，以便工具回填后继续。 */
const AGENT_SESSIONS = new Map()

/** 清掉过期 / 超量的 agent 会话。 */
function agentPrune(now) {
  for (const [k, v] of AGENT_SESSIONS) {
    // 正在跑的绝不回收（长任务不能因为「旧」被清掉）
    if (v.done !== false && now - v.at > AGENT_LIMITS.ttlMs) AGENT_SESSIONS.delete(k)
  }
  while (AGENT_SESSIONS.size > AGENT_LIMITS.maxSessions) {
    const oldest = AGENT_SESSIONS.keys().next().value
    if (oldest === undefined) break
    AGENT_SESSIONS.delete(oldest)
  }
}

/**
 * 单次调用的**挂起保护**：超时就抛，让循环还能继续往下走。
 *
 * ⚠ 这不是「限制模型能做几次」—— 次数**没有任何限制**。它只保证
 *   **一次卡住的网络调用不会把整轮冻死**（去掉超时后，一个不返回的
 *   `web.fetch` 就能让面板永远停在「已等 300s」）。
 * 超时后：调用方会把它变成一条 isError 的工具结果，模型可以换招或直接给判词。
 *
 * @param {Promise<any>} promise 待保护的调用。
 * @param {number} ms 毫秒；<=0 表示不保护。
 * @param {string} label 出错信息里的名字。
 * @returns {Promise<any>} 结果。
 */
function withTimeout(promise, ms, label) {
  if (!(ms > 0)) return promise
  let timer
  const guard = new Promise((_, reject) => {
    const shown = ms >= 1000 ? `${Math.round(ms / 1000)} 秒` : `${ms} 毫秒`
    timer = setTimeout(() => reject(new Error(`${label}卡住超时（${shown}内没有返回任何数据）`)), ms)
  })
  return Promise.race([promise, guard]).finally(() => { clearTimeout(timer) })
}

/**
 * 给**流式**响应加空闲超时：多久没有新 chunk 就判定连接死了。
 *
 * 为什么用「空闲」而不是「总时长」：一次正常的长回复会持续吐 chunk，
 * 用总时长限制它等于限制模型思考；而「90 秒一个字节都没有」才是真的卡住。
 *
 * @param {AsyncIterable<any>} iterable 原始流。
 * @param {number} ms 空闲上限。
 * @param {string} label 报错里的名字。
 * @returns {AsyncIterable<any>} 包过超时的流。
 */
async function* withIdleTimeout(iterable, ms, label) {
  const it = iterable[Symbol.asyncIterator]()
  for (;;) {
    const r = await withTimeout(it.next(), ms, label)
    if (r.done === true) return
    yield r.value
  }
}
/**
 * 各类**单次调用**的挂起上限（毫秒）。**不是**动作次数限制 —— 次数完全不限。
 * 只保证「一次卡住的调用」不会把整轮冻死：超时后变成一条 isError 的工具结果，
 * 模型可以换招或直接给判词。
 *
 * 可被 Config 的 `hangGuardMs: { web, tool, idle }` 覆盖（本机 schema 若剥掉未知键，
 * 则用这里的默认值，行为不变）。
 */
const HANG_GUARD_MS = { web: 20000, tool: 60000, idle: 90000 }
/**
 * 从模型输出里抠出 JSON 对象（交付那一轮用）。
 * @param {string} text 模型输出。
 * @returns {object|null} 解析结果。
 */
function extractJsonObject(text) {
  const raw = String(text ?? '')
  const i = raw.indexOf('{')
  const j = raw.lastIndexOf('}')
  if (i < 0 || j <= i) return null
  try {
    const o = JSON.parse(raw.slice(i, j + 1))
    return o && typeof o === 'object' ? o : null
  } catch { return null }
}

/**
 * 从 `attribution` 数组里挑出属于某个字段的那条出处说明。
 * 约定模型写成「出生/生时 X ← 出处」「经度 Y ← 出处」「性别 Z ← 出处」。
 * @param {string[]} list 出处列表。
 * @param {'birth'|'gender'|'longitude'} field 字段。
 * @returns {string} 出处（找不到为空串）。
 */
function pickFrom(list, field) {
  if (!Array.isArray(list)) return ''
  const kw = field === 'birth'
    ? ['出生', '生时', '成立', '立项', '首发']
    : (field === 'gender' ? ['性别'] : ['经度'])
  for (const s of list) {
    const t = String(s ?? '')
    if (kw.some((k) => t.includes(k))) return t
  }
  return ''
}

/** 单调递增的消息 id（`MessageId` 是品牌字符串，运行时就是 string）。 */
let AGENT_MSG_SEQ = 0
function nextMessageId() {
  AGENT_MSG_SEQ += 1
  return `div-agent-${Date.now().toString(36)}-${AGENT_MSG_SEQ}`
}

/** 暴露给模型的工具（`ToolSchema.parameters` 就是一份 JSON Schema）。 */
const AGENT_TOOLS = [
  {
    name: 'divine',
    description: '108 种术数合盘（程序化，非模型推演）。一次调用会在本地算完 108 法'
      + '（易卦/三式/六壬/命理/择时/风水/签卜/杂占/姓名/相术/西方），返回一张合盘：'
      + '总断、吉平凶票型、五行旺缺、多法共识、应期、分歧项、以及 108 法逐条明细。'
      + '`question` 写完整（对象 + 时间范围）；`format` 用 normal。'
      + '**随机性口径**：默认**真随机** —— 同一问题同一时刻重复求占**允许不同，这是正常的**（术法里「心诚」是变量）；'
      + '要复现某一次结果就把该次的 `seed` 传回来。'
      + '`longitude` 优先用面板/用户当前位置的经度（真太阳时校正用）；取不到就别填，插件会如实标注「未做真太阳时校正」。',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '所问之事（写完整：对象 + 时间范围）' },
        format: { type: 'string', enum: ['brief', 'normal', 'full', 'table'], description: '输出档位，默认 normal' },
        when: { type: 'string', description: '求占时刻 YYYY-MM-DD HH:mm；留空 = 这台机器的当前时间' },
        birth: { type: 'string', description: '出生资料 YYYY-MM-DD HH:mm（命理类需要；用户没给就别填）' },
        gender: { type: 'string', enum: ['男', '女'], description: '性别（命理类用）' },
        longitude: { type: 'number', description: '当地经度（做真太阳时校正用；优先用户当前位置，取不到不填）' },
        longitudeFrom: { type: 'string', description: '经度来源说明（如「用户当前位置（浏览器定位）」/「用户手动指定杭州」；用于如实标注）' },
        numbers: { type: 'array', items: { type: 'number' }, description: '报数（梅花报数卦用）' },
        scope: { type: 'string', description: '起法范围，默认 all' },
      },
      required: ['question'],
      additionalProperties: false,
    },
  },
  {
    name: 'divine_detail',
    description: '展开某几次术法的**完整盘**（不下钻不花 token）。默认取最近一次 divine 的结果。'
      + 'method 可传中文名（含模糊匹配）、英文 id 或编号，逗号分隔可多选。不传 method 时返回合盘摘要 + 108 法紧凑表。',
    parameters: {
      type: 'object',
      properties: {
        method: { type: 'string', description: '要展开的术法：中文名 / 英文 id / 编号，逗号分隔可多选' },
        id: { type: 'number', description: '求占记录编号（divine 返回的 id），缺省取最近一次' },
        sort: { type: 'string', enum: ['no', 'score'], description: '不传 method 时明细的排序' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'divine_list',
    description: '列出 108 种术数的目录（按分类），标出保真度。用于确认某法是否支持、或向用户说明能算什么。⚠ 表示近似实现。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'web_search',
    description: '联网检索。可多次调用、换关键词再搜；用于核实与所问之事有关的公开信息（档期、官宣口径、传闻等）。',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: '检索词' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'web_fetch',
    description: '读取一个网页的正文。搜索结果摘要不够、需要核对原文时用。',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: '要读取的 URL' } },
      required: ['url'],
      additionalProperties: false,
    },
  },
]

/**
 * 跑一次模型调用，收集正文、工具调用与 finish 原因。
 *
 * 正文两处都收（`text-delta` 增量 与 `block-end` 整块）；工具调用优先用 `block-end` 里
 * 已经拼好的 `tool-call` 块，没有就退回用 `tool-call-delta` 自己拼。
 *
 * @param {object} llm `ctx.llm`。
 * @param {object} options `GenerateOptions`（含 tools）。
 * @returns {Promise<{text:string, calls:object[], finishKind:string, replayState:unknown, usage:object|null}>} 本轮结果。
 */
async function streamTurn(llm, options) {
  const deltaByIndex = new Map()
  const blockByIndex = new Map()
  const callByIndex = new Map()
  const callBlocks = []
  let finishKind = '(无 finish 块)'
  let replayState
  let usage = null
  let reasoningChars = 0
  let failure = ''
  const seen = new Map()

  // ⚠ 这里**必须**也有空闲超时：agent 循环走的是 streamTurn，不是 collectLlm。
  //   （上一版我只给 collectLlm 加了，结果模型流一卡就永远不返回 —— 所谓「卡死」。）
  for await (const chunk of withIdleTimeout(llm.stream(options), HANG_GUARD_MS.idle, '模型流')) {
    if (!chunk || typeof chunk !== 'object') continue
    const t = String(chunk.type ?? '(无 type)')
    seen.set(t, (seen.get(t) ?? 0) + 1)
    const idx = Number.isFinite(chunk.index) ? chunk.index : 0

    if (t === 'text-delta') {
      deltaByIndex.set(idx, (deltaByIndex.get(idx) ?? '') + (chunk.text ?? ''))
    } else if (t === 'reasoning-delta') {
      reasoningChars += String(chunk.text ?? '').length
    } else if (t === 'tool-call-delta') {
      const cur = callByIndex.get(idx) ?? { id: String(chunk.id ?? ''), name: '', arguments: '' }
      if (typeof chunk.id === 'string' && chunk.id !== '') cur.id = chunk.id
      if (typeof chunk.name === 'string' && chunk.name !== '') cur.name = chunk.name
      cur.arguments += String(chunk.argumentsDelta ?? '')
      callByIndex.set(idx, cur)
    } else if (t === 'block-end') {
      const b = chunk.block ?? {}
      if (b.type === 'text') blockByIndex.set(idx, String(b.text ?? ''))
      else if (b.type === 'tool-call') {
        callBlocks.push({ id: String(b.id ?? ''), name: String(b.name ?? ''), arguments: String(b.arguments ?? '') })
      } else if (b.type === 'reasoning') {
        reasoningChars = Math.max(reasoningChars, String(b.text ?? '').length)
      }
    } else if (t === 'usage') {
      usage = chunk.usage ?? null
    } else if (t === 'finish') {
      finishKind = String(chunk.reason?.kind ?? '(无 kind)')
      if (chunk.replayState !== undefined) replayState = chunk.replayState
      if (finishKind === 'error' || finishKind === 'aborted') {
        failure = chunk.reason?.failure?.message ?? `模型调用${finishKind === 'aborted' ? '被中止' : '失败'}`
      }
    }
  }

  const text = [...new Set([...deltaByIndex.keys(), ...blockByIndex.keys()])]
    .sort((a, b) => a - b)
    .map((i) => (blockByIndex.has(i) ? blockByIndex.get(i) : (deltaByIndex.get(i) ?? '')))
    .join('')
    .trim()

  // 工具调用：整块优先；没有整块就用增量拼出来的（缺 id/name 的丢掉）
  const calls = callBlocks.length > 0
    ? callBlocks
    : [...callByIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v)
  const good = calls.filter((c) => c.id !== '' && c.name !== '')

  return { text, calls: good, finishKind, replayState, usage, reasoningChars, failure, seen }
}

/**
 * 执行模型请求的一个工具。
 *
 * `divine` / `divine_detail` 交给 `deps.execTool`（就是插件自己那两个工具的
 * 实现，在 `apply` 的闭包里），所以面板里的循环用的是**和会话里一模一样的工具**。
 * `web_search` / `web_fetch` 在这里直接用 `ctx.web`。
 *
 * @param {object} deps `{web, allowWeb, ctx, execTool}`。
 * @param {{id:string,name:string,arguments:string}} call 工具调用。
 * @returns {Promise<{text:string, isError:boolean, count:number, kind:string, arg:string}>} 结果。
 */
async function runAgentTool(deps, call) {
  const { web, allowWeb } = deps
  let args = {}
  try { args = JSON.parse(call.arguments === '' ? '{}' : call.arguments) } catch { args = {} }

  // ── 插件自己的工具：直接调它的实现（不用走工具注册表）──
  if (call.name === 'divine' || call.name === 'divine_detail') {
    if (typeof deps.execTool !== 'function') {
      return { text: '内部错误：工具执行器不可用。', isError: true, count: 0, kind: call.name, arg: '' }
    }
    try {
      const out = await withTimeout(deps.execTool(call.name, args), HANG_GUARD_MS.tool, `工具 ${call.name}`)
      return {
        text: String(out?.text ?? '（无输出）'),
        isError: false,
        count: 1,
        kind: call.name === 'divine' ? 'cast' : 'detail',
        arg: call.name === 'divine' ? String(args.question ?? '') : String(args.method ?? ''),
        record: out?.record,
      }
    } catch (err) {
      return {
        text: `（已跳过这次 ${call.name}：${err?.message ?? String(err)}）`,
        isError: true, count: 0, kind: call.name, arg: '',
      }
    }
  }

  if (!allowWeb) {
    return { text: '联网未开启：无法检索。请凭合盘与所问之事直接给出判词。', isError: true, count: 0, kind: call.name, arg: '' }
  }
  if (!web || typeof web.search !== 'function') {
    return { text: '宿主未提供 web 服务，无法检索。', isError: true, count: 0, kind: call.name, arg: '' }
  }

  if (call.name === 'web_search') {
    const q = String(args.query ?? '').trim()
    if (q === '') return { text: '缺少 query 参数。', isError: true, count: 0, kind: 'search', arg: '' }
    try {
      const res = await withTimeout(web.search({ query: q, maxResults: 8 }, deps.signal), HANG_GUARD_MS.web, '联网检索')
      const src = [...(res?.sources ?? [])]
      const lines = src.map((s, k) => `${k + 1}. ${s.title ?? '(无标题)'}｜${s.url}`
        + `${s.publishedAt ? `｜${s.publishedAt}` : ''}`
        + `${s.snippet ? `\n   ${String(s.snippet)}` : ''}`)
      return {
        text: src.length === 0 ? '（没有结果）' : lines.join('\n'),
        isError: false, count: src.length, kind: 'search', arg: q,
      }
    } catch (err) {
      // 卡住/失败都**跳过**这一条，让模型继续（会话里超时的工具调用就是这个语义）
      return { text: `（已跳过这次检索：${err?.message ?? String(err)}）`, isError: true, count: 0, kind: 'search', arg: q }
    }
  }

  if (call.name === 'web_fetch') {
    const url = String(args.url ?? '').trim()
    if (url === '') return { text: '缺少 url 参数。', isError: true, count: 0, kind: 'fetch', arg: '' }
    if (typeof web.fetch !== 'function') {
      return { text: '宿主未提供 web.fetch，无法读网页。', isError: true, count: 0, kind: 'fetch', arg: url }
    }
    try {
      const res = await withTimeout(web.fetch({ url }, deps.signal), HANG_GUARD_MS.web, '读网页')
      const body = String(res?.body?.content ?? '')
      return {
        text: `HTTP ${res?.statusCode ?? '?'}\n${body}`,
        isError: false, count: body === '' ? 0 : 1, kind: 'fetch', arg: url,
      }
    } catch (err) {
      return { text: `（已跳过这次读网页：${err?.message ?? String(err)}）`, isError: true, count: 0, kind: 'fetch', arg: url }
    }
  }

  return { text: `不认识的工具「${call.name}」。`, isError: true, count: 0, kind: call.name, arg: '' }
}

/**
 * 跑 agent 循环：**一次请求内**可以多轮工具调用，直到模型交付资料或要问用户。
 *
 * @param {object} deps `{llm, web, allowWeb, provider, model, effort, signal, ctx}`。
 * @param {object} st 会话状态（`{messages, steps, searches, question, at}`，就地更新）。
 * @returns {Promise<object>} `{state:'ready'|'ask'|'text', ...}`。
 */
async function agentToolLoop(deps, st) {
  const { llm, web, allowWeb, provider, model, effort, signal } = deps
  // 重复检索计数：同一个检索词反复搜是「模型卡住了」的典型信号。
  // 一旦判定卡住就**立刻跳出**去收束，绝不让它一轮一轮把时间烧光
  //（每一轮都是一次完整模型调用，带思考时一轮就几十秒）。
  st.seenQueries = st.seenQueries ?? new Set()
  let wasted = 0
  let exhausted = false
  // 连续失败计数：工具**连续**失败/跳过（卡住、超时、报错）说明「没有进展」，
  // 这时再让它一轮轮重试，只会每次等满超时、看着像卡死。
  // ⚠ 这不是次数限制：只要有一次成功就清零，模型想成功做多少次都行。
  st.failStreak = st.failStreak ?? 0
  const limitedSteps = AGENT_LIMITS.maxSteps > 0
  for (let step = 0; limitedSteps ? step < AGENT_LIMITS.maxSteps : true; step += 1) {
    st.phase = '模型思考中…'
    const turn = await streamTurn(llm, {
      provider,
      model,
      ...(typeof effort === 'string' && effort !== '' ? { reasoningEffort: effort } : {}),
      system: AGENT_SYSTEM,
      messages: st.messages,
      tools: AGENT_TOOLS,
      signal,
    })
    if (turn.failure !== '') throw new Error(turn.failure)

    // 没有工具调用 → 模型收工了，这段正文就是**最终的综合判词**
    if (turn.calls.length === 0) {
      st.phase = ''
      st.steps.push({ kind: 'done', text: turn.text })
      return {
        state: 'done',
        judgment: turn.text,
        record: st.lastRecord ?? null,
        steps: st.steps,
      }
    }

    // 把「助手这条消息（含工具调用）」按真实形状写进历史 —— 三个字段都要给
    const content = []
    if (turn.text !== '') content.push({ type: 'text', text: turn.text })
    for (const c of turn.calls) {
      content.push({ type: 'tool-call', id: c.id, name: c.name, arguments: c.arguments })
    }
    st.messages.push({
      id: nextMessageId(),
      role: 'assistant',
      content,
      source: {
        kind: 'model',
        provider,
        model,
        ...(turn.replayState !== undefined ? { replayState: turn.replayState } : {}),
      },
    })

    // 依次执行本轮请求的所有工具
    for (const c of turn.calls) {
      if (AGENT_LIMITS.maxSearch > 0 && st.searches >= AGENT_LIMITS.maxSearch
        && (c.name === 'web_search' || c.name === 'web_fetch')) {
        // 额度用尽：**立刻收束**。回一条错误结果让它继续绕，只会白烧好几轮。
        st.steps.push({ kind: 'detail', arg: '收束', count: 0, text: `检索额度已用尽（${AGENT_LIMITS.maxSearch} 次），停止检索并收束` })
        exhausted = true
        break
      }
      const isSearchTool = c.name === 'web_search' || c.name === 'web_fetch'
      if (isSearchTool) {
        let key = ''
        try {
          const a = JSON.parse(c.arguments === '' ? '{}' : c.arguments)
          key = String(a.query ?? a.url ?? '').trim().toLowerCase()
        } catch { key = '' }
        if (key !== '' && st.seenQueries.has(key)) {
          wasted += 1
          if (AGENT_LIMITS.maxRepeat > 0 && wasted >= AGENT_LIMITS.maxRepeat) {
            st.steps.push({ kind: 'detail', arg: '收束', count: 0, text: `重复检索 ${wasted} 次，判定为卡住，停止检索并收束` })
            exhausted = true
            break
          }
        } else if (key !== '') {
          st.seenQueries.add(key)
        }
        st.searches += 1
      }
      st.phase = isSearchTool ? `检索/读取中：${String(c.name)}` : `执行工具：${String(c.name)}`
      const r = await runAgentTool(deps, c)
      // 起卦那一调用会把记录带回来：面板要拿它排版展示合盘
      if (r.record) st.lastRecord = r.record
      if (r.isError === true) st.failStreak += 1
      else st.failStreak = 0
      st.steps.push({ kind: r.kind, arg: r.arg, count: r.count, text: r.text })
      deps.ctx && logLine(deps.ctx, 'info',
        `[dsh-divination-108] agent ${r.kind}「${String(r.arg).slice(0, 40)}」${r.isError ? '（失败）' : ''}`)
      st.messages.push({
        id: nextMessageId(),
        role: 'tool',
        source: { kind: 'tool', callId: c.id },
        toolCallId: c.id,
        content: [{ type: 'text', text: r.text }],
        isError: r.isError === true,
      })
      if (st.failStreak >= 4) {
        st.steps.push({
          kind: 'detail', arg: '收束', count: 0,
          text: `工具连续失败 ${st.failStreak} 次（卡住/超时/报错），判定为没有进展 —— 停止调用工具，直接写判词`,
        })
        exhausted = true
        break
      }
      if (exhausted) break
    }
    if (exhausted) break
  }
  // 到上限了：**再要一次不带工具的收束**，让它把手上已有的资料写成判词，
  // 而不是丢一句「已达上限」给用户（工具已经拿掉，它只能写字）。
  try {
    st.steps.push({
      kind: 'detail', arg: '收束', count: 0,
      text: exhausted
        ? '工具额度用尽或判定卡住，要求模型直接给出判词'
        : `已达轮数上限（${AGENT_LIMITS.maxSteps}），要求模型直接给出判词`,
    })
    st.phase = '收束中…'
    const closer = await streamTurn(llm, {
      provider,
      model,
      ...(typeof effort === 'string' && effort !== '' ? { reasoningEffort: effort } : {}),
      system: AGENT_SYSTEM,
      messages: st.messages.concat([{
        role: 'user',
        content: [{ type: 'text', text: '动作次数已到上限，**不要再调用任何工具**。请直接用你手上已有的合盘与资料，输出最终的「综合判词」。' }],
      }]),
      signal,
    })
    if (String(closer.text ?? '').trim() !== '') {
      st.steps.push({ kind: 'done', text: closer.text })
      return { state: 'done', judgment: closer.text, record: st.lastRecord ?? null, steps: st.steps }
    }
  } catch (err) {
    logLine(deps.ctx, 'warn', `[dsh-divination-108] 收束失败：${err?.message ?? String(err)}`)
  }
  return {
    state: 'done',
    judgment: '（动作次数已达上限，且最后一次收束也没成功；可再点一次「起卦」）',
    record: st.lastRecord ?? null,
    steps: st.steps,
  }
}

/**
 * 应用入口。
 * @param {any} ctx cordis 上下文。
 * @param {any} config 插件配置。
 */
export function apply(ctx, config) {
  const uiOnly = config.uiOnly === true

  // 挂起上限可覆盖（测试用小值；用户想调也能调）。次数限制**不在这里**，也不存在。
  if (config.hangGuardMs && typeof config.hangGuardMs === 'object') {
    for (const k of ['web', 'tool', 'idle']) {
      const v = config.hangGuardMs[k]
      if (Number.isFinite(v) && v > 0) HANG_GUARD_MS[k] = v
    }
  }

  /**
   * 注册用的上下文：uiOnly 那一行（宿主级 **面板行**）把 `tools` / `systemPrompt`
   * 换成空实现，于是后面那三段注册代码**原样跑但什么都不注册** —— 工具与系统提示
   * 由预设行提供（那样才只在选中预设的会话里可见）。
   *
   * 为什么不直接 `return`：面板端点必须在**宿主域**注册。预设行虽也能注册，
   * 但 `connection` 在会话域未必注入得到；宿主域必定有。而面板端点全局只能注册一次，
   * 所以由 uiOnly 行独占它（预设行 `uiEnabled: false`）。
   */
  const regCtx = uiOnly
    ? Object.create(ctx, {
      tools: { value: { register() {} } },
      systemPrompt: { value: { section() {} } },
    })
    : ctx

  /**
   * 求占记录环形缓冲。
   *
   * **模块级**（不是 apply 内的局部变量）：本包会被挂**两次** —— 预设行（工具）
   * 与宿主级 UI 行（面板）。两行 import 的是同一个模块 URL，ESM 缓存保证只求值
   * 一次，所以模块级状态天然是两行共享的：面板能看到预设行算出来的记录。
   * 若把它放回 apply 内部，UI 行会拿到一个永远空的 history，面板就永远是空的。
   */
  const history = SHARED.history
  const store = (rec) => {
    SHARED.seq += 1
    rec.id = SHARED.seq
    rec.ts = new Date().toISOString()
    history.push(rec)
    // 取两行配置里较大的上限，避免 UI 行把历史裁得过短。
    const keep = Math.max(1, SHARED.limit, config.historySize ?? 20)
    SHARED.limit = keep
    while (history.length > keep) history.shift()
    return rec
  }

  /** 取最近一条记录。 */
  const latest = () => (history.length > 0 ? history[history.length - 1] : null)

  /**
   * 跑一次完整求占。
   * @param {object} args 参数。
   * @returns {{record:object, text:string}} 记录与文本。
   */
  const runDivine = (args) => {
    const input = toChartInput(args, config)
    const chart = buildChart(input)
    const scope = typeof args.scope === 'string' && args.scope !== '' ? args.scope : config.defaultScope
    const nos = selectNos(scope)
    const results = runMany({ chart, nos })
    const board = aggregate({ results, question: input.question, chart })

    const mode = ['brief', 'normal', 'full', 'table'].includes(args.format) ? args.format : config.defaultFormat
    const detailNos = []
    if (typeof args.detail === 'string' && args.detail.trim() !== '') {
      for (const sel of args.detail.split(',')) {
        for (const e of resolveMethod(sel)) if (!detailNos.includes(e.no)) detailNos.push(e.no)
      }
    }

    const record = store({
      question: input.question,
      when: chart.solar.text,
      pillars: chart.pillars,
      lunar: chart.lunar.text,
      solarNote: chart.solarNote,
      longitudeFrom: chart.longitudeFrom,
      position: chart.position,
      /** 随机性模式自证：随机模式 / seed 复现模式（供记录、简报与面板显示口径）。 */
      mode: chart.meta?.mode ?? 'random',
      modeNote: chart.meta?.modeNote ?? '',
      seed: chart.seedBase,
      topic: board.meta.topic,
      board,
      results: results.map((r) => ({
        no: r.entry.no,
        id: r.entry.id,
        name: r.entry.name,
        cat: r.entry.cat,
        module: r.entry.module,
        fidelity: r.outcome?.fidelity ?? r.entry.fidelity,
        note: r.entry.note,
        error: r.error ?? null,
        outcome: r.outcome,
      })),
    })

    // 工具文本 = 记录头 + **口径自证两行** + format.js 渲染的合盘。
    // 那两行走 index.js 侧（format.js 冻结、不能改），且与判词简报共用同一份文案构造
    // （positionLine/modeLine）——默认档与 brief 档都带上。
    const text = `【求占 #${record.id}】\n${positionLine(record)}\n${modeLine(record)}\n`
      + render({ board, results, mode, detailNos })
    return { record, text }
  }


  /**
   * 面板里那个 agent 循环用的工具执行器：**直接调插件自己的两个工具实现**。
   *
   * `divine`   → 起卦（`runDivine`，与工具调用完全同一条代码路径）
   * `divine_detail` → 下钻/回看（与工具同逻辑）
   *
   * 不走工具注册表：省一层，而且面板与所属会话无关 —— 它在自己的请求里跑。
   *
   * @param {string} name 工具名。
   * @param {object} args 工具参数。
   * @returns {Promise<{text:string, record?:object}>} 工具输出。
   */
  const panelExecTool = async (name, args) => {
    if (name === config.toolName) {
      const { record, text } = runDivine({
        ...args,
        format: ['brief', 'normal', 'full', 'table'].includes(args.format) ? args.format : 'normal',
      })
      return { text, record }
    }
    if (name === `${config.toolName}_list`) {
      return { text: renderList({ category: args.category, fidelity: args.fidelity }) }
    }
    if (name === `${config.toolName}_detail`) {
      const rec = Number.isFinite(args.id) ? history.find((h) => h.id === args.id) : latest()
      if (!rec) return { text: '[合盘] 还没有求占记录，请先调 divine。' }
      const sel = typeof args.method === 'string' ? args.method.trim() : ''
      if (sel === '') {
        const results = rec.results.map((r) => ({ entry: ENTRY_BY_NO[r.no], outcome: r.outcome }))
        return {
          text: `【求占 #${rec.id} 回看】\n` + renderSummary(rec.board) + '\n\n'
            + renderTable(results, { sort: args.sort === 'score' ? 'score' : 'no' }),
        }
      }
      const picked = []
      const unknown = []
      for (const one of sel.split(',')) {
        const hit = resolveMethod(one.trim())
        if (hit.length === 0) unknown.push(one.trim())
        for (const e of hit) if (!picked.some((p) => p.no === e.no)) picked.push(e)
      }
      if (picked.length === 0) return { text: `[合盘] 未找到术法：${sel}。` }
      const lines = []
      for (const e of picked) {
        const r = rec.results.find((x) => x.no === e.no)
        lines.push(renderDetail(e, r?.outcome ?? null))
        if (r?.error) lines.push(`（未起原因：${r.error}）`)
      }
      const head = `【求占 #${rec.id} 下钻】所问「${rec.question}」｜${rec.when} ${rec.pillars.join(' ')}`
      const tail = unknown.length > 0 ? `\n\n未找到：${unknown.join('、')}` : ''
      return { text: `${head}\n\n${lines.join('\n\n')}${tail}` }
    }
    return { text: `不认识的工具「${name}」。` }
  }
  // ─────────────────────────── 工具：divine ───────────────────────────
  regCtx.tools.register(defineTool({
    name: config.toolName,
    description: [
      '108 种术数合盘（程序化，非模型推演）。用户提出任何求占/算命/择日/风水/起卦/解梦/抽签的需求时，**调本工具，不要自己推演**。',
      '一次调用会在本地算完 108 法（易卦/三式/六壬/命理/择时/风水/签卜/杂占/姓名/相术/西方），返回一张合盘：总断、吉平凶票型、五行旺缺、多法共识、应期、分歧项、以及 108 法逐条明细。',
      '**转述纪律（用户明确要求「应多尽多」）**：把返回的 108 行明细**原样全部转述**给用户（含编号/名称/符号/分值/依据），只可整理格式，**不得删条目、不得只挑前几名、不得改写成散文**。分歧项与近似项(⚠)也必须逐条如实转述。要精简是用户说了算：用户主动说「别啰嗦/只要结论」时才改传 format="brief"。',
      '输出档位用 format 控制：normal 含 108 行明细（默认，推荐）、full 展开全部盘、brief 只看断语（最省）、table 只要明细表。要看某一法的完整盘，用 divine_detail。',
      '所问之事写进 question（会用于术法加权与取用神，例如问姻缘会加权月老签与夫妻宫）。',
      '**求占时刻不用问用户**：when 缺省 = 这台机器的当前时间，插件自己取，直接算。只有用户主动给了别的时刻（如「用昨晚 11 点算」）才传 when。',
      '**经纬度按用户当前位置算**：面板会用浏览器定位取当前经度并随请求传入（无需你问用户）；用户手动给了地点（如「杭州」）就传该地经度并注明来源。取不到经度时**不要臆造**，插件会如实标注「未做真太阳时校正」。',
      'birth 出生资料只有命理类需要，缺了就问（这个无法从机器时间推定）；其余可选：gender 性别、numbers 报数（梅花报数卦用）、seed 复现种子。',
      '**随机性口径（重要）**：默认是**真随机** —— 每次调用取一次真实随机源，故**同一问题同一时刻重复求占，结果允许不同，这是正常的**（术法里「心诚」是变量），不要向用户承诺"同问同刻必得同一结果"。',
      '要**复现**某一次结果（复核、留档、测试）：把该次返回的 `seed` 记下，下次传回来即可复现。返回体与合盘里会自证本次是「随机模式」还是「seed 复现模式」。',
      '保真度分三档：full 全算法 / core 核心算法 / approx 近似（缺秘传表或辞书，输出带 ⚠）。插件不伪造签诗原文与秘传条文。',
    ].join('\n'),
    parameters: {
      question: { type: 'string', required: true, description: '所问之事（必填）。写得具体有助于术法加权，例如「这次和张三的合作能不能成」。' },
      when: { type: 'string', description: '求占时刻，格式 `YYYY-MM-DD HH:mm`（本地时间）。**缺省 = 这台机器的当前时间**，不要为此问用户；用户主动给了才传。' },
      longitude: { type: 'number', description: '当地经度（东经为正，如北京 116.4）。给了才做真太阳时校正。' },
      birth: { type: 'string', description: '出生资料，格式 `YYYY-MM-DD HH:mm`。命理类（八字/紫微/称骨/占星）需要；不给则这些法记为「未起」。' },
      gender: { type: 'string', enum: ['男', '女'], description: '性别，命理类用。' },
      numbers: { type: 'array', items: { type: 'number' }, description: '报数（梅花报数卦、测字笔画等用）。' },
      coins: { type: 'array', items: { type: 'number' }, description: '六爻钱面回放：六个 6/7/8/9 的爻值（想复现某一卦时用）。' },
      scope: { type: 'string', description: '起法范围：all（默认 108 法全起）| category:命理 | module:yijing | ids:daliuren,qimen-shi | no:1,2,3' },
      format: { type: 'string', enum: ['brief', 'normal', 'full', 'table'], description: '输出档位。brief 最省 token；normal 默认；full 展开全部盘。' },
      detail: { type: 'string', description: '要一并展开完整盘的法（逗号分隔的名称或编号），如 `奇门遁甲,31`。' },
      seed: { type: 'string', description: '复现种子。传上次返回的 seed 可得到完全相同的结果。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true },
          id: { type: 'number', required: true },
          verdict: { type: 'string', required: true },
          score: { type: 'number', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args) {
      try {
        const { record, text } = runDivine(args)
        return { text, id: record.id, verdict: record.board.overall.verdict, score: record.board.overall.score }
      } catch (err) {
        return {
          text: `[合盘] 求占失败：${err?.message ?? String(err)}`,
          id: 0, verdict: '平', score: 0,
        }
      }
    },
  }))

  // ─────────────────────────── 工具：divine_detail ───────────────────────────
  regCtx.tools.register(defineTool({
    name: `${config.toolName}_detail`,
    description: [
      '展开某几次术法的**完整盘**（不下钻不花 token）。默认取最近一次 divine 的结果。',
      'method 可传中文名（含模糊匹配）、英文 id 或编号，逗号分隔可多选，如 `奇门遁甲·时家,31`。',
      '不传 method 时返回该次求占的合盘摘要 + 108 法紧凑表（用于回看）。',
      'id 传之前 divine 返回的编号可回看历史某次（默认最近一次）。',
    ].join('\n'),
    parameters: {
      method: { type: 'string', description: '要展开的术法：中文名（可模糊）、英文 id 或编号，逗号分隔多选。' },
      id: { type: 'number', description: '求占记录编号（divine 返回的 id）。缺省取最近一次。' },
      sort: { type: 'string', enum: ['no', 'score'], description: '不传 method 时的明细排序：no 按编号 / score 按分值。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args) {
      const rec = Number.isFinite(args.id) ? history.find((h) => h.id === args.id) : latest()
      if (!rec) return { text: '[合盘] 还没有求占记录，请先调 divine。' }

      const sel = typeof args.method === 'string' ? args.method.trim() : ''
      if (sel === '') {
        const results = rec.results.map((r) => ({ entry: ENTRY_BY_NO[r.no], outcome: r.outcome }))
        return {
          text: `【求占 #${rec.id} 回看】\n` + renderSummary(rec.board) + '\n\n'
            + renderTable(results, { sort: args.sort === 'score' ? 'score' : 'no' }),
        }
      }

      const picked = []
      const unknown = []
      for (const one of sel.split(',')) {
        const hit = resolveMethod(one.trim())
        if (hit.length === 0) unknown.push(one.trim())
        for (const e of hit) if (!picked.some((p) => p.no === e.no)) picked.push(e)
      }
      if (picked.length === 0) {
        return { text: `[合盘] 未找到术法：${sel}。用 divine_list 看全部 108 法。` }
      }

      const lines = []
      for (const e of picked) {
        const r = rec.results.find((x) => x.no === e.no)
        lines.push(renderDetail(e, r?.outcome ?? null))
        if (r?.error) lines.push(`（未起原因：${r.error}）`)
      }
      const head = `【求占 #${rec.id} 下钻】所问「${rec.question}」｜${rec.when} ${rec.pillars.join(' ')}`
      const tail = unknown.length > 0 ? `\n\n未找到：${unknown.join('、')}` : ''
      return { text: `${head}\n\n${lines.join('\n\n')}${tail}` }
    },
  }))

  // ─────────────────────────── 工具：divine_list ───────────────────────────
  regCtx.tools.register(defineTool({
    name: `${config.toolName}_list`,
    description: '列出 108 种术数的目录（按分类），标出保真度。用于确认某法是否支持、或向用户说明能算什么。⚠ 表示近似实现。',
    parameters: {
      category: { type: 'string', enum: CATEGORIES, description: '只看某一分类。' },
      fidelity: { type: 'string', enum: ['full', 'core', 'approx'], description: '只看某一保真度。' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string', required: true } } },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args) {
      return { text: renderList({ category: args.category, fidelity: args.fidelity }) }
    },
  }))

  // ─────────────────────────── 斜杠命令（可选注入）───────────────────────────
  // `commands` 是宿主平面服务，预设域未必注入得到 —— 可选注入，拿不到就跳过。
  // uiOnly（面板行）不注册命令：命令属于「在预设会话里用」的那一半。
  if (!uiOnly) ctx.inject(['commands'], (cmdCtx) => {
    cmdCtx.commands.register({
      name: '占',
      description: '108 术数合盘：/占 <所问之事> [生日 YYYY-MM-DD] [经度]',
      input: { hint: '<所问之事>' },
      handler: async (invocation) => {
        const raw = String(invocation?.rawInput ?? '').trim()
        if (raw === '') {
          return { kind: 'error', text: '用法：/占 <所问之事>（可附生日与经度），如 `/占 这次合作能不能成`' }
        }
        // 从命令串里抓出生日与经度
        const birthMatch = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/)
        const lngMatch = raw.match(/(?:经度|lon|lng)[:：=\s]*(\d{1,3}(?:\.\d+)?)/i)
        const question = raw
          .replace(birthMatch?.[0] ?? '\u0000', '')
          .replace(lngMatch?.[0] ?? '\u0000', '')
          .trim()
        try {
          const { record, text } = runDivine({
            question,
            birth: birthMatch?.[0],
            longitude: lngMatch ? Number(lngMatch[1]) : undefined,
            format: 'brief',
          })
          return { kind: 'success', text: `${text}\n\n（要看明细与下钻，叫我展开 #${record.id}）` }
        } catch (err) {
          return { kind: 'error', text: `求占失败：${err?.message ?? String(err)}` }
        }
      },
    })
  })

  // ─────────────────────────── 系统提示 ───────────────────────────
  if (config.promptEnabled) {
    let order = 620
    try { order = ctx.systemPrompt.getSectionOrder('TOOL_BASH') + 1 } catch { /* 数值兜底 */ }
    regCtx.systemPrompt.section({
      name: 'tool:divination-108',
      order,
      text: () => [
        `本部署装有 \`${config.toolName}\` 工具：一次调用即在本地算完 **108 种术数**并返回一张合盘。`,
        `用户提出任何求占类需求（起卦、算卦、算命、看八字、紫微、择日、看风水、抽签、解梦、测字、占星、塔罗……）时，**必须调用 \`${config.toolName}\`**：`,
        '- 不要自己在思维链里推演术数（装卦、起局、发三传、取用神），既慢又易错；插件是程序化计算，结果可复现。',
        `- 合盘已经给出总断、票型、五行旺缺、多法共识、应期与分歧；**照实转述**这些结论，不要另行编造卦象或条文。`,
        `- 需要某一法的完整盘时用 \`${config.toolName}_detail\`（不下钻不花 token）；不确定支持哪些法用 \`${config.toolName}_list\`。`,
        '- 命理类（八字/紫微/称骨/占星）需要用户出生年月日时；缺了就问用户，不要臆造。',
        '- 输出里带 ⚠ 的是近似实现（缺秘传表或辞书），转述时请如实说明，不要当实测结论。',
      ].join('\n'),
    })
  }

  // ─────────────────────────── 客户端面板端点（可选注入）───────────────────────
  // 走 `connection.fetch`（而非 webServer.register）：官方 `/api` 前缀处理器会先做
  // admit()（Host/Origin 栅栏 + 签名 cookie）再分发，鉴权由宿主负责，插件不必自造。
  //
  // **作用域警告**：这条路由是**全局 HTTP 路径**，没有会话维度。本插件预设级装配、
  // 按会话实例化时，第一个会话注册成功、第二个会话再注册同一路径会抛
  // 「重复注册同一路径」。所以这里：
  //   1. 用可选注入（预设域未必有 `connection`）；
  //   2. register 外面套 try/catch，重复注册只记日志、绝不冒泡成插件激活失败；
  //   3. 客户端面板会在拿不到数据时**自动隐藏**（见 lib/client.js），
  //      因此没有这条路由的会话不会看到任何残留 UI。
  ctx.inject(['connection'], (connCtx) => {
    // 预设级装配时默认关掉（见 Config.uiEnabled 的说明）：全局路径与按会话实例化不相容。
    if (config.uiEnabled !== true) return
    connCtx.effect(() => {
      try {
        return connCtx.connection.fetch.register({
      path: '/api/dsh-divination-108/data',
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        const url = new URL(request.url)
        const kind = url.searchParams.get('kind') ?? 'latest'
        const json = (payload, status = 200) => Response.json(payload, { status, headers: { 'cache-control': 'no-store' } })

        try {
          // 清空当前页面 / 重新起卦：面板的「清空」按钮走这里。
          // 清的是**内存里的求占记录**（不是硬盘上的任何东西）。
          // ── 模型选择（胶囊里的「模型 / 思考强度」下拉）──
          // 两级懒加载：先列 provider，选了 provider 再列它的模型（listModels 可能
          // 要访问网络，不能一上来就把所有 provider 的模型都拉一遍）。
          if (kind === 'models') {
            const llm = typeof ctx.get === 'function' ? ctx.get('llm') : undefined
            if (!llm) return json({ ok: false, error: '宿主未提供 llm 服务' }, 503)
            const provider = url.searchParams.get('provider') ?? ''
            try {
              if (provider === '') {
                const providers = (typeof llm.listProviders === 'function' ? llm.listProviders() : []) ?? []
                return json({ ok: true, providers: providers.map((p) => ({ id: p.id, name: p.name ?? p.id })) })
              }
              const models = (await llm.listModels(provider)) ?? []
              return json({ ok: true, provider, models: models.map((m) => ({ id: m.id, name: m.name ?? m.id })) })
            } catch (err) {
              return json({ ok: false, error: err?.message ?? String(err) }, 502)
            }
          }
          // 思考强度：从模型能力里读（不同模型支持的档位不同）。
          if (kind === 'efforts') {
            const llm = typeof ctx.get === 'function' ? ctx.get('llm') : undefined
            if (!llm) return json({ ok: false, error: '宿主未提供 llm 服务' }, 503)
            const provider = url.searchParams.get('provider') ?? ''
            const model = url.searchParams.get('model') ?? ''
            if (provider === '' || model === '') return json({ ok: false, error: '缺 provider/model' }, 400)
            try {
              const info = await llm.resolveModelInfo(provider, model)
              const efforts = info?.reasoning?.efforts ?? []
              return json({
                ok: true,
                efforts: efforts.map((e) => ({ id: e.id, name: e.name ?? e.id, description: e.description ?? '' })),
                defaultEffort: info?.reasoning?.defaultEffort ?? null,
              })
            } catch (err) {
              return json({ ok: false, error: err?.message ?? String(err) }, 502)
            }
          }
          // ── 联网自检：不花模型 token 就能知道「联网到底能不能用」──
          // 面板一勾「联网」就打这个，把可用性与失败原因直接显示出来。
          if (kind === 'webprobe') {
            const web = typeof ctx.get === 'function' ? ctx.get('web') : undefined
            if (!web || typeof web.search !== 'function') {
              return json({ ok: false, error: '宿主未提供 web 服务（ctx.get("web") 为空）' }, 503)
            }
            const q = url.searchParams.get('q') ?? 'deepseek'
            try {
              const res = await web.search({ query: q, maxResults: 3 }, request.signal)
              const n = (res?.sources ?? []).length
              const head = (res?.sources ?? [])[0]
              return json({
                ok: true,
                query: q,
                count: n,
                truncated: res?.truncated === true,
                sample: head ? { title: head.title ?? '', url: head.url ?? '' } : null,
              })
            } catch (err) {
              // WebError 是结构化的（WEB_PROVIDER_UNAVAILABLE / CONFIGURED_MISSING /
              // AMBIGUOUS…），原样回传，用户才知道该去配什么。
              logLine(ctx, 'warn', `[dsh-divination-108] 联网自检失败：${err?.message ?? String(err)}`)
              return json({ ok: false, error: err?.message ?? String(err) }, 502)
            }
          }
          // ── 停止：面板上的「停止」按钮走这里（不是限制，是用户随时能喊停）──
          if (kind === 'agentcancel') {
            const sid = url.searchParams.get('sid') ?? ''
            const st = sid !== '' ? AGENT_SESSIONS.get(sid) : undefined
            if (!st) return json({ ok: false, error: '这一轮已结束' }, 404)
            try { st.abort && st.abort.abort() } catch { /* 已经结束 */ }
            return json({ ok: true, cancelled: true })
          }
          // ── 轮询：拿后台那一轮的**逐步**进度（面板每 ~700ms 打一次）──
          if (kind === 'agentpoll') {
            const sid = url.searchParams.get('sid') ?? ''
            if (sid === '') return json({ ok: false, error: '缺 sid' }, 400)
            agentPrune(Date.now())
            const st = AGENT_SESSIONS.get(sid)
            if (!st) return json({ ok: false, error: '这一轮已结束（或已过期）' }, 404)
            const out = {
              ok: true,
              sid,
              sessionId: sid,
              state: st.done === true ? (st.error !== '' ? 'error' : (st.state ?? 'done')) : 'running',
              steps: st.steps,
              searches: st.searches,
              phase: st.phase ?? '',
              error: st.error ?? '',
              judgment: st.judgment ?? '',
              record: st.record ?? null,
            }
            // 交付完成后再保留一次，让面板取走结果；之后释放。
            // ⚠ **多轮会话（conversation=true）不释放**：它还要接下一轮提问，
            //   释放了下一轮就会「会话不存在」，用户看到的是"追问失联"。
            //   这类会话靠 AGENT_LIMITS.ttlMs / maxSessions 的 agentPrune 回收。
            if (st.done === true && st.conversation !== true) {
              if (st.picked === true) AGENT_SESSIONS.delete(sid)
              else st.picked = true
            }
            return json(out)
          }
          // ── 面板内的「小 agent」：真·工具调用多轮循环 ──
          // ── 面板内的「小 agent」：真·工具调用多轮循环 ──
          // 模型可以在一**次**请求里自己搜好几轮（search / fetch），资料齐了就交付；
          // 只有「网上绝无可能查到」的东西才会 ask_user。全程在本插件内存里跑，**不碰主会话**。
          if (kind === 'agent') {
            const llm = typeof ctx.get === 'function' ? ctx.get('llm') : undefined
            if (!llm) return json({ ok: false, error: '宿主未提供 llm 服务' }, 503)
            const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
            const provider = typeof body.provider === 'string' ? body.provider : ''
            const model = typeof body.model === 'string' ? body.model : ''
            if (provider === '' || model === '') return json({ ok: false, error: '请先选模型' }, 400)
            const allowWeb = body.web === true
            const web = typeof ctx.get === 'function' ? ctx.get('web') : undefined
            const now = Date.now()
            agentPrune(now)

            // 一个请求跑完一整轮：没有续跑、没有一问一答
            const question = typeof body.question === 'string' ? body.question.trim() : ''
            if (question === '') return json({ ok: false, error: '缺少所问之事（question）' }, 400)
            // 面板按用户当前位置取到的经度：**必须让模型在调用 divine 时原样带上**（它不会自己知道）。
            // 取不到时明确要求「不要用别的值顶替」——避免模型为了"填满参数"而臆造一个经度。
            const geoFrom = typeof body.longitudeFrom === 'string' ? body.longitudeFrom.trim().slice(0, 120) : ''
            const geoHint = Number.isFinite(body.longitude)
              ? `\n\n【起卦资料 · 面板已就位，调用 divine 时必须原样使用】longitude: ${body.longitude}（来源：${geoFrom !== '' ? geoFrom : '未说明'}）`
                + `\n→ 调用 divine 时带上 longitude: ${body.longitude} 与 longitudeFrom: ${JSON.stringify(geoFrom !== '' ? geoFrom : '未说明来源')}；不要改动这个值。`
              : (geoFrom !== ''
                ? `\n\n【起卦资料 · 无经度】${geoFrom}\n→ 本次**没有**经度：调用 divine 时**不要**填 longitude，也不要用手机号/城市名等猜一个顶替；结果里会如实标「未做真太阳时校正」。`
                : '')

            // ── 多轮续接（task-23）：带 sessionId 就接进**同一个会话**，否则新建 ──
            // 面板第一轮不带 sessionId（新建），后续轮带上一轮返回的那个。
            // ⚠ 过期/不存在/上一轮未结束，都**如实回报**，绝不静默新建 ——
            //   静默新建会让两个不同会话并到一起（用户会发现"它忘了我说过的话"却查不出原因）。
            const wantSid = typeof body.sessionId === 'string' && body.sessionId.trim() !== ''
              ? body.sessionId.trim()
              : (typeof body.sid === 'string' ? body.sid.trim() : '')
            const userText = question + geoHint
            let useSid = ''
            let st
            if (wantSid !== '') {
              st = AGENT_SESSIONS.get(wantSid)
              if (!st) {
                return json({ ok: false, code: 'stale-session', error: '会话不存在或已过期（服务重启，或超过 6 小时未说话）。请开始新对话。' }, 409)
              }
              if (st.done !== true) {
                return json({ ok: false, code: 'busy-session', error: '上一轮还没说完，等它出结果再发下一条。' }, 409)
              }
              useSid = wantSid
              st.messages.push({ role: 'user', content: [{ type: 'text', text: userText }] })
              st.at = Date.now()
              // 每轮重置的是「这一轮的进度与结果」，**不是**会话历史（会话继续存活）
              st.steps = []
              st.error = ''
              st.phase = ''
              st.judgment = ''
              st.picked = false
              st.turn = (Number.isFinite(st.turn) ? st.turn : 1) + 1
            } else {
              st = {
                question,
                messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
                steps: [],
                searches: 0,
                at: now,
                turn: 1,
                picked: false,
                // conversation=true（新面板）→ 会话跨轮保留；缺省（旧行为）→ 结果取走后释放。
                conversation: body.conversation === true,
              }
              useSid = `ag-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
              AGENT_SESSIONS.set(useSid, st)
            }

            try {
              // ⭐ **不 await**：把整轮放到后台跑，立刻把 sid 还给面板，
              //    面板再轮询 `kind=agentpoll` 拿到**逐步**的执行过程。
              //    否则面板要等到整轮跑完才显示「执行过程」，中间一直是「0 步」。
              st.state = 'running'
              st.done = false
              st.error = ''
              const controller = new AbortController()
              st.abort = controller
              agentToolLoop(
                {
                  llm,
                  web,
                  allowWeb,
                  provider,
                  model,
                  effort: typeof body.effort === 'string' && body.effort !== '' ? body.effort : undefined,
                  signal: controller.signal,
                  ctx,
                  execTool: panelExecTool,
                },
                st,
              ).then((out) => {
                st.state = out.state ?? 'done'
                st.judgment = out.judgment ?? ''
                st.record = out.record ?? null
                st.done = true
              }).catch((err) => {
                const raw = err?.message ?? String(err)
                logLine(ctx, 'warn', `[dsh-divination-108] agent 失败：${raw}`)
                st.phase = ''
                st.error = /abort/i.test(raw) ? '求占被中断（可重试）' : raw
                st.done = true
                st.state = 'error'
              })
              return json({
                ok: true,
                sid: useSid,
                sessionId: useSid,
                turn: st.turn ?? 1,
                state: 'running',
                steps: st.steps,
                phase: st.phase ?? '',
              })
            } catch (err) {
              // 多轮会话不要因为一次起轮失败就整个丢掉历史（那是用户说过的所有话）
              if (st.conversation !== true) AGENT_SESSIONS.delete(useSid)
              const raw = err?.message ?? String(err)
              const aborted = request.signal?.aborted === true || /abort/i.test(raw)
              logLine(ctx, 'warn', `[dsh-divination-108] agent 失败：${raw}`)
              return json({
                ok: false,
                sid: useSid,
                sessionId: useSid,
                error: aborted ? '求占被中断（可重试）' : raw,
                steps: st.steps,
              }, 502)
            }
          }

          // ── 起卦前置：让模型把「起卦资料」先填好（**面板内**完成，不碰主会话）──
          // 顺序：plan（模型提取资料）→ run（按资料起卦）→ interpret（模型写判词）。
          // 起卦前把资料就位，事后再补是没用的（命理类会记「未起」）。
          if (kind === 'plan') {
            const llm = typeof ctx.get === 'function' ? ctx.get('llm') : undefined
            if (!llm) return json({ ok: false, error: '宿主未提供 llm 服务' }, 503)
            const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
            const question = typeof body.question === 'string' ? body.question.trim() : ''
            if (question === '') return json({ ok: false, error: '缺少所问之事（question）' }, 400)
            const provider = typeof body.provider === 'string' ? body.provider : ''
            const model = typeof body.model === 'string' ? body.model : ''
            if (provider === '' || model === '') return json({ ok: false, error: '请先选模型' }, 400)
            try {
              const web = body.web === true && typeof ctx.get === 'function' ? ctx.get('web') : undefined
              const sources = body.web === true
                ? await searchContext(web, question, request.signal)
                : { sources: [], note: '' }
              const parts = [`所问：${question}`]
              const srcText = renderSources(sources.sources, sources.note)
              if (srcText !== '') parts.push('', srcText)
              const text = await collectLlm(llm, {
                provider,
                model,
                reasoningEffort: typeof body.effort === 'string' && body.effort !== '' ? body.effort : undefined,
                system: PLAN_SYSTEM,
                userText: parts.join('\n'),
                signal: request.signal,
              })
              const plan = parsePlan(text)
              // 机器当前时间：客户端/服务端都不传 when 时由 core/calendar.js 取。
              const now = new Date()
              const pad = (n) => String(n).padStart(2, '0')
              const machineTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
                + ` ${pad(now.getHours())}:${pad(now.getMinutes())}`
              return json({
                ok: true,
                materials: plan.materials,
                missing: plan.missing,
                subject: plan.subject,
                note: plan.note,
                // 联网读到的关键事实：会被客户端存进求占记录，作为判词依据。
                context: plan.context,
                // 每一条资料的**来源说明**（从外部资料还是用户口中来的），面板会摊开给用户核对。
                attribution: plan.attribution,
                machineTime,
                sources: sources.sources,
                webNote: sources.note,
                webUsed: body.web === true,
              })
            } catch (err) {
              const raw = err?.message ?? String(err)
              const aborted = request.signal?.aborted === true || /abort/i.test(raw)
              logLine(ctx, 'warn', `[dsh-divination-108] 起卦资料整理失败：${raw}`)
              return json({ ok: false, error: aborted ? '整理起卦资料被中断' : raw }, 502)
            }
          }
          // ── AI 总断：把合盘交给模型，读成「一句话收束」（可选联网查资料）──
          if (kind === 'interpret') {
            const llm = typeof ctx.get === 'function' ? ctx.get('llm') : undefined
            if (!llm) return json({ ok: false, error: '宿主未提供 llm 服务' }, 503)
            const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
            const rec = Number.isFinite(Number(body.id)) && Number(body.id) > 0
              ? history.find((h) => h.id === Number(body.id))
              : latest()
            if (!rec) return json({ ok: false, error: '还没有求占记录' }, 404)
            const provider = String(body.provider ?? '')
            const model = String(body.model ?? '')
            if (provider === '' || model === '') return json({ ok: false, error: '请先选模型（provider/model）' }, 400)
            try {
              const useWeb = body.web === true
              const web = useWeb && typeof ctx.get === 'function' ? ctx.get('web') : undefined
              const sources = useWeb ? await searchContext(web, rec.question, request.signal) : { sources: [], note: '' }
              const parts = [buildBoardBrief(rec)]
              const srcText = renderSources(sources.sources, sources.note)
              if (srcText !== '') parts.push('', srcText)
              const text = await collectLlm(llm, {
                provider,
                model,
                reasoningEffort: typeof body.effort === 'string' && body.effort !== '' ? body.effort : undefined,
                system: INTERPRET_SYSTEM,
                userText: parts.join('\n'),
                signal: request.signal,
                // ⚠ 刻意不传 maxTokens —— 交给模型自己的默认上限（见 collectLlm 的说明）。
              })
              return json({ ok: true, text, sources: sources.sources, webNote: sources.note })
            } catch (err) {
              // 中断类错误原样抛给用户是 "signal is aborted without reason" —— 毫无信息量。
              // 换成人能看懂的话，并说明「合盘没丢，重试即可」（判决不写回记录，无副作用）。
              const raw = err?.message ?? String(err)
              const aborted = request.signal?.aborted === true || /abort/i.test(raw)
              logLine(ctx, 'warn', `[dsh-divination-108] 判词失败：${raw}`)
              return json({
                ok: false,
                error: aborted
                  ? '模型调用被中断（多为请求超时或页面断开）。合盘结果照旧在，重试一次即可。'
                  : raw,
              }, 502)
            }
          }
          if (kind === 'clear') {
            SHARED.history.length = 0
            SHARED.seq = 0
            return json({ ok: true, cleared: true })
          }
          if (kind === 'catalog') {
            return json({
              ok: true,
              categories: CATEGORIES,
              fidelityLabel: FIDELITY_LABEL,
              entries: ENTRIES.map((e) => ({
                no: e.no, id: e.id, name: e.name, cat: e.cat, fidelity: e.fidelity, note: e.note,
              })),
            })
          }
          if (kind === 'history') {
            return json({
              ok: true,
              records: history.slice().reverse().map((h) => ({
                id: h.id, ts: h.ts, question: h.question, when: h.when,
                verdict: h.board.overall.verdict, score: h.board.overall.score, topic: h.topic,
              })),
            })
          }
          if (kind === 'record') {
            const id = Number(url.searchParams.get('id') ?? 0)
            const rec = Number.isFinite(id) && id > 0 ? history.find((h) => h.id === id) : latest()
            if (!rec) return json({ ok: false, error: 'no record' }, 404)
            return json({ ok: true, record: rec })
          }
          if (kind === 'run') {
            const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
            const { record } = runDivine({ ...body, format: 'brief' })
            // 把「起卦时整理的背景」（联网读到的关键事实 / 面板上确认的资料说明）挂在记录上，
            // 这样它会被**存下来**，判词那一步就能用 —— 不挂在记录上的话，联网资料到这里就丢了。
            if (typeof body.notes === 'string' && body.notes.trim() !== '') {
              record.notes = body.notes.trim().slice(0, 1500)
            }
            return json({ ok: true, record })
          }
          // latest：紧凑版（不含 108 法 detail，面板列表用）
          const rec = latest()
          if (!rec) return json({ ok: true, record: null, status: statusSnapshot() })
          return json({
            ok: true,
            status: statusSnapshot(),
            record: {
              id: rec.id, ts: rec.ts, question: rec.question, when: rec.when,
              pillars: rec.pillars, lunar: rec.lunar, topic: rec.topic, seed: rec.seed,
              board: rec.board,
              rows: rec.results.map((r) => ({
                no: r.no, id: r.id, name: r.name, cat: r.cat, fidelity: r.fidelity,
                verdict: r.outcome?.verdict ?? null,
                score: r.outcome?.score ?? null,
                essence: r.outcome?.essence ?? null,
                keys: r.outcome?.keys ?? [],
                timing: r.outcome?.timing ?? null,
                error: r.error,
              })),
            },
          })
        } catch (err) {
          return json({ ok: false, error: err?.message ?? String(err) }, 500)
        }
      },
        })
      } catch (err) {
        // 重复注册（第二个会话）或宿主不提供该端点：不是致命错误，记一行就好。
        logLine(ctx, 'info', `[dsh-divination-108] 面板端点未注册：${err?.message ?? String(err)}`)
        return () => {}
      }
    }, 'divination-108: data route')
  })

  /** 面板状态。 */
  function statusSnapshot() {
    const problems = validateEngines()
    return {
      entries: ENTRIES.length,
      categories: CATEGORIES.length,
      records: history.length,
      engineProblems: problems.length,
      toolName: config.toolName,
      defaultFormat: config.defaultFormat,
    }
  }

  // 启动自检：引擎缺失只记日志，不让插件加载失败（缺的法会记为「未起」）。
  const problems = validateEngines()
  if (problems.length > 0) {
    logLine(ctx, 'warn', `[dsh-divination-108] ${problems.length} 个引擎未实现：${problems.slice(0, 5).join('; ')}${problems.length > 5 ? ' …' : ''}`)
  }
  logLine(ctx, 'info', `[dsh-divination-108] 已加载：${ENTRIES.length} 法 / ${CATEGORIES.length} 类，引擎缺失 ${problems.length}，工具名 ${config.toolName}`)
}

export { ENTRIES, CATEGORIES }
