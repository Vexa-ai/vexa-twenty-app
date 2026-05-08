import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  CALL_ATTENDEE_CALL_FIELD,
  CALL_ATTENDEE_UNIVERSAL_IDENTIFIER,
  CALL_ATTENDEES_ON_CALL_FIELD,
  CALL_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// CallAttendee → Call (M2O). When the Call is deleted, cascade.
export default defineField({
  universalIdentifier: CALL_ATTENDEE_CALL_FIELD,
  objectUniversalIdentifier: CALL_ATTENDEE_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'call',
  label: 'Call',
  icon: 'IconPhone',
  relationTargetObjectMetadataUniversalIdentifier: CALL_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    CALL_ATTENDEES_ON_CALL_FIELD,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.CASCADE,
    joinColumnName: 'callId',
  },
});
