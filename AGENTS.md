# AGENTS.md

## 项目概览
直播代运营管理系统——面向直播代运营团队的内部管理工具。3品牌8账号，4种角色（PM/运营/中控/主播），涵盖排班、成本、考勤、工作台等核心模块。

## 技术栈
- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (Radix UI)
- **Styling**: Tailwind CSS 4 + 深色主题
- **数据存储**: localStorage（后续可扩展后端）
- **Excel 解析**: xlsx 库

## 目录结构
```
src/
├── app/                    # 页面路由
│   ├── page.tsx            # Dashboard 首页
│   ├── layout.tsx          # 根布局（AppProvider + AppShell + ThemeSetter）
│   ├── globals.css         # 全局样式 + 品牌色 CSS 变量
│   ├── schedule/           # M1 排班管理
│   ├── cost/               # M3 成本核算
│   ├── attendance/         # M4 考勤管理
│   ├── workstation/        # M8 主播工作台
│   ├── feedback/           # 问题反馈（中控）
│   ├── data-report/        # 数据报表（占位）
│   ├── visual/             # 视觉对接（占位）
│   └── sop/                # SOP管理（占位）
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx    # 应用外壳（Header + Sidebar + Main）
│   │   ├── AppSidebar.tsx  # 侧边栏导航 + 角色/品牌切换器
│   │   └── ThemeSetter.tsx # 客户端暗色主题注入
│   └── ui/                 # shadcn/ui 组件库
├── contexts/
│   └── AppContext.tsx      # 全局状态（品牌/角色/isClient）
└── lib/
    ├── types.ts            # 全部类型定义
    ├── constants.ts        # 品牌配置/角色权限/模块映射
    ├── store.ts            # localStorage CRUD + 利润率计算
    └── utils.ts            # cn() 工具
```

## 构建与测试命令
- `pnpm install` — 安装依赖
- `pnpm run dev` — 开发模式（端口 5000）
- `pnpm run build` — 生产构建
- `pnpm ts-check` / `pnpm lint --quiet` — 静态检查

## 编码规范
- TypeScript strict 模式，禁止隐式 any
- `use client` + `useEffect` 保护所有 localStorage/Date 调用
- 不在 JSX 渲染逻辑中直接使用 `new Date()` / `typeof window`
- 统一使用 `isClient` 状态守卫避免 SSR/CSR 不一致
- 深色主题通过 Tailwind `dark:` class 实现，`<html>` 上由 ThemeSetter 客户端添加 `dark` class
- 组件优先使用 shadcn/ui

## 业务逻辑要点
- 3品牌：vivo（3账号）、iQOO（3账号）、IOT（2账号）
- 排班冲突检测：`checkScheduleConflict()` 检查同一人同一时段
- 成本六大项 + 收入(时长×小时费) + KPI扣减5% → 利润率
- 考勤支持钉钉Excel导入，排班对比功能
- 角色权限控制侧边栏可见模块

## 常见问题修复
- Hydration Error → 确保 localStorage/Date 在 useEffect 中调用，SSR 返回固定占位
- Turbopack 缓存损坏 → `rm -rf .next` 后重启 dev server
- dark class 不生效 → 检查 ThemeSetter 是否正确注入
