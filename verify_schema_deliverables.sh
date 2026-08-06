#!/bin/bash
# Quick verification script for schema deliverables
# Run this to verify all files are present and readable

echo "=========================================="
echo "Schema Deliverables Verification"
echo "=========================================="
echo ""

SCHEMA_DIR="/home/yogaimawan/Dokumentasi/shopee_profit_estimation"
cd "$SCHEMA_DIR" || exit 1

# Check required files
FILES=(
    "schema.sql"
    "test_queries.sql"
    "SCHEMA_DOCUMENTATION.md"
    "SCHEMA_SUMMARY.md"
    "SCHEMA_ERD.md"
    "SCHEMA_DESIGN_COMPLETE.md"
    "SCHEMA_DELIVERABLES.md"
    "SCHEMA_README.md"
)

echo "Checking files..."
MISSING=0
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        SIZE=$(du -h "$file" | cut -f1)
        LINES=$(wc -l < "$file")
        printf "✓ %-40s %8s  %5d lines\n" "$file" "$SIZE" "$LINES"
    else
        echo "✗ $file - MISSING!"
        MISSING=$((MISSING + 1))
    fi
done

echo ""
echo "----------------------------------------"
echo "Summary:"
echo "----------------------------------------"
echo "Total files: ${#FILES[@]}"
echo "Missing files: $MISSING"
echo "Total lines: $(cat "${FILES[@]}" 2>/dev/null | wc -l)"
echo "Total size: $(du -sh . | cut -f1)"

echo ""
if [ $MISSING -eq 0 ]; then
    echo "✅ All deliverables present!"
    echo ""
    echo "Next steps:"
    echo "1. Execute schema: mysql ... < schema.sql"
    echo "2. Test schema: mysql ... < test_queries.sql"
    echo "3. Read SCHEMA_README.md for complete guide"
else
    echo "❌ Some files are missing!"
    exit 1
fi

echo ""
echo "=========================================="
