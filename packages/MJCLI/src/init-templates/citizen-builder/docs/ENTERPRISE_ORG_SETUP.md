# Enterprise Organization Setup: Real Schemas & Business Context

This document explains how enterprise organizations—such as **Blue Cypress (BC)**—configure the MemberJunction Citizen Agent Builder so business users build agents against their **real entity schemas and business relationships** instead of generic defaults.

---

## 1. The Two-App Architecture

To provide an accurate, realistic authoring environment without exposing production customer data to personal machines, organizations publish two Open Apps:

| Application | Description | Carries |
|---|---|---|
| **`<org>-platform`** (e.g. `bc-platform`) | Core schema & business logic | Custom entities, fields, relationships, standard actions, and queries. |
| **`<org>-sampledata`** (e.g. `bc-sampledata`) | Realistic synthetic data | Loom-generated synthetic records mirroring production shapes and relational integrity. Depends on `<org>-platform`. |

When a citizen builder boots their environment and installs `<org>-sampledata`, MemberJunction's Open App dependency engine automatically resolves and installs `<org>-platform` leaf-first.

### Why This Model Works:
1. **Identical Entity Shapes:** Entity and field names match production exactly. An agent written against `bc-sampledata` works on production without renaming a single field or query.
2. **Zero PII Risk:** The data is 100% synthetic by construction. Compliance and security reviews pass automatically.
3. **Seamless Promotion:** Promotion is simply deploying the agent's metadata to the production instance; no code rewrites or schema remapping are needed.

---

## 2. Configuration for Citizen Builders

### Option A: Private GitHub Repository Access (Recommended)
If your organization hosts `<org>-sampledata` in a private GitHub organization (e.g. `github.com/BlueCypress/`):

1. Provide the user with a fine-grained, read-only GitHub Personal Access Token (PAT) with `Contents: Read` permission on the sample data and platform repositories.
2. In the user's `.env`:
   ```bash
   # Enterprise Open App Target
   OPEN_APP_INSTALL_URL=https://github.com/BlueCypress/bc-sampledata
   
   # Read-only GitHub PAT for private repo authentication
   GITHUB_TOKEN=ghp_exampleTokenWithReadOnlyAccess
   ```
3. Run the bootstrap script:
   ```bash
   docker compose exec api /work/scripts/bootstrap.sh
   ```

### Option B: Local Directory Mount (Zero Token)
If the user or team already has a local checkout of the platform app on their machine:
1. Create a `docker-compose.override.yml`:
   ```yaml
   services:
     api:
       volumes:
         - /path/to/local/bc-platform:/work/apps/bc-platform:ro
   ```
2. Run `mj app install /work/apps/bc-platform` inside the container.

---

## 3. Automated Capabilities Cataloging

Once your organization's Open App is installed, run:
```bash
./scripts/generate-capabilities.sh
```
This queries your local database's entity and action catalogs to update `CAPABILITIES.md`. Your coding agent immediately learns every custom entity, field, and action specific to your company (e.g. `BC: Association Members`, `BC: Committee Terms`, `BC: Invoices`).

---

## 4. Packaging and Upstream Release of Sample Data

When updating your organization's synthetic dataset:
1. Generate synthetic records using Loom.
2. Push them to a staging database using `mj sync push`.
3. Capture the differential SQL emitted by `packages/MetadataSync/src/lib/sql-logger.ts` as the next `V<timestamp>__v<version>_Metadata_Sync.sql` migration in `<org>-sampledata`.
4. Publish a release of `<org>-sampledata`. All citizen builders will receive the updated synthetic records on their next bootstrap.
