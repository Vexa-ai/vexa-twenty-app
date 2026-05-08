import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  CALL_COMPANY_FIELD,
  CALL_UNIVERSAL_IDENTIFIER,
  COMPANY_CALLS_FIELD,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: COMPANY_CALLS_FIELD,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  type: FieldType.RELATION,
  name: 'calls',
  label: 'Calls',
  icon: 'IconPhone',
  relationTargetObjectMetadataUniversalIdentifier: CALL_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: CALL_COMPANY_FIELD,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
