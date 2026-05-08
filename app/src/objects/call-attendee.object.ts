import { defineObject, FieldType } from 'twenty-sdk/define';

import {
  CALL_ATTENDEE_DISPLAY_NAME_FIELD,
  CALL_ATTENDEE_EMAIL_FIELD,
  CALL_ATTENDEE_NAME_FIELD,
  CALL_ATTENDEE_RESPONSE_STATUS_FIELD,
  CALL_ATTENDEE_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

// Junction object: one row per attendee per Call. The Person link
// (defined in fields/person-on-call-attendee.field.ts) is nullable
// so external attendees with no Person record still show up.
export enum CallAttendeeResponseStatus {
  NEEDS_ACTION = 'NEEDS_ACTION',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  TENTATIVE = 'TENTATIVE',
}

export default defineObject({
  universalIdentifier: CALL_ATTENDEE_UNIVERSAL_IDENTIFIER,
  nameSingular: 'callAttendee',
  namePlural: 'callAttendees',
  labelSingular: 'Call attendee',
  labelPlural: 'Call attendees',
  description:
    'One attendee on one Call. Junction between Call and Person; the Person link is nullable when the email did not match a Person record.',
  icon: 'IconUsers',
  isSearchable: true,
  labelIdentifierFieldMetadataUniversalIdentifier:
    CALL_ATTENDEE_NAME_FIELD,
  fields: [
    {
      universalIdentifier: CALL_ATTENDEE_NAME_FIELD,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      description:
        'Display label for this attendee row. Set to displayName or email at create time so list views are readable.',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: CALL_ATTENDEE_EMAIL_FIELD,
      type: FieldType.TEXT,
      name: 'email',
      label: 'Email',
      description: 'Attendee email from the calendar event participant.',
      icon: 'IconAt',
    },
    {
      universalIdentifier: CALL_ATTENDEE_DISPLAY_NAME_FIELD,
      type: FieldType.TEXT,
      name: 'displayName',
      label: 'Display name',
      description:
        'Display name from the calendar event (often empty for external attendees).',
      icon: 'IconUser',
    },
    {
      universalIdentifier: CALL_ATTENDEE_RESPONSE_STATUS_FIELD,
      type: FieldType.SELECT,
      name: 'responseStatus',
      label: 'Response',
      icon: 'IconCheck',
      defaultValue: `'${CallAttendeeResponseStatus.NEEDS_ACTION}'`,
      options: [
        {
          id: '5e0a9d2c-1301-4a01-8a01-1d5f8e3c8301',
          value: CallAttendeeResponseStatus.NEEDS_ACTION,
          label: 'Needs action',
          position: 0,
          color: 'gray',
        },
        {
          id: '5e0a9d2c-1302-4a02-8a02-1d5f8e3c8302',
          value: CallAttendeeResponseStatus.ACCEPTED,
          label: 'Accepted',
          position: 1,
          color: 'green',
        },
        {
          id: '5e0a9d2c-1303-4a03-8a03-1d5f8e3c8303',
          value: CallAttendeeResponseStatus.DECLINED,
          label: 'Declined',
          position: 2,
          color: 'red',
        },
        {
          id: '5e0a9d2c-1304-4a04-8a04-1d5f8e3c8304',
          value: CallAttendeeResponseStatus.TENTATIVE,
          label: 'Tentative',
          position: 3,
          color: 'orange',
        },
      ],
    },
  ],
});
