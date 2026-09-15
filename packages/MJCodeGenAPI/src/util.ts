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

export let ___initialized = false;
export let ___runObject: RunCodeGenBase | null = null;
export async function HandleServerInit() {
    if (!___initialized) {
        // Initialize configuration
        initializeConfig(process.cwd());
        ___runObject = MJGlobal.Instance.ClassFactory.CreateInstance<RunCodeGenBase>(RunCodeGenBase);
        if (!___runObject) {
            throw new Error("Failed to create RunCodeGenBase instance");
        }
        await ___runObject.setupDataSource();
        ___initialized = true;
    }
}

/** @deprecated Use {@link HandleServerInit}. */
export async function handleServerInit() {
    return HandleServerInit();
}