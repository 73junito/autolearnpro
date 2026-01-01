#!/bin/sh
# Database migration script for Kubernetes pod

echo "========================================="
echo "Running Database Migrations"
echo "========================================="
echo ""

# Run Ecto migrations
mix ecto.migrate

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ Migrations completed successfully"
    exit 0
else
    echo ""
    echo "✗ Migration failed"
    exit 1
fi
