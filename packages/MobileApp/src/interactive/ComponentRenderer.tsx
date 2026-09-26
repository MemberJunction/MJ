import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Metadata } from '@memberjunction/core';
import type { ComponentSpec } from '@memberjunction/react-runtime';
import { Colors, Spacing } from '@/theme/tokens';
import { AssessSpec, type RenderMode } from './mobile-safety';
import { DesktopFallback, InteractiveComponentRenderer } from './InteractiveComponentRenderer';
import { BuildMobileComponentStyles } from './component-styles';
import { BuildSaveUserSettings, LoadUserSettings } from './user-settings';
import { ResolveHierarchy } from './hierarchy-resolver';
import { DomComponentHost } from './dom-host/DomComponentHost';
import { DeclaredGlobals, LoadDomHostLibraries } from './dom-host/library-definitions';
import type { DomHostLibrary } from './dom-host/bridge-protocol';

/**
 * @fileoverview Chooses which of the two renderers a component goes to.
 *
 * ## Two renderers, one contract
 *
 * Most components run natively: compiled by the shared react-runtime, drawn with React Native
 * primitives. They are faster, they scroll with the rest of the app, and they inherit its
 * typography — so that is the default wherever it works.
 *
 * Components that declare a library which genuinely needs a browser — Chart.js and ApexCharts draw
 * into a canvas, AG Grid and antd mount DOM nodes — run in {@link DomComponentHost}, a real
 * document with the real libraries. The alternative was reimplementing each library's configuration
 * surface against `react-native-svg`, which means being subtly wrong forever against a moving
 * target.
 *
 * Which renderer is used is not a difference in what a component *gets*. Both receive the same
 * `utilities`, `styles`, `savedUserSettings` and callbacks, resolved by the same code below; the
 * DOM host proxies its data calls back across the bridge rather than holding a provider itself.
 */

/** The resolved hierarchy and everything derived from it, settled before either renderer runs. */
type Prepared = {
    /** The spec with every registry child's code inlined. */
    Spec: ComponentSpec;
    /** Which renderer the RESOLVED tree needs. */
    Mode: RenderMode;
    /** Why nothing can render it, when that is the answer. */
    Reason?: string;
    Styles: unknown;
    SavedUserSettings: Record<string, unknown>;
    /** CDN definitions, populated only for the DOM host. */
    Libraries: DomHostLibrary[];
};

/**
 * Renders an interactive component through whichever renderer suits it.
 *
 * ## Why the hierarchy is resolved before the renderer is chosen
 *
 * A spec's own `libraries` list says nothing about what its children need, and children are
 * routinely named rather than inlined. A dashboard whose parent uses only lodash, with a
 * registry-backed child that draws a Chart.js canvas, looks native-renderable right up until the
 * child fails — and the component that most needs the DOM host is exactly the one whose canvas
 * library is buried a level down.
 *
 * So resolution comes first, and the routing decision is made against the *resolved* tree. The
 * native renderer gets the inlined spec too: it costs nothing (its own walk then finds nothing left
 * to fetch) and means both paths reason about the same thing.
 *
 * @param props.spec The parsed component spec.
 */
export function ComponentRenderer({ spec }: { spec: ComponentSpec }): React.ReactElement {
    const [prepared, setPrepared] = useState<Prepared | null>(null);

    useEffect(() => {
        let active = true;
        void (async () => {
            const user = Metadata.Provider?.CurrentUser;
            const hierarchy = await ResolveHierarchy(spec, user);
            const resolved = hierarchy.Spec ?? spec;

            // Assessed against the resolved tree, so a child's canvas library is visible.
            const assessment = AssessSpec(resolved);

            const savedUserSettings = await LoadUserSettings(spec, user);
            const libraries =
                assessment.Mode === 'dom'
                    ? await LoadDomHostLibraries(DeclaredGlobals(resolved, hierarchy.Libraries), user)
                    : [];

            if (!active) return;
            setPrepared({
                Spec: resolved,
                Mode: assessment.Mode,
                Reason: assessment.reason,
                Styles: BuildMobileComponentStyles(spec),
                SavedUserSettings: savedUserSettings,
                Libraries: libraries,
            });
        })();
        return () => {
            active = false;
        };
    }, [spec]);

    if (!prepared) {
        return (
            <View style={styles.center}>
                <ActivityIndicator color={Colors.brand} />
            </View>
        );
    }

    if (prepared.Mode === 'none') {
        return <DesktopFallback reason={prepared.Reason} />;
    }
    if (prepared.Mode === 'native') {
        return <InteractiveComponentRenderer spec={prepared.Spec} />;
    }

    return (
        <DomComponentHost
            // The resolved tree, not the original: the page runs with no provider, so a child it
            // still had to fetch would throw inside the WebView.
            Spec={prepared.Spec}
            Libraries={prepared.Libraries}
            Styles={prepared.Styles}
            SavedUserSettings={prepared.SavedUserSettings}
            OnSaveUserSettings={BuildSaveUserSettings(spec, Metadata.Provider?.CurrentUser, prepared.SavedUserSettings)}
            OnNotify={(message, style) => console.log(`[component:${style}] ${message}`)}
        />
    );
}

const styles = StyleSheet.create({
    center: { paddingVertical: Spacing.xxxl, alignItems: 'center', justifyContent: 'center' },
});
