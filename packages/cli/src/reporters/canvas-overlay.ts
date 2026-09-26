import type { LintResult, ReportedSeverity } from 'workflow-lint-core';

/** S6 defines exactly these badge kinds. */
const BADGE: Record<ReportedSeverity, 'error' | 'warn' | 'info'> = {
  error: 'error',
  warn: 'warn',
  info: 'info',
};

export interface OverlayBadge {
  kind: 'error' | 'warn' | 'info';
  text: string;
}

export interface CanvasOverlay {
  version: 1;
  /** The tool that wrote it, so a canvas can carry findings from more than one. */
  source?: string;
  nodes: Record<string, { badges?: OverlayBadge[]; tint?: string }>;
  edges: Record<string, { label?: string; tint?: string }>;
}

/**
 * The format workflow-render draws (`workflow-render export wf.json --overlay
 * findings.json`, or the element's `overlay` attribute): a ring and a count
 * badge per flagged node. The envelope is complete — `edges` is always
 * present, empty — even though nothing here produces edge annotations.
 *
 * Findings with no node cannot be attached to a canvas element, so they are
 * omitted rather than collected under a placeholder key.
 */
export function canvasOverlay(results: LintResult[], options: { version?: string } = {}): string {
  const nodes: CanvasOverlay['nodes'] = {};

  for (const result of results) {
    for (const finding of result.findings) {
      if (finding.nodeName === undefined) continue;
      const entry = (nodes[finding.nodeName] ??= {});
      (entry.badges ??= []).push({
        kind: BADGE[finding.severity],
        text: `${finding.ruleId}: ${finding.message}`,
      });
    }
  }

  const overlay: CanvasOverlay = {
    version: 1,
    ...(options.version === undefined ? {} : { source: `workflow-lint ${options.version}` }),
    nodes,
    edges: {},
  };
  return `${JSON.stringify(overlay, null, 2)}\n`;
}
