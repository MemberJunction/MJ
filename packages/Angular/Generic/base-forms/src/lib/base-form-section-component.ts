import { BaseEntity, TransactionGroupBase } from "@memberjunction/core";
import { BaseRecordComponent } from "./base-record-component";

// This is a base class for form sections, it is used to have a clear hiearchy for all sections to subclass
// which is primarily needed for the Class Factory and registration process to differentiate between sections and other components
export class BaseFormSectionComponent extends BaseRecordComponent {
    record!: BaseEntity;
    EditMode: boolean = false;

    /**
     * Whether this section is holding edits the host form's Save still has to persist.
     *
     * A section that owns its own editor — a canvas, a grid, a designer — accumulates changes the
     * host knows nothing about, so without this the form's dirty indicator says "no changes" while
     * the user is looking at edits they have made. Default `false`: a section that only renders
     * fields has nothing of its own to report.
     */
    public get HasPendingChanges(): boolean {
        return false;
    }

    /**
     * Joins this section's writes to the host form's save.
     *
     * **Why a transaction group rather than "save yourself".** A section that saves independently
     * gives the record two save buttons and two failure modes: the form can succeed while the
     * section fails, leaving the user with a record that looks saved and edits that are gone.
     * Queuing into the host's group makes the whole record atomic — everything lands or nothing does.
     *
     * Implementations should **queue** work on the group and return; the host submits. Return `false`
     * to abort the save (the host will not submit). Default is a no-op that succeeds, so every
     * existing section is unaffected.
     *
     * @param transactionGroup the host form's open group — do not submit it
     */
    public async ContributeToSave(transactionGroup: TransactionGroupBase): Promise<boolean> {
        // Referenced so the parameter is part of the contract rather than an unused formality.
        void transactionGroup;
        return true;
    }

    /**
     * Called after the host form's save succeeded, so the section can clear its own dirty state.
     *
     * Separate from {@link ContributeToSave} because the section cannot know whether the group
     * actually committed — clearing dirty inside the contribution would mark edits saved that a
     * failed submit then discarded.
     */
    public OnHostSaveCompleted(): void {
        // Nothing to do for a section with no state of its own.
    }
}
