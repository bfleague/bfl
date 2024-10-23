import type Room from "../../core/Room";
import type Player from "../../core/Player";
import { Team } from "../../core/Global";
import Command, { CommandInfo } from "../../core/Command";

import * as Global from "../../Global";

import Game, { GameModes, PlayerWithBallState } from "../Game";

import MapMeasures from "../../utils/MapMeasures";
import MathUtils from "../../utils/MathUtils";
import Timer from "../../utils/Timer";
import StadiumUtils from "../../utils/StadiumUtils";
import Utils from "../../utils/Utils";
import translate from "../../utils/Translate";
import { Mode } from "./Mode";
import GameUtils, { Tackle } from "../../utils/GameUtils";

export class FieldGoal extends Mode {
  public readonly name = "field goal";
  public readonly mode = GameModes.FieldGoal;

  public readonly fgPoints = 3;
  public readonly fgTimeLimit = 15 * 1000;
  public readonly playerLineLengthFieldGoalKickingTeam = 100;
  public readonly playerLineLengthFieldGoalOtherTeam = 100;
  public readonly maxPlayerBackDistanceFieldGoalOffense = 1000;
  public readonly maxPlayerBackDistanceFieldGoalDefense = 900;
  public readonly maxTimeFGMoveBallPenalty = 1 * 1000;
  public readonly yardsBackOffense = 10;
  public readonly yardsBackDefense = 15;
  public readonly fgMaxDistanceMoveBall = 8.5;
  public readonly maxDistanceYardsFG = 48;
  public readonly maxSafeDistanceYardsFG = 46;
  public readonly playerLineLengthFG = 100;
  public readonly kickerY = 30;
  public readonly maxKickerBackDistance = MapMeasures.Yard * 5;
  public readonly ticksToWaitBeforeRunning = 1 * 60;

  public fgFailed = false;
  public fgKicker: Player;
  public setTick: number = null;
  public downInfo: { distance: number; downCount: number };
  public ballMovedTimeFG: number = null;

  constructor(room: Room, game: Game) {
    super(game);

    room.on("playerBallKick", (player: Player) => {
      if (this.game.mode !== this.mode) return;
      if (this.fgFailed) return;

      this.game.fieldGoalTimeout.stop();

      if (player.id !== this.fgKicker.id) {
        this.handleIllegalTouch(room, player);

        return;
      }

      if (!this.game.qbKickedBall) {
        this.game.qbKickedBall = true;

        this.game.setBallUnmoveable(room);
        this.game.lockBall(room);
        this.game.setBallUnkickable(room);

        const ballPos = room.getBall().getPosition();

        setTimeout(() => {
          if (
            !this.fgFailed &&
            this.detectFailedFieldGoal(room, player, ballPos)
          )
            this.handleMissedFieldGoalBallWrongDirection(room);
        }, 0);
      } else {
        this.handleIllegalBallKick(room);
      }
    });

    room.on("gameTick", () => {
      if (this.game.mode !== this.mode) return;
      if (this.fgFailed) return;

      if (!this.game.qbKickedBall) {
        const playerTouchingBall = this.getPlayerTouchingBall(room);

        if (playerTouchingBall) {
          if (playerTouchingBall.getTeam() === this.fgKicker.getTeam()) {
            this.handleIllegalTouch(room, playerTouchingBall);
          } else {
            this.handleTackle(room, {
              players: [playerTouchingBall],
              tackleCount: 1,
            });
          }

          return;
        }

        if (this.ballMovedTimeFG == null && this.didBallMove(room))
          this.ballMovedTimeFG = Date.now();

        const tackle = GameUtils.getTackle({
          room,
          game: this.game,
          playerBeingTackled: this.fgKicker,
        });

        if (tackle.players.length > 0) {
          this.handleTackle(room, tackle);

          return;
        }

        if (this.didBallIlegallyMoveDuringFG(room)) {
          this.handleIllegalBallMove(room);

          return;
        }

        if (
          this.game.teamWithBall === Team.Red
            ? this.fgKicker.getX() < -this.maxKickerBackDistance
            : this.fgKicker.getX() > this.maxKickerBackDistance
        ) {
          this.handleKickerTooFarFromBall(room);

          return;
        }

        if (
          this.game.teamWithBall === Team.Red
            ? this.fgKicker.getX() > room.getBall().getX()
            : this.fgKicker.getX() < room.getBall().getX()
        ) {
          if (
            this.game.tickCount - this.setTick <
            this.ticksToWaitBeforeRunning
          ) {
            room.send({
              message: translate("RUSHED_FG_TOO_SOON", this.fgKicker.name),
              color: Global.Color.Orange,
              style: "bold",
            });

            this.game.down.set({
              room,
              forTeam: this.game.invertTeam(this.game.teamWithBall),
            });

            return;
          }

          room.send({
            message: translate("RUN", this.fgKicker.name),
            color: Global.Color.DeepSkyBlue,
            style: "bold",
          });

          this.game.down.set({
            room,
            forTeam: this.game.teamWithBall,
            pos: this.game.ballPosition,
            countDistanceFromNewPos: false,
            duringHikeMode: {
              playerWithBall: this.fgKicker,
              playerWithBallState: PlayerWithBallState.QbRunner,
              distance: this.downInfo.distance,
              down: this.downInfo.downCount,
            },
          });

          return;
        }
      } else {
        if (this.didBallPassedGoalLine(room)) {
          this.handleSuccessfulFieldGoal(room);
        } else if (MathUtils.getBallSpeed(room.getBall()) < 0.02) {
          this.handleMissedFieldGoalBallStopped(room);
        }
      }
    });
  }

  public set({
    room,
    forTeam = this.game.teamWithBall,
    pos = this.game.ballPosition,
    kicker,
    downInfo,
  }: {
    room: Room;
    forTeam?: Team;
    pos?: Global.FieldPosition;
    kicker?: Player;
    downInfo: { distance: number; downCount: number };
  }) {
    this.game.mode = null;

    this.game.reset(room);
    this.game.resetPlay(room);

    this.game.teamWithBall = forTeam;
    this.game.ballPosition = pos;
    this.downInfo = downInfo;
    this.game.downCount = 0;
    this.game.distance = 20;

    this.fgKicker = kicker;

    room.send({
      message: translate(
        "FG",
        this.game.getTeamName(forTeam),
        Utils.getFormattedSeconds(this.fgTimeLimit / 1000),
      ),
      color: Global.Color.LightGreen,
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
    this.game.unlockBall(room);
    this.game.setBallMoveable(room);

    const red = room.getPlayers().red();
    const blue = room.getPlayers().blue();

    this.game.down.resetFirstDownLine(room);
    this.game.down.resetBallLine(room);

    let kickingTeam = (forTeam === Team.Red ? red : blue)
      .filter((p) => p.id !== kicker.id)
      .filter(GameUtils.filterPlayerOutsideField(room));

    let otherTeam = (forTeam === Team.Red ? blue : red).filter(
      GameUtils.filterPlayerOutsideField(room),
    );

    this.game.teamWithBall = forTeam;

    const xBackOffense =
      forTeam === Team.Blue
        ? Math.max(
            -this.maxPlayerBackDistanceFieldGoalOffense,
            ball.getX() - this.yardsBackOffense * MapMeasures.Yard,
          )
        : Math.min(
            this.maxPlayerBackDistanceFieldGoalOffense,
            ball.getX() + this.yardsBackOffense * MapMeasures.Yard,
          );
    const xBackDefense =
      forTeam === Team.Blue
        ? Math.max(
            -this.maxPlayerBackDistanceFieldGoalDefense,
            ball.getX() - this.yardsBackDefense * MapMeasures.Yard,
          )
        : Math.min(
            this.maxPlayerBackDistanceFieldGoalDefense,
            ball.getX() + this.yardsBackDefense * MapMeasures.Yard,
          );

    const kickingTeamPositions = MathUtils.getPointsAlongLine(
      { x: 0, y: this.playerLineLengthFG },
      { x: 0, y: -this.playerLineLengthFG },
      kickingTeam.length,
    );
    const defenseTeamPositions = MathUtils.getPointsAlongLine(
      { x: 0, y: this.playerLineLengthFG },
      { x: 0, y: -this.playerLineLengthFG },
      otherTeam.length,
    );

    for (let i = 0; i < kickingTeam.length; i++) {
      const player = kickingTeam[i];

      if (player.id === kicker.id) continue;

      player.setPosition({ x: xBackOffense, y: kickingTeamPositions[i].y });
    }

    for (let i = 0; i < otherTeam.length; i++) {
      const player = otherTeam[i];

      player.setPosition({ x: xBackDefense, y: defenseTeamPositions[i].y });
    }

    kicker.setY(this.kickerY);

    this.game.mode = this.mode;
    this.setTick = this.game.tickCount;

    this.game.fieldGoalTimeout = new Timer(() => {
      room.send({
        message: translate("TOOK_TOO_LONG_FG"),
        color: Global.Color.Orange,
        style: "bold",
      });

      this.game.down.set({
        room,
        forTeam: this.game.invertTeam(this.game.teamWithBall),
      });
    }, this.fgTimeLimit);
  }

  public reset() {
    this.fgKicker = null;
    this.fgFailed = false;
    this.setTick = null;
    this.ballMovedTimeFG = null;
    this.downInfo = null;
  }

  @Command({
    name: "fg",
  })
  fgCommand($: CommandInfo, room: Room) {
    if (!room.isGameInProgress()) {
      $.caller.reply({
        message: translate("GAME_NOT_IN_PROGRESS"),
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if ($.caller.getTeam() === Team.Spectators) {
      $.caller.reply({
        message: translate("NOT_ON_TEAM"),
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if ($.caller.getTeam() !== this.game.teamWithBall) {
      $.caller.reply({
        message: translate("TEAM_WITHOUT_BALL"),
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if (
      this.game.mode !== this.game.down.waitingHikeMode ||
      this.game.conversion
    ) {
      $.caller.reply({
        message: translate("CANNOT_FG_NOW"),
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if (
      StadiumUtils.getDifferenceBetweenFieldPositions(this.game.ballPosition, {
        team: this.game.invertTeam(this.game.teamWithBall),
        yards: 0,
      }) > this.maxDistanceYardsFG
    ) {
      $.caller.reply({
        message: translate("CANNOT_FG_AT_THIS_DISTANCE"),
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if ($.caller.distanceTo(room.getBall()) > 50) {
      $.caller.reply({
        message: translate("FAR_AWAY_FROM_BALL"),
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    room.send({
      message: translate("SET_FG", $.caller.name),
      color: Global.Color.Yellow,
      style: "bold",
    });

    this.set({
      room,
      kicker: $.caller,
      downInfo: {
        distance: this.game.distance,
        downCount: this.game.downCount,
      },
    });

    return false;
  }

  protected handleTackle(room: Room, tackle: Tackle) {
    this.fgFailed = true;
    this.game.customAvatarManager.setPlayerAvatar(this.fgKicker, "❌", 3000);

    this.game.matchStats.add(this.fgKicker, { fieldGoalPerdidos: 1 });
    tackle.players.forEach((p) =>
      this.game.matchStats.add(p, { tackles: 1, sacks: 1 }),
    );

    tackle.players.forEach((p) => {
      this.game.customAvatarManager.setPlayerAvatar(p, "💪", 3000);
    });

    Utils.sendSoundTeamMessage(room, {
      message: translate(
        "TACKLED_QB_FG",
        this.fgKicker.name,
        Utils.getPlayersNames(tackle.players),
      ),
      color: Global.Color.LimeGreen,
      style: "bold",
    });

    this.game.failedFielGoalTimeout = new Timer(() => {
      this.game.down.set({
        room,
        forTeam: this.game.invertTeam(this.game.teamWithBall),
      });

      return;
    }, 1000);
  }

  private getPlayerTouchingBall(room: Room) {
    for (const player of room.getPlayers().teams()) {
      if (player.id === this.fgKicker?.id) continue;

      if (player.distanceTo(room.getBall()) < 0.1) return player;
    }
  }

  private scoreFieldGoal(room: Room, forTeam: Team) {
    this.game.mode = null;

    this.game.incrementScore({ [forTeam]: this.fgPoints });

    this.game.kickOffReset = new Timer(
      () => this.game.kickOff.set({ room, forTeam }),
      3000,
    );
  }

  private didBallMove(room: Room) {
    const ballPos = StadiumUtils.getCoordinateFromYards(
      this.game.ballPosition.team,
      this.game.ballPosition.yards,
    );
    const ball = room.getBall();

    return (
      Math.abs(ball.getX() - ballPos.x) > 0.01 ||
      Math.abs(ball.getY() - ballPos.y) > 0.01
    );
  }

  private didBallIlegallyMoveDuringFG(room: Room) {
    const ballPos = StadiumUtils.getCoordinateFromYards(
      this.game.ballPosition.team,
      this.game.ballPosition.yards,
    );
    const ball = room.getBall();

    return (
      ball.distanceTo({ ...ballPos, radius: ball.getRadius() }) >
        this.fgMaxDistanceMoveBall ||
      (this.ballMovedTimeFG != null &&
        !this.game.qbKickedBall &&
        Date.now() > this.ballMovedTimeFG + this.maxTimeFGMoveBallPenalty)
    );
  }

  private didBallPassedGoalLine(room: Room) {
    return StadiumUtils.ballWithinGoalLine(
      room.getBall(),
      this.game.invertTeam(this.game.teamWithBall),
    );
  }

  private detectFailedFieldGoal(
    room: Room,
    player: Player,
    ballPos: { x: number; y: number },
  ) {
    const ballPath = MathUtils.getBallPathFromPosition(
      ballPos,
      room.getBall().getPosition(),
      2000,
    );

    const goalLine =
      player.getTeam() === Team.Red
        ? MapMeasures.BlueGoalLine
        : MapMeasures.RedGoalLine;

    const pointOfIntersection = MathUtils.getPointOfIntersection(
      ballPath[0].x,
      ballPath[0].y,
      ballPath[1].x,
      ballPath[1].y,
      goalLine[0].x,
      goalLine[0].y * 1.1,
      goalLine[1].x,
      goalLine[1].y * 1.1,
    );

    if (!this.game.playerWithBall) {
      if (pointOfIntersection === false) return true;
    }
  }

  private handleIllegalBallMove(room: Room) {
    this.fgFailed = true;

    this.game.matchStats.add(this.fgKicker, { fieldGoalPerdidos: 1 });

    room.send({
      message: translate("CARRIED_BALL_FG"),
      color: Global.Color.Orange,
      style: "bold",
    });

    this.game.down.set({
      room,
      forTeam: this.game.invertTeam(this.game.teamWithBall),
    });
  }

  private handleIllegalBallKick(room: Room) {
    room.send({
      message: translate("TOUCHED_BALL_FG_SAME_TEAM"),
      color: Global.Color.Orange,
      style: "bold",
    });

    this.game.down.set({
      room,
      forTeam: this.game.invertTeam(this.game.teamWithBall),
    });
  }

  private handleIllegalTouch(room: Room, player: Player) {
    this.fgFailed = true;

    if (player.getTeam() === this.game.teamWithBall) {
      this.game.customAvatarManager.setPlayerAvatar(player, "🤡", 3000);

      Utils.sendSoundTeamMessage(room, {
        message: translate(
          "TOUCHED_BALL_FG_DEFENSE",
          this.game.getTeamName(this.game.teamWithBall),
          this.fgPoints,
          this.game.getScoreMessage(),
        ),
        color: Global.Color.LimeGreen,
        style: "bold",
      });
    } else {
      Utils.sendSoundTeamMessage(room, {
        message: translate("TACKLED_QB_FG", this.fgKicker.name, player.name),
        color: Global.Color.LimeGreen,
        style: "bold",
      });
    }

    this.game.failedFielGoalTimeout = new Timer(() => {
      this.game.down.set({
        room,
        forTeam: this.game.invertTeam(this.game.teamWithBall),
      });

      return;
    }, 2000);
  }

  private handleSuccessfulFieldGoal(room: Room) {
    const distance = StadiumUtils.getDifferenceBetweenFieldPositions(
      this.game.ballPosition,
      {
        team: this.game.invertTeam(this.game.teamWithBall),
        yards: -MapMeasures.YardsBetween0MarkAndGoalLine,
      },
    );

    this.scoreFieldGoal(room, this.game.teamWithBall);

    Utils.sendSoundTeamMessage(room, {
      message: `🙌 FIELD GOAL DO ${this.game.getTeamName(this.game.teamWithBall).toUpperCase()} A ${distance} JARDAS DE DISTÂNCIA!!! • +${this.fgPoints} pontos para o ${this.game.getTeamName(this.game.teamWithBall)} • ${this.game.getScoreMessage()}`,
      color: Global.Color.LimeGreen,
      style: "bold",
    });

    this.game.matchStats.add(this.fgKicker, { fieldGoalJardas: distance });
    this.game.matchStats.add(this.fgKicker, { fieldGoalCompletos: 1 });
  }

  private handleMissedFieldGoalBallWrongDirection(room: Room) {
    room.send({
      message: translate("DETECTED_FAILED_FG"),
      color: Global.Color.Yellow,
      style: "bold",
    });

    this.game.matchStats.add(this.fgKicker, { fieldGoalPerdidos: 1 });

    this.game.mode = null;

    this.game.failedFielGoalTimeout = new Timer(() => {
      this.game.down.set({
        room,
        forTeam: this.game.invertTeam(this.game.teamWithBall),
      });

      return;
    }, 2000);
  }

  private handleMissedFieldGoalBallStopped(room: Room) {
    this.game.matchStats.add(this.fgKicker, { fieldGoalPerdidos: 1 });

    this.game.mode = null;

    room.send({
      message: translate("FAILED_FG_BALL_STOPPED"),
      color: Global.Color.Yellow,
      style: "bold",
    });

    this.game.failedFielGoalTimeout = new Timer(
      () =>
        this.game.down.set({
          room,
          forTeam: this.game.invertTeam(this.game.teamWithBall),
        }),
      1000,
    );
  }

  private handleKickerTooFarFromBall(room: Room) {
    this.game.matchStats.add(this.fgKicker, { fieldGoalPerdidos: 1 });

    this.game.mode = null;

    room.send({
      message: translate("KICKER_TOO_FAR_FROM_BALL", this.fgKicker.name),
      color: Global.Color.Yellow,
      style: "bold",
    });

    this.game.failedFielGoalTimeout = new Timer(
      () =>
        this.game.down.set({
          room,
          forTeam: this.game.invertTeam(this.game.teamWithBall),
        }),
      1000,
    );
  }
}
