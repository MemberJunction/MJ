import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView,
    StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Icons } from '@/components/Icon';
import {
    LoadQueries, LoadDashboardArtifactOptions, CreateConfigDashboard,
    type QueryListItem, type DashboardArtifactOption,
} from '@/data/services/explorer';
import { useMJ } from '@/providers/mj-provider';
import { Colors, Radius, Type } from '@/theme/tokens';

/**
 * Compose a dashboard from saved queries.
 *
 * Route: `/explorer/dashboard/new`.
 *
 * ## Why this screen exists
 *
 * Every dashboard in MJ today is `Type = 'Code'` — its panels are an Angular component, which is
 * exactly why none of them render anywhere but Explorer, and why the mobile `Dashboards` resource
 * had nothing real to show. A `Config` dashboard is data: a list of panels a renderer can draw on
 * any surface. There were none, so this is the thing that makes them.
 *
 * It composes from SAVED QUERIES rather than from arbitrary SQL. A query is already named,
 * permissioned and approved; letting a phone author SQL would put an unreviewed statement behind a
 * dashboard that anyone can then open.
 *
 * ## Why a list and not a canvas
 *
 * A drag-and-drop canvas does not fit a phone, and a bad one is worse than none. This picks panels
 * and orders them; the layout written is ordinary Golden Layout two-to-a-row, so a desktop inherits
 * a real dashboard and can rearrange it properly.
 */
/**
 * A panel the user picked, or one they could pick.
 *
 * `Key` exists because a query id and an artifact id come from different tables and could in
 * principle collide; prefixing keeps the picked-list keying and de-duplication honest.
 */
type PickedPanel = {
    Key: string;
    QueryID?: string;
    ArtifactID?: string;
    Title: string;
    Subtitle: string | null;
    /** What the panel will be, shown as a chip so the composer is not a list of indistinguishable rows. */
    Kind: 'Query' | 'Artifact' | 'Interactive';
};

/** The kind chip. `Interactive` gets its own colour because it behaves differently — it runs. */
function KindChip({ Kind }: { Kind: PickedPanel['Kind'] }) {
    const tint = Kind === 'Interactive'
        ? { bg: Colors.brandSoft, fg: Colors.brand }
        : Kind === 'Artifact'
            ? { bg: Colors.positiveSoft, fg: Colors.positive }
            : { bg: Colors.surface2, fg: Colors.ink3 };
    return (
        <View style={[styles.chip, { backgroundColor: tint.bg }]}>
            <Text style={[styles.chipText, { color: tint.fg }]}>{Kind.toUpperCase()}</Text>
        </View>
    );
}

export default function NewDashboardScreen() {
    const { status } = useMJ();
    const [name, setName] = useState('');
    const [search, setSearch] = useState('');
    const [picked, setPicked] = useState<PickedPanel[]>([]);
    const [artifacts, setArtifacts] = useState<DashboardArtifactOption[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Queries needing a parameter with no default are left out entirely. A dashboard panel supplies
    // no parameters, so offering one only lets the user build a dashboard with an error where a
    // panel should be — which is exactly what the first one composed on a device did.
    const queries = useMemo(
        () => (status === 'ready' ? LoadQueries().filter((q) => !q.requiresParameters) : []),
        [status],
    );
    const excluded = useMemo(
        () => (status === 'ready' ? LoadQueries().filter((q) => q.requiresParameters).length : 0),
        [status],
    );
    const loadArtifacts = useCallback(async () => {
        if (status !== 'ready') return;
        setArtifacts(await LoadDashboardArtifactOptions());
    }, [status]);
    useEffect(() => { void loadArtifacts(); }, [loadArtifacts]);

    // Queries and artifacts land in one searchable list, because from the user's side both answers
    // are just "a thing to put on the dashboard" — the distinction matters to the layout writer,
    // not to the person composing.
    const options = useMemo<PickedPanel[]>(() => [
        ...queries.map((q): PickedPanel => ({
            Key: `q:${q.id}`, QueryID: q.id, Title: q.name, Subtitle: q.category, Kind: 'Query',
        })),
        ...artifacts.map((a): PickedPanel => ({
            Key: `a:${a.id}`, ArtifactID: a.id, Title: a.name,
            Subtitle: a.conversation ? `${a.typeName} · ${a.conversation}` : a.typeName,
            Kind: a.typeName === 'Component' ? 'Interactive' : 'Artifact',
        })),
    ], [queries, artifacts]);

    const results = useMemo(() => {
        const q = search.trim().toLowerCase();
        const available = options.filter((x) => !picked.some((p) => p.Key === x.Key));
        if (!q) return available.slice(0, 40);
        return available
            .filter((x) => x.Title.toLowerCase().includes(q) || (x.Subtitle ?? '').toLowerCase().includes(q))
            .slice(0, 40);
    }, [options, search, picked]);

    const canSave = name.trim().length > 0 && picked.length > 0 && !saving;

    const move = (index: number, delta: number) => {
        setPicked((prev) => {
            const next = [...prev];
            const target = index + delta;
            if (target < 0 || target >= next.length) return prev;
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const save = async () => {
        if (!canSave) return;
        setSaving(true);
        setError(null);
        const result = await CreateConfigDashboard(
            name.trim(),
            null,
            picked.map((p) => (p.ArtifactID
                ? { ArtifactID: p.ArtifactID, Title: p.Title }
                : { QueryID: p.QueryID, Title: p.Title })),
        );
        setSaving(false);
        if ('Error' in result) {
            setError(result.Error);
            return;
        }
        // Replace rather than push: going "back" from a dashboard you just made should land on the
        // browser you started from, not on the half-filled form that no longer describes anything.
        router.replace({ pathname: '/explorer/dashboard/[id]', params: { id: result.ID } });
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
                <View style={styles.header}>
                    <Pressable hitSlop={8} style={styles.iconBtn} accessibilityLabel="Back" onPress={() => router.back()}>
                        <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                    </Pressable>
                    <Text style={styles.headerTitle}>New dashboard</Text>
                    <Pressable
                        hitSlop={8}
                        style={styles.iconBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Save dashboard"
                        disabled={!canSave}
                        onPress={() => void save()}
                    >
                        {saving
                            ? <ActivityIndicator size="small" color={Colors.brand} />
                            : <Text style={[styles.save, !canSave && styles.saveOff]}>Save</Text>}
                    </Pressable>
                </View>

                <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
                    <TextInput
                        style={styles.nameInput}
                        placeholder="Dashboard name"
                        placeholderTextColor={Colors.ink3}
                        value={name}
                        onChangeText={setName}
                        returnKeyType="done"
                    />

                    {error ? <Text style={styles.error}>{error}</Text> : null}

                    {picked.length > 0 ? (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Panels · {picked.length}</Text>
                            <View style={styles.card}>
                                {picked.map((p, i) => (
                                    <View key={p.Key} style={styles.row}>
                                        <View style={styles.rowBody}>
                                            <View style={styles.titleRow}>
                                                <Text style={styles.rowTitle} numberOfLines={1}>{p.Title}</Text>
                                                <KindChip Kind={p.Kind} />
                                            </View>
                                            {p.Subtitle ? (
                                                <Text style={styles.rowSub} numberOfLines={1}>{p.Subtitle}</Text>
                                            ) : null}
                                        </View>
                                        <Pressable
                                            hitSlop={6} style={styles.moveBtn}
                                            accessibilityRole="button" accessibilityLabel={`Move ${p.Title} up`}
                                            disabled={i === 0} onPress={() => move(i, -1)}
                                        >
                                            <Icons.ChevronUp size={18} strokeWidth={2}
                                                color={i === 0 ? Colors.line2 : Colors.ink3} />
                                        </Pressable>
                                        <Pressable
                                            hitSlop={6} style={styles.moveBtn}
                                            accessibilityRole="button" accessibilityLabel={`Move ${p.Title} down`}
                                            disabled={i === picked.length - 1} onPress={() => move(i, 1)}
                                        >
                                            <Icons.ChevronDown size={18} strokeWidth={2}
                                                color={i === picked.length - 1 ? Colors.line2 : Colors.ink3} />
                                        </Pressable>
                                        <Pressable
                                            hitSlop={6} style={styles.moveBtn}
                                            accessibilityRole="button" accessibilityLabel={`Remove ${p.Title}`}
                                            onPress={() => setPicked((prev) => prev.filter((x) => x.Key !== p.Key))}
                                        >
                                            <Icons.X size={17} color={Colors.danger} strokeWidth={2} />
                                        </Pressable>
                                    </View>
                                ))}
                            </View>
                        </View>
                    ) : (
                        <Text style={styles.hint}>
                            Pick saved queries and artifacts below. Each becomes a panel — numbers
                            render as a tile, a single series as a chart, and an interactive
                            component runs right in the panel.
                        </Text>
                    )}

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Add a panel</Text>
                        <TextInput
                            style={styles.search}
                            placeholder="Search saved queries"
                            placeholderTextColor={Colors.ink3}
                            value={search}
                            onChangeText={setSearch}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <View style={styles.card}>
                            {results.length === 0 ? (
                                <Text style={styles.empty}>
                                    {queries.length === 0
                                        ? 'No approved saved queries are available to you.'
                                        : `Nothing matching “${search}”.`}
                                </Text>
                            ) : results.map((opt) => (
                                <Pressable
                                    key={opt.Key}
                                    style={styles.row}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Add ${opt.Title}`}
                                    onPress={() => { setPicked((prev) => [...prev, opt]); setSearch(''); }}
                                >
                                    <View style={styles.rowBody}>
                                        <View style={styles.titleRow}>
                                            <Text style={styles.rowTitle} numberOfLines={1}>{opt.Title}</Text>
                                            <KindChip Kind={opt.Kind} />
                                        </View>
                                        {opt.Subtitle ? (
                                            <Text style={styles.rowSub} numberOfLines={1}>{opt.Subtitle}</Text>
                                        ) : null}
                                    </View>
                                    <Icons.Plus size={18} color={Colors.brand} strokeWidth={2.2} />
                                </Pressable>
                            ))}
                        </View>
                        {excluded > 0 ? (
                            <Text style={styles.excluded}>
                                {excluded} quer{excluded === 1 ? 'y needs' : 'ies need'} a parameter and
                                can&apos;t be a panel yet.
                            </Text>
                        ) : null}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    header: {
        height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2,
    },
    iconBtn: { minWidth: 46, height: 38, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: Type.semibold, color: Colors.ink },
    save: { fontSize: 15, fontWeight: Type.semibold, color: Colors.brand },
    saveOff: { color: Colors.ink3 },

    body: { padding: 16, paddingBottom: 32, gap: 18 },
    nameInput: {
        backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2,
        borderRadius: Radius.lg, paddingHorizontal: 14, height: 50, fontSize: 17,
        fontWeight: Type.semibold, color: Colors.ink,
    },
    search: {
        backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2,
        borderRadius: Radius.lg, paddingHorizontal: 13, height: 44, fontSize: 14.5, color: Colors.ink,
    },
    error: { fontSize: 13.5, color: Colors.danger, lineHeight: 19 },
    hint: { fontSize: 13.5, color: Colors.ink3, lineHeight: 20 },

    section: { gap: 9 },
    sectionTitle: {
        fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2,
        color: Colors.ink3, textTransform: 'uppercase',
    },
    card: {
        backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2,
        borderRadius: Radius.lg, overflow: 'hidden',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 11 },
    rowBody: { flex: 1, gap: 2 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    rowTitle: { flexShrink: 1, fontSize: 14.5, color: Colors.ink, fontWeight: Type.medium },
    chip: { paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 999 },
    chipText: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.4 },
    rowSub: { fontSize: 12, color: Colors.ink3 },
    moveBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    empty: { padding: 14, fontSize: 13.5, color: Colors.ink3 },
    excluded: { fontSize: 12.5, color: Colors.ink3, lineHeight: 18, paddingHorizontal: 2 },
});
