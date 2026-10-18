import { initializeConfig, RunCodeGenBase } from "@memberjunction/codegen-lib";
import { MJGlobal } from "@memberjunction/global";

export async function Timeout(ms: number) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            reject(new Error("Batch operation timed out"));
        }, ms);
    });
}

/** @deprecated Use {@link Timeout}. */
export async function timeout(ms: number) {
    return Timeout(ms);
}

export let Initialized = false;
export let RunObject: RunCodeGenBase | null = null;

export {
  /** @deprecated Use {@link Initialized} instead. */
  Initialized as ___initialized,
  /** @deprecated Use {@link RunObject} instead. */
  RunObject as ___runObject,
};
export async function HandleServerInit() {
    if (!Initialized) {
        // Initialize configuration
        initializeConfig(process.cwd());
        RunObject = MJGlobal.Instance.ClassFactory.CreateInstance<RunCodeGenBase>(RunCodeGenBase);
        if (!RunObject) {
            throw new Error("Failed to create RunCodeGenBase instance");
        }
        await RunObject.setupDataSource();
        Initialized = true;
    }
}

/** @deprecated Use {@link HandleServerInit}. */
export async function handleServerInit() {
    return HandleServerInit();
}