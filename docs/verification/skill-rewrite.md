# SKILL.md 重写记录（task-17）

> owner：**m-yijing** ｜ 交付：`skills/108-divination/SKILL.md`（140 行 → **356 行**）＋本文件
> **方向**：新 skill 是**规格（spec）**，底层算法与工程契约**向它对齐**；不是"手册去描述现状"。
> 凡代码尚未满足的条款，在 skill 里以 **【待实现】**（19 处）/ **【部分实现】**（4 处）显式标注，
> 并**逐条登记在下文 delta 清单**里——那张表是后续施工图的依据。
> 只写文档：未改动 `src/**`、`lib/**`、`test/**`；未执行 git 命令。

---

## 一、改了哪些（章节结构）

| 章节 | 变化 |
|---|---|
| **〇 行为红线** | 🆕 四条：不得自行推演／**不得改写确定性结果**／不得编造与补全／不作决断性建议 |
| 一 核心事实 | 保留；措辞精确化为「同问**同刻**」（不是"同输入同结果"） |
| 二 三个工具 | 参数表与冻结的 `src/index.js` **逐字对齐**（含 `coins`/`detail`/`seed`/`scope` 取值式）；🆕 新增待实现参数 `whenTz` / `birthTz` |
| 三 108 法分类 | 保留；🆕 补上每类的**编号区间** |
| 四 问法 → 参数映射 | 🆕 增「铜钱摇卦 → `coins`」「只要命理 → `scope`」两行；明确**哪些信息必须写进 `question`**（坐向/姓名/梦象/所测之字/外应） |
| **五 ★ 主辅法操作表** | 🆕 **全新一节**（task 指定的最实用一节）：12 事类 × 实际加权榜 + 实操主辅法 + 实况披露 |
| 六 合盘怎么读 | 扩为 18 个字段的对照表（含 `byCategory.agreement/spread`、`divergence` 全字段、`meta.agreement`）；🆕 **证据分层 L1–L5**、**票数不构成独立证据**、**禁止合成虚构分数** |
| 七 保真度与未报取象 | 保留三档；🆕 补「未报取象」四类触发表的完整对照；补 `detail.未核实` 的解读口径 |
| **八 确定性事实 vs 可解读** | 🆕 **分层权限表**（哪些模型不得改写、哪些可整理、哪些是模型主场） |
| 九 常见错误 | 保留 10 条；**修掉原文第 2 条与第 14 行的自相矛盾**（见下） |
| **十 规格要求、代码待跟进** | 🔄 由"未实现清单"改为"**规格条款 × 代码现状 × 状态**"表 |
| **十一 与部署 system prompt 的关系** | 🆕 转述纪律保留 + 3 条精确化建议（供用户裁决） |

### 修掉的一处**自相矛盾**（原文硬伤）

| 位置 | 原文 | 问题 |
|---|---|---|
| L14–16 | 「**默认必须把这 108 行原样转述给用户**」 | ✅ 与部署 system prompt 一致 |
| L134 | 「❌ 把 108 行明细全复述给用户 —— 挑 3-5 法讲」 | ❌ **与上一处直接冲突**，且与 system prompt 冲突 |

重写后统一为：**默认全量转述**；只有用户明说"别啰嗦/只要结论"才 `format="brief"`（第九节第 2 条同步改）。

---

## 二、两类条款分列（task 硬要求）

### A. 照现状描述（代码已实现，手册如实描述）

共 **34 条**，均可在源码找到对应实现：三工具参数（`src/index.js` L810–860、L1360–1370、L1408–1410、L1457–1458）、
108 法分类与编号（`src/core/registry.js`）、合盘字段（`src/core/aggregate.js` L218/L261–308/L312–357/L344–357、
`src/core/format.js` L53–54）、保真度三档（`registry.js` + `kit.js` L436）、未报取象前缀（`zhanbu.js`/`xiangxing.js` 各法）、
`seed` 复现（`kit.js` `makeRand`/`hash32`）、`meta.skippedList`、`detail.未核实`、`evidenceDigest`、`consensusKeys.cats/fams`。

### B. 新立的口径（**规格要求，代码待跟进**）

共 **13 条**，在 skill 中以【待实现】/【部分实现】标注，逐条进 delta 清单：
分歧分级 D1–D5、L1–L5 显式层号、应期半开区间端点全覆盖、保真度逐项布尔位 `fidelityBits`、
claims 运行时校验、主辅法加权改为可稳定命中、`birthTz`/`whenTz` 参数、`end` 的"不含"语义声明、
`meta.fidelityBitsSummary`、`advice` 按 D 级分档措辞、`divergence[].grade/reason`、`conflicts[].grade`、
转述纪律的 3 条精确化表述（§十一，待用户裁决）。

---

## 三、★★ delta 清单（本任务最重要的产物：代码向 skill 对齐的施工图）

| # | skill 条款 | 期望口径 | 代码现状（文件:行） | 需要改什么 | 影响面 |
|---|---|---|---|---|---|
| **D-01** | §六 分歧分级 **D1–D5** | `divergence[]` 每条带 `grade`(`D1`口径/`D2`尺度/`D3`取用/`D4`资料/`D5`真分歧) + `reason`；`conflicts[]` 亦带 `grade`；`advice` 按级分档（D1–D4 **不得**写成"诸法矛盾"，仅 D5 可称真分歧） | `aggregate.js` L325–340（`conflicts`：仅 `cat/high/low/gap`）、L344–357（`divergence`：仅 `familySkew/gateGap/gateHigh/gateLow/std/signAgreement/dispersion/note`）——**无原因分类** | ①`conflicts`/`divergence` 增 `grade`+`reason`；②判级需读各法 `fidelity`（D4）、`entry.cat/module`（D1 同族分流派）、`detail.用神/取数口径`（D3）、`timing` 单位（D2）；③`advice` 分支措辞 | `aggregate.js`＋`format.js` 摘要＋`lib/client.js` 面板字段；**输出为新增键，向后兼容** |
| **D-02** | §六 证据分层 **L1–L5 显式层号** | 方法层 `detail.evidenceLevel`，或每条 `evidence` 节点带 `level`；`evidenceDigest` 给各层条数分布 | 四类字段齐全（`chart` / `detail` / `detail.evidence` / `detail.cite`），**无层号** | ①`kit.evidence()` 增 `level` 形参；②8 族方法给 `evidence` 打层号（`yijing.js` 已按"规则/取值/结论"三段写，改造成本最低）；③`aggregate.evidenceDigest` 汇总 | **8 个方法族全部**（工作量最大的一项）；可先只做聚合层"按 fidelity 推断层号"的过渡版 |
| **D-03** | §六/§八 应期**半开区间** `[start,end)` | 每条 `timing` 带 `lo`/`hi`（日，`hi` **不含**）；文档声明该语义 | 聚合层已汇总：`aggregate.js` L290–307（`timingLo/timingHi` → median → `lo/hi`）；**但 8 族中仅 `yijing.js` 提供 `timingLo/timingHi`**（其余 7 族只给措辞串） | ①其余 7 族各法补 `detail.timingLo/timingHi`；②在 `timingScope` 里补一句"`hi` 不含" | 7 个方法族（每族 3–5 个给应期的法）；`format.js` 应期行渲染 |
| **D-04** | §六/§十 保真度**逐项布尔位** | `fidelityBits`（如 `{历法,星历,表,辞书,图像}`）；`meta.fidelityBitsSummary` | 仅整法三档：`registry.js` 的 `fidelity` 字段 + `kit.js` L436 校验；子项用 `detail.未核实` | ①`registry.js` 108 条各加 `bits`；②`kit.makeOutcome` 透传；③`aggregate` 汇总 | `registry.js`（Lead 独占）＋`kit.js`＋`aggregate.js`＋**全部 8 族**（声明位） |
| **D-05** | §〇/§十 claims **运行时**校验 | 输出前校验"模型说法 vs 盘面"（三违规码：编造字段／自造分数／与保真度矛盾） | **无运行时校验**；仅开发期 `test/*.mjs` 断言 | 需明确责任方：插件侧无法校验模型文本，**建议**由宿主/会话层做，或插件提供 `divine_audit` 工具做"给定文本 vs 最新合盘"的一致性检查 | `src/index.js`（**冻结文件**，需 Lead 批准）；或宿主层 |
| **D-06** | §五 主辅法**可稳定命中**的加权 | `boost` 键改为**法号白名单或 `entry.id`**，不依赖术语恰好出现在 `name\|id\|cat\|note` | `aggregate.js` L51–124（`TOPIC_RULES` 的 `boost`）＋`relevanceOf`（子串匹配）—— 实测：**健康 0 法加权**、**财运仅 1 法且命中 `#103 面相十二宫`**（键 `财帛` 撞车）、考试仅 `#77 三元派·三般卦`（键 `父母` 撞名风水术语）、寻物仅 `#80 形势派·四灵`（键 `玄武`） | ①把 12 个事类的 `boost` 改为 `nos: [..]` 白名单（**内容直接取 skill §五"实操主辅法"列**）；②`relevanceOf` 支持 `nos`；③保留 `kw` 判类不变 | `aggregate.js`（Lead 独占）；**直接改变 108 法的加权与总断**，需回归 4 套基线 + 记录总断变化 |
| **D-07** | §二 `birthTz` / `whenTz` 参数 | 出生/求占时刻按**显式声明的固定偏移**解释（缺省 `+08:00`），禁止宿主时区与历史 DST | `calendar.js` **已修**：`birthInstant()` = `civilMs(...) − BIRTH_UTC_OFFSET_MIN×60000`（固定偏移，不再随宿主时区变 ✅）；但**工具无时区参数**，非 UTC+8 出生地无法正确表达 | ①`src/index.js` divine `properties` 增 `birthTz`/`whenTz`；②`shared.js` 与 `calendar.js` 接参；③工具描述同步 | `src/index.js`（冻结，需批准）＋`calendar.js`＋`test/host.mjs` 的 schema 断言 |
| **D-08** | §六 `end` 的"不含"语义 | 输出/文档声明 `[lo, hi)` 且 `hi` 不含 | 字段已有（见 D-03），**无任何地方声明"不含"** | `timingScope` 文案 + `format.js` 渲染 | 文案级 |
| **D-09** | §九 转述纪律 3 条精确化 | 见 skill §十一 表格 | 部署 system prompt 现为"108 行原样全部转述" | **需用户裁决**（属部署级）；手册已写明保留原要求 | 部署 system prompt（不在本仓库） |
| **D-10** | §七 `未报取象` 的完整性 | 四类触发（外应/所测之字/姓名/图像）+ 梦象 全部标前缀并降 `approx` | ✅ 已实现（`zhanbu.js`/`xiangxing.js`）；但 `#95` 报鸟种未报方位时仍标"未报外应"（task-12 V2-02/V2-03，Lead 已修） | 复核修复后是否覆盖"部分报"三档文案 | `zhanbu.js` |
| **D-11** | §八 模型不得改写（**运行时强制**） | 除行为红线外，规格要求可机械校验 | 无运行时强制 | 同 D-05，建议合并实施 | 同 D-05 |

> **排期建议**（按"价值/成本"排序）：D-06（一处改动、直接影响每次求占的加权，且顺手修掉 8 个事类的空转）
> → D-01（分歧分级，纯新增字段、向后兼容）→ D-03（7 族补应期端点）→ D-02/D-04（工作量大，可先出过渡版）→ D-05/D-07/D-11（涉冻结文件，需 Lead + 用户批准）。

---

## 四、方法论出处（各条注明仓库 + 文件，均为 `docs/research/` 调研所得）

| 手册条款 | 出处 | 本插件落地状态 |
|---|---|---|
| 票型不构成独立证据；总断以分门加权＋跨门共识为准 | `misc-and-aggregation-spec.md` · mingyu 系项目 | ✅ 已实现（`byCategory` + `consensusKeys.cats/fams`） |
| 证据分层 L1–L5 | 同上 · mingyu | 【部分实现】字段齐、**层号缺**（D-02） |
| 分歧分级 D1–D5 | 同上 · mingyu | **【待实现】**（D-01） |
| 应期半开区间、不做加权平均 | 同上 · mingyu | 【部分实现】聚合层 median 已对，方法层端点缺（D-03） |
| 禁止合成虚构分数 | 同上 · mingyu | ✅ 已实现 |
| 保真度逐项布尔位 | 同上 · mingyu | **【待实现】**（D-04） |
| 确定性事实 vs 模型可调引导的分层（chart/ruleFacts 不可改写，routingGuidance 标 advisory） | `yijing-spec.md` · R1 `build_model_packet.py` L119–135 | ✅ 规格已立（§八 权限表）；运行时不强制（D-11） |
| claims 三违规码校验；模型不得凭记忆/常识/旧会话自行计算或改写确定性结果 | ctw 系项目 | 红线✅／运行时校验 **【待实现】**（D-05） |
| 主动声明未实现的分支；无状态 | mingpan 系项目 | ✅ 已实现（`meta.skippedList`、`detail.未核实`、`seed`） |
| 审计字段（可复算） | oraclebone 系项目 | ✅ 已实现（`detail.evidence`/`cite`、`meta.hash`、`seed`） |
| 主辅法分工表（问题类型 → 主法/辅法） | `liu-he-xuan-ji` 系项目 | 【部分实现】有 `TOPIC_RULES` 加权，但 8 个事类空转（D-06）；手册 §五 已给出**规格版**主辅法列 |

---

## 五、主辅法操作表的条目数

- **12 个事类**（＝`TOPIC_RULES` 的 12 条）＋ 1 个「综合」兜底 = **13 行**；
- 每行四列：触发关键词 / **实际加权主法（逐字由代码现算，含法号与倍率）** / 被降权项 / 实操主辅法；
- 另附**实操主辅法导读 12 条**（按各法注册表 `note` 的"主司"，覆盖全部 11 个分类）；
- 表下**实况披露**：凡 `boost` 键为"方法族名"的事类（事业/国事/家宅/天时）加权有效；
  凡为"术数术语"的事类（姻缘/财运/健康/出行/考试/诉讼/寻物/孕产）加权近乎空转 —— 已升级为 delta **D-06**。

---

## 六、自测（全部通过）

```powershell
cd D:\DSH\plugins\dsh-divination-108
# 1) 手册里的工具/参数名都能在冻结源码里找到（question/when/longitude/birth/gender/numbers/coins/scope/format/detail/seed/method/id/sort/category/fidelity）
#    → 全部命中，无 ✗
# 2) 手册提到的合盘字段名都能在 aggregate.js 找到（evidenceDigest/familySkew/consensusKeys/rawScore/timingLo/timingHi/gateGap/signAgreement/dispersion/topicHits/skippedList/fidelityTally/agreement）
#    → 全部命中，无 ✗
node test/smoke.mjs ; node test/host.mjs ; node test/validate-preset.mjs ; node test/client.mjs
```

| 项 | 结果 |
|---|---|
| SKILL.md 行数 | 140 → **356** |
| 【待实现】标记 | **19** 处 |
| 【部分实现】标记 | **4** 处 |
| 工具/参数名与 `src/index.js` 一致 | ✅（`birthTz`/`whenTz` 是**规格新增**，已在 skill 标【待实现】并进 delta D-07） |
| 合盘字段名与 `aggregate.js` 一致 | ✅ |
| 四套基线 | validate-preset **46** ｜ smoke **83** ｜ host **172** ｜ client **62** —— 均未受影响（本任务未改代码） |

---

## 七、与部署 system prompt 的关系（摘要）

**保留**"默认把明细全部原样转述"，**不单方面放松**。仅在 skill §十一 提出 3 条**精确化建议**供用户裁决：
①"108 行"→"本次返回的全部明细行"（`scope` 非 `all` 时行数 < 108）；②把"原样"具体化为"保留编号/名称/符号/分值/依据，可整理格式与分组，不得删条目"；
③明确 `divine_detail` 是**补充**、不能替代默认的全量转述。若用户希望改为"按需转述"，需在**部署层**统一，不在手册里放松。
