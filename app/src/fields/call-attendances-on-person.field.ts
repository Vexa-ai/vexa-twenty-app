import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  CALL_ATTENDANCES_ON_PERSON_FIELD,
  CALL_ATTENDEE_PERSON_FIELD,
  CALL_ATTENDEE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// Inverse: Person.callAttendances → all CallAttendee rows where this
// Person was an attendee. Lets users navigate Person → calls they
// were on (via Person.callAttendances[].call).
export default defineField({
  universalIdentifier: CALL_ATTENDANCES_ON_PERSON_FIELD,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'callAttendances',
  label: 'Calls',
  description:
    'Calls this Person attended (or was invited to). Each row links to the Call via the junction.',
  icon: 'IconPhone',
  relationTargetObjectMetadataUniversalIdentifier:
    CALL_ATTENDEE_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier:
    CALL_ATTENDEE_PERSON_FIELD,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
