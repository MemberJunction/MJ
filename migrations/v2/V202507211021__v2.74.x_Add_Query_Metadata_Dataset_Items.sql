-- ======================================================================
-- Migration: Add Query Metadata Dataset Items
-- Version: 2.74.x
-- Description: Add QueryEntity and QueryParameter to MJ_Metadata dataset
--              for efficient metadata loading and caching
-- ======================================================================

-- Add Query Entities to MJ_Metadata dataset
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
    'E5A92B67-0A30-40DE-A710-016ED459B1DB',
    'QueryEntities',
    'E4ADCCEC-6A37-EF11-86D4-000D3A4E707E', -- MJ_Metadata dataset ID
    25,
    'EFB0FD56-7AD5-4BFE-BE31-74628FF77265', 
    NULL,
    '__mj_UpdatedAt',
    NULL
);

-- Add MJ: Query Parameters to MJ_Metadata dataset
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
    '57EDC5CF-6A10-4B82-9A4E-C10F3FC8992E',
    'QueryParameters',
    'E4ADCCEC-6A37-EF11-86D4-000D3A4E707E', -- MJ_Metadata dataset ID
    26,
    '3D08228D-8D64-46D3-AED9-AABD54BBBDBE',   
    NULL,
    '__mj_UpdatedAt',
    NULL
);