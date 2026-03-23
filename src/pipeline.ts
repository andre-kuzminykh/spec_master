/**
 * Main pipeline orchestrator.
 * Executes all stages in sequence with detailed logging of every LLM call.
 */

import { CanonicalProduct, DetectedStructure } from './schemas/canonical';
import { LLMGateway, LLMGatewayConfig } from './utils/llm_gateway';
import { createLogger } from './utils/logger';
import { readText } from './utils/file_utils';
import { detectStructure } from './engines/structure_detector';
import { normalizeToCanonical } from './engines/canonical_normalizer';
import { processFeatures } from './engines/feature_engine';
import { planReleases } from './engines/release_planner';
import { processStories } from './engines/story_engine';
import { processFlows } from './engines/flow_engine';
import { processUseCases } from './engines/use_case_engine';
import { processRequirements } from './engines/requirements_engine';
import { crossValidate, CrossValidationResult } from './engines/cross_validator';
import { buildTraceabilityMatrix, TraceabilityMatrix } from './engines/traceability_engine';
import { renderFinalSpecification } from './engines/renderer';
import { RunManager, STAGES, StageName } from './engines/run_manager';

/** Human-readable description of what each stage does */
const STAGE_DESCRIPTIONS: Record<string, string> = {
  detect:
    'Parses input markdown, extracts headings, maps sections to canonical fields.\n' +
    '│  Determines mode: raw idea / structured PRD / mixed.\n' +
    '│  LLM: 0-1 calls (only if heuristics are inconclusive)',
  normalize:
    'Extracts ALL product entities (features, stories, use cases, FR/NFR, goals, personas)\n' +
    '│  from the source document into canonical JSON schema.\n' +
    '│  Marks each entity as explicit (from doc) or derived (inferred).\n' +
    '│  LLM: 1+ calls (generator) — large docs auto-chunked to avoid truncation',
  features:
    'Validates existing features or generates new ones from product context.\n' +
    '│  Checks: too broad? too narrow? overlapping? actually a user story?\n' +
    '│  May split, merge, rename, or reclassify features.\n' +
    '│  LLM: 1-2 calls (generator + validator)',
  releases:
    'Distributes validated features across release versions: MVP, v1, v2, future.\n' +
    '│  Respects dependency chains, priorities, and existing assignments.\n' +
    '│  LLM: 1 call (planner)',
  stories:
    'For each feature: generates or validates user stories.\n' +
    '│  Format: "As a [actor], I want [goal], so that [value]".\n' +
    '│  Checks: has actor? has goal? has value? not a use case? no duplicates?\n' +
    '│  LLM: 2 calls per feature (generator + validator)',
  flows:
    'For each story: generates or validates user flows with Mermaid diagrams.\n' +
    '│  Each flow has: main path, alternate paths, error paths, entry/exit points.\n' +
    '│  LLM: 2 calls per story (generator + validator)',
  use_cases:
    'For each flow: generates or validates atomic use cases.\n' +
    '│  Each use case has Given/When/Then for testability.\n' +
    '│  Pre-extracted use cases from source document are reused, not regenerated.\n' +
    '│  LLM: 2 calls per flow (generator + validator)',
  requirements:
    'For each use case: generates FR (functional) and NFR (non-functional) requirements.\n' +
    '│  FR: "The system shall..." — verifiable, unambiguous system obligations.\n' +
    '│  NFR: measurable quality attributes (performance, security, usability, etc.).\n' +
    '│  LLM: up to 4 calls per use case (FR gen+val, NFR gen+val)',
  cross_validate:
    'Checks consistency across ALL specification levels.\n' +
    '│  Finds: orphans, conflicts, coverage gaps, duplicates, uncovered goals.\n' +
    '│  Reports low-confidence elements needing human review.\n' +
    '│  LLM: 1 call (validator) — semantic cross-check',
  render:
    'Generates final output files: markdown specification, JSON artifacts,\n' +
    '│  Mermaid diagrams, traceability matrix, assumptions, unresolved items.\n' +
    '│  LLM: 0 calls (pure rendering)',
};

export interface PipelineOptions {
  inputFile: string;
  outDir: string;
  provider: string;
  model: string;
  mode: 'strict' | 'balanced' | 'creative';
  fromStage?: string;
  toStage?: string;
  validateOnly?: boolean;
  withReleasePlan?: boolean;
  withTraceability?: boolean;
  failOnLowConfidence?: boolean;
  resumeManifest?: string;
}

export async function runPipeline(options: PipelineOptions): Promise<void> {
  const logger = createLogger();
  logger.pipelineStart(options.inputFile, options.provider, options.model, options.mode);

  const llmConfig: LLMGatewayConfig = {
    provider: options.provider,
    model: options.model,
    mode: options.mode,
  };
  const llm = new LLMGateway(llmConfig, logger);

  let runManager: RunManager;
  let product: CanonicalProduct | null = null;
  let markdown: string;

  if (options.resumeManifest) {
    runManager = RunManager.fromManifest(options.resumeManifest);
    markdown = readText(options.inputFile);
    try {
      product = runManager.loadCanonicalProduct();
    } catch {
      // Will be created during pipeline
    }
  } else {
    runManager = new RunManager(
      options.inputFile,
      options.outDir,
      options.provider,
      options.model,
      options.mode,
    );
    markdown = readText(options.inputFile);
  }

  const runId = runManager.runId;

  const fromIdx = options.fromStage
    ? STAGES.indexOf(options.fromStage as StageName)
    : 0;
  const toIdx = options.toStage
    ? STAGES.indexOf(options.toStage as StageName)
    : STAGES.length - 1;

  if (fromIdx === -1 || toIdx === -1) {
    throw new Error(`Invalid stage name. Valid stages: ${STAGES.join(', ')}`);
  }

  let structure: DetectedStructure | null = null;
  let validationResult: CrossValidationResult | null = null;
  let traceability: TraceabilityMatrix | null = null;

  const totalStages = toIdx - fromIdx + 1;
  let stageNum = 0;

  for (let i = fromIdx; i <= toIdx; i++) {
    const stage = STAGES[i];
    stageNum++;

    if (runManager.getStageStatus(stage) === 'completed') {
      logger.stageSkip(stageNum, totalStages, stage);
      continue;
    }

    logger.stageStart(stageNum, totalStages, stage, STAGE_DESCRIPTIONS[stage] || '');
    runManager.startStage(stage);

    try {
      switch (stage) {
        case 'detect': {
          structure = await detectStructure(markdown, llm, runId);
          const files = [
            ...runManager.saveParsedDocument(markdown),
            ...runManager.saveDetectedStructure(structure),
          ];
          runManager.completeStage(stage, files);
          logger.stageDetail('Input mode', structure.input_mode);
          logger.stageDetail('Sections found', String(structure.sections.length));
          logger.stageDetail('Has features', structure.has_features ? 'yes' : 'no');
          logger.stageDetail('Has stories', structure.has_user_stories ? 'yes' : 'no');
          logger.stageDetail('Has use cases', structure.has_use_cases ? 'yes' : 'no');
          logger.stageDetail('Has FR/NFR', `${structure.has_functional_requirements ? 'yes' : 'no'} / ${structure.has_non_functional_requirements ? 'yes' : 'no'}`);
          logger.stageEnd(stage, `Detected as "${structure.input_mode}" with ${structure.sections.length} sections`);
          break;
        }

        case 'normalize': {
          if (!structure) {
            structure = await detectStructure(markdown, llm, runId);
          }
          product = await normalizeToCanonical(markdown, structure, llm, runId);
          const files = runManager.saveCanonicalProduct(product);
          runManager.completeStage(stage, files);
          const storyCount = product.features.reduce((a, f) => a + f.user_stories.length, 0);
          logger.stageDetail('Product', product.title);
          logger.stageDetail('Features extracted', String(product.features.length));
          logger.stageDetail('Stories extracted', String(storyCount));
          logger.stageDetail('Goals', String(product.goals.length));
          logger.stageDetail('Personas', String(product.personas.length));
          logger.stageEnd(stage, `Canonical model: ${product.features.length} features, ${storyCount} stories`);
          break;
        }

        case 'features': {
          if (!product) product = runManager.loadCanonicalProduct();
          const beforeCount = product.features.length;
          product = await processFeatures(product, markdown, llm, runId);
          const files = [
            ...runManager.saveCanonicalProduct(product),
            ...runManager.saveFeatures(product),
          ];
          runManager.completeStage(stage, files);
          logger.stageDetail('Before', `${beforeCount} features`);
          logger.stageDetail('After', `${product.features.length} features`);
          logger.stageEnd(stage, `${product.features.length} validated features`);
          break;
        }

        case 'releases': {
          if (!product) product = runManager.loadCanonicalProduct();
          if (options.withReleasePlan !== false) {
            product = await planReleases(product, llm, runId);
          }
          const files = [
            ...runManager.saveCanonicalProduct(product),
            ...runManager.saveReleases(product),
          ];
          runManager.completeStage(stage, files);
          for (const r of product.release_plan) {
            logger.stageDetail(r.version, `${r.feature_ids.length} features`);
          }
          logger.stageEnd(stage, `${product.release_plan.length} release versions planned`);
          break;
        }

        case 'stories': {
          if (!product) product = runManager.loadCanonicalProduct();
          product = await processStories(product, markdown, llm, runId);
          const files = [
            ...runManager.saveCanonicalProduct(product),
            ...runManager.saveStories(product),
          ];
          runManager.completeStage(stage, files);
          const storyCount = product.features.reduce((acc, f) => acc + f.user_stories.length, 0);
          for (const f of product.features) {
            logger.stageDetail(f.title, `${f.user_stories.length} stories`);
          }
          logger.stageEnd(stage, `${storyCount} user stories across ${product.features.length} features`);
          break;
        }

        case 'flows': {
          if (!product) product = runManager.loadCanonicalProduct();
          product = await processFlows(product, llm, runId);
          const files = [
            ...runManager.saveCanonicalProduct(product),
            ...runManager.saveFlows(product),
          ];
          runManager.completeStage(stage, files);
          const flowCount = product.features.reduce(
            (acc, f) => acc + f.user_stories.reduce((a, s) => a + s.user_flows.length, 0), 0,
          );
          logger.stageEnd(stage, `${flowCount} user flows with Mermaid diagrams`);
          break;
        }

        case 'use_cases': {
          if (!product) product = runManager.loadCanonicalProduct();
          product = await processUseCases(product, llm, runId);
          const files = [
            ...runManager.saveCanonicalProduct(product),
            ...runManager.saveUseCases(product),
          ];
          runManager.completeStage(stage, files);
          const ucCount = product.features.reduce(
            (acc, f) => acc + f.user_stories.reduce(
              (a, s) => a + s.user_flows.reduce((b, fl) => b + fl.use_cases.length, 0), 0,
            ), 0,
          );
          logger.stageEnd(stage, `${ucCount} atomic use cases (Given/When/Then)`);
          break;
        }

        case 'requirements': {
          if (!product) product = runManager.loadCanonicalProduct();
          product = await processRequirements(product, llm, runId);
          const files = [
            ...runManager.saveCanonicalProduct(product),
            ...runManager.saveRequirements(product),
          ];
          runManager.completeStage(stage, files);
          let frCount = 0, nfrCount = 0;
          for (const f of product.features) {
            for (const s of f.user_stories) {
              for (const fl of s.user_flows) {
                for (const uc of fl.use_cases) {
                  frCount += uc.functional_requirements.length;
                  nfrCount += uc.non_functional_requirements.length;
                }
              }
            }
          }
          logger.stageDetail('Functional', `${frCount} requirements`);
          logger.stageDetail('Non-functional', `${nfrCount} requirements`);
          logger.stageEnd(stage, `${frCount} FR + ${nfrCount} NFR = ${frCount + nfrCount} total requirements`);
          break;
        }

        case 'cross_validate': {
          if (!product) product = runManager.loadCanonicalProduct();
          validationResult = await crossValidate(product, llm, runId);
          traceability = buildTraceabilityMatrix(product);
          const files = runManager.saveTraceability(traceability, validationResult);
          runManager.completeStage(stage, files);
          const c = validationResult.coverage;
          logger.stageDetail('Features covered', `${c.features_with_stories}/${c.features_with_stories + c.features_without_stories}`);
          logger.stageDetail('Stories covered', `${c.stories_with_flows}/${c.stories_with_flows + c.stories_without_flows}`);
          logger.stageDetail('Issues found', String(validationResult.issues.length));
          logger.stageDetail('Assumptions', String(validationResult.assumptions.length));
          logger.stageDetail('Open questions', String(validationResult.unresolved_items.length));
          logger.stageEnd(stage, `${validationResult.issues.length} issues, ${traceability.entries.length} trace entries`);
          break;
        }

        case 'render': {
          if (!product) product = runManager.loadCanonicalProduct();
          if (!validationResult) {
            validationResult = await crossValidate(product, llm, runId);
          }
          if (!traceability) {
            traceability = buildTraceabilityMatrix(product);
          }
          const finalMd = renderFinalSpecification(product, traceability, validationResult);
          const files = runManager.saveFinalSpec(finalMd);
          runManager.saveCanonicalProduct(product);
          runManager.completeStage(stage, files);
          logger.stageDetail('Output', `${options.outDir}/final_specification.md`);
          logger.stageEnd(stage, 'All files rendered');
          break;
        }
      }
    } catch (error: any) {
      logger.stageFail(stage, error.message);
      runManager.failStage(stage, error.message);
      if (product) {
        runManager.saveCanonicalProduct(product);
      }
      throw error;
    }
  }

  if (options.failOnLowConfidence && product) {
    const lowConfFeatures = product.features.filter(f => f.confidence_score < 0.5);
    if (lowConfFeatures.length > 0) {
      console.error(`\n⚠ ${lowConfFeatures.length} features have low confidence (< 0.5)`);
      process.exitCode = 1;
    }
  }

  runManager.complete();
  logger.pipelineEnd(options.outDir);
}

export async function runValidateOnly(
  inputFile: string,
  provider: string,
  model: string,
  mode: 'strict' | 'balanced' | 'creative',
): Promise<void> {
  const logger = createLogger();
  const llm = new LLMGateway({ provider, model, mode }, logger);
  const markdown = readText(inputFile);
  const runId = 'validate-' + Date.now();

  logger.pipelineStart(inputFile, provider, model, mode);
  logger.stageStart(1, 1, 'validate', 'Detect document structure without generating specs');

  const structure = await detectStructure(markdown, llm, runId);

  logger.stageDetail('Input mode', structure.input_mode);
  logger.stageDetail('Sections', String(structure.sections.length));
  logger.stageDetail('Features', structure.has_features ? 'yes' : 'no');
  logger.stageDetail('User Stories', structure.has_user_stories ? 'yes' : 'no');
  logger.stageDetail('User Flows', structure.has_user_flows ? 'yes' : 'no');
  logger.stageDetail('Use Cases', structure.has_use_cases ? 'yes' : 'no');
  logger.stageDetail('FR', structure.has_functional_requirements ? 'yes' : 'no');
  logger.stageDetail('NFR', structure.has_non_functional_requirements ? 'yes' : 'no');
  logger.stageDetail('Release Plan', structure.has_release_plan ? 'yes' : 'no');

  console.log('');
  for (const s of structure.sections) {
    logger.stageDetail(`"${s.heading}"`, s.mapped_to || '(unmapped)');
  }

  logger.stageEnd('validate', `${structure.input_mode} mode, ${structure.sections.length} sections`);
}

export async function runSingleStage(
  stageName: string,
  inputFile: string,
  outDir: string,
  provider: string,
  model: string,
  mode: 'strict' | 'balanced' | 'creative',
): Promise<void> {
  return runPipeline({
    inputFile,
    outDir,
    provider,
    model,
    mode,
    fromStage: stageName,
    toStage: stageName,
  });
}
