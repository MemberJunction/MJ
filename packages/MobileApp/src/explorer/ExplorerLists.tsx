import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icons } from '@/components/Icon';
import { useDashboards, useEntities, useQueries } from '@/hooks/useExplorer';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

/**
 * @fileoverview Data Explorer's three lists, without any screen chrome.
 *
 * ## Why these are separate from the screens that show them
 *
 * Each list is reached two ways: from Home, as a screen with its own header and back button; and
 * from Apps, as a surface inside the Data Explorer application, where the host already draws a
 * header, a back button and the nav-item chips. A screen rendered in the second place would stack
 * two headers.
 *
 * So the body lives here and both hosts render it. The alternative — a second implementation for
 * the hosted case — is how "the list in Apps" and "the list on Home" start behaving differently,
 * which is precisely what a user notices and cannot explain.
 */

/** Searchable list of MJ entities; tapping one browses its records. */
export function EntityList() {
    const entities = useEntities();
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!entities) return null;
        const q = search.trim().toLowerCase();
        if (!q) return entities;
        return entities.filter((e) => e.displayName.toLowerCase().includes(q) || e.name.toLowerCase().includes(q));
    }, [entities, search]);

    return (
        <View style={styles.body}>
            <SearchBox Value={search} OnChange={setSearch} Placeholder="Search entities" />
            <ScrollView contentContainerStyle={styles.list}>
                {filtered === null ? (
                    <Text style={styles.loading}>Loading…</Text>
                ) : filtered.length === 0 ? (
                    <Text style={styles.loading}>No entities match &quot;{search}&quot;.</Text>
                ) : (
                    filtered.map((e) => (
                        <Row
                            key={e.name}
                            Title={e.displayName}
                            Subtitle={e.description}
                            Icon={<Icons.Database size={16} color={Colors.brand} strokeWidth={2.2} />}
                            OnPress={() => router.push({ pathname: '/explorer/entity/[name]', params: { name: e.name } })}
                        />
                    ))
                )}
            </ScrollView>
        </View>
    );
}

/** Searchable list of approved saved queries; tapping one runs it. */
export function QueryList() {
    const queries = useQueries();
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!queries) return null;
        const q = search.trim().toLowerCase();
        if (!q) return queries;
        return queries.filter((x) => x.name.toLowerCase().includes(q) || (x.description ?? '').toLowerCase().includes(q));
    }, [queries, search]);

    return (
        <View style={styles.body}>
            <SearchBox Value={search} OnChange={setSearch} Placeholder="Search queries" />
            <ScrollView contentContainerStyle={styles.list}>
                {filtered === null ? (
                    <Text style={styles.loading}>Loading…</Text>
                ) : filtered.length === 0 ? (
                    <Text style={styles.loading}>No queries match &quot;{search}&quot;.</Text>
                ) : (
                    filtered.map((q) => (
                        <Row
                            key={q.id}
                            Title={q.name}
                            Subtitle={q.description}
                            Icon={<Icons.Grid size={16} color={Colors.brand} strokeWidth={2.2} />}
                            OnPress={() => router.push({ pathname: '/explorer/query/[id]', params: { id: q.id } })}
                        />
                    ))
                )}
            </ScrollView>
        </View>
    );
}

/**
 * The dashboards this app can open.
 *
 * `LoadDashboards` restricts these to `Type = 'Config'` — see the reasoning there. The empty state
 * therefore points at the composer rather than apologising, because an empty list here means the
 * user has not built one yet, not that theirs were filtered away.
 */
export function DashboardList() {
    const dashboards = useDashboards();

    return (
        <View style={styles.body}>
            <ScrollView contentContainerStyle={[styles.list, styles.listTop]}>
                {dashboards === null ? (
                    <Text style={styles.loading}>Loading…</Text>
                ) : dashboards.length === 0 ? (
                    <Text style={styles.loading}>
                        No dashboards yet. Compose one from saved queries and artifacts to see it here.
                    </Text>
                ) : (
                    dashboards.map((d) => (
                        <Row
                            key={d.id}
                            Title={d.name}
                            Subtitle={d.description}
                            Icon={<Icons.Sparkle size={16} color={Colors.warn} strokeWidth={2.2} />}
                            OnPress={() => router.push({ pathname: '/explorer/dashboard/[id]', params: { id: d.id } })}
                        />
                    ))
                )}
            </ScrollView>
        </View>
    );
}

/** The shared search field, so the two searchable lists cannot drift apart visually. */
function SearchBox({
    Value,
    OnChange,
    Placeholder,
}: {
    Value: string;
    OnChange: (v: string) => void;
    Placeholder: string;
}) {
    return (
        <View style={styles.search}>
            <Icons.Search size={16} color={Colors.ink3} />
            <TextInput
                value={Value}
                onChangeText={OnChange}
                placeholder={Placeholder}
                placeholderTextColor={Colors.ink3}
                style={styles.searchInput}
                autoCapitalize="none"
            />
        </View>
    );
}

/** One tappable row: icon, title, optional subtitle, chevron. */
function Row({
    Title,
    Subtitle,
    Icon,
    OnPress,
}: {
    Title: string;
    Subtitle?: string | null;
    Icon: React.ReactNode;
    OnPress: () => void;
}) {
    return (
        <Pressable style={styles.row} accessibilityRole="button" onPress={OnPress}>
            <View style={styles.rowIcon}>{Icon}</View>
            <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{Title}</Text>
                {Subtitle ? (
                    <Text style={styles.rowSub} numberOfLines={1}>
                        {Subtitle}
                    </Text>
                ) : null}
            </View>
            <Icons.ChevronRight size={16} color={Colors.ink3} strokeWidth={2} />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    body: { flex: 1 },
    search: {
        margin: 16,
        marginBottom: 8,
        backgroundColor: Colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.line2,
        height: 42,
        borderRadius: Radius.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
    },
    searchInput: { flex: 1, fontSize: 14, color: Colors.ink },
    list: { paddingHorizontal: 12, paddingBottom: 32, gap: 6 },
    // The unsearchable list has no search box above it to provide the top gap.
    listTop: { paddingTop: 12 },
    loading: { textAlign: 'center', color: Colors.ink3, fontSize: 13, paddingVertical: 24, paddingHorizontal: 24, lineHeight: 19 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: Colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.line2,
        borderRadius: Radius.lg,
        padding: 12,
        marginBottom: 6,
        ...Shadow.card,
    },
    rowIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
    rowBody: { flex: 1 },
    rowTitle: { fontSize: 14.5, fontWeight: Type.semibold, color: Colors.ink },
    rowSub: { fontSize: 12, color: Colors.ink3, marginTop: 1 },
});
