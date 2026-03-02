@echo off
setlocal
echo [ATLAS] KILLING STALE GHOSTS...
powershell -Command "5000..5010 | ForEach-Object { Get-NetTCPConnection -LocalPort $_ -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"
echo [ATLAS] PERFORMING FRESH SCAN...
node --loader ts-node/esm src/index.ts --scan-only
echo [ATLAS] FORCE REBUILDING VISUALIZER...
cd viewer
if exist dist rmdir /s /q dist
node node_modules/vite/bin/vite.js build --base=/viewer/
cd ..
echo [ATLAS] LAUNCHING NEW ATLAS ON PORT 5000...
node --loader ts-node/esm src/index.ts
pause