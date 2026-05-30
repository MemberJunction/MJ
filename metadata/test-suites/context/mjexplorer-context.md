## MJ Explorer — Application & Navigation Guide

MJ Explorer is a single-page web app. The **top bar** is always visible. Left to right:

- The **MemberJunction logo** and a **Home** icon (Home returns to the Home app).
- An **application switcher**: a dropdown (chevron) immediately to the right of the logo/Home icon. Click it to see **all applications** and switch between them. **This is the correct way to change applications.** Do NOT use the global search box to switch applications.
- The current app's **sections** appear as tabs/links in the top bar (e.g., Data Explorer shows `Data`, `Queries`, `Dashboards`).
- A **"Search everything" box (Ctrl+K)** in the center — searches for *records across entities*. Use it to FIND a record, never to switch applications.
- Notifications, chat, and profile (avatar) icons on the right. Profile → "My Profile" opens the settings modal (Account, Theme, Notifications).

### Applications and their sections (reach them via the application switcher)

- **Home** — landing dashboard.
- **Data Explorer** — `Data` (browse & search entity records), `Queries` (run saved queries), `Dashboards`.
- **AI** — `Overview`, `Agents`, `Prompts`, `Models`, `Analytics`, `Configuration`.
- **Admin** — `Identity & Access` (users & roles), `Data & Schema` (includes the **ERD diagram viewer**), `Monitoring`, `Developer Tools`.
- **Integrations** — `Overview`, `Integrations`, `Activity`, `Schedules`.
- **Communication** — `Templates`, `Monitor`, `Logs`, `Providers`, `Runs`.
- **Lists** — `Lists`, `Operations`, `Categories`.

### Opening an entity record (the full form)

Data Explorer → **Data** → pick an entity from the left-hand tree → a grid of rows appears → click a row to open its **preview** → click **"Open Full Record"** to load the full editable form. The URL becomes `/app/home/record/{Entity}/ID|{guid}`. To edit, change a field and click **Save**; to create, use the **New** / **Create** button on the entity's grid.

### Tabs (workspace)

Opening a record, query, or dashboard opens it as a **tab across the top of the workspace**. Click a tab to switch to its content; open tabs persist. For a multi-tab task, open each item in turn (each becomes a new tab), then click between the tabs to switch — you do not need to re-navigate from scratch.

### Running a saved query (Data Explorer → Queries)

The left panel lists queries grouped in folders. **Many queries require input parameters.** When you select a query, a **"Query Parameters"** panel may appear on the right with fields; required fields are marked with a red asterisk (`*`). A query with **required** parameters will show **"No results"** and will not return data until those parameters are filled.

**To run a query and see tabular results, pick a query that has NO required parameters** (selecting it shows results or a Run button with no asterisked inputs), then click **Run**. If the query you selected shows required parameters you cannot fill, **choose a different query** rather than retrying the same one.

### Environment note (important)

This runs in a resource-constrained Docker environment. Pages, the workspace, and navigation transitions can take **10–30 seconds**. If you see a loading spinner or a blank page, **wait** (5s, then 10s, then 15s) — do NOT navigate away, refresh, go back, or re-login. The content will appear. Only ask for judgement if you have waited over 60 seconds on the same unchanged loading state.
