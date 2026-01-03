@echo off
chcp 65001 >nul
echo ========================================
echo   插入测试数据到数据库
echo ========================================
echo.

REM 检查 Node.js 是否安装
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未检测到 Node.js
    pause
    exit /b 1
)

REM 检查是否存在 .env 文件
if not exist ".env" (
    echo [错误] 未找到 .env 配置文件
    echo 请先运行 启动项目.bat 创建配置文件
    pause
    exit /b 1
)

echo [信息] 正在插入测试数据...
echo 这将在数据库中创建一些示例数据用于测试
echo.

node insertHiveTestData.js

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [成功] 测试数据插入完成！
    echo 您现在可以在前端页面查看数据了
) else (
    echo.
    echo [错误] 数据插入失败
    echo 请检查：
    echo 1. MySQL 服务是否运行
    echo 2. .env 文件中的数据库配置是否正确
)

echo.
pause

