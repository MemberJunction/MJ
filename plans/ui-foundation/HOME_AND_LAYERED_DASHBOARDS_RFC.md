# Home and Layered Dashboards (RFC stub)

Status: stub, 2026-11-24. Owner: Colin. User research: Matt. Tracked from [ONE_CONTRACT_PLAN.md](ONE_CONTRACT_PLAN.md) (PR #6818) as workstream G. It ships in the same release as that plan.

## Goal

Metadata dashboards become the default surface for new work. Home becomes one, so an organization, a role and a user can each shape it without code. This schedules the unified plan's "Homepage as information, not navigation" item.

## Agreed starting points

From the review of #6818 by Matt and Colin.

- **Layering only on the card grid.** Golden Layout's split trees cannot merge changes.
- **One resolved base layout.** One winning Role by priority, else Global. Layouts are never merged across roles. A user's changes are stored on top as changes keyed by placement ID, with Reset to default.
- **A thin Home shell with compiled Angular defaults.** Home must not wait on React for first paint. It keeps its `?dashboard=` switching, agent tools, Quick Access and application access filtering.
- **Core Home does not depend on BizApps widgets.**
- **The card grid is built once**, in `dashboard-viewer`, and Home uses it.

## Open questions

1. **Organization scope.** `Global` is deployment-wide today. Multi-tenant apps need an org-level layer, and MJ core has no department concept. What defines each layer?
2. **Where per-user layouts load.** Not in `DashboardEngine`'s startup load, which caches every dashboard table unfiltered. A lazy, user-filtered load is needed.
3. **Priority order.** Colin reports that `GetActiveOverrideForEntity` and `FormResolverService` sort priority in opposite directions. Settle which is right before copying the pattern.
4. **Who may edit the Global and Role layers**, and whether a layer can lock a widget in place.
5. **Which code dashboards convert**, and what stays code.
6. **Many widgets mean many reads.** How Home keeps its 500 to 700 ms warm load.

## User research

A short round with non-technical users before the layout model is fixed (Matt). Questions to answer: do people want to rearrange Home at all, what do they expect an admin's default to do to their own changes, and which widgets do they reach for first.

## Next steps

- [ ] Colin: draft the layering and storage design
- [ ] Matt: plan and run the user sessions
- [ ] Link the design PR and research notes from the tracker in ONE_CONTRACT_PLAN.md section 2
