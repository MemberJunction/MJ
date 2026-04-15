
-- ===================== Grants =====================

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spCreateDataset" TO "cdp_Developer";

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spUpdateDataset" TO "cdp_Developer";

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spDeleteDataset" TO "cdp_Developer";

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spCreateDatasetItem" TO "cdp_Developer";

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spUpdateDatasetItem" TO "cdp_Developer";

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spDeleteDatasetItem" TO "cdp_Developer";

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spCreateDataset" TO "cdp_Integration";

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spUpdateDataset" TO "cdp_Integration";

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spCreateDatasetItem" TO "cdp_Integration";

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spUpdateDatasetItem" TO "cdp_Integration";


-- ===================== Other =====================

-- Grant EXECUTE permissions on Dataset and DatasetItem stored procedures.
-- Based on EntityPermission settings in V202603221400:
--   cdp_Developer: CanCreate, CanUpdate, CanDelete
--   cdp_Integration: CanCreate, CanUpdate only
