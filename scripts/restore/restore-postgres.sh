#!/bin/bash
set -e

# PostgreSQL Restore Script
# Usage: ./restore-postgres.sh <backup-file>
#
# Example: ./restore-postgres.sh postgres-backup-20260511-020000.sql.gz

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  echo "Error: Backup file not specified"
  echo "Usage: $0 <backup-file>"
  echo "Example: $0 postgres-backup-20260511-020000.sql.gz"
  exit 1
fi

echo "=== PostgreSQL Restore ==="
echo "Backup file: $BACKUP_FILE"
echo ""

# Configuration
POSTGRES_POD=$(kubectl get pods -n nexus-qa -l app=postgres -o jsonpath='{.items[0].metadata.name}')
S3_ENDPOINT=${S3_ENDPOINT:-http://minio:9000}
S3_BUCKET=${S3_BUCKET:-nexus-backups}

echo "PostgreSQL pod: $POSTGRES_POD"
echo ""

# Download backup from S3/MinIO
echo "1. Downloading backup from S3/MinIO..."
mc alias set backup $S3_ENDPOINT $S3_ACCESS_KEY $S3_SECRET_KEY
mc cp backup/$S3_BUCKET/postgres/$BACKUP_FILE /tmp/$BACKUP_FILE

# Copy to PostgreSQL pod
echo "2. Copying backup to PostgreSQL pod..."
kubectl cp /tmp/$BACKUP_FILE nexus-qa/$POSTGRES_POD:/tmp/$BACKUP_FILE

# Stop backend services to prevent writes
echo "3. Scaling down backend services..."
kubectl scale deployment nexus-backend -n nexus-qa --replicas=0
kubectl scale deployment nexus-temporal-worker -n nexus-qa --replicas=0

# Drop and recreate database
echo "4. Dropping and recreating database..."
kubectl exec -n nexus-qa $POSTGRES_POD -- psql -U postgres -c "DROP DATABASE IF EXISTS nexus;"
kubectl exec -n nexus-qa $POSTGRES_POD -- psql -U postgres -c "CREATE DATABASE nexus;"

# Restore from backup
echo "5. Restoring database from backup..."
kubectl exec -n nexus-qa $POSTGRES_POD -- bash -c "gunzip -c /tmp/$BACKUP_FILE | psql -U postgres -d nexus"

# Clean up
echo "6. Cleaning up..."
kubectl exec -n nexus-qa $POSTGRES_POD -- rm /tmp/$BACKUP_FILE
rm /tmp/$BACKUP_FILE

# Restart backend services
echo "7. Scaling up backend services..."
kubectl scale deployment nexus-backend -n nexus-qa --replicas=2
kubectl scale deployment nexus-temporal-worker -n nexus-qa --replicas=2

# Wait for rollout
echo "8. Waiting for deployments to be ready..."
kubectl rollout status deployment/nexus-backend -n nexus-qa
kubectl rollout status deployment/nexus-temporal-worker -n nexus-qa

echo ""
echo "✅ PostgreSQL restore completed successfully!"
echo "Database restored from: $BACKUP_FILE"
