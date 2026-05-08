import {
  defineField,
  FieldType,
  RelationType,
} from 'twenty-sdk/define';

import {
  CALL_ATTENDEE_CALL_FIELD,
  CALL_ATTENDEE_UNIVERSAL_IDENTIFIER,
  CALL_ATTENDEES_ON_CALL_FIELD,
  CALL_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// Inverse of CallAttendee.call: Call.attendees (O2M).
export default defineField({
  universalIdentifier: CALL_ATTENDEES_ON_CALL_FIELD,
  objectUniversalIdentifier: CALL_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'attendees',
  label: 'Attendees',
  description:
    'Per-attendee rows for this Call (junction to People). One row per calendar event participant.',
  icon: 'IconUsers',
  relationTargetObjectMetadataUniversalIdentifier:
    CALL_ATTENDEE_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    CALL_ATTENDEE_CALL_FIELD,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
