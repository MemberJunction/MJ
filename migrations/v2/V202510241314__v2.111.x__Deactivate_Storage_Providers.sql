-- Update all storage providers to be inactive that we
-- ship with MJ, don't affect anything anyone else has created
-- users should turn on providers when they use those
-- providers
UPDATE 
    ${flyway:defaultSchema}.FileStorageProvider 
SET 
    IsActive=0 
WHERE
    ID IN (
        'C4B9433E-F36B-1410-8DA0-00021F8B792E',
        'C9B9433E-F36B-1410-8DA0-00021F8B792E',
        'CEB9433E-F36B-1410-8DA0-00021F8B792E',
        'D3B9433E-F36B-1410-8DA0-00021F8B792E',
        'C4AECCEC-6A37-EF11-86D4-000D3A4E707E',
        'C5AECCEC-6A37-EF11-86D4-000D3A4E707E',
        'C6AECCEC-6A37-EF11-86D4-000D3A4E707E'
    )