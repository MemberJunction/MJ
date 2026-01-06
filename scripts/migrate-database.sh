#!/bin/bash

# MemberJunction Database Migration Script
# This script runs Flyway migrations using the MJCLI migrate command
#
# Prerequisites:
# - .env file with database connection settings (DB_HOST, DB_DATABASE, etc.)
# - mj.config.cjs with proper configuration
#
# Usage:
#   ./scripts/migrate-database.sh              # Run all pending migrations
#   ./scripts/migrate-database.sh --verbose    # Run with verbose logging
#   ./scripts/migrate-database.sh --tag v3.0.0 # Run migrations from specific version tag

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}MemberJunction Database Migration${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}ERROR: .env file not found!${NC}"
    echo "Please create a .env file with the following variables:"
    echo "  DB_HOST=<your-database-host>"
    echo "  DB_PORT=<your-database-port>"
    echo "  DB_DATABASE=<your-database-name>"
    echo "  CODEGEN_DB_USERNAME=<your-username>"
    echo "  CODEGEN_DB_PASSWORD=<your-password>"
    echo "  DB_TRUST_SERVER_CERTIFICATE=true"
    exit 1
fi

# Check if mj.config.cjs exists
if [ ! -f mj.config.cjs ]; then
    echo -e "${RED}ERROR: mj.config.cjs not found!${NC}"
    echo "Please ensure you have a valid mj.config.cjs file in the project root."
    exit 1
fi

# Load environment variables
echo -e "${YELLOW}Loading environment variables from .env...${NC}"

# Check for common .env syntax errors before sourcing
if grep -qE '^[A-Z_]+[[:space:]]+=|^[A-Z_]+=[[:space:]]+' .env; then
    echo -e "${RED}ERROR: .env file has syntax errors!${NC}"
    echo "Found environment variables with spaces around the '=' sign."
    echo "These lines need to be fixed (no spaces allowed):"
    echo ""
    grep -nE '^[A-Z_]+[[:space:]]+=|^[A-Z_]+=[[:space:]]+' .env
    echo ""
    echo "Example:"
    echo "  ❌ WRONG: MY_VAR = 'value'"
    echo "  ❌ WRONG: MY_VAR= 'value'"
    echo "  ✅ RIGHT: MY_VAR='value'"
    exit 1
fi

set -a
source .env
set +a

# Display connection info (without sensitive data)
echo -e "\n${BLUE}Database Connection:${NC}"
echo "  Host:     ${DB_HOST:-localhost}"
echo "  Port:     ${DB_PORT:-1433}"
echo "  Database: ${DB_DATABASE}"
echo "  Schema:   ${MJ_CORE_SCHEMA:-__mj}"
echo ""

# Parse command line arguments
ARGS=""
VERBOSE=false
TAG=""
MIGRATION_PATH=""
V3_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--verbose)
            ARGS="$ARGS --verbose"
            VERBOSE=true
            shift
            ;;
        -t|--tag)
            TAG="$2"
            ARGS="$ARGS --tag $2"
            shift 2
            ;;
        --v3-only)
            V3_ONLY=true
            MIGRATION_PATH="filesystem:./migrations/v3"
            shift
            ;;
        --v2-only)
            MIGRATION_PATH="filesystem:./migrations/v2"
            shift
            ;;
        --dry-run)
            echo -e "${YELLOW}DRY RUN: Would execute: npx mj migrate${ARGS}${NC}"
            if [ -n "$MIGRATION_PATH" ]; then
                echo -e "${YELLOW}  Migration path: ${MIGRATION_PATH}${NC}"
            fi
            exit 0
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -v, --verbose    Enable verbose logging"
            echo "  -t, --tag TAG    Run migrations from specific version tag"
            echo "  --v3-only        Run only v3 migrations (for clean database installs)"
            echo "  --v2-only        Run only v2 migrations (for incremental updates)"
            echo "  --dry-run        Show what would be executed without running it"
            echo "  -h, --help       Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                    # Run all pending migrations (v2 and v3)"
            echo "  $0 --v3-only          # Clean install with v3 structure (recommended for new databases)"
            echo "  $0 --verbose          # Run with detailed logging"
            echo "  $0 --tag v3.0.0       # Run migrations from v3.0.0 tag"
            echo ""
            echo "Migration Paths:"
            echo "  Default:   ./migrations (includes both v2 and v3)"
            echo "  --v3-only: ./migrations/v3 (structure installation only)"
            echo "  --v2-only: ./migrations/v2 (incremental updates only)"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Show warning for v3 migrations
if [ "$V3_ONLY" = true ] || ls migrations/v3/*.sql >/dev/null 2>&1; then
    if [ "$V3_ONLY" = true ]; then
        echo -e "${BLUE}ℹ️  Running v3 migrations only (clean database install)${NC}"
        echo -e "${BLUE}   This will create the complete database structure from scratch.${NC}\n"
    else
        echo -e "${YELLOW}⚠️  WARNING: v3 migrations detected!${NC}"
        echo -e "${YELLOW}   These migrations create database structure from scratch.${NC}"
        echo -e "${YELLOW}   Make sure you have a database backup before proceeding.${NC}\n"
    fi

    # Prompt for confirmation (unless we're in CI or have --yes flag)
    if [ -t 0 ] && [ -z "$CI" ]; then
        read -p "Do you want to continue? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${RED}Migration cancelled by user.${NC}"
            exit 0
        fi
    fi
fi

# Set migration location if specified
if [ -n "$MIGRATION_PATH" ]; then
    export MIGRATIONS_LOCATION="$MIGRATION_PATH"
    echo -e "${BLUE}Migration path: ${MIGRATION_PATH}${NC}"
fi

# Run the migration
echo -e "\n${GREEN}Running migrations...${NC}"
echo -e "${BLUE}Command: npx mj migrate${ARGS}${NC}\n"

if npx mj migrate $ARGS; then
    echo -e "\n${GREEN}✓ Migration completed successfully!${NC}"
    exit 0
else
    echo -e "\n${RED}✗ Migration failed!${NC}"
    echo -e "${YELLOW}Check the error messages above for details.${NC}"
    exit 1
fi
