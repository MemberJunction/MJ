import { StyleSheet, Text, View } from 'react-native';
import type { ComponentType } from 'react';
import { RegisterClass } from '@memberjunction/global';
import { DashboardView } from '@/components/dashboard/DashboardView';
import { Colors, Spacing, Type } from '@/theme/tokens';
import { BaseMobileResource, type MobileResourceProps } from './BaseMobileResource';

/**
 * @fileoverview Mobile surfaces for the **generic** nav resource types.
 *
 * A nav item is either `Custom` — the application names a `DriverClass` and contributes the screen
 * itself — or one of MJ's generic resource types, where the item names a *record* (`RecordID`) and
 * the shell is expected to know how to render that kind of record. Every application MJ currently
 * ships uses `Custom` for every item, but the generic types are part of the metadata contract and
 * an application is free to author one.
 *
 * These register as ordinary {@link BaseMobileResource} subclasses under the resource-type name, so
 * the shell keeps exactly one resolution path: look up a name, render what comes back. Adding a
 * generic type later is a registration in this file, not a change to the shell.
 *
 * **What this build renders:** `Dashboards`. Everything else — `Views`, `Reports`, `Queries`,
 * `Records`, `Search Results`, `Lists`, `Components`, `Files` — has no registration, so the shell's
 * honest "opens on desktop" card applies. That is a deliberate line rather than an omission: a
 * dashboard is a read-only composition that stacks onto a phone well, while an entity view or a
 * report is a dense authoring surface that does not.
 */

/**
 * Renders a `Dashboards` nav item — the dashboard the item's `RecordID` names.
 *
 * The rendering is {@link DashboardView}, the same component `/explorer/dashboard/[id]` mounts, so
 * a dashboard looks and behaves identically whether it is reached through an application's tab or
 * through the Explorer browser.
 */
function HostedDashboard({ NavItem }: MobileResourceProps) {
    if (!NavItem.RecordID) {
        return (
            <View style={styles.centered}>
                <Text style={styles.title}>{NavItem.Label} is not configured</Text>
                <Text style={styles.muted}>
                    This navigation item points at a dashboard but does not name one. An
                    administrator can set it in the application's navigation metadata.
                </Text>
            </View>
        );
    }
    return <DashboardView id={NavItem.RecordID} />;
}

/**
 * The `Dashboards` resource type.
 *
 * Registered under the type name rather than a driver name, which is what lets
 * `ResolveMobileResource` serve both kinds of nav item from one lookup.
 */
@RegisterClass(BaseMobileResource, 'Dashboards')
export class DashboardMobileResource extends BaseMobileResource {
    /** @inheritdoc */
    public get Component(): ComponentType<MobileResourceProps> {
        return HostedDashboard;
    }
}

/**
 * Tree-shaking guard for the generic resource registrations.
 *
 * `@RegisterClass` is a module side effect and nothing imports these classes by name, so a bundler
 * that sees no import of this module removes it and the registrations never happen. Called from
 * {@link ../host/registry.LoadHostedMobileResources}.
 */
export function LoadGenericMobileResources(): void {
    /* intentionally empty — see the doc comment */
}

const styles = StyleSheet.create({
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.sm },
    title: { fontSize: 17, fontWeight: Type.semibold, color: Colors.ink, textAlign: 'center' },
    muted: { fontSize: 14, color: Colors.ink3, textAlign: 'center', lineHeight: 20 },
});
