import { describe, expect, it } from 'vitest';
import {
  COMPANION_TOOL_NAMES,
  toolNeedsConfirmation,
} from '@/lib/companion/tools-policy';
import { classifyObjection } from '@/lib/companion/objections';
describe('companion tool safety', () => {
  it('requires explicit confirmation for customer-changing tools', () => {
    expect(toolNeedsConfirmation('addToCart')).toBe(true);
    expect(toolNeedsConfirmation('calculatePrice')).toBe(false);
    expect(COMPANION_TOOL_NAMES).toContain('prepareWhatsAppHandoff');
  });
  it('classifies common objections without model output', () => {
    expect(classifyObjection('Is COD payment available?')).toBe('PAYMENT');
    expect(classifyObjection('What material is used?')).toBe('MATERIAL');
    expect(classifyObjection('I am just looking for now')).toBe('NOT_READY');
  });
});
