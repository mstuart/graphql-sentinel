import type { SecurityCheck } from '../../types/index.js';
import { introspectionCheck } from './introspection.js';
import { depthLimitCheck } from './depth-limit.js';
import { batchAttackCheck } from './batch-attack.js';
import { fieldSuggestionCheck } from './field-suggestion.js';
import { aliasOverloadingCheck } from './alias-overloading.js';
import { csrfCheck } from './csrf.js';
import { authBypassCheck } from './auth-bypass.js';

export const allChecks: SecurityCheck[] = [
  introspectionCheck,
  depthLimitCheck,
  batchAttackCheck,
  fieldSuggestionCheck,
  aliasOverloadingCheck,
  csrfCheck,
  authBypassCheck,
];

export function getChecks(names?: string[]): SecurityCheck[] {
  if (!names || names.length === 0) {
    return allChecks;
  }
  return allChecks.filter((check) => names.includes(check.name));
}

export {
  introspectionCheck,
  depthLimitCheck,
  batchAttackCheck,
  fieldSuggestionCheck,
  aliasOverloadingCheck,
  csrfCheck,
  authBypassCheck,
};
