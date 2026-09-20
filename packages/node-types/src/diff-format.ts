import type { NodeChange, NodeTypesDiff, PropertyChange } from './diff.js';

export type DiffFormat = 'text' | 'md' | 'json';

const summaryLine = (diff: NodeTypesDiff): string => {
  const { added, removed, hidden, changed, propertyChanges } = diff.summary;
  return `${added} added, ${removed} removed, ${hidden} hidden, ${changed} changed (${propertyChanges} property change${propertyChanges === 1 ? '' : 's'})`;
};

/** Left column width for the detail lines under a changed node. */
const LABEL = 16;
const label = (text: string): string => `  ${text.padEnd(LABEL)}`;

const propertyText = (change: PropertyChange): string => {
  // versionRange already carries its own brackets for a multi-version entry.
  const at = change.versionRange;
  switch (change.kind) {
    case 'property-added':
      return `  + property ${change.path} ${at}`;
    case 'property-removed':
      return `  - property ${change.path} ${at}`;
    case 'property-type-changed':
      return `  ~ property ${change.path} type ${change.before} → ${change.after} ${at}`;
    case 'property-options-changed':
      return `  ~ property ${change.path} options ${change.before} → ${change.after} ${at}`;
    default:
      return `  ~ property ${change.path} default ${change.before} → ${change.after} ${at}`;
  }
};

const nodeText = (change: NodeChange): string[] => {
  if (change.kind === 'node-added') return [`+ ${change.nodeType} (new node)`];
  if (change.kind === 'node-removed') return [`- ${change.nodeType} (removed)`];
  if (change.kind === 'node-hidden') return [`~ ${change.nodeType} hidden (deprecated)`];

  const lines = [change.nodeType];
  if (change.defaultVersion) {
    lines.push(`${label('defaultVersion')}${change.defaultVersion.before} → ${change.defaultVersion.after}`);
  }
  if (change.addedVersions?.length) {
    lines.push(`${label('versions')}${change.addedVersions.map((v) => `+${v}`).join(' ')}`);
  }
  for (const credential of change.credentialChanges ?? []) {
    lines.push(`${label('credential')}${credential.kind === 'added' ? '+' : '-'} ${credential.name}`);
  }
  if (change.ioChanged) lines.push(`${label('inputs/outputs')}changed`);
  for (const property of change.properties ?? []) lines.push(propertyText(property));
  return lines;
};

const propertyMarkdown = (change: PropertyChange): string => {
  const at = `(${change.versionRange})`;
  switch (change.kind) {
    case 'property-added':
      return `- added \`${change.path}\` ${at}`;
    case 'property-removed':
      return `- removed \`${change.path}\` ${at}`;
    case 'property-type-changed':
      return `- \`${change.path}\` type \`${change.before}\` → \`${change.after}\` ${at}`;
    case 'property-options-changed':
      return `- \`${change.path}\` options \`${change.before}\` → \`${change.after}\` ${at}`;
    default:
      return `- \`${change.path}\` default \`${change.before}\` → \`${change.after}\` ${at}`;
  }
};

const nodeMarkdown = (change: NodeChange): string[] => {
  const heading = `### ${change.nodeType}`;
  if (change.kind === 'node-added') return [heading, '', 'New node.'];
  if (change.kind === 'node-removed') return [heading, '', 'Removed.'];
  if (change.kind === 'node-hidden') return [heading, '', 'Hidden or deprecated.'];

  const lines = [heading, ''];
  if (change.defaultVersion) {
    lines.push(`- defaultVersion ${change.defaultVersion.before} → ${change.defaultVersion.after}`);
  }
  if (change.addedVersions?.length) {
    lines.push(`- new typeVersions: ${change.addedVersions.join(', ')}`);
  }
  for (const credential of change.credentialChanges ?? []) {
    lines.push(`- credential ${credential.kind}: \`${credential.name}\``);
  }
  if (change.ioChanged) lines.push('- inputs/outputs changed');
  for (const property of change.properties ?? []) lines.push(propertyMarkdown(property));
  return lines;
};

/**
 * Render a diff. `json` for tooling, `text` for a terminal, `md` for pasting
 * into a bundle-refresh pull request or posting from a workflow.
 */
export function formatDiff(diff: NodeTypesDiff, format: DiffFormat): string {
  if (format === 'json') return `${JSON.stringify(diff, null, 2)}\n`;

  const arrow = `${diff.a} → ${diff.b}`;

  if (format === 'md') {
    if (diff.changes.length === 0) return `# Node types ${arrow}\n\nNo differences.\n`;
    const blocks = diff.changes.map((change) => nodeMarkdown(change).join('\n'));
    return `# Node types ${arrow}\n\n${summaryLine(diff)}\n\n${blocks.join('\n\n')}\n`;
  }

  if (diff.changes.length === 0) return `${arrow}: no differences\n`;
  const body = diff.changes.flatMap(nodeText).join('\n');
  return `${body}\n\n${arrow}: ${summaryLine(diff)}\n`;
}
