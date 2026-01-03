@echo off
chcp 65001 >nul
title 智慧蜂场管理系统 - 后端服务器
color 0B
echo.
echo ========================================
echo   智慧蜂场管理系统 - 后端服务器
echo ========================================
echo.

REM 检查 Node.js 是否安装
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

REM 检查是否存在 node_modules
if not exist "node_modules" (
    echo [信息] 首次运行，正在安装依赖...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [错误] 依赖安装失败，请检查网络连接
        pause
        exit /b 1
    )
)

REM 检查是否存在 .env 文件
if not exist ".env" (
    echo [警告] 未找到 .env 配置文件
    echo 请先运行 启动项目.bat 创建配置文件
    pause
    exit /b 1
)

echo [信息] 正在启动后端服务器...
echo.
echo ========================================
echo   后端服务器信息
echo ========================================
echo 服务器地址: http://localhost:3001
echo API 端点:
echo   GET  /api/health (健康检查)
echo   GET  /api/beehive/latest (获取最新数据)
echo   GET  /api/beehive/history (获取历史数据)
echo   POST /api/beehive (插入数据)
echo.
echo ========================================
echo.
echo 提示: 按 Ctrl+C 可以停止后端服务
echo.
echo 正在启动，请稍候...
echo.

timeout /t 2 /nobreak >nul
call npm run dev:server

REM 如果服务停止，显示提示
echo.
echo ========================================
echo   后端服务器已停止
echo ========================================
echo.
echo 提示: 如果这是意外停止，请检查：
echo   1. 数据库连接是否正常
echo   2. 端口 3001 是否被占用
echo   3. .env 文件配置是否正确
echo.

echo.
echo ========================================
echo   后端服务器已停止
echo ========================================
pause

