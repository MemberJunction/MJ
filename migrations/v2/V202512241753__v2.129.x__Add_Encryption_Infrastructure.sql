/***********************************************************************************
 * Migration: V202512241753__v2.130.x__Add_Encryption_Infrastructure.sql
 *
 * Purpose: Adds field-level encryption infrastructure to MemberJunction including:
 *   - EncryptionKeySource: Defines where encryption keys are retrieved from
 *   - EncryptionAlgorithm: Defines available encryption algorithms
 *   - EncryptionKey: Specific encryption key configurations
 *   - EntityField extensions: Encrypt, EncryptionKeyID, AllowDecryptInAPI, SendEncryptedValue
 *
 * Security Design:
 *   - Keys are NEVER stored in the database
 *   - Keys are retrieved from external sources (env vars, vaults, config files)
 *   - AES-256-GCM is the recommended algorithm (authenticated encryption)
 *   - Secure defaults: AllowDecryptInAPI=0, SendEncryptedValue=0
 *
 * Author: Claude Code
 * Date: 2024-12-24
 ***********************************************************************************/

-- =====================================================
-- 1. ENCRYPTION KEY SOURCES
-- Defines where encryption keys are retrieved from
-- =====================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EncryptionKeySource' AND schema_id = SCHEMA_ID('${flyway:defaultSchema}'))
BEGIN
    CREATE TABLE ${flyway:defaultSchema}.EncryptionKeySource (
        ID UNIQUEIDENTIFIER NOT NULL DEFAULT (newsequentialid()),
        Name NVARCHAR(100) NOT NULL,
        Description NVARCHAR(MAX) NULL,
        DriverClass NVARCHAR(255) NOT NULL,
        DriverImportPath NVARCHAR(500) NULL,
        ConfigTemplate NVARCHAR(MAX) NULL,
        IsActive BIT NOT NULL DEFAULT (1),
        Status NVARCHAR(20) NOT NULL DEFAULT (N'Active'),
        CONSTRAINT PK_EncryptionKeySource_ID PRIMARY KEY (ID),
        CONSTRAINT UQ_EncryptionKeySource_Name UNIQUE (Name),
        CONSTRAINT CK_EncryptionKeySource_Status CHECK (Status IN (N'Active', N'Inactive', N'Deprecated'))
    );
END;

-- =====================================================
-- 2. ENCRYPTION ALGORITHMS
-- Defines available encryption algorithms
-- =====================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EncryptionAlgorithm' AND schema_id = SCHEMA_ID('${flyway:defaultSchema}'))
BEGIN
    CREATE TABLE ${flyway:defaultSchema}.EncryptionAlgorithm (
        ID UNIQUEIDENTIFIER NOT NULL DEFAULT (newsequentialid()),
        Name NVARCHAR(50) NOT NULL,
        Description NVARCHAR(MAX) NULL,
        NodeCryptoName NVARCHAR(50) NOT NULL,
        KeyLengthBits INT NOT NULL,
        IVLengthBytes INT NOT NULL,
        IsAEAD BIT NOT NULL DEFAULT (0),
        IsActive BIT NOT NULL DEFAULT (1),
        CONSTRAINT PK_EncryptionAlgorithm_ID PRIMARY KEY (ID),
        CONSTRAINT UQ_EncryptionAlgorithm_Name UNIQUE (Name)
    );
END;

-- =====================================================
-- 3. ENCRYPTION KEYS
-- Defines specific encryption keys and their configuration
-- =====================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EncryptionKey' AND schema_id = SCHEMA_ID('${flyway:defaultSchema}'))
BEGIN
    CREATE TABLE ${flyway:defaultSchema}.EncryptionKey (
        ID UNIQUEIDENTIFIER NOT NULL DEFAULT (newsequentialid()),
        Name NVARCHAR(100) NOT NULL,
        Description NVARCHAR(MAX) NULL,
        EncryptionKeySourceID UNIQUEIDENTIFIER NOT NULL,
        EncryptionAlgorithmID UNIQUEIDENTIFIER NOT NULL,
        KeyLookupValue NVARCHAR(500) NOT NULL,
        KeyVersion NVARCHAR(20) NOT NULL DEFAULT (N'1'),
        Marker NVARCHAR(20) NOT NULL DEFAULT (N'$ENC$'),
        IsActive BIT NOT NULL DEFAULT (1),
        Status NVARCHAR(20) NOT NULL DEFAULT (N'Active'),
        ActivatedAt DATETIMEOFFSET NULL,
        ExpiresAt DATETIMEOFFSET NULL,
        CONSTRAINT PK_EncryptionKey_ID PRIMARY KEY (ID),
        CONSTRAINT UQ_EncryptionKey_Name UNIQUE (Name),
        CONSTRAINT FK_EncryptionKey_Source FOREIGN KEY (EncryptionKeySourceID) REFERENCES ${flyway:defaultSchema}.EncryptionKeySource (ID),
        CONSTRAINT FK_EncryptionKey_Algorithm FOREIGN KEY (EncryptionAlgorithmID) REFERENCES ${flyway:defaultSchema}.EncryptionAlgorithm (ID),
        CONSTRAINT CK_EncryptionKey_Status CHECK (Status IN (N'Active', N'Inactive', N'Rotating', N'Expired'))
    );
END;

-- =====================================================
-- 4. EXTEND ENTITYFIELD
-- Add encryption-related columns
-- =====================================================

-- Add Encrypt column
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'${flyway:defaultSchema}.EntityField') AND name = 'Encrypt')
BEGIN
    ALTER TABLE ${flyway:defaultSchema}.EntityField
        ADD Encrypt BIT NOT NULL DEFAULT (0);
END;

-- Add EncryptionKeyID column
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'${flyway:defaultSchema}.EntityField') AND name = 'EncryptionKeyID')
BEGIN
    ALTER TABLE ${flyway:defaultSchema}.EntityField
        ADD EncryptionKeyID UNIQUEIDENTIFIER NULL;

    ALTER TABLE ${flyway:defaultSchema}.EntityField
        ADD CONSTRAINT FK_EntityField_EncryptionKey FOREIGN KEY (EncryptionKeyID) REFERENCES ${flyway:defaultSchema}.EncryptionKey (ID);
END;

-- Add AllowDecryptInAPI column (default 0 = secure by default)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'${flyway:defaultSchema}.EntityField') AND name = 'AllowDecryptInAPI')
BEGIN
    ALTER TABLE ${flyway:defaultSchema}.EntityField
        ADD AllowDecryptInAPI BIT NOT NULL DEFAULT (0);
END;

-- Add SendEncryptedValue column (default 0 = return null when not decrypting)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'${flyway:defaultSchema}.EntityField') AND name = 'SendEncryptedValue')
BEGIN
    ALTER TABLE ${flyway:defaultSchema}.EntityField
        ADD SendEncryptedValue BIT NOT NULL DEFAULT (0);
END;


-- =====================================================
-- 6. EXTENDED PROPERTIES (Table Descriptions)
-- =====================================================

-- EncryptionKeySource table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines sources for retrieving encryption keys (environment variables, vault services, config files, etc.). Key sources are pluggable providers that implement the EncryptionKeySourceBase class.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EncryptionKeySource';

-- EncryptionAlgorithm table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines available encryption algorithms and their configuration parameters. AES-256-GCM is the recommended algorithm for new implementations.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EncryptionAlgorithm';

-- EncryptionKey table description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines encryption keys used for field-level encryption. Keys are NOT stored in the database - only references to external key sources. Configure one or more keys and assign them to entity fields.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EncryptionKey';

-- =====================================================
-- 7. EXTENDED PROPERTIES (Column Descriptions)
-- =====================================================

-- EncryptionKeySource columns
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier for the key source.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKeySource', @level2type = N'COLUMN', @level2name = 'ID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique name for this key source (e.g., Environment Variable, AWS KMS).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKeySource', @level2type = N'COLUMN', @level2name = 'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Human-readable description of this key source and usage instructions.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKeySource', @level2type = N'COLUMN', @level2name = 'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'TypeScript class name that implements EncryptionKeySourceBase (e.g., EnvVarKeySource).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKeySource', @level2type = N'COLUMN', @level2name = 'DriverClass';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Package path where the driver class is exported (e.g., @memberjunction/encryption).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKeySource', @level2type = N'COLUMN', @level2name = 'DriverImportPath';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON template describing the configuration options for this key source.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKeySource', @level2type = N'COLUMN', @level2name = 'ConfigTemplate';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether this key source is available for use.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKeySource', @level2type = N'COLUMN', @level2name = 'IsActive';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Current status: Active, Inactive, or Deprecated.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKeySource', @level2type = N'COLUMN', @level2name = 'Status';

-- EncryptionAlgorithm columns
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier for the algorithm.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionAlgorithm', @level2type = N'COLUMN', @level2name = 'ID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Algorithm name (e.g., AES-256-GCM). Must match the format used in encrypted values.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionAlgorithm', @level2type = N'COLUMN', @level2name = 'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Description of the algorithm and when to use it.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionAlgorithm', @level2type = N'COLUMN', @level2name = 'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Node.js crypto module algorithm identifier (e.g., aes-256-gcm).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionAlgorithm', @level2type = N'COLUMN', @level2name = 'NodeCryptoName';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Required key length in bits (e.g., 256 for AES-256).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionAlgorithm', @level2type = N'COLUMN', @level2name = 'KeyLengthBits';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Required initialization vector length in bytes (e.g., 12 for GCM, 16 for CBC).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionAlgorithm', @level2type = N'COLUMN', @level2name = 'IVLengthBytes';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether this algorithm provides Authenticated Encryption with Associated Data (AEAD). AEAD algorithms like GCM detect tampering.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionAlgorithm', @level2type = N'COLUMN', @level2name = 'IsAEAD';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether this algorithm is available for use.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionAlgorithm', @level2type = N'COLUMN', @level2name = 'IsActive';

-- EncryptionKey columns
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier for the encryption key configuration.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKey', @level2type = N'COLUMN', @level2name = 'ID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique name for this key (e.g., PII Master Key, API Secrets Key).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKey', @level2type = N'COLUMN', @level2name = 'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Description of this key purpose and scope.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKey', @level2type = N'COLUMN', @level2name = 'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'References the key source that provides the key material.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKey', @level2type = N'COLUMN', @level2name = 'EncryptionKeySourceID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'References the algorithm to use for encryption/decryption.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKey', @level2type = N'COLUMN', @level2name = 'EncryptionAlgorithmID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Source-specific lookup value (e.g., environment variable name, vault path).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKey', @level2type = N'COLUMN', @level2name = 'KeyLookupValue';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Version string for key rotation tracking. Incremented during rotation.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKey', @level2type = N'COLUMN', @level2name = 'KeyVersion';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Prefix marker for encrypted values (default: $ENC$).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKey', @level2type = N'COLUMN', @level2name = 'Marker';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether this key can be used for new encryption operations.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKey', @level2type = N'COLUMN', @level2name = 'IsActive';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Current status: Active, Inactive, Rotating, or Expired.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKey', @level2type = N'COLUMN', @level2name = 'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When the current key version was activated.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKey', @level2type = N'COLUMN', @level2name = 'ActivatedAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Optional expiration date. Keys past this date cannot be used for new encryption.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EncryptionKey', @level2type = N'COLUMN', @level2name = 'ExpiresAt';

-- EntityField encryption columns
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When true, this field will be encrypted at rest using the specified EncryptionKeyID. Encrypted fields cannot be indexed or searched.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EntityField', @level2type = N'COLUMN', @level2name = 'Encrypt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'References the encryption key to use when Encrypt is true. Required if Encrypt is true.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EntityField', @level2type = N'COLUMN', @level2name = 'EncryptionKeyID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When true, encrypted fields will be decrypted before returning via API. When false, behavior depends on SendEncryptedValue. Default is false (secure).',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EntityField', @level2type = N'COLUMN', @level2name = 'AllowDecryptInAPI';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When AllowDecryptInAPI is false: if true, send encrypted ciphertext (e.g., $ENC$...); if false (default), send sentinel value, usually "[!ENCRYPTED$]", indicating a value exists but is protected. Most secure option is false.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = 'EntityField', @level2type = N'COLUMN', @level2name = 'SendEncryptedValue';

PRINT 'Encryption infrastructure migration completed successfully.';

































































-- CODE GEN RUN

/* SQL generated to create new entity MJ: Encryption Key Sources */

      INSERT INTO [__mj].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         'e1a36cea-8ad9-442a-84d6-23a1b38bc278',
         'MJ: Encryption Key Sources',
         'Encryption Key Sources',
         NULL,
         NULL,
         'EncryptionKeySource',
         'vwEncryptionKeySources',
         '__mj',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: Encryption Key Sources to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'e1a36cea-8ad9-442a-84d6-23a1b38bc278', (SELECT ISNULL(MAX(Sequence),0)+1 FROM __mj.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Encryption Key Sources for role UI */
INSERT INTO __mj.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e1a36cea-8ad9-442a-84d6-23a1b38bc278', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Encryption Key Sources for role Developer */
INSERT INTO __mj.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e1a36cea-8ad9-442a-84d6-23a1b38bc278', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Encryption Key Sources for role Integration */
INSERT INTO __mj.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('e1a36cea-8ad9-442a-84d6-23a1b38bc278', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Encryption Algorithms */

      INSERT INTO [__mj].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '703330a7-2c34-4bd4-9224-4de10bb179f3',
         'MJ: Encryption Algorithms',
         'Encryption Algorithms',
         NULL,
         NULL,
         'EncryptionAlgorithm',
         'vwEncryptionAlgorithms',
         '__mj',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: Encryption Algorithms to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '703330a7-2c34-4bd4-9224-4de10bb179f3', (SELECT ISNULL(MAX(Sequence),0)+1 FROM __mj.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Encryption Algorithms for role UI */
INSERT INTO __mj.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('703330a7-2c34-4bd4-9224-4de10bb179f3', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Encryption Algorithms for role Developer */
INSERT INTO __mj.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('703330a7-2c34-4bd4-9224-4de10bb179f3', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Encryption Algorithms for role Integration */
INSERT INTO __mj.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('703330a7-2c34-4bd4-9224-4de10bb179f3', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Encryption Keys */

      INSERT INTO [__mj].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '854db803-34d4-46cd-8b8d-712974ae592f',
         'MJ: Encryption Keys',
         'Encryption Keys',
         NULL,
         NULL,
         'EncryptionKey',
         'vwEncryptionKeys',
         '__mj',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: Encryption Keys to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO __mj.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '854db803-34d4-46cd-8b8d-712974ae592f', (SELECT ISNULL(MAX(Sequence),0)+1 FROM __mj.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Encryption Keys for role UI */
INSERT INTO __mj.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('854db803-34d4-46cd-8b8d-712974ae592f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Encryption Keys for role Developer */
INSERT INTO __mj.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('854db803-34d4-46cd-8b8d-712974ae592f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Encryption Keys for role Integration */
INSERT INTO __mj.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('854db803-34d4-46cd-8b8d-712974ae592f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity __mj.EncryptionKeySource */
ALTER TABLE [__mj].[EncryptionKeySource] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.EncryptionKeySource */
ALTER TABLE [__mj].[EncryptionKeySource] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity __mj.EncryptionAlgorithm */
ALTER TABLE [__mj].[EncryptionAlgorithm] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.EncryptionAlgorithm */
ALTER TABLE [__mj].[EncryptionAlgorithm] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity __mj.EncryptionKey */
ALTER TABLE [__mj].[EncryptionKey] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity __mj.EncryptionKey */
ALTER TABLE [__mj].[EncryptionKey] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '2d3caaef-0936-4003-aaf0-a0601f4a791f'  OR 
               (EntityID = 'E1A36CEA-8AD9-442A-84D6-23A1B38BC278' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2d3caaef-0936-4003-aaf0-a0601f4a791f',
            'E1A36CEA-8AD9-442A-84D6-23A1B38BC278', -- Entity: MJ: Encryption Key Sources
            100001,
            'ID',
            'ID',
            'Unique identifier for the key source.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = 'd04f7a38-0841-4f01-8644-7077b06ddc25'  OR 
               (EntityID = 'E1A36CEA-8AD9-442A-84D6-23A1B38BC278' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd04f7a38-0841-4f01-8644-7077b06ddc25',
            'E1A36CEA-8AD9-442A-84D6-23A1B38BC278', -- Entity: MJ: Encryption Key Sources
            100002,
            'Name',
            'Name',
            'Unique name for this key source (e.g., Environment Variable, AWS KMS).',
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '83c5b15c-5907-4d67-b955-9b2a5ad3a558'  OR 
               (EntityID = 'E1A36CEA-8AD9-442A-84D6-23A1B38BC278' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '83c5b15c-5907-4d67-b955-9b2a5ad3a558',
            'E1A36CEA-8AD9-442A-84D6-23A1B38BC278', -- Entity: MJ: Encryption Key Sources
            100003,
            'Description',
            'Description',
            'Human-readable description of this key source and usage instructions.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '3c45ed1d-33d6-4557-869a-66f746f53630'  OR 
               (EntityID = 'E1A36CEA-8AD9-442A-84D6-23A1B38BC278' AND Name = 'DriverClass')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3c45ed1d-33d6-4557-869a-66f746f53630',
            'E1A36CEA-8AD9-442A-84D6-23A1B38BC278', -- Entity: MJ: Encryption Key Sources
            100004,
            'DriverClass',
            'Driver Class',
            'TypeScript class name that implements EncryptionKeySourceBase (e.g., EnvVarKeySource).',
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '48bd8b13-5732-44b1-8a86-859e5e471cce'  OR 
               (EntityID = 'E1A36CEA-8AD9-442A-84D6-23A1B38BC278' AND Name = 'DriverImportPath')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '48bd8b13-5732-44b1-8a86-859e5e471cce',
            'E1A36CEA-8AD9-442A-84D6-23A1B38BC278', -- Entity: MJ: Encryption Key Sources
            100005,
            'DriverImportPath',
            'Driver Import Path',
            'Package path where the driver class is exported (e.g., @memberjunction/encryption).',
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '18d76d7d-e914-4601-914c-c0fb3f2713dc'  OR 
               (EntityID = 'E1A36CEA-8AD9-442A-84D6-23A1B38BC278' AND Name = 'ConfigTemplate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '18d76d7d-e914-4601-914c-c0fb3f2713dc',
            'E1A36CEA-8AD9-442A-84D6-23A1B38BC278', -- Entity: MJ: Encryption Key Sources
            100006,
            'ConfigTemplate',
            'Config Template',
            'JSON template describing the configuration options for this key source.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '87cfbd70-5756-47a3-809d-1641ec388cbf'  OR 
               (EntityID = 'E1A36CEA-8AD9-442A-84D6-23A1B38BC278' AND Name = 'IsActive')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '87cfbd70-5756-47a3-809d-1641ec388cbf',
            'E1A36CEA-8AD9-442A-84D6-23A1B38BC278', -- Entity: MJ: Encryption Key Sources
            100007,
            'IsActive',
            'Is Active',
            'Whether this key source is available for use.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '07bb0ea0-9fd7-4ec3-ae79-6689358a22bd'  OR 
               (EntityID = 'E1A36CEA-8AD9-442A-84D6-23A1B38BC278' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '07bb0ea0-9fd7-4ec3-ae79-6689358a22bd',
            'E1A36CEA-8AD9-442A-84D6-23A1B38BC278', -- Entity: MJ: Encryption Key Sources
            100008,
            'Status',
            'Status',
            'Current status: Active, Inactive, or Deprecated.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '94bfafbf-4798-45d5-96d9-42b171c3a5a3'  OR 
               (EntityID = 'E1A36CEA-8AD9-442A-84D6-23A1B38BC278' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '94bfafbf-4798-45d5-96d9-42b171c3a5a3',
            'E1A36CEA-8AD9-442A-84D6-23A1B38BC278', -- Entity: MJ: Encryption Key Sources
            100009,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '27e0541b-517e-48c5-857f-6656b35a0025'  OR 
               (EntityID = 'E1A36CEA-8AD9-442A-84D6-23A1B38BC278' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '27e0541b-517e-48c5-857f-6656b35a0025',
            'E1A36CEA-8AD9-442A-84D6-23A1B38BC278', -- Entity: MJ: Encryption Key Sources
            100010,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '75ad8ae5-e1c6-4ed5-b486-c63a4feca2ac'  OR 
               (EntityID = '703330A7-2C34-4BD4-9224-4DE10BB179F3' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '75ad8ae5-e1c6-4ed5-b486-c63a4feca2ac',
            '703330A7-2C34-4BD4-9224-4DE10BB179F3', -- Entity: MJ: Encryption Algorithms
            100001,
            'ID',
            'ID',
            'Unique identifier for the algorithm.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '82187e0f-fd59-4c4f-97a3-44b902cdc8e0'  OR 
               (EntityID = '703330A7-2C34-4BD4-9224-4DE10BB179F3' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '82187e0f-fd59-4c4f-97a3-44b902cdc8e0',
            '703330A7-2C34-4BD4-9224-4DE10BB179F3', -- Entity: MJ: Encryption Algorithms
            100002,
            'Name',
            'Name',
            'Algorithm name (e.g., AES-256-GCM). Must match the format used in encrypted values.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '09face30-068b-4dcc-84e9-05d723085d57'  OR 
               (EntityID = '703330A7-2C34-4BD4-9224-4DE10BB179F3' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '09face30-068b-4dcc-84e9-05d723085d57',
            '703330A7-2C34-4BD4-9224-4DE10BB179F3', -- Entity: MJ: Encryption Algorithms
            100003,
            'Description',
            'Description',
            'Description of the algorithm and when to use it.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '1624db9d-7137-4fb6-9757-6bc7baad1942'  OR 
               (EntityID = '703330A7-2C34-4BD4-9224-4DE10BB179F3' AND Name = 'NodeCryptoName')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1624db9d-7137-4fb6-9757-6bc7baad1942',
            '703330A7-2C34-4BD4-9224-4DE10BB179F3', -- Entity: MJ: Encryption Algorithms
            100004,
            'NodeCryptoName',
            'Node Crypto Name',
            'Node.js crypto module algorithm identifier (e.g., aes-256-gcm).',
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = 'eba14ab6-3e59-4e7f-b315-49dfb26b4f21'  OR 
               (EntityID = '703330A7-2C34-4BD4-9224-4DE10BB179F3' AND Name = 'KeyLengthBits')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'eba14ab6-3e59-4e7f-b315-49dfb26b4f21',
            '703330A7-2C34-4BD4-9224-4DE10BB179F3', -- Entity: MJ: Encryption Algorithms
            100005,
            'KeyLengthBits',
            'Key Length Bits',
            'Required key length in bits (e.g., 256 for AES-256).',
            'int',
            4,
            10,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '3d22adc0-4410-4185-9133-9c04c7e30b50'  OR 
               (EntityID = '703330A7-2C34-4BD4-9224-4DE10BB179F3' AND Name = 'IVLengthBytes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3d22adc0-4410-4185-9133-9c04c7e30b50',
            '703330A7-2C34-4BD4-9224-4DE10BB179F3', -- Entity: MJ: Encryption Algorithms
            100006,
            'IVLengthBytes',
            'IV Length Bytes',
            'Required initialization vector length in bytes (e.g., 12 for GCM, 16 for CBC).',
            'int',
            4,
            10,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '1b7fb648-ea85-41db-ab44-ed8f616496c7'  OR 
               (EntityID = '703330A7-2C34-4BD4-9224-4DE10BB179F3' AND Name = 'IsAEAD')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1b7fb648-ea85-41db-ab44-ed8f616496c7',
            '703330A7-2C34-4BD4-9224-4DE10BB179F3', -- Entity: MJ: Encryption Algorithms
            100007,
            'IsAEAD',
            'Is AEAD',
            'Whether this algorithm provides Authenticated Encryption with Associated Data (AEAD). AEAD algorithms like GCM detect tampering.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '0d1f516c-91dc-4192-b383-538e9a4a540f'  OR 
               (EntityID = '703330A7-2C34-4BD4-9224-4DE10BB179F3' AND Name = 'IsActive')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0d1f516c-91dc-4192-b383-538e9a4a540f',
            '703330A7-2C34-4BD4-9224-4DE10BB179F3', -- Entity: MJ: Encryption Algorithms
            100008,
            'IsActive',
            'Is Active',
            'Whether this algorithm is available for use.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '2d3ef51e-fdfb-4088-810c-8fad79f97a32'  OR 
               (EntityID = '703330A7-2C34-4BD4-9224-4DE10BB179F3' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2d3ef51e-fdfb-4088-810c-8fad79f97a32',
            '703330A7-2C34-4BD4-9224-4DE10BB179F3', -- Entity: MJ: Encryption Algorithms
            100009,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '825de77f-46bb-4453-93b8-9feda74c3e61'  OR 
               (EntityID = '703330A7-2C34-4BD4-9224-4DE10BB179F3' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '825de77f-46bb-4453-93b8-9feda74c3e61',
            '703330A7-2C34-4BD4-9224-4DE10BB179F3', -- Entity: MJ: Encryption Algorithms
            100010,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '04c52058-4e01-4316-abae-9958afb71b5c'  OR 
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Encrypt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '04c52058-4e01-4316-abae-9958afb71b5c',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            100112,
            'Encrypt',
            'Encrypt',
            'When true, this field will be encrypted at rest using the specified EncryptionKeyID. Encrypted fields cannot be indexed or searched.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = 'b24d31a6-a3be-449c-9fe7-98c87e40da55'  OR 
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EncryptionKeyID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b24d31a6-a3be-449c-9fe7-98c87e40da55',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            100113,
            'EncryptionKeyID',
            'Encryption Key ID',
            'References the encryption key to use when Encrypt is true. Required if Encrypt is true.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '854DB803-34D4-46CD-8B8D-712974AE592F',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '7c097f3d-79ac-4144-a3b6-a8bff64edf3c'  OR 
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AllowDecryptInAPI')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7c097f3d-79ac-4144-a3b6-a8bff64edf3c',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            100114,
            'AllowDecryptInAPI',
            'Allow Decrypt In API',
            'When true, encrypted fields will be decrypted before returning via API. When false, behavior depends on SendEncryptedValue. Default is false (secure).',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '901ee131-bc99-4b80-b5e5-d974057eea8a'  OR 
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SendEncryptedValue')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '901ee131-bc99-4b80-b5e5-d974057eea8a',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            100115,
            'SendEncryptedValue',
            'Send Encrypted Value',
            'When AllowDecryptInAPI is false: if true, send encrypted ciphertext (e.g., $ENC$...); if false (default), send sentinel value, usually "[!ENCRYPTED$]", indicating a value exists but is protected. Most secure option is false.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '0cf0bc8a-fa19-4727-8d9b-41e6f1d38ace'  OR 
               (EntityID = '854DB803-34D4-46CD-8B8D-712974AE592F' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0cf0bc8a-fa19-4727-8d9b-41e6f1d38ace',
            '854DB803-34D4-46CD-8B8D-712974AE592F', -- Entity: MJ: Encryption Keys
            100001,
            'ID',
            'ID',
            'Unique identifier for the encryption key configuration.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '5a0d5898-5d0b-47a3-891f-c46a301b8d99'  OR 
               (EntityID = '854DB803-34D4-46CD-8B8D-712974AE592F' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5a0d5898-5d0b-47a3-891f-c46a301b8d99',
            '854DB803-34D4-46CD-8B8D-712974AE592F', -- Entity: MJ: Encryption Keys
            100002,
            'Name',
            'Name',
            'Unique name for this key (e.g., PII Master Key, API Secrets Key).',
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '2f4e650a-c989-43d0-aa9d-72af7d51dd3b'  OR 
               (EntityID = '854DB803-34D4-46CD-8B8D-712974AE592F' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2f4e650a-c989-43d0-aa9d-72af7d51dd3b',
            '854DB803-34D4-46CD-8B8D-712974AE592F', -- Entity: MJ: Encryption Keys
            100003,
            'Description',
            'Description',
            'Description of this key purpose and scope.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '36ebe99a-8d62-4f46-a3c2-4e3456d22839'  OR 
               (EntityID = '854DB803-34D4-46CD-8B8D-712974AE592F' AND Name = 'EncryptionKeySourceID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '36ebe99a-8d62-4f46-a3c2-4e3456d22839',
            '854DB803-34D4-46CD-8B8D-712974AE592F', -- Entity: MJ: Encryption Keys
            100004,
            'EncryptionKeySourceID',
            'Encryption Key Source ID',
            'References the key source that provides the key material.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E1A36CEA-8AD9-442A-84D6-23A1B38BC278',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '690761ec-12a8-4209-b8ff-72b7e836b6e5'  OR 
               (EntityID = '854DB803-34D4-46CD-8B8D-712974AE592F' AND Name = 'EncryptionAlgorithmID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '690761ec-12a8-4209-b8ff-72b7e836b6e5',
            '854DB803-34D4-46CD-8B8D-712974AE592F', -- Entity: MJ: Encryption Keys
            100005,
            'EncryptionAlgorithmID',
            'Encryption Algorithm ID',
            'References the algorithm to use for encryption/decryption.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '703330A7-2C34-4BD4-9224-4DE10BB179F3',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '42176708-9656-4c74-9c17-f9f13c3301e7'  OR 
               (EntityID = '854DB803-34D4-46CD-8B8D-712974AE592F' AND Name = 'KeyLookupValue')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '42176708-9656-4c74-9c17-f9f13c3301e7',
            '854DB803-34D4-46CD-8B8D-712974AE592F', -- Entity: MJ: Encryption Keys
            100006,
            'KeyLookupValue',
            'Key Lookup Value',
            'Source-specific lookup value (e.g., environment variable name, vault path).',
            'nvarchar',
            1000,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '54082617-1ff8-4dae-bca2-79a938e0b021'  OR 
               (EntityID = '854DB803-34D4-46CD-8B8D-712974AE592F' AND Name = 'KeyVersion')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '54082617-1ff8-4dae-bca2-79a938e0b021',
            '854DB803-34D4-46CD-8B8D-712974AE592F', -- Entity: MJ: Encryption Keys
            100007,
            'KeyVersion',
            'Key Version',
            'Version string for key rotation tracking. Incremented during rotation.',
            'nvarchar',
            40,
            0,
            0,
            0,
            '1',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = 'b31908a9-9205-43bb-88ca-9eeecf479965'  OR 
               (EntityID = '854DB803-34D4-46CD-8B8D-712974AE592F' AND Name = 'Marker')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b31908a9-9205-43bb-88ca-9eeecf479965',
            '854DB803-34D4-46CD-8B8D-712974AE592F', -- Entity: MJ: Encryption Keys
            100008,
            'Marker',
            'Marker',
            'Prefix marker for encrypted values (default: $ENC$).',
            'nvarchar',
            40,
            0,
            0,
            0,
            '$ENC$',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '5dab009b-dc7f-44d5-9b75-5d825b4872b0'  OR 
               (EntityID = '854DB803-34D4-46CD-8B8D-712974AE592F' AND Name = 'IsActive')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5dab009b-dc7f-44d5-9b75-5d825b4872b0',
            '854DB803-34D4-46CD-8B8D-712974AE592F', -- Entity: MJ: Encryption Keys
            100009,
            'IsActive',
            'Is Active',
            'Whether this key can be used for new encryption operations.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = 'e879c20b-ea2e-4f49-8764-154bf787e8f8'  OR 
               (EntityID = '854DB803-34D4-46CD-8B8D-712974AE592F' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e879c20b-ea2e-4f49-8764-154bf787e8f8',
            '854DB803-34D4-46CD-8B8D-712974AE592F', -- Entity: MJ: Encryption Keys
            100010,
            'Status',
            'Status',
            'Current status: Active, Inactive, Rotating, or Expired.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '7c14073d-3ac2-48d3-9493-2d3a939d129e'  OR 
               (EntityID = '854DB803-34D4-46CD-8B8D-712974AE592F' AND Name = 'ActivatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7c14073d-3ac2-48d3-9493-2d3a939d129e',
            '854DB803-34D4-46CD-8B8D-712974AE592F', -- Entity: MJ: Encryption Keys
            100011,
            'ActivatedAt',
            'Activated At',
            'When the current key version was activated.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = 'e93be72c-b2dd-4d8a-aacd-92aaa649f55e'  OR 
               (EntityID = '854DB803-34D4-46CD-8B8D-712974AE592F' AND Name = 'ExpiresAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e93be72c-b2dd-4d8a-aacd-92aaa649f55e',
            '854DB803-34D4-46CD-8B8D-712974AE592F', -- Entity: MJ: Encryption Keys
            100012,
            'ExpiresAt',
            'Expires At',
            'Optional expiration date. Keys past this date cannot be used for new encryption.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = 'eb4e1905-f577-4576-9c59-2b24a2c99b35'  OR 
               (EntityID = '854DB803-34D4-46CD-8B8D-712974AE592F' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'eb4e1905-f577-4576-9c59-2b24a2c99b35',
            '854DB803-34D4-46CD-8B8D-712974AE592F', -- Entity: MJ: Encryption Keys
            100013,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = 'c5a94b32-d96e-4192-b1ab-1278a18ee424'  OR 
               (EntityID = '854DB803-34D4-46CD-8B8D-712974AE592F' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c5a94b32-d96e-4192-b1ab-1278a18ee424',
            '854DB803-34D4-46CD-8B8D-712974AE592F', -- Entity: MJ: Encryption Keys
            100014,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert entity field value with ID 4ae4f2b6-6503-44a5-acb0-26eb479c0edb */
INSERT INTO [__mj].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4ae4f2b6-6503-44a5-acb0-26eb479c0edb', '07BB0EA0-9FD7-4EC3-AE79-6689358A22BD', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID fcd6c1d9-ca3b-4cb3-a2d1-b25c3f104bc8 */
INSERT INTO [__mj].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('fcd6c1d9-ca3b-4cb3-a2d1-b25c3f104bc8', '07BB0EA0-9FD7-4EC3-AE79-6689358A22BD', 2, 'Deprecated', 'Deprecated')

/* SQL text to insert entity field value with ID 4ec841bc-2f27-42ab-b009-9623fcc31dfd */
INSERT INTO [__mj].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4ec841bc-2f27-42ab-b009-9623fcc31dfd', '07BB0EA0-9FD7-4EC3-AE79-6689358A22BD', 3, 'Inactive', 'Inactive')

/* SQL text to update ValueListType for entity field ID 07BB0EA0-9FD7-4EC3-AE79-6689358A22BD */
UPDATE [__mj].EntityField SET ValueListType='List' WHERE ID='07BB0EA0-9FD7-4EC3-AE79-6689358A22BD'

/* SQL text to insert entity field value with ID e2f96d3f-1280-4f66-81b9-43334b303f5d */
INSERT INTO [__mj].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('e2f96d3f-1280-4f66-81b9-43334b303f5d', 'E879C20B-EA2E-4F49-8764-154BF787E8F8', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID 759d325d-5aca-4910-b12c-fab4d3d698d0 */
INSERT INTO [__mj].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('759d325d-5aca-4910-b12c-fab4d3d698d0', 'E879C20B-EA2E-4F49-8764-154BF787E8F8', 2, 'Expired', 'Expired')

/* SQL text to insert entity field value with ID 92743181-c3e2-40fa-815d-1d4184e0b5d0 */
INSERT INTO [__mj].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('92743181-c3e2-40fa-815d-1d4184e0b5d0', 'E879C20B-EA2E-4F49-8764-154BF787E8F8', 3, 'Inactive', 'Inactive')

/* SQL text to insert entity field value with ID 37988f94-921d-4cde-b671-ce33a5520f58 */
INSERT INTO [__mj].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('37988f94-921d-4cde-b671-ce33a5520f58', 'E879C20B-EA2E-4F49-8764-154BF787E8F8', 4, 'Rotating', 'Rotating')

/* SQL text to update ValueListType for entity field ID E879C20B-EA2E-4F49-8764-154BF787E8F8 */
UPDATE [__mj].EntityField SET ValueListType='List' WHERE ID='E879C20B-EA2E-4F49-8764-154BF787E8F8'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [__mj].EntityRelationship
      WHERE ID = 'aa6ed996-314b-458a-b632-b26803cc6071'
   )
   BEGIN
      INSERT INTO __mj.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('aa6ed996-314b-458a-b632-b26803cc6071', 'E1A36CEA-8AD9-442A-84D6-23A1B38BC278', '854DB803-34D4-46CD-8B8D-712974AE592F', 'EncryptionKeySourceID', 'One To Many', 1, 1, 'MJ: Encryption Keys', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [__mj].EntityRelationship
      WHERE ID = 'cdf8a5f2-b93e-4d46-942c-029adc9bc9e9'
   )
   BEGIN
      INSERT INTO __mj.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('cdf8a5f2-b93e-4d46-942c-029adc9bc9e9', '703330A7-2C34-4BD4-9224-4DE10BB179F3', '854DB803-34D4-46CD-8B8D-712974AE592F', 'EncryptionAlgorithmID', 'One To Many', 1, 1, 'MJ: Encryption Keys', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [__mj].EntityRelationship
      WHERE ID = '8cb3b6ce-6d1c-470d-a3d3-d202f69a8c64'
   )
   BEGIN
      INSERT INTO __mj.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('8cb3b6ce-6d1c-470d-a3d3-d202f69a8c64', '854DB803-34D4-46CD-8B8D-712974AE592F', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'EncryptionKeyID', 'One To Many', 1, 1, 'Entity Fields', 2);
   END
                              

/* Index for Foreign Keys for EntityField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_EntityID' 
    AND object_id = OBJECT_ID('[__mj].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EntityID ON [__mj].[EntityField] ([EntityID]);

-- Index for foreign key RelatedEntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID' 
    AND object_id = OBJECT_ID('[__mj].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID ON [__mj].[EntityField] ([RelatedEntityID]);

-- Index for foreign key EncryptionKeyID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID' 
    AND object_id = OBJECT_ID('[__mj].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID ON [__mj].[EntityField] ([EncryptionKeyID]);

/* Base View Permissions SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: Permissions for vwEntityFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [__mj].[vwEntityFields] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spCreateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spCreateEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spCreateEntityField];
GO

CREATE PROCEDURE [__mj].[spCreateEntityField]
    @ID uniqueidentifier = NULL,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit = NULL,
    @IsPrimaryKey bit = NULL,
    @IsUnique bit = NULL,
    @Category nvarchar(255),
    @ValueListType nvarchar(20) = NULL,
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit = NULL,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit = NULL,
    @AllowUpdateInView bit = NULL,
    @IncludeInUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit = NULL,
    @GeneratedFormSection nvarchar(10) = NULL,
    @IsNameField bit = NULL,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit = NULL,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20) = NULL,
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit = NULL,
    @ValuesToPackWithSchema nvarchar(10) = NULL,
    @Status nvarchar(25) = NULL,
    @AutoUpdateIsNameField bit = NULL,
    @AutoUpdateDefaultInView bit = NULL,
    @AutoUpdateCategory bit = NULL,
    @AutoUpdateDisplayName bit = NULL,
    @AutoUpdateIncludeInUserSearchAPI bit = NULL,
    @Encrypt bit = NULL,
    @EncryptionKeyID uniqueidentifier,
    @AllowDecryptInAPI bit = NULL,
    @SendEncryptedValue bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [__mj].[EntityField]
            (
                [ID],
                [DisplayName],
                [Description],
                [AutoUpdateDescription],
                [IsPrimaryKey],
                [IsUnique],
                [Category],
                [ValueListType],
                [ExtendedType],
                [CodeType],
                [DefaultInView],
                [ViewCellTemplate],
                [DefaultColumnWidth],
                [AllowUpdateAPI],
                [AllowUpdateInView],
                [IncludeInUserSearchAPI],
                [FullTextSearchEnabled],
                [UserSearchParamFormatAPI],
                [IncludeInGeneratedForm],
                [GeneratedFormSection],
                [IsNameField],
                [RelatedEntityID],
                [RelatedEntityFieldName],
                [IncludeRelatedEntityNameFieldInBaseView],
                [RelatedEntityNameFieldMap],
                [RelatedEntityDisplayType],
                [EntityIDFieldName],
                [ScopeDefault],
                [AutoUpdateRelatedEntityInfo],
                [ValuesToPackWithSchema],
                [Status],
                [AutoUpdateIsNameField],
                [AutoUpdateDefaultInView],
                [AutoUpdateCategory],
                [AutoUpdateDisplayName],
                [AutoUpdateIncludeInUserSearchAPI],
                [Encrypt],
                [EncryptionKeyID],
                [AllowDecryptInAPI],
                [SendEncryptedValue]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DisplayName,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUnique, 0),
                @Category,
                ISNULL(@ValueListType, 'None'),
                @ExtendedType,
                @CodeType,
                ISNULL(@DefaultInView, 0),
                @ViewCellTemplate,
                @DefaultColumnWidth,
                ISNULL(@AllowUpdateAPI, 1),
                ISNULL(@AllowUpdateInView, 1),
                ISNULL(@IncludeInUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @UserSearchParamFormatAPI,
                ISNULL(@IncludeInGeneratedForm, 1),
                ISNULL(@GeneratedFormSection, 'Details'),
                ISNULL(@IsNameField, 0),
                @RelatedEntityID,
                @RelatedEntityFieldName,
                ISNULL(@IncludeRelatedEntityNameFieldInBaseView, 1),
                @RelatedEntityNameFieldMap,
                ISNULL(@RelatedEntityDisplayType, 'Search'),
                @EntityIDFieldName,
                @ScopeDefault,
                ISNULL(@AutoUpdateRelatedEntityInfo, 1),
                ISNULL(@ValuesToPackWithSchema, 'Auto'),
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoUpdateIsNameField, 1),
                ISNULL(@AutoUpdateDefaultInView, 1),
                ISNULL(@AutoUpdateCategory, 1),
                ISNULL(@AutoUpdateDisplayName, 1),
                ISNULL(@AutoUpdateIncludeInUserSearchAPI, 1),
                ISNULL(@Encrypt, 0),
                @EncryptionKeyID,
                ISNULL(@AllowDecryptInAPI, 0),
                ISNULL(@SendEncryptedValue, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [__mj].[EntityField]
            (
                [DisplayName],
                [Description],
                [AutoUpdateDescription],
                [IsPrimaryKey],
                [IsUnique],
                [Category],
                [ValueListType],
                [ExtendedType],
                [CodeType],
                [DefaultInView],
                [ViewCellTemplate],
                [DefaultColumnWidth],
                [AllowUpdateAPI],
                [AllowUpdateInView],
                [IncludeInUserSearchAPI],
                [FullTextSearchEnabled],
                [UserSearchParamFormatAPI],
                [IncludeInGeneratedForm],
                [GeneratedFormSection],
                [IsNameField],
                [RelatedEntityID],
                [RelatedEntityFieldName],
                [IncludeRelatedEntityNameFieldInBaseView],
                [RelatedEntityNameFieldMap],
                [RelatedEntityDisplayType],
                [EntityIDFieldName],
                [ScopeDefault],
                [AutoUpdateRelatedEntityInfo],
                [ValuesToPackWithSchema],
                [Status],
                [AutoUpdateIsNameField],
                [AutoUpdateDefaultInView],
                [AutoUpdateCategory],
                [AutoUpdateDisplayName],
                [AutoUpdateIncludeInUserSearchAPI],
                [Encrypt],
                [EncryptionKeyID],
                [AllowDecryptInAPI],
                [SendEncryptedValue]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DisplayName,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUnique, 0),
                @Category,
                ISNULL(@ValueListType, 'None'),
                @ExtendedType,
                @CodeType,
                ISNULL(@DefaultInView, 0),
                @ViewCellTemplate,
                @DefaultColumnWidth,
                ISNULL(@AllowUpdateAPI, 1),
                ISNULL(@AllowUpdateInView, 1),
                ISNULL(@IncludeInUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @UserSearchParamFormatAPI,
                ISNULL(@IncludeInGeneratedForm, 1),
                ISNULL(@GeneratedFormSection, 'Details'),
                ISNULL(@IsNameField, 0),
                @RelatedEntityID,
                @RelatedEntityFieldName,
                ISNULL(@IncludeRelatedEntityNameFieldInBaseView, 1),
                @RelatedEntityNameFieldMap,
                ISNULL(@RelatedEntityDisplayType, 'Search'),
                @EntityIDFieldName,
                @ScopeDefault,
                ISNULL(@AutoUpdateRelatedEntityInfo, 1),
                ISNULL(@ValuesToPackWithSchema, 'Auto'),
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoUpdateIsNameField, 1),
                ISNULL(@AutoUpdateDefaultInView, 1),
                ISNULL(@AutoUpdateCategory, 1),
                ISNULL(@AutoUpdateDisplayName, 1),
                ISNULL(@AutoUpdateIncludeInUserSearchAPI, 1),
                ISNULL(@Encrypt, 0),
                @EncryptionKeyID,
                ISNULL(@AllowDecryptInAPI, 0),
                ISNULL(@SendEncryptedValue, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEntityFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Entity Fields */

GRANT EXECUTE ON [__mj].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spUpdateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spUpdateEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spUpdateEntityField];
GO

CREATE PROCEDURE [__mj].[spUpdateEntityField]
    @ID uniqueidentifier,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @IsPrimaryKey bit,
    @IsUnique bit,
    @Category nvarchar(255),
    @ValueListType nvarchar(20),
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit,
    @AllowUpdateInView bit,
    @IncludeInUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit,
    @GeneratedFormSection nvarchar(10),
    @IsNameField bit,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20),
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit,
    @ValuesToPackWithSchema nvarchar(10),
    @Status nvarchar(25),
    @AutoUpdateIsNameField bit,
    @AutoUpdateDefaultInView bit,
    @AutoUpdateCategory bit,
    @AutoUpdateDisplayName bit,
    @AutoUpdateIncludeInUserSearchAPI bit,
    @Encrypt bit,
    @EncryptionKeyID uniqueidentifier,
    @AllowDecryptInAPI bit,
    @SendEncryptedValue bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[EntityField]
    SET
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [IsPrimaryKey] = @IsPrimaryKey,
        [IsUnique] = @IsUnique,
        [Category] = @Category,
        [ValueListType] = @ValueListType,
        [ExtendedType] = @ExtendedType,
        [CodeType] = @CodeType,
        [DefaultInView] = @DefaultInView,
        [ViewCellTemplate] = @ViewCellTemplate,
        [DefaultColumnWidth] = @DefaultColumnWidth,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowUpdateInView] = @AllowUpdateInView,
        [IncludeInUserSearchAPI] = @IncludeInUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [UserSearchParamFormatAPI] = @UserSearchParamFormatAPI,
        [IncludeInGeneratedForm] = @IncludeInGeneratedForm,
        [GeneratedFormSection] = @GeneratedFormSection,
        [IsNameField] = @IsNameField,
        [RelatedEntityID] = @RelatedEntityID,
        [RelatedEntityFieldName] = @RelatedEntityFieldName,
        [IncludeRelatedEntityNameFieldInBaseView] = @IncludeRelatedEntityNameFieldInBaseView,
        [RelatedEntityNameFieldMap] = @RelatedEntityNameFieldMap,
        [RelatedEntityDisplayType] = @RelatedEntityDisplayType,
        [EntityIDFieldName] = @EntityIDFieldName,
        [ScopeDefault] = @ScopeDefault,
        [AutoUpdateRelatedEntityInfo] = @AutoUpdateRelatedEntityInfo,
        [ValuesToPackWithSchema] = @ValuesToPackWithSchema,
        [Status] = @Status,
        [AutoUpdateIsNameField] = @AutoUpdateIsNameField,
        [AutoUpdateDefaultInView] = @AutoUpdateDefaultInView,
        [AutoUpdateCategory] = @AutoUpdateCategory,
        [AutoUpdateDisplayName] = @AutoUpdateDisplayName,
        [AutoUpdateIncludeInUserSearchAPI] = @AutoUpdateIncludeInUserSearchAPI,
        [Encrypt] = @Encrypt,
        [EncryptionKeyID] = @EncryptionKeyID,
        [AllowDecryptInAPI] = @AllowDecryptInAPI,
        [SendEncryptedValue] = @SendEncryptedValue
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [__mj].[vwEntityFields] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [__mj].[vwEntityFields]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityField table
------------------------------------------------------------
IF OBJECT_ID('[__mj].[trgUpdateEntityField]', 'TR') IS NOT NULL
    DROP TRIGGER [__mj].[trgUpdateEntityField];
GO
CREATE TRIGGER [__mj].trgUpdateEntityField
ON [__mj].[EntityField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[EntityField]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [__mj].[EntityField] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Fields */

GRANT EXECUTE ON [__mj].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spDeleteEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spDeleteEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spDeleteEntityField];
GO

CREATE PROCEDURE [__mj].[spDeleteEntityField]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [__mj].[EntityField]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Entity Fields */

GRANT EXECUTE ON [__mj].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for EncryptionAlgorithm */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Algorithms
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for EncryptionKeySource */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Key Sources
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for EncryptionKey */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Keys
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EncryptionKeySourceID in table EncryptionKey
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EncryptionKey_EncryptionKeySourceID' 
    AND object_id = OBJECT_ID('[__mj].[EncryptionKey]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EncryptionKey_EncryptionKeySourceID ON [__mj].[EncryptionKey] ([EncryptionKeySourceID]);

-- Index for foreign key EncryptionAlgorithmID in table EncryptionKey
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EncryptionKey_EncryptionAlgorithmID' 
    AND object_id = OBJECT_ID('[__mj].[EncryptionKey]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EncryptionKey_EncryptionAlgorithmID ON [__mj].[EncryptionKey] ([EncryptionAlgorithmID]);

/* SQL text to update entity field related entity name field map for entity field ID 36EBE99A-8D62-4F46-A3C2-4E3456D22839 */
EXEC [__mj].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='36EBE99A-8D62-4F46-A3C2-4E3456D22839',
         @RelatedEntityNameFieldMap='EncryptionKeySource'

/* Base View SQL for MJ: Encryption Algorithms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Algorithms
-- Item: vwEncryptionAlgorithms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Encryption Algorithms
-----               SCHEMA:      __mj
-----               BASE TABLE:  EncryptionAlgorithm
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[__mj].[vwEncryptionAlgorithms]', 'V') IS NOT NULL
    DROP VIEW [__mj].[vwEncryptionAlgorithms];
GO

CREATE VIEW [__mj].[vwEncryptionAlgorithms]
AS
SELECT
    e.*
FROM
    [__mj].[EncryptionAlgorithm] AS e
GO
GRANT SELECT ON [__mj].[vwEncryptionAlgorithms] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Encryption Algorithms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Algorithms
-- Item: Permissions for vwEncryptionAlgorithms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [__mj].[vwEncryptionAlgorithms] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Encryption Algorithms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Algorithms
-- Item: spCreateEncryptionAlgorithm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EncryptionAlgorithm
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spCreateEncryptionAlgorithm]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spCreateEncryptionAlgorithm];
GO

CREATE PROCEDURE [__mj].[spCreateEncryptionAlgorithm]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @NodeCryptoName nvarchar(50),
    @KeyLengthBits int,
    @IVLengthBytes int,
    @IsAEAD bit = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [__mj].[EncryptionAlgorithm]
            (
                [ID],
                [Name],
                [Description],
                [NodeCryptoName],
                [KeyLengthBits],
                [IVLengthBytes],
                [IsAEAD],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @NodeCryptoName,
                @KeyLengthBits,
                @IVLengthBytes,
                ISNULL(@IsAEAD, 0),
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [__mj].[EncryptionAlgorithm]
            (
                [Name],
                [Description],
                [NodeCryptoName],
                [KeyLengthBits],
                [IVLengthBytes],
                [IsAEAD],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @NodeCryptoName,
                @KeyLengthBits,
                @IVLengthBytes,
                ISNULL(@IsAEAD, 0),
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEncryptionAlgorithms] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateEncryptionAlgorithm] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Encryption Algorithms */

GRANT EXECUTE ON [__mj].[spCreateEncryptionAlgorithm] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Encryption Algorithms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Algorithms
-- Item: spUpdateEncryptionAlgorithm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EncryptionAlgorithm
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spUpdateEncryptionAlgorithm]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spUpdateEncryptionAlgorithm];
GO

CREATE PROCEDURE [__mj].[spUpdateEncryptionAlgorithm]
    @ID uniqueidentifier,
    @Name nvarchar(50),
    @Description nvarchar(MAX),
    @NodeCryptoName nvarchar(50),
    @KeyLengthBits int,
    @IVLengthBytes int,
    @IsAEAD bit,
    @IsActive bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[EncryptionAlgorithm]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [NodeCryptoName] = @NodeCryptoName,
        [KeyLengthBits] = @KeyLengthBits,
        [IVLengthBytes] = @IVLengthBytes,
        [IsAEAD] = @IsAEAD,
        [IsActive] = @IsActive
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [__mj].[vwEncryptionAlgorithms] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [__mj].[vwEncryptionAlgorithms]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateEncryptionAlgorithm] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EncryptionAlgorithm table
------------------------------------------------------------
IF OBJECT_ID('[__mj].[trgUpdateEncryptionAlgorithm]', 'TR') IS NOT NULL
    DROP TRIGGER [__mj].[trgUpdateEncryptionAlgorithm];
GO
CREATE TRIGGER [__mj].trgUpdateEncryptionAlgorithm
ON [__mj].[EncryptionAlgorithm]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[EncryptionAlgorithm]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [__mj].[EncryptionAlgorithm] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Encryption Algorithms */

GRANT EXECUTE ON [__mj].[spUpdateEncryptionAlgorithm] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Encryption Algorithms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Algorithms
-- Item: spDeleteEncryptionAlgorithm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EncryptionAlgorithm
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spDeleteEncryptionAlgorithm]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spDeleteEncryptionAlgorithm];
GO

CREATE PROCEDURE [__mj].[spDeleteEncryptionAlgorithm]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [__mj].[EncryptionAlgorithm]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteEncryptionAlgorithm] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Encryption Algorithms */

GRANT EXECUTE ON [__mj].[spDeleteEncryptionAlgorithm] TO [cdp_Integration]



/* Base View SQL for MJ: Encryption Key Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Key Sources
-- Item: vwEncryptionKeySources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Encryption Key Sources
-----               SCHEMA:      __mj
-----               BASE TABLE:  EncryptionKeySource
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[__mj].[vwEncryptionKeySources]', 'V') IS NOT NULL
    DROP VIEW [__mj].[vwEncryptionKeySources];
GO

CREATE VIEW [__mj].[vwEncryptionKeySources]
AS
SELECT
    e.*
FROM
    [__mj].[EncryptionKeySource] AS e
GO
GRANT SELECT ON [__mj].[vwEncryptionKeySources] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Encryption Key Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Key Sources
-- Item: Permissions for vwEncryptionKeySources
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [__mj].[vwEncryptionKeySources] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Encryption Key Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Key Sources
-- Item: spCreateEncryptionKeySource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EncryptionKeySource
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spCreateEncryptionKeySource]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spCreateEncryptionKeySource];
GO

CREATE PROCEDURE [__mj].[spCreateEncryptionKeySource]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @DriverClass nvarchar(255),
    @DriverImportPath nvarchar(500),
    @ConfigTemplate nvarchar(MAX),
    @IsActive bit = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [__mj].[EncryptionKeySource]
            (
                [ID],
                [Name],
                [Description],
                [DriverClass],
                [DriverImportPath],
                [ConfigTemplate],
                [IsActive],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @DriverClass,
                @DriverImportPath,
                @ConfigTemplate,
                ISNULL(@IsActive, 1),
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [__mj].[EncryptionKeySource]
            (
                [Name],
                [Description],
                [DriverClass],
                [DriverImportPath],
                [ConfigTemplate],
                [IsActive],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @DriverClass,
                @DriverImportPath,
                @ConfigTemplate,
                ISNULL(@IsActive, 1),
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEncryptionKeySources] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateEncryptionKeySource] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Encryption Key Sources */

GRANT EXECUTE ON [__mj].[spCreateEncryptionKeySource] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Encryption Key Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Key Sources
-- Item: spUpdateEncryptionKeySource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EncryptionKeySource
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spUpdateEncryptionKeySource]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spUpdateEncryptionKeySource];
GO

CREATE PROCEDURE [__mj].[spUpdateEncryptionKeySource]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @DriverClass nvarchar(255),
    @DriverImportPath nvarchar(500),
    @ConfigTemplate nvarchar(MAX),
    @IsActive bit,
    @Status nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[EncryptionKeySource]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [DriverClass] = @DriverClass,
        [DriverImportPath] = @DriverImportPath,
        [ConfigTemplate] = @ConfigTemplate,
        [IsActive] = @IsActive,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [__mj].[vwEncryptionKeySources] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [__mj].[vwEncryptionKeySources]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateEncryptionKeySource] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EncryptionKeySource table
------------------------------------------------------------
IF OBJECT_ID('[__mj].[trgUpdateEncryptionKeySource]', 'TR') IS NOT NULL
    DROP TRIGGER [__mj].[trgUpdateEncryptionKeySource];
GO
CREATE TRIGGER [__mj].trgUpdateEncryptionKeySource
ON [__mj].[EncryptionKeySource]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[EncryptionKeySource]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [__mj].[EncryptionKeySource] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Encryption Key Sources */

GRANT EXECUTE ON [__mj].[spUpdateEncryptionKeySource] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Encryption Key Sources */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Key Sources
-- Item: spDeleteEncryptionKeySource
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EncryptionKeySource
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spDeleteEncryptionKeySource]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spDeleteEncryptionKeySource];
GO

CREATE PROCEDURE [__mj].[spDeleteEncryptionKeySource]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [__mj].[EncryptionKeySource]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteEncryptionKeySource] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Encryption Key Sources */

GRANT EXECUTE ON [__mj].[spDeleteEncryptionKeySource] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 690761EC-12A8-4209-B8FF-72B7E836B6E5 */
EXEC [__mj].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='690761EC-12A8-4209-B8FF-72B7E836B6E5',
         @RelatedEntityNameFieldMap='EncryptionAlgorithm'

/* Base View SQL for MJ: Encryption Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Keys
-- Item: vwEncryptionKeys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Encryption Keys
-----               SCHEMA:      __mj
-----               BASE TABLE:  EncryptionKey
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[__mj].[vwEncryptionKeys]', 'V') IS NOT NULL
    DROP VIEW [__mj].[vwEncryptionKeys];
GO

CREATE VIEW [__mj].[vwEncryptionKeys]
AS
SELECT
    e.*,
    EncryptionKeySource_EncryptionKeySourceID.[Name] AS [EncryptionKeySource],
    EncryptionAlgorithm_EncryptionAlgorithmID.[Name] AS [EncryptionAlgorithm]
FROM
    [__mj].[EncryptionKey] AS e
INNER JOIN
    [__mj].[EncryptionKeySource] AS EncryptionKeySource_EncryptionKeySourceID
  ON
    [e].[EncryptionKeySourceID] = EncryptionKeySource_EncryptionKeySourceID.[ID]
INNER JOIN
    [__mj].[EncryptionAlgorithm] AS EncryptionAlgorithm_EncryptionAlgorithmID
  ON
    [e].[EncryptionAlgorithmID] = EncryptionAlgorithm_EncryptionAlgorithmID.[ID]
GO
GRANT SELECT ON [__mj].[vwEncryptionKeys] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Encryption Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Keys
-- Item: Permissions for vwEncryptionKeys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [__mj].[vwEncryptionKeys] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Encryption Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Keys
-- Item: spCreateEncryptionKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EncryptionKey
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spCreateEncryptionKey]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spCreateEncryptionKey];
GO

CREATE PROCEDURE [__mj].[spCreateEncryptionKey]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @EncryptionKeySourceID uniqueidentifier,
    @EncryptionAlgorithmID uniqueidentifier,
    @KeyLookupValue nvarchar(500),
    @KeyVersion nvarchar(20) = NULL,
    @Marker nvarchar(20) = NULL,
    @IsActive bit = NULL,
    @Status nvarchar(20) = NULL,
    @ActivatedAt datetimeoffset,
    @ExpiresAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [__mj].[EncryptionKey]
            (
                [ID],
                [Name],
                [Description],
                [EncryptionKeySourceID],
                [EncryptionAlgorithmID],
                [KeyLookupValue],
                [KeyVersion],
                [Marker],
                [IsActive],
                [Status],
                [ActivatedAt],
                [ExpiresAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @EncryptionKeySourceID,
                @EncryptionAlgorithmID,
                @KeyLookupValue,
                ISNULL(@KeyVersion, '1'),
                ISNULL(@Marker, '$ENC$'),
                ISNULL(@IsActive, 1),
                ISNULL(@Status, 'Active'),
                @ActivatedAt,
                @ExpiresAt
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [__mj].[EncryptionKey]
            (
                [Name],
                [Description],
                [EncryptionKeySourceID],
                [EncryptionAlgorithmID],
                [KeyLookupValue],
                [KeyVersion],
                [Marker],
                [IsActive],
                [Status],
                [ActivatedAt],
                [ExpiresAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @EncryptionKeySourceID,
                @EncryptionAlgorithmID,
                @KeyLookupValue,
                ISNULL(@KeyVersion, '1'),
                ISNULL(@Marker, '$ENC$'),
                ISNULL(@IsActive, 1),
                ISNULL(@Status, 'Active'),
                @ActivatedAt,
                @ExpiresAt
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [__mj].[vwEncryptionKeys] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [__mj].[spCreateEncryptionKey] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Encryption Keys */

GRANT EXECUTE ON [__mj].[spCreateEncryptionKey] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Encryption Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Keys
-- Item: spUpdateEncryptionKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EncryptionKey
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spUpdateEncryptionKey]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spUpdateEncryptionKey];
GO

CREATE PROCEDURE [__mj].[spUpdateEncryptionKey]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @EncryptionKeySourceID uniqueidentifier,
    @EncryptionAlgorithmID uniqueidentifier,
    @KeyLookupValue nvarchar(500),
    @KeyVersion nvarchar(20),
    @Marker nvarchar(20),
    @IsActive bit,
    @Status nvarchar(20),
    @ActivatedAt datetimeoffset,
    @ExpiresAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[EncryptionKey]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [EncryptionKeySourceID] = @EncryptionKeySourceID,
        [EncryptionAlgorithmID] = @EncryptionAlgorithmID,
        [KeyLookupValue] = @KeyLookupValue,
        [KeyVersion] = @KeyVersion,
        [Marker] = @Marker,
        [IsActive] = @IsActive,
        [Status] = @Status,
        [ActivatedAt] = @ActivatedAt,
        [ExpiresAt] = @ExpiresAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [__mj].[vwEncryptionKeys] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [__mj].[vwEncryptionKeys]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [__mj].[spUpdateEncryptionKey] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EncryptionKey table
------------------------------------------------------------
IF OBJECT_ID('[__mj].[trgUpdateEncryptionKey]', 'TR') IS NOT NULL
    DROP TRIGGER [__mj].[trgUpdateEncryptionKey];
GO
CREATE TRIGGER [__mj].trgUpdateEncryptionKey
ON [__mj].[EncryptionKey]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [__mj].[EncryptionKey]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [__mj].[EncryptionKey] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Encryption Keys */

GRANT EXECUTE ON [__mj].[spUpdateEncryptionKey] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Encryption Keys */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Encryption Keys
-- Item: spDeleteEncryptionKey
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EncryptionKey
------------------------------------------------------------
IF OBJECT_ID('[__mj].[spDeleteEncryptionKey]', 'P') IS NOT NULL
    DROP PROCEDURE [__mj].[spDeleteEncryptionKey];
GO

CREATE PROCEDURE [__mj].[spDeleteEncryptionKey]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [__mj].[EncryptionKey]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [__mj].[spDeleteEncryptionKey] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Encryption Keys */

GRANT EXECUTE ON [__mj].[spDeleteEncryptionKey] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = '5031f7b3-5eb2-4cfa-bfa8-f02cac15a273'  OR 
               (EntityID = '854DB803-34D4-46CD-8B8D-712974AE592F' AND Name = 'EncryptionKeySource')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5031f7b3-5eb2-4cfa-bfa8-f02cac15a273',
            '854DB803-34D4-46CD-8B8D-712974AE592F', -- Entity: MJ: Encryption Keys
            100029,
            'EncryptionKeySource',
            'Encryption Key Source',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [__mj].EntityField 
         WHERE ID = 'f0a3d338-4f89-4f7c-a413-8374590d707e'  OR 
               (EntityID = '854DB803-34D4-46CD-8B8D-712974AE592F' AND Name = 'EncryptionAlgorithm')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [__mj].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f0a3d338-4f89-4f7c-a413-8374590d707e',
            '854DB803-34D4-46CD-8B8D-712974AE592F', -- Entity: MJ: Encryption Keys
            100030,
            'EncryptionAlgorithm',
            'Encryption Algorithm',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

























-- SECOND CODE GEN RUN
/* Index for Foreign Keys for EntityField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EntityID ON [${flyway:defaultSchema}].[EntityField] ([EntityID]);

-- Index for foreign key RelatedEntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID ON [${flyway:defaultSchema}].[EntityField] ([RelatedEntityID]);

-- Index for foreign key EncryptionKeyID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID ON [${flyway:defaultSchema}].[EntityField] ([EncryptionKeyID]);

/* Base View Permissions SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: Permissions for vwEntityFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFields] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spCreateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityField]
    @ID uniqueidentifier = NULL,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit = NULL,
    @IsPrimaryKey bit = NULL,
    @IsUnique bit = NULL,
    @Category nvarchar(255),
    @ValueListType nvarchar(20) = NULL,
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit = NULL,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit = NULL,
    @AllowUpdateInView bit = NULL,
    @IncludeInUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit = NULL,
    @GeneratedFormSection nvarchar(10) = NULL,
    @IsNameField bit = NULL,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit = NULL,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20) = NULL,
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit = NULL,
    @ValuesToPackWithSchema nvarchar(10) = NULL,
    @Status nvarchar(25) = NULL,
    @AutoUpdateIsNameField bit = NULL,
    @AutoUpdateDefaultInView bit = NULL,
    @AutoUpdateCategory bit = NULL,
    @AutoUpdateDisplayName bit = NULL,
    @AutoUpdateIncludeInUserSearchAPI bit = NULL,
    @Encrypt bit = NULL,
    @EncryptionKeyID uniqueidentifier,
    @AllowDecryptInAPI bit = NULL,
    @SendEncryptedValue bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityField]
            (
                [ID],
                [DisplayName],
                [Description],
                [AutoUpdateDescription],
                [IsPrimaryKey],
                [IsUnique],
                [Category],
                [ValueListType],
                [ExtendedType],
                [CodeType],
                [DefaultInView],
                [ViewCellTemplate],
                [DefaultColumnWidth],
                [AllowUpdateAPI],
                [AllowUpdateInView],
                [IncludeInUserSearchAPI],
                [FullTextSearchEnabled],
                [UserSearchParamFormatAPI],
                [IncludeInGeneratedForm],
                [GeneratedFormSection],
                [IsNameField],
                [RelatedEntityID],
                [RelatedEntityFieldName],
                [IncludeRelatedEntityNameFieldInBaseView],
                [RelatedEntityNameFieldMap],
                [RelatedEntityDisplayType],
                [EntityIDFieldName],
                [ScopeDefault],
                [AutoUpdateRelatedEntityInfo],
                [ValuesToPackWithSchema],
                [Status],
                [AutoUpdateIsNameField],
                [AutoUpdateDefaultInView],
                [AutoUpdateCategory],
                [AutoUpdateDisplayName],
                [AutoUpdateIncludeInUserSearchAPI],
                [Encrypt],
                [EncryptionKeyID],
                [AllowDecryptInAPI],
                [SendEncryptedValue]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DisplayName,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUnique, 0),
                @Category,
                ISNULL(@ValueListType, 'None'),
                @ExtendedType,
                @CodeType,
                ISNULL(@DefaultInView, 0),
                @ViewCellTemplate,
                @DefaultColumnWidth,
                ISNULL(@AllowUpdateAPI, 1),
                ISNULL(@AllowUpdateInView, 1),
                ISNULL(@IncludeInUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @UserSearchParamFormatAPI,
                ISNULL(@IncludeInGeneratedForm, 1),
                ISNULL(@GeneratedFormSection, 'Details'),
                ISNULL(@IsNameField, 0),
                @RelatedEntityID,
                @RelatedEntityFieldName,
                ISNULL(@IncludeRelatedEntityNameFieldInBaseView, 1),
                @RelatedEntityNameFieldMap,
                ISNULL(@RelatedEntityDisplayType, 'Search'),
                @EntityIDFieldName,
                @ScopeDefault,
                ISNULL(@AutoUpdateRelatedEntityInfo, 1),
                ISNULL(@ValuesToPackWithSchema, 'Auto'),
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoUpdateIsNameField, 1),
                ISNULL(@AutoUpdateDefaultInView, 1),
                ISNULL(@AutoUpdateCategory, 1),
                ISNULL(@AutoUpdateDisplayName, 1),
                ISNULL(@AutoUpdateIncludeInUserSearchAPI, 1),
                ISNULL(@Encrypt, 0),
                @EncryptionKeyID,
                ISNULL(@AllowDecryptInAPI, 0),
                ISNULL(@SendEncryptedValue, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityField]
            (
                [DisplayName],
                [Description],
                [AutoUpdateDescription],
                [IsPrimaryKey],
                [IsUnique],
                [Category],
                [ValueListType],
                [ExtendedType],
                [CodeType],
                [DefaultInView],
                [ViewCellTemplate],
                [DefaultColumnWidth],
                [AllowUpdateAPI],
                [AllowUpdateInView],
                [IncludeInUserSearchAPI],
                [FullTextSearchEnabled],
                [UserSearchParamFormatAPI],
                [IncludeInGeneratedForm],
                [GeneratedFormSection],
                [IsNameField],
                [RelatedEntityID],
                [RelatedEntityFieldName],
                [IncludeRelatedEntityNameFieldInBaseView],
                [RelatedEntityNameFieldMap],
                [RelatedEntityDisplayType],
                [EntityIDFieldName],
                [ScopeDefault],
                [AutoUpdateRelatedEntityInfo],
                [ValuesToPackWithSchema],
                [Status],
                [AutoUpdateIsNameField],
                [AutoUpdateDefaultInView],
                [AutoUpdateCategory],
                [AutoUpdateDisplayName],
                [AutoUpdateIncludeInUserSearchAPI],
                [Encrypt],
                [EncryptionKeyID],
                [AllowDecryptInAPI],
                [SendEncryptedValue]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DisplayName,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUnique, 0),
                @Category,
                ISNULL(@ValueListType, 'None'),
                @ExtendedType,
                @CodeType,
                ISNULL(@DefaultInView, 0),
                @ViewCellTemplate,
                @DefaultColumnWidth,
                ISNULL(@AllowUpdateAPI, 1),
                ISNULL(@AllowUpdateInView, 1),
                ISNULL(@IncludeInUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @UserSearchParamFormatAPI,
                ISNULL(@IncludeInGeneratedForm, 1),
                ISNULL(@GeneratedFormSection, 'Details'),
                ISNULL(@IsNameField, 0),
                @RelatedEntityID,
                @RelatedEntityFieldName,
                ISNULL(@IncludeRelatedEntityNameFieldInBaseView, 1),
                @RelatedEntityNameFieldMap,
                ISNULL(@RelatedEntityDisplayType, 'Search'),
                @EntityIDFieldName,
                @ScopeDefault,
                ISNULL(@AutoUpdateRelatedEntityInfo, 1),
                ISNULL(@ValuesToPackWithSchema, 'Auto'),
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoUpdateIsNameField, 1),
                ISNULL(@AutoUpdateDefaultInView, 1),
                ISNULL(@AutoUpdateCategory, 1),
                ISNULL(@AutoUpdateDisplayName, 1),
                ISNULL(@AutoUpdateIncludeInUserSearchAPI, 1),
                ISNULL(@Encrypt, 0),
                @EncryptionKeyID,
                ISNULL(@AllowDecryptInAPI, 0),
                ISNULL(@SendEncryptedValue, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spUpdateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityField]
    @ID uniqueidentifier,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @IsPrimaryKey bit,
    @IsUnique bit,
    @Category nvarchar(255),
    @ValueListType nvarchar(20),
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit,
    @AllowUpdateInView bit,
    @IncludeInUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit,
    @GeneratedFormSection nvarchar(10),
    @IsNameField bit,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20),
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit,
    @ValuesToPackWithSchema nvarchar(10),
    @Status nvarchar(25),
    @AutoUpdateIsNameField bit,
    @AutoUpdateDefaultInView bit,
    @AutoUpdateCategory bit,
    @AutoUpdateDisplayName bit,
    @AutoUpdateIncludeInUserSearchAPI bit,
    @Encrypt bit,
    @EncryptionKeyID uniqueidentifier,
    @AllowDecryptInAPI bit,
    @SendEncryptedValue bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityField]
    SET
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [IsPrimaryKey] = @IsPrimaryKey,
        [IsUnique] = @IsUnique,
        [Category] = @Category,
        [ValueListType] = @ValueListType,
        [ExtendedType] = @ExtendedType,
        [CodeType] = @CodeType,
        [DefaultInView] = @DefaultInView,
        [ViewCellTemplate] = @ViewCellTemplate,
        [DefaultColumnWidth] = @DefaultColumnWidth,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowUpdateInView] = @AllowUpdateInView,
        [IncludeInUserSearchAPI] = @IncludeInUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [UserSearchParamFormatAPI] = @UserSearchParamFormatAPI,
        [IncludeInGeneratedForm] = @IncludeInGeneratedForm,
        [GeneratedFormSection] = @GeneratedFormSection,
        [IsNameField] = @IsNameField,
        [RelatedEntityID] = @RelatedEntityID,
        [RelatedEntityFieldName] = @RelatedEntityFieldName,
        [IncludeRelatedEntityNameFieldInBaseView] = @IncludeRelatedEntityNameFieldInBaseView,
        [RelatedEntityNameFieldMap] = @RelatedEntityNameFieldMap,
        [RelatedEntityDisplayType] = @RelatedEntityDisplayType,
        [EntityIDFieldName] = @EntityIDFieldName,
        [ScopeDefault] = @ScopeDefault,
        [AutoUpdateRelatedEntityInfo] = @AutoUpdateRelatedEntityInfo,
        [ValuesToPackWithSchema] = @ValuesToPackWithSchema,
        [Status] = @Status,
        [AutoUpdateIsNameField] = @AutoUpdateIsNameField,
        [AutoUpdateDefaultInView] = @AutoUpdateDefaultInView,
        [AutoUpdateCategory] = @AutoUpdateCategory,
        [AutoUpdateDisplayName] = @AutoUpdateDisplayName,
        [AutoUpdateIncludeInUserSearchAPI] = @AutoUpdateIncludeInUserSearchAPI,
        [Encrypt] = @Encrypt,
        [EncryptionKeyID] = @EncryptionKeyID,
        [AllowDecryptInAPI] = @AllowDecryptInAPI,
        [SendEncryptedValue] = @SendEncryptedValue
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityFields] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityFields]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityField table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityField]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityField];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityField
ON [${flyway:defaultSchema}].[EntityField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityField]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityField] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spDeleteEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityField]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityField]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]



/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'FC5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FC5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FD5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '754317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5E4E17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F24217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FF5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FC5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FD5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FE5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F24217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C64D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '055817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 66 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '414D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FA5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FC5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Primary Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '754317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Unique',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5E4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Increment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '045817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Virtual',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '075817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Field Code Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '07AD23D5-DEBD-4657-8E3C-7F1F1342BCE3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Sequence',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FB5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Display Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FE5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '044417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F24217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default In View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '065817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'View Cell Template',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F34217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Column Width',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Allow Update In View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F44217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Include In Generated Form',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F54217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Generated Form Section',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F64217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Display Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F05717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scope Default',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0C2449FB-1BDA-4BE9-A059-7224C05A14B9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Display Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8486168A-5082-48DC-BE13-EF53F49922CB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FF5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Length',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '005817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Precision',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '015817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scale',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '025817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Allows Null',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '035817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Value',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D74217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Value List Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C64D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Extended Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '055817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Code Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B04C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Allow Update API',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '404F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Include In User Search API',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '424F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Full Text Search Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5E4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Search Param Format API',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '434F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Name Field',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B64217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Include In User Search API',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9E1D732F-E33E-40FE-AFAD-477623AC9DEA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '954D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Field Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B74217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Include Related Entity Name Field In Base View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '974D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Name Field Map',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F74217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity ID Field Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '35A18EA5-5641-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Related Entity Info',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FFC3C691-2E33-46D0-B11C-AB348997E08C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B84217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Schema Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9B4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Base Table',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Base View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9D4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Code Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9E4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Class Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9F4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CE5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CF5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Values To Pack With Schema',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '20818E34-47E7-4371-A51E-3D29BCC4B4B8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '407A96C8-580A-4427-BEED-ABB46F015586'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Is Name Field',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5EFD956B-0DB1-491B-9153-0891A7B1835D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Default In View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E9707755-1A43-4DE3-815D-37E41CA7C7D0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D64DD327-8057-4DF5-A24C-F951932C1A26'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '584D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Schema Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BA4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Base Table',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '594D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Base View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5A4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Code Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A04D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Class Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B94217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Security & Encryption',
       GeneratedFormSection = 'Category',
       DisplayName = 'Encrypt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '04C52058-4E01-4316-ABAE-9958AFB71B5C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Security & Encryption',
       GeneratedFormSection = 'Category',
       DisplayName = 'Encryption Key ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B24D31A6-A3BE-449C-9FE7-98C87E40DA55'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Security & Encryption',
       GeneratedFormSection = 'Category',
       DisplayName = 'Allow Decrypt In API',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7C097F3D-79AC-4144-A3B6-A8BFF64EDF3C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Security & Encryption',
       GeneratedFormSection = 'Category',
       DisplayName = 'Send Encrypted Value',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '901EE131-BC99-4B80-B5E5-D974057EEA8A'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Security & Encryption":{"icon":"fa fa-lock","description":"Settings that control encryption, key management, and decryption behavior for sensitive fields"},"Identification & Keys":{"icon":"fa fa-key","description":""},"User Interface & Display Settings":{"icon":"fa fa-palette","description":""},"Data Constraints & Validation":{"icon":"fa fa-gavel","description":""},"Relationships & Linking":{"icon":"fa fa-link","description":""},"System & Audit Metadata":{"icon":"fa fa-cog","description":""}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Security & Encryption":"fa fa-lock","Identification & Keys":"fa fa-key","User Interface & Display Settings":"fa fa-palette","Data Constraints & Validation":"fa fa-gavel","Relationships & Linking":"fa fa-link","System & Audit Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

