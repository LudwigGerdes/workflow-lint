import { describe, it, expect } from 'vitest';
import { formatDiff } from '../src/diff-format.js';
import type { NodeTypesDiff } from '../src/diff.js';

const sample: NodeTypesDiff = {
  a: '2.9.0',
  b: '2.10.0',
  changes: [
    { nodeType: 'n8n-nodes-base.acmeCrm', kind: 'node-added' },
    { nodeType: 'n8n-nodes-base.crateDb', kind: 'node-hidden' },
    { nodeType: 'n8n-nodes-base.oldThing', kind: 'node-removed' },
    {
      nodeType: 'n8n-nodes-base.set',
      kind: 'node-changed',
      defaultVersion: { before: 3.4, after: 3.5 },
      addedVersions: [3.5],
      credentialChanges: [{ kind: 'added', name: 'setApi' }],
      ioChanged: true,
      properties: [
        { kind: 'property-added', path: 'options.dotNotation', versionRange: '[3.5]' },
        { kind: 'property-removed', path: 'legacyMode', versionRange: '[3.5]' },
        {
          kind: 'property-default-changed',
          path: 'mode',
          versionRange: '[3.5]',
          before: '"manual"',
          after: '"auto"',
        },
      ],
    },
  ],
  summary: { added: 1, removed: 1, hidden: 1, changed: 1, propertyChanges: 3 },
};

describe('formatDiff', () => {
  it('json is the diff verbatim', () => {
    expect(JSON.parse(formatDiff(sample, 'json'))).toEqual(sample);
  });

  it('text is a compact, scannable report', () => {
    expect(formatDiff(sample, 'text')).toBe(
      `+ n8n-nodes-base.acmeCrm (new node)
~ n8n-nodes-base.crateDb hidden (deprecated)
- n8n-nodes-base.oldThing (removed)
n8n-nodes-base.set
  defaultVersion  3.4 → 3.5
  versions        +3.5
  credential      + setApi
  inputs/outputs  changed
  + property options.dotNotation [3.5]
  - property legacyMode [3.5]
  ~ property mode default "manual" → "auto" [3.5]

2.9.0 → 2.10.0: 1 added, 1 removed, 1 hidden, 1 changed (3 property changes)
`,
    );
  });

  it('md is postable verbatim', () => {
    expect(formatDiff(sample, 'md')).toBe(
      `# Node types 2.9.0 → 2.10.0

1 added, 1 removed, 1 hidden, 1 changed (3 property changes)

### n8n-nodes-base.acmeCrm

New node.

### n8n-nodes-base.crateDb

Hidden or deprecated.

### n8n-nodes-base.oldThing

Removed.

### n8n-nodes-base.set

- defaultVersion 3.4 → 3.5
- new typeVersions: 3.5
- credential added: \`setApi\`
- inputs/outputs changed
- added \`options.dotNotation\` ([3.5])
- removed \`legacyMode\` ([3.5])
- \`mode\` default \`"manual"\` → \`"auto"\` ([3.5])
`,
    );
  });

  it('says so when nothing changed', () => {
    const empty: NodeTypesDiff = {
      a: '2.9.0',
      b: '2.9.0',
      changes: [],
      summary: { added: 0, removed: 0, hidden: 0, changed: 0, propertyChanges: 0 },
    };
    expect(formatDiff(empty, 'text')).toContain('no differences');
    expect(formatDiff(empty, 'md')).toContain('No differences');
  });
});
