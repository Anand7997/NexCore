$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$frontendDir = Join-Path $root "nexus-qa"
$backendDir = Join-Path $root "nexus-api"

if (-not $env:NEXUS_API_HOST) { $env:NEXUS_API_HOST = "127.0.0.1" }
if (-not $env:NEXUS_API_PORT) { $env:NEXUS_API_PORT = "8000" }
if (-not $env:NEXUS_QA_PORT) { $env:NEXUS_QA_PORT = "3001" }

$apiUrl = "http://$($env:NEXUS_API_HOST):$($env:NEXUS_API_PORT)"
$webUrl = "http://localhost:$($env:NEXUS_QA_PORT)"

function Start-NexusProcess {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Name,

        [Parameter(Mandatory = $true)]
        [string] $FileName,

        [Parameter(Mandatory = $true)]
        [string] $Arguments,

        [Parameter(Mandatory = $true)]
        [string] $WorkingDirectory,

        [hashtable] $Environment = @{}
    )

    $processInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $processInfo.FileName = $FileName
    $processInfo.Arguments = $Arguments
    $processInfo.WorkingDirectory = $WorkingDirectory
    $processInfo.UseShellExecute = $false

    foreach ($key in $Environment.Keys) {
        $processInfo.Environment[$key] = [string] $Environment[$key]
    }

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $processInfo

    Write-Host "Starting $Name..."
    [void] $process.Start()

    return $process
}

$frontend = $null
$backend = $null

try {
    Write-Host "Starting NEXUS QA workspace in this terminal..."
    Write-Host "Frontend: $webUrl"
    Write-Host "Backend:  $apiUrl"
    Write-Host ""

    $frontend = Start-NexusProcess `
        -Name "frontend" `
        -FileName "cmd.exe" `
        -Arguments "/c npm run dev -- --port $($env:NEXUS_QA_PORT)" `
        -WorkingDirectory $frontendDir `
        -Environment @{ NEXT_PUBLIC_API_URL = "$apiUrl/api" }

    Start-Sleep -Seconds 4

    if ($frontend.HasExited) {
        throw "Frontend exited early with code $($frontend.ExitCode). Backend was not started."
    }

    $backend = Start-NexusProcess `
        -Name "backend" `
        -FileName "python" `
        -Arguments "-m uvicorn app.main:app --host $($env:NEXUS_API_HOST) --port $($env:NEXUS_API_PORT) --reload" `
        -WorkingDirectory $backendDir

    Write-Host ""
    Write-Host "Both services are running in the Antigravity terminal. Press Ctrl+C to stop them."
    Write-Host ""

    while ($true) {
        if ($frontend.HasExited) {
            throw "Frontend stopped with code $($frontend.ExitCode)."
        }

        if ($backend.HasExited) {
            throw "Backend stopped with code $($backend.ExitCode)."
        }

        Start-Sleep -Seconds 1
    }
}
finally {
    Write-Host ""
    Write-Host "Stopping NEXUS QA workspace..."

    foreach ($process in @($backend, $frontend)) {
        if ($process -and -not $process.HasExited) {
            try {
                $process.Kill($true)
            }
            catch {
                $process.Kill()
            }

            $process.WaitForExit()
        }
    }
}
