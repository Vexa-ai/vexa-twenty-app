import { defineApplication } from 'twenty-sdk/define';

import {
  APP_DESCRIPTION,
  APP_DISPLAY_NAME,
  APP_LOGO_URL,
  APPLICATION_UNIVERSAL_IDENTIFIER,
  APPVAR_TWENTY_API_KEY,
  APPVAR_VEXA_API_BASE,
  APPVAR_VEXA_API_KEY,
  APPVAR_VEXA_DASHBOARD_BASE,
  APPVAR_VEXA_WEBHOOK_SECRET,
  DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: APP_DISPLAY_NAME,
  description: APP_DESCRIPTION,
  logoUrl: APP_LOGO_URL,
  defaultRoleUniversalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,

  // Workspace-level variables. Edited in Twenty's Settings tab,
  // injected as process.env.<KEY> at runtime.
  //
  // Single ask of the operator: paste your Vexa key. Autopilot is
  // implicit on the presence of the key. The two API/dashboard URL
  // overrides exist only for self-hosted Vexa; cloud users leave them
  // at the defaults.
  applicationVariables: {
    VEXA_API_KEY: {
      universalIdentifier: APPVAR_VEXA_API_KEY,
      description:
        'Required. Your Vexa API key (X-API-Key). Get one at https://dashboard.vexa.ai/profile.',
      isSecret: false,
    },
    VEXA_API_BASE: {
      universalIdentifier: APPVAR_VEXA_API_BASE,
      description:
        'Vexa API base URL. Cloud users: leave as default. Self-host: e.g. https://api.your-vexa.example.',
      value: 'https://api.cloud.vexa.ai',
      isSecret: false,
    },
    VEXA_DASHBOARD_BASE: {
      universalIdentifier: APPVAR_VEXA_DASHBOARD_BASE,
      description:
        'Vexa dashboard base URL (used for vexa_url deep links). Cloud users: leave as default.',
      value: 'https://dashboard.vexa.ai',
      isSecret: false,
    },
    TWENTY_API_KEY: {
      universalIdentifier: APPVAR_TWENTY_API_KEY,
      description:
        'Temporary workaround. Paste a workspace API key (Settings → APIs & Webhooks, role: Admin). Why: Twenty 2.2 backend logic functions cannot authenticate to /graphql — the runtime-injected APPLICATION_ACCESS token is rejected and the SDK\'s refresh path requires a browser. Tracked at github.com/twentyhq/twenty/issues/20423. Drop this variable once the platform supports backend app auth.',
      isSecret: true,
    },
    VEXA_WEBHOOK_SECRET: {
      universalIdentifier: APPVAR_VEXA_WEBHOOK_SECRET,
      description:
        'Optional. Shared HMAC secret for Vexa → Twenty webhook delivery. Generate a strong random string (e.g. `openssl rand -hex 32`) and paste here. When set, the cron tells Vexa to POST status updates to https://<your-twenty>/s/vexa-webhook signed with this secret, and Twenty reconciles Call rows in near-real-time instead of waiting for the next cron tick. Leave empty to keep cron-only polling.',
      isSecret: true,
    },
  },
});
