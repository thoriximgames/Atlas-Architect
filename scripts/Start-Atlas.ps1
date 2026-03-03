param (
    [Parameter(Mandatory=$true)]
    [string]$Target
)

$targetPath = Resolve-Path $Target
$configPath = Join-Path $targetPath "atlas.config.json"
$altConfigPath = Join-Path $targetPath ".atlas\atlas.config.json"

if (-not (Test-Path $configPath) -and -not (Test-Path $altConfigPath)) {
    Write-Error "[Atlas] FATAL: Not a valid Atlas project. Missing atlas.config.json in $targetPath or $targetPath\.atlas\"
    exit 1
}

if (Test-Path $configPath) {
    $activeConfig = $configPath
} else {
    $activeConfig = $altConfigPath
}

$config = Get-Content $activeConfig | ConvertFrom-Json
$projectName = $config.project

Write-Host "[Atlas] Starting vUniversal engine for project: $projectName at $targetPath..."

# Find central repo from an environment variable, or fallback to the known global location
$centralRepo = "E:\GIT\Atlas-Architect"

if (-not (Test-Path $centralRepo)) {
    Write-Error "[Atlas] FATAL: Central engine not found at $centralRepo."
    exit 1
}

# 1. Kill old Ghost Process for this project based on registry
$registryPath = Join-Path $env:USERPROFILE ".gemini\atlas_sessions.json"
if (Test-Path $registryPath) {
    $sessions = Get-Content $registryPath | ConvertFrom-Json
    
    # Check if the property exists on the PSCustomObject
    $hasProject = $false
    $sessions.psobject.properties | ForEach-Object {
        if ($_.Name -eq $projectName) { $hasProject = $true }
    }

    if ($hasProject) {
        $oldPid = $sessions.$projectName.pid
        Write-Host "[Atlas] Force killing previous session PID: $oldPid"
        Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
    }
}

# 2. Start the Engine in the background, pointing to the Target project
$engineScript = Join-Path $centralRepo "dist\index.js"
Start-Process node -ArgumentList "$engineScript --target `"$targetPath`"" -NoNewWindow

Write-Host "[Atlas] Engine spawned. Waiting for port binding..."

# 3. Validation Loop: Read the registry to find the port, then ping it until it answers
$maxAttempts = 30
$attempt = 0
$activePort = $null

while ($attempt -lt $maxAttempts) {
    Start-Sleep -Seconds 1
    
    if (Test-Path $registryPath) {
        $sessions = Get-Content $registryPath | ConvertFrom-Json
        
        $hasProject = $false
        $sessions.psobject.properties | ForEach-Object {
            if ($_.Name -eq $projectName) { $hasProject = $true }
        }

        if ($hasProject) {
            $activePort = $sessions.$projectName.port
            
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:$activePort/viewer/" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
                if ($response.StatusCode -eq 200) {
                    Write-Host "[Atlas] SUCCESS: $projectName is LIVE and serving UI at: http://localhost:$activePort/viewer/" -ForegroundColor Green
                    exit 0
                }
            } catch {
                # Not ready yet
            }
        }
    }
    $attempt++
}

Write-Error "[Atlas] FATAL: Server failed to start or bind within 30 seconds."
exit 1