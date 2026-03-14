import { describe, it, expect } from 'vitest';
import { AdditionalSchemaInfoGenerator } from '../generators/AdditionalSchemaInfoGenerator.js';
import { DatabaseDocumentation, SchemaDefinition, TableDefinition, ColumnDefinition, ForeignKeyReference } from '../types/state.js';
import { PKCandidate, FKCandidate, RelationshipDiscoveryPhase } from '../types/discovery.js';

/**
 * Helper to create a minimal valid DatabaseDocumentation state
 */
function createTestState(overrides?: Partial<DatabaseDocumentation>): DatabaseDocumentation {
  return {
    version: '1.0.0',
    summary: {
      createdAt: '2024-01-01',
      lastModified: '2024-01-01',
      totalIterations: 0,
      totalPromptsRun: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalSchemas: 0,
      totalTables: 0,
      totalColumns: 0,
      estimatedCost: 0
    },
    database: { name: 'TestDB', server: 'localhost', analyzedAt: '2024-01-01' },
    phases: { descriptionGeneration: [] },
    schemas: [],
    ...overrides
  };
}

function createColumn(overrides: Partial<ColumnDefinition> & { name: string; dataType: string }): ColumnDefinition {
  return {
    isNullable: false,
    isPrimaryKey: false,
    isForeignKey: false,
    descriptionIterations: [],
    ...overrides
  };
}

function createTable(overrides: Partial<TableDefinition> & { name: string }): TableDefinition {
  return {
    rowCount: 100,
    dependsOn: [],
    dependents: [],
    columns: [],
    descriptionIterations: [],
    ...overrides
  };
}

function createSchema(name: string, tables: TableDefinition[]): SchemaDefinition {
  return {
    name,
    tables,
    descriptionIterations: []
  };
}

describe('AdditionalSchemaInfoGenerator', () => {
  const generator = new AdditionalSchemaInfoGenerator();

  describe('Empty state', () => {
    it('should return empty JSON object for state with no schemas', () => {
      const state = createTestState();
      const result = JSON.parse(generator.generate(state));
      expect(result).toEqual({});
    });

    it('should return empty JSON object for schemas with no PK/FK columns', () => {
      const state = createTestState({
        schemas: [createSchema('dbo', [
          createTable({
            name: 'Users',
            columns: [
              createColumn({ name: 'Name', dataType: 'nvarchar' })
            ]
          })
        ])]
      });
      const result = JSON.parse(generator.generate(state));
      expect(result).toEqual({});
    });
  });

  describe('Introspected PKs', () => {
    it('should include columns marked as isPrimaryKey', () => {
      const state = createTestState({
        schemas: [createSchema('dbo', [
          createTable({
            name: 'Users',
            columns: [
              createColumn({ name: 'ID', dataType: 'int', isPrimaryKey: true, description: 'User identifier' }),
              createColumn({ name: 'Name', dataType: 'nvarchar' })
            ]
          })
        ])]
      });
      const result = JSON.parse(generator.generate(state));

      expect(result.dbo).toHaveLength(1);
      expect(result.dbo[0].TableName).toBe('Users');
      expect(result.dbo[0].PrimaryKey).toHaveLength(1);
      expect(result.dbo[0].PrimaryKey[0].FieldName).toBe('ID');
      expect(result.dbo[0].PrimaryKey[0].Description).toBe('User identifier');
    });

    it('should handle composite primary keys', () => {
      const state = createTestState({
        schemas: [createSchema('dbo', [
          createTable({
            name: 'OrderItems',
            columns: [
              createColumn({ name: 'OrderID', dataType: 'int', isPrimaryKey: true }),
              createColumn({ name: 'LineNumber', dataType: 'int', isPrimaryKey: true }),
              createColumn({ name: 'Quantity', dataType: 'int' })
            ]
          })
        ])]
      });
      const result = JSON.parse(generator.generate(state));

      expect(result.dbo[0].PrimaryKey).toHaveLength(2);
      expect(result.dbo[0].PrimaryKey[0].FieldName).toBe('OrderID');
      expect(result.dbo[0].PrimaryKey[1].FieldName).toBe('LineNumber');
    });
  });

  describe('Introspected FKs', () => {
    it('should include columns with foreignKeyReferences', () => {
      const state = createTestState({
        schemas: [createSchema('dbo', [
          createTable({
            name: 'Orders',
            columns: [
              createColumn({ name: 'ID', dataType: 'int', isPrimaryKey: true }),
              createColumn({
                name: 'UserID',
                dataType: 'int',
                isForeignKey: true,
                foreignKeyReferences: {
                  schema: 'dbo',
                  table: 'Users',
                  column: 'UserID',
                  referencedColumn: 'ID'
                }
              })
            ]
          })
        ])]
      });
      const result = JSON.parse(generator.generate(state));

      expect(result.dbo[0].ForeignKeys).toHaveLength(1);
      expect(result.dbo[0].ForeignKeys[0].FieldName).toBe('UserID');
      expect(result.dbo[0].ForeignKeys[0].RelatedTable).toBe('Users');
      expect(result.dbo[0].ForeignKeys[0].RelatedField).toBe('ID');
      expect(result.dbo[0].ForeignKeys[0].SchemaName).toBe('dbo');
    });

    it('should include FKs from dependsOn relationships', () => {
      const state = createTestState({
        schemas: [createSchema('dbo', [
          createTable({
            name: 'OrderItems',
            columns: [
              createColumn({ name: 'ID', dataType: 'int', isPrimaryKey: true }),
              createColumn({ name: 'OrderID', dataType: 'int' })
            ],
            dependsOn: [{
              schema: 'dbo',
              table: 'Orders',
              column: 'OrderID',
              referencedColumn: 'ID'
            }]
          })
        ])]
      });
      const result = JSON.parse(generator.generate(state));

      expect(result.dbo[0].ForeignKeys).toHaveLength(1);
      expect(result.dbo[0].ForeignKeys[0].FieldName).toBe('OrderID');
      expect(result.dbo[0].ForeignKeys[0].RelatedTable).toBe('Orders');
    });

    it('should deduplicate FKs from column refs and dependsOn', () => {
      const fkRef: ForeignKeyReference = {
        schema: 'dbo',
        table: 'Users',
        column: 'UserID',
        referencedColumn: 'ID'
      };
      const state = createTestState({
        schemas: [createSchema('dbo', [
          createTable({
            name: 'Orders',
            columns: [
              createColumn({
                name: 'UserID',
                dataType: 'int',
                isForeignKey: true,
                foreignKeyReferences: fkRef
              })
            ],
            dependsOn: [fkRef]
          })
        ])]
      });
      const result = JSON.parse(generator.generate(state));

      // Should only appear once despite being in both sources
      expect(result.dbo[0].ForeignKeys).toHaveLength(1);
    });

    it('should handle cross-schema foreign keys', () => {
      const state = createTestState({
        schemas: [
          createSchema('dbo', [
            createTable({
              name: 'EmployeeOrders',
              columns: [
                createColumn({ name: 'ID', dataType: 'int', isPrimaryKey: true }),
                createColumn({
                  name: 'EmployeeID',
                  dataType: 'int',
                  isForeignKey: true,
                  foreignKeyReferences: {
                    schema: 'hr',
                    table: 'Employees',
                    column: 'EmployeeID',
                    referencedColumn: 'ID'
                  }
                })
              ]
            })
          ]),
          createSchema('hr', [
            createTable({
              name: 'Employees',
              columns: [
                createColumn({ name: 'ID', dataType: 'int', isPrimaryKey: true })
              ]
            })
          ])
        ]
      });
      const result = JSON.parse(generator.generate(state));

      expect(result.dbo[0].ForeignKeys[0].SchemaName).toBe('hr');
      expect(result.dbo[0].ForeignKeys[0].RelatedTable).toBe('Employees');
    });
  });

  describe('AI-Discovered keys', () => {
    it('should include discovered PK candidates', () => {
      const state = createTestState({
        schemas: [createSchema('wicket', [
          createTable({
            name: 'Person',
            columns: [
              createColumn({ name: 'uuid', dataType: 'varchar' }),
              createColumn({ name: 'Name', dataType: 'nvarchar' })
            ]
          })
        ])],
        phases: {
          descriptionGeneration: [],
          keyDetection: {
            triggered: true,
            triggerReason: 'missing_pks',
            triggerDetails: { tablesWithoutPK: 1, expectedFKs: 0, actualFKs: 0, fkDeficitPercentage: 0 },
            startedAt: '2024-01-01',
            tokenBudget: { allocated: 1000, used: 100, remaining: 900 },
            iterations: [],
            discovered: {
              primaryKeys: [{
                schemaName: 'wicket',
                tableName: 'Person',
                columnNames: ['uuid'],
                confidence: 95,
                evidence: {
                  uniqueness: 1.0,
                  nullCount: 0,
                  totalRows: 100,
                  dataPattern: 'guid',
                  namingScore: 0.8,
                  dataTypeScore: 0.9,
                  warnings: []
                },
                discoveredInIteration: 1,
                validatedByLLM: true,
                status: 'confirmed'
              }],
              foreignKeys: []
            },
            schemaEnhancements: { pkeysAdded: 1, fkeysAdded: 0, overallConfidence: 95 },
            feedbackFromAnalysis: [],
            summary: {
              totalTablesAnalyzed: 1,
              tablesWithDiscoveredPKs: 1,
              relationshipsDiscovered: 0,
              averageConfidence: 95,
              highConfidenceCount: 1,
              mediumConfidenceCount: 0,
              lowConfidenceCount: 0,
              rejectedCount: 0
            }
          }
        }
      });
      const result = JSON.parse(generator.generate(state));

      expect(result.wicket).toHaveLength(1);
      expect(result.wicket[0].PrimaryKey).toHaveLength(1);
      expect(result.wicket[0].PrimaryKey[0].FieldName).toBe('uuid');
      expect(result.wicket[0].PrimaryKey[0].Description).toContain('AI-discovered');
      expect(result.wicket[0].PrimaryKey[0].Description).toContain('95');
    });

    it('should include discovered FK candidates', () => {
      const state = createTestState({
        schemas: [createSchema('wicket', [
          createTable({
            name: 'Connection',
            columns: [
              createColumn({ name: 'uuid', dataType: 'varchar' }),
              createColumn({ name: 'person_id', dataType: 'varchar' })
            ]
          })
        ])],
        phases: {
          descriptionGeneration: [],
          keyDetection: {
            triggered: true,
            triggerReason: 'insufficient_fks',
            triggerDetails: { tablesWithoutPK: 0, expectedFKs: 5, actualFKs: 0, fkDeficitPercentage: 100 },
            startedAt: '2024-01-01',
            tokenBudget: { allocated: 1000, used: 100, remaining: 900 },
            iterations: [],
            discovered: {
              primaryKeys: [],
              foreignKeys: [{
                schemaName: 'wicket',
                sourceTable: 'Connection',
                sourceColumn: 'person_id',
                targetSchema: 'wicket',
                targetTable: 'Person',
                targetColumn: 'uuid',
                confidence: 88,
                evidence: {
                  namingMatch: 0.9,
                  valueOverlap: 0.95,
                  cardinalityRatio: 0.1,
                  dataTypeMatch: true,
                  nullPercentage: 0,
                  sampleSize: 100,
                  orphanCount: 0,
                  warnings: []
                },
                discoveredInIteration: 1,
                validatedByLLM: true,
                status: 'confirmed'
              }]
            },
            schemaEnhancements: { pkeysAdded: 0, fkeysAdded: 1, overallConfidence: 88 },
            feedbackFromAnalysis: [],
            summary: {
              totalTablesAnalyzed: 1,
              tablesWithDiscoveredPKs: 0,
              relationshipsDiscovered: 1,
              averageConfidence: 88,
              highConfidenceCount: 1,
              mediumConfidenceCount: 0,
              lowConfidenceCount: 0,
              rejectedCount: 0
            }
          }
        }
      });
      const result = JSON.parse(generator.generate(state));

      expect(result.wicket[0].ForeignKeys).toHaveLength(1);
      expect(result.wicket[0].ForeignKeys[0].FieldName).toBe('person_id');
      expect(result.wicket[0].ForeignKeys[0].RelatedTable).toBe('Person');
      expect(result.wicket[0].ForeignKeys[0].RelatedField).toBe('uuid');
      expect(result.wicket[0].ForeignKeys[0].Description).toContain('88');
    });

    it('should filter discovered keys by confidence threshold', () => {
      const state = createTestState({
        schemas: [createSchema('dbo', [
          createTable({
            name: 'Orders',
            columns: [
              createColumn({ name: 'CustomerRef', dataType: 'varchar' })
            ]
          })
        ])],
        phases: {
          descriptionGeneration: [],
          keyDetection: {
            triggered: true,
            triggerReason: 'insufficient_fks',
            triggerDetails: { tablesWithoutPK: 0, expectedFKs: 1, actualFKs: 0, fkDeficitPercentage: 100 },
            startedAt: '2024-01-01',
            tokenBudget: { allocated: 1000, used: 100, remaining: 900 },
            iterations: [],
            discovered: {
              primaryKeys: [],
              foreignKeys: [{
                schemaName: 'dbo',
                sourceTable: 'Orders',
                sourceColumn: 'CustomerRef',
                targetSchema: 'dbo',
                targetTable: 'Customers',
                targetColumn: 'ID',
                confidence: 40,
                evidence: {
                  namingMatch: 0.5,
                  valueOverlap: 0.3,
                  cardinalityRatio: 0.2,
                  dataTypeMatch: true,
                  nullPercentage: 0.1,
                  sampleSize: 50,
                  orphanCount: 10,
                  warnings: ['Low value overlap']
                },
                discoveredInIteration: 1,
                validatedByLLM: false,
                status: 'candidate'
              }]
            },
            schemaEnhancements: { pkeysAdded: 0, fkeysAdded: 0, overallConfidence: 40 },
            feedbackFromAnalysis: [],
            summary: {
              totalTablesAnalyzed: 1,
              tablesWithDiscoveredPKs: 0,
              relationshipsDiscovered: 1,
              averageConfidence: 40,
              highConfidenceCount: 0,
              mediumConfidenceCount: 0,
              lowConfidenceCount: 1,
              rejectedCount: 0
            }
          }
        }
      });

      // With threshold below candidate confidence — should include
      const low = JSON.parse(generator.generate(state, { confidenceThreshold: 30 }));
      expect(low.dbo[0].ForeignKeys).toHaveLength(1);

      // With threshold above candidate confidence — should exclude
      const high = JSON.parse(generator.generate(state, { confidenceThreshold: 50 }));
      expect(high).toEqual({});
    });

    it('should exclude rejected candidates', () => {
      const state = createTestState({
        schemas: [createSchema('dbo', [
          createTable({
            name: 'Logs',
            columns: [
              createColumn({ name: 'ref_id', dataType: 'int' })
            ]
          })
        ])],
        phases: {
          descriptionGeneration: [],
          keyDetection: {
            triggered: true,
            triggerReason: 'insufficient_fks',
            triggerDetails: { tablesWithoutPK: 0, expectedFKs: 1, actualFKs: 0, fkDeficitPercentage: 100 },
            startedAt: '2024-01-01',
            tokenBudget: { allocated: 1000, used: 100, remaining: 900 },
            iterations: [],
            discovered: {
              primaryKeys: [],
              foreignKeys: [{
                schemaName: 'dbo',
                sourceTable: 'Logs',
                sourceColumn: 'ref_id',
                targetSchema: 'dbo',
                targetTable: 'References',
                targetColumn: 'ID',
                confidence: 90,
                evidence: {
                  namingMatch: 0.8,
                  valueOverlap: 0,
                  cardinalityRatio: 0,
                  dataTypeMatch: true,
                  nullPercentage: 0,
                  sampleSize: 100,
                  orphanCount: 100,
                  warnings: ['All values are orphans']
                },
                discoveredInIteration: 1,
                validatedByLLM: true,
                status: 'rejected'
              }]
            },
            schemaEnhancements: { pkeysAdded: 0, fkeysAdded: 0, overallConfidence: 0 },
            feedbackFromAnalysis: [],
            summary: {
              totalTablesAnalyzed: 1,
              tablesWithDiscoveredPKs: 0,
              relationshipsDiscovered: 0,
              averageConfidence: 0,
              highConfidenceCount: 0,
              mediumConfidenceCount: 0,
              lowConfidenceCount: 0,
              rejectedCount: 1
            }
          }
        }
      });

      const result = JSON.parse(generator.generate(state));
      expect(result).toEqual({});
    });

    it('should filter to confirmed-only when option is set', () => {
      const mkFK = (table: string, col: string, status: 'candidate' | 'confirmed'): FKCandidate => ({
        schemaName: 'dbo',
        sourceTable: 'Orders',
        sourceColumn: col,
        targetSchema: 'dbo',
        targetTable: table,
        targetColumn: 'ID',
        confidence: 80,
        evidence: {
          namingMatch: 0.8, valueOverlap: 0.8, cardinalityRatio: 0.1,
          dataTypeMatch: true, nullPercentage: 0, sampleSize: 100,
          orphanCount: 0, warnings: []
        },
        discoveredInIteration: 1,
        validatedByLLM: status === 'confirmed',
        status
      });

      const state = createTestState({
        schemas: [createSchema('dbo', [
          createTable({
            name: 'Orders',
            columns: [
              createColumn({ name: 'CustomerID', dataType: 'int' }),
              createColumn({ name: 'ShipperRef', dataType: 'int' })
            ]
          })
        ])],
        phases: {
          descriptionGeneration: [],
          keyDetection: {
            triggered: true,
            triggerReason: 'insufficient_fks',
            triggerDetails: { tablesWithoutPK: 0, expectedFKs: 2, actualFKs: 0, fkDeficitPercentage: 100 },
            startedAt: '2024-01-01',
            tokenBudget: { allocated: 1000, used: 100, remaining: 900 },
            iterations: [],
            discovered: {
              primaryKeys: [],
              foreignKeys: [
                mkFK('Customers', 'CustomerID', 'confirmed'),
                mkFK('Shippers', 'ShipperRef', 'candidate')
              ]
            },
            schemaEnhancements: { pkeysAdded: 0, fkeysAdded: 1, overallConfidence: 80 },
            feedbackFromAnalysis: [],
            summary: {
              totalTablesAnalyzed: 1, tablesWithDiscoveredPKs: 0,
              relationshipsDiscovered: 2, averageConfidence: 80,
              highConfidenceCount: 2, mediumConfidenceCount: 0,
              lowConfidenceCount: 0, rejectedCount: 0
            }
          }
        }
      });

      const all = JSON.parse(generator.generate(state, { confirmedOnly: false }));
      expect(all.dbo[0].ForeignKeys).toHaveLength(2);

      const confirmed = JSON.parse(generator.generate(state, { confirmedOnly: true }));
      expect(confirmed.dbo[0].ForeignKeys).toHaveLength(1);
      expect(confirmed.dbo[0].ForeignKeys[0].RelatedTable).toBe('Customers');
    });
  });

  describe('discoveredOnly option', () => {
    it('should exclude introspected keys when discoveredOnly is true', () => {
      const state = createTestState({
        schemas: [createSchema('dbo', [
          createTable({
            name: 'Users',
            columns: [
              createColumn({ name: 'ID', dataType: 'int', isPrimaryKey: true }),
              createColumn({
                name: 'DeptID',
                dataType: 'int',
                isForeignKey: true,
                foreignKeyReferences: {
                  schema: 'dbo', table: 'Departments',
                  column: 'DeptID', referencedColumn: 'ID'
                }
              })
            ]
          })
        ])]
      });

      // Default: includes introspected
      const withIntrospected = JSON.parse(generator.generate(state));
      expect(withIntrospected.dbo[0].PrimaryKey).toHaveLength(1);
      expect(withIntrospected.dbo[0].ForeignKeys).toHaveLength(1);

      // discoveredOnly: excludes introspected (no discoveries → empty)
      const discovered = JSON.parse(generator.generate(state, { discoveredOnly: true }));
      expect(discovered).toEqual({});
    });

    it('should include only AI-discovered keys when discoveredOnly is true', () => {
      const state = createTestState({
        schemas: [createSchema('dbo', [
          createTable({
            name: 'Users',
            columns: [
              createColumn({ name: 'ID', dataType: 'int', isPrimaryKey: true }),
              createColumn({ name: 'legacy_ref', dataType: 'varchar' })
            ]
          })
        ])],
        phases: {
          descriptionGeneration: [],
          keyDetection: {
            triggered: true,
            triggerReason: 'insufficient_fks',
            triggerDetails: { tablesWithoutPK: 0, expectedFKs: 1, actualFKs: 0, fkDeficitPercentage: 100 },
            startedAt: '2024-01-01',
            tokenBudget: { allocated: 1000, used: 100, remaining: 900 },
            iterations: [],
            discovered: {
              primaryKeys: [],
              foreignKeys: [{
                schemaName: 'dbo',
                sourceTable: 'Users',
                sourceColumn: 'legacy_ref',
                targetSchema: 'dbo',
                targetTable: 'LegacyAccounts',
                targetColumn: 'ref_code',
                confidence: 75,
                evidence: {
                  namingMatch: 0.6, valueOverlap: 0.8, cardinalityRatio: 0.5,
                  dataTypeMatch: true, nullPercentage: 0, sampleSize: 100,
                  orphanCount: 5, warnings: []
                },
                discoveredInIteration: 1,
                validatedByLLM: true,
                status: 'confirmed'
              }]
            },
            schemaEnhancements: { pkeysAdded: 0, fkeysAdded: 1, overallConfidence: 75 },
            feedbackFromAnalysis: [],
            summary: {
              totalTablesAnalyzed: 1, tablesWithDiscoveredPKs: 0,
              relationshipsDiscovered: 1, averageConfidence: 75,
              highConfidenceCount: 0, mediumConfidenceCount: 1,
              lowConfidenceCount: 0, rejectedCount: 0
            }
          }
        }
      });

      const result = JSON.parse(generator.generate(state, { discoveredOnly: true }));

      // Should NOT include the hard PK (ID)
      expect(result.dbo[0].PrimaryKey).toBeUndefined();
      // Should include the discovered FK
      expect(result.dbo[0].ForeignKeys).toHaveLength(1);
      expect(result.dbo[0].ForeignKeys[0].FieldName).toBe('legacy_ref');
    });
  });

  describe('approvedOnly option', () => {
    it('should filter tables by userApproved when approvedOnly is true', () => {
      const state = createTestState({
        schemas: [createSchema('dbo', [
          createTable({
            name: 'Users',
            columns: [createColumn({ name: 'ID', dataType: 'int', isPrimaryKey: true })],
            userApproved: true
          }),
          createTable({
            name: 'Logs',
            columns: [createColumn({ name: 'ID', dataType: 'int', isPrimaryKey: true })],
            userApproved: false
          })
        ])]
      });

      const result = JSON.parse(generator.generate(state, { approvedOnly: true }));
      expect(result.dbo).toHaveLength(1);
      expect(result.dbo[0].TableName).toBe('Users');
    });
  });

  describe('Multi-schema support', () => {
    it('should organize output by schema name', () => {
      const state = createTestState({
        schemas: [
          createSchema('dbo', [
            createTable({
              name: 'Users',
              columns: [createColumn({ name: 'ID', dataType: 'int', isPrimaryKey: true })]
            })
          ]),
          createSchema('hr', [
            createTable({
              name: 'Employees',
              columns: [createColumn({ name: 'EmpID', dataType: 'int', isPrimaryKey: true })]
            })
          ])
        ]
      });

      const result = JSON.parse(generator.generate(state));
      expect(Object.keys(result)).toEqual(['dbo', 'hr']);
      expect(result.dbo[0].TableName).toBe('Users');
      expect(result.hr[0].TableName).toBe('Employees');
    });

    it('should omit schemas with no key data', () => {
      const state = createTestState({
        schemas: [
          createSchema('dbo', [
            createTable({
              name: 'Users',
              columns: [createColumn({ name: 'ID', dataType: 'int', isPrimaryKey: true })]
            })
          ]),
          createSchema('staging', [
            createTable({
              name: 'TempData',
              columns: [createColumn({ name: 'Value', dataType: 'nvarchar' })]
            })
          ])
        ]
      });

      const result = JSON.parse(generator.generate(state));
      expect(Object.keys(result)).toEqual(['dbo']);
    });
  });

  describe('Deduplication', () => {
    it('should not duplicate PKs found in both introspection and discovery', () => {
      const state = createTestState({
        schemas: [createSchema('dbo', [
          createTable({
            name: 'Users',
            columns: [
              createColumn({ name: 'ID', dataType: 'int', isPrimaryKey: true })
            ]
          })
        ])],
        phases: {
          descriptionGeneration: [],
          keyDetection: {
            triggered: true,
            triggerReason: 'missing_pks',
            triggerDetails: { tablesWithoutPK: 0, expectedFKs: 0, actualFKs: 0, fkDeficitPercentage: 0 },
            startedAt: '2024-01-01',
            tokenBudget: { allocated: 1000, used: 100, remaining: 900 },
            iterations: [],
            discovered: {
              primaryKeys: [{
                schemaName: 'dbo',
                tableName: 'Users',
                columnNames: ['ID'],
                confidence: 99,
                evidence: {
                  uniqueness: 1.0, nullCount: 0, totalRows: 100,
                  dataPattern: 'sequential', namingScore: 1.0,
                  dataTypeScore: 1.0, warnings: []
                },
                discoveredInIteration: 1,
                validatedByLLM: true,
                status: 'confirmed'
              }],
              foreignKeys: []
            },
            schemaEnhancements: { pkeysAdded: 1, fkeysAdded: 0, overallConfidence: 99 },
            feedbackFromAnalysis: [],
            summary: {
              totalTablesAnalyzed: 1, tablesWithDiscoveredPKs: 1,
              relationshipsDiscovered: 0, averageConfidence: 99,
              highConfidenceCount: 1, mediumConfidenceCount: 0,
              lowConfidenceCount: 0, rejectedCount: 0
            }
          }
        }
      });

      const result = JSON.parse(generator.generate(state));
      // ID is in both introspection (isPrimaryKey) and discovery — should appear once
      expect(result.dbo[0].PrimaryKey).toHaveLength(1);
    });
  });

  describe('No key detection phase', () => {
    it('should work when phases.keyDetection is undefined', () => {
      const state = createTestState({
        schemas: [createSchema('dbo', [
          createTable({
            name: 'Users',
            columns: [
              createColumn({ name: 'ID', dataType: 'int', isPrimaryKey: true }),
              createColumn({
                name: 'DeptID',
                dataType: 'int',
                isForeignKey: true,
                foreignKeyReferences: {
                  schema: 'dbo', table: 'Departments',
                  column: 'DeptID', referencedColumn: 'ID'
                }
              })
            ]
          })
        ])]
      });

      const result = JSON.parse(generator.generate(state));
      expect(result.dbo[0].PrimaryKey).toHaveLength(1);
      expect(result.dbo[0].ForeignKeys).toHaveLength(1);
    });
  });

  describe('Output format', () => {
    it('should produce valid JSON with 4-space indentation', () => {
      const state = createTestState({
        schemas: [createSchema('dbo', [
          createTable({
            name: 'Users',
            columns: [createColumn({ name: 'ID', dataType: 'int', isPrimaryKey: true })]
          })
        ])]
      });

      const output = generator.generate(state);
      // Should be valid JSON
      expect(() => JSON.parse(output)).not.toThrow();
      // Should use 4-space indentation
      expect(output).toContain('    "TableName"');
    });

    it('should match CodeGen additionalSchemaInfo.json format', () => {
      const state = createTestState({
        schemas: [createSchema('wicket', [
          createTable({
            name: 'Person',
            columns: [
              createColumn({ name: 'uuid', dataType: 'varchar', isPrimaryKey: true })
            ]
          }),
          createTable({
            name: 'Connection',
            columns: [
              createColumn({ name: 'uuid', dataType: 'varchar', isPrimaryKey: true }),
              createColumn({
                name: 'person_id',
                dataType: 'varchar',
                isForeignKey: true,
                foreignKeyReferences: {
                  schema: 'wicket', table: 'Person',
                  column: 'person_id', referencedColumn: 'uuid'
                }
              })
            ]
          })
        ])]
      });

      const result = JSON.parse(generator.generate(state));

      // Verify top-level structure matches CodeGen format
      expect(result).toHaveProperty('wicket');
      expect(Array.isArray(result.wicket)).toBe(true);

      // Verify table entry structure
      const person = result.wicket.find((t: Record<string, unknown>) => t.TableName === 'Person');
      expect(person).toBeDefined();
      expect(person.PrimaryKey).toBeDefined();
      expect(person.PrimaryKey[0]).toHaveProperty('FieldName');

      const connection = result.wicket.find((t: Record<string, unknown>) => t.TableName === 'Connection');
      expect(connection).toBeDefined();
      expect(connection.ForeignKeys).toBeDefined();
      expect(connection.ForeignKeys[0]).toHaveProperty('FieldName');
      expect(connection.ForeignKeys[0]).toHaveProperty('SchemaName');
      expect(connection.ForeignKeys[0]).toHaveProperty('RelatedTable');
      expect(connection.ForeignKeys[0]).toHaveProperty('RelatedField');
    });
  });
});
