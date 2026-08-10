import { createShield } from '../shield/index.js';
import type { ShieldConfig } from '../types/index.js';

export const useSentinelShield = (config?: ShieldConfig) => {
  const shield = createShield(config ?? {});
  return {
    onValidate({ addValidationRule }: { addValidationRule: (rule: unknown) => void }) {
      for (const rule of shield.validationRules) {
        addValidationRule(rule);
      }
    },
  };
};
