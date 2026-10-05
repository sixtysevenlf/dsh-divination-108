# `src/core/kit.js` 穷举复核报告（task-10）

> owner：**m-yijing** ｜ 交付：`test/v2-kit-exhaustive.mjs` ＋本文件
> 被测：`src/core/kit.js`（Lead 独占，本轮复核期间由 Lead 依本报告修复了 6 项）
> 起因：`kit.xunOf` 曾有一处 **20/60 才现形** 的 bug（`min(gi,zi)` 退旬首 → 二十个日干支得空数组），
> 小样本上完全正确。kit.js 是 108 法共用底座却从未被穷举复核，本任务补这一刀。
> 纪律：**只读 `src/**`**；发现的问题只报告不修（由 Lead 修）；只写 `test/v2-kit-exhaustive.mjs` 与 `docs/verification/**`。

---

## 0. 结论

```
$ node test/v2-kit-exhaustive.mjs
PASS 221 ｜ WARN 14 ｜ FAIL 0        （退出码 0）
```

| 判定 | 数量 | 含义 |
|---|---|---|
| **FAIL** | **0** | 无缺陷残留 |
| 已修复 | **7** | 本次复核发现、Lead 修复、**已在测试里加回归锁**（见 §2） |
| WARN | 14 | 边界/健壮性/口径观察，不影响当前 108 法运行，无需修（见 §3） |
| PASS | 221 | 穷举/闭式对拍全部一致 |

**核心结论：kit.js 的全部数据表与算法在穷举/闭式层面**正确**——**
`ganzhiOf` 60/60、`xunOf` 60/60（含修复完备性）、`changshengOf` 120/120（对拍第三方）、
`nayinOf` 60/60（对拍第三方）、`liuShenOf` 60/60、`tenGodOf` 100/100（对拍第三方）、
`cangGanGods`、`shenShaOf` 48/48（独立推导）、`relation`/`relationScore`/`wangShuai` 各 25/25、
`makeRand` 值域/确定性/均匀性/序列锁、`makeOutcome` 全边界、14 张内部表的交叉不变量 —— **无一处数值错误**。
本轮发现的 7 项全部是**健壮性/类型契约/口径**问题，不是算错。

**修复闭环**：7 项均由 Lead 在 `src/core/kit.js` 修复；我把对应断言从「行为锁定」翻转为「**正确行为的回归锁**」——
若日后回退，`node test/v2-kit-exhaustive.mjs` 会立刻失败。

基线未受影响：`validate-preset 46 ｜ smoke 83 ｜ host 172 ｜ client 62` 全绿。

---

## 1. 验证方法（每条都可复现）

### 1.1 独立 oracle 来源

**不从 kit 反推期望值**（那是自证）。期望值来自三类：

| 类型 | 来源 | 用于 |
|---|---|---|
| **第三方独立实现** | 仓库已 vendored 的 `vendor/lunar.cjs`（lunar-javascript，与历法层无关的第三方库） | `LunarUtil.NAYIN`（60 甲子纳音）、`LunarUtil.SHI_SHEN`（100 组十神）、`LunarUtil.CHANG_SHENG_OFFSET`（十干长生偏移闭式）、`WU_XING_GAN/ZHI` |
| **本文件独立重实现** | 从定义式重写（六十甲子闭式、旬空闭式、三合局+十二长生偏移、五行生克闭环、十神「五行位×阴阳」、对称分档） | `ganzhiOf` `xunOf` `relation` `wangShuai` `shenShaOf` `tenGodOf` `verdictOf` |
| **经典表/口诀** | 《渊海子平》十干禄、《三命通会》四神煞口诀、spec §C7 六旬空亡表 | 交叉校验 |

### 1.2 覆盖清单与样本量

| 导出 | 样本量 | 判据 |
|---|---|---|
| `ganzhiOf` | 60 全枚举 + `i∈[-120,180)` 300 点 | 独立闭式、周期 60、两两不同、「支序−干序」恒偶 |
| `xunOf` | **60/60** | 旬首恒「甲+旬首支」且属六甲、空亡恒两支、与六旬真值表逐项一致、与独立闭式一致、**空亡支不属本旬**、六旬空亡并集恰覆盖 12 支 |
| `changshengOf` | **120/120** | 与 vendor `CHANG_SHENG_OFFSET` 闭式逐项一致；每干 12 支双射；阳干顺行/阴干逆行；**十干禄位必为「临官」**（独立不变量） |
| `nayinOf` | **60/60** | 与 vendor `NAYIN` 逐项一致（异体字归一）；相邻两甲子共名；30 名无重复；每名恰覆盖 2 干支；名形合法 |
| `liuShenOf` | **60/60** | 「甲乙青龙·丙丁朱雀·戊勾陈·己螣蛇·庚辛白虎·壬癸玄武」起例 + 顺行；每干六神两两不同；与 `tables.LIUYAO/LIUSHEN` 名录一致 |
| `tenGodOf` | **100/100** | 与 vendor `SHI_SHEN` 逐项一致；每干覆盖全 10 种（完备）；同干必比肩；**阴阳配对双向自洽**（正↔偏 5 对）；与「五行位×阴阳」独立重算一致 |
| `cangGanGods` | 12 支 × 2 日主 | 与 `ZHI_CANGGAN` 逐项一致；本气/中气/余气层级正确；十神自洽；单藏干支长度为 1 |
| `shenShaOf` | **48/48** | 与「三合局→长生位→冲/沐浴/墓/帝旺」独立推导一致；每类恰落 4 支；四大口诀表逐字对拍；与 `tables.SHENSHA_ALL` 跨表一致 |
| `relation` / `relationScore` | **25/25** | 每行 5 种关系各一；生克互逆；独立闭式一致；bias 覆盖（含 0）；未知关系→0 |
| `wangShuai` | **25/25** | 每月令五档**双射**；分值集合恒 `{100,75,40,25,10}`；与「当令旺·令生相·生令休·克令囚·令克死」独立重算一致 |
| `verdictOf` | **401 点**（−100..100 步长 0.5） | 对称分档定义一致；关于 0 对称；±15/±40/±70 边界归更极端一档；单调不降 |
| `clamp` / `mod` / `truncate` / `weightedScore` | 边界表 | NaN/±Inf → 0；越界夹取；`weight≤0` 忽略 |
| `makeRand` | 6 种子序列锁 + 20 万/档卡方 + 2 万值域扫描 | 同种子同序列；值域/整数性；`below(0)`/`range(a,a)`/`range(min>max)`/`pick([])`/`shuffle([])`/`chance(0|1)` 边界；`below(6|8|12|60)` 卡方（p=0.001 临界值）；**序列冻结锁** |
| `makeOutcome` | 全边界表 | 分数夹取/NaN/±Inf/字符串；verdict 回落；essence 截断 60；**keys 去重 + 上限 6**；wuxing 补零；timing trim；fidelity 三档；detail 规范化；空输入形状完整性 |
| v2 新增 13 个工具 | 网格 + 随机 500 组 | `norm360` 全域 [0,360)；`angleGap` 14400 组合 ∈[0,180] 且对称；`signIndexOf` 边界；`median` 奇偶；`trimmedMean(trim=0)=均值`、稳健于极值、所有 (n,trim) 组合有限；`quantile` 单调；`weightedMean/weightedStd` 被零权重/NaN 污染时不产生 NaN、常量序列 σ=0；`signAgreement` 全同号=1/全反号=0/一方 0=0.5/∈[0,1]；`evidence`/`evidenceDigest` 形状与上限 |
| 内部 14 张表交叉不变量 | — | 六合/六冲互逆且无自映射、六冲≡支序±6、六害互逆、三合/三会方局、藏干形状与五行、`SHENG/KE` 成 5 环、`SHENG_BY/KE_BY` 互逆、`NAYIN` 60 键、`VERDICT_VALUE` 单调 |

### 1.3 `xunOf` 修复完备性（重点，不只依赖已加的那条 smoke 断言）

对 **60 个日干支**逐项验证五条**互相独立**的必要条件，任一条不满足即失败：

1. 旬首恒为「甲 + 该旬首支」，且必属六甲（甲子/甲戌/甲申/甲午/甲辰/甲寅）；
2. 空亡恒为**两支**（历史上 bug 的形态正是空数组）；
3. 与 spec §C7 三源一致的六旬表**逐项**相符；
4. **空亡支不得出现在本旬的任何干支里**（本质定义，与实现无关）；
5. 与独立闭式（`旬首支序 = (zi − gi) mod 12`，空亡取其后两位）逐项一致。

**结论：5 条全过，60/60。修复完备。** 另验证六旬空亡并集恰好覆盖 12 支各一次（`XUNKONG` 表自洽）。

---

## 2. 发现 → 已修复（7 项，均带回归锁）

> 本节 7 项由本任务**发现并上报**，Lead 在 `src/core/kit.js` 修复后我把断言从「行为锁定」翻转为「**正确行为的回归锁**」——
> 若日后回退，`node test/v2-kit-exhaustive.mjs` 会立刻失败。

### R1 · `keys` 不去重 → **会灌水下游共识计数**（task-10 验收清单明列「去重」）

| 项 | 内容 |
|---|---|
| 函数 | `makeOutcome` |
| 输入 | `makeOutcome({ keys: ['财', '财', '财'] })` |
| 期望 | `['财']`（先去重再取上限 6） |
| 修复前实测 | `['财','财','财']` |
| **下游影响（实测）** | `aggregate.js` 对 `r.outcome.keys` **逐项**累加 `count`，故一条方法把同一 key 写 3 次等于投 3 票。构造 3 条法（A:`[财,财,财]`、B:`[财]`、C:`[其他]`）→ 共识「财」**count=4**，而实际只有 **2 法**提及，越过 `count >= 3` 的共识阈值进入共识榜 |
| 依据 | 契约 §3.2 说 keys 用于「聚合器统计 ≥3 法同现」——「法」是计数单位，同一法内重复不应增加票数；且 8 个方法族多数自建 keys 时已自行 `new Set`，说明意图本就是去重 |
| 修复后 | `['a','a','b','b','c','c','d']` → `['a','b','c','d']`（**含 trim**、保序）✓ **已加回归锁**（3 条断言） |
| 严重度 | 中（会造成共识榜虚高；实际因各族自建时已去重，尚未产生可见偏差） |

### R2 · `median` / `trimmedMean` / `quantile` 非数组入参**抛 TypeError**

| 项 | 内容 |
|---|---|
| 输入 | `median(123)` / `median('abc')` / `trimmedMean({})` / `quantile(123, 0.5)` |
| 期望 | `0`（空数据中性值），至少不抛 |
| 修复前实测 | `TypeError: (arr ?? []).map is not a function` |
| 依据 | 同区块 `weightedMean(null)`→0、`weightedStd(null)`→0、`signAgreement(null)`→1 **都做了防护**（实测 3/3），三者与 `median` 一族姿态不一致。kit 是底座，上游漏一个 `null` 就会让 runner 记「算错」→ 整法静默变「未起」 |
| 修复后 | 四例均返回 `0` ✓ **已加回归锁** |
| 严重度 | 中（真实崩溃面） |

### R3 · `ganzhiOf` 非法入参返回**数值 NaN**，违反 `string` 契约

| 项 | 内容 |
|---|---|
| 输入 | `NaN` / `1.5` / `undefined` |
| 期望 | `'—'`（kit 既有约定：`nayinOf('XX')`/`changShengOf('X','子')`/`liuShenOf('X',0)` 都回落 `'—'`） |
| 修复前实测 | **数值 `NaN`**（`typeof === 'number'`）；成因 `GAN[NaN] + ZHI[NaN]`，两个 `undefined` 相加得数值 NaN |
| 修复后 | `NaN`/`1.5`/`undefined` → `'—'`；`(-1)`→`'癸亥'`、`(7)`→`'辛未'`、`(60)`→`'甲子'` ✓ **已加回归锁** |
| 补充（Lead 指出我给的修法不完整） | 我建议的 `!Number.isFinite(i)` **不足以**覆盖 `ganzhiOf(1.5)`（`i` 有限但非整数）；Lead 补成 `!Number.isFinite(i) \|\| !Number.isInteger(i)` —— 这是本轮**唯一一处我的修法被修正**的地方，已记；我的测试现在同时锁 `1.5 → '—'` |
| 严重度 | 低–中 |

### R4 · `makeOutcome`：`detail` 非对象**原样透传**

| 项 | 内容 |
|---|---|
| 输入 | `makeOutcome({ detail: 'oops' })` / `makeOutcome({ detail: [] })` |
| 期望 | 回落普通对象 `{}`（契约 §2.4 要求 detail 为非空对象） |
| 修复前实测 | 原样返回字符串 `'oops'` / 空数组 `[]` |
| 依据 | `format.renderDetail` 对字符串做 `Object.entries('oops')` 会**逐字符渲染**（不崩但输出难看）；数组能通过 `typeof === 'object'` 检查，只靠 smoke 的 `Object.keys().length` 才拦住 |
| 修复后 | 两例均回落 `{}`（**普通原型**、非数组；正常对象仍原样保留）✓ **已加回归锁**（3 条断言） |
| 严重度 | 低 |

### R5 · `makeOutcome`：`timing` 纯空白串被当作有效应期

| 项 | 内容 |
|---|---|
| 输入 | `makeOutcome({ timing: ' ' })` |
| 期望 | `null` |
| 修复前实测 | `' '`（只判 `length > 0`，未 trim） |
| 依据 | 应期会被聚合器按字符串合并计数，空白串参与共识是噪声 |
| 修复后 | `null` ✓ **已加回归锁** |
| 严重度 | 低 |

### R6 · 「力量」两套映射不成比例

| 项 | 内容 |
|---|---|
| 函数 | `wangShuai().score/100` vs `STRENGTH_FACTOR`（经 `strengthOf`） |
| 修复前 | 旺 1.00/1.00、相 0.75/0.75 一致；休 **0.40/0.50**、囚 **0.25/0.30**、死 **0.10/0.15** —— 休囚死三档后者系统性偏高 |
| 期望 | 两套口径一致（同一状态给出同一力量） |
| 依据 | 两者都是「旺相休囚死 → 力量」的公开映射且都在 kit 导出；同一法门若一处按 score 差、一处按 factor 乘会引入不一致权重 |
| 修复后 | `STRENGTH_FACTOR = {旺:1, 相:0.75, 休:0.4, 囚:0.25, 死:0.1}`，与 `score/100` **五档完全一致**（Lead 并在注释写明「本表必须与 wangShuai 一一对应」）✓ **已加回归锁** |
| 严重度 | 中（口径漂移） |

### R7 · `makeOutcome`：非有限分数被静默夹成 0 而**不留痕**

| 项 | 内容 |
|---|---|
| 输入 | `makeOutcome({ score: NaN })` / `{ score: Infinity }` / `{ score: -Infinity }` |
| 期望 | 分数仍为 `0`（中性兜底），但**审计可发现**「本该报错却被夹成中立票」 |
| 修复前实测 | `score === 0`，`detail === {}`（完全静默） |
| 依据 | 我在报告中给出三选一口径 (a) 维持静默 (b) 抛错 (c) 非有限→0 **但留痕**；v2 runner 已在调用前拦非有限分数，故 (c) 既不破坏链路又保住可审计性。Lead 采纳 (c) |
| 修复后 | `score === 0` 且 `detail.__scoreInvalid === true`；**合法分数不带该键**（不误标）✓ **已加回归锁**（4 条断言） |
| 严重度 | 中（可观测性） |

---

## 3. 现存 WARN（14 项：边界/口径观察，无需修）

> 均为「按契约不违规、但值得知情」的行为；已逐条写进测试输出，便于后人检索。

### 3.1 `makeOutcome` 的不校验面（5 项）

| # | 观察 | 实测 | 说明 |
|---|---|---|---|
| W1 | `score: ±Infinity` 语义 | → `0`（**不是 ±100**），已带 `__scoreInvalid` | `clamp` 用 `Number.isFinite(n) ? n : 0`，非有限值一律归零 → 语义是「无效即中立」而非「极大」。已留痕，属可用口径，记录以便调用方知晓 |
| W2 | `verdict` 与 `score` 矛盾 | `{score:0, verdict:'大吉'}` → `'大吉'`（原样信任） | 只要 `verdict` 是七档之一就原样保留，**不校验** `verdictOf(score)`。契约 §2.4「不许自己造等级字符串」目前只由 smoke 断言把守。**唯一仍建议修的一项**：无条件以 `verdictOf(score)` 覆盖，或对矛盾输入抛错 |
| W3 | `essence` 缺失 | → `''` | 只做「非字符串→空串」，不保证非空（契约 §2.4 要求非空）。由 smoke 兜住 |
| W4 | `wuxing: { 木: true }` | → `1` | `Number(true) === 1` 被接受；类型不严，实际无风险 |
| W5 | `fidelity: 'bogus'` | → `'core'` | 静默回落（既不抛也不标 `approx`）；runner 传的是注册表校验过的值，故当前无风险，但方法层写错字会被吞掉 |

### 3.2 数值/边界（4 项）

| # | 观察 | 实测 | 说明 |
|---|---|---|---|
| W6 | `verdictOf(NaN)` | → `'平'` | 与 `clamp` 把 NaN 当 0 同源。不抛，且落在七档内 |
| W7 | `mod(n, 0)` | → `NaN`（不抛） | kit 内部模数都是常量（60/12/10），无风险 |
| W8 | `truncate(s, 0)` | → `"ab…"`（长度 3 > 0） | `slice(0,-1)+'…'` 在 n=0 时反而变长；实际调用只用 60/34 等正数 |
| W9 | `below()` 取模偏差 | 最大相对偏差 `n=6/7/12: 9.31e-8%`、`n=60: 3.73e-7%` | 量级 1e-8，对术数用途完全可忽略。**不建议为它改 `makeRand`**（会破坏所有历史 seed） |

### 3.3 口径与用字（5 项）

| # | 观察 | 说明 |
|---|---|---|
| W10 | `weightedScore`（v1）与 `weightedMean`（v2）**同名不同义** | 缺省权重 `10` vs `0`；`weight=NaN` `10` vs `0`；超界值 `100` vs `1e9`。前者「非有限权重当 1 且分数夹 ±100」，后者「非有限权重当 0（跳过）且不夹取」。建议注释写明适用域（前者专用于 -100..100 评分，后者为通用统计），或统一语义 |
| W11 | `signAgreement` 近零对 | `[{−0.4},{0.4}]` → `1`：两者四舍五入为 `±0`，而 JS 中 `-0 === 0` 为 `true` → 走「同号」分支，未走注释里「任一方为平按半分」。两者都属「平」，语义影响极小 |
| W12 | `evidenceDigest(nodes, max=0)` | → `''`（静默丢弃全部证据行）；`max` 无下界保护，建议 `clamp(max,1,∞)`；默认 4 条/上限/过滤假值/拼接均已验证正确 |
| W13 | 纳音异体字「砂↔沙」 | `甲午/乙未 = 砂中金`（vendor 作「沙中金」）、`丙辰/丁巳 = 沙中土` —— **kit 自身两处用字不一致**。属用字差异非数据错误；建议统一以便检索与第三方对拍（对拍时已做 `砂→沙` 归一） |
| W14 | `changshengOf` 的**土之流派** | `CHANGSHENG_START` 取「火土同宫」（戊长生寅、己长生酉），与 vendor lunar-javascript **一致**；spec §D4 提到「水土同宫」（土长生申）为另一派且列【D·存疑】。kit 选火土同宫＝子平主流，属**流派选择**，建议在注释点明 |

---

## 4. 逐导出结论一览

| 导出 | 样本量 | 结论 |
|---|---|---|
| `ganzhiOf` | 360 | ✅ 数值正确；R3 已修（非法入参 → `'—'`） |
| `xunOf` | 60 | ✅ 全对（含 5 条独立必要性条件，修复完备） |
| `changshengOf` | 120 | ✅ 与第三方闭式一致 + 十干禄不变量；W15 流派记录 |
| `nayinOf` | 60 | ✅ 正确；W14 用字 |
| `liuShenOf` | 60 | ✅ 全对 |
| `tenGodOf` | 100 | ✅ 全对（含完备性、阴阳配对双向） |
| `cangGanGods` | 24 | ✅ 全对 |
| `shenShaOf` | 48 | ✅ 全对（独立推导 + 口诀 + 跨表） |
| `relation` | 25 | ✅ 全对（含互逆闭环） |
| `relationScore` | 25+bias | ✅ 全对 |
| `wangShuai` | 25 | ✅ 全对（双射 + 独立重算） |
| `verdictOf` | 401 | ✅ 全对（对称分档）；W7 NaN |
| `clamp` / `mod` / `truncate` / `weightedScore` | 边界 | ✅ 边界明确；W8/W9/W12 |
| `makeRand` / `hash32` | 6 锁 + 60 万抽样 | ✅ 值域/确定性/均匀（4 档卡方全过）/2 万串无碰撞；W10 |
| `makeOutcome` | 全边界 | ✅ 规范化正确（含 R1/R4/R5 修复）；W1–W6 为**不校验/静默**类边界 |
| `median` / `trimmedMean` / `quantile` | 网格 + 154 组合 | ✅ R2 已修（非数组 → 0） |
| `weightedMean` / `weightedStd` | 随机 200 组 | ✅ 无 NaN；W12/`mean` 参数为调用方责任 |
| `signAgreement` | 随机 300 组 | ✅ ∈[0,1]；W13 |
| `norm360` / `angleGap` / `signIndexOf` | 14400 组合 | ✅ 全对（非有限输入静默归 0） |
| `strengthOf` / `STRENGTH_FACTOR` | 5 | ✅ 单调；R6 已修（与 `wangShuai` 五档一致） |
| `evidence` / `evidenceDigest` | 边界 | ✅ 形状正确；W11 `max=0` |
| 常量表（GAN/ZHI/WUXING*/LIUHE/LIUCHONG/SANHE/SANHUI/XIANGHAI/CANGGAN/CHANGSHENG/NAYIN/XUNKONG/VERDICT_*/DEG/WUXING_COLOR/SHENSHA） | 交叉不变量 | ✅ 全部自洽 |

**未覆盖 / 明确不覆盖**（诚实声明）：
1. 未做**统计学强度检验**（xorshift32 的谱检验 / birthday spacings）——超出本任务范围；只做值域、确定性、4 档卡方与 32 位比特均衡。
2. 未实测**周期长度**（xorshift32 理论 2³²−1，实测需 40 亿次抽样，不划算）。
3. `XIU28` 心/翼 与通书歌诀冲突 —— 任务明示**已裁决，不需上报**，故未复核。
4. `WUYUN` / `LIUQI_SITIAN` / `ZIWEI_*` / `TEN_GODS` 等**跨族数据表**属 kernel-tables 的溯源范围（`docs/verification/tables-provenance.md`）；本文件只验 kit 内的口径表。

---

## 5. 复现命令

```powershell
cd D:\DSH\plugins\dsh-divination-108
node test/v2-kit-exhaustive.mjs                                  # 全部断言（PASS 221 / WARN 14 / FAIL 0）
node test/v2-kit-exhaustive.mjs 2>&1 | Select-String 'FAIL'      # 只看失败（当前为空）

# 7 项回归锁的最小复现（任一回退即失败）
node -e "import('./src/core/kit.js').then(K=>{const o=K.makeOutcome;
console.log('R1 keys 去重:',JSON.stringify(o({keys:['财','财','财']}).keys));
console.log('R2 非数组:',K.median(123),K.trimmedMean({}),K.quantile(123,.5));
console.log('R3 ganzhiOf:',typeof K.ganzhiOf(NaN),String(K.ganzhiOf(NaN)));
console.log('R4 detail:',JSON.stringify(o({detail:'oops'}).detail),JSON.stringify(o({detail:[]}).detail));
console.log('R5 timing:',JSON.stringify(o({timing:' '}).timing));
console.log('R6 力量:',JSON.stringify(K.STRENGTH_FACTOR),['木','火','水','金','土'].map(w=>K.wangShuai(w,'木').score/100).join(','))})"
```

`makeRand` **序列锁**：6 个种子（`'lock-1'`/`'lock-2'`/`'divination-108'`/`0`/`1`/`12345`）各锁前 8 个 `int()` 输出。
任何改动 `makeRand`/`hash32` 实现都会让断言失败——**那是「报告」信号，不是「改锁」信号**。

本文件与已冻结的四个测试文件**无重叠**：`validate-preset`/`smoke`/`host`/`client` 测端到端契约，
本文件只测 `kit.js` 的纯函数与数据表，且**不修改任何既有文件**。

---

## 6. 移交

- **0 项待修**：6 项已由 Lead 修复并加了回归锁；15 项 WARN 属可选优化，建议按 W1（NaN 口径裁决）→ W3（`verdict` 不校验）→ W12（两函数语义）顺序处理。
- **回归保护**：`makeRand` 序列锁 + 6 项修复回归锁 + Lead 在 smoke 里加的 60 甲子旬空断言 —— 三重保险。
- 本任务只新增 `test/v2-kit-exhaustive.mjs` 与 `docs/verification/kit-exhaustive.md` 两个文件，未触碰 `src/**` 任何文件（写作用域实测一致）。
