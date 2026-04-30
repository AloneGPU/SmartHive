@echo off

REM 智能蜂箱项目一键构建脚本
REM 用于构建前后端项目，方便部署到服务器

echo === 智能蜂箱项目一键构建开始 ===
echo.

REM 检查Node.js是否安装
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: Node.js 未安装，请先安装 Node.js v16+ 
    echo 推荐安装 Node.js v20
    pause
    exit /b 1
)

echo 检查Node.js版本...
node --version
echo.

REM 安装依赖
echo 安装依赖...
echo.
npm install

if %errorlevel% neq 0 (
    echo 错误: 依赖安装失败
    pause
    exit /b 1
)

echo 依赖安装成功！
echo.

REM 构建前端
echo 构建前端...
echo.
npm run build

if %errorlevel% neq 0 (
    echo 错误: 前端构建失败
    pause
    exit /b 1
)

echo 前端构建成功！
echo.

REM 构建后端
echo 构建后端...
echo.
npm run build:server

if %errorlevel% neq 0 (
    echo 错误: 后端构建失败
    pause
    exit /b 1
)

echo 后端构建成功！
echo.

echo === 构建完成 ===
echo.
echo 构建产物:
echo - 前端: dist 目录
echo - 后端: dist-server 目录
echo.
echo 部署步骤:
echo 1. 将以下文件和目录上传到服务器:
echo    - dist 目录
 echo    - dist-server 目录
 echo    - package.json 文件
 echo    - .env 文件 (需要根据服务器环境配置)
echo.
echo 2. 服务器配置:
echo    - 前端: 将网站根目录设置为 dist 目录
echo    - 后端: 使用 PM2 管理 dist-server/server.cjs
echo    - 配置反向代理: /api 路径代理到后端服务
echo.
echo 3. 环境变量配置:
echo    复制 .env.example 为 .env 并填写相应的值
echo.
echo 4. 启动服务:
echo    - 启动后端服务: 在 PM2 中启动项目
echo    - 访问网站: http://你的域名
echo.
echo 构建脚本执行完成！
pause