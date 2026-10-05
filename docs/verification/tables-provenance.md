# 规则表溯源核验 · `src/core/tables.js`

> owner: **kernel-tables**（task-2）｜对应契约：`docs/V2-CONTRACT.md` §4 溯源纪律
> 机器可读账本：`src/core/tables.js` 末尾 `export const TABLES_META`
> 本文＝叙述版，逐表列出**出处 / 核验状态 / 已知限制**，并单列「故意留空」与「发现的冲突」。

---

## 0. 一句话结论

`tables.js` 共 **97 个导出**（v1 全部 **37** 个导出名零删改零改值 + v2 新增 **60** 个）。
v2 新表中 **4 张故意写 `null`**（无可靠出处，宁缺勿编），**1 条账本项说明三式/六壬表不在本文件**。
凡标 `partial` 者，都在 `TABLES_META[*].note` 与本文第 3 节写明**分歧在哪**。

---

## 1. 纪律与做法

| 契约要求 | 本文件的做法 |
|---|---|
| 每个数值表带出处注释 | 每张导出表**上方**均有 `cite:` 注释（书名·篇名 / URL / 库@版本） |
| 严禁凭记忆编造常量 | 凡本插件自定系数（吉凶分值等）一律写明「本插件编辑取值」并记 `partial` |
| 无可靠出处 → 留 null | 4 张表写 `null` + `verified:'no'`（见第 3 节），不写近似值冒充原表 |
| 辞书类不伪造 | 二十八宿逐宿宜忌、三才 125 组吉凶、生肖部首、玄空替卦 一律留空 |
| 第三方代码只在 `vendor/` | **未新增任何运行时依赖**；仅从 oracle 库**取值并注明出处**（见第 4 节合规说明） |

---

## 2. 核验方法（可复现）

核验分三类，全部在本机跑过，结论如下。

### 2.1 与既有内核机械对拍（无外部依赖）

```powershell
cd D:\DSH\plugins\dsh-divination-108
node -e "import('./src/core/tables.js').then(async m=>{const k=await import('./src/core/kit.js');
 let a=0; for(const x of k.WUXING) for(const y of k.WUXING){const p=m.wangxiangOf(x,y),q=k.wangShuai(x,y); if(p.state!==q.state||p.score!==q.score)a++;}
 console.log('旺相对拍差异',a);
 let b=0; for(const n of ['驿马','桃花','华盖','将星']) for(const z of k.ZHI) if(m.SHENSHA_ALL[n].map[z]!==k.SHENSHA[n][z]) b++;
 console.log('神煞对拍差异',b);
 console.log('人元各月合计',Object.entries(m.RENYUAN_30).map(([z,l])=>l.reduce((s,x)=>s+x.days,0)).join(','));
})"
```

**结果**：旺相休囚死 5×5 = **0 差异**；驿马/桃花/华盖/将星 × 12 支 = **0 差异**；
人元司令十二月合计 = **30,30,30,30,30,30,30,30,30,30,30,30**；`CANGGAN_W` 覆盖 `kit.ZHI_CANGGAN` 全键（0 缺）。

### 2.2 与 oracle 对拍（开发期依赖，不发布）

oracle：`iztro@2.6.1`（MIT）位于 `D:\DSH\.divination-v2-deps\node_modules\iztro`。
对拍脚本为一次性脚本（临时目录，未入库；verifier 可照下表自行复跑）：

| 对拍项 | 规模 | 结果 |
|---|---|---|
| 五行局（`ziweiJuOf` 纳音法 vs `astro/palace.js getFiveElementsClass` 算术式） | 60 干支 | **0 差异** |
| 起紫微（`ziweiStarIndex` vs `star/location.js getStartIndex` 算法 + 书例子） | 锚点 6 + 全域自洽 2~6 局×30 日 = 150 | **0 差异** |
| 十四主星＋六吉六煞庙旺（12 宫自寅起） | 20 星 × 12 宫 | **0 差异** |
| 十干四化（禄权科忌） | 10 干 | **0 差异** |
| 命主·身主 | 12 支 | **0 差异** |
| 天魁天钺 · 禄存 | 10 干 ×2 | **0 差异** |
| 火星铃星子时起点 | 12 支 | **0 差异** |
| 天马（=驿马）· 红鸾 · 天喜 | 12 支 ×3 | **0 差异** |

### 2.3 结构与合计自检

| 检查 | 结果 |
|---|---|
| 三元九运 9 行、年份连续无缝、2026 落九运（2024–2043）、1880 落一运 | ✅ |
| 二十四山三元龙 24 键、天/地/人元各 8、阴阳各半 | ✅ |
| 二十四山双山五行 24 键、四局各 6 山、与 `SHAN24` 键集相同 | ✅ |
| 四大局十二长生：水申·木亥·火寅·金巳起长生，水局全序 申酉戌亥子丑寅卯辰巳午未 | ✅ |
| 二十八宿四象分组 28 宿，与 `XIU28` 名集相同 | ✅ |
| `XIU28_LUCK` 28 键（吉 14 / 凶 14） | ✅ |
| `WUGE_81` 键恰为 1..81（81 条；吉 30 / 半吉 17 / 凶 34） | ✅ |
| `wugeReduce`：85→5、90→10、81→1、160→80 | ✅ |
| 洛书九宫数和 = 45 | ✅ |
| `TABLES_META` 覆盖每个非函数导出 | ✅ |

---

## 3. 逐表清单

`verified` 含义：**yes** = 有文献/oracle 出处且做过机械核验；**partial** = 出处存在但属编辑取值、或诸本互异、或仅网络汇编可查；**no** = 查无可靠出处，故意留空。

### 3.1 v1 既有表（全部保留，未改键值）

| 表 | 出处 | verified | 限制 |
|---|---|---|---|
| `TRIGRAMS` `TRI_BY_NAME` `TRI_BY_XIAN` | 《周易·说卦传》八卦取象；先天数伏羲次序 | yes | 五行/方位/卦德用通行配属 |
| `HEX_TABLE` `HEX_SEQ` `HEX_ORDER` | 《周易》通行本卦序（王弼本·朱熹《周易本义》） | yes | — |
| `HEX_POLARITY` | 卦名语义＋卜筮通例的**编辑取值** | partial | 非秘本原文数字，文件头已声明可改 |
| `NAJIA` `PALACES` `PALACE_STAGE` | 京房纳甲、八宫卦序、世爻位次（《京氏易传》《卜筮正宗》） | yes | — |
| `HEX_PALACE` `HEX_WUXING` | 派生 | yes | 纯派生 |
| `JIANCHU` `HUANGHEIDAO` | 《协纪辨方书》建除十二神、黄黑道 | partial | 归类通行，**分值（score）为编辑取值** |
| `XIU28` | 通书二十八宿名/方位/禽曜/正五行 | partial | **score 为编辑取值；心·翼 两宿与通书歌诀冲突（见 §5.1）** |
| `LIUYAO` | 六曜（中日同源「六辉」） | partial | score 为编辑取值；`佛灭`/`仏灭` 互为别名，**不得删**（smoke 断言） |
| `NINE_STAR` | 紫白九星（洛书／《沈氏玄空学》） | partial | 星名五行通行，吉凶文字为编辑取值 |
| `SHAN24` `SHAN_PALACE` `EAST_WEST` | 罗盘二十四山；《八宅明镜》东西四命 | yes | — |
| `WUYIN` `TEN_GODS` `ZIWEI_PALACES` | 《礼记·月令》五音；《渊海子平》十神；《紫微斗数全书》十二宫 | yes | — |
| `ASTRO_HOUSES` | 现代占星十二宫 | partial | **v1 第 7 位作「疾厄2」占位（见 §5.2）**，本轮未改 |
| `ZODIAC` | 现代占星星座区间 | partial | 边界各书 1 日出入 |
| `TAIXUAN_81` | 扬雄《太玄经》八十一首 | yes | 通行字形 |
| `LINGQI_POS` | 《灵棋经》十二棋位 | partial | **v1 仅三组名，非逐位全表（见 §5.2）** |
| `DONGGONG_JI` `YANGGONG_13` | 《董公选要》；杨公十三忌通行表 | partial / yes | 董公表各本详略不同，仅取「忌」日支 |
| `WUYUN` `LIUQI_SITIAN` | 《素问·天元纪大论／五运行大论》五运六气 | yes | — |

### 3.2 v2 新增 · 六爻/易卦共用

| 表 | 出处 | verified |
|---|---|---|
| `SHI_YING` `SHI_YING_BY_HEX` | 派生自 `PALACE_STAGE`×`HEX_PALACE`；《卜筮正宗·世应诀》 | yes |
| `YONGSHEN` | 《增删卜易·用神章》及求财/婚姻/官讼/疾病/出行/行人/失物/考试/田宅/胎产各章；《卜筮正宗·卷三》 | partial（28 事类为归纳表；婚姻按性别分取用 `altQin`） |
| `WANGXIANG` `WANGXIANG_STATES` `WANGXIANG_SCORE` | 《渊海子平·卷一·论五行旺相休囚死》；《三命通会·卷二》 | yes（与 `kit.wangShuai` 对拍） |
| `KONG_RULES` `JIAN_PO_RULES` | 《增删卜易·旬空章／月建章／日建章》 | partial（断语为通行语归纳） |
| `LIUSHEN` | 《卜筮正宗·卷一·六神诀》 | yes |
| `SANHE_GROUPS` `SANHE_GROUP` | 《三命通会·卷二·论三合会局》 | yes（与 `kit.ZHI_SANHE` 同值） |

### 3.3 v2 新增 · 神煞 / 人元

| 表 | 出处 | verified |
|---|---|---|
| `SHENSHA_ALL`（27 条） | 《渊海子平·卷一》神煞歌诀；《三命通会·卷二·论诸神煞》 | partial |
| `RENYUAN_30` | 《渊海子平·卷一·人元司令分野》 | partial（诸本日数有异；合计已校验） |
| `CANGGAN_W` `CANGGAN_LEVEL` | 派生自 `RENYUAN_30`；本气/中气/余气（《渊海子平》） | yes |

`SHENSHA_ALL` 里 **21 条 `yes`、6 条 `partial`**。标 `partial` 的 6 条与其分歧点：

| 神煞 | 分歧 |
|---|---|
| 羊刃 | 阴干取「帝旺」（乙寅·丁巳·己巳·辛申·癸亥）vs 取「禄后一位」（乙辰·丁未·己未·辛戌·癸丑）两说；本表取帝旺义 |
| 国印贵人 | 丙戊／丁己同宫的次序各本微异 |
| 红艳煞 | 歌诀本身「甲乙午申」「壬怕申」重出互异 |
| 六厄 | 取三合局「死」位 vs 取「败」地 |
| 天医 | 月支「退一位」（正月见丑）vs「前一位」 |
| 魁罡 | 四日为庚辰·庚戌·壬辰·戊戌，另有以壬戌代戊戌者 |

`RENYUAN_30` 注意：**卯含甲·乙、酉含庚·辛**，比 `kit.ZHI_CANGGAN`（卯=[乙]、酉=[辛]）多一个干。两者都保留，差异已记账本，取用者自行决定折算。

`RENYUAN_30` 取值口径（v2 期间做过一次修正，**已与 `src/methods/mingli.js` 族内表逐月同值对齐**）：

- 四孟／四生地（寅巳申亥）取**通行本 7·7·16**（余气 7、中气 7、本气 16）：寅 戊7丙7甲16、巳 戊7庚7丙16、申 戊7壬7庚16、亥 戊7甲7壬16；
- 四仲（卯酉）10·20、四季（辰戌丑未）9·3·18，两本相同；
- **另有异本**作 巳 戊5庚9丙16、申 戊5壬3庚22、亥 戊7甲5壬18（本插件第一版误采此本，已改）；
- 采用通行本的理由：四孟月内部规则一致（7·7·16），且与 Lead 写的 `mingli.js` 族内表一致 —— 后者直接影响 `chart.renyuan`（kernel-astro 走本表）与命理族旺衰算法的**一致性**。
- 归一化对拍命令与结论：`tables.RENYUAN_30` 与 `mingli.js` 族内表**十二月逐月同值**（仅形状不同：本表 `[{gan,days}]`、族内 `[[gan,days]]`）。

### 3.4 v2 新增 · 紫微斗数

| 表 | 出处 | verified |
|---|---|---|
| `ZIWEI_BRANCH_FROM_YIN` | 《紫微斗数全书·安十二宫诀》 | yes |
| `ZIWEI_JU` | 《紫微斗数全书·安五行局诀》＋ iztro@2.6.1 算术式 | yes |
| `ZIWEI_MAJOR_GROUP` | 安紫微诸星诀／安天府诸星诀 ＋ iztro `majorStar.js` | yes |
| `ZIWEI_BRIGHTNESS` `ZIWEI_BRIGHTNESS_LEVELS` | iztro@2.6.1 `data/stars.js`（源为《全书》庙旺表） | partial（20×12 对拍一致，但庙旺各派互异） |
| `ZIWEI_SIHUA` | 《紫微斗数全书·安四化诀》＋ iztro `heavenlyStems.js` | yes（庚干取「阳武阴同」，异说已注明） |
| `ZIWEI_MINGSHEN` | 《安命主身主诀》＋ iztro `earthlyBranches.js` | yes |
| `ZIWEI_KUI_YUE` `ZIWEI_LUCUN` | 《安魁钺诀》《安禄存诀》＋ iztro `location.js` | yes |
| `ZIWEI_HUO_LING_START` `ZIWEI_MINOR_RULES` | 《全书》火铃诀/安辅弼/昌曲/空劫/鸾喜诀 ＋ iztro | partial（火铃起法诸本有异） |

### 3.5 v2 新增 · 风水（玄空／三合）

| 表 | 出处 | verified |
|---|---|---|
| `XUANKONG_YUN` | 《沈氏玄空学·论三元九运》（1864 甲子起一运，每运 20 年） | yes |
| `XUANKONG_FLY` `LUOSHU_GONG` | 《沈氏玄空学》飞泊轨迹；《洛书》九宫数 | yes |
| `SHAN24_SANYUAN` | 《沈氏玄空学·论三元龙》 | partial（三元龙阴阳各本表述略异） |
| `SHAN24_SANHE` | 《地理五诀·卷三》双山五行 | partial（双山配山表述各书不同） |
| `SANHE_CHANGSHENG` | 派生自 `kit.CHANGSHENG`×`CHANGSHENG_START`（阳干长生） | yes |
| `XUANKONG_TIGUA` | — | **no（null）** |

### 3.6 v2 新增 · 姓名 / 二十八宿

| 表 | 出处 | verified |
|---|---|---|
| `WUGE_81` | 熊崎健翁《姓名の神秘》(1929) 五格剖象法；两处公开汇编互校（见下） | partial |
| `WUGE_WUXING_BY_TAIL` | 同上（尾数定五行） | partial |
| `WUGE_LUCK_SCORE` | 本插件编辑取值（吉55/半吉10/凶−55） | partial |
| `SANCAI_RULE` | 五格三才「相生相比为吉、相克为凶」 | partial |
| `SANCAI_TABLE` `SHENGXIAO_BUSHOU` | — | **no（null）** |
| `XIU28_ORDER` `XIU28_GROUP` | 派生；《史记·天官书》《汉书·律历志》四象分野 | yes |
| `XIU28_LUCK` | `vendor/lunar.cjs` `LunarUtil.XIU_LUCK`（源为通书《二十八宿吉凶歌》） | yes |
| `XIU28_YIJI` | — | **no（null）** |

`WUGE_81` 的两处来源（**网络二手汇编，非原书影印**，故整体记 `partial`）：

- [1] 琴鹤堂国学《五格剖象姓名学81数理吉凶表》 — https://m.sohu.com/a/448617276_100084723/
- [2] 顺时知识库《八十一數理》 — https://shunshi.ai/zh-tw/wiki/naming/wuge/shuli_81

两源**吉/凶两侧基本一致**，但档位细分常不同：**16 个数两源档位不同**（8,17,18,25,27,36,38,39,40,42,53,55,72,73,75,78，表中以 `alt` 记 [2] 的档），其中 **9 个数跨侧冲突**（27,36,40,42,53,55,72,75,78，标 `disputed: true`）。
[2] 自己也明说 42、49 各派判法不一 —— 本插件照实标注，不挑一派当唯一答案。

---

## 4. 故意留空（`null` + `verified:'no'`）与理由

| 表 | 为什么不留近似值 |
|---|---|
| `XUANKONG_TIGUA` | 兼向替卦（起星）《沈氏玄空学》与中州派、无常派取替规则互异，无可核原表 |
| `SANCAI_TABLE` | 125 组三才吉凶，熊崎原表与中文传本（《姓名学宝典》《慧缘姓名学》等）不完全一致；只给 `SANCAI_RULE` 的可推导判据 |
| `SHENGXIAO_BUSHOU` | 生肖姓名学用字宜忌属近代俗说，各谱互异，无古典出处 |
| `XIU28_YIJI` | 逐宿宜忌需《协纪辨方书》《象吉通书》等辞书原表，手上无可靠版本 |

**合规说明（请 Lead 过目）**：紫微诸表取自 `iztro@2.6.1`（MIT）。本插件**未新增运行时依赖**，也**未搬运其代码**，只把其中的**数据表取值**（庙旺/四化/命身主/魁钺/禄存/火铃起点）转录进本文件并逐条注明 `库@版本 + 文件路径`。该库数据本身源自公版典籍《紫微斗数全书》。若 Lead 认为需要更正式的第三方署名，建议在 `README` 或 `NOTICE` 补一行 iztro 归属 —— 这属 Lead 的文件，我不越界改。

---

## 5. 发现的冲突与遗留问题（**请 Lead 裁决**，我未擅自改 v1）

### 5.1 `XIU28` 心宿、翼宿 的 score 与通书歌诀相反

| 宿 | v1 `XIU28[].score` | `XIU28_LUCK`（vendor/lunar.cjs） | 通书歌诀 |
|---|---|---|---|
| 心 | **+30（吉）** | 凶 | 「心星造作大为凶」 |
| 翼 | **+30（吉）** | 凶 | 「翼星不利架高堂」 |

其余 26 宿两表同侧。**本轮未改 v1 分值**（避免影响在写的 zeri 族与既有 golden），新增 `XIU28_LUCK` 供取用；是否修正由 Lead 决定。

### 5.2 v1 表的其它遗留瑕疵（本轮未改，仅记档）

| 表 | 问题 |
|---|---|
| `ASTRO_HOUSES` | 12 项里第 7 位是「疾厄2」占位（西方占星第七宫实为「夫妻」），且第 6 位已是「疾厄」 |
| `LINGQI_POS` | 名为「十二棋位名」实为三组名（上四/中四/下四），非逐位全表 |
| `DONGGONG_JI` | 只有「忌」日支一列，非董公逐月全表 |
| `HEX_POLARITY` / `JIANCHU` / `HUANGHEIDAO` / `XIU28` / `LIUYAO` / `NINE_STAR` 的 score | 均为**本插件编辑取值**（文件头已声明），非典籍原文数字 |

### 5.3 `WUGE_81`（本文件）与 v1 族内 `SHULI_81` 有 16 数档位不同

`src/methods/data/xiangxing.js` 里已有 v1 自带的 `SHULI_81`（键 1..81，含 `name`/`luck`/`score`）。逐数对拍结果：

| 数 | `tables.WUGE_81`（两源互校） | v1 族内 `SHULI_81` |
|---|---|---|
| 8 / 17 / 18 / 25 / 38 / 39 / 73 | 半吉（异源作吉） | 吉 |
| 30 / 49 / 50 | 半吉 | **凶** |
| 58 | 半吉 | 吉 |
| 36 / 72 | 半吉（异源作凶） | 凶 |
| 75 / 80 | **凶** | 吉 |
| 78 | 凶（异源作半吉） | 半吉 |

另有 16 个数的**数理名**用词不同（如 2「两仪之数」vs「分离破败」、57「日照春松」vs「月照春松」），属别名而非数值冲突。

**未擅自改动任何一方**（`data/xiangxing.js` 属 m-fengshui 写作用域）。处置建议（请 Lead 定）：
1. m-fengshui 重写 `xiangxing.js` 时**直接 import** `tables.WUGE_81`（并读 `alt`/`disputed`），删掉族内副本 —— 这样 16 数分歧自然收敛；
2. 或者保留族内副本，但必须在 `detail.cite` 里写明其版本，且 `docs/verification/fengshui-xiangxing.md` 记录与 `WUGE_81` 的差异清单（否则 verifier 必然当作不一致报上来）。

### 5.4 跨族边界（与 m-sanshi 的协调结果）

m-sanshi 明确回绝：**三式/六壬/奇门表全部归族内**（`src/methods/sanshi.js` 自带出处），要求 `tables.js` 不要重复。理由：奇门局数/拆补符头、月将过宫、九宗门等属**师承敏感、随流派分歧**的表，放跨族文件不合适（契约 §5 亦同此意）。
→ 因此 task-2 描述里的「奇门/六壬表」**有意不在本文件实现**，账本以 `_三式与六壬表` 条目登记去向，供 verifier 定位。
→ 风水族同理：`m-fengshui` 本轮未 spawn，故玄空/三合跨族部分暂放本文件（`XUANKONG_*` `SHAN24_*` `SANHE_CHANGSHENG`），若日后 m-fengshui 自带同名族内表，**不冲突**（方法层按需 import）。

---

## 6. 复跑方式（verifier 用）

```powershell
cd D:\DSH\plugins\dsh-divination-108
node test/smoke.mjs                      # 82 项，含 LIUYAO['佛灭']===LIUYAO['仏灭']
node -e "import('./src/core/tables.js').then(m=>console.log(Object.keys(m).length))"   # 97
```

- 与 `kit` 的对拍可直接抄 §2.1 的命令（无外部依赖）。
- 与 iztro 的对拍脚本可照 §2.2 表格自写（`createRequire('file:///D:/DSH/.divination-v2-deps/node_modules/')` 后 `require('iztro/lib/data/index.js')`、`iztro/lib/star/location.js`；注意 `i18n` 只有 `t`/`kot`，取中文用 `i18n.t(key)`）。
- 坑：`iztro` 的宫位索引以**子=0**为地支基、以**寅=0**为宫位基，两套索引并存；对拍时统一换算（本文件 `ZIWEI_BRANCH_FROM_YIN` 用寅=0）。

---

## 7. 遗留风险（诚实声明）

1. **`WUGE_81` 分档**：来源是网络汇编互校，非原书影印；9 数跨侧冲突无法靠这两源判定。若 verifier 找到影印原表，应以原表覆盖并同步 `alt`/`disputed`。
2. **`RENYUAN_30`**：十二月用事日数诸本有异（本插件取《渊海子平》通行本），合计固定 30 日是**人工归一**，非天文月长。
3. **`SHENSHA_ALL` 的 6 条 partial**：分歧是真实存在的，方法层引用时应在 `detail` 里带 `verified:'partial'`。
4. **庙旺表各派互异**：本插件与 oracle 一致，但「与 iztro 一致」不等于「与用户师承一致」。
5. `ZIWEI_BRIGHTNESS` 里擎羊/陀罗的空档（`''`）表示该星不居此宫（各家对四仲/四孟的处理不同），方法层需自行处理空值，勿当 0。
