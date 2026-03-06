import { CodeGenConnection } from './codeGenDatabaseProvider';

export async function generateReorderTableColumnsScript(
    tableName: string, 
    dataSource: CodeGenConnection
): Promise<string> {
    const schemaName = await fetchSchemaName(tableName, dataSource);
    const columns = await fetchColumns(schemaName, tableName, dataSource);
    const orderedColumns = columns.map(col => `[${col.COLUMN_NAME}]`);
    const tempTableName = `[${schemaName}].[${tableName}_temp]`;

    let sqlScript = `BEGIN TRANSACTION;
`;
    sqlScript += createTempTable(schemaName, tempTableName, columns);
    sqlScript += copyDataToTempTable(tempTableName, `[${schemaName}].[${tableName}]`, orderedColumns);
    sqlScript += await dropConstraintsAndIndexes(schemaName, tableName, dataSource);
    sqlScript += await dropExternalForeignKeys(schemaName, tableName, dataSource);
    sqlScript += dropOriginalTableAndRenameTemp(schemaName, tableName, tempTableName);
    sqlScript += await recreateConstraintsAndIndexes(schemaName, tableName, dataSource);
    sqlScript += await recreateExternalForeignKeys(schemaName, tableName, dataSource);
    sqlScript += `COMMIT TRANSACTION;
`;

    return sqlScript;
}

// Step 1: Fetch schema name
async function fetchSchemaName(tableName: string, dataSource: CodeGenConnection): Promise<string> {
    const query = `
        SELECT TABLE_SCHEMA
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = '${tableName}';
    `;
    const result = await dataSource.query(query);
    return result.recordset[0]?.TABLE_SCHEMA;
}

// Step 2: Fetch columns and current order
async function fetchColumns(schemaName: string, tableName: string, dataSource: CodeGenConnection): Promise<any[]> {
    const query = `
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = '${schemaName}' AND TABLE_NAME = '${tableName}'
        ORDER BY ORDINAL_POSITION;
    `;
    const result = await dataSource.query(query);
    return result.recordset;
}

// Step 3: Create temporary table in desired order
function createTempTable(schemaName: string, tempTableName: string, columns: any[]): string {
    let tableScript = `CREATE TABLE ${tempTableName} (
`;
    columns.forEach(col => {
        tableScript += `  [${col.COLUMN_NAME}] ${col.DATA_TYPE}`;
        if (col.CHARACTER_MAXIMUM_LENGTH) tableScript += `(${col.CHARACTER_MAXIMUM_LENGTH})`;
        if (col.IS_NULLABLE === "NO") tableScript += ` NOT NULL`;
        if (col.COLUMN_DEFAULT) tableScript += ` DEFAULT ${col.COLUMN_DEFAULT}`;
        tableScript += `,
`;
    });
    return tableScript.slice(0, -2) + `
);
`;  // Remove trailing comma
}

// Step 4: Copy data to temp table in the desired column order
function copyDataToTempTable(tempTableName: string, tableName: string, orderedColumns: string[]): string {
    const wrappedColumns = orderedColumns.map(col => `[${col}]`);
    return `INSERT INTO ${tempTableName} (${wrappedColumns.join(', ')})
` +
           `SELECT ${wrappedColumns.join(', ')} FROM ${tableName};
`;
}

// Step 5: Drop constraints and indexes on the original table
async function dropConstraintsAndIndexes(schemaName: string, tableName: string, dataSource: CodeGenConnection): Promise<string> {
    let script = '';
    const fullTableName = `[${schemaName}].[${tableName}]`;

    // Drop constraints (including CHECK constraints)
    const constraintsQuery = `
        SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = '${schemaName}' AND TABLE_NAME = '${tableName}';
    `;
    const constraintsResult = await dataSource.query(constraintsQuery);
    const constraints = constraintsResult.recordset;
    constraints.forEach((row: any)  => {
        script += `ALTER TABLE ${fullTableName} DROP CONSTRAINT [${row.CONSTRAINT_NAME}];
`;
    });

    // Drop indexes
    const indexesQuery = `
        SELECT i.name AS index_name, c.name AS column_name
        FROM sys.indexes i
        INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        WHERE i.object_id = OBJECT_ID('${fullTableName}') AND is_primary_key = 0 AND is_unique_constraint = 0;
    `;
    const indexesResult = await dataSource.query(indexesQuery);
    const indexes = indexesResult.recordset;
    indexes.forEach((row: any) => {
        script += `DROP INDEX [${row.index_name}] ON ${fullTableName};
`;
    });

    return script;
}

// Step 6: Drop foreign keys from external tables pointing to the original table
async function dropExternalForeignKeys(schemaName: string, tableName: string, dataSource: CodeGenConnection): Promise<string> {
    let script = '';
    const fullTableName = `[${schemaName}].[${tableName}]`;

    const externalForeignKeysQuery = `
        SELECT 
            rc.CONSTRAINT_NAME, 
            rc.TABLE_NAME AS REFERENCING_TABLE_NAME, 
            cc.COLUMN_NAME AS REFERENCING_COLUMN_NAME
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS AS rc
        JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE AS cc
            ON rc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
        WHERE rc.UNIQUE_CONSTRAINT_NAME IN (
            SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = '${schemaName}' AND TABLE_NAME = '${tableName}'
        );
    `;
    const externalForeignKeysResult = await dataSource.query(externalForeignKeysQuery);
    const externalForeignKeys = externalForeignKeysResult.recordset;
    externalForeignKeys.forEach((row: any) => {
        const referencingTable = `[${schemaName}].[${row.REFERENCING_TABLE_NAME}]`;
        script += `ALTER TABLE ${referencingTable} DROP CONSTRAINT [${row.CONSTRAINT_NAME}];
`;
    });

    return script;
}

// Step 7: Drop original table and rename temp table
function dropOriginalTableAndRenameTemp(schemaName: string, tableName: string, tempTableName: string): string {
    const fullTableName = `[${schemaName}].[${tableName}]`;
    return `DROP TABLE ${fullTableName};
` +
           `EXEC sp_rename '${tempTableName}', '${fullTableName}';
`;
}

// Step 8: Recreate constraints and indexes on the reordered table
async function recreateConstraintsAndIndexes(schemaName: string, tableName: string, dataSource: CodeGenConnection): Promise<string> {
    let script = '';
    const fullTableName = `[${schemaName}].[${tableName}]`;

    // Recreate constraints (including CHECK constraints)
    const constraintsQuery = `
        SELECT 
            tc.CONSTRAINT_NAME, 
            tc.CONSTRAINT_TYPE,
            cc.COLUMN_NAME,
            chk.CHECK_CLAUSE,
            fk.REFERENCED_TABLE_NAME, 
            fk.REFERENCED_COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS AS tc
        LEFT JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE AS cc
            ON tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
        LEFT JOIN INFORMATION_SCHEMA.CHECK_CONSTRAINTS AS chk
            ON tc.CONSTRAINT_NAME = chk.CONSTRAINT_NAME
        LEFT JOIN (
            SELECT 
                kcu.CONSTRAINT_NAME, 
                kcu.TABLE_NAME AS REFERENCED_TABLE_NAME, 
                kcu.COLUMN_NAME AS REFERENCED_COLUMN_NAME
            FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS AS rc
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS kcu
                ON rc.UNIQUE_CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        ) AS fk
            ON tc.CONSTRAINT_NAME = fk.CONSTRAINT_NAME
        WHERE tc.TABLE_SCHEMA = '${schemaName}' AND tc.TABLE_NAME = '${tableName}';
    `;
    const constraintsResult = await dataSource.query(constraintsQuery);
    const constraints = constraintsResult.recordset;
    constraints.forEach((row: any) => {
        if (row.CONSTRAINT_TYPE === 'PRIMARY KEY') {
            script += `ALTER TABLE ${fullTableName} ADD CONSTRAINT [${row.CONSTRAINT_NAME}] PRIMARY KEY ([${row.COLUMN_NAME}]);
`;
        } else if (row.CONSTRAINT_TYPE === 'FOREIGN KEY') {
            script += `ALTER TABLE ${fullTableName} ADD CONSTRAINT [${row.CONSTRAINT_NAME}] FOREIGN KEY ([${row.COLUMN_NAME}]) REFERENCES [${schemaName}].[${row.REFERENCED_TABLE_NAME}]([${row.REFERENCED_COLUMN_NAME}]);
`;
        } else if (row.CONSTRAINT_TYPE === 'UNIQUE') {
            script += `ALTER TABLE ${fullTableName} ADD CONSTRAINT [${row.CONSTRAINT_NAME}] UNIQUE ([${row.COLUMN_NAME}]);
`;
        } else if (row.CONSTRAINT_TYPE === 'CHECK') {
            script += `ALTER TABLE ${fullTableName} ADD CONSTRAINT [${row.CONSTRAINT_NAME}] CHECK (${row.CHECK_CLAUSE});
`;
        }
    });

    // Recreate indexes
    const indexesQuery = `
        SELECT i.name AS index_name, c.name AS column_name, i.is_unique
        FROM sys.indexes i
        INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        WHERE i.object_id = OBJECT_ID('${fullTableName}') AND is_primary_key = 0 AND is_unique_constraint = 0;
    `;
    const indexesResult = await dataSource.query(indexesQuery);
    const indexes = indexesResult.recordset;
    indexes.forEach((row: any) => {
        const unique = row.is_unique ? 'UNIQUE' : '';
        script += `CREATE ${unique} INDEX [${row.index_name}] ON ${fullTableName} ([${row.column_name}]);
`;
    });

    return script;
}

// Step 9: Recreate foreign keys from external tables pointing to the reordered table
async function recreateExternalForeignKeys(schemaName: string, tableName: string, dataSource: CodeGenConnection): Promise<string> {
    let script = '';

    const externalForeignKeysQuery = `
        SELECT 
            rc.CONSTRAINT_NAME, 
            rc.TABLE_NAME AS REFERENCING_TABLE_NAME, 
            cc.COLUMN_NAME AS REFERENCING_COLUMN_NAME,
            kcu.TABLE_NAME AS REFERENCED_TABLE_NAME,
            kcu.COLUMN_NAME AS REFERENCED_COLUMN_NAME
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS AS rc
        JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE AS cc
            ON rc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS kcu
            ON rc.UNIQUE_CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        WHERE kcu.TABLE_SCHEMA = '${schemaName}' AND kcu.TABLE_NAME = '${tableName}';
    `;
    const externalForeignKeysResult = await dataSource.query(externalForeignKeysQuery);
    const externalForeignKeys = externalForeignKeysResult.recordset;
    externalForeignKeys.forEach((row: any) => {
        const referencingTable = `[${schemaName}].[${row.REFERENCING_TABLE_NAME}]`;
        script += `ALTER TABLE ${referencingTable} ADD CONSTRAINT [${row.CONSTRAINT_NAME}] FOREIGN KEY ([${row.REFERENCING_COLUMN_NAME}]) REFERENCES [${schemaName}].[${row.REFERENCED_TABLE_NAME}]([${row.REFERENCED_COLUMN_NAME}]);
`;
    });

    return script;
}

// Usage example
// const dataSource = /* CodeGenConnection instance */;
// const script = await generateReorderTableColumnsScript('YourTableName', dataSource);
// console.log(script); // Outputs the SQL script to reorder columns