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
    try {
        $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
        
        if ($connections) {
            foreach ($conn in $connections) {
                $processId = $conn.OwningProcess
                $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
                
                if ($process) {
                    Write-Host "    Stopping process on port $port (PID: $processId, Name: $($process.ProcessName))..." -ForegroundColor Gray
                    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
                    Write-Host "    [OK] Stopped" -ForegroundColor Green
                }
            }
        } else {
            Write-Host "    No process found on port $port" -ForegroundColor Gray
        }
    }
    catch {
        Write-Host "    [WARN] Could not stop process on port $port" -ForegroundColor Yellow
    }
}

# Stop any remaining Node.js processes running from nexus-backend or nexus-qa
Write-Host "    Stopping remaining Node.js and Python processes..." -ForegroundColor Gray

Get-Process -Name node, python, uvicorn -ErrorAction SilentlyContinue | ForEach-Object {
    $cmdLine = (Get-WmiObject Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine
    
    if ($cmdLine -like "*nexus-backend*" -or $cmdLine -like "*nexus-api*" -or $cmdLine -like "*nexus-qa*") {
        Write-Host "    Stopping $($_.ProcessName) (PID: $($_.Id))..." -ForegroundColor Gray
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
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
