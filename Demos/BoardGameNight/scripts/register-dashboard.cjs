/**
 * Registers the Board Game Night dashboard in MJ metadata.
 *
 * Goes through BaseEntity.Save() rather than an INSERT so Record Changes, cache invalidation, and
 * validation all run — see the "NEVER WRITE DIRECT SQL DML AGAINST AN ENTITY" rule in
 * .claude/rules/data-access.md. Idempotent: re-running updates the existing row.
 */
const path = require('path');
require('dotenv').config({ path: '/Users/caitlintuttle/Projects/MJ/MJ/.env' });
const sql = require('mssql');
const { setupSQLServerClient, SQLServerProviderConfigData, UserCache } = require('@memberjunction/sqlserver-dataprovider');
const { Metadata, RunView } = require('@memberjunction/core');

const DRIVER_CLASS = 'BoardGameNightDashboard';
const APP_NAME = 'BoardGameNight';

(async () => {
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_DATABASE,
    user: process.env.CODEGEN_DB_USERNAME,
    password: process.env.CODEGEN_DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: false },
  }).connect();

  const config = new SQLServerProviderConfigData(pool, '__mj');
  await setupSQLServerClient(config, { mode: 'task' });
  await UserCache.Instance.Refresh(pool);
  const user = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
  if (!user) throw new Error('No user found to own the dashboard row.');

  const md = new Metadata();
  // global-provider-ok: one-off CLI script against a single provider (see .claude/rules/data-access.md)
  const rv = new RunView();

  const apps = await rv.RunView({
    EntityName: 'MJ: Applications',
    ExtraFilter: `Name='${APP_NAME}'`,
    ResultType: 'simple',
  }, user);
  if (!apps.Success) throw new Error(`Could not read applications: ${apps.ErrorMessage}`);
  const app = apps.Results?.[0];
  if (!app) throw new Error(`Application '${APP_NAME}' not found — run CodeGen first.`);

  const existing = await rv.RunView({
    EntityName: 'MJ: Dashboards',
    ExtraFilter: `DriverClass='${DRIVER_CLASS}'`,
    ResultType: 'simple',
  }, user);
  if (!existing.Success) throw new Error(`Could not read dashboards: ${existing.ErrorMessage}`);

  const dashboard = await md.GetEntityObject('MJ: Dashboards', user);
  const prior = existing.Results?.[0];
  if (prior) {
    await dashboard.Load(prior.ID);
    console.log(`Updating existing dashboard row ${prior.ID}`);
  } else {
    dashboard.NewRecord();
    console.log('Creating new dashboard row');
  }

  dashboard.Name = 'Board Game Night';
  dashboard.Description = 'Skill above chance, box-estimate accuracy, and collection mix.';
  dashboard.UserID = user.ID;
  dashboard.Type = 'Code';
  dashboard.Scope = 'App';
  dashboard.ApplicationID = app.ID;
  dashboard.DriverClass = DRIVER_CLASS;
  if (!dashboard.UIConfigDetails) dashboard.UIConfigDetails = '{}';

  const saved = await dashboard.Save();
  if (!saved) {
    // Save() returns false rather than throwing on a logical failure.
    throw new Error(`Save failed: ${dashboard.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  }

  console.log(`OK — '${dashboard.Name}' -> ${DRIVER_CLASS}, Scope=App, App=${APP_NAME} (${app.ID})`);

  // ---------------------------------------------------------------------------------------------
  // A Dashboard row alone is NOT reachable. Explorer builds an app's navigation from
  // Application.DefaultNavItems, and CodeGen leaves that NULL for a generated app — so the app shows
  // only its entity lists and the dashboard has nothing pointing at it. Add a nav item that opens it:
  // ResourceType 'Dashboards' + RecordID is how the shell resolves a dashboard (see
  // shell.component.ts, which keys on rt === 'Dashboards').
  //
  // isDefault stays false on purpose: the generated entity browsing remains the app's landing view,
  // and the dashboard is an additional item rather than a behaviour change to what already worked.
  // ---------------------------------------------------------------------------------------------
  const NAV_LABEL = 'Board Game Night';
  const application = await md.GetEntityObject('MJ: Applications', user);
  await application.Load(app.ID);

  let navItems = [];
  if (application.DefaultNavItems) {
    try {
      const parsed = JSON.parse(application.DefaultNavItems);
      if (Array.isArray(parsed)) navItems = parsed;
    } catch {
      // A malformed value would be silently replaced otherwise — say so rather than clobbering it.
      console.warn('Existing DefaultNavItems was not valid JSON; replacing it.');
    }
  }

  const navItem = {
    Label: NAV_LABEL,
    Description: 'Skill above chance, box-estimate accuracy, and collection mix.',
    Icon: 'fa-solid fa-dice',
    ResourceType: 'Dashboards',
    RecordID: dashboard.ID,
    isDefault: true,
    Status: 'Active',
  };

  const existingIdx = navItems.findIndex((n) => n && n.RecordID === dashboard.ID);
  if (existingIdx >= 0) {
    navItems[existingIdx] = navItem;
    console.log('Updating existing dashboard nav item');
  } else {
    navItems.push(navItem);
    console.log('Adding dashboard nav item');
  }

  // -------------------------------------------------------------------------------------------
  // Entity lists.
  //
  // Explorer builds an app's navigation ONLY from DefaultNavItems — BaseApplication.GetNavItems()
  // returns [] when the column is null, and nothing in the shell renders ApplicationEntity rows as
  // nav items. So once this app has ANY nav item, the entity lists have to be listed explicitly too
  // or they are simply not in the nav.
  //
  // These are DYNAMIC USER VIEWS, not routes. NavItem.Route does not work here: OpenNavItem only
  // copies Route into the tab's Configuration, and the tab resolves its component from
  // `resourceType` — so a Route-only nav item renders a button that resolves to nothing and does
  // nothing when clicked. (Observed exactly that before switching.)
  //
  // The contract below is lifted from NavigationService.OpenDynamicView, which is how Explorer opens
  // "all records of entity X" without a saved view: resourceType 'MJ: User Views' plus the special
  // 'dynamic' record marker and the entity name in Configuration.Entity. ViewResource documents the
  // same thing ("Supports dynamic views by entity name + extra filter").
  //
  // Driven off ApplicationEntity so the list cannot drift from what the app actually contains.
  // -------------------------------------------------------------------------------------------
  const appEntities = await rv.RunView({
    EntityName: 'MJ: Application Entities',
    ExtraFilter: `ApplicationID='${app.ID}'`,
    ResultType: 'simple',
  }, user);
  if (!appEntities.Success) throw new Error(`Could not read application entities: ${appEntities.ErrorMessage}`);

  const entityRows = (appEntities.Results ?? []).slice().sort((a, b) => {
    const seq = (a.Sequence ?? 0) - (b.Sequence ?? 0);
    return seq !== 0 ? seq : String(a.Entity ?? '').localeCompare(String(b.Entity ?? ''));
  });

  let added = 0;
  let removedLegacy = 0;
  for (const row of entityRows) {
    const entityName = row.Entity;
    if (!entityName) continue;

    const item = {
      Label: entityName,
      Description: `Browse all ${entityName} records.`,
      Icon: 'fa-solid fa-table',
      ResourceType: 'MJ: User Views',
      RecordID: 'dynamic',
      Configuration: {
        Entity: entityName,
        isDynamic: true,
        recordId: 'dynamic',
      },
      isDefault: false,
      Status: 'Active',
    };

    // Match on the configured entity, since every one of these shares RecordID 'dynamic'.
    const idx = navItems.findIndex((n) => n && n.Configuration && n.Configuration.Entity === entityName);
    const legacyIdx = navItems.findIndex((n) => n && typeof n.Route === 'string' && n.Route.includes('/resource/view/dynamic/'));

    if (idx >= 0) {
      navItems[idx] = item;
    } else {
      navItems.push(item);
      added++;
    }

    // Drop the earlier Route-based attempts so the nav does not carry dead buttons.
    if (legacyIdx >= 0 && legacyIdx !== idx) {
      const dead = navItems.splice(legacyIdx, 1);
      if (dead.length) removedLegacy++;
    }
  }
  // Sweep any Route-based leftovers that no longer correspond to an app entity.
  const before = navItems.length;
  navItems = navItems.filter((n) => !(n && typeof n.Route === 'string' && n.Route.includes('/resource/view/dynamic/')));
  removedLegacy += before - navItems.length;

  console.log(`Entity nav items: ${entityRows.length} total, ${added} added, ${removedLegacy} dead Route items removed`);

  application.DefaultNavItems = JSON.stringify(navItems, null, 2);
  const navSaved = await application.Save();
  if (!navSaved) {
    throw new Error(`Nav item save failed: ${application.LatestResult?.CompleteMessage ?? 'unknown error'}`);
  }

  console.log(`OK — nav item '${NAV_LABEL}' -> Dashboards/${dashboard.ID} on app '${APP_NAME}'`);
  await pool.close();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
