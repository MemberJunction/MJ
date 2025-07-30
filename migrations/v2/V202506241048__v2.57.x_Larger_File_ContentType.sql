-- Increase ContentType column size to 255 characters in File table
ALTER TABLE ${flyway:defaultSchema}.[File]
ALTER COLUMN [ContentType] NVARCHAR(255) NULL;
