-- Grant EXECUTE permissions on Dataset and DatasetItem stored procedures.
-- Based on EntityPermission settings in V202603221400:
--   cdp_Developer: CanCreate, CanUpdate, CanDelete
--   cdp_Integration: CanCreate, CanUpdate only

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDataset] TO [cdp_Developer];
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDataset] TO [cdp_Developer];
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDataset] TO [cdp_Developer];

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDatasetItem] TO [cdp_Developer];
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDatasetItem] TO [cdp_Developer];
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDatasetItem] TO [cdp_Developer];

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDataset] TO [cdp_Integration];
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDataset] TO [cdp_Integration];

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDatasetItem] TO [cdp_Integration];
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDatasetItem] TO [cdp_Integration];
