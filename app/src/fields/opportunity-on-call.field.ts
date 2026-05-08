import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  CALL_OPPORTUNITY_FIELD,
  CALL_UNIVERSAL_IDENTIFIER,
  OPPORTUNITY_CALLS_FIELD,
} from 'src/constants/universal-identifiers';

// Call → Opportunity (M2O). Set when there is exactly one open Opp
// whose contacts overlap the call's attendees. Ambiguous cases stay
// null and surface for manual link in the next release.
export default defineField({
  universalIdentifier: CALL_OPPORTUNITY_FIELD,
  objectUniversalIdentifier: CALL_UNIVERSAL_IDENTIFIER,
  type: FieldType.RELATION,
  name: 'opportunity',
  label: 'Opportunity',
  icon: 'IconTargetArrow',
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.opportunity.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier: OPPORTUNITY_CALLS_FIELD,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'opportunityId',
  },
});
