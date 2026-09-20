import { describe, it, expect, beforeAll } from 'vitest';
import type { INode } from 'n8n-workflow';
import { isSubNodeType } from 'workflow-lint-core';
import { bundledVersions, loadPack, type NodeTypePack } from 'workflow-lint-node-types';
import { isHeavyNode, isNetworkNode, isNotificationNode, type NodeClassifier } from '../../src/util/network.js';

let n8n: NodeClassifier;

beforeAll(async () => {
  const pack: NodeTypePack = await loadPack(bundledVersions().at(-1)!);
  const describeNode = (node: INode) => pack.describe(node.type, node.typeVersion);
  n8n = {
    nodeType: describeNode,
    isTrigger: (node) => describeNode(node)?.group?.includes('trigger') === true,
    isSubNode: (node) => isSubNodeType(describeNode(node) ?? null),
  };
});

const node = (type: string, name = 'N', typeVersion = 1): INode =>
  ({ name, type, typeVersion, position: [0, 0], parameters: {} }) as INode;

describe('isNetworkNode', () => {
  it('accepts the HTTP node and credentialed service nodes', () => {
    expect(isNetworkNode(node('n8n-nodes-base.httpRequest', 'H', 4.2), n8n)).toBe(true);
    // slack declares credentials in its description
    expect(isNetworkNode(node('n8n-nodes-base.slack', 'S', 2.3), n8n)).toBe(true);
  });

  it('accepts stores matched by type even without credentials in play', () => {
    expect(isNetworkNode(node('n8n-nodes-base.postgres', 'P', 2.6), n8n)).toBe(true);
  });

  it('rejects triggers, sub-nodes and plain transforms', () => {
    expect(isNetworkNode(node('n8n-nodes-base.manualTrigger'), n8n)).toBe(false);
    expect(isNetworkNode(node('n8n-nodes-base.webhook', 'W', 2.1), n8n)).toBe(false);
    expect(isNetworkNode(node('@n8n/n8n-nodes-langchain.lmChatOpenAi'), n8n)).toBe(false);
    expect(isNetworkNode(node('n8n-nodes-base.set', 'S', 3.4), n8n)).toBe(false);
    expect(isNetworkNode(node('n8n-nodes-base.noOp'), n8n)).toBe(false);
  });
});

describe('isNotificationNode', () => {
  it('accepts alerting and terminating nodes', () => {
    for (const type of [
      'n8n-nodes-base.slack',
      'n8n-nodes-base.gmail',
      'n8n-nodes-base.stopAndError',
      'n8n-nodes-base.respondToWebhook',
    ]) {
      expect(isNotificationNode(node(type))).toBe(true);
    }
  });

  it('accepts an HTTP node named as an alert', () => {
    expect(isNotificationNode(node('n8n-nodes-base.httpRequest', 'POST Alert - Notify oncall'))).toBe(true);
    expect(isNotificationNode(node('n8n-nodes-base.httpRequest', 'GET Users - Fetch active'))).toBe(false);
  });

  it('rejects ordinary transforms', () => {
    expect(isNotificationNode(node('n8n-nodes-base.set', 'Shape Payload'))).toBe(false);
  });
});

describe('isHeavyNode', () => {
  it('accepts HTTP, databases and model calls', () => {
    expect(isHeavyNode(node('n8n-nodes-base.httpRequest', 'H', 4.2), n8n)).toBe(true);
    expect(isHeavyNode(node('n8n-nodes-base.postgres', 'P', 2.6), n8n)).toBe(true);
    expect(isHeavyNode(node('@n8n/n8n-nodes-langchain.agent', 'A', 3), n8n)).toBe(true);
  });

  it('rejects triggers and cheap transforms', () => {
    expect(isHeavyNode(node('n8n-nodes-base.webhook', 'W', 2.1), n8n)).toBe(false);
    expect(isHeavyNode(node('n8n-nodes-base.set', 'S', 3.4), n8n)).toBe(false);
    expect(isHeavyNode(node('n8n-nodes-base.respondToWebhook', 'R', 1.5), n8n)).toBe(false);
  });
});
