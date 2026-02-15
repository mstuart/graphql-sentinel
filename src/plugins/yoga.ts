import type { ShieldConfig } from '../types/index.js';
import { createShield } from '../shield/index.js';

export function useSentinelShield(config?: ShieldConfig) {
  const shield = createShield(config ?? {});
  return {
    onValidate({ addValidationRule }: { addValidationRule: (rule: unknown) => void }) {
      for (const rule of shield.validationRules) {
        addValidationRule(rule);
      }
    },
  };
}
