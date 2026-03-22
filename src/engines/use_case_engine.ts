/**
 * Stage 6 — Use Cases.
 *
 * WHAT IT DOES:
 *   For each validated user flow, generates or validates use cases.
 *   Each use case is atomic, testable, and has Given/When/Then structure.
 *   Pre-extracted use cases from the source document are matched to flows
 *   and reused instead of regenerated.
 *
 * LLM CALLS (per flow):
 *   - If use cases exist:  1 call (validator)
 *   - If no use cases:     2 calls (generator + validator)
 *   - Generator role: "Generate atomic use cases with Given/When/Then for flow [name]"
 *   - Validator role: "Validate use case atomicity and testability"
 */

import { CanonicalProduct, UseCase, SourceRef } from '../schemas/canonical';
import { LLMGateway } from '../utils/llm_gateway';
import { useCaseId } from '../utils/id_generator';

function makeRef(runId: string, location: string): SourceRef {
  return { location, stage: 'use_cases', run_id: runId };
}

export async function processUseCases(
  product: CanonicalProduct,
  llm: LLMGateway,
  runId: string,
): Promise<CanonicalProduct> {
  llm.setStage('use_cases');
  const extractedUCs: any[] = (product as any)._extracted_use_cases || [];

  for (const feature of product.features) {
    for (const story of feature.user_stories) {
      for (const flow of story.user_flows) {
        if (flow.use_cases.length > 0) {
          flow.use_cases = await validateUseCases(flow.use_cases, flow, llm, runId);
        } else {
          const matchingExtracted = extractedUCs.filter(
            uc => uc.related_feature?.toLowerCase().includes(feature.title.toLowerCase()),
          );

          if (matchingExtracted.length > 0) {
            flow.use_cases = matchingExtracted.map((uc: any) => ({
              use_case_id: useCaseId(flow.flow_id),
              flow_id: flow.flow_id,
              title: uc.title || '',
              description: uc.description || '',
              actors: uc.actors || [],
              trigger: uc.trigger || '',
              preconditions: uc.preconditions || [],
              given: uc.given || '',
              when: uc.when || '',
              then: uc.then || '',
              alternate_cases: uc.alternate_cases || [],
              error_cases: uc.error_cases || [],
              source_refs: [makeRef(runId, 'extracted from source document')],
              source_type: 'explicit' as const,
              inferred: false,
              confidence_score: uc.confidence_score ?? 0.8,
              functional_requirements: [],
              non_functional_requirements: [],
            }));
            for (const m of matchingExtracted) {
              const idx = extractedUCs.indexOf(m);
              if (idx >= 0) extractedUCs.splice(idx, 1);
            }
            flow.use_cases = await validateUseCases(flow.use_cases, flow, llm, runId);
          } else {
            flow.use_cases = await generateUseCases(flow, story, feature, product, llm, runId);
            flow.use_cases = await validateUseCases(flow.use_cases, flow, llm, runId);
          }
        }
      }
    }
  }

  return product;
}

async function generateUseCases(
  flow: { flow_id: string; title: string; main_path: string[]; alternate_paths: string[][] },
  story: { story_id: string; title: string; as_a: string; i_want: string },
  feature: { feature_id: string; title: string },
  product: CanonicalProduct,
  llm: LLMGateway,
  runId: string,
): Promise<UseCase[]> {
  const useCases = await llm.callJSON<any[]>(
    {
      system: `You are SpecMaster's use case generator. Create atomic, testable use cases from user flows.

RULES:
1. Each use case must be atomic — one clear action/outcome.
2. Must have Given/When/Then for testability.
3. Must be connected to a specific flow.
4. Include alternate and error cases.
5. Must NOT be too general or cover multiple unrelated actions.`,
      prompt: `Product: ${product.title}
Feature: ${feature.title}
Story: ${story.title} — As a ${story.as_a}, I want ${story.i_want}
Flow: ${flow.title}
Main path: ${flow.main_path.join(' → ')}
Alternate paths: ${flow.alternate_paths.map(p => p.join(' → ')).join('; ')}

Generate use cases for this flow.
Return JSON array:
[{
  "title": "string",
  "description": "string",
  "actors": ["string"],
  "trigger": "string",
  "preconditions": ["string"],
  "given": "string",
  "when": "string",
  "then": "string",
  "alternate_cases": ["string"],
  "error_cases": ["string"]
}]`,
      max_tokens: 6000,
    },
    `Generate atomic use cases (Given/When/Then) for flow "${flow.title}"`,
    'generator',
  );

  return useCases.map((uc: any) => ({
    use_case_id: useCaseId(flow.flow_id),
    flow_id: flow.flow_id,
    title: uc.title || '',
    description: uc.description || '',
    actors: uc.actors || [],
    trigger: uc.trigger || '',
    preconditions: uc.preconditions || [],
    given: uc.given || '',
    when: uc.when || '',
    then: uc.then || '',
    alternate_cases: uc.alternate_cases || [],
    error_cases: uc.error_cases || [],
    source_refs: [makeRef(runId, `generated for ${flow.flow_id}`)],
    source_type: 'derived' as const,
    inferred: true,
    confidence_score: 0.7,
    functional_requirements: [],
    non_functional_requirements: [],
  }));
}

async function validateUseCases(
  useCases: UseCase[],
  flow: { flow_id: string; title: string },
  llm: LLMGateway,
  runId: string,
): Promise<UseCase[]> {
  const validation = await llm.callJSON<any>(
    {
      system: `You are SpecMaster's use case validator. Check use cases for quality.

Check each use case:
1. Is it atomic (single action/outcome)?
2. Has valid Given/When/Then?
3. Is it testable?
4. Is it linked to the parent flow?
5. Not too general?
6. Doesn't cover multiple unrelated actions?`,
      prompt: `Flow: ${flow.title} (${flow.flow_id})

Use cases to validate:
${JSON.stringify(useCases.map(uc => ({
  use_case_id: uc.use_case_id,
  title: uc.title,
  given: uc.given,
  when: uc.when,
  then: uc.then,
})), null, 2)}

Return JSON:
{
  "valid_ids": ["string"],
  "issues": [{"use_case_id": "string", "issue": "string", "severity": "low|medium|high"}]
}`,
      max_tokens: 2000,
    },
    `Validate use case quality for flow "${flow.title}"`,
    'validator',
  );

  if (validation.issues?.length > 0) {
    for (const issue of validation.issues) {
      const uc = useCases.find(u => u.use_case_id === issue.use_case_id);
      if (uc && issue.severity === 'high') {
        uc.confidence_score = Math.min(uc.confidence_score, 0.4);
        uc.source_refs.push(makeRef(runId, `validation issue: ${issue.issue}`));
      }
    }
  }

  return useCases;
}
