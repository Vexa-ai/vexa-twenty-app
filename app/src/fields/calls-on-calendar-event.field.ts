import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  CALENDAR_EVENT_CALLS_FIELD,
  CALL_CALENDAR_EVENT_FIELD,
  CALL_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: CALENDAR_EVENT_CALLS_FIELD,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.calendarEvent.universalIdentifier,
  type: FieldType.RELATION,
  name: 'calls',
  label: 'Calls',
  icon: 'IconPhone',
  relationTargetObjectMetadataUniversalIdentifier: CALL_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: CALL_CALENDAR_EVENT_FIELD,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
