import { it, expect } from 'vitest';
import { CORE_VERSION } from '../src/index.js';

it('loads', () => expect(CORE_VERSION).toBe('0.0.1'));
