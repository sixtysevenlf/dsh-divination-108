# dsh-divination-108 · V2 重写契约（冻结）

> **⚠ 依赖方向（2026-10-02 用户裁定，修订本文件旧表述）**
> **`skills/108-divination/SKILL.md` 是规格（spec），代码与本契约都跟着它走**，反过来不成立。
> 本文件早前把 `src/index.js` **整份**冻结（连里面的 `INTERPRET_SYSTEM` 判词骨架一起），那是 Lead 的范围判读失误——
> **方法论层（SKILL.md + INTERPRET_SYSTEM）已列入重写范围**（task-17 / task-18 / task-20 已完成）。
> §0 现只保留**真正的外部契约**，其余条款一律以 SKILL.md 为准。
> 分支 `rebuild/v2`，基线标签 `baseline-v1`（v1 全绿：46+82+172+62 = 362 项断言；v2 现为 **367**）。

> **两条口径更正（用户直接给出，覆盖本文件旧文字）**
> 1. **一致性不再被保证**：术法里「心诚」是变量——同一人同问同刻也可能不同。
>    现行口径 = **默认真随机**（同一人/不同人都允许不同）；**显式传 `seed` 才可复现**（供测试与复核），输出须**自证模式**。
>    旧文「同问同刻必得同一结果」**作废**。
> 2. **经纬度按用户当前位置算**：面板取位 → 宿主接收 → 真太阳时校正，并在输出注明**经度来源**与是否校正；
>    取不到位置时**如实降级**（只算均时差并标「未提供」），**不得臆造位置**。
>
> 验收网随之重建：把"确定性"断言拆成 **A 类（seed 模式）** 与 **B/C 类（默认模式统计断言）**，
> 每条给出判别力说明（错误实现会怎样失败），见 `docs/verification/querent-and-geo.md`。

---

## 0. 外部契约（唯一仍需保持的部分）

| 文件 | 为什么冻结 |
|---|---|
| `lib/client.js` 的**交互与渲染逻辑** | 面板逻辑（用户明确要求保留）；**唯一例外**：为「经纬度按当前位置算」新增的定位采集与传参 |
| `src/index.js` 的**工具名/参数/schema、`/占` 命令、面板端点** | 部署级调用契约（`host.mjs` 逐条断言）。**`INTERPRET_SYSTEM` 不在冻结之列**——已按 skill 重写 |
| `src/core/format.js` 的输出标记 | `108法合盘`/`合盘总断`/`108 法明细`/`应期`/`未起` 是模型与面板依赖的呈现契约；**新增字段只进 board 对象，不改 render** |
| `src/core/registry.js` 的 108 条**身份** | `no`/`id`/`name`/`cat`/`module`/`engine`/`need` 不许动；`weight`/`fidelity`/`params`/`note` 只有 Lead 能调 |
| `cordis.patch.yml`、`package.json` 的 `dsh`/`files`/`scripts` | 装配与发布契约 |
| `docs/research/**` | 只读输入 |
| `vendor/lunar.cjs` | 第三方库（lunar-javascript，含寿星天文历），不许改，只许调用 |

**测试文件**：`test/validate-preset.mjs`、`test/smoke.mjs`、`test/host.mjs`、`test/client.mjs` 默认视同冻结——
它们是验收标准。**不许为了让自己的代码过测而修改断言**；但当**规格本身变更**时（如本次"默认随机"口径更正），
断言必须随规格重建，且**须逐条说明"改前/改后/为什么改后仍有判别力"**——见 `querent-and-geo.md` 的 A/B/C/D 分类表。

---

## 1. 验收

```powershell
cd D:\DSH\plugins\dsh-divination-108
node test/validate-preset.mjs   # 46 项
node test/smoke.mjs             # 82 项
node test/host.mjs              # 172 项
node test/client.mjs            # 62 项
node test/v2-crosscheck.mjs     # v2 新增：与 oracle 对拍（verifier 负责）
```

底线数字（smoke 里的硬阈值，破坏即失败）：108 法全起、essence 去重 > 60 种、分数去重 > 20 种、
明细表 < 9000 字、完整输出 < 12000 字、每法 `detail` 非空对象。

---

## 2. 行为契约（逐条来自现有测试，**必须原样继承**）

### 2.1 历法 golden
- `2026-02-05 12:00` → 四柱年柱 `丙午`；`lunarYearGZ === '乙巳'`；`yearBoundarySplit === true`
- `2026-02-03 12:00` → 年柱 `乙巳`；`yearBoundarySplit === false`
- `LIUYAO['佛灭'] === LIUYAO['仏灭']`（异体字必须互为别名）

### 2.2 诚实降级（这批断言的价值最高，务必保住）
| 场景 | 要求 |
|---|---|
| `#95/96/97` 未报外应 | `essence` 以 `未报外应·取象：` 开头 **且** `fidelity === 'approx'` |
| `#96` 问题含「左眼跳」 | `essence` **不得**以 `未报外应` 开头（用户确实报了外应） |
| `#92/93` 未报字且无报数 | `essence` 以 `未报所测之字·取象：` 开头 |
| `#92` 有报数 | 不标取象，且 `JSON.stringify(detail)` 含 `报数` |
| `#93` 问题含「测字：明」 | `detail.所拆之字` 以 `明` 开头 |
| `#99` 未报姓名 | `JSON.stringify(detail)` **不得**含问句片段（如 `这次和`） |
| `#99` 问题含「我叫张伟」 | `JSON.stringify(detail)` 含 `张伟` |

原则：**没报的输入不许假装有**。缺数据就降 `approx` 并明说取象方式；宁可承认"未核实"，不许编。

### 2.3 随机性与复现纪律（**口径已于 2026-02 由用户更正**）
- **默认真随机**：未传 `seed` 时每次调用取一次 OS/加密熵（`crypto.randomUUID()`）；
  **同问同刻重复求占允许不同，这是正常的**（术法里「心诚」是变量）——**不再要求**"同问同刻必得同一结果"。
- **传 `seed` = 复现模式**：同问同刻 + 同 `seed` → 108 法结果**完全一致**（可复现性只在此模式下承诺）。
- 模式必须**自证**：`chart.meta.mode`（`random`/`seed`）、`meta.seedUsed`、`meta.modeNote`；
  并写进判词简报与工具描述（否则模型会向用户承诺错的口径）。
- 各法种子派生不变：`makeRand(`${seedBase}|${法号}`)`；术法层**仍只准用注入的 `rand`、禁止 `Math.random()`**。
- 换问题 → **随机模式下**平均改变 ≥30 法（实测 5 轮均值 41；seed 模式下同 seed 换问题只变 9 法，属正常）
- `#1 大衍` `#2 金钱卦` `#90 掷筊` `#107 塔罗` `#108 卢恩` **必须**真用 `rand`
  （判据：默认随机模式下同问重复 20 次出现 ≥2 种结果 —— 常数实现必挂）
- `#59 黄历` `#60 建除` `#61 二十八宿择日` `#62 黄黑道` `#69 六曜` **必须不**随问题改变，
  且**不得被随机污染**（判据：默认随机模式下同问重复 5 次逐字相同）
  → **择日族引擎签名里不接 `rand`，绝不许调用随机**
- 断言分类（A 一致性 / B 真随机 / C 换问多数变 / D 历法不变性）与阈值依据：
  `docs/verification/querent-and-geo.md` §三

### 2.4 outcome 合规
`score ∈ [-100,100]`、`verdict === verdictOf(score)`、`essence` 非空且 ≤60 字、`keys` ≤6 个、
`detail` 为非空对象、`wuxing` 五键均为有限数。**不许自己造等级字符串**（走 `kit.verdictOf`）。

### 2.5 问题归类 golden
`我跟他还有姻缘吗`→姻缘、`这笔投资能不能赚钱`→财运、`这个病能不能好`→健康、`嗯`→综合。

---

## 3. 模块接口（冻结）

### 3.1 Chart（`src/core/calendar.js` 产出）——**只能加字段，不能删/改名**

必须保留（v1 全集，方法层依赖）：`question` `when` `solarDate` `longitude` `solarNote` `gender`
`numbers` `coins` `seedBase` `solar{y,m,d,h,mi,weekday,text}` `lunar{year,month,day,text,monthName,dayName,season}`
`ganzhi{year,month,day,hour}` `lunarYearGZ` `lunarYearZhi` `yearBoundarySplit` `pillars` `pillarDetail[]`
`dayGan` `dayZhi` `monthZhi` `yearZhi` `hourZhi` `dayMasterWx` `monthWx` `wuxing{木火土金水}` `birthChart`
`yun` `jieqi{prev,prevAt,next,nextAt,current,hou,wuhou}` `xun{name,kong}` `xunKong{day,time,year}`
`almanac{zhiXing,tianShen,tianShenType,tianShenLuck,xiu,xiuLuck,xiuSong,zheng,animal,nineStar,nineStarNum,
timeNineStar,yi,ji,jiShen,xiongSha,pengZuGan,pengZuZhi,liuYao,shou,positionXi,positionCai,positionTai,positionFu}`
`shensha{驿马,桃花,华盖,将星}`（**恰好 4 个键**，smoke 断言 `Object.keys().length === 4`）`meta{builtAt,hash}`

v2 **新增**（由 kernel-astro 实现，方法层可直接用）：
```js
chart.astro = {
  sunLon, moonLon,            // 视黄经（度）
  planets: { 水, 金, 火, 木, 土 },  // 地心视黄经（度）
  su28: { name, ruDu },       // 二十八宿 + 入宿度
  deltaT, eotMin,             // ΔT（秒）、均时差（分钟）
}
chart.solarTrue = { y, m, d, h, mi, text, offsetMin }   // 真太阳时
chart.renyuan = { gan, days, monthZhi }                 // 人元司令分野
chart.shenshaAll = { 神煞名: ['年','月','日','时'] }    // 完整神煞（≥20 种）
chart.dayBoundary = { lateZi: boolean, note }           // 晚子时/早子时归属
```

### 3.2 方法模块契约（`test/smoke.mjs` → `runner.js` 调用）
```js
export const engines = {
  engineName(chart, entry, rand) {
    return { score, essence, keys, wuxing, timing, detail, fidelity }
  },
}
```
- **纯函数**：不读时钟/文件/网络，不写全局状态
- **不得抛异常**：确实无法算 → `return null`（runner 记为「未起」）
- **确定性**：一切随机走 `rand`，禁止 `Math.random()`
- `timing`：应期信号字符串（同一字符串会被聚合器合并计数，**措辞要稳定**）
- `keys`：共识关键词，聚合器统计 ≥3 法同现；**同族内不要所有法都吐同一批 key**
- v2 新增信息**一律塞进 `detail`**（`detail.cite`、`detail.evidence`、`detail.rule`…），
  因为 `detail` 是自由对象、`format.js` 已渲染它，不需要改任何冻结文件。

### 3.3 聚合输出（`src/core/aggregate.js`，Lead 独占）
v1 字段全保留：`meta{question,topic,topicHits,when,pillars,lunar,count,computed,skipped,skippedList,fidelityTally}`
`overall{score,verdict,consistency,confidence,coverage}` `tally` `polarity` `wuxing` `dominant` `lacking`
`consensusKeys` `timing` `byCategory` `conflicts` `top` `bottom` `advice`。
v2 只许追加：`meta.agreement`、`divergence`、`schools`、`evidenceDigest`。

---

## 4. 溯源纪律（硬要求，违反即返工）

1. **任何数值表、常数、公式系数都必须带出处注释**：
   ```js
   // cite: 《增删卜易·卷首》纳甲例 / https://github.com/sylarlight/iztro@2.6.1 lib/data/...
   export const NAJIA = { ... }
   ```
2. **严禁凭记忆编造常量**。不确定就留 `null` 并在 `detail` 里标 `未核实`，`fidelity` 降到 `approx`。
3. 新增第三方代码**只能放 `vendor/`**，必须同时附 `vendor/<name>.LICENSE` 与来源 URL + 版本号。
4. 运行时**不得**引入网络依赖。
5. 辞书类（签诗原文、爻辞、易林辞、铁板神数条文）**没有可靠来源就不要伪造**，保持"结构性断语 + ⚠"。

---

## 5. 写作用域（一人一文，越界即冲突）

| Owner | 独占文件 |
|---|---|
| Lead | `src/core/kit.js`、`src/core/aggregate.js`、`src/core/runner.js`、`src/core/registry.js`、`docs/V2-CONTRACT.md` |
| kernel-astro | `src/core/astro.js`(新)、`src/core/calendar.js`、`vendor/astronomy.cjs` + `vendor/astronomy-engine.LICENSE` |
| kernel-tables | `src/core/tables.js` |
| m-yijing | `src/methods/yijing.js` |
| m-sanshi | `src/methods/sanshi.js` |
| m-mingli | `src/methods/mingli.js` |
| m-zeri | `src/methods/zeri.js` |
| m-fengshui | `src/methods/fengshui.js`、`src/methods/xiangxing.js` |
| m-zhanbu | `src/methods/zhanbu.js`、`src/methods/western.js` |
| verifier | `test/v2-crosscheck.mjs`、`docs/verification/**` |

**表放哪儿**：跨族共用表 → `src/core/tables.js`（kernel-tables 独占，别人**不许改**）；
族内专用表 → 该族自己的 `src/methods/<family>.js` 顶部。需要新增跨族表 → 在共享任务板开条子找 kernel-tables。

---

## 6. 对拍 oracle（开发期专用，**不发布**）

装好后位于 `D:\DSH\.divination-v2-deps\node_modules`：

| oracle | 用途 | 已验证结论（1990-05-12 09:30 CST） |
|---|---|---|
| `astronomy-engine@2` | 行星/太阳/月亮黄经、ΔT、恒星时 | 太阳 51.08°、木星 98.90°、土星 295.30°（与真实天象吻合） |
| `iztro@2` | 紫微斗数安星/四化/大限 | 命宫丑、身宫酉、火六局、命主巨门、身主火星 |
| `tyme4ts@1` | 历法/干支/节气/神煞（第二通路） | 入口可用；API 名需现场确认（`SolarTime` 上没有 `getSixtyCycleDay`） |
| `vendor/lunar.cjs` | 运行时历法底座，同时是**第三通路** | 已在用 |

在 test 脚本里用绝对路径动态 import，例如：
```js
const ORACLE = 'file:///D:/DSH/.divination-v2-deps/node_modules/iztro/lib/index.js'
```
**任何"我们比 oracle 更准"的改动都必须能被经典规则解释**，否则以 oracle 为准并标记分歧。

---

## 7. 分工与完成定义（DoD）

一个族的 DoD：
1. 该族全部引擎重写完毕，`node test/smoke.mjs` 仍全绿；
2. 每个引擎在 `detail` 里给出 `cite`（出处）与 `evidence`（依据链：用了哪条规则、取到什么值、推出什么分）；
3. 该族专属规则表带出处注释；
4. 随机/历法的确定性纪律符合 §2.3；
5. 向 Lead 回报：改了哪些法、保真度升降（`approx→core→full` 谁升级了、为什么）、遗留风险。

**保真度只许升不许偷偷降**：若某法从 `full` 降到 `approx`，必须在回报里点名说明原因。

---

## 8. 融合清单与 Lead 裁决记录（v2 期间追加）

调研产物：`docs/research/{mingli-spec,yijing-spec,misc-and-aggregation-spec}.md`（约 260KB，逐条附仓库+文件+行号+可信度分级）。
下列为**已采纳/明确不采纳**的裁决，避免决策散落在对话里丢失。

### 8.1 已采纳的设计（来自外部项目，只取思路与公开规则，不复制受限代码）

| 设计 | 来源 | 在本项目中的落点 |
|---|---|---|
| **确定性引擎 + 显式随机种子 + 可重放** | mingpan(Apache-2.0)、oraclebone(MIT) | `kit.makeRand`（xorshift32）+ `chart.seedBase` + `divine(seed=)`；本轮修成**锚定用户输入时刻**而非派生量 |
| **排盘只出事实、解读交给 AI** | mingpan | 全部 108 法在本地算完；工具只回传结果，`src/index.js` 只做编排 |
| **证据链 + 逐条出处** | ctw(MIT)、mingyu(AGPL，仅取语义) | 每法 `detail.cite`（经典篇名/URL@版本）+ `detail.evidence`（`{rule,value,effect}`）；聚合层出**出处账本** |
| **反幻觉可执行校验器** | ctw `claimContract.ts` | `test/v2-audit.mjs`：缺 cite/非有限分数/断语雷同/保真度降级 四类机器可判 |
| **保真度分级 + 主动声明未实现分支** | mingpan、liki | `full/core/approx` 三档 + `detail.未核实` 字段 + 输出 ⚠；诸本互异的表一律 `null + verified:'no'` 而非硬编 |
| **多法共识但**不把票数当独立证据 | mingyu「多数意见不构成独立证据」 | 见 8.2 裁决 1 |
| **八宫/世应生成式 + 穷举回归** | yijing-spec 独立推导 | m-yijing 用生成式实现，verifier 以 64 行表做 golden |
| **闰月/晚子时/年干口径分法门** | iztro(MIT)、mingpan | 紫微用农历年干、闰月半月论、晚子时归次日（对拍 200/200）；八字保留立春年；**口径写进 detail** |

### 8.2 Lead 裁决

1. **票型 vs 总断**（调研建议「票型降级为呈现指标、总断改用同源去重的共同事实」）
   → **部分采纳**。理由：票型是产品明确要求的呈现项（面板与工具描述均依赖），不能删；
   但**总断不再以票数为依据**：v2 聚合已改为「门内截尾均值 → 门间 √n 加权」，消除了
   "同一族 24 法共振 = 24 票"的结构性偏差；共识项按**跨门数**（`cats`/`fams`）排序，
   断语里报「×法/×门」，即在输出层暴露"这是几个独立来源"而非原始票数。
   完整的「共同事实（L2 路径回指）」模型**本轮不做**，记入后续项。
2. **票型字段的语义**：保留 `board.polarity`、`board.tally`、`board.overall.score` 等字段名与含义（输出契约冻结），
   新增 `board.divergence.familySkew` 作为"某族是否在绑架结论"的诊断量。
3. **分歧分级 D1–D5**（口径/尺度/取用/资料/真分歧）→ 本轮**不采纳**，记入后续项；
   当前 `board.conflicts` + `board.divergence` 已能表达"谁跟谁差多少"。
4. **应期不做加权平均** → 已**部分符合**：`board.timing` 报 `count`（多少法同指）与 `avg`（仅供参考），
   应期文本本身不做平均；结构化窗口经 `detail.timingWindow/timingLo/timingHi` 传递。
5. **术数时刻显式化**：外部项目要求"影响结果的日期不得隐式读取"。本插件**刻意偏离**——
   `divine` 的 `when` 缺省取机器当前时间（产品要求，写进工具描述）。但已保证：
   求占时刻进入 `chart`、`seedBase` 锚定它、`chart.meta.builtAt` 与 record 均留痕，
   即"缺省是当前时间，但结果可归因到确切时刻"。
6. **许可证红线**（调研实测：三个仓库**无 LICENSE**，AGPL 两处）
   → 明确**不复制**：`voidforall/fengshui.skill`、`FANzR-arch/Numerologist_skills`、`dungnotnull/Tarot-*`（均无许可证）；
   `Brhiza/mingyu`(AGPL-3.0) 只取其**方法论语义**、不抄代码；`hhszzzz/taibu` 双许可需按 package 归属判断。
   可复制：mingpan(Apache-2.0)、ctw/oraclebone/liu-he-xuan-ji(MIT)。第三方署名见 `NOTICE.md`。
7. **`XIU28` 心/翼 分值分歧**：`tables.UXI28_LUCK` 为单一权威，v1 `XIU28` 数值不动，冲突记入总验收报告。
8. **`tables.WUGE_81` vs v1 族内 `SHULI_81`（16 数档位不同）**：以 `tables.WUGE_81` 为单一权威，
   `xiangxing.js` 重写完成后由 Lead 做集成收口。
9. **晚子时**：各法保留各自流派，但**必须在输出里显式声明**（`chart.dayBoundary` + 各法 detail）；
   紫微归次日（对拍 iztro 验证），八字保留 v1 日柱流派。不做"全法统一切流派"。


