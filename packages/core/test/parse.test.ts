import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWorkflow } from '../src/parse.js';

const text = readFileSync(new URL('./fixtures/basic.json', import.meta.url), 'utf8');

describe('parseWorkflow', () => {
  it('parses and maps node lines', () => {
    const { workflow, errors } = parseWorkflow(text, 'basic.json');
    expect(errors).toEqual([]);
    expect(workflow!.json.nodes).toHaveLength(4);
    const loc = workflow!.sourceMap.node('HTTP Request')!;
    expect(loc.line).toBeGreaterThan(1);
    expect(workflow!.sourceMap.setting('executionOrder')).toBeDefined();
  });

  it('collects structural errors with locations', () => {
    const bad = JSON.stringify(
      {
        nodes: [
          { name: 'A', type: 'x', typeVersion: 1, position: [0, 0] },
          { name: 'A', type: 'x', typeVersion: 1, position: [0, 0] },
        ],
        connections: { A: { main: [[{ node: 'Ghost', type: 'main', index: 0 }]] } },
      },
      null,
      2,
    );
    const { workflow, errors } = parseWorkflow(bad, 'bad.json');
    expect(workflow).toBeUndefined();
    expect(errors.map((e) => e.message)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/duplicate node name "A"/),
        expect.stringMatching(/connection .* "Ghost" .* does not exist/),
      ]),
    );
    expect(errors[0]!.loc).toBeDefined();
  });

  it('invalid JSON → one error with line', () => {
    const { errors } = parseWorkflow('{ "nodes": [ ', 'x.json');
    expect(errors).toHaveLength(1);
    expect(errors[0]!.loc?.line).toBe(1);
  });
});

describe('API response envelopes', () => {
  it('unwraps { data: { ... } } and keeps locations accurate', () => {
    const enveloped = JSON.stringify({ success: true, data: JSON.parse(text) }, null, 2);
    const { workflow, errors } = parseWorkflow(enveloped, 'api.json');
    expect(errors).toEqual([]);
    expect(workflow!.json.nodes).toHaveLength(4);

    // The location must point into the wrapped document, not the envelope:
    // past the "data" key, at the node object's opening brace.
    const lines = enveloped.split('\n');
    const dataLine = lines.findIndex((l) => l.includes('"data"')) + 1;
    const loc = workflow!.sourceMap.node('HTTP Request')!;
    expect(loc.line).toBeGreaterThan(dataLine);
    expect(lines[loc.line - 1]!.trim()).toBe('{');
    expect(lines[loc.line]!).toContain('"parameters"');
    expect(workflow!.sourceMap.setting('executionOrder')).toBeDefined();
  });

  it('still rejects an object that wraps no workflow', () => {
    const { workflow, errors } = parseWorkflow(JSON.stringify({ data: { hello: 1 } }), 'x.json');
    expect(workflow).toBeUndefined();
    expect(errors[0]!.message).toMatch(/must be an object with a "nodes" array/);
  });
});
