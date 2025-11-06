#!/bin/bash

cd "$(dirname "$0")"

# First, build the combined SQL file
./build_and_run.sh

# Run the Association DB build script
cd "$(dirname "$0")"
sqlcmd -S localhost -d MJ_2_115_0 -U sa -P 'KRiUffvIjuP5GoLtxYvVkWIQ1BxHQEEMO7j4T684oPR7' -i combined_build.sql -o build_output.txt

echo "Build completed. Check build_output.txt for results."
