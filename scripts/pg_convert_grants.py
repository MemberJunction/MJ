#!/usr/bin/env python3
"""
Pass 4: Extract and convert GRANT statements from the T-SQL baseline to PostgreSQL.

Converts:
- GRANT EXECUTE ON [schema].[spName] TO [role] -> GRANT EXECUTE ON FUNCTION __mj."spName" TO role
- GRANT SELECT ON [schema].[vwName] TO [role]  -> GRANT SELECT ON __mj."vwName" TO role
"""

import re

SOURCE = '/workspace/MJ/migrations/v4/B202602061600__v4.0__Baseline.sql'
OUTPUT = '/workspace/MJ/scripts/pg_grants_output.sql'
SCHEMA = '__mj'

# Procedures that were skipped in Pass 3 and don't exist in PG
SKIP_OBJECTS = {
    'CAREFUL_MoveDatesToNewSpecialFields_Then_Drop_Old_CreatedAt_And_UpdatedAt_Columns',
    'spRecompileAllProceduresInDependencyOrder',
    'spRecompileAllViews',
    'spUpdateSchemaInfoFromDatabase',
    'spUpdateExistingEntitiesFromSchema',
    'spCreateUserViewRunWithDetail',
    'spCreateEntityBehaviorType',
    'spUpdateEntityBehaviorType',
    'spDeleteEntityBehaviorType',
    'spCreateEntityBehavior',
    'spUpdateEntityBehavior',
    'spDeleteEntityBehavior',
}

# System catalog views that were skipped (they reference sys.* objects)
SKIP_VIEWS = {
    'vwSQLTablesAndEntities',
    'vwSQLColumnsAndEntityFields',
    'vwTableUniqueKeys',
    'vwTablePrimaryKeys',
    'vwForeignKeys',
    'vwSQLForeignKeys',
    'vwSchemaInfoPlusColumns',
    'vwEntityRecordNamesFull',
    'vwEntitiesWithMissingBaseTables',
    'vwSQLSchemas',
}

# Map T-SQL role names to PostgreSQL role names
ROLE_MAP = {
    'cdp_Developer': 'cdp_Developer',
    'cdp_Integration': 'cdp_Integration',
    'cdp_UI': 'cdp_UI',
    'public': 'PUBLIC',
}


def read_source():
    with open(SOURCE, 'r', encoding='utf-8-sig') as f:
        return f.read()


def extract_grants(text):
    """Extract all GRANT statements from the source."""
    grants = []
    pattern = re.compile(
        r'GRANT\s+(EXECUTE|SELECT)\s+ON\s+'
        r'\[\$\{flyway:defaultSchema\}\]\.\[([^\]]+)\]\s+'
        r'TO\s+\[([^\]]+)\]',
        re.IGNORECASE
    )
    for m in pattern.finditer(text):
        permission = m.group(1).upper()
        obj_name = m.group(2)
        role_name = m.group(3)
        grants.append((permission, obj_name, role_name))
    return grants


def convert_grant(permission, obj_name, role_name):
    """Convert a single GRANT to PostgreSQL syntax."""
    if obj_name in SKIP_OBJECTS or obj_name in SKIP_VIEWS:
        return None

    pg_role = ROLE_MAP.get(role_name, role_name)

    if permission == 'EXECUTE':
        # Stored procedures are functions in PostgreSQL
        return f'GRANT EXECUTE ON FUNCTION {SCHEMA}."{obj_name}" TO {pg_role};'
    elif permission == 'SELECT':
        return f'GRANT SELECT ON {SCHEMA}."{obj_name}" TO {pg_role};'

    return None


def main():
    text = read_source()
    grants = extract_grants(text)

    converted = []
    skipped = 0
    for permission, obj_name, role_name in grants:
        result = convert_grant(permission, obj_name, role_name)
        if result:
            converted.append(result)
        else:
            skipped += 1

    with open(OUTPUT, 'w') as f:
        f.write('\n-- ============================================\n')
        f.write('-- GRANT STATEMENTS\n')
        f.write('-- ============================================\n\n')
        for grant in converted:
            f.write(grant + '\n')
        f.write('\n')

    print(f'  Converted: {len(converted)} grants')
    print(f'  Skipped:   {skipped} (objects not in PG baseline)')


if __name__ == '__main__':
    main()
