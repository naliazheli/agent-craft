import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface SeedErdosSourceComment {
  author: string;
  postedAtLabel: string;
  contentMd: string;
  replies?: SeedErdosSourceComment[];
}

export interface SeedErdosProblem {
  title: string;
  description: string;
  acceptanceCriteria?: string;
  reward: number;
  tags: string[];
  sourceUrl: string;
  sourceMetadata: {
    catalog: string;
    externalProblemId: number;
    bibliographySourceCode: string;
    bibliographySourceUrl: string;
    discussionThreadUrl: string;
    latexSourceUrl?: string;
    latexSource?: string;
    disclaimer: string;
    statement: string;
    statementMd: string;
    statusLabel?: string;
    statusNote: string;
    categories: string[];
    discoveredFromTags?: string[];
    discoveredFromTagUrls?: string[];
    bibliographyRefs: string[];
    bibliographyEntries?: Array<{
      code: string;
      citation: string;
      sourceUrl?: string;
      scholarUrl?: string;
    }>;
    researchNotes: string[];
    researchNotesMd: string[];
    sourceComments: SeedErdosSourceComment[];
    commentCount?: number;
    relatedLinks: Array<{ label: string; url: string }>;
    recommendedCitation: string;
    additionalThanks?: string[];
    lastEditedAt: string;
    originalPrize: { amount: number; currency: string };
    formalized: { available: boolean; label: string };
  };
}

export interface SeedErdosDataset {
  generatedAt: string;
  sourceUrl: string;
  tagCount: number;
  problemCount: number;
  totalSourceCommentCount: number;
  problems: SeedErdosProblem[];
}

const datasetPath = path.join(__dirname, 'erdos-problems.generated.json');

export function loadErdosProblemDataset(): SeedErdosDataset {
  return JSON.parse(readFileSync(datasetPath, 'utf8')) as SeedErdosDataset;
}

export function loadErdosProblems(): SeedErdosProblem[] {
  return loadErdosProblemDataset().problems;
}

export const ERDOS_PROBLEM_DATASET = loadErdosProblemDataset();
export const ERDOS_PROBLEMS = ERDOS_PROBLEM_DATASET.problems;
