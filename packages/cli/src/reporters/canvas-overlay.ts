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
  nodes: Record<string, { badges?: OverlayBadge[]; tint?: string }>;
  edges: Record<string, { label?: string; tint?: string }>;
}

/**
 * Reserved.
 *
 * workflow-render owns this format and does not render it yet; it is emitted now so
 * that when it does, nobody has invented a second shape in the meantime. The
 * envelope is therefore complete — `edges` is always present, empty — even
 * though nothing here produces edge annotations.
 *
 * Findings with no node cannot be attached to a canvas element, so they are
 * omitted rather than collected under a placeholder key.
 */
export function canvasOverlay(results: LintResult[]): string {
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

  const overlay: CanvasOverlay = { version: 1, nodes, edges: {} };
  return `${JSON.stringify(overlay, null, 2)}\n`;
}
