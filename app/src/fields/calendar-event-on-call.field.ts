import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  CALENDAR_EVENT_CALLS_FIELD,
  CALL_CALENDAR_EVENT_FIELD,
  CALL_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// Call → CalendarEvent (M2O). One Call per recorded attempt; recurring
// series naturally become N Calls. Rescheduled events still produce a
// single Call when the bot actually attended.
export default defineField({
  universalIdentifier: CALL_CALENDAR_EVENT_FIELD,
  objectUniversalIdentifier: CALL_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'calendarEvent',
  label: 'Calendar event',
  icon: 'IconCalendarEvent',
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.calendarEvent.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier: CALENDAR_EVENT_CALLS_FIELD,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'calendarEventId',
  },
});
