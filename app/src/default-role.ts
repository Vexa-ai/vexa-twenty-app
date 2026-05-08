import { defineRole } from 'twenty-sdk/define';

import {
  APP_DISPLAY_NAME,
  CALL_ATTENDEE_UNIVERSAL_IDENTIFIER,
  CALL_UNIVERSAL_IDENTIFIER,
  DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// The cron handler reads CalendarEvent / Person / Company / Opportunity
// (workspace data — covered by canReadAllObjectRecords) and writes Call
// rows. canUpdateAllObjectRecords is documented to cover create+update
// in Twenty's permission model, but to be explicit (and survive any
// future tightening), grant Call-specific RW via objectPermissions.
export default defineRole({
  universalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  label: `${APP_DISPLAY_NAME} default function role`,
  description: `${APP_DISPLAY_NAME} default function role`,
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: true,
  canSoftDeleteAllObjectRecords: true,
  canDestroyAllObjectRecords: false,
  objectPermissions: [
    {
      objectUniversalIdentifier: CALL_UNIVERSAL_IDENTIFIER,
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: true,
      canDestroyObjectRecords: false,
    },
    {
      objectUniversalIdentifier: CALL_ATTENDEE_UNIVERSAL_IDENTIFIER,
      canReadObjectRecords: true,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: true,
      canDestroyObjectRecords: false,
    },
  ],
});
