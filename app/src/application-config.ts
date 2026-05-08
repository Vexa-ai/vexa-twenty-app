import { defineApplication } from 'twenty-sdk/define';

import {
  APP_DESCRIPTION,
  APP_DISPLAY_NAME,
  APPLICATION_UNIVERSAL_IDENTIFIER,
  APPVAR_VEXA_API_BASE,
  APPVAR_VEXA_API_KEY,
  APPVAR_VEXA_DASHBOARD_BASE,
  DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: APP_DISPLAY_NAME,
  description: APP_DESCRIPTION,
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
  },
});
