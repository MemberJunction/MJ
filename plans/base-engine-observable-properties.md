# BaseEngine Observable Properties

## Problem

BaseEngine stores data in plain arrays (`this['_UserNotifications'] = [...]`). When `applyImmediateMutation`, `applyRemoteRecordData`, or `applyRemoteDelete` updates these arrays, nothing notifies external subscribers. Every consumer that needs reactivity must manually build a bridging layer with its own `BehaviorSubject` wrappers (e.g., `MJNotificationService._notifications$`).

## Proposed Solution

Add built-in observable support to `BaseEngine` so any property can be observed with zero boilerplate.

### Core Changes in `BaseEngine`

```typescript
// In BaseEngine, each config property gets a companion BehaviorSubject
export abstract class BaseEngine<T> extends BaseSingleton<T> {
    // Map from property name → BehaviorSubject (lazy — only created when observed)
    private _propertySubjects = new Map<string, BehaviorSubject<BaseEntity[]>>();

    /**
     * Get an observable for a specific engine property.
     * Emits the current array immediately (BehaviorSubject), then re-emits
     * whenever the array is mutated (save, delete, remote-invalidate).
     */
    public ObserveProperty<E extends BaseEntity>(propertyName: string): Observable<E[]> {
        if (!this._propertySubjects.has(propertyName)) {
            const current = (this as Record<string, unknown>)[propertyName] as E[] ?? [];
            this._propertySubjects.set(propertyName, new BehaviorSubject<BaseEntity[]>(current));
        }
        return this._propertySubjects.get(propertyName)!.asObservable() as Observable<E[]>;
    }

    // Called internally after any array mutation
    protected emitPropertyChange(propertyName: string): void {
        const subject = this._propertySubjects.get(propertyName);
        if (subject) {
            const current = (this as Record<string, unknown>)[propertyName] as BaseEntity[];
            subject.next(current);
        }
    }
}
```

### Mutation Points to Instrument

All five existing array mutation methods in BaseEngine need one `emitPropertyChange()` call each:

1. **`applyImmediateMutation()`** — after array push/splice
2. **`applyRemoteRecordData()`** — after upsert
3. **`applyRemoteDelete()`** — after removal
4. **`LoadSingleEntityConfig()`** — after full array replacement
5. **`LoadMultipleEntityConfigs()`** — after batch array replacement

### Subclass Convenience Accessors

Each engine subclass adds typed getters:

```typescript
// In UserInfoEngine
public get UserNotifications$(): Observable<MJUserNotificationEntity[]> {
    return this.ObserveProperty<MJUserNotificationEntity>('_UserNotifications');
}

public get UserFavorites$(): Observable<MJUserFavoriteEntity[]> {
    return this.ObserveProperty<MJUserFavoriteEntity>('_UserFavorites');
}

public get UserApplications$(): Observable<MJUserApplicationEntity[]> {
    return this.ObserveProperty<MJUserApplicationEntity>('_UserApplications');
}
```

### Angular Component Usage

```typescript
// Before: manual bridging layer needed
export class NotificationBadgeComponent {
    private unreadCount = 0;
    constructor() {
        MJNotificationService.UnreadCount$.subscribe(count => this.unreadCount = count);
    }
}

// After: direct observable binding, no intermediary service needed
export class NotificationBadgeComponent {
    unreadCount$ = UserInfoEngine.Instance.UserNotifications$
        .pipe(map(notifications => notifications.filter(n => n.Unread).length));
}
```

```html
<!-- Direct async pipe binding -->
<span class="badge">{{ unreadCount$ | async }}</span>
```

### Zero Overhead for Unobserved Properties

The `BehaviorSubject` for a property is only created when someone calls `ObserveProperty()`. Engines where nobody subscribes to observables have zero runtime cost — the `_propertySubjects` map stays empty and `emitPropertyChange()` is a no-op (map lookup returns undefined).

### Benefits

1. **Eliminates manual bridging layers** — no more `MJNotificationService._notifications$` pattern
2. **Works on both client and server** — `Observable` from RxJS is available everywhere
3. **Consistent API** — every engine property observable works the same way
4. **Angular-native** — `| async` pipe handles subscription lifecycle automatically
5. **Derived observables** — consumers can `pipe(map(...), filter(...))` for computed values
6. **Backward compatible** — existing code that reads arrays directly still works unchanged

### Migration Path

1. Add `ObserveProperty()` and `emitPropertyChange()` to BaseEngine
2. Add `emitPropertyChange()` calls to the 5 mutation methods
3. Add typed `$` getters to UserInfoEngine (and other engines)
4. Gradually migrate consumers from manual bridging to direct observable binding
5. Eventually deprecate `MJNotificationService.Notifications$` etc. in favor of engine observables
