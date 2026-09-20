import { describe, it, expect } from 'vitest';
import type { INode } from 'n8n-workflow';
import { parseSelector, matchesNode, SelectorError } from '../src/selectors.js';

const node = (over: Partial<INode> = {}): INode =>
  ({
    name: 'N',
    type: 'n8n-nodes-base.set',
    typeVersion: 3.4,
    position: [0, 0],
    parameters: {},
    ...over,
  }) as INode;

describe('parseSelector', () => {
  it('parses a kind with ANDed attributes', () => {
    expect(parseSelector('Node[type="n8n-nodes-base.if"][disabled=true]')).toEqual({
      kind: 'Node',
      attrs: [
        { key: 'type', op: 'eq', value: 'n8n-nodes-base.if' },
        { key: 'disabled', op: 'eq', value: true },
      ],
    });
  });

  it('parses bare kinds', () => {
    expect(parseSelector('Workflow:exit')).toEqual({ kind: 'Workflow:exit', attrs: [] });
    expect(parseSelector('StickyNote')).toEqual({ kind: 'StickyNote', attrs: [] });
  });

  it('throws SelectorError on malformed input', () => {
    expect(() => parseSelector('Nope')).toThrow(SelectorError);
    expect(() => parseSelector('Node[type=')).toThrow(SelectorError);
    expect(() => parseSelector('Node[[]]')).toThrow(SelectorError);
  });
});

describe('matchesNode', () => {
  it('Node matches any non-sticky, StickyNote only stickies', () => {
    const sticky = node({ type: 'n8n-nodes-base.stickyNote' });
    expect(matchesNode(parseSelector('Node'), node())).toBe(true);
    expect(matchesNode(parseSelector('Node'), sticky)).toBe(false);
    expect(matchesNode(parseSelector('StickyNote'), sticky)).toBe(true);
    expect(matchesNode(parseSelector('StickyNote'), node())).toBe(false);
  });

  it('matches a regex attribute', () => {
    const sel = parseSelector('Node[type=/Trigger$/]');
    expect(matchesNode(sel, node({ type: 'n8n-nodes-base.manualTrigger' }))).toBe(true);
    expect(matchesNode(sel, node({ type: 'n8n-nodes-base.set' }))).toBe(false);
  });

  it('matches string, number and boolean attributes', () => {
    expect(matchesNode(parseSelector('Node[name="N"]'), node())).toBe(true);
    expect(matchesNode(parseSelector('Node[typeVersion=3.4]'), node())).toBe(true);
    expect(matchesNode(parseSelector('Node[typeVersion=3]'), node())).toBe(false);
    // an absent `disabled` reads as false rather than undefined
    expect(matchesNode(parseSelector('Node[disabled=false]'), node())).toBe(true);
    expect(matchesNode(parseSelector('Node[disabled=true]'), node())).toBe(false);
    expect(matchesNode(parseSelector('Node[disabled=true]'), node({ disabled: true }))).toBe(true);
  });

  it('ANDs multiple attributes', () => {
    const sel = parseSelector('Node[type="n8n-nodes-base.set"][typeVersion=3.4]');
    expect(matchesNode(sel, node())).toBe(true);
    expect(matchesNode(sel, node({ typeVersion: 3.3 }))).toBe(false);
  });

  it('Workflow and Connection never match a node', () => {
    expect(matchesNode(parseSelector('Workflow'), node())).toBe(false);
    expect(matchesNode(parseSelector('Connection'), node())).toBe(false);
  });
});
