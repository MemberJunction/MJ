#!/bin/bash
#
# Install Association Sample Database
# Usage: ./install.sh [--skip-docs]
#   --skip-docs: Skip adding database documentation (extended properties)
#
# Setup:
#   1. Create .env file with your database credentials (see .env.template)
#   2. Run: ./install.sh

cd "$(dirname "$0")"

# Load environment variables from .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "Error: .env file not found!"
    echo "Please create a .env file with database credentials."
    echo "See .env.template for an example."
    exit 1
fi

# Validate required environment variables
if [ -z "$DB_SERVER" ] || [ -z "$DB_NAME" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ]; then
    echo "Error: Missing required environment variables in .env file"
    echo "Required: DB_SERVER, DB_NAME, DB_USER, DB_PASSWORD"
    exit 1
fi

# Parse command line arguments
SKIP_DOCS_FLAG=""
for arg in "$@"; do
    case $arg in
        --skip-docs)
            SKIP_DOCS_FLAG="--skip-docs"
            shift
            ;;
        -h|--help)
            echo "Usage: ./install.sh [--skip-docs]"
            echo "  --skip-docs: Skip adding database documentation (extended properties)"
            exit 0
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Usage: ./install.sh [--skip-docs]"
            exit 1
            ;;
    esac
done

# First, build the combined SQL file (pass through --skip-docs if provided)
./prepare_build.sh $SKIP_DOCS_FLAG

# Run the Association DB build script
cd "$(dirname "$0")"
sqlcmd -S "$DB_SERVER" -d "$DB_NAME" -U "$DB_USER" -P "$DB_PASSWORD" -i tmp/combined_build.sql -o tmp/build_output.txt

echo "Build completed. Check tmp/build_output.txt for results."
