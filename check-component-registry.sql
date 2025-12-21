-- Diagnostic SQL to check AverageSalaryByGenderChart component registration

-- 1. Check if the component exists in the Components table
SELECT
    c.ID as ComponentID,
    c.Name,
    c.Namespace,
    c.Version,
    c.Status,
    c.SourceRegistryID,
    cr.Name as RegistryName,
    cr.URI as RegistryURI,
    cr.Status as RegistryStatus,
    CASE
        WHEN c.Specification IS NULL THEN 'NO SPEC'
        WHEN LEN(c.Specification) = 0 THEN 'EMPTY SPEC'
        ELSE 'HAS SPEC (' + CAST(LEN(c.Specification) AS VARCHAR) + ' chars)'
    END as SpecificationStatus,
    c.LastSyncedAt,
    c.ReplicatedAt
FROM
    [__mj].[Component] c
LEFT JOIN
    [__mj].[ComponentRegistry] cr ON c.SourceRegistryID = cr.ID
WHERE
    c.Name LIKE '%AverageSalaryByGenderChart%'
    OR c.Name LIKE '%Salary%Gender%'
ORDER BY
    c.__mj_CreatedAt DESC;

-- 2. Check all active Component Registries
SELECT
    ID as RegistryID,
    Name as RegistryName,
    URI,
    Status,
    Description,
    __mj_CreatedAt
FROM
    [__mj].[ComponentRegistry]
WHERE
    Status = 'Active'
ORDER BY
    Name;

-- 3. Check for components from the Skip registry
SELECT
    c.Name,
    c.Namespace,
    c.Version,
    c.Status,
    CASE
        WHEN c.Specification IS NULL THEN 'NO SPEC'
        WHEN LEN(c.Specification) = 0 THEN 'EMPTY SPEC'
        ELSE 'HAS SPEC'
    END as SpecificationStatus
FROM
    [__mj].[Component] c
INNER JOIN
    [__mj].[ComponentRegistry] cr ON c.SourceRegistryID = cr.ID
WHERE
    cr.Name = 'Skip'
ORDER BY
    c.Name;

-- 4. Check component collections that might reference this component
SELECT
    cc.Name as CollectionName,
    cci.ComponentID,
    c.Name as ComponentName,
    c.Namespace,
    cci.SortOrder
FROM
    [__mj].[ComponentCollection] cc
INNER JOIN
    [__mj].[ComponentCollectionItem] cci ON cc.ID = cci.CollectionID
LEFT JOIN
    [__mj].[Component] c ON cci.ComponentID = c.ID
WHERE
    cc.Name LIKE '%Skip%'
    OR cc.Name LIKE '%shared%'
    OR c.Name LIKE '%AverageSalaryByGenderChart%'
ORDER BY
    cc.Name, cci.SortOrder;
