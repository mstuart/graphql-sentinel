import type { ScanReport, Severity } from '../types/index.js';

function mapSeverityToSarif(severity: Severity): 'error' | 'warning' | 'note' {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
    case 'info':
      return 'note';
  }
}

export function generateSarifReport(report: ScanReport): string {
  const sarif = {
    version: '2.1.0' as const,
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'graphql-sentinel',
            version: '0.1.0',
            informationUri: 'https://github.com/mstuart/graphql-sentinel',
            rules: report.results.map((r) => ({
              id: r.check,
              name: r.title,
              shortDescription: { text: r.title },
              fullDescription: { text: r.description },
              helpUri: 'https://github.com/mstuart/graphql-sentinel',
              defaultConfiguration: {
                level: mapSeverityToSarif(r.severity),
              },
              properties: {
                tags: ['security', 'graphql'],
              },
            })),
          },
        },
        results: report.results
          .filter((r) => !r.passed)
          .map((r) => ({
            ruleId: r.check,
            level: mapSeverityToSarif(r.severity),
            message: { text: `${r.title}: ${r.description}` },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: report.target },
                },
              },
            ],
            ...(r.remediation
              ? {
                  fixes: [
                    {
                      description: { text: r.remediation },
                    },
                  ],
                }
              : {}),
          })),
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
