import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  CALL_OPPORTUNITY_FIELD,
  CALL_UNIVERSAL_IDENTIFIER,
  OPPORTUNITY_CALLS_FIELD,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: OPPORTUNITY_CALLS_FIELD,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  type: FieldType.RELATION,
  name: 'calls',
  label: 'Calls',
  description: 'Vexa-captured meetings linked to this opportunity.',
  icon: 'IconPhone',
  relationTargetObjectMetadataUniversalIdentifier: CALL_UNIVERSAL_IDENTIFIER,
  relationTargetFieldMetadataUniversalIdentifier: CALL_OPPORTUNITY_FIELD,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
