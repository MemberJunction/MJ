-- ======================================================================
-- Migration: Add Query Composition Metadata Dataset Items
-- Version: 5.11.x
-- Description: Add SQLDialects, QuerySQLs, and QueryDependencies to
--              the MJ_Metadata dataset so they are loaded into the
--              client-side metadata cache at startup.
-- ======================================================================

-- Add SQL Dialects to MJ_Metadata dataset
INSERT INTO ${flyway:defaultSchema}.DatasetItem (
    ID,
    Code,
    DatasetID,
    Sequence,
    EntityID,
    WhereClause,
    DateFieldToCheck,
    Description
) VALUES (
    '45B019E7-8C7F-4076-9FFE-66F3D6BF1638',
    'SQLDialects',
    'E4ADCCEC-6A37-EF11-86D4-000D3A4E707E', -- MJ_Metadata dataset ID
    27,
    'C6CD026F-239F-4CA8-9ADC-50E5B81EF230', -- Entity: MJ: SQL Dialects
    NULL,
    '__mj_UpdatedAt',
    NULL
);

-- Add Query SQLs to MJ_Metadata dataset
INSERT INTO ${flyway:defaultSchema}.DatasetItem (
    ID,
    Code,
    DatasetID,
    Sequence,
    EntityID,
    WhereClause,
    DateFieldToCheck,
    Description
) VALUES (
    '846AE3C1-270D-4A2E-AF32-420B48937D9B',
    'QuerySQLs',
    'E4ADCCEC-6A37-EF11-86D4-000D3A4E707E', -- MJ_Metadata dataset ID
    28,
    'FE37218E-259F-47F2-909D-9AECBE5385DB', -- Entity: MJ: Query SQLs
    NULL,
    '__mj_UpdatedAt',
    NULL
);

-- Add Query Dependencies to MJ_Metadata dataset
INSERT INTO ${flyway:defaultSchema}.DatasetItem (
    ID,
    Code,
    DatasetID,
    Sequence,
    EntityID,
    WhereClause,
    DateFieldToCheck,
    Description
) VALUES (
    '8A8F77CA-96C7-4FB2-99F4-791658F0368A',
    'QueryDependencies',
    'E4ADCCEC-6A37-EF11-86D4-000D3A4E707E', -- MJ_Metadata dataset ID
    29,
    'CD4935C5-0C93-46BD-8BD2-0E9368B0BB5A', -- Entity: MJ: Query Dependencies
    NULL,
    '__mj_UpdatedAt',
    NULL
);
