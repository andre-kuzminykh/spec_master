#!/usr/bin/env node

/**
 * SpecMaster CLI — transforms product descriptions into formal specifications.
 */

import { Command } from 'commander';
import * as path from 'path';
import { runPipeline, runValidateOnly, runSingleStage } from './pipeline';

const program = new Command();

program
  .name('specmaster')
  .description('SpecMaster — automated product specification generator')
  .version('1.0.0');

// ─── generate ────────────────────────────────────────────────────────────────

program
  .command('generate')
  .description('Run the full specification pipeline')
  .argument('<input>', 'Input file path (.md)')
  .option('--out <dir>', 'Output directory', './out')
  .option('--provider <provider>', 'LLM provider (anthropic, openai)', 'openai')
  .option('--model <model>', 'Model name', 'gpt-5.4')
  .option('--format <format>', 'Output format', 'markdown')
  .option('--mode <mode>', 'Generation mode: strict, balanced, creative', 'balanced')
  .option('--from-stage <stage>', 'Start from this stage')
  .option('--to-stage <stage>', 'Stop after this stage')
  .option('--with-release-plan', 'Include release planning', true)
  .option('--no-release-plan', 'Skip release planning')
  .option('--with-traceability', 'Include traceability matrix', true)
  .option('--no-traceability', 'Skip traceability')
  .option('--fail-on-low-confidence', 'Exit with error if low-confidence items found')
  .option('--config <file>', 'Path to config file')
  .action(async (input: string, opts: any) => {
    const inputFile = path.resolve(input);
    const outDir = path.resolve(opts.out);

    console.log(`\nSpecMaster — Generating specification`);
    console.log(`  Input: ${inputFile}`);
    console.log(`  Output: ${outDir}`);
    console.log(`  Provider: ${opts.provider}`);
    console.log(`  Model: ${opts.model}`);
    console.log(`  Mode: ${opts.mode}\n`);

    try {
      await runPipeline({
        inputFile,
        outDir,
        provider: opts.provider,
        model: opts.model,
        mode: opts.mode,
        fromStage: opts.fromStage,
        toStage: opts.toStage,
        withReleasePlan: opts.releasePlan !== false,
        withTraceability: opts.traceability !== false,
        failOnLowConfidence: opts.failOnLowConfidence,
      });
    } catch (error: any) {
      console.error(`\n✗ Pipeline failed: ${error.message}`);
      process.exit(1);
    }
  });

// ─── stage ───────────────────────────────────────────────────────────────────

const stageCmd = program
  .command('stage')
  .description('Run a single pipeline stage');

const stageNames: Record<string, string> = {
  'normalize': 'normalize',
  'features': 'features',
  'stories': 'stories',
  'flows': 'flows',
  'use-cases': 'use_cases',
  'requirements': 'requirements',
};

for (const [cmdName, stageName] of Object.entries(stageNames)) {
  stageCmd
    .command(cmdName)
    .description(`Run the ${cmdName} stage`)
    .argument('<input>', 'Input file (.md or canonical.json)')
    .option('--out <dir>', 'Output directory', './out')
    .option('--provider <provider>', 'LLM provider', 'openai')
    .option('--model <model>', 'Model name', 'gpt-5.4')
    .option('--mode <mode>', 'Generation mode', 'balanced')
    .action(async (input: string, opts: any) => {
      const inputFile = path.resolve(input);
      const outDir = path.resolve(opts.out);

      console.log(`\nSpecMaster — Running stage: ${cmdName}`);

      try {
        await runSingleStage(stageName, inputFile, outDir, opts.provider, opts.model, opts.mode);
      } catch (error: any) {
        console.error(`\n✗ Stage failed: ${error.message}`);
        process.exit(1);
      }
    });
}

// ─── resume ──────────────────────────────────────────────────────────────────

program
  .command('resume')
  .description('Resume a pipeline from a run manifest')
  .argument('<manifest>', 'Path to run_manifest.json')
  .option('--provider <provider>', 'LLM provider', 'anthropic')
  .option('--model <model>', 'Model name', 'claude-sonnet-4-20250514')
  .option('--mode <mode>', 'Generation mode', 'balanced')
  .action(async (manifest: string, opts: any) => {
    const manifestPath = path.resolve(manifest);

    console.log(`\nSpecMaster — Resuming pipeline`);
    console.log(`  Manifest: ${manifestPath}\n`);

    try {
      const fs = require('fs');
      const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      await runPipeline({
        inputFile: manifestData.input_file,
        outDir: manifestData.output_dir,
        provider: opts.provider,
        model: opts.model,
        mode: opts.mode,
        resumeManifest: manifestPath,
      });
    } catch (error: any) {
      console.error(`\n✗ Resume failed: ${error.message}`);
      process.exit(1);
    }
  });

// ─── validate ────────────────────────────────────────────────────────────────

program
  .command('validate')
  .description('Validate an input document without generating specs')
  .argument('<input>', 'Input file path (.md)')
  .option('--provider <provider>', 'LLM provider', 'anthropic')
  .option('--model <model>', 'Model name', 'claude-sonnet-4-20250514')
  .option('--mode <mode>', 'Generation mode', 'balanced')
  .action(async (input: string, opts: any) => {
    const inputFile = path.resolve(input);

    console.log(`\nSpecMaster — Validating document`);
    console.log(`  Input: ${inputFile}\n`);

    try {
      await runValidateOnly(inputFile, opts.provider, opts.model, opts.mode);
    } catch (error: any) {
      console.error(`\n✗ Validation failed: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();
