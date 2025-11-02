export type TeamId = 1 | 2;
export type TeamIdOrName = 1 | 2 | "red" | "blue";

export const getTeamIdFromName = (team: TeamIdOrName): TeamId => {
  if (team === "red") return 1;
  if (team === "blue") return 2;
  return team;
};

export const getTeamNameFromId = (team: TeamId): "red" | "blue" => {
  if (team === 1) return "red";
  if (team === 2) return "blue";
  throw new Error(`Invalid team ID: ${team}`);
};
