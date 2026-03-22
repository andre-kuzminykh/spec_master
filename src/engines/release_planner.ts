/**
 * Stage 3 — Release planning.
 * Distributes features across versions: MVP, v1, v2, future.
 */

import { CanonicalProduct, ReleaseVersion } from '../schemas/canonical';
import { LLMGateway } from '../utils/llm_gateway';

export async function planReleases(
  product: CanonicalProduct,
  llm: LLMGateway,
  runId: string,
): Promise<CanonicalProduct> {
  // If features already have release_target set, use those as hints
  const existingTargets = product.features
    .filter(f => f.release_target)
    .map(f => ({ feature_id: f.feature_id, title: f.title, release_target: f.release_target }));

  const featureSummary = product.features.map(f => ({
    feature_id: f.feature_id,
    title: f.title,
    priority: f.priority,
    dependencies: f.dependencies,
    existing_target: f.release_target || null,
  }));

  const plan = await llm.callJSON<any>({
    system: `You are SpecMaster's release planner. Distribute features across release versions.

RULES:
1. Create versions: MVP, v1, v2, future.
2. MVP should contain the minimum viable set of features for a usable product.
3. Respect dependency chains — a feature cannot be in an earlier release than its dependencies.
4. "must" priority features go to MVP or v1.
5. If the source document already assigned features to releases, respect that unless it conflicts with dependencies.
6. Each version should have a clear rationale.`,
    prompt: `Product: ${product.title}
Goals: ${product.goals.join(', ')}

Features:
${JSON.stringify(featureSummary, null, 2)}

${existingTargets.length > 0 ? `Existing release assignments:\n${JSON.stringify(existingTargets, null, 2)}` : ''}

Return JSON:
{
  "versions": [
    {
      "version": "MVP|v1|v2|future",
      "description": "string",
      "feature_ids": ["string"],
      "rationale": "string"
    }
  ]
}`,
    max_tokens: 4000,
  });

  product.release_plan = (plan.versions || []).map((v: any) => ({
    version: v.version,
    description: v.description || '',
    feature_ids: v.feature_ids || [],
    rationale: v.rationale || '',
  } as ReleaseVersion));

  // Update features with release targets
  for (const version of product.release_plan) {
    for (const fId of version.feature_ids) {
      const feature = product.features.find(f => f.feature_id === fId);
      if (feature) {
        feature.release_target = version.version;
      }
    }
  }

  return product;
}
