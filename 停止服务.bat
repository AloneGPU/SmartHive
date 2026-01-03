@echo off
chcp 65001 >nul
title 智慧蜂场管理系统 - 停止服务
color 0C
echo.
echo ========================================
echo   智慧蜂场管理系统 - 停止服务
echo ========================================
echo.

echo 正在查找并停止相关进程...
echo.

REM 查找并停止 Node.js 进程（前端和后端）
echo [信息] 正在停止 Node.js 进程...
taskkill /F /IM node.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [成功] 已停止所有 Node.js 进程
) else (
    echo [信息] 未找到运行中的 Node.js 进程
)

echo.
echo ========================================
echo   服务已停止
echo ========================================
echo.
echo 提示: 如果服务仍在运行，请手动关闭命令行窗口
echo.
pause

