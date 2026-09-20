import { applyPatches, type Finding, type LintResult, type ReportedSeverity, type Rule } from 'workflow-lint-core';

/** SARIF calls them note / warning / error. */
const LEVEL: Record<ReportedSeverity, string> = {
  info: 'note',
  warn: 'warning',
  error: 'error',
};

export interface SarifOptions {
  version?: string;
  rules?: Map<string, Rule>;
  /** Original file text by path, used to build whole-file suggested fixes. */
  sources?: Map<string, string>;
}

interface SarifFix {
  description: { text: string };
  artifactChanges: Array<{
    artifactLocation: { uri: string };
    replacements: Array<{
      deletedRegion: { startLine: number };
      insertedContent: { text: string };
    }>;
  }>;
}

/**
 * A suggested fix, expressed the only way we can: this finding's patches
 * applied to the whole document. Offered for safe fixes alone, and only when
 * the original text is available to apply them to.
 */
function fixFor(finding: Finding, path: string, source: string | undefined): SarifFix | undefined {
  if (!finding.fix || finding.fixSafety !== 'safe' || source === undefined) return undefined;
  try {
    const fixed = applyPatches(JSON.parse(source) as never, finding.fix);
    return {
      description: { text: `Apply the ${finding.ruleId} fix` },
      artifactChanges: [
        {
          artifactLocation: { uri: path },
          replacements: [
            {
              deletedRegion: { startLine: 1 },
              insertedContent: { text: `${JSON.stringify(fixed, null, 2)}\n` },
            },
          ],
        },
      ],
    };
  } catch {
    return undefined;
  }
}

/** SARIF 2.1.0, the format GitHub code scanning ingests. */
export function sarif(results: LintResult[], options: SarifOptions = {}): string {
  const seen = new Map<string, Rule | undefined>();
  for (const result of results) {
    for (const finding of result.findings) {
      if (!seen.has(finding.ruleId)) seen.set(finding.ruleId, options.rules?.get(finding.ruleId));
    }
  }

  const driverRules = [...seen.entries()].map(([id, rule]) => ({
    id,
    ...(rule
      ? {
          shortDescription: { text: rule.meta.docs.description },
          ...(rule.meta.docs.url ? { helpUri: rule.meta.docs.url } : {}),
          defaultConfiguration: {
            level: rule.meta.docs.recommended === false ? 'none' : LEVEL[rule.meta.docs.recommended],
          },
        }
      : {}),
  }));

  const sarifResults = results.flatMap((result) =>
    result.findings.map((finding) => {
      const fix = fixFor(finding, result.path, options.sources?.get(result.path));
      return {
        ruleId: finding.ruleId,
        level: LEVEL[finding.severity],
        message: { text: finding.message },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: result.path },
              region: {
                startLine: finding.loc?.line ?? 1,
                startColumn: finding.loc?.column ?? 1,
              },
            },
          },
        ],
        ...(fix ? { fixes: [fix] } : {}),
      };
    }),
  );

  return `${JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'workflow-lint',
              informationUri: 'https://github.com/LudwigGerdes/workflow-lint',
              version: options.version ?? '0.0.1',
              rules: driverRules,
            },
          },
          results: sarifResults,
        },
      ],
    },
    null,
    2,
  )}\n`;
}
