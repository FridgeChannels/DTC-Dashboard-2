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

1. `magnet_id` → `fc_user_identity`
2. `fc_user_id` → `klaviyo_profile_segment`（用户所属分群）
3. 分群 → `fc_segment_coupon_config`（`discount_type=percentage` 且 `is_active=true`）
4. campaign 须同时满足：
   - 同 `customer_id`
   - `status = active`
   - `discount_type = percentage`
   - `value / 100` 落在分群的 `min_discount_ratio ~ max_discount_ratio` 内
   - 在有效期内（`starts_at` / `ends_at`）

> **减免比例口径**：存的是 **% off**（减免百分比）。例如 `value=80` 表示减 80%，不是「8 折」。

### 常见错误

| HTTP | 说明 |
|------|------|
| 400 | `magnet_id` 无效，或 magnet 与 identity 不属于同一品牌 |
| 404 | magnet 不存在，或尚无 `fc_user_identity` |
| 500 | 服务内部错误 |

### `campaigns` 为空时

通常表示用户命中的分群 **没有配置** `fc_segment_coupon_config`，或没有 campaign 落在配置的减免区间内。请在后台 Segment Config 为对应分群配置最小/最大减免比例。

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

### 成功响应

**新建** `201`：

```json
{
  "fcUserId": "01KTP1G7DGX471G1HCEDXWMZKJ",
  "campaignKey": "876876",
  "campaignName": "test",
  "code": "876876-ABC123",
  "couponCodeId": "uuid",
  "alreadyAssigned": false
}
```

**已发过** `200`：结构相同，`alreadyAssigned: true`，返回已有 `code`。

### 前置条件

- 品牌已启用「实时单券」发券方式
- 品牌已配置 Shopify OAuth 且 token 有效
- `campaign_id` 须来自当前 `magnet_id` 的可用活动列表

### 选券逻辑

1. 根据 `magnet_id` 自动解析 `fc_user_identity` 与 `fc_user_id`
2. 校验 `campaign_id` 在该用户可用活动列表中
3. 同一用户 / 同一 magnet 对同一 campaign 重复请求，返回已有 `code`

### 常见错误

| HTTP | 说明 |
|------|------|
| 400 | 参数无效、未启用实时单券、`campaign_id` 不在可用列表 |
| 404 | magnet 或 campaign 不存在 |
| 500 | Shopify 调用失败、数据写入失败等 |

---

## 3. 查询券码信息

根据券码查询折扣类型、状态、有效期。

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
  "campaignName": "test",
  "campaignStatus": "active",
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
| 400 | `code` 为空 |
| 404 | 券码不存在 |

---

## 调用示例

以下示例使用开发环境地址；本地调试时将 `https://perversive-latia-coevally.ngrok-free.dev` 替换为 `http://localhost:8081` 即可。

```bash
BASE="https://perversive-latia-coevally.ngrok-free.dev"

# 1. 查可用活动
curl "$BASE/api/coupon-campaigns/available?magnet_id=2202"

# 2. 发券
curl -X POST "$BASE/api/coupons/realtime-single" \
  -H "Content-Type: application/json" \
  -d '{"magnet_id":2202,"campaign_id":"cdcf8af5-bb03-4fdc-aefd-11e8dbdc3b3f"}'

# 3. 查券码
curl "$BASE/api/coupons/lookup?code=FC-876-VTXHQM"
```
