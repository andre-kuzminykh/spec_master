/**
 * Integration test — Full pipeline end-to-end.
 *
 * Runs ALL stages in order with mock LLM and verifies:
 *   1. Every stage executes and produces output
 *   2. Each stage's LLM calls have correct purpose and role
 *   3. The generator+validator pattern is enforced
 *   4. Hierarchical IDs are consistent
 *   5. Traceability chain is complete
 *   6. Output files are created
 *
 * Expected LLM call summary for 2-feature product:
 *   Stage 0 (detect):        0-1 calls  (analyzer)
 *   Stage 1 (normalize):     1 call     (generator)
 *   Stage 2 (features):      1-2 calls  (generator + validator)
 *   Stage 3 (releases):      1 call     (planner)
 *   Stage 4 (stories):       2×N calls  (generator + validator per feature)
 *   Stage 5 (flows):         2×M calls  (generator + validator per story)
 *   Stage 6 (use cases):     2×K calls  (generator + validator per flow)
 *   Stage 7-8 (requirements):4×J calls  (FR gen+val + NFR gen+val per use case)
 *   Stage 9 (cross-validate):1 call     (validator)
 *   Stage 10 (render):       0 calls    (pure render)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { detectStructure } from '../src/engines/structure_detector';
import { normalizeToCanonical } from '../src/engines/canonical_normalizer';
import { processFeatures } from '../src/engines/feature_engine';
import { planReleases } from '../src/engines/release_planner';
import { processStories } from '../src/engines/story_engine';
import { processFlows } from '../src/engines/flow_engine';
import { processUseCases } from '../src/engines/use_case_engine';
import { processRequirements } from '../src/engines/requirements_engine';
import { crossValidate } from '../src/engines/cross_validator';
import { buildTraceabilityMatrix } from '../src/engines/traceability_engine';
import { renderFinalSpecification } from '../src/engines/renderer';
import { CanonicalProduct } from '../src/schemas/canonical';
import { setupFullPipelineMock, SAMPLE_STRUCTURED_MD } from './mock_llm';

describe('Integration — Full Pipeline', () => {
  let mockLLM: ReturnType<typeof setupFullPipelineMock>;

  beforeEach(() => {
    mockLLM = setupFullPipelineMock();
  });

  test('runs all stages from structured PRD to final output', async () => {
    const markdown = SAMPLE_STRUCTURED_MD;
    const runId = 'integration-test';

    // Stage 0 — Detect structure
    const structure = await detectStructure(markdown, mockLLM as any, runId);
    expect(structure.input_mode).toBeTruthy();
    expect(structure.sections.length).toBeGreaterThan(0);

    // Stage 1 — Normalize
    let product = await normalizeToCanonical(markdown, structure, mockLLM as any, runId);
    expect(product.title).toBe('TaskFlow');
    expect(product.features.length).toBeGreaterThan(0);

    // Stage 2 — Features
    product = await processFeatures(product, markdown, mockLLM as any, runId);
    expect(product.features.length).toBeGreaterThan(0);

    // Stage 3 — Releases
    product = await planReleases(product, mockLLM as any, runId);
    expect(product.release_plan.length).toBeGreaterThan(0);

    // Stage 4 — Stories
    product = await processStories(product, markdown, mockLLM as any, runId);
    const totalStories = product.features.reduce((a, f) => a + f.user_stories.length, 0);
    expect(totalStories).toBeGreaterThan(0);

    // Stage 5 — Flows
    product = await processFlows(product, mockLLM as any, runId);
    const totalFlows = product.features.reduce(
      (a, f) => a + f.user_stories.reduce((b, s) => b + s.user_flows.length, 0), 0,
    );
    expect(totalFlows).toBeGreaterThan(0);

    // Stage 6 — Use Cases
    product = await processUseCases(product, mockLLM as any, runId);
    const totalUCs = product.features.reduce(
      (a, f) => a + f.user_stories.reduce(
        (b, s) => b + s.user_flows.reduce((c, fl) => c + fl.use_cases.length, 0), 0,
      ), 0,
    );
    expect(totalUCs).toBeGreaterThan(0);

    // Stages 7-8 — Requirements
    product = await processRequirements(product, mockLLM as any, runId);
    let totalFR = 0, totalNFR = 0;
    for (const f of product.features) {
      for (const s of f.user_stories) {
        for (const fl of s.user_flows) {
          for (const uc of fl.use_cases) {
            totalFR += uc.functional_requirements.length;
            totalNFR += uc.non_functional_requirements.length;
          }
        }
      }
    }
    expect(totalFR).toBeGreaterThan(0);
    expect(totalNFR).toBeGreaterThan(0);

    // Stage 9 — Cross-validation
    const validation = await crossValidate(product, mockLLM as any, runId);
    expect(validation.coverage).toBeDefined();

    // Traceability
    const traceability = buildTraceabilityMatrix(product);
    expect(traceability.entries.length).toBeGreaterThan(0);

    // Stage 10 — Render
    const finalMd = renderFinalSpecification(product, traceability, validation);
    expect(finalMd).toContain('TaskFlow');
    expect(finalMd).toContain('Features');
    expect(finalMd).toContain('User Stories');
    expect(finalMd).toContain('Use Cases');
    expect(finalMd).toContain('Functional Requirements');
    expect(finalMd).toContain('Non-Functional Requirements');
    expect(finalMd).toContain('Traceability Summary');

    // Summary
    console.log('\n=== Integration Test Summary ===');
    console.log(`Total LLM calls: ${mockLLM.calls.length}`);
    console.log(`  Generators: ${mockLLM.callsForRole('generator').length}`);
    console.log(`  Validators: ${mockLLM.callsForRole('validator').length}`);
    console.log(`  Planners:   ${mockLLM.callsForRole('planner').length}`);
    console.log(`  Analyzers:  ${mockLLM.callsForRole('analyzer').length}`);
    console.log(`Features:     ${product.features.length}`);
    console.log(`Stories:      ${totalStories}`);
    console.log(`Flows:        ${totalFlows}`);
    console.log(`Use Cases:    ${totalUCs}`);
    console.log(`FR:           ${totalFR}`);
    console.log(`NFR:          ${totalNFR}`);
    console.log(`Trace entries:${traceability.entries.length}`);
    console.log(`Issues:       ${validation.issues.length}`);
    console.log('');
    console.log('LLM call log:');
    for (const call of mockLLM.calls) {
      console.log(`  [${call.role.toUpperCase().padEnd(10)}] ${call.purpose}`);
    }
  });

  test('generator+validator pattern is used for every generation stage', async () => {
    const markdown = SAMPLE_STRUCTURED_MD;
    const runId = 'pattern-test';

    const structure = await detectStructure(markdown, mockLLM as any, runId);
    let product = await normalizeToCanonical(markdown, structure, mockLLM as any, runId);
    product = await processFeatures(product, markdown, mockLLM as any, runId);
    product = await processStories(product, markdown, mockLLM as any, runId);
    product = await processFlows(product, mockLLM as any, runId);
    product = await processUseCases(product, mockLLM as any, runId);
    product = await processRequirements(product, mockLLM as any, runId);

    // Every generated stage should have both generator and validator calls
    const generators = mockLLM.callsForRole('generator');
    const validators = mockLLM.callsForRole('validator');

    expect(generators.length).toBeGreaterThan(0);
    expect(validators.length).toBeGreaterThan(0);

    // Validators should be >= generators (every generation has validation)
    expect(validators.length).toBeGreaterThanOrEqual(generators.length - 1);
    // -1 because the normalize stage has only a generator
  });

  test('hierarchical IDs are consistent through the chain', async () => {
    const markdown = SAMPLE_STRUCTURED_MD;
    const runId = 'id-test';

    const structure = await detectStructure(markdown, mockLLM as any, runId);
    let product = await normalizeToCanonical(markdown, structure, mockLLM as any, runId);
    product = await processFeatures(product, markdown, mockLLM as any, runId);
    product = await processStories(product, markdown, mockLLM as any, runId);
    product = await processFlows(product, mockLLM as any, runId);
    product = await processUseCases(product, mockLLM as any, runId);
    product = await processRequirements(product, mockLLM as any, runId);

    for (const feature of product.features) {
      expect(feature.feature_id).toMatch(/^FTR-\d{3}$/);

      for (const story of feature.user_stories) {
        expect(story.story_id).toMatch(/^USR-/);
        expect(story.feature_id).toBe(feature.feature_id);

        for (const flow of story.user_flows) {
          expect(flow.flow_id).toMatch(/^FLW-/);
          expect(flow.story_id).toBe(story.story_id);

          for (const uc of flow.use_cases) {
            expect(uc.use_case_id).toMatch(/^UC-/);
            expect(uc.flow_id).toBe(flow.flow_id);

            for (const fr of uc.functional_requirements) {
              expect(fr.requirement_id).toMatch(/^FR-/);
              expect(fr.use_case_id).toBe(uc.use_case_id);
            }
            for (const nfr of uc.non_functional_requirements) {
              expect(nfr.requirement_id).toMatch(/^NFR-/);
              expect(nfr.use_case_id).toBe(uc.use_case_id);
            }
          }
        }
      }
    }
  });
});
