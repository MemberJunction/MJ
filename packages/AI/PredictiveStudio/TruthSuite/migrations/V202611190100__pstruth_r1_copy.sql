-- The R1 copy table for gate G5.1 (`R1 -> S7.3`): R1's columns with DistanceZ renamed. Test schema only.
-- The gate fills it with R1's rows (HarnessDatasets.FillRenamedCopy); a model trained on Scn_R1 must refuse to score it.
CREATE TABLE [pstruth].[Scn_R1Copy] ([ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY, [EntityKey] NVARCHAR(50) NULL, [T] DATE NULL, [DistanceZRenamed] FLOAT, [ItemsZ] FLOAT, [TrafficZ] FLOAT, [Target] FLOAT NULL, [TruthScore] FLOAT NULL);
