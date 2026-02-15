import type { ASTVisitor, ValidationContext } from 'graphql';
import { GraphQLError } from 'graphql';

export interface FieldAuthRule {
  requireAuth: boolean;
  roles?: string[];
  permissions?: string[];
}

export interface FieldAuthConfig {
  /** Map of TypeName.fieldName -> required roles/permissions */
  rules: Record<string, FieldAuthRule>;
  /** Function to extract user context from the GraphQL context */
  extractContext?: (context: unknown) => {
    authenticated: boolean;
    roles: string[];
    permissions: string[];
  } | null;
}

export function createFieldAuthRule(config: FieldAuthConfig) {
  return function FieldAuthRule(context: ValidationContext): ASTVisitor {
    const typeStack: string[] = [];

    return {
      OperationDefinition: {
        enter() {
          const queryType = context.getSchema().getQueryType();
          // Push root type
          typeStack.push(queryType?.name || 'Query');
        },
        leave() {
          typeStack.pop();
        },
      },
      Field: {
        enter(node) {
          const fieldName = node.name.value;
          const parentType = typeStack[typeStack.length - 1] || 'Query';
          const ruleKey = `${parentType}.${fieldName}`;

          const rule = config.rules[ruleKey];
          if (!rule) {
            // Also check wildcard rules: *.fieldName or TypeName.*
            const wildcardField = config.rules[`*.${fieldName}`];
            const wildcardType = config.rules[`${parentType}.*`];
            const effectiveRule = wildcardField || wildcardType;
            if (effectiveRule) {
              checkRule(effectiveRule, ruleKey, context, config);
            }
          } else {
            checkRule(rule, ruleKey, context, config);
          }

          // Push the type of this field for nested field resolution
          const fieldDef = context.getFieldDef();
          if (fieldDef) {
            const namedType = getNamedType(fieldDef.type);
            if (namedType && 'name' in namedType) {
              typeStack.push(namedType.name);
            }
          }
        },
        leave() {
          // Pop the type we pushed
          const fieldDef = context.getFieldDef();
          if (fieldDef) {
            const namedType = getNamedType(fieldDef.type);
            if (namedType && 'name' in namedType) {
              typeStack.pop();
            }
          }
        },
      },
    };
  };
}

function checkRule(
  rule: FieldAuthRule,
  ruleKey: string,
  context: ValidationContext,
  config: FieldAuthConfig,
): void {
  // Extract user context
  const userContext = config.extractContext
    ? config.extractContext((context as unknown as { _contextValue?: unknown })._contextValue)
    : null;

  if (rule.requireAuth) {
    if (!userContext || !userContext.authenticated) {
      context.reportError(
        new GraphQLError(
          `Access denied: field "${ruleKey}" requires authentication.`,
        ),
      );
      return;
    }
  }

  if (rule.roles && rule.roles.length > 0) {
    if (!userContext) {
      context.reportError(
        new GraphQLError(
          `Access denied: field "${ruleKey}" requires one of roles: ${rule.roles.join(', ')}.`,
        ),
      );
      return;
    }
    const hasRole = rule.roles.some((r) => userContext.roles.includes(r));
    if (!hasRole) {
      context.reportError(
        new GraphQLError(
          `Access denied: field "${ruleKey}" requires one of roles: ${rule.roles.join(', ')}.`,
        ),
      );
      return;
    }
  }

  if (rule.permissions && rule.permissions.length > 0) {
    if (!userContext) {
      context.reportError(
        new GraphQLError(
          `Access denied: field "${ruleKey}" requires one of permissions: ${rule.permissions.join(', ')}.`,
        ),
      );
      return;
    }
    const hasPermission = rule.permissions.some((p) =>
      userContext.permissions.includes(p),
    );
    if (!hasPermission) {
      context.reportError(
        new GraphQLError(
          `Access denied: field "${ruleKey}" requires one of permissions: ${rule.permissions.join(', ')}.`,
        ),
      );
      return;
    }
  }
}

 
function getNamedType(type: any): any {
  if (!type) return null;
  if (type.ofType) return getNamedType(type.ofType);
  return type;
}
