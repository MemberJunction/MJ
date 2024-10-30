import { BaseEntity, MJBaseEntityName } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

/**
 * zod schema definition for the Base Entity
 */
export const MJBaseEntitySchema = z.object({});

export type MJBaseEntityType = z.infer<typeof MJBaseEntitySchema>;

/**
 * Subclass for the Base Entity class for the purpose of having an "empty" subclass to instantiate directly
 */
@RegisterClass(BaseEntity, MJBaseEntityName)  
export class MJBaseEntity extends BaseEntity<MJBaseEntityType> {}