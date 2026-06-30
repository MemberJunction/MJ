# shellcheck shell=bash
# ─── Optional archive: pull this suite-run + children + push to archive MJ ────
#
# Sourced by test-runner-entrypoint.sh and test-runner-remote-entrypoint.sh
# AFTER the suite has run and reports are generated. Runs in the caller's shell
# (sourced, not executed) so it inherits these variables from the entrypoint:
#
#   SCRIPTS               path to docker/regression/scripts
#   RUN_DIR               this run's test-results/run-* directory
#   ARCHIVE_PREFLIGHT_OK  "1" when the destination pre-flight passed
#   TEST_SUITE_NAME       suite name (used as the default Tags value)
#   EXTRA_METADATA_DIRS   optional comma-separated extra metadata dirs to seed
#
# Triggered by setting ARCHIVE_DB_DATABASE. A transient mj.config.cjs is
# generated from the ARCHIVE_DB_* env vars at runtime (archive-config-gen.cjs).
#
# Env-var contract:
#   ARCHIVE_DB_DATABASE     destination DB name              (required)
#   ARCHIVE_DB_USERNAME     destination user                 (required)
#   ARCHIVE_DB_PASSWORD     destination password             (required)
#   ARCHIVE_DB_HOST         destination host                 (default: host.docker.internal)
#   ARCHIVE_DB_PORT         destination port                 (default: 1433)
#   ARCHIVE_DB_TRUST_CERT   trust self-signed certs          (default: true)
#   ARCHIVE_USER_EMAIL      MJ User for record ownership     (default: not.set@nowhere.com)
#   ARCHIVE_MJ_CORE_SCHEMA  __mj schema name on destination  (default: __mj)
#   ARCHIVE_TAG             Tags column value                (default: TEST_SUITE_NAME)
#   ARCHIVE_SOURCE          Source column value              (default: empty)
#
# The archive destination pre-flight MUST have set ARCHIVE_PREFLIGHT_OK=1,
# otherwise this block is skipped — failing fast on misconfiguration beats
# running the full suite and discovering the destination is broken.
if [ "$ARCHIVE_PREFLIGHT_OK" = "1" ]; then
    echo ""
    echo "Archiving suite run..."

    # Pull the suite run's ID from results.json so we can filter the pull.
    SUITE_RUN_ID=$(node -e "const r=require('${RUN_DIR}/results.json'); console.log(r.suiteRunId || '');" 2>/dev/null || echo "")
    if [ -z "$SUITE_RUN_ID" ]; then
        echo "  WARNING: Could not read suiteRunId from results.json — skipping archive"
    else
        # Generate the archive config from the ARCHIVE_DB_* env vars.
        ARCHIVE_CONFIG_FILE=$(node "$SCRIPTS/archive-config-gen.cjs" /tmp/mj-archive-config.cjs)
        if [ -z "$ARCHIVE_CONFIG_FILE" ] || [ ! -f "$ARCHIVE_CONFIG_FILE" ]; then
            echo "  WARNING: Archive config generation failed — skipping archive"
            ARCHIVE_CONFIG_FILE=""
        else
            echo "  Generated archive config: ${ARCHIVE_CONFIG_FILE}"
        fi

        if [ -n "$ARCHIVE_CONFIG_FILE" ]; then
            # Pre-seed destination metadata so @lookup refs resolve at push.
            # The archived TestSuiteRun.SuiteID resolves via
            # @lookup:MJ: Test Suites.Name=… and TestRun.TestID via
            # @lookup:MJ: Tests.Name=… — both target entities must exist on
            # the destination first. Push the same metadata dirs that were
            # pushed to the source DB before the suite ran. Upserts by PK so
            # this is a no-op after the first run.
            echo "  Pre-seeding destination metadata (tests + test-suites)..."
            MJ_CONFIG_FILE="${ARCHIVE_CONFIG_FILE}" \
                npx mj sync push --dir=/app/metadata --include="tests,test-suites" --ci 2>&1 \
                || echo "  WARNING: Pre-seed of MJ metadata failed — push may fail on @lookup refs"
            if [ -n "${EXTRA_METADATA_DIRS:-}" ]; then
                IFS=',' read -ra EXTRA_DIRS_ARCH <<< "$EXTRA_METADATA_DIRS"
                for EXTRA_DIR_ARCH in "${EXTRA_DIRS_ARCH[@]}"; do
                    EXTRA_DIR_ARCH_TRIMMED="$(echo "$EXTRA_DIR_ARCH" | xargs)"
                    if [ -d "$EXTRA_DIR_ARCH_TRIMMED" ]; then
                        echo "  Pre-seeding extra metadata from $EXTRA_DIR_ARCH_TRIMMED..."
                        MJ_CONFIG_FILE="${ARCHIVE_CONFIG_FILE}" \
                            npx mj sync push --dir="$EXTRA_DIR_ARCH_TRIMMED" --ci 2>&1 \
                            || echo "  WARNING: Extra metadata pre-seed failed for $EXTRA_DIR_ARCH_TRIMMED"
                    fi
                done
            fi

            # Copy the archive template (.mj-sync.json files describing the
            # entity cascade + externalization) into the run dir.
            ARCHIVE_DIR="${RUN_DIR}/archive"
            mkdir -p "${ARCHIVE_DIR}"
            cp -R /app/docker/regression/archive/. "${ARCHIVE_DIR}/"

            # Pull the suite run + cascading children into the archive dir.
            # Uses the LOCAL mj.config.cjs (default cosmiconfig search) to pull
            # from the docker SQL Server. CRITICAL: do NOT set MJ_CONFIG_FILE
            # here — it would redirect the pull to the destination DB.
            echo "  Pulling suite run + children to ${ARCHIVE_DIR}..."
            (cd "${ARCHIVE_DIR}" && npx mj sync pull \
                --entity="MJ: Test Suite Runs" \
                --filter="ID='${SUITE_RUN_ID}'" 2>&1) \
                || echo "  WARNING: Archive pull failed"

            # Tag the pulled records (Tags field, optional MachineName overlay).
            ARCHIVE_TAG="${ARCHIVE_TAG:-${TEST_SUITE_NAME:-}}" \
            ARCHIVE_SOURCE="${ARCHIVE_SOURCE:-}" \
            RUN_DIR="${RUN_DIR}" \
                node "$SCRIPTS/tag-archive.cjs" 2>&1 || echo "  WARNING: Tagging failed"

            # Push to the archive MJ. Swap mj.config.cjs via MJ_CONFIG_FILE so
            # the push targets the destination DB. --ci avoids the interactive
            # "continue anyway?" prompt that hangs in a non-TTY container;
            # validation errors fail the push outright.
            echo "  Pushing archive to destination MJ..."
            MJ_CONFIG_FILE="${ARCHIVE_CONFIG_FILE}" \
                npx mj sync push --dir="${ARCHIVE_DIR}" --ci 2>&1 \
                || echo "  WARNING: Archive push failed"

            echo "  Archive complete."
        fi
    fi
fi
