import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AssessmentFileSchema, ExecutionFileSchema, GenerationFileSchema, type AssessmentFile, type ExecutionFile, type GenerationFile } from '../schemas';
import type { RedactionCheck } from '../sandbox/Redaction';

/** A run ID is used as a folder name, so it may hold only letters, digits, `-` and `_`. */
const RUN_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * The folder of one run, `<root>/.jit-catch/runs/<run ID>`, and the files passed between the three jobs.
 * Every read is validated with its zod schema; every write is validated and passes the redaction check first.
 */
export class RunDir {
    public readonly Path: string;
    public readonly TranscriptDir: string;

    constructor(root: string, public readonly RunID: string, private readonly redaction: RedactionCheck) {
        if (!RUN_ID_RE.test(RunID)) throw new Error(`invalid run ID ${JSON.stringify(RunID)}: use letters, digits, '-' and '_' only`);
        this.Path = join(root, '.jit-catch', 'runs', RunID);
        this.TranscriptDir = join(this.Path, 'transcripts');
        mkdirSync(this.TranscriptDir, { recursive: true });
    }

    public WriteGeneration(f: GenerationFile): void { this.write('generation.json', GenerationFileSchema.parse(f)); }
    public ReadGeneration(): GenerationFile { return GenerationFileSchema.parse(this.read('generation.json')); }
    public WriteExecution(f: ExecutionFile): void { this.write('execution.json', ExecutionFileSchema.parse(f)); }
    public ReadExecution(): ExecutionFile { return ExecutionFileSchema.parse(this.read('execution.json')); }
    public WriteAssessment(f: AssessmentFile): void { this.write('assessment.json', AssessmentFileSchema.parse(f)); }

    private write(name: string, data: GenerationFile | ExecutionFile | AssessmentFile): void {
        const text = JSON.stringify(data, null, 2);
        this.redaction.AssertClean(text, name);
        writeFileSync(join(this.Path, name), text);
    }

    /** Parsed JSON of one run file; the caller validates it with the file's schema. */
    private read(name: string): unknown {
        const p = join(this.Path, name);
        if (!existsSync(p)) throw new Error(`run ${this.RunID} has no ${name}`);
        return JSON.parse(readFileSync(p, 'utf8'));
    }
}
