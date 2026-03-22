/**
 * Stage 2 — Feature analysis.
 *
 * WHAT IT DOES:
 *   If features already exist in canonical model: validates quality,
 *   splits overly broad features, merges overlapping ones, renames/reclassifies.
 *   If no features exist: generates them from product context.
 *
 *   Uses Generator + Validator pattern (two separate LLM passes).
 *
 * LLM CALLS:
 *   - If features exist:  1 call (validator)
 *   - If no features:     2 calls (generator + validator)
 *   - Generator role: "Generate features from product description"
 *   - Validator role: "Validate feature quality, check splits/merges/overlaps"
 */

import { CanonicalProduct, Feature, SourceRef } from '../schemas/canonical';
import { LLMGateway } from '../utils/llm_gateway';
import { featureId } from '../utils/id_generator';

function makeRef(runId: string, location: string): SourceRef {
  return { location, stage: 'features', run_id: runId };
}

export async function processFeatures(
  product: CanonicalProduct,
  rawMarkdown: string,
  llm: LLMGateway,
  runId: string,
): Promise<CanonicalProduct> {
  llm.setStage('features');
  const hasFeatures = product.features.length > 0;

  if (hasFeatures) {
    product = await validateFeatures(product, llm, runId);
  } else {
    product = await generateFeatures(product, rawMarkdown, llm, runId);
    product = await validateFeatures(product, llm, runId);
  }

  return product;
}

async function generateFeatures(
  product: CanonicalProduct,
  rawMarkdown: string,
  llm: LLMGateway,
  runId: string,
): Promise<CanonicalProduct> {
  const features = await llm.callJSON<any[]>(
    {
      system: `You are SpecMaster's feature generator. Given a product description, extract or derive the core features.

RULES:
1. A feature is a distinct product capability that delivers user or business value.
2. Features should be at the right granularity - not too broad (an entire product) and not too narrow (a single button).
3. A feature is NOT a user story, use case, UI element, or cross-cutting concern.
4. Each feature should have clear business and user value.
5. Mark each feature's source_type as "derived" since you are inferring them.`,
      prompt: `Based on this product specification, generate a comprehensive list of features.

Product: ${product.title}
Summary: ${product.summary}
Vision: ${product.vision}
Goals: ${product.goals.join(', ')}

Source document (first 8000 chars):
${rawMarkdown.substring(0, 8000)}

Return a JSON array of features:
[{
  "title": "string",
  "description": "string",
  "business_value": "string",
  "user_value": "string",
  "scope": "string",
  "priority": "must|should|could|wont",
  "dependencies": ["feature title if dependent"]
}]`,
      max_tokens: 8000,
    },
    'Generate features from product description',
    'generator',
  );

  product.features = features.map((f: any) => ({
    feature_id: featureId(),
    title: f.title || '',
    description: f.description || '',
    business_value: f.business_value || '',
    user_value: f.user_value || '',
    scope: f.scope || '',
    priority: f.priority || 'should',
    release_target: '',
    dependencies: f.dependencies || [],
    source_refs: [makeRef(runId, 'generated from product description')],
    source_type: 'derived' as const,
    inferred: true,
    confidence_score: 0.7,
    user_stories: [],
  }));

  return product;
}

async function validateFeatures(
  product: CanonicalProduct,
  llm: LLMGateway,
  runId: string,
): Promise<CanonicalProduct> {
  const featureList = product.features.map(f => ({
    feature_id: f.feature_id,
    title: f.title,
    description: f.description,
    business_value: f.business_value,
    priority: f.priority,
  }));

  const validation = await llm.callJSON<any>(
    {
      system: `You are SpecMaster's feature validator. Review features for quality issues.

Check each feature:
1. Is it truly a product capability (not a user story, use case, or UI element)?
2. Is it too broad or too narrow?
3. Does it overlap with other features?
4. Does it have clear value?
5. Should any features be split, merged, renamed, or reclassified?`,
      prompt: `Product: ${product.title}
Goals: ${product.goals.join(', ')}

Features to validate:
${JSON.stringify(featureList, null, 2)}

Return JSON:
{
  "valid_features": ["feature_id"],
  "issues": [
    {
      "feature_id": "string",
      "issue_type": "too_broad|too_narrow|overlap|not_a_feature|needs_rename|needs_review",
      "description": "string",
      "suggestion": "string"
    }
  ],
  "suggested_splits": [
    {
      "original_feature_id": "string",
      "new_features": [{"title": "string", "description": "string"}]
    }
  ],
  "suggested_merges": [
    {
      "feature_ids": ["string"],
      "merged_title": "string",
      "merged_description": "string"
    }
  ]
}`,
      max_tokens: 4000,
    },
    'Validate feature quality, check splits/merges/overlaps',
    'validator',
  );

  // Apply merges
  if (validation.suggested_merges?.length > 0) {
    for (const merge of validation.suggested_merges) {
      const idsToMerge = new Set(merge.feature_ids);
      const mergedStories = product.features
        .filter(f => idsToMerge.has(f.feature_id))
        .flatMap(f => f.user_stories);

      const firstFeature = product.features.find(f => idsToMerge.has(f.feature_id));
      if (firstFeature) {
        firstFeature.title = merge.merged_title;
        firstFeature.description = merge.merged_description;
        firstFeature.user_stories = mergedStories;
        firstFeature.source_refs.push(makeRef(runId, 'merged by validator'));
      }
      product.features = product.features.filter(
        f => !idsToMerge.has(f.feature_id) || f === firstFeature,
      );
    }
  }

  // Apply splits
  if (validation.suggested_splits?.length > 0) {
    for (const split of validation.suggested_splits) {
      const idx = product.features.findIndex(f => f.feature_id === split.original_feature_id);
      if (idx === -1) continue;
      const original = product.features[idx];

      const newFeatures: Feature[] = split.new_features.map((nf: any) => ({
        feature_id: featureId(),
        title: nf.title,
        description: nf.description,
        business_value: original.business_value,
        user_value: original.user_value,
        scope: original.scope,
        priority: original.priority,
        release_target: original.release_target,
        dependencies: original.dependencies,
        source_refs: [...original.source_refs, makeRef(runId, `split from ${original.feature_id}`)],
        source_type: 'derived' as const,
        inferred: true,
        confidence_score: 0.7,
        user_stories: [],
      }));

      product.features.splice(idx, 1, ...newFeatures);
    }
  }

  // Mark issues on remaining features
  if (validation.issues?.length > 0) {
    for (const issue of validation.issues) {
      const feature = product.features.find(f => f.feature_id === issue.feature_id);
      if (feature && issue.issue_type === 'needs_review') {
        feature.confidence_score = Math.min(feature.confidence_score, 0.5);
        feature.source_refs.push(makeRef(runId, `needs review: ${issue.description}`));
      }
    }
  }

  return product;
}
