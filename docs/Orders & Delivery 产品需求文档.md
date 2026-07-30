# Orders & Delivery 产品需求文档

## 1. 项目背景

`Pre-meeting_Proposal` 已支持品牌查看 Pilot Plan、填写地址、确认订单和付款，并将订单写入 Supabase：

- `order`：订单、数量、金额、付款状态
- `order_item`：商品、套餐和优惠明细
- `shipping_address`：收货地址
- `payment`：支付记录
- `finance_handoff`：付款链接及付款状态

品牌付款后，目前无法在 DTC Dashboard 中持续查看：

- 向 FridgeChannel 购买了什么
- 购买数量和订单金额
- 设计与生产进度
- 物流状态和 Tracking Number
- 预计送达时间
- 已完成的历史 FC 订单

本功能需要在 DTC Dashboard 增加独立的 `Orders & Delivery` 页面，将 Pre-meeting Proposal 的下单流程和 Dashboard 的后续履约追踪连接起来。

---

## 2. 产品目标

让品牌登录 Dashboard 后，可以清楚回答以下问题：

1. 我向 FC 下了哪些订单？
2. 每个订单买了什么、多少件、花了多少钱？
3. 是否已经付款？
4. 订单目前处于设计、生产、发货还是送达阶段？
5. 物流单号和预计送达时间是什么？
6. 当前有没有需要品牌完成的操作？

### 成功标准

品牌无需联系 FC，即可在 30 秒内确认：

- 当前订单状态
- 下一步需要做什么
- 物流到哪里

---

## 3. 功能范围

### MVP 包含

- Dashboard 首页展示当前进行中的 FC 订单摘要
- 侧边栏增加 `Orders & Delivery`
- 查看当前订单和历史订单
- 查看订单金额、数量、付款状态及收货地址
- 查看设计、生产、物流和送达阶段
- 查看承运商、Tracking Number、预计送达时间
- 查看品牌当前待办
- 支持空状态、加载状态和错误状态
- 所有数据严格按当前登录品牌的 `customer_id` 隔离

### MVP 不包含

- 品牌在 Dashboard 中修改订单金额或数量
- 品牌在 Dashboard 中取消订单
- Dashboard 内直接支付
- FC 内部生产管理后台
- 品牌收货后的入仓、发放和消费者投放管理
- 与承运商 API 自动同步物流轨迹
- 单件磁贴发放到每个消费者的逐件追踪
- Shopify 消费者订单管理

订单与物流页面在 MVP 中以只读展示为主。状态由数据库或 FC 内部运营流程更新。

---

## 4. 导航与页面位置

在现有 Dashboard 左侧导航的 `Overview` 分组中新增：

```text
Overview
├── Dashboard
├── Orders & Delivery
└── Brand Info
```

`Orders & Delivery` 位于 `Dashboard` 后、`Brand Info` 前。

路由：

```text
/orders-delivery
/orders-delivery?order=<orderId>
```

侧边栏可以在存在进行中订单时显示一个小状态点或进行中订单数量，但 MVP 不强制实现数字 Badge。

不要将该页面放在：

- Shopify
- Coupons
- Campaign
- Accounts

因为这里展示的是品牌向 FridgeChannel 购买的产品及履约进度，不是品牌消费者的 Shopify 订单。

---

## 5. Dashboard 首页入口

在品牌 Dashboard 首页顶部业务数据之前，展示 `Active FC Order` 摘要区域。

仅在存在未完成订单时展示。

### 展示字段

- Order Number
- Product / Package
- Quantity
- Total Amount
- Payment Status
- Current Fulfillment Stage
- Estimated Delivery
- Current Action

### 示例

```text
ACTIVE FC ORDER

FC-2026-001
Post-Purchase Moat · 1,000 NFC magnets

$4,392.00     Paid
Production    Estimated delivery Aug 12–15

Your magnets are currently in production.
View order →
```

整个摘要区域可点击，进入：

```text
/orders-delivery?order=123
```

如果有多个进行中的订单，只展示最近更新的一笔，并显示：

```text
View all 2 active orders
```

Dashboard 摘要不是完整订单页面，不展示价格拆分、详细地址或完整时间线。

---

## 6. Orders & Delivery 页面结构

### 6.1 页面标题

```text
Orders & Delivery
Track your FridgeChannel orders from payment through delivery.
```

不要增加创建订单按钮。新订单仍从 Pre-meeting Proposal 流程产生。

### 6.2 订单筛选

页面提供三个筛选项：

- Active
- Completed
- All

默认打开 `Active`。

分类规则：

- `Active`：尚未送达且未取消的订单
- `Completed`：已经送达品牌方的订单
- `All`：所有当前品牌订单

内部历史状态 `distribution_planning`、`distributing`、`completed` 在品牌端统一按 `Delivered` 展示，并进入 `Completed`。

### 6.3 页面布局

订单列表和订单详情使用独立页面状态，桌面端与移动端均不同时展示：

```text
/orders-delivery
└── Order list

/orders-delivery?order=:orderId
└── Order detail
```

移动端：

- 首先显示订单列表
- 点击订单进入详情
- 详情顶部提供返回 `All orders`
- 不使用横向双栏
- 不允许依赖 Hover 才能看到信息

即使只有一笔订单，也先显示订单列表；只有点击订单后才进入详情。

---

## 7. 订单列表

每一行展示：

- 订单号
- Package / Product
- 数量
- 总金额
- 当前阶段
- 下单日期或最近更新时间
- 当前状态颜色

示例：

```text
FC-2026-001
Post-Purchase Moat · 1,000 pieces
Production
$4,392.00 · Updated Jul 29
```

状态颜色：

- Payment pending：橙色
- Action required：橙色
- In progress：蓝色
- Shipped：紫色或蓝色
- Delivered：绿色
- On hold：灰色
- Cancelled：灰色或红色

颜色不能是唯一状态提示，必须同时显示文字。

---

## 8. 订单详情

订单详情按以下顺序展示。

### 8.1 订单头部

展示：

- Order Number
- 当前状态 Badge
- 下单日期
- 最近更新时间
- Package Name
- Quantity
- Total Amount
- Payment Status

示例：

```text
FC-2026-001                         Production

Post-Purchase Moat
1,000 NFC magnets

Total                              $4,392.00
Payment                            Paid
Ordered                            Jul 28, 2026
```

### 8.2 履约进度

前端使用五个用户可理解的主要阶段：

1. Order placed
2. Payment confirmed
3. Design & production
4. Shipped
5. Delivered

展示规则：

- 已完成阶段显示完成标记和完成日期
- 当前阶段高亮
- 未来阶段弱化
- `On hold` 时在进度条上方展示原因
- `Cancelled` 时停止展示正常进行状态，并展示取消说明

`Delivered` 是品牌订单的终点。后端可以继续保存内部发放状态，但品牌端只能映射到以上五个阶段。

### 8.3 Current action

当前待办必须放在进度之后、Order summary 之前。

可能的操作提示：

```text
No action needed
Your magnets are currently in production.
```

```text
Action required
Please confirm the final magnet artwork by Aug 2.
```

```text
Action required
Please confirm your shipping address before production is completed.
```

需要的数据：

- `action_required`
- `next_action_title`
- `next_action_description`
- `next_action_due_at`

MVP 中该区域只展示信息，不要求实现文件上传或设计审批按钮。

没有待办时必须明确显示 `No action needed`，不能留空。

### 8.4 Shipping tracking link

订单详情不单独展示 Shipment 区域，也不展示以下占位信息：

- Status
- Carrier
- Estimated delivery
- `To be confirmed`

Shipping address 仍放在 Order summary 底部。后端确实返回受信任 Tracking URL 时，在地址下方只显示一个链接：

```text
Shipping address
Jamie Lee
123 Main St, Austin, TX 78701
Track shipment ↗
```

`Track shipment` 必须使用后端返回的受信任 Tracking URL，并在新标签页打开。

Tracking URL 不存在时，在地址下方显示：`Tracking information isn’t available yet. We’ll display it here as soon as it’s updated.`

### 8.5 Order summary

展示：

- Package
- 商品行
- Unit Price
- Quantity
- Subtotal
- Discount
- Shipping
- Tax
- Total
- Currency
- Payment Method
- Payment Time
- Invoice Number
- Shipping Address
- 可选的 `Track shipment ↗` 链接

金额必须复用订单创建时的快照，不能使用当前商品价格重新计算。

---

## 9. 状态模型

数据库保存细粒度状态：

```text
payment_pending
order_confirmed
awaiting_brand_inputs
design_in_progress
awaiting_design_approval
design_approved
production
quality_check
ready_to_ship
shipped
delivered
distribution_planning
distributing
completed
on_hold
cancelled
```

前端主要阶段映射：

| 后端状态 | 页面阶段 |
| --- | --- |
| `payment_pending` | Order placed |
| `order_confirmed` | Payment confirmed |
| `awaiting_brand_inputs` | Design & production |
| `design_in_progress` | Design & production |
| `awaiting_design_approval` | Design & production |
| `design_approved` | Design & production |
| `production` | Design & production |
| `quality_check` | Design & production |
| `ready_to_ship` | Design & production |
| `shipped` | Shipped |
| `delivered` | Delivered |
| `distribution_planning` | Delivered（兼容内部历史状态） |
| `distributing` | Delivered（兼容内部历史状态） |
| `completed` | Delivered（兼容内部历史状态） |
| `on_hold` | 保留最近阶段并显示 On hold |
| `cancelled` | Cancelled |

支付状态不能只依赖履约状态，应继续根据 `order.status`、`payment` 和 `finance_handoff` 判断。

品牌端完成规则：

- `delivered` 及其后的内部状态都进入 `Completed`
- 已送达订单不得继续出现在 `Active` 或 Dashboard Active FC Order
- 已送达订单不得再返回品牌待办

---

## 10. 数据库设计

继续复用 Pre-meeting Proposal 已有数据表，不复制订单。

### 10.1 复用表

```text
public."order"
public.order_item
public.shipping_address
public.payment
public.finance_handoff
```

订单必须通过：

```text
order.customer_id = 当前登录品牌 customer_id
```

进行租户隔离。

### 10.2 新增履约表

建议新增：

```sql
public.fc_order_fulfillment
```

字段：

```text
id                       bigint or uuid primary key
order_id                 bigint not null unique
customer_id              bigint not null
status                   text not null
action_required          boolean not null default false
next_action_title        text null
next_action_description  text null
next_action_due_at       timestamptz null

carrier                   text null
tracking_number           text null
tracking_url              text null
shipped_at                timestamptz null
estimated_delivery_start timestamptz null
estimated_delivery_end   timestamptz null
delivered_at              timestamptz null

distribution_status      text null
distribution_method      text null
planned_quantity         integer null
distributed_quantity     integer not null default 0
distribution_start_at    timestamptz null
distribution_notes       text null

hold_reason              text null
created_at               timestamptz not null default now()
updated_at               timestamptz not null default now()
```

约束：

- `order_id` 外键指向 `public."order"(id)`
- `planned_quantity >= 0`
- `distributed_quantity >= 0`
- `distributed_quantity <= planned_quantity`，当计划数量存在时
- `tracking_url` 只允许 `https`
- `status` 必须属于定义的状态集合
- `distribution_method` 必须属于定义的发放方式集合

`distribution_*` 和发放数量字段仅供内部运营后台使用。品牌端 Orders & Delivery API 和页面不得返回或展示这些字段。

### 10.3 新增事件表

建议新增：

```text
public.fc_order_fulfillment_event
```

字段：

```text
id
order_id
customer_id
event_type
title
description
actor_type
occurred_at
created_at
```

事件表仅用于内部审计、状态推导和故障排查，不在品牌订单详情页展示。

### 10.4 兼容旧订单

已有订单可能没有 `fc_order_fulfillment` 记录。

兼容规则：

- 未付款订单映射为 `payment_pending`
- 已付款但没有履约记录的订单映射为 `order_confirmed`
- 不得因为缺少履约记录而隐藏订单
- 物流区域展示明确空状态

---

## 11. API 设计

所有 API 必须通过当前登录 Session 获取 `customer_id`，禁止信任前端提交的 `customerId`。

订单读取应使用真实登录品牌：

```ts
getRequestCustomerId(req, res)
```

不要对真实订单使用只读演示账户的：

```ts
getRequestConfigCustomerId(req, res)
```

### 11.1 获取订单列表

```http
GET /api/fc-orders?status=active|completed|all
```

响应：

```json
{
  "orders": [
    {
      "id": 123,
      "orderNumber": "FC-2026-001",
      "packageName": "Post-Purchase Moat",
      "quantity": 1000,
      "currency": "USD",
      "totalAmount": 4392,
      "paymentStatus": "paid",
      "fulfillmentStatus": "production",
      "currentStage": "design_production",
      "actionRequired": false,
      "estimatedDeliveryStart": "2026-08-12T00:00:00Z",
      "estimatedDeliveryEnd": "2026-08-15T00:00:00Z",
      "updatedAt": "2026-07-29T08:00:00Z"
    }
  ]
}
```

### 11.2 获取订单详情

```http
GET /api/fc-orders/:orderId
```

响应包含：

- 订单
- 商品明细
- 支付信息
- 收货地址
- 履约信息
- 物流信息

响应不得包含内部发放计划或 Activity timeline。

### 11.3 获取 Dashboard 当前订单摘要

可以选择：

```http
GET /api/fc-orders/active-summary
```

或者让现有：

```http
GET /api/brand-dashboard
```

增加可选字段：

```json
{
  "activeFcOrder": {}
}
```

推荐独立使用 `/api/fc-orders/active-summary`，避免订单模块错误影响核心数据 Dashboard。

### 11.4 安全要求

- 未登录返回 `401`
- 查询不到返回 `404`
- 访问其他品牌订单同样返回 `404`，不要暴露订单存在
- 后端查询必须同时约束 `order.id` 和 `order.customer_id`
- API 不返回 `finance_handoff.token`
- API 不返回 Stripe Session Secret
- API 不返回订单 `remark` 中不必要的内部信息
- Tracking URL 在后端验证后再返回

---

## 12. 前端接入建议

新增文件：

```text
src/dashboard/components/orders-delivery.jsx
src/api/fc-orders.ts
src/services/fc-order.service.ts
src/repositories/fc-order.repo.ts
```

新增 Supabase migration：

```text
supabase/migrations/<timestamp>_fc_order_fulfillment.sql
```

修改：

```text
src/dashboard/components/admin.jsx
src/dashboard/components/brand-dashboard.jsx
src/dashboard/admin.html
src/dashboard/styles/styles.css
src/index.ts
```

### `admin.jsx`

增加：

```js
const ORDERS_DELIVERY_SECTION = {
  id: "orders-delivery",
  label: "Orders & Delivery",
};
```

加入 `ALL_SECTIONS` 和 `Overview` 导航。

路由解析：

```js
if (window.location.pathname === "/orders-delivery") {
  return ORDERS_DELIVERY_SECTION.id;
}
```

导航切换：

```js
window.history.replaceState({}, "", "/orders-delivery");
```

渲染：

```jsx
<OrdersDeliveryPage />
```

### `admin.html`

在 `admin.jsx` 之前加载：

```html
<script
  type="text/babel"
  src="components/orders-delivery.jsx"
></script>
```

---

## 13. 页面状态

### Loading

- 使用现有 `PageLoading`
- 订单详情切换时保留列表，不要让整个页面闪白

### Empty：没有任何订单

```text
No FC orders yet

Your FridgeChannel orders will appear here after an order is placed
through your Pilot Plan.
```

不要展示创建假订单按钮。

### Empty：没有进行中订单

```text
No active orders

You do not have any orders currently in production or delivery.
View completed orders →
```

### Error

```text
We couldn’t load your orders.
Please try again.
```

提供 `Retry`。

### 缺少物流信息

```text
Tracking information will appear here after your order ships.
```

---

## 14. 视觉与交互要求

沿用现有 Dashboard 的字体、颜色和按钮样式。

要求：

- 页面使用留白、间距、对齐和排版层级分组
- 默认不使用分隔线或边框划分内容
- 不使用大量嵌套卡片
- 订单状态文字始终可见
- 金额使用等宽数字或 `tabular-nums`
- 所有日期按照用户本地时区格式化
- 金额使用订单保存的 currency
- Tracking Number 支持复制
- 外部 Tracking URL 新标签打开
- 点击订单行即可进入详情，不额外增加重复的 `View` 按钮
- 移动端宽度 365–430px 时不得出现横向滚动
- 可点击区域最小高度 44px
- 进度条在移动端改为纵向时间线
- 订单明细在移动端使用 label/value 行，不强制保留桌面表格

UI 文案保持英文，与当前 Dashboard 一致。

---

## 15. 数据一致性规则

- 金额直接读取 `order` 和 `order_item` 快照
- 不在前端重新计算历史订单价格
- 支付完成后，不允许履约状态仍显示 `payment_pending`
- `delivered_at` 存在时，Shipment Status 至少为 `delivered`
- `Delivered` 是品牌订单终点，必须进入 Completed 历史列表
- 内部 `distribution_planning`、`distributing`、`completed` 状态在品牌端统一归一为 `Delivered`
- 已送达订单不得继续返回品牌待办或出现在 Active 列表
- 删除或撤销 Finance Handoff 不得删除订单
- 订单物流状态不得与 Shopify 消费者订单混用

---

## 16. 验收标准

### 导航

- [ ] `Overview` 下出现 `Orders & Delivery`
- [ ] 位于 `Dashboard` 和 `Brand Info` 之间
- [ ] 点击后进入 `/orders-delivery`
- [ ] 刷新页面后仍停留在订单页面

### 权限

- [ ] 用户只能看到当前品牌的订单
- [ ] 修改 URL 中的订单 ID 无法读取其他品牌订单
- [ ] 未登录用户跳转登录页或 API 返回 `401`
- [ ] 前端请求不传 `customerId`

### 订单列表

- [ ] Active、Completed、All 筛选正确
- [ ] 显示订单号、套餐、数量、金额和状态
- [ ] 默认显示 Active 筛选，不自动打开任何订单
- [ ] 无订单时显示正确空状态

### 订单详情

- [ ] 显示正确订单金额和购买数量
- [ ] 显示支付状态
- [ ] 显示五阶段履约进度，并以 Delivered 结束
- [ ] 当前阶段正确高亮
- [ ] 显示品牌当前待办
- [ ] Delivered 后不再显示任何品牌待办
- [ ] Shipping address 下方存在可信 Tracking URL 时显示 `Track shipment ↗`
- [ ] Tracking URL 不存在时显示 `Tracking information isn’t available yet. We’ll display it here as soon as it’s updated.`
- [ ] 不展示独立 Shipment 区域、物流占位信息或 `To be confirmed`
- [ ] 展示收货地址
- [ ] 展示订单价格明细

### Dashboard 摘要

- [ ] 存在进行中订单时展示 `Active FC Order`
- [ ] 点击进入对应订单详情
- [ ] 没有进行中订单时不展示空摘要区域
- [ ] 摘要 API 失败不影响 Dashboard 其他数据

### 响应式与质量

- [ ] 390px 手机宽度没有横向滚动
- [ ] 桌面端与移动端都只显示列表或详情
- [ ] 点击订单进入独立详情，All orders 返回列表
- [ ] Loading、Empty、Error 状态完整
- [ ] TypeScript typecheck 通过
- [ ] 项目构建通过
- [ ] API 和状态映射具有自动化测试
- [ ] 使用真实数据库数据，不增加生产环境 mock 回退

---

## 17. 测试场景

至少覆盖以下数据：

1. 没有订单的品牌
2. 一笔未付款订单
3. 一笔已付款但未开始生产的订单
4. 一笔等待品牌确认设计的订单
5. 一笔生产中的订单
6. 一笔已发货并有 Tracking Number 的订单
7. 一笔已送达订单，进入 Completed
8. 一笔内部状态为 `distribution_planning` 的历史订单，品牌端显示 Delivered
9. 一笔内部状态为 `completed` 的历史订单，品牌端显示 Delivered
10. 一笔 On hold 订单
11. 一笔已取消订单
12. 一个品牌拥有多笔订单
13. 尝试访问其他品牌的订单
14. 老订单没有 `fc_order_fulfillment` 记录
15. Dashboard 订单摘要 API 加载失败

---

## 18. Codex 实施要求

请先检查当前工作区的未提交改动并保留用户已有修改，然后按以下顺序开发：

1. 确认 DTC Dashboard 与 Pre-meeting Proposal 使用的订单表结构。
2. 新增履约和事件 migration。
3. 实现 repository、service 和 API。
4. 为 API 添加租户隔离测试。
5. 实现 `Orders & Delivery` 页面。
6. 接入侧边栏和路由。
7. 增加 Dashboard 当前订单摘要。
8. 验证空状态、旧订单兼容和跨租户安全。
9. 在桌面和 390px 手机视口进行视觉验证。
10. 运行 typecheck、测试和构建。

实现过程中不得修改 Pre-meeting Proposal 的订单金额计算逻辑，不得复制订单到另一套表，也不得把该模块与 Shopify 消费者订单混在一起。
