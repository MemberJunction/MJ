import { Metadata, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJGlobal } from '@memberjunction/global';
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';

// Register the data provider
RegisterClass(SQLServerDataProvider, 'SQLServerDataProvider');
MJGlobal.Instance.ClassFactory.Register(SQLServerDataProvider, 'SQLServerDataProvider');

async function checkBikingData() {
    try {
        console.log('Initializing metadata...');
        const md = new Metadata();

        // Load metadata
        const result = await md.Refresh();
        if (!result) {
            console.error('Failed to load metadata');
            return;
        }

        console.log('\n✓ Metadata loaded successfully\n');

        // Check each entity
        const entities = [
            'Riders',
            'Bikes',
            'Locations',
            'Weathers',
            'Rider _ Stats'
        ];

        const rv = new RunView();

        for (const entityName of entities) {
            console.log(`\n--- Checking ${entityName} ---`);

            const countResult = await rv.RunView({
                EntityName: entityName,
                ResultType: 'simple'
            });

            if (countResult.Success) {
                const count = countResult.Results?.length || 0;
                console.log(`✓ Found ${count} records`);

                if (count > 0 && count <= 5) {
                    console.log('Sample records:');
                    console.log(JSON.stringify(countResult.Results, null, 2));
                } else if (count > 5) {
                    console.log('First 3 records:');
                    console.log(JSON.stringify(countResult.Results.slice(0, 3), null, 2));
                }
            } else {
                console.log(`✗ Error: ${countResult.ErrorMessage}`);
            }
        }

        console.log('\n--- Summary ---');
        console.log('Database check complete');

    } catch (error) {
        console.error('Error checking biking data:', error);
    }

    process.exit(0);
}

checkBikingData();
