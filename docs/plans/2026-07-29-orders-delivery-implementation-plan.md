# Orders & Delivery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** 在 DTC Dashboard 中增加一个只读的 Orders & Delivery 模块，让当前登录品牌安全地查看 FC 订单、付款、履约、物流、送达前待办和历史记录，并在 Dashboard 首页看到最近一笔进行中订单。

> **范围修正（2026-07-29）：** 品牌订单以 `Delivered` 为终点。品牌收货后的入仓、发放和消费者投放由其他内部后台管理。本文后续任何 Distribution 页面、Activity timeline 或“发放完成才进入 Completed”的旧描述，均以本修正和最新版 PRD 为准。

**Architecture:** 沿用当前项目的 `repository → service → API handler → React/Babel 页面` 分层。订单事实继续读取现有 `order`、`order_item`、`shipping_address`、`payment`、`finance_handoff` 表，只新增履约主表和履约事件表；浏览器只访问本项目 API，API 从登录 Session 解析真实 `customer_id`，服务端所有查询再次按 `customer_id` 约束。首页摘要使用独立 API，避免影响现有 Dashboard 数据接口。

**Tech Stack:** Node.js 25+、TypeScript、Supabase/Postgres、原生 Node HTTP Server、React 18 UMD + Babel JSX、CSS、Vitest、Playwright/浏览器视觉验证。

---

## 0. 已确认的现状与实现边界

### 当前项目事实

- Dashboard 前端不是打包式 React 应用，而是 `src/dashboard/admin.html` 按顺序加载全局 JSX 文件。
- 服务端路由集中在 `src/index.ts`，静态页面路由集中在 `src/api/serve-static.ts`。
- 当前品牌身份必须通过 `src/api/tenant-context.ts` 的 `getRequestCustomerId(req, res)` 获取。
- `getRequestConfigCustomerId` 会让部分只读账号读取固定 demo customer 5，不得用于真实 FC 订单。
- 服务端 Supabase 客户端使用 service-role，因此 RLS 不能替代 API 层的 `customer_id` 条件。
- 工作区已有用户改动，实施时必须保留：
  - `src/dashboard/styles/styles.css` 的 Dashboard 内容防溢出修复。
  - `docs/Orders & Delivery 产品需求文档.md`。
- 当前测试基线为 40 项中 38 项通过、2 项既有失败：
  - `tests/auth/api-key.test.ts`
  - `tests/coupons/coupon-lookup.test.ts`
  实施完成后要单独报告“本功能新增失败”和“既有失败”，不能混淆。

### 线上真实表结构已确认

- `order.id/customer_id`：`bigint`；订单号字段是 `order_no`。
- 订单金额快照：`amount`、`shipping_fee`、`total_amount`、`currency`。
- `order_item` 已有商品与折扣数据，可作为价格明细快照。
- `payment.status` 是 `smallint`；当前与 Pilot 订单关联的数据中成功记录为 `1`。
- `finance_handoff.status` 为：
  `sent | viewed | payment_pending | paid | expired | revoked | preview`。
- `finance_handoff` 含敏感的 `token` 和 `stripe_checkout_session_id`，API 不得选择或返回。
- `shipping_address` 含电话、邮箱、Google place/validation 元数据；本页面只返回展示所需的收件人和邮寄地址字段。
- 当前 Pilot 数据表明：未付订单为 `order.status = 0`；已付订单为 `order.status = 1`，同时具备 `payment.status = 1`、`payment_time` 和 `finance_handoff.status = paid`。

### PRD 中必须补齐的字段

原建议表结构不足以完整实现验收标准，履约表增加：

- `last_active_status`：订单 `on_hold` 时保留暂停前的实际阶段。
- `cancel_reason`：取消订单必须展示取消说明。
- `invoice_number`：订单详情明确要求 Invoice Number，但现有订单和付款表没有该字段。

### 明确不做

- 不修改 Pre-meeting Proposal 的订单创建、价格计算或支付流程。
- 不复制订单到新订单表。
- 不增加取消、改价、改数量、Dashboard 支付、文件上传、设计审批或物流 API 同步。
- 不把 FC 订单与 Shopify 消费者订单合并。
- 不增加生产环境 mock 或假订单回退。

## 1. 方案选择

### 推荐：独立订单 API + service 聚合

- `GET /api/fc-orders`
- `GET /api/fc-orders/active-summary`
- `GET /api/fc-orders/:orderId`

优点：与现有 Dashboard 指标接口隔离；列表、详情和摘要各自可缓存、测试和失败降级；最符合 PRD。

### 未采用：扩展 `/api/brand-dashboard`

会把 FC 履约错误与收入看板绑定，违反“摘要失败不得影响 Dashboard 其他数据”。

### 未采用：用一个大型 SQL View/RPC 返回完整页面

会把状态、付款优先级、旧订单兼容和敏感字段过滤固化在数据库层，当前项目又主要采用 repository/service 分层，测试和迭代成本更高。

## 2. 数据契约与业务规则

### 2.1 履约状态

数据库状态固定为：

`payment_pending`、`order_confirmed`、`awaiting_brand_inputs`、
`design_in_progress`、`awaiting_design_approval`、`design_approved`、
`production`、`quality_check`、`ready_to_ship`、`shipped`、`delivered`、
`distribution_planning`、`distributing`、`completed`、`on_hold`、`cancelled`。

五个页面阶段：

1. `order_placed`
2. `payment_confirmed`
3. `design_production`
4. `shipped`
5. `delivered`

规则：

- `on_hold` 使用 `last_active_status` 映射阶段，并额外显示 `hold_reason`。
- `cancelled` 不显示正在继续的正常进度，显示取消状态和 `cancel_reason`。
- `delivered` 即进入 Completed。
- 内部 `distribution_planning`、`distributing`、`completed` 在品牌端统一映射为 `delivered`。
- Active = 尚未送达且非 `cancelled`。
- Completed = 已送达品牌方。
- All = 当前品牌全部订单，包括 cancelled。
- 状态色只作辅助，始终同时显示英文状态文字。

### 2.2 付款状态

服务层集中实现 `resolvePaymentStatus`，不能仅看履约状态：

1. `payment.status = 1`、`payment.payment_time`、`order.payment_time` 或
   `finance_handoff.status = paid` 任一给出成功证据时，返回 `paid`。
2. 没有成功证据时，`finance_handoff.status = payment_pending` 或
   `order.status = 0` 返回 `pending`。
3. 无法可靠判断时返回 `unknown`，页面显示 `Payment status unavailable`，
   不能误报 Paid。
4. 如果将来确认更多 `order.status/payment.status` 数字含义，只在该函数和测试中扩展。
5. 已付款证据存在时，履约 fallback 不得为 `payment_pending`。

### 2.3 旧订单兼容

- 无履约记录且未付款：派生为 `payment_pending`。
- 无履约记录且已付款：派生为 `order_confirmed`。
- 不因缺少履约记录隐藏订单。
- 物流和送达前待办显示明确空状态。
- 在上线前制作一次“旧订单履约状态清单”，由 FC 运营确认已经实际完成的旧订单并补写
  `delivered_at`；否则历史已付订单会被视作 Active。
- 不批量创建假事件；详情可从 `order.created_at`、`payment_time`、
  `shipped_at`、`delivered_at` 派生基础事件，且与真实事件按事件类型去重。

### 2.4 金额与商品

- 列表和头部的总额只读 `order.total_amount`。
- Subtotal、Discount、Shipping、Total 均读取订单和订单项快照。
- Discount 读取 `order_item.item_type = discount` 行，不根据当前价格计算。
- Product/Package 优先使用订单商品快照 `order_item.item_name`；
  列表主名称可回退到 `magnet_pricing_plan.name`，再回退到 `FC order`。
- 所有金额由订单 `currency` 格式化；不复用当前只支持 `$` 的 `FCFmt.fmtMoney`。
- 数值用 `Intl.NumberFormat` 和 `tabular-nums`；数据库 numeric 在 service 中安全转为 number。
- Invoice Number 从新履约字段读取；没有时整行不展示，不拿 `payment_no` 冒充。

### 2.5 日期、地址与链接

- API 传 ISO 时间，浏览器按用户本地时区格式化。
- 预计送达开始和结束相同则显示单日，不同则显示日期范围。
- 地址 API 只返回：
  `recipientName`、`street`、`addressLine2`、`city`、`state`、
  `postalCode`、`country`、`formattedAddress`。
- 不返回电话、邮箱、place ID、validation metadata。
- Tracking Number 为空时不渲染占位行。
- Tracking URL 必须可被 `new URL()` 解析、协议为 `https:`、无用户名密码；
  域名通过服务端可维护的承运商白名单校验后才返回。
- 外部链接使用 `target="_blank"` 和 `rel="noopener noreferrer"`。

## 3. 分步实施计划

### Task 1：冻结数据库与 API 契约

**Files:**

- Create: `src/services/fc-order.types.ts`
- Create: `tests/fc-orders/fc-order-status.test.ts`

**Steps:**

1. 定义履约状态、页面阶段、付款状态、发放状态、发放方式和 actor type 的联合类型。
2. 定义列表、详情、摘要 API 的响应类型；响应中不出现敏感数据库字段。
3. 先为全部 16 个履约状态写状态映射失败测试。
4. 写 `on_hold`、`cancelled`、付款证据优先级和未知付款状态测试。
5. 实现最小状态/付款映射函数并让测试通过。
6. 验证：`npx vitest run tests/fc-orders/fc-order-status.test.ts`。

**Done when:** 状态表、筛选分类和付款优先级都有唯一代码入口及自动化测试。

### Task 2：新增履约数据库 migration

**Files:**

- Create: `supabase/migrations/<CLI-generated-timestamp>_fc_order_fulfillment.sql`

**Steps:**

1. 用 `supabase migration new fc_order_fulfillment` 生成迁移文件，不手写时间戳。
2. 创建 `public.fc_order_fulfillment`，主键使用 `bigint generated by default as identity`。
3. `order_id bigint not null unique` 外键到 `public."order"(id)`。
4. `customer_id bigint not null` 外键到 `public.customer(id)`。
5. 加入 PRD 字段以及 `last_active_status`、`cancel_reason`、`invoice_number`。
6. 对 status、last_active_status、distribution_status、distribution_method、
   actor type 建 CHECK 约束。
7. 对数量建非负及 `distributed_quantity <= planned_quantity` 约束。
8. 对预计到达范围建 `end >= start` 约束。
9. 对 `tracking_url` 建 `NULL 或 https://` 的数据库基础约束；
   完整可信域名校验仍在 service 层执行。
10. 创建 `public.fc_order_fulfillment_event`：
    `id`、`order_id`、`customer_id`、`event_type`、`title`、`description`、
    `actor_type`、`occurred_at`、`created_at`。
11. 创建索引：
    - fulfillment `(customer_id, status, updated_at desc)`
    - event `(customer_id, order_id, occurred_at desc)`
12. 添加自动更新 `updated_at` 的触发器，复用现有函数时先确认签名。
13. 新表启用 RLS；撤销 `anon/authenticated` 访问，仅显式授予 service-role 所需权限。
14. 在开发分支/本地数据库应用迁移，检查表、约束、索引和权限。
15. 运行 Supabase security/performance advisors，不直接改动无关旧表。

**Done when:** 两张新表能保存所有 PRD 展示信息，跨订单/客户关系和数值约束均由数据库保护。

### Task 3：实现只取必要字段的 repository

**Files:**

- Create: `src/repositories/fc-order.repo.ts`
- Create: `tests/fc-orders/fc-order.repo.test.ts`

**Steps:**

1. 为订单、商品、付款、地址、finance handoff、履约和事件定义最小 Row 类型。
2. 实现品牌订单列表查询，首个条件即 `.eq("customer_id", customerId)`。
3. 实现详情查询，同时约束 `.eq("id", orderId)` 和 `.eq("customer_id", customerId)`。
4. 关联表查询只使用已验证属于当前品牌的 order ID。
5. 地址查询同时约束 address ID 和当前 `customer_id`。
6. finance handoff 只 select `order_id/status/updated_at`，不 select token、邮件、
   message 或 Stripe Session ID。
7. payment 不 select `callback_data`、failure_reason 或不需要的交易敏感字段。
8. 事件按 `occurred_at` 排序，列表按组合后的更新时间由 service 排序。
9. 用 mock Supabase query builder 写 repository 测试，断言详情查询同时包含订单 ID 和 customer ID。
10. 验证：`npx vitest run tests/fc-orders/fc-order.repo.test.ts`。

**Done when:** repository 无法在缺少租户条件的情况下获取详情，且敏感字段根本不进入 service。

### Task 4：实现 service 聚合、兼容和数据一致性

**Files:**

- Create: `src/services/fc-order.service.ts`
- Create: `tests/fc-orders/fc-order.service.test.ts`

**Steps:**

1. 实现 `listFcOrders(customerId, filter)`。
2. 实现 `getFcOrderDetail(customerId, orderId)`。
3. 实现 `getActiveFcOrderSummary(customerId)`。
4. 实现缺履约记录的 fallback 状态。
5. 实现付款状态优先级和“Paid 不得显示 payment_pending”修正。
6. 实现 current stage、完成阶段、当前阶段和未来阶段结构。
7. `on_hold` 用 `last_active_status`，缺失时从最近事件推断，再回退到付款阶段。
8. 实现 shipment 状态派生：
   delivered_at > shipped_at > tracking number > not shipped。
9. 如果 `delivered_at` 存在，将展示状态至少提升为 delivered，但不静默修改数据库。
10. 不在品牌详情响应中返回 Distribution 或 Activity timeline；内部字段继续保留。
11. 合并真实事件和基础派生事件，去重后按时间排序。
12. 计算 `updatedAt = order/fulfillment/latest event` 的最大时间。
13. Active 列表默认按 `updatedAt desc`，Completed/All 同样按最近更新排序。
14. 摘要返回最近更新的一笔 Active 和 `activeCount`。
15. 实现 tracking URL 后端校验。
16. 确保响应不含 `customerId`、内部 remark、token、Stripe secret/session、callback data。
17. 覆盖 15 个 PRD 测试场景中的数据聚合、fallback、hold、cancelled、物流、送达终点、历史状态归一和多订单场景。
18. 验证：`npx vitest run tests/fc-orders/fc-order.service.test.ts`。

**Done when:** 列表、详情和摘要来自同一套业务规则，旧订单及矛盾数据不会导致误导性展示。

### Task 5：实现 API、认证、404 和路由

**Files:**

- Create: `src/api/fc-orders.ts`
- Create: `tests/fc-orders/fc-orders.api.test.ts`
- Modify: `src/index.ts`

**Steps:**

1. `GET /api/fc-orders?status=active|completed|all`，缺省 active。
2. 非法 status 返回 400。
3. `GET /api/fc-orders/active-summary`。
4. `GET /api/fc-orders/:orderId`，只接受正整数 bigint 格式。
5. 三个 handler 都先调用 `getRequestCustomerId`。
6. 未登录返回 401。
7. 详情不存在或属于其他品牌统一返回 404，不区分原因。
8. 在 `src/index.ts` 中先匹配静态的 `active-summary`，再匹配动态 order ID。
9. API 错误使用统一 JSON `{ error }`；生产响应不回传数据库内部信息。
10. API 测试 mock session 和 service，断言前端提供的 `customerId` 查询参数被忽略。
11. 增加同 ID/不同 customer 的 404 测试。
12. 验证：`npx vitest run tests/fc-orders/fc-orders.api.test.ts`。

**Done when:** 三个 API 都只读取真实登录品牌，跨品牌订单与不存在订单表现完全一致。

### Task 6：接入静态页面路由和脚本

**Files:**

- Modify: `src/api/serve-static.ts`
- Modify: `src/dashboard/admin.html`
- Create: `src/dashboard/components/orders-delivery.jsx`

**Steps:**

1. 让 `/orders-delivery` 刷新时返回 `admin.html`。
2. 在 `admin.jsx` 前加载 `orders-delivery.jsx`，保证全局组件已定义。
3. 给脚本和 CSS 更新缓存版本参数。
4. 验证直接访问和刷新 `/orders-delivery?order=<id>` 均不返回 404。

**Done when:** 深链接、刷新和直接粘贴 URL 都能进入订单页。

### Task 7：接入侧边栏、页面状态与浏览器历史

**Files:**

- Modify: `src/dashboard/components/shared.jsx`
- Modify: `src/dashboard/components/admin.jsx`

**Steps:**

1. 增加订单/包裹导航图标。
2. 新增 `ORDERS_DELIVERY_SECTION`，插入 `ALL_SECTIONS`。
3. Overview 顺序固定为 Dashboard → Orders & Delivery → Brand Info。
4. `parseSection()` 识别 `/orders-delivery`。
5. `handleSectionChange()` 进入 `/orders-delivery`，不携带 Brand Config 查询参数。
6. 渲染 `<OrdersDeliveryPage />`。
7. 监听 `popstate`，确保浏览器前进/后退能同步页面与订单详情。
8. 订单行点击使用 `history.pushState` 写入 `?order=<id>`。
9. `All orders` 移除 order 参数并回到列表；桌面仍保留列表列。
10. 可选导航状态点只在已有摘要且实现不增加额外请求时添加；否则按 MVP 不实现 Badge。

**Done when:** 导航位置、刷新、深链接和浏览器返回行为全部符合预期。

### Task 8：实现订单列表、筛选和页面级状态

**Files:**

- Modify: `src/dashboard/components/orders-delivery.jsx`
- Modify: `src/dashboard/styles/styles.css`

**Steps:**

1. 页面标题使用 PRD 英文文案，不添加创建订单按钮。
2. 实现 Active / Completed / All 三个筛选，默认 Active。
3. 切换筛选只刷新列表；桌面详情区保持稳定或选择该筛选下最近更新订单。
4. 列表行展示订单号、产品/套餐、数量、总额、阶段、更新时间和文字状态。
5. 整行可点击，最小高度 44px，不增加重复 View 按钮。
6. 默认选择最近更新的 Active 订单。
7. 深链接到 Completed/Cancelled 订单时，加载详情并自动使用能包含该订单的筛选视图。
8. 实现：
   - 首次 Loading：复用 `PageLoading`
   - 列表切换 Loading：保留页面框架
   - 无任何订单
   - 无 Active，带 View completed orders
   - 请求错误 + Retry
9. 列表错误和详情错误分开；详情失败不能清空已加载列表。

**Done when:** 三个筛选、默认选择、空状态、重试和深链接均可独立验证。

### Task 9：实现订单详情全部区域

**Files:**

- Modify: `src/dashboard/components/orders-delivery.jsx`
- Modify: `src/dashboard/styles/styles.css`

**Steps:**

1. 订单头部：订单号、状态、日期、更新时间、套餐、数量、总额、付款。
2. 五阶段进度，以 Delivered 结束：
   - 桌面横向
   - 手机纵向
   - 完成日期、当前高亮、未来弱化
   - on hold 原因
   - cancelled 说明
3. Current action 固定在进度后、Order summary 前：
   - Action required + 标题/说明/due date
   - No action needed + 当前说明
4. Shipping tracking：
   - 不展示独立 Shipment 区域、状态、承运商或预计送达占位信息
   - Shipping address 下方存在可信 URL 时显示 Track shipment 外链；没有链接时显示 `Tracking information isn’t available yet. We’ll display it here as soon as it’s updated.`
5. Order summary：
   - package、每个商品快照、unit price、quantity、subtotal
   - discount、shipping、total、currency
   - payment method/time、invoice number（存在时）
6. 不展示 Distribution 或 Activity timeline。
7. 所有条件缺失时不渲染空横杠，改用 PRD 指定空状态或隐藏可选行。

**Done when:** PRD 8.1–8.7 每个字段和状态都有明确渲染路径。

### Task 10：增加 Dashboard Active FC Order 摘要

**Files:**

- Modify: `src/dashboard/components/brand-dashboard.jsx`
- Modify: `src/dashboard/styles/styles.css`
- Modify: `tests/fc-orders/fc-order.service.test.ts`

**Steps:**

1. Dashboard 单独请求 `/api/fc-orders/active-summary`，不修改 `/api/brand-dashboard`。
2. 在页面标题后、Revenue Overview 前显示最近更新的一笔 Active。
3. 展示订单号、产品/套餐、数量、金额、付款、阶段、预计送达和当前 action。
4. 整个主摘要可进入对应订单详情。
5. 多笔 Active 显示 `View all N active orders` 并进入列表。
6. 无 Active 时不渲染区域。
7. 摘要请求失败时静默省略摘要，现有 Dashboard loading/error/data 完全不受影响。
8. Dashboard 没有 Shopify 活动或未连接 Shopify 时，Active FC Order 仍应按订单事实独立显示；
   收入模块继续保持原有空状态。

**Done when:** 摘要是独立、可点击、可降级的首页入口。

### Task 11：响应式、无障碍和视觉细节

**Files:**

- Modify: `src/dashboard/styles/styles.css`
- Modify: `src/dashboard/components/orders-delivery.jsx`

**Steps:**

1. 桌面与手机都使用独立列表页和独立详情页，不同时展示。
2. 365–430px 手机先显示列表，点击后只显示详情，并提供 All orders 返回。
3. 所有视口禁止列表与详情双栏和页面级横向滚动。
4. 手机进度改为纵向，订单明细改为 label/value 行。
5. 页面用扁平分组、留白和排版层级，不使用分隔线或嵌套卡片。
6. 点击区域至少 44px；键盘 focus 可见。
7. 状态筛选使用原生 select，默认 Active；进度使用有语义的 ordered list。
8. 复制 Tracking Number 失败时提供可见但不阻塞页面的提示。
9. 色彩对比、状态文字、长订单号/地址/Tracking Number 换行均验证。
10. 验证 390px、430px、桌面视口，不依赖 hover 展示任何必要信息。

**Done when:** 390px 下 `document.documentElement.scrollWidth === clientWidth`，桌面与手机交互都可完成。

### Task 12：测试数据矩阵与端到端验收

**Files:**

- Create: `tests/fc-orders/fixtures.ts`
- Modify: `tests/fc-orders/*.test.ts`

**Steps:**

1. 建立 15 个 PRD 场景 fixture：
   无订单、未付款、已付款未生产、待确认设计、生产中、已发货、
   已送达、历史发放状态归一、on hold、cancelled、多订单、跨租户、
   无 fulfillment 旧订单、摘要 API 失败。
2. 对列表筛选和默认排序做表驱动测试。
3. 对每个后端状态到五阶段映射做表驱动测试。
4. 对金额快照、discount item、不同 currency 做测试。
5. 对敏感字段不出现在序列化响应做测试。
6. 对 tracking `http:`、`javascript:`、带凭据 URL 和非白名单域名做拒绝测试。
7. 对 delivery end < start 等非法数据确认数据库或 service 拒绝；内部发放约束只在数据库层验证。
8. 启动本地项目，用真实登录会话进行 API 冒烟测试。
9. 浏览器检查所有页面状态和深链接。

**Done when:** PRD 第 17 节 15 个场景都有自动化或明确的浏览器验收记录。

### Task 13：完整质量门禁

**Files:** No new files unless修复本功能问题。

**Steps:**

1. `npm run typecheck`，预期 0 error。
2. `npm run build`，预期成功生成可启动产物。
3. `npm test`，新增测试必须全部通过；既有 2 个失败单独记录或在独立范围修复。
4. `git diff --check`，预期无空白错误。
5. 检查 API：
   - 未登录 401
   - 其他品牌订单 404
   - 非法 filter/id 400
   - 敏感字段不存在
6. 检查数据库 advisors 和新表 RLS/GRANT。
7. 检查桌面、390px 手机截图。
8. 检查 Dashboard 摘要 API 断开时现有数据仍正常。
9. 检查刷新、前进、后退、复制 Tracking、外链新标签。

**Done when:** PRD 第 16 节所有复选项均有通过证据。

### Task 14：上线顺序与运营准备

**Files:**

- Create: `docs/Orders & Delivery 运营数据说明.md`

**Steps:**

1. 先部署数据库 migration。
2. 确认 service-role 对新表可访问，anon/authenticated 无直接访问。
3. 由运营补齐已有订单的真实履约状态，尤其是已完成旧订单。
4. 记录内部更新字段说明：
   状态流转、hold/cancel 原因、待办、物流、预计送达，以及内部发放数量和事件。
5. 再部署后端 API。
6. API 冒烟通过后部署前端导航、订单页和 Dashboard 摘要。
7. 观察 401/404/5xx、慢查询和摘要失败率。
8. 如需回退，先回退前端入口和 API；保留新增表及数据，不做破坏性删表。

**Done when:** 新功能上线不依赖假数据，旧订单不会被错误标为进行中，且可安全回退。

## 4. 需求追踪矩阵

| PRD 范围 | 实施任务 | 验证 |
| --- | --- | --- |
| 3 MVP/非 MVP | Tasks 0、14 | 范围审查、无写操作入口 |
| 4 导航与路由 | Tasks 6、7 | 直接访问、刷新、前进后退 |
| 5 Dashboard 摘要 | Task 10 | 独立失败注入 |
| 6 页面布局 | Tasks 8、11 | 桌面 + 390px |
| 7 订单列表 | Task 8 | filter/sort/empty 测试 |
| 8.1 订单头 | Task 9 | 详情场景 |
| 8.2 履约进度 | Tasks 1、4、9 | 16 状态映射测试 |
| 8.3 Current action | Tasks 2、9 | 有/无待办、due date |
| 8.4 Shipment | Tasks 2、4、9 | 未发货/已发货/已送达 |
| 8.5 Order summary | Tasks 3、4、9 | 快照、discount、currency |
| 9 状态模型 | Tasks 1、2、4 | 表驱动测试 |
| 10 数据库 | Task 2 | migration、约束、advisor |
| 11 API/安全 | Tasks 3、5 | 401/404/跨租户/敏感字段 |
| 12 前端接入 | Tasks 6–10 | 页面功能验收 |
| 13 页面状态 | Task 8 | Loading/Empty/Error/Retry |
| 14 视觉交互 | Tasks 9、11 | 复制、外链、无横滚、44px |
| 15 一致性 | Tasks 2、4 | service + DB constraint |
| 16 验收标准 | Tasks 12、13 | 完整验收清单 |
| 17 测试场景 | Task 12 | 15 场景矩阵 |
| 18 实施顺序 | Tasks 0–14 | 依赖顺序一致 |

## 5. 已发现的安全风险（不在本功能内自动修复）

Supabase 当前安全检查显示：包括 `customer`、`order`、`order_item`、`payment`、
`shipping_address` 在内的 75 张 public 表未启用 RLS，并可能对 Data API 的
`anon/authenticated` 角色暴露。这是现有全局安全问题。

本功能的处理方式：

- 新建的两张履约表必须从第一天启用 RLS，并采用最小 GRANT。
- API 始终使用 Session customer ID + 服务端 customer 条件。
- 不在本功能 migration 中批量给旧表启用 RLS，因为没有配套 policy 时会破坏
  Pre-meeting Proposal 和现有服务。
- 应另开安全整改任务，先盘点每张旧表的调用方和所需 policy，再分批启用；
  未经确认不执行 Supabase advisor 提供的批量修复 SQL。

## 6. 实施完成定义

只有同时满足以下条件才算完成：

- 所有 PRD 页面、字段、状态、空态和 15 个测试场景均被覆盖。
- 订单读取始终来自真实登录品牌，不存在跨租户泄露。
- 新表具备约束、索引、RLS 和最小权限。
- Dashboard 摘要失败不影响现有 Dashboard。
- 390px 无横向滚动，桌面和手机的列表→详情独立页面流程均可用。
- typecheck、build、新增测试和浏览器验收通过。
- 已有工作区改动完整保留。
- 没有修改订单价格计算，没有复制订单，没有生产 mock。
