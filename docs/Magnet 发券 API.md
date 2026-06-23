# Magnet 发券 API

面向 magnet 扫码场景的券活动查询与实时发券。

### 服务地址

| 环境 | Base URL | 说明 |
|------|----------|------|
| 本地 | `http://localhost:8081` | 本机调试 |
| 开发 | `https://perversive-latia-coevally.ngrok-free.dev` | 联调、外网可达，**仅限非生产** |
| 生产 | 内网地址（由运维提供） | **必须通过内网调用**，禁止走公网或 ngrok |

> **重要：生产环境必须使用内网地址调用本接口。** 调用方（如 Magnet 扫码服务、内部网关）应部署在与 Dashboard 同一 VPC / 内网中，通过内网 DNS 或私有 IP 访问，不得将接口暴露到公网，也不得使用 ngrok 等隧道地址。开发环境的 ngrok 地址仅用于联调，禁止用于生产流量。

下文路径均相对于 Base URL，例如开发环境查可用活动：`https://perversive-latia-coevally.ngrok-free.dev/api/coupon-campaigns/available?magnet_id=2202`。

## 鉴权

以下 **M2M 接口** 需在请求头携带 API 密钥（服务端环境变量 `API_KEY`）：

| Header | 示例 |
|--------|------|
| `X-API-Key` | `X-API-Key: your-secret-key` |
| `Authorization` | `Authorization: Bearer your-secret-key` |

生产环境必须配置 `API_KEY`，未携带或密钥错误返回 `401`。

> Dashboard 管理接口与消费者页面接口使用 Session Cookie 鉴权，**不需要** API Key。

## 推荐流程

```
1. GET  /api/coupon-campaigns/available?magnet_id=xxx   → 查可用活动，收集 campaignId
2. POST /api/coupons/realtime-single                    → 传入 campaign_id（单张）或 campaign_ids（批量）发券
```

---

## 1. 查询可用券活动

根据 `magnet_id` 找到用户所属 Klaviyo 分群，再按分群减免配置筛选可发的 `fc_coupon_campaign`。

### 请求

```
GET /api/coupon-campaigns/available?magnet_id={magnet_id}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `magnet_id` | number | 是 | magnet 主键 |

### 成功响应 `200`

```json
{
  "fcUserId": "01KTP1G7DGX471G1HCEDXWMZKJ",
  "campaigns": [
    {
      "campaignId": "cdcf8af5-bb03-4fdc-aefd-11e8dbdc3b3f",
      "campaignKey": "876876",
      "name": "test",
      "discountType": "percentage",
      "value": 80,
      "currencyCode": null,
      "status": "active",
      "restrictions": {
        "minPurchaseAmount": null,
        "startsAt": "2026-06-10T11:27:53.993+00:00",
        "endsAt": null,
        "distributionMode": "unique_pool",
        "oncePerCustomer": true,
        "shopifyUsageLimit": null,
        "discountTarget": "order",
        "buyQuantity": null,
        "getQuantity": null
      },
      "matchedSegments": [
        {
          "segmentId": "RPVy58",
          "name": "Engaged (30 Days)",
          "minDiscountRatio": 0.7,
          "maxDiscountRatio": 0.9,
          "priority": 0
        }
      ]
    }
  ]
}
```

### `campaigns[]` 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `campaignId` | string | 活动 ID，发券时传入 `campaign_id`（单张）或 `campaign_ids`（批量） |
| `campaignKey` | string | 业务键 |
| `name` | string | 活动展示名 |
| `discountType` | string | 折扣类型：`percentage` / `fixed_amount` / `free_shipping` / `buy_x_get_y` |
| `value` | number \| null | 折扣值（百分比或金额；买 X 送 Y 为赠送商品折扣百分比） |
| `currencyCode` | string \| null | 固定金额折扣币种 |
| `status` | string | 活动状态 |
| `restrictions` | object | 折扣限制规则，见下表 |
| `matchedSegments` | array | 命中的 Klaviyo 分群及减免区间 |

### `restrictions` 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `minPurchaseAmount` | number \| null | 最低消费金额门槛（`buy_x_get_y` 不适用） |
| `minPurchaseQuantity` | number \| null | 最低购买件数门槛（满 N 件可用） |
| `startsAt` / `endsAt` | string \| null | 活动有效期 |
| `distributionMode` | `"unique_pool"` \| `"shared_code"` | 发券模式：一人一码券池 / 共享码 |
| `oncePerCustomer` | boolean | Shopify 每位客户是否限用一次 |
| `shopifyUsageLimit` | number \| null | Shopify 折扣总使用次数上限，`null` 表示不限 |
| `discountTarget` | `"product"` \| `"order"` \| null | 金额减免作用范围（仅 `percentage` / `fixed_amount`） |
| `buyQuantity` | number \| null | 买 X 送 Y：购买数量（仅 `buy_x_get_y`） |
| `getQuantity` | number \| null | 买 X 送 Y：赠送数量（仅 `buy_x_get_y`） |
| `getDiscountPercent` | number \| null | 买 X 送 Y：赠送商品折扣百分比（`100` = 免费，仅 `buy_x_get_y`） |
| `combinesWith` | object \| null | 是否可与其它折扣叠加，见下表 |
| `shippingDestination` | object \| null | 免运费适用国家/地区（仅 `free_shipping`） |
| `maximumShippingPrice` | object \| null | 免运费适用的运费上限（仅 `free_shipping`） |

### `combinesWith` 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `productDiscounts` | boolean | 可与产品折扣同享 |
| `orderDiscounts` | boolean | 可与订单折扣同享 |
| `shippingDiscounts` | boolean | 可与运费折扣同享 |

### `free_shipping`（免运费）示例

以下是一条真实的免运费活动返回，便于对照各字段含义：

```json
{
  "name": "test_20 (2026-06-22 06:42)",
  "value": null,
  "status": "active",
  "campaignId": "3e7fa859-1772-42f4-9b08-7b9ad351ccb6",
  "campaignKey": "shopify_1282719383599",
  "currencyCode": null,
  "discountType": "free_shipping",
  "restrictions": {
    "endsAt": null,
    "startsAt": "2026-06-22T06:42:10+00:00",
    "buyQuantity": null,
    "getQuantity": null,
    "combinesWith": {
      "orderDiscounts": false,
      "productDiscounts": false,
      "shippingDiscounts": false
    },
    "discountTarget": null,
    "oncePerCustomer": true,
    "distributionMode": "unique_pool",
    "minPurchaseAmount": null,
    "minPurchaseQuantity": null,
    "shopifyUsageLimit": 1,
    "getDiscountPercent": null,
    "shippingDestination": {
      "mode": "all",
      "countries": null,
      "includeRestOfWorld": null
    },
    "maximumShippingPrice": {
      "amount": 20,
      "currencyCode": "USD"
    }
  },
  "matchedSegments": [
    {
      "name": "Engaged (60 Days)",
      "priority": 2,
      "segmentId": "VqMj66",
      "maxDiscountRatio": 1,
      "minDiscountRatio": 0
    }
  ]
}
```

#### 顶层字段（`free_shipping`）

| 字段 | 示例值 | 说明 |
|------|--------|------|
| `campaignId` | `"3e7fa859-…"` | 活动 ID，发券时传入 `campaign_id` 或 `campaign_ids` |
| `campaignKey` | `"shopify_1282719383599"` | 业务键；从 Shopify 同步的活动以 `shopify_` 前缀命名 |
| `name` | `"test_20 (2026-06-22 06:42)"` | 活动展示名（通常与 Shopify 折扣标题一致） |
| `discountType` | `"free_shipping"` | 固定为免运费 |
| `value` | `null` | 免运费无「折扣数值」，恒为 `null` |
| `currencyCode` | `null` | 不适用（仅 `fixed_amount` 有币种） |
| `status` | `"active"` | 活动状态，可用列表中均为 `active` |
| `matchedSegments` | array | 命中该用户的 Klaviyo 分群及优先级，见下文 |

#### `restrictions` 字段（`free_shipping`）

| 字段 | 示例值 | 说明 |
|------|--------|------|
| `startsAt` | `"2026-06-22T06:42:10+00:00"` | 活动开始时间；此时间之前不可用 |
| `endsAt` | `null` | 活动结束时间；`null` 表示未设置结束日期 |
| `minPurchaseAmount` | `null` | 最低消费**金额**门槛；`null` 表示无金额门槛。若有值（如 `50`），订单小计须达到该金额才可免邮 |
| `minPurchaseQuantity` | `null` | 最低购买**件数**门槛；`null` 表示无件数门槛。若有值（如 `3`），须购买至少 3 件才可免邮 |
| `oncePerCustomer` | `true` | 每位 Shopify 客户是否限用一次；`true` = 每人只能用一次 |
| `shopifyUsageLimit` | `1` | Shopify 使用次数上限，语义取决于 `distributionMode`（见下表） |
| `distributionMode` | `"unique_pool"` | 发券模式：`unique_pool` 一人一码券池；`shared_code` 多人共用同一码 |
| `combinesWith` | object | 是否可与其它类型折扣叠加；见下表 |
| `discountTarget` | `null` | 不适用（仅 `percentage` / `fixed_amount`） |
| `buyQuantity` | `null` | 不适用（仅 `buy_x_get_y`） |
| `getQuantity` | `null` | 不适用（仅 `buy_x_get_y`） |
| `getDiscountPercent` | `null` | 不适用（仅 `buy_x_get_y`） |
| `shippingDestination` | object | 适用国家/地区（本例为所有国家/地区），见下表 |
| `maximumShippingPrice` | object | 运费金额上限（本例为 $20），见下表 |

#### `shippingDestination`（国家/地区）

对应 Shopify 后台 **「国家/地区」** 配置。

| 字段 | 类型 | 说明 |
|------|------|------|
| `mode` | `"all"` \| `"countries"` | `all` = 所有国家/地区；`countries` = 选定国家/地区 |
| `countries` | string[] \| null | `mode=countries` 时为 ISO 3166-1 alpha-2 国家码列表（如 `["US","CA"]`）；`mode=all` 时为 `null` |
| `includeRestOfWorld` | boolean \| null | `mode=countries` 时是否包含「其余国家/地区」；`mode=all` 时为 `null` |

| `mode` | 含义 | Shopify 后台对应 |
|------|------|------------------|
| `all` | 所有国家/地区均可免邮 | 所有国家/地区 |
| `countries` | 仅列表内国家免邮 | 选定国家/地区 |

上例 `mode: "all"` 表示 **所有国家/地区** 均可使用该免运费码。

选定国家示例：

```json
"shippingDestination": {
  "mode": "countries",
  "countries": ["US", "CA"],
  "includeRestOfWorld": false
}
```

#### `maximumShippingPrice`（运费金额上限）

对应 Shopify 后台 **「运费 → 排除超过特定金额的运费」**。

| 字段 | 类型 | 说明 |
|------|------|------|
| `amount` | number | 可免邮的**最高**运费金额（含等于） |
| `currencyCode` | string \| null | 金额币种（与店铺币种一致） |

| 值 | 含义 | Shopify 后台对应 |
|----|------|------------------|
| `null` | 对所有运费金额生效，不排除高额运费 | 未勾选「排除超过特定金额的运费」 |
| `{ "amount": 20, "currencyCode": "USD" }` | 仅运费 ≤ $20 时可免邮，超过 $20 的运费选项不适用 | 排除超过 $20 的运费 |

上例 `maximumShippingPrice.amount: 20` 表示 **仅运费 ≤ $20 时可免邮**；超过 $20 的运费选项不适用此码（对应 Shopify「排除超过特定金额的运费」）。

#### `shopifyUsageLimit` 与 `distributionMode`（免运费）

| `distributionMode` | `shopifyUsageLimit` 含义 | 示例解读 |
|--------------------|--------------------------|----------|
| `unique_pool` | **每个券码**各自的使用次数上限 | `1` = 每个码只能核销 1 次 |
| `shared_code` | **全站合计**使用次数上限 | `50` = 该共享码总共可用 50 次；`null` = 不限 |

上例为 `unique_pool` + `shopifyUsageLimit: 1`：从券池领取的每个免运费码，在 Shopify 侧各可使用 1 次。

#### `combinesWith`（免运费）

| 字段 | 示例值 | 说明 |
|------|--------|------|
| `productDiscounts` | `false` | 不可与产品折扣（如商品减价）同时使用 |
| `orderDiscounts` | `false` | 不可与订单折扣（如整单减 %）同时使用 |
| `shippingDiscounts` | `false` | 不可与其它运费折扣同时使用 |

三者均为 `false` 时，表示该免运费码在 Shopify 结账时**不可与其它折扣叠加**，需单独使用。

三者均为 `true` 时，表示可与对应类型的折扣同享（具体以 Shopify 结账引擎为准）。

#### `free_shipping` 恒为 `null` 的字段

以下字段对免运费类型**无业务含义**，接口固定返回 `null`，调用方可忽略：

- 顶层：`value`、`currencyCode`
- `restrictions`：`discountTarget`、`buyQuantity`、`getQuantity`、`getDiscountPercent`

非 `free_shipping` 类型时，`shippingDestination`、`maximumShippingPrice` 固定为 `null`。

### 匹配规则

1. `magnet_id` → `magnet`（获取 `customer_id`）
2. `magnet_id` → `fc_user_identity`（获取 `fc_user_id`）
3. `fc_user_id` → `klaviyo_profile_segment`（用户所属分群）
4. 分群 → `fc_segment_coupon_config`（`discount_type=percentage` 且 `is_active=true`）
5. campaign 须同时满足：
   - 同 `customer_id`
   - `status = active`
   - `discount_type = percentage`
   - `value / 100` 落在分群的 `min_discount_ratio ~ max_discount_ratio` 内
   - 在有效期内（`starts_at` / `ends_at`）
   - **当前仍可发券**（见下方「可发券过滤」）

**可发券过滤**：即使分群匹配成功，以下 campaign 也不会出现在列表中：

| 发券模式 | 排除条件 |
|----------|----------|
| `unique_pool`（一人一码） | 券池中没有 `available` 状态的券码 |
| `shared_code`（一码多用） | 未配置共享码，或已领取次数达到 `shopifyUsageLimit` 上限 |

共享码的领取次数按 `fc_coupon_assignment` 记录数统计，上限取自 Shopify 同步的 `shopify_usage_limit`（如 `50 total`）。`realtime-single` 发券接口复用同一套可用列表校验。

**默认 segment 回退**：以下任一情况时，使用后台 **Segment Config** 中标记为 **Default** 的分群配置（`fc_segment_coupon_config.is_default = true` 且 `is_active = true`），按其 min/max 减免区间筛选可用 campaign：

- 尚无 `fc_user_identity`（响应中 `fcUserId` 为 `null`）
- 用户未命中任何 Klaviyo 分群
- 分群匹配后没有可用 campaign

> **减免比例口径**：存的是 **% off**（减免百分比）。例如 `value=80` 表示减 80%，不是「8 折」。

### 常见错误

| HTTP | 说明 |
|------|------|
| 400 | `magnet_id` 无效，或 magnet 与 identity 不属于同一品牌 |
| 404 | magnet 不存在 |
| 500 | 服务内部错误 |

### `campaigns` 为空时

表示未命中分群且品牌 **未配置默认 segment**，或默认 segment 的减免区间内没有可用 campaign，或匹配到的 campaign **当前均不可发券**（券池已空或共享码已达领取上限）。

---

## 2. 实时发券

为 magnet 用户按活动创建折扣码，并写入 Shopify + 本地库。支持**单张发券**与**批量发券**两种模式，共用同一接口路径。

### 请求模式

| 模式 | 请求字段 | 响应结构 | 说明 |
|------|----------|----------|------|
| 单张发券 | `campaign_id` | 单个对象 | 向后兼容旧客户端 |
| 批量发券 | `campaign_ids` | `{ "coupons": [...] }` | 一次请求为同一用户发放多张券 |

> 若请求体中同时出现 `campaign_id` 与 `campaign_ids`，**以 `campaign_ids` 为准**（`campaign_id` 被忽略）。

### 请求

```
POST /api/coupons/realtime-single
Content-Type: application/json
```

**单张发券：**

```json
{
  "magnet_id": 2202,
  "campaign_id": "cdcf8af5-bb03-4fdc-aefd-11e8dbdc3b3f"
}
```

**批量发券：**

```json
{
  "magnet_id": 2202,
  "campaign_ids": [
    "cdcf8af5-bb03-4fdc-aefd-11e8dbdc3b3f",
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `magnet_id` | number | 是 | magnet 主键 |
| `campaign_id` | string | 二选一 | 单个活动 ID，来自「查询可用券活动」返回的 `campaignId` |
| `campaign_ids` | string[] | 二选一 | 多个活动 ID；至少包含 1 个非空字符串；与 `campaign_id` 互斥时优先使用本字段 |

### 成功响应 `201`

**单张发券**（使用 `campaign_id`）返回单个对象：

```json
{
  "fcUserId": "01KTP1G7DGX471G1HCEDXWMZKJ",
  "campaignKey": "876876",
  "campaignName": "test",
  "code": "876876-ABC123",
  "couponCodeId": "uuid",
  "alreadyAssigned": false,
  "codeType": "unique",
  "distributionMode": "unique_pool",
  "usageMode": "unique",
  "oncePerCustomer": true,
  "shopifyUsageLimit": null
}
```

**批量发券**（使用 `campaign_ids`）返回 `coupons` 数组，每项结构与单张响应相同，顺序与请求中的 `campaign_ids` 一致：

```json
{
  "coupons": [
    {
      "fcUserId": "01KTP1G7DGX471G1HCEDXWMZKJ",
      "campaignKey": "876876",
      "campaignName": "test",
      "code": "876876-ABC123",
      "couponCodeId": "uuid",
      "alreadyAssigned": false,
      "codeType": "unique",
      "distributionMode": "unique_pool",
      "usageMode": "unique",
      "oncePerCustomer": true,
      "shopifyUsageLimit": null
    },
    {
      "fcUserId": "01KTP1G7DGX471G1HCEDXWMZKJ",
      "campaignKey": "VIP-FS",
      "campaignName": "VIP Free Shipping",
      "code": "VIP-FS",
      "couponCodeId": "uuid",
      "alreadyAssigned": false,
      "codeType": "shared",
      "distributionMode": "shared_code",
      "usageMode": "shared",
      "oncePerCustomer": true,
      "shopifyUsageLimit": 50
    }
  ]
}
```

### 响应字段

单张模式下字段位于响应根对象；批量模式下相同字段位于 `coupons[]` 的每一项。

| 字段 | 类型 | 说明 |
|------|------|------|
| `fcUserId` | string | 用户 FC 身份 ID |
| `campaignKey` | string | 活动业务键 |
| `campaignName` | string | 活动展示名 |
| `code` | string | 本次发放的券码 |
| `couponCodeId` | string | 本地券码记录 ID |
| `alreadyAssigned` | boolean | 恒为 `false`（兼容旧客户端） |
| `codeType` | `"unique"` \| `"shared"` | 券码类型：一人一码 / 共享码 |
| `usageMode` | `"unique"` \| `"shared"` | 同 `codeType`，与 lookup 接口对齐 |
| `distributionMode` | `"unique_pool"` \| `"shared_code"` | 活动发券模式 |
| `oncePerCustomer` | boolean | Shopify 每位客户是否限用一次 |
| `shopifyUsageLimit` | number \| null | Shopify 折扣总使用次数上限，`null` 表示不限 |

`codeType` 含义：`unique` 表示一人一码（从券池分配的新码）；`shared` 表示共享码（多人可使用同一码）。`distributionMode` 表示活动级发券规则：`unique_pool` 一人一码券池；`shared_code` 共享码。共享码的总使用次数与每人使用限制以 Shopify 折扣配置为准，FC 只记录分配与核销归因。

### 批量发券行为

| 规则 | 说明 |
|------|------|
| 顺序 | 按 `campaign_ids` 数组顺序依次发券，响应 `coupons` 顺序与请求一致 |
| 去重 | 重复的 `campaign_id` 自动去重，仅发放一次 |
| 失败策略 | **fail-fast**：任一活动校验或发券失败时，立即返回错误；已成功发放的不回滚 |
| 混合类型 | 同一请求可混合 `unique_pool` 与 `shared_code` 活动 |

### 前置条件

- 品牌已启用「实时单券」发券方式
- 品牌已配置 Shopify OAuth 且 token 有效
- `campaign_id` / `campaign_ids` 中的每个 ID 均须来自当前 `magnet_id` 的可用活动列表

### 选券逻辑

1. 根据 `magnet_id` 自动解析 `fc_user_identity` 与 `fc_user_id`
2. 校验每个 `campaign_id` 在该用户可用活动列表中
3. 按请求顺序依次为每个活动发券：
   - `unique_pool`：从 `fc_coupon_code` 领取一个 `available` 的唯一券码并标记为 `assigned`
   - `shared_code`：返回已配置的共享码并写入分配记录，不消耗券码状态

### 常见错误

| HTTP | 说明 |
|------|------|
| 400 | `magnet_id` 无效、未启用实时单券、`campaign_ids` 为空数组、任一 `campaign_id` 不在可用列表 |
| 404 | magnet 不存在、任一 campaign 不存在、券池已空（`unique_pool` 无可用码） |
| 500 | Shopify 调用失败、数据写入失败等 |

---

## 3. 查询券码信息

根据券码查询折扣类型、状态、有效期。仅支持 `usageMode=unique` 的一人一码；共享码（`shared`）返回 `400`。

查询流程：

1. 先在 FC 本地库查询券码与活动信息
2. 若券码为 `shared`，直接拒绝
3. 若本地状态为 `redeemed` / `expired` / `disabled`，直接返回本地结果
4. 若本地状态为 `available` 或 `assigned`，调用 Shopify `codeDiscountNodeByCode` 查询该码的 `asyncUsageCount` 与折扣状态
5. 若 Shopify 显示已使用（`asyncUsageCount > 0`），将本地券码更新为 `redeemed`；若折扣已过期/停用，更新为 `expired` / `disabled`
6. 返回同步后的结果

### 请求

```
GET /api/coupons/lookup?code={code}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `code` | string | 是 | 券码，如 `FC-876-VTXHQM` |

### 成功响应 `200`

```json
{
  "code": "FC-876-VTXHQM",
  "discountType": "percentage",
  "value": 80,
  "currencyCode": null,
  "status": "assigned",
  "usageMode": "unique",
  "campaignName": "test",
  "campaignStatus": "active",
  "distributionMode": "unique_pool",
  "oncePerCustomer": true,
  "shopifyUsageLimit": null,
  "validity": {
    "startsAt": "2026-06-10T11:27:53.993+00:00",
    "expiresAt": null,
    "isValid": true
  }
}
```

| 字段 | 说明 |
|------|------|
| `discountType` | 券类型，见下表 |
| `status` | 券码状态，见下表 |
| `usageMode` | `unique` 一人一码；`shared` 多人共享同一码 |
| `distributionMode` | `unique_pool` 一人一码券池；`shared_code` 共享码 |
| `oncePerCustomer` | Shopify 每位客户是否限用一次 |
| `shopifyUsageLimit` | Shopify 折扣总使用次数上限，`null` 表示不限 |
| `validity.startsAt` | 活动开始时间 |
| `validity.expiresAt` | 过期时间（优先取券码 `expires_at`，否则取活动 `ends_at`） |
| `validity.isValid` | 当前是否可用（综合状态与有效期判断） |

**`discountType` 取值**

| 值 | 中文含义 |
|----|----------|
| `percentage` | 百分比减免（如 `value=15` 表示减 15%） |
| `fixed_amount` | 固定金额减免（需配合 `currencyCode`） |
| `free_shipping` | 免运费 |

**`status` 取值**

| 值 | 中文含义 |
|----|----------|
| `available` | 已生成，尚未发给用户 |
| `assigned` | 已发给用户，待使用 |
| `redeemed` | 已在 Shopify 核销使用 |
| `expired` | 已过期，不可再用 |
| `disabled` | 已作废（如发券流程失败后的预占券码） |

### 常见错误

| HTTP | 说明 |
|------|------|
| 400 | `code` 为空，或券码为共享码（`shared`） |
| 404 | 券码不存在，或 Shopify 中找不到该码 |

---

## 调用示例

以下示例使用开发环境地址；本地调试时将 `https://perversive-latia-coevally.ngrok-free.dev` 替换为 `http://localhost:8081` 即可。

```bash
BASE="https://perversive-latia-coevally.ngrok-free.dev"
API_KEY="your-secret-key"

# 1. 查可用活动
curl "$BASE/api/coupon-campaigns/available?magnet_id=2202" \
  -H "X-API-Key: $API_KEY"

# 2. 发券（单个）
curl -X POST "$BASE/api/coupons/realtime-single" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"magnet_id":2202,"campaign_id":"cdcf8af5-bb03-4fdc-aefd-11e8dbdc3b3f"}'

# 2b. 发券（批量）
curl -X POST "$BASE/api/coupons/realtime-single" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"magnet_id":2202,"campaign_ids":["cdcf8af5-bb03-4fdc-aefd-11e8dbdc3b3f","a1b2c3d4-e5f6-7890-abcd-ef1234567890"]}'

# 3. 查券码
curl "$BASE/api/coupons/lookup?code=FC-876-VTXHQM" \
  -H "X-API-Key: $API_KEY"
```
