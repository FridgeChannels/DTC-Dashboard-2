# FC Reorder｜Amazon Discounts Import & Management PRD

**版本**：v1.1  
**日期**：2026-09-04  
**范围**：Brand Console · Discounts

---

## 1. 核心原则

FC 不创建 Amazon Coupon、Amazon Promotion 或 Claim Code。

所有 Discount 必须已经在 Amazon Seller Central 中存在。FC 只负责：

`Import / Record → Match Product → Show / Hide on FC`

FC 不负责：

- Create Amazon Coupon
- Create Amazon Promotion
- Generate Claim Code
- 修改 Amazon Promotion / Coupon 的 Amazon 配置
- 判断消费者最终是否符合 Amazon 优惠资格
- 判断 Claim Code 是否最终 Redeemed

---

## 2. Discount 类型

FC 只支持两类 Amazon Discount：

```text
Amazon Discount
├── Amazon Coupon
└── Amazon Promotion
    └── Claim Code Mode
        ├── None
        ├── Group
        └── Single-use
```

Claim Code 不是独立 Discount 类型。

---

## 3. 入口

Product Detail 中提供：

**Add existing Amazon discount**

进入后选择：

- `Import Amazon Coupon`
- `Add Amazon Promotion`

不得使用 `Create Amazon Discount`。

---

## 4. Amazon Coupon

Coupon 已经在 Amazon 创建。

### 导入流程

```text
Upload Amazon Coupon file
→ Parse Coupon information
→ Read Eligible ASINs
→ Match FC Products
→ Review
→ Show on FC / Hide on FC
```

FC 自动读取文件中能够识别的 Amazon Coupon metadata。

至少处理：

- Eligible ASINs
- Discount type / value
- Coupon title
- Start / End
- Amazon 文件中真实存在的其他字段

如果 ASIN 能匹配 FC Product：

`Matched`

如果无法匹配：

`Product mapping required`

FC 不静默绑定到其他 Product。

### Coupon 不存在 Code Pool

Coupon 页面不出现：

- Claim Code
- Copy Code
- Group Code
- Single-use Code
- Code Pool

消费者最终是否能看到、Clip、Apply Coupon，由 Amazon 决定。

---

## 5. Amazon Promotion

入口：

**Add Amazon Promotion**

含义：

> Record an existing Amazon Promotion.

品牌登记 Amazon 已经存在的 Promotion 必要信息。

至少包括：

- Promotion title
- Eligible ASINs
- Benefit
- Qualifying condition
- Start / End
- Marketplace / Seller context
- Claim Code Mode

Claim Code Mode：

`None / Group / Single-use`

---

## 6. No Claim Code

若：

`Claim Code Mode = None`

FC 保存 Promotion 信息即可。

消费者端可展示 Promotion 摘要与：

**View on Amazon**

不出现 Code / Copy / Code Pool。

---

## 7. Group Claim Code

若：

`Claim Code Mode = Group`

品牌输入 Amazon 已经生成的 Group Claim Code。

FC：

- 保存 Code
- Consumer Page 可以显示 Code
- Consumer 可以 Copy

FC 不生成、不修改 Group Claim Code。

---

## 8. Single-use Claim Code

若：

`Claim Code Mode = Single-use`

品牌上传 Amazon 已生成的 Single-use Claim Code 文件。

流程：

```text
Upload code file
→ Parse
→ Remove / flag duplicates
→ Create Code Pool
→ FC automatically assigns codes
```

导入结果至少展示：

- Total
- Accepted
- Duplicates
- Rejected

`Accepted` 只表示 FC 可以导入，不代表 Amazon 已验证有效。

---

## 9. Single-use Code Pool

品牌管理的是整个 Promotion 的 Code Pool，不逐个管理 Code。

例如：

```text
Total       10,000
Available    8,420
Assigned     1,580
Displayed    1,300
Copied         900
```

FC 自动分配：

```text
FC ID + Promotion
→ one fixed Single-use Claim Code
```

规则：

- 同一 `FC ID + Promotion` 始终返回同一 Code；
- 一个 Code 不得分配给多个 FC ID；
- FC 不把 `Copied` 解释为 `Redeemed`；
- 品牌可以 `Import more codes`。

---

## 10. FC Display Control

### 品牌只有两个可控状态

```text
Show on FC
Hide on FC
```

数据字段可以直接使用：

```text
is_visible_on_fc = true / false
```

不使用：

- Draft
- Scheduled
- Active
- Paused
- Ended
- Retired

这些不属于 FC Discount 的品牌控制状态。

### 谁控制

`Brand Admin`

### 在哪里控制

- `Product Detail → Discounts`
- `Discount Detail`

品牌可以随时切换：

**Show on FC / Hide on FC**

该操作只影响 FC Consumer Page。

不会修改 Amazon Seller Central 中的 Coupon / Promotion。

---

## 11. 系统事实与告警

以下属于系统事实 / diagnostic，不属于品牌可控状态：

- Amazon period ended / Expired
- Product mapping required
- Invalid / incomplete imported data
- Codes low
- Codes exhausted
- Parsing issue

这些状态用于：

- 告警
- 阻止错误展示
- 引导品牌修复

但不能与 `Show / Hide` 混为同一套状态机。

---

## 12. Code Exhaustion

只适用于 Single-use Promotion。

当：

`Available Codes = 0`

默认：

**停止展示这项 Discount。**

主 Product CTA：

**Buy on Amazon**

始终继续存在，不受 Code Pool 耗尽影响。

如果未来需要支持“Code 用完仍显示普通 Amazon 跳转”，必须作为单独业务配置，不允许系统自行猜测。

---

## 13. Product Matching

Discount 通过 Eligible ASIN 匹配 FC Product：

```text
Amazon Discount
→ Eligible ASIN
→ FC Product
```

能够匹配：

`Matched`

无法匹配：

`Product mapping required`

品牌不需要对已经自动匹配成功的 Product 再重复选择一次。

---

## 14. 一个 Product 对应多个 Discounts

允许：

```text
Product A
├── Coupon A
├── Coupon B
├── Promotion A
└── Promotion B
```

展示规则：

- 0 个可展示 Discount → 不显示 Savings
- 1 个 → 直接展示
- 2 个及以上 → 展示 Featured Discount + `View all savings`

品牌可以指定一个：

**Featured Discount**

FC 不自动判断 `Best Offer`。

---

## 15. Discount List

至少展示：

| Discount | Type | Product | Amazon Period | Claim Code | FC Display | Issue |
|---|---|---|---|---|---|---|
| 15% Reorder | Coupon | Granola | Sep 1–30 | — | Show | — |
| Fall Sale | Promotion | Snack Box | Sep 1–30 | Group | Show | — |
| VIP20 | Promotion | Granola | Sep 1–30 | Single-use | Show | Codes low |
| Summer Sale | Promotion | Protein Mix | Ended | None | Hide | Expired |

注意：

`FC Display` 永远只有 `Show / Hide`。

`Issue` 单独显示系统事实。

---

## 16. 用户流程

### Coupon

```text
Product
→ Add existing Amazon discount
→ Import Amazon Coupon
→ Upload Amazon file
→ Parse + Match ASIN
→ Review
→ Show on FC
```

### Promotion · No Code

```text
Product
→ Add existing Amazon discount
→ Add Amazon Promotion
→ Record Promotion
→ No Claim Code
→ Match Product
→ Show on FC
```

### Promotion · Group

```text
Product
→ Add existing Amazon discount
→ Add Amazon Promotion
→ Group Claim Code
→ Enter existing Amazon Code
→ Show on FC
```

### Promotion · Single-use

```text
Product
→ Add existing Amazon discount
→ Add Amazon Promotion
→ Single-use Claim Code
→ Import Amazon Code file
→ Review Code Pool
→ Show on FC
```

---

## 17. MVP 验收标准

- FC 不创建 Amazon Coupon / Promotion / Claim Code。
- Coupon 与 Promotion 明确区分。
- Claim Code 只属于 Promotion。
- Coupon 不出现 Code Pool。
- Promotion 支持 None / Group / Single-use。
- Group 只保存 Amazon 已存在的 Group Claim Code。
- Single-use 只导入 Amazon 已生成的 Code。
- FC 不生成 Amazon Code。
- Discount 根据 ASIN 自动匹配 Product。
- 无法匹配时显示 `Product mapping required`。
- Brand Admin 的 FC Display 控制只有 `Show / Hide`。
- 不存在 Draft / Active / Paused / Retired 等 Discount Display 状态。
- `Expired / Codes low / Codes exhausted / Invalid` 等仅作为系统事实 / Issue。
- Single-use Code Pool 支持 Total / Available / Assigned / Displayed / Copied。
- `Copied` 不得表示 `Redeemed`。
- Codes exhausted 时默认停止展示该 Discount。
- Discount Hide 不影响 Product 主 `Buy on Amazon` CTA。
