import { StyleSheet, Text, View } from 'react-native';
import type { DataTable } from '@memberjunction/core';
import { Icons } from '@/components/Icon';
import { Colors, Radius, Spacing, Type } from '@/theme/tokens';
import { DataArtifactView } from '@/artifacts/renderers/DataArtifactView';

/**
 * @fileoverview What a component shows after it crashes, when it had already loaded its data.
 *
 * ## The judgement this encodes
 *
 * By the time most components throw, the fetching has succeeded — the failure is in the drawing.
 * Replacing the whole thing with "this component ran into an error" discards rows the user came
 * for and could still read perfectly well.
 *
 * So the error is stated plainly, and the data is shown under it. The framing matters: this is
 * explicitly *the data behind* a component that did not render, not a pretence that everything
 * worked. A reader who cannot tell the difference cannot trust either state.
 *
 * ## Why it renders through the Data artifact view
 *
 * Those rows are the same shape a query-builder artifact produces, and a phone reads them best the
 * same way — stacked label/value cards rather than a grid behind a horizontal scrollbar. Reusing
 * that renderer also means the two cannot drift into describing a row differently.
 */

/** What the fallback needs. */
export type CapturedDataFallbackProps = {
    /** The error the component raised, for the heading beneath the title. */
    Reason?: string;
    /** The tables it had already fetched. */
    Tables: DataTable[];
};

/**
 * Renders the captured data with an honest explanation above it.
 *
 * @param props See {@link CapturedDataFallbackProps}.
 */
export function CapturedDataFallback({ Reason, Tables }: CapturedDataFallbackProps): React.ReactElement {
    // `DataArtifactView` takes raw artifact content, which is what the captured tables already
    // are once serialised — so the fallback and a real Data artifact go through one code path.
    const content = JSON.stringify({ tables: Tables });

    return (
        <View style={styles.wrap}>
            <View style={styles.notice}>
                <Icons.Sparkle size={16} color={Colors.warn} strokeWidth={2.2} />
                <View style={styles.noticeBody}>
                    <Text style={styles.noticeTitle}>This component didn&apos;t render</Text>
                    <Text style={styles.noticeText}>
                        {Reason ?? 'It ran into an error on this device.'} Its data loaded, so it is shown below.
                    </Text>
                </View>
            </View>

            <DataArtifactView TypeName="Data" Content={content} />
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { gap: Spacing.md },
    notice: {
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
        padding: 12,
        backgroundColor: Colors.warnSoft,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.warn,
        borderRadius: Radius.lg,
    },
    noticeBody: { flex: 1, gap: 2 },
    noticeTitle: { fontSize: Type.small, fontWeight: Type.semibold, color: Colors.warn },
    noticeText: { fontSize: 12.5, color: Colors.warn, lineHeight: 17 },
});
