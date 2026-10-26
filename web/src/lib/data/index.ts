/**
 * Server data layer (docs/ARCHITECTURE.md §4.3). Every function reads
 * Postgres through Drizzle and is cached under the "dataset" tag; results are
 * plain JSON-serialisable rows from lib/contract/db.ts.
 */
export { DATASET_TAG } from "./cache";
export { getDatasetMeta } from "./meta";
export { getWinModel } from "./models";
export { getLatestResults, getMatch, listMatches, listMatchYears, listReplayable } from "./matches";
export { getReplay, getReplayContext } from "./replays";
export { getLeaders, getPlayerNames, getPlayerProfile, getPlayerSummary, listPlayers } from "./players";
export { getHeadToHead, getTeam, getTeamLabels, listTeams } from "./teams";
export { buildMatchupPlan, buildPlayerDossier } from "./strategy";
