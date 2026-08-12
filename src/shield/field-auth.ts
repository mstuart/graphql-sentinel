import { GraphQLError } from 'graphql';
import type { ASTVisitor, ValidationContext } from 'graphql';

export interface FieldAuthRule {
  requireAuth: boolean;
  roles?: string[];
  permissions?: string[];
}

export interface FieldAuthConfig {
  /**
  Map of TypeName.fieldName -> required roles/permissions
  */
  rules: Record<string, FieldAuthRule>;
  /**
  Function to extract user context from the GraphQL context
  */
  extractContext?: (context: unknown) => {
    authenticated: boolean;
    roles: string[];
    permissions: string[];
  } | null;
}

export const createFieldAuthRule = (config: FieldAuthConfig) =>
  function FieldAuthRule(context: ValidationContext): ASTVisitor {
    const typeStack: string[] = [];

    return {
      Field: {
        enter(node) {
          const fieldName = node.name.value;
          const parentType = typeStack.at(-1) || 'Query';
          const ruleKey = `${parentType}.${fieldName}`;

          const rule = config.rules[ruleKey];
          if (rule) {
            // The shared authorization helper follows the visitor factory.
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            checkRule({ config, context, rule, ruleKey });
          } else {
            // Also check wildcard rules: *.fieldName or TypeName.*
            const wildcardField = config.rules[`*.${fieldName}`];
            const wildcardType = config.rules[`${parentType}.*`];
            const effectiveRule = wildcardField || wildcardType;
            if (effectiveRule) {
              // The shared authorization helper follows the visitor factory.
              // eslint-disable-next-line @typescript-eslint/no-use-before-define
              checkRule({ config, context, rule: effectiveRule, ruleKey });
            }
          }

          // Push the type of this field for nested field resolution
          const fieldDefinition = context.getFieldDef();
          if (fieldDefinition) {
            // The recursive unwrapping helper follows the visitor factory.
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            const namedType = getNamedType(fieldDefinition.type);
            if (namedType && 'name' in namedType) {
              typeStack.push(namedType.name);
            }
          }
        },
        leave() {
          // Pop the type we pushed
          const fieldDefinition = context.getFieldDef();
          if (fieldDefinition) {
            // The recursive unwrapping helper follows the visitor factory.
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            const namedType = getNamedType(fieldDefinition.type);
            if (namedType && 'name' in namedType) {
              typeStack.pop();
            }
          }
        },
      },
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
    };
  };

const checkRule = ({
  config,
  context,
  rule,
  ruleKey,
}: {
  config: FieldAuthConfig;
  context: ValidationContext;
  rule: FieldAuthRule;
  ruleKey: string;
}): void => {
  // Extract user context
  const userContext = config.extractContext
    ? config.extractContext((context as unknown as { _contextValue?: unknown })._contextValue)
    : null;

  if (rule.requireAuth && (!userContext || !userContext.authenticated)) {
    context.reportError(
      new GraphQLError(`Access denied: field "${ruleKey}" requires authentication.`),
    );
    return;
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
    const hasPermission = rule.permissions.some((p) => userContext.permissions.includes(p));
    if (!hasPermission) {
      context.reportError(
        new GraphQLError(
          `Access denied: field "${ruleKey}" requires one of permissions: ${rule.permissions.join(', ')}.`,
        ),
      );
    }
  }
};

const getNamedType = (type: any): any => {
  if (!type) {
    return null;
  }
  if (type.ofType) {
    return getNamedType(type.ofType);
  }
  return type;
};
