param(
    [switch] $Reload,
    [ValidateSet("Advanced", "Old")]
    [string] $Frontend = "Advanced"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$frontendFolder = if ($Frontend -eq "Old") { "Nexus-old" } else { "Nexus-Advanced" }
$frontendLabel = if ($Frontend -eq "Old") { "Automation Blocks UI" } else { "Restored Advanced UI" }
$frontendDir = Join-Path $root $frontendFolder
$controlBackendDir = Join-Path $root "nexus-dotnet-backend"
$pythonBackendDir  = Join-Path $root "nexus-api"
$venvPython  = Join-Path $pythonBackendDir ".venv\Scripts\python.exe"
$nextCli     = Join-Path $frontendDir "node_modules\next\dist\bin\next"
$frontendBuildId = Join-Path $frontendDir ".next\BUILD_ID"

if (-not $env:NEXUS_CONTROL_HOST) { $env:NEXUS_CONTROL_HOST = "127.0.0.1" }
if (-not $env:NEXUS_CONTROL_PORT) { $env:NEXUS_CONTROL_PORT = "3001" }
if (-not $env:NEXUS_API_HOST) { $env:NEXUS_API_HOST = "127.0.0.1" }
if (-not $env:NEXUS_API_PORT) { $env:NEXUS_API_PORT = "8000" }
if (-not $env:NEXUS_QA_PORT)  { $env:NEXUS_QA_PORT  = "3000" }

$controlUrl = "http://$($env:NEXUS_CONTROL_HOST):$($env:NEXUS_CONTROL_PORT)"
$apiUrl = "http://$($env:NEXUS_API_HOST):$($env:NEXUS_API_PORT)"
$webUrl = "http://localhost:$($env:NEXUS_QA_PORT)"

function Get-NexusPortListeners {
    param([Parameter(Mandatory)] [int[]] $Ports)

    $listeners = @()
    $wantedPorts = $Ports | Sort-Object -Unique

    foreach ($line in @(& netstat -ano -p tcp 2>$null)) {
        $fields = ($line -replace '^\s+', '') -split '\s+'
        if ($fields.Length -lt 5) { continue }
        if ($fields[0] -ne 'TCP' -or $fields[3] -ne 'LISTENING') { continue }

        $localPort = 0
        $processId = 0
        if (-not [int]::TryParse(($fields[1] -split ':')[-1], [ref]$localPort)) { continue }
        if (-not [int]::TryParse($fields[4], [ref]$processId)) { continue }
        if ($wantedPorts -notcontains $localPort) { continue }

        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        $processName = $null
        $processPath = $null
        if ($process) {
            $processName = $process.ProcessName
            try { $processPath = $process.Path } catch { }
        }

        $listeners += [pscustomobject]@{
            LocalPort   = $localPort
            ProcessId   = $processId
            ProcessName = $processName
            Path        = $processPath
        }
    }

    return $listeners | Sort-Object LocalPort, ProcessId -Unique
}

function Assert-NexusPortsAvailable {
    param([Parameter(Mandatory)] [int[]] $Ports)

    $listeners = @(Get-NexusPortListeners -Ports $Ports)
    if (-not $listeners) { return }

    $details = foreach ($listener in $listeners) {
        $summary = "port $($listener.LocalPort) -> PID $($listener.ProcessId)"
        if ($listener.ProcessName) { $summary += " ($($listener.ProcessName))" }
        if ($listener.Path) { $summary += " [$($listener.Path)]" }
        $summary
    }

    throw "Required service port(s) are already in use: $($details -join '; '). Run npm run stop:all or free the port before starting again."
}

function Stop-NexusProcessId {
    param([Parameter(Mandatory)] [int] $ProcessId)

    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return }

    try {
        Stop-Process -Id $ProcessId -Force -ErrorAction Stop
    }
    catch {
        if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
            Write-Host "  Could not stop process ${ProcessId}: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

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

function Wait-ForService {
    param(
        [string] $Name,
        [string] $Url,
        [string] $HealthPath,
        [System.Diagnostics.Process] $Process,
        [int] $MaxSeconds = 90
    )

    $healthUrl = "$Url$HealthPath"
    $deadline  = (Get-Date).AddSeconds($MaxSeconds)
    Write-Host "  Waiting for $Name at $healthUrl (up to $MaxSeconds s)..."
    while ((Get-Date) -lt $deadline) {
        if ($Process) {
            try {
                if ($Process.HasExited) {
                    throw "$Name exited before becoming healthy (code $($Process.ExitCode))."
                }
            }
            catch { throw }
        }

        try {
            $r = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($r.StatusCode -eq 200) {
                Write-Host "  $Name is ready."
                return
            }
        } catch { }
        Start-Sleep -Milliseconds 1500
    }
    throw "$Name did not become healthy within $MaxSeconds seconds."
}

function Invoke-NexusFrontendBuild {
    param([string] $ApiUrl, [string] $ControlUrl)

    Write-Host "  Frontend build is missing; running npm run build..."
    $build = Start-NexusProcess `
        -Name "frontend build" `
        -FileName "cmd.exe" `
        -Arguments "/c npm run build" `
        -WorkingDirectory $frontendDir `
        -Environment @{
            NEXT_PUBLIC_API_URL = "$ApiUrl/api"
            NEXT_PUBLIC_CONTROL_API_URL = "$ControlUrl/api"
        }

    $build.WaitForExit()
    if ($build.ExitCode -ne 0) {
        throw "Frontend build failed (code $($build.ExitCode))."
    }
}

function Stop-NexusProcessTree {
    param([System.Diagnostics.Process] $Process)

    if (-not $Process) { return }

    $processId = $null
    try {
        if ($Process.HasExited) { return }
        $processId = $Process.Id
    } catch {
        $processId = $Process.Id
    }

    Stop-NexusProcessId -ProcessId $processId
}

function Stop-NexusPortListeners {
    param([Parameter(Mandatory)] [int[]] $Ports)

    foreach ($listener in @(Get-NexusPortListeners -Ports $Ports)) {
        Stop-NexusProcessId -ProcessId $listener.ProcessId
    }
}

$frontendProcess = $null
$controlBackend = $null
$pythonBackend = $null
$ports = @([int]$env:NEXUS_CONTROL_PORT, [int]$env:NEXUS_API_PORT, [int]$env:NEXUS_QA_PORT)

try {
    Write-Host ""
    Write-Host "=== NEXUS QA Workspace ==="
    Write-Host "  .NET Control API: $controlUrl"
    Write-Host "  Python AI API:    $apiUrl"
    Write-Host "  Frontend:         $webUrl"
    Write-Host "  UI:               $frontendLabel ($frontendFolder)"
    Write-Host ""

    Assert-NexusPortsAvailable -Ports $ports

    Write-Host "[1/3] .NET Control API"
    $controlBackend = Start-NexusProcess `
        -Name ".NET Control API" `
        -FileName "dotnet" `
        -Arguments "run" `
        -WorkingDirectory $controlBackendDir

    Wait-ForService -Name ".NET Control API" -Url $controlUrl -HealthPath "/api/health/live" -Process $controlBackend

    Write-Host ""
    Write-Host "[2/3] Python AI API"
    $pythonExe = if (Test-Path $venvPython) { $venvPython } else { "python" }
    Write-Host "  Python: $pythonExe"

    $pythonArgs = "-m uvicorn app.main:app --host $($env:NEXUS_API_HOST) --port $($env:NEXUS_API_PORT)"
    if ($Reload) { $pythonArgs = "$pythonArgs --reload" }

    $pythonBackend = Start-NexusProcess `
        -Name "Python AI API" `
        -FileName $pythonExe `
        -Arguments $pythonArgs `
        -WorkingDirectory $pythonBackendDir

    Wait-ForService -Name "Python AI API" -Url $apiUrl -HealthPath "/api/health" -Process $pythonBackend

    Write-Host ""
    Write-Host "[3/3] Frontend"

    if (-not (Test-Path $nextCli)) {
        throw "Next.js CLI was not found. Run npm install inside $frontendDir first."
    }

    if (-not (Test-Path $frontendBuildId)) {
        Invoke-NexusFrontendBuild -ApiUrl $apiUrl -ControlUrl $controlUrl
    }

    $nodeExe = (Get-Command "node.exe" -ErrorAction Stop).Source
    if ($Reload) {
        Write-Host "  Backend reload is enabled. Frontend is using the built Next app because this Windows/Node environment blocks Next dev worker startup."
    }

    $frontendProcess = Start-NexusProcess `
        -Name "frontend" `
        -FileName $nodeExe `
        -Arguments "`"$nextCli`" start --port $($env:NEXUS_QA_PORT)" `
        -WorkingDirectory $frontendDir `
        -Environment @{
            NEXT_PUBLIC_API_URL = "$apiUrl/api"
            NEXT_PUBLIC_CONTROL_API_URL = "$controlUrl/api"
        }

    Write-Host ""
    Write-Host "All services are running. Press Ctrl+C to stop."
    Write-Host ""

    while ($true) {
        $frontendExited = $frontendProcess.HasExited
        $controlExited = $controlBackend.HasExited
        $pythonExited = $pythonBackend.HasExited

        if ($frontendExited -or $controlExited -or $pythonExited) {
            $listeners = @(Get-NexusPortListeners -Ports $ports)
            if (-not $listeners) { break }

            if ($frontendExited) { throw "Frontend stopped (code $($frontendProcess.ExitCode))." }
            if ($controlExited)  { throw ".NET Control API stopped (code $($controlBackend.ExitCode))." }
            if ($pythonExited)   { throw "Python AI API stopped (code $($pythonBackend.ExitCode))." }
        }

        Start-Sleep -Seconds 2
    }
}
finally {
    Write-Host ""
    Write-Host "Stopping NEXUS QA workspace..."
    foreach ($proc in @($frontendProcess, $pythonBackend, $controlBackend)) {
        Stop-NexusProcessTree -Process $proc
    }
    Stop-NexusPortListeners -Ports $ports
}
