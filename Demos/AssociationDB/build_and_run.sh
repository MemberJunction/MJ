#!/bin/bash
# Build and run the Association DB - combines all SQL files then executes
# User must add credentials: -U <username> -P <password>

cd "$(dirname "$0")"

echo "Building combined SQL file..."

# Output file
OUTPUT="combined_build.sql"

# Start fresh
> "$OUTPUT"

# Add header and transaction start
cat >> "$OUTPUT" << 'EOF'
-- Combined Association Sample Database Build
-- Auto-generated from multiple files

SET NOCOUNT ON;
GO

BEGIN TRANSACTION;

PRINT '';
PRINT '###################################################################';
PRINT '#                                                                 #';
PRINT '#     MemberJunction - Association Sample Database Builder       #';
PRINT '#                                                                 #';
PRINT '###################################################################';
PRINT '';
PRINT 'This script will create a comprehensive association management';
PRINT 'database with realistic sample data across 8 business domains.';
PRINT '';
PRINT 'Estimated completion time: 2-5 minutes';
PRINT '';
PRINT '-------------------------------------------------------------------';
PRINT '';
PRINT 'Target Database: ' + DB_NAME();
PRINT 'Start Time: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';
PRINT '===================================================================';
PRINT '';
GO

PRINT '';
PRINT '===================================================================';
PRINT 'PHASE 1: CREATING SCHEMAS AND TABLES';
PRINT '===================================================================';
PRINT '';
GO

EOF

# Add schema files
cat schema/V001__create_schemas.sql >> "$OUTPUT"
cat schema/V002__membership_tables.sql >> "$OUTPUT"
cat schema/V003__events_tables.sql >> "$OUTPUT"
cat schema/V004__learning_tables.sql >> "$OUTPUT"
cat schema/V005__finance_tables.sql >> "$OUTPUT"
cat schema/V006__marketing_tables.sql >> "$OUTPUT"
cat schema/V007__email_tables.sql >> "$OUTPUT"
cat schema/V008__chapters_tables.sql >> "$OUTPUT"
cat schema/V009__governance_tables.sql >> "$OUTPUT"

# Add Phase 1A complete message
cat >> "$OUTPUT" << 'EOF'

PRINT '';
PRINT '-------------------------------------------------------------------';
PRINT 'PHASE 1A: Schema and table creation complete';
PRINT '-------------------------------------------------------------------';
PRINT '';
GO

PRINT '';
PRINT '-------------------------------------------------------------------';
PRINT 'PHASE 1B: ADDING DATABASE DOCUMENTATION';
PRINT '-------------------------------------------------------------------';
PRINT '';
GO

EOF

# Add documentation files
cat schema/V001__schemas_documentation.sql >> "$OUTPUT"
echo "GO" >> "$OUTPUT"
cat schema/V002__membership_documentation.sql >> "$OUTPUT"
echo "GO" >> "$OUTPUT"
cat schema/V003__events_documentation.sql >> "$OUTPUT"
echo "GO" >> "$OUTPUT"
cat schema/V004__learning_documentation.sql >> "$OUTPUT"
echo "GO" >> "$OUTPUT"
cat schema/V005__finance_documentation.sql >> "$OUTPUT"
echo "GO" >> "$OUTPUT"
cat schema/V006__marketing_documentation.sql >> "$OUTPUT"
echo "GO" >> "$OUTPUT"
cat schema/V007__email_documentation.sql >> "$OUTPUT"
echo "GO" >> "$OUTPUT"
cat schema/V008__chapters_documentation.sql >> "$OUTPUT"
echo "GO" >> "$OUTPUT"
cat schema/V009__governance_documentation.sql >> "$OUTPUT"
echo "GO" >> "$OUTPUT"

# Add Phase 1B complete
cat >> "$OUTPUT" << 'EOF'

PRINT '';
PRINT '-------------------------------------------------------------------';
PRINT 'PHASE 1B COMPLETE: Documentation added successfully';
PRINT '-------------------------------------------------------------------';
PRINT '';
GO

PRINT '';
PRINT '===================================================================';
PRINT 'PHASE 1 COMPLETE: All schemas and tables created successfully';
PRINT '===================================================================';
PRINT '';
GO

PRINT '';
PRINT '===================================================================';
PRINT 'PHASE 2: POPULATING SAMPLE DATA';
PRINT '===================================================================';
PRINT '';
GO

EOF

# Add data files (parameters first, then all data files)
cat data/00_parameters.sql >> "$OUTPUT"
cat data/01_membership_data.sql >> "$OUTPUT"
cat data/02_events_data.sql >> "$OUTPUT"
cat data/03_learning_data.sql >> "$OUTPUT"
cat data/04_finance_data.sql >> "$OUTPUT"
cat data/05_marketing_email_data.sql >> "$OUTPUT"
cat data/06_chapters_governance_data.sql >> "$OUTPUT"

# Add Phase 2 complete and verification
cat >> "$OUTPUT" << 'EOF'

GO

PRINT '';
PRINT '===================================================================';
PRINT 'PHASE 2 COMPLETE: Sample data population finished';
PRINT '===================================================================';
PRINT '';
GO

PRINT '';
PRINT '===================================================================';
PRINT 'PHASE 3: VERIFICATION';
PRINT '===================================================================';
PRINT '';
GO

DECLARE @MemberCount INT, @EventCount INT, @CourseCount INT;
SELECT @MemberCount = COUNT(*) FROM membership.Member;
SELECT @EventCount = COUNT(*) FROM events.Event;
SELECT @CourseCount = COUNT(*) FROM learning.Course;

PRINT 'Record counts:';
PRINT '  Members: ' + CAST(@MemberCount AS VARCHAR);
PRINT '  Events: ' + CAST(@EventCount AS VARCHAR);
PRINT '  Courses: ' + CAST(@CourseCount AS VARCHAR);
PRINT '';
GO

PRINT '';
PRINT '===================================================================';
PRINT 'BUILD COMPLETE!';
PRINT '===================================================================';
PRINT '';
PRINT 'Next steps:';
PRINT '';
PRINT '1. Run MemberJunction CodeGen to generate entity classes';
PRINT '';
PRINT '2. Query the sample data to explore member journeys';
PRINT '';
PRINT '3. See docs/SAMPLE_QUERIES.md for example queries';
PRINT '';
PRINT '4. See member journey examples in docs/BUSINESS_SCENARIOS.md';
PRINT '';
PRINT '-------------------------------------------------------------------';
PRINT '';
PRINT 'For more information, see README.md';
PRINT '';

COMMIT TRANSACTION;
PRINT '';
PRINT 'Transaction committed successfully!';
GO

SET NOCOUNT OFF;
GO
EOF

echo "Combined SQL file created: $OUTPUT"
echo ""
echo "To execute, run:"
echo "  sqlcmd -S <server> -d <database> -U <username> -P <password> -i $OUTPUT -o build_output.txt"
echo ""
echo "Example:"
echo "  sqlcmd -S localhost -d MJ_2_115_0 -U sa -P 'yourpassword' -i $OUTPUT -o build_output.txt"
