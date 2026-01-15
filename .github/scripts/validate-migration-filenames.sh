#!/bin/bash

# Migration filename validation script
# This script validates migration file naming conventions
# Usage: ./validate-migration-filenames.sh [migration_directory]

# Function to validate migration filenames
validate_migrations() {
    local MIGRATION_DIRS=("$@")
    if [ ${#MIGRATION_DIRS[@]} -eq 0 ]; then
        MIGRATION_DIRS=("migrations/v2" "migrations/v3" "migrations")
    fi
    
    echo "::notice::Validating migration file naming conventions..."
    
    local INVALID_FILES=""
    local FUTURE_DATE_FILES=""
    local CURRENT_DATE=$(date +%Y%m%d)
    local FILES_CHECKED=0
    local VALID_FILES=0
    
    for dir in "${MIGRATION_DIRS[@]}"; do
        if [ -d "$dir" ]; then
            for file in "$dir"/*.sql; do
                if [ -f "$file" ]; then
                    local filename=$(basename "$file")
                    
                    # Skip non-migration files
                    if [[ ! "$filename" =~ ^V[0-9]{12}__ ]]; then
                        continue
                    fi
                    
                    FILES_CHECKED=$((FILES_CHECKED + 1))
                    
                    # Extract the timestamp part (VYYYYMMDDHHMM)
                    if [[ "$filename" =~ ^V([0-9]{8})([0-9]{4})__ ]]; then
                        local date_part="${BASH_REMATCH[1]}"
                        local time_part="${BASH_REMATCH[2]}"
                        
                        # Validate time part (HHMM format)
                        local hour="${time_part:0:2}"
                        local minute="${time_part:2:2}"
                        
                        local is_valid=true
                        
                        # Check if hour is valid (00-23)
                        if [ "$hour" -gt 23 ]; then
                            INVALID_FILES="$INVALID_FILES\n  - $filename (Invalid hour: $hour, must be 00-23)"
                            is_valid=false
                        fi
                        
                        # Check if minute is valid (00-59)
                        if [ "$minute" -gt 59 ]; then
                            INVALID_FILES="$INVALID_FILES\n  - $filename (Invalid minute: $minute, must be 00-59)"
                            is_valid=false
                        fi
                        
                        # Check if date is in the future
                        if [ "$date_part" -gt "$CURRENT_DATE" ]; then
                            FUTURE_DATE_FILES="$FUTURE_DATE_FILES\n  - $filename (Date $date_part is in the future)"
                        fi
                        
                        if [ "$is_valid" = true ]; then
                            VALID_FILES=$((VALID_FILES + 1))
                        fi
                    else
                        INVALID_FILES="$INVALID_FILES\n  - $filename (Does not match expected format VYYYYMMDDHHMM__)"
                    fi
                fi
            done
        fi
    done
    
    # Report results
    echo "::notice::Checked $FILES_CHECKED migration files"
    
    if [ -n "$INVALID_FILES" ]; then
        echo "::error::Found migration files with invalid timestamps:$INVALID_FILES"
        return 1
    fi
    
    if [ -n "$FUTURE_DATE_FILES" ]; then
        echo "::warning::Found migration files with future dates:$FUTURE_DATE_FILES"
        # Don't fail for future dates, just warn
    fi
    
    echo "::notice::All $VALID_FILES migration filenames are valid!"
    return 0
}

# Main execution
validate_migrations "$@"
exit $?