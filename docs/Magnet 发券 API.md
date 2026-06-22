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
1. GET  /api/coupon-campaigns/available?magnet_id=xxx   → 查可用活动
2. POST /api/coupons/realtime-single                    → 传入 campaign_id 发券
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
      "status": "active",
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

## 2. 实时单券发券

为 magnet 用户创建一张唯一折扣码，并写入 Shopify + 本地库。

### 请求

```
POST /api/coupons/realtime-single
Content-Type: application/json
```

```json
{
  "magnet_id": 2202,
  "campaign_id": "cdcf8af5-bb03-4fdc-aefd-11e8dbdc3b3f"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `magnet_id` | number | 是 | magnet 主键 |
| `campaign_id` | string | 是 | 活动 ID，来自「查询可用券活动」返回的 `campaignId` |

### 成功响应 `201`

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

`codeType` 用于识别本次返回的券码类型：`unique` 表示一人一码（从券池分配的新码）；`shared` 表示共享码（多人可使用同一码）。`usageMode` 与 `codeType` 含义相同，保留用于与 lookup 接口对齐。`distributionMode` 表示活动级发券规则：`unique_pool` 一人一码券池；`shared_code` 共享码。共享码的总使用次数与每人使用限制以 Shopify 折扣配置为准，FC 只记录分配与核销归因。`alreadyAssigned` 字段保留为 `false`（兼容旧客户端）。

| 字段 | 类型 | 说明 |
|------|------|------|
| `codeType` | `"unique"` \| `"shared"` | 券码类型：一人一码 / 共享码 |
| `usageMode` | `"unique"` \| `"shared"` | 同 `codeType` |
| `distributionMode` | `"unique_pool"` \| `"shared_code"` | 活动发券模式 |
| `oncePerCustomer` | boolean | Shopify 每位客户是否限用一次 |
| `shopifyUsageLimit` | number \| null | Shopify 折扣总使用次数上限，`null` 表示不限 |

### 前置条件

- 品牌已启用「实时单券」发券方式
- 品牌已配置 Shopify OAuth 且 token 有效
- `campaign_id` 须来自当前 `magnet_id` 的可用活动列表

### 选券逻辑

1. 根据 `magnet_id` 自动解析 `fc_user_identity` 与 `fc_user_id`
2. 校验 `campaign_id` 在该用户可用活动列表中
3. 若活动为 `unique_pool`，从 `fc_coupon_code` 中领取一个 `available` 的唯一券码并标记为 `assigned`
4. 若活动为 `shared_code`，返回已配置的共享码并写入分配记录，不消耗券码状态

### 常见错误

| HTTP | 说明 |
|------|------|
| 400 | 参数无效、未启用实时单券、`campaign_id` 不在可用列表 |
| 404 | magnet 或 campaign 不存在 |
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

# 2. 发券
curl -X POST "$BASE/api/coupons/realtime-single" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"magnet_id":2202,"campaign_id":"cdcf8af5-bb03-4fdc-aefd-11e8dbdc3b3f"}'

# 3. 查券码
curl "$BASE/api/coupons/lookup?code=FC-876-VTXHQM" \
  -H "X-API-Key: $API_KEY"
```
