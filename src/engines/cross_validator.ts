/**
 * Stage 9 — Cross-validation.
 *
 * WHAT IT DOES:
 *   Checks consistency across ALL specification levels:
 *   - Coverage: every feature has stories, every story has flows, etc.
 *   - Orphans: entities not connected to any parent/child.
 *   - Conflicts: contradictions between levels.
 *   - Gaps: product goals not covered by any feature.
 *   - Low confidence: elements needing human review.
 *   - Release plan coverage: unassigned features.
 *
 * LLM CALLS:
 *   - 1 call — Role: validator — "Check semantic consistency across all spec levels"
 */

import { CanonicalProduct } from '../schemas/canonical';
import { LLMGateway } from '../utils/llm_gateway';

export interface ValidationIssue {
  level: string;
  entity_id: string;
  issue_type: 'orphan' | 'conflict' | 'gap' | 'duplicate' | 'inconsistency' | 'missing_coverage';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  suggestion: string;
}

export interface CrossValidationResult {
  issues: ValidationIssue[];
  coverage: {
    features_with_stories: number;
    features_without_stories: number;
    stories_with_flows: number;
    stories_without_flows: number;
    flows_with_use_cases: number;
    flows_without_use_cases: number;
    use_cases_with_fr: number;
    use_cases_without_fr: number;
    use_cases_with_nfr: number;
    use_cases_without_nfr: number;
  };
  assumptions: string[];
  unresolved_items: string[];
}

export async function crossValidate(
  product: CanonicalProduct,
  llm: LLMGateway,
  runId: string,
): Promise<CrossValidationResult> {
  llm.setStage('cross_validate');

  const issues: ValidationIssue[] = [];
  const assumptions: string[] = [...product.assumptions];
  const unresolved: string[] = [...product.open_questions];

  let features_with_stories = 0;
  let features_without_stories = 0;
  let stories_with_flows = 0;
  let stories_without_flows = 0;
  let flows_with_use_cases = 0;
  let flows_without_use_cases = 0;
  let use_cases_with_fr = 0;
  let use_cases_without_fr = 0;
  let use_cases_with_nfr = 0;
  let use_cases_without_nfr = 0;

  for (const feature of product.features) {
    if (feature.user_stories.length === 0) {
      features_without_stories++;
      issues.push({
        level: 'feature',
        entity_id: feature.feature_id,
        issue_type: 'missing_coverage',
        severity: 'high',
        description: `Feature "${feature.title}" has no user stories`,
        suggestion: 'Generate user stories for this feature',
      });
    } else {
      features_with_stories++;
    }

    for (const story of feature.user_stories) {
      if (story.user_flows.length === 0) {
        stories_without_flows++;
        issues.push({
          level: 'story',
          entity_id: story.story_id,
          issue_type: 'missing_coverage',
          severity: 'medium',
          description: `Story "${story.title}" has no user flows`,
          suggestion: 'Generate user flows for this story',
        });
      } else {
        stories_with_flows++;
      }

      for (const flow of story.user_flows) {
        if (flow.use_cases.length === 0) {
          flows_without_use_cases++;
          issues.push({
            level: 'flow',
            entity_id: flow.flow_id,
            issue_type: 'missing_coverage',
            severity: 'medium',
            description: `Flow "${flow.title}" has no use cases`,
            suggestion: 'Generate use cases for this flow',
          });
        } else {
          flows_with_use_cases++;
        }

        for (const uc of flow.use_cases) {
          if (uc.functional_requirements.length === 0) {
            use_cases_without_fr++;
            issues.push({
              level: 'use_case',
              entity_id: uc.use_case_id,
              issue_type: 'missing_coverage',
              severity: 'medium',
              description: `Use case "${uc.title}" has no functional requirements`,
              suggestion: 'Generate functional requirements for this use case',
            });
          } else {
            use_cases_with_fr++;
          }

          if (uc.non_functional_requirements.length === 0) {
            use_cases_without_nfr++;
          } else {
            use_cases_with_nfr++;
          }
        }
      }
    }
  }

  // Low-confidence elements
  for (const feature of product.features) {
    if (feature.confidence_score < 0.5) {
      unresolved.push(`Feature "${feature.title}" (${feature.feature_id}) has low confidence — needs review`);
    }
    for (const story of feature.user_stories) {
      if (story.confidence_score < 0.5) {
        unresolved.push(`Story "${story.title}" (${story.story_id}) has low confidence — needs review`);
      }
    }
  }

  // Release plan coverage
  if (product.release_plan.length > 0) {
    const plannedFeatureIds = new Set(product.release_plan.flatMap(r => r.feature_ids));
    for (const feature of product.features) {
      if (!plannedFeatureIds.has(feature.feature_id)) {
        issues.push({
          level: 'release',
          entity_id: feature.feature_id,
          issue_type: 'gap',
          severity: 'medium',
          description: `Feature "${feature.title}" is not assigned to any release`,
          suggestion: 'Assign this feature to a release version',
        });
      }
    }
  }

  // LLM semantic cross-validation
  try {
    const featureSummary = product.features.map(f => ({
      id: f.feature_id,
      title: f.title,
      stories: f.user_stories.length,
      priority: f.priority,
    }));

    const llmValidation = await llm.callJSON<any>(
      {
        system: `You are SpecMaster's cross-validator. Check for semantic inconsistencies in a product specification.

Look for:
1. Features that contradict each other
2. Stories that don't align with their parent feature
3. Gaps in the specification that could cause implementation problems
4. Duplicate or overlapping concepts across different features
5. Product goals that aren't covered by any feature`,
        prompt: `Product: ${product.title}
Goals: ${product.goals.join(', ')}
Non-goals: ${product.non_goals.join(', ')}

Features:
${JSON.stringify(featureSummary, null, 2)}

Return JSON:
{
  "semantic_issues": [
    {
      "type": "contradiction|overlap|uncovered_goal|misalignment",
      "description": "string",
      "affected_entities": ["string"],
      "suggestion": "string"
    }
  ],
  "additional_assumptions": ["string"],
  "additional_questions": ["string"]
}`,
        max_tokens: 3000,
      },
      'Check semantic consistency across all specification levels',
      'validator',
    );

    if (llmValidation.semantic_issues) {
      for (const si of llmValidation.semantic_issues) {
        issues.push({
          level: 'cross',
          entity_id: si.affected_entities?.[0] || 'product',
          issue_type: 'inconsistency',
          severity: 'medium',
          description: si.description,
          suggestion: si.suggestion || '',
        });
      }
    }
    if (llmValidation.additional_assumptions) {
      assumptions.push(...llmValidation.additional_assumptions);
    }
    if (llmValidation.additional_questions) {
      unresolved.push(...llmValidation.additional_questions);
    }
  } catch {
    // Non-critical
  }

  return {
    issues,
    coverage: {
      features_with_stories,
      features_without_stories,
      stories_with_flows,
      stories_without_flows,
      flows_with_use_cases,
      flows_without_use_cases,
      use_cases_with_fr,
      use_cases_without_fr,
      use_cases_with_nfr,
      use_cases_without_nfr,
    },
    assumptions,
    unresolved_items: unresolved,
  };
}
