import type Room from "../../core/Room";
import { Team } from "../../core/Global";

import * as Global from "../../Global";

import Game, { GameModes, PlayerWithBallState } from "../Game";

import MapMeasures from "../../utils/MapMeasures";
import MathUtils from "../../utils/MathUtils";
import StadiumUtils from "../../utils/StadiumUtils";
import Player from "../../core/Player";
import Utils from "../../utils/Utils";
import { LandPlay } from "./LandPlay";
import translate from "../../utils/Translate";
import StoppageTime from "../../utils/StoppageTime";
import GameUtils from "../../utils/GameUtils";

export class KickOff extends LandPlay {
  public readonly mode = GameModes.Kickoff;
  public readonly name = "kick off";

  public readonly playerLineLengthKickoff = 200;
  public readonly kickoffTicksToAddExtra = 10 * 60;
  public readonly kickoffTicksToPenalty = 10 * 60;

  public kickoffPenaltyStartedAt: number;
  public isBallToBeKicked = false;
  public returning = false;

  constructor(room: Room, game: Game) {
    super(room, game);

    room.on("gameTick", () => {
      if (this.game.mode !== this.mode) return;

      if (
        this.game.qbKickedBall &&
        !this.game.playerWithBall &&
        !this.returning
      ) {
        for (const player of room.getPlayers().teams()) {
          if (player.distanceTo(room.getBall()) < 0.5) {
            this.playerReturnedBall(room, player);

            return;
          }
        }
      }
    });

    room.on("playerBallKick", (player: Player) => {
      if (this.game.mode !== this.mode) return;

      if (!this.returning) {
        if (this.game.qbKickedBall) {
          this.playerReturnedBall(room, player);
        } else {
          this.addStoppageTime(room);
          this.game.qbKickedBall = true;
          this.game.unblockTeams(room);
        }
      }
    });

    room.on("playerTeamChanged", (changedPlayer, byPlayer) => {
      if (this.game.mode !== this.mode) return;

      if (!this.game.qbKickedBall) {
        this.game.blockTeam(room, this.game.invertTeam(this.game.teamWithBall));
        this.game.blockMiddleKickoff(room, this.game.teamWithBall);
      }
    });
  }

  set({
    room,
    forTeam = this.game.teamWithBall,
    pos,
  }: {
    room: Room;
    forTeam?: Team;
    pos?: Global.FieldPosition;
  }) {
    this.game.mode = null;
    const firstKickoff = this.game.firstKickoff;

    this.game.reset(room);
    this.game.resetPlay(room);

    this.game.firstKickoff = firstKickoff;

    if (!pos) {
      this.game.ballPosition = { team: forTeam, yards: 50 };
      pos = this.game.ballPosition;
    } else {
      this.game.ballPosition = pos;
    }

    this.game.teamWithBall = forTeam;
    this.game.downCount = 0;
    this.game.distance = 20;
    this.isBallToBeKicked = true;
    this.kickoffPenaltyStartedAt = this.game.tickCount;

    room.send({
      message: `​🤾‍♂️​ Kickoff para o ${this.game.getTeamName(forTeam)}`,
      color: Global.Color.Yellow,
      style: "bold",
    });

    const ballPosInMap = StadiumUtils.getCoordinateFromYards(
      pos.team,
      pos.yards,
    );
    const ball = room.getBall();

    ball.setVelocityX(0);
    ball.setVelocityY(0);
    ball.setPosition(ballPosInMap);
    this.game.setBallKickForce(room, 1.2);

    this.game.down.resetFirstDownLine(room);
    this.game.down.resetBallLine(room);

    let red = room.getPlayers().red();
    let blue = room.getPlayers().blue();

    const getSignal = (p: Player) => (p.getTeam() === Team.Red ? -1 : 1);

    let kickingTeam = (forTeam === Team.Red ? red : blue).filter(
      GameUtils.filterPlayerOutsideField(room),
    );
    let receivingTeam = (forTeam === Team.Red ? blue : red).filter(
      GameUtils.filterPlayerOutsideField(room),
    );

    const kickingPositions = MathUtils.getPointsAlongLine(
      { x: 0, y: this.playerLineLengthKickoff },
      { x: 0, y: -this.playerLineLengthKickoff },
      kickingTeam.length,
    );
    const receivingPositions = MathUtils.getPointsAlongLine(
      { x: 0, y: this.playerLineLengthKickoff },
      { x: 0, y: -this.playerLineLengthKickoff },
      receivingTeam.length,
    );

    for (let i = 0; i < kickingPositions.length; i++) {
      const player = kickingTeam[i];

      player.setPosition({
        x:
          room.getScores().time === 0
            ? Math.abs(MapMeasures.InnerField[0].x) * getSignal(player)
            : MapMeasures.KickoffKickingPositionX * getSignal(player),
        y: kickingPositions[i].y,
      });
    }

    for (let i = 0; i < receivingTeam.length; i++) {
      const player = receivingTeam[i];

      player.setPosition({
        x: MapMeasures.KickoffReceivingPositionX * getSignal(player),
        y: receivingPositions[i].y,
      });
    }

    this.game.blockTeam(room, this.game.invertTeam(forTeam));
    this.game.blockMiddleKickoff(room, forTeam);

    this.game.mode = this.mode;
  }

  private playerReturnedBall(room: Room, player: Player) {
    if (player.getTeam() !== this.game.teamWithBall) {
      this.returning = true;
      this.game.setPlayerWithBall(
        room,
        player,
        PlayerWithBallState.KickoffReturner,
        true,
      );

      room.send({
        message: translate("RETURNED_KICKOFF", player.name),
        color: Global.Color.MediumSeaGreen,
        style: "bold",
      });
    } else {
      room.send({
        message: translate("ILLEGAL_TOUCH_SAME_TEAM", player.name),
        color: Global.Color.Orange,
        style: "bold",
      });

      this.game.down.set({
        room,
        pos: StadiumUtils.getYardsFromXCoord(player.getX()),
        forTeam: this.game.invertTeam(this.game.teamWithBall),
        countDistanceFromNewPos: false,
        positionPlayersEvenly: true,
      });
    }
  }

  private resetStallCounter() {
    this.kickoffPenaltyStartedAt = null;
  }

  public addStoppageTime(room: Room) {
    const stoppageTimeDisabled =
      this.game.firstKickoff ||
      this.game.endGameTime === 0 ||
      room.getScores().time === 0 ||
      this.kickoffPenaltyStartedAt === 0 ||
      this.game.tickCount - this.kickoffPenaltyStartedAt <
        this.kickoffTicksToPenalty;

    if (stoppageTimeDisabled) {
      return;
    }

    const kickoffStallExtraTime =
      this.game.tickCount - this.game.kickOff.kickoffPenaltyStartedAt;

    this.game.stoppageTime.addStoppageTime(kickoffStallExtraTime);

    room.send({
      message: `​⏰​ Foram adicionados ${StoppageTime.ticksToStr(kickoffStallExtraTime)} de acréscimos devido à demora em chutar o kickoff`,
      color: Global.Color.Yellow,
      style: "bold",
    });

    this.isBallToBeKicked = false;
    this.kickoffPenaltyStartedAt = 0;

    this.resetStallCounter();
  }

  public reset() {
    this.resetStallCounter();
    this.isBallToBeKicked = false;
    this.game.firstKickoff = false;
    this.returning = false;
  }
}
