# Survey Campaign 创建流程重构需求文档

## 1. 背景

当前后台页面为：

**Survey Campaigns → New survey campaign**

现有页面主要包含：

* Campaign name
* Campaign goal
* Description
* Klaviyo segments
* Starts at
* Ends at
* Priority
* Question order
* Max questions per user
* Allow skip
* Create campaign

当前页面更像是在创建一条 campaign 配置记录。对于商家来说，完整的 Survey Campaign 创建流程应该覆盖：

1. 问什么问题
2. 用户如何回答
4. 发给哪些用户
5. 什么时候开始和结束
6. 发布前能否预览
7. 创建后是草稿还是上线状态

因此需要把当前页面从“单页配置表单”重构为“分步骤创建流程”。

---

## 2. 当前主要问题

### 2.1 缺少问卷内容创建能力

当前页面提示：

> Draft settings — add questions after creation

但用户创建 survey campaign 时，最核心的动作是创建问题和答案。

当前流程先让用户配置 audience、schedule、priority、rules，再去添加问题，商家心智不顺。

需要新增 Question Builder，让用户在创建过程中完成问题配置。

---

### 2.2 Campaign goal 没有驱动后续配置

当前 goal 包含：

* Preference
* Reward
* Reward preference
* Product discovery
* Feedback
* Vote

但切换 goal 后，页面字段没有变化。

问题：

* 用户不知道不同 goal 的实际差异
* 工程侧也没有明确的 goal-specific 配置逻辑
* 后续数据统计和前台展示难以区分

需要根据 goal 决定后续配置项。

示例：

| Goal              | 应触发的配置          |
| ----------------- | --------------- |
| Preference        | 单选/多选偏好题、偏好标签记录 |
| Product discovery | 商品关联、商品推荐逻辑     |
| Feedback          | 评分题、文本反馈        |
| Vote              | 投票选项、是否展示结果     |

---


---

### 2.4 Audience 空状态存在误投风险

当前 Klaviyo segments 为空时提示：

> No Klaviyo segments synced yet. Leave this empty to target all users.

问题：

* 商家可能只是还没有同步 segments
* 留空直接变成 all users，存在误投风险
* 没有连接/同步 Klaviyo 的操作入口

需要明确区分：

* 未连接 Klaviyo
* 已连接但未同步 segment
* 已同步但用户未选择 segment
* 用户主动选择 All users

---

### 2.5 Priority 对普通商家太技术化

当前字段：

> Priority
> Higher wins when multiple campaigns match

问题：

* 普通商家不知道应该填几
* 不知道不填会怎样
* 这是后端冲突处理逻辑，不应作为主流程必填项

建议将 priority 放入 Advanced settings，并用业务语言表达。

---

### 2.6 Scheduling 缺少默认语义

当前 Starts at / Ends at 为空。

需要明确：

* 空 start time 是否代表发布后立即开始
* 空 end time 是否代表 no end date
* 使用哪个时区
* campaign active 后是否允许修改时间
* end time 早于 start time 时如何处理

---

### 2.7 缺少 Preview 和 Publish

当前只有一个按钮：

**Create campaign**

问题：

* 用户不知道点击后是保存草稿还是上线
* 没有发布前检查
* 没有用户侧预览
* 容易创建出不完整 campaign

需要拆分为：

* Save draft
* Publish campaign

并在 publish 前做完整校验。

---

## 3. 重构目标

本次重构目标：

1. 让商家可以在一个完整流程里创建可上线问卷
2. 支持问题、答案、受众、时间、预览、发布
3. 避免空配置 campaign 被误发布
4. 为后续数据统计、Klaviyo 分群打好结构基础
5. 降低普通商家的配置理解成本

---

## 4. 新创建流程

建议改为 6 步创建流程。

### Step 1：Basic Setup

目标：定义 campaign 基础信息。

字段：

| 字段                     | 类型       | 是否必填 | 说明           |
| ---------------------- | -------- | ---- | ------------ |
| Campaign name          | input    | 必填   | 后台展示名称       |
| Campaign goal          | select   | 必填   | 决定后续配置       |
| Internal description   | textarea | 非必填  | 内部备注         |
| User-facing intro text | textarea | 非必填  | 用户进入问卷前看到的说明 |

按钮：

* Save draft
* Continue

说明：

* 原来的 Description 需要拆成 Internal description 和 User-facing intro text
* 避免内部备注被误展示给用户

---

### Step 2：Build Survey

目标：创建问卷问题和答案。

每个 question 支持字段：

| 字段                   | 类型               | 是否必填 | 说明             |
| -------------------- | ---------------- | ---- | -------------- |
| Question text        | input / textarea | 必填   | 用户看到的问题        |
| Question type        | select           | 必填   | 问题类型           |
| Answer options       | list             | 条件必填 | 单选/多选/投票题必填    |
| Required             | checkbox         | 非必填  | 是否必须回答         |
| Allow skip           | checkbox         | 非必填  | 是否允许跳过         |
| Option display order | select           | 非必填  | fixed / random |

Question type 第一版建议支持：

* Single choice
* Multiple choice
* Rating
* Yes / No
* Short text

可后置能力：

* Logic jump
* Image option
* Product option
* Conditional question

页面操作：

* Add question
* Duplicate question
* Delete question
* Reorder question
* Preview question

校验规则：

* 至少需要 1 个 question 才能 publish
* Single choice / Multiple choice / Vote 至少需要 2 个 options
* Question text 不能为空
* 删除 question 时需要确认

---



### Step 4：Audience

目标：配置问卷投放人群。

字段：

| 字段                      | 类型           | 是否必填 | 说明                           |
| ----------------------- | ------------ | ---- | ---------------------------- |
| Audience type           | radio        | 必填   | All users / Klaviyo segments |
| Include segments        | multi-select | 条件必填 | 选择 Klaviyo segments          |
| Exclude segments        | multi-select | 非必填  | 排除人群                         |
| Estimated audience size | readonly     | 非必填  | 预估覆盖人数                       |

Klaviyo 状态处理：

#### 状态 1：未连接 Klaviyo

显示：

> Klaviyo is not connected. You can publish this survey to all users, or connect Klaviyo to target specific segments.

按钮：

* Connect Klaviyo
* Continue with all users

#### 状态 2：已连接，但没有 synced segments

显示：

> No Klaviyo segments synced yet.

按钮：

* Sync segments
* Continue with all users

#### 状态 3：已有 segments

允许选择：

* All users
* Specific segments

重要规则：

* 留空不能自动等于 All users
* 必须让用户明确选择 Audience type
* 如果选择 Specific segments 但没有选 segment，不能继续

---

### Step 5：Schedule & Delivery Rules

目标：配置上线时间和展示规则。

字段：

| 字段                     | 类型                | 是否必填 | 说明                                   |
| ---------------------- | ----------------- | ---- | ------------------------------------ |
| Start type             | radio             | 必填   | Publish immediately / Schedule later |
| Starts at              | datetime          | 条件必填 | Schedule later 时必填                   |
| End type               | radio             | 必填   | No end date / End at specific time   |
| Ends at                | datetime          | 条件必填 | End at specific time 时必填             |
| Timezone               | readonly / select | 必填   | 默认 store timezone                    |
| Question order         | select            | 必填   | Fixed order / Random                 |
| Max questions per user | number            | 非必填  | 为空表示展示全部                             |
| Frequency cap          | select            | 必填   | 每个用户展示次数                             |
| Conflict handling      | select            | 必填   | Normal / High / Low                  |

Frequency cap 建议支持：

* Show once per user
* Show once per day
* Show once per challenge round

Conflict handling 替代当前 Priority：

| 前端文案   | 后端 priority |
| ------ | ----------- |
| Low    | 10          |
| Normal | 50          |
| High   | 90          |

如需保留精确 priority number，放到 Advanced settings。

时间规则：

* Start immediately：publish 后立即 active
* No end date：长期有效
* Ends at 必须晚于 Starts at
* 如果 campaign 已经 active，修改 starts_at 需要禁用或特殊处理
* 所有时间需要展示 timezone

---

### Step 6：Preview & Publish

目标：上线前确认。

页面展示 summary：

| 模块             | 展示内容                                         |
| -------------- | -------------------------------------------- |
| Basic info     | name, goal, intro text                       |
| Survey content | questions count, question list               |
| Reward         | reward type, coins amount, completion rule   |
| Audience       | all users / selected segments                |
| Schedule       | start time, end time, timezone               |
| Delivery rules | question order, max questions, frequency cap |

必须提供用户侧 Preview：

* 问卷第一屏
* 问题展示样式
* 选项按钮
* Skip 按钮
* Submit / Next 按钮

按钮：

* Save draft
* Publish campaign

Publish 前校验：

* Campaign name 必填
* Campaign goal 必填
* 至少 1 个 question
* 所有 question 配置合法
* reward rules 配置合法
* audience 配置合法
* schedule 配置合法
* 如果 Klaviyo segments 未同步但选择了 Specific segments，不能发布

---

## 5. Campaign 状态流

需要新增完整状态。

| 状态               | 含义       | 可操作            |
| ---------------- | -------- | -------------- |
| Draft            | 草稿，未完成配置 | 编辑、删除、预览       |
| Ready to publish | 配置完整，未发布 | 编辑、发布、预览       |
| Scheduled        | 已发布，等待开始 | 编辑部分字段、暂停、取消发布 |
| Active           | 正在运行     | 暂停、结束、查看数据     |
| Paused           | 手动暂停     | 恢复、编辑部分字段、结束   |
| Ended            | 已结束      | 查看数据、复制、归档     |
| Archived         | 已归档      | 查看，不可编辑        |

状态转换：

* Draft → Ready to publish：配置通过校验
* Ready to publish → Scheduled：发布且 start time 在未来
* Ready to publish → Active：发布且立即开始
* Scheduled → Active：到达 start time
* Active → Paused：手动暂停
* Paused → Active：手动恢复
* Active / Scheduled / Paused → Ended：到达 end time 或手动结束
* Ended → Archived：手动归档

---

## 6. 页面与按钮调整

### 当前按钮

**Create campaign**

### 建议替换

在创建流程中：

* Save draft
* Continue
* Back
* Preview
* Publish campaign

如果保留当前单页结构作为第一版，也至少需要改成：

**Save draft & add questions**

创建后进入 question builder。



## 8. 后端接口建议

第一版需要支持以下能力：

### Campaign

* Create draft campaign
* Update campaign basic info
* Update audience settings
* Update reward rules
* Update schedule rules
* Validate campaign
* Publish campaign
* Pause campaign
* Resume campaign
* End campaign
* Archive campaign

### Question

* Create question
* Update question
* Delete question
* Reorder questions
* Create option
* Update option
* Delete option
* Reorder options

### Preview

* Get admin preview data
* Get user-facing preview data

### Response

* Start survey response
* Submit answer
* Submit survey
* Grant reward
* Mark response abandoned

---

## 9. 前台用户侧需要配合的逻辑

当用户看到问卷任务时，需要展示：

* 问卷标题
* 问卷奖励
* 预计问题数量
* 是否可跳过
* CTA：Start survey

提交后展示：

* 完成反馈
* 金币到账动效
* 返回首页后金币进度更新

中途退出时：

* 不发奖励
* response status = abandoned
* 如果后续允许继续，需要记录已答进度
* 第一版可以不支持继续作答

---

## 10. MVP 优先级

### P0：必须做

1. Create campaign 改为 Save draft & add questions
2. 新增 Question Builder
3. 新增 Reward Rules
4. 新增 Draft / Publish 状态
5. Publish 前校验
6. Audience type 必须明确选择
7. Klaviyo 空状态增加 Connect / Sync / Continue with all users

---

### P1：建议做

1. Preview & Publish 页面
2. Campaign 状态流完整化
3. Conflict handling 替代裸 priority
4. Start immediately / No end date 语义化
5. Timezone 展示
6. Frequency cap
7. Completion rule

---

### P2：后续增强

1. Logic jump
2. Product discovery 关联 Shopify 商品
3. Vote 结果展示
4. Question analytics
5. Segment performance analytics
6. A/B test
7. 自动推荐问题模板

---

## 11. 验收标准

### 创建流程验收

* 用户可以从 0 创建一份包含问题、答案、受众、时间的 survey campaign
* 未添加问题时不能发布
* 未明确选择 audience 时不能发布
* 用户可以保存草稿
* 用户可以发布 campaign
* 用户可以预览前台效果

---

### Klaviyo 验收

* 未连接 Klaviyo 时，不展示空 segment 选择器
* 未同步 segments 时，引导用户 sync
* 用户选择 Specific segments 后，必须至少选择一个 segment
* 用户选择 All users 后，可以不依赖 Klaviyo 发布

---

### 奖励验收

* 前台可以展示奖励金币数
* 用户提交成功后金币到账
* 中途退出不发奖励
* 跳过必答题不能提交
* 跳过非必答题不影响完成

---

### 状态验收

* 新建后默认 Draft
* 配置完整后可以 Publish
* Publish 后根据 start time 进入 Scheduled 或 Active
* Active campaign 可以 Pause / End
* Ended campaign 不能继续被用户看到
* Archived campaign 只读

---

## 12. 第一版推荐落地方案

为了控制工程量，第一版可以不做完整 6 步 wizard，但必须完成以下调整：

### 方案：当前页面 + 创建后进入 Question Builder

当前 New survey campaign 页面保留基础字段，但调整为：

1. Basic details
2. Reward rules
3. Audience
4. Schedule
5. Save draft & add questions

点击后进入：

**Survey Builder 页面**

在 builder 内完成：

* Add question
* Add options
* Preview
* Publish

这样可以保留现有页面结构，同时补齐完整创建闭环。

---

## 13. 关键文案调整

### 当前

Create campaign

### 建议

Save draft & add questions

---

### 当前

Draft settings — add questions after creation

### 建议

Start by saving the campaign settings, then add questions and publish when ready.

---

### 当前

No Klaviyo segments synced yet. Leave this empty to target all users.

### 建议

No Klaviyo segments synced yet. You can sync Klaviyo segments to target specific users, or continue with all users.

按钮：

* Sync segments
* Continue with all users

---

### 当前

Priority
Higher wins when multiple campaigns match

### 建议

Conflict handling
Choose which survey should be shown first when multiple surveys match the same user.

选项：

* Low
* Normal
* High

