/**
 * Stage 5 — User Flows.
 * Generates or validates user flows from validated user stories.
 * Includes Mermaid diagram generation.
 */

import { CanonicalProduct, UserFlow, SourceRef } from '../schemas/canonical';
import { LLMGateway } from '../utils/llm_gateway';
import { flowId } from '../utils/id_generator';

function makeRef(runId: string, location: string): SourceRef {
  return { location, stage: 'flows', run_id: runId };
}

export async function processFlows(
  product: CanonicalProduct,
  llm: LLMGateway,
  runId: string,
): Promise<CanonicalProduct> {
  for (const feature of product.features) {
    for (const story of feature.user_stories) {
      if (story.user_flows.length > 0) {
        story.user_flows = await validateFlows(story.user_flows, story, llm, runId);
      } else {
        story.user_flows = await generateFlows(story, feature, product, llm, runId);
        story.user_flows = await validateFlows(story.user_flows, story, llm, runId);
      }
    }
  }

  return product;
}

async function generateFlows(
  story: { story_id: string; title: string; as_a: string; i_want: string; so_that: string },
  feature: { feature_id: string; title: string },
  product: CanonicalProduct,
  llm: LLMGateway,
  runId: string,
): Promise<UserFlow[]> {
  const flows = await llm.callJSON<any[]>({
    system: `You are SpecMaster's user flow generator. Create user flows for a specific user story.

RULES:
1. Each flow describes a concrete sequence of steps the user takes.
2. Include main_path (happy path), alternate_paths, and error_paths.
3. Each flow must have clear entry and exit points.
4. Generate a valid Mermaid flowchart for each flow.
5. Flows should reflect the story, not the implementation.
6. Usually one main flow per story, sometimes two for complex stories.`,
    prompt: `Product: ${product.title}
Feature: ${feature.title}
Story: As a ${story.as_a}, I want ${story.i_want}, so that ${story.so_that}

Generate user flows for this story.
Return JSON array:
[{
  "title": "string",
  "description": "string",
  "main_path": ["Step 1", "Step 2"],
  "alternate_paths": [["Alt step 1", "Alt step 2"]],
  "error_paths": [["Error step 1", "Error step 2"]],
  "entry_points": ["string"],
  "exit_points": ["string"],
  "mermaid": "flowchart TD\\n    A[Start] --> B[Step]\\n    B --> C[End]"
}]`,
    max_tokens: 6000,
  });

  return flows.map((f: any) => ({
    flow_id: flowId(story.story_id),
    story_id: story.story_id,
    title: f.title || '',
    description: f.description || '',
    main_path: f.main_path || [],
    alternate_paths: f.alternate_paths || [],
    error_paths: f.error_paths || [],
    entry_points: f.entry_points || [],
    exit_points: f.exit_points || [],
    mermaid: f.mermaid || '',
    source_refs: [makeRef(runId, `generated for ${story.story_id}`)],
    source_type: 'derived' as const,
    inferred: true,
    confidence_score: 0.7,
    use_cases: [],
  }));
}

async function validateFlows(
  flows: UserFlow[],
  story: { story_id: string; title: string },
  llm: LLMGateway,
  runId: string,
): Promise<UserFlow[]> {
  const validation = await llm.callJSON<any>({
    system: `You are SpecMaster's user flow validator. Check flows for quality.

Check each flow:
1. Does it reflect the parent story?
2. Has a clear main path?
3. Has alternate/error paths where relevant?
4. Is the Mermaid diagram valid syntax?
5. No excessive steps?
6. Not a mix of multiple independent scenarios?`,
    prompt: `Story: ${story.title} (${story.story_id})

Flows to validate:
${JSON.stringify(flows.map(f => ({
  flow_id: f.flow_id,
  title: f.title,
  main_path: f.main_path,
  alternate_paths: f.alternate_paths,
  mermaid: f.mermaid,
})), null, 2)}

Return JSON:
{
  "valid_flow_ids": ["string"],
  "issues": [
    {
      "flow_id": "string",
      "issue": "string",
      "severity": "low|medium|high"
    }
  ]
}`,
    max_tokens: 2000,
  });

  if (validation.issues?.length > 0) {
    for (const issue of validation.issues) {
      const flow = flows.find(f => f.flow_id === issue.flow_id);
      if (flow && issue.severity === 'high') {
        flow.confidence_score = Math.min(flow.confidence_score, 0.4);
        flow.source_refs.push(makeRef(runId, `validation issue: ${issue.issue}`));
      }
    }
  }

  return flows;
}
