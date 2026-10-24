# @memberjunction/ng-shared-generic

## 6.2.0-edge.5

### Patch Changes

- 83486cf: fix(tokens): dark-theme `--mj-status-*-text` now carries a status signal (#4564)

  In `[data-theme="dark"]` all four `--mj-status-*-text` tokens resolved to the **100** step of their ramp, a near-white tint within 1.00 to 1.12:1 of `--mj-text-primary`. Anything whose only status affordance was `color: var(--mj-status-*-text)` was legible but indistinguishable from body text in dark theme.
  - **Dark `-text` tokens move to the 300 step.** 300 reads as its hue and clears WCAG AA on every resting dark surface (page, surface, card, elevated), including on the matching 15% `-bg` tint (lowest measured: info at 4.92:1 over elevated). The 400 step separates further from body text but fails AA for error and info on elevated surfaces, so 300 is the deepest step that holds across the resting surfaces. See the known limitation below for the hover and active surfaces. Light theme is unchanged.
  - **The info ramp gains its missing `200`, `300` and `400` steps.** `--mj-color-info-*` only defined 50, 100, 500, 600 and 700, so `var(--mj-color-info-300)` would have been invalid and fallen back to the inherited body color. The Integration overview's refresh and sync button hover borders, which referenced the undefined `--mj-color-info-200`, now use the theme-aware `--mj-status-info-border` instead of a primitive.
  - **Visible side effect:** the `mjButton` danger, success and warning variants (and about 17 bespoke buttons) use `--mj-status-*-text` as their hover background. In dark theme their hover now lifts to a lighter tint of the button's own hue instead of flashing to near-white. The label is `--mj-text-inverse` (neutral-900 in dark), so it stays well above AA either way.
  - **`ThemeEngine` follows.** `derive.ts` held a hardcoded parallel copy of the dark `-text` values at the old 100 step. The runtime overlay never emits semantic tokens, so branded orgs already got the fix from the stylesheet, but ThemeStudio reads `derived.tokens.dark` for its previews and would have shown the old near-white values next to an app rendering the 300 step.
  - **Known limitation:** on a hovered row (`--mj-bg-surface-hover`, neutral-600) status text on its own tint drops below AA for warning (4.37), error (3.81) and info (3.78), where the 100 step passed. Plain status text with no tint, for example a red "Deny" cell or a blue status word in a hovered grid row, also drops below AA there for error (3.99) and info (4.20). On `--mj-bg-surface-active` (neutral-500) both steps fail. The tint and border still carry the status where there is one, and the root cause is how light those two dark surfaces are, which is a separate change.

- 8b62f8c: A dialog opened from a slide panel now renders above it. `mj-dialog`'s backdrop shipped at `z-index: 1000` and `mj-slide-panel` at 1001, so a modal launched from a drawer (the User-360 / asset-preview pattern) landed underneath the surface that opened it, and hosts bridged it with their own `z-index` overrides keyed to MJ class names.
  - **Two new stacking tokens.** `--mj-z-drawer` (1000) and `--mj-z-dialog` (1200) join the `Z-INDEX SCALE` in `_tokens.scss`. The slide panel's backdrop sits on the drawer rung and the panel itself one above it; the dialog backdrop sits on the dialog rung.
  - **The ladder is documented.** The token section now lists the de-facto overlay order (shell header, drawer, dialog, mobile chrome band, window, confirm, search, toasts) so a host composing its own surfaces knows where to land. Only the two new rungs are tokens; the legacy 0–800 rungs are unchanged and keep their consumers.
  - Tests pin the ordering in `_tokens.scss` and the rung each stylesheet names.

- Updated dependencies [0d81c53]
- Updated dependencies [39b35f1]
- Updated dependencies [3080e83]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [db39145]
- Updated dependencies [b14c72f]
- Updated dependencies [5e4205c]
- Updated dependencies [81aea34]
- Updated dependencies [ac9b00b]
- Updated dependencies [5465489]
- Updated dependencies [83486cf]
- Updated dependencies [d29b5c2]
- Updated dependencies [0c634ba]
- Updated dependencies [223669e]
- Updated dependencies [2274f42]
- Updated dependencies [5fed75a]
- Updated dependencies [1cb1d52]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [7e72c86]
- Updated dependencies [5fed75a]
- Updated dependencies [ce758af]
- Updated dependencies [8420f36]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [dc38250]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/theme-engine@6.2.0-edge.5
  - @memberjunction/ng-base-types@6.2.0-edge.5

## 6.2.0-edge.4

### Minor Changes

- 6dc3aa9: feat(explorer): Dashboards is its own application

  Dashboards move out of Data Explorer into a first-class Dashboards app, and Home, the command palette and recents reach them directly. There is no schema change: the new application is metadata, shipped in the release's metadata sync.
  - **Dashboards app** (`metadata/applications/.dashboards-application.json`: App Switcher navigation, default for new users) with two pages. **Library**, the default page, lists every dashboard the user can see in one flat list: favorites first, then the dashboards the user opened last, then the rest by last update. Its rail has the Library filters (All dashboards, My dashboards, Shared with me, Favorites, Recently opened) and the category tree with an Uncategorized list; a category shows as a folder. A card shows the dashboard's screenshot (else a miniature of its layout, and "Not set up yet" for a dashboard with no parts), its owner ("You", else the owner's name), a Shared marker, its category and its last update, and a star that adds or removes a favorite. **Categories** shows the category tree with counts, creates categories, and deletes empty ones that the user owns after a confirm. New dashboard asks for a name first, and Cancel creates nothing. Existing users get the app once, automatically, the next time Home loads; a user who later removes it keeps it removed. `@memberjunction/ng-bootstrap` registers the new Categories page class.
  - **Data Explorer** keeps Data and Queries. A dismissible banner on the Data tab points to the Dashboards app (`DataExplorerDashboardComponent` adds `ShowDashboardsMovedBanner`, `DismissDashboardsMovedBanner()` and `OpenDashboardsApp()`). For a user who has the Dashboards app, a link to Data Explorer's old Dashboards page (`/app/data-explorer/Dashboards`, query params kept) and an old Home pin to that page open the Library, and a saved workspace tab of that page becomes a Library tab (or gives way to an open Library tab) when the workspace loads or the user's apps change.
  - **A dashboard opens in a workspace tab**, titled with the dashboard's name. Like any link, it replaces the current preview tab, so Back returns to the page it replaced (for example Home, a Dashboards app page or another dashboard) and Forward shows the dashboard again; Shift-click opens it in a separate tab, and so does a Ctrl or Cmd click on the Library list. A dashboard opened from a Dashboards app page is a tab of that app, so the app's header and pages stay in view; one opened from anywhere else (the command palette, recents, Home's Quick Access, a pinned Code dashboard) is a tab of Home. A new dashboard, and a card's Edit action, open the dashboard in edit mode.
  - **Viewing and editing a dashboard.** The dashboard tab and Home show a Config dashboard in one editor. Its header shows the name and description, a Shared marker and the Favorite star; in the tab it also has the AI assistant toggle, a Share button and an Add to menu (Pin card, Share). Edit enters edit mode: name and description fields, an Editing badge, and Add part, Save and Cancel. Parts are MJ-styled tabs in tab groups, with a menu for the tabs that do not fit. In edit mode each tab group's header has Edit part and Remove for its active part, and a tab can be dragged to an edge to put parts side by side; in view mode tabs do not move. Add part and Edit part open one part dialog: the part type tiles, the type's source settings, a title that defaults to the source's name, and for a query its parameter controls and a refresh interval of 30, 60, 300 or 600 seconds; Edit part cannot change a part's type. Remove asks first and says that the view, query, artifact or page itself is kept. An empty dashboard offers Add part, also in view mode, to a user who can edit it. Save stores the changes and Cancel discards them. A dashboard that is not being edited reloads when it is saved elsewhere, Edit starts from the latest saved layout, and Save asks first when the dashboard was saved elsewhere after the edit began. Each Save also stores a small screenshot of the dashboard in `MJ: Dashboards.Thumbnail`, for the dashboard cards.
  - **Home** stays a launcher: a greeting, Pinned and My applications. The Pinned header has Add Pin, a **Dashboards** switcher (`mj-home-dashboard-switcher`, internal to `CoreDashboardsModule`) and Edit. The switcher filters the pinned Config dashboards and offers Home, New dashboard and Manage pins; its `HeadingLevel` input (`1`, `2` or `null`) puts the trigger of its title look, not its menu, in an `h1` or `h2`, and Home's dashboard view uses `1`. A pinned Config dashboard opens full size inside Home (`?dashboard=<id>`, so links, Back and Forward work) in the same editor, with a breadcrumb and the switcher as its title: the user edits it in place, Open in Dashboards opens it in the Dashboards app, and leaving it with unsaved changes asks first. Quick Access is hidden while a dashboard shows. New dashboard asks for a name, pins the new dashboard and opens it in Home in edit mode. A dashboard pin shows its dashboard's name, and renaming the pin renames the dashboard for a user who can edit it; other pins keep their own names. Pin cards show an icon tile for every pin except Action pins, app cards drop their nav chips, and the pin options menu works from the keyboard. The Pinned section collapses, and Home remembers the choice for each user (`HomeApp.PinnedCollapsed`).
  - **`mj-accordion-panel`** (`@memberjunction/ng-ui-components`): `Bare` now also drops the body fill and the row hover fill; on a device that can hover, pointing at the title or chevron gives both the brand color. A new `HeadingLevel` input wraps the toggle in a heading. Fix: the toggle's keyboard focus ring is drawn inside the header, so the panel no longer clips it; on a brand-colored header (the `primary` Variant, and the open sections of the Queries and Templates forms in `@memberjunction/ng-core-entity-forms`) the ring uses the inverse text color.
  - **The command palette** lists matching dashboards (by name, description or category) in a Dashboards group; Enter opens the dashboard in place of the preview tab (Shift-click on a row opens a separate tab). `OmnibarNavPayload` (`@memberjunction/ng-explorer-core`) gains a `dashboard` kind.
  - **Recents include dashboards.** Opening one logs `MJ: Dashboards` access, and `RecentAccessService` maps prefixed entity names with the new `ResourceTypeForEntity` and its `RecentResourceType` type (`@memberjunction/ng-shared-generic`).
  - **`mj-dashboard-browser`** (`@memberjunction/ng-dashboard-viewer`) gains `[FlatMode]`: one flat list of every dashboard it is given, with no folder scoping. Outside selection mode, a Shift, Ctrl or Cmd click on a dashboard now opens it with `OpenInNewTab: true` instead of selecting it; in selection mode those clicks still select, and a Shift range starts from the last dashboard clicked in selection mode. Its cards are the new `mj-dashboard-card`, filled by the new inputs `FavoriteIds`, `ShowFavorites` and `OwnerLabels`; `FlatEmptyIcon`, `FlatEmptyTitle`, `FlatEmptyMessage` and `FlatEmptyWelcome` set the empty state of a flat list, and the new `DashboardFavoriteToggle` output (`DashboardFavoriteToggleEvent`) reports a star click. Its template uses the new public members `IsFavorite()`, `OnToggleFavorite()`, `OwnerLabel()`, `CardCategoryPath()` and `ShowWelcome`. Delete, from a card, a list row or the selection toolbar, asks first through the shared `MJConfirmService` and then emits `DashboardDelete`, so the host does not ask again. `OnDeleteDashboard()` and `OnDeleteSelected()` return a `Promise`, `OnEditDashboard()` and `OnDeleteDashboard()` take the click event as an optional argument, and `ShowDeleteConfirm`, `DashboardsPendingDelete`, `ConfirmDelete()` and `CloseDeleteConfirm()` are removed. The constructor takes `MJConfirmService` (root-provided), so a subclass or a direct `new` must pass it.
  - **`mj-dashboard-card`** (`DashboardCardComponent`, `@memberjunction/ng-dashboard-viewer`) is one dashboard as a presentational card, with `DashboardCardClickEvent` and the helpers `IsDashboardNotSetUp()`, `FormatDashboardDate()` and `DashboardCategoryPath()`. The package also adds `mj-dashboard-layout-preview`, a miniature of a dashboard's saved panel layout: `DashboardLayoutPreviewComponent`, `DashboardLayoutPreviewNodeComponent`, and `BuildDashboardLayoutPreview()` with its types `DashboardLayoutPreviewNode`, `DashboardLayoutPreviewGroup` and `DashboardLayoutPreviewPanel`.
  - **`mj-dashboard-viewer`** (`@memberjunction/ng-dashboard-viewer`) gains `HasNewerSavedLayout()`, `ReloadFromSaved()` and `UseSavedCopy()`: they compare with and show the dashboard's saved layout, and take a new copy of the dashboard without rebuilding. A new `CanEdit` input offers Add part on an empty dashboard in view mode. In edit mode, the Edit part and Remove buttons of each tab group ask the host through `PanelInteraction` (`configure-part-requested`, `remove-part-requested`), and the remove request carries `partTypeName`; edit mode draws no title bar above each part. `RemovePartConfirmOptions()` builds the Remove part confirm for `MJConfirmService.ConfirmDelete`. `GoldenLayoutWrapperService.OnStackAction` emits a `StackActionEvent` (a `StackAction`, `'edit'` or `'remove'`, and the active part's `PanelId`) in edit mode. The wrapper writes `DASHBOARD_STACK_HEADER_HEIGHT` (44) and `DASHBOARD_TAB_CONTROL_OFFSET` (78) into every layout it loads, so the layouts it saves carry them. Tabs can be dragged only in edit mode, and the keyboard reaches each tab (a tab list with `aria-selected`).
  - **Part and name dialogs** (`@memberjunction/ng-dashboard-viewer`): `DashboardPartDialogComponent` (`mj-dashboard-part-dialog`, with `DashboardPartDialogMode`, `DashboardPartDialogResult` and `QUERY_REFRESH_SECONDS`) adds or edits a part in one `mj-dialog`, and the new `BaseConfigPanel.ShowCommonFields` input (default `true`) lets it hide a settings panel's own title and query fields. The standalone `DashboardNameDialogComponent` (`mj-dashboard-name-dialog`, with `DASHBOARD_NAME_MAX_LENGTH`) asks for a new dashboard's name and stays open while the host creates it.
  - **Deprecated in `@memberjunction/ng-dashboard-viewer`** (still exported and working): `AddPanelDialogComponent` and `EditPartDialogComponent` (use `DashboardPartDialogComponent`); `AddPanelResult`, now a type alias of `DashboardPartDialogResult`, and `EditPartDialogResult`, now `DashboardPartDialogResult` without `PartType`; and `ConfirmDialogComponent` and `ConfirmDialogType` (use `MJConfirmService`, `MJConfirmDialogComponent` and `MJConfirmDialogType` from `@memberjunction/ng-ui-components`). The dashboard tab's two Dashboard Studio confirms still render `ConfirmDialogComponent`.
  - **`mj-dashboard-editor`** (`DashboardEditorComponent`, `@memberjunction/ng-dashboards`, declared and exported by `CoreDashboardsModule`) is that editor. A host sets `DashboardId` (and optionally `TitleTemplate`, `ShowOpenInDashboards`, `ShowFavorite`, `BodyStyle` and `StartInEditMode`, two-way with `StartInEditModeChange`), puts its own buttons in the `[headerTools]` and `[viewActions]` slots, and handles `Loaded`, `LoadFailed`, `EditingChange`, `Saved`, `NameChanged`, `ConfigChanged`, `ReloadedFromSaved`, `FavoriteChange`, `NavigationRequested` and `OpenInDashboardsRequested`. A host can read the state `Dashboard`, `Viewer`, `BodyElement`, `IsEditing`, `IsSaving`, `EditingName`, `EditingDescription`, `Permissions`, `CanEdit`, `PartTypes`, `IsSharedWithUser`, `IsFavorite`, `HasUnsavedChanges`, `PartDialogMode`, `EditPartPanel` and `IsFill`, and call `EnterEditMode()`, `ToggleEditMode()`, `CancelEdit()`, `SaveDashboard()`, `Save()`, `ToggleFavorite()`, `RefreshPermissions()`, `OpenAddPartDialog()`, `OnPartDialogSaved()`, `ClosePartDialog()` and `OnNameBlur()`. The package also exports `DashboardViewerFactory` (`Create()`), `DashboardEditorBodyStyle`, `DashboardEditorLoadError`, `DashboardSaveOverrides`, `DashboardEditorTitleContext` and `DASHBOARD_SAVE_IN_PROGRESS`.
  - **More in `@memberjunction/ng-dashboards`:** `DashboardsCategoriesResourceComponent` (the Categories page, with `LoadDashboardsCategoriesResource()`) and the Dashboards app helpers `DASHBOARDS_APP_NAME`, `DASHBOARDS_LIBRARY_NAV_ITEM`, `FindDashboardsApp()`, `DashboardsAppOpenOptions()`, `DashboardNameMaxLength()`, `CreateBlankDashboard(md, name, categoryId?)`, `AutoInstallDashboardsApp()` and `EnsureDashboardsApp()`.
  - **`DashboardBrowserResourceComponent`** (`@memberjunction/ng-dashboards`) is the Library page; its tab is titled Library. It adds `LibraryFilter`, `LibraryCounts`, `VisibleDashboards`, `IsFlatView`, `EmptyState`, `FavoriteIds`, `OwnerLabels` and `OnDashboardFavoriteToggle()`; the rail's `RailSections`, `RailActiveId`, `RailCollapsed`, `RailExpandedIds`, `OnRailItemClicked()`, `OnRailItemToggled()` and `OnRailCollapsedChange()`; and the name dialog's `ShowNewDashboardDialog`, `IsCreatingDashboard`, `NewDashboardNameMaxLength`, `OpenNewDashboardDialog()`, `OnNewDashboardNamed()` and `OnNewDashboardCancelled()`. `CreateDashboard()` and `createDashboard()` are deprecated: they open the name dialog and no longer create a dashboard themselves. The Library no longer shows or edits a dashboard itself (a click opens the dashboard's tab), so these members and their camelCase aliases are removed: the in-page viewer (`Mode`, `SelectedDashboard`, `DashboardViewer`, `SelectedDashboardPermissions`, `OpenDashboard()`, `EditDashboard()`, `BackToList()`, `OnNavigationRequested()`, `OnPanelInteraction()`, `OnBreadcrumbNavigate()`), edit mode (`ToggleEditMode()`, `SaveDashboard()`, `CancelEdit()`, `EditingName`, `EditingDescription`, `OnNameBlur()`), the add part dialog (`OpenAddPartDialog()`, `ShowAddPanelDialog`, `OnPanelAdded()`, `OnAddPanelCancelled()`), the part settings dialog (`ShowConfigDialog`, `ConfigDialogPanel`, `ConfigDialogPartType`, `ConfigDialogClass`, `OpenConfigDialog()`, `OnConfigDialogSaved()`, `OnConfigDialogCancelled()`), the remove confirm (`ShowConfirmDialog`, `ConfirmPanelId`, `ConfirmPanelTitle`, `OpenRemoveConfirmDialog()`, `OnRemoveConfirmed()`, `OnRemoveCancelled()`) and the share dialog (`ShowShareDialog`, `OpenShareDialog()`, `CloseShareDialog()`, `OnShareDialogResult()`). `openInNewTab()` is removed too.
  - **`HomeDashboardComponent`** (`@memberjunction/ng-dashboards`) adds the methods `OpenDashboardInHome()`, `GoHome()`, `OnSwitcherPick()`, `ManagePins()`, `OpenNewDashboardDialog()`, `OnNewDashboardNamed()`, `OnNewDashboardCancelled()`, `OpenDashboardInDashboardsApp()`, `PinName()`, `OnPinNameEnter()`, `OnPinMenuKeydown()`, `OnPinnedExpandedChange()`, `OnDashboardNavigationRequested()`, `OnDashboardEditingChange()`, `OnDashboardSaved()`, `OnDashboardViewLoaded()` and `OnDashboardViewLoadFailed()`, and the state `CurrentDashboard`, `CurrentDashboardId`, `CurrentDashboardName`, `DashboardStartsInEditMode`, `IsDashboardEditing`, `PinnedDashboards`, `PinnedExpanded`, `ShowOverview` (false while a dashboard shows), `ShowDashboardView`, `ShowQuickAccess`, `ShowNewDashboardDialog`, `IsCreatingDashboard`, `NewDashboardNameMaxLength`, `PinSections`, `GreetingName`, `PinMenuGroupLabelId` and `PinMenuMaxHeight`. Its `IsEditing()` is true while that dashboard is being edited, and `CurrentUser` has an optional `FirstName`.
  - **`DashboardResource`** (`@memberjunction/ng-explorer-core`, the dashboard tab) shows a Config dashboard in `mj-dashboard-editor`. It adds `ConfigDashboardId`, `CanShare`, `IsPinnedToHome` and `PinToHome()`, and the editor event handlers `OnEditorLoaded()`, `OnEditorLoadFailed()`, `OnEditorEditingChange()`, `OnEditorNameChanged()`, `OnEditorConfigChanged()`, `OnEditorReloaded()`, `OnEditorFavoriteChange()` and `OnEditorNavigationRequested()`. `ToggleEditMode()`, `CancelEdit()`, `SaveDashboard()`, `OpenAddPartDialog()`, `EditingName`, `EditingDescription` and `DashboardPermissions`, and their camelCase aliases, are deprecated and call the editor. `ConfigDashboard`, `IsEditMode` and `DashboardPermissions` are read-only, and the `configDashboard`, `isEditMode` and `dashboardPermissions` setters are removed, so a subclass that writes them no longer compiles. Before a dashboard loads, `DashboardPermissions` allows nothing.
  - **New in `@memberjunction/ng-shared`:** `DashboardFavoritesService` (dashboard favorites in `MJ: User Favorites`, with `IsDashboardEntity()` and `DashboardFavoriteIds()`); `BuildDashboardPinInput()` and `DASHBOARD_PIN_RESOURCE_TYPE`, the Home pin that the dashboard tab and Home store for a dashboard; and `MOVED_NAV_ITEMS` with `MovedNavItem`, `FindMovedNavItem()`, `FindMovedNavItemApp()`, `ResolveMovedNavItem()`, `MovedNavItemApp` and `ResolvedMovedNavItem`. `NavigationService.SwitchToApp` opens a moved nav item in its new app, and the new `NavigationService.RetargetMovedNavItemTabs()` and `WatchMovedNavItemTabs()` move the saved tabs of a moved nav item. `HomeAppPinService` matches a dashboard pin by its `dashboardId` or `recordId`, in any letter case, and `CaptureThumbnail()` takes an optional timeout.
  - **`NavigationService.OpenDashboard` options** (`DashboardNavigationOptions`, `@memberjunction/ng-shared`): `applicationId` names the application the dashboard's tab belongs to (default: Home), and `openInEditMode` opens the dashboard in edit mode on the usual tab path (no forced new tab): the tab it opens in (the replaced preview tab, or a new tab) starts in edit mode, and a tab already open for the dashboard is focused and enters edit mode. The tab's component is also told through `DashboardEditModeRequested$`. The tab takes the request once with `TakeDashboardEditModeRequest(tabId, dashboardId, applicationId)`; the application check keeps a cached component of the same dashboard from another application's tab from taking it.
  - **Agent context:** the Library, the Categories page, the dashboard tab and Home report their state to the agent. The Library reports its filter with per-filter counts (`LibraryCounts`) and the dashboards opened last (`RecentlyOpenedNames`), and Categories opens a category in the Library (`OpenCategoryInLibrary`). Home reports its view (`HomeView`: Overview or Dashboard), the dashboard it shows (`CurrentDashboardName`, `CurrentDashboardID`, `IsEditingDashboard`) and the pinned dashboards the switcher lists (`PinnedDashboardNames`, plus `PinnedDashboardNameCount` when the list is capped). Home's new `SwitchHomeDashboard` tool shows a pinned dashboard by name or id, or the overview for "Home", and asks the user first when the open dashboard has unsaved changes; `OpenPin` opens a pinned Config dashboard inside Home and leaves pin edit mode. The tools of the Library, Categories and Home read, search, filter or navigate; none creates, renames, edits, shares or deletes a dashboard or a category. The dashboard tab reports the open dashboard; its read tools read it, and its Dashboard Studio tools ask the user before a save or a pin.
  - **Fix: saving a dashboard no longer reloads its tab in a loop.** The save froze the page, because each tab reload started the next one. The dashboard tab now reports a save as the dashboard's new name (the tab keeps its dashboard id and takes the saved name as its title), not as a record save, which rewrote the component's record id to `ID|<uuid>`. The tab container's reload check also accepts that form: the new `TabContainerComponent.IsSameRecordId` treats a single-field URL segment and its bare value as the same record. The loop was already on `next`.
  - **Fix: `mj-dashboard-viewer` (`@memberjunction/ng-dashboard-viewer`) fills its box in a scaled host.** The viewer sizes Golden Layout to the layout container's layout size (`offsetWidth` / `offsetHeight`, which Golden Layout also reads when it resizes with the container), not its on-screen size, so a dashboard shown scaled (with CSS `zoom` or a transform) no longer lays out at the scaled size and leaves an empty band.
  - **Fix: the panels of a dashboard in a tab no longer grow from zero height after Edit or Save.** The shell's stack animation now applies only to the shell's own layouts.
  - **Fix: a dashboard loaded into DashboardEngine's cache (or any `MJ: Dashboards` object built with `GetEntityObject()` then `LoadFromData()`) now has the loaded values as its old values.** Before, its `UIConfigDetails` and `UserID` kept the defaults of a new dashboard. That made a clean dashboard look changed and made `Revert()` put back the defaults.

### Patch Changes

- 57fea6a: `UserInfoEngine` no longer caches `MJ: User Record Logs`. A row in that table is written every time a user opens a record, which makes it a poor fit for an engine cache. On the server the engine loaded every user's logs with no filter. So every record open became an in-memory update and a cross-server publish on every MJAPI, and the logs grew without bound in each process's memory. Nothing on the server read them. The entity also ships with `TrustServerCacheCompletely = false`, so it was the one engine config the periodic engine sweep queried on a stock installation.
  - **New:** `UserInfoEngine.LoadRecentRecordLogs(maxItems, contextUser?, provider?)` queries a user's logs, newest first, limited to `maxItems`. It does not need `Config()` to have run. It returns `[]` when there is no user, and when the query fails (the error is logged).
  - **Removed:** the `UserRecordLogs` getter and `GetRecentRecordsForEntity()`. Nothing in MJ called `GetRecentRecordsForEntity()`. Callers of `UserRecordLogs` move to `await LoadRecentRecordLogs(n)`.
  - **Callers updated:** `RecentAccessService.LoadRecentItems`, the omnibar's `#` empty state, `SearchService.GetRecentlyOpenedRecords` and the Data Explorer's recent records now query on demand. Each passes its own provider. "Recents" now costs one small indexed query when it is shown, instead of a cache read.
  - **22 log, run and audit entities no longer take part in caching** (`AllowCaching = false` in `metadata/entities/.audit-related-entities.json`). They were marked `TrustServerCacheCompletely = false`, which kept them out of the server RunView cache, but every save still went through the cache machinery. These tables are written constantly and read with filters that any write invalidates, so caching them costs work on every write and almost never hits. `AllowCaching = false` says "don't cache this" directly and skips that work. Their `TrustServerCacheCompletely` values are unchanged. `MJ: Record Changes` keeps `AllowCaching` as it was. `MJ: Action Execution Logs` is not changed here.
  - **Integration checks S25 and C12** used `MJ: Audit Logs` as their example of a cacheable but untrusted entity. They now enable `AllowCaching` on the test process's in-memory metadata for their own duration and restore it, so they still exercise the trust branch. Nothing is written to the database.

- b8a9e5e: Remove nested `UUIDsEqual` scans where both lists grow with the data or the code runs on every render. Fix one cross-database lookup bug.
  - **Rubric publish validation could miss advisory parents.** `ValidateRubricTree` looked a raw `parentId` up in a map with normalized keys. On SQL Server (upper-case IDs) the advisory-ancestor walk silently stopped, so a non-advisory criterion under an advisory group was not reported. The map is now a `UUIDMap`.
  - **Per-render getters no longer rescan the entity list.** The Entity form's `FormChromeCandidates`, the Data Explorer's `RecentEntities` / `FavoriteEntities` and the storage admin's `FilteredAccountRows` now read cached or once-built indexes.
  - **Entity lookups by ID** in the ERD, the get-entity-details and list-entities actions, recent-access and the form builder now use the provider's indexed `EntityByID`. The application dialog uses a once-built index.
  - **Other once-built indexes:** tag lookups, permission grantee names, orphaned-conversation owners and flow-editor node moves.
  - `createFakeProvider` (`ng-test-utils`) now implements `EntityByID`, like a real provider.
  - **New helper:** `GroupByUUID(items, getId?)` in `@memberjunction/global` groups items by a UUID in one pass, each group in input order.
  - **Server sites that matched two growing lists:** the user cache (users × user roles), resource-permission deduplication, user/role sync, default-app user applications, scheduled-job statistics, MCP action discovery, REST connector schema introspection and rubric calibration.
  - **Offline tools:** CodeGen relationship sync and CHECK-constraint value lists, CodeGen's related-entity form lookups, and `mj artifacts reclassify`.
  - **Angular screens that scale with the data:** the AI Agent form's linked prompts and actions, the prompt priority matrix, the Testing explorer, the conversations message cache, the Query Browser tree, the Actions overview and categories, the dashboard browser, list-form bulk remove and credentials bulk actions.

  Behaviour is unchanged otherwise, and each site has a test that also passes against the old code.

- Updated dependencies [a709bb6]
- Updated dependencies [432cb73]
- Updated dependencies [1d6e3e8]
- Updated dependencies [49f26d9]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [7316ac3]
- Updated dependencies [08b3d7b]
- Updated dependencies [1ea4085]
- Updated dependencies [aee2d53]
- Updated dependencies [25f7b82]
- Updated dependencies [90829e3]
- Updated dependencies [aac148b]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [57fea6a]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/ng-base-types@6.2.0-edge.4
  - @memberjunction/theme-engine@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [ec97ad4]
- Updated dependencies [49e0bd8]
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/ng-base-types@6.2.0-edge.3
  - @memberjunction/theme-engine@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [e97d95c]
- Updated dependencies [2552b1e]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [0adaf76]
- Updated dependencies [ef43cf3]
- Updated dependencies [b44c7cf]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/ng-base-types@6.2.0-edge.2
  - @memberjunction/theme-engine@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
  **without breaking a single consumer**.

  Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
  it — a delegating method or function, a getter/setter pair for a property, and for Angular a
  readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
  template still binding the old name keeps receiving events. Old names still compile, still resolve,
  and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
  point callers at the replacement. Where a package re-exports through an explicit `export { … }`
  list, the new name is added alongside the old, so the correct name is actually on the public surface
  rather than merely declared.

  The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
  several of those shapes change a type contract while still compiling in the package that declares
  them:
  - an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
    would promote `foo?` to a required member and break every object literal that omits it;
  - a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
    assigned to it, and an accessor stub changes what they must supply;
  - a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
    accessor (TS2610);
  - a name whose PascalCase form is **already bound** in that file or class;
  - decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
    overload sets and abstract members.

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

- Updated dependencies [a50948e]
- Updated dependencies [0eeb89d]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [307da67]
- Updated dependencies [a7da50b]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/theme-engine@6.2.0-edge.1
  - @memberjunction/ng-base-types@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- e225ece: Login screen: a composable Explorer surface — theme it, rearrange it, extend it.

  The sign-in page was the one Explorer surface a deployment could not adapt without forking the
  component or writing CSS against its internal class names. It is now customized the same three
  ways the rest of MJ is, each additive and each defaulting to today's rendering:
  - **Tokens** — a `--mj-login-*` group covers the whole surface: `--mj-login-banner-bg` (the story
    panel's background; the stock gradient is its default, so a theme can retarget just the
    `--mj-login-grad-*` stops or replace the value outright), banner text and logo, the
    editorial split, the panel surface, the picker width, and both card surfaces. Only the gradient
    stops carry dark-mode values — everything else either references a semantic token that swaps on
    its own or is theme-constant by design. Documented in THEMING.md.
  - **Layout** — `LoginLayout`: `'split'` (stock), `'split-reverse'` (mirrored; DOM order unchanged,
    so the story stays first for a screen reader), `'centered'` (one column: story on a full-bleed
    banner background, sign-in options in a card on top). A layout moves regions; it never drops one.
  - **Content** — `LoginHeading`, `LoginShowPoweredBy`, `LoginBannerAlignment`, `LoginBannerTitle`,
    `LoginBannerSubtitle`, `LoginBannerLogoLabel`, and `LoginCards`: a `MJLoginCard[]` of tiles
    (icon, title, text, optional sanitized link) each naming its region, so content a deployment
    wants to add is configuration rather than markup.
  - **Slots** — the `mjLoginSlot` directive (the shape of `mjChatSlot` in `ng-conversations`) projects
    templates into `bannerContent` (replaces the brand block), `bannerFooter`, `panelHeader` and
    `panelFooter`. Replace-vs-augment is stated per slot; a footer slot takes over from that region's
    cards. `<mj-login-picker>` is deliberately not replaceable — a host surrounds sign-in, not owns it.

  Also fixes a latent clipping bug this made easy to hit: the app shell sets
  `html, body { overflow: hidden }`, so login content taller than the viewport was unreachable — which
  already affected a tenant with many identity providers on a short screen. Both columns now scroll
  their own content and centre with auto margins rather than `justify-content: center`, which would
  strand the overflow above the scroll origin.

  Review follow-ups: the card's focus ring took `border-radius: inherit`, which resolves to `0` on a
  pseudo-element (the property is not inherited, and `inherit` takes from the originating anchor
  rather than the positioned card), so it drew square around a rounded tile; the login screen gains
  the repo's first `@media (forced-colors: active)` block, since Windows High Contrast substitutes
  the card fill, border token and hover tint away and this is the one surface a user meets before
  any other; and landscape phones are handled, where the width-only breakpoints left the sign-in
  controls off the bottom of the screen.

  The stacked layout's banner is now sized by its height rule rather than by a flex grow ratio. It
  carried `flex: var(--mj-login-banner-flex, 1.05)`, whose shorthand sets flex-basis to `0%`, so
  every `height` in the stacked breakpoints was dead — invisible until the sign-in column gained
  `overflow-y: auto`, which dropped its automatic minimum size to zero and handed the layout to the
  ratio. So THIS DOES CHANGE the stacked banner for an app that binds nothing: 183px to 92px at
  844x390 and 277px to 196px at 820x560, in both cases returning the sign-in options to the screen.
  Portrait is deliberately unchanged at 422px.

  Two tokens are added alongside `--mj-login-panel-text` — `--mj-login-panel-text-secondary` and
  `--mj-login-panel-text-muted` — so a themed panel carries the picker's whole text ramp instead of
  only its body colour. Both default to the semantic tokens.

  Apart from the stacked banner above, no behaviour or visual change for an app that binds nothing,
  projects nothing and themes nothing.

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [a8be410]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8a5d2c0]
- Updated dependencies [2c590b0]
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/ng-base-types@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0
  - @memberjunction/theme-engine@6.2.0-edge.0

## 6.1.0

### Patch Changes

- 4273317: Accessibility: shell landmarks + skip link, focus containment, and focus-ring token safety.

  Fixes eight WCAG 2.1 A/AA findings raised against the Explorer shell and shared primitives. A ninth — `mj-dropdown` having no way to be given an accessible name — was fixed independently on this line by #3860 and its follow-ups while this work was in flight, so it is not part of this changeset.

  **Shell (`ng-explorer-core`)**
  - Adds a "Skip to main content" link as the first focusable element in the shell, and marks the routed content region as the `main` landmark (`role="main"`, focusable target). **Consuming apps that added their own skip link should remove it on upgrade** — the shell's now comes first in DOM order, and two stacked skip links is worse than none.
  - The global search input, the account/avatar button and the mobile-nav toggle now carry real accessible names. The avatar's name lives on the button, so it survives the icon-fallback path when the avatar image fails to load.
  - The closed mobile nav drawer and the closed search popup are now `inert` and `visibility: hidden` (transitioned so the slide-out still animates). They previously kept every control inside them in the tab order while closed. When the drawer closes with focus inside it, focus returns to the toggle instead of dropping to `<body>`.
  - The command palette already had `role="dialog"`/`aria-modal`; it now also traps Tab while open and returns focus to whatever was focused when it opened. `aria-modal` never stopped Tab on its own.

  **Focus-ring tokens (`ng-shared-generic`)**
  - New `--mj-focus-ring-color` companion to `--mj-focus-ring`. `--mj-focus-ring` is a two-part box-shadow value: `outline: 2px solid var(--mj-focus-ring)` looks correct, parses, and renders nothing. Use `--mj-focus-ring` in `box-shadow` and `--mj-focus-ring-color` in `outline`. A new `check:focus-ring` gate fails on the broken form.

  **Whiteboard (`ng-whiteboard`)**
  - The eleven bare single-character tool shortcuts (`v h p r s t m w i c e`) listened on `document` and fired anywhere on the page, failing WCAG 2.1.4. They are now scoped to focus being inside the whiteboard host, which is made click-focusable for that purpose. Scoping covers the host's whole keydown handler, so undo/redo (`Cmd/Ctrl+Z`, `+Y`), `Escape` and `Delete`/`Backspace` are focus-gated too — a board that swallows the document's `Cmd+Z` from anywhere on the page is its own bug. **Behavior change**: none of these fire while focus is elsewhere on the page. `EnableGlobalShortcuts` restores the old behavior for surfaces that accept the exposure.

- b915983: Align the Angular toolchain on the current 21.x patch line: framework packages 21.1.3 → 21.2.22,
  CLI/builders 21.1.3 → 21.2.23, CDK 21.1.3 → 21.2.14, ng-packagr → 21.2.7, PrimeNG 21.1.1 → 21.1.9.

  This is a patch-level move inside the supported Angular 21 LTS line, not a framework migration.
  It closes every open Angular security advisory on the repository — fifteen distinct GHSAs
  (i18n and template-sanitizer XSS bypasses, service-worker header leakage and credential
  stripping, HttpTransferCache cross-request leakage, and formatDate/number-format DoS), all fixed
  in 21.2.19 or earlier — which together accounted for 438 of the 749 open Dependabot alerts.

  Every published `@memberjunction/ng-*` package's `@angular/*` peer range moves from `^21.1.3`
  (or `^21.0.0`) to `^21.2.22`, so consumers must be on at least that patch. The era-6 platform
  manifest in `release-lines.json` records the new pin; era 5 (the certified 5.51 line) is
  unchanged.

  Also moves the exact `@angular/*` runtime pins that 23 libraries carried in `dependencies`
  into caret `peerDependencies` (adding the missing peers on `ng-react`), so a consumer on any
  in-range Angular 21.2.x build gets a single Angular copy instead of a nested second runtime, and
  drops the unused `primeng` peer from `ng-base-forms` (nothing in the repo imports PrimeNG).

- 92f2ac9: Repo-wide sweep of code that assumed an entity's primary key is a single column named `ID`, plus a `PrimaryKeyCompliance` gate in `@memberjunction/core` so the pattern cannot come back.

  MJ supports primary keys with any column name(s) and type(s). Every MJ core entity happens to use `ID`, so hardcoding it works across the whole core product and silently breaks on customer entities mapped from external schemas — `Load()` rejects the invented field name, or a composite key is truncated to its first column. #4179 (search result click-through) was one instance; this sweep found the same shape in ~90 files and fixes all of it on top of the `CompositeKey.FromURLSegment` / `FromEntityRecord` / `ToCompactURLSegment` primitives introduced with that fix.

  **What changed, by kind**
  - **Literal `ID` key construction** (`{ FieldName: 'ID', Value: x }`, `LoadFromSingleKeyValuePair('ID', …)`, `FromKeyValuePair('ID', …)`) — ~135 sites. Where the entity is a literal MJ core entity the key is now `CompositeKey.FromID(x)`, the one sanctioned way to say "this entity's key is `ID`". Where the entity is a variable (an event's `EntityName`, an `entityInfo`, a configured entity) the key is `CompositeKey.FromURLSegment(entityInfo, recordId)`, which reads a bare value or a `F1|v1||F2|v2` segment against the entity's real primary key(s).
  - **`PrimaryKeys[0]` → `FirstPrimaryKey`** — 39 sites. Same semantics, a named accessor the gate can track. IS-A shared-key and keyset uses are annotated `// first-pk-ok`.
  - **Real defects fixed** (arbitrary entity keyed as `ID`): Mobile app record load/edit/offline sync; the generic form overlay; the ERD "open record" path; version-history label/diff/micro-view links (which stripped `ID|` off a stored key and re-wrapped the value as `ID`); `RestoreEngine` and `buildPrimaryKeyForLoad`; the Apollo enrichment connector (six `GetEntityObject(configuredEntity, FromID(record.ID))` calls); geocoding record reload; List Detail record-open (composite keys now open instead of showing a notice); `EmbeddedRecord`; `DatabaseReferenceScanner`; hardcoded `ID` filters on a variable entity in Data Explorer's record load, Predictive Studio's label lookup, the realtime-widget visitor identity lookup, `DuplicateRecordDetector.LoadRecordsByListID`, and MetadataSync's `@lookup` GUID conversion.
  - **REST API**: `EntityCRUDHandler` / `RESTEndpointHandler` built the key from the `:id` segment for single-column keys only and threw "Composite primary keys are not supported". Both now accept a bare value or a URL-encoded `Field1|Value1||Field2|Value2` segment. Single-column behavior is unchanged.
  - **One serializer instead of eight**: `ListOperations.serializeRecordId`, `list-set-operations.serializeRecordId`, RecordSetProcessor's `serializeRecordId`, `GetListRecordsAction`'s inline copy, `MJListDetailEntityExtended.BuildRecordID` / `GetCompositeKey`, `record.util.buildCompositeKey`, `VersionHistory.buildCompositeKeyFromRecord` and `ChangeDetector.buildDeleteItem` all delegate to `CompositeKey.FromEntityRecord(...).ToCompactURLSegment()` / `FromURLSegment(...)`. Output is byte-identical for single-column keys.

  **`FirstPrimaryKey` triage** — every one of the ~390 `FirstPrimaryKey` / `FromID` uses in the repo was read in context and either rewritten or annotated with a reason (154 annotations). Real defects found and fixed along the way, all of the shape "first key column used as the whole key" on an entity that can be composite-keyed:
  - **Data providers**: the deterministic `ORDER BY` fallback for row-limited queries ordered by the first key column only, leaving composite-key pages in undefined order; it now orders by every key column. Saved-view run logging / exclusion and the `{%UserView%}` template subquery, whose persisted `RecordID` cannot hold a composite key, now refuse loudly instead of excluding wrong rows. The dependency-link subquery now predicates on the full key. Single-column SQL is byte-identical.
  - **CodeGen**: generated cascade delete/update procs bound the child FK to `@<firstPK>` regardless of which parent key column the FK references; a composite key containing an identity column dropped the other key columns from the generated INSERT (both providers); the PostgreSQL JSON-arg `spCreate` inserted only the first key column; the generated join-grid/timeline filters and the GraphQL audit-log `RecordID` truncated composite keys. Single-key generator output verified byte-identical against `HEAD` (168 shapes).
  - **Smart cache** (`ProviderBase` differential merge): keyed rows on the first PK, so composite-key deletes never applied and rows sharing the first column collapsed.
  - **Integration push sync**: composed record identity from the first key column while the record map stores all columns joined, so every already-synced composite-key row was re-created externally as a duplicate on each full push; the changed-record path silently dropped rows.
  - **Scheduled geocoding orphan cleanup** (destructive): compared a cast of the first key column to a `RecordID` holding all columns, so every geocode row for a composite-key entity was deleted on each run.
  - **Lists**: list membership, export and add-record paths filtered on the first key column and wrote only its value into `ListDetail.RecordID`; Explorer "open record" paths on user-selected entities, duplicate detection, omnibar record search, Data Explorer deep links, the sharing center revoke, recent-access, tree dropdowns, the mobile app's record ids and offline queue.
  - **AI**: duplicate detection, vector sync record ids, Predictive Studio list scope and write-back; the Recommendations engine also wrote a record id into `SourceEntityID` (an FK to Entities) and never set `SourceEntityRecordID`.
  - **Apollo enrichment**: `Accounts` (a customer entity) loaded by literal `ID`; the contacts path read its key off an entity that had never been loaded.
  - Every `entityInfo.FirstPrimaryKey?.Name ?? 'ID'` fallback is gone; where the entity can be missing the code now fails loudly instead of inventing `ID`.

  **The gate** — `packages/MJCore/src/__tests__/PrimaryKeyCompliance.test.ts`, modelled on `MultiProviderCompliance` / `UUIDCompliance`:
  1. _Strict_: a key built with a literal `ID` field name. Marker `// pk-literal-ok: <reason>`.
  2. _Strict_: `PrimaryKeys[0]` / `PrimaryKeys.at(0)`.
  3. _Strict_: `FirstPrimaryKey` and `CompositeKey.FromID(`. These are legitimate only where MJ is single-column by design (foreign-key targets, keyset `ORDER BY` / `AfterKey`, IS-A shared keys, core entities), so every use must be self-evidently on a core entity or say why: `FromID` is exempt when a `'MJ: …'` entity literal is on the same line or within 8 lines above (the `GetEntityObject` / `OpenEntityRecord` naming the core entity); everything else carries `// first-pk-ok: <reason>` on the same line, reason mandatory.
  4. _Strict_: an `ID = …` / `ID IN (…)` `ExtraFilter` or `Fields: ['ID']` within eight lines of an `EntityName:` that is a variable rather than a string literal or ALL_CAPS constant. Marker `// pk-filter-ok: <reason>`.

  Generated code, tests, `dist/`, and the `TestingFramework` / `UnitTesting` packages are not scanned. The rule is written up in `.claude/rules/data-access.md` § "Primary keys: never assume a column named ID". There is no baseline file: all four gates are strict.

  No public signatures change; every edit is additive or a same-shape substitution, so this is `patch` throughout.

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
- 1748491: Search results open for entities whose primary key is not named `ID`, and round-trip composite primary keys end to end.

  Clicking a universal-search result failed with `InnerLoad returned false for key ID=<value>` for any entity whose key column has another name (`individual_id`, `organization_id`, …). Every search navigation site built the key as `{ FieldName: 'ID', Value: RecordID }` or `CompositeKey.FromID(RecordID)`, and `Load()` correctly rejects a field that is not one of the entity's primary keys. MJ supports primary keys with any column name(s) and type(s), so the fix uses the entity's metadata everywhere instead of a literal.

  **The contract.** A search result's `RecordID` is a _compact_ `CompositeKey` segment: the bare value for a single-column key (so `IN (...)` filters, dedup keys and persisted ids are unchanged), the full `Field1|Value1||Field2|Value2` segment for a composite key. `CompositeKey.LoadFromURLSegment(entity, s)` already reads both forms; two new statics make it the one-liner every consumer calls, and one new serializer produces it:
  - `CompositeKey.FromURLSegment(entityInfo, recordId)` — the inverse of the compact form; falls back to an `ID` key only when the entity cannot be resolved.
  - `CompositeKey.FromEntityRecord(entityInfo, row)` — the key from a RunView row using the entity's real primary key column(s).
  - `FieldValueCollection.ToCompactURLSegment()` — bare value for one column, prefixed segment for several (or when a lone value itself contains `|`).
  - `ToWhereClause()` now doubles embedded quotes, since it builds SQL from record ids that can come from an external index.

  **Consumers** (`ng-explorer-core`, `ng-search`): the shell dropdown, the "See all results" page, the omnibar palette (the default search surface — not named in the report), the FK-cell "open related record" path in views and single-search-result, and the two recents name lookups all resolve the key with `FromURLSegment` against the entity's metadata.

  **Producers** (`core`, `search-engine`, `ai-vectors-memory`): `EntitySearchProvider` read `record.ID`, which is `''` for these entities — `SearchFusion` drops empty ids, so the entity lane silently contributed nothing for them; it now builds the key from `PrimaryKeys`. The full-text lane, `SearchEntity`'s lexical pass and its permission filter (`ID IN (...)`, `Fields: ['ID']`), and the in-process `SimpleVectorDatabase` (`row['ID']`, `` `ID|…` ``) do the same. `VectorSearchProvider` no longer flattens a composite key to bare values joined by `||`, which nothing could parse.

  **Permission filter** (`search-engine`): `verifyOwnershipAndRowFilters` verified results with `FirstPrimaryKey IN (...)`. Once composite entities emit real segments that check could never match and — it fails closed — every composite-key result would be dropped as unauthorized. Composite keys now verify with one `(F1=… AND F2=…)` term per record; single-column keys keep the `IN` fast path. Matching is on primary-key values in metadata order, UUID-normalized, so an externally indexed id still matches the row the database returns.

  **Recents** (`ng-shared-generic`): `RecentAccessService` persisted `Values(',')`, which drops field names; composite keys written there could never be reopened. It now writes the compact segment. Existing single-value rows are unchanged and read back as before.

  Also fixed in `core`: `EmbeddedRecord` built its parent-load key with `FromID` for a single-column key, which fails for any embedded entity whose key isn't named `ID`.

- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [b915983]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [1940a4d]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [711c208]
- Updated dependencies [e2ad3c0]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [2412415]
- Updated dependencies [06ccfb2]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [43f9133]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [2cc08e1]
- Updated dependencies [a5f92d2]
- Updated dependencies [2d14c62]
- Updated dependencies [394d276]
- Updated dependencies [c996a56]
- Updated dependencies [de6eb14]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [8ec1515]
- Updated dependencies [9a905e8]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [1fa6f6b]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [394d276]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [080f4cd]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [c643ba3]
- Updated dependencies [e9e9873]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [be0bdb2]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [48ff99f]
- Updated dependencies [076fa5d]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [23c2521]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [394d276]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [0db4f4f]
- Updated dependencies [53d256f]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [1748491]
- Updated dependencies [4cdfdcf]
- Updated dependencies [7fefca2]
- Updated dependencies [a1a8989]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/ng-base-types@6.1.0
  - @memberjunction/theme-engine@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [a987913]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [076fa5d]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [4cdfdcf]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/ng-base-types@6.1.0-edge.7
  - @memberjunction/theme-engine@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- b915983: Align the Angular toolchain on the current 21.x patch line: framework packages 21.1.3 → 21.2.22,
  CLI/builders 21.1.3 → 21.2.23, CDK 21.1.3 → 21.2.14, ng-packagr → 21.2.7, PrimeNG 21.1.1 → 21.1.9.

  This is a patch-level move inside the supported Angular 21 LTS line, not a framework migration.
  It closes every open Angular security advisory on the repository — fifteen distinct GHSAs
  (i18n and template-sanitizer XSS bypasses, service-worker header leakage and credential
  stripping, HttpTransferCache cross-request leakage, and formatDate/number-format DoS), all fixed
  in 21.2.19 or earlier — which together accounted for 438 of the 749 open Dependabot alerts.

  Every published `@memberjunction/ng-*` package's `@angular/*` peer range moves from `^21.1.3`
  (or `^21.0.0`) to `^21.2.22`, so consumers must be on at least that patch. The era-6 platform
  manifest in `release-lines.json` records the new pin; era 5 (the certified 5.51 line) is
  unchanged.

  Also moves the exact `@angular/*` runtime pins that 23 libraries carried in `dependencies`
  into caret `peerDependencies` (adding the missing peers on `ng-react`), so a consumer on any
  in-range Angular 21.2.x build gets a single Angular copy instead of a nested second runtime, and
  drops the unused `primeng` peer from `ng-base-forms` (nothing in the repo imports PrimeNG).

- 92f2ac9: Repo-wide sweep of code that assumed an entity's primary key is a single column named `ID`, plus a `PrimaryKeyCompliance` gate in `@memberjunction/core` so the pattern cannot come back.

  MJ supports primary keys with any column name(s) and type(s). Every MJ core entity happens to use `ID`, so hardcoding it works across the whole core product and silently breaks on customer entities mapped from external schemas — `Load()` rejects the invented field name, or a composite key is truncated to its first column. #4179 (search result click-through) was one instance; this sweep found the same shape in ~90 files and fixes all of it on top of the `CompositeKey.FromURLSegment` / `FromEntityRecord` / `ToCompactURLSegment` primitives introduced with that fix.

  **What changed, by kind**
  - **Literal `ID` key construction** (`{ FieldName: 'ID', Value: x }`, `LoadFromSingleKeyValuePair('ID', …)`, `FromKeyValuePair('ID', …)`) — ~135 sites. Where the entity is a literal MJ core entity the key is now `CompositeKey.FromID(x)`, the one sanctioned way to say "this entity's key is `ID`". Where the entity is a variable (an event's `EntityName`, an `entityInfo`, a configured entity) the key is `CompositeKey.FromURLSegment(entityInfo, recordId)`, which reads a bare value or a `F1|v1||F2|v2` segment against the entity's real primary key(s).
  - **`PrimaryKeys[0]` → `FirstPrimaryKey`** — 39 sites. Same semantics, a named accessor the gate can track. IS-A shared-key and keyset uses are annotated `// first-pk-ok`.
  - **Real defects fixed** (arbitrary entity keyed as `ID`): Mobile app record load/edit/offline sync; the generic form overlay; the ERD "open record" path; version-history label/diff/micro-view links (which stripped `ID|` off a stored key and re-wrapped the value as `ID`); `RestoreEngine` and `buildPrimaryKeyForLoad`; the Apollo enrichment connector (six `GetEntityObject(configuredEntity, FromID(record.ID))` calls); geocoding record reload; List Detail record-open (composite keys now open instead of showing a notice); `EmbeddedRecord`; `DatabaseReferenceScanner`; hardcoded `ID` filters on a variable entity in Data Explorer's record load, Predictive Studio's label lookup, the realtime-widget visitor identity lookup, `DuplicateRecordDetector.LoadRecordsByListID`, and MetadataSync's `@lookup` GUID conversion.
  - **REST API**: `EntityCRUDHandler` / `RESTEndpointHandler` built the key from the `:id` segment for single-column keys only and threw "Composite primary keys are not supported". Both now accept a bare value or a URL-encoded `Field1|Value1||Field2|Value2` segment. Single-column behavior is unchanged.
  - **One serializer instead of eight**: `ListOperations.serializeRecordId`, `list-set-operations.serializeRecordId`, RecordSetProcessor's `serializeRecordId`, `GetListRecordsAction`'s inline copy, `MJListDetailEntityExtended.BuildRecordID` / `GetCompositeKey`, `record.util.buildCompositeKey`, `VersionHistory.buildCompositeKeyFromRecord` and `ChangeDetector.buildDeleteItem` all delegate to `CompositeKey.FromEntityRecord(...).ToCompactURLSegment()` / `FromURLSegment(...)`. Output is byte-identical for single-column keys.

  **`FirstPrimaryKey` triage** — every one of the ~390 `FirstPrimaryKey` / `FromID` uses in the repo was read in context and either rewritten or annotated with a reason (154 annotations). Real defects found and fixed along the way, all of the shape "first key column used as the whole key" on an entity that can be composite-keyed:
  - **Data providers**: the deterministic `ORDER BY` fallback for row-limited queries ordered by the first key column only, leaving composite-key pages in undefined order; it now orders by every key column. Saved-view run logging / exclusion and the `{%UserView%}` template subquery, whose persisted `RecordID` cannot hold a composite key, now refuse loudly instead of excluding wrong rows. The dependency-link subquery now predicates on the full key. Single-column SQL is byte-identical.
  - **CodeGen**: generated cascade delete/update procs bound the child FK to `@<firstPK>` regardless of which parent key column the FK references; a composite key containing an identity column dropped the other key columns from the generated INSERT (both providers); the PostgreSQL JSON-arg `spCreate` inserted only the first key column; the generated join-grid/timeline filters and the GraphQL audit-log `RecordID` truncated composite keys. Single-key generator output verified byte-identical against `HEAD` (168 shapes).
  - **Smart cache** (`ProviderBase` differential merge): keyed rows on the first PK, so composite-key deletes never applied and rows sharing the first column collapsed.
  - **Integration push sync**: composed record identity from the first key column while the record map stores all columns joined, so every already-synced composite-key row was re-created externally as a duplicate on each full push; the changed-record path silently dropped rows.
  - **Scheduled geocoding orphan cleanup** (destructive): compared a cast of the first key column to a `RecordID` holding all columns, so every geocode row for a composite-key entity was deleted on each run.
  - **Lists**: list membership, export and add-record paths filtered on the first key column and wrote only its value into `ListDetail.RecordID`; Explorer "open record" paths on user-selected entities, duplicate detection, omnibar record search, Data Explorer deep links, the sharing center revoke, recent-access, tree dropdowns, the mobile app's record ids and offline queue.
  - **AI**: duplicate detection, vector sync record ids, Predictive Studio list scope and write-back; the Recommendations engine also wrote a record id into `SourceEntityID` (an FK to Entities) and never set `SourceEntityRecordID`.
  - **Apollo enrichment**: `Accounts` (a customer entity) loaded by literal `ID`; the contacts path read its key off an entity that had never been loaded.
  - Every `entityInfo.FirstPrimaryKey?.Name ?? 'ID'` fallback is gone; where the entity can be missing the code now fails loudly instead of inventing `ID`.

  **The gate** — `packages/MJCore/src/__tests__/PrimaryKeyCompliance.test.ts`, modelled on `MultiProviderCompliance` / `UUIDCompliance`:
  1. _Strict_: a key built with a literal `ID` field name. Marker `// pk-literal-ok: <reason>`.
  2. _Strict_: `PrimaryKeys[0]` / `PrimaryKeys.at(0)`.
  3. _Strict_: `FirstPrimaryKey` and `CompositeKey.FromID(`. These are legitimate only where MJ is single-column by design (foreign-key targets, keyset `ORDER BY` / `AfterKey`, IS-A shared keys, core entities), so every use must be self-evidently on a core entity or say why: `FromID` is exempt when a `'MJ: …'` entity literal is on the same line or within 8 lines above (the `GetEntityObject` / `OpenEntityRecord` naming the core entity); everything else carries `// first-pk-ok: <reason>` on the same line, reason mandatory.
  4. _Strict_: an `ID = …` / `ID IN (…)` `ExtraFilter` or `Fields: ['ID']` within eight lines of an `EntityName:` that is a variable rather than a string literal or ALL_CAPS constant. Marker `// pk-filter-ok: <reason>`.

  Generated code, tests, `dist/`, and the `TestingFramework` / `UnitTesting` packages are not scanned. The rule is written up in `.claude/rules/data-access.md` § "Primary keys: never assume a column named ID". There is no baseline file: all four gates are strict.

  No public signatures change; every edit is additive or a same-shape substitution, so this is `patch` throughout.

- 1748491: Search results open for entities whose primary key is not named `ID`, and round-trip composite primary keys end to end.

  Clicking a universal-search result failed with `InnerLoad returned false for key ID=<value>` for any entity whose key column has another name (`individual_id`, `organization_id`, …). Every search navigation site built the key as `{ FieldName: 'ID', Value: RecordID }` or `CompositeKey.FromID(RecordID)`, and `Load()` correctly rejects a field that is not one of the entity's primary keys. MJ supports primary keys with any column name(s) and type(s), so the fix uses the entity's metadata everywhere instead of a literal.

  **The contract.** A search result's `RecordID` is a _compact_ `CompositeKey` segment: the bare value for a single-column key (so `IN (...)` filters, dedup keys and persisted ids are unchanged), the full `Field1|Value1||Field2|Value2` segment for a composite key. `CompositeKey.LoadFromURLSegment(entity, s)` already reads both forms; two new statics make it the one-liner every consumer calls, and one new serializer produces it:
  - `CompositeKey.FromURLSegment(entityInfo, recordId)` — the inverse of the compact form; falls back to an `ID` key only when the entity cannot be resolved.
  - `CompositeKey.FromEntityRecord(entityInfo, row)` — the key from a RunView row using the entity's real primary key column(s).
  - `FieldValueCollection.ToCompactURLSegment()` — bare value for one column, prefixed segment for several (or when a lone value itself contains `|`).
  - `ToWhereClause()` now doubles embedded quotes, since it builds SQL from record ids that can come from an external index.

  **Consumers** (`ng-explorer-core`, `ng-search`): the shell dropdown, the "See all results" page, the omnibar palette (the default search surface — not named in the report), the FK-cell "open related record" path in views and single-search-result, and the two recents name lookups all resolve the key with `FromURLSegment` against the entity's metadata.

  **Producers** (`core`, `search-engine`, `ai-vectors-memory`): `EntitySearchProvider` read `record.ID`, which is `''` for these entities — `SearchFusion` drops empty ids, so the entity lane silently contributed nothing for them; it now builds the key from `PrimaryKeys`. The full-text lane, `SearchEntity`'s lexical pass and its permission filter (`ID IN (...)`, `Fields: ['ID']`), and the in-process `SimpleVectorDatabase` (`row['ID']`, `` `ID|…` ``) do the same. `VectorSearchProvider` no longer flattens a composite key to bare values joined by `||`, which nothing could parse.

  **Permission filter** (`search-engine`): `verifyOwnershipAndRowFilters` verified results with `FirstPrimaryKey IN (...)`. Once composite entities emit real segments that check could never match and — it fails closed — every composite-key result would be dropped as unauthorized. Composite keys now verify with one `(F1=… AND F2=…)` term per record; single-column keys keep the `IN` fast path. Matching is on primary-key values in metadata order, UUID-normalized, so an externally indexed id still matches the row the database returns.

  **Recents** (`ng-shared-generic`): `RecentAccessService` persisted `Values(',')`, which drops field names; composite keys written there could never be reopened. It now writes the compact segment. Existing single-value rows are unchanged and read back as before.

  Also fixed in `core`: `EmbeddedRecord` built its parent-load key with `FromID` for a single-column key, which fails for any embedded entity whose key isn't named `ID`.

- Updated dependencies [2c826f7]
- Updated dependencies [b915983]
- Updated dependencies [b7819d2]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [43f9133]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [e9e9873]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [1748491]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/ng-base-types@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/theme-engine@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- 4273317: Accessibility: shell landmarks + skip link, focus containment, and focus-ring token safety.

  Fixes eight WCAG 2.1 A/AA findings raised against the Explorer shell and shared primitives. A ninth — `mj-dropdown` having no way to be given an accessible name — was fixed independently on this line by #3860 and its follow-ups while this work was in flight, so it is not part of this changeset.

  **Shell (`ng-explorer-core`)**
  - Adds a "Skip to main content" link as the first focusable element in the shell, and marks the routed content region as the `main` landmark (`role="main"`, focusable target). **Consuming apps that added their own skip link should remove it on upgrade** — the shell's now comes first in DOM order, and two stacked skip links is worse than none.
  - The global search input, the account/avatar button and the mobile-nav toggle now carry real accessible names. The avatar's name lives on the button, so it survives the icon-fallback path when the avatar image fails to load.
  - The closed mobile nav drawer and the closed search popup are now `inert` and `visibility: hidden` (transitioned so the slide-out still animates). They previously kept every control inside them in the tab order while closed. When the drawer closes with focus inside it, focus returns to the toggle instead of dropping to `<body>`.
  - The command palette already had `role="dialog"`/`aria-modal`; it now also traps Tab while open and returns focus to whatever was focused when it opened. `aria-modal` never stopped Tab on its own.

  **Focus-ring tokens (`ng-shared-generic`)**
  - New `--mj-focus-ring-color` companion to `--mj-focus-ring`. `--mj-focus-ring` is a two-part box-shadow value: `outline: 2px solid var(--mj-focus-ring)` looks correct, parses, and renders nothing. Use `--mj-focus-ring` in `box-shadow` and `--mj-focus-ring-color` in `outline`. A new `check:focus-ring` gate fails on the broken form.

  **Whiteboard (`ng-whiteboard`)**
  - The eleven bare single-character tool shortcuts (`v h p r s t m w i c e`) listened on `document` and fired anywhere on the page, failing WCAG 2.1.4. They are now scoped to focus being inside the whiteboard host, which is made click-focusable for that purpose. Scoping covers the host's whole keydown handler, so undo/redo (`Cmd/Ctrl+Z`, `+Y`), `Escape` and `Delete`/`Backspace` are focus-gated too — a board that swallows the document's `Cmd+Z` from anywhere on the page is its own bug. **Behavior change**: none of these fire while focus is elsewhere on the page. `EnableGlobalShortcuts` restores the old behavior for surfaces that accept the exposure.

- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [905820a]
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/ng-base-types@6.1.0-edge.5
  - @memberjunction/theme-engine@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [de6eb14]
- Updated dependencies [1fa6f6b]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/ng-base-types@6.1.0-edge.4
  - @memberjunction/theme-engine@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [07cb22e]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/ng-base-types@6.1.0-edge.3
  - @memberjunction/theme-engine@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/ng-base-types@6.1.0-edge.2
  - @memberjunction/theme-engine@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ng-base-types@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1
  - @memberjunction/theme-engine@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/ng-base-types@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0
  - @memberjunction/theme-engine@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ng-base-types@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/global@6.0.0
  - @memberjunction/theme-engine@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/ng-base-types@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/global@5.51.0
  - @memberjunction/theme-engine@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ng-base-types@5.50.0
  - @memberjunction/global@5.50.0
  - @memberjunction/theme-engine@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [1a15bd2]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ng-base-types@5.49.0
  - @memberjunction/theme-engine@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/ng-base-types@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ng-base-types@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/ng-base-types@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/ng-base-types@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/ng-base-types@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ng-base-types@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/ng-base-types@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [9b9b484]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/ng-base-types@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/ng-base-types@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ng-base-types@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ng-base-types@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/ng-base-types@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Minor Changes

- 4bc6fb4: feat(forms): FK dropdown scope picker, per-user persistence, and a centralized search-highlight theme token

  Enhancements to `<mj-form-field>`'s foreign-key autocomplete in `@memberjunction/ng-base-forms`:
  - **Search-field scope picker** — a pill (shown only while focused) lets the user
    choose which related-entity field the dropdown searches: the Name field by
    default, any shown column, or other searchable fields like ID. Exactly one
    targeted `LIKE` (DB) or one in-memory scan (cached) — never all columns.
  - **Configurable visible columns** — an eye toggle per field shows/hides it as a
    grid column, letting users surface normally-hidden fields (e.g. ID) or drop
    defaults.
  - **Per-user persistence** via a new `LinkedFieldOptionsStore` (backed by
    `UserInfoEngine`, one settings key): search scope, sort column/direction,
    column widths, and visible-column set are remembered per (entity, FK field).
    Nothing is written unless the user customizes.
  - **Column resize** — drag a header's edge; widths persist.
  - Plus polish: muted (theme-token) search highlight, fixed whitespace clipping in
    highlighted cells, body-portal render-timing fix for cached fields, and a
    scope/column menu that overlays the results list.

  Design-token addition in `@memberjunction/ng-shared-generic`: new semantic
  `--mj-search-highlight-bg` / `--mj-search-highlight-text` tokens (light + dark) so
  the typed-query `<mark>` highlight is muted and theme-controlled in one place.

  Also migrates the remaining primitive token usages in `ng-base-forms` CSS to
  semantic tokens (package is now 100% semantic tokens), and adds
  `STANDALONE_USAGE.md` documenting how to use these components as general-purpose
  data-bindable controls outside the forms architecture.

- ae74fd5: Auto-detect and render Markdown/HTML in long-text form fields. `MjFormFieldComponent`
  now honors an explicit `EntityField.ExtendedType` (`Markdown`/`HTML`/`Code`) and, when it
  is null, runs lightweight client-side content detection on eligible long-text fields
  (TS-type string with `MaxLength >= 255` or unlimited — generic across SQL Server/PostgreSQL).
  Read mode renders `<mj-markdown>` for Markdown, DOMPurify-sanitized `[innerHTML]` for HTML
  (via the new `mjSafeRichHtml` pipe — see below), and a read-only `<mj-code-editor>` for code;
  edit mode uses `<mj-code-editor>` with syntax highlighting for non-plain modes (mode frozen at
  edit entry), while plain fields keep the existing textbox/textarea.

  Widens the `EntityFieldExtendedType` union and the `CK_EntityField_ExtendedType` CHECK
  constraint to include `Markdown` and `HTML` (migration included — run CodeGen after applying
  to regenerate `EntityFieldEntity` types and metadata).

  Adds a reusable, dependency-free `detectRichTextFormat(value, maxScanLength?)` text classifier
  to `@memberjunction/global` (defaults to scanning the first 500 characters) so any consumer can
  sniff Markdown/HTML/plain content.

  Adds reusable safe-HTML rendering to `@memberjunction/ng-shared-generic`: a `PurifyRichTextHtml()`
  function and an `mjSafeRichHtml` pure pipe backed by DOMPurify (HTML + SVG profiles). Unlike
  Angular's built-in `[innerHTML]` sanitizer (which strips all SVG and inline styles), this keeps
  safe inline SVG and richer markup while still removing `<script>`, `on*` handlers, and
  `javascript:`/`data:` URLs — so it's safe for untrusted content yet renders richer HTML. Any
  Angular component can use `[innerHTML]="value | mjSafeRichHtml"`.

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ng-base-types@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/ng-base-types@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/ng-base-types@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ng-base-types@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/ng-base-types@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/ng-base-types@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/ng-base-types@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/ng-base-types@5.33.0
  - @memberjunction/core-entities@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ng-base-types@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- 0e3365f: Unify the theme storage system to a single localStorage key (`mj-theme`) and eliminate the brief light-mode flash dark-mode users saw on every page load.

  **Root cause of the original flash:** the inline pre-paint script in `index.html` correctly set `data-theme` on first paint based on the user's preference, but `MJExplorerAppComponent.applyLoginTheme()` then ran during Angular bootstrap and re-read a _different_ localStorage key (`'mj-login-theme'`), overriding the script's correct decision before `ThemeService` eventually overrode it back. Result: visible flash on every reload.

  **Fix:** all three theme-aware paths now read/write the same `mj-theme` key.

  `@memberjunction/ng-shared-generic`:
  - `ThemeService.applyBaseThemeAttribute()` mirrors the resolved base theme (`light` or `dark`) to `localStorage['mj-theme']` on every theme application — including initial load from server preference, manual `SetTheme()` calls, and OS-change responses for `'system'` preference. The mirrored value is the _resolved_ base, so the inline pre-paint script can apply the right theme synchronously without needing to read server preference or evaluate `'system'`.
  - `ThemeService.Reset()` deliberately preserves the key (commented why) so the login screen retains the correct theme through logout.

  `@memberjunction/ng-auth-services`:
  - `MJExplorerAuthBase.preservedLocalStorageKeys` now contains `'mj-theme'` (was `'mj-login-theme'`) so the unified key survives logout.

  `@memberjunction/ng-explorer-app`:
  - `MJExplorerAppComponent.THEME_STORAGE_KEY` changed from `'mj-login-theme'` to `'mj-theme'`. The login-screen toggle (`ToggleTheme()`) now writes the unified key. `applyLoginTheme()` reads the unified key with the same lookup the inline script uses, so Angular bootstrap doesn't override the script's decision.

  `@memberjunction/ng-explorer-service-worker`:
  - README backport snippet updated to read only `mj-theme`.

  **Migration impact:** Users with `mj-theme` already populated (most logged-in users after the previous Option B work) see zero impact and instant correct theme on every reload. Users with only the legacy `mj-login-theme` from older versions see one flash on their first visit after this lands; `ThemeService` then writes `mj-theme` on next theme application and they're flash-free forever after. The legacy fallback read was deliberately dropped for code simplicity — the one-time migration flash is an acceptable cost.

  Verified end-to-end via Playwright in a logged-in browser session against a production build: `data-theme` is correctly set at `DOMContentLoaded` and stays consistent through Angular bootstrap. No flash observed. Logout/preserve unit tests in `@memberjunction/ng-auth-services` updated and all 5 pass.

- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/ng-base-types@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- 55de456: Fix missing dependencies across 17 packages that accumulated while knip dependency checking was silently broken. Repair knip infrastructure: disable crashing vitest plugin, harden CI workflow to fail-fast on tool crashes instead of silently passing, and fix hardcoded Angular version in auto-fix script.
- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/core-entities@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
  - @memberjunction/core@5.22.0
  - @memberjunction/core-entities@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/core-entities@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/core-entities@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/core@5.18.0
- @memberjunction/core-entities@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/core-entities@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/core-entities@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/core-entities@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/core-entities@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/core-entities@5.13.0

## 5.12.0

### Minor Changes

- 05f19ff: Add composable query system with semantic catalog search, CTE composition engine, server-side paging, query caching with TTL/dependency invalidation, and agent directive surfacing. Includes QueryCacheManager wrapper over LocalCacheManager, QueryPagingEngine for SQL-level OFFSET/FETCH paging, QueryCompositionEngine for platform-aware CTE generation, and SearchQueryCatalog action for vector-based query discovery. Renames PaginationComponent to DataPagerComponent and extracts into shared module.

### Patch Changes

- a57b8d5: Migrate all hardcoded CSS colors to design tokens for dark mode and white-label support. Introduces `--mj-*` semantic CSS custom properties in `_tokens.scss` with full `[data-theme="dark"]` overrides. Migrates 1,544 of 1,659 hardcoded hex values (93%) across 72+ CSS files to semantic tokens. Adds logo token system (`--mj-logo-mark`, `--mj-logo-color`) for themeable branding. Fixes dark mode theming for CodeMirror, AG Grid v35, and Kendo popups. No API or behavioral changes — CSS only.
- e87d153: design tokens phase 1
- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/core-entities@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/core-entities@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/core@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/core-entities@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/core-entities@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/core-entities@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/core-entities@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/core@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [1692c53]
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/core@5.3.0

## 5.2.0

### Patch Changes

- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0

## 5.1.0

### Patch Changes

- @memberjunction/core@5.1.0
- @memberjunction/core-entities@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/core-entities@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/core-entities@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [ca551dd]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/core@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/core@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/core@3.1.1
- @memberjunction/core-entities@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/core@3.0.0
- @memberjunction/core-entities@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/core-entities@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/core-entities@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/core-entities@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/core@2.130.1
- @memberjunction/core-entities@2.130.1

## 2.130.0

### Patch Changes

- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/core@2.130.0
  - @memberjunction/core-entities@2.130.0

## 2.129.0

### Patch Changes

- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [fbae243]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/core-entities@2.129.0

## 2.128.0

### Patch Changes

- Updated dependencies [f407abe]
  - @memberjunction/core@2.128.0
  - @memberjunction/core-entities@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/core@2.127.0
  - @memberjunction/core-entities@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/core@2.126.1
- @memberjunction/core-entities@2.126.1

## 2.126.0

### Patch Changes

- Updated dependencies [703221e]
  - @memberjunction/core@2.126.0
  - @memberjunction/core-entities@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [bd4aa3d]
  - @memberjunction/core@2.125.0
  - @memberjunction/core-entities@2.125.0

## 2.124.0

### Patch Changes

- Updated dependencies [75058a9]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/core@2.123.0
- @memberjunction/core-entities@2.123.0

## 2.122.2

### Patch Changes

- Updated dependencies [81f0c44]
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/core@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/core@2.122.1
- @memberjunction/core-entities@2.122.1

## 2.122.0

### Patch Changes

- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/core-entities@2.122.0
