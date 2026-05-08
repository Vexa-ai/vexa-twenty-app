import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  CALL_ATTENDEE_EMAILS_FIELD,
  CALL_DISPATCH_OUTCOME_FIELD,
  CALL_DISPATCH_REASON_FIELD,
  CALL_MEETING_URL_FIELD,
  CALL_NAME_FIELD,
  CALL_PLATFORM_FIELD,
  CALL_PROVIDER_FIELD,
  CALL_SCHEDULED_END_FIELD,
  CALL_SCHEDULED_START_FIELD,
  CALL_UNIVERSAL_IDENTIFIER,
  CALL_VEXA_MEETING_ID_FIELD,
  CALL_VEXA_URL_FIELD,
} from 'src/constants/universal-identifiers';

// Pure pointer. Twenty owns the join keys + the relationships. State
// lives in Vexa. To find out what actually happened on a call, click
// vexa_url. We do NOT mirror status, transcript, media, or summaries
// — that's by design. See README.md "pure pointer, not mirror".

// Calendar mirror: every CalendarEvent in the window becomes a Call.
// dispatchOutcome reflects what (if anything) we did about the bot.
export enum CallDispatchOutcome {
  PENDING = 'PENDING',           // eligible (future + Meet URL), not yet dispatched
  SCHEDULED = 'SCHEDULED',       // bot dispatched to Vexa, vexa_url valid
  ERROR = 'ERROR',               // dispatch failed (Vexa API error)
  NOT_ELIGIBLE = 'NOT_ELIGIBLE', // no Meet URL / past event / cancelled — see dispatchReason
}

export enum CallProvider {
  VEXA = 'VEXA',
  MEETING_BAAS = 'MEETING_BAAS',
  MANUAL = 'MANUAL',
}

export enum CallPlatform {
  GOOGLE_MEET = 'GOOGLE_MEET',
  ZOOM = 'ZOOM',
  TEAMS = 'TEAMS',
  OTHER = 'OTHER',
}

export default defineObject({
  universalIdentifier: CALL_UNIVERSAL_IDENTIFIER,
  nameSingular: 'call',
  namePlural: 'calls',
  labelSingular: 'Call',
  labelPlural: 'Calls',
  description:
    'A meeting captured by Vexa, linked to the deal, contacts, and company. Pointer to the source of truth in Vexa.',
  icon: 'IconPhone',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier: CALL_NAME_FIELD,
  fields: [
    {
      universalIdentifier: CALL_NAME_FIELD,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Title',
      description: 'Mirrors the calendar event summary.',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: CALL_VEXA_MEETING_ID_FIELD,
      type: FieldType.TEXT,
      name: 'vexaMeetingId',
      label: 'Vexa meeting ID',
      description:
        'Returned by POST /bots at dispatch time. Empty for SKIPPED or ERROR rows.',
      icon: 'IconKey',
    },
    {
      universalIdentifier: CALL_VEXA_URL_FIELD,
      type: FieldType.TEXT,
      name: 'vexaUrl',
      label: 'Open in Vexa',
      description:
        'Deep link to the meeting in the Vexa dashboard. Click to see live or past state.',
      icon: 'IconExternalLink',
    },
    {
      universalIdentifier: CALL_DISPATCH_OUTCOME_FIELD,
      type: FieldType.SELECT,
      name: 'dispatchOutcome',
      label: 'Dispatch',
      description:
        'What we did when this calendar event came due. SCHEDULED = bot dispatched. SKIPPED = policy rejected. ERROR = dispatch failed.',
      icon: 'IconStatusChange',
      defaultValue: `'${CallDispatchOutcome.PENDING}'`,
      options: [
        {
          id: '5e0a9d2c-1004-4a04-8a04-1d5f8e3c7b94',
          value: CallDispatchOutcome.PENDING,
          label: 'Pending',
          position: 0,
          color: 'yellow',
        },
        {
          id: '5e0a9d2c-1001-4a01-8a01-1d5f8e3c7b91',
          value: CallDispatchOutcome.SCHEDULED,
          label: 'Scheduled',
          position: 1,
          color: 'green',
        },
        {
          id: '5e0a9d2c-1003-4a03-8a03-1d5f8e3c7b93',
          value: CallDispatchOutcome.ERROR,
          label: 'Error',
          position: 2,
          color: 'red',
        },
        {
          id: '5e0a9d2c-1005-4a05-8a05-1d5f8e3c7b95',
          value: CallDispatchOutcome.NOT_ELIGIBLE,
          label: 'Not eligible',
          position: 3,
          color: 'gray',
        },
      ],
    },
    {
      universalIdentifier: CALL_DISPATCH_REASON_FIELD,
      type: FieldType.TEXT,
      name: 'dispatchReason',
      label: 'Dispatch reason',
      description:
        'Policy reason when SKIPPED (e.g. BLOCKLISTED_DOMAIN). Error message when ERROR. Empty when SCHEDULED.',
      icon: 'IconAlertCircle',
    },
    {
      universalIdentifier: CALL_PROVIDER_FIELD,
      type: FieldType.SELECT,
      name: 'provider',
      label: 'Provider',
      icon: 'IconPlug',
      defaultValue: `'${CallProvider.VEXA}'`,
      options: [
        {
          id: '5e0a9d2c-1101-4a01-8a01-1d5f8e3c7c91',
          value: CallProvider.VEXA,
          label: 'Vexa',
          position: 0,
          color: 'blue',
        },
        {
          id: '5e0a9d2c-1102-4a02-8a02-1d5f8e3c7c92',
          value: CallProvider.MEETING_BAAS,
          label: 'Meeting BaaS',
          position: 1,
          color: 'gray',
        },
        {
          id: '5e0a9d2c-1103-4a03-8a03-1d5f8e3c7c93',
          value: CallProvider.MANUAL,
          label: 'Manual',
          position: 2,
          color: 'gray',
        },
      ],
    },
    {
      universalIdentifier: CALL_PLATFORM_FIELD,
      type: FieldType.SELECT,
      name: 'platform',
      label: 'Platform',
      icon: 'IconBrandGoogle',
      defaultValue: `'${CallPlatform.OTHER}'`,
      options: [
        {
          id: '5e0a9d2c-1201-4a01-8a01-1d5f8e3c7d91',
          value: CallPlatform.GOOGLE_MEET,
          label: 'Google Meet',
          position: 0,
          color: 'green',
        },
        {
          id: '5e0a9d2c-1202-4a02-8a02-1d5f8e3c7d92',
          value: CallPlatform.ZOOM,
          label: 'Zoom',
          position: 1,
          color: 'blue',
        },
        {
          id: '5e0a9d2c-1203-4a03-8a03-1d5f8e3c7d93',
          value: CallPlatform.TEAMS,
          label: 'Microsoft Teams',
          position: 2,
          color: 'purple',
        },
        {
          id: '5e0a9d2c-1204-4a04-8a04-1d5f8e3c7d94',
          value: CallPlatform.OTHER,
          label: 'Other',
          position: 3,
          color: 'gray',
        },
      ],
    },
    {
      universalIdentifier: CALL_MEETING_URL_FIELD,
      type: FieldType.TEXT,
      name: 'meetingUrl',
      label: 'Meeting URL',
      description: 'Join URL the bot was dispatched to.',
      icon: 'IconLink',
    },
    {
      universalIdentifier: CALL_SCHEDULED_START_FIELD,
      type: FieldType.DATE_TIME,
      name: 'scheduledStart',
      label: 'Scheduled start',
      icon: 'IconCalendarTime',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier: CALL_SCHEDULED_END_FIELD,
      type: FieldType.DATE_TIME,
      name: 'scheduledEnd',
      label: 'Scheduled end',
      icon: 'IconCalendarTime',
      isNullable: true,
      defaultValue: null,
    },
    {
      universalIdentifier: CALL_ATTENDEE_EMAILS_FIELD,
      type: FieldType.RAW_JSON,
      name: 'attendeeEmails',
      label: 'Attendee emails',
      description:
        'Raw list of attendee emails captured from the calendar event. Person resolution is left for the agent (later release).',
      icon: 'IconAt',
    },
  ],
});
