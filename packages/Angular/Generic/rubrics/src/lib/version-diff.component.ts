import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { RubricVersionSnapshot, VersionChange } from '@memberjunction/rubrics-base';
import { PublishPreview, VersionRows, type DiffRow } from './model.js';

/** Base on the left, draft on the right, one row per criterion key. */
@Component({
    standalone: true,
    selector: 'mj-rubric-version-diff',
    imports: [CommonModule],
    templateUrl: './version-diff.component.html',
    styleUrls: ['./rubric-builder.component.css'],
})
export class RubricVersionDiffComponent {
    @Input() Base: RubricVersionSnapshot | null = null;
    @Input() Draft: RubricVersionSnapshot | null = null;

    public get Rows(): DiffRow[] {
        return this.Base && this.Draft ? VersionRows(this.Base, this.Draft) : [];
    }

    public get Bump(): string | null {
        return this.Base && this.Draft ? PublishPreview(this.Base, this.Draft).computedBump : null;
    }

    public get NextVersion(): string {
        return this.Base && this.Draft ? PublishPreview(this.Base, this.Draft).nextVersion ?? '' : '';
    }

    public get Heading(): string {
        if (!this.Base) return this.DraftLabel;
        return `Draft vs ${this.BaseLabel}`;
    }

    public get DraftLabel(): string {
        const version = this.Draft;
        if (!version || version.majorVersion == null) return 'This version';
        return `${version.majorVersion}.${version.minorVersion ?? 0}.${version.patchVersion ?? 0}`;
    }

    public get BaseLabel(): string {
        const version = this.Base;
        if (version?.majorVersion == null) return 'Published base';
        return `Published ${version.majorVersion}.${version.minorVersion ?? 0}.${version.patchVersion ?? 0}`;
    }

    public get CriterionRows(): { key: string; name: string; baseWeight: string; draftWeight: string; baseGate: string; draftGate: string; baseScale: string; draftScale: string; marks: VersionChange[] }[] {
        const keys = new Set([...(this.Base?.nodes ?? []), ...(this.Draft?.nodes ?? [])].filter(node => node.nodeType === 'Criterion').map(node => node.key));
        return [...keys].map(key => {
            const base = this.Base?.nodes.find(node => node.key === key);
            const draft = this.Draft?.nodes.find(node => node.key === key);
            return {
                key,
                name: draft?.name ?? base?.name ?? key,
                baseWeight: base ? String(base.weight) : '—',
                draftWeight: draft ? String(draft.weight) : '—',
                baseGate: gateText(base),
                draftGate: gateText(draft),
                baseScale: scaleText(this.Base, base?.scaleId),
                draftScale: scaleText(this.Draft, draft?.scaleId),
                marks: this.Rows.find(row => row.key === key)?.marks ?? [],
            };
        });
    }

    public Sentence(mark: VersionChange): string {
        const words: Record<string, string> = {
            Weight: 'The weight changed',
            IsGate: 'The gate changed',
            GateMinimumScore: 'The gate minimum changed',
            Sequence: 'The order changed',
            Descriptor: 'An anchor changed',
            Name: 'The name changed',
            PassThreshold: 'The pass threshold changed',
            MinimumCompleteness: 'The minimum completeness changed',
            NotApplicablePolicy: 'The not-applicable policy changed',
            Instructions: 'The instructions changed',
            ScoreDisplayMin: 'The display range changed',
            ScoreDisplayMax: 'The display range changed',
            'band range': 'The band range changed',
            'band added': 'A band was added',
            'band removed': 'A band was removed',
            added: 'Added',
            removed: 'Removed',
        };
        return words[mark.property] ?? mark.property;
    }

    public get RemovedBands(): { label: string; min: number; max: number }[] {
        const draftLabels = new Set((this.Draft?.bands ?? []).map(band => band.label));
        return (this.Base?.bands ?? []).filter(band => !draftLabels.has(band.label)).map(band => ({ label: band.label, min: band.minScore, max: band.maxScore }));
    }

    public get VersionMarks(): VersionChange[] {
        return this.Rows.find(row => row.key === 'version')?.marks ?? [];
    }

    public get GroupRows(): { key: string; name: string; baseWeight: string; draftWeight: string; marks: VersionChange[] }[] {
        const keys = new Set([...(this.Base?.nodes ?? []), ...(this.Draft?.nodes ?? [])].filter(node => node.nodeType === 'Group').map(node => node.key));
        return [...keys].map(key => {
            const base = this.Base?.nodes.find(node => node.key === key);
            const draft = this.Draft?.nodes.find(node => node.key === key);
            return {
                key,
                name: draft?.name ?? base?.name ?? key,
                baseWeight: base ? String(base.weight) : '—',
                draftWeight: draft ? String(draft.weight) : '—',
                marks: this.Rows.find(row => row.key === key)?.marks ?? [],
            };
        });
    }

    public get BandRangeRows(): { label: string; baseMin: number; baseMax: number; draftMin: number; draftMax: number }[] {
        return this.Rows.flatMap(row => row.marks).filter(mark => mark.property === 'band range').map(mark => {
            const base = this.Base?.bands.find(band => band.label === mark.subject);
            const draft = this.Draft?.bands.find(band => band.label === mark.subject);
            return {
                label: mark.subject,
                baseMin: base?.minScore ?? 0,
                baseMax: base?.maxScore ?? 0,
                draftMin: draft?.minScore ?? 0,
                draftMax: draft?.maxScore ?? 0,
            };
        });
    }

    public get AddedBands(): { label: string; min: number; max: number }[] {
        return this.Rows.flatMap(row => row.marks).filter(mark => mark.property === 'band added').map(mark => {
            const band = this.Draft?.bands.find(item => item.label === mark.subject);
            return { label: mark.subject, min: band?.minScore ?? 0, max: band?.maxScore ?? 0 };
        });
    }
}

function gateText(node: { isGate: boolean; gateMinimumScore?: number | null } | undefined): string {
    if (!node) return '—';
    return node.isGate ? `Enforced (≥ ${node.gateMinimumScore ?? ''})` : 'Disabled';
}

function scaleText(version: { scales: { id: string; name?: string }[] } | null, scaleId: string | null | undefined): string {
    if (!scaleId) return '—';
    return version?.scales.find(scale => scale.id === scaleId)?.name || 'Same scale';
}
