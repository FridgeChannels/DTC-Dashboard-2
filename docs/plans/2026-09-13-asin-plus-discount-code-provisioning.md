# ASIN Plus：Discount Code 数据与开通更新说明

更新日：2026-09-13  
适用范围：`experience = asin_plus` 的 `/p/{sn}` Amazon 落地页

---

## 1. 目标

Amazon 落地页需要展示 **discount code（Amazon claim / promo code）**，用户可复制后在 Amazon checkout 使用。

开通工具在创建/更新账号与磁贴配置时，必须写入折扣文案与码；否则页面只有商品 CTA，没有券码块。

---

## 2. 两条数据路径（二选一）

| 路径 | 何时用 | 码存在哪 | Consumer 来源 |
|------|--------|----------|---------------|
| **A. Brand-param 轻量**（推荐给开通工具） | 不走完整 Reorder 发布，只靠 `magnet_brand_param` 出落地页 | `magnet_brand_param.discount_*` | `GET /api/reorder/consumer/{sn}` → `source=magnet_brand_param` |
| **B. Reorder 完整发布** | 控制台维护折扣目录、单次码池、多券 | `reorder_discount` + `reorder_claim_code` | 同 API，`source=reorder_publication` |

**判定顺序（现网）：**  
若 magnet 存在且 `magnet_brand_param` 已有 ASIN 产品内容（`experience=asin_plus` + `product_name` + `store_website`）→ **走路径 A**，不再读 publication。  
因此工具若用路径 A，**必须**把 discount 写在 `magnet_brand_param`，写在 `reorder_discount` 不会出现在该卡上。

---

## 3. 路径 A：数据库字段（工具必写）

表：`public.magnet_brand_param`  
Migration：`supabase/migrations/20260913170000_magnet_brand_param_discount.sql`

| 列 | 类型 | 说明 | 工具 |
|----|------|------|------|
| `discount_benefit` | text | 展示文案，如 `Save 10%` | 建议必填（有码时） |
| `discount_claim_code` | text | **Amazon group claim code**（一码多用） | **有码则必填** |
| `discount_asin` | text | 可选 ASIN；空则从 `store_website` PDP URL 解析 | 建议填 |
| `discount_ends_at` | timestamptz | 可选展示截止日期；空则长期有效 | 可选 |

**保存语义：**

- `discount_claim_code` 为空 → `availableSavings = []`，页面不展示 Code
- 有码 → consumer 返回一条 `claimCodeMode=group` 的 saving，前端 `ImmediateCouponOffer` 显示 `Code XXXX` + 复制

**SQL 示例：**

```sql
update public.magnet_brand_param
set
  experience = 'asin_plus',
  product_name = 'PURA Orange Juice',
  store_website = 'https://www.amazon.com/dp/B0FCSEA001?tag=fc-reorder-20',
  website = 'https://www.amazon.com/stores/PURA',
  product_image_url = 'https://…',
  discount_benefit = 'Save 10%',
  discount_claim_code = 'PURA10',
  discount_asin = 'B0FCSEA001',
  discount_ends_at = '2099-12-31T23:59:59Z'
where magnet_id = :magnet_id
   or upper(btrim(magnet_sn)) = upper(btrim(:sn));
```

**工具 JSON（ASIN）增量字段：**

```json
{
  "line": "asin_plus",
  "productName": "…",
  "storeWebsite": "https://www.amazon.com/dp/…",
  "website": "https://www.amazon.com/stores/…",
  "discountBenefit": "Save 10%",
  "discountClaimCode": "PURA10",
  "discountAsin": "B0FCSEA001",
  "discountEndsAt": "2099-12-31T23:59:59.000Z"
}
```

---

## 4. 路径 B：完整 Reorder 折扣表（控制台）

用于需要 **单次码池 / 多折扣 / FC Display 开关** 的品牌。

| 表 | 关键字段 |
|----|----------|
| `reorder_discount` | `discount_kind`（`amazon_promotion` / `amazon_coupon`）、`claim_code_mode`（`group` \| `single_use` \| `none`）、`group_claim_code`、`is_visible_on_fc`、起止时间、`eligible_asins` |
| `reorder_discount_product` | 折扣绑定产品 / ASIN |
| `reorder_claim_code` | `single_use` 码池（加密存储）；按 FC ID 分配 |
| `reorder_fc_unit` + publication snapshot | 卡绑定 batch / 发布快照 |

Consumer 行为摘要：

- `group` → 直接返回 `group_claim_code`
- `single_use` → `allocate_reorder_single_use_claim_code` 分配并记 `displayed`
- 仅 `is_visible_on_fc` 且通过 display 校验的折扣会下发

> 路径 B 仅当 **没有** 可渲染的 brand-param ASIN 内容时才会走到。开通工具若同时写了 brand-param 产品字段，请用路径 A 写码。

---

## 5. 端到端验收

```bash
# 1) 路由
curl -s http://localhost:8081/api/fc/experience/{SN}
# → { "experience": "asin_plus", ... }

# 2) Consumer（必须含 claimCode）
curl -s http://localhost:8081/api/reorder/consumer/{SN}
# → availableSavings[0].claimCode == 写入的码
# → showDiscounts == true
```

前端 `/p/{SN}`：

1. 仅一张 FridgeChannel logo loading（无 Amazon skeleton、无 DTC 礼包仪式）
2. Landing 出现 **Code `PURA10`**（或你写入的码）与 benefit
3. 可复制；Buy again CTA 仍指向 `store_website`

种子脚本：`supabase/scripts/fill_magnet_brand_param_15VZQSHR7R.sql`

---

## 6. 与 DTC 的隔离

| 项 | Amazon (asin_plus) | DTC |
|----|--------------------|-----|
| 码表 | `magnet_brand_param.discount_*` 或 `reorder_*` | `fc_coupon_campaign` / `fc_coupon_code` |
| 引擎 reward-plan | **不调用** | 必须 |
| 问卷 | `asin_survey_*` | `q_survey_*` |

**不要**把 Amazon claim code 写进 Shopify / `fc_coupon_code`。

---

## 7. 开通清单（Amazon + 码）

- [ ] `customer.product_line` ∈ `asin_plus` \| `both`
- [ ] `magnet` 存在且 `customer_id` 对齐
- [ ] `magnet_brand_param.experience = asin_plus`
- [ ] `product_name` + `store_website` 非空
- [ ] `discount_claim_code` + `discount_benefit` 已写
- [ ] 可选：`discount_asin`、`discount_ends_at`、问卷绑定
- [ ] `GET /api/reorder/consumer/{sn}` 含 `availableSavings[].claimCode`
- [ ] 页面可见 Code 块

---

## 8. 相关文件

| 文件 | 作用 |
|------|------|
| `20260913170000_magnet_brand_param_discount.sql` | 列定义 |
| `src/services/reorder-consumer.service.ts` | brand-param → savings |
| `src/repositories/magnet-brand-param.repo.ts` | select 列 |
| `docs/plans/2026-09-13-customer-magnet-brand-param-provisioning.md` | 总开通文档（已交叉引用） |
| FCDiscountSystem `mapConsumerExperienceToConfig` | savings → coupons UI |
