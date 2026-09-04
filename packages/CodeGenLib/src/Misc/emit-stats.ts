/**
 * In-process counters for one CodeGen file-emit pass.
 *
 * Kept as a tiny module with no config / reporter / EntityInfo imports so unit
 * tests can drive it (and `writeFileIfChanged`) without booting the CodeGen
 * graph. `runCodeGen` copies the snapshot onto `CodeGenReporter` at the end of
 * the file-generation phase.
 */
export type EmitStatsSnapshot = {
  filesWritten: number;
  filesSkipped: number;
  schemasEmitted: number;
  schemasSkipped: number;
  assembleMs: number;
};

export class EmitStats {
  private static _filesWritten = 0;
  private static _filesSkipped = 0;
  private static _schemasEmitted = 0;
  private static _schemasSkipped = 0;
  private static _assembleMs = 0;

  public static Reset(): void {
    this._filesWritten = 0;
    this._filesSkipped = 0;
    this._schemasEmitted = 0;
    this._schemasSkipped = 0;
    this._assembleMs = 0;
  }

  public static RecordFileWrite(wrote: boolean): void {
    if (wrote) {
      this._filesWritten += 1;
    } else {
      this._filesSkipped += 1;
    }
  }

  public static RecordSchemaEmit(emitted: boolean): void {
    if (emitted) {
      this._schemasEmitted += 1;
    } else {
      this._schemasSkipped += 1;
    }
  }

  public static AddAssembleMs(ms: number): void {
    this._assembleMs += ms;
  }

  public static Snapshot(): EmitStatsSnapshot {
    return {
      filesWritten: this._filesWritten,
      filesSkipped: this._filesSkipped,
      schemasEmitted: this._schemasEmitted,
      schemasSkipped: this._schemasSkipped,
      assembleMs: this._assembleMs,
    };
  }
}
