# 冷链验证报告生成系统

基于 Next.js 15、React 19、TypeScript 和 Tailwind CSS 构建的冷链验证报告生成和管理系统。

## 技术栈

- **前端框架**: Next.js 15 (App Router)
- **UI 库**: React 19
- **类型系统**: TypeScript
- **样式**: Tailwind CSS
- **数据库**: MongoDB
- **认证**: JWT (JSON Web Token)

## 功能特性

### 1. 用户认证
- 用户登录/注册
- JWT Token 认证
- 自动登录（注册成功后）

### 2. 任务管理
- 任务分类管理（多级分类树）
- 任务列表（表格形式）
- 任务创建、编辑、删除
- 响应式布局（左侧可折叠菜单）

### 3. 模板管理
- 模板分类管理（多级分类树）
- 模板列表
- Markdown 编辑器（实时预览）
- 自动保存功能

### 4. 全局导航
- 顶部固定导航栏
- 任务管理/模板管理切换
- 用户下拉菜单（个人中心、退出登录）

## 安装和运行

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

创建 `.env.local` 文件，添加以下内容：

```env
MONGODB_URI=mongodb://mongo_HXK77M:mongo_dt7dYx@192.168.11.88:27017/coldverifreport?authSource=admin
JWT_SECRET=coldverifreport_secret_key_2024
NEXTAUTH_URL=http://localhost:3000
```

### 3. 运行开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

### 4. 构建生产版本

```bash
npm run build
npm start
```

## 项目结构

```
coldverifreport-server/
├── app/                    # Next.js App Router 页面
│   ├── api/                # API 路由
│   │   ├── auth/          # 认证相关 API
│   │   ├── categories/    # 分类 API
│   │   ├── tasks/         # 任务 API
│   │   └── templates/     # 模板 API
│   ├── login/             # 登录/注册页面
│   ├── tasks/             # 任务管理页面
│   ├── templates/         # 模板管理页面
│   ├── profile/           # 个人中心页面
│   ├── layout.tsx         # 根布局
│   └── page.tsx           # 首页（重定向到任务管理）
├── components/            # React 组件
│   ├── Navbar.tsx         # 导航栏组件
│   ├── Layout.tsx          # 布局组件
│   ├── CategoryTree.tsx   # 分类树组件
│   └── MarkdownEditor.tsx # Markdown 编辑器组件
├── lib/                   # 工具库
│   ├── mongodb.ts         # MongoDB 连接
│   ├── auth.ts            # 认证工具
│   └── models/            # 数据模型
│       ├── User.ts        # 用户模型
│       ├── Category.ts    # 分类模型
│       ├── Task.ts        # 任务模型
│       └── Template.ts    # 模板模型
└── package.json           # 项目配置
```

## 数据库结构

### Users (用户)
- `_id`: ObjectId
- `username`: String (唯一)
- `password`: String (加密)
- `createdAt`: Date

### Categories (分类)
- `_id`: ObjectId
- `name`: String
- `parentId`: String | null
- `type`: 'task' | 'template'
- `userId`: String
- `createdAt`: Date
- `updatedAt`: Date

### Tasks (任务)
- `_id`: ObjectId
- `taskNumber`: String (任务编号)
- `taskName`: String (任务名称)
- `categoryId`: String (分类 ID)
- `taskTypeId`: String (任务类型 ID)
- `userId`: String
- `createdAt`: Date
- `updatedAt`: Date

### Templates (模板)
- `_id`: ObjectId
- `name`: String
- `content`: String (Markdown 内容)
- `categoryId`: String
- `userId`: String
- `createdAt`: Date
- `updatedAt`: Date

## 使用说明

1. **首次使用**: 访问登录页面，注册新用户账号
2. **登录**: 使用用户名和密码登录系统
3. **任务管理**: 
   - 在左侧创建任务分类
   - 在右侧创建和管理验证任务
4. **模板管理**:
   - 在左侧创建模板分类
   - 创建模板并编辑 Markdown 内容
   - 支持实时预览和自动保存

## 注意事项

- 确保 MongoDB 服务正常运行
- 生产环境请修改 `JWT_SECRET` 为更安全的密钥
- 建议在生产环境启用 HTTPS

## 许可证

MIT


