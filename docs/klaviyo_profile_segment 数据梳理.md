# klaviyo_profile_segment 数据梳理

> 数据快照时间：2026-06-23（已更新）  
> 品牌（customer_id）：`5`  
> 当前记录数：**6 条**，涉及 **6 个用户**

## 1. 表结构与关联关系

`klaviyo_profile_segment` 记录 **FC 用户（`fc_user_id`）所属 Klaviyo 分群**，本身不直接存邮箱或 magnet 信息，需通过关联表补全。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `customer_id` | BIGINT | 品牌/租户 ID |
| `fc_user_id` | TEXT | FC 用户主键，FK → `fc_user_identity.fc_user_id` |
| `segment_id` | TEXT | Klaviyo 分群 ID，FK → `klaviyo_segment(customer_id, segment_id)` |
| `synced_at` | TIMESTAMPTZ | 最近一次从 Klaviyo 同步时间 |

**主键**：`(customer_id, fc_user_id, segment_id)` — 同一用户可属于多个分群。

### 关联路径

```
klaviyo_profile_segment
  ├─ fc_user_id ──► fc_user_identity（email、magnet_id）
  │                      └─ magnet_id ──► magnet（sn 即 magnet_sn）
  └─ segment_id ──► klaviyo_segment（name 即分群名称）
```

## 2. 全量明细表

| 分群名称 | segment_id | customer_id | 邮箱 | magnet_sn | magnet_id | fc_user_id | synced_at |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Active Repeat Customer | SZknWY | 5 | tzchao2025@gmail.com | 15VZQSHR7R | 2122 | 2d16d135-68b3-4464-909a-485fc0469b5e | 2026-06-23 09:23:10 UTC |
| First-Time Buyer | R9siM6 | 5 | mql951002@gmail.com | STSKNAH88G | 2105 | e3915a6f-3fc1-4ab6-a4ff-9e30827e5890 | 2026-06-23 08:02:58 UTC |
| New Customer Welcome | X4afz2 | 5 | peter@fridgechannels.com | PP7V5YWV6C | 2202 | 20fe50e8-9fb4-4df8-8296-4056172ecab8 | 2026-06-23 08:56:31 UTC |
| Second Order Push | VqMj66 | 5 | mark@fridgechannels.com | PJF54PV44G | 2103 | e7e29a07-d23b-4c90-bec1-37bebfb67fe8 | 2026-06-23 08:55:38 UTC |
| VIP Customers (Shopify) | UebY7w | 5 | oh.duang@gmail.com | 36WG2H6KHR | 2115 | a134be61-37a1-4135-b1a9-7f9d333751cc | 2026-06-23 09:24:04 UTC |
| Win-Back Opportunities (Shopify) | ULzLnK | 5 | gomberglambino@gmail.com | HAQ6K454KG | 3900 | f2a934e4-c89a-4957-8dfe-6380009ac354 | 2026-06-23 08:57:41 UTC |

## 3. 按分群汇总

| 分群名称 | segment_id | customer_id | 对应邮箱 | magnet_sn | magnet_id |
| --- | --- | --- | --- | --- | --- |
| Active Repeat Customer | SZknWY | 5 | tzchao2025@gmail.com | 15VZQSHR7R | 2122 |
| First-Time Buyer | R9siM6 | 5 | mql951002@gmail.com | STSKNAH88G | 2105 |
| New Customer Welcome | X4afz2 | 5 | peter@fridgechannels.com | PP7V5YWV6C | 2202 |
| Second Order Push | VqMj66 | 5 | mark@fridgechannels.com | PJF54PV44G | 2103 |
| VIP Customers (Shopify) | UebY7w | 5 | oh.duang@gmail.com | 36WG2H6KHR | 2115 |
| Win-Back Opportunities (Shopify) | ULzLnK | 5 | gomberglambino@gmail.com | HAQ6K454KG | 3900 |

## 4. 按用户 / Magnet 汇总

| 邮箱 | magnet_sn | magnet_id | customer_id | fc_user_id | 所属分群（segment_id） |
| --- | --- | --- | --- | --- | --- |
| tzchao2025@gmail.com | 15VZQSHR7R | 2122 | 5 | 2d16d135-68b3-4464-909a-485fc0469b5e | Active Repeat Customer (SZknWY) |
| mql951002@gmail.com | STSKNAH88G | 2105 | 5 | e3915a6f-3fc1-4ab6-a4ff-9e30827e5890 | First-Time Buyer (R9siM6) |
| mark@fridgechannels.com | PJF54PV44G | 2103 | 5 | e7e29a07-d23b-4c90-bec1-37bebfb67fe8 | Second Order Push (VqMj66) |
| peter@fridgechannels.com | PP7V5YWV6C | 2202 | 5 | 20fe50e8-9fb4-4df8-8296-4056172ecab8 | New Customer Welcome (X4afz2) |
| gomberglambino@gmail.com | HAQ6K454KG | 3900 | 5 | f2a934e4-c89a-4957-8dfe-6380009ac354 | Win-Back Opportunities (Shopify) (ULzLnK) |
| oh.duang@gmail.com | 36WG2H6KHR | 2115 | 5 | a134be61-37a1-4135-b1a9-7f9d333751cc | VIP Customers (Shopify) (UebY7w) |

## 5. 复现查询 SQL

```sql
SELECT
  ks.name          AS segment_name,
  kps.segment_id,
  fui.email,
  m.sn             AS magnet_sn,
  m.id             AS magnet_id,
  kps.fc_user_id,
  kps.customer_id,
  kps.synced_at
FROM klaviyo_profile_segment kps
LEFT JOIN klaviyo_segment ks
  ON ks.customer_id = kps.customer_id
 AND ks.segment_id = kps.segment_id
LEFT JOIN fc_user_identity fui
  ON fui.fc_user_id = kps.fc_user_id
 AND fui.customer_id = kps.customer_id
LEFT JOIN magnet m
  ON m.id = fui.magnet_id
ORDER BY ks.name, fui.email;
```

## 6. 备注

- `magnet_sn` 对应 `magnet` 表的 `sn` 字段；`magnet_id` 对应 `magnet.id`。
- 邮箱与 magnet 来自 `fc_user_identity`，通过 `fc_user_id` 关联；若用户尚未绑定 identity，则邮箱 / magnet 字段为空。
- 同一 `segment_id` 在 `klaviyo_segment` 中可能存在多条历史名称记录（Klaviyo 同步更新），上表取与 `klaviyo_profile_segment` 关联后匹配到的分群名称。
