# 随机性口径变更 + 经纬度链路（task-20）

> Owner：kernel-astro ｜ 触发：用户 2026-02 直接更正（规格级）
> 涉及文件：`src/core/calendar.js`、`src/index.js`、`lib/client.js`、`test/smoke.mjs`、`test/host.mjs`、`test/v2-crosscheck.mjs`、`skills/108-divination/SKILL.md`、`docs/V2-CONTRACT.md`
> 未动：`src/core/aggregate.js`、`src/methods/**`、`src/core/tables.js`（task-19）、`src/core/format.js`、`cordis.patch.yml`（冻结）

---

## 一、更正 A：随机性口径（**默认真随机**）

### 1.1 用户原话与旧口径的问题

> 「同一人也可能因为当前心诚不诚意不一样，所以**根本不需要限制一致性**」

- **旧口径（已废）**：`seedBase = question|when|longitude` 派生 → 同问同刻**必然**同结果，且被当成无条件硬约束来验收。
- **问题**：术法里「心诚」是变量；把一致性做成硬承诺，等于用实现细节否定了术法本身的性质。

### 1.2 新口径（最终写法）

| 模式 | 触发 | 行为 | 自证字段 |
|---|---|---|---|
| **随机模式（默认）** | 未传 `seed` | `seedBase = rnd-<crypto.randomUUID()>`，每次调用取一次 **OS/加密熵**；同问同刻重复求占**允许不同** | `meta.mode='random'`、`meta.seedUsed`、`meta.modeNote` |
| **seed 复现模式** | 显式传 `seed` | `seedBase = 用户传入的 seed`；同问同刻 + 同 seed **必得同一结果** | `meta.mode='seed'`、`meta.seedUsed`、`meta.modeNote` |

**未改动的部分（刻意保留）**：

1. 各法种子派生方式不变：`runner.js` 仍用 `makeRand(`${chart.seedBase}|${entry.id}`)` —— 即 seed 模式下"问题+时刻+经度+法号"的派生链完整保留（任务书第 2 条：**沿用、不要删**）。
2. **术法层纪律不变**：每个引擎只准用注入的 `rand`、禁止 `Math.random()`（这是管线纪律，与种子来源无关）。`v2-crosscheck` 的代理 rand 计数器逐法验证仍然有效。
3. 契约 §2.3「换问题 → 至少 30 法改变」保留（见 3.3 C 类）。

### 1.3 模式自证位置

- `chart.meta.mode` / `.seedUsed` / `.modeNote`（`src/core/calendar.js`）
- `record.mode` / `.seed` / `.modeNote`（`src/index.js` 的 `runDivine`）
- **判词简报**新增一行：`模式：随机模式（真随机源；seedUsed=…）→ 同问同刻重复求占允许不同，属正常` 或 `模式：seed 复现模式（seed=…）` —— 模型直接读到，故不会向用户承诺错的口径
- 工具描述（`src/index.js` 两处）与 `INTERPRET_SYSTEM` 条款 14 同步

---

## 二、更正 B：经纬度按用户当前位置

### 2.1 链路

```
浏览器（lib/client.js · currentLongitude()）
  navigator.geolocation.getCurrentPosition({timeout:8000, maximumAge:600000})
        │  成功 → { longitude, from: '用户当前位置（浏览器定位，精度约 N 米）' }
        │  失败 → { longitude: undefined, from: '未取到位置（原因），未做真太阳时校正' }
        ▼
起卦请求 body：{ question, format, longitude, longitudeFrom }      ← kind=run（本地起卦）
             { question, provider, model, effort, web, longitude, longitudeFrom }  ← kind=agent（模型起卦）
        ▼
宿主（src/index.js）
  · kind=run：body 直接透传 runDivine → toChartInput → buildChart
  · kind=agent：把经度与来源**注入本轮首条用户消息**（geoHint），要求模型调用 divine 时原样带上；
               取不到时明确写「不要填 longitude，也不要猜一个顶替」
        ▼
chart.position = { longitude, from, corrected, note }
  · 有经度：`经度 116.4（来源：用户当前位置…）→ 已做真太阳时校正：经度差 −14.4′ 均时差 +10.0′`
  · 无经度：`未提供经度（来源：未提供）→ **未做真太阳时校正**，四柱用平太阳时`
        ▼
记录 + 判词简报各一行「位置：…」 → 模型与用户都能看到"经度来源 + 是否校正"
```

### 2.2 降级路径（**不臆造**）

| 情形 | `longitudeFrom` | 结果 |
|---|---|---|
| 面板定位成功 | `用户当前位置（浏览器定位，精度约 N 米）` | 做真太阳时校正 |
| 用户拒绝授权 | `未取到位置（用户拒绝授权），未做真太阳时校正` | 不校正，如实标注 |
| 定位超时 / 不可用 / 环境无 `navigator` | `未取到位置（定位超时／定位不可用／当前环境不支持浏览器定位），未做真太阳时校正` | 同上 |
| 用户手动给地点 | `手动指定（未说明来源）` 或工具传入的说明 | 做校正 |
| 未提供 | `未提供` | 同上 |

- 宿主对 `kind=agent` 的注入里写明「**不要**用手机号/城市名等猜一个顶替」。
- Lead 已端到端实测：给经度+来源 → `solarTrue` 提前 4.437 分、来源「用户当前位置」；未给 → 只算均时差 +9.963 分、来源「未提供」。

### 2.3 可复现验证方式

```powershell
cd D:\DSH\plugins\dsh-divination-108
# ① 面板请求体会带经纬度字段（client 测试里可断言 body 形状）
node -e "const s=require('fs').readFileSync('lib/client.js','utf8');console.log('采集函数:', /async function currentLongitude/.test(s), '| 两处 body 都带 longitudeFrom:', (s.match(/longitudeFrom: geo\.from/g)||[]).length)"
# → 采集函数: true | 两处 body 都带 longitudeFrom: 2

# ② 宿主侧口径可见（有经度 / 无经度两种）
node -e "import('./src/core/calendar.js').then(({buildChart})=>{const a=buildChart({question:'q',when:new Date(2026,8,30,14,30),longitude:116.4,longitudeFrom:'用户当前位置（浏览器定位）'});const b=buildChart({question:'q',when:new Date(2026,8,30,14,30)});console.log('有经度:',a.position.note);console.log('无经度:',b.position.note)})"
```

---

## 三、口径变更对验收网的影响（**断言 A/B/C/D 分类改造清单**）

> 这是本文件最关键的一节：**证明回绿靠的是"断言跟着口径改对"，不是放水**。
> 每类都给出"改前 → 改后"，以及 **"什么错误实现会被这条断言抓住"**。

| 类 | 断言目的 | 应在哪个模式 | 本次改法 | 判别力（错误实现会怎样失败） |
|---|---|---|---|---|
| **A 一致性** | 管线可复现 | **seed 模式**（显式同 seed） | 「同问同刻 → 结果完全一致」→「**seed 模式下** 同问同刻 + 同 seed → 结果完全一致」 | 若种子派生被弄坏（如误把 `solarDate` 等派生量并入种子、或 `seed` 入参被忽略），两次调用会不同 → 必挂 |
| **B 抽到不同的随机** | 该随机的法真的在抽 | **默认随机模式** | 新增：同问重复 **N=20** 次，断言**结果种类 ≥2** | **写死常数 / 忽略 rand 的实现** 20 次全同 → 必挂。实测种类数：#1 19、#2 20、#90 7（空间仅 10 种）、#107 20、#108 18 |
| **C 换问题→多数法改变** | 随机源随每次调用重抽 | **默认随机模式** | 旧「换问题 → ≥30 法改变」在**随机模式**下取 **5 轮均值** | 冻结/常数实现改变数 = 0 → 必挂。实测 5 轮：40、41、41、41、42（均值 41），阈值 **30** 依"实测最小 40"留 10 余量定；**同 seed 换问题实测仅 9 → 故断言绝不能放 seed 模式** |
| **D 历法/择时不变性** | `#59/60/61/62/69`（及择时族）不得被随机污染 | **两模式都测** | 保留原语义，并在**默认随机模式**下加强为"5 次重复逐字相同" | 被 `rand` 污染的实现会出现多种结果 → 必挂。实测 5 次重复种类数均为 1 |

### 逐条改动清单（smoke / host / v2-crosscheck / v2-audit）

| # | 文件 | 改前 | 改后 | 类 | 理由 |
|---|---|---|---|---|---|
| 1 | smoke §5 | `同问同刻 → 结果完全一致` | `seed 模式下 同问同刻 + 同 seed → 结果完全一致` | A | 默认随机后原断言语义不成立；可复现性只在 seed 下承诺 |
| 2 | smoke §5 | （无） | 新增 `默认随机模式下 同问同刻重复求占 允许不同（且确实出现过不同）` | A′ | 反向锁定"默认真随机确实生效" |
| 3 | smoke §5 | （无） | 新增 `随机模式自证 / seed 模式自证`（`meta.mode`/`seedUsed`/`modeNote`） | A′ | 模式必须对模型与用户可见 |
| 4 | smoke §5 | `随机类 #N 随问题改变`（同问两次比） | `随机类 #N 在 20 次重复中确实出现多种结果（真随机）` | **B** | 真随机下两次撞车正常（#90 仅 10 种结果）；改统计型后**常数实现 20 次全同 → 必挂** |
| 5 | smoke §5 | `历法类 #N 不随问题改变` | `历法类 #N 在 5 次随机模式重复中逐字相同（未被随机污染）` | **D** | 新判据直接测"有没有被 rand 污染"，比"换问题不变"更贴近意图 |
| 6 | smoke §5 | `换问题 → 相当比例的法结果改变`（确定性口径） | 同名，改在**随机模式**下测（5 轮） | **C** | seed 模式下同 seed 换问题只变 9 法（正确行为），放那里必然误报 |
| 7 | host §3 | `同问同刻结果一致（除编号行）`（r4 vs r1） | `seed 模式下 同问同刻同输入 → 同文本（除编号行）`（r4 vs r4b，均带 `seed`）+ 新增「默认随机模式 3 次允许不同」 | A + A′ | 同上 |
| 8 | v2-crosscheck L6 | 全部探测无 seed（默认确定性） | 分类矩阵统一带 `seed:'xcheck-fixed-seed'`；新增 `R()` 随机模式入口 | A | 分类/轴扰动需要可复现基线才有意义 |
| 9 | v2-crosscheck L6 | `分类自洽：rand 类必须随问变` | **撤销**，改为 B 类（39 法 ×20 次 ≥2 种）+ C 类（5 轮 ≥30） | **B/C** | 该断言在 seed 模式下必然误报（实测 0/39）；撤销后由更强的 B+C 承担 |
| 10 | v2-crosscheck L6 | （无） | 新增 B 类（39 法）、D 类（择时族 14 法）统计断言 | B/D | 见上表 |
| 11 | v2-audit | 同问两次 `key` 必须一致 | A 类（带 seed）+ B 类（5 次≥2 种） | A/B | 由 Lead 同法改造，`audit exit=0` 且两端 0 异常 |

### 撤销的两条旧断言（**有判别力替代，不是删掉**）

- **`rand 类必须随问变`**：在 seed 模式下同 seed 换问题**本就不该**改变随机序列 —— 实测该判据把 **39 个 rand 法整批误报**（`v2-crosscheck` 第四轮「开放问题 1 条」）。**独立佐证无真缺陷**：B 类显示 39/39 个 rand 法在 20 次重复中都出现 ≥2 种结果，即**无一法"吞随机"**。已撤销并降级为误报记录（台账 R4-1）。
- **`换问题（同 seed）→ 相当比例改变`**：实测只变 9/108（读问句文本的法），**正确行为**。已挪到随机模式（台账 R4-2）。

---

## 四、遗留风险与未做项（如实记录）

1. **`meta.mode` 依赖调用方自觉**：若某个调用点绕过 `toChartInput` 直接 `buildChart` 且不传 `seed`，就得到随机模式 —— 这是设计意图，但意味着"复现"必须由调用方保存 `seedUsed`。已在简报与工具描述里要求把 `seed` 告诉用户。
2. **`randomUUID()` 是加密熵但非"占卜仪式熵"**：用户若期望"以心念/外应为熵源"，当前实现并不采集（无法采集）。属实现边界，未冒充。
3. **B 类对结果空间极小的法是概率性判据**：#90 掷筊 10 种结果，20 次全同概率 ≈ (1/10)^19 ≈ 0，实践上不会误报；但若将来某法结果空间 ≤2，需下调 N 或改用固定 seed 对照。
4. **面板定位的精度与隐私**：`enableHighAccuracy:false` + `maximumAge:600000`（10 分钟缓存）刻意降低精度与打扰；只取经度用于真太阳时，纬度不采集不存储。用户拒绝则完全降级。
5. **未做**：把"经度来源"写进 `format.js` 的渲染（该文件冻结）；改由记录与判词简报承载，输出侧仍能看到。
6. **旧会话的可复现性**：口径变更后，旧会话记录里的 `seed` 仍可用于复现（`seed` 入参与派生链未改）——但**只有记录里存了 `seed` 的那些**（本版已把 `seedUsed` 写进每条记录）。

---

## 五、验证

```powershell
cd D:\DSH\plugins\dsh-divination-108
node test/smoke.mjs            # 86/86（原 83 + A′/B/D 新增）
node test/host.mjs             # 173/173
node test/client.mjs           # 70/70
node test/validate-preset.mjs  # 46/46
node test/v2-crosscheck.mjs    # 100554 项次 / 不一致 0 / 开放问题 0
node test/v2-calendar-check.mjs# 7/7
node D:\DSH\tmp\threshold-measure.mjs   # 阈值实测依据（B/C/D 三类的分布数据）
node D:\DSH\tmp\tool-text-probe.mjs     # 工具文本口径自证（见 §六）
```

## 六、工具文本自证（task-22 A：`位置` / `模式` 两行必须到模型眼前）

**问题**：这两行原先只在 `buildBoardBrief()`（服务于面板「AI 综合判词」）里；而**对话路径**——模型直接调 `divine` ——
拿到的是 `runDivine()` 里的 `` `【求占 #N】\n` + render({...}) ``，`render` 来自**冻结的** `src/core/format.js`。
所以工具描述承诺的"记下 seed 即可复现""取不到经度会如实标注"当时**没到模型眼前**。

**修法**（只动 `src/index.js`）：把两行构造抽成 `positionLine(record)` / `modeLine(record)`，
**判词简报与工具文本共用同一份文案**（防漂移、不写第二份）；工具文本改为：

```js
const text = `【求占 #${record.id}】\n${positionLine(record)}\n${modeLine(record)}\n`
  + render({ board, results, mode, detailNos })
```

**实测自证**（`node D:\DSH\tmp\tool-text-probe.mjs`，复用 host.mjs 的共享依赖桩）：

| 情形 | 实际文本（首两行，节选） |
|---|---|
| ① 默认档 · 有经度 | `位置：经度 116.4（来源：用户当前位置（浏览器定位，精度约 35 米））→ 已做真太阳时校正：经度差 -14.4′ 均时差 +10.0′`<br>`模式：随机模式（真随机源；seedUsed=rnd-1cfb5ee8-…）→ **同问同刻重复求占允许不同，属正常**；记下 seedUsed 并回传 seed 才能复现本次结果` |
| ② 默认档 · 无经度 | `位置：未提供经度（来源：未提供）→ **未做真太阳时校正**，四柱用平太阳时` |
| ③ brief 档 · 有经度 | 同样带两行（默认与 brief 口径一致） |
| ④ seed 复现模式 | `模式：seed 复现模式（seed=demo-seed-123）→ 同问同刻 + 同 seed 必得同一结果` |

探针 5 条断言全过：默认档两行齐 / 无经度如实标注 / brief 档两行齐 / seed 模式自证 / 随机模式给出 seedUsed。

> 另一处尾巴（task-22 B）：`package.json` 的 `_uiPanelNote` 原描述旧面板（三档控件常驻 + 判词置顶），
> 已更新为懒人化版；`dsh` / `files` / `scripts` / `exports` / 版本号**未动**（已用 `require('./package.json')` 逐字段核对）。
