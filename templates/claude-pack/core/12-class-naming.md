# Class member naming — PascalCase public, camelCase private

MJ deviates from the standard TypeScript convention. **Public class members
are PascalCase. Private/protected members are camelCase.** This is the
convention across the entire codebase, including generated entity classes,
so it's not something you can opt out of.

## The rule

```typescript
export class MyComponent {
    // ─── Public ── PascalCase ──────────────────────────────────
    @Input() QueryId: string | null = null;
    @Input() AutoRun: boolean = false;
    @Output() EntityLinkClick = new EventEmitter<EntityLinkEvent>();

    public IsLoading: boolean = false;
    public SelectedRows: Record<string, unknown>[] = [];

    // ─── Private / protected ── camelCase ──────────────────────
    private destroy$ = new Subject<void>();
    private _internalState: string = '';
    protected cdr: ChangeDetectorRef;

    // ─── Public methods ── PascalCase ──────────────────────────
    public LoadData(): void { }
    public OnGridReady(event: GridReadyEvent): void { }
    public GetSelectedRows(): Record<string, unknown>[] { }

    // ─── Private / protected methods ── camelCase ──────────────
    private buildColumnDefs(): void { }
    protected applyVisualConfig(): void { }
}
```

## Why MJ does this

Three reasons:

1. **Consistency with generated entity classes.** CodeGen emits
   `UserEntity.Email`, `UserEntity.LastLoginAt` — PascalCase. The whole
   framework is built around that style. If user-authored classes used
   `camelCase` for their public API, every code site that touches both
   would jarringly switch styles.

2. **Visual distinction between public API and internal implementation.**
   At a glance, you can tell which members are part of the contract
   (PascalCase) and which are wiring (camelCase). Useful when scanning
   a large component class.

3. **HTML template bindings match.** Angular template syntax preserves
   case: `<my-comp [QueryId]="foo">` binds to a PascalCase `@Input()`.
   Mixing case styles between TypeScript and templates is more confusing
   than committing to the unusual convention everywhere.

## What this overrides

The default TypeScript / ESLint guidance is camelCase for all members.
**Ignore that here.** MJ-specific tooling and code review expects the
PascalCase-public convention. ESLint rules in the repo are configured to
not fight it.

## Existing camelCase public members

Some older areas of the codebase still use camelCase for public members
that pre-date the convention. **Don't migrate them just for style.**
Convention applies to new code; mass renames break consumers without
delivering value.

## What stays camelCase regardless

- **Local variables** inside method bodies — always camelCase
- **Function parameters** — camelCase
- **HTML attributes / event names** that aren't directly bound to a
  `@Input()` / `@Output()` — kebab-case (HTML convention) or camelCase

## The contrast

```typescript
// ❌ Standard TS convention (NOT used in MJ)
export class MyComponent {
    @Input() queryId: string | null = null;
    public isLoading: boolean = false;
    public loadData(): void { }
    private buildColumnDefs(): void { }
}

// ✅ MJ convention
export class MyComponent {
    @Input() QueryId: string | null = null;
    public IsLoading: boolean = false;
    public LoadData(): void { }
    private buildColumnDefs(): void { }
}
```

The private member style (`buildColumnDefs`) is identical between the
two — only the public-facing API differs. New code should follow the
MJ convention without exception.
