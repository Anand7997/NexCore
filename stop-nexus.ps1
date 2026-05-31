#!/usr/bin/env pwsh
<#
.SYNOPSIS
    NexCore - Complete Stack Shutdown Script
.DESCRIPTION
    Gracefully stops all NexCore infrastructure and application services.
.EXAMPLE
    .\stop-nexus.ps1
.EXAMPLE
    .\stop-nexus.ps1 -KeepInfra  # Stop only application services, keep infrastructure running
#>

[CmdletBinding()]
param(
    [switch]$KeepInfra
)

$ErrorActionPreference = "Stop"
$workspaceRoot = $PSScriptRoot

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
        if ($process) {
            $processName = $process.ProcessName
        }

        $listeners += [pscustomobject]@{
            LocalPort   = $localPort
            ProcessId   = $processId
            ProcessName = $processName
        }
    }

    return $listeners | Sort-Object LocalPort, ProcessId -Unique
}

function Stop-NexusProcessId {
    param([Parameter(Mandatory)] [int] $ProcessId)

    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
        return
    }

    try {
        Stop-Process -Id $ProcessId -Force -ErrorAction Stop
    }
    catch {
        if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
            Write-Host "    [WARN] Could not stop PID ${ProcessId}: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

Write-Host "================================================================" -ForegroundColor Red
Write-Host "      Shutting Down NexCore Platform                          " -ForegroundColor Red
Write-Host "================================================================" -ForegroundColor Red
Write-Host ""

# ------------------------------------------------------------------------
# Step 1: Stop Application Services
# ------------------------------------------------------------------------

Write-Host "[1/2] Stopping application services..." -ForegroundColor Yellow

$ports = @(3000, 3001, 8000)  # Frontend, NestJS API, Python AI Service

foreach ($port in $ports) {
    $listeners = @(Get-NexusPortListeners -Ports @($port))

    if ($listeners) {
        foreach ($listener in $listeners) {
            $nameSuffix = if ($listener.ProcessName) { ", Name: $($listener.ProcessName)" } else { "" }
            Write-Host "    Stopping process on port $port (PID: $($listener.ProcessId)$nameSuffix)..." -ForegroundColor Gray
            Stop-NexusProcessId -ProcessId $listener.ProcessId
            Write-Host "    [OK] Stopped" -ForegroundColor Green
        }
    } else {
        Write-Host "    No process found on port $port" -ForegroundColor Gray
    }
}

Write-Host "[OK] Application services stopped" -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------------------
# Step 2: Stop Infrastructure Services
# ------------------------------------------------------------------------

if (-not $KeepInfra) {
    Write-Host "[2/2] Stopping infrastructure services (Docker Compose)..." -ForegroundColor Yellow
    
    Push-Location $workspaceRoot
    try {
        docker compose down
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] Infrastructure services stopped" -ForegroundColor Green
        } else {
            Write-Host "[WARN] docker-compose down returned non-zero exit code" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "[WARN] Failed to stop Docker Compose services: $_" -ForegroundColor Yellow
    }
    finally {
        Pop-Location
    }
} else {
    Write-Host "[2/2] Keeping infrastructure running (--KeepInfra)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "      NexCore Platform Stopped                                " -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
