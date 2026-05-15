#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start PostgreSQL service (requires Administrator privileges)
.DESCRIPTION
    This script attempts to start the PostgreSQL Windows service.
    Right-click and select "Run with PowerShell as Administrator"
#>

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script requires Administrator privileges" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please right-click this file and select 'Run with PowerShell as Administrator'" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Starting PostgreSQL service..." -ForegroundColor Cyan

try {
    Start-Service -Name "postgresql-x64-16" -ErrorAction Stop
    Write-Host "✓ PostgreSQL service started successfully!" -ForegroundColor Green
    
    # Wait a moment for the service to initialize
    Start-Sleep -Seconds 2
    
    # Verify it's running
    $service = Get-Service -Name "postgresql-x64-16"
    if ($service.Status -eq "Running") {
        Write-Host "✓ PostgreSQL is now running" -ForegroundColor Green
        Write-Host ""
        Write-Host "You can now run: .\start-nexus.ps1" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ Failed to start PostgreSQL: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Try starting PostgreSQL via pgAdmin instead" -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Press Enter to exit"
