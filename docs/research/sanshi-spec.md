# 三式 + 择时 算法层重写前置调研

> 调研对象：9 个 GitHub 仓库的真实源码（非 README 宣称）。
> 调研方式：`codeload` 下载 main 分支 zip → 本地解包 → 逐文件阅读 / 定向检索。
> 快照时间：本次会话。所有引用均可通过 `https://raw.githubusercontent.com/<owner>/<repo>/main/<path>` 复核。

## 0. 可追溯性与保真度约定

本文所有规则表**均来自实际读到的源码片段**，并给出 `owner/repo` + `分支` + `文件路径` + `行号` + 片段。

- **未核实** = 我在本次调研中**没有读到**该表/该规则。**不代表它不存在**，只代表不能据此写码。
- **单源** = 只有 1 个仓库实现，无第二源交叉验证，落码前必须再查文献。
- **双源一致** = 2 个及以上**互相独立**的仓库给出同一表值（这是本文最强的证据等级）。
- 我**没有**从记忆补充任何表值。凡本文未给出表值的条目，一律是「未核实」。

### 仓库总判定（真算法 / 包装 / 无算法 + 许可证）

| # | 仓库 | ★ | 许可证 | 语言 | 判定 |
|---|---|---|---|---|---|
| 1 | Horace-Maxwell/horosa-skill | 431 | **AGPL-3.0** | Python + JS | **混合体**：MCP/CLI 编排层 + 内置 Python/Java 运行时。**奇门/太乙默认走第三方 Python 包**（kinqimen / kintaiyi），JS 侧 `DunJiaCalc.js` 是「非默认选项路由」的本地重写。**六壬/通书/黄历是纯 headless JS**。离线（无远程 HTTP 出网），但**算法是三方库**。 |
| 2 | ChesterRa/mingpan | 116 | **Apache-2.0** | TypeScript | **真算法**。纯本地计算（依赖 `lunar-javascript` + `iztro`），自带奇门 `src/core/qimen/` 与**完整大六壬** `src/services/daliuren/`，含自研高精度真太阳时与太阳黄经。可部署为 Cloudflare Worker（`wrangler.toml`）但算法本体在本地。**本批调研最高价值仓库之一。** |
| 3 | hxd0818/qimen-dunjia | 8 | 未核实（未见 LICENSE 文件） | Python | **真算法**。`scripts/qimen.py` 31.9KB，自述「算法：置闰法（正统拆补法）」。+ 8 篇格局/用神 markdown 作为 LLM 附加层。 |
| 4 | dglijin-oss/liuren-skill | 3 | 未核实 | JS | **简化版算法**（`index.js` 仅 7KB）。月将按**农历月**查表 → **与「中气过宫」不符**，属错误实现。仅可作反面教材。 |
| 5 | SpenserCai/qimen-rs | 2 | **MIT** | Rust | **真算法**。Cargo workspace，`crates/qimen-core`（engine/model/symbols）+ `crates/qimen-calendar`；历法依赖 `tyme4rs =1.5.0`。含 python/node/wasm bindings。 |
| 6 | banderzhm/ZhouYiLab | 131 | **MIT** | **C++23**（CMake + `import std;` 模块 + 3rdparty + `.gitmodules`） | **真算法，且质量最高之一**。`src/da_liu_ren/`（含**课体 `da_liu_ren_guati.cpp`、行年 `da_liu_ren_xing_nian.cpp`、神煞、类神、结构分析**）、`src/qi_men/`（`qi_men_pan.cpp` 时家转盘 + 格局 + 用神）、`src/common/time/true_solar_time.cpp`（**真太阳时**）、`src/common/tyme/shou_xing_ephemeris.cpp`（**寿星天文历星历**）、`src/common/tyme/tyme.cpp`（tyme 历法）。**本批调研第三高价值仓库。** |
| 7 | Sudo-Biao/Chinese-Metaphysics-Platform | 144 | 未核实（未见 LICENSE） | Python | **真算法（FastAPI 后端）**。依赖 `lunar_python` + `lunarcalendar` + `ephem` + `iztro-py`；有 `api/qimen.py`、`api/date_selection.py`、`api/fengshui.py`、`core/constants.py`(33.6KB 表)。**无大六壬、无太乙**。 |
| 8 | Enoch666/suanming-mcp | — | 未核实 | TypeScript | **与三式无关**。只有 `bazi/liuyao/qian/mingming/name/coder`，无奇门、无六壬、无择日。**别浪费时间。** |
| 9 | Riki-1124/bazi-ziwei-qimen-paipan-mcp | — | 未核实 | Python | **部分有用**：`engines/qimen.py`(16.7KB) 真算法；`engines/bazi.py`(46KB) 含真太阳时。 |

---

## A. 奇门遁甲（时家）

### A1 阴阳遁：按**节气名**，不是按冬至/夏至时刻

**双源一致**（horosa + mingpan，两份独立表）。

**源 1 — `Horace-Maxwell/horosa-skill` @ `main`**
`horosa-skill/horosa-core-js/src/vendor/dunjia/DunJiaCalc.js:384-385`
```js
const JIEQI_NAME = '春分清明谷雨立夏小满芒种夏至小暑大暑立秋处暑白露秋分寒露霜降立冬小雪大雪冬至小寒大寒立春雨水惊蛰'.match(/../g);
const YANG_JIEQI = newList(JIEQI_NAME, '冬至').slice(0, 12);
```
自「冬至」起顺数 12 个节气 = 阳遁，其余 12 个 = 阴遁。即 **冬至→芒种阳遁，夏至→大雪阴遁**，判据是**节气名**。

**源 2 — `ChesterRa/mingpan` @ `main`**
`src/core/qimen/YinYangDunCalculator.ts`
```ts
// 阳遁：冬至 -> 夏至前
// 阴遁：夏至 -> 冬至前
export const JIEQI_JU_MAP: Record<string, { dun: YinYangDun; ju: [JuShu, JuShu, JuShu] }> = {
```

> ⚠️ **重要分歧（horosa 内部）**：`DunJiaCalc.js:1114-1138` 在**日家奇门**分支里明确写道
> `// 以「至」定半年(非节令!)：夏至≤date<本年末冬至 → 阴遁(至=夏至)`，
> 并注释 `// 节令(nongli.jieqi)在至界会滞后(如06-22已过夏至仍报芒种)→ 必须用至日期判`。
> 即 horosa **时家用节气名、日家用二至日期**，两套并存。重写时须显式区分，否则交节日前后会错半年。

### A2 局数表：二十四节气 × 上/中/下元 → 局数

**双源一致**，且**表值完全逐项相同**（我逐项比对过 24 行）。

**源 1 — horosa** `dunjia/DunJiaCalc.js:396-421`（`JIEQI2JU`，值形如 `'一七四阳'` = 上元1/中元7/下元4 + 遁）
```js
const JIEQI2JU = {
	冬至: '一七四阳', 惊蛰: '一七四阳',
	小寒: '二八五阳',
	大寒: '三九六阳', 春分: '三九六阳',
	雨水: '九六三阳',
	清明: '四一七阳', 立夏: '四一七阳',
	立春: '八五二阳',
	谷雨: '五二八阳', 小满: '五二八阳',
	芒种: '六三九阳',
	夏至: '九三六阴', 白露: '九三六阴',
	小暑: '八二五阴',
	寒露: '六九三阴', 立冬: '六九三阴',
	处暑: '一四七阴',
	霜降: '五八二阴', 小雪: '五八二阴',
	大雪: '四七一阴',
	大暑: '七一四阴', 秋分: '七一四阴',
	立秋: '二五八阴',
};
```

**源 2 — mingpan** `src/core/qimen/YinYangDunCalculator.ts`（元序为 `[上元, 中元, 下元]`）
```ts
'冬至': { dun: '阳遁', ju: [1, 7, 4] },   '惊蛰': { dun: '阳遁', ju: [1, 7, 4] },
'小寒': { dun: '阳遁', ju: [2, 8, 5] },   '大寒': { dun: '阳遁', ju: [3, 9, 6] },
'春分': { dun: '阳遁', ju: [3, 9, 6] },   '雨水': { dun: '阳遁', ju: [9, 6, 3] },
'清明': { dun: '阳遁', ju: [4, 1, 7] },   '立夏': { dun: '阳遁', ju: [4, 1, 7] },
'立春': { dun: '阳遁', ju: [8, 5, 2] },   '谷雨': { dun: '阳遁', ju: [5, 2, 8] },
'小满': { dun: '阳遁', ju: [5, 2, 8] },   '芒种': { dun: '阳遁', ju: [6, 3, 9] },
'夏至': { dun: '阴遁', ju: [9, 3, 6] },   '白露': { dun: '阴遁', ju: [9, 3, 6] },
'小暑': { dun: '阴遁', ju: [8, 2, 5] },   '大暑': { dun: '阴遁', ju: [7, 1, 4] },
'秋分': { dun: '阴遁', ju: [7, 1, 4] },   '立秋': { dun: '阴遁', ju: [2, 5, 8] },
'处暑': { dun: '阴遁', ju: [1, 4, 7] },   '寒露': { dun: '阴遁', ju: [6, 9, 3] },
'立冬': { dun: '阴遁', ju: [6, 9, 3] },   '霜降': { dun: '阴遁', ju: [5, 8, 2] },
'小雪': { dun: '阴遁', ju: [5, 8, 2] },   '大雪': { dun: '阴遁', ju: [4, 7, 1] },
```
> 该表与通行歌诀吻合（「冬至惊蛰一七四…夏至白露九三六…」），**三仓库独立一致** → **可直接落码**。

**源 3 — `banderzhm/ZhouYiLab`（C++，MIT，第三独立源）** `src/qi_men/qi_men.cpp:70-81`
```cpp
Dun get_dun_from_solar_term(SolarTerm term) noexcept {
  return static_cast<std::uint8_t>(term) < 12 ? Dun::Yang : Dun::Yin;
}
std::uint8_t get_ju_from_solar_term_and_yuan(SolarTerm term, Yuan yuan) noexcept {
  constexpr std::array<std::array<std::uint8_t, 3>, 24> table{
      {{1, 7, 4}, {2, 8, 5}, {3, 9, 6}, {8, 5, 2}, {9, 6, 3}, {1, 7, 4},
       {3, 9, 6}, {4, 1, 7}, {5, 2, 8}, {4, 1, 7}, {5, 2, 8}, {6, 3, 9},
       {9, 3, 6}, {8, 2, 5}, {7, 1, 4}, {2, 5, 8}, {1, 4, 7}, {9, 3, 6},
       {7, 1, 4}, {6, 9, 3}, {5, 8, 2}, {6, 9, 3}, {5, 8, 2}, {4, 7, 1}}};
  return table[static_cast<std::size_t>(term)][static_cast<std::size_t>(yuan)];
}
```
其 `SolarTerm` 枚举自**冬至**起序（`qi_men.cpp:48-54`：`"冬至","小寒","大寒","立春",…,"大雪"`），与 horosa 的旋转口径**完全同构**；表值与我逐项核对 horosa/mingpan 的结果**24×3 全部一致**。
（`qi_men.cppm:22-41` 亦用标准洛书枚举 `North=1(坎), SouthWest=2(坤), East=3(震), SouthEast=4(巽), Center=5, NorthWest=6(乾), West=7(兑), NorthEast=8(艮), South=9(离)` —— 第三个确认「标准洛书宫数」是通行基准。）

> ✅ **局数表 = 三独立源（Python/JS/TS/Rust/C++ 五种实现、三个仓库）逐项一致 → 视为已定案。**

`horosa` 另有等价拆分表 `DunJiaCalc.js:423-448` 的 `JIEQI_CODE`（纯局数字符串，不含遁）。

### A3 三元符头：上中下元由**日干支**定

**horosa** `dunjia/DunJiaCalc.js:375-376, 1016-1026`
```js
const SAN_YUAN_FU_TOU = ['甲子', '甲午', '甲寅', '甲申', '甲辰', '甲戌', '己卯', '己酉', '己巳', '己亥', '己丑', '己未'];
```
```js
function findYuan(dayGanZhi){ /* … */ return '上元'; /* 或 中元 / 下元 */ }
```
即 **符头 = 十二个（甲/己 + 四仲/四孟/四季）日**，`findYuan(日干支)` → 上/中/下元。
`DunJiaCalc.js:1147` 十日一局档中给出旬对应关系：
```js
const block = ({ 上元: 0, 中元: 1, 下元: 2 })[findYuan(dayGanZhi)] || 0;
// 十日一局:逐旬按符头换元(甲子甲午旬=上元/甲戌甲辰=中元/甲申甲寅=下元)
```

### A3b 三元符头的**闭式解**（ZhouYiLab，极简，强烈推荐）

**`banderzhm/ZhouYiLab`** `src/qi_men/qi_men.cpp:82-84`
```cpp
Yuan get_yuan_from_gan_zhi(TianGan gan, DiZhi zhi) {
  return static_cast<Yuan>((sexagenary_index(gan, zhi) % 15) / 5);
}
```
即 **元序 = (六十甲子序 % 15) / 5**（0=上元 1=中元 2=下元）。
**我逐项验算 12 个符头，全部命中通行三元分组**：
| 元 | 符头（60 序） | 验算 |
|---|---|---|
| 上元 | 甲子(0) 己卯(15) 甲午(30) 己酉(45) | `%15/5` 全 = 0 ✅ |
| 中元 | 己巳(5) 甲申(20) 己亥(35) 甲寅(50) | 全 = 1 ✅ |
| 下元 | 甲戌(10) 己丑(25) 甲辰(40) 己未(55) | 全 = 2 ✅ |
→ **一行算式替代查表**，且与 horosa 的 `SAN_YUAN_FU_TOU` 十二符头集合**完全相同**（两种机制、同一分组）。

> ⚠️ 精度陷阱：horosa 的 `shitian=十日一局` 档按**旬**（10 日）换元，与本式按**符头**（5 日）换元**不同**。horosa 的出厂默认是 `yiyuan=六十日一局`（`DunJiaCalc.js:59`），与上式一致。

### A4 超神接气 / 置闰 / 拆补 —— horosa 是**唯一**给出可落码实现与阈值参数的仓库

`dunjia/DunJiaCalc.js:103-104, 135-142`
```js
	{ value: 'zhirun', label: '置闰' },
	{ value: 'chaibu', label: '拆补' },
```
```js
// 置闰天数(传本差异·设置面板可调):超神累计阈值,至点超神距(dgap=二至日−其前最近上元符头)
//   ≥该值即置闰。默认9=主流口径(满9天即闰)。
	{ value: 9, label: '置闰·超神满9天即闰（默认·主流）' },
	{ value: 8, label: '置闰·超神满8天即闰（从宽）' },
	{ value: 10, label: '置闰·超神满10天才置闰（从严）' },
```

**至点锚置闰算法**（`DunJiaCalc.js:2207-2209`，注释自述对齐 `kinqimen fork jieqi.py zhirun_jieqi`）：
```js
// 至锚置闰(2026-08-02 二次修,对齐 kinqimen fork jieqi.py zhirun_jieqi 的「至点锚」框架):
// dgap = 二至日 − 其前最近上元符头(严格在前;即至日日柱序%15,0 作 15);dgap≥阈值 → 该至前
// 插入闰(重复大雪/芒种三元)。链上表现为:至的上元块起 = F*(至) + (闰?15:0),默认步进若未到位
```

**四流派分支**（`DunJiaCalc.js:2364-2389`）：
- `zhirun`（置闰）：超神接气 + 满足 dgap≥阈值则置闰
- `wurun`（无闰）：`// WP-C 无闰法:同超神接气但 noLeap=true 永不置闰`
- `chaibu`（拆补）：按曆法节气 + 符头元（`qimenJuNameChaibu`, `:1027`）
- `maoshan`（茅山）：`// 以「交节时刻」为唯一锚,何时交节即从该刻起用该节气上元,足60时辰(=5日)进一元,满3元即接下一节气上元;不用符头、不置闰`
```js
const shichen = /* floor((now−交节时刻)/2时) */;
const yuanIdx = Math.min(Math.floor((shichen % 180) / 60), 2);
```

`DunJiaCalc.js:1545` 另有口径说明：
```js
// 定局节气:拆补/茅山/阴盘=曆法节气;置闰/无闰=超神接气链上的节气
```

> **这是本批调研中最完整的三元/超神实现**。但注意：horosa 自述该路径**对齐 kinqimen**（三方库），且源码里有大量「事故复盘」注释，说明此模块历史上反复出错 → **属高风险，必须交叉验证**。

### A5 地盘三奇六仪布法（**已验证正确**）

**单源（horosa，但可手工验算通过）** `dunjia/DunJiaCalc.js:1744-1749`
```js
function panEarth(qmju){
	const meta = parseQmju(qmju);
	const palaces = newList(CNUMBER, meta.kook).map((x)=>zipToMap(CNUMBER, EIGHT_GUA)[x]);
	const vals = meta.yy === '阳' ? '戊己庚辛壬癸丁丙乙'.split('') : '戊乙丙丁癸壬辛庚己'.split('');
	return zipToMap(palaces, vals);
}
```
- 宫序 `EIGHT_GUA = '坎坤震巽中乾兑艮离'`（`DunJiaCalc.js:378`）= **标准洛书宫数**：坎1 坤2 震3 巽4 中5 乾6 兑7 艮8 离9。
- 自局数宫起，沿洛书数字 1→2→…→9 递增（`palaces`），阳遁填 `戊己庚辛壬癸丁丙乙`。
- **我手工验算**：阳遁一局 → 戊@坎1 己@坤2 庚@震3 辛@巽4 壬@中5 癸@乾6 丁@兑7 丙@艮8 乙@离9 ✅ 与通行地盘一致。
- **我手工验算**：阴遁一局（`戊乙丙丁癸壬辛庚己`）→ 1:戊 2:乙 3:丙 4:丁 5:癸 6:壬 7:辛 8:庚 9:己。与「六仪逆布、三奇逆布」的推演**逐宫吻合** ✅

### A6 值符 / 值使

**horosa** `dunjia/DunJiaCalc.js:1667-1742`。核心是两张**预计算置换表**（`zhifuPai` / `zhishiPai`）。

**我逐字符反解并验算通过**（阳遁一局）：

`zhifuPai` 阳一局取 `pai='九八七一二三四五六'`，拼成 10 字符串
`甲子旬 → '一九八七一二三四五六'`（index0 保留给「甲」）。

该串按**十干序 甲乙丙丁戊己庚辛壬癸** 逐位给出**值符星落宫（洛书宫数）**：
```
甲→1  乙→9  丙→8  丁→7  戊→1  己→2  庚→3  辛→4  壬→5  癸→6
```
对照阳遁一局地盘（戊@1 己@2 庚@3 辛@4 壬@5 癸@6 丁@7 丙@8 乙@9）→ **完全一致**。
即实测规则 = **「值符随时干」：值符（旬首所遁之仪）飞至「时干在地盘所在之宫」** ✅

`zhishiPai` 同理，阳一局甲子旬 → 12 字符串 `'一二三四五六七八九一二三'`，按**十干序**给出**值使门落宫**：
```
甲→1 乙→2 丙→3 丁→4 戊→5 己→6 庚→7 辛→8 壬→9 癸→1
```
即实测规则 = **「值使随时辰」：旬首宫起，阳顺阴逆，按「时干在本旬中的序位」逐宫推移（含中5）** ✅

旬首→仪 的对应（`dunjia/DunJiaCalc.js:387-394`）：
```js
const JJ = { 甲子:'戊', 甲戌:'己', 甲申:'庚', 甲午:'辛', 甲辰:'壬', 甲寅:'癸' };
```
九星本位（`DunJiaCalc.js:382`）：`const JIU_XING = '蓬芮冲辅禽心柱任英'.split('');` —— **注意此串按洛书宫序 1..9**（坎蓬/坤芮/震冲/巽辅/中禽/乾心/兑柱/艮任/离英），与 `dunjia/DunJiaBaGongRules.js` 表述需区分。

### A7 九星：转盘（排宫，8 星，禽寄坤）vs 飞盘（飞宫，9 星，含中5）

**horosa `SCHOOL_OPTIONS`** `dunjia/DunJiaCalc.js:277-283`
```js
// WP-A 盘式(排盘法):转盘=排宫(八神,八卦轮转,默认) / 飞盘=飞宫(九神,洛书飞泊含中宫) / 飞转=混合(星转·门飞·九神)。
// 锚点规则三派一致(值符随时干、值使随时辰、神随值符、阳顺阴逆),差别只在转环 vs 飞宫 vs 飞转结合。
export const SCHOOL_OPTIONS = [
	{ value: '转盘', label: '转盘（排宫）' },
	{ value: '飞盘', label: '飞盘（飞宫）' },
	{ value: '混合', label: '飞转（混合）' },
];
```
`DunJiaCalc.js:285`：混合档 = `九星=转盘排宫(星寄坤2不入中、天禽)、八门=飞盘飞宫(可入中5)、神=飞盘九神(含中宫)`。

**转盘九星实现** `DunJiaCalc.js:1777-1790`
```js
const STAR_R = '蓬任冲辅英禽柱心'.split('');          // :381 环序=坎艮震巽离坤兑乾
const stars = meta.yy === '阳' ? newList(STAR_R, startingStar) : newList([...STAR_R].reverse(), startingStar);
// … 转盘(8星)天禽随中显「内」(天内);飞盘9星含中宫照显「禽」
```

**飞盘** `DunJiaCalc.js:1839-1842, 1867-1869`
```js
const FEI_GATE_HOME = { 1:'休', 8:'生', 3:'伤', 4:'杜', 5:'中', 9:'景', 2:'死', 7:'惊', 6:'开' };
const FEI_GODS_YANG = '符蛇阴合勾常雀地天'.split('');
const FEI_GODS_YIN  = '符蛇阴合虎常玄地天'.split('');
const stepXing = (isY || fo.feiXingShun) ? 1 : -1;
const stepMen  = (isY || fo.feiMenShun)  ? 1 : -1;
const stepShen = (isY || fo.feiShenShun)? 1 : -1;
```

### A8 天盘奇仪（**已验证正确**）

**horosa** `dunjia/DunJiaCalc.js:1792-1832`
```js
const fuHead = JJ[getXunHead(ganzhi.time)] || '戊';
const ganHead = zfzs.值符天干[1];
const earthOnRing = rotate.map((g)=>earth[g]);
// …
const timeGan = getGanzhiGan(ganzhi.time);
const sourceGong = normalizeTianpanGong(earthR[fuHead]);   // 旬首仪在地盘之宫
const targetGong = normalizeTianpanGong(earthR[timeGan]);  // 时干在地盘之宫
const ganReorder = newList(rotate, safeSourceGong).map((g)=>earth[g]);
const gongReorder = newList(rotate, safeTargetGong);
```
即 **整个天盘沿环平移，使「旬首仪」落到「时干地盘宫」之上** = 经典「值符加时干」✅
`DunJiaCalc.js:1875` 注释亦自证：`// 天盘(六仪三奇):地盘整体随值符平移(值符遁仪→时干宫,平移量 P-Hv),非随星逆飞`

### A9 八门

**horosa** `dunjia/DunJiaCalc.js:1766-1775`
```js
const DOOR_R = '休生伤杜景死惊开'.split('');   // :380 环序=坎艮震巽离坤兑乾
const startingDoor = zfzs.值使门宫[0];
const yydoor = meta.yy === '阳' ? newList(DOOR_R, startingDoor) : newList([...DOOR_R].reverse(), startingDoor);
```
八门本位（`DunJiaCalc.js:158`）：`const DOOR_HOME = { 休:'坎', 生:'艮', 伤:'震', 杜:'巽', 景:'离', 死:'坤', 惊:'兑', 开:'乾' };` ✅

### A10 八神顺序 + 顺逆 + **两种正统口径的冲突（必须决策）**

**horosa** `dunjia/DunJiaCalc.js:1751-1763`
```js
const rotate = meta.yy === '阳' ? CLOCKWISE_EIGHTGUA : [...CLOCKWISE_EIGHTGUA].reverse();
const vals = (meta.yy === '阳' ? '符蛇阴合勾雀地天' : '符蛇阴合虎玄地天').split('');
```
- 阳遁八神：**值符 螣蛇 太阴 六合 勾陈 朱雀 九地 九天**
- 阴遁八神：**值符 螣蛇 太阴 六合 白虎 玄武 九地 九天**
- 起点 = 值符星宫；顺逆同天盘环（`CLOCKWISE_EIGHTGUA = '坎艮震巽离坤兑乾'`，`:379`）。8 神不入中宫。

**源 3 — ZhouYiLab（第三源，采用「虎玄」单序）** `src/qi_men/qi_men.cppm:65-75` + `qi_men.cpp:44-45`
```cpp
enum class Spirit : std::uint8_t {
  ZhiFu,   ///< 值符。
  TengShe, ///< 腾蛇。
  TaiYin,  ///< 太阴。
  LiuHe,   ///< 六合。
  BaiHu,   ///< 白虎。
  XuanWu,  ///< 玄武。
  JiuDi,   ///< 九地。
  JiuTian, ///< 九天。
  None     ///< 中宫无神。
};
```
```cpp
  constexpr std::array<std::string_view, 9> names{
      "值符", "腾蛇", "太阴", "六合", "白虎", "玄武", "九地", "九天", "无神"};
```
→ **ZhouYiLab 也采用「白虎/玄武」单序（不随遁变）**，与 horosa 的出厂默认 `baihu_xuanwu` 相同。
**三源投票**：2 票「恒虎玄」（horosa 默认 + ZhouYiLab）、1 票「按遁取」（horosa 代码基串）。
⚠️ 但古籍主流是「阳遁勾陈朱雀／阴遁白虎玄武」——**「恒虎玄」很可能是软件界的沿袭错误**，落码前须按文献裁决。

**⚠️ 但 horosa 的默认值与基串不一致** `dunjia/DunJiaCalc.js:219-231`
```js
// [H-B] 转盘八神预设:基串本为正统(阳遁勾陈朱雀/阴遁白虎玄武);现状默认=两遁恒虎玄(历史行为,零回归默认)。
export const GODS_PRESET_OPTIONS = [
	{ value: 'baihu_xuanwu', label: '两遁恒白虎玄武（默认）' },
	{ value: 'system', label: '按遁取神（阳勾陈朱雀·阴白虎玄武）' },
	{ value: 'gouchen_zhuque', label: '两遁恒勾陈朱雀' },
];
```
→ **代码基串是正统口径（`system`），但出厂默认是「两遁恒虎玄」这个非正统口径。**重写时必须显式选定，否则默认行为与古籍不符。

### A11 空亡 / 马星 / 驿马（**已验证**）

**旬空** `dunjia/DunJiaCalc.js:602-609`
```js
export const GUXU = {
	甲子:'戌亥', 甲戌:'申酉', 甲申:'午未', 甲午:'辰巳', 甲辰:'寅卯', 甲寅:'子丑',
};
```
**双源一致**：mingpan `src/services/daliuren/data/constants.ts` 的 `XUN_KONG` 完全相同 ✅

**驿马** `dunjia/DunJiaCalc.js:1953-1967`
```js
if('申子辰'.indexOf(sourceZhi) >= 0){ return '寅'; }
if('寅午戌'.indexOf(sourceZhi) >= 0){ return '申'; }
if('巳酉丑'.indexOf(sourceZhi) >= 0){ return '亥'; }
if('亥卯未'.indexOf(sourceZhi) >= 0){ return '巳'; }
```
**双源一致**：mingpan `RI_MA`（申子辰→寅 / 寅午戌→申 / 巳酉丑→亥 / 亥卯未→巳）✅
地支→宫：`dunjia/DunJiaCalc.js:486-499` `BRANCH_TO_POS`（子8 丑7 寅7 卯4 辰1 巳1 午2 未3 申3 酉6 戌9 亥9 —— **注意这是 horosa 的「环位」索引，非洛书宫数**）。

### A12 吉凶要素

#### ✅ 门迫（**已验证正确，可直接落码**）
`dunjia/DunJiaCalc.js:646-655`
```js
const MEN_PO_RULE = {
	1: '开惊', 2: '休', 3: '伤杜', 4: '开惊',
	6: '景', 7: '伤杜', 8: '生死', 9: '景',
};
```
**我逐项验算**：键为**环位**（1巽 2离 3坤 4震 6兑 7艮 8坎 9乾）。
巽木←开惊金 / 离火←休水 / 坤土←伤杜木 / 震木←开惊金 / 兑金←景火 / 艮土←伤杜木 / 坎水←生死土 / 乾金←景火
→ **全部为「门克宫」，8/8 命中** ✅ 无中5（中宫无门迫）。

#### ✅ 六仪击刑（**已验证正确**）
`dunjia/DunJiaCalc.js:631-637`
```js
const JI_XING_RULE = { 1: '壬癸', 2: '辛', 3: '己', 4: '戊', 7: '庚' };
```
**我逐项验算**（键为环位）：1巽←壬癸、2离←辛、3坤←己、4震←戊、7艮←庚
→ 即 **壬癸刑巽4、辛刑离9、己刑坤2、戊刑震3、庚刑艮8**，5/5 与「六仪击刑」通行说一致 ✅
**同源文字佐证** `dunjia/DunJiaBaGongRules.js:400`
```
六仪击刑|甲子临震、甲戌临坤、甲申临艮、甲午临离、甲辰临巽、甲寅临巽。此时忌用兵，安营尤忌，出行谋为多不利。
```
（甲子=戊→震3、甲戌=己→坤2、甲申=庚→艮8、甲午=辛→离9、甲辰=壬→巽4、甲寅=癸→巽4 ✅ 与置换表一致）

#### ⚠️ 入墓：**同一仓库内两套说法冲突（高风险）**
`dunjia/DunJiaCalc.js:639-644`
```js
const RU_MU_RULE = { 1: '辛壬', 3: '甲癸', 7: '丁己庚', 9: '乙丙戊' };
```
按环位解：巽←辛壬、坤←甲癸、艮←丁己庚、乾←乙丙戊（**五行墓库口径**：辰墓纳辛壬、未墓纳甲癸、丑墓纳丁己庚、戌墓纳乙丙戊）。

但 `dunjia/DunJiaBaGongRules.js:403`
```
三奇入墓|乙奇临坤，丙奇临乾，丁奇临艮为三奇入墓。凡百事吉者不吉，凶者不凶，多主无功。
```
→ **乙：`RU_MU_RULE` 归乾，`DunJiaBaGongRules` 归坤 —— 直接冲突**。丙→乾、丁→艮 两处一致。
**重写前必须裁决该冲突。**

#### 三奇得使 / 伏吟 / 返吟 / 五不遇 —— **单源，需文献复核**
`dunjia/DunJiaBaGongRules.js:360-368, 398-401`
```
三奇得使|甲己日丙奇，乙庚日乙奇，丙辛日丙奇，丁壬日乙奇，戊癸日丁奇，阴阳二遁遇此诸事皆吉。
青龙回首|戊加丙为青龙回首，此时宜举百事，多有欣悦称心之验，行军俱吉。
飞鸟跌穴|丙加戊为飞鸟跌穴，此时百事宜为，有显达易成之象，战阵皆吉。
三奇贵人升殿|乙奇到震，丙奇到离，丁奇到兑，此三奇升本宫之殿，百事皆吉。
伏吟|星符门还加本宫为伏吟，凡百谋为只宜静守，不可妄动，急进则易遭围困。
返吟|星符门加对冲之宫为返吟，凡百谋为反复不定，宜积粮静守。
五不遇时|时干克日干为五不遇时，出行主折损，百事凶，用兵尤忌，虽有奇门亦不可轻用。
```
`dunjia/DunJiaFaCalc.js:190-207` 给出**可程序化的伏吟/反吟判据**（法奇门模块）：
```js
// 伏吟 = 每宫天盘干 ≡ 地盘干；反吟 = 每宫天盘干 ≡ 对宫地盘干。
return { type: '伏吟', text: '天地伏吟局：天地盘干重叠，凝滞不动、进退两难、应事较慢；可借马宫带动能量。' };
return { type: '反吟', text: '反吟局：天地盘对冲颠倒，事多反复折腾、重来不定。' };
```
各宫干组合格局字典（`DunJiaBaGongRules.js` 约 355-510 行）含成对格式，例：
```
丙戊|飞鸟跌穴…  壬己|反吟蛇刑，主官司败诉…  戊戊|名为伏吟…  乙癸|日奇入地网…
```
→ **这是一份可整表复用的格局字典文件**（见 §E）。

#### ⚠️ 中宫寄宫：horosa 给 5 档
`dunjia/DunJiaCalc.js:233-243`
```js
//   kun=恒寄坤二(历史默认) / yang_gen_yin_kun=阳遁寄艮八·阴遁寄坤二 / gen=恒寄艮八 /
//   siwei=按季寄四维(四立分界) / bajie=按八节寄八宫(每节领三气)
```
`BAJIE_JIGONG` / `SIWEI_JIGONG` 表在 `:244-259`（可直接复用）。

#### 旺相休囚死（`dunjia/DunJiaCalc.js:533-539`）
```js
const WANGSHUAI_BY_MONTH = {
	木: { 木:'旺', 火:'相', 水:'休', 金:'囚', 土:'死' },
	火: { 火:'旺', 土:'相', 木:'休', 水:'囚', 金:'死' },
	金: { 金:'旺', 水:'相', 土:'休', 火:'囚', 木:'死' },
	水: { 水:'旺', 木:'相', 金:'休', 土:'囚', 火:'死' },
	土: { 土:'旺', 金:'相', 火:'休', 木:'囚', 水:'死' },
};
```
五行表：`STAR_WUXING` `MEN_WUXING` `GAN_WUXING`（`:526-528`），宫→卦五行 `PALACE_GUA_WUXING`（`:530`）。

---

## B. 大六壬

### B1 月将加时：**三种换将口径 + 太阳过宫表**

**口径定义** `ChesterRa/mingpan` 无口径开关（单一表）；**`Horace-Maxwell/horosa-skill` 有三档**（`liureng/LiuRengMain.js:3890-3894`）：
```js
const YUE_JIANG_METHODS = [
	{ key: 'zhongqi', name: '中气过宫（默认）' },
	{ key: 'jieqi',   name: '节气换将' },
	{ key: 'richan',  name: '太阳过宫·日躔（含岁差）' },
];
```
`liureng/LiuRengMain.js:3925-3943`（**实现细节，极高价值**）：
```js
// 月将换将三派(§3.2):中气过宫(③默认=getChartYue,回归中气) / 节气换将(①立节古法,提前半月=黄经+15°取宫) /
// 太阳过宫·日躔(②含岁差,黄经−岁差后取宫,今约较中气晚一周)。岁差=Lahiri 线性近似…
export function liurengAyanamsa(solarYear){
	const yr = (typeof solarYear === 'number' && isFinite(solarYear)) ? solarYear : 2024;
	return 23.853 + 0.0139644 * (yr - 2000); // 23°51′@2000 + 50.27″/yr
}
export function getYueJiangByMethod(chartObj, yueJiangMethod, solarYear){
	if(yueJiangMethod !== 'jieqi' && yueJiangMethod !== 'richan'){ return getChartYue(chartObj); }
	const sun = getPlanetObject(chartObj, AstroConst.SUN);
	const offset = yueJiangMethod === 'richan' ? -liurengAyanamsa(solarYear) : 15;
	const lon = (((sun.lon + offset) % 360) + 360) % 360;
	return LRConst.SignZiList[Math.floor(lon / 30) % 12] || getChartYue(chartObj);
}
```
`liureng/LRConst.js:10`
```js
export const SignZiList = ['戌', '酉', '申', '未', '午', '巳', '辰', '卯', '寅', '丑', '子', '亥'];
```
**结论**：horosa 的中气过宫**不查表**，而是取**太阳真实黄经** `floor(lon/30)` 索引 `SignZiList`。
即 **白羊→戌、金牛→酉、双子→申、巨蟹→未、狮子→午、处女→巳、天秤→辰、天蝎→卯、人马→寅、摩羯→丑、宝瓶→子、双鱼→亥**。
**我手工验算**：冬至（黄经270°=摩羯0°）→ 丑 ✅；春分（0°=白羊）→ 戌 ✅；雨水（330°=双鱼）→ 亥 ✅ —— 与通行月将完全吻合。
→ **重写必须自备太阳黄经（星历）或改用查表**。这是六壬模块的**唯一外部天文依赖**。

**太阳过宫表（查表版，双源一致）** `ChesterRa/mingpan` `src/services/daliuren/data/constants.ts`
```ts
/** 節氣對應月將 */
export const JIEQI_YUE_JIANG: Record<string, DiZhi> = {
  '雨水': '亥', '驚蟄': '亥',   // 登明
  '春分': '戌', '清明': '戌',   // 河魁
  '穀雨': '酉', '立夏': '酉',   // 從魁
  '小滿': '申', '芒種': '申',   // 傳送
  '夏至': '未', '小暑': '未',   // 小吉
  '大暑': '午', '立秋': '午',   // 勝光
  '處暑': '巳', '白露': '巳',   // 太乙
  '秋分': '辰', '寒露': '辰',   // 天罡
  '霜降': '卯', '立冬': '卯',   // 太沖
  '小雪': '寅', '大雪': '寅',   // 功曹
  '冬至': '丑', '小寒': '丑',   // 大吉
  '大寒': '子', '立春': '子',   // 神後
};
```
**我判定该表为中气过宫**：每个**中气**（雨水/春分/谷雨/小满/夏至/大暑/处暑/秋分/霜降/小雪/冬至/大寒）换将，随后紧邻的**节**沿用同将 ✅
**且与 horosa 的太阳黄经算法逐项一致**（我逐项验算 12 行）→ **双源一致，可直接落码**。

月将名称表（mingpan 同上文件；horosa `liureng/LiuRengMain.js` 亦有）：
```
亥=登明 戌=河魁 酉=从魁 申=传送 未=小吉 午=胜光 巳=太乙 辰=天罡 卯=太冲 寅=功曹 丑=大吉 子=神后
```
⚠️ **`dglijin-oss/liuren-skill` 的月将是错的**：`index.js:9-12`
```js
// 月将表(农历月)
const YUE_JIANG = { 1:'亥', 2:'戌', 3:'酉', 4:'申', 5:'未', 6:'午', 7:'巳', 8:'辰', 9:'卯', 10:'寅', 11:'丑', 12:'子' };
function getYueJiang(lunarMonth) { return YUE_JIANG[lunarMonth] || '酉'; }
```
按**农历月序**取月将 → 与「中气过宫」不符（农历月首与中气可差半月）。**该仓库不可用于月将。**

### B2 天地盘

**horosa** `liureng/LiuRengMain.js:4098-4101`
```js
const idx = (i + delta + 12) % 12;
yueIndexs[i] = idx;
upZi[i] = LRConst.ZiList[idx];
```
即「月将加时」= 天盘整体旋转 `delta`，`ZiList = ['子','丑',…,'亥']`（`LRConst.js:8`）。

### B3 四课（**已验证**）

**horosa** `liureng/LiuRengMain.js:4234-4272`
```js
const idx1 = layout.downZi.indexOf(LRConst.GanJiZi[daygan]);
const ke1zi = layout.upZi[idx1];                 // 一课 = 日干寄宫的上神
const idx2 = layout.downZi.indexOf(ke1zi);
const ke2zi = idx2 >= 0 ? layout.upZi[idx2] : ''; // 二课 = 一课上神的上神
const idx3 = layout.downZi.indexOf(dayzi);
const ke3zi = idx3 >= 0 ? layout.upZi[idx3] : ''; // 三课 = 日支的上神
const idx4 = layout.downZi.indexOf(ke3zi);
const ke4zi = idx4 >= 0 ? layout.upZi[idx4] : ''; // 四课 = 三课上神的上神
```
✅ 标准四课起法。

**日干寄宫表（双源逐项一致）**
`horosa` `liureng/LRConst.js:17-28`
```js
export const GanJiZi = { '甲':'寅','乙':'辰','丙':'巳','丁':'未','戊':'巳','己':'未','庚':'申','辛':'戌','壬':'亥','癸':'丑' };
```
`mingpan` `src/services/daliuren/data/constants.ts`
```ts
export const GAN_JI_GONG: Record<TianGan, DiZhi> = { '甲':'寅','乙':'辰','丙':'巳','丁':'未','戊':'巳','己':'未','庚':'申','辛':'戌','壬':'亥','癸':'丑' };
```
✅ **两源完全一致 = 十干寄宫（甲寅乙辰丙戊巳丁己未庚申辛戌壬亥癸丑）**，可直接落码。
反向表 `ZiHanGan`（`LRConst.js:30-39`）：寅甲 / 辰乙 / 巳丙戊 / 未丁己 / 申庚 / 戌辛 / 亥壬 / 丑癸。

### B4 三传：九宗门 —— **本次调研最高风险项**

#### 🔴 核心结论：「列举序」≠「判定序」，两个仓库的**代码**一致但与**文档**不一致

**源 1 — horosa（有完整判定序注释 + 历史事故复盘）**
`liureng/ChuangChart.js:191-244`
```js
	getSangCuang(){
		// 发三传九法的判定顺序(课经条文口径,#46 修正)：
		// 伏吟/返吟(盘体) → 贼克(贼/摄) → [比用/涉害,见 isJinKe*] → 八专 → 遥克 → 别责 → 昴星。
		// 关键点：
		//  · 八专(干支同位,四课止两课)必须在遥克之前——课经明训:八专「有克照常以克贼比涉论,
		//    如无克贼比涉,不复取遥克」;「遥者远也」,干支同处一位无远可言,故两课无克径入八专。
		//    🔴 历史教训(#46):曾把古籍「九法」章的列举序号(遥克第4/八专第9)误读为判定
		//    优先级,将八专下移到遥克之后并用金标锁死,致甲寅日戌将丑/午时等两课无近克而带遥克
		//    的课式被误发蒿矢/弹射。列举序≠判定序;判定序只认「八专不取遥、别责须无遥」等条文本身。
		//  · 遥克在别责/昴星之前——三课备(别责)与四课全(昴星)须先问遥克,课经「无遥无克别责例」。
		//  · 八专须在别责之前——八专(一课=三课)会令二课=四课,从而满足 isBieZe 的
		//    "某两课相同",若先判别责会被误吞,故八专优先于别责。
		//  · 昴星(isMaoXing)是无克无遥且四课俱全的兜底(总会返回),必须最后判。
		let cuang = this.isFuYin();      if(cuang){ return cuang; }
		cuang = this.isFangYin();        if(cuang){ return cuang; }
		cuang = this.isJinKe0();         if(cuang){ return cuang; }   // 贼克
		cuang = this.isJinKe1();         if(cuang){ return cuang; }   // 比用/涉害
		cuang = this.isBaZhuang();       if(cuang){ return cuang; }   // 八专
		cuang = this.isYaoKe0();         if(cuang){ return cuang; }   // 遥克·蒿矢
		cuang = this.isYaoKe1();         if(cuang){ return cuang; }   // 遥克·弹射
		cuang = this.isBieZe();          if(cuang){ return cuang; }   // 别责
		/* 昴星为兜底 */
```
→ **horosa 判定序**：伏吟 → 返吟 → 贼克 → 比用/涉害 → **八专** → 遥克 → **别责** → 昴星

**源 2 — mingpan（代码序，与 horosa 部分不同）**
`src/services/daliuren/calculators/SanChuanCalculator.ts`
```ts
    if (isFanYin || isFanYinBaZhuan) { /* 返吟 */ }
    else if (isFuYin) { /* 伏吟 */ }
    else if (isBaZhuan && stats.shangKeXia === 0 && stats.xiaZeiShang === 0) { /* 八專 */ }
    else if (stats.xiaZeiShang === 1 && stats.shangKeXia === 0) { /* 賊尅·重審 */ }
    else if (stats.shangKeXia === 1 && stats.xiaZeiShang === 0) { /* 賊尅·元首 */ }
    else if (stats.xiaZeiShang >= 1) { /* handleMultipleZeiKe('下賊上') → 比用/涉害 */ }
    else if (stats.shangKeXia >= 2)  { /* handleMultipleZeiKe('上尅下') → 比用/涉害 */ }
    else if (stats.shangKeXia === 0 && stats.xiaZeiShang === 0) { /* handleNoZeiKe → 遙尅/昴星 */ }
```
→ **mingpan 判定序**：返吟 → 伏吟 → 八专 → 贼克 → 比用/涉害 → 遥克 → 昴星（**无别责**）

**源 3 — ZhouYiLab（C++/MIT，第三源，采用「守卫条件」而非排序）**
`src/da_liu_ren/da_liu_ren.cpp:676-725`（主派发）
```cpp
    // 优先处理伏吟课
        jiu_zong_men = "伏吟";
    // 其次处理返吟课
        jiu_zong_men = "返吟";
            // 1. 先尝试贼克法（含比用、涉害）
            // 如果ke_shi_中有涉害相关的卦（涉害卦、见机卦、察微卦、复等卦），九宗门是"涉害"
                jiu_zong_men = "涉害";
            else
                jiu_zong_men = "贼克";
            // 2. 尝试遥克法
                jiu_zong_men = "遥克";
                    // 3. 尝试昴星法
                        jiu_zong_men = "昴星";
                        // 4. 尝试别责法
                            jiu_zong_men = "别责";
                            // 5. 处理八专日
                                jiu_zong_men = "八专";
```
→ **ZhouYiLab 字面序**：伏吟 → 返吟 → 贼克(含比用/涉害) → 遥克 → **昴星** → **别责** → **八专**（八专垫底！）

**🔴🔴 但关键在于：它用「守卫条件（抛异常）」而非顺序来落实课经规则**，因此字面序不等于判定序。三处守卫：
```cpp
// 遥克法（:286-289）
        throw std::runtime_error("八专日不用遥克");
// 昴星法（:343-351）
        throw std::runtime_error("课不备，不能用昴星取三传");
// 别责法（:373-385）
        throw std::runtime_error("四课全备，不能用别责取三传");
        throw std::runtime_error("用别责用于三课备取三传");
// 八专法（:403-406）
        throw std::runtime_error("不是八专日");
```
**语义推演（我做的）**：
- 昴星需要**四课全备**、别责需要**课不备** → 两者**互斥**，故「昴星在别责之前」**顺序无关**，结果与 horosa「别责先于昴星」**等价**。
- 遥克法**显式拒绝八专日** → 八专虽排在最后，八专日**永远不会**被遥克截胡 → 与 horosa「八专须在遥克之前」**等价**。
→ **ZhouYiLab 与 horosa 语义完全一致；mingpan 因缺 别责 而相异。**

**涉害四格名（ZhouYiLab，可复用）** `da_liu_ren.cpp:696`
```cpp
                if (last_ke == "涉害卦" || last_ke == "见机卦" || 
```
（即 涉害卦 / 见机卦 / 察微卦 / 复等卦 —— 与 horosa 的「见机课/涉害课」命名可互补）

**伏吟判据（ZhouYiLab，量化）** `da_liu_ren.cpp:644-646`
```cpp
// 判断是否为伏吟课
    // 伏吟课判断：天盘与地盘相同的位置数量>=6个
```
**伏吟三格**（`:426-428`）
```cpp
// 伏吟法取三传
// 1. 四课中有贼克  不虞卦
// 2. 四课中无贼克，日干为阳（刚日）  自任卦
// 3. 四课中无贼克，日干为阴（柔日）  自信卦
```
**返吟二格**（`:551-554`）
```cpp
// 返吟法取三传
// 1. 无依卦：课中有贼克，初中末传相冲
// 2. 无亲卦：课中无贼克，取支驿马发用，中传为支上神、末传为日上神
```
✅ 与 horosa 的伏吟四格（不虞/自任/自信/杜传）与 mingpan 的返吟规则**互相印证**。

**行年（本批唯一可读实现）**：`src/da_liu_ren/da_liu_ren_xing_nian.cpp` + `.cppm`（另有 `da_liu_ren_shen_sha.cpp` 神煞、`analysis/da_liu_ren_lei_shen.cpp` 类神、`analysis/da_liu_ren_structure.cpp` 结构）。
→ §9 中「行年未核实」**已由本仓库补齐入口**（具体算法待细读该文件）。

**逐项差异裁定（我的分析）**：
| 项 | horosa | mingpan | 裁定 |
|---|---|---|---|
| 伏吟 vs 返吟 先后 | 伏吟先 | 返吟先 | **无实质差异**（月将==时 ⟺ 伏吟；月将冲时 ⟺ 返吟；互斥） |
| 八专位次 | 贼克/比涉**之后** | 贼克**之前**，但附加「无克」条件 | **等价**。两仓库都实现了「八专有克照常以克贼比涉论」 |
| 别责 | **有**（遥克后、昴星前） | **无**（`handleNoZeiKe` 只做遥克→昴星） | 🔴 **真实缺陷。mingpan 缺别责** |
| 遥克/昴星序 | 遥克→（别责）→昴星 | 遥克→昴星 | 一致（在无别责的前提下） |

**mingpan 的 `handleNoZeiKe`（含一个具体 bug）** `SanChuanCalculator.ts`（第 331-365 行附近）
```ts
    // 遙尅：四課上神與日干有尅的關係
    for (const ke of siKe.list) {
      const relation = WUXING_RELATION[keWuXing + dayWuXing];
      if (relation === '尅')     { return { chuChuan: ke.shangShen, geJu: '遙尅', detail: '蒿矢' }; }
      if (relation === '被尅')   { return { chuChuan: ke.shangShen, geJu: '遙尅', detail: '彈射' }; }
    }
    // 昴星：陽日取酉上神，陰日取從魁
    if (dayGanYinYang === '陽') { return { chuChuan: tianDiPan.diToTian['酉'], geJu: '昴星', detail: '虎視' }; }
    else                        { return { chuChuan: tianDiPan.diToTian['酉'], geJu: '昴星', detail: '冬蛇掩目' }; }
```
🔴 **阳日/阴日两分支返回同一个值 `diToTian['酉']`**，仅 label 不同。
经典昴星课：**阳日「虎视」取地盘酉之上神；阴日「冬蛇掩目」取天盘酉所临之地盘支**。mingpan 的阴日分支**与阳日同值 = 可疑/错误**。→ **必须交叉验证。**

**中传/末传通则** `SanChuanCalculator.ts`
```ts
    if (isFanYin) { zhongChuanZhi = ZHI_CHONG[chuChuanZhi]; moChuanZhi = ZHI_CHONG[zhongChuanZhi]; }
    else          { zhongChuanZhi = diToTian[chuChuanZhi];  moChuanZhi = diToTian[zhongChuanZhi]; }
```
即 普通课「初传之上神为中传，中传之上神为末传」✅；返吟「初冲为中、中冲为末」✅

**返吟无克取法** `SanChuanCalculator.ts`（`handleFanYin` 注释）
```
   * 1. 有賊尅用賊尅，中傳以初沖，末傳用中沖
   * 2. 無賊尅，取驛馬為初傳，支上神為中傳，干上神為末傳
```

**伏吟末传通则（horosa）** `liureng/ChuangChart.js:526-528`
```js
	// 伏吟末传通则:中传所刑为末;中传自刑(辰午酉亥)取中传所冲。
	// 末传亦取中传所冲——丁卯/己卯/辛卯日伏吟由「卯子卯」勘正为「卯子午」(全域仅此 3/720 课变)。
```

**八专日表（mingpan）** `src/services/daliuren/data/constants.ts`
```ts
export const BA_ZHUAN_DAYS = ['壬子','甲寅','乙卯','丁巳','己未','庚申','辛酉','癸亥'];
export const GAN_ZHI_SAME_POSITION = ['甲寅','丁未','己未','庚申','癸丑'];
```

**涉害取舍流派（horosa）** `liureng/ChuangChart.js:29-32`
```js
		// 涉害取舍流派(默认 app:仅下贼上方向数克·计起点不计本家;已固定)
		//   method: 'app'(默认) | 'standard'(深浅两向:贼数被克/克数主克) | 'mengzhongji'(直取孟仲季,不数克)
		//   shiRuKe: true → 单一下贼上发用单列「始入课」(并入重审=false 默认)
```
默认档定义见 `liureng/LiuRengMain.js:3915-3917`
```js
	seHaiMethod: { def: 'app', oneOf: ['app', 'standard', 'mengzhongji'] },
	seHaiBoundary: { def: 'app', oneOf: ['app', 'both', 'neither'] },
	shiRuKe: { def: false },
```

### B5 十二天将：起法 + 顺逆 + 昼夜

**天将顺序（双源一致）**
`horosa` `liureng/LRConst.js:55`
```js
export const TianJiang = ['贵人','螣蛇','朱雀','六合','勾陈','青龙','天空','白虎','太常','玄武','太阴','天后'];
```
`mingpan` `src/services/daliuren/data/constants.ts`
```ts
export const TIAN_JIANG: TianJiangShort[] = ['貴','蛇','雀','合','勾','龍','空','虎','常','玄','陰','后'];
```
✅ 12/12 一致。

**贵人起法（昼贵/夜贵）—— 双源逐项一致**
`mingpan` `src/services/daliuren/data/constants.ts`（注释即歌诀）
```ts
/** 
 * 貴人起點（晝夜）
 * 甲戊庚牛羊，乙己鼠猴鄉，丙丁豬雞位，壬癸蛇兔藏，六辛逢馬虎
 */
export const GUIREN_START: Record<string, { day: DiZhi; night: DiZhi }> = {
  '甲': { day: '丑', night: '未' },  '戊': { day: '丑', night: '未' },  '庚': { day: '丑', night: '未' },
  '乙': { day: '子', night: '申' },  '己': { day: '子', night: '申' },
  '丙': { day: '亥', night: '酉' },  '丁': { day: '亥', night: '酉' },
  '壬': { day: '巳', night: '卯' },  '癸': { day: '巳', night: '卯' },
  '辛': { day: '午', night: '寅' },
};
```
`horosa` `liureng/LRConst.js:83-107` 的 `DayGuiLiuReng` / `NightGuiLiuReng`（六壬法贵人）与上表**逐字相同** ✅

> ⚠️ **horosa 另有 5 套贵人口径，默认值不是六壬法**：`liureng/LRConst.js:155-170`
> ```js
> export const GuiRengs = [{day: DayGuiLiuReng, night: NightGuiLiuReng},   // 0 六壬法贵人
>                           {day: DayGuiDunJia,   night: NightGuiDunJia},   // 1 遁甲法贵人
>                           {day: DayGui,         night: NightGui},         // 2 星占法贵人
>                           {day: DayGuiBingShuo, night: NightGuiBingShuo}, // 3 甲戊兼牛羊
>                           {day: DayGuiHeGui,    night: NightGuiHeGui}];   // 4 干合阳阴贵
> ```
> `liureng/LiuRengMain.js:3911`：`guireng: { def: 2, oneOf: [0,1,2,3,4] }` → **默认 = 索引 2「星占法贵人」**，与六壬法在 戊/庚/辛/丁/癸 上不同值（例：星占法 `戊 day:午`、`庚 day:丑`；六壬法 `戊 day:丑`、`庚 day:丑`）。
> `liureng/LiuRengMain.js:3034` 亦有 `LRConst.GuiRengs[guirengType] || LRConst.GuiRengs[2]` 兜底。
> **重写必须显式选口径，不能照搬默认。**

**顺逆布（horosa，已验证）** `liureng/LiuRengMain.js:4120-4131`
```js
	const guirenForward = LRConst.SummerZiList.indexOf(housezi) < 0;
	if(!guirenForward){ for(let i=0;i<12;i++){ const idx = (houseidx - i + 12) % 12; houseTianJiang[i] = LRConst.TianJiang[idx]; } }
	else              { for(let i=0;i<12;i++){ const idx = (i - houseidx + 12) % 12; houseTianJiang[i] = LRConst.TianJiang[idx]; } }
```
`liureng/LRConst.js:12-13`
```js
export const WinnerZiList = ['子','丑','寅','卯','辰','亥'];
export const SummerZiList = ['巳','午','未','申','酉','戌'];
```
→ 贵人落 **亥子丑寅卯辰 → 顺布**；落 **巳午未申酉戌 → 逆布** ✅ 标准规则。

**昼夜判定（三档）** `liureng/LiuRengMain.js:3895-3899, 3922-3923, 3946-3953`
```js
const FEN_ZHOU_YE_METHODS = [
	{ key: 'chenhun', name: '晨昏分昼夜（默认）' },   // 用星历 isDiurnal
	{ key: 'maoyou',  name: '卯酉分昼夜' },
	{ key: 'yinshen', name: '寅申分昼夜' },
];
const MAOYOU_DAY_BRANCHES  = ['卯','辰','巳','午','未','申'];
const YINSHEN_DAY_BRANCHES = ['寅','卯','辰','巳','午','未'];
```
`mingpan` 固定口径 `src/services/daliuren/data/constants.ts`
```ts
/** 晝夜判斷（時辰） */
export const DAY_NIGHT_MAP: Record<DiZhi, '晝' | '夜'> = {
  '卯':'晝','辰':'晝','巳':'晝','午':'晝','未':'晝','申':'晝',
  '酉':'夜','戌':'夜','亥':'夜','子':'夜','丑':'夜','寅':'夜',
};
```
→ mingpan 的固定表 **等价于 horosa 的 `maoyou` 档**（卯→申为昼）。✅ 双源一致于「卯酉分昼夜」。

### B6 六亲 / 旬空

**六亲（mingpan）** `src/services/daliuren/data/constants.ts`
```ts
export const WUXING_RELATION: Record<string, string> = {
  '火水':'被尅','水土':'被尅','金火':'被尅','火金':'尅','木金':'被尅',
  '水火':'尅','土水':'尅','金木':'尅','木土':'尅',
  '火火':'比和','水水':'比和','金金':'比和','木木':'比和','土土':'比和',
  '火木':'被生','水金':'被生','木水':'被生','土火':'被生','金土':'被生',
  '木火':'生','金水':'生','水木':'生','火土':'生','土金':'生',
};
export const LIUQIN_MAP: Record<string, string> = {
  '被生':'父母','生':'子孫','尅':'妻財','比和':'兄弟','被尅':'官鬼',
};
```
**旬空** 双源一致（`XUN_KONG` / `GUXU`，见 A11）。

**行年 / 年命**：未核实（本次未读 `liureng_runyear` 实现细节；horosa 有 `LiuRengMain.js:2907` `buildLiuRengReferenceContext(liureng, chartObj, guirengType, runyear, …)` 入口，但行年算法本体未读）。

---

## C. 太乙神数 —— **缺口报告（重要）**

🔴 **本批 9 个仓库中，没有任何一个包含可读的太乙算法实现。** 证据：

**`Horace-Maxwell/horosa-skill` 明确把太乙外包给第三方 Python 包 `kintaiyi`**
- `contracts/technique_provenance.json`（机器可读「算源声明」）：
```json
"taiyi": {
  "compute_class": "ken_backed",
  "engines": ["kintaiyi"],
  "endpoints": ["/nongli/time", "/taiyi/pan"],
  "export_technique": "taiyi",
  "notes": "ken 后端算、JS 只格式化；健康结果带 pan.source/jinkou.source == 引擎名，runner 必须调 _require_ken_pan"
}
```
- `horosa-skill/horosa-core-js/src/vendor/taiyi/TaiYiCalc.js:193`
```js
	const pan = calcTaiyiPanFromKintaiyi(fields, nongli, opt);
```
- 运行时锁 `contracts/runtime_python_lock.json` 说明太乙依赖被刻意裁剪：
```json
"scipy": "size red line (AGENTS §6): never shipped, kintaiyi game_theory stays opt-in",
```
- `taiyi/TaiYiCalc.js:17-63` 仅有**流派选项枚举**（`STYLE_OPTIONS` 含「太乙命法」、`TAIYI_ACCUM_OPTIONS` 积年法、`METHOD_SOURCE_OPTIONS` 引《太乙統宗寶鑑》《太乙金鏡式經》《太乙淘金歌》《太乙局》、`TENCHING_OPTIONS`、`SEX_OPTIONS`、`ROTATION_OPTIONS`、`TIME_BASIS_OPTIONS`、`DAY_SWITCH_OPTIONS`、`GAME_THEORY_OPTIONS`）与 `PALACE_ORDER = ['巽','巳','午','未','坤','申','酉','戌','乾','亥','子','丑','艮','寅','卯','辰']`（`:63`），**但不含积年/主客算/计神大将参将的算法本体**。

**其他仓库**：`Sudo-Biao/Chinese-Metaphysics-Platform` 仅在 `knowledge/advanced_systems.py`（知识文本）提到太乙，非算法。qimen-rs / mingpan / cmp / 其余均无太乙。

**结论与建议**：
- 若重写需要太乙，**唯一可行路径是直接研读 `kintaiyi`（kentang2017）源码**（PyPI / GitHub），horosa 的 README 与 `docs/ALGORITHM_COVERAGE.md` 可作为接口参考，但**本仓库内无算法可抄**。
- 本节涉及的 **积年算法、主客算数、计神/大将/参将起法、太乙行九宫** 全部标记 **未核实**，不得据本文落码。

---

## D. 择时

主要来源：`Horace-Maxwell/horosa-skill` 的 `calendar/`（黄历，`headless_js`）+ `fengshui/`（择日）。
**算源判定（provenance）**：
```json
"tongshu": { "compute_class": "headless_js", "engines": ["tongshu"], "endpoints": [], "notes": "纯 headless JS，无后端引擎" }
"huangli": { "compute_class": "headless_js", "engines": ["huangli"], "endpoints": [], "notes": "纯 headless JS，无后端引擎" }
```
→ **择日/通书是 horosa 里最「干净」的本地实现**，价值高。

`calendar/huangliDay.js:4-6` 自述模块边界：
```js
//   · 建除十二神 / 黄黑道十二神 / 二十八宿值日 → fengshui/zeri.dayCourse（与 lunar 交叉校验）。
//   · 年家凶煞（太岁/岁破/三煞/五黄/十二岁君神）→ fengshui/zeri.yearGods。
//   · 纯通书日课（宜忌/彭祖/胎神/冲煞/吉神凶煞/五方位/时辰宜忌/物候/六曜/数九三伏/日禄/九星）
```
⚠️ 值得注意：它同时用 **repo 自研表** 与 **`lunar-javascript`** 两套口径并做 cross-check：
`calendar/huangliDay.js:92, 177`
```js
	// 值宿吉凶单一真值 = lunar getXiuLuck()（与 AI 快照/卡片/吉日榜同源）。旧 jx 取 zeri XIU_28 表，
// 建除 / 28 宿 两口径交叉校验（zeri 内部算法 vs lunar）——golden 用，保两源一致。
```

### D1 建除十二神（**已验证**）

`fengshui/zeri.js:45-51`
```js
export function dayCourse(y, m, d) {
	const lunar = Solar.fromYmd(y, m, d).getLunar();
	const monthZhi = lunar.getMonthInGanZhi().slice(-1);   // 节气月建支
	const dayGZ = lunar.getDayInGanZhi(); const dayZhi = dayGZ.slice(-1);
	// 建除：建=日支==月建支，顺布。
	const jcIdx = ((zi(dayZhi) - zi(monthZhi)) % 12 + 12) % 12;
	const jianChu = JIANCHU_12[jcIdx];
```
`fengshui/fengshuiData.js:210-215`
```js
// ── 择日 · 建除十二神（正统古法）：建日=日支==月建支，顺布 ─────────────────
export const JIANCHU_12 = ['建', '除', '满', '平', '定', '执', '破', '危', '成', '收', '开', '闭'];
export const JIANCHU_JX = {
	建:'neutral', 除:'good', 满:'neutral', 平:'neutral', 定:'good', 执:'good',
	破:'bad', 危:'neutral', 成:'good', 收:'neutral', 开:'good', 闭:'bad',
};
```
✅ 与任务要求的「月支起建」完全一致。**注意**：`月建支` 取自 `lunar.getMonthInGanZhi()` = **节气月**（非农历月），这是正确做法。

### D2 黄黑道十二神（**已验证，表值即任务所列顺序**）

`fengshui/fengshuiData.js:217-221`
```js
// ── 择日 · 黄道黑道十二值神（正统古法）────────────────────────────────────
export const HUANG_HEI_ORDER = ['青龙','明堂','天刑','朱雀','金匮','天德','白虎','玉堂','天牢','玄武','司命','勾陈'];
export const HUANGDAO_SET = new Set(['青龙','明堂','金匮','天德','玉堂','司命']);
// 青龙起支（按月支）：子午→申·丑未→戌·寅申→子·卯酉→寅·辰戌→辰·巳亥→午。
export const QINGLONG_START = { 子:'申', 午:'申', 丑:'戌', 未:'戌', 寅:'子', 申:'子', 卯:'寅', 酉:'寅', 辰:'辰', 戌:'辰', 巳:'午', 亥:'午' };
```
`fengshui/zeri.js:52-56`
```js
	// 黄黑道：青龙起支(按月支)，12值神顺布。
	const qlStart = QINGLONG_START[monthZhi];
	const hhIdx = ((zi(dayZhi) - zi(qlStart)) % 12 + 12) % 12;
	const shen = HUANG_HEI_ORDER[hhIdx];
	const isHuang = HUANGDAO_SET.has(shen);
```
✅ 12 神顺序与任务所列**逐字相同**；黄道 6 / 黑道 6 划分正确；`QINGLONG_START` 与「子午青龙起申…」通行起例一致。

**时家黄黑道另有独立数据文件**：`dunjia/jinhanRiJia.js`（金函玉镜日家奇门）逐日给出 12 时辰黄黑道值神 + 五不遇 + 截空 + 大吉时，例（`:36`）：
```js
	shiText: '甲子金匮黄道。乙丑天德黄道，贵人。丙寅白虎黑道。丁卯玉堂黄道。戊辰天牢黑道。己巳玄武黑道。庚午司命黄道，五不遇。辛未勾陈黑道，贵人。壬申青龙黄道，截空。癸酉明堂黄道，截空。甲戌天刑黑道。乙亥朱雀黑道。大吉时为：子、丑、卯时。',
```

### D3 二十八宿值日（含宿吉凶与四象）

**职宿来源**：`lunar-javascript` 的 `lunar.getXiu()`（`fengshui/zeri.js:58`）。
**吉凶+四象表** `fengshui/fengshuiData.js:223-233`
```js
// ── 择日 · 二十八宿值日（正统古法）：四象七宿 + 吉凶（吉宿造葬多用）──────────
export const XIU_28 = [
	{ n:'角', x:'东青龙', jx:'good' }, { n:'亢', x:'东青龙', jx:'bad' }, { n:'氐', x:'东青龙', jx:'neutral' },
	{ n:'房', x:'东青龙', jx:'good' }, { n:'心', x:'东青龙', jx:'neutral' }, { n:'尾', x:'东青龙', jx:'good' }, { n:'箕', x:'东青龙', jx:'good' },
	{ n:'斗', x:'北玄武', jx:'good' }, { n:'牛', x:'北玄武', jx:'bad' }, { n:'女', x:'北玄武', jx:'bad' },
	{ n:'虚', x:'北玄武', jx:'neutral' }, { n:'危', x:'北玄武', jx:'neutral' }, { n:'室', x:'北玄武', jx:'good' }, { n:'壁', x:'北玄武', jx:'good' },
	{ n:'奎', x:'西白虎', jx:'good' }, { n:'娄', x:'西白虎', jx:'good' }, { n:'胃', x:'西白虎', jx:'good' },
	{ n:'昴', x:'西白虎', jx:'neutral' }, { n:'毕', x:'西白虎', jx:'good' }, { n:'觜', x:'西白虎', jx:'neutral' }, { n:'参', x:'西白虎', jx:'neutral' },
	{ n:'井', x:'南朱雀', jx:'good' }, { n:'鬼', x:'南朱雀', jx:'bad' }, { n:'柳', x:'南朱雀', jx:'neutral' },
	{ n:'星', x:'南朱雀', jx:'bad' }, { n:'张', x:'南朱雀', jx:'good' }, { n:'翼', x:'南朱雀', jx:'neutral' }, { n:'轸', x:'南朱雀', jx:'good' },
];
```
二十八宿名序（`su28/Su28Helper.js:4-9`）：
```js
export const Su28 = ['角','亢','氐','房','心','尾','箕','斗','牛','女','虚','危','室','壁',
	'奎','娄','胃','昴','毕','觜','参','井','鬼','柳','星','张','翼','轸'];
```
⚠️ `su28/Su28Helper.js` 本身**只是「宿→星座」的颜色映射**（`suToSign` 数组，`:12-25`），**不是值日推算**。值日推算靠 lunar。
⚠️ **「禽曜」（二十八宿配禽兽）本批仓库中未核实** —— 未读到该表。

### D4 紫白九星

**年入中公式（已验证）** `fengshui/liqiCore.js:146-159`
```js
// ── 紫白 年入中（内核基准 year_center）：11 − 年数字根，三元逐年逆退 ────────
export function zibaiYearCenter(year) {
	let s = String(Math.abs(Math.trunc(Number(year) || 0))).split('').reduce((a, d)=>a + (+d), 0);
	while (s > 9) { s = String(s).split('').reduce((a, d)=>a + (+d), 0); }
	let c = 11 - s;
	if (c > 9) { c -= 9; }
	if (c <= 0) { c += 9; }
	return c;
}
export function zibaiYearStar(year) {
	const c = zibaiYearCenter(year);
	return { center: c, star: ZIBAI_STAR[c] };
}
```
**飞宫（洛书顺飞）** `fengshui/zeri.js:14`
```js
function flyStar(center) { const pan = {}; const f = (n)=>(n - 5 + 9) % 9; for (let g = 1; g <= 9; g++) { pan[g] = (center - 1 + f(g)) % 9 + 1; } return pan; }
```
**星名** `fengshui/fengshuiData.js:61`
```js
export const ZIBAI_STAR = { 1:'一白', 2:'二黑', 3:'三碧', 4:'四绿', 5:'五黄', 6:'六白', 7:'七赤', 8:'八白', 9:'九紫' };
```
✅ **年家紫白可落码**。
⚠️ **月/日/时家紫白起星未核实** —— 本次未读到对应函数（`liqiCore.js` 只导出 `zibaiYearCenter` / `zibaiYearStar`）。

**八宅命卦（附带，可复用）** `fengshui/liqiCore.js:161-177`
```js
//   n = 出生公历年四位数字反复相加至个位(1-9);男 = 11−n(得10还原1)、女 = 4+n(>9减9);
//   余 5 → 男坤(2)/女艮(8);余 0 作 9。立春为界由调用方传所属命理年(默认公历年)。
```

### D5 五运六气 —— **未核实**

🔴 本批 9 个仓库中**未找到**五运六气（岁运/司天在泉/客气加临）的任何表或实现。
`Sudo-Biao/Chinese-Metaphysics-Platform` 的 `core/constants.py`(33.6KB) 与 `api/date_selection.py` 未逐行读完，**可能存在但本次未核实**（见 §9 待办）。

### D6 太岁 / 三煞 / 五黄 / 十二岁君神（**已验证**）

`fengshui/zeri.js:16-42`
```js
export function yearGods(year) {
	const yz = yearZhiOf(year);
	const taisuiGong = ZHI_TO_GONG[yz];
	const suipoZhi = ZHI_CHONG[yz]; const suipoGong = ZHI_TO_GONG[suipoZhi];
	const ju = ZHI_SANHE_JU[yz];
	const sanshaZhi = SANSHA_BY_JU[ju] || [];
	const sanshaLabel = ['劫煞', '灾煞', '岁煞'];
	// 年五黄飞宫。
	const yc = zibaiYearCenter(year); const pan = flyStar(yc);
	let wuHuangGong = null; for (let g = 1; g <= 9; g++) { if (pan[g] === 5) { wuHuangGong = g; break; } }
	// 十二岁君神（自太岁支顺行）。
	const twelve = TWELVE_YEAR_GODS.map((name, i)=>{ const z = DIZHI[(zi(yz) + i) % 12]; … });
```
`fengshui/fengshuiData.js:193-208`
```js
export const ZHI_CHONG = { 子:'午', 午:'子', 卯:'酉', 酉:'卯', 寅:'申', 申:'寅', 巳:'亥', 亥:'巳', 辰:'戌', 戌:'辰', 丑:'未', 未:'丑' };
// 地支三合局（年支定局，三煞用）。
export const ZHI_SANHE_JU = {
	申:'水', 子:'水', 辰:'水', 寅:'火', 午:'火', 戌:'火',
	亥:'木', 卯:'木', 未:'木', 巳:'金', 酉:'金', 丑:'金',
};
// 三煞：三合局帝旺对冲之三山。水局(申子辰)煞南巳午未·火局(寅午戌)煞北亥子丑·木局(亥卯未)煞西申酉戌·金局(巳酉丑)煞东寅卯辰。
export const SANSHA_BY_JU = { 水:['巳','午','未'], 火:['亥','子','丑'], 木:['申','酉','戌'], 金:['寅','卯','辰'] };
// 十二岁君神（自太岁支顺行）：太岁·太阳·丧门·太阴·官符·死符·岁破·龙德·白虎·福德·吊客·病符。
export const TWELVE_YEAR_GODS = ['太岁','太阳','丧门','太阴','官符','死符','岁破','龙德','白虎','福德','吊客','病符'];
export const YEAR_GOD_JX = {
	太岁:'caution', 太阳:'good', 丧门:'bad', 太阴:'good', 官符:'bad', 死符:'bad',
	岁破:'bad', 龙德:'good', 白虎:'bad', 福德:'good', 吊客:'bad', 病符:'bad',
};
```
✅ 三煞（三合局帝旺对冲）、岁破（太岁冲）、十二岁君神顺行 —— 全部与通行说一致，**可直接落码**。

### D7 彭祖百忌 —— **来源是 lunar 库，非仓库自有表**

`calendar/huangliDay.js:139`
```js
		// —— 彭祖百忌 ——
```
该段调用 `lunar.getPengZuGan()` / `getPengZuZhi()`（值直接取自 `lunar-javascript`），**仓库内无彭祖百忌条文表**。
→ **落码须自备 10 干 + 12 支的彭祖百忌条文**（本次**未核实**具体条文内容）。

### D8 其他择日资产（附带发现，可复用）

- **杨公造命四纲**（补龙/扶山/相主/避煞）+ 评分：`fengshui/zeri.js:97-181`（结构清晰，含 `wuxingEffect` 生克判读、季节调候 `seasonOf`）。
- **深化层**：`fengshui/zeriDeep.js`（12KB）。
- **三合线法**：`fengshui/fengshuiData.js:235-243`（穿山72龙/透地60龙/120分金 + `FENJIN_GAN_JX` 旺相孤虚空亡口诀）。
- **形势派九星形体**：`fengshui/fengshuiData.js:246-258`（廖公《泄天机》寻龙九星）。
- **择日扫描引擎**：`divination/zeri/*ScanEngine.js`（奇门/六壬/太乙/紫微/八字/黄历各自的小时级扫描）。
- **择日条件类型库**：`divination/zeri/*ConditionTypes.js`（最大 `conditionTypes.js` 56KB）——**判据字典**，含 `conditionGlyph.js` 图元。

---

## E. 可直接复用的数据表文件清单

| 路径（repo@main） | 结构 | 内容 | 建议 |
|---|---|---|---|
| `Horace-Maxwell/horosa-skill` → `horosa-skill/horosa-core-js/src/vendor/dunjia/DunJiaCalc.js` | JS `const`/`export const` 表 + 纯函数 | 奇门全表：`JIEQI2JU`/`JIEQI_CODE`(:396-448)、`ZHISHI_BY_JIEQI`(:450-459)、`GUXU`(:602-609)、`JI_XING_RULE`(:631)、`RU_MU_RULE`(:639)、`MEN_PO_RULE`(:646)、`BAJIE_JIGONG`/`SIWEI_JIGONG`(:244-259)、旺衰表(:526-539)、神煞表(:658-707) | ⭐**主表源**（但注意环位索引陷阱） |
| 同上 → `…/vendor/dunjia/DunJiaBaGongRules.js` | 竖线分隔文本字典（`名称|释义`）+ 双干组合格局 | **奇门格局字典**（三奇得使/青龙回首/飞鸟跌穴/伏吟/返吟/六仪击刑/五不遇/三奇入墓/九遁…），约 :355-510 | ⭐**吉凶判断核心字典** |
| 同上 → `…/vendor/fengshui/fengshuiData.js` | JS 表 | 择日全表：`JIANCHU_12`/`JIANCHU_JX`(:210-215)、`HUANG_HEI_ORDER`/`HUANGDAO_SET`/`QINGLONG_START`(:217-221)、`XIU_28`(:223-233)、`SANSHA_BY_JU`/`TWELVE_YEAR_GODS`/`YEAR_GOD_JX`(:193-208)、`ZIBAI_STAR`(:61)、纳音/分金/形势 | ⭐**择日主表源** |
| 同上 → `…/vendor/fengshui/zeri.js` | 纯函数 | `yearGods()` / `dayCourse()` / `zaoMing()` —— **算法骨架** | ⭐ 照此结构重写 |
| 同上 → `…/vendor/fengshui/liqiCore.js` | 纯函数 | 紫白年入中、八宅命卦、纳音、三元龙、分金定位 | ⭐ |
| 同上 → `…/vendor/liureng/LRConst.js` | JS 表 | `GanJiZi`(寄宫)、`TianJiang`、5 套 `*Gui*`、`SignZiList`、`GanZiRestrain`/`GanZiBrother`/`GanZiAccrue`（克/比/生关系表）、`ZiList`/`YangZi`/`YingZi`/`WinnerZiList`/`SummerZiList` | ⭐**六壬主表源** |
| 同上 → `…/vendor/liureng/ChuangChart.js` | 类方法 | **九宗门判定序** + 伏吟/返吟/八专/别责/昴星/比用/涉害 各 `isXxx()` 实现 | ⭐⭐**九宗门权威参考** |
| 同上 → `…/vendor/liureng/LiuRengMain.js` | 导出函数 | 月将三派(`getYueJiangByMethod`)、岁差(`liurengAyanamsa`)、四课(`buildKeData`)、贵人顺逆、昼夜三档 | ⭐⭐ |
| 同上 → `…/vendor/dunjia/jinhanRiJia.js` | 逐日文本 | 金函玉镜日家奇门：日→12时辰 黄黑道值神 + 五不遇 + 截空 + 大吉时 | 可解析为表 |
| 同上 → `…/vendor/calendar/huangliDay.js` | 函数 | 黄历日课聚合（建除/黄黑道/宿/彭祖/胎神/冲煞/吉神凶煞/六曜/数九三伏） | 结构参考 |
| 同上 → `contracts/technique_provenance.json` | JSON | **每个技法的「算源声明」**：`compute_class` / `engines` / `endpoints` | ⭐⭐**判定真算法 vs 后端的唯一权威** |
| 同上 → `contracts/runtime_python_lock.json` | JSON | 内置 Python 运行时依赖锁（含 `kinliuren==0.1.2.9`、`cnlunar==0.1.9`、`sxtwl==2.0.6`、`ephem==4.1.5`、`astropy==7.2.0`、`kerykeion`、`flatlib`） | ⭐**依赖溯源** |
| `ChesterRa/mingpan` → `src/core/qimen/YinYangDunCalculator.ts` | TS 常量 | `JIEQI_JU_MAP`：24 节气 → 遁 + `[上,中,下]` 局数 | ⭐**局数第二源** |
| 同上 → `src/core/qimen/GongMapping.ts` | TS 常量 | `GONG_NAMES`(标准洛书宫)、`GONG_WUXING`、`DI_ZHI_GONG`、`CHONG_GONG_MAP`、`GAN_HE_MAP`(奇仪相合) | ⭐**索引基准（与 horosa 不同！）** |
| 同上 → `src/core/qimen/RotatingRule.ts` / `FlyingRule.ts` | TS | 转盘 / 飞盘规则 | 对照用 |
| 同上 → `src/services/daliuren/data/constants.ts` | TS 常量 | **六壬全表**：`TIAN_JIANG`、`YUE_JIANG_MAP`、`JIEQI_YUE_JIANG`(月将过宫)、`GAN_JI_GONG`(寄宫)、`GUIREN_START`(贵人)、`DAY_NIGHT_MAP`(昼夜)、`XUN_KONG`(旬空)、`LIUQIN_MAP`、`WUXING_RELATION`、`ZHI_CHONG`/`ZHI_XING`/`ZHI_HE`/`ZHI_HAI`、`RI_MA`、`BA_ZHUAN_DAYS`、`GAN_ZHI_SAME_POSITION` | ⭐⭐**最干净的一张表文件** |
| 同上 → `src/services/daliuren/calculators/{SanChuan,TianDiPan,SiKe,ShenSha}Calculator.ts` | TS 类 | 三传/天地盘/四课/神煞 实现 | ⭐⭐ |
| 同上 → `src/core/bazi/TrueSolarTime.ts` | TS 类 | **高精度真太阳时 + 均时差 + 日出日落 + 太阳位置**（自述源自寿星万年历） | ⭐⭐**真太阳时首选** |
| 同上 → `src/core/calendar/{astronomicalCalendar,solarTerms,SolarTermCalculator,SolarTermsCalculator,julian}.ts` | TS | 儒略日、太阳黄经、节气计算（**注意有两份 SolarTerm 实现**） | ⭐ |
| `Riki-1124/bazi-ziwei-qimen-paipan-mcp` → `src/jueshan_paipan_mcp/engines/bazi.py` | Python | `calc_eot`（低精度均时差）、`true_solar_time`、`birth_time_to_shichen` | ⭐**真太阳时第二源** |
| 同上 → `src/jueshan_paipan_mcp/utils.py` | Python | `CITY_LONGITUDE`（中国主要城市经度表）、`resolve_longitude`、`to_shichen` | ⭐ |
| 同上 → `engines/qimen.py` | Python | 奇门排盘（16.7KB） | 对照 |
| `hxd0818/qimen-dunjia` → `scripts/qimen.py` | Python | 时家奇门（置闰法）+ `PALACES`(标准洛书) + `SAN_QI_LIU_YI` + `EIGHT_DOORS` | 对照 |
| `SpenserCai/qimen-rs` → `crates/qimen-core/src/{engine,model,symbols,request}.rs` + `crates/qimen-calendar/src/{calculation,lunar,cycle,civil}.rs` | Rust | 奇门引擎 + 历法（`tyme4rs`） | 对照（MIT，可读性最好） |
| `banderzhm/ZhouYiLab` → `src/qi_men/qi_men.cpp` | C++ `constexpr array` | **24×3 局数表**(:75-79)、**定元闭式 `(60序%15)/5`**(:82-84)、`solar_term_name` 冬至起序(:48-54)、`yuan_name`、`jia_xun_name`、`strength_name`(7态旺衰) | ⭐⭐**定元首选** |
| 同上 → `src/qi_men/qi_men.cppm` | C++ 模块接口 | `Palace`(标准洛书宫数) / `Gate` / `Star` / `Spirit` / `Dun` / `Yuan` / `SolarTerm` 全套强类型枚举 + 文档注释 | ⭐⭐**数据结构蓝本** |
| 同上 → `src/da_liu_ren/da_liu_ren.cpp` | C++ | **九宗门派发 + 守卫条件**(:286-289, :343-351, :373-385, :403-406, :676-725)、伏吟三格(:426-428)、返吟二格(:551-554)、伏吟判据(:644-646)、涉害四格名(:696) | ⭐⭐⭐**九宗门首选** |
| 同上 → `src/da_liu_ren/{da_liu_ren_guati,da_liu_ren_xing_nian,da_liu_ren_shen_sha,da_liu_ren_types}.cpp(m)` | C++ | 课体 / 行年 / 神煞 / 类型 | ⭐ 待细读 |
| 同上 → `src/qi_men/analysis/{qi_men_judgment,qi_men_yong_shen,qi_men_analysis}.cpp(m)` | C++ | 奇门 断法 / 用神 / 格局分析 | ⭐ 待细读 |
| 同上 → `src/common/time/true_solar_time.cpp` + `src/common/tyme/{shou_xing_ephemeris,tyme}.cpp` | C++ | 真太阳时 + 寿星天文历星历 + tyme 历法 | ⭐⭐ |
| 同上 → `src/da_liu_ren/analysis/{da_liu_ren_lei_shen,da_liu_ren_structure}.cpp` | C++ | 类神 / 结构分析 | ⭐ |

---

## 7. 风险表 —— 必须重点交叉验证（按风险降序）

| # | 项目 | 风险 | 具体分歧/疑点 | 证据 |
|---|---|---|---|---|
| 1 | **六壬九宗门判定序 + 别责缺失** | 🔴🔴🔴 | **三仓库三种字面序**：horosa「伏吟→返吟→贼克→比涉→**八专**→遥克→**别责**→昴星」／mingpan「返吟→伏吟→**八专**→贼克→比涉→遥克→昴星」／ZhouYiLab「伏吟→返吟→贼克→比涉→遥克→**昴星**→**别责**→**八专**」。**但经我语义推演：horosa 与 ZhouYiLab 用不同机制（排序 vs 守卫条件）达成同一语义，二者可互证；mingpan 因完全缺 别责 而相异。** 另一坑：`mingpan` 昴星**阳日/阴日返回同一值**（阴日疑错） | `horosa …/liureng/ChuangChart.js:191-244`；`mingpan …/calculators/SanChuanCalculator.ts`；`ZhouYiLab src/da_liu_ren/da_liu_ren.cpp:286-289,343-351,373-385,403-406,676-725` |
| 2 | **奇门局数** | 🟢 **已定案** | **三独立源 24×3 逐项一致**（horosa `JIEQI2JU` / mingpan `JIEQI_JU_MAP` / ZhouYiLab `table`），且合通行歌诀 | 见 §A2 |
| 2b | **奇门定元 + 超神接气** | 🔴🔴🔴 | 「如何定元」流派差异极大（置闰阈值 8/9/10 天、无闰、拆补、茅山）；horosa 自述**对齐 kinqimen**、源码含多次「事故复盘」。**但符头分组本身已定案**（ZhouYiLab 闭式 + horosa 表一致） | `DunJiaCalc.js:103-142, 2207-2209, 2364-2389`；`ZhouYiLab qi_men.cpp:82-84` |
| 3 | **月将过宫** | 🔴🔴 | 三种口径（中气/节气/日躔含岁差）；horosa 用**太阳真实黄经 + Lahiri 岁差**，mingpan 用**固定节气表**（二者逐项一致）；`liuren-skill` 用**农历月**（错） | `LiuRengMain.js:3890-3943`；`mingpan …/daliuren/data/constants.ts`；`liuren-skill index.js:9-12` |
| 4 | **奇门入墓 —— 同仓库自相矛盾** | 🔴🔴 | `RU_MU_RULE` 把**乙归乾**，同仓库 `DunJiaBaGongRules.js:403`「三奇入墓」说**乙临坤**。丙/丁两处一致 | `DunJiaCalc.js:639-644` vs `DunJiaBaGongRules.js:403` |
| 5 | **奇门八神口径** | 🔴🔴 | 代码基串是正统（阳勾陈朱雀/阴白虎玄武），但**horosa 出厂默认 `baihu_xuanwu`（两遁恒虎玄）非正统**；**ZhouYiLab 亦采恒虎玄单序**（2:1 投票）。古籍主流仍为「按遁取神」 | `DunJiaCalc.js:219-231`；`ZhouYiLab qi_men.cppm:65-75` |
| 6 | **六壬贵人口径默认值** | 🔴 | 5 套口径，**默认 = 索引 2「星占法」而非「六壬法」**，二者在 戊/庚/辛/丁/癸 上取值不同 | `LRConst.js:57-170`；`LiuRengMain.js:3911, 3034` |
| 7 | **宫位索引基准不一致（极易写错）** | 🔴🔴 | `horosa` 的 `PALACE_NAME`/`JI_XING_RULE`/`RU_MU_RULE`/`MEN_PO_RULE` 用**环位**（1巽 2离 3坤 4震 6兑 7艮 8坎 9乾）；而 `CNUMBER`/`EIGHT_GUA`/`JIU_XING` 用**标准洛书**（1坎 2坤 3震 4巽 5中 6乾 7兑 8艮 9离）。**mingpan 与 ZhouYiLab 均统一用标准洛书** → 重写应统一到标准洛书 | `DunJiaCalc.js:378, 461-499, 611-655` vs `mingpan GongMapping.ts` vs `ZhouYiLab qi_men.cppm:22-41` |
| 8 | **奇门阴阳遁判据（时家 vs 日家）** | 🔴 | 时家用**节气名**，日家用**二至日期**；horosa 明确警告「节令在至界会滞后」 | `DunJiaCalc.js:384-385` vs `:1114-1138` |
| 9 | **真太阳时精度** | 🟠 | 三源精度差 1~2 个数量级：mingpan 用 Meeus 级数、ZhouYiLab 用寿星星历、paipan-mcp 用 `9.87sin2B−7.53cosB−1.5sinB` 近似（且 `round(eot,1)`）。**且基准经线硬编码 120°E** | `mingpan TrueSolarTime.ts`；`paipan-mcp engines/bazi.py:30-56`；`ZhouYiLab common/time/true_solar_time.cpp` |
| 10 | **三奇得使定义单源** | 🟠 | `DunJiaBaGongRules.js:360` 定义为「日干→奇」（甲己日丙奇…），仅单一来源，未见第二仓库/文献交叉 | `DunJiaBaGongRules.js:360` |
| 11 | **二十八宿「禽曜」缺失** | 🟠 | 已得宿名+四象+吉凶，但**禽曜表未核实** | `fengshuiData.js:223-233`；`su28/Su28Helper.js` |
| 12 | **紫白月/日/时起星缺失** | 🟠 | 只有年入中公式 | `liqiCore.js:146-159` |
| 13 | **五运六气完全缺失** | 🔴 | 9 仓库均未找到 | — |
| 14 | **旺衰状态数不一致** | 🟠 | horosa 用 5 态（旺相休囚死），ZhouYiLab 用 **7 态**（`"旺","相","休","囚","废","死","未判"`）→ 断语口径会对不齐 | `ZhouYiLab qi_men.cpp:64-67` vs `DunJiaCalc.js:533-539` |

---

## 8. 架构结论（horosa-skill vs mingpan）

### horosa-skill = **不是纯离线 JS 算法库，而是「编排层 + 内置 Python/Java 运行时」**

**关键证据（全部来自 `contracts/technique_provenance.json` 的 `compute_class` 枚举与 `tools` 声明）**
```json
"qimen": { "compute_class": "ken_backed", "engines": ["kinqimen", "local_route_calcDunJia"],
           "endpoints": ["/jieqi/year","/nongli/time","/qimen/pan"],
           "notes": "ken 后端算、JS 只格式化；…runner 必须调 _require_ken_pan" }
"taiyi": { "compute_class": "ken_backed", "engines": ["kintaiyi"], "endpoints": ["/nongli/time","/taiyi/pan"] }
"liureng_gods": { "compute_class": "headless_js", "engines": ["liureng"], "endpoints": ["/chart","/liureng/gods","/liureng/runyear"], "notes": "纯 headless JS，无后端引擎" }
"tongshu": { "compute_class": "headless_js", … }
"huangli": { "compute_class": "headless_js", … }
"jinkou":  { "compute_class": "ken_backed", "engines": ["kinjinkou","local_route_buildJinKouData"] }
```
`_classes` 里另有明确的两类后端：
```json
"java_backend": "Java 聚合层（:9999）计算，Python 只转发与排版",
"ken_backed":   "ken 后端算、JS 只格式化；…runner 必须调 _require_ken_pan"
```
**内置运行时锁**（`contracts/runtime_python_lock.json`）：`python: 3.12`，含 `kinliuren==0.1.2.9`、`cnlunar==0.1.9`、`sxtwl==2.0.6`、`ephem==4.1.5`、`astropy==7.2.0`、`kerykeion==5.12.8`、`flatlib==0.2.3.post3`、`CherryPy`、`uvicorn`、`streamlit`。并有 `scripts/build_runtime_release_{windows,linux}.py` 与 `scripts/runtime_templates/windows/java/horosa/offline/LocalCacheFactory.java`。

**逐技法判定**：

| 技法 | 真算法 or 外部服务 | 结论 |
|---|---|---|
| **奇门** | **默认走 Python `kinqimen`**（本地进程，非远程 HTTP）；`local_route_calcDunJia` 仅在**非默认选项**时启用 | `isQimenLocalRoute(options)`（`DunJiaCalc.js:1221-1225`）返回 true 才走本地 JS。**`DunJiaCalc.js` 是「本地兜底/实验路由」，不是主算法。** |
| **太乙** | **完全走 Python `kintaiyi`**，仓库内无算法 | 见 §C |
| **六壬** | `headless_js`（本仓库 JS 实现） | **真算法**；但月将需星历（`/chart` 取太阳黄经） |
| **通书 / 黄历 / 择日** | `headless_js` | **真算法**，本仓库最干净 |
| 金口诀 | 默认 `kinjinkou` | 外部 |
| 八字 / 紫微 | 本地 `lunar-javascript` 优先，回退 Java `/bazi/*`、`/ziwei/birth` | 混合 |

**许可证**：仓库 **AGPL-3.0**。⚠️ **AGPL 与「内置第三方引擎」叠加使用时，`kinqimen`/`kintaiyi`/`kinliuren`/`sxtwl`/`cnlunar` 各自另有许可证（未逐一核实），重写时不能假定可自由取用。** 另：`mingpan` 的 `daliuren/data/constants.ts` 注释自述「参考来源：kentang2017/kinliuren (MIT License)」——**kinliuren 为 MIT**，这一点对我们是好消息。

**离线？** 是。所有后端都是**本地进程**（bundled runtime），无远程 API 调用。但对我们的重写而言，**它是「包装器」而非「算法参考」**——真正可抄的是 `DunJiaCalc.js` / `ChuangChart.js` / `fengshui/` 这些本地 JS 实现。

### mingpan = **真算法，Apache-2.0，可直接参考**

- `package.json` dependencies 仅 4 个：`@modelcontextprotocol/server`、`iztro`（紫微）、`lunar-javascript`（历法）、`zod`。**无任何 HTTP 客户端 → 纯本地计算。**
- 自带 `src/core/qimen/`（转盘 `RotatingRule.ts` / 飞盘 `FlyingRule.ts` / 阴阳遁 `YinYangDunCalculator.ts` / 宫映射 `GongMapping.ts`）与**完整大六壬** `src/services/daliuren/`（四课/三传/天地盘/神煞 四个 Calculator + `data/constants.ts`）。
- 自带**高精度真太阳时**与太阳黄经（`bazi/TrueSolarTime.ts`，自述「Implements algorithms from 寿星万年历」）。
- `wrangler.toml` + `deploy:worker` 脚本 → **具备**部署为 Cloudflare Worker（远程 MCP）的能力，但**算法本体在本地**，且 `smoke:stdio` 本地 stdio 模式为主。
- **许可证 Apache-2.0**（`LICENSE` 文件实测存在，正文为 Apache License 2.0）→ 参考/移植的许可风险最低。
- ⚠️ 其 `daliuren` 自述参考 `kentang2017/kinliuren (MIT)`，与本仓库 Apache-2.0 兼容。

> **对本次重写的建议**：**以 mingpan 的表为骨架**（索引基准统一、表文件干净、许可证友好），**用 horosa 的 `ChuangChart.js` 判定序 + `DunJiaBaGongRules.js` 格局字典补其算法深度**，两家分歧处按 §7 逐条裁决。

---

## 9. 未核实清单（不得据本文落码）

1. **太乙神数全部内容**：积年算法、太乙行九宫、主客算数、计神/大将/参将起法。→ 唯一路径：直接研读 `kintaiyi`。
2. **五运六气**：岁运/司天在泉/客气加临。9 仓库均未找到。
3. **奇门「三奇得使」** 的通行定义与 `DunJiaBaGongRules.js:360` 是否一致（单源）。
4. **二十八宿「禽曜」**（宿配禽兽）表。
5. **紫白月/日/时起星**算法与飞布。
6. **彭祖百忌条文**（仓库内无表，值来自 `lunar-javascript`）。
7. **`banderzhm/ZhouYiLab`（★131, MIT）已解锁**（`cmd dir` 可绕过 Windows 长路径问题）。已读：`src/qi_men/qi_men.cpp`（局数表 + 定元闭式）、`src/qi_men/qi_men.cppm`（宫/门/星/神/节气枚举）、`src/da_liu_ren/da_liu_ren.cpp`（九宗门派发 + 守卫 + 伏吟/返吟/涉害格名）。
   **仍待细读**：`src/da_liu_ren/da_liu_ren_guati.cpp`（课体）、`da_liu_ren_xing_nian.cpp`（行年）、`da_liu_ren_shen_sha.cpp`（神煞）、`da_liu_ren_types.cppm`（数据结构）、`src/qi_men/qi_men_pan.cpp`（排盘全流程）、`src/qi_men/analysis/*`（格局/用神/断法）、`src/common/time/true_solar_time.cpp`、`src/common/tyme/shou_xing_ephemeris.cpp`。**该仓库是本次最值得追加投入的未读完对象。**
8. **`Sudo-Biao/Chinese-Metaphysics-Platform`** 的 `core/constants.py`(33.6KB)、`api/date_selection.py`、`api/qimen.py` 未逐行读完 → 其择日/五运六气覆盖度未知。
9. **六壬行年/年命**算法本体（入口已知：`ZhouYiLab src/da_liu_ren/da_liu_ren_xing_nian.cpp`；horosa `liureng_runyear`）**未逐行读**。
10. **`mingpan` 的两份节气实现**（`core/calendar/solarTerms.ts` 17.7KB 与 `SolarTermCalculator.ts` 11.9KB、`SolarTermsCalculator.ts` 4.4KB）关系与优先级未核实 —— 重写节气模块前应厘清。
11. 各仓库 **LICENSE 未逐一核实**：`hxd0818/qimen-dunjia`、`dglijin-oss/liuren-skill`、`banderzhm/ZhouYiLab`、`Enoch666/suanming-mcp`、`Riki-1124/bazi-ziwei-qimen-paipan-mcp`、`Sudo-Biao/Chinese-Metaphysics-Platform` 我未读 LICENSE 文件内容。

---

## 10. 落码优先级建议

1. **零风险直接落码**（三源一致 / 双源一致 + 已手工验算）：**奇门局数表(A2, 三源)**、**三元定元闭式(A3b)**、地盘三奇六仪(A5)、值符随时干/值使随时辰(A6)、天盘平移(A8)、门迫(A12)、六仪击刑(A12)、旬空(A11)、驿马(A11)、日干寄宫(B3)、十二天将序(B5)、贵人表(B5)、贵人顺逆(B5)、月将过宫查表(B1)、建除十二神(D1)、黄黑道十二神(D2)、二十八宿吉凶(D3)、紫白年入中(D4)、三煞/岁破/十二岁君神(D6)。
2. **需先做裁决再落码**：九宗门判定序(B4，建议**照 ZhouYiLab 的守卫条件机制**实现 —— 它把课经条文直接写成前置断言，比排序更不易错)、昴星阴日取法(B4)、入墓口径(A12)、八神口径(A12)、贵人口径(B5)、宫位索引基准(§7#7，**统一到标准洛书**)、旺衰态数(§7#14)。
3. **需补算法**：太乙(§C)、五运六气(§D5)、紫白月日时(D4)、二十八宿禽曜(D3)。
4. **需自备天文**：月将（太阳黄经）→ 建议移植 `mingpan TrueSolarTime.ts` + `astronomicalCalendar.ts`（Apache-2.0）或 `ZhouYiLab shou_xing_ephemeris.cpp`（MIT）——**两者许可均友好**。
5. **建议追加投入**：细读 `ZhouYiLab` 的 `da_liu_ren_guati.cpp`（课体）、`da_liu_ren_xing_nian.cpp`（行年）、`qi_men_pan.cpp`（排盘全流程）、`qi_men/analysis/*`（断法/用神）—— 这是本次**质量最高且尚未读完**的仓库（MIT，可自由借鉴）。

### 许可风险提示（重写选型）
- **AGPL-3.0**：`horosa-skill` → 若本项目非 AGPL，**不可直接复制其代码**（可参考思路/表值，表值本身是公有领域古法）。
- **Apache-2.0**：`mingpan` → 可安全移植（需保留 NOTICE/声明）。
- **MIT**：`qimen-rs`、`ZhouYiLab` → 可安全移植（保留版权声明）。
- **未核实许可**：`qimen-dunjia`、`liuren-skill`、`suanming-mcp`、`paipan-mcp`、`Chinese-Metaphysics-Platform` → **移植前必须查 LICENSE**。
