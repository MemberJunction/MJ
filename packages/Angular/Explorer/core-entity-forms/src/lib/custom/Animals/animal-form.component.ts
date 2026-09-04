import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { MJAnimalEntity } from '@memberjunction/core-entities';
import { MJAnimalFormComponent } from '../../generated/Entities/MJAnimal/mjanimal.form.component';
import type { ShelterHeroChip, ShelterHeroStat } from '../HarborShelter/shelter-hero.component';

/**
 * MJ Academy — the Animal custom form. THE BASE VERSION: a hero strip, then the generated field
 * panels exactly as CodeGen wrote them.
 *
 * WHY A CUSTOM FORM AT ALL. Almost everything a form can express is already metadata:
 * `EntityField.Category` decides which section a field sits in, `Sequence` its order within that
 * section, `DefaultInView` the grid's columns. Reach for those FIRST -- they need no code and no
 * rebuild. What metadata cannot produce is a value that is not a column, and that is the whole
 * justification here: DAYS IN CARE is arithmetic on IntakeDate, so no amount of metadata tuning
 * surfaces it.
 *
 * WHY EXTEND THE GENERATED CLASS rather than BaseFormComponent. @RegisterClass priority follows
 * registration order. Generated forms compile first; a custom form that IMPORTS the generated one
 * registers after it and therefore wins. Extending BaseFormComponent directly may not take
 * priority (packages/Angular/CLAUDE.md).
 *
 * THE PHOTO CONTROL is the second thing metadata cannot do, and MJ has no component for it.
 * Everything image-shaped in MJ is bound to the File Storage subsystem -- <mj-files-file-upload>
 * reads `FileStorageEngineBase.Instance.Providers[0]` and uploads to `MJ: Files`, and the
 * <mj-record-attachments> drawer gates on the same thing. With no provider configured (and a
 * student laptop has no cloud credentials) neither works. There is no `Image` in the
 * `EntityField.ExtendedType` value list either, and `mj-form-field` has no image type -- so a
 * base64 column can ONLY ever render as a textarea on a generated form, which is what it did.
 *
 * So this control is hand-built on the plain web platform: a file input, a canvas downscale, and
 * FileReader. The downscale is the part that matters -- a phone photo is 3-6MB, which base64
 * inflates by a third, and that would sit in every Animal row and travel on every read of the
 * entity. Capping the long edge and re-encoding as JPEG keeps a portrait around 60-100KB.
 *
 * DELIBERATELY NOT HERE YET (base version):
 *  - The Care Logs related grid. CodeGen already bakes a fully wired one -- badge count, lazy load
 *    on expand, navigation, and a New button that pre-fills AnimalID. Restating it by hand would be
 *    strictly worse, so when we add it back it will be by keeping the generated panel.
 *  - "Next follow-up", which needs a read against Care Logs. Left out so this form does zero extra
 *    queries: it renders from the record it was already given.
 */
@RegisterClass(BaseFormComponent, 'MJ: Animals')
@Component({
    standalone: false,
    selector: 'mj-animal-form',
    templateUrl: './animal-form.component.html',
    styleUrls: ['./animal-form.component.css'],
})
export class MJAnimalFormComponentExtended extends MJAnimalFormComponent {
    public declare record: MJAnimalEntity;

    /** True once the shelter has taken the animal in -- guards the whole hero. */
    public get HasIntake(): boolean {
        return !!this.record?.IntakeDate;
    }

    /**
     * Whole days since intake. IntakeDate is a DATE column, so both sides are normalised to UTC
     * midnight before subtracting -- comparing a date to a local `new Date()` makes the answer
     * depend on the browser's clock time as well as its day, and flips west of UTC.
     */
    public get DaysInCare(): number | null {
        const raw = this.record?.IntakeDate;
        if (!raw) return null;
        const intake = new Date(raw);
        if (Number.isNaN(intake.getTime())) return null;
        const intakeUTC = Date.UTC(intake.getUTCFullYear(), intake.getUTCMonth(), intake.getUTCDate());
        const now = new Date();
        const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        return Math.max(Math.round((todayUTC - intakeUTC) / 86_400_000), 0);
    }

    /** One line under the name: breed and sex, skipping whatever is blank. */
    public get IdentityLine(): string {
        const parts = [this.record?.Breed, this.record?.Species, this.record?.Sex].filter(
            (p): p is string => !!p && p !== 'Unknown',
        );
        return parts.join(' · ');
    }

    /**
     * The chips beside the title. Status maps through the WHOLE Animal.Status value list, so every
     * animal gets a tone -- if a migration widens the CHECK constraint, a sixth case belongs here
     * and the default keeps it legible until then.
     */
    public get HeroChips(): ShelterHeroChip[] {
        return [{ Text: this.record.Status ?? 'Unknown', Kind: this.StatusKind }];
    }

    private get StatusKind(): ShelterHeroChip['Kind'] {
        switch (this.record?.Status) {
            case 'Available': return 'ok';
            case 'Hold': return 'warn';
            case 'Intake': return 'info';
            case 'Adopted': return 'muted';
            case 'Transferred': return 'muted';
            default: return '';
        }
    }

    /** The figures under the title. Housing and weight are columns; days-in-care is not. */
    public get HeroStats(): ShelterHeroStat[] {
        return [
            { Label: 'Housing', Value: this.record.Housing || 'Unassigned' },
            { Label: 'Days in care', Value: String(this.DaysInCare ?? '—') },
            { Label: 'Intake', Value: this.FormattedIntake },
            { Label: 'Weight', Value: this.record.WeightKg ? `${this.record.WeightKg} kg` : '—' },
        ];
    }

    /**
     * IntakeDate is a DATE column. Formatting it in UTC is REQUIRED -- the browser's zone would
     * show the previous day for anyone west of UTC, which is the defect MJ #4210 tracks in MJ's
     * own read-mode formatter.
     */
    private get FormattedIntake(): string {
        const raw = this.record?.IntakeDate;
        if (!raw) return '—';
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleDateString(undefined, {
            timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric',
        });
    }

    // ── Photo control ────────────────────────────────────────────────────────
    // Longest edge of the stored image. 1024px is plenty for a shelter listing and keeps the
    // encoded string small enough to live in a column that is read with every animal.
    private static readonly MAX_EDGE = 1024;
    /** Rejected before decoding: a 20MB upload should fail fast, not after a canvas round-trip. */
    private static readonly MAX_SOURCE_BYTES = 12 * 1024 * 1024;

    // No `cdr` declaration: BaseFormComponent already exposes `public cdr = inject(...)`, and
    // redeclaring it as private collides with the base member (TS2415).
    public PhotoBusy = false;
    public PhotoError: string | null = null;

    /** The stored data URI, or null. Bound straight to an <img src>. */
    public get PhotoSrc(): string | null {
        const v = this.record?.PhotoBase64;
        return v && v.length > 0 ? v : null;
    }

    public async OnPhotoSelected(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        // Clear the input regardless, so picking the SAME file again still fires a change event.
        input.value = '';
        if (!file) return;

        this.PhotoError = null;
        if (!file.type.startsWith('image/')) {
            this.PhotoError = 'That file is not an image.';
            return;
        }
        if (file.size > MJAnimalFormComponentExtended.MAX_SOURCE_BYTES) {
            this.PhotoError = `That image is ${(file.size / 1048576).toFixed(1)}MB — the limit is 12MB.`;
            return;
        }

        this.PhotoBusy = true;
        this.cdr.markForCheck();
        try {
            this.record.PhotoBase64 = await this.downscaleToDataUrl(file);
            // No manual dirty flag: assigning through the BaseEntity setter marks the field dirty,
            // which is what enables Save. Setting a private backing field would not.
        } catch (e) {
            this.PhotoError = e instanceof Error ? e.message : 'Could not read that image.';
        } finally {
            this.PhotoBusy = false;
            this.cdr.markForCheck();
        }
    }

    public RemovePhoto(): void {
        this.record.PhotoBase64 = null;
        this.PhotoError = null;
        this.cdr.markForCheck();
    }

    /**
     * Decode, scale the long edge down to MAX_EDGE, re-encode as JPEG.
     *
     * createImageBitmap rather than an <img> + onload: it decodes off the main thread and does not
     * need the element in the DOM. The object URL is revoked in a finally, because a leaked one
     * pins the whole decoded bitmap in memory for the life of the document.
     */
    private async downscaleToDataUrl(file: File): Promise<string> {
        const url = URL.createObjectURL(file);
        try {
            const bitmap = await createImageBitmap(file);
            const longest = Math.max(bitmap.width, bitmap.height);
            const scale = Math.min(1, MJAnimalFormComponentExtended.MAX_EDGE / longest);
            const w = Math.max(1, Math.round(bitmap.width * scale));
            const h = Math.max(1, Math.round(bitmap.height * scale));

            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas is unavailable in this browser.');
            ctx.drawImage(bitmap, 0, 0, w, h);
            bitmap.close();

            // JPEG, not PNG: a photograph re-encoded as PNG is several times larger for no visible
            // gain. Quality 0.82 is the usual knee — smaller than 0.9, no visible artefacts.
            return canvas.toDataURL('image/jpeg', 0.82);
        } finally {
            URL.revokeObjectURL(url);
        }
    }

}
