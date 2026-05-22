# FC Brand Dashboard PRD

## 1. PRD 概览

### 1.1 产品名称

**FC Brand Dashboard / In-Home Retention Performance Dashboard**

### 1.2 产品定位

FC Brand Dashboard 是 FridgeChannel 提供给品牌方的客户后台，用来把 FC 在家庭场景里的触达、使用、内容互动、CTA 行为和转化结果，翻译成品牌方能理解的 **retention、repeat purchase、LTV、revenue impact** 指标。

它不是一个单纯的“设备使用后台”，而是一个面向品牌方的 **in-home owned channel performance dashboard**。

### 1.3 核心原则

**三个套餐使用同一套 dashboard 结构，不做三套不同产品。**

不同套餐的区别是：

- **Presence**：基础指标可见，高阶 revenue / retention / lifecycle 模块 locked 或隐藏。
- **LTV Lift Package**：中层指标可见，习惯养成、使用频率、基础 repeat / CTA signal 可见，高阶 lifecycle / revenue drilldown locked。
- **Retention Moat Package**：完整指标可见，包括 revenue、retention、lifecycle、CTA、content optimization 全量分析。

一句话：

> **Same dashboard structure, different data depth.**
> 

---

## 2. Dashboard 一级信息架构

Dashboard 按照品牌方阅读优先级，而不是 FC 内部数据生产顺序来组织。

推荐顺序：

1. **Revenue Impact**
2. **Retention & Lifecycle**
3. **Usage & Engagement**
4. **In-Home Reach**
5. **CTA & Conversion**
6. **Content & Optimization**

### 2.1 为什么 Revenue 放第一

CMO / VP Marketing / Retention Lead 打开后台时，最关心的不是用户 tap 了几次，而是：

- FC 是否贡献了可归因收入？
- 是否提升了复购？
- 是否影响了留存？
- 是否让老客收入变高？
- 是否降低了对 paid channel 的依赖？

因此 dashboard 首页第一屏应该先展示结果，再展示原因。

---

## 3. 套餐权限模型

### 3.1 套餐枚举

```tsx
type PlanTier = "presence" | "ltv_lift" | "retention_moat";
```

### 3.2 模块可见规则

| 模块 | Presence | LTV Lift | Retention Moat |
| --- | --- | --- | --- |
| Revenue Impact | Locked | Basic signal | Full access |
| Retention & Lifecycle | Locked | Basic repeat / retention signal | Full access |
| Usage & Engagement | Basic usage | Full access | Full access + lifecycle breakdown |
| In-Home Reach | Full access | Full access | Full access + lifecycle breakdown |
| CTA & Conversion | Locked | Overview only | Full access + lifecycle breakdown |
| Content & Optimization | Basic content performance | Full content performance | Full access + lifecycle breakdown |

### 3.3 Locked 模块设计

低档位用户不应该完全看不到高阶能力。建议展示 locked preview card。

Locked card 文案示例：

> **Unlock Revenue Impact**
> 

> Upgrade to LTV Lift or Retention Moat to see FC Attributed Revenue, repeat purchase revenue, and revenue per active household.
> 

Retention Moat 专属模块 locked 文案示例：

> **Unlock Lifecycle Performance**
> 

> Upgrade to Retention Moat to see CTA conversion, repeat purchase, winback, and revenue performance by lifecycle stage.
> 

---

## 4. 全局筛选器

所有模块共用一组 global filters。

### 4.1 必备筛选器

- Date range
    - Last 7 days
    - Last 30 days
    - Last 90 days
    - This month
    - Last month
    - Custom range
- Campaign / Program
- Product line
- Device batch
- Lifecycle stage
- Geography / region
- Content pillar
- CTA type

### 4.2 按套餐控制筛选器

| Filter | Presence | LTV Lift | Retention Moat |
| --- | --- | --- | --- |
| Date range | ✓ | ✓ | ✓ |
| Campaign / Program | ✓ | ✓ | ✓ |
| Product line | ✓ | ✓ | ✓ |
| Device batch | ✓ | ✓ | ✓ |
| Lifecycle stage | Locked | Locked / preview | ✓ |
| Content pillar | Basic | ✓ | ✓ |
| CTA type | — | Basic | ✓ |

---

## 5. 核心数据对象

### 5.1 Brand

```tsx
type Brand = {
	id: string;
	name: string;
	planTier: PlanTier;
	timezone: string;
	currency: string;
};
```

### 5.2 Household

```tsx
type Household = {
	id: string;
	brandId: string;
	customerId?: string;
	deviceId?: string;
	activatedAt?: string;
	lastTapAt?: string;
	lifecycleStage?: LifecycleStage;
};
```

### 5.3 Device

```tsx
type Device = {
	id: string;
	brandId: string;
	householdId?: string;
	batchId?: string;
	shippedAt?: string;
	activatedAt?: string;
	status: "shipped" | "activated" | "inactive" | "lost" | "disabled";
};
```

### 5.4 Tap Event

```tsx
type TapEvent = {
	id: string;
	brandId: string;
	householdId: string;
	deviceId: string;
	tappedAt: string;
	contentId?: string;
	sessionId?: string;
};
```

### 5.5 Content Play Event

```tsx
type ContentPlayEvent = {
	id: string;
	brandId: string;
	householdId: string;
	contentId: string;
	sessionId: string;
	startedAt: string;
	completedAt?: string;
	durationSeconds: number;
	listenedSeconds: number;
	completionRate: number;
};
```

### 5.6 CTA Event

```tsx
type CtaEvent = {
	id: string;
	brandId: string;
	householdId: string;
	contentId?: string;
	ctaId: string;
	impressedAt?: string;
	clickedAt?: string;
	takenAt?: string;
	ctaType: "purchase" | "coupon" | "subscription" | "loyalty" | "review" | "ugc" | "education" | "other";
	lifecycleStage?: LifecycleStage;
};
```

### 5.7 Order / Revenue Event

```tsx
type RevenueEvent = {
	id: string;
	brandId: string;
	customerId: string;
	householdId?: string;
	orderId: string;
	orderValue: number;
	currency: string;
	orderedAt: string;
	attributionSource?: "fc" | "non_fc" | "unknown";
	attributedCtaEventId?: string;
	attributedTapEventId?: string;
};
```

### 5.8 Lifecycle Stage

```tsx
type LifecycleStage =
	| "new_customer"
	| "onboarding"
	| "routine_building"
	| "renewal_window"
	| "winback"
	| "seasonal_care"
	| "loyalty_anniversary";
```

---

## 6. 指标口径 / Metric Dictionary

### 6.1 Revenue Impact Metrics

#### FC Attributed Revenue

**定义：** 在选定时间范围内，被归因为 FC 触达、FC CTA、FC coupon、FC lifecycle journey 或 FC household engagement 所影响并完成的订单收入。

**计算建议：**

```tsx
FC Attributed Revenue =
sum(orderValue where attributionSource = "fc")
```

如果早期归因能力不完整，可以先支持两层口径：

- **Direct FC Attributed Revenue**：用户点击 FC CTA 后，在 attribution window 内完成的订单收入。
- **Influenced FC Revenue**：用户在 attribution window 内有 FC tap / play / CTA exposure，随后完成的订单收入。

建议默认展示 Direct，Tooltip 里说明 influenced revenue 作为 secondary view。

**展示位置：** Revenue Impact 第一张核心卡片。

**可见权限：**

- Presence：Locked
- LTV Lift：Basic signal / total only
- Retention Moat：Full access + lifecycle breakdown

---

#### Repeat Customer Revenue

**定义：** FC attributed orders 中，由 returning customers 贡献的收入。

```tsx
Repeat Customer Revenue =
sum(orderValue where attributionSource = "fc" and customerOrderIndex > 1)
```

**可见权限：**

- Presence：Hidden / Locked
- LTV Lift：Total only
- Retention Moat：Total + lifecycle

---

#### Revenue per Active Household

**定义：** 每个 active household 在选定时间范围内贡献的 FC attributed revenue。

```tsx
Revenue per Active Household =
FC Attributed Revenue / Active Households
```

**可见权限：**

- Presence：Hidden
- LTV Lift：Hidden or basic
- Retention Moat：Full access

---

#### Coupon Redeemed Revenue

**定义：** 使用 FC coupon / reward 完成兑换订单所产生的收入。

```tsx
Coupon Redeemed Revenue =
sum(orderValue where couponSource = "fc")
```

**可见权限：**

- Presence：Hidden
- LTV Lift：Total only
- Retention Moat：Total + lifecycle

---

#### LTV / CLV Signal

**定义：** FC-engaged customers 与 non-FC-engaged customers 在 LTV / CLV 上的对比信号。

```tsx
LTV Signal =
avg(LTV of FC-engaged customers) - avg(LTV of non-FC-engaged customers)
```

早期可展示为 directional signal，不建议承诺强因果。

**可见权限：**

- Presence：Hidden
- LTV Lift：Locked / preview
- Retention Moat：Full access

---

### 6.2 Retention & Lifecycle Metrics

#### Retention Rate

**定义：** 在某个 device batch / campaign 内，经过 N 天后仍然活跃 / 复购 / 有有效互动的用户比例。

```tsx
Retention Rate N =
retained customers at day N / batch customers
```

支持：

- 30-day retention
- 60-day retention
- 90-day retention

**可见权限：**

- Presence：Locked
- LTV Lift：Basic trend
- Retention Moat：Full + lifecycle

---

#### Repeat Purchase Rate

**定义：** 在选定时间范围内，FC-engaged customers 中产生复购的比例。

```tsx
Repeat Purchase Rate =
customers with repeat purchase / FC-engaged customers
```

**可见权限：**

- Presence：Hidden
- LTV Lift：Total only
- Retention Moat：Full + lifecycle

---

#### Reactivation Rate

**定义：** 原本 inactive 的用户，在 FC touch 后重新产生 tap、CTA、purchase 或 loyalty action 的比例。

```tsx
Reactivation Rate =
reactivated inactive customers / inactive customers reached by FC
```

**可见权限：**

- Presence：Hidden
- LTV Lift：Overview
- Retention Moat：Full + lifecycle

---

#### Winback Rate

**定义：** 被 FC winback journey 触达后完成目标动作的用户比例。

目标动作可以是：

- tap again
- CTA click
- coupon claim
- coupon redeem
- repeat purchase

**可见权限：**

- Presence：Hidden
- LTV Lift：Locked
- Retention Moat：Full access

---

#### Lifecycle Stage Performance

**定义：** 不同生命周期阶段下的核心指标表现。

Lifecycle stages:

- New Customer
- Onboarding
- Routine Building
- Renewal Window
- Winback
- Seasonal Care
- Loyalty Anniversary

每个 stage 展示：

- Active Households
- Tap Frequency
- Content Completion
- CTA Click Rate
- CTA Take-rate
- Repeat Purchase Rate
- FC Attributed Revenue

**可见权限：**

- Presence：Locked
- LTV Lift：Locked / preview
- Retention Moat：Full access

---

### 6.3 Usage & Engagement Metrics

#### Active Households

**定义：** 在选定时间范围内产生至少一次 tap、content play、CTA click 或 reward action 的 household 数量。

```tsx
Active Households =
count(distinct householdId where event exists in date range)
```

**可见权限：** All tiers

---

#### Habit Formation Rate

**定义：** 在过去 N 周内达到固定触发频率的 household 比例。默认口径建议为：连续 4 周，每周至少 1 次 tap。

```tsx
Habit Formation Rate =
households with >= 1 tap per week for 4 consecutive weeks / activated households
```

**可见权限：**

- Presence：Locked / preview
- LTV Lift：Full
- Retention Moat：Full + lifecycle

---

#### Weekly Tap Frequency

**定义：** 每个 household 每周平均主动触发次数。

```tsx
Weekly Tap Frequency =
total taps in week / active households in week
```

**可见权限：**

- Presence：Basic or hidden
- LTV Lift：Full
- Retention Moat：Full + lifecycle

---

#### WAU / MAU Stickiness

**定义：** Weekly Active Households 与 Monthly Active Households 的比例。

```tsx
WAU / MAU =
weekly active households / monthly active households
```

**可见权限：**

- Presence：Hidden
- LTV Lift：Full
- Retention Moat：Full

---

#### Routine Retention

**定义：** 连续多周保持触发行为的 household 比例。

```tsx
Routine Retention =
households active in week 1, week 2, week 3, week 4 / households active in week 1
```

**可见权限：**

- Presence：Hidden
- LTV Lift：Full
- Retention Moat：Full

---

#### Check-in Completion Rate

**定义：** 被分配 check-in task 的用户中，完成 check-in 的比例。

```tsx
Check-in Completion Rate =
completed check-ins / assigned check-ins
```

**可见权限：**

- Presence：Hidden
- LTV Lift：Overview
- Retention Moat：Full + lifecycle

---

### 6.4 In-Home Reach Metrics

#### Activated Devices

**定义：** 已完成激活的设备数量。

```tsx
Activated Devices =
count(deviceId where activatedAt is not null)
```

**可见权限：** All tiers

---

#### Activated Households

**定义：** 至少有一个 activated device 的 household 数量。

```tsx
Activated Households =
count(distinct householdId where device.activatedAt is not null)
```

**可见权限：** All tiers

---

#### Sticking Rate

**定义：** 被用户贴到冰箱 / 完成激活的设备比例。早期可以用 activation 作为 proxy。

```tsx
Sticking Rate =
activated devices / shipped devices
```

**可见权限：** All tiers

---

#### Time to First Activation

**定义：** 从设备发出 / 到达 / campaign start 到首次激活的平均时间。

```tsx
Time to First Activation =
avg(activatedAt - shippedAt)
```

**可见权限：** All tiers

---

#### In-Home Brand Reach

**定义：** 被 FC 成功带入家庭场景并可触达的 household 数量。

```tsx
In-Home Brand Reach =
activated households
```

可扩展为：

```tsx
In-Home Brand Reach =
activated households with at least one valid brand touch
```

**可见权限：** All tiers

---

#### Brand Touches per Household

**定义：** 每个 household 在选定时间范围内产生的品牌触达次数。

```tsx
Brand Touches per Household =
total valid brand touches / active households
```

Valid brand touches 可包括：

- tap
- content play
- completed listen
- CTA impression
- CTA click
- check-in
- reward action

**可见权限：**

- Presence：Basic
- LTV Lift：Trend
- Retention Moat：Lifecycle breakdown

---

### 6.5 CTA & Conversion Metrics

#### CTA Impression

**定义：** CTA 被展示的次数。

```tsx
CTA Impressions =
count(ctaEvent where impressedAt is not null)
```

**可见权限：**

- Presence：Hidden
- LTV Lift：Overview
- Retention Moat：Full

---

#### CTA Click Rate

**定义：** CTA 展示后被点击的比例。

```tsx
CTA Click Rate =
CTA Clicks / CTA Impressions
```

**可见权限：**

- Presence：Hidden
- LTV Lift：Overview
- Retention Moat：Full + lifecycle

---

#### CTA Take-rate

**定义：** 用户点击 CTA 后，完成目标承接动作的比例。

```tsx
CTA Take-rate =
CTA Taken Events / CTA Clicks
```

Taken event 可包括：

- purchase
- coupon redeemed
- subscription started
- loyalty signup
- review submitted
- UGC uploaded
- education page completed

**可见权限：**

- Presence：Hidden
- LTV Lift：Overview
- Retention Moat：Full + lifecycle

---

#### Coupon Claim Rate

**定义：** 用户看到 coupon CTA 后领取 coupon 的比例。

```tsx
Coupon Claim Rate =
coupon claims / coupon CTA impressions
```

**可见权限：**

- Presence：Hidden
- LTV Lift：Overview
- Retention Moat：Full + lifecycle

---

#### Coupon Redeem Rate

**定义：** 已领取 coupon 中完成兑换的比例。

```tsx
Coupon Redeem Rate =
coupon redemptions / coupon claims
```

**可见权限：**

- Presence：Hidden
- LTV Lift：Overview
- Retention Moat：Full + lifecycle

---

### 6.6 Content & Optimization Metrics

#### Audio Play Rate

**定义：** tap 后成功进入音频播放的比例。

```tsx
Audio Play Rate =
audio play sessions / tap sessions
```

**可见权限：**

- Presence：Basic
- LTV Lift：Full trend
- Retention Moat：Full + lifecycle

---

#### Completion Rate

**定义：** 音频内容被完整听完或达到完成阈值的比例。默认完成阈值建议为 listenedSeconds / durationSeconds >= 80%。

```tsx
Completion Rate =
completed plays / total plays
```

**可见权限：**

- Presence：Basic
- LTV Lift：Full
- Retention Moat：Full + lifecycle

---

#### Replay Rate

**定义：** 同一 household 重复播放同一内容或同类内容的比例。

```tsx
Replay Rate =
repeat plays / total plays
```

**可见权限：**

- Presence：Hidden
- LTV Lift：Full
- Retention Moat：Full

---

#### Drop-off Rate

**定义：** 用户在音频播放过程中提前退出的比例。

```tsx
Drop-off Rate =
dropped plays / total plays
```

**可见权限：**

- Presence：Hidden
- LTV Lift：Full
- Retention Moat：Full

---

#### Content Pillar Performance

**定义：** 不同内容支柱的表现。

Content pillars:

- Branding Voice
- Product Education
- Interesting Tips
- Problem / Symptom → Solution
- Lifestyle & Scenarios
- Social Proof
- Newness & Refresh

每个 content pillar 展示：

- Plays
- Completion Rate
- Replay Rate
- CTA Click Rate
- CTA Take-rate
- FC Attributed Revenue

**可见权限：**

- Presence：Basic top content
- LTV Lift：Full by pillar
- Retention Moat：Full + lifecycle

---

## 7. Dashboard 页面结构

### 7.1 Header

Header 显示：

- Brand name
- Dashboard name
- Current plan tier
- Date range selector
- Export button
- Upgrade button / Contact CS button
- Data last updated timestamp

示例：

> FridgeChannel Dashboard
> 

> Retention Moat Package
> 

> Last updated: 2026-05-22 10:00 Asia/Shanghai
> 

---

### 7.2 Executive Summary Row

首页最上方显示 4–6 张 summary cards。不同套餐显示不同指标。

#### Presence

- In-Home Brand Reach
- Activated Households
- Sticking Rate
- Basic Content Completion Rate
- Locked: Revenue Impact

#### LTV Lift

- Habit Formation Rate
- Weekly Tap Frequency
- Routine Retention
- Active Households
- Coupon Redeem Rate
- Basic Repeat Purchase Signal
- Locked: Lifecycle Performance

#### Retention Moat

- FC Attributed Revenue
- Repeat Customer Revenue
- Retention Rate
- Winback / Reactivation Rate
- CTA Take-rate
- Revenue per Active Household

---

### 7.3 Module 1：Revenue Impact

#### 7.3.1 Cards

- FC Attributed Revenue
- Repeat Customer Revenue
- Revenue per Active Household
- Coupon Redeemed Revenue
- LTV / CLV Signal
- Owned vs Paid Revenue Mix

#### 7.3.2 Charts

- FC Attributed Revenue over time
- Repeat Customer Revenue over time
- Revenue by lifecycle stage
- Revenue by CTA type
- Revenue by content pillar

#### 7.3.3 Table

Columns:

- Lifecycle Stage
- Active Households
- CTA Click Rate
- CTA Take-rate
- Orders
- FC Attributed Revenue
- Revenue per Active Household

#### 7.3.4 Empty / Locked state

If plan = presence:

> Revenue Impact is available in LTV Lift and Retention Moat. Upgrade to see FC Attributed Revenue and repeat purchase revenue from FC-driven engagement.
> 

If plan = ltv_lift:

Show total-level revenue signal if available, lock lifecycle drilldown.

---

### 7.4 Module 2：Retention & Lifecycle

#### 7.4.1 Cards

- Retention Rate
- 30-day Repeat Rate
- 60-day Repeat Rate
- 90-day Repeat Rate
- Reactivation Rate
- Winback Rate
- Customer Lifetime Signal

#### 7.4.2 Charts

- Retention Curve（activation-anchored，t=0 = household activation date）
- Repeat purchase trend
- Reactivation trend
- Winback performance over time
- Lifecycle stage funnel

#### 7.4.3 Lifecycle table

Columns:

- Lifecycle Stage
- Households
- Active Rate
- Weekly Tap Frequency
- CTA Click Rate
- CTA Take-rate
- Repeat Purchase Rate
- FC Attributed Revenue

#### 7.4.4 Visibility

- Presence：locked
- LTV Lift：show basic repeat / retention signal only
- Retention Moat：full module

---

### 7.5 Module 3：Usage & Engagement

#### 7.5.1 Cards

- Active Households
- Habit Formation Rate
- Weekly Tap Frequency
- WAU / MAU Stickiness
- Routine Retention
- Check-in Completion Rate
- Reward Unlock Rate

#### 7.5.2 Charts

- Weekly taps over time
- Active households over time
- Habit formation trend
- Routine retention trend
- Check-in completion trend

#### 7.5.3 Table

Columns:

- Device batch / Campaign
- Activated Households
- Active Households
- Habit Formation Rate
- Avg Weekly Taps
- Routine Retention
- Check-in Completion Rate

#### 7.5.4 Visibility

- Presence：basic active households + basic touches
- LTV Lift：full usage and engagement
- Retention Moat：full + lifecycle

---

### 7.6 Module 4：In-Home Reach

#### 7.6.1 Cards

- Activated Devices
- Activated Households
- Sticking Rate
- Time to First Activation
- In-Home Brand Reach
- Brand Touches per Household

#### 7.6.2 Charts

- Conversion funnel（C1-C5）
    - C1 Sticking Rate：贴到冰箱上的概率
    - C2 Habit Formation Rate：养成固定频率打开习惯的用户比例
    - C3 Weekly Tap Frequency：每周主动触发次数
    - C4 CTA Click Rate：点击 CTA 的概率
    - C5 CTA Take-rate：点击 CTA 并主动承接的概率
- Activation trend
- In-home reach over time
- Brand touches per household over time

#### 7.6.3 Table

Columns:

- Device batch / Campaign
- Shipped Devices
- Activated Devices
- Sticking Rate
- Active Households
- Avg Brand Touches

#### 7.6.4 Visibility

All tiers can see this module.

Difference:

- Presence：summary + basic trend
- LTV Lift：summary + trend + campaign comparison
- Retention Moat：summary + trend + lifecycle breakdown

---

### 7.7 Module 5：CTA & Conversion

#### 7.7.1 Cards

- CTA Impressions
- CTA Click Rate
- CTA Take-rate
- Coupon Claim Rate
- Coupon Redeem Rate
- Revenue per CTA Click

#### 7.7.2 Charts

- Conversion funnel（C1-C5）
    - C1 Sticking Rate：贴到冰箱上的概率
    - C2 Habit Formation Rate：养成固定频率打开习惯的用户比例
    - C3 Weekly Tap Frequency：每周主动触发次数
    - C4 CTA Click Rate：点击 CTA 的概率
    - C5 CTA Take-rate：点击 CTA 并主动承接的概率
- CTA click rate over time
- CTA take-rate over time
- Coupon claim vs redeem gap
- CTA performance by lifecycle stage

#### 7.7.3 Table

Columns:

- CTA Name
- CTA Type
- Content
- Lifecycle Stage
- Impressions
- Clicks
- CTA Click Rate
- Taken Actions
- CTA Take-rate
- FC Attributed Revenue

#### 7.7.4 Visibility

- Presence：locked
- LTV Lift：overview only
- Retention Moat：full + lifecycle

---

### 7.8 Module 6：Content & Optimization

#### 7.8.1 Cards

- Audio Play Rate
- Completion Rate
- Replay Rate
- Drop-off Rate
- Top Content Pillar
- Content-to-CTA Conversion

#### 7.8.2 Charts

- Content performance by pillar
- Completion rate trend
- Replay rate trend
- Drop-off by content length
- Content-to-CTA conversion
- Content performance by lifecycle stage

#### 7.8.3 Table

Columns:

- Content Title
- Content Pillar
- Lifecycle Stage
- Plays
- Completion Rate
- Replay Rate
- Drop-off Rate
- CTA Click Rate
- CTA Take-rate
- FC Attributed Revenue

#### 7.8.4 Visibility

- Presence：basic top content + completion
- LTV Lift：full content performance
- Retention Moat：full + lifecycle

---

## 8. Dashboard 首页卡片排序

### 8.1 Presence 首页

1. In-Home Brand Reach
2. Activated Households
3. Sticking Rate
4. Brand Touches per Household
5. Basic Completion Rate
6. Locked：Revenue Impact
7. Locked：Retention & Lifecycle
8. Locked：CTA & Conversion

### 8.2 LTV Lift 首页

1. Habit Formation Rate
2. Weekly Tap Frequency
3. Routine Retention
4. WAU / MAU Stickiness
5. Active Households
6. Coupon Claim Rate
7. Coupon Redeem Rate
8. Basic Repeat Purchase Signal
9. Locked：Lifecycle Revenue Drilldown

### 8.3 Retention Moat 首页

1. FC Attributed Revenue
2. Repeat Customer Revenue
3. Revenue per Active Household
4. Retention Rate
5. Winback / Reactivation Rate
6. Habit Formation Rate
7. Weekly Tap Frequency
8. CTA Click Rate
9. CTA Take-rate
10. Lifecycle Stage Performance

---

## 9. UI / UX 要求

### 9.1 Card 组件

每个 metric card 必须包含：

- Metric name
- Current value
- Period-over-period change
- Trend direction
- Tooltip definition
- Plan visibility state
- Optional benchmark / target

示例：

```tsx
type MetricCard = {
	id: string;
	title: string;
	value: number | string;
	unit?: "%" | "$" | "count" | "days";
	previousValue?: number;
	changePercent?: number;
	trend: "up" | "down" | "flat";
	isPositiveTrend: boolean;
	tooltip: string;
	visibility: "visible" | "locked" | "hidden";
	requiredTier?: PlanTier;
};
```

### 9.2 Locked State

Locked module/card 必须包含：

- 模块名称
- 简短说明
- 升级后可见的 2–3 个指标
- CTA button：Upgrade / Contact us
- 不展示真实数值
- 可以展示 mock blurred chart 作为预览，但必须标记为 preview

### 9.3 Tooltip 要求

所有指标必须有 tooltip，避免品牌方误解口径。

尤其是：

- FC Attributed Revenue
- LTV / CLV Signal
- Retention Rate
- CTA Take-rate
- Habit Formation Rate
- Sticking Rate

---

## 10. Attribution 规则

### 10.1 Attribution window

默认 attribution window：

- CTA click → purchase：7 days
- Coupon claim → redeem：14 days
- Tap / content play → purchase：7 days, 用于 influenced view
- Winback CTA → reactivation：14 days

### 10.2 Attribution priority

如果同一订单可归因多个 FC 事件，优先级为：

1. CTA click
2. Coupon claim / redeem
3. Check-in reward
4. Content play completion
5. Tap event
6. Device activation

### 10.3 Direct vs influenced

Revenue 模块建议支持两个 toggle：

- **Direct Attribution**：由 CTA click / coupon redeem 直接归因。
- **Influenced Revenue**：由 tap / play / exposure 后产生的订单影响归因。

默认展示：

> Direct Attribution
> 

Tooltip 说明：

> FC Attributed Revenue counts revenue from orders directly linked to FC CTA, coupon, or reward actions within the attribution window.
> 

---

## 11. 数据刷新频率

### 11.1 推荐刷新频率

- Event ingestion：near real-time or hourly
- Dashboard aggregation：hourly
- Revenue attribution：daily or hourly, depending on integration readiness
- Batch / LTV calculations：daily

### 11.2 UI 显示

Header 需要显示：

> Last updated: YYYY-MM-DD HH:mm timezone
> 

---

## 12. Export 功能

### 12.1 导出格式

- CSV
- PDF summary
- PNG chart export
- Scheduled weekly email report, optional

### 12.2 套餐权限

| Export Type | Presence | LTV Lift | Retention Moat |
| --- | --- | --- | --- |
| CSV export | Basic module only | Visible modules only | Full export |
| PDF summary | ✓ | ✓ | ✓ |
| Scheduled report | — | Optional | ✓ |

---

## 13. Codex 实现建议

### 13.1 前端路由

```tsx
/dashboard/:brandId
/dashboard/:brandId/revenue
/dashboard/:brandId/retention
/dashboard/:brandId/usage
/dashboard/:brandId/reach
/dashboard/:brandId/cta
/dashboard/:brandId/content
```

### 13.2 API 建议

```tsx
GET /api/brands/:brandId/dashboard/summary
GET /api/brands/:brandId/dashboard/revenue
GET /api/brands/:brandId/dashboard/retention
GET /api/brands/:brandId/dashboard/usage
GET /api/brands/:brandId/dashboard/reach
GET /api/brands/:brandId/dashboard/cta
GET /api/brands/:brandId/dashboard/content
```

所有 API 支持 query params：

```tsx
type DashboardQuery = {
	startDate: string;
	endDate: string;
	campaignId?: string;
	productLineId?: string;
	deviceBatchId?: string;
	lifecycleStage?: LifecycleStage;
	contentPillar?: string;
	ctaType?: string;
};
```

### 13.3 统一返回结构

```tsx
type DashboardModuleResponse = {
	brand: Brand;
	planTier: PlanTier;
	dateRange: {
		startDate: string;
		endDate: string;
	};
	lastUpdatedAt: string;
	cards: MetricCard[];
	charts: DashboardChart[];
	tables: DashboardTable[];
	lockedSections?: LockedSection[];
};
```

### 13.4 Chart 类型

```tsx
type DashboardChart = {
	id: string;
	title: string;
	type: "line" | "bar" | "stacked_bar" | "area" | "funnel" | "heatmap" | "pie" | "table";
	visibility: "visible" | "locked" | "hidden";
	requiredTier?: PlanTier;
	data: unknown[];
};
```

### 13.5 Locked section 类型

```tsx
type LockedSection = {
	id: string;
	title: string;
	requiredTier: PlanTier;
	description: string;
	metricsPreview: string[];
	ctaLabel: string;
};
```

---

## 14. Acceptance Criteria

### 14.1 Dashboard structure

- 所有套餐使用同一套一级模块顺序：
    1. Revenue Impact
    2. Retention & Lifecycle
    3. Usage & Engagement
    4. In-Home Reach
    5. CTA & Conversion
    6. Content & Optimization
- 不同套餐只通过 visibility / locked / hidden 控制数据深度。

### 14.2 Presence

Presence 用户必须能看到：

- In-Home Reach 模块
- Activated Devices
- Activated Households
- Sticking Rate
- Basic Audio Play / Completion
- Revenue / Retention / CTA 高阶模块 locked preview

Presence 用户不能看到：

- Lifecycle-stage performance
- FC Attributed Revenue 真实数值
- CTA conversion by lifecycle
- Revenue by lifecycle

### 14.3 LTV Lift

LTV Lift 用户必须能看到：

- Habit Formation Rate
- Weekly Tap Frequency
- WAU / MAU
- Routine Retention
- Check-in Completion Rate
- Coupon Claim Rate
- Coupon Redeem Rate
- Basic Repeat Purchase Signal

LTV Lift 用户不能看到：

- Full lifecycle stage performance
- Revenue by lifecycle
- CTA conversion by lifecycle
- Full lifecycle stage details

### 14.4 Retention Moat

Retention Moat 用户必须能看到：

- FC Attributed Revenue
- Repeat Customer Revenue
- Revenue per Active Household
- Retention Rate
- Winback Rate
- Reactivation Rate
- Lifecycle Stage Performance
- CTA Click Rate by lifecycle
- CTA Take-rate by lifecycle
- Content Performance by lifecycle

### 14.5 Tooltips

每个 card 都必须有 tooltip。  

FC Attributed Revenue 的 tooltip 必须明确 attribution window 和 attribution logic。

### 14.6 Data freshness

Dashboard header 必须展示 last updated timestamp。

### 14.7 Empty states

当数据不足时，显示：

- Not enough data yet
- 需要多少数据才能生成该指标
- 建议等待时间或下一步动作

示例：

> Not enough data to calculate Habit Formation Rate. This metric requires at least 4 weeks of household activity.
> 

---

## 15. MVP 范围

### 15.1 MVP 必做

- Plan-tier visibility system
- Global filters
- Executive summary cards
- In-Home Reach module
- Usage & Engagement module
- CTA & Conversion overview
- Revenue Impact module with FC Attributed Revenue
- Locked state system
- Tooltips
- Last updated timestamp

### 15.2 MVP 可延后

- Full LTV / CLV model
- Owned vs Paid Revenue Mix
- Scheduled report
- PDF export
- Advanced retention heatmap by device batch / campaign
- Predictive churn scoring
- AI recommendations

---

## 16. 后续版本建议

### V1

- Dashboard MVP
- 基础套餐权限
- Revenue / usage / reach / CTA 核心指标
- Locked upgrade modules

### V2

- Lifecycle stage analysis
- Retention by device batch / campaign
- Content-to-CTA optimization
- Scheduled reports

### V3

- AI recommendations
- Churn prediction
- Best next CTA suggestion
- Best next content pillar suggestion
- LTV uplift modeling
- Benchmarking across campaigns

---

## 17. 给 Codex 的实现重点

实现时优先保证以下 5 件事：

1. **Dashboard structure 固定统一**，不要为三个套餐写三套页面。
2. **Plan-tier visibility 独立成配置层**，不要把权限逻辑散落在组件里。
3. **Metric dictionary 独立维护**，所有 tooltip / formula / required tier 从同一份配置读取。
4. **FC Attributed Revenue 是 revenue 模块的主指标**，不要再使用 Revenue from FC-engaged Customers 作为主口径。
5. **Lifecycle 是 Retention Moat 的核心差异化权限**，低档位最多显示 locked preview，不展示真实拆分数据。
