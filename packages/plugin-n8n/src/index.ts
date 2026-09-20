import type { Rule } from 'workflow-lint-core';
import { rule as valid } from './rules/valid.js';
import { rule as typeversionPolicy } from './rules/typeversion-policy.js';
import { rule as typeversionDrift } from './rules/typeversion-drift.js';

export const rules: Rule[] = [valid, typeversionPolicy, typeversionDrift];
export const plugin = { name: 'n8n', rules };
export { valid, typeversionPolicy, typeversionDrift };
