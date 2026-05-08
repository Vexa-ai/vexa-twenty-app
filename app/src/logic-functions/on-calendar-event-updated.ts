import {
  DatabaseEventPayload,
  defineLogicFunction,
  ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';

import { VEXA_ON_CALENDAR_EVENT_UPDATED_LF } from 'src/constants/universal-identifiers';
import {
  CalendarEventRecord,
  DispatchResult,
  handleCalendarEvent,
} from 'src/lib/dispatch-handler';

// Catches reschedules: user moves a meeting in Google, Twenty syncs
// the change, .updated fires. The shared handler is idempotent on
// calendarEventId, so re-firing on every minor update is safe.
const handler = async (
  payload: DatabaseEventPayload<ObjectRecordUpdateEvent<CalendarEventRecord>>,
): Promise<DispatchResult> =>
  handleCalendarEvent(payload.properties?.after, payload.recordId);

export default defineLogicFunction({
  universalIdentifier: VEXA_ON_CALENDAR_EVENT_UPDATED_LF,
  name: 'vexa-on-calendar-event-updated',
  description:
    'Reacts to calendarEvent.updated. Same dispatch path as .created — covers reschedules and any case where Twenty issues an UPDATE rather than INSERT.',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'calendarEvent.updated',
  },
});
