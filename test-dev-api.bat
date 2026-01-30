@echo off
echo ========================================
echo 测试开发者模式API
echo ========================================
echo.

echo 1. 测试开发者模式状态
curl -s http://localhost:3001/api/dev/status
echo.
echo.

echo 2. 测试快速登录
curl -s -X POST http://localhost:3001/api/dev/login ^
  -H "Content-Type: application/json" ^
  -d "{\"userId\":\"test_user_001\"}"
echo.
echo.

echo 3. 测试状态切换
curl -s -X POST http://localhost:3001/api/dev/usage/switch-status ^
  -H "Content-Type: application/json" ^
  -d "{\"userId\":\"test_user_001\",\"status\":\"free\",\"usageCount\":3}"
echo.
echo.

echo ========================================
echo 测试完成
echo ========================================
pause
