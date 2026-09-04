import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { RunView } from '@memberjunction/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { MJHousingEntity } from '@memberjunction/core-entities';
import { MJHousingFormComponent } from '../../generated/Entities/MJHousing/mjhousing.form.component';
import type { ShelterHeroChip, ShelterHeroGauge, ShelterHeroStat } from '../HarborShelter/shelter-hero.component';

/**
 * MJ Academy — the Housing custom form. THE BASE VERSION: a hero strip, then the generated field
 * panels exactly as CodeGen wrote them.
 *
 * Same reasoning as the Animal form (see its class note): grouping and field order are metadata
 * (`EntityField.Category` / `Sequence`), so a custom form is only justified by something that is
 * not a column.
 *
 * DELIBERATELY NOT HERE YET (base version): live OCCUPANCY -- how many animals are in this unit
 * against its capacity. That is the fact this form most wants, and it needs a count against
 * Animals, so it waits until we add reads. What the hero can say today comes from the record
 * itself: the unit's declared capacity, what species it accepts, and whether it is a quarantine
 * space or currently out of service. The Animals related grid CodeGen already baked is likewise
 * left out of this base version.
 */
@RegisterClass(BaseFormComponent, 'MJ: Housings')
@Component({
    standalone: false,
    selector: 'mj-housing-form',
    templateUrl: './housing-form.component.html',
    styleUrls: ['./housing-form.component.css'],
})
export class MJHousingFormComponentExtended extends MJHousingFormComponent implements OnInit {
    public declare record: MJHousingEntity;

    /** Animals currently assigned here. null until the count comes back. */
    public Occupied: number | null = null;

    // `override` + super(): the generated form's ngOnInit does the record loading, so skipping
    // super would leave the form with no record at all.
    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        void this.loadOccupancy();
    }

    /**
     * A filtered COUNT -- MaxRows 1 plus TotalRowCount, so SQL counts and one row transfers.
     * Only animals actually in our care occupy a space: an Adopted or Transferred animal may still
     * carry its old HousingID, and counting those would report a kennel as full when it is empty.
     */
    private async loadOccupancy(): Promise<void> {
        if (!this.record?.ID) return;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const res = await rv.RunView(
                {
                    EntityName: 'MJ: Animals',
                    ExtraFilter:
                        `HousingID = '${this.record.ID}' ` +
                        `AND Status IN ('Intake','Available','Hold')`,
                    Fields: ['ID'],
                    MaxRows: 1,
                    ResultType: 'simple',
                },
                this.ProviderToUse.CurrentUser,
            );
            if (res.Success) {
                this.Occupied = res.TotalRowCount ?? 0;
                this.cdr.markForCheck();
            }
        } catch {
            // A failed count leaves the gauge hidden rather than showing a wrong 0.
            this.Occupied = null;
        }
    }

    /** The gauge. Hidden until the count lands, so it never renders a misleading empty unit. */
    public get OccupancyGauge(): ShelterHeroGauge | null {
        const total = this.record?.Capacity ?? 0;
        if (this.Occupied === null || total <= 0) return null;
        const open = Math.max(total - this.Occupied, 0);
        return {
            Used: this.Occupied,
            Total: total,
            Label: 'Occupancy',
            Caption: open === 0
                ? (this.Occupied > total ? 'Over capacity' : 'Full — no spaces open')
                : `${open} space${open === 1 ? '' : 's'} open`,
        };
    }

    /** One line under the name: which building, and what it takes. */
    public get LocationLine(): string {
        const parts: string[] = [];
        if (this.record?.Building) parts.push(`Building ${this.record.Building}`);
        if (this.record?.Species) parts.push(this.record.Species === 'Any' ? 'any species' : this.record.Species);
        return parts.join(' · ');
    }

    /**
     * The one thing worth flagging on sight. Order matters: an inactive quarantine unit reports as
     * out of service, because that is the fact that stops you assigning an animal to it.
     */
    public get HeroChips(): ShelterHeroChip[] {
        if (this.record?.IsActive === false) return [{ Text: 'Out of service', Kind: 'muted' }];
        if (this.record?.IsQuarantine) return [{ Text: 'Quarantine', Kind: 'warn' }];
        return [{ Text: 'In service', Kind: 'ok' }];
    }

    public get HeroStats(): ShelterHeroStat[] {
        return [
            { Label: 'Accepts', Value: this.record.Species === 'Any' ? 'Any species' : (this.record.Species || '—') },
            { Label: 'Building', Value: this.record.Building || '—' },
        ];
    }

}
