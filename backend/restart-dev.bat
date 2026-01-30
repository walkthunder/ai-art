@echo off
echo ========================================
echo 重启后端开发服务器
echo ========================================
echo.

echo 正在检查端口 3001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001') do (
    echo 发现占用进程 PID: %%a
    echo 正在停止进程...
    taskkill /F /PID %%a 2>nul
)

echo 等待端口释放...
timeout /t 2 /nobreak >nul

echo.
echo 启动后端服务器...
cd /d "%~dp0"
pnpm run dev

pause
