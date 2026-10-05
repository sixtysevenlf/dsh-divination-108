# NOTICE · 第三方组件与数据来源

本插件在 `vendor/` 下内置第三方代码，并在若干规则表中转录了第三方开源项目的数据。
其著作权归原作者所有，按各自许可证使用。本文件按许可证要求保留署名。

## 随包发布（`vendor/`）

| 组件 | 版本 | 许可证 | 用途 | 文件 |
|---|---|---|---|---|
| **lunar-javascript**（含寿星天文历算法） | 1.7.x | MIT | 农历、节气、干支、旬空、建除、黄黑道、二十八宿、宜忌、大运等历法事实 | `vendor/lunar.cjs` |
| **Astronomy Engine**（Don Cross） | 2.1.19 | MIT | 太阳/月亮/五星真视黄经、ΔT、均时差、恒星时（七政四余、二十八宿入宿度的星历来源） | `vendor/astronomy.cjs`、`vendor/astronomy-engine.LICENSE` |

> 两者均为**运行时依赖**，插件不联网即可完成全部 108 法计算。

## 仅用于开发期校验（**不随包发布**）

| 组件 | 版本 | 许可证 | 用途 |
|---|---|---|---|
| **iztro** | 2.6.1 | MIT | 紫微斗数金标准 oracle：生成 `tools/fixtures/ziwei-oracle.json`（200 组），用于对拍本插件紫微安星实现 |
| **tyme4ts** | 1.5.2 | MIT | 历法第二通路对拍 |
| **astronomy-engine**（npm 版） | 2.1.19 | MIT | 星历第二通路对拍 |

这些只存在于开发机的 `D:\DSH\.divination-v2-deps\`，`package.json` 的 `files` 白名单与 `tools/` 均不在发布范围内。

## 规则表的数据来源

- **紫微斗数**：`src/core/tables.js` 的 `ZIWEI_*` 系列表转录自 iztro@2.6.1（MIT）。
  其数据源为公版典籍《紫微斗数全书》所载安星诀；本插件不引入 iztro 的运行时依赖，
  且已用 200 组随机样本对拍至逐项一致（见 `docs/verification/mingli.md`）。
- **其余规则表**：逐表出处与核验状态见 `docs/verification/tables-provenance.md`
  （每张表在源码里都带 `// cite:` 注释，标注典籍篇名或 URL@版本）。

## 关于术数内容本身

本插件输出的是**传统文化与娱乐性质**的推演结果，**不构成**医疗、投资、法律或任何专业建议。
保真度分级（`full` / `core` / `approx`）与输出中的 ⚠ 标记用于如实告知某一法的算法完整程度：
`approx` 表示缺秘传表或辞书，仅按公开可推部分计算，**不可当作实测结论**。
