import { BehaviorSubject } from 'rxjs';
import type {
    ITourAnchorDomBridge,
    ITourHost,
    TourHostCapabilities,
    TourLocation,
    TourNavigationIntent,
    TourPrincipal,
    TourResolvedAnchorInfo,
    TourVisibleAnchorInfo,
} from '../host-contracts';
import type { ITourAnchor, TourStepDefinition } from '../types';

export class MockTourHost implements ITourHost {
    public readonly Capabilities: TourHostCapabilities;
    public readonly Principal: TourPrincipal;
    public readonly LocationSubject: BehaviorSubject<TourLocation>;
    public readonly Location$;
    public readonly NavigateCalls: TourNavigationIntent[] = [];
    public NavigateResult = true;
    public InstalledApps: string[] = ['Sales', 'Data Explorer'];
    public DemonstrateStepCalls: Array<{ StepKey: string; ConfirmedMutation?: boolean }> = [];
    public DemonstrateStepHandler?: (
        step: TourStepDefinition,
        context: { ConfirmedMutation?: boolean },
    ) => Promise<{
        Success: boolean;
        RequiresConfirmation?: boolean;
        ConfirmationPrompt?: string;
        MutatesData?: boolean;
        ErrorMessage?: string;
    }>;

    constructor(options?: {
        Capabilities?: Partial<TourHostCapabilities>;
        Principal?: TourPrincipal;
        InitialLocation?: TourLocation;
        InstalledApps?: string[];
    }) {
        this.Capabilities = {
            Navigation: 'MJ App',
            EntityEvents: true,
            MJForms: true,
            Angular: true,
            Agent: 'Chat and Voice',
            Persistence: 'MJ User',
            ...(options?.Capabilities ?? {}),
        };
        this.Principal = options?.Principal ?? {
            Kind: 'MJUser',
            UserId: 'user-1',
            Roles: ['User'],
        };
        this.LocationSubject = new BehaviorSubject<TourLocation>(
            options?.InitialLocation ?? { ApplicationName: 'Sales', NavItemKey: 'deals' },
        );
        this.Location$ = this.LocationSubject.asObservable();
        if (options?.InstalledApps) {
            this.InstalledApps = options.InstalledApps;
        }
    }

    public GetCurrentLocation(): TourLocation {
        return this.LocationSubject.getValue();
    }

    public GetInstalledApplications(): string[] {
        return this.InstalledApps;
    }

    public async Navigate(intent: TourNavigationIntent): Promise<boolean> {
        this.NavigateCalls.push(intent);
        if (!this.NavigateResult) {
            return false;
        }
        const current = this.LocationSubject.getValue();
        this.LocationSubject.next({
            ...current,
            ApplicationName: intent.ApplicationName ?? current.ApplicationName,
            NavItemKey: intent.NavItemKey ?? current.NavItemKey,
            DriverClass: intent.DriverClass ?? current.DriverClass,
            EntityName: intent.EntityName ?? current.EntityName,
            RecordId: intent.RecordId ?? current.RecordId,
            Url: intent.Url ?? current.Url,
        });
        return true;
    }

    public async DemonstrateStep(
        step: TourStepDefinition,
        context: { ConfirmedMutation?: boolean },
    ): Promise<{
        Success: boolean;
        RequiresConfirmation?: boolean;
        ConfirmationPrompt?: string;
        MutatesData?: boolean;
        ErrorMessage?: string;
    }> {
        this.DemonstrateStepCalls.push({
            StepKey: step.StepKey,
            ConfirmedMutation: context.ConfirmedMutation,
        });
        if (this.DemonstrateStepHandler) {
            return this.DemonstrateStepHandler(step, context);
        }
        return { Success: true };
    }
}

export class MockAnchorBridge implements ITourAnchorDomBridge {
    public MissingKeys = new Set<string>();
    public VisibleAnchors: TourVisibleAnchorInfo[] = [];
    public HighlightedCalls: Array<{ AnchorKey: string; Caption?: string }> = [];
    public FieldValues = new Map<string, unknown>();

    public async ResolveAnchor(anchor: ITourAnchor): Promise<TourResolvedAnchorInfo> {
        const key = anchor.Key ?? anchor.Field ?? anchor.Selector ?? anchor.Role ?? anchor.Strategy;
        if (this.MissingKeys.has(key) || (anchor.Key && this.MissingKeys.has(anchor.Key))) {
            return {
                Found: false,
                Resolution: 'Failed',
                FailureReason: `Mock anchor '${key}' not found`,
            };
        }
        const resolution =
            anchor.Strategy === 'Registered'
                ? 'Registered'
                : anchor.Strategy === 'Role'
                  ? 'Role'
                  : anchor.Strategy === 'Selector'
                    ? 'Selector'
                    : 'Semantic';
        return {
            Found: true,
            Resolution: resolution,
            AnchorKey: key,
            AccessibleName: key,
        };
    }

    public GetVisibleAnchors(): TourVisibleAnchorInfo[] {
        return this.VisibleAnchors;
    }

    public async HighlightAnchor(
        anchorKey: string,
        caption?: string,
    ): Promise<{ Success: boolean; ErrorMessage?: string }> {
        this.HighlightedCalls.push({ AnchorKey: anchorKey, Caption: caption });
        return { Success: true };
    }

    public GetFieldValue = (_entityName: string | undefined, fieldName: string): unknown => {
        return this.FieldValues.get(fieldName);
    };
}
