# 风水 / 姓名 / 签卜 / 杂占 / 西方术法 规则调研 ＋ 100+ 术法聚合架构规范

> 用途：`dsh-divination-108` 算法层全量重写的前置调研。
> 覆盖 A 风水、B 姓名、C 签卜杂占、D 西方，以及 E **聚合架构模式**（本文件最重要的一节）。
>
> **可追溯性约定**：每条规则都给出 `仓库 / 文件路径`（必要时带行号）。凡我**没有实际读到的内容**，一律写
> 「**未核实**」或「**未找到**」，绝不填充推测表值。凡**来源之间互相矛盾**的，我并列两种说法并写明分歧，
> 不擅自裁定正误。凡**近似实现**（缺秘传表／缺辞书）的，标 **⚠ 近似**。

---

## 0. 调研对象与许可证总览

| # | 仓库 | ★ | 许可证（实测） | 判定 |
|---|---|---|---|---|
| 1 | `voidforall/fengshui.skill` | 292 | **NONE** | 根目录树仅 7 个文件，无 `LICENSE`；直接请求 `main/LICENSE`、`main/LICENSE.md` 均 404 |
| 2 | `Naitellos/pandorium-mcp` | 0 | MIT | `LICENSE` 1066 B，首行 `MIT License` |
| 3 | `dungnotnull/Tarot-Astrology-Divination-Reflection-Guide-agent-skill` | 4 | **NONE** | 27 个文件中无 `LICENSE`；`main/LICENSE` 404 |
| 4 | `quetzal-china/lenormand-divination-skill` | 2 | MIT | `LICENSE` 1086 B |
| 5 | `FANzR-arch/Numerologist_skills` | 1369 | **NONE** | 23 个文件中无 `LICENSE` |
| 6 | `ChesterRa/mingpan` | 116 | **Apache-2.0** | `LICENSE` 11357 B，标准 Apache 2.0 正文 |
| 7 | `hhszzzz/taibu` | 602 | **NOASSERTION（实为双许可）** | `LICENSE` 835 B 是自撰的 "MingAI Repository License Boundary"：根应用 `AGPL-3.0-only`，但 `packages/core`、`packages/mcp`、`packages/mcp-server` **另行 MIT** |
| 8 | `Brhiza/mingyu` | 463 | **AGPL-3.0** | `LICENSE` 34020 B，AGPL v3 全文 |
| 9 | `MTKEN368/liu-he-xuan-ji` | 1 | MIT | `LICENSE` 1084 B |
| 10 | `sapuyou45-bit/oraclebone` | 6 | MIT | `LICENSE` 1090 B |
| 11 | `dhicoc/chinese-traditional-wisdom-skill` | 26 | MIT（含第三方声明） | `LICENSE` 1063 B；另有 `THIRD_PARTY_NOTICES.md` |

> taibu 的 `LICENSE`（`hhszzzz/taibu@master/LICENSE`，全文 30 行）原文：
> 「Unless a subdirectory contains its own LICENSE file, the repository root application and service code is licensed under the GNU Affero General Public License, version 3 only (`AGPL-3.0-only`).」并列出 `packages/core` / `packages/mcp` / `packages/mcp-server` 为 MIT。
> 末行 `SPDX-License-Identifier: AGPL-3.0-only`。

---

## A. 风水

### A.1 八宅（东四命 / 西四命）

#### A.1.1 命卦计算（两种口径，都实测到）

**口径 ①——《八宅明镜》表（推荐做基准）**
来源：`dhicoc/chinese-traditional-wisdom-skill@main` → `knowledge-base/fengshui/mappings/life-trigram.json`（2359 B，`source` 字段自称《八宅明镜》，`version` 1.0.0）

```json
"formula": {
  "male":   "'(100 - 年份后两位) % 9'，余0→9",
  "female": "'(年份后两位 - 4) % 9'，余0→9"
}
```

`remainder_to_trigram` 覆盖 1–9（该文件被 CI 强制覆盖 1–9，见 `mappings/SCHEMA.md`）：

| 余数 | 卦 | 五行 | 组 | 卦数 |
|---|---|---|---|---|
| 1 | 坎 | 水 | 东四命 | 1 |
| 2 | 坤 | 土 | 西四命 | 2 |
| 3 | 震 | 木 | 东四命 | 3 |
| 4 | 巽 | 木 | 东四命 | 4 |
| 5 | — | — | — | **男寄坤(2)，女寄艮(8)** |
| 6 | 乾 | 金 | 西四命 | 6 |
| 7 | 兑 | 金 | 西四命 | 7 |
| 8 | 艮 | 土 | 西四命 | 8 |
| 9 | 离 | 火 | 东四命 | 9 |

同文件给的 `examples`（原文，可做单元测试黄金样本）：

| 年 | 性别 | calc | 卦 | 组 |
|---|---|---|---|---|
| 1990 | 男 | `(100-90)%9=1` | 坎 | 东四命 |
| 1990 | 女 | `(90-4)%9=5` | 艮(5寄8) | 西四命 |
| 1985 | 男 | `(100-85)%9=6` | 乾 | 西四命 |
| 2000 | 男 | `(100-0)%9=1` | 坎 | 东四命 |
| 2000 | 女 | `(0-4)%9=-4→5→艮` | 艮(5寄8) | 西四命 |

`east_group` / `west_group` 字段（原文）：
- 东四命：`trigrams: ["坎(1)","震(3)","巽(4)","离(9)"]`，`lucky_directions: ["东","东南","南","北"]`，`unlucky_directions: ["西","西北","西南","东北"]`
- 西四命：`trigrams: ["乾(6)","坤(2)","艮(8)","兑(7)"]`，`lucky_directions: ["西","西北","西南","东北"]`，`unlucky_directions: ["东","东南","南","北"]`

**口径 ②——`voidforall/fengshui.skill@main` → `SKILL.md`（13295 B）第 109–117 行**

```
男命：将出生年后两位数字相加至个位，用10减之，得命卦数
（例：1985年男 → 8+5=13 → 1+3=4 → 10-4=6 → 乾卦，西四命）
女命：将出生年后两位数字相加至个位，用5加之，超10则减9
（例：1990年女 → 9+0=9 → 5+9=14 → 1+4=5 → 5用坤代替 → 坤卦，西四命）
注：2000年后出生需用后两位，如2005 → 05 → 0+5=5
```

> **⚠ 分歧警告（必须写进实现的口径说明）**：同一 1990 年女命，口径 ① 得 **艮（西四命）**，口径 ② 得 **坤（西四命）**。
> 两者同属西四命，但卦数不同，会进一步影响「个人八方」表的选取。同一仓库内第三处 `references/wuxing-ganzhi.md`
> 第 62–96 行给的是「男 `(100 - 后两位)%9`」「女 `(后两位 + 5)/9 取余`」，并在第 83 行自承一处笔误
> （「但用此公式算出1则坎（误，女命5取坤）」）。**结论：该仓三处口径互不一致，不可整仓照抄。**

#### A.1.2 八宅九星吉凶方位表（64 组，已完整取得）

**主表**：`dhicoc/chinese-traditional-wisdom-skill@main` → `knowledge-base/fengshui/mappings/eight-mansions.json`（8038 B，`source` 字段：「《八宅明镜》《阳宅三要》」，`version` 1.0.0）。

结构：`legend.stars_by_luck` 把八星分四档；`legend.star_meanings` 给出八星九星归属；`data` 为 `<命卦>_<东/西四命> → { "<方位>(<星>)": { star, luck, meaning } }`，**8 命卦 × 8 方位 = 64 组**（CI 强制每命卦覆盖北、东北、东、东南、南、西南、西、西北，见 `mappings/SCHEMA.md`）。

`legend.stars_by_luck`（原文）：

```json
{
  "大吉": ["生气", "延年", "天医"],
  "中性": ["伏位"],
  "凶": ["六煞", "祸害", "五鬼", "绝命"]
}
```

`legend.star_meanings`（原文，含**九星归属**，这条对「八宅九星」对齐很有用）：

| 游年星 | 九星 | 五行 | 吉凶 | 原文释义 |
|---|---|---|---|---|
| 生气 | 贪狼 | 木 | 大吉 | 旺丁旺财，健康活力，最吉之星 |
| 天医 | 巨门 | 土 | 吉 | 健康长寿，贵人相助，祛病消灾 |
| 延年 | 武曲 | 金 | 吉 | 婚姻美满，家庭和睦，事业持久 |
| 伏位 | 辅弼 | 木 | 中性 | 平稳安定，适合休养生息，不宜进取 |
| 绝命 | 破军 | 金 | 大凶 | 健康受损，意外灾祸，最凶之星 |
| 五鬼 | 廉贞 | 火 | 凶 | 官司是非，火灾血光，突发变故 |
| 六煞 | 文曲 | 水 | 次凶 | 桃花纠纷，口舌是非，财运流失 |
| 祸害 | 禄存 | 土 | 凶 | 小人暗算，疾病纠缠，官非争执 |

**完整 64 组（逐条抄录，可直接转成数据文件）**：

**坎命_东四命**：北(伏位) 中性「坎水得位，安稳平和」｜东北(五鬼) 凶「土克水，突发变故」｜东(天医) 吉「水生木，健康长寿」｜东南(生气) 大吉「水木相生，旺财旺丁」｜南(延年) 吉「水火既济，事业顺遂」｜西南(绝命) 大凶「水受土克，灾祸之方」｜西(祸害) 凶「金生水泄，小人暗算」｜西北(六煞) 次凶「金生水过，桃花纠纷」

**坤命_西四命**：北(绝命) 大凶「土克水，健康受损」｜东北(生气) 大吉「火土相生，旺财旺丁」｜东(祸害) 凶「木克土，小人暗算」｜东南(五鬼) 凶「木克土，突发变故」｜南(六煞) 次凶「火生土过，口舌是非」｜西南(伏位) 中性「坤土得位，安稳平和」｜西(天医) 吉「土生金，健康长寿」｜西北(延年) 吉「土生金，婚姻美满」

**震命_东四命**：北(天医) 吉「水生木，健康长寿」｜东北(六煞) 次凶「木克土反侮，桃花纠纷」｜东(伏位) 中性「震木得位，安稳平和」｜东南(延年) 吉「木木比和，事业顺遂」｜南(生气) 大吉「木生火，旺财旺丁」｜西南(祸害) 凶「木克土，小人暗算」｜西(绝命) 大凶「金克木，意外灾祸」｜西北(五鬼) 凶「金克木，突发变故」

**巽命_东四命**：北(生气) 大吉「水木相生，旺财旺丁」｜东北(祸害) 凶「木克土，小人暗算」｜东(延年) 吉「木木比和，事业顺遂」｜东南(伏位) 中性「巽木得位，安稳平和」｜南(天医) 吉「木生火，健康长寿」｜西南(六煞) 次凶「木克土，口舌是非」｜西(五鬼) 凶「金克木反克，突发变故」｜西北(绝命) 大凶「金克木，意外灾祸」

**乾命_西四命**：北(六煞) 次凶「金生水过，桃花纠纷」｜东北(五鬼) 凶「土生金过度，突发变故」｜东(绝命) 大凶「金克木，意外灾祸」｜东南(祸害) 凶「金克木，小人暗算」｜南(五鬼) 凶「火克金，官非火灾」｜西南(延年) 吉「土生金，婚姻美满」｜西(天医) 吉「金金比和，健康长寿」｜西北(伏位) 中性「乾金得位，安稳平和」

**兑命_西四命**：北(祸害) 凶「金生水泄，小人暗算」｜东北(延年) 吉「土生金，婚姻美满」｜东(五鬼) 凶「金克木反克，突发变故」｜东南(绝命) 大凶「金克木，意外灾祸」｜南(六煞) 次凶「火克金，口舌是非」｜西南(天医) 吉「土生金，健康长寿」｜西(伏位) 中性「兑金得位，安稳平和」｜西北(生气) 大吉「金金比和，旺财旺丁」

**艮命_西四命**：北(五鬼) 凶「土克水反侮，突发变故」｜东北(伏位) 中性「艮土得位，安稳平和」｜东(六煞) 次凶「木克土，桃花纠纷」｜东南(祸害) 凶「木克土，小人暗算」｜南(绝命) 大凶「火生土过，灾祸之方」｜西南(生气) 大吉「火土相生，旺财旺丁」｜西(延年) 吉「土生金，婚姻美满」｜西北(天医) 吉「土生金，健康长寿」

**离命_东四命**：北(延年) 吉「水火既济，事业顺遂」｜东北(绝命) 大凶「火生土过，灾祸之方」｜东(生气) 大吉「木生火，旺财旺丁」｜东南(天医) 吉「木生火，健康长寿」｜南(伏位) 中性「离火得位，安稳平和」｜西南(五鬼) 凶「火土相生过，突发变故」｜西(祸害) 凶「火克金反克，小人暗算」｜西北(六煞) 次凶「火克金，口舌是非」

> **内部一致性提醒**：乾命一表中 **南(五鬼)** 与 **东北(五鬼)** 并存，而其余七命卦每卦的八星各出现一次。
> 这是数据本身的样子（我逐字核对过），重写时应加一条不变量校验：**每命卦八星应恰好各一**，并决定乾命南/东北哪一个应为「祸害」。

**第二来源（用作交叉校验）**：`voidforall/fengshui.skill@main` → `SKILL.md` 第 127–136 行的「游年变卦（宅卦对应吉凶方）」表，是**按宅卦**（不是命卦）排的 8×8 表，与我上面抄的**按命卦**的表**不是同一张表**，别混用。其内容：

| 坐向（宅卦） | 生气 | 延年 | 天医 | 伏位 | 祸害 | 六煞 | 五鬼 | 绝命 |
|---|---|---|---|---|---|---|---|---|
| 坎宅（坐北朝南） | 东南 | 南 | 东 | 北 | 西 | 东北 | 西南 | 西北 |
| 离宅（坐南朝北） | 东 | 北 | 东南 | 南 | 西北 | 西 | 东北 | 西南 |
| 震宅（坐东朝西） | 南 | 东南 | 北 | 东 | 东北 | 西南 | 西北 | 西 |
| 巽宅（坐东南朝西北） | 北 | 东 | 南 | 东南 | 西南 | 西北 | 西 | 东北 |
| 乾宅（坐西北朝东南） | 西南 | 东北 | 西 | 西北 | 东南 | 北 | 南 | 东 |
| 坤宅（坐西南朝东北） | 西北 | 西 | 东北 | 西南 | 东 | 南 | 北 | 东南 |
| 艮宅（坐东北朝西南） | 西 | 西南 | 西北 | 东北 | 南 | 东 | 东南 | 北 |
| 兑宅（坐西朝东） | 东北 | 西北 | 西南 | 西 | 北 | 东南 | 东 | 南 |

同文件给出四吉位用途与四凶位处理（第 138–148 行）：生气旺财（书房/主卧/财位）、延年旺婚姻（夫妻卧室）、天医利健康（老人房/静养）、伏位平稳（储物/次卧）；绝命最凶（忌主卧、门口，宜厕所储物间）、五鬼主火灾口舌（忌厨房、电器集中）、六煞主桃花（忌卧室）、祸害主小人破财（忌财位、书房）。

**张数/结构层面**：`dhicoc` 的八宅引擎 `apps/visual/src/legacy/bazhaiEngine.ts` 把结果组织为
`directions: Array<{direction, star, quality, meaning, advice}>`，`BazhaiResult.mingGua`，并附带 `taisui`（太岁/岁破/三煞/五黄）与 `menZhuZao`（门主灶）；`sourceNotes` 原文：「八宅命卦按出生年+性别推算（东四/西四命）；个人八方与大游星按八宅明镜传统口径，民俗参考。」`mode` 标 `local-exact`。

#### A.1.3 门主灶（阳宅三要）

来源：`dhicoc/...@main` → `knowledge-base/fengshui/mappings/three-essentials.json`（6841 B）。
按 `mappings/SCHEMA.md` 第 22 行，该文件约束为：「`concept` 包含门、主、灶；`door_main_combinations.key_combinations` 保留门主组合样例」。
实现见 `apps/visual/src/legacy/menZhuZaoEngine.ts`：输入 `{door, bedroom, kitchen}` 三个方位，输出三组关系
`doorBedroomRelation` / `doorKitchenRelation` / `bedroomKitchenRelation`，每组含 `type` / `tone` / `detail`。

### A.2 玄空飞星（三元理气）

#### A.2.1 三元九运时间表（两个来源一致）

来源 1：`voidforall/fengshui.skill@main` → `SKILL.md` 第 61–65 行：

| 元 | 运 | 年份 |
|---|---|---|
| 上元 | 一运 | 1864–1883 |
| 上元 | 二运 | 1884–1903 |
| 上元 | 三运 | 1904–1923 |
| 中元 | 四运 | 1924–1943 |
| 中元 | 五运 | 1944–1963 |
| 中元 | 六运 | 1964–1983 |
| 下元 | 七运 | 1984–2003 |
| 下元 | 八运 | 2004–2023 |
| 下元 | **九运** | **2024–2043（当前）** |

来源 2：同仓 `references/feixing.md`（3572 B）第 12–24 行，给出「各运运盘中宫星」表，**中宫星 = 运号**（一运中宫 1 … 九运中宫 9），年份区间与上表完全一致。

> **可落地提示**：运星入中不需要查表，`运盘中宫星 = 当前元运数`（来源 2 的表本身就是这个恒等式，只是把它列了出来）。九运当旺星 9、次旺 1、8；已衰 7（来源 1 第 91–95 行）。

#### A.2.2 洛书飞布轨迹与顺逆

来源：`voidforall/fengshui.skill@main` → `references/feixing.md` 第 5–10 行，原文：

```
**洛书轨迹**（顺序）：中→西北→西→东北→南→北→西南→东→东南
即：5→6→7→8→9→1→2→3→4（顺飞）
逆飞则反之：5→4→3→2→1→9→8→7→6
```

> ⚠ 这条轨迹与常见「中→乾→兑→艮→离→坎→坤→震→巽」顺序在**后四宫**上表述不同（该文写「南→北→西南→东→东南」）。
> 我**未**在任何仓库中找到与之配套的可执行飞布代码可交叉验证。重写时建议以「1 在坎、2 在坤、3 在震、4 在巽、5 在中、
> 6 在乾、7 在兑、8 在艮、9 在离」的洛书定位＋顺飞（+1 环）为唯一真源自建，并用九运盘金样本回归。

#### A.2.3 阴阳山与山星/向星顺逆（**两来源直接冲突，务必择一并写明**）

来源：`voidforall/fengshui.skill@main` → `references/feixing.md` 第 26–38 行，原文：

```
**阳山**：子、寅、辰、午、申、戌（奇数方位）
**阴山**：丑、卯、巳、未、酉、亥（偶数方位）
```

顺逆表（原文）：

| 坐山阴阳 | 立向阴阳 | 山星飞法 | 向星飞法 |
|---|---|---|---|
| 阳 | 阳 | 逆 | 顺 |
| 阴 | 阴 | 顺 | 逆 |
| 阳 | 阴 | 顺（上山） | 顺（下水） |
| 阴 | 阳 | 逆（上山） | 逆（下水） |

同仓 `SKILL.md` 第 86–89 行给的是另一版：

```
- 阳山阳向 → 山星逆飞，向星顺飞
- 阴山阴向 → 山星顺飞，向星逆飞
- 阴山阳向 / 阳山阴向 → 山星向星同飞（上山下水或下水上山）
```

> **判定**：两处对「阳阳 / 阴阴」一致；对「阴阳混」只给了「同飞」，**没有**说清是同顺还是同逆。
> `references/feixing.md` 补充为「阳山阴向→山顺向顺；阴山阳向→山逆向逆」。**这是本调研里最需要人工裁决的一处规则冲突。**
> 另注：该文把二十四山里的**十二地支**按奇偶分阴阳（子寅辰午申戌为阳），而**八天干与四维的阴阳未在阳山/阴山表中出现**——
> 玄空下卦需要 24 山全部阴阳，这一半数据**在 fengshui.skill 中未核实到**。

#### A.2.4 旺山旺向 / 上山下水 判据

来源：`voidforall/fengshui.skill@main` → `references/feixing.md` 第 60–69 行原文：

| 坐向 | 格局 | 备注 |
|---|---|---|
| 坐南朝北（午山子向） | 旺山旺向 | 九运最旺局之一，山向均得令 |
| 坐北朝南（子山午向） | 上山下水 | 九运财旺人丁稍弱 |
| 坐东朝西（卯山酉向） | 双星到向 | 财旺，前有水更佳 |
| 坐西朝东（酉山卯向） | 双星到坐 | 人丁旺，后有实山更佳 |

同文件第 69 行自注：「**详细排盘需逐宫计算，此处为大略参考。实际排盘建议使用完整飞星软件辅助。**」
→ 该仓**没有**给出可直接编程的「旺山旺向」判据，只有上述 4 个举例。

**可用的语义判据（来自 `SKILL.md` 第 97–103 行断事条，非算法）**：山星旺＋有实山→人丁兴旺；
向星旺＋有旺水→财运亨通；五黄到宫→主灾病；二黑到宫→病符；山星下水（旺星到向水位）→财旺人衰；
向星上山（旺星到坐山）→人丁旺财运差。

#### A.2.5 下卦 / 替卦

- 「兼向处理：以立向度数为准，落在哪个山即用哪个山的山阴阳。」——`references/feixing.md` 第 31 行。
- **替卦的完整规则（替星表、何时用替）在本次调研的全部仓库中均未核实到。** `references/feixing.md` 与 `SKILL.md`
  都只提到「兼向」，没有任何替卦（起星）表。**建议：替卦若要做，须另找秘传表来源，本文件不提供。** ⚠

#### A.2.6 实际实现的参照写法

`dhicoc/...@main` → `apps/visual/src/legacy/feixingEngine.ts`（6757 B）展示了工程上怎么切分：
`yuanYun {num,name,wangStar,shengStar,tuiStar}`、`center {centerStar,starName,wuxing,luck}`、
`grid: FlyingStarCell[][]`（**3×3 行优先，row0=巽离坤，row1=震中兑，row2=艮坎乾**，见 `baseTypes.ts` 第 200 行注释）、
`starStatuses`、`remedies[{palace,direction,starNum,starName,luck,remedy}]`、可选 `mingGua`。
`FlyingStarCell` 字段（`baseTypes.ts` 第 192–198 行）：`{palace, starNum, starName, wuxing, luck}`。
`sourceNotes` 原文：「飞星按九宫顺飞推算；元运旺衰与化解为玄空传统口径，民俗参考。」`mode` 标 `local-exact`。

> ⚠ 注意：该实现只做**流年飞星**（按 `year` 九宫顺飞），**未实现**运盘＋山星＋向星的三盘叠合。
> 也就是说「玄空飞星」这一法在当前参照实现里是**降级版**，重写时不能把它当完整玄空。

**流年飞星中宫数（`references/feixing.md` 第 73–83 行，逐字）**：

| 年份 | 中宫飞星 | 该文注记 |
|---|---|---|
| 2022 | 6 | 五黄在东北，二黑在南 |
| 2023 | 5 | 五黄在中宫，全盘皆慎 |
| 2024 | 4 | 五黄在西北，二黑在西 |
| 2025 | 3 | 五黄在西，二黑在东北 |
| 2026 | 2 | 五黄在东北，二黑在中宫——中宫二黑，全宅健康需注意 |
| 2027 | 1 | 五黄在南，二黑在西北 |
| 2028 | 9 | 五黄在北，二黑在西 |
| 2029 | 8 | 五黄在西南，二黑在东 |
| 2030 | 7 | 五黄在东，二黑在东南 |

> 这 9 行可反解出该文件的流年入中递推：**中宫星每年 −1（模 9）**，2023=5 → 2024=4 → … → 2030=7。
> 若按此递推，2026 应为 2 ✓（与表一致）。可作为自建实现的回归锚点。

### A.3 三合（二十四山三合局 / 十二长生水法）

**二十四山完整表（24 条，逐字抄录）**
来源：`dhicoc/chinese-traditional-wisdom-skill@main` → `knowledge-base/fengshui/mappings/twenty-four-mountains.json`（5219 B，`source`：「综合各派罗盘标准」）。
`notes` 原文：「二十四山由八天干(甲乙丙丁庚辛壬癸)+四维(乾坤艮巽)+十二地支(子丑寅卯辰巳午未申酉戌亥)组成。每山15度，共360度」。
CI 约束（`mappings/SCHEMA.md` 第 20 行）：`data` 必须为 24 条；每条含 `order`、`mountain`、`direction`、`degree_start`、`degree_end`、`wuxing`、`bagua`。

| # | 山 | 方向 | 起° | 止° | 五行 | 阴阳 | sanhe |
|---|---|---|---|---|---|---|---|
| 1 | 壬 | 北偏西 | 337.5 | 352.5 | 水 | 阳 | 水局长生 |
| 2 | 子 | 正北 | 352.5 | 7.5 | 水 | 阴 | 水局帝旺 |
| 3 | 癸 | 北偏东 | 7.5 | 22.5 | 水 | 阴 | 水局墓库 |
| 4 | 丑 | 东北偏北 | 22.5 | 37.5 | 土 | 阴 | 金局墓库 |
| 5 | 艮 | 正东北 | 37.5 | 52.5 | 土 | 阳 | 金局绝地 |
| 6 | 寅 | 东北偏东 | 52.5 | 67.5 | 木 | 阳 | 火局长生 |
| 7 | 甲 | 东偏北 | 67.5 | 82.5 | 木 | 阳 | 木局临官 |
| 8 | 卯 | 正东 | 82.5 | 97.5 | 木 | 阴 | 木局帝旺 |
| 9 | 乙 | 东偏南 | 97.5 | 112.5 | 木 | 阴 | 木局墓库 |
| 10 | 辰 | 东南偏东 | 112.5 | 127.5 | 土 | 阳 | 水局墓库 |
| 11 | 巽 | 正东南 | 127.5 | 142.5 | 木 | 阳 | 水局绝地 |
| 12 | 巳 | 东南偏南 | 142.5 | 157.5 | 火 | 阳 | 金局长生 |
| 13 | 丙 | 南偏东 | 157.5 | 172.5 | 火 | 阳 | 火局临官 |
| 14 | 午 | 正南 | 172.5 | 187.5 | 火 | 阴 | 火局帝旺 |
| 15 | 丁 | 南偏西 | 187.5 | 202.5 | 火 | 阴 | 火局墓库 |
| 16 | 未 | 西南偏南 | 202.5 | 217.5 | 土 | 阴 | 木局墓库 |
| 17 | 坤 | 正西南 | 217.5 | 232.5 | 土 | 阳 | 木局绝地 |
| 18 | 申 | 西南偏西 | 232.5 | 247.5 | 金 | 阳 | 水局长生 |
| 19 | 庚 | 西偏南 | 247.5 | 262.5 | 金 | 阳 | 金局临官 |
| 20 | 酉 | 正西 | 262.5 | 277.5 | 金 | 阴 | 金局帝旺 |
| 21 | 辛 | 西偏北 | 277.5 | 292.5 | 金 | 阴 | 金局墓库 |
| 22 | 戌 | 西北偏西 | 292.5 | 307.5 | 土 | 阳 | 火局墓库 |
| 23 | 乾 | 正西北 | 307.5 | 322.5 | 金 | 阳 | 火局绝地 |
| 24 | 亥 | 西北偏北 | 322.5 | 337.5 | 水 | 阳 | 木局长生 |

同文件附 `trigram_to_mountains`（逐字）：

```json
{"坎":["壬","子","癸"],"艮":["丑","艮","寅"],"震":["甲","卯","乙"],"巽":["辰","巽","巳"],
 "离":["丙","午","丁"],"坤":["未","坤","申"],"兑":["庚","酉","辛"],"乾":["戌","乾","亥"]}
```

**三合局（来源：`voidforall/fengshui.skill@main` → `references/wuxing-ganzhi.md` 第 103–107 行，逐字）**：

```
**三合局**（力量汇聚）：
- 申子辰合水局
- 亥卯未合木局
- 寅午戌合火局
- 巳酉丑合金局
```

同文件第 100–113 行另有：六合（子丑、寅亥、卯戌、辰酉、巳申、午未）、三刑（寅巳申、丑戌未、子卯、辰午酉亥自刑）、六冲（子午、丑未、寅申、卯酉、辰戌、巳亥）。

**十二长生水法（三合水法）**：可由上表 `sanhe` 字段**间接**推出各家山落在四局中的十二长生位
（例如：水局长生＝壬/申，水局帝旺＝子，水局墓库＝癸/辰，水局绝地＝巽，见第 1、2、3、10、11、18 行）。
但**完整的「十二长生水法」立向—来去水吉凶条文的成文规则，在本次调研仓库中未核实到**。
`references/wuxing-ganzhi.md` 与 `twenty-four-mountains.json` 都只提供到「某山属某局某位」为止。**⚠ 未核实到成文水法断例。**

### A.4 九星水法

**⚠ 未核实。** 本次调研的全部仓库中，**未找到**任何标题或内容明确为「九星水法」（辅星水法／纳甲水法）的规则表。
`dhicoc` 风水知识库中只有形势、理气、阳宅、综合、其他五类古籍与 6 个映射 JSON，不含九星水法专表
（见 `knowledge-base/fengshui/mappings/SCHEMA.md` 列出的 6 个文件名）。
`voidforall/fengshui.skill` 非公开目录（根 7 文件）中亦无。
→ **建议：该法暂不上，或标为近似并另找来源。**

### A.5 阳宅三要

- 映射表：`dhicoc/...@main` → `knowledge-base/fengshui/mappings/three-essentials.json`（6841 B）。
  结构约束（`SCHEMA.md` 第 22 行）：「`concept` 包含门、主、灶；`door_main_combinations.key_combinations` 保留门主组合样例」。
  → 即 **门／主／灶三要素 + 门主组合样例**，但**不是**完整的门主灶 8×8 吉凶全表（只有 "key_combinations" 样例）。
- 原文古籍：同仓 `knowledge-base/fengshui/03-yang-house/阳宅三要.md`（101211 B）**存在**（在文件树中确认），
  但我**未逐行阅读其正文**（体量原因），其规则条文**未核实**。
- 实现参照：`apps/visual/src/legacy/menZhuZaoEngine.ts`（7384 B）。

### A.6 四灵形势（青龙 / 白虎 / 朱雀 / 玄武）

- 定性描述**有**：`voidforall/fengshui.skill@main` → `SKILL.md` 第 45–55 行：
  「**砂**：四周护卫之山（青龙/白虎/朱雀/玄武）」「**水**：来水去水，水口收放」「**向**：立向，决定纳气方向」，
  并列经典原则「藏风聚气（背山面水，左右护砂，前有明堂）」「来龙入首」「水口收关」，以及「都市阳宅：道路即水，高楼即山，以形势法类比论断」。
- **可编程的四灵判据（方位—高下—吉凶的量化规则）：未核实。** 该仓只有上述定性原则，没有「左高右低／前低后高」之类的可计算阈值。
- 煞—化解表**有**（`SKILL.md` 第 156–175 行，逐字）：

| 煞名 | 形态 | 化解 |
|---|---|---|
| 路冲煞（弓箭煞） | 道路直冲大门 | 泰山石敢当、凸镜、屏风 |
| 天斩煞 | 两楼之间缝隙正对窗户 | 葫芦、铜貔貅朝外 |
| 壁刀煞 | 邻楼墙角切向本宅 | 凸镜 |
| 反弓煞 | 弯道弓背对宅 | 宜搬离或高墙遮挡 |
| 开口煞 | 停车场出入口正对住宅 | 屏风、假山遮挡 |
| 枯树烂木 | 门前或窗前有枯死树木 | 移除或种新树覆盖 |
| 尖角煞 | 邻建筑尖角冲射 | 凸镜、化煞符（需配合实际情况） |

内煞：穿堂风（玄关/屏风）、厕所冲财位、厨厕相邻、床头靠厕、横梁压床、镜对床。
原文附则：「**化煞以「移形易位」优先，摆件次之。能改变空间格局，强于任何风水物件。**」

- 另一套形势—化解数据：`dhicoc/...@main` → `knowledge-base/fengshui/mappings/form-sha-cures.json`（10064 B），
  CI 约束（`SCHEMA.md` 第 23 行）：`form_sha_table` 为非空数组；每条含 `name`、`type`、`description`、`severity`、`effect`、`standard_cure`。
  → **这是比 fengshui.skill 更适合程序化的形势煞表结构**（有 severity 与 effect 两个可入票型的字段）。

### A.7 六十甲子分金 · 孤虚 / 龟甲 / 空亡

**⚠ 未核实（本次调研未取得）。**
我用下列关键词在已取得的材料中检索：`六十甲子`、`分金`、`孤虚`、`龟甲`、`空亡`——
- `dhicoc` 风水知识库的 6 个映射 JSON（`life-trigram` / `eight-mansions` / `twenty-four-mountains` /
  `yearly-flying-stars` / `three-essentials` / `form-sha-cures`）**均不含**分金或孤虚龟甲表（已逐个确认文件主题）。
- `knowledge-base/fengshui/` 下的古籍（《宅经》《葬書》《天玉经》《都天宝照经》《催官篇》《阳宅十书》各章等，共 30 文件）
  我**未逐篇通读**，因此**不能断言其中没有**相关文字；但**本次没有取得可直接编程的分金表**。
- **结论：该法在本轮调研中标记为「未核实，需要补来源」。** 尤其「一百二十分金」「孤虚」「龟甲空亡」的
  吉凶归属表属于秘传/罗盘实物层级，若照抄二手网页极易出错，**不建议在无权威来源时实装**。

---

## B. 姓名

### B.1 五格剖象

**算法真源**：`dhicoc/chinese-traditional-wisdom-skill@main` → `apps/visual/src/legacy/nameWuxing.ts`（14736 B）。
文件头注释原文：「nameWuxing — 姓名五格剖象法 + 三才配置吉凶计算。五格：天格、人格、地格、外格、总格。三才取天/人/地格五行配置吉凶。」

**五格公式（源码第 246–267 行，逐字）**：

```ts
/**
 * 规则（单姓单名/单姓双名/复姓等通用）：
 * - 天格 = 姓氏笔画和 + 1
 * - 人格 = 姓氏末字 + 名字首字
 * - 地格 = 名字笔画和 + 1（单名）；双名为名字两字和
 * - 外格 = 总格 - 人格 + 1
 * - 总格 = 姓氏 + 名字所有笔画和
 */
const tian = surnameSum + 1;
const ren  = surnameLast + givenFirst;
const di   = givenChars.length === 1 ? givenSum + 1 : givenSum;
const zong = surnameSum + givenSum;
const wai  = zong - ren + 1;
```

实现细节：`wuGeEntries = [天格, 人格, 地格, 外格(取 Math.max(wai,1)), 总格]`（第 291–297 行）。

> **⚠ 注释与实现的落差**：注释写「复姓等通用」，但源码对**复姓**（姓氏 ≥2 字）仍用
> `tian = 姓氏笔画和 + 1`、`ren = 姓氏末字 + 名字首字`，即**单姓公式**；传统复姓口径为
> 「天格＝复姓两字之和」「人格＝姓末字＋名首字」。**该实现实际只覆盖单姓**，重写时要补复姓分支并单独标注口径。
> 五格含义（源码第 239–243 行，逐字）：
> 天格「祖上根基、先天运势」／人格「主运、自身核心运势」／地格「前运、早晚年环境」／
> 外格「副运、人际外界关系」／总格「后运、中晚年总运势」。

**笔画 → 五行（源码第 14–22 行，逐字）**：

```ts
function strokesToWuxing(strokes: number): string {
  const tail = strokes % 10;
  if (tail === 1 || tail === 2) return '木';
  if (tail === 3 || tail === 4) return '火';
  if (tail === 5 || tail === 6) return '土';
  if (tail === 7 || tail === 8) return '金';
  return '水'; // 9 / 0
}
```

即 **1/2→木、3/4→火、5/6→土、7/8→金、9/0→水**（文件头注释亦如此写，称「康熙标准」）。

### B.2 81 数吉凶

**表存在，且是独立数据文件**：`dhicoc/...@main` → `apps/visual/src/legacy/dayanList.json`（**13490 B**）。
类型（`nameWuxing.ts` 第 24–34 行）：

```ts
interface DaYan {
  number: number;
  lucky: string;            // 吉凶等第
  skyNine: string;          // 九星名
  comment: string;          // 详注
  femaleUnsuitable: boolean;// 女性不宜
  maxLuck: boolean;         // 最大好运标记
}
```

取数规则（源码第 36–40 行，逐字）：

```ts
/** 取数理记录；超过 81 按 fate 规则循环取模。 */
function dayanFind(n: number): DaYan {
  const idx = ((n - 1) % 81 + 81) % 81;
  return DAYAN[idx] ?? { number: n, lucky: '—', skyNine: '', comment: '', femaleUnsuitable: false, maxLuck: false };
}
```

来源标注（源码第 24 行）：「81 数理记录（来自 **fate dayan.go**，含九星名/详注/女性不宜/最大好运标记）」。
上游：`dhicoc/...@main` → `THIRD_PARTY_NOTICES.md` 第 18 行：康熙笔画与字义来自 **`babyname/fate`，源码注释声明 MIT**。

> **⚠ 我没有逐行抄录 81 条表值**（该文件 13490 B，本次未全文取得），因此**本文件不给出 81 数具体条文**。
> 但**字段结构与文件路径已核实**，重写时可直接以上述路径取真源，**不要凭记忆写 81 数吉凶**。

**数理 → 分（供票型用，源码 `nameRating.ts` 第 33–41 行，逐字）**：

```ts
function luckToScore(luck: string): number {
  if (luck.includes('大吉')) return 100;
  if (luck === '吉') return 90;
  if (luck.includes('半吉')) return 60;
  if (luck === '凶') return 20;
  if (luck.includes('凶')) return 25;
  return 50;
}
```

### B.3 三才配置

- 详描表：`dhicoc/...@main` → `apps/visual/src/legacy/sancaiDetails.json`（12673 B）。
  源码第 42 行注释：「三才详描表（来自 **fate sancai_data.go，118 组**）」。→ **118 组 = 5³ − 7（无此组合）量级，覆盖度较高**。
- 吉凶表：源码第 46–（内联在 `nameWuxing.ts`）`SANCAI_LUCK: Record<string,{luck,desc}>`，注释写「仅收录常见配置」。
  已读到的样例（逐字）：

| 三才（天-人-地） | 吉凶 | desc |
|---|---|---|
| 木木木 | 大吉 | 根基稳固，向上发展 |
| 木木火 | 吉 | 受上司引荐，顺调发达 |
| 木木土 | 凶 | 向下发展，易陷困弱 |
| 木火木 | 吉 | 上进顺利，博得名利 |
| 木土木 | 凶 | 基础不稳，易生变故 |
| 木金木 | 凶 | 克天格，基础动摇 |
| 木水木 | 吉 | 得长辈提拔，顺调 |
| 木水水 | 吉 | 得下属助，发展顺 |
| 火木木 | 吉 | 向上顺调，博得名利 |
| 火木金 | 凶 | 克下，易生变故 |
| 火木水 | 凶 | 克下，事业易破 |

取法（源码第 299–304 行）：`sanCaiKey = strokesToWuxing(天格) + strokesToWuxing(人格) + strokesToWuxing(地格)`。
三才 → 分（`nameRating.ts` 第 44–50 行）：大吉 100／吉 80／含「半」50／含「凶」20／否则 50。

### B.4 康熙笔画（姓名学的笔画基准）

`dhicoc/...@main` → `apps/visual/src/legacy/nameStrokes.ts`（1939 B）+ `kangxiStrokes.json`（**549414 B**）。
源码头注释逐字：「数据来自 **babyname/fate 项目 resources/character.json (MIT)**，已提取 `char → {k: kangxi_stroke, w: wu_xing}` 精简为 JSON。
简体字映射到其繁体本字的康熙笔画（如「伟」→「偉」11 画），符合传统姓名学「以康熙字典为准」的口径。**共 22107 个可起名汉字**，覆盖极广；未收录字回退估算并在 UI 标注。」

```ts
export function getKangxiStrokes(char: string): number | null { return KANGXI[char]?.k ?? null; }
export function getCharWuxing(char: string): string { return KANGXI[char]?.w ?? ''; }
/** 未收录字回退估算：用 Unicode 编码取模，仅作占位，UI 会标注「未收录」。 */
export function estimateStrokes(char: string): number { return ((char.charCodeAt(0) % 18) + 4); } // 4..21
```

> **⚠ 近似标记**：`estimateStrokes` 是 `charCodeAt % 18 + 4` 的**占位估算**，与真实笔画无关。
> 重写时必须把「康熙笔画命中率」作为一个显式保真度维度暴露（该仓用 `estimated: boolean` 逐字标记 + UI 扣分，见 `nameRating.ts` 第 211–214 行）。

### B.5 生肖姓名学（喜忌部首/字表）

**表存在且完整度高**：`dhicoc/...@main` → `apps/visual/src/legacy/zodiacNameChars.json`（**40277 B**）。
结构（实测反序列化后）：顶层为 12 个键，**恰好 12 生肖**：

```
keys: 鼠, 牛, 虎, 兔, 龙, 蛇, 马, 羊, 猴, 鸡, 狗, 猪
每个值: { "xi": "<喜用字串>", "ji": "<忌用字串>" }
```

实测样例（截断展示，字段名逐字）：
- `鼠: {"xi":"八入公冰凝几凤凱…", "ji": null/缺}` —— 鼠有 `xi`
- `牛: {"xi":"", "ji":"丁丙业丛丝丬主义习书些亭人亿什仁仃…"}` —— 牛只有 `ji`
- `虎: {"xi":"", "ji":"一万三严丰临之乔乡书二亚亞亨享亭亮人亿仁…"}` —— 虎只有 `ji`

> **⚠ 重要结构发现**：**并非每个生肖都同时有 xi 与 ji**——牛、虎的 `xi` 为空串。
> 代码侧对此有显式降级（`nameRating.ts` 第 87–102 行）：xi/ji 命中则 ±40，**两边都未命中时回退五行相生近似**：
> 同行 80 分／相生 90 分／相克 40 分，基础分 60 分。
> 且注释（第 77–80 行）称「生肖契合度（**fate 真实喜忌表**）：名字字在生肖忌用字表中扣分，在喜用字表中加分；**无喜用表时回退五行相生近似**」。
> 生肖→五行映射（源码第 70–73 行，逐字）：
> `鼠水 牛土 虎木 兔木 龙土 蛇火 马火 羊土 猴金 鸡金 狗土 猪水`。
> 生肖年推算（源码第 82–83 行）：`zodiacs = ['猴','鸡','狗','猪','鼠','牛','虎','兔','龙','蛇','马','羊']`，
> `zodiac = zodiacs[((birthYear - 4) % 12 + 12) % 12]`。**注意这是「立春换年」还是「正月初一换年」未在代码中体现，⚠ 需在合盘的口径声明里标明。**

### B.6 姓名五维加权评分（可直接借用为「姓名法」的票型分量）

`dhicoc/...@main` → `apps/visual/src/legacy/nameRating.ts`（10556 B）。
文件头注释逐字（第 3–14 行）：

```
 * nameRating — 姓名五维评分（fate P3，简化自建版）。
 * 参考 babyname/fate 的 `internal/rating/rating.go` 五维框架与权重，
 * 但各维度用本项目已有数据计算（非 fate 的 ent.Character/chronosfate 口径）：
 * - 五格数理 30%：5 格吉凶计分（吉100/半吉60/凶20）
 * - 三才配置 15%：三才吉凶（大吉100/吉80/半吉半凶50/凶20）
 * - 五行平衡 25%：五行分布均匀度（标准差越小越高）
 * - 字义五行 20%：字元字义五行多样性 + 未收录字扣分
 * - 命理契合 10%：出生年生肖五行契合；若提供完整生辰，叠加八字喜用神补强评分
 * 等级表对齐 fate scoreToGrade：≥90上上 / ≥80上吉 / ≥70中吉 / ≥60中平 / ≥50中下 / <50下下。
 * 明确标注「简化自建口径，非 fate 令分数体系」。
```

总分 = 五维加权求和后取整（第 239–241 行）；等级阈值见 `scoreToGrade`（第 109–116 行）。
第 5 维在有完整生辰时 = 生肖契合 ×0.5 + 八字用神补强 ×0.5（第 227 行）。
用神补强规则（第 137–174 行）：字义五行 == 喜用神 → 100；生喜用神 → 85；克喜用神 → 35；用神克该行（泄）→ 45；否则 60。
置信声明（第 247–248 行，逐字）：「五维评分（五格数理、三才配置、五行平衡、字义五行、命理契合）综合得出，**姓名学为传统文化参考，不构成命名决策依据**。」

---

## C. 签卜 / 杂占

### C.1 灵签系统的字段结构（**已取得真实记录**）

**真源**：`Brhiza/mingyu@main`（AGPL-3.0）→ `packages/core/src/divination/ssgw-data/`。

`ssgw-data/types.ts`（589 B，逐字）：

```ts
export const SSGW_INTERPRETATION_FIELDS = [
  '核心寓意','事业','财运','感情','学业','健康','行动建议','风险提醒',
] as const;
export type SsgwInterpretation = Record<SsgwInterpretationField, string>;

export interface RawSsgwSign {
  id: number;
  title: string;
  qianwen: string;   // 签诗
  story: string;     // 典故
  details: Record<string, string>;
}
export interface SsgwSign extends Omit<RawSsgwSign, 'details'> {
  details: Record<string, string> & SsgwInterpretation;
}
```

**真实记录样例**（`ssgw-data/signs-01.ts`，逐字抄录，含三种签级）：

```ts
{
  id: 1,
  title: '第一签 唐天子游凤凰山（上上签）',
  qianwen: '敕到凤凰池，好事莫嫌迟，黄金来助你，神鬼不敢欺',
  story: '唐天子游凤凰山，凤凰为祥瑞之鸟，天子出游，必有盛事。此乃大吉之兆，预示着将有极大的荣耀和喜事发生。',
  details: {
    凡事做事: '大吉大利，所谋皆成。…',
    爱情婚姻: '天赐良缘，佳偶天成。…',
    '工作求职 创业事业': '事业运极佳，有贵人鼎力相助…',
    '考试竞赛 升迁竞选': '考运亨通，金榜题名。…',
    投资理财: '…', 经商生意: '…', 房地交易: '…', 治病健康: '…',
    转换变更: '…', 求孕求子: '…', 官司诉讼: '…', 寻人寻物: '…', 远行出国: '…',
  },
}
{ id: 2, title: '第二签 武后生太子登基（中平签）', qianwen: '国泰民安乐，官清人自作，路上往来人，乡村处处乐', ... }
{ id: 3, title: '第三签 王双福火烧临红楼（下下签）', qianwen: '门前犬吠哀，福去祸又来，劝君休借问，凡事请沉埋', ... }
```

> **⚠ 关键结构发现（重写时务必注意）**：**签级没有独立字段**，它是**写在 `title` 字符串的括号里**的
> （`（上上签）`/`（中平签）`/`（下下签）`）。若要做票型，必须先从 title 正则抽取签级，或新增 `grade` 字段。
> 实测到的签级取值：**上上签、中平签、下下签**（`signs-01.ts` 内 3 条）。其余签级取值**未核实**（未通读全部 signs 分片）。
>
> **另一处不一致**：`details` 的**实际键**（13 个：凡事做事、爱情婚姻、工作求职 创业事业、考试竞赛 升迁竞选、
> 投资理财、经商生意、房地交易、治病健康、转换变更、求孕求子、官司诉讼、寻人寻物、远行出国）
> 与 `SSGW_INTERPRETATION_FIELDS` 声明的 **8 个字段**（核心寓意、事业、财运、感情、学业、健康、行动建议、风险提醒）
> **不是同一套**。即 `SsgwSign.details` 的类型断言在实际数据上并不成立。重写时应把「域键」做成可配置词表。

**签谱规模与分片**（`tree-mingyu.txt` 实测）：`ssgw-data/signs-01.ts`(30792 B)、`signs-02.ts`(28961 B)、
`signs-03.ts`(29107 B)、`signs-full.ts`(**138805 B**)、`interpretation.ts`(40743 B)。→ 合计约 26 万字节正文，
**总签数未核实**（未统计 `id` 最大值）。

**文本卫生规则（很值得抄）**：`ssgw-content.ts`（1625 B）——合并签谱中重复的「典故」字段，规则：
先按 `[。！？!?]` 断句，再**过滤掉提到别签号的句子**，最后用去标点归一化后做包含判定：

```ts
const references = [...sentence.matchAll(/第\s*(\d+)\s*签/gu)].map((m) => Number(m[1]));
return references.every((number) => number === currentNumber);   // 丢弃串签的句子
...
.filter((sentence) => !sentence.includes('全方位的多'))          // 丢弃模板套话
```

→ **这是防「签文串号/模板串味」的实战手段，建议直接搬。**

### C.2 掷筊（三掷）的概率与判定

**⚠ 未核实到可编程的掷筊模型。** 本次调研仓库中：
- `quetzal-china/lenormand-divination-skill`、`voidforall/fengshui.skill`、`oraclebone`、`mingyu`、
  `liu-he-xuan-ji`、`chinese-traditional-wisdom-skill`、`tarot-astro` **均无**「掷筊 / 筊杯 / 圣筊 / 笑筊 / 阴筊」的实现或规则表。
- 与之最接近的是**六爻的铜钱面映射**，两处实测如下（**注意二者不同，别混用**）：

**(a) `MTKEN368/liu-he-xuan-ji@main` → `SKILL.md` 第 115–119 行 / `references/system-framework.md` 第 85–88 行（两份一致）**：

```
2字1背 = 少阴（—）
1字2背 = 少阳（—）
3字   = 老阴（-- × 动爻）
3背   = 老阳（— ○ 动爻）
```
> 该映射与常见「一背为单（阳）、二背为拆（阴）、三背为重、三字为交」的口径**相反**，属该仓自定口径。
> 但注意：**这正是 `dsh-divination-108` 现有 money 面值编码的语义来源**，若现有实现沿用此表则保持一致即可；
> 若要对齐传统口径，需**显式写进口径声明**，不能默默改。

**(b) `ChesterRa/mingpan@main` → `README.md` 第 126–130 行（**推荐作为爻值规范**）**：

```
六爻输入为六个爻值（自下而上）：
- 6 = 老阴（动爻，阴变阳）
- 7 = 少阳（静爻）
- 8 = 少阴（静爻）
- 9 = 老阳（动爻，阳变阴）
```
> 同一 README 第 142 行另有梅花爻序口径：「爻位统一**自下而上**编号 1–6；变卦反转指定动爻，
> 互卦取本卦第 2、3、4 爻为下卦，第 3、4、5 爻为上卦」，并**主动声明了未采用的分支**：
> 「当前实现对乾、坤也按相同爻位取互；**未采用原文另述的「乾坤无互，互其变卦」分支**」。
> → **这种「声明我选了哪一支、明说没选哪一支」的写法，直接对应本插件的保真度/⚠ 标注要求。**

**`oraclebone` 的蓍草概率（唯一实测到的显式概率模型）**：
`sapuyou45-bit/oraclebone@main` → `README.md` 第 56 行（该仓自述）：
「`cast_iching` | I Ching reading with quantum RNG using **traditional yarrow stalk probabilities (1:5:7:3)**.
Returns hexagram, trigrams, judgment, image, six lines with changing status.」
→ 即老阴:少阳:少阴:老阳 的**相对权重 1:5:7:3**（对应概率 1/16、5/16、7/16、3/16）。
我在 `oraclebone/iching.py` 的 schema（`oraclebone/schemas/iching-cast.schema.json`，4420 B）与
`skills/iching/references/casting-methods.md` 中也看到了相应声明。**该 1:5:7:3 与 mingpan 的 6/7/8/9 爻值完全兼容**
（6↔老阴=1/16，7↔少阳=5/16，8↔少阴=7/16，9↔老阳=3/16）——**建议以此作为六爻起卦的唯一概率规范。**

### C.3 周公解梦的梦象结构

**真源**：`dhicoc/...@main` → `apps/visual/src/legacy/dreamDictionary.ts`（8697 B）+ `dream-data/dreamData.ts`（**581345 B**）
+ `dream-data/dream-dictionary.source.json`（**12539665 B，12 MB**，本次**未下载**）。

**记录结构（源码逐字，`dreamData.ts` 头部 + `dreamDictionary.ts` 第 13 行 import）**：

```ts
export interface DreamEntry {
  title: string;    // 梦象名（如「蛇」）
  biglx: string;    // 大类
  smalllx: string;  // 小类
  zm: string;       // 标记（实测样例为 "S"）
  luck: string;     // 吉凶
  meaning: string;  // 解读正文
}
export const DREAM_ENTRIES: DreamEntry[] = [
  { title: "蛇", biglx: "动物", smalllx: "冷血类", zm: "S", luck: "大凶", meaning: "蛇在梦中出现…（长文）" },
  ...
];
```

**吉凶枚举与排序权重（`dreamDictionary.ts` 第 18–39 行，逐字）**：

```ts
export const LUCK_COLOR: Record<string, string> = { 大吉, 吉, 中平, 凶, 大凶 };   // 5 档 → CSS 变量
const LUCK_ORDER: Record<string, number> = { 大吉: 0, 吉: 1, 中平: 2, 凶: 3, 大凶: 4 };
export const BIG_CATEGORIES = ['人物','动物','植物','物品','活动','生活','自然','鬼神','建筑','其它'] as const; // 10 大类
```

**数据来源与规模（源码头注释逐字）**：
- 现代解读层：**`oswin-hu/zhougong_dream` 9550 条**（精选 137 条内嵌 `dreamData.ts`，全量 9548 条按大类与体积分片，
  运行时按 manifest 加载）；
- 古文原典层：**`KianReed/dreamlogic-mcp` 952 条**原版周公解梦古文断语（内嵌）；
- 均声明 **MIT**（`THIRD_PARTY_NOTICES.md` 第 17 行：「declared MIT in source comments」，但**治理状态栏写明
  「Upstream revision/hash must be recorded before formal redistribution」**——上游 revision 未固定）。

**检索优先级（可直接复用为「测梦」入口逻辑，`dreamDictionary.ts` 第 51–65 行）**：
`精确匹配 title` → `title.startsWith(kw)` → `title.includes(kw)`；每组内按 `LUCK_ORDER` 与 `title` 长度排序。
源码注释还写了一条**踩坑经验（值得抄）**：「注意不能用 `kw.includes(e.title)`：空 title 会让任何 kw 都命中，
且短 title（如"大"）会误匹配长关键词（如"大象"）」。

**梦象 → 五行/方位归类**：`dreamDictionary.ts` 第 9–10 行注释称提供「吉凶配色、大类分类、**多系统联动提示**
（梦见水→北方位/飞星坎宫等），与八宅/飞星模块的方位体系对齐」。
→ 即**联动是「梦象大类 → 方位/九宫」的映射**，由项目自建；**「梦象五行归类」的完整对照表未核实**
（`dreamDictionary.ts` 只到 10 大类，未见五行字段）。

### C.4 测字取数

**真源**：`dhicoc/...@main` → `apps/visual/src/legacy/ceziEngine.ts`（15412 B）。
头注释逐字：

```
 * ceziEngine — 测字（字占）引擎
 * 输入一个字，分析：
 * - 笔画（康熙）+ 数理吉凶（81 数理表，复用 fate dayanList）
 * - 字义五行 + 字义本义（复用 kangxiStrokes / charMeanings）
 * - 字形结构 + 结构象义（charStructure）
 * - 偏旁部首象义（charStructure）
 * - 可选八字用神补益（传入 birth 时，判断该字五行是否补日主用神）
 * 输出：吉凶定调 + 性格/事件预示 + 事业/感情影响 + 改字/起名建议
```

输入/输出契约（源码逐字）：

```ts
export interface CeziInput {
  char: string;        // 所测字（取首字）
  birth?: BaziBirth;   // 可选生辰（结合八字用神补益判断）
  aspect?: '事业'|'感情'|'财利'|'健康'|'综合';
  solar?: unknown;
}
export interface CeziResult {
  char: string; strokes: number; strokesEstimated: boolean;
  shuli: { number: number; lucky: string; skyNine: string; comment: string };  // 81 数理
  ...
}
```

**取数法（实测）**：`首字 → 康熙笔画 k → dayanFind(k) 取 81 数理`（复用与姓名同一套 `dayanList.json` 与同一取模规则），
再叠加 `charStructure` 的字形/部首象义与可选八字用神补益。
→ 即该仓的「测字」本质是 **笔画数理 + 字形象义 + 用神补益** 三层，**不是**传统的「加笔画/拆字起卦成卦」。
**传统测字的「拆字成卦／取数成卦」算法：未核实。**

### C.5 五音占

**⚠ 未核实。** 本次调研的全部 11 个仓库中，**未找到**任何「五音占 / 五音姓利 / 宫商角徵羽占」的实现、数据表或规则条文。
→ 建议：标为不支持，或另找来源；**不要凭模型知识补写五音归属表**。

---

## D. 西方

### D.1 塔罗 78 张牌结构

两处实测，**结构一致、编号口径不同**：

**(a) `Brhiza/mingyu@main` → `packages/core/src/divination/tarot-data.ts`（11024 B）**
`tarotCards` 为 **78 条**，字段 `{ name, type, suit?, number }`；`type ∈ {'大阿卡纳','小阿卡纳'}`。
- 大阿卡纳 **22 张**，`number` **1–22**（愚者=1 … 世界=22）——注意**这是 1-based**，不是 0-based。
- 小阿卡纳 **56 张** = 4 花色 × 14 张，`number` **23–78**。
- 四花色（按出现顺序）：**权杖(23–36)、圣杯(37–50)、宝剑(51–64)、钱币(65–78)**。
- 14 阶：王牌、二…十、侍者、骑士、王后、国王。

**(b) `sapuyou45-bit/oraclebone@main` → `oraclebone/tarot.py`（6683 B，MIT）** —— **推荐作为规范源（0-based + 显式分解）**：

```python
MAJOR_ARCANA = ["The Fool","The Magician",...,"The World"]        # 22 张
SUITS  = ["Wands","Cups","Swords","Pentacles"]
RANKS  = ["Ace","Two",...,"Ten","Page","Knight","Queen","King"]   # 14
def build_deck(deck_name):
    major = [{"name": n, "arcana": "major", "suit": "", "index": str(i)} for i, n in enumerate(MAJOR_ARCANA)]
    if deck_name == "major": return major
    minor = [{"name": f"{rank} of {suit}", "arcana": "minor", "suit": suit,
              "index": str(22 + suit_index*len(RANKS) + rank_index)}
             for suit_index, suit in enumerate(SUITS) for rank_index, rank in enumerate(RANKS)]
    return major + minor
```
→ `index` **0-based**，`deck_size` 由 schema 限定为 **枚举 22 或 78**（`oraclebone/schemas/tarot-draw.schema.json` 第 38–44 行）。

**花色主题映射（`oraclebone/tarot.py` 第 57–82 行，逐字）**：
`Wands: energy, initiative, work, ambition`｜`Cups: emotion, relationship, belonging, desire`｜
`Swords: thought, conflict, language, decisions`｜`Pentacles: material reality, money, health routines, craft`。

**阶位主题映射（同文件第 84–99 行，逐字）**：
`Ace: seed`｜`Two: choice or balance`｜`Three: development`｜`Four: stability or pause`｜`Five: friction`｜
`Six: adjustment or return`｜`Seven: challenge`｜`Eight: effort or movement`｜`Nine: culmination`｜
`Ten: completion or burden`｜`Page: learner`｜`Knight: active pursuit`｜`Queen: mature receptivity`｜`King: mature direction`。

**大阿卡纳牌义数据（结构化，可直接入库）**：`oraclebone/data/tarot_meanings.json`（4343 B），
顶层键 `major_arcana`，每张牌给 `{ upright[], shadow, question }`（实测 `card_meanings()` 读取 `data["upright"]` /
`data["shadow"]` / `data["question"]`）。
另外 `skills/tarot/references/cards.md`（2797 B）给了 **22 张大阿卡纳的三列表**（Core theme / Shadow / Practical question），
逐字样例：`The Fool | beginning, risk, openness | naivety | What can start small?`、
`Wheel of Fortune | cycles, timing, change | helplessness | What is turning without permission?`、
`The World | completion, integration, arrival | closure anxiety | What cycle is complete?`。

### D.2 正逆位（reversal）

**判定方式（`oraclebone/tarot.py` 第 168–179 行，逐字）**：

```python
for position, card in zip(positions, selected):
    reversed_card = bool(rng.choice([False, True])) if reversals else False
    cards.append({ ..., "reversed": reversed_card,
                   "orientation": "reversed" if reversed_card else "upright",
                   "meanings": card_meanings(card, reversed_card) })
```

→ **逆位是「每张牌独立 50% 抛硬币」**（`rng.choice([False, True])`），**标准 50% 概率**；
且**逆位默认关闭**（`--reversals` flag / `reversals_enabled` 字段）。
逆位时的牌义处理（同文件第 124–141 行）：
- 大阿卡纳：`reading_cue = data["shadow"] if reversed_card else ", ".join(data["upright"])`
- 小阿卡纳：`reading_cue = f"{RANK_THEMES[rank]} (reversed: blocked or excess)"` if reversed else `RANK_THEMES[rank]`

→ **逆位 = 用 `shadow` 字段替换 `upright` 关键词**，这是一条极清晰的「正逆位 = 数据字段切换」实现范式。

### D.3 牌阵：三牌阵与凯尔特十字的牌位语义

**三牌阵（两处口径不同，需择一）**：

| 来源 | 3 张牌位（按序） |
|---|---|
| `oraclebone` `skills/tarot/references/spreads.md` 第 15–25 行 | **Situation / Obstacle / Guidance** |
| `mingyu` `tarot-data.ts` 的 `three` | **过去 / 现在 / 未来**（`name: '时间流牌阵'`） |
| `mingyu` 的 `holyTriangle` | 问题根源 / 当前状况 / 发展结果 |
| `mingyu` 的 `mindBodySpirit` | 心灵(思想) / 身体(行动) / 精神(灵性) |
| `pandorium` README 第 103–105 行 | `triplet` 3 张：**Past / Present / Future** |

**凯尔特十字（10 张，`mingyu` `tarot-data.ts` `celtic`，逐字）**：

```
'当前状况','挑战/阻碍','目标与潜能','现实基础','过去影响',
'近期未来','你的态度','外界影响','希望与恐惧','最终结果'
```
同条 `description`：「从背景、阻碍、环境、态度与结果多层观察复杂问题。」
`pandorium` README 亦写 `celtic` = 10-card Celtic Cross（仅名称，无牌位表）。

**mingyu 的完整牌阵清单（19 种，`tarot.ts` 第 16–38 行的 enum + 中文描述，逐字）**：
`single` 单牌指引｜`three` 时间流｜`love` 爱情｜`career` 事业｜`decision` 选择｜`celtic` 凯尔特十字｜
`chakra` 七脉轮｜`year` 年运｜`mindBodySpirit` 身心灵｜`horseshoe` 马蹄铁｜`holyTriangle` 圣三角｜
`universal` 万能｜`fourElements` 四元素｜`hexagram` 六芒星｜`relationship` 关系｜`wealth` 财富｜
`problemSolving` 问题解决｜`twelveHouses` 十二宫。
每种牌阵在 `tarot-data.ts` 中都有 `{name, description, positions[], cardCount}` 四字段（**这是最干净的牌阵 schema，建议直接采用**）。

**牌位语义 → 解读任务的模板化（`mingyu` `prompt/tarot-spread.ts`，7598 B）**：
为每种牌阵定义三元组 `TarotSpreadPromptFramework { mainLine, connections, conclusion }`，逐字样例：
- `three`：mainLine「按过去、现在、未来的时间顺序追踪事件如何演变。」connections「说明过去如何形成现在、现在又如何推动或改变未来。」
- `celtic`：mainLine「由当前与阻碍切入，依次分析目标与可达潜能、已形成的现实基础、正在消退的过去影响和近期未来，再结合个人态度、外界影响、希望与恐惧形成全局判断。」connections「比较目标与现实基础的距离，区分希望、恐惧与客观条件…」
- `single`：`connections` 明确写「**不扩展不存在的跨牌关系**」。
并有一条**通用兜底** `GENERIC_TAROT_SPREAD_PROMPT_FRAMEWORK`（第 106–110 行），以及 `buildTarotSpreadTask()` 生成的固定四段：
「依据牌阵、牌位、正逆位与牌序组合回答【问题】。／事实核对：逐张对应牌位、牌名、正逆位、关键词与基础牌义；
牌位职能作为该牌落到问题中的条件。／解读主线：…／牌位联动：…／结论重点：…」
→ **「事实核对」段落是防幻觉的结构化抓手，建议照抄该形态。**

### D.4 卢恩 24 符文

**⚠ 未核实（无符文表）。** 本次调研中：
- `Naitellos/pandorium-mcp` 的**仓库只有 3 个文件**（`LICENSE`、`README.md`、`smithery.yaml`），**无任何代码或数据**。
  其 `README.md` 第 57 行自述 `cast_runes`：「Elder Futhark runes with quantum RNG. Spreads: single, norns (3 runes: past/present/future), cross (5 runes).
  **Names, unicode symbols, meanings, deity/element/tree associations.**」
  → 声明了符文带「名称/Unicode/含义/神祇/元素/树」六个维度，**但 24 个符文的具体条目在该仓中不存在**（未核实）。
- `Tarot-Astrology-...-skill`、`oraclebone`、`mingyu`、`lenormand-divination-skill` **均无卢恩实现**。

→ **结论：卢恩 24 符文若要实装，必须另找权威符文表；本轮调研不提供任何符文内容。**

### D.5 占星本命（行星 / 宫位 / 相位与容许度）

**这部分有真实、完整、可执行的实现**：`Brhiza/mingyu@main` → `packages/core/src/astrology/engine.ts`（**28685 B**）。

**相位角度定义（源码第 83–98 行，逐字）**：

```ts
const ASPECT_ANGLES: Record<AspectType, number> = {
  conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180,
  'semi-sextile': 30, 'semi-square': 45, quintile: 72,
  sesquiquadrate: 135, biquintile: 144, quincunx: 150,
  septile: 360 / 7, novile: 40, decile: 36,
};
```

**容许度表（源码第 100–114 行，逐字 —— 这是本次调研拿到的唯一成文 orb 表）**：

| 相位 | 角度 | **默认容许度°** |
|---|---|---|
| conjunction 合相 | 0 | **8** |
| sextile 六合 | 60 | **6** |
| square 刑相 | 90 | **7** |
| trine 拱相 | 120 | **8** |
| opposition 冲相 | 180 | **8** |
| semi-sextile 半六合 | 30 | **2** |
| semi-square 半刑 | 45 | **2** |
| quintile 五分相 | 72 | **2** |
| sesquiquadrate 补八分相 | 135 | **2** |
| biquintile 倍五分相 | 144 | **2** |
| quincunx 补十二分相 | 150 | **3** |
| septile | 360/7 | **1** |
| novile | 40 | **1** |
| decile | 36 | **1** |

**相位强度与 orb 的关系（源码第 466–477 行，逐字）**：

```ts
const orb = orbs[type];
if (deviation > orb) continue;
const strength = orb === 0 ? 100 : Math.max(0, 100 * (1 - deviation / orb));
```

→ **强度 = 100 × (1 − 偏差/容许度)**，线性；偏差为 0 时 100，等于容许度时 0。orb 可被调用方覆盖（`options.orbs`）。

**容许度分档（`packages/core/src/divination/astrolabe-aspect-evidence.ts`，711 B，全文逐字）**：

```ts
export type AstrolabeAspectCloseness = '紧密' | '中等' | '宽松';
export function classifyAspectClosenessByRatio(ratio: number): AstrolabeAspectCloseness {
  if (!Number.isFinite(ratio) || ratio < 0) return '宽松';
  if (ratio <= 1 / 3) return '紧密';
  if (ratio <= 2 / 3) return '中等';
  return '宽松';
}
export function normalizedOrbRatioFromStrength(strength: number): number {
  const normalizedStrength = Math.max(0, Math.min(100, strength));
  return Number((1 - normalizedStrength / 100).toFixed(4));
}
```
→ **可移植性极高**：给定 strength（0–100）即可反推归一化 orb ratio，再分「紧密/中等/宽松」三档。
**这是把「相位强弱」变成可入票型的离散档位的最省事做法。**

**宫位制（源码第 639、663、760–763 行）**：`houseSystem?: 'placidus'`，默认 **`'placidus'`**；
输出时 `chart.houseSystem === 'whole_sign' ? 'whole_sign' : 'placidus'`。
→ 该引擎只支持 **Placidus + Whole Sign** 两种。
（对照：`pandorium` README 第 97 行声明支持 7 种：`placidus`(默认)、`koch`、`regiomontanus`、`equal`、`whole_sign`、`campanus`、`porphyry` —— 但**该仓无代码，未核实**。）

**行星/点位清单（`algo-astrolabe.ts` 第 35–68 行，逐字）**：
Sun 太阳、Moon 月亮、Mercury 水星、Venus 金星、Mars 火星、Jupiter 木星、Saturn 土星、Uranus 天王星、
Neptune 海王星、Pluto 冥王星、Chiron 凯龙星、Ceres 谷神星、Pallas 智神星、Juno 婚神星、Vesta 灶神星、
North/South Node 南北交点（True/Mean 两种）、True/Mean Lilith 莉莉丝、Part of Fortune 福点、Part of Spirit 精神点；
四轴：Ascendant 上升、Midheaven 天顶、Descendant 下降、Imum Coeli 天底。

**星体位置计算方式**：`@file` 头注释逐字：「西洋星盘算法／传统依据：现代西方占星通行的本命、宫位、相位与行运定义；
**星体位置采用现代天文星历计算资料**。」依赖 `../../astrology/engine` 的 `calculateChart`。
仓库内确实**内置了切比雪夫星历数据**（`packages/core/data/astrology/caelus/{ceres,juno,pallas,vesta}_cheb.json`，
每个 23 万–34 万字节），并有 `packages/core/src/astrology/vendor/caelus/LICENSE`（1076 B）。
→ **即小行星位置是真实星历，不是近似公式**；但**主行星用哪个星历（VSOP87？内置表？）我未核实**
（`astrology-engine.ts` 只读了前 200 行 + 相位段）。

**必然尊贵（essential dignity，源码第 132–205 行，逐字）**——可直接入库的 7 行星表：
`Sun: domicile Leo / exaltation Aries / detriment Aquarius / fall Libra`；
`Moon: Cancer / Taurus / Capricorn / Scorpio`；
`Mercury: Gemini,Virgo / Virgo / Sagittarius,Pisces / Pisces`；
`Venus: Taurus,Libra / Pisces / Scorpio,Aries / Virgo`；
`Mars: Aries,Scorpio / Capricorn / Libra,Taurus / Cancer`；
`Jupiter: Sagittarius,Pisces / Cancer / Gemini,Virgo / Capricorn`；
`Saturn: Capricorn,Aquarius / Libra / Cancer,Leo / Aries`。
中文标签：`domicile→入庙`、`exaltation→曜升`、`detriment→落陷`、`fall`（标签未读全）。
`getEssentialDignity(planetName, signName)` 同时接受英文与中文星座名（表里两种都存）。

**相位中文标签（`algo-astrolabe.ts` 第 85–98 行，逐字）**：
`conjunction 合相`｜`sextile 六合`｜`square 刑相`｜`trine 拱相`｜`opposition 冲相`｜
`semi-sextile 半六合`｜`semi-square 半刑`｜`quintile 五分相`｜`sesquiquadrate 补八分相`｜`biquintile 倍五分相`。

### D.6 合盘（synastry）

**有真实实现**：`Brhiza/mingyu@main` → `packages/core/src/divination/astrolabe-synastry.ts`（**34811 B**）
+ 测试 `tests/astrolabe-synastry.test.ts`（11382 B）。

**已核实**：
- 存在专门的 synastry 证据层与 prompt 层（`src/lib/astrolabe-synastry-prompt.ts`，951 B）。
- `astrology/engine.ts` 暴露的相位计算是**通用函数**（对任意两组点位求相位），因此 synastry 是在同一 orb 体系下
  **跨盘配对求相位**，orb 表与 D.5 完全一致（同源 `DEFAULT_ORBS`）。
- `pandorium` README 第 46 行自述 `calculate_synastry`：「Astrological compatibility between two people.
  **Inter-chart aspects with weighted scoring (0-100)**, house overlays, relationship strengths/challenges.」
  → 声明了**加权评分 0–100** 与**宫位叠加(house overlays)**，但该仓无代码，**权重表未核实**。

**⚠ 未核实**：`astrolabe-synastry.ts` 的**具体加权方案**（哪些相位配对加多少分、是否有星体权重、
house overlay 的计分规则）我**未逐行读取**该 34 KB 文件，因此**本文件不给出任何 synastry 权重数值**。
重写时应打开 `mingyu/packages/core/src/divination/astrolabe-synastry.ts` 取真源，或自定义并在口径声明中写明。

---

## E. 【最关键】聚合架构模式

> 本节是本次调研的核心产出。每条结论都给出**可落地的做法** + **来源仓库/文件**。
> 我把 6 个问题按 ①–⑥ 分节，最后给一张**跨项目做法对比表**与**推荐组合方案**。

### E.1 ① 确定性计算 vs LLM 解读的边界划分

**共识（6 个项目独立收敛到同一条）**：**脚本/引擎产出结果 → LLM 只解读，绝不生成结果。**

| 项目 | 边界表述（逐字） | 来源文件 |
|---|---|---|
| oraclebone | 「**AI interprets the generated result and does not generate the divination result.**」 | `shared/interpretation-protocol.md` 第 5 行 |
| oraclebone | 「The divination process belongs to scripts or explicit user input.」（称其为 **the core rule**） | `shared/methodology.md` 第 9–12 行 |
| mingpan | 「只包含确定性排盘信息；**五行强弱、格局、用神等解读由 AI 依据盘面自行分析**。」 | `README.md` 第 184 行 |
| mingpan | 产品定位：「**Facts only — interpretation is left to the AI.**」 | 仓库 description |
| Numerologist | 设计原则 2：「**确定性计算外包**：凡是历法换算、固定排盘、结构化计算，优先交给脚本或可信排盘结果。」 | `README.md` 第 22 行 |
| ctw | 硬规则：「**模型不得自行推演、排盘、校时、算数、补全干支或把参考文本伪装为本次计算。**」 | `SKILL.md` §0 引文 |
| ctw | 「`ToolEnvelope` 是**确定性事实的唯一来源**。」 | `SKILL.md` §2 |
| ctw | 「模型不得凭记忆、常识、参考文件或旧会话自行计算、修正、填补或改写确定性结果。」 | `RULES.md` 第 49 行 |
| liu-he-xuan-ji | 反面教材：该仓**明确让 AI 在对话里实时计算**（「所有卦象、命盘、局盘均由 AI 在对话中基于传统术数规则实时计算」），并自承风险 | `SKILL.md` 第 24 行 |

**可落地建议（本合同应采纳）**：

1. **三层物理隔离**：`tables/`（纯数据，无逻辑）→ `methods/*`（纯函数，无 I/O、无随机、无日期）→ `aggregate`
   （只读各法输出，不重算）。任何 `methods/` 里出现 `new Date()` / `Math.random()` / 网络调用即为违规。
   > 来源：`ctw` 的 `localToolRegistry` / `localToolIntrospection` / `runLocalTool()` 一次性契约设计
   > （`apps/visual/src/legacy/localTool*`），以及其在 `RULES.md` §5 规定的**唯一 Agent 执行入口** `pnpm engine <tool> <input-json-file>`。
   > **强化条款（强烈建议抄）**：ctw 明确要求「**影响结果的当前日期或年份也不得由 CLI 隐式读取**：飞星、八宅、
   > 年度联合和空间时间工具必须**显式提供** year、targetYear 或 currentMonth」。这正是本插件「求占时刻缺省=机器当前时间」
   > 需要写进契约的对偶条款：**时刻必须作为显式入参进入引擎并记录在 `input_normalized` 里**。
2. **随机性来源唯一化**：真实占卜默认 OS 随机；种子模式仅用于测试与可复现演示，且**必须在输出里自证模式**。
   > 来源：`oraclebone/shared/randomness-protocol.md`（全文 23 行，逐字要点：「Agents must not self-select divination results.」
   > 「Production readings should default to OS randomness. Seeded mode is for tests and reproducible demos, not real readings.」）；
   > 实现见 `oraclebone/tarot.py` 的 `make_rng()`：`random.Random(seed) if seed else random.SystemRandom()`，
   > 输出字段 `rng_mode: "seeded-demo" | "system"` 与 `randomness: "seeded" | "system"`（schema 里是**枚举约束**，不是自由文本）。
   > **强化条款**：mingyu 的 `random-options.ts` 把可复现性做成**两级**——`seed`（种子）与 `replay`（保存的随机样本数组，1–256 个 `[0,1)` 数），
   > 且**互斥**（`seed 与 replay 只能提供一个`），结果里保存 `meta.random.samples` 供**完整重放**。
   > → **本插件应同时给 `seed`（人类可读复现）与 `replay`（逐样本精确重放）两个字段。**
3. **禁用重抽**：「Do not redraw, recast, reroll, or change the result because it is inconvenient.」
   （`oraclebone/shared/interpretation-protocol.md` 第 18 行）。若提供用户「重摇」，必须如 `liu-he-xuan-ji`
   那样**限定次数上限（最多 3 次）并声明「重摇可能改变卦象，请谨慎」**（`references/electronic-coin-tossing.md` 第 81 行）。

### E.2 ② 保真度 / 置信度分级与 ⚠ 标注

这是本插件（已有 ⚠ 近似标注需求）**最该抄的一节**。共 5 种做法，建议**叠加使用**：

**(a) 引擎模式枚举（必抄）** —— `dhicoc/chinese-traditional-wisdom-skill`
`RULES.md` 第 53 行逐字：「引擎结果必须保留能力模式：**`local-exact`** 表示本地精确历法或真实排盘，
**`local-approx`** 表示本地确定性近似规则；两者都**不授权模型自行推演**。」
落地形态：每个 `ToolEnvelope` 带 `result.mode: 'local-exact' | 'local-approx'`（实测 `bazhaiEngine.ts` 第 142 行
`mode: 'local-exact'`、`feixingEngine.ts` 第 134 行同）。
`SKILL.md` §5 还要求「保持 **`local-exact`、`local-approx`、民俗体验、演示和降级状态可见**」。

**(b) 逐字布尔标记（必抄，粒度最细）** —— 同上仓
- `strokesEstimated: boolean`（`ceziEngine.ts` 的 `CeziResult`）：笔画是否来自估算而非康熙表。
- `NameChar.estimated` + `nameRating.ts` 第 211–214 行：**未收录字每个扣 15 分**，并在 detail 里写明
  「`{n}/{m} 字有字义五行，{k} 字未收录扣分`」。
- `minor.source: 'lunar-exact' | 'local-fallback'`（`SKILL.md` §4）：「为 `local-fallback` 时**必须在解读中说明使用了本地降级规则**」。
→ **范式**：不要只给一个总体置信度，而是**给「哪些字段是近似的」的逐项布尔位**，并让它们**影响评分**且**出现在文案里**。

**(c) 未覆盖 / 未应用分支的主动声明（必抄，最能取信）** —— `ChesterRa/mingpan`
`README.md` 第 142 行逐字：「当前实现对乾、坤也按相同爻位取互；**未采用原文另述的「乾坤无互，互其变卦」分支**。」
→ **主动声明「我选了哪一支、我没实现哪一支」，比一个笼统的 ⚠ 有用得多。**

**(d) 证据层级 L1–L5（必抄，用于每条断语挂来源）** —— `Brhiza/mingyu` `skills/mingyu/references/evidence.md`

| 层级 | 内容 | 作用 |
|---|---|---|
| L1 输入事实 | 用户资料、原始卦局/牌签、地点、时间、现实事件 | 确定主体和边界 |
| L2 计算事实 | 四柱、宫位、星曜、卦爻、门星神、三传、飞星、节气等 | 提供可复核结构 |
| L3 传统依据 | 经典条文、派别规则、象义和术式语法 | 说明为何这样取用 |
| L4 关系推断 | 生克、合冲、相位、结构组合、阶段触发 | 形成结论与条件分支 |
| L5 现实核验 | 已发生事件、客观状态、后续可观察节点 | 检查模型是否贴合问题 |

**硬性引用规则（该文件第 15 行逐字）**：「**同一结论至少同时引用一项 L2 计算事实和一项 L3 理法；
若属于现实判断，再接一项 L1 或 L5。只有象义而缺少盘面结构时，结论保持为可能性描述，并列出需要补齐的事实。**」
→ **这是把「每条断语挂经典来源」落成可校验规则的唯一完整方案，本插件应直接采用 L1–L5 编号并在输出里显示层级码。**

**(e) 古籍文件的溯源清单 schema（必抄）** —— `dhicoc` `knowledge-base/manifest.schema.json`
每个知识文件条目**必填 11 个字段**（JSON Schema `required`，逐字）：
`id, path, title, domain, contentType, contentScope, sourceAttribution, license, reviewStatus, sha256, bytes`
- `contentType` 枚举：`primary-text | mapping | project-reference | index`
- `contentScope` 枚举：`full | excerpt | chapter | index | unknown`
- `reviewStatus` 枚举：**`reviewed | needs-scholarly-review | generated-metadata`**
- `sha256` 正则 `^[0-9a-f]{64}$`
且 `additionalProperties: false`。
CI 强制（`apps/visual/scripts/check-knowledge-provenance.mjs`，47 行）：11 字段非空、`id`/`path` 唯一、
文件存在、**sha256 与 canonical（忽略 CRLF/LF）字节数一致**（第 16 行有一条专门测试：canonical checksums must ignore CRLF/LF differences）、
`primary-text` 必须 `id` 以 `kb://` 开头且 `reviewStatus` 为 `needs-scholarly-review` 或 `reviewed`。

> **对本插件的直接映射**：`src/methods/data/*.js` 里的每张表都应带
> `{ id, source(典籍+版本/篇卷), license, reviewStatus, sha256, fidelity: 'full'|'core'|'approx' }`，
> 并用一个 CI 脚本校验 **① 字段齐全 ② 表值 sha 未漂移 ③ `fidelity!=='full'` 的表必须出现在输出的 ⚠ 清单里**。

**(f) 输出层的降级可见性（必抄）** —— `dhicoc` `reportLayers.ts` 第 271–278 行
内部实现细节（`lunar-javascript`、`6tail`、`adapter`、`engine`、`source/tool/version/mode/provider/evidence/result_meta`、
`本地表/简化/快速`、字段名、`.ts/.tsx/.json` 文件名……）通过正则 `INTERNAL_WARNING_PATTERN` **被替换成一句通用历法说明**
`GENERIC_CALENDAR_NOTICE = '本次推算已按传统历法口径处理，结果仅作传统文化参考。'`
→ **原则：对用户暴露「保真度等级」，但不暴露内部实现细节。** 这两件事要分开做。

### E.3 ③ 多法投票 / 共识 / 一致性度量

**最重要的结论先说：没有任何一个调研对象使用「简单多数票」作为证据。**

**(a) 明确否定多数票（必抄的一句话）** —— `Brhiza/mingyu` `skills/mingyu/references/synthesis.md` 第 34 行逐字：

> 「**方法数量、符号强度或多数意见不构成独立证据**；分歧本身也可以是问题所需的信息，例如长期承载与当前机会的差别。」

→ **这与本插件当前的「吉平凶票型」直接冲突。票型可以保留为「呈现层的分布指标」，但绝不能作为「总断」的推导依据。**
建议改造为：票型 = **一致性度量**（见下），总断 = **证据加权 + 主辅法分工**（见 E.3(d)）。

**(b) 合参矩阵（必抄，替代「投票表」的核心结构）** —— 同上文件第 6–13 行

| 子问题 | 主法 | 主法结论与证据(L2/L3/L4) | 辅法 | 辅法补充 | 时间层级 | 共同事实 | 分歧条件 | 待核验 |
|---|---|---|---|---|---|---|---|---|

并规定**各法角色分工**（第 13 行逐字）：「命理方法提供**承载与背景**，事件卦局提供**当下态势**，
奇门提供**时空/主客**，星盘提供**心理与关系结构**，择日和宅居提供**日期/环境条件**，原典和签谱提供**材料语境**。」

**六步流程（第 15–22 行，逐字要点）**：
1. **确认同题**：检查主体、核心事项和时间范围是否相同；不同事项先拆卡。
2. **独立取证**：按每个方法自己的取用、结构、动态和应期链完成判断，**保留原始证据账**。
3. **对齐尺度**：将本命、运限、年度、事件局、牌阵当下、宅运和宏观周期放在各自时间层，**不让细层替代上层**。
4. **提取共同事实**：只合并**跨方法都指向、且能回指盘面或现实资料**的事实；**共同事实与解释分开写**。
5. **展开差异**：按输入口径、流派、主体感受、取用对象、时间边界和资料精度排查分歧，形成条件 A/B。
6. **落到核验**：每个共识或分支附**可观察的事件、状态或日期**，写明尚未覆盖的资料。

→ **「共同事实」的定义是本方案能替代投票的关键**：不是「几个法说吉」，而是
**「多个法各自独立地指向同一条可回指盘面的事实」**。落地为数据结构即
`commonFacts: Array<{ statement, citations: Array<{method, layer: 'L2'|'L3', path, value}>, independentEvidenceCount }>`
—— **count 只在 citations 指向不同 L2 路径时才递增**（这直接消灭了「同一个干支关系被三个法各算一次」的伪共识）。
> 该原则在 evidence.md 第 29 行有对应表述：「多条标签若来自同一干支关系、同一相位或同一宫位作用，
> **归入同一项依据**。不同独立证据支持同一主题时，逐项说明它们各自增加了什么信息。」

**(c) 分歧分级 D1–D5（必抄，直接对应当前「分歧项」字段）** —— 同上文件第 24–32 行逐字

| 等级 | 表现 | 处理 |
|---|---|---|
| **D1 口径差异** | 时区、节气、起局/起卦、派别或历元不同 | 先统一口径；无法统一时并列盘面与窗口 |
| **D2 尺度差异** | 本命长期结构与当刻事件局方向不同 | 解释为背景与当前触发的层次关系 |
| **D3 取用差异** | 用神、世应、主客、牌位或主题宫不同 | 写出各自取用理由和影响到的结论 |
| **D4 资料差异** | 原始资料、计算结果、现实描述互相不符 | 保留原值，标明可信层级和补核事项 |
| **D5 真分歧** | 口径和资料一致，方法仍给不同方向 | 分别呈现证据与条件，使用后续节点复核 |

→ **当前插件的「分歧项」应该升级为带上 D1–D5 等级标签**。D1/D3/D4 是**可消解**的（属工程问题），
D2 是**语义层级关系而非矛盾**，**只有 D5 才是真分歧**。这个分级能让「分歧」从负面信号变成信息。

**(d) 主辅法分工 + 问题类型适配（必抄）** —— `MTKEN368/liu-he-xuan-ji` `references/system-framework.md` 第 152–162 行

| Question Type | Primary School | Secondary |
|---|---|---|
| Career/Business | 八字 + 奇门 | 紫微 + 六爻 |
| Relationships | 紫微 + 六爻 | 梅花 + 八字 |
| Health | 八字 + 六爻 | 紫微 + 大六壬 |
| Timing/When | 六爻 + 大六壬 | 奇门 + 梅花 |
| Direction/Where | 奇门 + 梅花 | 大六壬 + 六爻 |
| General Fortune | 紫微 + 八字 | 六爻 + 梅花 |
| Stock/Investment | 六爻 + 奇门 | 梅花 + 八字 |

且第 126 行要求综合轮「**Assign primary and secondary schools for this specific question type**」。
→ **本插件已有「按问题加权」的雏形；建议把它形式化成「主法/辅法分工表」，
主法回答该子问题，辅法只填补约定维度**（mingyu synthesis.md 第 13 行）。这样「票型」自然退化为
「各法在各自擅长维度上的一致性」，而不是无差别平票。

**(e) 置信度三档的判定定义（可抄，但需注意其局限）** —— `liu-he-xuan-ji` `SKILL.md` 第 361–364 行逐字

- **高** —— 多派一致、卦象清晰、理论依据充分
- **中** —— 部分冲突、卦象复杂、需要进一步验证
- **低** —— 多派分歧、信息不足、仅供参考

同仓还规定：无出生资料时，紫微/八字改用问事时间当「event chart」，**confidence 降到 low 并写明**（`system-framework.md` 第 138–143 行）。
→ 这是**最简可用的置信度模型**，但它的「高 = 多派一致」与 mingyu 的「多数不构成证据」相反。
**建议：采纳其「资料缺失→强制降级」的部分，不采纳其「多派一致→高」的部分。**

**(f) 冲突/分歧的机器可读结构（必抄，用于「多法共识」字段的清洗）** —— `mingyu` `synthesis/corroboration.ts`
不输出一个笼统的「共识分」，而是输出**逐条件的状态**：

```ts
type CorroborationConditionStatus = '满足' | '不满足' | '资料不足';
interface CorroborationCondition { key: string; status: CorroborationConditionStatus; detail: string; }
```
并给每个结论配上**证据清单**：`baziYangRenPositions: BaziBranchEvidence[]`（规则/柱位/柱名/地支）、
`ziweiShaEvidence: ZiweiStarEvidence[]`（星名/宫序/宫名/宫角色/亮度/生年四化/运限四化…）。
关键设计：**每个证据项都带「回指坐标」**（柱位、宫序、宫名），因此下游可以判断两条证据是不是同一个源头。
另有一条**极重要的工程约束**（同文件第 98–103 行逐字注释）：

> 「羊刃和天乙贵人都存在流派参数；**合参层不能重新按另一张固定表推导，否则同一份八字在盘面与合参摘要中会出现不同口径。**」

→ **硬规则：合参层禁止独立重算任何术法，只能读各法已产出的结构化结果。** 本插件重写时必须把这条写成测试。

### E.4 ④ 证据链与出处标注（每条断语挂经典来源）

**(a) claims 校验机制（★ 本调研中杀伤力最大的机制，必抄）** —— `dhicoc/chinese-traditional-wisdom-skill`

工作流（`RULES.md` §5，逐字）：
```
1. 按 Skill 三层路由选择本地工具并补齐输入。
2. 运行 CLI，获得本次 ToolEnvelope。
3. 仅从 ToolEnvelope.data 提取拟呈现的结构化事实。
4. 使用对应本地 validate*Claims(data, claims) 核验这些 facts。
5. 仅据结果和通过的 claims 进行语言化解读；reference 文件只可补充文化背景与建议。
```
契约类型（`apps/visual/src/legacy/claimVerification/claimContract.ts`，全文 57 行）：

```ts
export type ClaimViolationCode = 'value-mismatch' | 'selector-not-found' | 'tool-mismatch';
export interface ToolScopedClaim { tool?: string; kind: string; value: unknown; }
export interface ClaimViolation<Kind, Value> {
  index: number; tool: string; claimTool?: string; kind: Kind;
  code: ClaimViolationCode; message: string; expected?: Value; actual: Value;
}
export interface ClaimValidation<Violation> { valid: boolean; violations: Violation[]; }
```

**三个违规码的含义**（`createClaimViolation`，第 46–56 行逐字）：
`code = toolMismatch ? 'tool-mismatch' : expected === undefined ? 'selector-not-found' : 'value-mismatch'`。
即：**① 断言声称属于别的工具 → tool-mismatch；② 路径在本次结果里不存在 → selector-not-found；
③ 值对不上 → value-mismatch。** `tool-mismatch` 的 message 逐字：「该凭证属于 {claimTool}，不能校验 {tool} 的断言。」
→ **这直接杀死「用别的方法/上一次会话的结论冒充本次结果」这一类幻觉。**

具体校验器样例 `validateBazhaiClaims(data, claims)`（`bazhaiClaimVerifier.ts`，81 行）：
claim 是**判别联合**，按 `kind` 分派，逐字段比对，全部走 `!==` 严格相等：

```ts
type BazhaiClaim =
  | { kind: 'mingGua'; field: 'trigram'|'group'; value: string }
  | { kind: 'mingGua'; field: 'num'; value: number }
  | { kind: 'direction'; direction: string; field: 'star'|'quality'; value: string }
  | { kind: 'annual'; field: 'yearZhi'|'taisuiZhi'|'taisuiDirection'|'taisuiBagua'|'suoPoZhi'|... ; value: string };
```
逐字报错样例：「命卦{field} 与本次推算结果不一致。」「{direction}方的{游星/吉凶}与本次推算结果不一致。」
通用数值校验器 `validateNumericAssertionClaims`（`numericAssertionVerifier.ts`，79 行）支持**点路径**取值，
且**强制路径必须以 `data.` 开头**（第 67 行 `if (!path.startsWith('data.')) return undefined;`），
数组下标用数字段（第 70–72 行），并要求取到的是 **有限数值**（第 78 行 `Number.isFinite`）。
报错逐字：「路径 {path} 的数值与本次 {tool} 结果不一致，**或该路径不是有限数值**。」

**校验的边界（极其重要，必须原样写进本插件文档）** —— `RULES.md` §6 逐字：
> 「校验覆盖结构化事实，如柱、宫位、星曜、数值、日期、枚举、映射项与已排序条目。
> **不覆盖自由文本、传统解释、置信说明、应期、策略、综合结论、医疗建议或现实效果。**
> 校验返回通过，只可说明「结构化 claims 与本次结果一致」；**不得说「自由文本已自动校验」**。」

反模式表（`RULES.md` §6，逐字）：

| 反模式 | 正确做法 |
|---|---|
| 「这个我凭知识能排」 | 运行对应本地 Engine/CLI。 |
| 用旧结果支撑本次结论 | 重新运行工具并使用本次 ToolEnvelope。 |
| 把建议、应期或解释放入 claims | claims 仅包含结构化事实；解释明确区分。 |
| 校验失败后软化措辞仍当作事实 | 删除断言或重新提取真实字段。 |
| 声称整段文字已校验 | 仅说明结构化 claims 已核对。 |

最终可附的最小依据串（逐字）：`引擎依据：bazi_calculate（local-exact）；结构化事实已与本次结果核对。`

**(b) 「证据账」的写法要求（必抄，用于生成「每条断语挂来源」的文案）** —— `mingyu` `evidence.md` 第 17–29 行

| 项目 | 记录内容 |
|---|---|
| 候选判断 | 主体、事项、时间层和所取格局或关系 |
| 必要条件 | 按本次取法逐项列出成立前提，**回指具体柱位、宫位、爻位或相位**；分别记为**满足 / 受制 / 资料待核** |
| 主证与反证 | 写明各自作用对象与路径；反证改变的是**结果方向、程度、实现成本还是迟速** |
| 制化与取舍 | 候选救应逐项核对力量、位置及牵制；选出当前证据更充分的主判断，另列能改变它的条件 |
| 未决与核验 | 指出真正决定分支的缺项、补齐后可能改变的结论范围，以及可观察节点 |

**证据强弱的四要素（第 41–48 行逐字，且明确禁止合成分数）**：
> 「强度由四项组成：1. **可重复**（同一输入和口径能重现盘面）；2. **结构贴合**（取用对象在方法中是主证据，而非边缘象）；
> 3. **时间对应**（结论落在方法可支持的时间粒度）；4. **现实回验**（已有节点与推断方向相符）。
> **四项分别写在证据账中，不合成虚构分数。** 缺一项时说明缺失原因和会缩小的结论范围。」

→ **「不合成虚构分数」是本插件「分值」设计的红线**：可以做**投票分布**，但不能给每条术法一个 0–100 的
「可信度分」再相乘。分值应当是**可解释的离散档位**或**显式的四要素勾选**。

**(c) 输出必须分层且可校验（必抄）** —— `dhicoc` `reportLayers.ts`

四层结构（文件头注释逐字）：
1. `tldr` —— 一句话总结 + 总体吉凶定调
2. `highlights` —— 关键亮点/风险点（带 `tone`）
3. `details` —— 详细分析 + **古典依据**
4. `actions` —— 可执行建议（带 `category`）

且**技术细节段被显式剔除**（第 137 行 `TECHNICAL_HEADINGS = ['起卦方式','边界说明','年份边界','说明','口径','引擎','历法','版本']`，
第 197 行 `if (TECHNICAL_HEADINGS.some(h => section.heading.includes(h))) continue;`），
**命盘事实与自由解读在结构上分离**（`SemanticReport`）：

```ts
export interface SemanticReport {
  facts: StructuredFact[];                       // 只放校验通过的
  traditionalInterpretations: ReadingSection[];
  actions: Action[];
  disclaimers: string[];
}
```
`facts` 的唯一来源是**校验通过**的 factChecks（第 242–245 行 `factChecks.filter(({validation}) => validation.valid)`）。
`StructuredFact` = `{ label, value, tool }` —— **每条事实自带 tool 名**。
默认免责声明（第 112 行逐字）：`'本报告提供传统文化解释参考，不构成对现实结果、医疗、法律或财务事项的保证或专业建议。'`

**(d) 「空」也是证据（必抄）** —— `mingyu` `evidence.md` 第 72–74 行
> 「空亡、空宫、无相位或牌位缺牌等「空」**首先是盘面事实**，再结合方法规则判断其作用。说明它改变的是力量、
> 落实速度、信息可得性还是应期表达，并说明填实、触发或补资料条件。**空象不直接等同结果定性。**」

**资料缺口三分类（第 76–80 行逐字）**：
- **定位缺口**：无法确定主体、时刻、地点或基本盘面；先补采；
- **细层缺口**：本命可读但宫位、时柱、流月或精确应期受影响；先给上层结论与条件；
- **核验缺口**：结构已清楚但缺少现实节点；写出可观察的阶段事实和复核时间。
→ **本插件「资料不足 → 未起」的现状应升级为这三类，并影响输出的层级而非静默省略。**

### E.5 ⑤ 反幻觉的具体机制（如何强制）

把上面散落的机制汇总为**八条可强制执行的规则**，每条都能写成测试：

| # | 机制 | 强制手段 | 来源 |
|---|---|---|---|
| 1 | **结果不自造**：AI 不生成占卜结果 | 结果只能来自脚本/物理抽取/用户显式输入；三种「不可接受来源」被点名（自选牌、重抽、静默补值） | `oraclebone/shared/randomness-protocol.md` + `interpretation-protocol.md` 第 17–21 行 |
| 2 | **断言走校验器**：每条结构化断言必须过 `validate*Claims` | 三个违规码 `value-mismatch / selector-not-found / tool-mismatch`；失败断言**必须删除或重新提取** | `dhicoc` `claimContract.ts` + `RULES.md` §6 |
| 3 | **禁止跨源重算**：合参层不得用另一张表重推 | 注释级硬规则 + 应配测试 | `mingyu` `corroboration.ts` 第 98–103 行 |
| 4 | **同源去重**：来自同一干支关系/相位/宫位的多个标签合并为一条依据 | 证据项带**回指坐标**（柱位/宫序/宫位名） | `mingyu` `evidence.md` 第 29 行 + `corroboration.ts` 的 `BaziBranchEvidence`/`ZiweiStarEvidence` |
| 5 | **禁止合成虚构分数** | 证据强弱用四要素勾选，不乘算 | `mingyu` `evidence.md` 第 41–48 行 |
| 6 | **禁止模型凭记忆填字段** | 真太阳时须外部核验经度/IANA 时区/当日 UTC 偏移/夏令时；不可靠时降级为 `civil-unverified` 并标注「未完成真太阳时复核」 | `dhicoc` `RULES.md` §7 |
| 7 | **Fail-Two（连败两次就停）** | 「同一计算连续失败两次时停止重试：记录脱敏失败原因，检查输入…若仍不能计算，明确告知当前环境无法产生可复核结果。**禁止第三次盲试或凭模型知识补答。**」 | `dhicoc` `RULES.md` §3 |
| 8 | **渲染层过滤内部细节 + 内部数据不外泄** | 正则替换内部警告；不向用户回显整个 `ToolEnvelope`、`input_normalized` 或内部原始数据 | `dhicoc` `reportLayers.ts` 第 271–278 行；`SKILL.md` §0 第 5 条 |

**另外两条可选的强机制**：
- **行为评测（evals）**：`dhicoc` 有 `skill-evals/cases/*.json` + `expected/*.json` 共 **20 个 case**
  （目录树实测：`001-missing-birth-time` … `020-iching-local-lookup`），以及 `skill-evals/run-evals.ts`；
  `SKILL.md` 要求「修改 Skill、RULES、Agent Router、参数规划器、claims、隐私边界或产品决定后运行 `pnpm eval:skill`」，
  「**19 项必须全部通过**」，且「Runner 只输出 case ID 与断言状态，不输出合成 query」。
  case 文件名本身就是**验收条款清单**，例如：`002-no-default-zi-hour`、`003-true-solar-needs-evidence`、
  `009-results-require-claims`、`010-reference-not-calculation`、`011-approx-not-exact`、
  `014-engine-failure-no-model`、`015-no-envelope-echo`、`016-skip-risk-safety-gate`。
  → **建议本插件直接照这 20 条建一套 evals，这是把「反幻觉」从文档变成回归测试的最短路径。**
- **审计元数据 schema**：`oraclebone` 要求脚本输出的 JSON「带足够元数据以便审计」：
  method used / randomness mode / raw cast-draw details / derived result / warnings for approximate or compatibility modes
  （`shared/methodology.md` 第 36–43 行）。落地形态见 `oraclebone/schemas/tarot-draw.schema.json`：
  `system, deck, spread, deck_size, draw_count, drawn_indices, shuffle_algorithm, rng_mode, randomness, reversals_enabled, cards[]`
  —— 其中 `drawn_indices`（抽中的牌序号）与 `shuffle_algorithm: "fisher-yates"` 让整次抽取**可被第三方复算**。

### E.6 ⑥ 应期（timing）如何从多法信号收敛

**这是所有项目里写得最系统的一份，来自 `Brhiza/mingyu` → `skills/mingyu/references/timing.md`（7116 B）。**
逐条摘出可落地规则：

**(a) 统一时间包络（必抄的硬约定）** —— 第 5–14 行逐字
> 「采用**半开区间 `[start, end)`**：起点属于当前阶段，终点进入下一阶段。日期级窗口写当地日期和时区，
> 节气/交运/交限/换局等边界写精确时刻；资料只到日期时，**终点使用下一日 00:00 的当地时间并标明日期级精度**。」

每个时间判断的记录格式（逐字，**这就是应期对象的数据结构**）：
```text
窗口：……至……（粒度：年/月/日/时/阶段）
上层背景：……；触发层：……；边界：……；证据：……；待核验节点：……。
```

**(b) 时间层级表（必抄，用于给每条应期打粒度标签）** —— 第 20–26 行

| 粒度 | 常见资料 | 合适表达 |
|---|---|---|
| 长周期 | 元会运世、宅运、时代周期 | 主题与阶段转折，附历史/现实锚点 |
| 十年或阶段 | 八字大运、紫微大限、奇门分运、宅运 | 起止时刻、阶段主调和跨界层级 |
| 年 | 流年、太岁、值年卦、岁运 | 年界与主题触发，保留所属上层 |
| 月/节气 | 流月、六步气、月建、月将 | 节气月界和月内前后段 |
| 日/时 | 六爻日辰、奇门时局、三传、牌阵当下 | 起盘时刻、事件窗口和可观察节点 |

**关键约束（第 28 行逐字）**：「**更细粒度必须有相应计算事实或明确现实锚点。卦象、牌象和签文只有阶段语义时，
使用顺序和窗口，不强行换算为某日。**」
→ **这直接约束本插件的「应期」字段**：塔罗/雷诺曼/灵签**不得**产出具体日期，只能产出顺序与窗口。

**(c) 阶段边界协议（必抄）** —— 第 30–36 行，5 条
1. 先列上层阶段，再列目标窗口；窗口始终保留所属上层。
2. 交运、交限、节气、冬至、换局、换卦、站留转向或宅运交界发生在目标范围内时，将边界时刻单列。
3. **边界时刻起归入新层**；事件恰在边界前后发生时，分别引用前层余势与后层触发。
4. 起止资料只到年龄、年份或大致月份时，保留阶段顺序，写明精度和补算后可能调整的层级。
5. 多阶段事件使用**事件簇**（一个事件簇可关联多个阶段索引，每一阶段单独写触发、表现和验证节点）。

**(d) 逐法应期取法映射表（★ 收敛的核心，必抄）** —— 第 38–62 行，**19 行**，逐字：

| 方法 | 上层背景 | 触发层 | 应期取法 |
|---|---|---|---|
| 八字 | 大运 | 流年→流月→流日时 | 运年干支、合冲刑害、用神填实和已发生节点 |
| 紫微 | 大限 | 流年四化→流月/日 | 限运交界、四化落宫、主题宫触发 |
| 西占单盘/双盘 | 本命/组合盘 | 行运、次限、太阳弧 | **入相—精确—出相**与现实事件簇 |
| 七政四余 | 本命命度/行限 | 流曜、交会、站留 | 行限交界与星体交角时刻 |
| 奇门时局 | 起局时刻 | 局内时段、日月年 | 局式、门星神宫、换局/节气边界 |
| 奇门终身局 | 本命宫与分运 | 所选分运模型及流年 | 精确交运时刻、每步定位、跨界双层 |
| 六爻 | 起卦时刻、月建日辰 | 动爻、变爻、填空冲合 | **先定成败，再由用神、世应、动爻定月日时** |
| 梅花 | 起卦时刻 | 体用、互卦、变卦、卦气 | 卦气和动爻给快慢，现实锚点校准 |
| 大六壬 | 起课时刻、月将 | 初传→中传→末传 | 三传顺序、旺衰和空破填实 |
| 金口诀 | 起课时刻、地分 | 四位五动 | 动静、旺衰和事件阶段 |
| 小六壬 | 月日时 | 三宫顺序 | 宫义给快慢和阶段，事项节奏给范围 |
| **塔罗/雷诺曼** | 抽牌时刻、牌阵 | 牌位阶段、组合语法 | **牌阵位置和叙事顺序，现实锚点校准** |
| **灵签** | 求签时点 | 签文时态与条件句 | **文本明确的先后与问题给定时限** |
| 黄历 | 节气月、候选日期 | 日、时 | 候选日同口径比较，日界与节气换月清楚 |
| 风水/宅向 | 建造/入住、宅运 | 流年→流月→事项时段 | 运星、宅向、居者和现场条件叠加 |
| 太乙 | 年/月/日/时局 | 局式与主客算 | 换局边界和目标层级 |
| 皇极经世 | 元会运世、值年卦 | 经卦/纬卦/日时卦 | 冬至换年、六日模型、历史/现实锚点 |
| 五运六气 | 岁运、司天在泉 | 六步气、交节 | 节气精确时刻和主客气次序 |
| **姓名** | 静态命名时点 | 候选使用场景 | **结构适配，不额外推具体日期** |
| 生肖 | 节气年、目标年度 | 月份、关系节点 | 太岁与地支关系，年度/月份窗口 |
| 历法天文 | 当地时间、时区、地点经纬度 | 真太阳时、节气、月相、光照 | 输出换算前后和精确边界，作为术式时间事实 |

→ **这张表就是「应期从多法信号收敛」的答案**：**不做时间点的加权平均，而是给每个法分配
(上层背景, 触发层, 取法) 三元组，输出各自窗口后取交集/并列**。特别地：
**姓名法明确「不额外推具体日期」；塔罗/雷诺曼/灵签只给顺序与阶段**。
本插件 108 法中任何「无时间语义」的法，都应显式声明 `timingClass: 'none' | 'stage' | 'window' | 'instant'`。

**(e) 应期表达与复核（必抄的验收清单）** —— 第 68–72 行逐字
> 「**先回答时间问题的层级**：是「何时具备条件」「何时发生转折」还是「何时结果落地」。再写窗口与触发因素，
> 区分**推测窗口和已知日期**。一个窗口**至少带一项可观察节点**，例如职位变化、消息到达、签约、搬迁、症状记录、
> 关系状态或候选日期结果。」

复核清单（逐字）：「起止是否明确；时区/历法是否一致；窗口是否带上层背景；边界是否按半开区间处理；
应期是否来自该方法取用链；跨阶段事件是否保留多层；**精度是否超过资料能力**。无法精确时回到阶段和条件表达。」

**奇门应期有独立实现可参照**：`packages/core/src/divination/algorithms/qimen/helpers/ying-qi.ts`（**17493 B**）。
→ 若本插件要做奇门应期，直接读该文件取真源；**本文件不搬运其内部表值。**

**(f) 尺度的单向性（必抄的硬约束）** —— `synthesis.md` 第 19 行 + `evidence.md` 时间尺度行
「将本命、运限、年度、事件局…放在各自时间层，**不让细层替代上层**。」
分歧分级里把这一条单列为 **D2 尺度差异**，处理方式是「解释为背景与当前触发的层次关系」。
→ **工程化：应期对象必须带 `layer` 字段；聚合时禁止把 `layer='日'` 的窗口提升为总断的应期。**

### E.7 跨项目做法对比：谁最值得抄，为什么

| 项目 | 定位 | 真正提供的东西 | 值得抄的部分 | 不足 / 别抄的部分 |
|---|---|---|---|---|
| **`dhicoc/chinese-traditional-wisdom-skill`** ★26 MIT | **可运行的确定性引擎 + claims 校验 + 溯源清单**（633 文件，纯 TS 引擎 32 工具） | `ToolEnvelope` 契约；`validate*Claims` 三违规码；`local-exact/local-approx` 模式；L1–L5 之外的**输出四层**（tldr/highlights/details/actions）；知识库 11 字段溯源 manifest + sha256 CI；Fail-Two；20 条 skill-evals；风水 6 张 JSON 映射表（含完整 24 山与 64 组八宅）；姓名五格/81 数/三才/生肖喜忌；测字；称骨多版本 | **① claims 校验器（E.4a）② 溯源 manifest schema（E.2e）③ 输出四层分层（E.4c）④ evals 清单（E.5）⑤ Fail-Two ⑥ 全部姓名与风水表值** | 其「飞星」只做流年盘（非完整玄空三盘）；五格公式实际只覆盖单姓；`estimateStrokes` 是占位近似；21 个 claimVerifier 覆盖面不均（部分工具无 verifier，文档也承认「无 verifier 的工具不得伪造已核验事实」） |
| **`Brhiza/mingyu`** ★463 **AGPL-3.0** | **最完整的「证据驱动解读」方法论 + 真实算法**（1504 文件） | L1–L5 证据层级；证据账四要素；D1–D5 分歧分级；合参矩阵六步流程；**19 行逐法应期映射表**；半开区间时间包络；`CorroborationCondition{key,status:'满足'/'不满足'/'资料不足'}`；**不合成虚构分数**的明确禁令；真实塔罗/雷诺曼/占星引擎 + **唯一成文 orb 表**；灵签 26 万字签谱；`seed`+`replay` 双模复现 | **① 合参矩阵与「共同事实」定义（E.3b）② D1–D5（E.3c）③ 应期规范（E.6 全部）④ L1–L5（E.2d）⑤ seed/replay（E.1②）** | **AGPL-3.0：代码不可抄，只可抄「设计思想与规则语义」**（见 E.8 许可证风险）；文档是「AI 行为规约」而非可执行校验器，落地仍需自建 claims 层 |
| **`sapuyou45-bit/oraclebone`** ★6 MIT | **最小而完备的「结果自证」范式**（164 文件） | `randomness-protocol`（3 条不可接受来源）；`interpretation-protocol`（5 条 non-negotiable + 6 步解读流 + 模板）；`response-contract` 6 段式；tarot 输出的 **11 字段审计 JSON schema**（含 `drawn_indices`、`shuffle_algorithm`、`rng_mode` 枚举）；`fisher-yates` + `SystemRandom`；逆位 = `shadow` 字段切换；1:5:7:3 蓍草概率 | **① 审计 JSON schema（E.5 末）② non-negotiable 清单 ③ 逆位实现范式 ④ 6 段式输出契约 ⑤ 蓍草概率 1:5:7:3** | 覆盖法门少（仅塔罗/易经/小六壬/八字）；无跨法聚合层（本插件的核心问题它没回答） |
| **`ChesterRa/mingpan`** ★116 Apache-2.0 | **纯计算、零解读**（851 KB） | 明确定位「Facts only — interpretation is left to the AI」；**口径裁决**记录；**主动声明未实现的分支**（乾坤无互）；爻值规范 6/7/8/9；**公开承认 bug 及其影响面**（0.1.8 修复：64 卦 × 6 动爻中 **256 个变卦结果**、64 卦中 **60 个互卦结果**需纠正，并说明「升级后，依赖旧互变卦的解读需重新计算后复核」） | **① 口径声明与「未采用的分支」（E.2c）② 爻值规范 ③ 版本变更影响面披露的写法 ④ 无状态纯计算 + 不建库不缓存的隐私边界** | 只做排盘，不含聚合/投票/分歧；无 claims 层 |
| **`FANzR-arch/Numerologist_skills`** ★1369 **无许可证** | **「先访谈再排盘 + 口径固定」的流程约束**（23 文件） | 4 条设计原则（先追问再输出/计算外包/先声明口径/只给结构化参考）；**固定规则集 `mainline-cn-v1`**（时家转盘奇门、Asia/Shanghai、置闰法、中宫寄坤），并要求「**不要在正式排盘路径里混用其他流派**」；「不展示完整推理链，只展示关键依据」；真正的 `qimen_cli.py`（31510 B，含完整 `JU_TABLE` 阳遁/阴遁局数表）+ 33263 B 测试 | **① 「固定规则集 ID」概念（`mainline-cn-v1` 式命名 + 显式声明）② 流派不混用的硬约束 ③ 两段式访谈工作流 ④ 奇门局数表** | **无许可证，法务风险**；仅 3 个 skill；无聚合层；README 自承「规则与 references 驱动」（即紫微/八字仍是提示词驱动，非脚本） |
| **`MTKEN368/liu-he-xuan-ji`** ★1 MIT | **多法圆桌协议**（12 文件，纯文档） | 五轮论证结构（立论→质询→辩论→修正→综合）；**「各派独立，第一阶段严禁交叉污染」**；需求字段按派列表；问题类型→主辅法表；置信度高/中/低定义；极端分歧处理（4吉 vs 2凶 → 延长辩论 + **最终报告必须显著标注分歧**） | **① 主辅法分工表（E.3d）② 独立阶段禁止交叉污染 ③ 8 条核心原则（见下）** | **它让 AI 在对话里实时排盘**（自承「复杂计算（如紫微斗数安星、大六壬九宗门）可能存在误差」「万年历数据…基于算法推算，非权威历书」）；纯提示词，**无任何可执行代码与数据表**；票型式「多派一致→高置信」与 mingyu 冲突，**建议不采纳该部分** |
| **`voidforall/fengshui.skill`** ★292 **无许可证** | 风水**人设 + 速查表**（7 文件，SKILL.md 13295 B） | 三元九运表；洛书轨迹；阴阳山与山/向星顺逆表；九运旺衰星；4 个旺山旺向举例；流年飞星中宫 9 年表；外煞/内煞—化解表；十二建星吉凶；择日原则；诚实边界声明 | **① 流年飞星中宫递推的 9 年回归锚点 ② 煞—化解表 ③ 「化煞以移形易位优先，摆件次之」的诚实倾向 ④ 结尾的免责范式** | **内部三处命卦口径互相矛盾（A.1.1）**；**山/向星顺逆与玄空常规冲突（A.2.3）**；无飞星排盘代码；无替卦；无九星水法；**无许可证** |
| **`dungnotnull/Tarot-Astrology-...-skill`** ★4 **无许可证** | **脚手架，未建成** | 大量 reference 文档（塔罗 cards.md 56283 B、spreads.md 19874 B、astrology houses/signs、numerology、barnum-effect 研究）；`config/schemas/tool_schemas.ts` 有 3 个工具的完整 JSON Schema；`scripts/automation/seeding.ts` 的 `TarotCardSeeder` | **① 它的坦率：README 明确写「Scaffolding generated. Not yet built as a runnable Claude Skill」；PROJECT-detail.md 大量字段写「fill in based on real usage once built」；seeding.ts 注释写「In a real implementation, this would read from the reference files / For now, we'll create a comprehensive card database」② `tool_schemas.ts` 的 schema 形态可参考（5 种牌阵 enum、3 种牌组 enum）** | **⚠ 判定：无真实算法，属脚手架/提示词包装**（详见 E.9）；且**无许可证** |
| **`Naitellos/pandorium-mcp`** 0★ MIT | **只是一个指向托管服务的 README** | 工具清单（11 个）；声称 ANU QRNG + `astronomy-engine`；I Ching 1:5:7:3；7 种宫位制；synastry 加权 0–100 | **① 「量子随机 + 密码学回退」的降级声明写法 ② 三牌阵/Celtic 的牌数约定** | **仓库仅 3 个文件（LICENSE/README/smithery.yaml），零代码零数据**；所有能力声明**均无法验证**（未核实）；**⚠ 判定：无真实算法** |
| **`quetzal-china/lenormand-divination-skill`** 2★ MIT | 雷诺曼**纯提示词 skill**（6 文件） | 十字牌阵 5 张牌的**位置语义**（Center/Core、Left/Past、Right/Future、Top/Help、Bottom/Challenge）；**横轴/纵轴/镜像**三路解读；36 张牌的部分速查（28-绅士、29-女人、11-镰刀、6-云、23-老鼠、8-棺材、7-蛇、31-太阳、24-心、33-钥匙、10-书、20-花园）；组合逻辑（A 修饰 B / A 导致 B）；禁令清单 | **① 十字牌阵 5 位置语义与镜像对（1+5、2+4）② 组合语法 ③ 禁令：「禁止编造不存在的牌义」「禁止使用模棱两可的废话…必须给出基于牌面的倾向性判断」** | **无抽牌代码（要求 LLM「模拟洗牌」）；只有 12/36 张牌的语义；无完整 36 张表**；注意其负面牌义要求「不回避棺材/镰刀/老鼠」 |

**`liu-he-xuan-ji` 的 8 条核心原则**（`SKILL.md` 第 311–318 行逐字，值得整段作为本插件的设计原则基线）：
1. **信息完整才排盘** —— 缺信息则追问，绝不假设。
2. **用户确认才锁定** —— 电子摇卦一次摇出六爻，用户确认后锁定。
3. **计算过程透明** —— 展示排盘步骤，不黑箱。
4. **各派独立** —— 第一阶段严禁交叉污染。
5. **尊重理论** —— 使用正统术语，禁止虚构。
6. **允许冲突** —— 通过论证解决，不强制共识。
7. **置信度诚实** —— 明确标注可信程度。
8. **语言典雅** —— 文言风格，庄重肃穆。

### E.8 许可证风险（明确清单）

**🔴 高风险（无许可证 = 默认保留全部权利，不得复制代码或数据）**：
1. **`voidforall/fengshui.skill`（★292）** —— 根目录树 7 个文件，无 `LICENSE`；`main/LICENSE`、`main/LICENSE.md` 均 404。
   ✖ 不可复制其 `SKILL.md` 表格与文本。✔ 只可作为**规则思想的交叉参考**，且本项目数据须自行从公有领域典籍重建。
2. **`dungnotnull/Tarot-Astrology-Divination-Reflection-Guide-agent-skill`（★4）** —— 27 文件无 `LICENSE`；`main/LICENSE` 404。
   ✖ 不可复制其 `references/*` 与 `config/schemas/*`。
3. **`FANzR-arch/Numerologist_skills`（★1369）** —— 23 文件无 `LICENSE`。
   ✖ **不可复制其 `qimen_cli.py`（31510 B 含完整局数表）或其 `references/*`**。★ 数最高但**法务上最不能用**，务必注意。

**🟠 中风险（copyleft，传染性强）**：
4. **`Brhiza/mingyu`—— AGPL-3.0**（`LICENSE` 34020 B 全文）。
   ✖ **不可复制任何代码**（AGPL 对网络服务同样触发源码开放义务）。
   ✔ 可在**思想/规则/语义层面**借鉴（本文件已刻意只摘录**方法论文档的规则语义**与**公共知识性质的数表**，
   未搬运其实现代码）。**建议：本插件的塔罗/雷诺曼/占星引擎完全自研，只把 mingyu 当作「设计规格书」引用，并在
   `THIRD_PARTY_NOTICES` 中声明参考关系。**
5. **`hhszzzz/taibu`—— 双许可（GitHub 报 `NOASSERTION`）**：根应用 **AGPL-3.0-only**；
   `packages/core`、`packages/mcp`、`packages/mcp-server` **另行 MIT**。
   ⚠ **引用前必须确认目标文件位于哪个 package**；根目录下的文件一律按 AGPL 处理。

**🟢 低风险（MIT / Apache-2.0，可复制但须保留声明）**：
6. `ChesterRa/mingpan` —— **Apache-2.0**（需保留 NOTICE 与修改声明）。
7. `sapuyou45-bit/oraclebone`、`MTKEN368/liu-he-xuan-ji`、`dhicoc/chinese-traditional-wisdom-skill`、
   `quetzal-china/lenormand-divination-skill`、`Naitellos/pandorium-mcp` —— 均 **MIT**。

**⚠ 数据层面的著作权提示（与仓库许可证无关，容易漏）**：
`dhicoc/THIRD_PARTY_NOTICES.md` 自己就点出了这个坑 —— 它把**风水古籍**的治理状态写成
「Per-title source, edition, transcription rights and completeness **need scholarly review**」，
把**梦境词典**写成「Upstream revision/hash **must be recorded before formal redistribution**」。
→ **即：即使仓库是 MIT，其内嵌的古籍全文与第三方数据集的再分发权仍需逐项确认。**
**本插件若内嵌古籍原文或签诗/解梦语料，必须逐项记录来源、版本、许可与 sha256（照 E.2e 的 11 字段 schema）。**

### E.9 判定：无真实算法、只是提示词包装的项目

| 项目 | 判定 | 依据 |
|---|---|---|
| **`Naitellos/pandorium-mcp`** | **🔴 无真实算法（且连提示词都很少）** | 仓库树实测**仅 3 个 blob**：`LICENSE`(1066 B)、`README.md`(5749 B)、`smithery.yaml`(145 B)。**零代码、零数据、零 skill**。README 声明的 11 个工具、ANU QRNG、`astronomy-engine`、7 宫位制、synastry 0–100 加权**全部无法在本仓验证**。它是一个**托管服务的说明书**，不是一个实现。 |
| **`dungnotnull/Tarot-Astrology-...-skill`** | **🔴 无真实算法（脚手架 + 提示词包装）** | ① 自己的 README 末段逐字：「**Status: Scaffolding generated. Not yet built as a runnable Claude Skill — see DEVELOPMENT-TASK-BY-PHASES.md for the build plan.**」② `PROJECT-detail.md` 多处字段是待填占位：「Describe the primary user personas for this skill (**fill in based on real usage once built**)」、「Typical user requests this skill should handle (**fill in with real example prompts during development and testing**)」、「Define the structured output format(s)… (**fill in**)」。③ `scripts/automation/seeding.ts` 第 51–53 行逐字：「// In a real implementation, this would read from the reference files / **For now, we'll create a comprehensive card database**」——即**抽牌数据是硬编码在脚本里的，不是从 reference 读的**，且**没有抽牌/洗牌算法**，只有 seeder。④ 它的 `references/` **内容确实丰富**（塔罗 card 56283 B、spread 19874 B、占星 houses 27155 B、signs 29745 B、numerology、barnum-effect 15926 B），**可作为「牌义/星座语义词典」的参考资料**，但**不是算法**。 |
| **`quetzal-china/lenormand-divination-skill`** | **🟠 无算法，是提示词 skill（但有可用的牌阵语义）** | 6 个文件；核心是 `.opencode/skills/lenormand-cross-spread/SKILL.md`（6145 B），**要求 LLM 自己「基于当前时间戳或伪随机算法模拟洗牌-切牌-抽取」**，无任何代码；知识库只列 **12/36** 张牌。→ 但它给了**清晰可用的十字牌阵位置语义与镜像规则**，值得借用（须自行补全 36 张牌表）。 |
| **`voidforall/fengshui.skill`** | **🟠 无算法，是提示词 + 速查表 skill（且有真表可用）** | 7 个文件全是 Markdown；无任何可执行代码。但 `references/feixing.md`、`references/wuxing-ganzhi.md` 确实给了**可编程的表**（三元九运、洛书轨迹、山/向星顺逆、流年飞星 9 年、三合六合三刑六冲）。→ **规则可用，但必须先裁决其内部冲突（A.1.1 / A.2.3），且因无许可证不得照抄文本。** |
| **`MTKEN368/liu-he-xuan-ji`** | **🟠 无算法，是提示词 skill（但圆桌协议有价值）** | 12 个文件，无代码。**明确要求 AI 在对话中实时排盘**，并自承：「复杂计算（如紫微斗数安星、大六壬九宗门）可能存在误差」「万年历数据（节气、日柱）基于算法推算，**非权威历书**」「建议用户将本系统作为『参考推演』」。→ **它的排盘部分不可信、不可抄；只有圆桌/争议解决协议值得抄。** |

**✅ 相反，确认为「有真实算法/真实数据」的项目**：
- `dhicoc/chinese-traditional-wisdom-skill` —— 纯 TS 引擎 32 工具 + Python 交叉验证脚本 + 6 张 JSON 映射表 + 12 MB 梦境词典 + 549 KB 康熙笔画表 + 40 KB 生肖喜忌表。
- `Brhiza/mingyu` —— 1504 文件，含奇门（含 `JU_TABLE` 量级的 helpers 共 20 余文件）、大六壬三传、六爻、梅花、塔罗、雷诺曼、**真实星历**（`data/astrology/caelus/*_cheb.json`）、灵签 26 万字、称骨多版本、**19 KB corroboration 与 22 KB synthesis 算法**。
- `ChesterRa/mingpan` —— 依赖 `lunar-javascript` + `iztro`，六法排盘全部实现，且有「权威用例金样本」与穷举回归（`exhaustive/` 目录）。
- `FANzR-arch/Numerologist_skills` —— `qimen_cli.py`（31510 B）+ 33263 B 测试是真的；但**紫微/八字仍是 references 驱动**（README 自承），**且无许可证**。
- `sapuyou45-bit/oraclebone` —— `tarot.py`/`iching.py`/`xiaoliuren.py`/`bazi.py` + 4 个 JSON Schema + 42058 B 卦数据是真的（体量小但货真价实）。

### E.10 推荐落地架构（把上面全部收敛成一套）

```
src/
  methods/data/            # 纯数据表，每张表一个文件，带 provenance 头
                           #   { id, source, edition, license, reviewStatus, sha256, fidelity }
  methods/*.js             # 纯函数；禁止 new Date() / Math.random() / I/O / 网络
                           #   签名统一：run(input, ctx) -> MethodResult
  core/runner.js           # 唯一执行入口；产出 ToolEnvelope 等价物
  core/verify.js           # validate*Claims 等价物（三违规码）
  core/aggregate.js        # 只读 MethodResult，禁止重算
  core/format.js           # 四层输出 + ⚠ 清单渲染
```

**`MethodResult` 建议契约**（综合 ctw 的 ToolEnvelope + oraclebone 的审计 schema + mingyu 的证据账）：

```js
{
  ok: true,
  tool: 'liuyao',                      // ctw: ToolEnvelope.tool
  version: '2.0.0',                    // ctw: 引擎版本
  mode: 'local-exact',                 // ctw: 'local-exact' | 'local-approx'
  fidelity: 'full',                    // full | core | approx   → approx 必须进 ⚠ 清单
  input_normalized: { ... },           // ctw: 实际参与计算的有效输入（时刻必须在此显式出现）
  data: { ... },                       // 机器可读事实；claims 的点路径必须以此为根
  claims: {                            // 供 verify.js 校验的结构化断言（纯事实，禁放解释/应期）
    tone: '吉',                        //   '吉' | '中' | '凶'（ctw Tone）
    values: [ { path: 'data.xxx', value: 1 } ]
  },
  citations: [                         // mingyu L1–L5：每条断语挂来源
    { layer: 'L2', path: 'data.xxx', method: 'liuyao' },
    { layer: 'L3', source: '《卜筮正宗》…', edition: '…', dataId: 'tables/liuyao#…' }
  ],
  timing: {                            // mingyu timing.md
    class: 'window',                   // none | stage | window | instant
    start: '2026-03-01', end: '2026-04-01',
    precision: 'month',                // year|month|day|hour
    upperLayer: '大运', triggerLayer: '流年',
    boundary: null, evidence: [...], checkNodes: [...]
  },                                   // 半开区间 [start, end)
  audit: {                             // oraclebone：让第三方可复算
    rng_mode: 'system', randomness: 'system',
    algorithm: '...', raw: { ... },    // 原始随机样本/铜钱面值
    warnings: [...]
  },
  replay: { seed: '...', samples: [...] }   // mingyu：seed 与 replay 互斥
}
```

**聚合层输出建议契约**：

```js
{
  overallTone: '吉' | '中' | '凶',
  voteDistribution: { 吉: n1, 中: n2, 凶: n3 },        // ⚠ 仅作「呈现指标」，禁止作为总断依据
  matrix: [ { subQuestion, primary, primaryEvidence, secondary, secondaryAdds,
              timeLayer, commonFacts, divergenceConditions, pending } ],   // mingyu 合参矩阵
  commonFacts: [ { statement,
                   citations: [{ method, layer, path }],
                   independentEvidenceCount } ],        // 同源去重后的真共识
  divergences: [ { level: 'D1'|'D2'|'D3'|'D4'|'D5',
                   description, conditionA, conditionB,
                   observableDecider } ],               // 默认必须显著标注
  timing: { class, start, end, precision, upperLayer, checkNodes },
  approxFlags: [ 'fengshui.xuankong替卦', 'name.estimateStrokes', ... ],  // → ⚠ 清单
  facts:   [ { label, value, tool } ],                  // 仅 verify 通过者
  interpretations: [ { heading, body } ],
  actions: [ { text, category } ],
  limitations: [...], disclaimers: [...]
}
```

**必须写进测试的 8 条不变量**（每条都能从上文找到出处）：
1. 任何 `methods/*` 内不得出现 `new Date()` / `Math.random()` / 网络调用（E.1①）。
2. 每条进入 `facts` 的断言必须过 `verify`；`verify` 失败 → 删除，不得换词保留（E.4a）。
3. `aggregate` 不得调用任何 `methods/*` 的计算函数，只能读已产出的 `data`（E.3f）。
4. `commonFacts[].independentEvidenceCount` 只统计**指向不同 L2 路径**的 citation（E.3b）。
5. `fidelity !== 'full'` 的表，其对应的术法在输出里必须出现 ⚠ 标记（E.2a/e）。
6. `timing.class === 'none' | 'stage'` 的术法**不得**产出日期（E.6b：签/牌只有阶段语义）。
7. `timing.layer` 细粒度不得被提升为总断应期（E.6f，D2）。
8. 同一输入 + 同一 `seed` → 输出逐字节一致；`replay` 样本可精确重放（E.1②）。

---

## 附：本次调研未能核实的事项（汇总清单）

| 主题 | 状态 |
|---|---|
| 玄空**替卦**（起星）规则与替星表 | **未核实**（全部仓库均无） |
| 玄空**旺山旺向**的可编程判据 | **未核实**（fengshui.skill 只有 4 个举例，且自注「详细排盘需逐宫计算…建议使用完整飞星软件」） |
| 玄空下卦所需的**八天干 + 四维的阴阳** | **未核实**（fengshui.skill 只给了十二地支的阴阳） |
| **九星水法**（辅星/纳甲水法） | **未核实**（全部仓库均无） |
| **十二长生水法**的成文吉凶断例 | **未核实**（只有「某山属某局某位」的 `sanhe` 标注） |
| **六十甲子分金 / 孤虚 / 龟甲 / 空亡** | **未核实**（6 张风水映射表均不含；古籍未逐篇通读） |
| **四灵形势**的可计算判据 | **未核实**（只有定性原则） |
| **五音占** | **未核实**（全部仓库均无） |
| **掷筊三掷**的概率与判定 | **未核实**（全部仓库均无；只有六爻铜钱映射两版） |
| **传统测字**的拆字/取数成卦算法 | **未核实**（ctw 的 ceziEngine 是笔画数理 + 字形象义，非拆字成卦） |
| 灵签**总签数与全部签级枚举** | **部分**（已取得 3 条真实记录与 3 个签级；`signs-full.ts` 138805 B 未通读） |
| **81 数理**的具体 81 条条文 | **未取得**（文件路径与字段结构已核实：`apps/visual/src/legacy/dayanList.json`，13490 B） |
| **三才 118 组**详描全文 | **未取得**（文件已核实：`apps/visual/src/legacy/sancaiDetails.json`，12673 B） |
| **卢恩 24 符文**的名称/含义/神祇/元素/树 | **未核实**（pandorium 只声明了维度，无条目） |
| mingyu **synastry 加权方案**的具体权重 | **未核实**（`astrolabe-synastry.ts` 34811 B 未逐行读） |
| mingyu **主行星星历**的具体算法 | **未核实**（小行星切比雪夫表已确认存在） |
| pandorium 的**全部能力声明** | **未核实**（仓库无代码） |
| tarot-astro 的**牌义/星座 reference 内容** | **未逐行读**（体量大；仅确认存在与体量） |

---

*本文档只写入本文件；未修改 `src/`、`lib/`、`test/`、`package.json` 下任何文件。*
