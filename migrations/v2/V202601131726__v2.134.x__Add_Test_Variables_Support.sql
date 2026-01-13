/**************************************************************************************************
 * Migration: Add Test Variables Support
 *
 * Purpose: Add columns to support parameterized testing with runtime variables.
 *
 * Changes:
 * - TestType: Add VariablesSchema column (defines available variables for this test type)
 * - Test: Add Variables column (configures which variables are exposed, defaults, locks)
 * - TestSuite: Add Variables column (suite-level variable values)
 * - TestRun: Add ResolvedVariables column (stores resolved values used in run)
 * - TestSuiteRun: Add ResolvedVariables column (stores resolved values used in suite run)
 *
 * Version: 2.134.x
 **************************************************************************************************/

-- ============================================================================
-- ADD COLUMNS
-- ============================================================================

-- Add VariablesSchema to TestType
ALTER TABLE ${flyway:defaultSchema}.TestType
ADD VariablesSchema NVARCHAR(MAX) NULL;

-- Add Variables to Test
ALTER TABLE ${flyway:defaultSchema}.Test
ADD Variables NVARCHAR(MAX) NULL;

-- Add Variables to TestSuite
ALTER TABLE ${flyway:defaultSchema}.TestSuite
ADD Variables NVARCHAR(MAX) NULL;

-- Add ResolvedVariables to TestRun
ALTER TABLE ${flyway:defaultSchema}.TestRun
ADD ResolvedVariables NVARCHAR(MAX) NULL;

-- Add ResolvedVariables to TestSuiteRun
ALTER TABLE ${flyway:defaultSchema}.TestSuiteRun
ADD ResolvedVariables NVARCHAR(MAX) NULL;

-- ============================================================================
-- EXTENDED PROPERTIES (Column Descriptions)
-- ============================================================================

-- TestType.VariablesSchema
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON schema defining the variables available for tests of this type. Contains schemaVersion and array of variable definitions with name, displayName, description, dataType, valueSource, possibleValues, defaultValue, and required fields.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TestType',
    @level2type = N'COLUMN', @level2name = 'VariablesSchema';

-- Test.Variables
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON configuration for which test type variables are exposed by this test, along with test-level defaults, locks, and value restrictions. References variables defined in the parent TestType.VariablesSchema.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Test',
    @level2type = N'COLUMN', @level2name = 'Variables';

-- TestSuite.Variables
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON object containing variable values to apply to all tests in this suite. These values override test-level defaults but can be overridden by run-level values.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TestSuite',
    @level2type = N'COLUMN', @level2name = 'Variables';

-- TestRun.ResolvedVariables
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON object containing the final resolved variable values used during test execution. Includes both the resolved values and the source of each value (run, suite, test, or type level). Stored for reproducibility and auditing.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TestRun',
    @level2type = N'COLUMN', @level2name = 'ResolvedVariables';

-- TestSuiteRun.ResolvedVariables
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON object containing the variable values provided at suite run level. These values were applied to all tests in the suite run and can be seen on individual TestRun.ResolvedVariables with source="suite".',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'TestSuiteRun',
    @level2type = N'COLUMN', @level2name = 'ResolvedVariables';
