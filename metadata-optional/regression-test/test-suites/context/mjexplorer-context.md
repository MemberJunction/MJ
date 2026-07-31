## MJ Explorer — Application & Navigation Guide

MJ Explorer is a single-page web app. The **top bar** is always visible. Left to right:

- The **MemberJunction logo** and a **Home** icon (Home returns to the Home app).
- An **application switcher**: a dropdown (chevron) immediately to the right of the logo/Home icon. Click it to see **all applications** and switch between them. **This is the correct way to change applications.** Do NOT use the global search box to switch applications. **The dropdown is SCROLLABLE** — there are many applications and the list extends below the visible area. If the application you want (e.g. Integrations) is not visible, **scroll down inside the open dropdown** (mouse-wheel/scroll over the dropdown list) to reveal the apps further down; do not assume an app is missing until you have scrolled to the bottom of the dropdown.
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

### The Data Explorer entity tree (how entities are organized)

In Data Explorer → **Data**, there are ~400+ entities. The demo business data lives in the **`AssociationDemo`** application group (58 entities): **Members**, **Events**, **Courses**, **Products**, **Invoices**, **Certifications**, **Forum Threads**, **Resources**, **Legislative Issues**, etc.

**The reliable way to open an entity: use the `Search entities…` box in the LEFT sidebar.** Type the entity name (e.g. `Members`) into that sidebar search box, then **click the matching entity node** in the filtered tree. This opens the entity's grid directly. **Do NOT rely on clicking a group's expand-chevron/folder to reveal its children — that interaction is finicky and often does not respond.** Using the sidebar `Search entities…` box avoids it entirely.

Many entity names are similar — e.g. **`Members`** (individual member people, ~2000 rows) is distinct from `Board Members`, `Campaign Members`, `Member Follows`, `Memberships`, `Membership Types`, `Chapter Memberships`, and `Committee Memberships`. The sidebar search matches substrings, so typing "Members" lists all of those — **click the entry named exactly `Members`** (the bare name with no extra words; it IS in the filtered list — scroll the results if you don't see it immediately).

**Reliable fallback if the sidebar search is not surfacing the exact entity** (e.g. you keep landing on `Board Members`/`Memberships` instead of `Members`): navigate directly to the entity's grid by URL — `http://localhost:4200/app/data-explorer/Data?entity=<EntityName>` (e.g. `…?entity=Members`, `…?entity=Events`, `…?entity=Products`). This opens that entity's grid deterministically. Use this only when the search box is giving you trouble — for normal cases the sidebar `Search entities…` box is fine.

The grid that opens supports a **search box** (matches individual columns — search a single field value like a last name, not a full name), **sortable column headers** (click to sort), and **pagination at the bottom** for large entities. Related records appear as **expandable sections/panels lower on a record's form** (scroll down the form; a "Manage Sections" control may toggle which are shown).

**The grid toolbar** (a row of controls above the grid, mostly upper-right) includes, with these tooltips/icons: a **View selector** showing the current view name e.g. **"(Default)"**, **"Configure view settings"** (sliders icon), **"Create new record"** (plus icon), **"Export to Excel"** (Excel-file icon) and an **"Export"** button, **"Add to List"** (list-check icon), **"Refresh"**, and **"More actions"** (vertical ellipsis). Export and Create-new-record are direct toolbar buttons.

**Advanced grid/view features live INSIDE the "Configure View" panel** — click **"Configure view settings"** (the sliders icon) to open it. That panel has tabs **Columns** (Visible/Hidden columns — show/hide/reorder), **Sorting** (multi-column sort), **Filters** (an advanced filter builder, distinct from the simple `Filter records…` quick-filter box), and **Aggregates** ("Add Aggregate" — column aggregations). The same panel manages **Views**: **Save View**, **Duplicate View**, a **New View Name** field, **Delete View**, and a **Shared View** toggle — so to create/save a view you open Configure View, set options + a name, and Save View. (Columns/Filters/Sorting/Aggregates are NOT standalone toolbar buttons — reach them via Configure View.)

### Opening an entity record (the full form)

Data Explorer → **Data** → find the entity via the sidebar `Search entities…` box → a grid of rows appears → click a row to open its **preview** → click **"Open Full Record"** to load the full editable form. The URL becomes `/app/home/record/{Entity}/ID|{guid}`. To create a new record, click the **New** / **Create** button on the entity's grid.

### Filling and saving a record form (dropdowns, dates, checkboxes, related sections)

- **Saving:** when a record is new or edited, a blue **"Editing: …"** banner appears across the TOP of the form with a **"Save Changes"** button on the right. Click **"Save Changes"** (top banner) to save — that is the save button (there may not be a separate Save lower down).
- **Required fields** are marked (e.g. a red underline). Fill them all before saving, or the save is rejected with a validation error.
- **Dropdown / select fields** show **"-- Select --"** (or a current value) with a chevron on the right. To set one: **CLICK the field to open its option list, then CLICK the option you want** from the list (do NOT type into it). The field then shows the chosen value. Verify the value appears before saving.
- **Date fields** show `mm/dd/yyyy`; click and type or pick a date. **Checkboxes** toggle on click.
- **Related-records sections** appear as collapsible panels lower on the form (a record can have MANY). If you don't see a section's rows, the panel may be **collapsed — click its header to expand it**, or use a **"Search sections…"** box / a "Manage Sections" control near the top of the form to locate/enable it.
- **Opening a record from an embedded/related grid:** click the row, then use its **open/link affordance** (e.g. an "Open Record" icon or "Open Full Record") — a plain row click may only select/preview it.

### The record toolbar (action icons at the top-left of an open record)

An open record shows a row of small icon buttons at the **top-left, just above the form's Details card**. Hover for tooltips. From left to right they are typically:
- **Edit** (pencil) — enter edit mode.
- **Delete** (trash can) — delete the record (asks for confirmation).
- **Favorite** (star) — toggles favorite; the star is **gold when favorited** and the tooltip reads **"Add Favorite"** or **"Remove Favorite"**. Click it to toggle.
- **Record Changes History** (clock) — tooltip reads **"N version(s) tracked"**; click it to open the **"Record Changes History"** slide-in panel, which lists every change to the record (each entry shows the action e.g. *Location changed*, the user, and the time, with filter tabs and a search box). This is MJ's built-in audit/versioning.
- **Add to a list** (bookmark) — opens a dialog to add the record to a List.
- **View tags** (tags icon) — opens the record's tags.

To the right of those are section controls: **Expand all / Collapse all sections**, **Manage section order**, **Expand to full width**.

### Tabs (workspace)

Opening a record, query, or dashboard opens it as a **tab across the top of the workspace**. Click a tab to switch to its content.

**Opening MULTIPLE records as separate tabs:** a NORMAL click on "Open Full Record" REUSES the current record tab (the content swaps to the new record — you do NOT get a second tab). To open a record in a **NEW** tab, **Shift+Click the "Open Full Record" button** (hold Shift while clicking). Each Shift+Click adds a new tab in the top bar. After opening two records this way you will see two record tabs (e.g. `Members: AAAA…` and `Members: BBBB…`) plus `Home`. Click a tab to switch; click its × to close it. If a Shift+Click seems to have only swapped the content, the tab count did not increase — try the Shift+Click again deliberately (hold Shift down, then click).

### Running a saved query (Data Explorer → Queries)

The left panel lists queries grouped in folders. **Many queries require input parameters.** When you select a query, a **"Query Parameters"** panel may appear on the right with fields; required fields are marked with a red asterisk (`*`). A query with **required** parameters will show **"No results"** and will not return data until those parameters are filled.

The queries are grouped into **folders** in the left panel (Admin, MJ, AI, etc.). To find a specific query, use the **'Search queries...' box in the LEFT sidebar** (NOT the global Ctrl+K box, which does not search queries), or pick one from a visible folder. **To run a query and see tabular results, pick a query that has NO required parameters** (selecting it shows results or a Run button with no asterisked inputs), then click **Run**. If the query you selected shows required parameters you cannot fill, **choose a different query** rather than retrying the same one.

### Environment note (important)

This runs in a resource-constrained Docker environment. Pages, the workspace, and navigation transitions can take **10–30 seconds**. If you see a **loading spinner** (the app is clearly loading), **wait** (5s, then 10s, then 15s) — do NOT navigate away, go back, or re-login; the content will appear.

**Exception — a STUCK first load (blank OR a non-progressing loading screen):** the SPA sometimes stalls on first load, especially when the server is busy. If the page is EITHER (a) entirely **blank/white** (no UI at all), OR (b) still showing a **boot screen** — e.g. `Loading workspace...`, `Loading configurations...`, `Spinning up resources...`, or a `Reset` prompt — then recover **patiently and persistently**:

1. **Be patient first.** These boot screens can take **up to 60 seconds** under load — this is normal, not a failure. Wait in increasing increments (15s, then another 20s) before doing anything.
2. **If still stuck after ~45–60s, reload the page**, then wait again (give it another ~30–45s — a fresh reload often takes a moment to re-boot).
3. **Reload up to 3 times** this way. Do NOT conclude the app is broken after a single reload — the stall is transient and usually clears within a couple of reload-and-wait cycles.
4. Only after you have **reloaded 3 times AND waited the full time after each** (i.e. you've genuinely given it 3+ minutes total) without ever seeing the app shell, ask for judgement / report the app as failing to load.

This is the ONLY situation where reloading is correct; for a normal in-progress loading spinner on a content page, just wait — do not reload.
