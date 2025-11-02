import axios, { AxiosError, AxiosInstance } from "axios";
import { err, ok, ResultAsync } from "neverthrow";
import { getTeamIdFromName } from "../utils/game";

export default class RoomAPI {
  private axiosInstance: AxiosInstance;

  constructor(authorizationKey: string, apiUrl: string) {
    this.axiosInstance = axios.create({
      baseURL: apiUrl,
      headers: {
        Authorization: `Bearer ${authorizationKey}`,
        Accept: "application/json",
      },
    });
  }

  private get<T>(url: string) {
    return ResultAsync.fromPromise(
      this.axiosInstance.get<T>(url).then((response) => {
        return ok({
          type: 200 as const,
          data: response.data,
        });
      }),
      (error) => {
        if (error instanceof AxiosError) {
          return err({
            type: error.response?.status,
            data: {
              message: error.response?.data.message || "Unknown error",
            },
          });
        }

        return err({
          type: undefined,
          data: {
            message: "Unknown error",
          },
        });
      },
    );
  }

  private post<T>(url: string, data: unknown) {
    return ResultAsync.fromPromise(
      this.axiosInstance.post<T>(url, data).then((response) => {
        return ok({
          type: 200 as const,
          data: response.data,
        });
      }),
      (error) => {
        if (error instanceof AxiosError) {
          return err({
            type: error.response?.status,
            data: {
              message: error.response?.data.message || "Unknown error",
            },
          });
        }

        return err({
          type: undefined,
          data: {
            message: "Unknown error",
          },
        });
      },
    );
  }

  public ping() {
    return this.get<{
      message: string;
    }>(`/ping`);
  }

  public confirmPlayerByPassword(
    name: string,
    password: string,
    newAuth?: string,
  ) {
    return this.post<{
      id: string;
      name: string;
    }>(`/confirm`, {
      username: name,
      secret: password,
      type: "password",
      new_auth: newAuth,
    });
  }

  public confirmPlayerByAuth(name: string, auth: string) {
    return this.post<{
      id: string;
      name: string;
    }>(`/confirm`, {
      username: name,
      secret: auth,
      type: "auth",
    });
  }

  public getPlayerByName(name: string) {
    return this.get<{
      player_id: string;
      player_name: string;
      player_auth: string | null;
    }>(`/players?query_type=name&query=${name}`);
  }

  public getPlayerById(id: string) {
    return this.get<{
      player_id: string;
      player_name: string;
      player_auth: string | null;
    }>(`/players?query_type=id&query=${id}`);
  }

  public getPlayerPermissions(playerId: string) {
    return this.get<{
      permissions: {
        scope: string;
        action: string;
        resource: string;
        from_role: number;
      }[];
      roles: {
        id: number;
        name: string;
        emblem: string | null;
      }[];
    }>(`/players/${playerId}/permissions`);
  }

  public getMatches(options: {
    afterMatchId?: string;
    limit?: number;
    matchId?: string;
  }) {
    return this.get<
      {
        id: string;
        created_at: number;
        events: {
          id: number;
          created_at: number;
          type: string;
          data: unknown;
          time: number;
          changes: {
            id: number;
            created_at: number;
            type: string;
            data: unknown;
          }[];
        }[];
      }[]
    >(
      `/matches?after_match=${options.afterMatchId || ""}&limit=${options.limit || ""}&id=${
        options.matchId || ""
      }`,
    );
  }

  public getPlayerStats(playerId: string, season?: string) {
    return this.get<{
      [key: string]: number;
    }>(`/players/${playerId}/stats?season=${season || ""}`);
  }

  public getAchievements(achievementName?: string) {
    return this.get<
      {
        achievement_name: string;
        data: unknown;
        created_at: number;
      }[]
    >(`/achievements?achievement_name=${achievementName || ""}`);
  }

  public createEvent(event: {
    matchId: string;
    event: {
      type: string;
      data: unknown;
      matchTime: number;
    };
    stat?: {
      name: string;
      increment: number;
      playerId: string;
      playerName: string;
      roomMode: string;
    };
  }) {
    return this.post<{
      id: number;
    }>(`/matches`, {
      event_type: event.event.type,
      match_id: event.matchId,
      match_time: event.event.matchTime,
      data: event.event.data,
      stat: event.stat
        ? {
            increment: event.stat.increment,
            player_id: event.stat.playerId,
            player_name: event.stat.playerName,
            room_mode: event.stat.roomMode,
          }
        : undefined,
    });
  }

  public createMatch(match: {
    validateStats: boolean;
    redName: string;
    blueName: string;
    season?: number;
    initialPlayers?: {
      playerName: string;
      playerId: string;
      team: 1 | 2 | "red" | "blue";
      registrationId: string;
    }[];
  }) {
    return this.post<{
      id: string;
    }>(`/matches`, {
      validate_stats: match.validateStats,
      red_name: match.redName,
      blue_name: match.blueName,
      season: match.season || undefined,
      initial_players: match.initialPlayers?.map((player) => ({
        name: player.playerName,
        inGameId: player.playerId,
        playerId: player.registrationId,
        oldTeam: null,
        newTeam: getTeamIdFromName(player.team),
      })),
    });
  }

  public createAchievement(achievementName: string, data: unknown) {
    return this.post<{
      id: number;
    }>(`/achievements`, {
      achievement_name: achievementName,
      data,
    });
  }
}
