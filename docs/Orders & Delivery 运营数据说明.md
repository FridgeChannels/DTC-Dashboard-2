# Orders & Delivery 运营数据说明

## 1. 使用范围

本文用于 Orders & Delivery 上线、历史订单补录、履约状态维护、监控和回退。

- 商业数据继续以 `order`、`order_item`、`payment` 为事实来源。
- 履约、物流、待办和内部发放数据写入 `fc_order_fulfillment`。
- 内部状态历史写入 `fc_order_fulfillment_event`。
- 不复制订单，不重新计算订单价格，不使用生产 mock 数据。
- 所有更新必须带订单所属 `customer_id`，不得跨品牌维护。

## 2. 安全部署顺序

1. 备份并检查现有订单中 `(id, customer_id)` 的完整性。
2. 部署 `20260729043859_fc_order_fulfillment.sql`。
3. 确认新表和 sequence：
   - `service_role` 可读写；
   - `anon`、`authenticated` 无直接权限；
   - 两张新表均启用 RLS。
4. 由运营补齐已有订单的真实履约状态，优先处理已完成、已取消和暂停订单。
5. 部署后端 repository、service 和 `/api/fc-orders*`。
6. 使用真实登录品牌进行 API 冒烟测试。
7. 部署侧边栏、订单页和 Dashboard Active FC Order 摘要。
8. 观察错误率、响应时间和数据一致性后再宣布功能可用。

不要先上线前端入口。数据库或 API 尚未部署时，订单页会正确显示错误状态，但用户无法查看实际订单。

## 3. 履约状态维护

允许的 `status`：

| 状态 | 运营含义 | 需要同步的数据 |
| --- | --- | --- |
| `payment_pending` | 等待付款 | 无 |
| `order_confirmed` | 订单和付款已确认 | 无 |
| `awaiting_brand_inputs` | 等待品牌提供资料 | `action_required`、待办标题 |
| `design_in_progress` | 设计处理中 | 可选事件 |
| `awaiting_design_approval` | 等待品牌确认设计 | `action_required`、待办标题、可选截止时间 |
| `design_approved` | 设计已确认 | 清除已完成待办 |
| `production` | 生产中 | 预计送达时间 |
| `quality_check` | 质检中 | 可选事件 |
| `ready_to_ship` | 等待发货 | 承运商可选 |
| `shipped` | 已发货 | 发货时间、Tracking Number、可信 HTTPS Tracking URL |
| `delivered` | 已送达，品牌订单完成 | 送达时间、清除品牌待办 |
| `distribution_planning` | 内部发放规划中 | 品牌端继续显示 Delivered |
| `distributing` | 内部发放中 | 品牌端继续显示 Delivered |
| `completed` | 内部发放完成 | 品牌端继续显示 Delivered |
| `on_hold` | 暂停 | `hold_reason` 和 `last_active_status` 必填 |
| `cancelled` | 已取消 | `cancel_reason` 必填 |

状态流转时：

- `on_hold` 应保留暂停前的 `last_active_status`，恢复后回到实际业务状态。
- `cancelled` 不展示正常进度阶段，不得用来代替暂停。
- `action_required = true` 时必须提供非空 `next_action_title`。
- 待办完成后设置 `action_required = false`，并清理过期的标题、描述和截止时间。
- 订单进入 `delivered` 后必须清除品牌待办；品牌端会忽略任何遗留待办。
- 状态变化应新增一条 `fc_order_fulfillment_event`，不要改写既有事件。

## 4. 物流与预计送达

- Tracking URL 只能使用 HTTPS。
- 客户页面只开放 UPS、FedEx、USPS、DHL 和 Canada Post 的可信域名。
- 禁止带用户名、密码的 URL。
- `estimated_delivery_end` 不得早于 `estimated_delivery_start`。
- `delivered_at` 不得早于 `shipped_at`。
- 已经填写 `delivered_at` 的订单会按已送达展示，需保证时间真实。

## 5. 发放数据

以下字段仅供内部运营后台使用，不通过品牌 Orders & Delivery API 返回：

- `planned_quantity`：计划发放数量，可在计划未确认时为空。
- `distributed_quantity`：已经发放数量，默认 0。
- `distributed_quantity` 不得大于 `planned_quantity`。
- `distribution_start_at`：实际或确认的发放开始时间。
- `distribution_notes`：内部发放说明，不得通过品牌端接口暴露。

## 6. 事件数据

每条事件应包含：

- `event_type`：稳定、可读的事件类型；
- `title`：面向品牌的简短标题；
- `description`：可选的补充说明；
- `actor_type`：`brand`、`fc`、`system` 或空；
- `occurred_at`：事件真实发生时间。

API 可使用订单创建、付款、发货和送达事件推导进度并按类型去重，但品牌详情响应不返回事件时间线。

## 7. 上线检查

### 数据库

- [ ] migration 成功执行且没有破坏现有订单。
- [ ] 新表 RLS 已启用。
- [ ] `anon`、`authenticated` 无新表权限。
- [ ] `service_role` 可执行必要的增删改查。
- [ ] 日期、数量、hold、cancel、action 约束生效。

### API

- [ ] 未登录请求返回 401。
- [ ] 非法 filter 和订单 ID 返回 400。
- [ ] 其他品牌或不存在的订单返回 404。
- [ ] 列表、摘要、详情只返回当前登录品牌数据。
- [ ] 响应中没有支付回调、失败原因、交易号、Finance token 或 Checkout Session。
- [ ] 详情响应不包含 Distribution 数据或 Activity timeline。
- [ ] Delivered 及内部后续状态均进入 Completed，不出现在 Active 摘要。

### 页面

- [ ] Dashboard 摘要失败不会影响收入模块。
- [ ] 无 Active 订单时不显示 Dashboard 摘要。
- [ ] 390px 和 430px 无页面级横向滚动。
- [ ] 手机端支持列表、详情和 All orders 返回。
- [ ] 桌面端与手机端都只显示列表或详情，不同屏展示。
- [ ] Shipping address 下方存在可信 Tracking URL 时显示外链，并在新标签打开；没有链接时显示 `Tracking information isn’t available yet. We’ll display it here as soon as it’s updated.`
- [ ] 不展示独立 Shipment 区域或物流占位信息。
- [ ] 刷新、前进、后退和订单深链接正常。

## 8. PRD 场景验收记录

| 场景 | 自动化或验收证据 |
| --- | --- |
| 无订单 | service empty list + 页面空/错误状态结构 |
| 未付款 | legacy pending service 测试 |
| 已付款未生产 | legacy confirmed service 测试 |
| 待确认设计 | 16 状态到五阶段表驱动测试 |
| 生产中 | 完整详情、价格和进度测试 |
| 已发货 | Tracking 白名单和物流状态测试 |
| 已送达 | `delivered_at` 状态提升并进入 Completed 测试 |
| 内部发放中 | 历史状态归一为 Delivered 测试 |
| 内部完成 | 历史状态归一为 Delivered 测试 |
| on hold | 暂停前阶段保留测试 |
| cancelled | All/Completed/Active filter 测试 |
| 多订单 | 默认更新时间排序和摘要最新订单测试 |
| 跨租户 | repository customer 条件 + API 404 测试 |
| 无 fulfillment 旧订单 | paid/pending fallback 测试 |
| 摘要 API 失败 | API 安全错误测试 + Dashboard 浏览器降级验收 |

## 9. 监控

上线后至少观察：

- `/api/fc-orders`、`/active-summary` 和详情接口的 401、404、400、5xx；
- 数据库慢查询及 customer/status/updated_at 索引使用情况；
- Dashboard 摘要失败率；
- Tracking URL 被过滤的数量；
- 内部发放数量或日期约束失败；
- 长时间停留在 `payment_pending`、`on_hold` 或 `awaiting_design_approval` 的订单。

## 10. 回退

1. 先隐藏或回退前端 Dashboard 摘要和 Orders & Delivery 导航。
2. 再回退 `/api/fc-orders*` 路由和相关 service。
3. 保留 `fc_order_fulfillment`、`fc_order_fulfillment_event` 及已有数据。
4. 不删除新表、不回滚历史事件、不重新计算订单金额。
5. 修复完成后按“数据库 → API → 前端”的顺序重新上线。

现有 public 表的全局 RLS 风险不在本功能中批量修复。应另开安全整改任务，逐表确认调用方和 policy，避免影响现有业务。
