import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Metadata } from '@memberjunction/core';
import type { ComponentSpec } from '@memberjunction/react-runtime';
import { Colors, Spacing } from '@/theme/tokens';
import { AssessSpec } from './mobile-safety';
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

/** What either renderer needs, resolved once before dispatch. */
type Prepared = {
    Styles: unknown;
    SavedUserSettings: Record<string, unknown>;
    Libraries: DomHostLibrary[];
};

/**
 * Renders an interactive component through whichever renderer suits it.
 *
 * @param props.spec The parsed component spec.
 */
export function ComponentRenderer({ spec }: { spec: ComponentSpec }): React.ReactElement {
    const assessment = AssessSpec(spec);

    if (assessment.mode === 'none') {
        return <DesktopFallback reason={assessment.reason} />;
    }
    if (assessment.mode === 'native') {
        return <InteractiveComponentRenderer spec={spec} />;
    }
    return <DomHostedComponent spec={spec} />;
}

/**
 * Prepares the props a DOM-hosted component needs, then mounts the host.
 *
 * The preparation is asynchronous — the hierarchy has to be resolved to know every library the tree
 * declares, and those libraries' CDN URLs come from metadata — so it happens here rather than
 * inside the host, which should not be re-rendering while it waits on a database read.
 */
function DomHostedComponent({ spec }: { spec: ComponentSpec }) {
    const [prepared, setPrepared] = useState<Prepared | null>(null);

    useEffect(() => {
        let active = true;
        void (async () => {
            const user = Metadata.Provider?.CurrentUser;
            // Registry-backed children declare libraries of their own, and the page has to load
            // every one before it mounts — same constraint as the native path, different loader.
            const hierarchy = await ResolveHierarchy(spec, user);
            const globals = DeclaredGlobals(spec, hierarchy.Libraries);
            const [libraries, savedUserSettings] = await Promise.all([
                LoadDomHostLibraries(globals, user),
                LoadUserSettings(spec, user),
            ]);
            if (!active) return;
            setPrepared({ Styles: BuildMobileComponentStyles(spec), SavedUserSettings: savedUserSettings, Libraries: libraries });
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

    return (
        <DomComponentHost
            Spec={spec}
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
