import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  CALL_ATTENDANCES_ON_PERSON_FIELD,
  CALL_ATTENDEE_PERSON_FIELD,
  CALL_ATTENDEE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// CallAttendee → Person (M2O). Nullable: external attendees with no
// Person record keep their email + displayName on the row.
export default defineField({
  universalIdentifier: CALL_ATTENDEE_PERSON_FIELD,
  objectUniversalIdentifier: CALL_ATTENDEE_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'person',
  label: 'Person',
  icon: 'IconUser',
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier:
    CALL_ATTENDANCES_ON_PERSON_FIELD,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'personId',
  },
});
