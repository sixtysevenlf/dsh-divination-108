# 面板一问一答（task-23）

> Owner：kernel-astro ｜ 依据：用户原话「**不要只能发一次，要可以一问一答，方便占卜模型可以补充消息**」
> 改动：`lib/client.js`（对话流）＋ `src/index.js`（`sessionId` 续接 + `AGENT_SYSTEM` 追问条款）
> **未动**：`src/core/format.js`、`cordis.patch.yml`、`package.json` 装配字段

---

## 一、交互流程（文字版）

**旧**：输入 → 起卦 → （一次说完就结束，无法追问；模型想问也没出口）

**新**：

```
用户输入（textarea，Enter 发送 / Shift+Enter 换行 / Esc 清空）
   │  ┌───────────────── 输入框**常驻**，发完不锁死 ─────────────────┐
   ▼
① pushMessage(user)          → 对话流立刻出现这条用户消息（不等任何请求）
② kind=run  （本地起卦, brief）→ 秒回 **结果卡**：大字总断 + 三行要点 + 提示条
③ kind=agent（带 sessionId）  → 后台跑工具循环；面板 700ms 轮询 agentpoll
      ├─ 步骤流水实时显示（☯/🔎/🔍/📄/📝，可收起）
      └─ 收尾 → pushMessage(assistant: 判词/追问) 追加在结果卡下面
④ 模型若发现「未起」→ 在判词末尾**一次问清**缺什么 → 用户直接在下一条回答
      └─ 用户补答（如生日）→ 模型再调 divine（带 birth/gender）→ 新盘为准
```

- 「继续追问」= 直接再发一条：面板带**同一个 `sessionId`**，模型看得到上文。
- 「新对话」= 清空对话流 + **丢掉 `sessionId`** → 下一条重新建会话。
- 「清空」= 清面板与服务端记录（原有语义保留）。

## 二、请求体前后对比

| 请求 | 旧 | 新 |
|---|---|---|
| `kind=run` | `{question, format:'brief', longitude, longitudeFrom}` | **不变**（秒回结果卡仍走它） |
| `kind=agent` | `{question, provider, model, effort, web, longitude, longitudeFrom}` | `{…同上, conversation:true, sessionId?}` —— 首轮不带 `sessionId`，续轮带上 |
| 响应 | `{ok, sid, state, steps, phase}` | `{ok, sid, **sessionId**, **turn**, state, steps, phase}`（`sessionId` 是 `sid` 的显式别名） |
| `kind=agentpoll` | `{ok, sid, state, steps, phase, error, judgment, record}` | 同上 **+ `sessionId`** |

## 三、会话生命周期

| 事件 | 行为 |
|---|---|
| 首轮（无 `sessionId`） | 新建 `st`：`messages=[user]`、`turn=1`、`conversation=body.conversation===true`；响应回 `sessionId` |
| 续轮（同 `sessionId`，上一轮已 `done`） | `st.messages.push(user)`；重置**本轮**的 `steps/error/phase/judgment/picked`（**不动历史**）；`turn+1` |
| 上一轮还在跑 | `409 {code:'busy-session'}` —— 不许并线 |
| `sessionId` 不存在/已过期 | `409 {code:'stale-session'}` —— **绝不静默新建**（静默新建＝悄悄串会话，用户只会觉得"它忘了我刚说的"） |
| 面板收到 `stale-session` | 如实提示「上一轮会话已过期，已自动开始新对话」→ 丢掉 id → **重试一次** |
| 回收 | `AGENT_LIMITS{ttlMs:6h, maxSessions:32}` 的 `agentPrune`；**`conversation:true` 的会话不再"取走即释放"**（否则第二轮必然 stale），改由 ttl/上限回收 |
| 旧行为（无 `conversation`） | 与改造前**逐字一致**：结果取走后释放 |

## 四、`AGENT_SYSTEM` 新增条款（【七 · 你可以追问补资料】27–31）与"代码真做得到"核对

| 条款 | 内容 | 与代码的一致性核对 |
|---|---|---|
| 27 | 「未起」= 缺资料：命理缺**出生年月日时+性别**、`#6` 缺**报数**、`#92/#93` 缺**所测之字**、`#95–#97` 缺**外应**；**绝不替用户编** | 未起清单来自 `board.meta.skippedList`（每条带 `reason`），工具文本里逐条可见 ✓；法号与 `need` 字段在 `registry.js` 中一致 |
| 28 | **应当主动追问**：先把结论给完，再用**一段话一次问清**，不挤牙膏、不用问句挤掉结论 | 面板现在**能**接住回答（`sessionId` 续接）✓ —— 这条在 task-23 之前是空头承诺 |
| 29 | 用户补答 → 可**再调 `divine`**（带 `birth`/`gender`/`numbers`）→ **以新盘为准** | `divine` 参数表确有 `birth`/`gender`/`numbers` ✓；面板把新 record 换成「当前一盘」✓ |
| 30 | ⚠ **重起 ≠ 同一卦**：默认随机，重起是另一卦；只是追问细节就用同一盘；要复现让用户给 `seed` | 与 task-20 的随机口径一致（`meta.mode` 自证）✓；`seed` 入参存在 ✓ |
| 31 | 追问也适用于"所问不够具体"，但先把当前盘断完 | 与既有条款 26 一致 ✓ |

**没有引入任何不存在的字段/能力**（沿用 task-18 立的规矩）：条款里出现的 `skippedList`、`birth`、`gender`、`numbers`、`seed`、`divine` 全部实际存在并被断言覆盖。

## 五、断言改动清单与判别力

### client.mjs：**70 → 79**（新增 9 条；改写 2 条；无删除）

| # | 断言 | 判别力（错误实现会怎样失败） |
|---|---|---|
| 1 | 展开态有输入框（`input`\|`textarea`） | 改前只认 `input`；**改后仍要求 placeholder 含「所问之事」**，把输入框删掉 → 挂 |
| 2 | 回车发送 / Shift+回车换行（`textarea` + `shiftKey !== true`） | 回退成单行 `input`（做不到换行）或去掉 shiftKey 判断 → 挂 |
| 3 | 有「新对话」按钮 + 源码有 `newConversation` | 删按钮或只清视图不丢会话 → 与 #9 一起挂 |
| 4 | 排版：对话流 → 总断 → 收束 → 折叠区 | ⚠ 改用 **body 片段**按标记顺序比较：`合盘总断【` 在 `resultCard` 里也有一份，全文 `indexOf` 会拿错位置（**本次真踩到了**） |
| 5 | ① 连发两条 → 对话流**累积** | 用覆盖式实现（`setMessages([m])`）→ 只剩最后一条 → 挂。**这条用真状态迷你渲染器驱动**（`useState` 真 setter + drain），不是源码 grep |
| 6 | ② 第二轮带**同一** `sessionId` | 每轮都不带（旧实现）→ `undefined` → 挂；带错 id 也挂 |
| 7 | ③「新对话」后**不带**旧 id | 只清视图不清 id → 挂（用户会串到上一段会话） |
| 8 | ④ 结果卡与模型消息**同时存在** | 用判词覆盖结果卡（懒人化被挤掉）→ 挂 |
| 9 | ③′ 新对话后再发 → 请求仍不带 id | 同 #7 的反向复核 |
| — | 附带：每轮都先走 `kind=run`（共 2 次） | 去掉秒回（让用户等模型）→ 挂 |

> 新增断言全部**驱动真实交互**（填输入框 → 选 provider/model → 点发送 → drain），不是断言源码里有没有某个字符串。

### host.mjs：**173 → 182**（新增 9 条；无改写）

| # | 断言 | 判别力 |
|---|---|---|
| 1 | 首轮响应返回 `sessionId` | 不返回 → 面板永远无法续接 → 挂 |
| 2 | 新会话第一句 → 模型只见 1 条消息 | 凭空塞历史/串上一个会话的 messages → 挂 |
| 3 | 同 `sessionId` 第二轮 state=done | 续接路径写坏（如 409/500）→ 挂 |
| 4 | **模型可见历史**：第二轮 messages 变长且含第一句 | ⭐ 这是"能追问"的**本质**断言。**当场快照** `options.messages`（`st.messages` 是同一引用，事后读会已被追加，测不出差别） |
| 5 | 两个会话 `sessionId` 不同 | 复用同一个 id → 挂 |
| 6 | **不串会话**：乙会话看不到甲说过的任何一句 | 全局单会话实现（或键写错）→ 立即挂 |
| 7 | 甲第三句仍带甲历史、且没有乙的话 | 反向复核隔离 |
| 8 | 不存在的 `sessionId` → **409 + `code:'stale-session'`** | 静默新建（最危险的那种"串会话"）→ 挂 |
| 9 | 不带 `sessionId` → 旧行为一致（新会话、只见本句） | 破坏向后兼容 → 挂 |

> **与"默认随机"无冲突**：本组断言全部只查**消息条数/内容**与会话路由，不查任何术法结果，也不引入"同问同刻一致"类断言。

## 六、遗留风险

1. **会话在内存里**（`AGENT_SESSIONS`，上限 32、TTL 6h）：宿主重启即丢，用户会看到一次「会话已过期，已自动开始新对话」——如实告知，不静默串。持久化不在本单范围。
2. **多标签页/多窗口共享同一 `sessionId`** 时，第二个标签页续答会**接进同一段历史**（这是"同一个会话"的语义），但也可能让用户困惑；面板把 id 存在组件 state（每个页面独立），只有同一页面才带同一 id，故实践上少见。
3. **并发同一会话**：已在宿主侧用 `busy-session` 409 挡住（上一轮没结束不许并线），但面板尚未自动重试该场景（会显示错误文字，用户再发一次即可）。
4. **对话流未持久化**：刷新页面后对话流清空（会重新拉 `kind=latest` 显示最新一盘），`sessionId` 也随页面丢失 → 刷新后是"新对话"。这是当前取舍（不引入 localStorage）。
5. **追问能力依赖模型自觉**：`AGENT_SYSTEM` 只是"应当追问"，模型仍可能不问。已用"未起清单 + 一次问清 + 不编造"把行为约束写实，但不做运行时强制。

## 七、验证

```powershell
cd D:\DSH\plugins\dsh-divination-108
node test/client.mjs            # 79/79（原 70，+9 多轮）
node test/host.mjs              # 182/182（原 173，+9 会话）
node test/smoke.mjs             # 86/86（不受影响）
node test/validate-preset.mjs   # 46/46（不受影响）
```
