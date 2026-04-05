# Dashboards Package Development Guide

## 🚨 CRITICAL: NotifyLoadComplete() is MANDATORY 🚨

Every resource component in this package extends `BaseResourceComponent`. You **MUST** call `this.NotifyLoadComplete()` when initialization is complete. Without it, the app loading screen hangs forever on direct URL navigation (e.g., `/app/knowledge-hub/Search`).

### For BaseDashboard Subclasses
`BaseDashboard.ngOnInit()` calls `NotifyLoadComplete()` automatically after `loadData()` completes. No action needed — just implement `initDashboard()` and `loadData()` as usual.

### For Direct BaseResourceComponent Subclasses
You MUST call `this.NotifyLoadComplete()` yourself:

```typescript
@RegisterClass(BaseResourceComponent, 'MyResource')
@Component({ ... })
export class MyResourceComponent extends BaseResourceComponent implements AfterViewInit {
    ngAfterViewInit(): void {
        this.loadMyData();
        this.NotifyLoadComplete(); // REQUIRED
    }
}
```

### Where to Place the Call
- If your init is **synchronous** or fires-and-forgets async work: call at the end of `ngOnInit()` / `ngAfterViewInit()`
- If your init **awaits** data loading: call after the await completes
- The call signals "component is rendered and ready" — it does NOT need to wait for all data to finish loading, just for the component to be interactive

### What Happens Without It
The shell component waits for `onFirstResourceLoadComplete()` before hiding the loading screen. That event is driven by `NotifyLoadComplete()`. If no resource component calls it, the user sees the loading animation indefinitely with only a "Reset" button (which clears all local data) as recovery.
