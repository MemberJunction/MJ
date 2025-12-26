#!/usr/bin/env node

/**
 * Test script to verify exceljs works correctly with unzipper@0.12.3
 * Tests both reading and writing Excel files
 */

import ExcelJS from 'exceljs';
import { writeFileSync, unlinkSync, existsSync } from 'fs';

const testFile = '/tmp/test-excel-mj.xlsx';

async function testExcelJS() {
    console.log('🧪 Testing ExcelJS with unzipper@0.12.3...\n');

    try {
        // Test 1: Create Excel file (Write)
        console.log('1️⃣  Testing Excel Writer...');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Test Sheet');

        // Add headers
        worksheet.columns = [
            { header: 'Product', key: 'product', width: 20 },
            { header: 'Price', key: 'price', width: 10 },
            { header: 'Quantity', key: 'quantity', width: 10 }
        ];

        // Add data
        worksheet.addRow({ product: 'Widget A', price: 19.99, quantity: 100 });
        worksheet.addRow({ product: 'Widget B', price: 29.99, quantity: 50 });
        worksheet.addRow({ product: 'Widget C', price: 39.99, quantity: 75 });

        await workbook.xlsx.writeFile(testFile);
        console.log('   ✅ Excel file created successfully');

        // Test 2: Read Excel file (Read)
        console.log('\n2️⃣  Testing Excel Reader...');
        const readWorkbook = new ExcelJS.Workbook();
        await readWorkbook.xlsx.readFile(testFile);

        const readWorksheet = readWorkbook.getWorksheet('Test Sheet');
        if (!readWorksheet) {
            throw new Error('Failed to read worksheet');
        }

        let rowCount = 0;
        readWorksheet.eachRow((row, rowNumber) => {
            rowCount++;
            if (rowNumber === 2) { // First data row
                const product = row.getCell(1).value;
                const price = row.getCell(2).value;
                if (product !== 'Widget A' || price !== 19.99) {
                    throw new Error(`Data mismatch: expected Widget A @ 19.99, got ${product} @ ${price}`);
                }
            }
        });

        if (rowCount !== 4) { // Header + 3 data rows
            throw new Error(`Expected 4 rows, got ${rowCount}`);
        }

        console.log('   ✅ Excel file read successfully');
        console.log(`   ✅ Data validated: ${rowCount - 1} data rows`);

        // Test 3: Read as buffer (simulates reading from storage)
        console.log('\n3️⃣  Testing Buffer Reading...');
        const buffer = await workbook.xlsx.writeBuffer();
        const bufferWorkbook = new ExcelJS.Workbook();
        await bufferWorkbook.xlsx.load(buffer);

        const bufferWorksheet = bufferWorkbook.getWorksheet('Test Sheet');
        if (!bufferWorksheet || bufferWorksheet.rowCount !== 4) {
            throw new Error('Buffer reading failed');
        }

        console.log('   ✅ Buffer reading successful');

        // Cleanup
        if (existsSync(testFile)) {
            unlinkSync(testFile);
        }

        console.log('\n✅ ALL TESTS PASSED - ExcelJS is working correctly!');
        console.log('   No compatibility issues with unzipper@0.12.3\n');
        return true;

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        console.error('   ExcelJS may have compatibility issues with unzipper@0.12.3');

        // Cleanup on error
        if (existsSync(testFile)) {
            unlinkSync(testFile);
        }

        throw error;
    }
}

testExcelJS()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
