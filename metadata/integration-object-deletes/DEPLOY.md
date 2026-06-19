# Nimble AMS override — deploy sequence (TWO pushes, REQUIRED)

`mj sync push` applies creates/updates BEFORE deletes, so deleting the old same-named IOs and inserting the
new ones in ONE push collides on `UQ_IntegrationObject_Name` (proven 2026-06-16). The override therefore
deploys as TWO sequential, scoped pushes on a fresh install (which replays the baselines that bake the OLD
20-IO Nimble seed):

1. DELETE-ONLY (removes the 20 baseline-baked old IOs + 39 dependent IOFs):
   `npx mj sync push --dir metadata --include integration-object-deletes --delete-db-only --ci`

2. UPSERT the new 32-IO connector metadata:
   `npx mj sync push --dir metadata --include nimble-ams`   (or the full `--dir metadata`)

`.old-nimble-seed.deletes.json` keys on the deterministic baseline IO IDs (e.g. Account=8AA5F6F1…), so the
same file works on every install. Migrations are NOT used for this — the override is metadata-only.
