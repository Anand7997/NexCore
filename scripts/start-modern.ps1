param(
    [switch] $Reload
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$frontendDir = Join-Path $root "Nexus-Modern"
$legacyApiEnvFile = Join-Path $root "nexus-api\.env"
$backendDir = Join-Path $root "nexus-dotnet-backend"
$viteCli = Join-Path $frontendDir "node_modules\vite\bin\vite.js"
$backendHost = "127.0.0.1"
$backendPort = 3001
$frontendHost = "127.0.0.1"
$frontendPort = 3002
$backendUrl = "http://${backendHost}:${backendPort}"
$frontendUrl = "http://${frontendHost}:${frontendPort}"

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
        $listeners += [pscustomobject]@{
            LocalPort = $localPort
            ProcessId = $processId
            ProcessName = if ($process) { $process.ProcessName } else { $null }
        }
    }

    return $listeners | Sort-Object LocalPort, ProcessId -Unique
}

function Test-ServiceReady {
    param([Parameter(Mandatory)] [string] $Url)

    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Assert-PortCanBeUsed {
    param(
        [Parameter(Mandatory)] [int] $Port,
        [Parameter(Mandatory)] [string] $HealthUrl,
        [Parameter(Mandatory)] [string] $Name
    )

    if (Test-ServiceReady -Url $HealthUrl) {
        Write-Host "$Name is already running at $HealthUrl. Reusing it."
        return $true
    }

    $listeners = @(Get-NexusPortListeners -Ports @($Port))
    if ($listeners) {
        $details = foreach ($listener in $listeners) {
            $summary = "PID $($listener.ProcessId)"
            if ($listener.ProcessName) { $summary += " ($($listener.ProcessName))" }
            $summary
        }
        throw "$Name port $Port is already in use, but $HealthUrl is not healthy. Process(es): $($details -join ', '). Stop that process and retry."
    }

    return $false
}

function Start-ManagedProcess {
    param(
        [Parameter(Mandatory)] [string] $Name,
        [Parameter(Mandatory)] [string] $FileName,
        [Parameter(Mandatory)] [string] $Arguments,
        [Parameter(Mandatory)] [string] $WorkingDirectory,
        [hashtable] $Environment = @{}
    )

    $pi = [System.Diagnostics.ProcessStartInfo]::new()
    $pi.FileName = $FileName
    $pi.Arguments = $Arguments
    $pi.WorkingDirectory = $WorkingDirectory
    $pi.UseShellExecute = $false

    foreach ($key in $Environment.Keys) {
        $pi.Environment[$key] = [string]$Environment[$key]
    }

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $pi

    Write-Host "Starting $Name..."
    [void]$process.Start()
    return $process
}

function Get-DotEnvSettings {
    param([string] $Path)

    $settings = @{}
    if (-not (Test-Path $Path)) {
        return $settings
    }

    foreach ($line in Get-Content $Path) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line.TrimStart().StartsWith("#")) { continue }

        $separatorIndex = $line.IndexOf("=")
        if ($separatorIndex -lt 1) { continue }

        $key = $line.Substring(0, $separatorIndex).Trim()
        $value = $line.Substring($separatorIndex + 1).Trim()
        if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $settings[$key] = $value
    }

    return $settings
}

function Wait-ForService {
    param(
        [Parameter(Mandatory)] [string] $Name,
        [Parameter(Mandatory)] [string] $Url,
        [System.Diagnostics.Process] $Process,
        [int] $MaxSeconds = 90
    )

    $deadline = (Get-Date).AddSeconds($MaxSeconds)
    Write-Host "Waiting for $Name at $Url..."

    while ((Get-Date) -lt $deadline) {
        if ($Process -and $Process.HasExited) {
            throw "$Name exited before becoming ready (code $($Process.ExitCode))."
        }

        if (Test-ServiceReady -Url $Url) {
            Write-Host "$Name is ready."
            return
        }

        Start-Sleep -Milliseconds 1500
    }

    throw "$Name did not become ready within $MaxSeconds seconds."
}

function Stop-ProcessTree {
    param([System.Diagnostics.Process] $Process)

    if (-not $Process) { return }

    try {
        if (-not $Process.HasExited) {
            Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
        }
    }
    catch { }
}

$backendProcess = $null
$frontendProcess = $null

try {
    Write-Host ""
    Write-Host "=== Nexus Modern Workspace ==="
    Write-Host "  Backend:  $backendUrl"
    Write-Host "  Frontend: $frontendUrl"
    Write-Host ""

    $backendAlreadyRunning = Assert-PortCanBeUsed -Port $backendPort -HealthUrl "$backendUrl/api/health" -Name "Modern backend"
    if (-not $backendAlreadyRunning) {
        $dotnetExe = (Get-Command "dotnet.exe" -ErrorAction Stop).Source
        $backendArgs = "run --no-launch-profile"
        $backendEnvironment = Get-DotEnvSettings -Path $legacyApiEnvFile
        $backendEnvironment["ASPNETCORE_URLS"] = $backendUrl

        $backendProcess = Start-ManagedProcess `
            -Name "Modern backend" `
            -FileName $dotnetExe `
            -Arguments $backendArgs `
            -WorkingDirectory $backendDir `
            -Environment $backendEnvironment

        Wait-ForService -Name "Modern backend" -Url "$backendUrl/api/health" -Process $backendProcess
    }

    $frontendAlreadyRunning = Assert-PortCanBeUsed -Port $frontendPort -HealthUrl $frontendUrl -Name "Modern frontend"
    if (-not $frontendAlreadyRunning) {
        $nodeExe = (Get-Command "node.exe" -ErrorAction Stop).Source
        if (-not (Test-Path $viteCli)) {
            throw "Vite CLI was not found. Run npm install inside $frontendDir first."
        }

        $frontendProcess = Start-ManagedProcess `
            -Name "Modern frontend" `
            -FileName $nodeExe `
            -Arguments "`"$viteCli`" --host $frontendHost --port $frontendPort" `
            -WorkingDirectory $frontendDir `
            -Environment @{
                VITE_API_BASE_URL = $backendUrl
                VITE_ENV = "local"
            }

        Wait-ForService -Name "Modern frontend" -Url $frontendUrl -Process $frontendProcess
    }

    Write-Host ""
    Write-Host "Modern frontend and backend are running. Press Ctrl+C to stop services started by this script."
    Write-Host ""

    while ($true) {
        if ($backendProcess -and $backendProcess.HasExited) {
            throw "Modern backend stopped (code $($backendProcess.ExitCode))."
        }
        if ($frontendProcess -and $frontendProcess.HasExited) {
            throw "Modern frontend stopped (code $($frontendProcess.ExitCode))."
        }
        Start-Sleep -Seconds 2
    }
}
finally {
    Write-Host ""
    Write-Host "Stopping Nexus Modern workspace..."
    Stop-ProcessTree -Process $frontendProcess
    Stop-ProcessTree -Process $backendProcess
}
