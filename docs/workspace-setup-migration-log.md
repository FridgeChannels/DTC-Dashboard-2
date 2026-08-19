# Workspace Setup 模块迁移变量日志

> 生成日期：2026-08-19  
> 用途：跨分支迁移「Set up your workspace」三步引导（Brand Info → Shopify → Klaviyo）时的人工审核清单。

---

## 1. 变更摘要

| 项目 | 说明 |
|------|------|
| 拆分目标 | 将 onboarding 完整逻辑从 `admin.jsx` 抽离为独立 `workspace-setup/` 模块 |
| 对外入口 | `window.WorkspaceSetup`（Babel UMD 全局，与现有 dashboard 一致） |
| admin.jsx 变化 | 删除 ~170 行内联逻辑，改为解构 `WorkspaceSetup` API |
| 行为变化 | **无** — 路由、进度计算、OAuth 回跳、Skip 语义均保持不变 |

---

## 2. 新增文件清单（整目录复制）

迁移到其他分支时，复制整个目录：

```
src/dashboard/components/workspace-setup/
├── constants.jsx       # 常量、步骤定义、section ↔ step 映射
├── setup-routing.jsx   # /onboarding 路由与 history 栈
├── setup-progress.jsx  # 进度 fetch / 计算 / useSetupProgress hook
├── setup-nav.jsx       # 侧栏「Finish setup · n/3」条目
├── onboarding.jsx      # OnboardingPage UI 壳层
└── index.jsx           # 聚合为 window.WorkspaceSetup
```

---

## 3. 需同步修改的宿主文件

### 3.1 `src/dashboard/admin.html`

在 `admin.jsx` **之前**按顺序插入 6 个 script（必须在 `brand-collect.jsx`、`brand-config.jsx` 之后）：

```html
<script type="text/babel" src="components/workspace-setup/constants.jsx?v=20260819-workspace-setup"></script>
<script type="text/babel" src="components/workspace-setup/setup-routing.jsx?v=20260819-workspace-setup"></script>
<script type="text/babel" src="components/workspace-setup/setup-progress.jsx?v=20260819-workspace-setup"></script>
<script type="text/babel" src="components/workspace-setup/setup-nav.jsx?v=20260819-workspace-setup"></script>
<script type="text/babel" src="components/workspace-setup/onboarding.jsx?v=20260819-workspace-setup"></script>
<script type="text/babel" src="components/workspace-setup/index.jsx?v=20260819-workspace-setup"></script>
```

### 3.2 `src/dashboard/components/admin.jsx`

在文件顶部增加解构（`admin.jsx` 加载时 `window.WorkspaceSetup` 必须已存在）：

```javascript
const {
  ONBOARDING_SECTION,
  SESSION_KEY_COMPLETION_PENDING,
  OnboardingPage,
  useSetupProgress,
  openOnboarding,
  ensureOnboardingBackTarget,
  buildOnboardingNavGroup,
  computeNextSetupSection,
  stepIdForSection,
  isOnboardingRoute,
} = window.WorkspaceSetup;
```

并从 `admin.jsx` 中**删除**以下内联实现（若目标分支仍有，应移除以避免重复）：

- `ONBOARDING_SECTION` 常量定义
- `onboardingPath` / `replaceOnboardingStep` / `openOnboarding` / `ensureOnboardingBackTarget`
- `localBrandInfo`
- `OnboardingPage` 组件
- `loadBrandInfoStatus` / `refreshConnections` / `setupProgress` 内联计算
- `buildNavGroups` 内的 onboarding 条目硬编码

改用：

- `useSetupProgress({ authLoading, authUser })` 获取 `connections`、`brandInfo`、`setupLoaded`、`setupProgress`、`refresh`
- `buildOnboardingNavGroup(setupProgress)` 替代侧栏 Finish setup 块
- `isOnboardingRoute()` 替代 `pathname === "/onboarding"` 判断
- `stepIdForSection(nextSetupSection)` 替代 `brand-collect ? "brand" : sectionId` 三元
- `SESSION_KEY_COMPLETION_PENDING` 替代硬编码 `"fc-onboarding-completion-pending"`

---

## 4. `window.WorkspaceSetup` 公开 API 变量表

### 4.1 常量（来自 `constants.jsx`）

| 变量名 | 值 / 类型 | 用途 |
|--------|-----------|------|
| `ONBOARDING_SECTION` | `{ id: "onboarding", label: "Finish setup" }` | 导航 section id |
| `SETUP_STEP_IDS` | `{ brand: "brand", shopify: "shopify", klaviyo: "klaviyo" }` | URL `?step=` 参数 |
| `SETUP_SECTION_IDS` | `{ brand: "brand-collect", shopify: "shopify", klaviyo: "klaviyo" }` | BrandConfig / BrandCollect section |
| `SETUP_STEPS` | 3 步数组（id, label, sectionId） | OnboardingPage 步骤定义 |
| `BRAND_INFO_REQUIRED_FIELDS` | 5 个字段名数组 | Brand Info 完成判定字段 |
| `SESSION_KEY_COMPLETION_PENDING` | `"fc-onboarding-completion-pending"` | Klaviyo OAuth 成功后暂存完成页 |
| `LOCAL_STORAGE_BRAND_INFO` | `"fc-brand-info"` | Brand Info 本地 fallback |
| `BRAND_INFO_SAVED_EVENT` | `"brand-info-saved"` | BrandCollect 保存后刷新进度 |

### 4.2 纯函数

| 函数名 | 签名 | 说明 |
|--------|------|------|
| `stepIdForSection` | `(sectionId) → "brand"\|"shopify"\|"klaviyo"` | section id → URL step |
| `onboardingPath` | `(step) → "/onboarding?step=..."` | 构建 onboarding URL |
| `replaceOnboardingStep` | `(step) → void` | replaceState 更新 step |
| `openOnboarding` | `(step) → void` | pushState 打开引导（保留 Dashboard 为 back 目标） |
| `ensureOnboardingBackTarget` | `() → void` | 页面加载时修复 history 栈 |
| `isOnboardingRoute` | `() → boolean` | 是否在 onboarding 路由 |
| `initialStepFromUrl` | `(validStepIds, fallback) → stepId` | 从 URL 解析初始 step |
| `localBrandInfo` | `() → object\|null` | 读 localStorage brand fallback |
| `computeBrandInfoStatus` | `(brand) → { completedFields, complete }` | 5 字段完成度 |
| `computeConnections` | `(brandConfigApiData) → { shopifyReady, klaviyoReady }` | 连接状态 |
| `buildSetupProgress` | `(brandInfo, connections) → progress` | 合成 n/3 进度对象 |
| `computeNextSetupSection` | `(brandInfo, connections, dashboardSectionId) → sectionId` | 下一未完成 section |
| `buildOnboardingNavGroup` | `(setupProgress) → navGroup[]` | 侧栏 Finish setup 组（完成时 `[]`） |

### 4.3 React Hook / 组件

| 名称 | 类型 | 说明 |
|------|------|------|
| `useSetupProgress` | Hook | 入参 `{ authLoading, authUser }`；返回 connections / brandInfo / setupLoaded / setupProgress / refresh 等 |
| `OnboardingPage` | 组件 | Props: `progress`, `skipped`, `onSkipStep`, `onExit`, `onRefresh`, `brandInfoReadOnly`, `configReadOnly` |

### 4.4 `setupProgress` 对象形状

```javascript
{
  brandComplete: boolean,    // 5 个 Brand Info 字段均已填
  shopifyComplete: boolean,    // hasAccessToken && shopDomain
  klaviyoComplete: boolean,    // hasOAuthToken
  completed: number,           // 0–3
  complete: boolean,           // 三步全部完成
}
```

---

## 5. 外部依赖（目标分支必须已有）

| 依赖 | 位置 | 说明 |
|------|------|------|
| `BrandCollectPage` | `brand-collect.jsx` | Brand Info 表单；需支持 `onSkip` / `onSaved` |
| `BrandConfigPage` | `brand-config.jsx` | Shopify/Klaviyo；需支持 `onboardingReturnTo` prop |
| `I.navBrand` | `shared.jsx` | 侧栏图标 |
| React 18 UMD | `admin.html` | 全局 `React` |
| `GET /api/config` | 后端 | 读 Brand Info |
| `GET /api/brand-config` | 后端 | 读 Shopify/Klaviyo 连接状态 |
| `POST` Shopify/Klaviyo OAuth | `shopify-oauth.ts`, `klaviyo-oauth.ts` | `returnTo` 必须以 `/onboarding?` 开头 |
| `/onboarding` 静态路由 | `serve-static.ts` | 映射到 `admin.html` |
| `.onboarding-*` CSS | `styles/styles.css` L3723–3738, L3988–3989 | 引导页样式 |

---

## 6. 不随模块迁移、但需确认存在的后端/样式片段

### 6.1 `src/api/serve-static.ts`

```typescript
pathname === "/onboarding" ||
```

### 6.2 OAuth returnTo 白名单

`shopify-oauth.ts` / `klaviyo-oauth.ts`：

```typescript
value.startsWith("/onboarding?")
```

### 6.3 `brand-config.jsx` 中的 onboarding 集成

- prop：`onboardingReturnTo`
- OAuth 启动时传入：`API.startShopifyOAuth({ returnTo: onboardingReturnTo })`
- OAuth 启动时传入：`API.startKlaviyoOAuth({ returnTo: onboardingReturnTo })`

### 6.4 CSS（若目标分支无 onboarding 样式，复制以下选择器）

- `.onboarding-shell`
- `.onboarding-frame`
- `.onboarding-header`
- `.onboarding-progress-list`（含 `li.current` / `li.complete`）
- `.onboarding-body`
- `.onboarding-footer`
- 移动端 `@media` 内 onboarding 规则

---

## 7. 脚本加载顺序约束

```
shared.jsx          → I.navBrand 等图标
brand-config.jsx    → BrandConfigPage
brand-collect.jsx   → BrandCollectPage
workspace-setup/*   → 6 个文件，顺序固定
admin.jsx           → 消费 WorkspaceSetup
```

违反顺序会导致 `window.WorkspaceSetup` 或 `BrandCollectPage` 未定义报错。

---

## 8. 人工验收检查表

- [ ] 新用户首次登录（`isFirstLogin`）自动打开 `/onboarding?step=brand`
- [ ] 三步进度条显示 `1 Brand Info` / `2 Connect Shopify` / `3 Connect Klaviyo`
- [ ] Brand Info 保存后自动跳到 Shopify step
- [ ] Shopify OAuth 成功后 URL 含 `shopify_oauth=success`，自动跳到 Klaviyo
- [ ] Klaviyo OAuth 成功后显示「Your workspace is ready」完成页
- [ ] Skip for now 可跳过当前步，侧栏仍显示 `Finish setup · n/3`
- [ ] 三步全部完成后侧栏不再显示 Finish setup
- [ ] 已完成用户访问 `/onboarding?step=shopify` 会被重定向到 Dashboard
- [ ] 浏览器后退从 onboarding 回到 Dashboard（history 栈正确）

---

## 9. 已知不变量（迁移时勿改）

| 键 / 路径 | 值 |
|-----------|-----|
| onboarding URL | `/onboarding?step=brand\|shopify\|klaviyo` |
| history state flag | `fcOnboarding: true` |
| sessionStorage 完成暂存 | `fc-onboarding-completion-pending` |
| Brand Info 完成条件 | 5 字段：`brandName`, `website`, `brandLogo`, `primaryColor`, `secondaryColor\|accentColor` |
| Shopify 就绪条件 | `hasAccessToken && shopDomain` |
| Klaviyo 就绪条件 | `hasOAuthToken` |

---

## 10. 快速迁移命令参考

```bash
# 复制模块目录
cp -R src/dashboard/components/workspace-setup/ <目标分支>/src/dashboard/components/workspace-setup/

# 对比 admin 集成差异
diff src/dashboard/components/admin.jsx <目标分支>/src/dashboard/components/admin.jsx
diff src/dashboard/admin.html <目标分支>/src/dashboard/admin.html
```

---

## 11. 回滚方式

1. 删除 `workspace-setup/` 目录  
2. 恢复 `admin.html` 中 6 行 script  
3. 用 git 恢复 `admin.jsx` 至拆分前版本  

拆分前 onboarding 逻辑全部在 `admin.jsx` L11、L67–78、L149–192、L407–475、L537–622。
