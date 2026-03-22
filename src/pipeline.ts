/**
 * Main pipeline orchestrator.
 * Executes all stages in sequence, respecting --from-stage / --to-stage.
 */

import { CanonicalProduct, DetectedStructure } from './schemas/canonical';
import { LLMGateway, LLMGatewayConfig } from './utils/llm_gateway';
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
  const llmConfig: LLMGatewayConfig = {
    provider: options.provider,
    model: options.model,
    mode: options.mode,
  };
  const llm = new LLMGateway(llmConfig);

  let runManager: RunManager;
  let product: CanonicalProduct | null = null;
  let markdown: string;

  if (options.resumeManifest) {
    runManager = RunManager.fromManifest(options.resumeManifest);
    markdown = readText(options.inputFile);
    // Load existing canonical product if available
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

  // Determine stage range
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

  for (let i = fromIdx; i <= toIdx; i++) {
    const stage = STAGES[i];

    // Skip completed stages on resume
    if (runManager.getStageStatus(stage) === 'completed') {
      console.log(`  ⟳ Skipping ${stage} (already completed)`);
      continue;
    }

    console.log(`  ▸ Stage: ${stage}`);
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
          console.log(`    Mode: ${structure.input_mode}`);
          break;
        }

        case 'normalize': {
          if (!structure) {
            structure = await detectStructure(markdown, llm, runId);
          }
          product = await normalizeToCanonical(markdown, structure, llm, runId);
          const files = runManager.saveCanonicalProduct(product);
          runManager.completeStage(stage, files);
          console.log(`    Extracted ${product.features.length} features`);
          break;
        }

        case 'features': {
          if (!product) product = runManager.loadCanonicalProduct();
          product = await processFeatures(product, markdown, llm, runId);
          const files = [
            ...runManager.saveCanonicalProduct(product),
            ...runManager.saveFeatures(product),
          ];
          runManager.completeStage(stage, files);
          console.log(`    Validated ${product.features.length} features`);
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
          console.log(`    Planned ${product.release_plan.length} releases`);
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
          console.log(`    Processed ${storyCount} stories`);
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
          console.log(`    Processed ${flowCount} flows`);
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
          console.log(`    Processed ${ucCount} use cases`);
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
          break;
        }

        case 'cross_validate': {
          if (!product) product = runManager.loadCanonicalProduct();
          validationResult = await crossValidate(product, llm, runId);
          traceability = buildTraceabilityMatrix(product);
          const files = runManager.saveTraceability(traceability, validationResult);
          runManager.completeStage(stage, files);
          console.log(`    Found ${validationResult.issues.length} issues`);
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
          // Save final canonical product
          runManager.saveCanonicalProduct(product);
          runManager.completeStage(stage, files);
          break;
        }
      }
    } catch (error: any) {
      console.error(`    ✗ Stage ${stage} failed: ${error.message}`);
      runManager.failStage(stage, error.message);

      if (options.validateOnly) {
        throw error;
      }
      // Save progress and fail gracefully
      if (product) {
        runManager.saveCanonicalProduct(product);
      }
      throw error;
    }
  }

  // Check for low confidence if requested
  if (options.failOnLowConfidence && product) {
    const lowConfFeatures = product.features.filter(f => f.confidence_score < 0.5);
    if (lowConfFeatures.length > 0) {
      console.error(`\n⚠ ${lowConfFeatures.length} features have low confidence (< 0.5)`);
      process.exitCode = 1;
    }
  }

  runManager.complete();
  console.log(`\n✓ Pipeline completed. Output: ${options.outDir}`);
}

export async function runValidateOnly(
  inputFile: string,
  provider: string,
  model: string,
  mode: 'strict' | 'balanced' | 'creative',
): Promise<void> {
  const llm = new LLMGateway({ provider, model, mode });
  const markdown = readText(inputFile);
  const runId = 'validate-' + Date.now();

  console.log('Detecting structure...');
  const structure = await detectStructure(markdown, llm, runId);
  console.log(`Input mode: ${structure.input_mode}`);
  console.log(`Sections found: ${structure.sections.length}`);
  console.log(`\nDetected levels:`);
  console.log(`  Features: ${structure.has_features ? '✓' : '✗'}`);
  console.log(`  User Stories: ${structure.has_user_stories ? '✓' : '✗'}`);
  console.log(`  User Flows: ${structure.has_user_flows ? '✓' : '✗'}`);
  console.log(`  Use Cases: ${structure.has_use_cases ? '✓' : '✗'}`);
  console.log(`  FR: ${structure.has_functional_requirements ? '✓' : '✗'}`);
  console.log(`  NFR: ${structure.has_non_functional_requirements ? '✓' : '✗'}`);
  console.log(`  Release Plan: ${structure.has_release_plan ? '✓' : '✗'}`);

  console.log(`\nSection mapping:`);
  for (const s of structure.sections) {
    console.log(`  "${s.heading}" → ${s.mapped_to || '(unmapped)'}`);
  }
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
