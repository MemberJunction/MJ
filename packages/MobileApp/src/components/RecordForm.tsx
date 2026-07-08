/**
 * RecordForm — a controlled React Native form that renders the editor descriptors
 * produced by `@/data/services/record-edit` and reports edits back to the parent.
 *
 * It is intentionally presentational: it holds no record state of its own. The
 * parent owns the `values` bag and the validation `errors`, passes them in, and
 * receives every change via `onChange(key, value)`. Each field renders per its
 * {@link FieldEditorDescriptor.kind}: single-line text, multiline `longtext`,
 * numeric, an on/off toggle (boolean), a value-list dropdown, or an ISO-text date
 * input. Labels show a required marker and inline validation errors.
 *
 * Date note: dates are edited as ISO-8601 text for now (documented, no native
 * date picker) — the service coerces the string back to a `Date` on save.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icons } from '@/components/Icon';
import type { FieldEditorDescriptor, FieldValidationError, FieldValue } from '@/data/services/record-edit';
import { Colors, Radius, Type } from '@/theme/tokens';

/** Props for {@link RecordForm}. */
export type RecordFormProps = {
    /** The editable field descriptors, in display order. */
    descriptors: FieldEditorDescriptor[];
    /** The current field values, keyed by field name (owned by the parent). */
    values: Record<string, FieldValue>;
    /** Inline validation errors to surface under their fields. */
    errors: FieldValidationError[];
    /** Called whenever a field changes; the parent updates its `values` bag. */
    onChange: (key: string, value: FieldValue) => void;
    /** When true, all editors are non-interactive (e.g. during save). */
    disabled?: boolean;
};

/** Find the first error message for a field key, if any. */
function errorFor(errors: FieldValidationError[], key: string): string | undefined {
    return errors.find((e) => e.key === key)?.message;
}

/** Coerce a possibly-boolean {@link FieldValue} to the string an input expects. */
function asText(value: FieldValue): string {
    return typeof value === 'string' ? value : '';
}

/**
 * The controlled record form. Renders one labeled editor per descriptor.
 *
 * @param props See {@link RecordFormProps}.
 */
export function RecordForm(props: RecordFormProps) {
    const { descriptors, values, errors, onChange, disabled } = props;
    return (
        <View style={styles.form}>
            {descriptors.map((d) => (
                <FieldRow
                    key={d.key}
                    descriptor={d}
                    value={values[d.key] ?? ''}
                    error={errorFor(errors, d.key)}
                    disabled={disabled === true}
                    onChange={onChange}
                />
            ))}
        </View>
    );
}

/** Props shared by every field row / editor. */
type FieldRowProps = {
    descriptor: FieldEditorDescriptor;
    value: FieldValue;
    error?: string;
    disabled: boolean;
    onChange: (key: string, value: FieldValue) => void;
};

/** A single labeled field: label + required marker, the editor, and any error. */
function FieldRow({ descriptor, value, error, disabled, onChange }: FieldRowProps) {
    return (
        <View style={styles.row}>
            <Text style={styles.label}>
                {descriptor.label}
                {descriptor.required ? <Text style={styles.required}> *</Text> : null}
            </Text>
            <FieldEditor descriptor={descriptor} value={value} hasError={!!error} disabled={disabled} onChange={onChange} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
    );
}

/** Dispatch to the concrete editor for the descriptor's {@link FieldEditorDescriptor.kind}. */
function FieldEditor({ descriptor, value, hasError, disabled, onChange }: FieldRowProps & { hasError: boolean }) {
    switch (descriptor.kind) {
        case 'boolean':
            return <ToggleEditor value={value === true} disabled={disabled} onChange={(v) => onChange(descriptor.key, v)} />;
        case 'dropdown':
            return <DropdownEditor descriptor={descriptor} value={asText(value)} hasError={hasError} disabled={disabled} onChange={onChange} />;
        case 'longtext':
            return <StringEditor value={asText(value)} hasError={hasError} disabled={disabled} multiline accessibilityLabel={descriptor.label} testID={`field-${descriptor.key}`} onChange={(v) => onChange(descriptor.key, v)} />;
        case 'number':
            return <StringEditor value={asText(value)} hasError={hasError} disabled={disabled} numeric accessibilityLabel={descriptor.label} testID={`field-${descriptor.key}`} onChange={(v) => onChange(descriptor.key, v)} />;
        case 'date':
            return <StringEditor value={asText(value)} hasError={hasError} disabled={disabled} placeholder="YYYY-MM-DDTHH:mm:ssZ" accessibilityLabel={descriptor.label} testID={`field-${descriptor.key}`} onChange={(v) => onChange(descriptor.key, v)} />;
        default:
            return <StringEditor value={asText(value)} hasError={hasError} disabled={disabled} accessibilityLabel={descriptor.label} testID={`field-${descriptor.key}`} onChange={(v) => onChange(descriptor.key, v)} />;
    }
}

/** Props for the shared text-based editor (text / longtext / number / date). */
type StringEditorProps = {
    value: string;
    hasError: boolean;
    disabled: boolean;
    multiline?: boolean;
    numeric?: boolean;
    placeholder?: string;
    /** Accessibility label (the field's display name) for screen readers + tests. */
    accessibilityLabel?: string;
    /** Stable test id (`field-<fieldName>`) so E2E tools can target the input. */
    testID?: string;
    onChange: (value: string) => void;
};

/** A single- or multi-line `TextInput` used by the text/number/date/longtext kinds. */
function StringEditor({ value, hasError, disabled, multiline, numeric, placeholder, accessibilityLabel, testID, onChange }: StringEditorProps) {
    return (
        <TextInput
            style={[styles.input, multiline && styles.inputMultiline, hasError && styles.inputError, disabled && styles.inputDisabled]}
            value={value}
            onChangeText={onChange}
            editable={!disabled}
            multiline={multiline === true}
            keyboardType={numeric === true ? 'numeric' : 'default'}
            placeholder={placeholder}
            placeholderTextColor={Colors.ink3}
            autoCapitalize="none"
            accessibilityLabel={accessibilityLabel}
            testID={testID}
        />
    );
}

/** An on/off toggle mirroring the app's settings switch style. */
function ToggleEditor({ value, disabled, onChange }: { value: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
    return (
        <Pressable disabled={disabled} onPress={() => onChange(!value)} style={styles.toggleRow}>
            <View style={[styles.toggle, !value && styles.toggleOff, disabled && styles.inputDisabled]}>
                <View style={[styles.toggleKnob, !value && styles.toggleKnobOff]} />
            </View>
            <Text style={styles.toggleText}>{value ? 'Yes' : 'No'}</Text>
        </Pressable>
    );
}

/** A tap-to-expand value-list picker rendered inline (no modal overlay). */
function DropdownEditor({ descriptor, value, hasError, disabled, onChange }: FieldRowProps & { value: string; hasError: boolean }) {
    const [open, setOpen] = useState(false);
    const selected = descriptor.options.find((o) => o.value === value);
    return (
        <View>
            <Pressable
                disabled={disabled}
                onPress={() => setOpen((o) => !o)}
                style={[styles.input, styles.dropdownControl, hasError && styles.inputError, disabled && styles.inputDisabled]}
            >
                <Text style={[styles.dropdownText, !selected && styles.dropdownPlaceholder]} numberOfLines={1}>
                    {selected?.label ?? 'Select…'}
                </Text>
                {open ? <Icons.ChevronUp size={18} color={Colors.ink3} /> : <Icons.ChevronDown size={18} color={Colors.ink3} />}
            </Pressable>
            {open ? (
                <View style={styles.dropdownList}>
                    {descriptor.options.map((o) => {
                        const active = o.value === value;
                        return (
                            <Pressable
                                key={o.value}
                                style={styles.dropdownOption}
                                onPress={() => {
                                    onChange(descriptor.key, o.value);
                                    setOpen(false);
                                }}
                            >
                                <Text style={[styles.dropdownOptionText, active && styles.dropdownOptionActive]} numberOfLines={1}>
                                    {o.label}
                                </Text>
                                {active ? <Text style={styles.dropdownCheck}>✓</Text> : null}
                            </Pressable>
                        );
                    })}
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    form: { gap: 16 },
    row: { gap: 6 },
    label: { fontSize: 13, fontWeight: Type.semibold, color: Colors.ink2 },
    required: { color: Colors.danger, fontWeight: Type.bold },
    error: { fontSize: 12, color: Colors.danger },

    input: {
        backgroundColor: Colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.line2,
        borderRadius: Radius.md,
        paddingHorizontal: 12,
        paddingVertical: 11,
        fontSize: 15,
        color: Colors.ink,
    },
    inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
    inputError: { borderColor: Colors.danger },
    inputDisabled: { opacity: 0.5 },

    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    toggle: { width: 42, height: 26, borderRadius: 13, backgroundColor: Colors.brand, padding: 2 },
    toggleOff: { backgroundColor: Colors.line2 },
    toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.surface, alignSelf: 'flex-end' },
    toggleKnobOff: { alignSelf: 'flex-start' },
    toggleText: { fontSize: 14, color: Colors.ink2, fontWeight: Type.medium },

    dropdownControl: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    dropdownText: { flex: 1, fontSize: 15, color: Colors.ink },
    dropdownPlaceholder: { color: Colors.ink3 },
    dropdownList: {
        marginTop: 6,
        backgroundColor: Colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.line2,
        borderRadius: Radius.md,
        overflow: 'hidden',
    },
    dropdownOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 11,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: Colors.line2,
    },
    dropdownOptionText: { flex: 1, fontSize: 14.5, color: Colors.ink },
    dropdownOptionActive: { color: Colors.brand, fontWeight: Type.semibold },
    dropdownCheck: { fontSize: 15, color: Colors.brand, fontWeight: Type.bold },
});
