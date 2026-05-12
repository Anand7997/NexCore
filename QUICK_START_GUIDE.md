# NexCore - Quick Start Deployment Guide
**Last Updated:** May 12, 2026

---

## 🚀 FASTEST PATH TO PRODUCTION

This guide gets your **fully-implemented** NexCore platform running in under 30 minutes.

---

## Prerequisites

Ensure you have installed:
- Node.js 18+ and npm
- Python 3.11+
- Docker Desktop
- Git

---

## Step 1: Clone and Install (5 minutes)

```powershell
# Clone repository
cd c:\Users\VAnand\Downloads\NexCore

# Install backend dependencies
cd nexus-backend
npm install
cd ..

# Install frontend dependencies
cd nexus-qa
npm install
cd ..

# Install Python dependencies
cd nexus-api
pip install -r requirements.txt
cd ..
```

---

## Step 2: Start Infrastructure Services (5 minutes)

Create a `docker-compose.yml` in the root:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: nexus
      POSTGRES_PASSWORD: nexus
      POSTGRES_DB: nexus
    volumes:
      - postgres_data:/var/lib/postgresql/data

  temporal:
    image: temporalio/auto-setup:latest
    ports:
      - "7233:7233"
      - "8233:8233"  # Temporal UI
    environment:
      - DB=postgresql
      - DB_PORT=5432
      - POSTGRES_USER=nexus
      - POSTGRES_PWD=nexus
      - POSTGRES_SEEDS=postgres
    depends_on:
      - postgres

  nats:
    image: nats:latest
    ports:
      - "4222:4222"
      - "8222:8222"  # HTTP monitoring

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage

  keycloak:
    image: quay.io/keycloak/keycloak:latest
    command: start-dev
    ports:
      - "8080:8080"
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin

volumes:
  postgres_data:
  qdrant_data:
```

Start all services:

```powershell
docker-compose up -d

# Wait 30 seconds for services to initialize
Start-Sleep -Seconds 30
```

---

## Step 3: Configure Backend (2 minutes)

Update `nexus-backend/.env` (already exists):

```env
NODE_ENV=development
PORT=3001
SERVICE_NAME=nexus-backend

DATABASE_URL=postgresql://nexus:nexus@localhost:5432/nexus

KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=nexus
KEYCLOAK_CLIENT_ID=nexus-backend
AUTH_DISABLED=true  # Enable for local dev

OTEL_ENABLED=false

AI_SERVICE_URL=http://localhost:8000

NATS_URL=nats://localhost:4222

TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
```

Run database migrations:

```powershell
cd nexus-backend
npm run db:push
```

---

## Step 4: Start All Backend Services (5 minutes)

Open **7 separate PowerShell terminals** and run:

### Terminal 1: NestJS API
```powershell
cd c:\Users\VAnand\Downloads\NexCore\nexus-backend
npm run start:dev
```
✅ **Expected:** API listening on http://localhost:3001  
✅ **Health Check:** http://localhost:3001/health

---

### Terminal 2: Temporal Worker
```powershell
cd c:\Users\VAnand\Downloads\NexCore\nexus-backend
npm run start:worker
```
✅ **Expected:** Worker connected to Temporal, polling task queue  
✅ **Temporal UI:** http://localhost:8233

---

### Terminal 3: Python AI Service
```powershell
cd c:\Users\VAnand\Downloads\NexCore\nexus-api
uvicorn app.main:app --reload --port 8000
```
✅ **Expected:** API listening on http://localhost:8000  
✅ **Docs:** http://localhost:8000/docs

---

### Terminal 4: Python AI Job Runner
```powershell
cd c:\Users\VAnand\Downloads\NexCore\nexus-api
python -m app.intelligence.ai_job_runner
```
✅ **Expected:** AI job runner listening on NATS subject `ai.jobs`

---

### Terminal 5: External Runtime Agent
```powershell
cd c:\Users\VAnand\Downloads\NexCore\nexus-backend

# Set agent capabilities
$env:AGENT_CAPABILITIES='["web","api"]'
$env:AGENT_NAME="local-web-agent"

npm run start:agent
```
✅ **Expected:** Agent registered with backend, polling for commands

---

### Terminal 6: Frontend (Next.js)
```powershell
cd c:\Users\VAnand\Downloads\NexCore\nexus-qa
npm run dev
```
✅ **Expected:** Frontend listening on http://localhost:3000

---

### Terminal 7: Optional - Second Runtime Agent (Mobile/Desktop)
```powershell
cd c:\Users\VAnand\Downloads\NexCore\nexus-backend

$env:AGENT_CAPABILITIES='["android","ios","desktop"]'
$env:AGENT_NAME="local-mobile-agent"

npm run start:agent
```

---

## Step 5: Verify Full Stack (5 minutes)

### 1. Check All Services

```powershell
# Backend API health
curl http://localhost:3001/health

# Python API health
curl http://localhost:8000/health

# Frontend
curl http://localhost:3000

# Temporal UI
Start-Process http://localhost:8233

# NATS monitoring
curl http://localhost:8222/varz
```

---

### 2. Test Workflow Execution End-to-End

#### Via Frontend UI:

1. Open http://localhost:3000/workflows
2. Click **"Create Workflow"**
3. Add nodes:
   - `web.navigate` → `{ "url": "http://localhost:3000/demo" }`
   - `web.click` → `{ "selector": "#counter-increment" }`
   - `web.assert_text` → `{ "selector": "#counter-value", "expected": "1" }`
4. Click **"Save Workflow"**
5. Click **"Run Workflow"** → Select platform: `web`
6. Watch execution in real-time!

#### Via API (curl):

```powershell
# 1. Create a simple workflow
$workflow = @{
  name = "Test Workflow"
  nodes = @(
    @{
      key = "node1"
      type = "web.navigate"
      label = "Navigate to Demo"
      config = @{ url = "http://localhost:3000/demo" }
    }
    @{
      key = "node2"
      type = "web.screenshot"
      label = "Capture Screenshot"
      config = @{ filename = "demo.png" }
    }
  )
  edges = @(
    @{ source = "node1"; target = "node2" }
  )
} | ConvertTo-Json -Depth 5

# Save workflow
$response = Invoke-RestMethod -Method POST -Uri "http://localhost:3001/workflows" -Body $workflow -ContentType "application/json"
$workflowId = $response.id

# 2. Trigger execution
$execution = @{
  workflowId = $workflowId
  platform = "web"
  variables = @{}
} | ConvertTo-Json

$execResponse = Invoke-RestMethod -Method POST -Uri "http://localhost:3001/orchestration/start" -Body $execution -ContentType "application/json"
$executionId = $execResponse.id

# 3. Check status
Invoke-RestMethod -Uri "http://localhost:3001/orchestration/executions/$executionId"

# 4. View in Temporal UI
Start-Process "http://localhost:8233/namespaces/default/workflows"
```

---

### 3. Test AI Investigation

```powershell
# Trigger an AI investigation for a failed execution
$aiJob = @{
  type = "root_cause_analysis"
  evidence = @{
    executionId = "exec_123"
    timeline = @(
      @{
        nodeId = "node1"
        status = "failed"
        error = "Element not found: #missing-button"
      }
    )
    artifacts = @()
  }
} | ConvertTo-Json -Depth 5

$aiResponse = Invoke-RestMethod -Method POST -Uri "http://localhost:3001/ai-gateway/jobs" -Body $aiJob -ContentType "application/json"
$jobId = $aiResponse.id

# Check AI job result
Start-Sleep -Seconds 5
Invoke-RestMethod -Uri "http://localhost:3001/ai-gateway/jobs/$jobId"
```

---

### 4. Test Intent Compilation

```powershell
# Compile a business intent into platform-specific nodes
$intentPlan = @{
  platform = "web"
  steps = @(
    @{ intent = "nav.open"; params = @{ url = "https://example.com" } }
    @{ intent = "ui.click"; params = @{ selector = "#login-button" } }
    @{ intent = "form.fill"; params = @{ selector = "#username"; value = "admin" } }
    @{ intent = "ui.assert_text"; params = @{ selector = "#welcome"; expected = "Welcome" } }
  )
  clientSchemaVersion = "1.0"
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method POST -Uri "http://localhost:3001/intent/compile" -Body $intentPlan -ContentType "application/json"
```

---

## Step 6: Run Automated Tests (5 minutes)

```powershell
cd c:\Users\VAnand\Downloads\NexCore\nexus-qa

# Run all Playwright tests
npx playwright test

# Run only web plugin tests
npx playwright test tests/web

# Run API contract tests
npx playwright test tests/api

# Run cross-platform parity tests
npx playwright test tests/regression/cross-platform-parity

# View HTML report
npx playwright show-report
```

---

## 📊 Monitoring & Debugging

### Temporal Workflows
- **UI:** http://localhost:8233
- View all workflows, execution history, and event timelines

### NATS Monitoring
- **HTTP:** http://localhost:8222
- Endpoints: `/varz`, `/subsz`, `/connz`

### Logs
Each terminal shows real-time logs for its service:
- NestJS: Pino structured logs
- Python: Uvicorn + custom logging
- Temporal Worker: Temporal SDK logs
- Runtime Agent: Agent lifecycle events

---

## 🛑 Common Issues & Fixes

### Issue: "Port already in use"
```powershell
# Kill processes on specific ports
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -Force
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess -Force
Stop-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess -Force
```

### Issue: "Database connection failed"
```powershell
# Restart PostgreSQL container
docker-compose restart postgres

# Check logs
docker-compose logs postgres
```

### Issue: "Temporal worker not connecting"
```powershell
# Verify Temporal is running
curl http://localhost:7233

# Check worker logs for connection errors
# Restart Temporal
docker-compose restart temporal
```

### Issue: "NATS not available"
```powershell
# Restart NATS
docker-compose restart nats

# Verify
curl http://localhost:8222/varz
```

### Issue: "AI job runner not receiving jobs"
```powershell
# Verify NATS connection in Python logs
# Check that NATS_URL in nexus-api/.env matches docker-compose (nats://localhost:4222)
```

---

## 🔐 Production Deployment Changes

When deploying to production:

1. **Disable Dev Auth:**
   ```env
   AUTH_DISABLED=false
   ```

2. **Configure Keycloak:**
   - Create `nexus` realm
   - Create `nexus-backend` client (confidential)
   - Configure client scopes
   - Add users with roles

3. **Use Production Database:**
   ```env
   DATABASE_URL=postgresql://user:pass@prod-db.example.com:5432/nexus
   ```

4. **Enable OpenTelemetry:**
   ```env
   OTEL_ENABLED=true
   OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318
   ```

5. **Scale Services:**
   - Deploy multiple Temporal workers
   - Deploy runtime agents per platform (web, mobile, desktop)
   - Use NATS cluster with persistence
   - Use PostgreSQL with read replicas

---

## 📚 Additional Resources

- **Temporal Docs:** https://docs.temporal.io
- **NATS Docs:** https://docs.nats.io
- **Qdrant Docs:** https://qdrant.tech/documentation
- **Keycloak Docs:** https://www.keycloak.org/docs/latest
- **Playwright Docs:** https://playwright.dev

---

## ✅ Success Checklist

- [ ] All 7 services running without errors
- [ ] Health checks passing for NestJS and Python APIs
- [ ] Temporal UI showing workflows
- [ ] NATS monitoring showing connections
- [ ] Frontend accessible at localhost:3000
- [ ] Workflow execution completes successfully
- [ ] AI investigation returns results
- [ ] Intent compilation works for all platforms
- [ ] Playwright tests pass

---

## 🎉 Congratulations!

You now have a **fully operational AI-powered execution intelligence platform** running locally!

### What You Can Do Now:

✅ Create and execute workflows via UI  
✅ Monitor executions in real-time  
✅ Get AI-driven failure analysis  
✅ Compile business intents to platform-specific nodes  
✅ Run cross-platform tests  
✅ Scale with external runtime agents  

### Next Steps:

1. Explore the frontend at http://localhost:3000
2. Create your first workflow
3. Watch Temporal orchestrate execution
4. Review AI investigation results
5. Deploy to production!

---

**Need Help?** Check [IMPLEMENTATION_STATUS_REPORT.md](IMPLEMENTATION_STATUS_REPORT.md) for comprehensive documentation.
