import { introspectionCheck } from './introspection.js';
import { depthLimitCheck } from './depth-limit.js';
import { batchAttackCheck } from './batch-attack.js';
import { fieldSuggestionCheck } from './field-suggestion.js';
import { aliasOverloadingCheck } from './alias-overloading.js';
import { csrfCheck } from './csrf.js';
import { authBypassCheck } from './auth-bypass.js';
import type { SecurityCheck } from '../../types/index.js';

export const allChecks: SecurityCheck[] = [
  introspectionCheck,
  depthLimitCheck,
  batchAttackCheck,
  fieldSuggestionCheck,
  aliasOverloadingCheck,
  csrfCheck,
  authBypassCheck,
];

export const getChecks = (names?: string[]): SecurityCheck[] => {
  if (!names || names.length === 0) {
    return allChecks;
  }
  return allChecks.filter((check) => names.includes(check.name));
};

export { introspectionCheck } from './introspection.js';
export { batchAttackCheck } from './batch-attack.js';

export { depthLimitCheck } from './depth-limit.js';
export { aliasOverloadingCheck } from './alias-overloading.js';
export { fieldSuggestionCheck } from './field-suggestion.js';
export { authBypassCheck } from './auth-bypass.js';
export { csrfCheck } from './csrf.js';
