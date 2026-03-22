/**
 * Tests for Stage 9 — Cross-Validation and Traceability
 *
 * Stage 9 checks consistency across ALL specification levels:
 *   - Coverage: features→stories→flows→use cases→requirements
 *   - Orphans: unlinked entities
 *   - Semantic conflicts (via LLM)
 *   - Release plan coverage
 *
 * LLM calls: 1 (validator — semantic cross-check)
 *
 * Traceability engine (no LLM):
 *   - Builds full trace matrix FTR→USR→FLW→UC→FR/NFR
 *   - Identifies orphans at every level
 */

import { crossValidate } from '../src/engines/cross_validator';
import { buildTraceabilityMatrix } from '../src/engines/traceability_engine';
import { CanonicalProduct } from '../src/schemas/canonical';
import { MockLLMGateway, setupFullPipelineMock } from './mock_llm';

function makeFullProduct(): CanonicalProduct {
  return {
    product_id: 'PROD-test',
    title: 'TestApp',
    summary: 'Test',
    vision: 'Test',
    goals: ['Goal 1'],
    non_goals: [],
    personas: [],
    domain_model: '',
    assumptions: ['Users have internet access'],
    open_questions: ['What about offline mode?'],
    success_metrics: [],
    release_plan: [
      { version: 'MVP', description: 'Core', feature_ids: ['FTR-001'], rationale: 'Must have' },
    ],
    features: [
      {
        feature_id: 'FTR-001',
        title: 'Feature 1',
        description: 'Desc',
        business_value: 'High',
        user_value: 'High',
        scope: '',
        priority: 'must' as const,
        release_target: 'MVP',
        dependencies: [],
        source_refs: [],
        source_type: 'explicit' as const,
        inferred: false,
        confidence_score: 0.9,
        user_stories: [
          {
            story_id: 'USR-001-001',
            feature_id: 'FTR-001',
            title: 'Story 1',
            as_a: 'user',
            i_want: 'something',
            so_that: 'value',
            acceptance_intent: '',
            actors: ['user'],
            preconditions: [],
            postconditions: [],
            source_refs: [],
            source_type: 'derived' as const,
            inferred: true,
            confidence_score: 0.7,
            user_flows: [
              {
                flow_id: 'FLW-001-001-001',
                story_id: 'USR-001-001',
                title: 'Flow 1',
                description: 'Desc',
                main_path: ['Step 1', 'Step 2'],
                alternate_paths: [],
                error_paths: [],
                entry_points: ['App'],
                exit_points: ['Done'],
                mermaid: 'flowchart TD\n  A-->B',
                source_refs: [],
                source_type: 'derived' as const,
                inferred: true,
                confidence_score: 0.7,
                use_cases: [
                  {
                    use_case_id: 'UC-001-001-001-001',
                    flow_id: 'FLW-001-001-001',
                    title: 'UC 1',
                    description: 'Desc',
                    actors: ['user'],
                    trigger: 'Action',
                    preconditions: [],
                    given: 'user is logged in',
                    when: 'user acts',
                    then: 'system responds',
                    alternate_cases: [],
                    error_cases: [],
                    source_refs: [],
                    source_type: 'derived' as const,
                    inferred: true,
                    confidence_score: 0.7,
                    functional_requirements: [
                      {
                        requirement_id: 'FR-001-001-001-001-001',
                        use_case_id: 'UC-001-001-001-001',
                        type: 'functional' as const,
                        title: 'FR1',
                        statement: 'The system shall...',
                        rationale: 'Because',
                        priority: 'must' as const,
                        verification_method: 'test',
                        source_refs: [],
                        source_type: 'derived' as const,
                        inferred: true,
                        confidence_score: 0.7,
                      },
                    ],
                    non_functional_requirements: [
                      {
                        requirement_id: 'NFR-001-001-001-001-001',
                        use_case_id: 'UC-001-001-001-001',
                        type: 'non_functional' as const,
                        category: 'performance' as const,
                        title: 'NFR1',
                        statement: 'Performance',
                        measurable_criteria: '< 2s',
                        rationale: 'UX',
                        priority: 'should' as const,
                        verification_method: 'test',
                        source_refs: [],
                        source_type: 'derived' as const,
                        inferred: true,
                        confidence_score: 0.7,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      // Orphan feature — no stories
      {
        feature_id: 'FTR-002',
        title: 'Orphan Feature',
        description: 'No stories',
        business_value: '',
        user_value: '',
        scope: '',
        priority: 'could' as const,
        release_target: '',
        dependencies: [],
        source_refs: [],
        source_type: 'derived' as const,
        inferred: true,
        confidence_score: 0.5,
        user_stories: [],
      },
    ],
    source_refs: [],
    source_type: 'explicit' as const,
    inferred: false,
    confidence_score: 0.9,
  };
}

describe('Stage 9 — Cross-Validation', () => {
  let mockLLM: MockLLMGateway;

  beforeEach(() => {
    mockLLM = setupFullPipelineMock();
  });

  test('detects features without stories', async () => {
    const product = makeFullProduct();
    const result = await crossValidate(product, mockLLM as any, 'test-run');

    expect(result.coverage.features_without_stories).toBe(1);
    expect(result.coverage.features_with_stories).toBe(1);

    const orphanIssue = result.issues.find(
      i => i.entity_id === 'FTR-002' && i.issue_type === 'missing_coverage',
    );
    expect(orphanIssue).toBeDefined();
  });

  test('detects unassigned features in release plan', async () => {
    const product = makeFullProduct();
    const result = await crossValidate(product, mockLLM as any, 'test-run');

    // FTR-002 is not in any release
    const gapIssue = result.issues.find(
      i => i.entity_id === 'FTR-002' && i.issue_type === 'gap',
    );
    expect(gapIssue).toBeDefined();
  });

  test('preserves existing assumptions and questions', async () => {
    const product = makeFullProduct();
    const result = await crossValidate(product, mockLLM as any, 'test-run');

    expect(result.assumptions).toContain('Users have internet access');
    expect(result.unresolved_items).toContain('What about offline mode?');
  });

  test('makes 1 LLM call for semantic validation', async () => {
    const product = makeFullProduct();
    await crossValidate(product, mockLLM as any, 'test-run');

    const validatorCalls = mockLLM.callsForRole('validator');
    expect(validatorCalls.length).toBe(1);
    expect(validatorCalls[0].purpose).toContain('semantic consistency');
  });

  test('reports full coverage stats', async () => {
    const product = makeFullProduct();
    const result = await crossValidate(product, mockLLM as any, 'test-run');

    expect(result.coverage.features_with_stories).toBeDefined();
    expect(result.coverage.stories_with_flows).toBeDefined();
    expect(result.coverage.flows_with_use_cases).toBeDefined();
    expect(result.coverage.use_cases_with_fr).toBeDefined();
    expect(result.coverage.use_cases_with_nfr).toBeDefined();
  });
});

describe('Traceability Engine (no LLM)', () => {
  test('builds full trace matrix', () => {
    const product = makeFullProduct();
    const matrix = buildTraceabilityMatrix(product);

    expect(matrix.entries.length).toBe(1); // 1 full chain

    const entry = matrix.entries[0];
    expect(entry.feature_id).toBe('FTR-001');
    expect(entry.story_id).toBe('USR-001-001');
    expect(entry.flow_id).toBe('FLW-001-001-001');
    expect(entry.use_case_id).toBe('UC-001-001-001-001');
    expect(entry.requirement_ids).toContain('FR-001-001-001-001-001');
    expect(entry.requirement_ids).toContain('NFR-001-001-001-001-001');
  });

  test('identifies orphan features', () => {
    const product = makeFullProduct();
    const matrix = buildTraceabilityMatrix(product);

    expect(matrix.orphan_features).toContain('FTR-002');
  });

  test('trace path: source → feature → story → flow → use case → requirement', () => {
    const product = makeFullProduct();
    const matrix = buildTraceabilityMatrix(product);

    // Verify the full traceability chain exists
    const entry = matrix.entries[0];
    expect(entry.feature_id).toBeTruthy();
    expect(entry.story_id).toBeTruthy();
    expect(entry.flow_id).toBeTruthy();
    expect(entry.use_case_id).toBeTruthy();
    expect(entry.requirement_ids.length).toBeGreaterThan(0);

    // Verify hierarchical ID pattern
    expect(entry.feature_id).toMatch(/^FTR-/);
    expect(entry.story_id).toMatch(/^USR-/);
    expect(entry.flow_id).toMatch(/^FLW-/);
    expect(entry.use_case_id).toMatch(/^UC-/);
    expect(entry.requirement_ids[0]).toMatch(/^(FR|NFR)-/);
  });
});
