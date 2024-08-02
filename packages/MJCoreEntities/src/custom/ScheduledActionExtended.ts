import { BaseEntity, EntitySaveOptions } from "@memberjunction/core";
import { ScheduledActionEntity, ScheduledActionParamEntity } from "../generated/entity_subclasses";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseEntity, 'Scheduled Actions')
export class ScheduledActionEntityExtended extends ScheduledActionEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        // The purpose of this override is to generate the the CronExpression field in the ScheduledAction entity
        // based on the settings we have for Type/IntervalDays/DayOfWeek/DayOfMonth/Month
        // we only generate the CronExpression if the Type != Custom
        if (this.Type !== 'Custom') {
            let cronExpression = '';
            if (this.Type === 'Daily') {
                cronExpression = `0 0 0 * * ?`;
            } else if (this.Type === 'Weekly') {
                cronExpression = `0 0 0 ? * ${this.DayOfWeek}`;
            } else if (this.Type === 'Monthly') {
                cronExpression = `0 0 0 ${this.DayOfMonth} * ?`;
            } else if (this.Type === 'Yearly') {
                cronExpression = `0 0 0 ${this.DayOfMonth} ${this.Month} ?`;
            }
            this.CronExpression = cronExpression;
        }
        // does the cronexpression need to use the Timezone field we have?
        
        return await super.Save(options);
    }

    private _params: ScheduledActionParamEntity[] = [];
    public get Params(): ScheduledActionParamEntity[] {
        return this._params;
    }
    public set Params(value: ScheduledActionParamEntity[]) {
        this._params = value;
    }
}