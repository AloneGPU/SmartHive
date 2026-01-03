@echo off
chcp 65001 >nul
title 智慧蜂场管理系统 - 启动控制台
color 0A
cls
echo.
echo ========================================
echo   智慧蜂场管理系统 - 启动脚本
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

echo [信息] 检测到 Node.js 版本:
node --version
echo.

REM 检查是否存在 node_modules
if not exist "node_modules" (
    echo [信息] 首次运行，正在安装依赖...
    echo 这可能需要几分钟，请耐心等待...
    echo.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo [错误] 依赖安装失败，请检查网络连接
        pause
        exit /b 1
    )
    echo.
    echo [成功] 依赖安装完成！
    echo.
)

REM 检查是否存在 .env 文件
if not exist ".env" (
    echo [警告] 未找到 .env 配置文件
    echo 正在创建默认配置文件...
    echo.
    (
        echo # 后端服务器配置
        echo PORT=3001
        echo API_TOKEN=123456789
        echo.
        echo # MySQL数据库配置
        echo DB_HOST=localhost
        echo DB_USER=root
        echo DB_PASSWORD=
        echo DB_NAME=smarthive
        echo DB_PORT=3306
        echo.
        echo # 通义千问 (Qwen) AI API配置（可选）
        echo # 获取API Key: https://dashscope.console.aliyun.com/
        echo QWEN_API_KEY=
    ) > .env
    echo [信息] 已创建 .env 文件，请编辑此文件配置数据库密码
    echo.
    pause
)

echo ========================================
echo   启动选项
echo ========================================
echo.
echo   1. 同时启动前端和后端（推荐新手）
echo   2. 仅启动后端服务器
echo   3. 仅启动前端服务器
echo   4. 退出
echo.
set /p choice=请输入选项 (1-4): 

if "%choice%"=="1" goto start_all
if "%choice%"=="2" goto start_backend
if "%choice%"=="3" goto start_frontend
if "%choice%"=="4" goto end
goto invalid_choice

:start_all
cls
echo.
echo ========================================
echo   正在同时启动前端和后端...
echo ========================================
echo.
echo [提示] 启动成功后，您将看到：
echo   - 蓝色日志：后端服务器运行状态
echo   - 绿色日志：前端服务器运行状态
echo.
echo ========================================
echo   服务地址
echo ========================================
echo   前端地址: http://localhost:5173
echo   后端地址: http://localhost:3001
echo.
echo ========================================
echo   操作说明
echo ========================================
echo   - 浏览器会自动打开前端页面
echo   - 看到 "ready in xxx ms" 表示启动成功
echo   - 看到 "Backend server running" 表示后端启动成功
echo   - 按 Ctrl+C 可以停止所有服务
echo.
echo ========================================
echo.
echo 正在启动，请稍候...
timeout /t 3 /nobreak >nul
echo.
call npm start
goto end

:start_backend
start "" "启动后端.bat"
echo.
echo [成功] 后端服务器已在新的窗口中启动
echo.
echo 提示: 
echo   - 后端窗口标题: "智慧蜂场管理系统 - 后端服务器"
echo   - 要关闭后端，请关闭后端窗口或按 Ctrl+C
echo   - 后端地址: http://localhost:3001
echo.
pause
goto end

:start_frontend
start "" "启动前端.bat"
echo.
echo [成功] 前端服务器已在新的窗口中启动
echo.
echo 提示: 
echo   - 前端窗口标题: "智慧蜂场管理系统 - 前端服务器"
echo   - 要关闭前端，请关闭前端窗口或按 Ctrl+C
echo   - 前端地址: http://localhost:5173
echo   - 确保后端服务器已启动（端口 3001）
echo.
pause
goto end

:invalid_choice
echo.
echo [错误] 无效的选项，请重新运行脚本
pause
exit /b 1

:end
exit
