import { defineApplication } from 'twenty-sdk/define';

import {
  APP_DESCRIPTION,
  APP_DISPLAY_NAME,
  APPLICATION_UNIVERSAL_IDENTIFIER,
  APPVAR_AUTOPILOT_ENABLED,
  APPVAR_DOMAIN_BLOCKLIST,
  APPVAR_HORIZON_HOURS,
  APPVAR_LEAD_MINUTES,
  APPVAR_SKIP_INTERNAL,
  DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: APP_DISPLAY_NAME,
  description: APP_DESCRIPTION,
  defaultRoleUniversalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,

  applicationVariables: {
    AUTOPILOT_ENABLED: {
      universalIdentifier: APPVAR_AUTOPILOT_ENABLED,
      description:
        'Master switch. When false, no bots are dispatched even if other settings allow.',
      value: 'false',
      isSecret: false,
    },
    DOMAIN_BLOCKLIST: {
      universalIdentifier: APPVAR_DOMAIN_BLOCKLIST,
      description:
        'Comma-separated email domains to skip (acme.com,bigbank.com). Any attendee on a blocklisted domain SKIPS the meeting.',
      value: '',
      isSecret: false,
    },
    SKIP_INTERNAL_ONLY: {
      universalIdentifier: APPVAR_SKIP_INTERNAL,
      description:
        'When true, meetings whose attendees all share the workspace owner domain are skipped.',
      value: 'true',
      isSecret: false,
    },
    HORIZON_HOURS: {
      universalIdentifier: APPVAR_HORIZON_HOURS,
      description:
        'How far ahead (hours) the cron dispatcher materializes Calls in PENDING_SCHEDULE.',
      value: '24',
      isSecret: false,
    },
    LEAD_MINUTES: {
      universalIdentifier: APPVAR_LEAD_MINUTES,
      description:
        'How early (minutes before scheduled_start) we POST /bots to Vexa.',
      value: '5',
      isSecret: false,
    },
  },

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
  },
});
