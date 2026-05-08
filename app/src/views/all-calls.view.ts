import { defineView, ViewType } from 'twenty-sdk/define';

import {
  ALL_CALLS_VIEW,
  CALL_DISPATCH_OUTCOME_FIELD,
  CALL_NAME_FIELD,
  CALL_OPPORTUNITY_FIELD,
  CALL_SCHEDULED_START_FIELD,
  CALL_UNIVERSAL_IDENTIFIER,
  CALL_VEXA_URL_FIELD,
} from 'src/constants/universal-identifiers';

export default defineView({
  universalIdentifier: ALL_CALLS_VIEW,
  name: 'All calls',
  objectUniversalIdentifier: CALL_UNIVERSAL_IDENTIFIER,
  type: ViewType.TABLE,
  icon: 'IconPhone',
  position: 0,
  fields: [
    {
      universalIdentifier: '5e0a9d2c-0501-4f01-8f01-1d5f8e3c8001',
      fieldMetadataUniversalIdentifier: CALL_NAME_FIELD,
      position: 0,
      isVisible: true,
      size: 240,
    },
    {
      universalIdentifier: '5e0a9d2c-0502-4f02-8f02-1d5f8e3c8002',
      fieldMetadataUniversalIdentifier: CALL_DISPATCH_OUTCOME_FIELD,
      position: 1,
      isVisible: true,
      size: 140,
    },
    {
      universalIdentifier: '5e0a9d2c-0503-4f03-8f03-1d5f8e3c8003',
      fieldMetadataUniversalIdentifier: CALL_SCHEDULED_START_FIELD,
      position: 2,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier: '5e0a9d2c-0504-4f04-8f04-1d5f8e3c8004',
      fieldMetadataUniversalIdentifier: CALL_OPPORTUNITY_FIELD,
      position: 3,
      isVisible: true,
      size: 220,
    },
    {
      universalIdentifier: '5e0a9d2c-0505-4f05-8f05-1d5f8e3c8005',
      fieldMetadataUniversalIdentifier: CALL_VEXA_URL_FIELD,
      position: 4,
      isVisible: true,
      size: 280,
    },
  ],
});
