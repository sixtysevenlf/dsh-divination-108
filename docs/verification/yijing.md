# 易卦族 24 法（#1–#24）· 验收与溯源报告

> owner：**m-yijing** ｜ 交付物：`src/methods/yijing.js`（21 引擎 / 覆盖 #1–#24）＋本文件
> 依据：`docs/V2-CONTRACT.md`（§2.2 诚实降级、§2.3 随机纪律、§3.2 模块契约、§4 溯源纪律、§7 DoD）
> ＋ `docs/research/yijing-spec.md`（A–G 全覆盖，含【A·已验证】/【D·存疑】/【未核实】分级）
> 写作用域：**只** `src/methods/yijing.js` 与 `docs/verification/yijing.md`（未触碰 core/**、lib/**、test/**、其他 methods、index.js）

---

## 0. 一句话结论

易卦 24 法已按经典规则**重写**（非哈希凑数）；族内表全部带 `cite`，每法 `detail` 带 `cite` + `evidence`（规则→取值→结论链）；
装卦层（八宫/世应/纳甲/六亲/六神/伏神/旬空/月建日辰/动变/进退/反吟伏吟/三冲六合）经 **golden 回归全部通过**；
`#1 大衍`/`#2 金钱` 用 `rand` 真随机且随问题改变；spec §Z2/§Z3 五处已知错误**逐条避开**。

---

## 1. 验收结果

| 套件 | 结果 |
|---|---|
| `node test/validate-preset.mjs` | **46 / 46** ✅ |
| `node test/smoke.mjs` | **83 / 83** ✅（Lead 修 `kit.xunOf` 后我实测） |
| `node test/host.mjs` | **172 / 172** ✅ |
| `node test/client.mjs` | **62 / 62** ✅ |
| `node test/v2-calendar-check.mjs`（Lead 新加） | **7 / 7** ✅ |

本族专项（`runMany` 全量输入 `2026-09-30 14:30` + `numbers:[7,13,21]` + `gender:'男'` + `birth`）：

```
易卦族 24 法：起 24 / 24 ｜ 唯一 essence 24 / 24 ｜ 合规问题 0
保真度分布：full 12 ｜ core 5 ｜ approx 7
单法 detail 渲染 425–2132 字（仅下钻时输出）｜ 108 法明细表 5111 字（阈值 9000）
```

> 复核时若 smoke 出现非本族失败（如 `#26 feiStars is not defined`、`#99 entry is not defined`、`#105 SUN_G0 is not defined`），
> 属其他 owner 正在改写的模块，与本族无关——本族 24 法在上述所有轮次中**始终 24/24 起**。

---

## 2. Golden 回归（可复现，全部实跑）

族内表与派生结果一律与 `core/tables.js`（kernel-tables，已验收）+ 生成式规则对拍：

| 项 | 方法 | 结果 |
|---|---|---|
| 八宫归属 + 位次 + 世应 | **生成式**（纯卦起，逐翻初→五爻；游魂＝五世复翻四爻；归魂＝游魂复翻初二三）× `tables.SHI_YING_BY_HEX` 64 行 | **64 / 64 相符** |
| 纳甲 + 六亲 + 六神 + 世应标记 | 族内装卦 384 项（64 卦 × 6 爻）× `tables.najiaOf` | **0 项不符** |
| 六冲卦 / 六合卦 | **运行时按纳甲三对（初-四·二-五·三-上）穷举**，不查硬编码名单 | 六冲 **10** 卦、六合 **8** 卦，与 golden 名单完全一致 |
| 旬空闭式 | 60 甲子穷举 × 六旬真值表 | **60 / 60 对** |
| 旬空与历法层一致 | 5 个六爻法 × 20 个日期（跨 5 旬）= 100 项，`detail.旬空` 与装卦逐爻 `旬空` 标记 vs `chart.xunKong.day` | **0 项不符** |
| 六神起例 | 10 日干初爻 | 甲青龙·乙青龙·丙朱雀·丁朱雀·戊勾陈·己螣蛇·庚白虎·辛白虎·壬玄武·癸玄武（＝spec §A6 三源一致值） |
| 八卦属性 | 8 卦 bits/五行 × `tables.TRIGRAMS` | 0 项不符 |
| 六十四卦名 / 卦序 / 卦德 | 64 名 × `tables.hexNameOf`；64+64 项 × `HEX_ORDER`/`HEX_POLARITY` | 0 项不符 |
| **大衍筮法概率** | 40 万次实测 vs 本族精确 DP | 折 16：**6:0.831 7:4.608 8:7.186 9:3.375** vs 精确 **0.828 / 4.620 / 7.174 / 3.379** ✅ |
| **金钱卦概率** | 40 万次实测 | 折 8：**6:1.002 7:3.011 8:2.987 9:1.000**（理论 1:3:3:1）✅ |
| 稳健性 fuzz | 15 问题 × 4 时刻 × 24 法 = **1440 次调用** | 0 抛异常、0 未起、0 `NaN`/`undefined`/`[object Object]`、0 分数越界、0 等级不符 |
| 确定性 | 同问同刻两次 | 24 法结果**完全一致** ✅ |
| 问题依赖 | 换问题 | 本族 14 法改变（**含必需的 #1 大衍、#2 金钱卦**）；其余 10 法按设计只依赖时刻/四柱（见 §6） |

### 大衍筮法的概率结论（本族独立推导，写进 `detail.概率表`）

真摸蓍草（分二均匀 → 挂一 → 揲四 → 归奇）的**精确**分布可由 DP 求得，与经典通例一致而**不完全相等**：

- 第一变：去五（→44 策）概率 **36/47**、去九（→40 策）概率 **11/47**（L 均匀取 1..47，仅 L≡0 mod 4 的 11 例去九）；
- 第 N 变去四之概率 = `#{L∈[1,S−2] : L mod 4 ∈ {1,2}} / (S−2)`：S=44→11/21、40→10/19、36→9/17、32→8/15，即 **≈0.524–0.533，并非恰好 1/2**；
- 三变合成（精确）：老阳 36 策 **21.117%**、少阴 32 策 **44.836%**、少阳 28 策 **28.874%**、老阴 24 策 **5.174%**
  → 折 16 = **3.379 : 7.174 : 4.620 : 0.828**，经典化约 3:7:5:1 的通例是其理想化（隐含「去四/去八各半」）。

差额不是 bug，是**有限堆数的余数效应**；本插件把两者都写在 `detail` 里，不拿通例冒充实测。

---

## 3. 逐法：经典规则 → 出处 → 保真度

| # | 法 | 引擎 | 核心规则与出处 | v1 实际 | v2 | 升降 |
|---|---|---|---|---|---|---|
| 1 | 大衍筮法 | `yarrow` | 《周易·系辞上》「大衍之数五十，其用四十有九」；《易学启蒙·明蓍策》三变成爻/十八变成卦；**真摸蓍草**十八变 + 概率表 | full | **full** | — |
| 2 | 金钱卦 | `coinHex` | 《火珠林》以钱代蓍；《增删卜易·以钱代蓍法》三枚六掷，三背＝老阳9／两背＝少阴8／一背＝少阳7／三字＝老阴6 | full | **full** | — |
| 3 | 六爻纳甲 | `najia` | 《京房易传》纳甲世应；《增删卜易·卷首》装卦例；完整装卦＋用神/原忌仇＋回头生克＋进退神＋反吟伏吟＋三冲六合＋应期机制 | full | **full** | — |
| 4 | 六爻·世应六亲 | `shiying` | 《增删卜易·世应章》「世为己、应为彼」；spec §F4 九种世应关系 | full | **full** | — |
| 5 | 梅花·时间卦 | `meihua{mode:time}` | 《梅花易数·卷三·年月日时起例》：上卦＝(年支+农历月+农历日)÷8、下卦＝再加时支÷8、动爻÷6，余 0 作 8/6 | full | **full** | — |
| 6 | 梅花·报数卦 | `meihua{mode:number}` | 《梅花易数·卷三》报数起卦（上卦第一数、下卦第二数、两数**加时数**取动爻；三数则第三数取动爻） | full | **full** | — |
| 7 | 梅花·外应卦 | `meihua{mode:waiying}` | 《梅花易数·卷三》外应取数；物象配卦依《说卦传》类象。**须有真实外应**：报了才用，未报则标「未报外应·取象」 | full | **full / approx** | **full→approx（未报外应时）** |
| 8 | 梅花·字占 | `meihua{mode:word}` | 《梅花易数·卷三·二字占》：上字笔画为上卦、下字笔画为下卦、两字笔画之和加时数取动爻；无笔画表则降级 | full | **full / approx** | **full→approx（未报笔画时）** |
| 9 | 梅花·体用生克 | `tiyong` | 《梅花易数·体用生克篇》《体用总诀》；R7 判读框架（体用定义优先于「上体下用」）＋互卦（中程）＋变卦（终局） | full | **full** | — |
| 10 | 京房易传·八宫 | `palace` | 《京房易传》八宫卦次、世应飞伏；《火珠林》游魂归魂之义；飞伏五态依 spec §C4 | full | **full** | — |
| 11 | 火珠林古法 | `huozhulin` | 《增删卜易·月建日辰》「月建为提纲，日辰为主宰」＋空破/进退/反吟 | core | **core** | — |
| 12 | 文王卦·用神法 | `yongshen` | 《卜筮正宗·用神章》《原神忌神仇神章》；《增删卜易·用神章》 | core | **core** | — |
| 13 | 焦氏易林·卦变 | `yilin` | 《焦氏易林》64×64＝4096 林辞；「之」法见《左传》筮例。**无林辞原文** → 结构断语 | approx | **approx** | —（维持 v1） |
| 14 | 太玄数 | `taixuan` | 《太玄经》八十一首、三方九州二十七部八十一家；太玄数「甲己子午九…巳亥四」 | approx | **approx** | — |
| 15 | 元包数 | `yuanbao` | 《归藏》佚文/卫元嵩《元包》**以坤为首**（坤乾兑艮离坎巽震） | approx | **approx** | — |
| 16 | 潜虚数 | `qianxu` | 司马光《潜虚》五十五名（五行各十一名）结构 | approx | **approx** | — |
| 17 | 皇极经世 | `huangji` | 邵雍《皇极经世书·观物篇》一元十二会/一会三十运/一运十二世/一世三十年；十二会配十二辟卦 | core | **core** | — |
| 18 | 河洛理数·先天卦 | `heluo` | 河图生成数（1/6水 2/7火 3/8木 4/9金 5/10土）＋后天八卦配洛书数 | core | **core** | — |
| 19 | 灵棋经 | `lingqi` | 《灵棋经》十二棋分上四/中四/下四，正为阳反为阴；课象＝三组阳数 | approx | **approx** | — |
| 20 | 先天易数 | `xiantian` | 《皇极经世》先天八卦数（乾1兑2离3震4巽5坎6艮7坤8）＋月建所值十二消息卦 | core | **core** | — |
| 21 | 大象占 | `daxiang` | 《周易·说卦传》八卦类象；《周易》大象例（天行健/地势坤） | full | **full** | — |
| 22 | 爻辞占 | `yaoci` | 《周易·系辞下》「二多誉、四多惧、三多凶、五多功」＋当位/得中/相应＋《左传》筮例（一爻专断、多爻取变卦） | core | **approx** | **core→approx（无爻辞原文）** |
| 23 | 之卦占 | `zhigua` | 《左传》「贞，事之干也；悔，事之枝也」（内卦为贞、外卦为悔）；之卦＝将来；变卦合冲四态 | full | **full** | — |
| 24 | 互卦占 | `huagua` | 《梅花易数·互卦》：二三四为互下、三四五为互上，主中段过程；再互作更深一层 | full | **full** | — |

---

## 4. 保真度升降清单（§7 要求逐条点名）

**降 3 法，全部是「诚实降级」，不是算法退步：**

| # | 项 | v1 | v2 | 原因 |
|---|---|---|---|---|
| 7 | 梅花·外应卦 | full | **approx**（仅当用户未报外应） | v1 用 `rand.below(8)` 造了一个**不存在的外物**当取数，等于「没报外应却假装有」。v2 改为：报了外应 → 真取象、full；未报 → 以**时刻**取象、`essence` 以「未报外应·取象：」开头、`fidelity=approx`（与 §2.2 对 #95/96/97 的同一纪律一致） |
| 8 | 梅花·字占 | full | **approx**（仅当既无报数、又无笔画） | v1 用 `codePointAt(0) % 100` 冒充笔画。v2 三级：①用户报数 → 报数当笔画（full）；②无报数 → 字数法并在 `detail.笔画说明` 标 ⚠ |
| 22 | 爻辞占 | core | **approx** | 本轮调研 9 仓库**无爻辞/彖辞文本库可用**（R2 有但无 LICENSE，不可抄）。v1 名为「取爻辞」实则按卦德打分，属名不副实。v2 改为可引用的**爻位义例**（当位/失位·得中·相应·位义），并在 `detail.⚠` 明写「不伪造辞句」 |

**升 0 法的标签，但 5 法的算法实质升级**（保真度标签未动，避免过度自称）：
`#1` 真实十八变 + 精确概率表；`#6/#8` 取数公式原文列出且拆分为正路/降级两档；`#14` 修正 v1 的**方州部家结构错误**（v1 把「部」当 1..9，实为 3 方×3 州×3 部×3 家，81 首）；`#15` 用归藏/元包八卦序替换 v1 的任意重排；`#16` 用「五行×十一位」结构替换 v1 的 `rand` 凑数。

---

## 5. spec §Z2 / §Z3 五处已知错误的落实

| spec 条目 | 本族做法 |
|---|---|
| ⚠ R5 `SHI_MAP` 19/64 错、`PALACE_MAP` 结构错 | **不抄任何仓库表**：八宫由**生成式**推导（纯卦起 → 逐翻初→五爻 → 游魂＝五世复翻四爻 → 归魂＝游魂复翻初二三），世位 6/1/2/3/4/5/4/3、应＝世±3；再与 `tables.SHI_YING_BY_HEX` 64 行做 golden 回归 → **64/64** |
| ⚠ R4 六冲表 16 卦（多 6）、六合表 8 卦错 6 | **运行时穷举**：按纳甲三对（初-四·二-五·三-上）皆冲/皆合现算 → 恰 **10 / 8** 卦，与 golden 名单一致；硬编码名单只留在 `DEBUG_TABLES` 里作对拍基准 |
| ⚠ R9 梅花变卦翻爻方向反 | 本族变卦为 `changed[pos-1] = 1 - changed[pos-1]`（翻**动爻自身**）；时间卦用 **年支+农历月+农历日**（不用公历年月日），与 R9 的两处偏差均不同 |
| ⚠ 纳甲「一错全错」 | 族内纳甲表 4 源一致值，并与 `tables.najiaOf` 逐爻对拍 **384 项 0 不符** |
| ⚠ 土爻化进/化退 4 源 4 说 | **可切换开关 + 默认关闭**：`TUXI_JINSHEN_ENABLED = false`。四生四正（亥→子·寅→卯·巳→午·申→酉）四源一致，照常判定；四土（辰戌丑未）默认**不判**并输出「存疑」行，`detail.存疑` 写明 spec §C5【D·存疑】。**未选边当定论**（Lead 已确认保持此做法） |
| ⚠ 卦气【未核实】 | **不使用「卦气」说**：`docs/research/yijing-spec.md §F3` 查遍 9 仓库无卦气表/公式，故不凭记忆补表。全族「旺衰」只取**月令**（旺相休囚死）；十二消息卦配月建**另表另名**（仅 #17 皇极经世、#20 先天易数），并在 `detail.未核实说明` 明写「本插件不用卦气，故标名『月建辟卦』」 |
| ⚠ 火珠林原文 0 命中 | #11 的 `detail.未核实说明` 明写：规则骨架取自《增删卜易》月建日辰体系，**不冒充《火珠林》条文** |
| ⚠ 梅花字占/报数/外应取数公式【未核实】 | 三者的取数公式**原样写进 `detail.起卦`**（用户可逐项核对），并附「取数公式【未核实】：本轮调研 9 仓库无任何实现」的标注 |

### 依 spec 补齐的规则（v1 没有）

- **回头生克与作用顺序**（§C3）：变爻只对本位动爻回头作用；**被回头克之动爻无力生克他爻**（`huiTouOf` → `blocked`）。四型：回头生/克/合/冲。
- **旬空真空·假空**（§C7）：旺相空＝假空(−6)、休囚空＝真空(−20)、动爻空＝动则不空(−4)、月破逢空＝真空真破(−26)、应期「冲空则实」。
- **伏神出伏四条件**（§C4）：日辰冲飞神／日辰值伏神／飞神空破／伏神旺相；**飞伏五态**命名校正（v1 把「飞生伏」与「伏生飞」判反了）。
- **反吟伏吟四类**（§C6）：爻反吟＝动爻与变爻六冲、爻伏吟＝同支、卦反吟＝本卦与变卦互为六冲、卦伏吟＝六爻皆静。
- **动爻格局**（§C9）：独发 / 独静（五动一静，以静爻为纲）/ 两爻动 / 多爻动 / 六爻全动（以变卦为主断）/ 六爻全静。
- **间爻**（§C10）：世应之间两爻宜静不宜动；标注【C·单源·可选流派】。
- **三合局「结构候选 ≠ 结论」**（§C8/R1）：不成局时只记 `conclusionScope: structure_candidate_only`，不参与计分。
- **应期机制与三层结构**（§D1/§D2/R1）：8 种 mechanism 命名（`void_fill`/`void_clash`/`month_break_value`/`month_break_harmony`/`month_break_exit`/`moving_value`/`moving_harmony`/`static_clash` + `yongshen_value`），
  输出 `detail.应期候选`、`detail.应期三层{主应期/辅助节点/风险窗口}`、`detail.timingScope = "conditional_timing_candidates_not_guaranteed_dates"`（沿用 R1 的「地支候选 ≠ 保证日期」边界）。
  `timing` 字符串保持**稳定措辞**（六爻族 `${地支}日`、梅花族 `${卦数}日`），便于聚合器按字符串合并计数。

---

## 6. 随机与确定性纪律（§2.3）

- **只**用 runner 注入的 `rand`（`makeRand(seedBase|entryId)`），全族 **0 处 `Math.random()`**。
- **#1 大衍 / #2 金钱卦：真随机且随问题改变** ✅（实测换问题两者结果均变）。
- 本族 10 法只依赖时刻/四柱、不随问题改变，**这是设计而非缺陷**：
  `#5` 时间卦、`#6` 报数卦（由报数决定）、`#7` 未报外应时按时刻取象、`#8` 有报数时按报数、
  `#9` 体用生克、`#14` 太玄（四柱太玄数）、`#17` 皇极经世、`#18` 河洛（四柱河图数）、`#20` 先天易数、`#21` 大象占。
- 六爻族 14 法共用 `chart.coins` 回放能力：用户给六个 6/7/8/9 爻值时，全部六爻法**同一卦**复现（`g.replay` 标记在 `detail` 里）。

---

## 7. 诚实降级与防御层（§2.2 / §3.2）

1. **未报的输入不许假装有**
   - `#7` 未报外应 → `essence` 以 `未报外应·取象：` 开头 + `fidelity=approx`；
     且外应识别允许填充字（「左眼**一直**跳」能命中），与 `#96 眼跳占` 的判断**不打架**（实测同问下两者都说「已报」）。
   - `#8` 无报数亦无笔画 → `fidelity=approx` + `detail.笔画说明` 标 ⚠。
   - `#13/#14/#15/#16/#19/#22` → `detail.⚠` 明写缺哪种辞书、做了什么替代表述。
2. **防御式接入**（`chart.astro/solarTrue/renyuan/shenshaAll/dayBoundary` 与 `tables.js` v2 表均由他人在并行开发）
   - 全程 `?.` + 形状校验；`kongOf` 有三级兜底（`xunKong.day` → `xun.kong` → 六甲子闭式）；
   - `TRIGRAMS/HEX_POLARITY/HEX_ORDER/SHI_YING_BY_HEX/HEX_PALACE/TAIXUAN_81/SANHE_GROUPS/isKong/jianPoOf/SHENSHA_ALL` 一律「内核表可用则用、否则族内表」，族内表带 `cite` 写在文件顶部；
   - **实测**：删掉 `astro/renyuan/shenshaAll/dayBoundary/solarTrue` 五字段后，24 法**仍全起**；
     给一个只有 `question/seedBase` 的极简盘，24 法全起（唯 `#6` 按 `need:['numbers']` 记「未起」，与 v1 行为一致）。
   - 另有一层 `guard()`：万一族内表或盘基意外缺位，返回**结构完整的降级结果**（`detail.异常` 写明原因、`fidelity=approx`），**绝不返回 null、绝不抛异常**。本次 1440 次 fuzz 中 `guard` **一次都没被触发**（即无隐藏异常）。
3. **不伪造辞书**：爻辞/彖辞、易林 4096 辞、太玄首辞、元包卦辞、潜虚 55 名、灵棋 124 课辞 —— 一律「结构性断语 + ⚠」，`detail.⚠` 逐条说明。

---

## 8. 遗留不确定项（不可凭记忆补，需另找原本）

| # | 项 | 现状 |
|---|---|---|
| 1 | **土爻（辰戌丑未）化进/化退** | 4 源 4 说，无内部裁决依据。开关默认关闭、输出标「存疑」。**待核《增删卜易》原文** |
| 2 | **火珠林原文** | 9 仓库全文 0 命中；#11 目前已用《增删卜易》月建日辰体系代替并如实标注 |
| 3 | **梅花字占/报数/外应取数公式** | 无仓库实现；已按通行口诀实现并把公式原文写进 `detail.起卦` 供核对，标【未核实】 |
| 4 | **梅花互卦/错卦/综卦取法** | 仓库只给用法不给公式；已按经义实现（二三四为互下、三四五为互上；错＝六爻全变；综＝六爻倒置） |
| 5 | **「卦气」** | 无表无公式 → 全族不用；旺衰只取月令 |
| 6 | **皇极经世纪元基准 67017** | 一元之始取通行推算值（公元前 67017 年），**未核实原书推算**，`detail.⚠` 已标；元会运世之**相对结构**不受影响 |
| 7 | **#22 爻辞** | 无可靠文本库 → approx + 爻位义例 |
| 8 | **十二长生「土」的起算**（水土同宫 vs 火土同宫） | 本族未用十二长生断变爻，故不受影响 |
| 9 | **用神流派分歧**（健康/疾病/出行/天气） | 采「用神旺衰方向与吉凶相反者一律取**世爻**为用神、另立 `alt` 记病神/官府/贼/对方」（`SELF_GOD_TOPICS`），避免「官鬼旺＝病重」被当吉断；`detail.用神流派` 记录所选流派与出处 |

---

## 9. 复现命令

```powershell
cd D:\DSH\plugins\dsh-divination-108

# 四套基线
node test/validate-preset.mjs ; node test/smoke.mjs ; node test/host.mjs ; node test/client.mjs

# 本族 golden 回归（八宫/纳甲/六冲六合/旬空/六神/卦德卦序）
node -e "import('./src/methods/yijing.js').then(async M=>{const D=M.DEBUG_TABLES,T=await import('./src/core/tables.js');
let a=0;for(const n of Object.keys(T.SHI_YING_BY_HEX)){const x=D.PALACE_MAP[n],y=T.SHI_YING_BY_HEX[n];if(!x||x.palace!==y.palace||x.stage!==y.stage||x.shi!==y.shi||D.palaceOf(n).ying!==y.ying)a++}
let b=0;for(const n of Object.keys(D.PALACE_MAP)){const bits=D.parseHexNameToBits(n),m=D.zhuangGua(bits,{dayGan:'甲'}),k=T.najiaOf(bits,'甲');for(let i=0;i<6;i++)if(m.lines[i].gz!==k.lines[i].gz||m.lines[i].qin!==k.lines[i].qin||m.lines[i].shen!==k.lines[i].shen)b++}
const c=[],h=[];for(const n of Object.keys(D.PALACE_MAP)){const r=D.chongHeOf(D.zhuangGua(D.parseHexNameToBits(n),{dayGan:'甲'}));if(r==='六冲卦')c.push(n);if(r==='六合卦')h.push(n)}
console.log('八宫不符',a,'｜纳甲不符',b,'｜六冲',c.length,'卦｜六合',h.length,'卦')})"

# 大衍概率（精确 DP 已在 detail.概率表；此处实测）
node -e "import('./src/methods/yijing.js').then(async M=>{const K=await import('./src/core/kit.js');const D=M.DEBUG_TABLES;
const r=K.makeRand('mc'),c={6:0,7:0,8:0,9:0},N=400000;for(let i=0;i<N;i++)c[D.yarrowLine(r).value]++;
console.log('折16:',Object.entries(c).map(([k,v])=>k+':'+(v/N*16).toFixed(3)).join(' '),'（精确DP 0.828/4.620/7.174/3.379）')})"

# 单法下钻（看 cite / evidence / 装卦 / 应期三层）
node -e "import('./src/core/calendar.js').then(async C=>{const R=await import('./src/core/runner.js'),F=await import('./src/core/format.js');
const ch=C.buildChart({question:'这次合作能不能成',when:new Date(2026,8,30,14,30),longitude:116.4,numbers:[7,13,21],gender:'男'});
for(const r of R.runMany({chart:ch,nos:[1,3,11]}))console.log(F.renderDetail(r.entry,r.outcome),'\n')})"
```

`DEBUG_TABLES`（`src/methods/yijing.js` 末尾导出，运行器不使用）暴露族内表与派生函数，
供 verifier 在 `test/v2-crosscheck.mjs` 中直接对拍：`PALACE_MAP` `NAJIA` `JINSHEN` `TUXI_JINSHEN_ENABLED`
`LIUCHONG_GUA_GOLDEN` `LIUHE_GUA_GOLDEN` `chongHeOf` `DAYAN_PROB` `L_HEX_BY_NAME` `zhuangGua` `hexInfoOf`
`palaceOf` `huiTouOf` `kongEffect` `feiFuState` `timingCandidatesOf` `yarrowLine` `coinLine` `guaFromNumbers` 等。

---

## 10. 与 verifier 的接口约定

- 本族**不修改** `test/**`；verifier 的问题请走 `docs/verification/ISSUES.md` 或直接找我。
- 若 verifier 发现装卦层不符，请附：`卦名 / 爻位 / 期望值 / 实测值 / 依据（spec 章节或经典出处）`——
  八宫与六冲六合我这边是**生成式/穷举**，若与某表不符，我会先查是表错还是生成式错，而不是改表迁就。
- 已知**有意为之**的三处保真度降级（§4）与一处默认关闭开关（土爻进退），请勿当成 bug 回退。
