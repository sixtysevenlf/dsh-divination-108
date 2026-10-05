# 代码向 SKILL.md 对齐 · 施工与验证记录（task-19）

> Owner：**kernel-tables** ｜ 规格本体：`skills/108-divination/SKILL.md` ｜ 施工图：`docs/verification/skill-rewrite.md` 的 delta 清单
> 方向：**skill 是规格，代码跟着改**（不是"手册描述现状"）。
> 验收：`smoke` **83/83** ｜ `host` **172/172** ｜ `client` **62/62** ｜ `validate-preset` **46/46** ｜ `v2-audit` **硬失败 0** ｜ `v2-calendar-check` **7/7**
> 改动文件：`src/core/aggregate.js`（主要）、`src/core/tables.js`、`src/methods/zhanbu.js`、`src/methods/zeri.js`、`src/index.js`（简报）
> **未改**：`src/core/format.js`、`lib/client.js`、`cordis.patch.yml`、`test/**` 的既有断言（一条都没改）

---

## 1. 逐条对照表

| # | skill 条款 | 改前 | 改后 | 验证方式 |
|---|---|---|---|---|
| **D-06** | §五 主辅法**可稳定命中**（法号白名单） | `boost` 键当 `name|id|cat|note` **子串**匹配 → 健康 **0 法**加权、财运仅 1 法且命中 `#103 面相十二宫`（`财帛` 撞名）、考试命中 `#77 父母三般卦`、寻物命中 `#80 四灵·玄武` | `TOPIC_RULES` 新增 **`main`（主法 ×1.8）/ `aux`（辅法 ×1.3）法号白名单**，内容逐条取 SKILL §五「实操主辅法」列；`relevanceOf` 先判法号、再回落旧子串；`detectTopic` 返回 `main/aux/note`，`meta.topicMain/topicAux` 给 `{no,name}` | 用 `relevanceOf` 直接量：健康 **0→17 法**、财运 **1→6**、考试 **1→4**（Lead 独立复算一致）；四套基线全绿 |
| **D-01** | §六 分歧分级 **D1–D5** + `reason`；`advice` 按级分档 | `conflicts[]` 只有 `cat/high/low/gap`；`divergence` 只有数值量；`advice` 把任何低置信都写成"诸法分歧明显/严重分歧" | 新增 `gradeOfPair()` / `gradeOfGatePair()`（只读已披露字段：fidelity→**D4**、用神取象差异→**D3**、应期单位差异→**D2**、module/口径差异→**D1**、其余→**D5**）；`conflicts[].grade/reason`；`divergence.items[]`（每条带 `code/grade/reason/detail`）+ `divergence.grade`（最重级）+ `grades`；`advice` 首句与冲突句**按级分档**（D1 口径并列不裁决／D2 折算尺度／D3 说明取用／D4 资料不足**不是意见不同**／D5 才称真分歧） | 实测：`conflicts[0]` 带 `grade:'D5'`；门间差 51 分 → `gateGap:D4`（签卜近似占 88%）；`advice` 出现「**体系资料差异**」而非"体系分歧" |
| **D-02** | §六 证据分层 **L1–L5** | 四类字段齐但**无层号** | **过渡版（聚合层推断）**：`evidenceDigest.levels = {L1..L5}` + `meta.evidenceLevels`。L1 历法/星历事实（整盘 1）、L2 各法规则分、L3 有 `detail.evidence` 的法数、L4 有 `detail.cite` 的法数、L5 恒 0（模型层） | 实测本盘 `L1 1 ｜ L2 107 ｜ L3 107 ｜ L4 107 ｜ L5 0`；简报新增「证据账本…｜分层」一行 |
| **D-03** | §六/§八 应期**半开区间** `[lo,hi)` | 聚合层已按 median 汇总，但**只有 `yijing.js` 给端点**；其余族只给措辞串 | ① `tables.js` 新增 `DURATION_DAYS` + `durationOf()`（**公开折算口径**：固定措辞表 → 数值措辞 `6日→[6,7)`／`2月→[60,90)` → 多措辞取**最宽**并集；无明确日数→**双 null**）；② **本族两族**（`zhanbu` 10 引擎、`zeri` 14 引擎）出口统一补 `detail.timingLo/timingHi`；③ 聚合层对**未给端点**的法按同一口径折算，并在 `timing[i].basis` 标明来源（`方法层` / `按措辞折算（过渡版）` / `none`）；④ `timing[i].halfOpen = true` | 实测 `6日→[6,7)`、`三日内有信→[0,3)`、`次月（水旺之月）应→[30,60)`、`需待木月方有转机→无端点`；简报逐条带区间 |
| **D-08** | §六 `end` 的"不含"语义声明 | 字段已有、**无任何地方声明** | 新增 `board.timingScope = { code:'conditional_timing_candidates_not_guaranteed_dates', text:'…半开区间 [lo, hi)（单位：日，hi 不含）…', halfOpen:true }`；简报加「应期区间语义」一行 | 简报可见；`smoke` 未受影响 |
| **D-04** | §六/§十 保真度**逐项布尔位** | 仅整法三档 + `detail.未核实` | **过渡版（聚合层推断）**：`meta.fidelityBitsSummary = { 历法/星历/表/辞书/图像: 法数, basis, total }`。推断规则写在 `fidelityBitsOf()` 注释里（历法恒真；星历看是否引黄经/宿度；表＝有 cite 且未标未核实；辞书＝非 approx 且无未核实；图像＝#103/#104 为 false） | 实测本盘 `历法 107 ｜ 星历 7 ｜ 表 62 ｜ 辞书 62 ｜ 图像 105`；**权威位仍应在 `registry.js`（Lead 独占）**，已在 `basis` 与本文档声明 |
| **D-05 / D-11** | §〇/§八 claims **运行时**校验；模型不得改写 | 无运行时校验 | **未实施**（见 §4 未实施项 1）：插件侧无法读模型文本；`board` 侧的机械不变量已由既有测试覆盖 | — |
| **D-07** | §二 `birthTz`/`whenTz` 参数 | `calendar.js` 已改固定偏移，但工具无时区参数 | **未实施**（见 §4 未实施项 2）：需改 `calendar.js`/`shared.js`（kernel-astro 名下）＋工具 schema（`index.js` 现属 task-20 施工面） | — |
| **D-09** | §九 转述纪律 3 条精确化 | 部署 system prompt 写"108 行原样转述" | **未实施**（部署层，不在本仓库；需用户裁决） | — |
| **D-10** | §七 未报取象完整性 | ✅ 已实现；`#95` 部分报曾标"未报外应" | task-15 已修：三法分档（皆未报→冻结前缀；部分报→`报X未报Y·取象：`）＋`#97` 认用户文述声数 ＋ `#96` 词法相邻匹配（跳槽/心跳不再误判） | `v2-crosscheck`「未报输入必须标取象」**1100/1100 ✅** |
| **①Lead 追加** | `confidence` 含票数分量（与 spec「多数不构成独立证据」相悖） | `consistency = 0.5×逐法同号率 + 0.5×逐法离散度` → **逐法同号率就是票数分量** | **改为以「门」为独立证据源**：`consistency = 0.5×门间同号率 + 0.5×门间离散度`；逐法同号率/离散度降为**诊断量**，只报不参与；`overall.confidence` **字段名与值域不变**（仍 = consistency × coverage × trust，0..1） | `meta.agreement` 拆开报：`independentSources/gateAgreement/gateDispersion/gateCohesion` + `pooledSignAgreement/pooledDispersion/voteShare`（标注「诊断量，不参与置信」）；`divergence` 同时给 `gateAgreement`（新，喂 consistency）与 `signAgreement`（旧，诊断） |
| **②Lead 追加** | `divergence.familySkew` 未进简报 | `buildBoardBrief` 无该字段（见下"顺带修的 bug"） | 简报新增：**体系偏斜**（逐法口径 − 分门口径 + 门间差）、**分歧分级**（items 的 code=grade + 总级 + D1–D5 口径说明）、**置信拆解**（含"诊断量不参与置信"）、**合参矩阵**、**证据账本+分层**、**保真位**、**主辅法**、**未起点名**、**应期区间语义** | `host` 172/172（简报断言「含应期与 108 法明细」仍过）；简报 1384 字（阈值 3500）；LLM 简报 6207 字 |

### 顺带修掉的两个真 bug（在允许改的范围内）

1. **「分类加权」一行从来没渲染过**：`buildBoardBrief` 读的是 `b.categories`，而 `aggregate` 只产出 `byCategory` → 该行恒不输出（skill §六 与 INTERPRET_SYSTEM 条款 9 都依赖它）。修法：`aggregate` **新增扁平 `categories`** 字段（从 `byCategory[cat].score` 派生），简报侧同时兼容 `byCategory`。实测简报现在有「分类加权：易卦+8 三式+4 六壬-17 …」。
2. **明细行把浮点尾数喂给模型**：`001 大衍筮法 平 +4.750000000000002` → 简报侧统一取一位小数（`+4.8`）。另把简报里的 Markdown 标记（`**`/反引号）去掉——它是纯文本提示词。

---

## 2. 新增的跨族能力（供判词骨架引用）

| 字段 | 位置 | 用途 |
|---|---|---|
| `board.corroboration[]` | `{key,status:'满足'/'不满足'/'资料不足',count,cats,fams,approxShare,note}` | **合参矩阵**：共识是否够格当"印证"（跨门 ≥2 且 ≥3 法＝满足；相关法门有未起或近似过半＝**资料不足**）。首项为 `总断` |
| `board.timingScope` | `{code,text,halfOpen}` | 半开区间语义声明（D-08） |
| `board.timing[i].{lo,hi,basis,halfOpen,provided,derived}` | 应期条目 | `basis` 明示端点是方法层给的还是折算的 |
| `board.meta.agreement.*` | 置信拆解 | 含 `independentSources` 与"诊断量"分组 |
| `board.meta.evidenceLevels` / `evidenceDigest.levels` | L1–L5 | 证据分层 |
| `board.meta.fidelityBitsSummary` | 五个布尔位 | 保真度逐项披露（过渡版） |
| `board.meta.topicMain/topicAux/topicNote` | 主辅法分工 | 与 SKILL §五 同源 |
| `board.divergence.{grade,grades,items}` | D 级 | 分歧原因分类 |

> `format.js` 未改：以上全部是**新增键**，`renderSummary`/`renderTable` 不感知（契约 §3.3 "只许追加"）。

---

## 3. 关键词覆盖补强清单（Lead 指定的单列一节）

**问题**：口语说法漏词会**静默降级为「综合」**（`meta.topic === '综合'` → 全部法门等权，用户看不出加权没生效）。
Lead 报的实例：`「东西丢哪了」` 一个关键词都没命中（旧表只有 `丢了`，而口语是 `丢哪了`）。

| 事类 | 补入的口语关键词 | 依据 |
|---|---|---|
| 寻物 | `丢哪`、`哪去了`、`哪去`、`丢了没`、`不见了`、`找不着`、`找不到`、`落哪`、`忘哪`、`捡到`、`掉了`、`落在` | Lead 清单 + 同类口语 |
| 健康 | `能好吗`、`好得了吗`、`严重吗`、`严不严重`、`要不要做手术`、`住院`、`失眠`、`焦虑`、`抑郁` | Lead 清单 |
| 考试 | `能不能过`、`能考上`、`考得上`、`过得了吗`、`笔试`、`复试` | Lead 清单 |
| 财运 | `值不值`、`回本`、`亏不亏`、`划算`、`赚不赚`、`本金`、`分红`、`还款`、`报价` | Lead 清单 |
| 事业 | `这份工作`、`要不要辞职`、`该不该辞职`、`离职`、`offer`、`入职`、`转行`、`考核`、`绩效`、`开业`、`开张`、`开店`、`挂牌` | Lead 清单（`开业` 是回归测试里发现的漏词） |
| 姻缘 | `缘分`、`在一起`、`表白`、`暧昧`、`喜欢他`、`喜欢她`、`异地恋`、`冷战` | Lead 清单中**可安全收的**部分 |
| 出行 | `签证`、`机票`、`出差`、`自驾`、`高铁`、`顺不顺利` | 同类口语 |
| 家宅 | `这房子`、`新居`、`门面`、`店铺`、`商铺` | Lead 清单 |
| 诉讼 | `能不能赢`、`判`、`起诉`、`赔偿`、`合同纠纷` | 同类口语 |
| 天时 | `晴`、`阴天`、`降温`、`汛期` | 同类口语 |
| 国事 | `大战`、`局势`、`行情` | 同类口语 |
| 孕产 | `怀上`、`有了吗`、`男女` | 同类口语 |

**刻意不收的歧义词**（宁可落到「综合」也不误判事类）：
`我跟他`／`我和他`（合作、相亲、官司都会这么说）、`能成吗`（合作/考试/姻缘通用）、`要不要去`／`该不该去`（就医、旅行、入职都可能）。

**次序即平手裁决序**：`TOPIC_RULES` 重排为「姻缘 → 寻物 → 健康 → 考试 → 财运 → 出行 → 孕产 → 家宅 → 诉讼 → 天时 → 国事 → 事业」，
命中数相同时取先出现者——把**更具体/更易被误抢**的类放前面（例：`要不要去医院` 由 健康`医院` 与 事业`要不要辞职` 类词平手时，健康在前→判健康）。

**回归判据**（33 例，含 Lead 清单与易混淆对照）：`不符 0 / 33`
```powershell
node -e "import('./src/core/aggregate.js').then(m=>{for(const q of ['东西丢哪了','这份工作怎么样','这笔投资值不值','这个病能好吗','考试能不能过','这房子怎么样','我跟他合作能不能成','要不要去医院','要不要去旅行','下个月初八开业好不好'])console.log(q,'→',m.detectTopic(q).topic)})"
# 期望：寻物/事业/财运/健康/考试/家宅/事业/健康/出行/事业
```

---

## 4. 未实施项及原因（逐条）

| 项 | 状态 | 原因 |
|---|---|---|
| **D-05 / D-11** claims 运行时校验（三违规码） | 未实施 | 插件**读不到模型文本**——判词由模型在会话里写，插件侧只在 `execute` 时产出合盘。delta 自己给的两条路（宿主层校验／新增 `divine_audit` 工具）都属**契约级决策**：前者不在本仓库，后者要给三个工具加第四个、动 `index.js` 的 schema 与 `host.mjs` 断言，须 **Lead + 用户**先定责任方。本次不动，等裁决 |
| **D-07** `birthTz`/`whenTz` 参数 | 未实施 | 需同时改 `src/core/calendar.js`、`src/shared.js`（**kernel-astro 名下**）与工具 schema（`index.js` 现属 **task-20** 施工面）。跨 owner 的接口改动不宜由我在 task-19 里单方面落 |
| **D-02 方法层显式层号** | 部分 | 聚合层已给 L1–L5 统计；**方法层逐条标 `evidence.level`** 需改 8 个族（含他人文件）与 `kit.evidence()`（`kit.js` 属 Lead）。过渡版已让层号**可机械读出**（按 evidence/cite 是否存在判定） |
| **D-03 其余 5 族的 `detail.timingLo/timingHi`** | 部分 | 本族两族（`zhanbu`/`zeri`）已给端点；其余 5 族（`yijing` 已有）未逐法改——聚合层改按**同一公开口径折算**并在 `timing[i].basis` 标明"折算"，效果对用户一致。逐法标注留给各族 owner 按其体系定义窗口，避免我代填出编造端点 |
| **D-04 权威 `fidelityBits`** | 部分 | 权威位应登记在 `registry.js`（**Lead 独占**，108 条各加 `bits`）＋ `kit.makeOutcome` 透传。本次给的是聚合层推断的过渡版，并在 `basis` 里写明 |
| **D-09 转述纪律精确化** | 未实施 | 属**部署层 system prompt**（不在本仓库），手册已写明保留原要求，等用户裁决 |

---

## 5. 变更文件与自测命令

| 文件 | 改了什么 |
|---|---|
| `src/core/aggregate.js` | D-06 白名单＋关键词补强；D-01 分级；D-02/D-04 过渡统计；D-03 端点折算；D-08 timingScope；**置信改门口径**；`categories` 扁平字段；`corroboration`；主辅法元数据；`advice` 按级分档 |
| `src/core/tables.js` | 新增 `DURATION_DAYS` + `durationOf()`（应期措辞→半开区间；跨族共用，带出处与口径注释） |
| `src/methods/zhanbu.js` | 出口补 `detail.timingLo/timingHi`（10 引擎） |
| `src/methods/zeri.js` | 出口补应期端点（14 引擎，与既有 `scrub` 兜底同一包装） |
| `src/index.js` | `buildBoardBrief` 新增 8 行（主辅法/合参矩阵/应期区间/体系偏斜/分歧分级/置信拆解/证据账本+分层/保真位/未起点名）＋修 `b.categories` 死字段＋明细分值取一位小数＋去 Markdown 标记 |
| `docs/verification/skill-alignment.md` | 本文件 |

```powershell
cd D:\DSH\plugins\dsh-divination-108
node test/validate-preset.mjs   # 46/46
node test/smoke.mjs             # 83/83
node test/host.mjs              # 172/172
node test/client.mjs            # 62/62
node test/v2-audit.mjs          # 硬失败 0
node test/v2-calendar-check.mjs # 7/7
```

> **范围声明**：`src/index.js` 的改动只限于 `buildBoardBrief`（task-19 明确授权"schema/简报"）。改动在 Lead 通告"`index.js` 属 task-20 施工面"**之前**完成并已通过 host 172/172；此后**未再触碰** `index.js`。`format.js`／`lib/client.js`／`cordis.patch.yml` 全程未动。
