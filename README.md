# 智慧蜂场管理系统 (SmartHive Connect)

一个基于 React + Node.js + MySQL 的智能蜂场监控系统，支持实时数据采集、AI分析和可视化展示。

## 📋 系统要求

- **Node.js**: 版本 18.0 或更高（推荐使用 20.x）
- **MySQL**: 版本 5.7 或更高（8.0 推荐）
- **操作系统**: Windows 10/11（本项目已针对 Windows 优化）

## 🚀 快速开始

### 📦 前置要求

在开始之前，请确保已安装：

1. **Node.js**（版本 18.0 或更高，推荐 20.x）
   - 下载地址：https://nodejs.org/
   - 安装后验证：打开命令行输入 `node --version`

2. **MySQL**（版本 5.7 或更高，推荐 8.0）
   - 下载地址：https://dev.mysql.com/downloads/mysql/
   - 安装时记住 root 密码
   - 确保 MySQL 服务正在运行

### 🎯 启动项目（两种方式）

#### 方式一：使用 npm start（同时启动前后端）

```bash
# 1. 安装依赖（首次运行）
npm install

# 2. 配置 .env 文件（参考 env.example）

# 3. 启动项目
npm start
```

#### 方式二：分别启动（适合调试）

**启动后端（第一个命令行窗口）：**
```bash
npm run dev:server
```

**启动前端（第二个命令行窗口）：**
```bash
npm run dev
```

然后访问：http://localhost:5173

### ⚙️ 配置说明

#### 创建 .env 文件

如果项目中没有 `.env` 文件，可以：

1. 复制 `env.example` 文件并重命名为 `.env`
2. 或者运行 `启动项目.bat`，会自动创建

#### 修改 .env 配置

```env
# 后端服务器配置
PORT=3001
API_TOKEN=123456789  # 生产环境请修改为复杂密码

# MySQL数据库配置
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=你的MySQL密码  # ⚠️ 必须修改
DB_NAME=smarthive
DB_PORT=3306

# 通义千问 API（可选，用于AI分析）
QWEN_API_KEY=你的API密钥
```

## 📁 项目结构

```
项目根目录/
├── components/          # React 组件
│   ├── AIAnalysisPanel.tsx
│   ├── AdminDashboard.tsx
│   ├── BehaviorInsights.tsx
│   ├── ConnectionHeader.tsx
│   ├── DataAnalysisPanel.tsx
│   ├── DetailedAnalytics.tsx
│   ├── EventLog.tsx
│   ├── HistoryCharts.tsx
│   ├── Login.tsx
│   ├── ProductivityPanel.tsx
│   ├── SensorGrid.tsx
│   └── WeatherWidget.tsx
├── services/            # 服务层
│   ├── databaseService.ts  # 数据库服务
│   ├── dataService.ts      # 数据服务
│   └── qwenService.ts       # AI 服务（通义千问）
├── server.ts           # 后端服务器入口
├── App.tsx             # 前端应用入口
├── index.tsx           # React 应用入口
├── types.ts            # TypeScript 类型定义
├── package.json        # 项目依赖配置
├── vite.config.ts      # Vite 构建配置
├── tsconfig.json       # TypeScript 配置
├── tsconfig.server.json # 服务器 TypeScript 配置
├── ecosystem.config.js # PM2 进程管理配置
├── env.example         # 环境变量模板
└── .env                # 环境变量配置（需要自己创建）
```

## 🔧 常见问题

### 1. 端口被占用

如果遇到端口被占用的错误：

- **后端端口 3001 被占用**：修改 `.env` 文件中的 `PORT=3001` 为其他端口（如 `PORT=3002`）
- **前端端口 5173 被占用**：修改 `vite.config.ts` 中的 `port: 5173` 为其他端口

### 2. 数据库连接失败

**错误信息**：`Database connection error` 或 `ER_ACCESS_DENIED_ERROR`

**解决方法**：
1. 确认 MySQL 服务正在运行
2. 检查 `.env` 文件中的数据库配置是否正确
3. 确认 MySQL root 密码是否正确
4. 如果 MySQL 运行在非默认端口，请修改 `DB_PORT`

### 3. 找不到模块错误

如果遇到 `Cannot find module` 错误：

```bash
# 删除 node_modules 文件夹和 package-lock.json
rmdir /s node_modules
del package-lock.json

# 重新安装依赖
npm install
```

### 4. 前端页面空白

1. 检查后端服务器是否正常运行（访问 http://localhost:3001/api/health）
2. 打开浏览器开发者工具（F12），查看控制台是否有错误
3. 确认 `.env` 文件中的 `API_TOKEN` 配置正确

### 5. 数据库表自动创建

项目首次启动时会自动创建数据库和表结构，如果数据库不存在会自动创建。如果遇到权限问题，请确保 MySQL root 用户有创建数据库的权限。

## 🎯 功能说明

### 实时监控
- 温度、湿度、重量等传感器数据实时显示
- 蜜蜂进出数量统计
- 胡蜂检测
- GPS 位置信息

### 数据分析
- 历史数据趋势图表
- AI 健康分析（使用通义千问 Qwen API，适合国内用户）
- 行为洞察
- 生产力分析

### 系统管理
- 连接状态监控
- 数据同步
- 配置管理

## 📝 开发说明

### 构建生产版本

```bash
# 构建前端（输出到 dist/ 目录）
npm run build

# 构建后端（输出到 dist-server/server.js）
npm run build:server
```

### 预览生产版本

```bash
# 先构建前端
npm run build

# 然后预览
npm run preview
```

### 插入测试数据

如果想快速测试系统，需要手动创建测试数据或使用数据库工具插入数据。

## ☁️ 部署到云服务器

**快速部署步骤：**

1. **本地构建项目**：
   ```bash
   # 构建前端（输出到 dist/ 目录）
   npm run build
   
   # 构建后端（输出到 dist-server/server.cjs）
   npm run build:server
   ```

2. **上传文件**：
   - 上传 `dist/` 目录
   - 上传 `dist-server/server.cjs` 文件
   - 上传 `.env` 文件（需要提前配置好）
   - 上传 `package.json` 文件

3. **服务器配置**：
   - 安装 Node.js 20+ 和 PM2
   - 安装依赖：`npm install --production`
   - 使用 PM2 启动：`pm2 start ecosystem.config.js`

4. **Nginx 配置**（可选，用于反向代理）：
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       # 前端静态文件
       location / {
           root /path/to/project/dist;
           index index.html;
           try_files $uri $uri/ /index.html;
       }
       
       # 后端 API
       location /api {
           proxy_pass http://localhost:3001;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }
   }
   ```

## 🤖 配置通义千问 AI 分析（可选但推荐）

系统支持使用阿里云通义千问（Qwen）进行智能分析，适合国内用户使用。

### 获取 API Key

1. 访问 [阿里云 DashScope 控制台](https://dashscope.console.aliyun.com/)
2. 注册/登录阿里云账号
3. 开通 DashScope 服务
4. 在 API-KEY 管理页面创建新的 API Key
5. 将 API Key 复制到 `.env` 文件中的 `QWEN_API_KEY`

### 支持的模型

- **qwen-turbo**: 快速响应，适合实时分析（推荐）
- **qwen-plus**: 增强版，平衡性能和质量
- **qwen-max**: 最强性能，适合复杂分析
- **qwen-max-longcontext**: 支持长文本上下文

### 配置步骤

1. 在 `.env` 文件中添加：
   ```
   QWEN_API_KEY=sk-xxxxxxxxxxxxx
   ```

2. 在前端页面的 AI 分析面板中也可以直接配置 API Key

3. 配置完成后，点击"生成智能生产报告"即可使用 AI 分析功能

**注意**: AI 分析功能需要网络连接到阿里云服务，请确保网络环境正常。

## 🔐 安全提示

1. **不要将 `.env` 文件提交到 Git**
2. **生产环境请修改默认的 API_TOKEN**
3. **数据库密码请使用强密码**
4. **妥善保管您的 Qwen API Key，避免泄露**

## 📞 技术支持

如果遇到问题，请检查：
1. Node.js 和 MySQL 是否正确安装
2. 环境变量配置是否正确
3. 端口是否被占用
4. 防火墙是否阻止了连接

## 📄 许可证

本项目仅供学习和研究使用。

---

**祝您使用愉快！** 🐝
