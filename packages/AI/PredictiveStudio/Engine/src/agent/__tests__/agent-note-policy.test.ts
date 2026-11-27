/**
 * A5 attack list — the Predictive Studio memory policy (`AgentMemoryPolicy`, §5.1.4, D5-11): attacks 1–6.
 *
 * The database is a fixture table read through a fake `RunView` (`RunView.FromMetadataProvider` is spied) that evaluates
 * the filters the policy writes (`F='v'`, `F IN (…)`, `F IS NULL`, AND/OR, parentheses). Note entities are test doubles
 * on `MJAIAgentNoteEntity.prototype` whose `Save()` runs the registered `PreSave` hooks as `BaseEntity.Save()` does and
 * writes the row back on success, so every writer below goes through the one hook the policy registers.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { BaseEngineRegistry, GetDataHooks, RunView, type CompositeKey, type IMetadataProvider, type PreSaveHook, type UserInfo } from '@memberjunction/core';
import { MJAIAgentNoteEntity } from '@memberjunction/core-entities';
import { PredictiveStudioAgentNotePolicy } from '../agent-note-policy';

type Value = string | number | boolean | null;
type Row = Record<string, Value>;

const MDA = 'A0000000-0000-4000-8000-000000000001';
const GOAL = 'A0000000-0000-4000-8000-000000000002';
const SCOUT = 'A0000000-0000-4000-8000-000000000003';
const DESIGNER = 'A0000000-0000-4000-8000-000000000004';
const BUILDER = 'A0000000-0000-4000-8000-000000000005';
const OTHER_AGENT = 'A0000000-0000-4000-8000-0000000000FF';
const PERSON = 'E1000000-0000-4000-8000-000000000001';
const COMPANY = 'E2000000-0000-4000-8000-000000000001';

/** One run tree per scenario: the orchestrator root, its Pipeline Builder child, the claim, pipeline, run and model. */
interface Tree { root: string; child: string; claim: string; pipeline: string; training: string; model: string }
function tree(n: number): Tree {
  const h = n.toString(16).padStart(2, '0').toUpperCase();
  return {
    root: `B${h}00000-0000-4000-8000-000000000001`, child: `B${h}00000-0000-4000-8000-000000000002`,
    claim: `C${h}00000-0000-4000-8000-000000000001`, pipeline: `D${h}00000-0000-4000-8000-000000000001`,
    training: `D${h}00000-0000-4000-8000-000000000002`, model: `D${h}00000-0000-4000-8000-000000000003`,
  };
}
const PUBLISHED = tree(1);
const FLAGGED = tree(2);
const FAILED = tree(3);
const VALIDATED = tree(4);
const NO_MODEL = tree(5);
const ARCHIVED = tree(6);
const CONTINUED = 'B0100000-0000-4000-8000-0000000000C0'; // a later turn of PUBLISHED's session (LastRunID → its root)

/** A stored ps-run-results/v2 envelope of a real completed training run (MJ_PS_PR5_claudeint), unflagged. */
const CLEAN_RESULTS = "{\"schema\":\"ps-run-results/v2\",\"status\":\"completed\",\"unitResolution\":{\"rowsRead\":16776,\"censoredRowsExcluded\":0,\"labelKnownRowsExcluded\":0,\"gapOutcomeRowsExcluded\":0,\"emptyLabelRowsExcluded\":0,\"duplicateRowsRemoved\":0,\"resolvedRows\":16776,\"dataCutoff\":\"2026-11-28\"},\"trainer\":{\"status\":\"completed\",\"trainingRunId\":\"C5EADFA0-5817-46E6-B257-8CBBB10969C9\",\"codeVersion\":{\"psGitSha\":\"776d1f7b0bf2698d44bce2bd7b2a1341118598c4\",\"sidecarVersion\":\"6.3.0-edge.2\",\"libraryVersions\":{\"python\":\"3.11.15\",\"numpy\":\"1.26.4\",\"pandas\":\"2.2.2\",\"scikit-learn\":\"1.4.2\",\"scipy\":\"1.17.1\",\"xgboost\":\"2.0.3\",\"lightgbm\":\"4.3.0\",\"joblib\":\"1.4.2\",\"threadpoolctl\":\"3.7.0\",\"pydantic\":\"2.7.4\"},\"threads\":1,\"seed\":0},\"computeSeconds\":19.672831666001002,\"innerScores\":[{\"candidate\":\"logistic_regression\",\"inner\":{\"metric\":\"log-loss\",\"value\":0.4389023728498059,\"interval\":{\"level\":0.95,\"lower\":0.4313498187985232,\"upper\":0.44645492690108857},\"n\":12598},\"folds\":15,\"optimistic\":true}],\"finalist\":\"logistic_regression\",\"holdoutAccess\":{\"accessedAt\":\"2026-11-27T13:28:24.739006Z\",\"count\":1,\"finalist\":\"logistic_regression\"},\"holdout\":{\"primary\":{\"metric\":\"log-loss\",\"value\":0.44240800904565464,\"interval\":{\"level\":0.95,\"lower\":0.4236920980426679,\"upper\":0.4598275680994113},\"n\":4178},\"secondary\":[{\"metric\":\"auc\",\"value\":0.735282010092418,\"interval\":{\"level\":0.95,\"lower\":0.7173058736128677,\"upper\":0.753948326677553},\"n\":4178},{\"metric\":\"accuracy\",\"value\":0.8039731929152705,\"interval\":{\"level\":0.95,\"lower\":0.7922391096218286,\"upper\":0.8164193393968406},\"n\":4178},{\"metric\":\"f1\",\"value\":0.8902291917973462,\"interval\":{\"level\":0.95,\"lower\":0.8829069518805804,\"upper\":0.8979483080202505},\"n\":4178},{\"metric\":\"precision\",\"value\":0.8070473876063183,\"interval\":{\"level\":0.95,\"lower\":0.7949586449552044,\"upper\":0.8195974979318453},\"n\":4178},{\"metric\":\"recall\",\"value\":0.9925283921099821,\"interval\":{\"level\":0.95,\"lower\":0.9895172691718197,\"upper\":0.9952295766249255},\"n\":4178},{\"metric\":\"calibration-slope\",\"value\":1.0016194611317113,\"interval\":{\"level\":0.95,\"lower\":0.9028938550612272,\"upper\":1.1116270455204895},\"n\":4178},{\"metric\":\"brier\",\"value\":0.14142393355622895,\"interval\":{\"level\":0.95,\"lower\":0.13445313821595356,\"upper\":0.148096708740827},\"n\":4178}]},\"baselines\":[{\"baseline\":{\"kind\":\"dummy\",\"name\":\"base-rate\"},\"role\":\"dummy\",\"holdout\":{\"metric\":\"log-loss\",\"value\":0.4992611363298202,\"interval\":{\"level\":0.95,\"lower\":0.48127118564153387,\"upper\":0.5158933548906888},\"n\":4178}},{\"baseline\":{\"kind\":\"one-feature\",\"selection\":\"best-single-feature-inner-cv\"},\"role\":\"simple\",\"holdout\":{\"metric\":\"log-loss\",\"value\":0.4709597682276952,\"interval\":{\"level\":0.95,\"lower\":0.45281049191633904,\"upper\":0.4876604851030934},\"n\":4178}},{\"baseline\":{\"kind\":\"glm\",\"family\":\"logistic\",\"penalty\":\"l2\"},\"role\":\"simple\",\"holdout\":{\"metric\":\"log-loss\",\"value\":0.44240800904565464,\"interval\":{\"level\":0.95,\"lower\":0.4236920980426679,\"upper\":0.4598275680994113},\"n\":4178}}],\"comparisons\":{\"modelVsDummy\":{\"value\":0.05685312728416558,\"ci\":[0.04734786813214986,0.06641235248950549],\"beats\":true},\"oneFeatureVsDummy\":{\"value\":0.028301368102125024,\"ci\":[0.02182805647211759,0.03461172369942916],\"beats\":true},\"modelVs:oneFeature\":{\"value\":0.02855175918204056,\"ci\":[0.02081770763985691,0.03595486156558388],\"beats\":true},\"glmVsDummy\":{\"value\":0.05685312728416558,\"ci\":[0.04734786813214986,0.06641235248950549],\"beats\":true},\"modelVs:glm\":{\"value\":0,\"ci\":[0,0],\"beats\":false}},\"gate\":{\"outcome\":\"keep-simple-baseline\",\"branch\":\"b:keep-simple-baseline\",\"shipped\":\"glm\",\"shippedRole\":\"simpleBaseline\",\"note\":null},\"incumbentDiff\":null,\"calibration\":{\"method\":\"auto\",\"intercept\":-0.0682418988616804,\"slope\":1.0016194611317113,\"reliability\":[{\"binLower\":0.4185029192619665,\"binUpper\":0.6104388064739872,\"meanPredicted\":0.5488159174176681,\"observedRate\":0.5287081339712919,\"n\":418},{\"binLower\":0.6105631975618634,\"binUpper\":0.6949636309723971,\"meanPredicted\":0.6550419206016072,\"observedRate\":0.6267942583732058,\"n\":418},{\"binLower\":0.6951147170475027,\"binUpper\":0.7529141075291319,\"meanPredicted\":0.7260616108486565,\"observedRate\":0.7416267942583732,\"n\":418},{\"binLower\":0.7529271943008635,\"binUpper\":0.8003701411526161,\"meanPredicted\":0.778014826933969,\"observedRate\":0.7607655502392344,\"n\":418},{\"binLower\":0.8004210620243373,\"binUpper\":0.8399342299141098,\"meanPredicted\":0.8205157607295017,\"observedRate\":0.8157894736842105,\"n\":418},{\"binLower\":0.8400721987768188,\"binUpper\":0.8726911675352679,\"meanPredicted\":0.8555353405586523,\"observedRate\":0.8397129186602871,\"n\":418},{\"binLower\":0.8727425783132376,\"binUpper\":0.9008114801061261,\"meanPredicted\":0.8868836876133502,\"observedRate\":0.868421052631579,\"n\":418},{\"binLower\":0.9009430921340063,\"binUpper\":0.9307598264600004,\"meanPredicted\":0.9160134331037618,\"observedRate\":0.9234449760765551,\"n\":418},{\"binLower\":0.9308172398829498,\"binUpper\":0.9552124450893364,\"meanPredicted\":0.9427921054807383,\"observedRate\":0.9400479616306955,\"n\":417},{\"binLower\":0.955241782761325,\"binUpper\":0.9952459588372291,\"meanPredicted\":0.9719756047558503,\"observedRate\":0.9640287769784173,\"n\":417}]},\"slices\":[],\"operatingPoint\":null,\"cost\":{\"computeSeconds\":19.672831666001002,\"tokens\":0,\"usd\":0,\"budget\":{\"maxComputeSeconds\":3600,\"maxTokens\":0,\"maxCandidates\":1,\"hardStop\":true},\"stoppedByBudget\":false},\"importance\":[{\"sourceColumn\":\"PS Truth: W1_MembershipYear.EventsAttended\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":0.06471156253440086,\"interval\":{\"level\":0.95,\"lower\":0.05700479727770475,\"upper\":0.07292041307259282},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.AutoRenew\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":0.03986112183933238,\"interval\":{\"level\":0.95,\"lower\":0.033305754225745714,\"upper\":0.04674036809879803},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.IncomeK\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":0.015602608293013964,\"interval\":{\"level\":0.95,\"lower\":0.011446972891904838,\"upper\":0.019597849878694097},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.Plan\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":0.011115287426835263,\"interval\":{\"level\":0.95,\"lower\":0.008074270584463899,\"upper\":0.014100532657406682},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.Year\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":0.0010707687416387501,\"interval\":{\"level\":0.95,\"lower\":0.00045733291082726004,\"upper\":0.0017445412583571556},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.Noise3\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":0.0003569560063421129,\"interval\":{\"level\":0.95,\"lower\":-0.00020774546909038406,\"upper\":0.0009023598161761126},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.Noise5\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":0.000315146817106815,\"interval\":{\"level\":0.95,\"lower\":6.731892874717319e-06,\"upper\":0.0006026648262704212},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.Region\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":5.447311912598618e-05,\"interval\":{\"level\":0.95,\"lower\":-0.0002611567175260343,\"upper\":0.00038214014339277844},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.Noise4\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":-9.350988209044786e-05,\"interval\":{\"level\":0.95,\"lower\":-0.0003706502089151131,\"upper\":0.00018036400598957778},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.Noise2\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":-9.716370853285472e-05,\"interval\":{\"level\":0.95,\"lower\":-0.0003282257160676441,\"upper\":0.00012818729594925288},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.Noise1\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":-0.0004536195000554577,\"interval\":{\"level\":0.95,\"lower\":-0.0009856612608284006,\"upper\":4.726075460509261e-05},\"n\":4178}}],\"leakageFlags\":[],\"predictionIntervalCoverage\":[],\"residualDiagnostics\":null,\"forecast\":null,\"innerSplitContrast\":null,\"artifacts\":[{\"candidate\":\"logistic_regression\",\"sha256\":\"afedc74941570cb8712faccd576ffeccde7a7b8e73f4f80cdd8092b98de2d4d3\",\"featureSchemaHash\":\"d177d88de41b115662365491e5e986b2e294cf07d0418ab753d4993d99c8f698\",\"classOrder\":[\"0\",\"1\"],\"fileId\":\"6613304C-0061-4098-A102-7CFCCA62D643\"},{\"candidate\":\"oneFeature\",\"sha256\":\"4d19c460ee31aa0c6ba27064d7e36ecdf90d37cfd5dcce5bdeec2759069b33f4\",\"featureSchemaHash\":\"d177d88de41b115662365491e5e986b2e294cf07d0418ab753d4993d99c8f698\",\"classOrder\":[\"0\",\"1\"],\"fileId\":\"FB6A8552-A4F6-425B-80C6-4D15A70E2D4B\"},{\"candidate\":\"glm\",\"sha256\":\"3c8d9f81125604ae556a97c0f5caec19f6b7abdcf21286bb940ac100a4ba9a40\",\"featureSchemaHash\":\"d177d88de41b115662365491e5e986b2e294cf07d0418ab753d4993d99c8f698\",\"classOrder\":[\"0\",\"1\"],\"fileId\":\"FBEE4B1B-ED3C-45D2-8445-70461C461294\"}]},\"trainerRequest\":{\"evaluationProtocolId\":\"77BB2743-5912-4903-A08A-64EEEFD960AC\",\"candidates\":[{\"name\":\"logistic_regression\",\"algorithmId\":\"B4B84DB7-C255-4118-BE36-7A0489A5AFCE\",\"driverKey\":\"logistic_regression\",\"hyperparameters\":{}}],\"seed\":0,\"threads\":1,\"timeoutSeconds\":3600,\"maxRetries\":2},\"carve\":{\"kind\":\"seeded-random\",\"cutoff\":null,\"holdoutEnd\":null,\"developmentRowCount\":12598,\"holdoutRowCount\":4178,\"excludedAfterHoldoutEnd\":0,\"holdoutClassCounts\":{\"0\":832,\"1\":3346},\"holdoutPeriods\":[],\"newEntity\":null},\"gate\":{\"evaluationProtocolId\":\"77BB2743-5912-4903-A08A-64EEEFD960AC\",\"margin\":0,\"primaryMetric\":\"log-loss\",\"holdoutRows\":4178,\"intervals\":{\"modelName\":\"logistic_regression\",\"modelVsDummy\":{\"value\":0.05685312728416558,\"lower\":0.04734786813214986,\"upper\":0.06641235248950549},\"modelVsBestSimple\":{\"value\":0,\"lower\":0,\"upper\":0},\"memberVsDummy\":{\"oneFeature\":{\"value\":0.028301368102125024,\"lower\":0.02182805647211759,\"upper\":0.03461172369942916},\"glm\":{\"value\":0.05685312728416558,\"lower\":0.04734786813214986,\"upper\":0.06641235248950549}},\"memberScores\":{\"oneFeature\":0.4709597682276952,\"glm\":0.44240800904565464},\"deliveredMember\":null},\"guards\":{\"taskKind\":\"binary\",\"holdoutClassCounts\":{\"0\":832,\"1\":3346},\"modelAucInterval\":{\"level\":0.95,\"lower\":0.7173058736128677,\"upper\":0.753948326677553},\"minMinorityClassRows\":20},\"transcribed\":{\"outcome\":\"keep-simple-baseline\",\"branch\":\"b:keep-simple-baseline\",\"shipped\":\"glm\",\"shippedRole\":\"simpleBaseline\",\"note\":null},\"decision\":{\"outcome\":\"keep-simple-baseline\",\"branch\":\"b:keep-simple-baseline\",\"shipped\":\"glm\",\"shippedRole\":\"simpleBaseline\",\"note\":null},\"guardRefusal\":null,\"reason\":{\"code\":\"simple-baseline-carries-signal\",\"text\":\"The simple baseline glm beats the flat guess by 0.0569 [0.0473, 0.0664] (log-loss); the trained model does not beat it, so the simple baseline is kept.\"},\"incumbentDiff\":null,\"sliceCoverage\":{\"missingSubgroups\":[],\"missingPeriods\":[],\"slicesWithoutInterval\":0}}}";
/** The same envelope with one single-feature-auc leakage flag, as a W3-leak-row training run stores it. */
const LEAKY_RESULTS = "{\"schema\":\"ps-run-results/v2\",\"status\":\"completed\",\"unitResolution\":{\"rowsRead\":16776,\"censoredRowsExcluded\":0,\"labelKnownRowsExcluded\":0,\"gapOutcomeRowsExcluded\":0,\"emptyLabelRowsExcluded\":0,\"duplicateRowsRemoved\":0,\"resolvedRows\":16776,\"dataCutoff\":\"2026-11-28\"},\"trainer\":{\"status\":\"completed\",\"trainingRunId\":\"C5EADFA0-5817-46E6-B257-8CBBB10969C9\",\"codeVersion\":{\"psGitSha\":\"776d1f7b0bf2698d44bce2bd7b2a1341118598c4\",\"sidecarVersion\":\"6.3.0-edge.2\",\"libraryVersions\":{\"python\":\"3.11.15\",\"numpy\":\"1.26.4\",\"pandas\":\"2.2.2\",\"scikit-learn\":\"1.4.2\",\"scipy\":\"1.17.1\",\"xgboost\":\"2.0.3\",\"lightgbm\":\"4.3.0\",\"joblib\":\"1.4.2\",\"threadpoolctl\":\"3.7.0\",\"pydantic\":\"2.7.4\"},\"threads\":1,\"seed\":0},\"computeSeconds\":19.672831666001002,\"innerScores\":[{\"candidate\":\"logistic_regression\",\"inner\":{\"metric\":\"log-loss\",\"value\":0.4389023728498059,\"interval\":{\"level\":0.95,\"lower\":0.4313498187985232,\"upper\":0.44645492690108857},\"n\":12598},\"folds\":15,\"optimistic\":true}],\"finalist\":\"logistic_regression\",\"holdoutAccess\":{\"accessedAt\":\"2026-11-27T13:28:24.739006Z\",\"count\":1,\"finalist\":\"logistic_regression\"},\"holdout\":{\"primary\":{\"metric\":\"log-loss\",\"value\":0.44240800904565464,\"interval\":{\"level\":0.95,\"lower\":0.4236920980426679,\"upper\":0.4598275680994113},\"n\":4178},\"secondary\":[{\"metric\":\"auc\",\"value\":0.735282010092418,\"interval\":{\"level\":0.95,\"lower\":0.7173058736128677,\"upper\":0.753948326677553},\"n\":4178},{\"metric\":\"accuracy\",\"value\":0.8039731929152705,\"interval\":{\"level\":0.95,\"lower\":0.7922391096218286,\"upper\":0.8164193393968406},\"n\":4178},{\"metric\":\"f1\",\"value\":0.8902291917973462,\"interval\":{\"level\":0.95,\"lower\":0.8829069518805804,\"upper\":0.8979483080202505},\"n\":4178},{\"metric\":\"precision\",\"value\":0.8070473876063183,\"interval\":{\"level\":0.95,\"lower\":0.7949586449552044,\"upper\":0.8195974979318453},\"n\":4178},{\"metric\":\"recall\",\"value\":0.9925283921099821,\"interval\":{\"level\":0.95,\"lower\":0.9895172691718197,\"upper\":0.9952295766249255},\"n\":4178},{\"metric\":\"calibration-slope\",\"value\":1.0016194611317113,\"interval\":{\"level\":0.95,\"lower\":0.9028938550612272,\"upper\":1.1116270455204895},\"n\":4178},{\"metric\":\"brier\",\"value\":0.14142393355622895,\"interval\":{\"level\":0.95,\"lower\":0.13445313821595356,\"upper\":0.148096708740827},\"n\":4178}]},\"baselines\":[{\"baseline\":{\"kind\":\"dummy\",\"name\":\"base-rate\"},\"role\":\"dummy\",\"holdout\":{\"metric\":\"log-loss\",\"value\":0.4992611363298202,\"interval\":{\"level\":0.95,\"lower\":0.48127118564153387,\"upper\":0.5158933548906888},\"n\":4178}},{\"baseline\":{\"kind\":\"one-feature\",\"selection\":\"best-single-feature-inner-cv\"},\"role\":\"simple\",\"holdout\":{\"metric\":\"log-loss\",\"value\":0.4709597682276952,\"interval\":{\"level\":0.95,\"lower\":0.45281049191633904,\"upper\":0.4876604851030934},\"n\":4178}},{\"baseline\":{\"kind\":\"glm\",\"family\":\"logistic\",\"penalty\":\"l2\"},\"role\":\"simple\",\"holdout\":{\"metric\":\"log-loss\",\"value\":0.44240800904565464,\"interval\":{\"level\":0.95,\"lower\":0.4236920980426679,\"upper\":0.4598275680994113},\"n\":4178}}],\"comparisons\":{\"modelVsDummy\":{\"value\":0.05685312728416558,\"ci\":[0.04734786813214986,0.06641235248950549],\"beats\":true},\"oneFeatureVsDummy\":{\"value\":0.028301368102125024,\"ci\":[0.02182805647211759,0.03461172369942916],\"beats\":true},\"modelVs:oneFeature\":{\"value\":0.02855175918204056,\"ci\":[0.02081770763985691,0.03595486156558388],\"beats\":true},\"glmVsDummy\":{\"value\":0.05685312728416558,\"ci\":[0.04734786813214986,0.06641235248950549],\"beats\":true},\"modelVs:glm\":{\"value\":0,\"ci\":[0,0],\"beats\":false}},\"gate\":{\"outcome\":\"keep-simple-baseline\",\"branch\":\"b:keep-simple-baseline\",\"shipped\":\"glm\",\"shippedRole\":\"simpleBaseline\",\"note\":null},\"incumbentDiff\":null,\"calibration\":{\"method\":\"auto\",\"intercept\":-0.0682418988616804,\"slope\":1.0016194611317113,\"reliability\":[{\"binLower\":0.4185029192619665,\"binUpper\":0.6104388064739872,\"meanPredicted\":0.5488159174176681,\"observedRate\":0.5287081339712919,\"n\":418},{\"binLower\":0.6105631975618634,\"binUpper\":0.6949636309723971,\"meanPredicted\":0.6550419206016072,\"observedRate\":0.6267942583732058,\"n\":418},{\"binLower\":0.6951147170475027,\"binUpper\":0.7529141075291319,\"meanPredicted\":0.7260616108486565,\"observedRate\":0.7416267942583732,\"n\":418},{\"binLower\":0.7529271943008635,\"binUpper\":0.8003701411526161,\"meanPredicted\":0.778014826933969,\"observedRate\":0.7607655502392344,\"n\":418},{\"binLower\":0.8004210620243373,\"binUpper\":0.8399342299141098,\"meanPredicted\":0.8205157607295017,\"observedRate\":0.8157894736842105,\"n\":418},{\"binLower\":0.8400721987768188,\"binUpper\":0.8726911675352679,\"meanPredicted\":0.8555353405586523,\"observedRate\":0.8397129186602871,\"n\":418},{\"binLower\":0.8727425783132376,\"binUpper\":0.9008114801061261,\"meanPredicted\":0.8868836876133502,\"observedRate\":0.868421052631579,\"n\":418},{\"binLower\":0.9009430921340063,\"binUpper\":0.9307598264600004,\"meanPredicted\":0.9160134331037618,\"observedRate\":0.9234449760765551,\"n\":418},{\"binLower\":0.9308172398829498,\"binUpper\":0.9552124450893364,\"meanPredicted\":0.9427921054807383,\"observedRate\":0.9400479616306955,\"n\":417},{\"binLower\":0.955241782761325,\"binUpper\":0.9952459588372291,\"meanPredicted\":0.9719756047558503,\"observedRate\":0.9640287769784173,\"n\":417}]},\"slices\":[],\"operatingPoint\":null,\"cost\":{\"computeSeconds\":19.672831666001002,\"tokens\":0,\"usd\":0,\"budget\":{\"maxComputeSeconds\":3600,\"maxTokens\":0,\"maxCandidates\":1,\"hardStop\":true},\"stoppedByBudget\":false},\"importance\":[{\"sourceColumn\":\"PS Truth: W1_MembershipYear.EventsAttended\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":0.06471156253440086,\"interval\":{\"level\":0.95,\"lower\":0.05700479727770475,\"upper\":0.07292041307259282},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.AutoRenew\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":0.03986112183933238,\"interval\":{\"level\":0.95,\"lower\":0.033305754225745714,\"upper\":0.04674036809879803},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.IncomeK\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":0.015602608293013964,\"interval\":{\"level\":0.95,\"lower\":0.011446972891904838,\"upper\":0.019597849878694097},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.Plan\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":0.011115287426835263,\"interval\":{\"level\":0.95,\"lower\":0.008074270584463899,\"upper\":0.014100532657406682},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.Year\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":0.0010707687416387501,\"interval\":{\"level\":0.95,\"lower\":0.00045733291082726004,\"upper\":0.0017445412583571556},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.Noise3\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":0.0003569560063421129,\"interval\":{\"level\":0.95,\"lower\":-0.00020774546909038406,\"upper\":0.0009023598161761126},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.Noise5\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":0.000315146817106815,\"interval\":{\"level\":0.95,\"lower\":6.731892874717319e-06,\"upper\":0.0006026648262704212},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.Region\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":5.447311912598618e-05,\"interval\":{\"level\":0.95,\"lower\":-0.0002611567175260343,\"upper\":0.00038214014339277844},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.Noise4\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":-9.350988209044786e-05,\"interval\":{\"level\":0.95,\"lower\":-0.0003706502089151131,\"upper\":0.00018036400598957778},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.Noise2\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":-9.716370853285472e-05,\"interval\":{\"level\":0.95,\"lower\":-0.0003282257160676441,\"upper\":0.00012818729594925288},\"n\":4178}},{\"sourceColumn\":\"PS Truth: W1_MembershipYear.Noise1\",\"permutationImportance\":{\"metric\":\"log-loss\",\"value\":-0.0004536195000554577,\"interval\":{\"level\":0.95,\"lower\":-0.0009856612608284006,\"upper\":4.726075460509261e-05},\"n\":4178}}],\"leakageFlags\":[{\"kind\":\"single-feature-auc\",\"sourceColumn\":\"W3_LeakColumn\",\"heldOutAuc\":0.99}],\"predictionIntervalCoverage\":[],\"residualDiagnostics\":null,\"forecast\":null,\"innerSplitContrast\":null,\"artifacts\":[{\"candidate\":\"logistic_regression\",\"sha256\":\"afedc74941570cb8712faccd576ffeccde7a7b8e73f4f80cdd8092b98de2d4d3\",\"featureSchemaHash\":\"d177d88de41b115662365491e5e986b2e294cf07d0418ab753d4993d99c8f698\",\"classOrder\":[\"0\",\"1\"],\"fileId\":\"6613304C-0061-4098-A102-7CFCCA62D643\"},{\"candidate\":\"oneFeature\",\"sha256\":\"4d19c460ee31aa0c6ba27064d7e36ecdf90d37cfd5dcce5bdeec2759069b33f4\",\"featureSchemaHash\":\"d177d88de41b115662365491e5e986b2e294cf07d0418ab753d4993d99c8f698\",\"classOrder\":[\"0\",\"1\"],\"fileId\":\"FB6A8552-A4F6-425B-80C6-4D15A70E2D4B\"},{\"candidate\":\"glm\",\"sha256\":\"3c8d9f81125604ae556a97c0f5caec19f6b7abdcf21286bb940ac100a4ba9a40\",\"featureSchemaHash\":\"d177d88de41b115662365491e5e986b2e294cf07d0418ab753d4993d99c8f698\",\"classOrder\":[\"0\",\"1\"],\"fileId\":\"FBEE4B1B-ED3C-45D2-8445-70461C461294\"}]},\"trainerRequest\":{\"evaluationProtocolId\":\"77BB2743-5912-4903-A08A-64EEEFD960AC\",\"candidates\":[{\"name\":\"logistic_regression\",\"algorithmId\":\"B4B84DB7-C255-4118-BE36-7A0489A5AFCE\",\"driverKey\":\"logistic_regression\",\"hyperparameters\":{}}],\"seed\":0,\"threads\":1,\"timeoutSeconds\":3600,\"maxRetries\":2},\"carve\":{\"kind\":\"seeded-random\",\"cutoff\":null,\"holdoutEnd\":null,\"developmentRowCount\":12598,\"holdoutRowCount\":4178,\"excludedAfterHoldoutEnd\":0,\"holdoutClassCounts\":{\"0\":832,\"1\":3346},\"holdoutPeriods\":[],\"newEntity\":null},\"gate\":{\"evaluationProtocolId\":\"77BB2743-5912-4903-A08A-64EEEFD960AC\",\"margin\":0,\"primaryMetric\":\"log-loss\",\"holdoutRows\":4178,\"intervals\":{\"modelName\":\"logistic_regression\",\"modelVsDummy\":{\"value\":0.05685312728416558,\"lower\":0.04734786813214986,\"upper\":0.06641235248950549},\"modelVsBestSimple\":{\"value\":0,\"lower\":0,\"upper\":0},\"memberVsDummy\":{\"oneFeature\":{\"value\":0.028301368102125024,\"lower\":0.02182805647211759,\"upper\":0.03461172369942916},\"glm\":{\"value\":0.05685312728416558,\"lower\":0.04734786813214986,\"upper\":0.06641235248950549}},\"memberScores\":{\"oneFeature\":0.4709597682276952,\"glm\":0.44240800904565464},\"deliveredMember\":null},\"guards\":{\"taskKind\":\"binary\",\"holdoutClassCounts\":{\"0\":832,\"1\":3346},\"modelAucInterval\":{\"level\":0.95,\"lower\":0.7173058736128677,\"upper\":0.753948326677553},\"minMinorityClassRows\":20},\"transcribed\":{\"outcome\":\"keep-simple-baseline\",\"branch\":\"b:keep-simple-baseline\",\"shipped\":\"glm\",\"shippedRole\":\"simpleBaseline\",\"note\":null},\"decision\":{\"outcome\":\"keep-simple-baseline\",\"branch\":\"b:keep-simple-baseline\",\"shipped\":\"glm\",\"shippedRole\":\"simpleBaseline\",\"note\":null},\"guardRefusal\":null,\"reason\":{\"code\":\"simple-baseline-carries-signal\",\"text\":\"The simple baseline glm beats the flat guess by 0.0569 [0.0473, 0.0664] (log-loss); the trained model does not beat it, so the simple baseline is kept.\"},\"incumbentDiff\":null,\"sliceCoverage\":{\"missingSubgroups\":[],\"missingPeriods\":[],\"slicesWithoutInterval\":0}}}";

let db: Record<string, Row[]>;

function addTree(t: Tree, model: { status: string | null; publish: boolean; training: string; claim?: string; flagged?: boolean }): void {
  db['MJ: AI Agent Runs'].push(
    { ID: t.root, LastRunID: null, RootParentRunID: t.root, AgentID: MDA },
    { ID: t.child, LastRunID: null, RootParentRunID: t.root, AgentID: BUILDER },
  );
  db['MJ: ML Build Approval Claims'].push({ ID: t.claim, ClaimingAgentRunID: t.root, Outcome: model.claim ?? 'built', MLTrainingPipelineID: t.pipeline });
  db['MJ: ML Training Runs'].push({ ID: t.training, PipelineID: t.pipeline, Status: model.training, ValidationResults: model.flagged ? LEAKY_RESULTS : CLEAN_RESULTS });
  if (model.status !== null) db['MJ: ML Models'].push({ ID: t.model, PipelineID: t.pipeline, Status: model.status, TrainingRunID: t.training });
  if (model.publish) db['MJ: ML Model Publish Records'].push({ ID: `${t.model.slice(0, 35)}9`, ModelID: t.model, Kind: 'publish' });
}

function seed(): void {
  db = {
    'MJ: AI Agents': [
      { ID: MDA, Name: 'Model Development Agent' }, { ID: GOAL, Name: 'Goal Analyst' }, { ID: SCOUT, Name: 'Data Scout' },
      { ID: DESIGNER, Name: 'Experiment Designer' }, { ID: BUILDER, Name: 'Pipeline Builder' }, { ID: OTHER_AGENT, Name: 'Sage' },
    ],
    'MJ: AI Agent Runs': [], 'MJ: ML Build Approval Claims': [], 'MJ: ML Training Runs': [], 'MJ: ML Models': [],
    'MJ: ML Model Publish Records': [], 'MJ: AI Agent Notes': [],
  };
  addTree(PUBLISHED, { status: 'Published', publish: true, training: 'Completed' });
  addTree(FLAGGED, { status: 'Draft', publish: false, training: 'Completed', flagged: true });
  addTree(FAILED, { status: null, publish: false, training: 'Failed', claim: 'failed' });
  addTree(VALIDATED, { status: 'Validated', publish: false, training: 'Completed' });
  db['MJ: AI Agent Runs'].push({ ID: NO_MODEL.root, LastRunID: null, RootParentRunID: NO_MODEL.root, AgentID: MDA });
  addTree(ARCHIVED, { status: 'Published', publish: true, training: 'Completed' });
  db['MJ: AI Agent Runs'].push({ ID: CONTINUED, LastRunID: PUBLISHED.root, RootParentRunID: CONTINUED, AgentID: MDA });
}

// ── A small evaluator for the filters the policy writes ──────────────────────────────────────────────────────────
type Token = { t: 'id' | 'str' | 'op' | 'lp' | 'rp' | 'comma'; v: string };
function tokens(s: string): Token[] {
  const out: Token[] = [];
  const re = /\s*(?:('(?:[^']|'')*')|(\()|(\))|(,)|(=)|([A-Za-z_][A-Za-z0-9_]*))/y;
  let m: RegExpExecArray | null;
  while (re.lastIndex < s.length && (m = re.exec(s)) !== null) {
    if (m[1]) out.push({ t: 'str', v: m[1].slice(1, -1).replace(/''/g, "'") });
    else if (m[2]) out.push({ t: 'lp', v: '(' });
    else if (m[3]) out.push({ t: 'rp', v: ')' });
    else if (m[4]) out.push({ t: 'comma', v: ',' });
    else if (m[5]) out.push({ t: 'op', v: '=' });
    else if (m[6]) out.push({ t: 'id', v: m[6] });
    if (s.slice(re.lastIndex).trim() === '') break;
  }
  return out;
}
const eq = (a: Value, b: string): boolean => typeof a === 'string' && a.toUpperCase() === b.toUpperCase();
function parse(s: string): (r: Row) => boolean {
  const ts = tokens(s);
  let i = 0;
  const kw = (w: string): boolean => ts[i]?.t === 'id' && ts[i].v.toUpperCase() === w;
  function primary(): (r: Row) => boolean {
    if (ts[i]?.t === 'lp') { i++; const e = or(); i++; return e; }
    const field = ts[i++].v;
    if (kw('IS')) { i++; const not = kw('NOT'); if (not) i++; i++; return (r) => (r[field] === null || r[field] === undefined) !== not; }
    if (kw('IN')) {
      i += 2; const vals: string[] = [];
      while (ts[i].t !== 'rp') { if (ts[i].t === 'str') vals.push(ts[i].v); i++; }
      i++; return (r) => vals.some((v) => eq(r[field] ?? null, v));
    }
    i++; const v = ts[i++].v; return (r) => eq(r[field] ?? null, v);
  }
  function and(): (r: Row) => boolean { let l = primary(); while (kw('AND')) { i++; const a = l, b = primary(); l = (r) => a(r) && b(r); } return l; }
  function or(): (r: Row) => boolean { let l = and(); while (kw('OR')) { i++; const a = l, b = and(); l = (r) => a(r) || b(r); } return l; }
  return or();
}

interface FakeParams { EntityName: string; ExtraFilter?: string; ResultType?: string; MaxRows?: number; AfterKey?: CompositeKey }
let reads: FakeParams[];
function rowsFor(p: FakeParams): Row[] {
  reads.push(p);
  const all = db[p.EntityName] ?? [];
  const filtered = p.ExtraFilter ? all.filter(parse(p.ExtraFilter)) : [...all];
  const sorted = [...filtered].sort((a, b) => String(a.ID).localeCompare(String(b.ID)));
  const afterId = p.AfterKey ? String(p.AfterKey.KeyValuePairs[0].Value) : null;
  const page = afterId ? sorted.filter((r) => String(r.ID).localeCompare(afterId) > 0) : sorted;
  return p.MaxRows ? page.slice(0, p.MaxRows) : page;
}
function toResult(p: FakeParams): { Success: true; Results: (Row | MJAIAgentNoteEntity)[] } {
  const rows = rowsFor(p);
  if (p.ResultType === 'entity_object' && p.EntityName === 'MJ: AI Agent Notes') return { Success: true, Results: rows.map((r) => storedNote(String(r.ID))) };
  return { Success: true, Results: rows };
}

const provider = { EntityByName: (n: string) => ({ Name: n }), Entities: [] } as unknown as IMetadataProvider;
const owner = { ID: 'E3000000-0000-4000-8000-000000000001', Type: 'Owner', Name: 'Owner' } as unknown as UserInfo;
const person = { ID: PERSON, Type: 'User', Name: 'Person' } as unknown as UserInfo;
const system = { ID: 'E4000000-0000-4000-8000-000000000001', Type: 'Owner', Name: 'System' } as unknown as UserInfo;

// ── Note entity doubles: Save() runs the PreSave hooks as BaseEntity.Save() does ─────────────────────────────────
const NOTE_FIELDS = ['ID', 'AgentID', 'Status', 'UserID', 'CompanyID', 'SourceAIAgentRunID', 'Comments', 'Note', 'Type', 'AuthorType', 'AccessCount'] as const;
let nextId = 0;
function noteEntity(init: Row, saved: boolean, user: UserInfo): MJAIAgentNoteEntity {
  const e = Object.create(MJAIAgentNoteEntity.prototype) as MJAIAgentNoteEntity;
  const state: Row = { ...init };
  let isSaved = saved;
  let latest: { CompleteMessage: string } | null = null;
  for (const f of NOTE_FIELDS) Object.defineProperty(e, f, { get: () => state[f] ?? null, set: (v: Value) => { state[f] = v; }, configurable: true });
  Object.defineProperty(e, 'EntityInfo', { get: () => ({ Name: 'MJ: AI Agent Notes' }) });
  Object.defineProperty(e, 'IsSaved', { get: () => isSaved });
  Object.defineProperty(e, 'ProviderToUse', { get: () => provider, configurable: true });
  Object.defineProperty(e, 'LatestResult', { get: () => latest });
  Object.defineProperty(e, 'PrimaryKey', { get: () => ({ KeyValuePairs: [{ FieldName: 'ID', Value: state.ID }] }) });
  Object.defineProperty(e, 'Save', {
    value: async (): Promise<boolean> => {
      for (const hook of GetDataHooks<PreSaveHook>('PreSave')) {
        const r = await hook(e, user);
        if (r !== true) { latest = { CompleteMessage: typeof r === 'string' ? r : 'Save rejected by pre-save hook' }; return false; }
      }
      if (!state.ID) state.ID = `F0000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`;
      const rows = db['MJ: AI Agent Notes'];
      const at = rows.findIndex((r) => eq(r.ID, String(state.ID)));
      if (at >= 0) rows[at] = { ...state }; else rows.push({ ...state });
      isSaved = true;
      return true;
    },
  });
  return e;
}
/** A stored note row as the saving user loads it. */
function storedNote(id: string, user: UserInfo = system): MJAIAgentNoteEntity {
  const row = db['MJ: AI Agent Notes'].find((r) => eq(r.ID, id));
  if (!row) throw new Error(`no note ${id}`);
  return noteEntity(row, true, user);
}
function insertNote(row: Row): string {
  const id = `F1000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`;
  db['MJ: AI Agent Notes'].push({ ID: id, UserID: PERSON, CompanyID: null, Comments: null, Note: 'n', Type: 'Context', AuthorType: 'Agent', AccessCount: 1, ...row });
  return id;
}
function statusOf(id: string): Value {
  return db['MJ: AI Agent Notes'].find((r) => eq(r.ID, id))?.Status ?? null;
}

/**
 * The note `MemoryWriteManager.persistNewNote` builds for an untainted run (`MemoryWriteManager.ts:455-480`): a PS run
 * calls only Trusted PS Actions, so `isRunTainted` is false and the note is written `Provisional`.
 */
function memoryWriteManagerNote(agentId: string, sourceRunId: string, isRunTainted: boolean): MJAIAgentNoteEntity {
  return noteEntity({
    AgentID: agentId, UserID: PERSON, CompanyID: null, Type: 'Context', Note: 'The renewal model works on tenure.',
    Status: isRunTainted ? 'Pending' : 'Provisional', AuthorType: 'Agent', AccessCount: 1, SourceAIAgentRunID: sourceRunId,
  }, false, person);
}

beforeAll(() => PredictiveStudioAgentNotePolicy.Register());
beforeEach(() => {
  seed();
  reads = [];
  vi.spyOn(BaseEngineRegistry.Instance, 'TryGetCachedRecords').mockReturnValue(null);
  const rv = {
    RunView: vi.fn(async (p: FakeParams) => toResult(p)),
    RunViews: vi.fn(async (ps: FakeParams[]) => ps.map((p) => toResult(p))),
  };
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(rv as unknown as RunView);
});
afterEach(() => vi.restoreAllMocks());

async function save(e: MJAIAgentNoteEntity): Promise<{ ok: boolean; message: string }> {
  const ok = await e.Save();
  return { ok, message: e.LatestResult?.CompleteMessage ?? '' };
}

describe('the hook is registered once, marked', () => {
  it('a marked PreSave hook is registered and a second Register adds none', () => {
    const before = GetDataHooks<PreSaveHook>('PreSave').length;
    PredictiveStudioAgentNotePolicy.Register();
    expect(GetDataHooks<PreSaveHook>('PreSave').length).toBe(before);
    expect(GetDataHooks<PreSaveHook>('PreSave').filter((h) => Object.prototype.hasOwnProperty.call(h, PredictiveStudioAgentNotePolicy.HookMark))).toHaveLength(1);
  });
});

describe('attack 1: a PS orchestrator run that calls only PS Actions writes a note through MemoryWriteManager', () => {
  it("the run is untainted, so MemoryWriteManager's note is Provisional; the save is refused pending-only-on-create", async () => {
    const note = memoryWriteManagerNote(MDA, PUBLISHED.root, false);
    expect(note.Status).toBe('Provisional');
    const r = await save(note);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('"kind":"pending-only-on-create"');
    expect(r.message).toContain('"status":"Provisional"');
    expect(db['MJ: AI Agent Notes']).toHaveLength(0);
  });

  it('a Pending create from the same run succeeds (not injectable until the rule activates it)', async () => {
    const note = memoryWriteManagerNote(MDA, PUBLISHED.root, true);
    const r = await save(note);
    expect(r).toEqual({ ok: true, message: '' });
    expect(db['MJ: AI Agent Notes'][0].Status).toBe('Pending');
  });

  it('every PS sub-agent is governed the same way', async () => {
    for (const agent of [GOAL, SCOUT, DESIGNER, BUILDER]) {
      expect((await save(memoryWriteManagerNote(agent, NO_MODEL.root, false))).message).toContain('pending-only-on-create');
    }
  });
});

describe('attack 2: every writer of a PS-agent note is held to the rule, whoever saves', () => {
  it('a GraphQL create with Status = Active → pending-only-on-create', async () => {
    const r = await save(noteEntity({ AgentID: MDA, Status: 'Active', UserID: PERSON, SourceAIAgentRunID: PUBLISHED.root }, false, person));
    expect(r.message).toContain('"kind":"pending-only-on-create","status":"Active"');
  });

  it('a GraphQL update Pending → Active by an Owner: refused when the rule fails, saved when it holds', async () => {
    const failing = insertNote({ AgentID: MDA, Status: 'Pending', SourceAIAgentRunID: VALIDATED.root });
    const holding = insertNote({ AgentID: MDA, Status: 'Pending', SourceAIAgentRunID: PUBLISHED.root });
    const a = storedNote(failing, owner);
    a.Status = 'Active';
    const ra = await save(a);
    expect(ra.ok).toBe(false);
    expect(ra.message).toContain('"kind":"activation-rule-failed"');
    expect(statusOf(failing)).toBe('Pending');
    const b = storedNote(holding, owner);
    b.Status = 'Active';
    expect((await save(b)).ok).toBe(true);
    expect(statusOf(holding)).toBe('Active');
  });

  it("the Memory Manager agent's note path (a new Active note, AuthorType MemoryManager) → refused", async () => {
    const r = await save(noteEntity({ AgentID: MDA, Status: 'Active', AuthorType: 'MemoryManager', UserID: PERSON, SourceAIAgentRunID: PUBLISHED.root }, false, system));
    expect(r.message).toContain('pending-only-on-create');
  });

  it('an Update Record Action from an agent run (system user, Pending → Active, no published model) → refused', async () => {
    const id = insertNote({ AgentID: SCOUT, Status: 'Pending', SourceAIAgentRunID: NO_MODEL.root });
    const e = storedNote(id, system);
    e.Status = 'Active';
    expect((await save(e)).message).toContain('activation-rule-failed');
  });

  it('an Active note re-pointed at a flagged run, or stripped of its scope, is refused', async () => {
    const id = insertNote({ AgentID: MDA, Status: 'Active', SourceAIAgentRunID: PUBLISHED.root });
    const moved = storedNote(id, owner);
    moved.SourceAIAgentRunID = FLAGGED.root;
    expect((await save(moved)).message).toContain('activation-rule-failed');
    const unscoped = storedNote(id, owner);
    unscoped.UserID = null;
    expect((await save(unscoped)).message).toContain('activation-rule-failed');
  });

  it("a non-PS note moved onto a PS agent while Active is held to the create rule", async () => {
    const id = insertNote({ AgentID: OTHER_AGENT, Status: 'Active', SourceAIAgentRunID: null });
    const e = storedNote(id, owner);
    e.AgentID = MDA;
    expect((await save(e)).message).toContain('pending-only-on-create');
  });

  it('a stored Active note may be touched (AccessCount) and archived without the rule', async () => {
    const id = insertNote({ AgentID: MDA, Status: 'Active', SourceAIAgentRunID: VALIDATED.root });
    const e = storedNote(id, person);
    e.AccessCount = 2;
    expect((await save(e)).ok).toBe(true);
    const a = storedNote(id, person);
    a.Status = 'Archived';
    expect((await save(a)).ok).toBe(true);
  });
});

describe('attack 3: a note whose source run tree does not qualify is refused on create', () => {
  it.each([
    ['a leakage-flagged model (W3-leak-row)', FLAGGED.root, 'leakage-flagged'],
    ['a failed build', FAILED.root, 'build-failed'],
    ['a model Validated but not Published', VALIDATED.root, 'not-published'],
    ["the flagged tree's Pipeline Builder child run", FLAGGED.child, 'leakage-flagged'],
  ])('%s → source-not-qualifying', async (_label, sourceRun, reason) => {
    const r = await save(noteEntity({ AgentID: MDA, Status: 'Pending', UserID: PERSON, SourceAIAgentRunID: sourceRun }, false, person));
    expect(r.ok).toBe(false);
    expect(r.message).toContain(`"kind":"source-not-qualifying","reason":"${reason}"`);
  });

  it('a later turn of a published session links to the build its earlier turn claimed', async () => {
    const verdict = await PredictiveStudioAgentNotePolicy.SourceVerdict(CONTINUED, { Provider: provider, ContextUser: system });
    expect(verdict).toEqual({ Kind: 'qualifies', ModelIDs: [PUBLISHED.model] });
  });

  it('a published model without a publish record is not-published', async () => {
    db['MJ: ML Model Publish Records'] = [];
    expect(await PredictiveStudioAgentNotePolicy.SourceVerdict(PUBLISHED.root, { Provider: provider, ContextUser: system })).toEqual({ Kind: 'refused', Reason: 'not-published' });
  });
});

describe('attack 4: Provisional on a PS-agent note is never accepted', () => {
  it.each([[owner], [person], [system]])('an update to Provisional by %o → provisional-refused', async (user) => {
    const id = insertNote({ AgentID: MDA, Status: 'Pending', SourceAIAgentRunID: PUBLISHED.root });
    const e = storedNote(id, user);
    e.Status = 'Provisional';
    const r = await save(e);
    expect(r.message).toContain('"kind":"provisional-refused"');
    expect(statusOf(id)).toBe('Pending');
  });

  it("a non-PS agent's Provisional note is saved exactly as on next", async () => {
    const r = await save(memoryWriteManagerNote(OTHER_AGENT, PUBLISHED.root, false));
    expect(r).toEqual({ ok: true, message: '' });
    expect(db['MJ: AI Agent Notes'][0].Status).toBe('Provisional');
    const e = storedNote(String(db['MJ: AI Agent Notes'][0].ID), owner);
    e.Status = 'Active';
    expect((await save(e)).ok).toBe(true);
  });
});

describe('attack 5: the sweep', () => {
  it('activates a qualifying Pending note; archives an Active note whose model was archived after activation; archives a NULL/NULL note; leaves non-PS notes', async () => {
    const qualifying = insertNote({ AgentID: MDA, Status: 'Pending', SourceAIAgentRunID: PUBLISHED.root });
    const laterArchived = insertNote({ AgentID: MDA, Status: 'Pending', SourceAIAgentRunID: ARCHIVED.root });
    const unscoped = insertNote({ AgentID: GOAL, Status: 'Active', UserID: null, CompanyID: null, SourceAIAgentRunID: PUBLISHED.root });
    const waiting = insertNote({ AgentID: MDA, Status: 'Pending', SourceAIAgentRunID: NO_MODEL.root });
    const company = insertNote({ AgentID: MDA, Status: 'Pending', UserID: null, CompanyID: COMPANY, SourceAIAgentRunID: PUBLISHED.root });
    const otherPending = insertNote({ AgentID: OTHER_AGENT, Status: 'Pending', UserID: null, SourceAIAgentRunID: FLAGGED.root });
    const otherActive = insertNote({ AgentID: OTHER_AGENT, Status: 'Active', UserID: null, SourceAIAgentRunID: FLAGGED.root });

    const first = await PredictiveStudioAgentNotePolicy.Sweep(provider, system);
    expect(first).toEqual({ Activated: 3, Archived: 1, Failed: [] });
    expect(statusOf(qualifying)).toBe('Active');
    expect(statusOf(laterArchived)).toBe('Active');
    expect(statusOf(company)).toBe('Active');
    expect(statusOf(unscoped)).toBe('Archived');
    expect(statusOf(waiting)).toBe('Pending');

    db['MJ: ML Models'].find((m) => eq(m.ID, ARCHIVED.model))!.Status = 'Archived';
    const second = await PredictiveStudioAgentNotePolicy.Sweep(provider, system);
    expect(second).toEqual({ Activated: 0, Archived: 1, Failed: [] });
    expect(statusOf(laterArchived)).toBe('Archived');
    expect(statusOf(qualifying)).toBe('Active');
    expect(statusOf(otherPending)).toBe('Pending');
    expect(statusOf(otherActive)).toBe('Active');
    expect(db['MJ: AI Agent Notes'].find((r) => eq(r.ID, laterArchived))?.Comments).toMatch(/archived: its source run tree is not-published/);
    expect(db['MJ: AI Agent Notes'].find((r) => eq(r.ID, qualifying))?.Comments).toMatch(/activated: its source model/);
  });

  it('archives pre-policy Provisional/Active PS notes from a flagged run (DD-3, its first run)', async () => {
    const provisional = insertNote({ AgentID: MDA, Status: 'Provisional', SourceAIAgentRunID: FLAGGED.root });
    const active = insertNote({ AgentID: BUILDER, Status: 'Active', SourceAIAgentRunID: FAILED.root });
    expect(await PredictiveStudioAgentNotePolicy.Sweep(provider, system)).toEqual({ Activated: 0, Archived: 2, Failed: [] });
    expect([statusOf(provisional), statusOf(active)]).toEqual(['Archived', 'Archived']);
  });

  it('a scoped sweep (DD-10) visits only the run user’s, company’s and agent-wide notes', async () => {
    const mine = insertNote({ AgentID: MDA, Status: 'Pending', SourceAIAgentRunID: PUBLISHED.root });
    const theirs = insertNote({ AgentID: MDA, Status: 'Pending', UserID: 'E9000000-0000-4000-8000-000000000001', SourceAIAgentRunID: PUBLISHED.root });
    expect(await PredictiveStudioAgentNotePolicy.Sweep(provider, system, { UserID: PERSON, CompanyID: null })).toEqual({ Activated: 1, Archived: 0, Failed: [] });
    expect([statusOf(mine), statusOf(theirs)]).toEqual(['Active', 'Pending']);
  });

  it('pages through more notes than one page', async () => {
    const page = PredictiveStudioAgentNotePolicy.SWEEP_PAGE_SIZE;
    for (let i = 0; i < page + 3; i++) insertNote({ AgentID: MDA, Status: 'Pending', SourceAIAgentRunID: PUBLISHED.root });
    expect((await PredictiveStudioAgentNotePolicy.Sweep(provider, system)).Activated).toBe(page + 3);
  });
});

describe('attack 6: a flagged W3 run followed by a second run', () => {
  it("no writer leaves an injectable note with the flagged run as its source, so the next run's injection can carry none", async () => {
    const writers = [
      memoryWriteManagerNote(MDA, FLAGGED.root, false),
      memoryWriteManagerNote(MDA, FLAGGED.root, true),
      noteEntity({ AgentID: MDA, Status: 'Active', AuthorType: 'MemoryManager', UserID: PERSON, SourceAIAgentRunID: FLAGGED.root }, false, system),
      noteEntity({ AgentID: BUILDER, Status: 'Active', UserID: PERSON, SourceAIAgentRunID: FLAGGED.child }, false, owner),
    ];
    for (const w of writers) expect((await save(w)).ok).toBe(false);
    const preexisting = insertNote({ AgentID: MDA, Status: 'Active', SourceAIAgentRunID: FLAGGED.root });
    await PredictiveStudioAgentNotePolicy.Sweep(provider, system);
    const injectable = db['MJ: AI Agent Notes'].filter((r) => eq(r.SourceAIAgentRunID, FLAGGED.root) && (r.Status === 'Active' || r.Status === 'Provisional'));
    expect(injectable).toEqual([]);
    expect(statusOf(preexisting)).toBe('Archived');
  });
});

describe('the leakage check reads the stored trainer result', () => {
  it('flags an envelope with leakage flags, not a clean one, a refused run or no results', () => {
    expect(PredictiveStudioAgentNotePolicy.HasLeakageFlags(LEAKY_RESULTS)).toBe(true);
    expect(PredictiveStudioAgentNotePolicy.HasLeakageFlags(CLEAN_RESULTS)).toBe(false);
    expect(PredictiveStudioAgentNotePolicy.HasLeakageFlags(null)).toBe(false);
    expect(PredictiveStudioAgentNotePolicy.HasLeakageFlags('{"schema":"ps-run-results/v2","status":"refused"}')).toBe(false);
  });
});

describe('fail closed', () => {
  it('a save with no user cannot be checked and is refused', async () => {
    const e = noteEntity({ AgentID: MDA, Status: 'Pending', UserID: PERSON, SourceAIAgentRunID: PUBLISHED.root }, false, person);
    expect(await PredictiveStudioAgentNotePolicy.CheckNoteSave(e, undefined)).toMatch(/could not be checked/);
  });

  it('a failed read refuses the save instead of allowing it', async () => {
    const rv = { RunView: vi.fn(async () => ({ Success: false, ErrorMessage: 'boom', Results: [] })), RunViews: vi.fn(async () => []) };
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(rv as unknown as RunView);
    const other = { EntityByName: (n: string) => ({ Name: n }), Entities: [] } as unknown as IMetadataProvider;
    const e = noteEntity({ AgentID: MDA, Status: 'Pending', UserID: PERSON, SourceAIAgentRunID: PUBLISHED.root }, false, person);
    Object.defineProperty(e, 'ProviderToUse', { get: () => other });
    expect(await PredictiveStudioAgentNotePolicy.CheckNoteSave(e, person)).toMatch(/could not be checked/);
  });
});
