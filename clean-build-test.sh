#!/bin/bash

# Clean Build Test Script for MemberJunction
# This script simulates the GitHub Actions environment to catch missing dependencies

set -e  # Exit on any error

echo "========================================="
echo "MemberJunction Clean Build Test"
echo "========================================="
echo ""

# Get the script directory (repo root)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "📁 Working directory: $SCRIPT_DIR"
echo ""

# Step 1: Clean all node_modules
echo "🧹 Step 1: Cleaning all node_modules..."
rm -rf node_modules
rm -rf packages/*/node_modules
rm -rf packages/*/*/node_modules
echo "✅ node_modules cleaned"
echo ""

# Step 2: Clean all dist folders
echo "🧹 Step 2: Cleaning all dist folders..."
rm -rf packages/*/dist
rm -rf packages/*/*/dist
echo "✅ dist folders cleaned"
echo ""

# Step 3: Clean Turbo cache
echo "🧹 Step 3: Cleaning Turbo cache..."
rm -rf .turbo
rm -rf packages/*/.turbo
rm -rf packages/*/*/.turbo
npx turbo daemon stop 2>/dev/null || true
echo "✅ Turbo cache cleaned"
echo ""

# Step 4: Fresh install
echo "📦 Step 4: Running npm install..."
npm install
echo "✅ Dependencies installed"
echo ""

# Step 5: Build all packages (force, no cache)
echo "🔨 Step 5: Building all packages (no cache)..."
npm run build -- --force
echo "✅ All packages built successfully"
echo ""

echo "========================================="
echo "✅ Clean build test completed successfully!"
echo "========================================="
