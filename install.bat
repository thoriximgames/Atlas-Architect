@echo off
echo ================================================================
echo [Atlas Architect] Starting Full Installation...
echo ================================================================
echo.

echo [1/3] Installing Backend Dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Backend npm install failed.
    exit /b %ERRORLEVEL%
)
echo.

echo [2/3] Installing Viewer Dependencies...
cd viewer
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Viewer npm install failed.
    cd ..
    exit /b %ERRORLEVEL%
)
cd ..
echo.

echo [3/3] Compiling Engine and Syncing Global Skill...
call node atlas.mjs build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Atlas build failed.
    exit /b %ERRORLEVEL%
)
echo.

echo ================================================================
echo [SUCCESS] Atlas Architect is installed and the Gemini Skill is active!
echo.
echo To initialize a new project: node E:\GIT\Atlas-Architect\atlas.mjs init
echo ================================================================
pause
