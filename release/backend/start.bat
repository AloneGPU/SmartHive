@echo off
echo Starting SmartHive Backend...

if exist node_modules (
    echo Dependencies already installed.
) else (
    echo Installing dependencies...
    call npm install --production
)

echo Starting server...
node server.js
pause
