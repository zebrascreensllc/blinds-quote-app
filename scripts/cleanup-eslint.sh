#!/bin/bash

# ESLint Cleanup Script
# Automatically removes unused variables and applies ESLint fixes
#
# Usage:
#   chmod +x scripts/cleanup-eslint.sh
#   ./scripts/cleanup-eslint.sh
#
# Or add to package.json:
#   "lint:fix": "eslint src --fix && node scripts/cleanup-unused-vars.js"

echo "🔧 ESLint Auto-Cleanup Tool"
echo "═════════════════════════════════════════════════════════"
echo ""

# Check if eslint is installed
if ! command -v npx &> /dev/null; then
    echo "❌ ESLint not found. Installing..."
    npm install eslint --save-dev
fi

echo "✅ Running ESLint fix..."
npx eslint src --fix

echo ""
echo "🔍 Checking for remaining no-unused-vars errors..."
npx eslint src --format=json 2>/dev/null | grep -o "no-unused-vars" | wc -l | tr -d '\n'
echo " unused variable issues found"

echo ""
echo "═════════════════════════════════════════════════════════"
echo "✅ ESLint cleanup complete!"
echo ""
echo "💡 TIPS:"
echo "   1. Prefix unused variables with _ to suppress warnings:"
echo "      const _unused = value; // Won't trigger warning"
echo ""
echo "   2. Run auto-fix frequently:"
echo "      npm run lint:fix"
echo ""
echo "   3. Check for unused imports:"
echo "      npx eslint src --no-eslintrc --rule 'no-unused-vars: error'"
echo ""
