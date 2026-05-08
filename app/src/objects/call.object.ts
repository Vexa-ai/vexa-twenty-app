import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  CALL_ATTENDEE_EMAILS_FIELD,
  CALL_FAILURE_REASON_FIELD,
  CALL_MEETING_URL_FIELD,
  CALL_NAME_FIELD,
  CALL_PLATFORM_FIELD,
  CALL_PROVIDER_FIELD,
  CALL_SCHEDULED_END_FIELD,
  CALL_SCHEDULED_START_FIELD,
  CALL_STATUS_FIELD,
  CALL_UNIVERSAL_IDENTIFIER,
  CALL_VEXA_MEETING_ID_FIELD,
  CALL_VEXA_URL_FIELD,
} from 'src/constants/universal-identifiers';

// Pure pointer: Vexa stays the source of truth for transcript / media /
// redactions. Twenty owns the join keys + the relations. No transcript
// column, no media column, no summary column — those would only drift.

export enum CallStatus {
  PENDING_SCHEDULE = 'PENDING_SCHEDULE',
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  RESCHEDULED = 'RESCHEDULED',
  SKIPPED = 'SKIPPED',
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
        'Unique join key into Vexa. Combination of platform + native meeting id.',
      icon: 'IconKey',
    },
    {
      universalIdentifier: CALL_VEXA_URL_FIELD,
      type: FieldType.TEXT,
      name: 'vexaUrl',
      label: 'Open in Vexa',
      description:
        'Deep link to the meeting in the Vexa dashboard. Works for live and past meetings.',
      icon: 'IconExternalLink',
    },
    {
      universalIdentifier: CALL_STATUS_FIELD,
      type: FieldType.SELECT,
      name: 'status',
      label: 'Status',
      icon: 'IconStatusChange',
      defaultValue: `'${CallStatus.PENDING_SCHEDULE}'`,
      options: [
        {
          id: '5e0a9d2c-1001-4a01-8a01-1d5f8e3c7b91',
          value: CallStatus.PENDING_SCHEDULE,
          label: 'Pending schedule',
          position: 0,
          color: 'gray',
        },
        {
          id: '5e0a9d2c-1002-4a02-8a02-1d5f8e3c7b92',
          value: CallStatus.SCHEDULED,
          label: 'Scheduled',
          position: 1,
          color: 'blue',
        },
        {
          id: '5e0a9d2c-1003-4a03-8a03-1d5f8e3c7b93',
          value: CallStatus.IN_PROGRESS,
          label: 'In progress',
          position: 2,
          color: 'orange',
        },
        {
          id: '5e0a9d2c-1004-4a04-8a04-1d5f8e3c7b94',
          value: CallStatus.COMPLETED,
          label: 'Completed',
          position: 3,
          color: 'green',
        },
        {
          id: '5e0a9d2c-1005-4a05-8a05-1d5f8e3c7b95',
          value: CallStatus.FAILED,
          label: 'Failed',
          position: 4,
          color: 'red',
        },
        {
          id: '5e0a9d2c-1006-4a06-8a06-1d5f8e3c7b96',
          value: CallStatus.CANCELLED,
          label: 'Cancelled',
          position: 5,
          color: 'gray',
        },
        {
          id: '5e0a9d2c-1007-4a07-8a07-1d5f8e3c7b97',
          value: CallStatus.RESCHEDULED,
          label: 'Rescheduled',
          position: 6,
          color: 'gray',
        },
        {
          id: '5e0a9d2c-1008-4a08-8a08-1d5f8e3c7b98',
          value: CallStatus.SKIPPED,
          label: 'Skipped',
          position: 7,
          color: 'gray',
        },
      ],
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
      universalIdentifier: CALL_FAILURE_REASON_FIELD,
      type: FieldType.TEXT,
      name: 'failureReason',
      label: 'Failure reason',
      description:
        'Populated when status=FAILED. Silent failures kill trust; surface every miss.',
      icon: 'IconAlertCircle',
    },
    {
      universalIdentifier: CALL_ATTENDEE_EMAILS_FIELD,
      type: FieldType.RAW_JSON,
      name: 'attendeeEmails',
      label: 'Attendee emails',
      description:
        'Raw list of attendee emails captured from the calendar event. Person resolution happens in the webhook handler.',
      icon: 'IconAt',
    },
  ],
});
