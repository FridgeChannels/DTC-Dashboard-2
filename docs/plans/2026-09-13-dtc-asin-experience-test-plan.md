# Amazon / DTC 兼容接入 — 测试计划

## 范围

覆盖：`customer.product_line`、`GET /api/fc/experience/{sn}`、magnet 事实源 + `reorder_fc_unit` 挂接、FCDiscountSystem `/p/{sn}` 分流、ReorderApp 四页接 consumer（无 demo 页）。

Survey **完全分表**为本阶段启动项：新增独立 schema/门禁；完整数据迁移可后续，但 DTC 不得再读到 Reorder survey。

---

## T1 — customer.product_line

| ID | 用例 | 期望 |
|----|------|------|
| T1.1 | migration 后列存在，CHECK 仅 `dtc\|asin_plus\|both` | 通过 |
| T1.2 | 历史行回填默认 `dtc` | 通过 |
| T1.3 | 非法值写入失败 | 通过（SQL/测试） |

## T2 — GET /api/fc/experience/{sn}

| ID | 用例 | 期望 |
|----|------|------|
| T2.1 | magnet 不存在 | `experience: unknown`, reason magnet_not_found |
| T2.2 | magnet 存在且无 reorder_fc_unit | `experience: dtc` + sn/magnetId/customerId |
| T2.3 | magnet 存在且有 unit（magnet_id 绑定） | `experience: asin_plus` + batchId/fcUnitStatus |
| T2.4 | 不调用 consumer 即可判定 | 单测断言只查 magnet/unit |
| T2.5 | sn 大小写规范化 | 与 upper(sn) 一致 |

## T3 — magnet 事实源 + unit

| ID | 用例 | 期望 |
|----|------|------|
| T3.1 | assign FC units 必须写入 magnet_id | SQL/单测 |
| T3.2 | fc_id 与 magnet.sn 一致 | 通过 |
| T3.3 | 无 magnet 时先创建再挂 unit | 通过 |

## T4 — FCDiscountSystem 分流

| ID | 用例 | 期望 |
|----|------|------|
| T4.1 | experience=asin_plus → 挂 ReorderApp | 通过 |
| T4.2 | experience=dtc → 挂 App | 通过 |
| T4.3 | experience=unknown → 错误/无效态，不进 DTC | 通过 |
| T4.4 | experience 接口 5xx → 错误重试，不误判 DTC | 通过 |
| T4.5 | 分流不请求 `/api/reorder/consumer` | 代码/单测 |

## T5 — ReorderApp 正式四页

| ID | 用例 | 期望 |
|----|------|------|
| T5.1 | asin_plus 后才请求 consumer | 通过 |
| T5.2 | 单券 landing 直出 | 映射测试 |
| T5.3 | 多券 → coupon-list | 映射测试 |
| T5.4 | survey → survey-thanks | 流程存在 |
| T5.5 | 正式导航无 amazon-product/success | grep/单测 |
| T5.6 | CTA 使用 primaryCta 外链 | 通过 |

## T6 — Survey 隔离

| ID | 用例 | 期望 |
|----|------|------|
| T6.1 | DTC availability/list 不含 reorder survey | 过滤或分表 |
| T6.2 | ASIN survey API 不读写 DTC-only 路径 | 分表或隔离 |

## 自动化执行

- Dashboard：`npx vitest run` 相关 experience / assign / survey 测试
- FCDiscountSystem：`npm test` + 新增 experience/root 测试
- 静态：确认 main 分流、无正式 demo 导航

通过标准：上表自动化项全部绿；无法连真实 DB 的 migration 用 SQL 内容断言。

---

## 执行结果（2026-09-13）

| 套件 | 结果 |
|------|------|
| `DTC-Dashboard-2` `vitest run tests/fc-experience` | **9/9 通过**（T1 migration、T2 experience、T3 magnet assign SQL、T6 isolation） |
| `FCDiscountSystem` `npm test` | **14/14 通过**（domain + T4/T5 entry/map） |

说明：

- Survey **完全分表**：已建 `asin_survey_*` 表；DTC list/availability 已隔离。Reorder 控制台写路径仍暂用原 `q_survey`+reorder 扩展，切到 `asin_survey_*` 为后续 cutover。
- 真实 DB migration 需在环境执行 `2026091312*` 后方可端到端打真实 SN。
- `?scenario=` 仍可本地预览 ASIN UI（不经 experience API）。