/**
 * @module registry-schemas
 *
 * Validators for the registry columns of `MJ: ML Models` as they are read back: the `Delivery` view and its stored
 * file, the `CodeVersion` and the `OutputSemantics`. A JSON column read through a typed accessor is only claimed to
 * have its type (the accessor parses the text, it does not check it), so the registry checks each value before it
 * builds an entry from it. Object schemas are `.strict()`, so a stored key the type does not have is refused.
 */
import { z } from 'zod';
import { JsonParse, type ParseResult } from './json-value';
import type { OutputSemantics, RegisteredDeliveryView, StoredFile } from './registry-contracts';
import { TaskTypeRules } from './task-type';
import type { CodeVersion } from './trainer-contract';
import { TrainerResultSchemas } from './trainer-result-schemas';

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

const storedFile = z.object({
  fileId: z.string().min(1),
  storageProviderId: z.string().min(1),
  providerKey: z.string().min(1),
  sha256,
  sizeBytes: z.number().int().min(0),
  writeOnce: z.literal(true),
}).strict();

const delivered = z.object({
  kind: z.literal('delivered'),
  gate: z.union([TrainerResultSchemas.GateModel, TrainerResultSchemas.GateKeepSimple]),
  shipped: z.string().min(1),
  shippedRole: z.enum(['model', 'simpleBaseline']),
  artifact: storedFile,
}).strict();

const noSignal = z.object({ kind: z.literal('no-signal'), gate: TrainerResultSchemas.GateNoSignal, artifact: z.null() }).strict();

/** The registry columns' validators. */
export class RegistrySchemas {
  /** A stored write-once file. */
  public static readonly StoredFile: z.ZodType<StoredFile> = storedFile;
  /** The registered delivery a model row stores. */
  public static readonly RegisteredDeliveryView: z.ZodType<RegisteredDeliveryView> = z.discriminatedUnion('kind', [delivered, noSignal]);

  /** Checks a `Delivery` value read back from a model row; every problem is reported. */
  public static ValidateDelivery(view: RegisteredDeliveryView): ParseResult<RegisteredDeliveryView> {
    return RegistrySchemas.validate(RegistrySchemas.RegisteredDeliveryView, view);
  }

  /** Checks a `CodeVersion` value read back from a model row; every problem is reported. */
  public static ValidateCodeVersion(codeVersion: CodeVersion): ParseResult<CodeVersion> {
    return RegistrySchemas.validate(TrainerResultSchemas.CodeVersion, codeVersion);
  }

  /**
   * Parses an `OutputSemantics` column: a JSON object whose only key is `task`, a task type checked by
   * {@link TaskTypeRules.ParseTaskType} (the one place the task rules live, so there is no second copy to drift).
   */
  public static ParseOutputSemantics(text: string | null): ParseResult<OutputSemantics> {
    const json = JsonParse.ParseJsonText(text, 'OutputSemantics');
    if (json.Ok === false) return json;
    const v = json.Value;
    if (!JsonParse.IsJsonObject(v)) return JsonParse.ParseFail('OutputSemantics must be a JSON object');
    const extra = Object.keys(v).filter((k) => k !== 'task');
    if (extra.length > 0) return JsonParse.ParseFail(`OutputSemantics has keys other than "task": ${extra.join(', ')}`);
    // `??`, not `||`: a present but falsy `task` (0, '', false) reaches the parser and is refused as that value, not as absent.
    const task = TaskTypeRules.ParseTaskType(v['task'] ?? null);
    return task.Ok === false ? task : JsonParse.ParseOk({ task: task.Value });
  }

  /** A schema's verdict on a value as a parse result naming each problem's path. */
  private static validate<T>(schema: z.ZodType<T>, value: T): ParseResult<T> {
    const parsed = schema.safeParse(value);
    if (parsed.success) return JsonParse.ParseOk(parsed.data);
    return JsonParse.ParseFail<T>(...parsed.error.issues.map((x) => `${x.path.join('.') || '(root)'}: ${x.message}`));
  }
}
