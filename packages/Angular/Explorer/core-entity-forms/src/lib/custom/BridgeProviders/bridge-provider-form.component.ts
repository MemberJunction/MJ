import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import { MJAIBridgeProviderFormComponent } from '../../generated/Entities/MJAIBridgeProvider/mjaibridgeprovider.form.component';
import {
    BRIDGE_FEATURE_GROUPS,
    BridgeFeatureGroup,
    BridgeFeatureKey,
    countEnabledFeatures,
    isFeatureEnabled,
    setFeature,
} from './bridge-provider-features';

/**
 * Custom form for 'MJ: AI Bridge Providers' (Pattern 2 — full override of the
 * generated form). The standout addition is a **capability editor**: the 16
 * `SupportedFeatures` flags rendered as labeled toggles, grouped into Join
 * methods / Media tracks / Signals & telephony.
 *
 * The toggles bind through the entity's typed `SupportedFeaturesObject`
 * accessor (which serializes to/from the `SupportedFeatures` JSON column). On
 * each toggle we read the current object, produce a fresh object via the pure
 * `setFeature` helper, and write it back through the setter — a fresh reference
 * is required so the accessor's parse-cache invalidates and dirty tracking
 * fires. Disabling omits the key (matching "NULL/omitted = unsupported").
 *
 * The remaining provider fields (Name / Description / BridgeType / DriverClass
 * / Status / Configuration / ConfigSchema) and the related-entity grids keep
 * the generated panels.
 */
@RegisterClass(BaseFormComponent, 'MJ: AI Bridge Providers')
@Component({
    standalone: false,
    selector: 'mj-ai-bridge-provider-form',
    templateUrl: './bridge-provider-form.component.html',
    styleUrls: ['./bridge-provider-form.component.css'],
})
export class MJAIBridgeProviderFormComponentExtended extends MJAIBridgeProviderFormComponent {
    public override record!: MJAIBridgeProviderEntity;

    /** Static editor layout (16 flags, 3 groups). */
    public readonly FeatureGroups: readonly BridgeFeatureGroup[] = BRIDGE_FEATURE_GROUPS;

    /**
     * Register section state for the custom layout. We don't call
     * `super.ngOnInit()`'s `initSections` because this form restructures the
     * sections (adds `supportedFeatures` + `configurationSchema`, splits the
     * generated "Technical Capabilities" panel), so we register our own keys.
     */
    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'providerInformation', sectionName: 'Provider Information', isExpanded: true },
            { sectionKey: 'providerConfiguration', sectionName: 'Provider Configuration', isExpanded: true },
            { sectionKey: 'supportedFeatures', sectionName: 'Supported Features', isExpanded: true },
            { sectionKey: 'configurationSchema', sectionName: 'Configuration Schema', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentSessionBridges', sectionName: 'AI Agent Session Bridges', isExpanded: false },
            { sectionKey: 'mJAIBridgeProviderChannels', sectionName: 'AI Bridge Provider Channels', isExpanded: false },
            { sectionKey: 'mJAIBridgeAgentIdentities', sectionName: 'AI Bridge Agent Identities', isExpanded: false },
        ]);
    }

    /** Count of enabled capabilities — drives the panel badge. */
    public get EnabledFeatureCount(): number {
        return countEnabledFeatures(this.record?.SupportedFeaturesObject ?? null);
    }

    /** Read a single capability flag for the template. */
    public IsFeatureOn(key: BridgeFeatureKey): boolean {
        return isFeatureEnabled(this.record?.SupportedFeaturesObject ?? null, key);
    }

    /**
     * Toggle a capability flag. Reads the current typed object, builds a fresh
     * object with the flag changed, and assigns it back through the typed
     * setter (which re-serializes to the JSON column and marks the field dirty).
     */
    public ToggleFeature(key: BridgeFeatureKey, enabled: boolean): void {
        if (!this.record || !this.EditMode) {
            return;
        }
        this.record.SupportedFeaturesObject = setFeature(
            this.record.SupportedFeaturesObject ?? null,
            key,
            enabled,
        );
    }
}

/** Tree-shake guard — invoked from the custom-forms module loader. */
export function LoadMJAIBridgeProviderFormComponentExtended(): void {
    /* no-op marker */
}
