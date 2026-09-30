# dsh-divination-108 · 108 术数合盘

一次调用，在**本地程序化**算完 108 种术数，返回一张压缩合盘。

> 核心取舍：术数最贵的是**推演**——装卦、起局、发三传、取用神，靠模型在思维链里
> 硬算又慢又贵还容易错。本插件把这 108 法全部写成确定性算法，模型只读合盘。
> 108 法明细约 **1.2–1.8k token**，而模型自己推演其中任何一法都不止这个量。

---

## 安装（DSH 宿主插件）

本包是一个 **DSH 宿主插件**（同时含客户端悬浮窗），不是独立程序。

```bash
# 1) 放到你喜欢的目录并 clone
git clone https://github.com/sixtysevenlf/dsh-divination-108.git D:/DSH/plugins/dsh-divination-108
```

```jsonc
// 2) 在 profile 的 package.json（如 ~/.dsh/profiles/desktop/package.json）里加两处：
{
  "dependencies":  { "dsh-divination-108": "link:D:/DSH/plugins/dsh-divination-108" },
  "dsh": {
    "profile": { "bundles": ["...", "dsh-divination-108"] }   // ← 名字要在这里
  }
}
```

3) **重启 DSH**。右下角会出现 `☯ 术数合盘` 胶囊；模型侧则多出 `divine` /
`divine_detail` / `divine_list` 三个工具。

`dsh.profile.bundles` 里**必须有本包名** —— 否则 `cordis.patch.yml` 不会被应用，
插件根本不会装配。这是最常见的「装了没反应」原因。

**依赖**：`vendor/lunar.cjs` 已内置（农历/节气），不需要 `npm install`。

## 自检

```bash
node test/smoke.mjs      # 引擎层：108 法合规、确定性、合盘聚合、诚实性标注、token 预算
node test/host.mjs       # 宿主层：工具 schema、HTTP 端点、agent 循环、消息体形状、挂起保护
node test/client.mjs     # 客户端：bundle 包壳、插槽注册、渲染压力、交互流程
node test/validate-preset.mjs   # 装配：顶层插件行 / dsh.client / 技能 / profile
```

四套共 360+ 项断言，全部只用 Node 内置模块，**不需要浏览器、不联网**。

---

## 它给你什么

模型调一次 `divine`，拿到：

```
【求占 #1】
【108法合盘】这次和张三的合作能不能成
时刻 2026-09-30 14:30 丙午 丁酉 丁未 丁未 ｜ 农历 二〇二六年八月二十 ｜ 起 108/108 法
归类「事业」（命中：合作）—— 相关术法已加权

◆ 综合：小吉 +18.4 ｜ 一致性 0.42 ｜ 置信 0.42 ｜ 覆盖 1
◆ 票型：吉 31 ｜ 平 46 ｜ 凶 31
◆ 五行：木12.3% 火18.1% 土21.4% 金30.2% 水18.0% → 金旺 木缺
◆ 断语：合盘总断【小吉】（加权分 +18.4）；诸法中上一致，结论可参考；吉 31 / 平 46 / 凶 31；…
◆ 共识：官鬼动×9法(+21)、体克用×5法(+15) …
◆ 应期：7日内×12法、酉日×8法 …
◆ 分类：易卦+12 三式-5 命理+30 择时+8 风水+3 签卜+15 杂占-2 姓名+11 相术-4 西方+6
◆ 分歧：三式：奇门遁甲·时家+72 ↔ 太乙神数·九宫-68（差 140）
◆ 保真：全算法 36 ｜ 核心算法 50 ｜ 近似 22

━━ 108 法明细（按编号）━━
001 大衍筮法        ○    +42 泽火革之雷火丰·体离用巽我生
002 金钱卦          ○    +38 水火既济之山水蒙·动三爻
003 六爻纳甲        △    -18 泽山咸(兑宫三世) 妻财失令
…
108 卢恩符文        ·     +3 ᚷ Gebo·吉弗·正位·赠与之象

━━ 下钻 ━━
divine_detail(method="奇门遁甲·时家") 或 divine_detail(no=31) 看某法完整盘
```

**不下钻不花 token**：`divine_detail` 只在需要时才展开某一法的完整盘。

---

## 三个工具

| 工具 | 作用 |
|---|---|
| `divine` | 求占主入口。一次算完 108 法，返回合盘。 |
| `divine_detail` | 展开某几法的完整盘（名称 / id / 编号，可多选）。 |
| `divine_list` | 列 108 法目录，标出保真度。 |

斜杠命令：`/占 <所问之事> [生日 YYYY-MM-DD] [经度 116.4]`

### `divine` 参数

| 参数 | 说明 |
|---|---|
| `question` | **必填**。所问之事。写具体——它决定术法加权与取用神。 |
| `when` | 求占时刻 `YYYY-MM-DD HH:mm`（本地时间）。缺省当前。 |
| `longitude` | 经度（东经正）。给了才做真太阳时校正。 |
| `birth` | 出生资料 `YYYY-MM-DD HH:mm`。命理类需要；缺了记「未起」。 |
| `gender` | `男` / `女`。 |
| `numbers` | 报数（梅花报数卦、测字笔画）。 |
| `coins` | 六爻钱面回放：六个 `6/7/8/9`。 |
| `scope` | `all` / `category:命理` / `module:yijing` / `ids:daliuren,qimen-shi` / `no:1,2,3` |
| `format` | `brief`（最省）/ `normal`（默认）/ `full` / `table` |
| `detail` | 一并展开完整盘的法，如 `奇门遁甲,31` |
| `seed` | 复现种子。传上次返回的 `seed` 得完全相同结果。 |

---

## 108 法分类

| 类 | 数 | 内容 |
|---|---|---|
| 易卦 | 24 | 大衍筮法、金钱卦、六爻纳甲、世应六亲、梅花（时间/报数/外应/字占/体用）、京房八宫、火珠林、文王卦用神、焦氏易林、太玄、元包、潜虚、皇极经世、河洛理数、灵棋经、先天易数、大象占、爻辞占、之卦占、互卦占 |
| 三式 | 11 | 奇门（时/日/月/年家、转/飞盘、局数法）、大六壬（四课三传/课体/十二天将）、太乙神数 |
| 六壬 | 5 | 小六壬、中六壬、金口诀、马前课、三传九宗 |
| 命理 | 18 | 八字（排盘/旺衰/十神/用神/大运/神煞）、纳音、十二长生命宫、紫微（安星/四化/三方四正/大限）、七政四余、五星占、二十八宿命度、称骨、河洛命卦、生肖 |
| 择时 | 14 | 黄历宜忌、建除、二十八宿、黄黑道、董公、杨公十三忌、五运六气、太岁三煞、紫白九星、奇门择时、六曜、十二值神、择吉时、综合择日（未来 30 日排序） |
| 风水 | 10 | 八宅、玄空（运盘/山向）、三合二十四山、三元三般卦、九星水法、阳宅三要、形势四灵、罗盘二十四山、六十分金 |
| 签卜 | 8 | 观音/关帝/月老/吕祖/黄大仙/妈祖/车公灵签、掷筊 |
| 杂占 | 8 | 米卦、测字（笔画/拆字）、周公解梦、鸟占、眼跳、喷嚏、五音 |
| 姓名 | 4 | 五格剖象、三才配置、生肖姓名、八字姓名补益 |
| 相术 | 2 | 面相十二宫、手相掌纹 |
| 西方 | 4 | 西洋占星（本命/合盘）、塔罗三牌阵、卢恩符文 |

---

## 保真度（诚实声明，输出里带标记）

| 档 | 含义 | 例 |
|---|---|---|
| `full` 全算法 | 公开算法完整实现 | 历法、六爻纳甲、梅花、小六壬、称骨、掷筊、二十八宿 |
| `core` 核心算法 | 核心公开算法，部分细节按通例取值 | 奇门局数、六壬课体、紫微安星、玄空飞星 |
| `approx` 近似 ⚠ | 缺秘传表或辞书，按公开可推部分计算 | 铁板类神数、七政四余（无星历表）、签诗辞、面相手相（无图像输入） |

**本插件刻意不做的事**：
- **不伪造签诗原文**——签诗引擎出签号、签级、卦象与断语；要签诗全文请自备签谱。
- **不伪造秘传条文**——称骨歌、太玄首辞、易林林辞、灵棋课辞等未内置原文，只用公开可推的部分。
- **不伪造星历表**——七政四余与西洋占星用平均黄经近似，误差写在 `detail.说明` 里。
- **不伪造图像**——面相/手相无图像输入，按通例随机取相并明确标注「仅供娱乐」。

### 未报输入必须标注（硬规则）

有些术法要一个**现实输入**：外应（眼跳/喷嚏/鸦鸣方位）、所测之字、姓名、坐向。
用户没说时，插件**不会把它装成用户给的**，而是：

1. 照常出结果（保证 108 法都能起）；
2. 在 `essence` 前加标记：`未报外应·取象：` / `未报所测之字·取象：`；
3. 把该条 `fidelity` 降为 `approx`（输出里带 ⚠）；
4. 在 `detail` 里写清「取象来源」与如何给出真实输入。

例：
```
093 测字·拆字  未报所测之字·取象：这·体辶(木)用辶(木)克我   ⚠
095 鸟占       未报外应·取象：西方未时鸦鸣·大吉，喜信或财至   ⚠
096 眼跳占     未报外应·取象：左眼未时跳·有酒食              ⚠
103 面相十二宫 无图像输入，按通例随机取相，仅供娱乐            ⚠
```
用户报了输入则不加标记、保真度按注册表（如「左眼一直跳，是凶是吉」→ #96 不标取象）。

---

## 确定性

同一个「问题 + 时刻 + 经度 + 法号」必得**同一结果**：所有随机数由
`hash32(问题|时刻|经度|法号)` 派生。因此：

- 同问同刻重复求占，结果逐字相同（可复核）；
- 换问题或换时刻，随机类术法（易卦、签卜、塔罗…）结果改变；
- 纯历法类术法（黄历宜忌、建除、二十八宿…）**不随问题改变**——这是正确的；
- 想复现某一次：把返回的 `seed` 传回 `divine`。

---

## 装配方式：一条**顶层插件行**（不依赖预设）

本插件由 profile 里一条**顶层 Loader 行**装配：那一行同时提供
三个工具（`divine` / `divine_detail` / `divine_list`）、那段「问卜一律先调 divine」
的系统提示、以及右下角的悬浮窗端点 —— **所有会话可用**，不需要先选某个预设。

> 历史：最初的设计是「术数断者」预设（只在选中该预设的会话里启用工具），
> 那条 preset 行仍留在 `cordis.patch.yml` 里但已 `disabled: true`（见下文
> 「为什么必须是顶层行」）。

### 实现方式（本机实测结论，重要）

`~/.dsh/.agent-presets/<id>/` 那套 **legacy 预设目录已经不再被读取**：
在 `app.asar` 全文里 `agent.cordis.yml` 只出现 1 次，且就在文档文本中，**没有任何
运行时代码引用它**。旧格式预设之所以还能用，只是因为它们早已冻结在 profile 的
`cordis.yml` 里。

因此本插件走**官方声明式路径**：

```
dsh-divination-108 在 profile 的 dsh.profile.bundles 里
        │
        └─ 应用本包的 cordis.patch.yml
                │
                └─ 只插入一条  preset-divination  声明
                   （name: '@deepseek-ai/dsh-agent-preset'）
                        │
                        └─ config.plugins 里含
                           - id: dsh-divination-108 / name: dsh-divination-108
                           - persona / tool-bash / pwsh / fs / skills /
                             compaction / ask-user / web / present
```

**关键点**：bundle 层**不注册任何宿主级插件行**。本包的代码只在预设被会话选中时
才装配 —— 这就是「只有进入那个预设才启用」的实现。`preset-<id>` 的行 id 按约定为
`preset-divination`。

### 装在哪三处

| 位置 | 内容 | 作用 |
|---|---|---|
| `~/.dsh/profiles/desktop/package.json` · `dependencies` | `"dsh-divination-108": "link:D:/DSH/plugins/dsh-divination-108"` | 让裸包名**可解析**（preset 内的插件行按名字找它） |
| 同上 · `dsh.profile.bundles` | `"dsh-divination-108"` | 让本包的 `cordis.patch.yml` 被应用 → **声明**预设 |
| `~/.dsh/profiles/desktop/node_modules/dsh-divination-108` | junction → 插件目录 | 解析落地 |

然后**重启 DSH**（composition 在启动时合成），新建会话时选「术数断者（108 法合盘）」。

装配自检（不需要重启）：

```bash
node test/validate-preset.mjs     # 35 项：patch 结构 / preset 声明 / 裸包名 / !!js 位置 / 技能 / profile / legacy
```

它会用 **DSH 自带的 yaml**（从 `app.asar` 抽出）解析 patch，逐条检查上面这条链。

### 四条装配纪律

1. **不要**再往 bundle patch 里插一条 `dsh-divination-108` 的宿主级插件行 ——
   那会变成全会话可见，并与 preset 内的同名行重复注册（宿主抛
   `tool "divine" is already registered`）。
2. bundle patch 里**不要把 `!!js` 写在序列项位置**（`- !!js ...`）：实测本机解析器
   对 `!!js` 只支持**标量位置**，写在序列上会让宿主启动失败。`customSkillDirs`
   因此用绝对路径标量；`disabled: !!js ...`（映射值位置）是安全的。
3. 预设内的插件行 `id` 要与模块导出的 `name` 一致（都是 `dsh-divination-108`）——
   同目录已验证过的 `hm-docs` 行就是这个规律。
4. 插件的硬 `inject` 只留 `tools` 与 `systemPrompt`（预设域必定可用）；
   `commands`（`/占`）与 `connection`（UI 面板端点）走**内部可选注入**。
   **不要**把它们加进 `inject` 数组 —— 那会让插件在预设域整体不激活。
5. **预设内那行必须用裸包名 `dsh-divination-108`，不能用文件路径。** 实测对比
   （`plugin_manager set_bundle` 触发热重载后查 `list_plugins`）：

   | 该行的 `name` | 结果 |
   |---|---|
   | `dsh-divination-108` | `include:preset-divination` 注册成功、`fiberPhase: active` ✅ |
   | `D:/DSH/plugins/dsh-divination-108/src/index.js` | 该行**注册不上**，花名册里根本没有 ❌ |

   这也是插件包**必须**留在 profile `dependencies` 里的原因（配合 node_modules
   junction，裸包名才解析得到）。注：同目录 harmonyos 预设的 `hm-docs` 行用的是
   路径，但那是 **legacy 目录**里的写法，不能外推到 bundle patch 声明的预设。

### 从 legacy 目录迁移（本包已完成）

若你手上还有别的 legacy 预设要迁：写一个 bundle，其 patch 按上面的结构插入
`preset-<id>` 声明，`config.plugins` 取 `agent.cordis.yml` 的内容，
`name`/`description`/`order` 取 `preset.yml`，`customSkillDirs` 改用包内绝对路径
（**不要**用 `!!js`）；装好后删除 legacy 目录。

---

## 胶囊悬浮窗（右下角）

形态**学提示词优化插件 `@dsh-external/dsh-po06`**：平常是右下角一颗**胶囊**
（`☯ 术数合盘`），点它才展开成面板。**一切都在面板里完成 —— 一个字节都不进主会话。**

### ⭐ 面板里像会话一样跑：模型自己起卦 → 自己联网 → 自己写判词

**一切都在面板里完成，一个字节都不进主会话。**

面板不再自己算卦、也不再让你填表确认。它做的只有一件事：**把插件自己的工具交给模型，
让模型像平时在会话里那样跑一轮** —— 一次请求跑完，返回最终的「综合判词」和那张合盘，
面板按现有排版展示（判词在最上 → 合盘总断 → 108 行逐条）。

一轮里的标准流程（与参考会话 `dsh-session-*.zip` 完全一致）：

```
divine（起卦，一次算完 108 法）
  → web_search（可多轮、换关键词）
  → divine_detail（下钻关键几法的完整盘）
  → web_fetch（读原文核对）
  → 停止调用工具，输出「综合判词」
```

所以端点只有一个：

| 端点 | 干什么 |
|---|---|
| `POST ?kind=agent` | **起一轮**：宿主侧跑真·工具调用循环（工具就是 `divine` / `divine_detail` / `web_search` / `web_fetch`）。**立刻返回 `{ sid, state:'running' }`，不 await** |
| `GET ?kind=agentpoll&sid=` | 取该轮进度：`{ state, steps, judgment, record, error }`；面板每 700ms 拉一次，跑完后再保留一次供取走 |
| `POST ?kind=run` | 没选模型时的退化路径：本地直接起卦（没有判词） |
| `POST ?kind=webprobe` | 联网自检（面板一勾「联网」就测，失败原因直接显示） |

**面板对新旧宿主都兼容**：若 `kind=agent` 首个响应就不是 `running`（旧宿主整轮跑完才回），
面板直接收尾、不去轮询不存在的端点；等待期间标题会一直在跳「已等 Ns」，跑着也看得出心跳。

### 🧙 面板里的系统提示词 = 最初那份「术数断者」预设人设

用户最初要的是「插件**和预设**」，那份预设的人设原本写在 `cordis.patch.yml` 的
`preset-divination` 里（`@deepseek-ai/dsh-persona` 的 `prefix` + `suffix`，26 条）。
预设行后来停用、插件改成顶层行，那段人设**没有丢** —— 它被**注入进面板**，成为面板里
那一轮 agent 的 `system`（`AGENT_SYSTEM`），逐字保留：

- 【一 · 铁律：推演只走工具】—— 严禁在思维链里装卦/起局/发三传/排八字，**一切走 `divine`**
- 【二 · 转述纪律】—— 如实转述分歧、⚠ 必须标注为近似、不给合盘"加料"
- 【三 · 输入纪律】—— 出生资料绝不臆造、`seed` 复现、经度与真太阳时
- 【四 · 语气与体量】—— 断语要具体（"官鬼持世而月令泄气…"而非"运势一般"）
- 【五 · 边界与责任】—— 仅供参考、医疗法律投资必提示、**不利用焦虑强化依赖**
- 【六 · 会话开场】—— 直接起卦，不要先问一堆

后面接一节**【面板环境】补充**，并写明「与上面冲突时以本节为准」，因为面板的交付形式不同：

- 面板**自己排版**展示合盘（总断/票型/五行/共识/应期/分歧/108 行），所以模型**不要**罗列明细；
- 面板**没有**问用户的工具 → 缺资料靠 `web_search`/`web_fetch` 查证，查不到就如实说明；
- 交付物**只有**「综合判词」那一段（骨架照抄，数字照抄合盘，时间窗只能用合盘的应期）。

人设里点名的 `divine_list` 也补进了面板工具集（`divine` / `divine_detail` / `divine_list`
+ `web_search` / `web_fetch`），所以人设说的工具**都在**，不会有对不上的地方。

### ⏭ 卡住的调用**直接跳过**（像会话里一样），不是冻住整轮

「不设任何限制」不等于「可以被一次卡住的网络调用冻死」。所以每一次**单次调用**都有
一个挂起上限，超时就按**「已跳过」**返回一条 `isError` 工具结果，模型接着往下走 ——
这与会话里工具调用超时的语义一致：

| 调用 | 挂起上限 | 超时后 |
|---|---|---|
| `web_search` / `web_fetch` | 20s | `（已跳过这次检索：联网检索卡住超时（20 秒未返回））` |
| `divine` / `divine_detail` / `divine_list` | 60s | `（已跳过这次 divine：…）` |
| 单次模型流的**空闲** | 90s | 90 秒没有新 chunk 就判连接死了，整轮以可读错误结束（不静默冻住） |

**这不是次数限制**：模型想做多少次动作都行（`maxSteps/maxSearch/maxRepeat = 0`）。
上限只针对「**一次**调用等了多久」，可用 Config 的 `hangGuardMs: { web, tool, llm }` 覆盖。

配套的可见性：轮询响应里带 `phase`（`模型思考中…` / `检索/读取中：web_search` /
`执行工具：divine` / `收束中…`），面板标题因此显示成

```
执行过程（7 步 · 已等 42s · 检索/读取中：web_search）
```

一眼就能看出它是在**真的干活**，还是卡在哪一步。

### 🚫 不设任何限制：让模型放开跑

`AGENT_LIMITS` 的三项**默认全为 0（不限）**：

| 项 | 默认 | 含义 |
|---|---|---|
| `maxSteps` | `0` | 不限模型调用轮数 —— 跑到它自己停止调用工具为止 |
| `maxSearch` | `0` | 不限检索次数 |
| `maxRepeat` | `0` | 不判定「重复检索」 |

代码里这三处判断都写成 `X > 0 && …`，所以 0 就是彻底不限制。
**代价是要靠用户喊停**：所以面板上「起卦」在跑起来之后**同一个按钮变成「停止」**，
点它走 `POST ?kind=agentcancel&sid=` → 宿主 `abort()` 该轮，轮询随即退出。
客户端**没有**任何超时（原来那 6 分钟上限已删）。

`ttlMs` / `maxSessions` 仍留着，但它们只是**内存卫生**（防会话堆积），而且
**正在跑的会话绝不回收** —— 不是任务限制。

**为什么要拆成两段**：一轮要跑好几轮工具调用（起卦 + 联网 + 下钻），几十秒很正常。
如果 `kind=agent` 直接 await，面板在整轮跑完之前只能显示「执行过程（0 步）」——
中间什么都看不到。所以改成**宿主后台跑 + 面板轮询**：每搜一次、每起一次卦，
步骤立刻出现在「执行过程」里。

面板展示：

- **`judgment`** → 最上方的「AI 综合判词」块；
- **`record`** → 合盘总断 + 五行 + 共识 + 应期 + 分歧 + **108 行逐条**（点行下钻）；
- **`steps`** → 「执行过程」流水：`☯起卦 / 🔎下钻 / 🔍检索 / 📄读页 / 📝判词`，
  每一步带得分/条数，看得见模型这一轮到底做了什么。

### 🧱 真趟过「消息体形状」这个坑（字段级，全部来自类型声明）

早先我用「文本协议」（让模型吐 `{"action":"search"…}`）绕开了消息体，好处是稳，
代价是每做一个动作就要多一轮，而且没法用插件自己的工具。**现在按真实契约直接上工具调用**，
形状来自 `cordis_inspect_query` 的 `llm` 服务声明，不是猜的：

```ts
GenerateOptions   { provider, model, reasoningEffort?, messages, system?, tools?, signal? }
ToolSchema        { name, description, parameters: Record<string, unknown> }
StreamChunk       'tool-call-delta' { index, id, name?, argumentsDelta }
                  'block-end'       { index, block: ContentBlock }   // block.type === 'tool-call'
MessageBase       { id, content, source }              // ← 三个都必须给
AssistantMessage  { ...MessageBase, role:'assistant', source:{kind:'model',provider,model,replayState?} }
ToolResultMessage { ...MessageBase, role:'tool', source:{kind:'tool',callId}, toolCallId, isError? }
FinishReasonMap   'tool-calls' | 'stop' | 'max-tokens' | 'aborted' | 'error'
```

三条容易踩的细节，测试里断言到字段级：

1. **`messages[0]` 用 `RequestUserInput`**（`{role:'user', content}`，**不带 id/source**）——
   声明里就写着 `id?: never; source?: never`。
2. **assistant 消息必须带 `id` + `source:{kind:'model',provider,model}`**，
   并把 `finish` 块里的 `replayState` 一起带上（适配器回放自己的响应要用）。
3. **tool 消息的三个关联字段都要对**：`role:'tool'` + `source:{kind:'tool',callId}`
   + `toolCallId`，且与那次调用的 `ToolCallBlock.id` 一致，`content` 是文本块。

`divine` / `divine_detail` 由 `panelExecTool()` **直接调插件自己的实现**
（和工具注册走同一条代码路径，`runDivine` / 下钻逻辑），不走工具注册表 ——
省一层，而且面板与所属会话无关。工具调用块的两处来源都收：`block-end.block`（整块）优先，
没有就用 `tool-call-delta` 的 `argumentsDelta` 拼（缺 `id`/`name` 的丢弃）。

**没开联网时** `web_search` 返回 `isError` 的工具结果（「联网未开启…请凭合盘与所问之事
直接给出判词」）而不是抛错 —— 模型读得到、能改道，循环不崩。

### 🛡 模型输出不可信：`kind=plan` 后必须白名单校验

模型填的资料会被**直接送进起卦**，所以 `parsePlan()` 逐项校验，不合格**一律丢弃**
（宁可按默认值算，也不能拿脏数据去算）：

- `when` / `birth`：必须匹配 `YYYY-MM-DD HH:mm` 且是**真实日期**（`Date.parse` 不为 `NaN`）
- `gender`：只接受 `男` / `女`
- `longitude`：必须是 `-180..180` 的有限数
- `numbers`：只留 `1..9999` 的整数，最多 12 个

「绝不臆造」既是提示词里的硬纪律（`PLAN_SYSTEM`），也是校验层的默认行为：
**编一个生辰等于编出一整套命盘**，这是本插件最不能犯的错。

### 🌐 联网：可用性必须可见，读到的资料必须能**填进框**并流进判词

踩过三个坑，都是「静默」或「过度保守」造成的：

1. **失败被吞掉。** `searchContext()` 原本在「拿不到 `web` 服务」时返回**空备注**，
   面板于是什么都不显示 —— 看起来就是「联网没生效」，用户没法学判断是没配搜索提供方、
   还是查询没结果。现在每一种「没搜成」都有可读原因：
   `宿主未提供 web 服务（ctx.get("web") 为空）` / `检索词为空，未联网` /
   `联网检索没有返回结果` / `联网检索失败：<WebError 原文>`。
2. **资料一落卦就丢。** plan 读到的关键事实原来只活在面板状态里，`kind=run` 之后
   就没了 —— 判词那一步看不到，等于联网白搜。现在它能**随卦存下**（`record.notes`），
   并通过 `buildBoardBrief()` 进入判词简报的「起卦时整理的背景」段。
3. **⭐ 明文禁止从联网资料填框**（最要命的一条）。我起初在 `PLAN_SYSTEM` 里写了
   「外部资料**不能**用来填 `birth`/`gender`/`numbers`」，于是模型即便搜到了
   「DeepSeek 成立日」这类明确日期也不会填 —— 结果就是**命理类那 18 法永远起不来**，
   用户看到的是「缺出生资料 · 未起」。

现在第 3 条改成：**可以填，但每条都必须交代来源**，而且这条纪律**在数据层强制**，
不指望模型自觉：

| 框 | 能否从联网资料填 | 规则 |
|---|---|---|
| `birth` | ✅ | 资料给出**明确日期**时（人物生辰 / 公司成立日 / 产品立项日 / 首发日）。公司/产品这类请在 `birthFrom` 里写「**取象：以 X 之日为生时**」 |
| `longitude` | ✅ | 资料给出地点时填该地经度，并写 `longitudeFrom` |
| `gender` | ✅ | 资料明确写出人物性别时才填，并写 `genderFrom` |
| `when` | ❌ | **永远不从外部资料填** —— 求占时刻就是「现在」，不是新闻里的日期 |
| `numbers` | ❌ | **永远不从外部资料填** —— 报数是求占人当场报的数 |

`parsePlan()` 里对 `birth`/`gender`/`longitude` 三项**强制要求对应的 `*From`**：
`birth` 形状不对、或写了 `birth` 却没写 `birthFrom` → **该项直接丢掉**
（最危险的一种是「编出来的生辰」，宁可少一项资料，也不要不交代来源的资料）。

同时：

- **`POST ?kind=webprobe`（联网自检）** —— 不花模型 token 就能知道能不能用。面板一勾
  「联网」就自动打它，结果直接显示成 `联网：自检可用（取到 3 条）` 或
  `联网：自检失败：WEB_PROVIDER_UNAVAILABLE…`（红色）。
- **plan 新增 `context`** —— 模型把「外部资料里**明写**的、与所求之事直接相关的事实」
  整理成一段（关键时间点、官宣口径、与所求印证/冲突的硬信息），每条都要能对上来源。
- **plan 回传 `attribution`** —— 每条被采用的资料的来源说明，面板**摊开给用户核对**
  （「资料出处（可自行改上面的框）」），并可随手改上面的框覆盖它。
- `attribution` 与 `context` 一起进 `record.notes`，所以判词能说出「这个生时是按成立日取象的」。

契约核对（`cordis_inspect_query` 的 host `web` 服务）：`search({query, maxResults?}, signal?)`
→ `{content?, sources[], truncated}`，`WebSearchSource = {url, title?, snippet?, publishedAt?}` ——
插件的调用与字段**逐项对得上**；会话里实测 `web_search` 也能取到结果，所以问题不在契约或提供方，
而在上面这三处。

### ⚠ 曾经的弯路：不要试图把问题「交给 agent」

我一度把面板做成「把结构化请求提交给当前会话的 agent」，结果连踩两个坑，最后整段拆掉 ——
记在这里免得再走一遍：

1. `ctx.remote` **在客户端 root 域根本不存在**。cordis 有服务守卫，未在 `inject` 声明的服务
   用属性访问会抛 `cannot get property "remote" without inject`；换成 `ctx.get('remote')`
   不抛了但**返回 undefined**。根因：客户端服务目录（`platform: client`）里只有
   `slots` / `sessions` / `theme` / `layout` / `locale` / `timer` / `uiWorkspace` / `workspaces`，
   `remote` 是 **agent 域**的（`AgentContext['remote']`）。
2. 于是退化成「把请求填进输入框，请按回车」—— 这既没做到「面板内完成一切」，
   又把内容发进了主会话，正是用户不要的。

结论：**面板只用 root 域自己的通道**（宿主 HTTP 端点 + `ctx.llm` / `ctx.web`），
不去够 agent 域的东西。现在客户端只注册 `shell.overlay` 一个槽，连会话探针都不挂 ——
少一个槽就少一类服务守卫的坑。

仍保留的防护：宿主侧 `ctx.logger` 一律走 `logLine()` 包一层 try/catch（`logger` 虽是内置
服务、通常可直接用，但**不值得赌**：一行日志把整个 `apply()` 带崩不划算）。宿主侧真实的服务
属性访问只有 `ctx.tools` / `ctx.systemPrompt`（都在 `inject` 里）、`cmdCtx.commands` 与
`connCtx.connection`（都在各自的 `ctx.inject([...])` 里）；`llm` / `web` 一律用 `ctx.get`。

```
┌────────────────────────────────────────────────────┐
│ 108 术数合盘   108法   [清空] [↻] [✕]                │   ← 头部
├────────────────────────────────────────────────────┤
│ [所问之事，例：这次合作能不能成（回车起卦）] [起卦]     │   ← 输入行
├────────────────────────────────────────────────────┤
│ AI 判词：[Alpha ▾][p-alpha-m1 ▾][高 ▾][☑联网] [重出判词]│   ← 模型/强度/联网
├────────────────────────────────────────────────────┤
│ ▍AI 综合判词                          ← 最上方，模型写的 │
│ 综合判词                                              │
│ 主断：会在 10 月成事，但首发是「开闸」而非「完全体」；   │
│   真正的年度大版本落在子月（11/7–2027/1/5），高峰 12 月中│
│                                                      │
│ 吉/平/凶 = 42/28/17，加权 +9.7，一致性 0.65 → 属「中平  │
│   偏吉、过程反复、结果成立」。                          │
│ 六爻纳甲 -99 与 之卦占 +65 的 164 分分歧，本质是「官宣这 │
│   条线（官鬼空亡、返吟）」与「事情本身这条线（大壮之泰）」│
│   的分歧 —— 即：发布本身会成，但官方定档消息会反复…      │
│ 火水未济 → 山水蒙 + 大畜 → 蛊：现在是「东西有了、光没出  │
│   来」，需要先整治打磨，然后才揭盖。                    │
│ 金旺水缺：现在是金（工具/工程/纪律）主导的月份…待水月方见│
├────────────────────────────────────────────────────┤
│ ● 合盘总断【平】+11   吉 59 · 平 19 · 凶 30            │   ← 程序化总断
│ ▍五行 / 多法共识 / 应期 / 最大分歧 / 108 法明细        │
└────────────────────────────────────────────────────┘
```

### AI 综合判词（模型读盘）

程序化合盘给的是分数与依据；**「主断」得由模型把合盘读成人话**。面板里可以直接选：

| 控件 | 说明 |
|---|---|
| **provider / model** | 从 `ctx.llm.listProviders()` / `listModels(provider)` 两级懒加载（模型列表可能要访问网络，不一次拉全） |
| **思考强度** | 从 `ctx.llm.resolveModelInfo(provider, model).reasoning.efforts` 读该模型**实际支持的档位**，默认取 `defaultEffort` |
| **联网** | 勾上则宿主先用 `ctx.web.search` 检索（查询词就是所问之事），把来源当上下文塞进提示词 |
| **重出判词** | 起卦后会自动生成一次；不满意可重算 |

输出的**判词骨架**在 `src/index.js` 的 `INTERPRET_SYSTEM` 里写死（用户指定）：

```
综合判词
主断：<什么时候成、成到什么程度、真正的节点落在哪，含时间窗与干支/日期落点>

吉/平/凶 = x/y/z，加权 ±n，一致性 c → 属「<定性>」。
<最大分歧> 的 <分差> 分分歧，本质是「<A 线>（依据）」与「<B 线>（依据）」的分歧 —— 即：<说明什么>。
<卦象链>：<怎么读>。
<五行旺缺>：<现在气机、待什么月转机>。
```

**防幻觉是硬约束**：提示词里写明「时间窗/干支/日期落点只能来自合盘里的应期与逐法明细，
合盘没给的一律不许出现」「每一个数字必须照抄合盘」，并禁止模型改动分数。

### 也绝不设 `maxTokens`

给模型调用**不传 `maxTokens`**，交给适配器/模型用它自己的默认上限。

踩过的坑：我原先写死 `maxTokens: 1600`，结果 `deepseek-flash` 是**推理模型** ——
它把预算全花在思考上：`finish=max-tokens`、`reasoning 字符数=2073`、正文**一个字都没有**。
报错看起来像「模型不返回文本」，其实是我把上限掐得太小。现在若真的撞到 `max-tokens`
且没有正文，错误会直接说明「正文被模型自身的输出上限截断，模型把 N 字用在思考上，
把思考强度调低再试」，而不是含糊的「没有返回文本」。

### 模型调用不设客户端超时（踩过的两个坑）

**坑一：`signal is aborted without reason`。** 面板通用请求超时是 15 秒，判词最初复用了它，
`controller.abort()` 又不带 reason，浏览器就把那句原文抛给用户 —— 完全看不懂。

**坑二：`模型没有返回文本`。** 旧的 `collectLlm()` **只收 `text-delta`**。而非流式（或回放）
路径下适配器**一个 `text-delta` 都不发**，正文只在 `block-end.block`（`block.type === 'text'`）
里 —— 于是正文为空，报「没有返回文本」。

现在：

- **判词不设超时**：`JUDGE_TIMEOUT_MS = 0`，`request()` 里 `ms > 0` 才建 `AbortController`。
  模型跑多久由模型决定，客户端只负责等（用户明确要求不要超时截断）。
  `kind=models` / `kind=efforts`（要访问网络）与 `kind=run` 仍是 60 秒。
- **正文两处都收**：`text-delta`（增量）与 `block-end` 的文本块（整块）。同一 index 两处
  都有时以 `block-end` 为准，避免重复拼接。
- **取不到文本时错误里带诊断**：`provider/model`、`finish` 原因、见过的 chunk 类型计数、
  `text-delta` 字符数、`block-end` 文本块数、`reasoning` 字符数（用来判断「模型只出了思考、
  没出正文」）。不再只有一句无信息量的「没有返回文本」。
- 其余 abort（页面断开等）映射成可读文案，上游原始信息记进 `logger.warn`。

### 联网为什么不做 tool-call 循环

`GenerateOptions.tools` 支持工具调用，但要在插件里实现「发调用 → 执行 → 回填 tool 消息 →
再流式」的循环，得精确构造 assistant/tool 消息体，而**消息体形状没有类型声明可核对**，
猜错会被真实适配器直接抛错。所以改成**宿主侧直接检索**：少一层协议，稳得多，效果一样。
`collectLlm()` 也只依赖 `StreamChunk` 里有类型声明的三个字段（`type`/`text`/`reason`）。

### 其余交互

- **头一行是合盘总断**（程序化的那个）：`合盘总断【平】+11` + 票型 + 一致性/置信 + 断语。
- **下面按 108 法逐条列出**各自的判定（`◎○·△▲×`）与分值 —— 就是原来的置信度口径，
  没有改。点某一行下钻看该法的完整盘。
- **清空**：清掉当前页面、重新起卦（同时清服务端内存记录，免得又被 `latest` 拉回来）。
- 求占时刻取**这台机器的当前时间**，不用手填。

### ⭐ 为什么必须是**顶层插件行**（胶囊长期不出现的根因）

`@deepseek-ai/dsh-client-modules` 的宿主半边文档写得很直白：

> the host half **scans enabled Loader entries** and composes the boot graph
> … turns each declaration into a served bundle under `/plugins`

它只扫**顶层 Loader 条目**。之前本插件挂在 agent preset 的 `config.plugins` 里
（**嵌套行**），扫描器**看不到它**，`dsh.client` 就永远不会被服务成浏览器 bundle
—— 胶囊自然永远不出现。（对照：能用的第三方浮层 `dsh-po06` / `dsh-mobile` 都是顶层行。）

### 装配（已不用 agent preset）

`cordis.patch.yml` 现在是**一条顶层行**：

```yaml
- insert:
    - id: dsh-divination-108
      name: dsh-divination-108
      config: { toolName: divine, promptEnabled: true, uiEnabled: true, ... }
```

工具、系统提示、悬浮窗端点**都由这一条行提供** → 所有会话都可用，不必先选预设。
旧的 preset 定义仍留在 patch 里，但标了 `disabled: true`（loader 不装配、不出现在
预设花名册）。

`package.json` 的 `dsh.client` 带 **`immediately: true`**：默认情况下客户端 bundle
是**惰性执行**的（"nothing runs until a plugin is first used"），而胶囊要一打开页面
就出现，所以必须立即加载（`dsh-po06` / `dsh-mobile` 也这么写）。

### 副作用（可接受，但要知情）

客户端 bundle 是 profile 级的 → 胶囊在**任何**会话右下角都出现；求占历史也跨会话
共享（同一次求占在所有会话里都能看到）。

### 想回退到「只在预设里启用」

把 patch 里 preset 行的 `disabled: true` 删掉，并把顶层行的 `uiEnabled` 改为 `false`
（免得两条行抢同一个全局端点）。注意别让两处同时注册工具。

---

## 测试

```bash
node test/validate-preset.mjs  # 装配 46 项：顶层插件行 / preset 已停用 / 裸包名 / dsh.client / !!js 位置 / 技能 / profile / legacy
node test/smoke.mjs            # 引擎层 82 项：108 法合规、确定性、合盘聚合、诚实性标注、token 预算
node test/host.mjs             # 宿主层 172 项（含 13h 人设注入、13i/13j 挂起保护与收束自检）：工具 schema、注册、execute、下钻、HTTP 端点、sharedRoots、
                               #   uiOnly 降级路径、AI 端点（models/efforts/interpret/plan/webprobe + 假 llm/web）、
                               #   只发 block-end 也能取到正文、空文本错误带诊断、中断映射成人话、
                               #   **绝不设 maxTokens**（断言请求里没有这个字段）、
                               #   kind=plan 的白名单校验（脏数据全丢弃、不臆造出生资料）、
                               #   联网：webprobe 报可用/原样带 WebError/拿不到服务要明说、
                               #         context 回传、notes 随卦存下并进入判词简报、
                               #         **带来源说明的资料才采用，没写的直接丢**
                               #   §13 agent：**真工具调用循环 + 消息体形状钉到字段级** ——
                               #         tools 按 ToolSchema 传、assistant 带 id/source/replayState、
                               #         tool 消息三字段配对、一次请求内自己搜两轮、
                               #         ask_user 停下 → 同 sid 续跑（历史不丢）、未开联网改道不崩
node test/client.mjs           # 客户端 62 项：bundle 包壳、插槽注册、渲染、胶囊/输入框/起卦/清空/
                               #   总断第一行、AI 判词控件（3 个下拉 + 联网 + 重出判词）、判词不设超时、
                               #   只注册 shell.overlay 一个槽（不进主会话）、联网自检、结构完整性清单（防「删多了」）、
                               #   资料出处（attribution）摊开显示并随卦存下、
                               #   **真的驱动点击**：点「起卦」后只应发生 kind=plan（绝不能有 kind=run）；
                               #   另起一次渲染单点「确认起卦」，断言这时才发生 kind=run → interpret
node test/sample.mjs           # 出一次真实求占的完整样本（人眼检查）
```

`validate-preset.mjs` 从 `app.asar` 抽出 **DSH 自带的 yaml** 来解析预设文件
（本机 `profiles/node_modules` 下的 `yaml`/`js-yaml` junction 都是失效的，
因为它们指向已被移除的 npm 全局 dsh），并把 DSH 私有的 `!!js` 标签替换成普通标量。

`host.mjs` 在临时目录造 `@deepseek-ai/dsh-tools` / `schemastery` 桩包（桩 `defineTool`
会按 DSH 的 JSON Schema 子集校验工具 schema），用 `DSH_CHECKOUT` 指过去，从而在**纯
Node** 下加载真实的插件代码并走完注册与执行路径，**不需要启动 DSH**。第 9 节覆盖
**预设级装配**：`uiEnabled: false` 时不注册全局端点、缺 `commands`/`connection` 时
插件仍能激活出合盘、端点重复注册被吞掉不影响激活。第 10 节是**关键回归测试**：
伪造 `process.resourcesPath` 断言 Electron asar 根在 `sharedRoots()` 里
（这条探不到就会让预设变成「加载失败」）。第 11 节验证 **uiOnly 面板行**：
不注册任何工具/提示/命令但**注册面板端点**，并且该端点读得到**另一个实例**
算出的记录（即 `SHARED.history` 互通 —— 面板能否显示内容全看这条）。

`client.mjs` 用假 `window.__ModuleLoader__` + 假 React 加载手写的 `lib/client.js`，
验证包壳 id、插槽注册与组件能渲染（浏览器里出错只会看到面板不出现，没有栈可查）。
第 5c 节验证**只注册 `shell.overlay` 一个槽**、代码里没有任何会话/提交残留；
第 5d 节按 `useState` 的**调用序号**喂值（让 `question` 非空、`busy` 为 false），
**真的点到那个「起卦」按钮**，再断言三个宿主端点被按 `plan → run → interpret` 顺序调用、
且 `run` 的入参里确实并进了模型整理出的资料 —— 只做源码层断言证明不了「真的通」。

### 已验证的事实（Lead 复核记录）

- **108/108 法全部起盘**；缺出生资料时命理类正确记为「未起」而非报错。
- **确定性**：同问同刻逐字相同；随机类（大衍/金钱卦/掷筊/塔罗/卢恩）随问题改变；
  纯历法类（黄历宜忌/建除/二十八宿/黄黑道/六曜）**不**随问题改变（正确行为）。
- **硬约束审计**：`src/` 全域无 `Math.random`；`methods/` 内无 `throw`、无文件/网络 IO；
  读时钟只出现在 `core/calendar.js` 与 `src/index.js`（记录时间戳）。
- **修掉的真实缺陷**：四柱年柱改按**立春**换年（原先用农历年，立春前后会错）；
  六曜「佛灭/仏灭」异体字别名（原先六天有一天查表落空）；合盘共识/应期均值曾为 `NaN`；
  断语曾出现 `[object Object]`；姓名学曾把问句片段当姓名；测字曾把整句问句当所测之字；
  未报外应曾被陈述为用户观测。
- **装配机制的实测结论**（决定了本插件的最终形态）：
  1. **legacy 目录 `~/.dsh/.agent-presets/` 已死** —— `app.asar` 全文里
     `agent.cordis.yml` 只出现 1 次、且就在官方文档文本中，无任何代码引用；
     旧预设能用只是因为它们冻结在 `cordis.yml` 里。新预设必须由 bundle patch 声明。
  2. `AgentPreset` 只是 `ctx.agentPresets.register(config)`，其 `plugins` 挂在
     `EntryGroup` 上，走与 bundle 相同的 cordis loader 解析 —— 所以预设行可以按
     **裸包名**引用第三方包（`name` 就是「package specifier」）。
  3. 预设内的插件行 `id` 与模块导出的 `name` 一致（同目录 `hm-docs` 行的规律）。
  4. **`!!js` 只支持标量位置**：写在序列项（`- !!js ...`）会让宿主启动失败 ——
     `customSkillDirs` 因此用绝对路径标量。
  5. 预设级插件**不发布任何 service**，所以无需 `isolate` realm
     （发布服务的行才必须隔离，否则第二个会话挂载冲突）。
  6. ⭐ **“预设加载失败”的真正根因是 `sharedRoots()` 探不到 `dsh-tools`。**
     设置页显示 `{name}（加载失败）` 对应 registry 的 `record.broken`
     （`register()` 会 **立即热加载** 整个声明，失败就把 `error.message` 记进
     `broken` 并 `logger.warn`；此时 Loader 那一行仍是 `fiberPhase: active`，
     所以「行是 active 但预设是 broken」完全可能同时成立）。
     而 `apply()` 里的 `loadDefineTool()` 之所以抛错，是因为旧版 `sharedRoots()`
     在生产环境探的**每一个根都是悬空 junction**：

     ```
     ~/.dsh/profiles/node_modules/@deepseek-ai/dsh-tools          → 不存在
     ~/.dsh/profiles/desktop/node_modules/@deepseek-ai/dsh-tools  → 不存在
     %APPDATA%/npm/node_modules/@deepseek-ai/dsh/node_modules/... → 不存在
     ```

     它们全指向**已被移除的 npm 全局 dsh 安装**（junction 目标没了）。
     而 `dsh-tools` 实际只存在于

     ```
     D:\DSH DESKTOP\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-tools
     ```

     —— **app.asar 路径根本不在旧候选列表里**。修法：用 Electron 专有的
     `process.resourcesPath` 推出 `join(resourcesPath,'app.asar','dsh','node_modules')`
     等根，并让 `loadDefineTool()` **先试裸 `import()`**（宿主能解析就直接用宿主那份
     实例，模块缓存复用、避免两份 dsh-tools 导致注册表不一致）。
     回归测试在 `test/host.mjs` 第 10 节（伪造 `process.resourcesPath` 断言根在列表里）。
     另一条独立验证：把 asar 里的**真** `dsh-tools`（连同 16 个真实依赖包）抽出到临时
     node_modules，用真 `defineTool` 跑 `apply()` → 3 个工具全部注册成功，
     说明 `parameters`（property map）与 `output.schema`（value schema，`type:'object'`
     必须显式给 `additionalProperties`）的写法是对的。

---

## 架构

```
src/
  index.js            宿主插件：三个工具 + 系统提示 + /占 命令 + 面板端点
  shared.js           共享依赖定位（宿主包在 app.asar 里，需显式探测）
  core/
    kit.js            五行/生克/旺衰/长生/纳音/旬空/确定性随机/归一化
    calendar.js       历法层：盘基（四柱·节气·建除·宿·九星·宜忌·旬空·神煞·真太阳时）
    tables.js         共享表（八卦·64卦·纳甲·八宫·建除·黄黑道·二十八宿·九星·二十四山…）
    registry.js       108 法注册表（id/名称/分类/引擎/保真度/权重/所需输入）
    runner.js         把 108 条分发给 8 个方法模块并收集结果
    aggregate.js      合盘聚合：加权总分·票型·五行·共识·应期·分歧·断语
    format.js         输出层：紧凑表 / 按需下钻 / 分级输出
  methods/
    yijing.js         易卦 24 法（参考实现）
    sanshi.js         三式 11 + 六壬 5
    mingli.js         命理 18
    zeri.js           择时 14
    fengshui.js       风水 10
    zhanbu.js         签卜 8 + 杂占 8
    xiangxing.js      姓名 4 + 相术 2
    western.js        西方 4
    data/             各模块私有数据表
lib/client.js         客户端：右下角合盘悬浮面板（手写 bundle，无构建步骤）
vendor/lunar.cjs      内置历法库（农历/节气/八字/建除/黄黑道/二十八宿/九星/神煞/宜忌）
```

### 新增一种术法

1. 在 `core/registry.js` 的 `ENTRIES` 里加一条（自动分配编号，注意保持 108 条或同步改测试）。
2. 在对应 `methods/*.js` 的 `engines` 里实现同名引擎：

```js
引擎名(chart, entry, rand) {
  return { score, essence, keys, wuxing, timing, detail, fidelity }
}
```

**三条硬约束**：纯函数（不读时钟/文件/网络）、禁止抛异常（算不出返回 `null`）、
一切随机走 `rand`（不用 `Math.random`）。

---

## 边界与责任

术数**仅供参考**。涉及医疗、法律、重大投资、人身安全的决断，请咨询专业人士。
插件不预测死亡与具体灾祸，不针对第三方的健康寿命做断，也不利用焦虑强化依赖。

## License

MIT
