
-- ===================== DDL: Tables, PKs, Indexes =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '__mj'
        AND table_name = 'Query'
        AND column_name = 'PlatformVariants'
    ) THEN
        ALTER TABLE __mj."Query"
        ADD "PlatformVariants" TEXT NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '__mj'
        AND table_name = 'UserView'
        AND column_name = 'PlatformVariants'
    ) THEN
        ALTER TABLE __mj."UserView"
        ADD "PlatformVariants" TEXT NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = '__mj'
        AND table_name = 'RowLevelSecurityFilter'
        AND column_name = 'PlatformVariants'
    ) THEN
        ALTER TABLE __mj."RowLevelSecurityFilter"
        ADD "PlatformVariants" TEXT NULL;
    END IF;
END $$;


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================


-- ===================== Stored Procedures (sp*) =====================


-- ===================== Triggers =====================


-- ===================== Data (INSERT/UPDATE/DELETE) =====================


-- ===================== FK & CHECK Constraints =====================


-- ===================== Grants =====================


-- ===================== Comments =====================
