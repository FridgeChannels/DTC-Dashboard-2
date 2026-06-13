# Tap-to-Choice 问卷 API

面向 magnet 扫码 / 游戏 / 发券等外部场景的问卷活动查询与答题提交。

品牌侧在 DTC Dashboard Admin 中创建并发布问卷活动；外部系统通过 `magnet_id` 定位品牌，拉取可用问题并回传用户选择。

---

## 服务地址

| 环境 | Base URL | 说明 |
|------|----------|------|
| 本地 | `http://localhost:8081` | 本机调试 |
| 开发 | `https://perversive-latia-coevally.ngrok-free.dev` | 联调、外网可达，**仅限非生产** |
| 生产 | 内网地址（由运维提供） | **必须通过内网调用** |

下文路径均相对于 Base URL。本地示例：

```
http://localhost:8081/api/tap-choice/surveys/availability?magnet_id=2202
```

---

## 鉴权

以下 **M2M 接口** 需在请求头携带 API 密钥（服务端环境变量 `API_KEY`）：

| Header | 示例 |
|--------|------|
| `X-Api-Key` | `X-Api-Key: your-secret-key` |
| `Authorization` | `Authorization: Bearer your-secret-key` |

- 生产环境必须配置 `API_KEY`；未携带或密钥错误返回 `401`。
- 开发环境未配置 `API_KEY` 时默认放行。

> Dashboard 管理接口（`/api/survey-campaigns` 等）使用 Session Cookie 鉴权，**不需要** API Key。

---

## 推荐调用流程

```
1. GET  /api/tap-choice/surveys/availability   → 是否有可用活动、可用题数
2. GET  /api/tap-choice/surveys/questions      → 拉取当前活动问题列表（含选项）
3. POST /api/tap-choice/surveys/answers        → 提交用户作答 / 跳过
```

外部 UI 可先调 **availability** 决定是否展示问卷；确认展示后再调 **questions** 渲染题目；用户操作完成后调 **answers** 保存结果。

---

## 公共参数说明

### `magnet_id`（必填）

| 字段 | 类型 | 说明 |
|------|------|------|
| `magnet_id` | number | magnet 表主键。用于定位品牌（`customer_id`）及记录答题来源。 |

### 用户标识（可选，建议至少传一种）

用于排除已答问题、Klaviyo Segment 匹配、答题去重。

| 字段 | 类型 | 说明 |
|------|------|------|
| `fc_user_id` | string | 已识别 FC 用户 ID |
| `anonymous_id` | string | 匿名用户标识 |
| `session_id` | string | 外部互动 session |
| `source_system` | string | 来源系统，如 `game_engine` / `coupon_flow` |

- GET 接口：以上字段通过 **Query String** 传递。
- POST 接口：以上字段放在 **JSON Body** 中。

> 若需按用户排除「已答过的问题」，必须传 `fc_user_id` 或 `anonymous_id` 之一。

---

## 活动匹配规则

1. `magnet_id` → `magnet` 表，获取 `customer_id`
2. 查询该品牌下 **已发布（`status = active`）** 且在有效期内的问卷活动
3. 若传了 `fc_user_id`，读取用户所属 Klaviyo Segment，用于 Segment 限定活动的匹配
4. 活动受众规则：
   - **未配置 Klaviyo Segment** → 视为 **全部用户**
   - **配置了 Segment** → 仅当用户属于其中任一 Segment 时命中
5. 多个活动同时命中时，按 **Segment 优先级 → 活动 priority → start_at** 取 1 个
6. 可用问题 = 活动中 `active` 问题，排除用户已 `answered` 的题，并受 `max_questions_per_user` 限制

---

## 1. 查询可用活动与问题数量

判断当前 magnet 下是否存在可展示的问卷活动，以及该用户还可回答几道题。

### 请求

```
GET /api/tap-choice/surveys/availability?magnet_id={magnet_id}
```

| 参数 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| `magnet_id` | query | number | 是 | magnet 主键 |
| `fc_user_id` | query | string | 否 | FC 用户 ID |
| `anonymous_id` | query | string | 否 | 匿名用户 ID |
| `session_id` | query | string | 否 | 外部 session |
| `source_system` | query | string | 否 | 来源系统 |

### 成功响应 `200`

**有可用活动且有题可答：**

```json
{
  "has_available_campaign": true,
  "survey_campaign": {
    "id": "8cc8ccdf-0037-4934-a1a0-d0800f7c70ce",
    "name": "test-survey",
    "campaign_goal": "preference",
    "question_order_policy": "fixed_order",
    "allow_skip": true,
    "max_questions_per_user": null
  },
  "available_question_count": 1,
  "reason": null
}
```

**无匹配活动：**

```json
{
  "has_available_campaign": false,
  "survey_campaign": null,
  "available_question_count": 0,
  "reason": "no_active_survey_campaign"
}
```

**有活动但无可用题（已答完或达上限）：**

```json
{
  "has_available_campaign": true,
  "survey_campaign": {
    "id": "8cc8ccdf-0037-4934-a1a0-d0800f7c70ce",
    "name": "test-survey",
    "campaign_goal": "preference",
    "question_order_policy": "fixed_order",
    "allow_skip": true,
    "max_questions_per_user": 3
  },
  "available_question_count": 0,
  "reason": "no_available_questions"
}
```

### 响应字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `has_available_campaign` | boolean | 是否命中可用问卷活动 |
| `survey_campaign` | object \| null | 命中的活动摘要；无活动时为 `null` |
| `available_question_count` | number | 当前用户还可展示/作答的问题数量 |
| `reason` | string \| null | 无可用时的原因码；正常时为 `null` |

### `reason` 取值

| 值 | 说明 |
|----|------|
| `null` | 正常，有可用题 |
| `no_active_survey_campaign` | 无匹配的已发布活动 |
| `no_available_questions` | 有活动，但用户已无未答题目 |

### 常见错误

| HTTP | 说明 |
|------|------|
| 401 | API Key 无效或缺失 |
| 400 | `magnet_id` 无效（`invalid_magnet_id`） |
| 404 | magnet 不存在（`magnet_not_found`） |
| 500 | 服务内部错误 |

### cURL 示例

```bash
curl --location --request GET \
  "http://localhost:8081/api/tap-choice/surveys/availability?magnet_id=2202" \
  --header "Authorization: Bearer YOUR_API_KEY"
```

带用户标识：

```bash
curl --location --request GET \
  "http://localhost:8081/api/tap-choice/surveys/availability?magnet_id=2202&fc_user_id=01KTP1G7DGX471G1HCEDXWMZKJ" \
  --header "Authorization: Bearer YOUR_API_KEY"
```

---

## 2. 获取当前活动问题列表

返回当前 magnet 命中的问卷活动下，用户尚未回答的问题列表（含选项）。

### 请求

```
GET /api/tap-choice/surveys/questions?magnet_id={magnet_id}
```

| 参数 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| `magnet_id` | query | number | 是 | magnet 主键 |
| `fc_user_id` | query | string | 否 | FC 用户 ID |
| `anonymous_id` | query | string | 否 | 匿名用户 ID |
| `session_id` | query | string | 否 | 外部 session |
| `source_system` | query | string | 否 | 来源系统 |

### 成功响应 `200`

```json
{
  "survey_campaign": {
    "id": "8cc8ccdf-0037-4934-a1a0-d0800f7c70ce",
    "name": "test-survey",
    "campaign_goal": "preference",
    "question_order_policy": "fixed_order",
    "allow_skip": true,
    "max_questions_per_user": null
  },
  "questions": [
    {
      "id": "4bcb5d4e-dcb7-4cb2-b560-1e1186ec98df",
      "text": "Which reward would you like to unlock this time?",
      "type": "single_choice",
      "display_order": 1,
      "allow_skip": true,
      "options": [
        {
          "id": "7928557c-53b2-44ea-a018-fd9f675b0c04",
          "label": "Free shipping",
          "value": "free_shipping",
          "display_order": 1,
          "is_other_option": false,
          "allow_text_input": false,
          "other_text_required": false,
          "text_input_placeholder": null,
          "max_text_length": 100
        },
        {
          "id": "a4ac440c-4632-4bef-a0c8-fae0398b1b6c",
          "label": "Other",
          "value": "other",
          "display_order": 4,
          "is_other_option": true,
          "allow_text_input": true,
          "other_text_required": true,
          "text_input_placeholder": "Tell us what you prefer",
          "max_text_length": 100
        }
      ]
    }
  ],
  "reason": null
}
```

**无活动时：**

```json
{
  "survey_campaign": null,
  "questions": [],
  "reason": "no_active_survey_campaign"
}
```

### 响应字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `survey_campaign` | object \| null | 命中的活动摘要 |
| `questions` | array | 可用问题列表，每项含 `options` |
| `reason` | string \| null | 同接口 1 |

### 问题 / 选项字段说明

**问题 `questions[]`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 问题 ID |
| `text` | string | 问题文案 |
| `type` | string | 题型，P0 固定为 `single_choice` |
| `display_order` | number | 展示顺序 |
| `allow_skip` | boolean | 是否允许跳过 |
| `options` | array | 选项列表 |

**选项 `options[]`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 选项 ID（提交时使用） |
| `label` | string | 用户可见文案 |
| `value` | string | 系统内部值（snake_case） |
| `is_other_option` | boolean | 是否为「其它」选项 |
| `allow_text_input` | boolean | 是否允许文本输入（仅 Other 可为 `true`） |
| `other_text_required` | boolean | Other 文本是否必填 |
| `text_input_placeholder` | string \| null | 输入框占位提示 |
| `max_text_length` | number | Other 文本最大长度 |

### 题目顺序

- `question_order_policy = fixed_order`：按 `display_order` 升序
- `question_order_policy = random`：随机顺序

### 常见错误

同接口 1。

### cURL 示例

```bash
curl --location --request GET \
  "http://localhost:8081/api/tap-choice/surveys/questions?magnet_id=2202" \
  --header "Authorization: Bearer YOUR_API_KEY"
```

---

## 3. 提交问卷结果

保存用户的作答或跳过记录。支持单条（`answer`）或批量（`answers`）提交。

每次成功提交会写入：

- `q_survey_impressions` — 展示记录
- `q_survey_answer_events` — 回答 / 跳过事件

### 请求

```
POST /api/tap-choice/surveys/answers
Content-Type: application/json
```

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `magnet_id` | number | 是 | magnet 主键 |
| `fc_user_id` | string | 否 | FC 用户 ID |
| `anonymous_id` | string | 否 | 匿名用户 ID |
| `session_id` | string | 否 | 外部 session |
| `source_system` | string | 否 | 来源系统 |
| `answer` | object | 二选一 | 单条作答（与 `answers` 二选一） |
| `answers` | array | 二选一 | 批量作答 |

**`answer` / `answers[]` 子字段：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `survey_campaign_id` | string | 是 | 活动 ID（来自 questions 响应） |
| `survey_question_id` | string | 是 | 问题 ID |
| `survey_option_id` | string | `action=answered` 时必填 | 选项 ID |
| `action` | string | 是 | `answered` 或 `skipped` |
| `other_text` | string | 否 | 仅 Other 选项且 `allow_text_input=true` 时可填 |
| `response_time_ms` | number | 否 | 作答耗时（毫秒） |

### 请求示例

**普通选项作答：**

```json
{
  "magnet_id": 2202,
  "fc_user_id": "01KTP1G7DGX471G1HCEDXWMZKJ",
  "session_id": "sess_abc",
  "source_system": "game_engine",
  "answer": {
    "survey_campaign_id": "8cc8ccdf-0037-4934-a1a0-d0800f7c70ce",
    "survey_question_id": "4bcb5d4e-dcb7-4cb2-b560-1e1186ec98df",
    "survey_option_id": "7928557c-53b2-44ea-a018-fd9f675b0c04",
    "action": "answered",
    "response_time_ms": 1800
  }
}
```

**Other 选项作答：**

```json
{
  "magnet_id": 2202,
  "fc_user_id": "01KTP1G7DGX471G1HCEDXWMZKJ",
  "answer": {
    "survey_campaign_id": "8cc8ccdf-0037-4934-a1a0-d0800f7c70ce",
    "survey_question_id": "4bcb5d4e-dcb7-4cb2-b560-1e1186ec98df",
    "survey_option_id": "a4ac440c-4632-4bef-a0c8-fae0398b1b6c",
    "action": "answered",
    "other_text": "Buy one get one free",
    "response_time_ms": 2500
  }
}
```

**跳过：**

```json
{
  "magnet_id": 2202,
  "fc_user_id": "01KTP1G7DGX471G1HCEDXWMZKJ",
  "answer": {
    "survey_campaign_id": "8cc8ccdf-0037-4934-a1a0-d0800f7c70ce",
    "survey_question_id": "4bcb5d4e-dcb7-4cb2-b560-1e1186ec98df",
    "action": "skipped"
  }
}
```

**批量提交：**

```json
{
  "magnet_id": 2202,
  "anonymous_id": "anon_xyz",
  "answers": [
    {
      "survey_campaign_id": "8cc8ccdf-0037-4934-a1a0-d0800f7c70ce",
      "survey_question_id": "4bcb5d4e-dcb7-4cb2-b560-1e1186ec98df",
      "survey_option_id": "7928557c-53b2-44ea-a018-fd9f675b0c04",
      "action": "answered"
    }
  ]
}
```

### 成功响应 `201`

```json
{
  "saved": [
    {
      "id": "f1a2b3c4-0000-4000-8000-000000000001",
      "impression_id": "e5d6f7a8-0000-4000-8000-000000000002",
      "survey_campaign_id": "8cc8ccdf-0037-4934-a1a0-d0800f7c70ce",
      "survey_question_id": "4bcb5d4e-dcb7-4cb2-b560-1e1186ec98df",
      "survey_option_id": "7928557c-53b2-44ea-a018-fd9f675b0c04",
      "action": "answered",
      "created_at": "2026-06-13T07:45:00.000Z"
    }
  ]
}
```

### 校验规则

1. `magnet_id` 必须存在，且与 `survey_campaign_id` 所属品牌一致
2. 活动须为 `active` 状态
3. 问题须属于该活动且为 `active`
4. `action = answered` 时 `survey_option_id` 必填，且须属于该问题
5. `other_text` 仅允许在 Other 选项（`is_other_option = true` 且 `allow_text_input = true`）下提交
6. `other_text` 长度不得超过选项的 `max_text_length`
7. 同一用户（`fc_user_id` 或 `anonymous_id`）对同一问题不可重复 `answered`
8. 问题不允许跳过时，不可提交 `action = skipped`

### 常见错误

| HTTP | 说明 |
|------|------|
| 401 | API Key 无效或缺失 |
| 400 | 参数缺失或校验失败（如 `invalid_action`、`invalid_other_text`、`other_text_required`） |
| 404 | magnet / 活动 / 问题 / 选项不存在 |
| 409 | 该题已作答（`question_already_answered`） |
| 500 | 服务内部错误 |

错误响应格式：

```json
{
  "error": "Question already answered"
}
```

### cURL 示例

```bash
curl --location --request POST \
  "http://localhost:8081/api/tap-choice/surveys/answers" \
  --header "Authorization: Bearer YOUR_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "magnet_id": 2202,
    "fc_user_id": "01KTP1G7DGX471G1HCEDXWMZKJ",
    "answer": {
      "survey_campaign_id": "8cc8ccdf-0037-4934-a1a0-d0800f7c70ce",
      "survey_question_id": "4bcb5d4e-dcb7-4cb2-b560-1e1186ec98df",
      "survey_option_id": "7928557c-53b2-44ea-a018-fd9f675b0c04",
      "action": "answered",
      "response_time_ms": 1800
    }
  }'
```

---

## 错误响应通用格式

```json
{
  "error": "错误描述信息"
}
```

---

## 与管理后台的关系

| 能力 | 管理后台 | 本 API |
|------|----------|--------|
| 创建 / 编辑活动 | `/survey-campaigns` Admin 页 | — |
| 发布活动 | Admin 点击 Publish | — |
| 查询可用性 | — | `GET .../availability` |
| 拉取问题 | — | `GET .../questions` |
| 保存作答 | — | `POST .../answers` |

活动须先在 Admin 中 **发布（active）** 且至少包含 1 道有效问题（每题 2–4 个选项），外部接口才会返回可用数据。

---

## 相关文档

- [问卷管理设计文档](./问卷管理设计文档.md) — 产品设计与数据模型
- [Magnet 发券 API](./Magnet%20发券%20API.md) — 同场景下的发券接口（鉴权方式一致）
