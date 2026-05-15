#!/usr/bin/env pwsh
<#
.SYNOPSIS
    NexCore - Complete Stack Startup Script
.DESCRIPTION
    Starts all required infrastructure and application services for local development.
    This script orchestrates the entire NexCore platform in the correct order.
.EXAMPLE
    .\start-nexus.ps1
.EXAMPLE
    .\start-nexus.ps1 -SkipInfra  # Start only application services (infra already running)
.EXAMPLE
    .\start-nexus.ps1 -WithAiExtras  # Install optional LangGraph/Qdrant/OpenAI worker deps
.EXAMPLE
    .\start-nexus.ps1 -ApplyBackendSchema  # Run NestJS drizzle push against PostgreSQL
.EXAMPLE
    .\start-nexus.ps1 -RunTests  # Run Playwright verification after startup
#>

[CmdletBinding()]
param(
    [switch]$UseDocker,
    [switch]$SkipTests,
    [switch]$RunTests,
    [switch]$WithAiExtras,
    [switch]$ApplyBackendSchema
)

$ErrorActionPreference = "Stop"
$workspaceRoot = $PSScriptRoot
$aiModules = @("langgraph", "qdrant_client", "sentence_transformers", "nats", "openai")
$aiReady = $false
$shellCommand = Get-Command pwsh -ErrorAction SilentlyContinue
if ($shellCommand) {
    $shellExe = $shellCommand.Source
} else {
    $shellExe = (Get-Command powershell.exe -ErrorAction Stop).Source
}

if ($RunTests -and $SkipTests) {
    throw "Use either -RunTests or -SkipTests, not both."
}

function Test-PythonModules {
    param(
        [string]$PythonExe,
        [string[]]$Modules
    )

    $moduleCsv = $Modules -join ","
    & $PythonExe -c "import importlib.util, sys; modules = '$moduleCsv'.split(','); sys.exit(0 if all(importlib.util.find_spec(name) for name in modules) else 1)"
    return $LASTEXITCODE -eq 0
}

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "      NexCore - Enterprise Execution Intelligence Platform     " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------------------
# Step 1: Start Infrastructure Services (Optional)
# ------------------------------------------------------------------------

if ($UseDocker) {
    Write-Host "[1/8] Starting infrastructure services (Docker Compose)..." -ForegroundColor Yellow
    
    Push-Location $workspaceRoot
    try {
        docker compose up -d
        if ($LASTEXITCODE -ne 0) {
            throw "Docker Compose failed to start infrastructure"
        }
        Write-Host "[OK] Infrastructure services started" -ForegroundColor Green
        
        Write-Host "    Waiting 30 seconds for services to initialize..." -ForegroundColor Gray
        Start-Sleep -Seconds 30
        
        Write-Host "[OK] Services ready" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
} else {
    Write-Host "[1/8] Skipping Docker infrastructure (use -UseDocker to enable)" -ForegroundColor Gray
    Write-Host "    Using externally managed PostgreSQL and other configured services" -ForegroundColor Gray
}

Write-Host ""

# ------------------------------------------------------------------------
# Step 2: Setup NestJS Backend
# ------------------------------------------------------------------------

Write-Host "[2/8] Setting up NestJS backend..." -ForegroundColor Yellow

Push-Location "$workspaceRoot\nexus-backend"
try {
    if (-not (Test-Path "node_modules")) {
        Write-Host "    Installing npm dependencies..." -ForegroundColor Gray
        npm install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed in nexus-backend"
        }
    }

    if (-not (Test-Path ".env")) {
        if (Test-Path ".env.example") {
            throw "nexus-backend/.env is required. Copy .env.example and point DATABASE_URL to your PostgreSQL instance."
        }

        throw "nexus-backend/.env is required for backend startup."
    }
    
    if ($ApplyBackendSchema) {
        Write-Host "    Running database push against configured PostgreSQL..." -ForegroundColor Gray
        $dbPushOutput = npm run db:push 2>&1
        $dbPushOutput | ForEach-Object { Write-Host $_ }

        $dbPushText = ($dbPushOutput | Out-String)
        if ($LASTEXITCODE -ne 0 -or $dbPushText -match '(?im)^error:') {
            throw "npm run db:push failed in nexus-backend"
        }
    } else {
        Write-Host "    Skipping automatic database push for existing PostgreSQL schema" -ForegroundColor Gray
        Write-Host "    Re-run with -ApplyBackendSchema if you want NestJS Drizzle changes applied" -ForegroundColor Gray
    }
    
    Write-Host "[OK] Backend setup complete" -ForegroundColor Green
}
finally {
    Pop-Location
}

Write-Host ""

# ------------------------------------------------------------------------
# Step 3: Setup Python Service
# ------------------------------------------------------------------------

Write-Host "[3/8] Setting up Python service..." -ForegroundColor Yellow

Push-Location "$workspaceRoot\nexus-api"
try {
    $venvPath = ".\.venv"
    if (-not (Test-Path $venvPath)) {
        Write-Host "    Creating Python virtual environment..." -ForegroundColor Gray
        python -m venv .venv
    }

    $pythonExe = Join-Path $venvPath "Scripts\python.exe"

    Write-Host "    Installing base Python dependencies..." -ForegroundColor Gray
    & $pythonExe -m pip install -q -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        throw "Base Python dependency install failed in nexus-api"
    }

    if ($WithAiExtras) {
        Write-Host "    Installing optional AI dependencies..." -ForegroundColor Gray
        & $pythonExe -m pip install -q -r requirements-ai.txt
        if ($LASTEXITCODE -ne 0) {
            throw "Optional AI dependency install failed in nexus-api"
        }
    }

    $aiReady = Test-PythonModules -PythonExe $pythonExe -Modules $aiModules
    if ($aiReady) {
        if ($WithAiExtras) {
            Write-Host "    [OK] Optional AI dependencies installed" -ForegroundColor Green
        } else {
            Write-Host "    [OK] Optional AI dependencies already available" -ForegroundColor Green
        }
    } else {
        Write-Host "    Optional AI dependencies not installed; LangGraph RCA worker will be skipped" -ForegroundColor Gray
        Write-Host "    Re-run with -WithAiExtras to install requirements-ai.txt" -ForegroundColor Gray
    }
    
    Write-Host "[OK] Python service setup complete" -ForegroundColor Green
}
finally {
    Pop-Location
}

Write-Host ""

# ------------------------------------------------------------------------
# Step 4: Setup Frontend
# ------------------------------------------------------------------------

Write-Host "[4/8] Setting up Next.js frontend..." -ForegroundColor Yellow

Push-Location "$workspaceRoot\nexus-qa"
try {
    if (-not (Test-Path "node_modules")) {
        Write-Host "    Installing npm dependencies..." -ForegroundColor Gray
        npm install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed in nexus-qa"
        }
    }
    
    Write-Host "[OK] Frontend setup complete" -ForegroundColor Green
}
finally {
    Pop-Location
}

Write-Host ""

# ------------------------------------------------------------------------
# Step 5: Verify Infrastructure Health
# ------------------------------------------------------------------------

if ($UseDocker) {
    Write-Host "[5/8] Verifying infrastructure health..." -ForegroundColor Yellow

    $services = @(
        @{ Name = "PostgreSQL"; Url = "http://localhost:5432"; Port = 5432 }
        @{ Name = "Temporal UI"; Url = "http://localhost:8233"; Port = 8233 }
        @{ Name = "NATS"; Url = "http://localhost:8222/varz"; Port = 8222 }
        @{ Name = "Qdrant"; Url = "http://localhost:6333/healthz"; Port = 6333 }
        @{ Name = "Keycloak"; Url = "http://localhost:8080/health/ready"; Port = 8080 }
    )

    foreach ($svc in $services) {
        $portOpen = Test-NetConnection -ComputerName localhost -Port $svc.Port -InformationLevel Quiet -WarningAction SilentlyContinue
        if ($portOpen) {
            Write-Host "    [OK] $($svc.Name) is reachable" -ForegroundColor Green
        } else {
            Write-Host "    [WARN] $($svc.Name) is NOT reachable on port $($svc.Port)" -ForegroundColor Red
        }
    }
} else {
    Write-Host "[5/8] Skipping infrastructure health check" -ForegroundColor Gray
}

Write-Host ""

# ------------------------------------------------------------------------
# Step 6: Launch All Services in Separate Windows
# ------------------------------------------------------------------------

Write-Host "[6/8] Launching application services..." -ForegroundColor Yellow

$services = @(
    @{
        Name = "NestJS API"
        Path = "$workspaceRoot\nexus-backend"
        Command = "npm run start:dev"
        Color = "Blue"
    },
    @{
        Name = "Temporal Worker"
        Path = "$workspaceRoot\nexus-backend"
        Command = "npm run start:worker"
        Color = "Cyan"
    },
    @{
        Name = "Python AI Service"
        Path = "$workspaceRoot\nexus-api"
        Command = ".\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
        Color = "Yellow"
    },
    @{
        Name = "Runtime Agent (Web/API)"
        Path = "$workspaceRoot\nexus-backend"
        Command = "`$env:AGENT_CAPABILITIES='[`"web`",`"api`"]'; `$env:AGENT_NAME='local-web-agent'; npm run start:agent"
        Color = "Green"
    },
    @{
        Name = "Next.js Frontend"
        Path = "$workspaceRoot\nexus-qa"
        Command = "npm run dev"
        Color = "DarkCyan"
    }
)

if ($aiReady) {
    $services = @(
        $services[0],
        $services[1],
        $services[2],
        @{
            Name = "AI Job Runner"
            Path = "$workspaceRoot\nexus-api"
            Command = ".\.venv\Scripts\python.exe -m app.intelligence.ai_job_runner"
            Color = "Magenta"
        },
        $services[3],
        $services[4]
    )
} else {
    Write-Host "    Skipping AI Job Runner (optional AI dependencies not installed)" -ForegroundColor Gray
}

foreach ($svc in $services) {
    Write-Host "    Launching $($svc.Name)..." -ForegroundColor $svc.Color
    
    Start-Process $shellExe -ArgumentList "-NoExit", "-Command", "cd '$($svc.Path)'; Write-Host '[$($svc.Name)]' -ForegroundColor $($svc.Color); $($svc.Command)"
    
    Start-Sleep -Milliseconds 500
}

Write-Host "[OK] All services launched in separate windows" -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------------------
# Step 7: Wait for Services to Start
# ------------------------------------------------------------------------

Write-Host "[7/8] Waiting for application services to start..." -ForegroundColor Yellow
Write-Host "    This may take 30-60 seconds..." -ForegroundColor Gray

Start-Sleep -Seconds 45

Write-Host ""

# ------------------------------------------------------------------------
# Step 8: Verify Application Health
# ------------------------------------------------------------------------

Write-Host "[8/8] Verifying application health..." -ForegroundColor Yellow

$appServices = @(
    @{ Name = "NestJS API"; Url = "http://localhost:3001/api/health/live" }
    @{ Name = "Python AI Service"; Url = "http://localhost:8000/api/health" }
    @{ Name = "Next.js Frontend"; Url = "http://localhost:3000" }
)

foreach ($svc in $appServices) {
    try {
        $response = Invoke-WebRequest -Uri $svc.Url -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "    [OK] $($svc.Name) is healthy" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "    [WARN] $($svc.Name) health check failed (may still be starting)" -ForegroundColor Yellow
    }
}

Write-Host ""

# ------------------------------------------------------------------------
# Optional: Run Tests
# ------------------------------------------------------------------------

if ($RunTests) {
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "   Running Verification Tests                                  " -ForegroundColor Cyan
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Host "Running Playwright tests..." -ForegroundColor Yellow
    Push-Location "$workspaceRoot\nexus-qa"
    try {
        npx playwright test --reporter=list
        $playwrightExitCode = $LASTEXITCODE
        if ($playwrightExitCode -eq 0) {
            Write-Host "[OK] All tests passed!" -ForegroundColor Green
        } else {
            Write-Host "[WARN] Some tests failed - check output above" -ForegroundColor Yellow
        }
    }
    finally {
        $global:LASTEXITCODE = 0
        Pop-Location
    }
} elseif ($SkipTests) {
    Write-Host "Verification tests skipped (-SkipTests)." -ForegroundColor Gray
} else {
    Write-Host "Verification tests not run by default. Re-run with -RunTests to execute Playwright." -ForegroundColor Gray
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "   NexCore Platform is Running Successfully!                   " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Service URLs:" -ForegroundColor White
Write-Host "  Frontend:         http://localhost:3000" -ForegroundColor Cyan
Write-Host "  NestJS API:       http://localhost:3001" -ForegroundColor Cyan
Write-Host "  Python AI API:    http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "  Temporal UI:      http://localhost:8233" -ForegroundColor Cyan
Write-Host "  NATS Monitoring:  http://localhost:8222" -ForegroundColor Cyan
Write-Host "  Keycloak Admin:   http://localhost:8080 (admin/admin)" -ForegroundColor Cyan
Write-Host ""

if (-not $aiReady) {
    Write-Host "Note:" -ForegroundColor White
    Write-Host "  Phase 6 AI extras are not installed; the LangGraph RCA worker was not started." -ForegroundColor Yellow
    Write-Host "  Run .\start-nexus.ps1 -WithAiExtras to enable AI job processing." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "Quick Actions:" -ForegroundColor White
Write-Host "  Create Workflow:  http://localhost:3000/workflows" -ForegroundColor Green
Write-Host "  View Executions:  http://localhost:3000/executions" -ForegroundColor Green
Write-Host "  AI Analysis:      http://localhost:3000/ai-analysis" -ForegroundColor Green
Write-Host "  Settings:         http://localhost:3000/settings" -ForegroundColor Green
Write-Host ""

Write-Host "Documentation:" -ForegroundColor White
Write-Host "  Implementation Status: IMPLEMENTATION_STATUS_REPORT.md" -ForegroundColor Gray
Write-Host "  Quick Start Guide:     QUICK_START_GUIDE.md" -ForegroundColor Gray
Write-Host ""

Write-Host "To stop all services:" -ForegroundColor White
Write-Host "  docker-compose down" -ForegroundColor Gray
Write-Host "  (Then close the PowerShell windows manually)" -ForegroundColor Gray
Write-Host ""

Write-Host "Happy Testing!" -ForegroundColor Green

$global:LASTEXITCODE = 0
