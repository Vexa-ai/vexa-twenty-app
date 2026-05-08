import {
  DatabaseEventPayload,
  defineLogicFunction,
  ObjectRecordCreateEvent,
} from 'twenty-sdk/define';

import { VEXA_ON_CALENDAR_EVENT_CREATED_LF } from 'src/constants/universal-identifiers';
import {
  CalendarEventRecord,
  DispatchResult,
  handleCalendarEvent,
} from 'src/lib/dispatch-handler';

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordCreateEvent<CalendarEventRecord>>,
): Promise<DispatchResult> =>
  handleCalendarEvent(payload.properties?.after, payload.recordId);

export default defineLogicFunction({
  universalIdentifier: VEXA_ON_CALENDAR_EVENT_CREATED_LF,
  name: 'vexa-on-calendar-event-created',
  description:
    'Reacts to calendarEvent.created. Dispatches a Vexa bot for any future event with a Meet/Zoom/Teams URL.',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'calendarEvent.created',
  },
});
