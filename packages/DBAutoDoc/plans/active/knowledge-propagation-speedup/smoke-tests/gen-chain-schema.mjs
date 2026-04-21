#!/usr/bin/env node
// Generate a synthetic state.json with a 10-table linear chain at constant complexity.
// Each table: 3 columns (own_Id PK, Name, parent_Id FK except first).
// Names suggest an organizational hierarchy — realistic enough that the LLM isn't
// guessing from thin air, but ambiguous enough that propagated context actually helps.

import { writeFileSync } from 'node:fs';

// Ordered from root to deepest
const CHAIN = [
    { name: 'Corp',       sample: ['Acme Industries', 'Globex Ltd', 'Initech'] },
    { name: 'Division',   sample: ['Manufacturing', 'Sales', 'Research'] },
    { name: 'Department', sample: ['Engineering', 'Quality', 'Purchasing'] },
    { name: 'Team',       sample: ['Backend Platform', 'Data Pipeline', 'UI'] },
    { name: 'Squad',      sample: ['Alpha', 'Bravo', 'Charlie'] },
    { name: 'Member',     sample: ['A. Smith', 'B. Jones', 'C. Lee'] },
    { name: 'Task',       sample: ['Migrate DB', 'Deploy v2', 'Fix bug #42'] },
    { name: 'Subtask',    sample: ['Schema design', 'ETL script', 'Regression test'] },
    { name: 'Step',       sample: ['Gather requirements', 'Write code', 'Review'] },
    { name: 'Action',     sample: ['Opened file', 'Ran test', 'Merged PR'] },
];

const tables = [];
for (let i = 0; i < CHAIN.length; i++) {
    const { name, sample } = CHAIN[i];
    const prev = i > 0 ? CHAIN[i - 1] : null;
    const rowCount = 50 + i * 30;
    const pkCol = `${name}Id`;
    const fkCol = prev ? `${prev.name}Id` : null;

    const columns = [
        {
            name: pkCol, dataType: 'int', isNullable: false,
            isPrimaryKey: true, isForeignKey: false,
            statistics: { totalRows: rowCount, distinctCount: rowCount, uniquenessRatio: 1, nullPercentage: 0, sampleValues: [1, 2, 3, rowCount, rowCount-1] },
        },
        {
            name: 'Name', dataType: 'nvarchar', isNullable: false,
            isPrimaryKey: false, isForeignKey: false,
            statistics: { totalRows: rowCount, distinctCount: Math.round(rowCount * 0.9), uniquenessRatio: 0.9, nullPercentage: 0, sampleValues: sample },
        },
    ];
    if (prev) {
        columns.push({
            name: fkCol, dataType: 'int', isNullable: false,
            isPrimaryKey: false, isForeignKey: true,
            foreignKeyReferences: { schema: 'dbo', table: prev.name, column: fkCol, referencedColumn: fkCol },
            statistics: { totalRows: rowCount, distinctCount: Math.round(50 + (i-1) * 30), uniquenessRatio: 0.3, nullPercentage: 0, sampleValues: [1, 2, 3, 4, 5] },
        });
    }

    tables.push({
        name,
        rowCount,
        description: '',
        userApproved: false,
        descriptionIterations: [],
        columns,
        dependsOn: prev ? [{
            schema: 'dbo', table: prev.name, column: fkCol, referencedColumn: fkCol,
        }] : [],
        dependents: (i < CHAIN.length - 1) ? [{
            schema: 'dbo', table: CHAIN[i + 1].name, column: `${name}Id`, referencedColumn: `${name}Id`,
        }] : [],
    });
}

const state = {
    version: '1.0.0',
    summary: { databaseName: 'SyntheticChain10', totalSchemas: 1, totalTables: tables.length },
    database: { name: 'SyntheticChain10', server: 'synthetic' },
    phases: {},
    schemas: [{ name: 'dbo', tables }],
};

const outPath = process.argv[2] || './chain-10-state.json';
writeFileSync(outPath, JSON.stringify(state, null, 2));
console.log(`Wrote synthetic chain schema: ${outPath}`);
console.log(`Chain (root -> deepest): ${CHAIN.map(c => c.name).join(' -> ')}`);
