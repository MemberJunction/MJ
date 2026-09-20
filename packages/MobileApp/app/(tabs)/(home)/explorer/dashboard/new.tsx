import { useMemo, useState } from 'react';
import {
    ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView,
    StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Icons } from '@/components/Icon';
import { LoadQueries, CreateConfigDashboard, type QueryListItem } from '@/data/services/explorer';
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
export default function NewDashboardScreen() {
    const { status } = useMJ();
    const [name, setName] = useState('');
    const [search, setSearch] = useState('');
    const [picked, setPicked] = useState<QueryListItem[]>([]);
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
    const results = useMemo(() => {
        const q = search.trim().toLowerCase();
        const available = queries.filter((x) => !picked.some((p) => p.id === x.id));
        if (!q) return available.slice(0, 40);
        return available
            .filter((x) => x.name.toLowerCase().includes(q) || (x.category ?? '').toLowerCase().includes(q))
            .slice(0, 40);
    }, [queries, search, picked]);

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
            picked.map((p) => ({ QueryID: p.id, Title: p.name })),
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
                                    <View key={p.id} style={styles.row}>
                                        <View style={styles.rowBody}>
                                            <Text style={styles.rowTitle} numberOfLines={1}>{p.name}</Text>
                                            {p.category ? (
                                                <Text style={styles.rowSub} numberOfLines={1}>{p.category}</Text>
                                            ) : null}
                                        </View>
                                        <Pressable
                                            hitSlop={6} style={styles.moveBtn}
                                            accessibilityRole="button" accessibilityLabel={`Move ${p.name} up`}
                                            disabled={i === 0} onPress={() => move(i, -1)}
                                        >
                                            <Icons.ChevronUp size={18} strokeWidth={2}
                                                color={i === 0 ? Colors.line2 : Colors.ink3} />
                                        </Pressable>
                                        <Pressable
                                            hitSlop={6} style={styles.moveBtn}
                                            accessibilityRole="button" accessibilityLabel={`Move ${p.name} down`}
                                            disabled={i === picked.length - 1} onPress={() => move(i, 1)}
                                        >
                                            <Icons.ChevronDown size={18} strokeWidth={2}
                                                color={i === picked.length - 1 ? Colors.line2 : Colors.ink3} />
                                        </Pressable>
                                        <Pressable
                                            hitSlop={6} style={styles.moveBtn}
                                            accessibilityRole="button" accessibilityLabel={`Remove ${p.name}`}
                                            onPress={() => setPicked((prev) => prev.filter((x) => x.id !== p.id))}
                                        >
                                            <Icons.X size={17} color={Colors.danger} strokeWidth={2} />
                                        </Pressable>
                                    </View>
                                ))}
                            </View>
                        </View>
                    ) : (
                        <Text style={styles.hint}>
                            Pick saved queries below. Each becomes a panel — numbers render as a tile,
                            a single series as a chart, anything else as a table.
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
                            ) : results.map((qi) => (
                                <Pressable
                                    key={qi.id}
                                    style={styles.row}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Add ${qi.name}`}
                                    onPress={() => { setPicked((prev) => [...prev, qi]); setSearch(''); }}
                                >
                                    <View style={styles.rowBody}>
                                        <Text style={styles.rowTitle} numberOfLines={1}>{qi.name}</Text>
                                        {qi.category ? (
                                            <Text style={styles.rowSub} numberOfLines={1}>{qi.category}</Text>
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
    rowTitle: { fontSize: 14.5, color: Colors.ink, fontWeight: Type.medium },
    rowSub: { fontSize: 12, color: Colors.ink3 },
    moveBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    empty: { padding: 14, fontSize: 13.5, color: Colors.ink3 },
    excluded: { fontSize: 12.5, color: Colors.ink3, lineHeight: 18, paddingHorizontal: 2 },
});
