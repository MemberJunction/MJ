import { EntityFieldValueListType, EntityInfo, TypeScriptTypeFromSQLType } from '@memberjunction/core';
import fs from 'fs';
import path from 'path';
import { makeDir } from './util';
import { RegisterClass } from '@memberjunction/global';

/**
 * Base class for generating entity sub-classes, you can sub-class this class to modify/extend your own entity sub-class generator logic
 */
@RegisterClass(ActionSubClassGeneratorBase)
export class ActionSubClassGeneratorBase {
    public async generateActions(): Promise<boolean> {
        // stub for now
        return true;
    }
}