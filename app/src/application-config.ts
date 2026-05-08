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

  // Single required setting. Install → paste token → done. Autopilot
  // is implicit: a key set is consent. Blocklist / skip-internal /
  // horizon / lead are hardcoded defaults in cron-dispatch.ts; we'll
  // re-add knobs only when an actual user asks for them.
  serverVariables: {
    VEXA_API_KEY: {
      description:
        'Your Vexa API key (X-API-Key). Get one at https://dashboard.vexa.ai/profile.',
      isSecret: false,
      isRequired: true,
    },

    // Self-hosted Vexa only. Leave blank for the cloud.
    VEXA_API_BASE: {
      description:
        'Vexa API base URL. Defaults to https://api.vexa.ai (cloud).',
      isSecret: false,
      isRequired: false,
    },
    VEXA_DASHBOARD_BASE: {
      description:
        'Vexa dashboard base URL. Defaults to https://dashboard.vexa.ai (cloud).',
      isSecret: false,
      isRequired: false,
    },
  },
});
