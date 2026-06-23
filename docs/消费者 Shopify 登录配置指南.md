# 消费者 Shopify 登录配置指南

面向 NFC / Magnet 扫码场景：让消费者在 FC 页面使用 **Shopify 顾客账号**登录，获取 `shopify_customer_id` 并与 FC 用户绑定。

> 本流程使用 **Customer Account API**（顾客 OAuth + PKCE），与品牌后台的 **Admin API OAuth**（Connect Shopify）是两套独立凭据，请勿混用。

---

## 一、架构概览

```
消费者扫 NFC
    ↓
/tap?shop=xxx.myshopify.com&tag_id=abc123        ← FC 消费者页面（独立于 Dashboard）
    ↓ 点击「使用 Shopify 账号登录」
GET /auth/shopify/customer/start                  ← FC 后端：生成 PKCE，302 跳转
    ↓
Shopify 顾客登录页（邮箱验证码）
    ↓
GET /shopify/customer/callback?code=...&state=...  ← FC 后端：换 token，查 customer，写库
    ↓
/tap?shop=...&login=success                       ← 回到 FC 页面
    ↓
GET /api/consumer/me                              ← 读取登录态，展示 shopify_customer_id
```

### 两套 Shopify 凭据对照

| 用途 | 凭据来源 | Client ID 格式 | 填到 FC 哪里 |
|------|----------|----------------|--------------|
| 品牌连店铺、发券、Webhook | Partners → 自定义 App | 32 位 hex，如 `d752c893...` | Brand Config → **Shopify OAuth** |
| 消费者登录、读顾客信息 | 店铺 → Headless → 顧客帳號 API | UUID，如 `56868ec0-561a-...` | Brand Config → **Customer Account API** |

**不需要**把 FC 应用上架到 Shopify App Store。  
**需要**在店铺安装 Shopify 官方的 **Headless** 销售渠道（不是你的 FC App）。

---

## 二、前置条件

### FC 服务端

- Node.js ≥ 20，`npm run dev` 可启动
- Supabase 已配置（`.env` 中 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 等）
- 已执行相关 migration（见下文「数据库」）
- 本地开发需 **HTTPS 公网地址**（ngrok 等），Shopify 不支持 `http://localhost` 作为 Customer Account 回调

### Shopify 店铺

- 已安装 **Headless** 销售渠道，并创建了无周边模式店面
- 已启用 **Customer accounts**（顾客账号）
- 品牌已在 FC **Brand Config** 中配置 Shop Domain（与 `/tap` 的 `shop` 参数一致）

---

## 三、Shopify 店铺侧配置

### 步骤 1：启用顾客账号

1. Shopify 后台 → **Settings（设置）**
2. **Customer accounts（顾客账户）**
3. 在「网店和结账中的账户」选择 **Customer accounts（顾客账户）**
4. 保存

### 步骤 2：安装并进入 Headless 店面

1. Shopify 后台 → **Sales channels（销售渠道）** → **Headless**
2. 创建或进入已有的 **无周边模式** 店面
3. 在「管理 API 存取權」中找到 **顧客帳號 API**，进入详细设置

### 步骤 3：配置客户端类型与凭据

在 **顧客帳號 API** 页面：

#### 用户端类型

| 类型 | 说明 | FC 当前支持 |
|------|------|-------------|
| **公开（网页应用程序）** | 无 Client Secret，靠 PKCE 换 token | ✅ 支持（Secret 可留空） |
| **机密（Confidential）** | 有 Client Secret，换 token 时需 Basic 认证 | ✅ 支持 |

> 若选「公开」类型，页面上通常**只显示 Client ID（UUID）**，不显示 Secret，这是正常现象。

在 **顧客帳號 API 凭据** 中复制：

- **用户端 ID（Client ID）**：UUID 格式，例如 `56868ec0-561a-45a3-b46b-59a41d51e13c`

若使用机密类型，还需复制 **用户端密钥（Client Secret）**（轮换凭据时可能只显示一次，请立即保存）。

#### 权限（第一版最低要求）

至少勾选：

- `customer_read_customers` — 读取顾客详细信息

后续如需查订单，再增加 `customer_read_orders` 等。

### 步骤 4：配置应用端点（Application setup）

在 **應用程式設定** 中填写并**提交**：

| 字段 | 值 | 说明 |
|------|-----|------|
| **回呼 URI（Callback URL）** | `{SHOPIFY_APP_HOST}/shopify/customer/callback` | 必填，必须 HTTPS |
| **Javascript 来源** | `{SHOPIFY_APP_HOST 的 origin}` | 必填，仅 origin，无路径 |
| **登出 URI** | 可选 | 第一版可不填 |

示例（ngrok 开发环境）：

```
回呼 URI:     https://perversive-latia-coevally.ngrok-free.dev/shopify/customer/callback
Javascript:   https://perversive-latia-coevally.ngrok-free.dev
```

注意：

- 必须与 `.env` 中 `SHOPIFY_APP_HOST` **完全一致**（含 `https://`，无末尾 `/`）
- 修改 ngrok 域名后，需同步更新 Shopify 与 `.env`

### 步骤 5：记录 OAuth 端点（供参考）

Headless 页面会显示（FC 后端会自动 discovery，一般无需手写）：

```
授权端点: https://shopify.com/authentication/{shop_id}/oauth/authorize
权杖端点: https://shopify.com/authentication/{shop_id}/oauth/token
登出端点: https://shopify.com/authentication/{shop_id}/logout
```

---

## 四、FC 服务端配置

### 环境变量（`.env`）

```bash
# 公网 HTTPS 地址（本地开发用 ngrok）
SHOPIFY_APP_HOST=https://your-ngrok-domain.ngrok-free.dev

PORT=8081

SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...

SECRETS_PROVIDER=supabase_vault   # 或 env（本地调试）
```

`SHOPIFY_APP_HOST` 同时用于：

- 商户 Admin OAuth 回调：`/api/shopify/oauth/callback`
- 消费者 Customer Account 回调：`/shopify/customer/callback`

### 数据库 Migration

确保已应用以下 migration（Supabase SQL 或 `supabase db push`）：

| Migration 文件 | 作用 |
|----------------|------|
| `20260611130000_shopify_customer_oauth.sql` | 扩展 `fc_user_identity`（`shop_domain`、token 字段） |
| `20260611140000_shopify_customer_account_credentials.sql` | `customer_shopify_config` 增加 Customer Account 凭据列 |

关键列：

```sql
-- customer_shopify_config
shopify_customer_account_client_id
shopify_customer_account_client_secret_ref

-- fc_user_identity（登录成功后写入）
shop_domain
shopify_customer_id
email
customer_access_token
refresh_token
token_expires_at
```

OAuth 临时 session（`state` / `code_verifier`）存在**进程内存**，10 分钟 TTL，无需建表。

---

## 五、FC Brand Config 配置

1. 登录品牌后台：`/login`
2. 打开：`/brand-config`
3. 配置两个独立区块：

### 区块 A：Shopify OAuth（Admin API，品牌用）

用于 Connect Shopify、发券、Webhook 等。

| 字段 | 来源 |
|------|------|
| Shop Domain | `your-store.myshopify.com` |
| Client ID | Partners → 自定义 App（32 位 hex） |
| Client Secret | Partners → 自定义 App |

点击 **Connect Shopify** 完成商户授权。

### 区块 B：Customer Account API（消费者登录）

| 字段 | 来源 | 必填 |
|------|------|------|
| Customer Account Client ID | Headless → 顧客帳號 API → UUID | ✅ |
| Customer Account Client Secret | 同上（仅机密类型需要） | 公开类型可留空 |

点击 **Save Customer Account credentials** 保存。

> **Shop Domain 必须与消费者链接中的 `shop` 参数一致**，例如 `kwqtd1-cm.myshopify.com`。

---

## 六、消费者页面与入口

### 页面地址

```
GET /tap?shop={shop_domain}&tag_id={tag_id}
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `shop` | 是 | 店铺域名，如 `kwqtd1-cm.myshopify.com` |
| `tag_id` | 否 | NFC 标签 ID，OAuth 完成后会带回 |
| `magnet_id` | 否 | Magnet 主键（数字），与 `tag_id` 二选一或并存 |

示例：

```
https://perversive-latia-coevally.ngrok-free.dev/tap?shop=kwqtd1-cm.myshopify.com&tag_id=abc123
```

### 静态资源

消费者端与 Dashboard **完全独立**，代码位于 `src/fc/`：

| URL | 文件 |
|-----|------|
| `/tap` | `src/fc/index.html` |
| `/fc/styles/tap.css` | 样式 |
| `/fc/components/tap.jsx` | 页面逻辑 |

### 登录成功标准（第一版）

页面显示：

- 「你已通过 Shopify 登录 FC」
- `shopify_customer_id`（如 `gid://shopify/Customer/123456789`）
- 顾客邮箱（若有）

---

## 七、API 接口

### 1. 发起 Shopify 顾客登录

```
GET /auth/shopify/customer/start?shop={shop_domain}&tag_id={tag_id}
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `shop` | 是 | 店铺域名 |
| `tag_id` | 否 | 透传到回调后重定向 |
| `magnet_id` | 否 | 数字型 magnet ID |

**行为**：生成 `state` / `nonce` / PKCE，302 跳转 Shopify 授权页。

### 2. Shopify OAuth 回调（由 Shopify 调用）

```
GET /shopify/customer/callback?code={code}&state={state}
```

**行为**：

1. 校验 `state`（内存，10 分钟有效）
2. 用 `code` + `code_verifier` 换 `access_token`
3. 调 Customer Account GraphQL 查询 `customer.id` / `email`
4. 写入或更新 `fc_user_identity`
5. 设置 `fc_consumer_session` Cookie
6. 302 重定向到 `/tap?shop=...&login=success`

### 3. 查询当前消费者登录态

```
GET /api/consumer/me
```

需携带 Cookie：`fc_consumer_session`。

**成功 `200`：**

```json
{
  "loggedIn": true,
  "fcUserId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "shopDomain": "kwqtd1-cm.myshopify.com",
  "shopifyCustomerId": "gid://shopify/Customer/123456789",
  "email": "user@example.com",
  "magnetId": null
}
```

**未登录 `401`：**

```json
{ "error": "Not logged in" }
```

---

## 八、完整开通检查清单

按顺序勾选：

- [ ] Shopify 已启用 **Customer accounts**
- [ ] 已安装 **Headless** 并创建店面
- [ ] Headless → 顧客帳號 API 已配置 **回呼 URI** 与 **Javascript 来源**
- [ ] 已复制 UUID 格式的 **Customer Account Client ID**
- [ ] `.env` 中 `SHOPIFY_APP_HOST` 为 HTTPS 公网地址
- [ ] Supabase migration 已执行
- [ ] Brand Config → Shop Domain 与 `shop` 参数一致
- [ ] Brand Config → Customer Account API 已保存 Client ID
- [ ] 打开 `/tap?shop=...` 可看到登录按钮
- [ ] 登录后 `/api/consumer/me` 返回 `shopifyCustomerId`

---

## 九、常见问题排查

### 1. 「提供的客户端凭据无效或缺失」（Shopify 授权页）

**原因**：用了 Admin API 的 32 位 Client ID，而非 Headless 的 UUID。

**处理**：确认授权 URL 中 `client_id` 为 UUID；在 Brand Config → Customer Account API 填写正确 ID。

---

### 2. `Customer Account API client_id is not configured`

**原因**：

- Brand Config 未保存 Customer Account Client ID；或
- 数据库 migration 未执行，列 `shopify_customer_account_client_id` 不存在

**处理**：执行 migration；在 Brand Config 保存 UUID Client ID。

---

### 3. 换 token 失败（登录后回到 FC 报错）

**可能原因**：

| 原因 | 处理 |
|------|------|
| 回呼 URI 与 Shopify 配置不一致 | 核对两边 URL 完全一致 |
| Javascript 来源未配置 | 在 Headless 应用设定中补上 origin |
| 机密类型但未填 Secret | 在 Brand Config 填写 Secret |
| 公开类型但代码要求 Secret | 当前版本已支持无 Secret（纯 PKCE） |
| 服务重启导致 state 丢失 | 重新点击登录（OAuth session 在内存中） |

---

### 4. `shop` 与数据库配置不匹配

消费者链接中的 `shop=kwqtd1-cm.myshopify.com` 必须在 `customer_shopify_config.shop_domain` 中有对应记录，且已保存 Customer Account Client ID。

---

### 5. 删除 Headless 店面

删除店面会导致 **所有 Customer Account API 凭据失效**，需重新配置并更新 Brand Config。

---

## 十、与后续能力的衔接

登录成功并拿到 `shopify_customer_id` 后，可继续接入：

- Magnet 发券：`GET /api/coupon-campaigns/available`、`POST /api/coupons/realtime-single`（支持 `campaign_id` 单张或 `campaign_ids` 批量）
- 订单核销 Webhook
- 复购任务

绑定关系保存在 `fc_user_identity`：

```
shop_domain + shopify_customer_id  →  fc_user_id
```

唯一键为 `shop_domain` + `shopify_customer_id`，不要仅用 email 识别顾客。

---

## 十一、相关代码路径

| 模块 | 路径 |
|------|------|
| OAuth 路由处理 | `src/api/shopify-customer-oauth.ts` |
| Customer Account API 客户端 | `src/shopify/customer-account.api.ts` |
| 消费者 Session Cookie | `src/lib/auth/consumer-session.ts` |
| 消费者页面 | `src/fc/` |
| 静态托管 | `src/api/serve-fc-static.ts` |
| Brand Config 服务 | `src/services/brand-config.service.ts` |
| 路由注册 | `src/index.ts` |

---

## 十二、参考链接

- [Shopify — Getting started with the Customer Account API](https://shopify.dev/docs/storefronts/headless/building-with-the-customer-account-api/getting-started)
- [Shopify — Authenticate customers with the Customer Account API](https://shopify.dev/docs/storefronts/headless/building-with-the-customer-account-api/authenticate-customers)
- [Shopify — Customer Account API reference](https://shopify.dev/docs/api/customer/latest)
