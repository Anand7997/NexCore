#!/bin/bash
set -e

# ClickHouse Restore Script
# Usage: ./restore-clickhouse.sh <backup-name>
#
# Example: ./restore-clickhouse.sh clickhouse-20260511-030000

BACKUP_NAME=$1

if [ -z "$BACKUP_NAME" ]; then
  echo "Error: Backup name not specified"
  echo "Usage: $0 <backup-name>"
  echo "Example: $0 clickhouse-20260511-030000"
  exit 1
fi

echo "=== ClickHouse Restore ==="
echo "Backup name: $BACKUP_NAME"
echo ""

CLICKHOUSE_POD=$(kubectl get pods -n nexus-qa -l app=clickhouse -o jsonpath='{.items[0].metadata.name}')

echo "ClickHouse pod: $CLICKHOUSE_POD"
echo ""

# Download backup from remote storage
echo "1. Downloading backup from remote storage..."
kubectl exec -n nexus-qa $CLICKHOUSE_POD -- clickhouse-backup download $BACKUP_NAME

# Stop writes (scale down workers)
echo "2. Scaling down worker services..."
kubectl scale deployment nexus-python-workers -n nexus-qa --replicas=0

# Restore from backup
echo "3. Restoring ClickHouse from backup..."
kubectl exec -n nexus-qa $CLICKHOUSE_POD -- clickhouse-backup restore $BACKUP_NAME

# Clean up local backup
echo "4. Cleaning up local backup..."
kubectl exec -n nexus-qa $CLICKHOUSE_POD -- clickhouse-backup delete local $BACKUP_NAME

# Restart workers
echo "5. Scaling up worker services..."
kubectl scale deployment nexus-python-workers -n nexus-qa --replicas=2

echo ""
echo "✅ ClickHouse restore completed successfully!"
echo "Database restored from: $BACKUP_NAME"
