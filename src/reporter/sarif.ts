import type { ScanReport, Severity } from '../types/index.js';

const mapSeverityToSarif = (severity: Severity): 'error' | 'warning' | 'note' => {
  switch (severity) {
    case 'critical':
    case 'high': {
      return 'error';
    }
    case 'medium': {
      return 'warning';
    }
    case 'low':
    case 'info': {
      return 'note';
    }
    default: {
      return 'note';
    }
  }
};

export const generateSarifReport = (report: ScanReport): string => {
  const sarif = {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    runs: [
      {
        results: report.results
          .filter((r) => !r.passed)
          .map((r) => ({
            level: mapSeverityToSarif(r.severity),
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: report.target },
                },
              },
            ],
            message: { text: `${r.title}: ${r.description}` },
            ruleId: r.check,
            ...(r.remediation && {
              fixes: [
                {
                  description: { text: r.remediation },
                },
              ],
            }),
          })),
        tool: {
          driver: {
            informationUri: 'https://github.com/mstuart/graphql-sentinel',
            name: 'graphql-sentinel',
            rules: report.results.map((r) => ({
              defaultConfiguration: {
                level: mapSeverityToSarif(r.severity),
              },
              fullDescription: { text: r.description },
              helpUri: 'https://github.com/mstuart/graphql-sentinel',
              id: r.check,
              name: r.title,
              properties: {
                tags: ['security', 'graphql'],
              },
              shortDescription: { text: r.title },
            })),
            version: '0.1.0',
          },
        },
      },
    ],
    version: '2.1.0' as const,
  };

  return JSON.stringify(sarif, null, 2);
};
