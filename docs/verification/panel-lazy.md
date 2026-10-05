# 面板懒人化重构（task-21）

> Owner：kernel-astro ｜ 依据：用户原话「**修改面板，你想怎么改就怎么改，只要能满足我的懒人化，即问所求之事，你给我最后占卜出来的结果就行**」
> 改动文件：`lib/client.js`（面板）＋ `test/client.mjs`（断言）＋ 本文档
> **未动**：`src/**`、`cordis.patch.yml`、`src/core/format.js`
> **后续**：task-23 把它从"一回一问"改成"**一问一答**"，见 `docs/verification/panel-multiturn.md` 与本文 §十。

---

## 十、task-23 追加：从"一回一问"到"一问一答"

懒人化的结论区**完全保留**（总断 → 白话结论 → 三行要点 → 提示条 → 折叠区），只是**外面套了一层对话流**：

| | task-21（一回一问） | task-23（一问一答） |
|---|---|---|
| 输入框 | 单行 `input`，Enter 起卦；发一次后要等 | **`textarea` 常驻**：Enter 发送、**Shift+Enter 换行**、Esc 清空 |
| 消息 | 只有"当前一盘"，新的一盘覆盖旧的 | **对话流累积**：用户消息 / 结果卡 / 模型回复依次追加 |
| 每条消息 | — | 先 `kind=run` **秒回结果卡**（大字总断 + 三行要点 + 提示条），再 `kind=agent` **带 `sessionId`** 拿判词/追问 |
| 请求体 | `kind=agent {question, provider, model, effort, web, longitude, longitudeFrom}` | 同上 **+ `conversation:true`**（首轮）**+ `sessionId`**（续轮） |
| 会话 | 每轮都是新会话（模型看不到上一句） | 首轮新建并在响应里回 `sessionId`；续轮 append 进同一会话 |
| 按钮 | 清空 | 清空 ＋ **新对话**（清对话流并丢掉 `sessionId`） |
| 模型追问 | 做不到（用户没出口回答） | **可以**：`AGENT_SYSTEM` 【七】明确"未起就该一次问清" |

**懒人化没有被牺牲**（这也是断言 #8 守的东西）：**结果卡与模型消息同时存在** —— 判词不会把秒回的结论挤掉；
详情区（108 行明细、五个折叠块）仍只显示**最新**一盘，避免对话长了以后重复渲染几十张表。

判别力：`client.mjs` 新增 9 条（含"连发两条必须累积""第二轮必须带同一 sessionId""新对话后必须不带旧 id"），
`host.mjs` 新增 9 条（含"**模型可见历史**"与"**两个会话互不可见**"），逐条见
`docs/verification/panel-multiturn.md` §五。

---

## 一、用户操作步骤：从 N 步降到 1 步

| | 旧面板 | 新面板 |
|---|---|---|
| 1 | 点右下角胶囊展开 | 同（胶囊保留） |
| 2 | 选 provider（否则只有「无可用模型」） | **不用选**（配置默认值；选了模型才出 AI 判词，没选也能起卦） |
| 3 | 选 model | **不用选** |
| 4 | 选思考强度 | **不用选** |
| 5 | 决定要不要勾「联网」 | **不用管**（收进「高级」） |
| 6 | 输入所问之事、点「起卦」 | **只做这一件**：输入 → 回车 |
| 7 | 在读判词/总断/108 行里自己找结论 | **首屏就是结论**（总断 → 白话结论 → 三行要点） |
| **合计** | **6–7 步** | **1 步**（输入回车），其余全是可选 |

`Esc` 清空输入框；定位**自动**执行（`currentLongitude()`，不让用户点）。

## 二、结果区：区块与数据来源（字段均可在 `record` / `board` 里 grep 到）

| 序 | 区块 | 显示内容 | 数据来源 |
|---|---|---|---|
| ① | **大字总断** | `合盘总断【平】+10`（字号 17/800）＋ Badge；右侧小字：吉/平/凶、一致性、置信 | `record.board.overall.{verdict,score,consistency,confidence}`、`board.polarity` |
| ② | **一句话白话结论** | AI 判词的「一句话收束」；无判词则退回合盘 `advice` 首句 | `judgement`（经 `takeOneLine`）→ 兜底 `board.advice` |
| ③ | **三行要点** | 五行 `金旺 水缺`／**跨门共识 `通用 8法/4门`**／应期 `水月（3法）` | `board.{dominant,lacking}`、**`board.consensusKeys[].{key,count,cats}`**、`board.timing[].{text,count}` |
| ④ | **提示条**（一行 · 分隔，可展开） | `⚠ 近似 40 法 · 未起 21 法 · 位置：…，已校正 · 随机模式（重问可能不同） · seed abc12345` | `board.meta.fidelityTally.approx`、`board.meta.skipped`/`skippedList`、`record.position.{note,corrected,from}`/`record.solarNote`、`record.mode`/`modeNote`/`seed` |
| ④′ | 提示条展开（默认收起） | 近似说明 + 未起逐条（`#no名称（缺什么）`）+ 位置全文 + 随机性口径 | 同上 |
| — | **按钮行** | 「再占一次」「复制结论」「复制 seed」 | 「再占一次」→ `startRun()`（**不提示"结果应相同"**，与默认随机口径一致） |
| ⑤ | **折叠区**（5 块，默认全收起） | 108 法明细（含点行下钻）／分歧（**D1–D5 等级** + reason + 前 6 条冲突）／分类加权／出处账本／完整 AI 判词 | `record.results`、`board.divergence.{grade,items[]}` + `board.conflicts[].{grade,reason,gap}`、`board.categories ?? byCategory`、`board.evidenceDigest`、`judgement` |
| — | 页脚 | `所问：… · 时刻 · 四柱 · 农历 · 归类` | `record.{question,when,pillars,lunar,topic}` |

**本次核心设计（已在 §四 钉死）**：跨门共识**必须显示门数**（旧实现 `lib/client.js:827` 只渲染 `${k.count}法`，把"跨门"这层信息削掉了一半）。现为 `通用 8法/4门`，缺 `cats` 时（不应发生）退化为 `8法` 而不是打印 `undefined门`。

## 三、折叠与视觉

- **折叠实现**：内容**始终在树里**，靠 `display:none` 收起（不是条件渲染）。理由：① 切换不丢状态、不重新挂载；② 既有「结构完整性 / 压力测试」仍然真的渲染 108 行（若改条件渲染，那些断言就只覆盖折叠态，等于**偷偷降低覆盖**）。
- `Fold` 是**普通函数而非组件**（`function fold(name,title,open,onToggle,hint,...children)`）：本仓客户端测试用极简 React 替身，**不调用函数组件**，做成组件会让折叠内容在测试树里"不存在"。这一点是实测踩到的（首版用组件，`data-fold` 全部找不到）。
- 视觉：单列、`width: 440, maxWidth: 'calc(100vw - 36px)'`（窄屏可用，未固定 360px 卡死）；结论字号 17/800，细节 10.5–11；⚠ 只用淡色标记，不满屏红；提示条可点开。

## 四、`test/client.mjs` 断言改动清单（含判别力）

**基数：62 → 70**（新增 8 条净增，2 条改写；无删除）。

| # | 改前 | 改后 | 为什么改后仍有判别力 |
|---|---|---|---|
| 1 | `AI 判词渲染在合盘总断之前（头一块）` | `排版：大字总断在最前（结论优先）`（`iVerdict < iOne`） | 若有人把判词搬回顶部挡住结论 → 立刻挂。旧断言的前提（判词置顶）已被用户"懒人化"要求推翻 |
| 2 | `合盘总断渲染在「所问」之前` | `一句话收束在 108 明细之前、完整判词在明细之后（进折叠区）` | 若把判词放回首屏、或把明细提到收束之前 → 挂 |
| 3 | （压力测试）`一句话收束排在综合判词之前` + `判词排在程序化总断之前` | `总断在最上，一句话收束紧随其后` + `完整判词在总断之后` | 同上；另把判词标题从「综合判词」改为可读的「完整 AI 判词」 |
| 4 | （压力测试 mock）`consensusKeys: [{key,count,avg}]` | 补 `cats: 4, fams: 3`（**聚合层真会输出**，mock 原本不完整） | 让"门数"断言真的能覆盖到 |
| 5 | — | 新增 `懒人化：结论区 5 个折叠块默认全部收起（display:none）` | 若有人把明细/分歧默认摊开 → 挂（懒人化的核心不变量） |
| 6 | — | 新增 `懒人化：高级区默认收起` + `提示条默认收起` | 若配置又挡在首屏、或提示条默认摊开 → 挂 |
| 7 | — | 新增 `点开「高级」后配置真的出现（display:block）` + `展开后 3 个下拉与联网勾选在树里` | **反向**钉死"折叠不等于删控件"：把控件删掉（而不是折叠）→ 挂 |
| 8 | — | 新增 `跨门共识显示「8法/4门」` | 退化成只显示法数（旧 bug）→ 挂 |
| 9 | — | 新增 `提示条含 近似/未起/位置/随机模式 四项` | 少一项 → 挂 |
| 10 | — | 新增 `有「再占一次」，且 title 不含"应相同/必然相同/保证一致"` | 面板若承诺一致性（与默认随机口径矛盾）→ 挂 |
| 11 | — | 新增 `有「复制结论」「复制 seed」` | 删按钮 → 挂 |

原有的技术集成断言**一条未改**且全过：两个端点、`format:'brief'`、`longitude`/`longitudeFrom`、`lastId`/`detailCache`、5 类定位降级、`kind=clear`、只注册 `shell.overlay`、错误边界外壳、执行过程开关、4 个 useEffect、provider→model→effort 懒加载。

## 五、保留的技术集成（未拆）

`kind=run`（本地起卦）/`kind=agent`（模型自己调工具写判词）+ `kind=agentpoll` 轮询、`kind=interpret`、`kind=clear`、`kind=models`/`efforts`/`webprobe`、`format:'brief'`、`longitude`/`longitudeFrom` 传参、`currentLongitude()` 定位与 5 类降级文案、`lastId`/`detailCache` 与点行下钻、执行过程流水与收起开关、错误边界。

## 六、尚未接入的 v2 字段及原因

| 字段 | 为何没接 |
|---|---|
| `board.corroboration`（合参矩阵） | 属"每种共识是否够格当印证"的细粒度判断，放进「分歧」折叠区会更挤；本轮先保证结论区清晰。建议下一轮并入分歧折叠区 |
| `board.meta.topicMain/topicAux`（主辅法分工） | 同上（`buildBoardBrief` 已喂给模型，面板侧优先级低） |
| `board.byCategory` 的完整对象（分数+计数） | 现只渲染分数（`categories` 口径）；计数对"懒人"无价值 |
| `record.meta.agreement` 拆解（signAgreement/dispersion/trust） | 属诊断量，已由"一致性/置信"两个数字概括 |
| `timing[].lo/hi`（应期半开区间） | 面板只显示措辞+法数；区间是"想要精确的人"才看，留给下钻 |

## 七、改完要不要刷新 / 重启？（据装配方式判断）

依据（可复核）：

1. `package.json` → `"exports": { "./client": { "default": "./lib/client.js" } }`；
2. `package.json` → `"dsh": { "client": { "platform": "web", "inject": [], "immediately": true } }`；
3. `cordis.patch.yml` 注释明确：客户端半边由 `@deepseek-ai/dsh-client-modules` 的宿主半边
   **"scans enabled Loader entries"** 后**服务成浏览器 bundle**（`dsh.client` 不是按请求读文件的静态资源）。

**结论**：新面板**不是**当前已打开页面里那份 bundle 的一部分 ——
- **先刷新页面**（F5）：宿主会重新构建/服务 bundle，这是最可能一步到位的方式；
- 若刷新后右下角还是旧面板（说明宿主侧对 bundle 有启动期缓存），则**重启客户端/宿主**，或让插件管理触发热重载（`plugin_manager set_bundle`）后**再刷新一次**；
- 严格地说，"是否需要重启"取决于宿主对 client bundle 的缓存策略，**我只读检查无法证实**。请用户实测一次（判据：胶囊点开后**顶部只有一个输入框、下面直接是总断**，看不到 provider/model 下拉 → 新面板已生效）。

## 八、验证

```powershell
cd D:\DSH\plugins\dsh-divination-108
node test/client.mjs            # 70/70（原 62，新增 8 条净增）
node test/smoke.mjs             # 86/86
node test/host.mjs              # 173/173
node test/validate-preset.mjs   # 46/46
```

## 九、遗留

1. `package.json` 的 `_uiPanelNote` 仍描述**旧面板**（"三档控件常驻 + 判词置顶"），与现状不符；`package.json` 不在本单写作用域（`dsh`/`files`/`scripts` 属冻结契约），**请 Lead 决定是否更新该说明**。
2. 「复制结论」在无剪贴板权限时如实提示 `复制失败：浏览器未授权剪贴板，请手动选中复制`（不假装成功）。
3. 面板默认不选模型 → 只起卦不写判词；此时 ② 一行退回合盘 `advice` 首句（仍是人话，且明确标注来源）。
