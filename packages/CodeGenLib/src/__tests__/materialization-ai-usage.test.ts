import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { SQLServerDialect } from "@memberjunction/sql-dialect";
import { QueryParameterProcessor } from "@memberjunction/query-processor";
import { RunQuerySQLFilterManager } from "@memberjunction/core";
import { SQLParser } from "@memberjunction/sql-parser";
import { classifyQueryParameters, buildHeldValues } from "../Database/materializationParamClassifier";
import { buildBroadRowFilterSQL } from "../Database/materializationBroadRender";
import { detectAggregationKeyColumns, detectAdditiveMeasures } from "../Database/materializationAnalysis";

/**
 * AC11: Materialization qualification unit test for AIUsageHourly & AIUsageDaily.
 * Verifies:
 *  - Qualifies as RowFilterBroad
 *  - Window params ("start", "end") stripped cleanly via AST without ambiguity
 *  - Broad SQL preserves WHERE IsCompleted = 1
 *  - 10 KeyColumns detected from GROUP BY
 *  - refreshStrategy resolves to DirtyGroupRecompute (non-additive latency percentiles)
 */
describe("AC11: AI Usage Materialization Qualification", () => {
    RunQuerySQLFilterManager.Instance.SetPlatform("sqlserver");
    const dialect = new SQLServerDialect();

    const queriesDir = path.resolve(__dirname, "../../../../metadata/queries/SQL");
    const hourlySQL = fs.readFileSync(path.join(queriesDir, "ai-usage-hourly.sql"), "utf8");
    const dailySQL = fs.readFileSync(path.join(queriesDir, "ai-usage-daily.sql"), "utf8");

    const testCases = [
        { name: "AIUsageHourly", sql: hourlySQL, bucketCol: "HourBucket" },
        { name: "AIUsageDaily", sql: dailySQL, bucketCol: "DayBucket" },
    ];

    for (const tc of testCases) {
        describe(tc.name, () => {
            const selectCols = SQLParser.ExtractSelectColumns(tc.sql, dialect);
            const outputColumns = selectCols.map(c => c.OutputName);
            const fields = selectCols.map(c => ({
                Name: c.OutputName,
                SQLFullType: "nvarchar(100)",
                IsComputed: c.IsExpression,
            }));

            const params = [
                { Name: "start", Type: "date" as const, SampleValue: "2026-01-01" },
                { Name: "end", Type: "date" as const, SampleValue: "2026-02-01" },
            ];

            const render = (vals: Record<string, unknown>) => {
                const res = QueryParameterProcessor.processQueryTemplate(
                    { SQL: tc.sql, UsesTemplate: true, Parameters: [] },
                    vals,
                    undefined,
                    true
                );
                if (!res.success) throw new Error(res.error ?? "Template render error");
                return res.processedSQL;
            };

            it("qualifies as RowFilterBroad with start and end window params", () => {
                const classification = classifyQueryParameters({
                    queryName: tc.name,
                    params,
                    outputColumns,
                    dialect,
                    render,
                    allowRowFilterBroad: true,
                });
                console.log("CLASSIFICATION RESULT for " + tc.name + ":", JSON.stringify(classification, null, 2));

                expect(classification.qualification.qualifies).toBe(true);
                expect(classification.qualification.paramMode).toBe("RowFilterBroad");
                expect(classification.qualification.rowFilterColumns).toEqual([tc.bucketCol, tc.bucketCol]);
                expect(classification.qualification.readFilterSpec).toEqual([
                    { column: tc.bucketCol, operator: ">=", paramName: "start", kind: "scalar" },
                    { column: tc.bucketCol, operator: "<", paramName: "end", kind: "scalar" },
                ]);
            });

            it("strips window predicates cleanly to produce broad SQL", () => {
                const classification = classifyQueryParameters({
                    queryName: tc.name,
                    params,
                    outputColumns,
                    dialect,
                    render,
                    allowRowFilterBroad: true,
                });

                const renderedHeld = render(buildHeldValues(params));
                const broad = buildBroadRowFilterSQL(
                    renderedHeld,
                    classification.qualification.rowFilterColumns,
                    dialect,
                    classification.qualification.rowFilterColumns.length
                );

                expect(broad.ambiguous).toBe(false);
                expect(broad.removedCount).toBe(2);
                expect(broad.sql).toMatch(/WHERE\s+(?:\[f\]\.)?\[IsCompleted\]\s*=\s*1/i);
                expect(broad.sql).not.toContain(tc.bucketCol + " >=");
                expect(broad.sql).not.toContain(tc.bucketCol + " <");
            });

            it(`detects aggregation key columns matching GROUP BY`, () => {
                const keyCols = detectAggregationKeyColumns({
                    sql: tc.sql,
                    dialect,
                    fields,
                });

                expect(keyCols).not.toBeNull();
                const expectedCols = tc.name === "AIUsageDaily"
                    ? [
                        tc.bucketCol,
                        "AgentID",
                        "AgentTypeID",
                        "PromptID",
                        "ModelID",
                        "VendorID",
                        "UserID",
                        "PrimaryScopeEntityID",
                        "PrimaryScopeRecordID",
                        "ConfigurationID",
                        "SourceKind",
                    ]
                    : [
                        tc.bucketCol,
                        "AgentID",
                        "PromptID",
                        "ModelID",
                        "VendorID",
                        "UserID",
                        "PrimaryScopeEntityID",
                        "PrimaryScopeRecordID",
                        "ConfigurationID",
                        "SourceKind",
                    ];
                expect(keyCols).toHaveLength(expectedCols.length);
                const colNames = keyCols.map(k => k.name);
                expect(colNames).toEqual(expectedCols);
            });

            it("resolves refreshStrategy based on additivity and table refs", () => {
                const isAdditive = detectAdditiveMeasures(tc.sql);
                expect(isAdditive).toBe(false);

                const tableRefs = SQLParser.ExtractTableRefs(tc.sql, dialect);
                if (tc.name === "AIUsageDaily") {
                    expect(tableRefs).toHaveLength(2);
                    expect(tableRefs.map(t => t.TableName).sort()).toEqual(["AIAgent", "vwAIUsageFacts"]);
                } else {
                    expect(tableRefs).toHaveLength(1);
                    expect(tableRefs[0].TableName).toBe("vwAIUsageFacts");
                }

                const keyCols = detectAggregationKeyColumns({ sql: tc.sql, dialect, fields });
                const isKeyedSingleSource = !!keyCols && keyCols.length > 0 && tableRefs.length === 1;

                const refreshStrategy = !isKeyedSingleSource
                    ? "FullRebuild"
                    : isAdditive
                      ? "Incremental"
                      : "DirtyGroupRecompute";
                expect(refreshStrategy).toBe(tc.name === "AIUsageDaily" ? "FullRebuild" : "DirtyGroupRecompute");
            });
        });
    }

    describe("Materialization Refresh Scheduled Job Metadata Conformance", () => {
        const jobsDir = path.resolve(__dirname, "../../../../metadata/scheduled-jobs");
        const jobTypesDir = path.resolve(__dirname, "../../../../metadata/scheduled-job-types");

        it("validates materialization refresh scheduled job and type metadata schemas", () => {
            const jobFilePath = path.join(jobsDir, ".materialization-refresh-job.json");
            expect(fs.existsSync(jobFilePath)).toBe(true);

            const jobContent = JSON.parse(fs.readFileSync(jobFilePath, "utf8"));
            expect(Array.isArray(jobContent)).toBe(true);
            expect(jobContent.length).toBeGreaterThan(0);

            const job = jobContent[0];
            expect(job.primaryKey).toBeDefined();
            expect(job.primaryKey.ID).toMatch(/^[0-9a-fA-F-]{36}$/);

            const fields = job.fields;
            expect(fields).toBeDefined();
            expect(fields.Name).toBe("Materialization Refresh Sweep");
            expect(fields.JobTypeID).toContain("MaterializationRefreshScheduledJobDriver");
            expect(fields.CronExpression).toBe("0 */5 * * * *");
            expect(fields.Status).toBe("Active");
            expect(fields.ConcurrencyMode).toBe("Skip");

            // Verify no deprecated or schema-invalid properties leaked
            const validScheduledJobFields = new Set([
                "Name",
                "Description",
                "JobTypeID",
                "CronExpression",
                "Timezone",
                "StartAt",
                "EndAt",
                "Status",
                "Configuration",
                "OwnerUserID",
                "NotifyOnSuccess",
                "NotifyOnFailure",
                "NotifyUserID",
                "NotifyViaEmail",
                "NotifyViaInApp",
                "ConcurrencyMode",
                "RunImmediatelyIfNeverRun",
                "MaxRuntimeMinutes",
                "MissedRunPolicy"
            ]);

            for (const key of Object.keys(fields)) {
                expect(validScheduledJobFields.has(key)).toBe(true);
            }

            // Verify scheduled job type exists and specifies MaterializationRefreshScheduledJobDriver
            const typeFilePath = path.join(jobTypesDir, ".materialization-refresh-type.json");
            expect(fs.existsSync(typeFilePath)).toBe(true);
            const typeContent = JSON.parse(fs.readFileSync(typeFilePath, "utf8"));
            expect(typeContent[0].fields.DriverClass).toBe("MaterializationRefreshScheduledJobDriver");
            expect(typeContent[0].fields.Name).toBe("Materialization Refresh");
        });
    });
});

