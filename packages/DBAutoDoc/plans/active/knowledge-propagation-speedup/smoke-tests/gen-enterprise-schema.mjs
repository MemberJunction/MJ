#!/usr/bin/env node
// Generate a synthetic 15-table enterprise-style schema with 3 natural clusters:
//   - HR domain: Employee, Department, Role, Compensation (4 tables)
//   - Sales domain: Customer, Order, OrderLine, Product (4 tables)
//   - Inventory domain: Warehouse, Stock, Supplier, Purchase (4 tables)
//   - Cross-cluster bridges: PaymentMethod (links Customer + Compensation),
//                            ProductStock (Product + Stock + Warehouse), = 3 bridge tables
// Total: 15 tables, ~22 FKs including 4 weak cross-cluster bridges.

import { writeFileSync } from 'node:fs';

function mkColumn(name, dataType, opts = {}) {
    const distinctCount = opts.distinctCount ?? 100;
    return {
        name,
        dataType,
        isNullable: opts.isNullable ?? false,
        isPrimaryKey: opts.pk ?? false,
        isForeignKey: !!opts.fkTo,
        foreignKeyReferences: opts.fkTo ? { schema: 'dbo', table: opts.fkTo.table, column: opts.fkTo.column, referencedColumn: opts.fkTo.column } : undefined,
        statistics: {
            totalRows: 100, distinctCount, uniquenessRatio: distinctCount / 100, nullPercentage: 0,
            sampleValues: opts.samples ?? []
        }
    };
}

function mkTable(name, rowCount, columns, deps = [], dependents = []) {
    return {
        name, rowCount, description: '', userApproved: false, descriptionIterations: [],
        columns,
        dependsOn: deps.map(d => ({ schema: 'dbo', table: d.table, column: d.column, referencedColumn: d.column })),
        dependents: dependents.map(d => ({ schema: 'dbo', table: d, column: '-', referencedColumn: '-' }))
    };
}

const tables = [
    // ════ HR cluster ════
    mkTable('Department', 10, [
        mkColumn('DepartmentId', 'int', { pk: true, distinctCount: 10, samples: [1, 2, 3] }),
        mkColumn('Name', 'nvarchar', { distinctCount: 10, samples: ['Engineering', 'Sales', 'Finance'] }),
        mkColumn('Location', 'nvarchar', { distinctCount: 5, samples: ['HQ', 'Remote', 'Branch A'] })
    ], [], ['Employee', 'Role']),
    mkTable('Role', 20, [
        mkColumn('RoleId', 'int', { pk: true, distinctCount: 20 }),
        mkColumn('Title', 'nvarchar', { distinctCount: 20, samples: ['Engineer', 'Manager', 'Analyst'] }),
        mkColumn('DepartmentId', 'int', { fkTo: { table: 'Department', column: 'DepartmentId' }, distinctCount: 10 })
    ], [{ table: 'Department', column: 'DepartmentId' }], ['Employee']),
    mkTable('Employee', 100, [
        mkColumn('EmployeeId', 'int', { pk: true, distinctCount: 100 }),
        mkColumn('Name', 'nvarchar', { distinctCount: 100, samples: ['Alice', 'Bob'] }),
        mkColumn('Email', 'nvarchar', { distinctCount: 100, samples: ['a@x.com'] }),
        mkColumn('DepartmentId', 'int', { fkTo: { table: 'Department', column: 'DepartmentId' }, distinctCount: 10 }),
        mkColumn('RoleId', 'int', { fkTo: { table: 'Role', column: 'RoleId' }, distinctCount: 20 })
    ], [{ table: 'Department', column: 'DepartmentId' }, { table: 'Role', column: 'RoleId' }], ['Compensation']),
    mkTable('Compensation', 100, [
        mkColumn('CompensationId', 'int', { pk: true, distinctCount: 100 }),
        mkColumn('EmployeeId', 'int', { fkTo: { table: 'Employee', column: 'EmployeeId' }, distinctCount: 100 }),
        mkColumn('Amount', 'decimal', { distinctCount: 80, samples: [50000, 75000] }),
        mkColumn('EffectiveDate', 'date', { distinctCount: 50 })
    ], [{ table: 'Employee', column: 'EmployeeId' }], []),

    // ════ Sales cluster ════
    mkTable('Customer', 500, [
        mkColumn('CustomerId', 'int', { pk: true, distinctCount: 500 }),
        mkColumn('Name', 'nvarchar', { distinctCount: 500 }),
        mkColumn('Email', 'nvarchar', { distinctCount: 500 })
    ], [], ['Order']),
    mkTable('Product', 200, [
        mkColumn('ProductId', 'int', { pk: true, distinctCount: 200 }),
        mkColumn('Name', 'nvarchar', { distinctCount: 200, samples: ['Widget A', 'Widget B'] }),
        mkColumn('Price', 'decimal', { distinctCount: 150 })
    ], [], ['OrderLine', 'ProductStock']),
    mkTable('Order', 1000, [
        mkColumn('OrderId', 'int', { pk: true, distinctCount: 1000 }),
        mkColumn('CustomerId', 'int', { fkTo: { table: 'Customer', column: 'CustomerId' }, distinctCount: 500 }),
        mkColumn('OrderDate', 'datetime', { distinctCount: 800 }),
        mkColumn('TotalAmount', 'decimal', { distinctCount: 500 })
    ], [{ table: 'Customer', column: 'CustomerId' }], ['OrderLine']),
    mkTable('OrderLine', 3000, [
        mkColumn('OrderLineId', 'int', { pk: true, distinctCount: 3000 }),
        mkColumn('OrderId', 'int', { fkTo: { table: 'Order', column: 'OrderId' }, distinctCount: 1000 }),
        mkColumn('ProductId', 'int', { fkTo: { table: 'Product', column: 'ProductId' }, distinctCount: 200 }),
        mkColumn('Quantity', 'int', { distinctCount: 20 }),
        mkColumn('UnitPrice', 'decimal', { distinctCount: 150 })
    ], [{ table: 'Order', column: 'OrderId' }, { table: 'Product', column: 'ProductId' }], []),

    // ════ Inventory cluster ════
    mkTable('Warehouse', 5, [
        mkColumn('WarehouseId', 'int', { pk: true, distinctCount: 5 }),
        mkColumn('Name', 'nvarchar', { distinctCount: 5, samples: ['Main', 'East', 'West'] }),
        mkColumn('Location', 'nvarchar', { distinctCount: 5 })
    ], [], ['Stock', 'ProductStock']),
    mkTable('Supplier', 30, [
        mkColumn('SupplierId', 'int', { pk: true, distinctCount: 30 }),
        mkColumn('Name', 'nvarchar', { distinctCount: 30 }),
        mkColumn('ContactEmail', 'nvarchar', { distinctCount: 30 })
    ], [], ['Purchase']),
    mkTable('Stock', 200, [
        mkColumn('StockId', 'int', { pk: true, distinctCount: 200 }),
        mkColumn('WarehouseId', 'int', { fkTo: { table: 'Warehouse', column: 'WarehouseId' }, distinctCount: 5 }),
        mkColumn('Quantity', 'int', { distinctCount: 100 })
    ], [{ table: 'Warehouse', column: 'WarehouseId' }], ['ProductStock']),
    mkTable('Purchase', 150, [
        mkColumn('PurchaseId', 'int', { pk: true, distinctCount: 150 }),
        mkColumn('SupplierId', 'int', { fkTo: { table: 'Supplier', column: 'SupplierId' }, distinctCount: 30 }),
        mkColumn('OrderDate', 'date', { distinctCount: 100 }),
        mkColumn('TotalAmount', 'decimal', { distinctCount: 100 })
    ], [{ table: 'Supplier', column: 'SupplierId' }], []),

    // ════ BRIDGE tables — weakly link clusters ════
    mkTable('ProductStock', 500, [
        mkColumn('ProductStockId', 'int', { pk: true, distinctCount: 500 }),
        mkColumn('ProductId', 'int', { fkTo: { table: 'Product', column: 'ProductId' }, distinctCount: 200 }),
        mkColumn('StockId', 'int', { fkTo: { table: 'Stock', column: 'StockId' }, distinctCount: 200 }),
        mkColumn('WarehouseId', 'int', { fkTo: { table: 'Warehouse', column: 'WarehouseId' }, distinctCount: 5 })
    ], [{ table: 'Product', column: 'ProductId' }, { table: 'Stock', column: 'StockId' }, { table: 'Warehouse', column: 'WarehouseId' }], []),
    mkTable('PaymentMethod', 100, [
        mkColumn('PaymentMethodId', 'int', { pk: true, distinctCount: 100 }),
        mkColumn('CustomerId', 'int', { fkTo: { table: 'Customer', column: 'CustomerId' }, distinctCount: 500 }),
        mkColumn('Type', 'nvarchar', { distinctCount: 3, samples: ['credit', 'debit', 'bank'] })
    ], [{ table: 'Customer', column: 'CustomerId' }], []),
    mkTable('SupplierPayment', 50, [
        mkColumn('SupplierPaymentId', 'int', { pk: true, distinctCount: 50 }),
        mkColumn('SupplierId', 'int', { fkTo: { table: 'Supplier', column: 'SupplierId' }, distinctCount: 30 }),
        mkColumn('EmployeeId', 'int', { fkTo: { table: 'Employee', column: 'EmployeeId' }, distinctCount: 100 }),
        mkColumn('Amount', 'decimal', { distinctCount: 40 })
    ], [{ table: 'Supplier', column: 'SupplierId' }, { table: 'Employee', column: 'EmployeeId' }], []),
];

const state = {
    version: '1.0.0',
    summary: { databaseName: 'SyntheticEnterprise', totalSchemas: 1, totalTables: tables.length },
    database: { name: 'SyntheticEnterprise', server: 'synthetic' },
    phases: {},
    schemas: [{ name: 'dbo', tables }],
};

const outPath = process.argv[2] || './enterprise-15-state.json';
writeFileSync(outPath, JSON.stringify(state, null, 2));
console.log(`Wrote ${outPath}`);
console.log(`Tables: ${tables.length}`);
console.log(`Clusters expected: HR(4) + Sales(4) + Inventory(4) + Bridges(3) = 15`);
console.log(`Cross-cluster bridges: SupplierPayment (HR↔Inventory), PaymentMethod (HR-adj Sales), ProductStock (Sales↔Inventory)`);
