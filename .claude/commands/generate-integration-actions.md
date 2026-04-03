Generate (or regenerate) integration action metadata for one or all connectors.

## Arguments
- `$ARGUMENTS` — Optional: connector name (e.g., "hubspot", "rasa", "ym", "all"). Defaults to "all".

## What This Does
Each connector implements `GetIntegrationObjects()` and `GetActionGeneratorConfig()` on its class, providing static object/field metadata. The generic generator script instantiates connectors and feeds their config to `ActionMetadataGenerator` to produce mj-sync compatible action JSON files.

Output goes to `metadata/actions/integrations-auto-generated/.<connector>-actions.json`.

## Steps

1. **Parse the argument** to determine which connector(s) to regenerate:
   - `hubspot` → HubSpot only
   - `rasa` → Rasa.io only
   - `ym` → YourMembership only
   - `all` (or blank) → All connectors

2. **Build the required packages**:
   ```bash
   cd packages/Integration/engine && npm run build
   cd packages/Integration/connectors && npm run build
   ```

3. **Run the generator** from the connectors package:
   ```bash
   cd packages/Integration/connectors
   npx tsx src/generate-integration-actions.ts           # All connectors
   npx tsx src/generate-integration-actions.ts hubspot   # HubSpot only
   npx tsx src/generate-integration-actions.ts rasa      # Rasa.io only
   npx tsx src/generate-integration-actions.ts ym        # YourMembership only
   ```

4. **Report results**: Show how many actions were generated for each connector.

5. **Important notes for the user**:
   - For HubSpot migration: also run `node scripts/migrate-hubspot-actions.mjs` to preserve database primary keys and add delete markers for old params/result codes
   - New actions (no `primaryKey`) will be created as new DB records on `mj sync push`
   - Actions with `primaryKey` will update existing DB records
   - Push with: `npx mj sync push --dir=metadata --include="actions"`

## Adding a New Connector

To add action generation for a new connector:

1. Add `GetIntegrationObjects()` override to the connector class returning `IntegrationObjectInfo[]`
2. Add `GetActionGeneratorConfig()` override to customize icon/category
3. Add `IntegrationName` getter override
4. Add the connector to the `CONNECTOR_REGISTRY` in `packages/Integration/connectors/src/generate-integration-actions.ts`
5. Rebuild and run the generator

## Architecture

- **`BaseIntegrationConnector`** defines `GetIntegrationObjects()`, `GetActionGeneratorConfig()`, and `IntegrationName` (overridable)
- **Each connector** overrides these with its static object/field metadata
- **`ActionMetadataGenerator`** (in engine package) is the generic generator — no connector-specific knowledge
- **`generate-integration-actions.ts`** (in connectors package) is the CLI entry point that wires connectors to the generator
