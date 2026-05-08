// Resolve a CalendarEvent's participants → Company → Opportunity.
//
// We don't re-match by email. Twenty's calendar sync already linked
// each CalendarEventParticipant to a Person (or left it null when no
// match exists). Just follow the join.

import type { CoreApiClient } from 'twenty-client-sdk/core';

// Stages we treat as "still in flight." CUSTOMER = won; everything
// else is open. Twenty has no closed-lost stage.
const ACTIVE_OPP_STAGES = ['NEW', 'SCREENING', 'MEETING', 'PROPOSAL'];

export type ParticipantPerson = {
  personId: string | null;
  companyId: string | null;
};

export type Linkage = {
  companyId: string | null;
  opportunityId: string | null;
};

// Pick the company most participants belong to. Tie → null
// (ambiguity is a feature; wrong-link is worse than no-link).
export const resolveLinkage = async (
  client: CoreApiClient,
  participants: ParticipantPerson[],
): Promise<Linkage> => {
  const votes = new Map<string, number>();
  for (const p of participants) {
    if (!p.companyId) continue;
    votes.set(p.companyId, (votes.get(p.companyId) ?? 0) + 1);
  }
  const companyId = pickMajority(votes);

  if (!companyId) {
    return { companyId: null, opportunityId: null };
  }

  const opps = (await (client.query({
    opportunities: {
      __args: {
        filter: {
          and: [
            { companyId: { eq: companyId } },
            { stage: { in: ACTIVE_OPP_STAGES } },
          ],
        } as any,
        first: 5,
      } as any,
      edges: { node: { id: true, stage: true } as any },
    },
  } as any) as Promise<any>).catch(() => null)) as any;

  const oppEdges: { node: { id: string } }[] =
    opps?.opportunities?.edges ?? [];
  const opportunityId = oppEdges.length === 1 ? oppEdges[0].node.id : null;

  return { companyId, opportunityId };
};

const pickMajority = (votes: Map<string, number>): string | null => {
  let bestKey: string | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [k, n] of votes) {
    if (n > bestCount) {
      bestKey = k;
      bestCount = n;
      tied = false;
    } else if (n === bestCount) {
      tied = true;
    }
  }
  return tied ? null : bestKey;
};
