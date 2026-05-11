# Disaster Recovery Runbook
# NexCore Platform - Full System Restore

## Overview
This runbook guides you through a complete disaster recovery (DR) scenario for the NexCore platform.

## Pre-Disaster Preparation

### ✅ Backup Verification Checklist
- [ ] Daily backup CronJobs are running successfully
- [ ] Backups are stored in multiple availability zones
- [ ] Backup retention policy is enforced (30 days)
- [ ] Test restores are performed quarterly
- [ ] Backup monitoring alerts are configured

### 🔑 Recovery Credentials
Store these credentials in a secure location (e.g., 1Password, HashiCorp Vault):
- Kubernetes cluster admin credentials
- S3/MinIO backup bucket access keys
- Database superuser passwords
- Keycloak admin credentials
- DNS/domain management credentials

---

## Disaster Recovery Procedure

### Step 1: Assess Damage Scope
**Duration: 5-10 minutes**

Determine what components are affected:
```bash
# Check cluster health
kubectl get nodes
kubectl get pods -n nexus-qa

# Check backup availability
mc ls backup/nexus-backups/postgres/
mc ls backup/nexus-backups/clickhouse/
mc ls backup/nexus-backups/neo4j/
mc ls backup/nexus-backups/qdrant/
```

Document:
- Last known good state timestamp
- Affected components (API, workers, databases)
- Data loss window (time since last backup)

---

### Step 2: Stop All Services
**Duration: 2-5 minutes**

Prevent inconsistent state during recovery:
```bash
# Scale all deployments to 0
kubectl scale deployment -n nexus-qa --all --replicas=0

# Verify all pods are terminated
kubectl get pods -n nexus-qa
```

---

### Step 3: Restore Databases
**Duration: 30-60 minutes (depends on data size)**

Restore in dependency order:

#### 3.1 PostgreSQL (Primary Control Plane)
```bash
# List available backups
mc ls backup/nexus-backups/postgres/

# Restore latest backup
./scripts/restore/restore-postgres.sh postgres-backup-YYYYMMDD-HHMMSS.sql.gz
```

#### 3.2 ClickHouse (Analytics)
```bash
# List available backups
kubectl exec -n nexus-qa clickhouse-0 -- clickhouse-backup list remote

# Restore latest backup
./scripts/restore/restore-clickhouse.sh clickhouse-YYYYMMDD-HHMMSS
```

#### 3.3 Neo4j (Knowledge Graph)
```bash
# Download backup from S3
mc cp backup/nexus-backups/neo4j/neo4j-backup-YYYYMMDD-HHMMSS.dump /tmp/neo4j.dump

# Copy to Neo4j pod
kubectl cp /tmp/neo4j.dump nexus-qa/neo4j-0:/tmp/neo4j.dump

# Restore
kubectl exec -n nexus-qa neo4j-0 -- neo4j-admin database load neo4j --from-path=/tmp
```

#### 3.4 Qdrant (Vector Search)
```bash
# Download snapshot
mc cp backup/nexus-backups/qdrant/qdrant-YYYYMMDD-HHMMSS.snapshot /tmp/qdrant.snapshot

# Upload to Qdrant via API
curl -X POST "http://qdrant:6333/collections/nexus_vectors/snapshots/upload" \
  --data-binary @/tmp/qdrant.snapshot
```

#### 3.5 MinIO (Object Storage)
```bash
# Restore from secondary bucket
mc mirror --preserve --overwrite backup/nexus-artifacts-backup/ minio/nexus-artifacts/
```

---

### Step 4: Verify Data Integrity
**Duration: 10-15 minutes**

Run validation queries:
```bash
# PostgreSQL: Check record counts
kubectl exec -n nexus-qa postgres-0 -- psql -U postgres -d nexus -c \
  "SELECT 'tenants', COUNT(*) FROM tenant_tenants
   UNION ALL SELECT 'workflows', COUNT(*) FROM workflow_definitions
   UNION ALL SELECT 'executions', COUNT(*) FROM execution_runs;"

# ClickHouse: Verify analytics data
kubectl exec -n nexus-qa clickhouse-0 -- clickhouse-client -q \
  "SELECT count() FROM execution_logs;"

# Neo4j: Check node counts
kubectl exec -n nexus-qa neo4j-0 -- cypher-shell -u neo4j -p $NEO4J_PASSWORD \
  "MATCH (n) RETURN labels(n)[0] AS type, count(*) AS count;"
```

Compare counts against pre-disaster baseline.

---

### Step 5: Restore Application Services
**Duration: 5-10 minutes**

Scale services back up:
```bash
# Scale backend services
kubectl scale deployment nexus-backend -n nexus-qa --replicas=2
kubectl scale deployment nexus-temporal-worker -n nexus-qa --replicas=2
kubectl scale deployment nexus-python-workers -n nexus-qa --replicas=2

# Wait for rollout
kubectl rollout status deployment/nexus-backend -n nexus-qa
kubectl rollout status deployment/nexus-temporal-worker -n nexus-qa
kubectl rollout status deployment/nexus-python-workers -n nexus-qa
```

---

### Step 6: Health Checks
**Duration: 5-10 minutes**

Verify all systems are healthy:
```bash
# API health
curl https://nexus-qa.example.com/health/ready

# Check database connections
kubectl logs -n nexus-qa -l app=nexus-backend --tail=50 | grep -i "database\|postgres"

# Check NATS connectivity
kubectl logs -n nexus-qa -l app=nexus-backend --tail=50 | grep -i "nats"

# Check Temporal worker
kubectl logs -n nexus-qa -l app=nexus-temporal-worker --tail=50 | grep -i "worker started"
```

---

### Step 7: Functional Testing
**Duration: 15-30 minutes**

Run smoke tests:
```bash
# Create test workflow
curl -X POST https://nexus-qa.example.com/api/workflows \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "DR Test Workflow", "status": "draft"}'

# Execute test workflow
curl -X POST https://nexus-qa.example.com/api/executions \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workflowId": "<workflow-id>", "platform": "web"}'

# Verify execution completed
curl https://nexus-qa.example.com/api/executions/<execution-id> \
  -H "Authorization: Bearer $TEST_TOKEN"
```

Run automated test suite:
```bash
cd nexus-qa
npm test -- tests/smoke/
```

---

### Step 8: DNS and Traffic Cutover
**Duration: 5-15 minutes (+ DNS propagation time)**

If restoring to a new cluster:
```bash
# Update DNS records to point to new cluster ingress
# (Use your DNS provider's CLI or web UI)

# Example with Route53:
aws route53 change-resource-record-sets --hosted-zone-id Z123456 \
  --change-batch file://dns-update.json

# Wait for propagation
dig nexus-qa.example.com
```

---

### Step 9: Monitor and Validate
**Duration: Ongoing for 24-48 hours**

Post-recovery monitoring:
```bash
# Watch pod status
watch kubectl get pods -n nexus-qa

# Monitor logs for errors
stern -n nexus-qa nexus-backend

# Check metrics dashboard
# Open Grafana/Prometheus and verify:
# - API request rates
# - Error rates
# - Database query performance
# - Queue depths
```

Set up enhanced alerting for 48 hours post-recovery.

---

### Step 10: Post-Mortem
**Duration: 1-2 hours (within 1 week)**

Document:
- Root cause of disaster
- Total downtime duration
- Data loss (if any)
- Recovery process deviations
- Lessons learned
- Action items to prevent recurrence

Update this runbook with improvements.

---

## Recovery Time Objective (RTO) / Recovery Point Objective (RPO)

| Component | RTO | RPO | Notes |
|-----------|-----|-----|-------|
| PostgreSQL | 30 min | 24 hours | Daily backups |
| ClickHouse | 20 min | 24 hours | Daily incremental backups |
| Neo4j | 20 min | 24 hours | Daily backups |
| Qdrant | 15 min | 24 hours | Daily snapshots |
| MinIO | 30 min | 1 hour | Continuous replication |
| **Total System** | **60 min** | **24 hours** | Full restore |

---

## Emergency Contacts

| Role | Contact | Availability |
|------|---------|--------------|
| Platform Lead | | 24/7 on-call |
| DevOps Engineer | | 24/7 on-call |
| DBA | | Business hours + escalation |
| Security Team | | 24/7 for security incidents |
| Cloud Provider Support | | 24/7 (Enterprise support) |

---

## Testing Schedule

- **Weekly**: Backup verification (check latest backup exists)
- **Monthly**: Single-component restore test
- **Quarterly**: Full DR drill (all components)
- **Annually**: Cross-region failover test

---

## Appendix: Common Issues

### Issue: PostgreSQL restore fails with permission denied
**Solution**: Ensure the restore user has SUPERUSER privileges or use `--no-owner --no-acl` flags.

### Issue: ClickHouse backup not found
**Solution**: Check remote storage configuration in `clickhouse-backup` config. Verify S3/MinIO credentials.

### Issue: Neo4j restore fails with "database already exists"
**Solution**: Drop the database first: `neo4j-admin database delete neo4j`

### Issue: Qdrant snapshot upload fails
**Solution**: Verify collection name matches. Check Qdrant disk space.

### Issue: MinIO replication slow
**Solution**: Use `mc mirror --parallel 10` to increase concurrency. Check network bandwidth.
