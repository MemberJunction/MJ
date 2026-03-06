-- MJ Sample App: Seed data
-- Inserts a sample record to verify migration execution.

INSERT INTO ${flyway:defaultSchema}.SampleRecord (ID, Name, Description, Status)
VALUES (
    'A0000000-0000-0000-0000-000000000001',
    'Test Record',
    'Seeded by the sample app migration.',
    'Active'
);
