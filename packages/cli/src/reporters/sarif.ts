import { createHash } from 'node:crypto';
import { isAbsolute, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
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
  /** Paths under this directory are written relative to it; others as `file://` URLs. */
  cwd?: string;
  /** When the run began and ended; recorded as the SARIF invocation. */
  startTime?: Date;
  endTime?: Date;
  /** The n8n version the rules ran against. */
  n8nVersion?: string;
  /** The config file the run used. */
  configPath?: string;
}

const DOCS_BASE = 'https://workflowtools.dev/workflow-lint/rules';

/** Every rule's page lives at a fixed place derived from its `department/rule-name` id. */
function helpUri(id: string, rule: Rule | undefined): string {
  return rule?.meta.docs.url ?? `${DOCS_BASE}/${id}`;
}

function department(id: string): string {
  const slash = id.indexOf('/');
  return slash === -1 ? id : id.slice(0, slash);
}

/**
 * A stable identity for a finding across runs: the rule, the node it names
 * and the message it chose. Line and column are left out on purpose so a
 * finding survives its node moving in the file, which is what lets GitHub
 * code scanning tell a new alert from a moved one.
 */
function fingerprint(finding: Finding): string {
  return createHash('sha256')
    .update([finding.ruleId, finding.nodeName ?? '', finding.messageId ?? finding.message].join('\0'))
    .digest('hex');
}

/**
 * SARIF wants a URI: forward slashes, relative when the file is under the
 * working directory, an absolute `file://` URL otherwise.
 */
function artifactUri(path: string, cwd: string | undefined): string {
  const slashed = path.replace(/\\/g, '/');
  if (!isAbsolute(slashed)) return slashed;
  if (cwd !== undefined) {
    const rel = relative(cwd, slashed).replace(/\\/g, '/');
    if (rel !== '' && !rel.startsWith('../') && !isAbsolute(rel)) return rel;
  }
  return pathToFileURL(slashed).href;
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
function fixFor(finding: Finding, uri: string, source: string | undefined): SarifFix | undefined {
  if (!finding.fix || finding.fixSafety !== 'safe' || source === undefined) return undefined;
  try {
    const fixed = applyPatches(JSON.parse(source) as never, finding.fix);
    return {
      description: { text: `Apply the ${finding.ruleId} fix` },
      artifactChanges: [
        {
          artifactLocation: { uri },
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
          defaultConfiguration: {
            level: rule.meta.docs.recommended === false ? 'none' : LEVEL[rule.meta.docs.recommended],
          },
        }
      : {}),
    helpUri: helpUri(id, rule),
    properties: { tags: rule?.meta.class ? [department(id), rule.meta.class] : [department(id)] },
  }));

  const sarifResults = results.flatMap((result) => {
    const uri = artifactUri(result.path, options.cwd);
    return result.findings.map((finding) => {
      const fix = fixFor(finding, uri, options.sources?.get(result.path));
      return {
        ruleId: finding.ruleId,
        level: LEVEL[finding.severity],
        message: { text: finding.message },
        partialFingerprints: { 'workflow-lint/v1': fingerprint(finding) },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri },
              region: {
                startLine: finding.loc?.line ?? 1,
                startColumn: finding.loc?.column ?? 1,
              },
            },
          },
        ],
        ...(fix ? { fixes: [fix] } : {}),
      };
    });
  });

  const invocations =
    options.startTime && options.endTime
      ? [
          {
            executionSuccessful: true,
            startTimeUtc: options.startTime.toISOString(),
            endTimeUtc: options.endTime.toISOString(),
          },
        ]
      : undefined;
  const runProperties = {
    ...(options.n8nVersion !== undefined ? { n8nVersion: options.n8nVersion } : {}),
    ...(options.configPath !== undefined ? { configPath: options.configPath } : {}),
  };

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
              ...(options.version !== undefined ? { version: options.version } : {}),
              rules: driverRules,
            },
          },
          ...(invocations ? { invocations } : {}),
          results: sarifResults,
          ...(Object.keys(runProperties).length > 0 ? { properties: runProperties } : {}),
        },
      ],
    },
    null,
    2,
  )}\n`;
}
