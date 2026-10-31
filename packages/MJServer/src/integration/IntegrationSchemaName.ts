/**
 * The database schema the schema-apply pipeline creates a connector's tables in, derived from the
 * integration's name (e.g. "HubSpot" → "hubspot", "SQL Server" → "sql_server"). Shared by the apply
 * (IntegrationDiscoveryResolver) and the archive seed, which must only bulk-load entities in it.
 */
export function DeriveIntegrationSchemaName(integrationName: string): string {
  return (integrationName || 'integration').toLowerCase().replace(/[^a-z0-9_]/g, '_');
}
