/**
 * Info class that has the entity name and filter to be used in the drill down
 */
export class DrillDownInfo {
    public EntityName!: string;
    public Filter!: string;
    public BaseFilter: string = '';
    public get UserViewGridParams() {
      const fullFilter = this.BaseFilter?.length > 0 ? `(${this.Filter}) AND (${this.BaseFilter})` : this.Filter;
      return {
        EntityName: this.EntityName,
        ExtraFilter: fullFilter
      }
    }
  
    constructor(entityName: string, filter: string) {
      this.EntityName = entityName;
      this.Filter = filter;
    }
}