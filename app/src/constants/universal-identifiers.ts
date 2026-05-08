export const APP_DISPLAY_NAME = 'Vexa';
export const APP_DESCRIPTION =
  'Auto-capture meetings into the right Opportunity via Vexa.';
export const APP_LOGO_URL = 'https://dashboard.vexa.ai/icons/vexalight.svg';

// app + role
export const APPLICATION_UNIVERSAL_IDENTIFIER =
  '8c9e0d41-4cb5-4c9a-b266-6071b6a29c25';
export const DEFAULT_ROLE_UNIVERSAL_IDENTIFIER =
  'c7300aee-e3a7-45e1-9a31-2714eb93f6bf';

// Call object + its fields
export const CALL_UNIVERSAL_IDENTIFIER =
  '5e0a9d2c-0001-4a01-8a01-1d5f8e3c7b01';
export const CALL_NAME_FIELD =
  '5e0a9d2c-0002-4a02-8a02-1d5f8e3c7b02';
export const CALL_VEXA_MEETING_ID_FIELD =
  '5e0a9d2c-0003-4a03-8a03-1d5f8e3c7b03';
export const CALL_VEXA_URL_FIELD =
  '5e0a9d2c-0004-4a04-8a04-1d5f8e3c7b04';
// Renamed in webhook-removal pass: status FSM → dispatchOutcome (3 states),
// failureReason → dispatchReason. Universal identifiers preserved so
// Twenty's migration recognizes them as renames, not drops.
export const CALL_DISPATCH_OUTCOME_FIELD =
  '5e0a9d2c-0005-4a05-8a05-1d5f8e3c7b05';
export const CALL_PROVIDER_FIELD =
  '5e0a9d2c-0006-4a06-8a06-1d5f8e3c7b06';
export const CALL_PLATFORM_FIELD =
  '5e0a9d2c-0007-4a07-8a07-1d5f8e3c7b07';
export const CALL_MEETING_URL_FIELD =
  '5e0a9d2c-0008-4a08-8a08-1d5f8e3c7b08';
export const CALL_SCHEDULED_START_FIELD =
  '5e0a9d2c-0009-4a09-8a09-1d5f8e3c7b09';
export const CALL_SCHEDULED_END_FIELD =
  '5e0a9d2c-000a-4a0a-8a0a-1d5f8e3c7b0a';
export const CALL_DISPATCH_REASON_FIELD =
  '5e0a9d2c-000b-4a0b-8a0b-1d5f8e3c7b0b';
export const CALL_ATTENDEE_EMAILS_FIELD =
  '5e0a9d2c-000c-4a0c-8a0c-1d5f8e3c7b0c';

// relation fields (one pair per related standard object)
export const CALL_OPPORTUNITY_FIELD =
  '5e0a9d2c-0101-4b01-8b01-1d5f8e3c7c01';
export const OPPORTUNITY_CALLS_FIELD =
  '5e0a9d2c-0102-4b02-8b02-1d5f8e3c7c02';

export const CALL_COMPANY_FIELD =
  '5e0a9d2c-0103-4b03-8b03-1d5f8e3c7c03';
export const COMPANY_CALLS_FIELD =
  '5e0a9d2c-0104-4b04-8b04-1d5f8e3c7c04';

export const CALL_CALENDAR_EVENT_FIELD =
  '5e0a9d2c-0105-4b05-8b05-1d5f8e3c7c05';
export const CALENDAR_EVENT_CALLS_FIELD =
  '5e0a9d2c-0106-4b06-8b06-1d5f8e3c7c06';

// logic functions
//
// Single trigger: react to Twenty's calendarEvent.created database
// event. No cron, no polling, no race with the calendar sync — runs
// the moment a CalendarEvent row appears in the workspace.
// Universal identifier preserved across the cron→database-event
// rename so Twenty migrates the function in place.
export const VEXA_ON_CALENDAR_EVENT_LF =
  '5e0a9d2c-0202-4c02-8c02-1d5f8e3c7d02';

// applicationVariables — workspace-level, edited in Twenty's Settings tab,
// injected as process.env.<KEY> at logic-function runtime.
export const APPVAR_VEXA_API_KEY =
  '5e0a9d2c-0301-4d01-8d01-1d5f8e3c7e01';
export const APPVAR_VEXA_API_BASE =
  '5e0a9d2c-0302-4d02-8d02-1d5f8e3c7e02';
export const APPVAR_VEXA_DASHBOARD_BASE =
  '5e0a9d2c-0303-4d03-8d03-1d5f8e3c7e03';

// view + navigation
export const ALL_CALLS_VIEW =
  '5e0a9d2c-0401-4e01-8e01-1d5f8e3c7f01';
export const CALLS_NAV_MENU_ITEM =
  '5e0a9d2c-0402-4e02-8e02-1d5f8e3c7f02';
