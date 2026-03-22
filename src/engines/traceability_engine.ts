/**
 * Traceability engine — builds trace matrices and assumption lists.
 */

import { CanonicalProduct } from '../schemas/canonical';

export interface TraceEntry {
  feature_id: string;
  feature_title: string;
  story_id: string;
  story_title: string;
  flow_id: string;
  flow_title: string;
  use_case_id: string;
  use_case_title: string;
  requirement_ids: string[];
}

export interface TraceabilityMatrix {
  entries: TraceEntry[];
  orphan_features: string[];
  orphan_stories: string[];
  orphan_flows: string[];
  orphan_use_cases: string[];
}

export function buildTraceabilityMatrix(product: CanonicalProduct): TraceabilityMatrix {
  const entries: TraceEntry[] = [];
  const orphan_features: string[] = [];
  const orphan_stories: string[] = [];
  const orphan_flows: string[] = [];
  const orphan_use_cases: string[] = [];

  for (const feature of product.features) {
    if (feature.user_stories.length === 0) {
      orphan_features.push(feature.feature_id);
    }

    for (const story of feature.user_stories) {
      if (story.user_flows.length === 0) {
        orphan_stories.push(story.story_id);
      }

      for (const flow of story.user_flows) {
        if (flow.use_cases.length === 0) {
          orphan_flows.push(flow.flow_id);
        }

        for (const uc of flow.use_cases) {
          const reqIds = [
            ...uc.functional_requirements.map(r => r.requirement_id),
            ...uc.non_functional_requirements.map(r => r.requirement_id),
          ];

          if (reqIds.length === 0) {
            orphan_use_cases.push(uc.use_case_id);
          }

          entries.push({
            feature_id: feature.feature_id,
            feature_title: feature.title,
            story_id: story.story_id,
            story_title: story.title,
            flow_id: flow.flow_id,
            flow_title: flow.title,
            use_case_id: uc.use_case_id,
            use_case_title: uc.title,
            requirement_ids: reqIds,
          });
        }
      }
    }
  }

  return { entries, orphan_features, orphan_stories, orphan_flows, orphan_use_cases };
}
