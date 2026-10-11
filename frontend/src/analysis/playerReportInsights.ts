import type { TacticalReportResponse } from "../api/tacticalReport.ts";

type ReportItem = TacticalReportResponse["observations"][number] | TacticalReportResponse["recommendations"][number];
type EvidenceRef = TacticalReportResponse["evidence_refs"][number];

export function playerReportSnapshotLabel(isPrevious: boolean): string | null {
  return isPrevious ? "Earlier report snapshot" : null;
}

function playerIdsForClaim(claim: ReportItem["claim"]): number[] | null {
  const raw = claim as Record<string, unknown>;
  let ids: unknown[];
  if (raw.claim_type === "historical_measurement") {
    if (Object.hasOwn(raw, "player_ids")) return null;
    ids = [raw.player_id];
  } else if (raw.claim_type === "scenario_metric" || raw.claim_type === "scenario_insight") {
    if (Object.hasOwn(raw, "player_id") || !Array.isArray(raw.player_ids)) return null;
    ids = raw.player_ids;
  } else {
    return null;
  }
  if (!ids.length || ids.some((id) => !Number.isSafeInteger(id) || (id as number) <= 0)) return null;
  return [...new Set(ids as number[])].sort((a, b) => a - b);
}

function playerIdsForEvidence(evidence: EvidenceRef): number[] | null {
  const ids: number[] = [];
  if (evidence.player_id != null) ids.push(evidence.player_id);
  if (evidence.player_ids.length) ids.push(...evidence.player_ids);
  if (!ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return null;
  return [...new Set(ids)].sort((a, b) => a - b);
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((item, index) => sameJsonValue(item, right[index]));
  }
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameJsonValue(leftRecord[key], rightRecord[key]));
}

function evidenceMatchesClaim(claim: Record<string, unknown>, evidence: EvidenceRef, claimPlayerIds: number[]): boolean {
  const expectedKind = claim.claim_type === "historical_measurement"
    ? "historical_measurement"
    : claim.claim_type === "scenario_insight" ? "scenario_insight" : "scenario_metric";
  if (evidence.kind !== expectedKind) return false;
  const evidencePlayerIds = playerIdsForEvidence(evidence);
  if (!evidencePlayerIds || evidencePlayerIds.length !== claimPlayerIds.length || evidencePlayerIds.some((id, index) => id !== claimPlayerIds[index])) return false;
  if (Object.hasOwn(claim, "team_id") && evidence.team_id !== claim.team_id) return false;
  if (Object.hasOwn(claim, "side") && evidence.side !== claim.side) return false;
  if (Object.hasOwn(claim, "match_id") && evidence.match_id !== claim.match_id) return false;
  if (claim.claim_type === "historical_measurement") {
    return typeof claim.metric_field === "string" && evidence.source_key === claim.metric_field && evidence.value === claim.value;
  }
  if (claim.claim_type === "scenario_metric") {
    return typeof claim.metric_key === "string"
      && evidence.source_key === claim.metric_key
      && sameJsonValue(evidence.value, claim.value);
  }
  if (claim.claim_type !== "scenario_insight" || typeof claim.category !== "string" || typeof claim.metric_key !== "string") return false;
  if (evidence.source_key !== claim.category || !evidence.value || typeof evidence.value !== "object") return false;
  const insight = evidence.value as Record<string, unknown>;
  const relatedMetric = insight.relatedMetric;
  const zone = insight.zone && typeof insight.zone === "object" ? insight.zone as Record<string, unknown> : {};
  const insightPlayerIds = Array.isArray(insight.playerIds) ? insight.playerIds : [];
  return insight.category === claim.category
    && insight.teamSide === claim.side
    && sameJsonValue([...insightPlayerIds].sort((a, b) => Number(a) - Number(b)), claimPlayerIds)
    && Boolean(relatedMetric && typeof relatedMetric === "object")
    && (relatedMetric as Record<string, unknown>).key === claim.metric_key
    && sameJsonValue((relatedMetric as Record<string, unknown>).value, claim.value)
    && (zone.row ?? null) === (claim.zone_row ?? null)
    && (zone.column ?? null) === (claim.zone_column ?? null);
}

/** Only return report items whose structured claim and every linked evidence ref explicitly agree on player IDs. */
export function getPlayerReportInsights(report: TacticalReportResponse, playerId: number) {
  const evidenceById = new Map(report.evidence_refs.map((item) => [item.id, item]));
  const candidates: ReportItem[] = [...report.observations, ...report.recommendations];
  const seenHistoricalMeasurementEvidence = new Set<string>();
  return candidates.flatMap((item) => {
    const claim = item.claim as Record<string, unknown>;
    const claimIds = playerIdsForClaim(item.claim);
    if (!claimIds?.includes(playerId) || typeof claim.evidence_id !== "string" || !item.evidence_ids.includes(claim.evidence_id)) return [];
    const evidence = item.evidence_ids.map((id) => evidenceById.get(id));
    if (evidence.some((entry) => !entry)) return [];
    const refs = evidence as EvidenceRef[];
    if (refs.some((entry) => !evidenceMatchesClaim(claim, entry, claimIds))) return [];
    if (claim.claim_type === "historical_measurement") {
      if (seenHistoricalMeasurementEvidence.has(claim.evidence_id)) return [];
      seenHistoricalMeasurementEvidence.add(claim.evidence_id);
    }
    return [{ item, evidence: refs }];
  });
}
