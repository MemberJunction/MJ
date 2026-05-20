import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { useEntities } from '@/hooks/useExplorer';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

/** Entity picker — choose an entity to browse its records. */
export default function EntitiesScreen() {
    const entities = useEntities();
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!entities) return null;
        const q = search.trim().toLowerCase();
        if (!q) return entities;
        return entities.filter((e) => e.displayName.toLowerCase().includes(q) || e.name.toLowerCase().includes(q));
    }, [entities, search]);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                    <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                </Pressable>
                <Text style={styles.title}>Entities</Text>
                <View style={styles.iconBtn} />
            </View>

            <View style={styles.search}>
                <Icons.Search size={16} color={Colors.ink3} />
                <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search entities"
                    placeholderTextColor={Colors.ink3}
                    style={styles.searchInput}
                    autoCapitalize="none"
                />
            </View>

            <ScrollView contentContainerStyle={styles.list}>
                {filtered === null ? (
                    <Text style={styles.loading}>Loading…</Text>
                ) : filtered.length === 0 ? (
                    <Text style={styles.loading}>No entities match "{search}".</Text>
                ) : (
                    filtered.map((e) => (
                        <Pressable
                            key={e.name}
                            style={styles.row}
                            onPress={() => router.push({ pathname: '/explorer/entity/[name]', params: { name: e.name } })}
                        >
                            <View style={styles.rowIcon}>
                                <Icons.Database size={16} color={Colors.brand} strokeWidth={2.2} />
                            </View>
                            <View style={styles.rowBody}>
                                <Text style={styles.rowTitle}>{e.displayName}</Text>
                                {e.description ? <Text style={styles.rowSub} numberOfLines={1}>{e.description}</Text> : null}
                            </View>
                            <Icons.ChevronRight size={16} color={Colors.ink3} strokeWidth={2} />
                        </Pressable>
                    ))
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    title: { flex: 1, textAlign: 'center', fontSize: Type.body, fontWeight: Type.semibold, color: Colors.ink },
    search: { margin: 16, marginBottom: 8, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, height: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
    searchInput: { flex: 1, fontSize: 14, color: Colors.ink },
    list: { paddingHorizontal: 12, paddingBottom: 32, gap: 6 },
    loading: { textAlign: 'center', color: Colors.ink3, fontSize: 13, paddingVertical: 24 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: 12, padding: 12, marginBottom: 6, ...Shadow.card },
    rowIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
    rowBody: { flex: 1 },
    rowTitle: { fontSize: 14.5, fontWeight: Type.semibold, color: Colors.ink },
    rowSub: { fontSize: 12, color: Colors.ink3, marginTop: 1 },
});
