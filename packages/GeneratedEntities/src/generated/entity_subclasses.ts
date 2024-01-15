import { BaseEntity } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";

/**
 * Samples - strongly typed entity sub-class
 * * Schema: test
 * * Base Table: Sample
 * * Base View: vwSamples
 * * Primary Key: SampleID
 * * Description: null
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'Samples')
export class SampleEntity extends BaseEntity {
    /**
    * * Field Name: SampleID
    * * Display Name: Sample ID
    * * SQL Data Type: nchar(10)
    */
    get SampleID(): string {  
        return this.Get('SampleID');
    }

    /**
    * * Field Name: ValueA
    * * Display Name: Value A
    * * SQL Data Type: nvarchar(50)
    */
    get ValueA(): string {  
        return this.Get('ValueA');
    }
    set ValueA(value: string) {
        this.Set('ValueA', value);
    }
    /**
    * * Field Name: ValueB
    * * Display Name: Value B
    * * SQL Data Type: nvarchar(255)
    */
    get ValueB(): string {  
        return this.Get('ValueB');
    }
    set ValueB(value: string) {
        this.Set('ValueB', value);
    }
    /**
    * * Field Name: CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get CreatedAt(): Date {  
        return this.Get('CreatedAt');
    }

    /**
    * * Field Name: UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetime
    * * Default Value: getdate()
    */
    get UpdatedAt(): Date {  
        return this.Get('UpdatedAt');
    }


}
