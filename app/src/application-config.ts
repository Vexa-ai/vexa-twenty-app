import { defineApplication } from 'twenty-sdk/define';

import {
  APP_DESCRIPTION,
  APP_DISPLAY_NAME,
  APPLICATION_UNIVERSAL_IDENTIFIER,
  DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: APP_DISPLAY_NAME,
  description: APP_DESCRIPTION,
  defaultRoleUniversalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,

  // No applicationVariables — the cron handler reads everything via
  // process.env, which only carries serverVariables. Operator-tunable
  // knobs live below alongside the secrets.

  serverVariables: {
    VEXA_API_KEY: {
      description: 'Vexa API key (X-API-Key). Issued via Vexa admin API.',
      isSecret: true,
      isRequired: true,
    },
    VEXA_API_BASE: {
      description: 'Vexa API base URL. Defaults to https://api.vexa.ai',
      isSecret: false,
      isRequired: false,
    },
    VEXA_DASHBOARD_BASE: {
      description:
        'Vexa dashboard base URL (used to build vexa_url deep links). Defaults to https://dashboard.vexa.ai',
      isSecret: false,
      isRequired: false,
    },
    AUTOPILOT_ENABLED: {
      description:
        'Master switch (true|false). When false, no bots are dispatched even if other settings allow. Privacy default: false.',
      isSecret: false,
      isRequired: false,
    },
    DOMAIN_BLOCKLIST: {
      description:
        'Comma-separated email domains to skip (acme.com,bigbank.com). Any attendee on a blocklisted domain SKIPS the meeting.',
      isSecret: false,
      isRequired: false,
    },
    SKIP_INTERNAL_ONLY: {
      description:
        'When true, meetings whose attendees all share the workspace owner domain are skipped.',
      isSecret: false,
      isRequired: false,
    },
    HORIZON_HOURS: {
      description:
        'How far ahead (hours) the cron dispatcher considers events. Default 24.',
      isSecret: false,
      isRequired: false,
    },
    LEAD_MINUTES: {
      description:
        'How early (minutes before scheduled_start) we POST /bots. Default 5.',
      isSecret: false,
      isRequired: false,
    },
    WORKSPACE_OWNER_EMAIL: {
      description:
        'Email used as the "internal" domain anchor for SKIP_INTERNAL_ONLY (e.g. yours@acme.com → acme.com is internal).',
      isSecret: false,
      isRequired: false,
    },
  },
});
