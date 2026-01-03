@echo off
chcp 65001 >nul
title 智慧蜂场管理系统 - 前端服务器
color 0E
echo.
echo ========================================
echo   智慧蜂场管理系统 - 前端服务器
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

echo [信息] 正在启动前端服务器...
echo.
echo ========================================
echo   前端服务器信息
echo ========================================
echo 前端地址: http://localhost:5173
echo.
echo 提示: 
echo   - 按 Ctrl+C 可以停止前端服务
echo   - 浏览器会自动打开前端页面
echo   - 确保后端服务器已启动（端口 3001）
echo.
echo ========================================
echo.
echo 正在启动，请稍候...
echo.

timeout /t 2 /nobreak >nul
call npm run dev

REM 如果服务停止，显示提示
echo.
echo ========================================
echo   前端服务器已停止
echo ========================================
echo.
echo 提示: 如果这是意外停止，请检查：
echo   1. 端口 5173 是否被占用
echo   2. 后端服务器是否正常运行
echo.

echo.
echo ========================================
echo   前端服务器已停止
echo ========================================
pause

