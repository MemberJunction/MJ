import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { useEntityRecords } from '@/hooks/useExplorer';
import type { EntityRecordRow } from '@/data/services/explorer';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

/**
 * Entity records — card list, never a grid.
 * Spec: plans/mobile-app-react-native/html/entity-records.html
 */
export default function EntityRecordsScreen() {
    const { name } = useLocalSearchParams<{ name: string }>();
    const entityName = name ?? '';
    const { data, loading, error, refresh } = useEntityRecords(entityName);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!data) return [];
        const q = search.trim().toLowerCase();
        if (!q) return data.rows;
        return data.rows.filter((r) => r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q));
    }, [data, search]);

    const displayName = data?.entity.DisplayName || entityName;

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                    <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                </Pressable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{displayName}</Text>
                    <Text style={styles.headerSub}>{data ? `${data.totalShown} shown` : 'Loading…'}</Text>
                </View>
                <View style={styles.iconBtn} />
            </View>

            <View style={styles.searchRow}>
                <Icons.Search size={16} color={Colors.ink3} />
                <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder={`Search ${displayName.toLowerCase()}`}
                    placeholderTextColor={Colors.ink3}
                    style={styles.searchInput}
                    autoCapitalize="none"
                />
            </View>

            <ScrollView
                contentContainerStyle={styles.list}
                refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={Colors.brand} />}
            >
                {error ? (
                    <View style={styles.errorBox}><Text style={styles.errorText}>{error.message}</Text></View>
                ) : null}
                {loading && !data ? (
                    <View style={styles.loadingBlock}><ActivityIndicator color={Colors.brand} /></View>
                ) : null}
                {data && filtered.length === 0 && !loading ? (
                    <Text style={styles.empty}>No records{search ? ` match "${search}"` : ''}.</Text>
                ) : null}
                {filtered.map((row) => <RecordCard key={row.id} row={row} entityName={entityName} />)}
            </ScrollView>

            {data ? (
                <Pressable style={styles.fab} onPress={() => router.push('/new-conversation')}>
                    <View style={styles.fabAv}><Text style={styles.fabAvText}>S</Text></View>
                    <Text style={styles.fabText}>Ask Skip about these</Text>
                </Pressable>
            ) : null}
        </SafeAreaView>
    );
}

function RecordCard({ row, entityName }: { row: EntityRecordRow; entityName: string }) {
    return (
        <Pressable
            style={styles.card}
            onPress={() => router.push({ pathname: '/explorer/record/[id]', params: { id: row.id, entity: entityName } })}
        >
            <Text style={styles.cardName} numberOfLines={1}>{row.title}</Text>
            {row.subtitle ? <Text style={styles.cardMeta} numberOfLines={1}>{row.subtitle}</Text> : null}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: Type.semibold, color: Colors.ink, maxWidth: 240 },
    headerSub: { fontSize: 11, color: Colors.ink3, marginTop: 1 },
    searchRow: { margin: 16, marginBottom: 8, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, height: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
    searchInput: { flex: 1, fontSize: 14, color: Colors.ink },
    list: { paddingHorizontal: 12, paddingBottom: 100 },
    errorBox: { backgroundColor: Colors.dangerSoft, borderRadius: Radius.lg, padding: 12, marginBottom: 8 },
    errorText: { color: Colors.danger, fontSize: 13 },
    loadingBlock: { paddingVertical: 32, alignItems: 'center' },
    empty: { textAlign: 'center', color: Colors.ink3, fontSize: 13, paddingVertical: 24 },
    card: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, padding: 14, marginBottom: 6, ...Shadow.card },
    cardName: { fontSize: 14.5, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1 },
    cardMeta: { fontSize: 12, color: Colors.ink3, marginTop: 4 },
    fab: { position: 'absolute', bottom: 28, right: 20, backgroundColor: Colors.ink, paddingLeft: 14, paddingRight: 16, paddingVertical: 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 8, ...Shadow.fab },
    fabAv: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
    fabAvText: { color: Colors.inverse, fontSize: 10, fontWeight: '700' },
    fabText: { color: Colors.inverse, fontSize: 13.5, fontWeight: Type.semibold },
});
