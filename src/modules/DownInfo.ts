import Player from "../core/Player";

type PlayerType = "qb" | "wr" | "def";

export type DownMoment = "kick" | "reception" | "advantage";

type DownPlayer = {
  playerId: number;
  playerName: string;
  type: PlayerType;
};

type DownPlayerInfo = {
  playerId: number;
  position: number[];
  withBall: boolean;
};

type DownMomentInfo = {
  time: number;
  ballPosition: number[];
  players: DownPlayerInfo[];
};

type DownInfoObject = {
  players: DownPlayer[];
  kick?: DownMomentInfo;
  reception?: DownMomentInfo;
  advantage?: DownMomentInfo;
  endPlay?: DownMomentInfo;
};

export default class DownInfo {
  private static readonly version = 2;
  private downInfo: DownInfoObject;

  constructor() {
    this.downInfo = {
      players: [],
    };
  }

  public addMomentInfo(
    moment: DownMoment,
    info: {
      time: number;
      ballPosition: Position;
      players: { player: Player; type: PlayerType; withBall: boolean }[];
    },
  ) {
    this.downInfo[moment] = {
      time: info.time,
      ballPosition: [info.ballPosition.x, info.ballPosition.y],
      players: info.players.map((p) => ({
        playerId: p.player.id,
        position: [p.player.getX().toFixed(2), p.player.getX().toFixed(2)].map(
          Number,
        ),
        withBall: p.withBall,
      })),
    };

    for (const p of info.players) {
      if (this.downInfo.players.find((pl) => pl.playerId === p.player.id)) {
        continue;
      }

      this.downInfo.players.push({
        playerId: p.player.id,
        playerName: p.player.name,
        type: p.type,
      });
    }
  }

  public hasAllMoments() {
    return (
      this.downInfo.kick && this.downInfo.reception && this.downInfo.advantage
    );
  }

  public toObject() {
    return {
      version: DownInfo.version,
      ...this.downInfo,
    };
  }
}
