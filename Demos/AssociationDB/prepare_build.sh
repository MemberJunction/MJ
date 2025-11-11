#!/bin/bash
# Prepare Association DB Build - Generates combined SQL file from source files
# This script only generates the SQL file, it does not execute against the database
#
# Usage: ./prepare_build.sh [--skip-docs]
#   --skip-docs: Skip adding database documentation (extended properties)

cd "$(dirname "$0")"

# Parse command line arguments
SKIP_DOCS=false
for arg in "$@"; do
    case $arg in
        --skip-docs)
            SKIP_DOCS=true
            shift
            ;;
        -h|--help)
            echo "Usage: ./prepare_build.sh [--skip-docs]"
            echo "  --skip-docs: Skip adding database documentation (extended properties)"
            exit 0
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Usage: ./prepare_build.sh [--skip-docs]"
            exit 1
            ;;
    esac
done

echo "Generating combined SQL file..."
if [ "$SKIP_DOCS" = true ]; then
    echo "  (Skipping documentation)"
fi

# Output file goes in tmp directory
OUTPUT="tmp/combined_build.sql"

# Create tmp directory if it doesn't exist
mkdir -p tmp

# Start fresh
> "$OUTPUT"

# Add header and transaction start
cat >> "$OUTPUT" << 'EOF'
-- Combined Association Sample Database Build
-- Auto-generated from multiple files

SET NOCOUNT ON;
GO

PRINT '';
PRINT '###################################################################';
PRINT '#                                                                 #';
PRINT '#     MemberJunction - Association Sample Database Builder       #';
PRINT '#                                                                 #';
PRINT '###################################################################';
PRINT '';
PRINT 'This script will create a comprehensive association management';
PRINT 'database with realistic sample data in a single AssociationDemo schema.';
PRINT '';
PRINT 'Estimated completion time: 1-2 minutes';
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

# Add schema and table files
cat schema/V001__create_schema.sql >> "$OUTPUT"
cat schema/V002__create_tables.sql >> "$OUTPUT"
cat schema/V004__create_community_tables.sql >> "$OUTPUT"
cat schema/V005__create_resource_library_tables.sql >> "$OUTPUT"
cat schema/V006__create_certification_tables.sql >> "$OUTPUT"
cat schema/V007__create_product_showcase_tables.sql >> "$OUTPUT"

# Add Phase 1A complete message
cat >> "$OUTPUT" << 'EOF'

PRINT '';
PRINT '-------------------------------------------------------------------';
PRINT 'PHASE 1A: Schema and table creation complete';
PRINT '-------------------------------------------------------------------';
PRINT '';
GO
EOF

# Conditionally add documentation based on --skip-docs flag
if [ "$SKIP_DOCS" = false ]; then
    cat >> "$OUTPUT" << 'EOF'

PRINT '';
PRINT '-------------------------------------------------------------------';
PRINT 'PHASE 1B: ADDING DATABASE DOCUMENTATION';
PRINT '-------------------------------------------------------------------';
PRINT '';
GO

EOF

    # Add documentation file
    cat schema/V003__table_documentation.sql >> "$OUTPUT"
    echo "GO" >> "$OUTPUT"

    # Add Phase 1B complete
    cat >> "$OUTPUT" << 'EOF'

PRINT '';
PRINT '-------------------------------------------------------------------';
PRINT 'PHASE 1B COMPLETE: Documentation added successfully';
PRINT '-------------------------------------------------------------------';
PRINT '';
GO
EOF
else
    cat >> "$OUTPUT" << 'EOF'

PRINT '';
PRINT '-------------------------------------------------------------------';
PRINT 'PHASE 1B: SKIPPING DATABASE DOCUMENTATION';
PRINT '-------------------------------------------------------------------';
PRINT '';
GO
EOF
fi

# Add Phase 1 complete and Phase 2 start messages
cat >> "$OUTPUT" << 'EOF'

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

EOF

# Add data files (parameters first, then all data files)
cat data/00_parameters.sql >> "$OUTPUT"
cat data/01_membership_data.sql >> "$OUTPUT"
cat data/02_events_data.sql >> "$OUTPUT"
cat data/03_learning_data.sql >> "$OUTPUT"
cat data/04_finance_data.sql >> "$OUTPUT"
cat data/05_marketing_email_data.sql >> "$OUTPUT"
cat data/06_chapters_governance_data.sql >> "$OUTPUT"
cat data/07_community_forum_data.sql >> "$OUTPUT"
cat data/08_resource_library_data.sql >> "$OUTPUT"
cat data/09_certification_data.sql >> "$OUTPUT"
cat data/10_product_showcase_data.sql >> "$OUTPUT"

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

DECLARE @MemberCount INT, @EventCount INT, @CourseCount INT, @ThreadCount INT, @ResourceCount INT, @CertificationCount INT, @ProductCount INT;
SELECT @MemberCount = COUNT(*) FROM AssociationDemo.Member;
SELECT @EventCount = COUNT(*) FROM AssociationDemo.Event;
SELECT @CourseCount = COUNT(*) FROM AssociationDemo.Course;
SELECT @ThreadCount = COUNT(*) FROM AssociationDemo.ForumThread;
SELECT @ResourceCount = COUNT(*) FROM AssociationDemo.Resource;
SELECT @CertificationCount = COUNT(*) FROM AssociationDemo.Certification;
SELECT @ProductCount = COUNT(*) FROM AssociationDemo.Product;

PRINT 'Record counts:';
PRINT '  Members: ' + CAST(@MemberCount AS VARCHAR);
PRINT '  Events: ' + CAST(@EventCount AS VARCHAR);
PRINT '  Courses: ' + CAST(@CourseCount AS VARCHAR);
PRINT '  Forum Threads: ' + CAST(@ThreadCount AS VARCHAR);
PRINT '  Resources: ' + CAST(@ResourceCount AS VARCHAR);
PRINT '  Certifications: ' + CAST(@CertificationCount AS VARCHAR);
PRINT '  Products: ' + CAST(@ProductCount AS VARCHAR);
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
GO

PRINT '';
PRINT 'Build completed successfully!';
GO

SET NOCOUNT OFF;
GO
EOF

echo "Combined SQL file generated: $OUTPUT"
echo ""
echo "To execute against database, run: ./install.sh"
