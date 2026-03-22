/**
 * Stage 4 — User Stories.
 * If stories exist: extract, rewrite to As a/I want/So that, validate.
 * If not: generate from validated features.
 * Generator + Validator pattern.
 */

import { CanonicalProduct, UserStory, SourceRef } from '../schemas/canonical';
import { LLMGateway } from '../utils/llm_gateway';
import { storyId } from '../utils/id_generator';

function makeRef(runId: string, location: string): SourceRef {
  return { location, stage: 'stories', run_id: runId };
}

export async function processStories(
  product: CanonicalProduct,
  rawMarkdown: string,
  llm: LLMGateway,
  runId: string,
): Promise<CanonicalProduct> {
  for (const feature of product.features) {
    if (feature.user_stories.length > 0) {
      // Validate existing stories
      feature.user_stories = await validateStories(feature.user_stories, feature, product, llm, runId);
    } else {
      // Generate stories for this feature
      feature.user_stories = await generateStories(feature, product, rawMarkdown, llm, runId);
      // Validate generated stories
      feature.user_stories = await validateStories(feature.user_stories, feature, product, llm, runId);
    }
  }

  return product;
}

async function generateStories(
  feature: { feature_id: string; title: string; description: string },
  product: CanonicalProduct,
  rawMarkdown: string,
  llm: LLMGateway,
  runId: string,
): Promise<UserStory[]> {
  const stories = await llm.callJSON<any[]>({
    system: `You are SpecMaster's user story generator. Create user stories for a specific feature.

RULES:
1. Each story must follow "As a [actor], I want [goal], so that [value]" format.
2. Stories must belong to exactly one feature.
3. Stories should not be too low-level (implementation details) or too high-level (entire features).
4. Each story should be independently valuable.
5. Cover the main happy paths and important edge cases.
6. Use personas from the product specification as actors when available.`,
    prompt: `Product: ${product.title}
Personas: ${product.personas.map(p => p.name).join(', ') || 'end user'}

Feature: ${feature.title}
Description: ${feature.description}

Generate user stories for this feature.
Return JSON array:
[{
  "title": "string",
  "as_a": "string",
  "i_want": "string",
  "so_that": "string",
  "acceptance_intent": "string",
  "actors": ["string"],
  "preconditions": ["string"],
  "postconditions": ["string"]
}]`,
    max_tokens: 6000,
  });

  return stories.map((s: any) => ({
    story_id: storyId(feature.feature_id),
    feature_id: feature.feature_id,
    title: s.title || '',
    as_a: s.as_a || '',
    i_want: s.i_want || '',
    so_that: s.so_that || '',
    acceptance_intent: s.acceptance_intent || '',
    actors: s.actors || [],
    preconditions: s.preconditions || [],
    postconditions: s.postconditions || [],
    source_refs: [makeRef(runId, `generated for ${feature.feature_id}`)],
    source_type: 'derived' as const,
    inferred: true,
    confidence_score: 0.7,
    user_flows: [],
  }));
}

async function validateStories(
  stories: UserStory[],
  feature: { feature_id: string; title: string },
  product: CanonicalProduct,
  llm: LLMGateway,
  runId: string,
): Promise<UserStory[]> {
  const validation = await llm.callJSON<any>({
    system: `You are SpecMaster's user story validator. Check stories for quality.

Check each story:
1. Has a clear actor (as_a)?
2. Has a clear goal (i_want)?
3. Has clear value (so_that)?
4. Belongs to exactly one feature?
5. Not too low-level (implementation detail)?
6. Not actually a use case?
7. No duplicates with other stories?`,
    prompt: `Feature: ${feature.title} (${feature.feature_id})
Product: ${product.title}

Stories to validate:
${JSON.stringify(stories.map(s => ({
  story_id: s.story_id,
  title: s.title,
  as_a: s.as_a,
  i_want: s.i_want,
  so_that: s.so_that,
})), null, 2)}

Return JSON:
{
  "valid_story_ids": ["string"],
  "issues": [
    {
      "story_id": "string",
      "issue": "string",
      "severity": "low|medium|high"
    }
  ],
  "duplicates": [["story_id_1", "story_id_2"]]
}`,
    max_tokens: 3000,
  });

  // Remove duplicates (keep first)
  if (validation.duplicates?.length > 0) {
    const toRemove = new Set<string>();
    for (const pair of validation.duplicates) {
      if (pair.length > 1) toRemove.add(pair[1]);
    }
    stories = stories.filter(s => !toRemove.has(s.story_id));
  }

  // Mark issues
  if (validation.issues?.length > 0) {
    for (const issue of validation.issues) {
      const story = stories.find(s => s.story_id === issue.story_id);
      if (story && issue.severity === 'high') {
        story.confidence_score = Math.min(story.confidence_score, 0.4);
        story.source_refs.push(makeRef(runId, `validation issue: ${issue.issue}`));
      }
    }
  }

  return stories;
}
