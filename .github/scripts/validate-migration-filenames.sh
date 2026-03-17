#!/bin/bash

# Migration filename validation script
# This script validates migration file naming conventions and version ordering
# Usage: ./validate-migration-filenames.sh [migration_directory]

# Function to validate individual migration filenames (format, hours, minutes)
validate_filenames() {
    local MIGRATION_DIRS=("$@")

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

                    # Skip non-versioned migration files (baselines, repeatables)
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

# Function to validate that migration timestamps are ordered consistently with
# the MJ version embedded in the filename. Within a single migration directory,
# every migration for version N must have a timestamp strictly greater than
# every migration for version N-1.
#
# Filename convention: VYYYYMMDDHHMM__vMAJOR.MINOR.x__DESCRIPTION.sql
#                      e.g. V202603111200__v5.11.x__QueryComposition.sql
validate_version_ordering() {
    local MIGRATION_DIRS=("$@")
    local ORDERING_ERRORS=""

    echo "::notice::Validating migration version ordering..."

    for dir in "${MIGRATION_DIRS[@]}"; do
        if [ ! -d "$dir" ]; then
            continue
        fi

        # Write (version_sort_key, timestamp, version_display, filename) to a temp file,
        # then sort by version_sort_key to compare consecutive versions.
        # This avoids associative arrays for bash 3 (macOS) compatibility.
        local tmpfile
        tmpfile=$(mktemp)

        for file in "$dir"/*.sql; do
            if [ ! -f "$file" ]; then
                continue
            fi

            local filename=$(basename "$file")

            # Only versioned migrations (skip baselines B..., repeatables R__...)
            if [[ ! "$filename" =~ ^V[0-9]{12}__ ]]; then
                continue
            fi

            # Extract Flyway timestamp (12 digits after V)
            local timestamp="${filename:1:12}"

            # Extract MJ version (major.minor) from the description segment
            # Pattern: __vMAJOR.MINOR  (with optional .x or .PATCH suffix)
            if [[ "$filename" =~ __v([0-9]+)\.([0-9]+) ]]; then
                local mj_major="${BASH_REMATCH[1]}"
                local mj_minor="${BASH_REMATCH[2]}"
                # version_sort_key pads major and minor to 6 digits each for correct numeric sort
                printf "%06d%06d|%s|%s.%s|%s\n" "$mj_major" "$mj_minor" "$timestamp" "$mj_major" "$mj_minor" "$filename" >> "$tmpfile"
            fi
        done

        if [ ! -s "$tmpfile" ]; then
            rm -f "$tmpfile"
            continue
        fi

        # Sort by version_sort_key (field 1), then by timestamp (field 2)
        local sorted
        sorted=$(sort -t'|' -k1,1 -k2,2 "$tmpfile")
        rm -f "$tmpfile"

        # Walk through sorted entries, tracking max timestamp per version.
        # When the version changes, check that the new entry's timestamp is
        # strictly greater than the previous version's max timestamp.
        local prev_version=""
        local prev_version_max_ts=""
        local prev_version_max_file=""
        local curr_version_max_ts=""
        local curr_version_max_file=""

        while IFS='|' read -r _sort_key ts ver fname; do
            if [ "$ver" != "$prev_version" ]; then
                # Version boundary: save the completed version's max and start a new one
                if [ -n "$prev_version" ]; then
                    prev_version_max_ts="$curr_version_max_ts"
                    prev_version_max_file="$curr_version_max_file"
                fi

                # Check: this new version's first timestamp must be after prev version's max
                if [ -n "$prev_version_max_ts" ] && [ "$ts" -le "$prev_version_max_ts" ]; then
                    ORDERING_ERRORS="$ORDERING_ERRORS\n  - v${ver} migration has timestamp BEFORE v${prev_version} migrations in ${dir}/"
                    ORDERING_ERRORS="$ORDERING_ERRORS\n      v${ver} earliest: ${fname} (timestamp ${ts})"
                    ORDERING_ERRORS="$ORDERING_ERRORS\n      v${prev_version} latest:   ${prev_version_max_file} (timestamp ${prev_version_max_ts})"
                    ORDERING_ERRORS="$ORDERING_ERRORS\n      All v${ver} migrations must have timestamps after all v${prev_version} migrations"
                fi

                prev_version="$ver"
                curr_version_max_ts="$ts"
                curr_version_max_file="$fname"
            else
                # Same version: check against previous version's max (catches non-first files too)
                if [ -n "$prev_version_max_ts" ] && [ "$ts" -le "$prev_version_max_ts" ]; then
                    ORDERING_ERRORS="$ORDERING_ERRORS\n  - v${ver} migration has timestamp BEFORE v${prev_version} migrations in ${dir}/"
                    ORDERING_ERRORS="$ORDERING_ERRORS\n      v${ver} file:     ${fname} (timestamp ${ts})"
                    ORDERING_ERRORS="$ORDERING_ERRORS\n      v${prev_version} latest:   ${prev_version_max_file} (timestamp ${prev_version_max_ts})"
                    ORDERING_ERRORS="$ORDERING_ERRORS\n      All v${ver} migrations must have timestamps after all v${prev_version} migrations"
                fi

                # Update current version's max
                if [ "$ts" -gt "$curr_version_max_ts" ]; then
                    curr_version_max_ts="$ts"
                    curr_version_max_file="$fname"
                fi
            fi
        done <<< "$sorted"
    done

    if [ -n "$ORDERING_ERRORS" ]; then
        echo "::error::Migration version ordering violations found:$ORDERING_ERRORS"
        return 1
    fi

    echo "::notice::Migration version ordering is consistent!"
    return 0
}

# Main execution
main() {
    local MIGRATION_DIRS=("$@")
    if [ ${#MIGRATION_DIRS[@]} -eq 0 ]; then
        # Auto-discover all migrations/v* directories so new major versions
        # (v6, v7, ...) are validated without updating this script.
        # The trailing /. trick ensures the glob expands to directory paths
        # without a trailing slash, producing cleaner error messages.
        MIGRATION_DIRS=()
        for d in migrations/v*/; do
            [ -d "$d" ] && MIGRATION_DIRS+=("${d%/}")
        done
    fi

    local exit_code=0

    validate_filenames "${MIGRATION_DIRS[@]}"
    if [ $? -ne 0 ]; then
        exit_code=1
    fi

    validate_version_ordering "${MIGRATION_DIRS[@]}"
    if [ $? -ne 0 ]; then
        exit_code=1
    fi

    return $exit_code
}

main "$@"
exit $?
