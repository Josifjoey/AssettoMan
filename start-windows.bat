@echo off
REM AssettoMan — one-shot setup + run for Windows (local runtime, no Docker)
cd /d "%~dp0"

if not exist node_modules (
  echo Installing frontend dependencies...
  call npm install || goto :fail
)
if not exist server\node_modules (
  echo Installing backend dependencies...
  pushd server && call npm install && popd || goto :fail
)
if not exist dist (
  echo Building frontend...
  call npm run build || goto :fail
)

echo.
echo Starting AssettoMan on http://localhost:3010
node server\src\index.js
goto :eof

:fail
echo.
echo Setup failed — see output above.
pause
