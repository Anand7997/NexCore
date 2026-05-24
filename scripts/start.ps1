param(
    [switch] $Reload
)

$ErrorActionPreference = "Stop"

$root        = Resolve-Path (Join-Path $PSScriptRoot "..")
$frontendDir = Join-Path $root "nexus-qa"
$backendDir  = Join-Path $root "nexus-api"
$venvPython  = Join-Path $backendDir ".venv\Scripts\python.exe"

if (-not $env:NEXUS_API_HOST) { $env:NEXUS_API_HOST = "127.0.0.1" }
if (-not $env:NEXUS_API_PORT) { $env:NEXUS_API_PORT = "8000" }
if (-not $env:NEXUS_QA_PORT)  { $env:NEXUS_QA_PORT  = "3000" }

$apiUrl = "http://$($env:NEXUS_API_HOST):$($env:NEXUS_API_PORT)"
$webUrl = "http://localhost:$($env:NEXUS_QA_PORT)"

function Start-NexusProcess {
    param(
        [Parameter(Mandatory)] [string] $Name,
        [Parameter(Mandatory)] [string] $FileName,
        [Parameter(Mandatory)] [string] $Arguments,
        [Parameter(Mandatory)] [string] $WorkingDirectory,
        [hashtable] $Environment = @{}
    )

    $pi = [System.Diagnostics.ProcessStartInfo]::new()
    $pi.FileName         = $FileName
    $pi.Arguments        = $Arguments
    $pi.WorkingDirectory = $WorkingDirectory
    $pi.UseShellExecute  = $false

    foreach ($key in $Environment.Keys) {
        $pi.Environment[$key] = [string]$Environment[$key]
    }

    $p = [System.Diagnostics.Process]::new()
    $p.StartInfo = $pi

    Write-Host "  Starting $Name..."
    [void]$p.Start()
    return $p
}

function Wait-ForBackend {
    param([string]$Url, [int]$MaxSeconds = 90)
    $healthUrl = "$Url/api/health"
    $deadline  = (Get-Date).AddSeconds($MaxSeconds)
    Write-Host "  Waiting for backend at $healthUrl (up to $MaxSeconds s)..."
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($r.StatusCode -eq 200) {
                Write-Host "  Backend is ready."
                return
            }
        } catch { }
        Start-Sleep -Milliseconds 1500
    }
    throw "Backend did not become healthy within $MaxSeconds seconds."
}

function Get-NexusChildProcesses {
    param([Parameter(Mandatory)] [int] $ParentId)

    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$ParentId" -ErrorAction SilentlyContinue)
    foreach ($child in $children) {
        Get-NexusChildProcesses -ParentId $child.ProcessId
        $child
    }
}

function Stop-NexusProcessTree {
    param([System.Diagnostics.Process] $Process)

    if (-not $Process) { return }

    $processIds = @()
    try {
        $processIds += @(Get-NexusChildProcesses -ParentId $Process.Id | Select-Object -ExpandProperty ProcessId)
    } catch { }

    try {
        if (-not $Process.HasExited) {
            $processIds += $Process.Id
        }
    } catch {
        $processIds += $Process.Id
    }

    foreach ($processId in ($processIds | Select-Object -Unique)) {
        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
        } catch {
            Write-Host "  Could not stop process ${processId}: $($_.Exception.Message)"
        }
    }
}

function Stop-NexusPortListeners {
    param([Parameter(Mandatory)] [int[]] $Ports)

    foreach ($conn in @(Get-NetTCPConnection -LocalPort $Ports -State Listen -ErrorAction SilentlyContinue)) {
        try {
            $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($conn.OwningProcess)" -ErrorAction Stop
            $commandLine = [string]$owner.CommandLine
            if ($commandLine.Contains([string]$root) -or $commandLine -match "uvicorn app\.main:app|next dev|npm run dev") {
                Stop-Process -Id $conn.OwningProcess -Force -ErrorAction Stop
            }
        } catch {
            Write-Host "  Could not stop listener on port $($conn.LocalPort): $($_.Exception.Message)"
        }
    }
}

$frontend = $null
$backend  = $null

try {
    Write-Host ""
    Write-Host "=== NEXUS QA Workspace ==="
    Write-Host "  Backend:  $apiUrl"
    Write-Host "  Frontend: $webUrl"
    Write-Host ""

    # ── Step 1: Start backend (venv python preferred) ─────────────────────────
    $pythonExe = if (Test-Path $venvPython) { $venvPython } else { "python" }
    Write-Host "[1/2] Backend"
    Write-Host "  Python: $pythonExe"

    $backendArgs = "-m uvicorn app.main:app --host $($env:NEXUS_API_HOST) --port $($env:NEXUS_API_PORT)"
    if ($Reload) {
        $backendArgs = "$backendArgs --reload"
    }

    $backend = Start-NexusProcess `
        -Name "backend" `
        -FileName $pythonExe `
        -Arguments $backendArgs `
        -WorkingDirectory $backendDir

    # Wait until /api/health responds before touching the frontend
    Wait-ForBackend -Url $apiUrl

    if ($backend.HasExited) {
        throw "Backend exited early (code $($backend.ExitCode))."
    }

    # ── Step 2: Start frontend with API URL injected ──────────────────────────
    Write-Host ""
    Write-Host "[2/2] Frontend"

    $frontend = Start-NexusProcess `
        -Name "frontend" `
        -FileName "cmd.exe" `
        -Arguments "/c npm run dev -- --port $($env:NEXUS_QA_PORT)" `
        -WorkingDirectory $frontendDir `
        -Environment @{ NEXT_PUBLIC_API_URL = "$apiUrl/api" }

    Write-Host ""
    Write-Host "Both services are running. Press Ctrl+C to stop."
    Write-Host ""

    while ($true) {
        if ($frontend.HasExited) { throw "Frontend stopped (code $($frontend.ExitCode))." }
        if ($backend.HasExited)  { throw "Backend stopped (code $($backend.ExitCode))." }
        Start-Sleep -Seconds 2
    }
}
finally {
    Write-Host ""
    Write-Host "Stopping NEXUS QA workspace..."
    foreach ($proc in @($frontend, $backend)) {
        Stop-NexusProcessTree -Process $proc
    }
    Stop-NexusPortListeners -Ports @([int]$env:NEXUS_API_PORT, [int]$env:NEXUS_QA_PORT)
}
