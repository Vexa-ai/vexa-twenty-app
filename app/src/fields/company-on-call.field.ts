import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  CALL_COMPANY_FIELD,
  CALL_UNIVERSAL_IDENTIFIER,
  COMPANY_CALLS_FIELD,
} from 'src/constants/universal-identifiers';

// Call → Company (M2O). Majority vote across attendee People.
export default defineField({
  universalIdentifier: CALL_COMPANY_FIELD,
  objectUniversalIdentifier: CALL_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'company',
  label: 'Company',
  icon: 'IconBuildingSkyscraper',
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier: COMPANY_CALLS_FIELD,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'companyId',
  },
});
