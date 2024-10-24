import type Room from "../../core/Room";
import type Player from "../../core/Player";
import { MessageObject, Team } from "../../core/Global";

import * as Global from "../../Global";

import Game, { GameModes, HikeTimeStatus, PlayerWithBallState } from "../Game";
import { LandPlay } from "./LandPlay";

import MapMeasures from "../../utils/MapMeasures";
import MathUtils from "../../utils/MathUtils";
import Timer from "../../utils/Timer";
import Command, { CommandInfo } from "../../core/Command";
import StadiumUtils from "../../utils/StadiumUtils";
import Utils from "../../utils/Utils";
import Invasion from "./Invasion";
import translate from "../../utils/Translate";
import Disc from "../../core/Disc";
import GameUtils from "../../utils/GameUtils";
import DownInfo, { DownMoment } from "../DownInfo";

type SetHikeProperties = {
  room: Room;
  pos?: Global.FieldPosition;
  forTeam?: Team;
  countDown?: boolean;
  decrement?: number;
  countDistanceFromNewPos?: boolean;
  positionPlayersEvenly?: boolean;
  duringHikeMode?: {
    playerWithBall: Player;
    playerWithBallState: PlayerWithBallState;
    down: number;
    distance: number;
  };
};

export class Down extends LandPlay {
  public readonly name = "descida";
  public readonly mode = GameModes.Down;

  public readonly waitingHikeMode = GameModes.WaitingHike;
  public readonly trespassingPenalty = 10;
  public readonly defenseTrespasserPenalty = 10;
  public readonly holdingPenalty = -5;
  public readonly qbPassedScrimmageLinePenalty = -5;
  public readonly attackIllegalTouchPenalty = -5;
  public readonly maxPenaltiesInRedZone = 3;
  public readonly hikeMaxDistanceMoveBall = 8.5;
  public readonly hikeTimeLimit = 10 * 1000;
  public readonly distanceToHike = 50;
  public readonly illegalTouchPenalty = 10;
  public readonly firstDownDiscsIndex = [5, 6];
  public readonly minimumIntVelocity = 3;
  public readonly maximumHighestDampingIntVelocity = 6;
  public readonly timeIllegalTouchDisabledStartTicks = 30;
  public readonly qbScrimmageLineMaxPermitted = 8;
  public readonly invasion: Invasion;
  public readonly timeToKickAutomaticPunt = 10 * 60;
  public readonly maxDistance: Record<number, number> = {
    1: 30,
    2: 30,
    3: 30,
    4: 25,
  };

  public qbCarriedBallTime = 0;
  public defenderBlockingBall: Player;
  public sackBallTouched = false;
  public sack = false;
  public goalMode = false;
  public hikeTimeEnabled = true;
  public downSetTime: number;
  public ballInitialPoss: Position;
  public downInfo: DownInfo = null;
  public playerWithBallInAdvantage = false;

  constructor(room: Room, game: Game) {
    super(room, game);

    this.invasion = new Invasion(room, game);

    room.on("gameTick", () => {
      if (this.game.mode !== this.mode) return;

      const hikeTimeStatus = this.game.getHikeTimeStatus();
      const hikeTimeFormatted = this.game.getHikeTimeRemainingFormatted(
        hikeTimeStatus.time,
      );

      const sackWithBallNotTouched = this.sack && !this.sackBallTouched;

      const hasInterceptAttempt = !!this.game.interceptAttemptPlayer;

      const afterHikeBeforeKick =
        this.game.quarterback &&
        !this.game.playerWithBall &&
        !this.game.qbKickedBall;

      const afterKickBeforeCatch =
        this.game.quarterback &&
        ((this.game.qbKickedBall && !this.game.playerWithBall) ||
          (this.game.qbKickedBall && sackWithBallNotTouched));

      const afterCatch = this.game.playerWithBall;

      const ball = room.getBall();

      if (hasInterceptAttempt) {
        if (this.checkInterceptionFailed(room)) {
          this.handleInterceptionFailed(room);
        } else {
          this.handleInterceptionSuccess(room);
        }

        return;
      }

      if (afterHikeBeforeKick) {
        const ballMoved =
          !this.qbCarriedBallTime &&
          this.ballInitialPoss &&
          MathUtils.getDistanceBetweenPoints(
            this.ballInitialPoss,
            room.getBall().getPosition(),
            room.getBall().getRadius(),
          ) > 1;

        /* Bola se moveu */
        if (ballMoved) {
          this.qbCarriedBallTime = Date.now();
        }

        /* Ultrapassagem do QB */
        if (this.hasQBPassedScrimmageLine(room)) {
          this.handleQBPassedScrimmageLine(
            room,
            hikeTimeStatus,
            hikeTimeFormatted,
          );

          return;
        }

        /* Corrida do QB */
        if (this.qbIsAttemptingRun(room)) {
          this.handleQBAttemptingRun(room);

          return;
        }

        /* Player tocando na bola */
        const playerTouchingBall = this.getPlayerTouchingBall(room);

        if (playerTouchingBall) {
          this.playerTouchBallHike(room, playerTouchingBall);

          return;
        }

        /* Bola passou da linha de scrimmage */
        if (this.hasQBBallPassedScrimmageLine(room)) {
          this.handleQBBallPassedScrimmageLine(room);

          return;
        }

        /* Bola saiu de campo */
        if (this.isBallOutsideField(room)) {
          this.handleBallOutsideField(room);

          return;
        }

        /* Corrida de RB */
        const run = this.getRunningBackAttemptingRun(room);

        if (run) {
          this.handleRunningBackAttemptingRun(room, run);

          return;
        }

        const holdingPlayers = this.getHoldingPlayers(room);

        if (holdingPlayers) {
          this.handleHoldingPlayers(room, holdingPlayers);

          return;
        }

        /* Ultrapassagem ilegal na linha de scrimmage */
        const trespassingDefender = this.getDefensePlayersTrespassing(room);

        if (trespassingDefender) {
          if (!hikeTimeStatus.isOver) {
            this.handleIllegalTrespassing(
              room,
              trespassingDefender,
              hikeTimeFormatted,
            );
          } else {
            this.handleSackAttempt(room, trespassingDefender);
          }

          return;
        }

        /* Invasão */
        if (!hikeTimeStatus.isOver) {
          const invasion = this.invasion.handle(room);

          if (invasion) return;
        }

        return;
      }

      if (afterKickBeforeCatch) {
        /* Bola fora de campo no sack */
        if (
          this.sack &&
          StadiumUtils.isOutOfMap(ball.getPosition(), -ball.getRadius())
        ) {
          this.sackBallTouched = true;

          return;
        }

        /* Bola recebida por WR */
        const wideReceiverCatchingBall = this.getWideReceiverCatchingBall(room);

        if (
          wideReceiverCatchingBall &&
          !this.game.blockedPass &&
          !this.game.intercept &&
          !this.game.interceptAttemptPlayer &&
          !(
            wideReceiverCatchingBall.id === this.game.quarterback.id &&
            this.sack
          )
        ) {
          this.handleWideReceiverCatchingBall(room, wideReceiverCatchingBall);

          return;
        }

        /* Passe bloqueado pela defesa */
        const defenderBlockingBall = this.getDefenderBlockingBall(room);

        if (defenderBlockingBall && !this.game.blockedPass) {
          this.handleDefenderBlockingBall(room, defenderBlockingBall);

          return;
        }

        if (
          this.defenderBlockingBall &&
          !this.game.interceptAttemptPlayer &&
          !this.game.intercept &&
          this.defenderBlockingBall.distanceTo(room.getBall()) > 5
        ) {
          if (this.sack) {
            this.sackBallTouched = true;
          } else {
            this.game.blockPass(room, this.defenderBlockingBall);
          }

          return;
        }

        return;
      }

      if (afterCatch) {
        if (
          !this.playerWithBallInAdvantage &&
          this.checkPlayerWithBallInAdvantage(room)
        ) {
          this.playerWithBallInAdvantage = true;

          this.handlePlayerWithBallInAdvantage(room);
        }
      }
    });

    room.on("playerChat", (player: Player, message: string) => {
      if (message === "hike" && this.game.mode === this.waitingHikeMode) {
        this.setHike(player, room);
      }
    });

    room.on("playerBallKick", (player: Player) => {
      if (this.game.interceptAttemptPlayer || this.game.intercept) return;

      const isIllegalTouch =
        this.game.mode === this.waitingHikeMode &&
        !this.game.qbKickedBall &&
        player.getTeam() !== this.game.teamWithBall &&
        this.game.tickCount >
          this.downSetTime + this.timeIllegalTouchDisabledStartTicks;

      if (isIllegalTouch) {
        this.playerTouchBallHike(room, player);
        return;
      }

      if (this.game.mode !== this.mode) return;

      if (!this.game.qbKickedBall) {
        this.game.updatePlayersPosition(room);

        if (player.id === this.game.quarterback?.id) {
          this.game.qbKickedBall = true;
          this.game.matchStats.add(this.game.quarterback, {
            passesTentados: 1,
          });
          this.addDownInfoMoment(room, "kick");
        } else {
          this.playerTouchBallHike(room, player);
        }

        return;
      }

      const isBallLoose =
        !this.game.playerWithBall ||
        (this.sack &&
          !this.sackBallTouched &&
          player.id !== this.game.quarterback.id);

      if (!isBallLoose) return;

      if (player.getTeam() !== this.game.teamWithBall) {
        if (!this.game.interceptAttemptPlayer) {
          this.handleInterception(room, player);
        } else if (this.sack) {
          this.sackBallTouched = true;
        } else {
          this.game.blockPass(room, player);
        }

        return;
      }

      if (StadiumUtils.isOutOfMap(player.getPosition(), 0)) {
        const message = this.game.conversion
          ? "❌ Recepção fora de campo • Perde a conversão"
          : "❌ Recepção fora de campo • Perde a descida";

        room.send({ message, color: Global.Color.Orange, style: "bold" });

        if (this.game.conversion) {
          this.game.resetToKickoff(room);
        } else {
          this.set({ room });
        }
        return;
      }

      if (this.sack) this.qbPassedInSack();
      this.setReceiver(room, player);
    });

    room.on("gamePause", (byPlayer: Player) => {
      if (
        this.game.mode === this.waitingHikeMode &&
        this.game.hikeTimeout &&
        room.isGameInProgress()
      ) {
        this.game.hikeTimeout?.pause();

        if (byPlayer)
          room.send({
            message: translate("GAME_PAUSED"),
            color: Global.Color.Pink,
            style: "bold",
          });
      }
    });

    room.on("gameUnpause", (byPlayer) => {
      if (
        this.game.mode === this.waitingHikeMode &&
        this.game.hikeTimeout &&
        room.isGameInProgress()
      ) {
        if (byPlayer)
          room.send({
            message: translate("GAME_RESUMED", byPlayer.name),
            color: Global.Color.Pink,
            style: "bold",
          });
      }
    });

    room.on("gameStartTicking", () => {
      if (
        this.game.mode === this.waitingHikeMode &&
        this.game.hikeTimeout &&
        room.isGameInProgress()
      ) {
        this.game.hikeTimeout?.resume();
      }
    });
  }

  public setHike(player: Player, room: Room) {
    if (player.getTeam() !== this.game.teamWithBall) return;
    if (room.isGamePaused()) return;
    if (!room.isGameInProgress()) return;
    if (player.distanceTo(room.getBall()) > this.distanceToHike) return;

    const hikingTeam =
      this.game.teamWithBall === Team.Red
        ? room.getPlayers().red()
        : room.getPlayers().blue();
    const ballXPos = StadiumUtils.getCoordinateFromYards(
      this.game.ballPosition,
    ).x;

    if (
      this.game.teamWithBall === Team.Red
        ? player.getX() > ballXPos
        : player.getX() < ballXPos
    ) {
      setTimeout(() => {
        if (this.game.conversion) {
          this.game.extraPoint.set({
            room,
            forTeam: this.game.teamWithBall,
            silent: true,
          });
        }
      }, 0);

      return;
    }

    const invaders = hikingTeam.filter((p) =>
      this.game.teamWithBall === Team.Red
        ? p.getX() > ballXPos
        : p.getX() < ballXPos,
    );

    if (invaders.length > 0) {
      setTimeout(() => {
        room.send({
          message: translate(
            "HIKE_BLOCKED_OFFENSIVE_BLITZ",
            this.game.getTeamName(this.game.teamWithBall),
            Utils.getPlayersNames(invaders),
          ),
          sound: 1,
          color: Global.Color.Tomato,
          style: "bold",
        });

        if (this.game.conversion) {
          this.game.extraPoint.set({
            room,
            forTeam: this.game.teamWithBall,
            silent:
              true /*, yards: StadiumUtils.getYardsFromXCoord(room.getBall().getX()).yards*/,
          });
        }

        invaders.forEach((p) => {
          p.reply({
            message: translate("HIKE_BLOCKED_OFFENSIVE_BLITZ_PLAYER_WARNING"),
            sound: 2,
            color: Global.Color.Red,
            style: "bold",
          });
        });
      }, 0);

      return;
    }

    this.game.quarterback = player;
    this.game.mode = this.mode;

    this.game.unlockBall(room);
    this.game.setBallMoveable(room);

    this.game.hikeTime = Date.now();

    this.game.clearHikeTime();

    return setTimeout(() => {
      room.send({
        message: translate("HIKED"),
        color: 0x4efca2,
        style: "bold",
      });

      this.game.extraPointTimeout?.stop();
      this.game.extraPointTimeout = null;
    }, 0);
  }

  public set({
    room,
    pos,
    forTeam = this.game.teamWithBall,
    decrement,
    countDown = true,
    countDistanceFromNewPos = true,
    duringHikeMode,
  }: SetHikeProperties) {
    if (duringHikeMode) {
      this.game.mode = null;
      this.game.reset(room);
      this.game.mode = this.mode;
      this.game.teamWithBall = forTeam;
      this.game.quarterback = duringHikeMode.playerWithBall;
      this.game.ballPosition = pos;

      this.game.downCount = duringHikeMode.down;
      this.game.distance = duringHikeMode.distance;

      this.handleFirstDownLine(room);
      this.setBallLine(room);

      this.game.setPlayerWithBall(
        room,
        duringHikeMode.playerWithBall,
        duringHikeMode.playerWithBallState,
        true,
      );

      return;
    }

    const beforeModeWasHike = this.game.mode === this.mode;
    const isConversion = this.game.conversion;

    if (this.game.conversion) {
      countDown = false;
      countDistanceFromNewPos = false;
    }

    this.game.mode = null;
    this.game.reset(room);
    if (isConversion) this.game.conversion = true;

    if (countDistanceFromNewPos && pos && !this.game.conversion) {
      const diff = StadiumUtils.getDifferenceBetweenFieldPositions(
        this.game.ballPosition,
        pos,
        this.game.teamWithBall,
      );

      this.game.distance += diff;
    }

    if (!pos) pos = this.game.ballPosition;
    this.game.ballPosition = pos;
    let won20Yards = false;

    if (decrement != null) {
      this.game.ballPosition = StadiumUtils.addYardsToFieldPosition(
        this.game.ballPosition,
        decrement,
        this.game.teamWithBall,
      );

      this.game.distance -= decrement;
    }

    if (
      StadiumUtils.isInRedZone(
        this.game.ballPosition,
        this.game.invertTeam(forTeam),
      )
    ) {
      this.game.inRedZone = true;
    } else {
      this.game.inRedZone = false;
      this.goalMode = false;
    }

    if (this.game.distance <= 0 && !this.goalMode) {
      this.game.distance = 20;
      this.game.downCount = 0;

      won20Yards = beforeModeWasHike;
    }

    const hikeTimeMessage = (team: Team) => {
      if (!this.hikeTimeEnabled) {
        return translate("HIKE_DISABLED");
      }

      return translate(
        "HIKE_TIME",
        this.game.getTeamName(team),
        Utils.getFormattedSeconds(
          (this.game.conversion
            ? this.game.extraPoint.epTimeLimit
            : this.hikeTimeLimit) / 1000,
        ),
      );
    };

    let message: MessageObject = null;

    if (this.game.conversion) {
      this.game.downCount = 4;
      this.game.distance = 10;
      this.goalMode = true;

      message = {
        message:
          translate("CONVERSION_ATTEMPT", this.game.getTeamName(forTeam)) +
          " " +
          hikeTimeMessage(forTeam),
        color: Global.Color.LightGreen,
        style: "bold",
      };
    } else if (this.game.downCount === 0) {
      this.game.downCount = 1;

      if (this.game.inRedZone) {
        this.goalMode = true;
      }

      message = {
        message: `${this.getDownEmoji(this.game.downCount)} ${this.game.getStateOfMatch()} ${won20Yards ? translate("WON_20_YARDS") : ""} ${translate("FIRST_DOWN", this.game.getTeamName(forTeam))} ${hikeTimeMessage(forTeam)}`,
        color: Global.Color.LightGreen,
        style: "bold",
      };
    } else if (this.game.downCount === 4 && countDown) {
      const otherTeam = this.game.invertTeam(forTeam);

      this.game.downCount = 1;
      this.game.distance = 20;
      this.goalMode = false;

      message = {
        message: `${this.getDownEmoji(this.game.downCount)} ${this.game.getStateOfMatch()} ${translate("TURNOVER_ON_DOWNS", this.game.getTeamName(forTeam))} ${translate("FIRST_DOWN", this.game.getTeamName(otherTeam))} ${hikeTimeMessage(otherTeam)}`,
        color: Global.Color.LightGreen,
        style: "bold",
      };

      forTeam = otherTeam;
    } else {
      if (countDown) this.game.downCount++;

      message = {
        message: `${this.getDownEmoji(this.game.downCount)} ${this.game.getStateOfMatch()} ${translate("NTH_DOWN", this.game.downCount)} ${hikeTimeMessage(forTeam)}`,
        color: Global.Color.LightGreen,
        style: "bold",
      };
    }

    const distanceToEndZone = GameUtils.distanceToEndZone(
      this.game.ballPosition,
      forTeam,
    );

    if (
      countDistanceFromNewPos &&
      this.game.distance >= this.maxDistance[this.game.downCount] &&
      distanceToEndZone > this.game.fieldGoal.maxSafeDistanceYardsFG
    ) {
      Utils.sendSoundTeamMessage(room, {
        message: `🤾 ${this.game.getStateOfMatch()} • Punt automático para o ${this.game.getTeamName(forTeam)}`,
        color: Global.Color.LightGreen,
        style: "bold",
      });

      this.game.punt.set({
        room,
        forTeam: this.game.teamWithBall,
        pos,
        sendMessage: false,
        timeToKick: this.timeToKickAutomaticPunt,
      });

      return;
    }

    room.send(message);

    this.game.teamWithBall = forTeam;
    this.game.mode = this.waitingHikeMode;
    this.downSetTime = this.game.tickCount;

    this.setBallForHike(room, forTeam);
    this.game.resetPlayersPositionEvenly(room);
    this.handleFirstDownLine(room);
    this.setBallLine(room);

    this.downInfo = new DownInfo();

    if (!room.isGamePaused() && this.hikeTimeEnabled) {
      this.game.hikeTimeout = new Timer(
        () => {
          if (!this.game.conversion) {
            room.send({
              message: translate("TOOK_TO_LONG_TO_HIKE"),
              color: Global.Color.Orange,
              style: "bold",
            });

            this.set({ room });
          } else {
            room.send({
              message: translate("TOOK_TO_LONG_TO_KICK_CONVERSION"),
              color: Global.Color.Orange,
              style: "bold",
            });

            this.game.resetToKickoff(room, forTeam);
          }
        },
        this.game.conversion
          ? this.game.extraPoint.epTimeLimit
          : this.hikeTimeLimit,
      );
    }
  }

  public reset() {
    if (this.downInfo?.hasAllMoments()) {
      this.game.matchStats.addDown(this.downInfo);
    }

    this.qbCarriedBallTime = 0;
    this.ballInitialPoss = null;
    this.sack = null;
    this.sackBallTouched = false;
    this.downSetTime = null;
    this.playerWithBallInAdvantage = false;
    this.invasion.clear();
    this.downInfo = null;
  }

  public setBallPositionForHike(ball: Disc, forTeam: Team): Position {
    const ballPos = StadiumUtils.getCoordinateFromYards(
      this.game.ballPosition.team,
      this.game.ballPosition.yards,
    );

    ballPos.x =
      ballPos.x +
      MapMeasures.Yard *
        this.game.yardsBallBehind *
        (forTeam === Team.Red ? -1 : 1);

    ball.setPosition(ballPos);

    this.ballInitialPoss = ballPos;

    return ballPos;
  }

  public setBallForHike(room: Room, forTeam: Team) {
    const ball = room.getBall();

    ball.setVelocityX(0);
    ball.setVelocityY(0);
    this.game.lockBall(room);
    this.game.setBallUnmoveable(room);

    this.setBallPositionForHike(ball, forTeam);
  }

  public setFirstDownLine(
    room: Room,
    pos: Global.FieldPosition = StadiumUtils.addYardsToFieldPosition(
      this.game.ballPosition,
      this.game.distance,
      this.game.teamWithBall,
    ),
  ) {
    const x = StadiumUtils.getCoordinateFromYards(pos.team, pos.yards).x;

    const d1 = room.getDisc(this.firstDownDiscsIndex[0]);
    const d2 = room.getDisc(this.firstDownDiscsIndex[1]);

    if (!d1 || !d2) return;

    d1.setPosition({ x, y: MapMeasures.OuterField[0].y });
    d2.setPosition({ x, y: MapMeasures.OuterField[1].y });
  }

  public resetFirstDownLine(room: Room) {
    const d1 = room.getDisc(this.firstDownDiscsIndex[0]);
    const d2 = room.getDisc(this.firstDownDiscsIndex[1]);

    if (!d1 || !d2) return;

    d1.setPosition({ x: 0, y: 0 });
    d2.setPosition({ x: 0, y: 0 });
  }

  public qbPassedInSack() {
    if (
      this.game.playerWithBall?.id === this.game.quarterback.id &&
      this.sack
    ) {
      this.sack = false;
    }
  }

  public setReceiver(room: Room, player: Player) {
    this.game.setPlayerWithBall(
      room,
      player,
      PlayerWithBallState.Receiver,
      false,
    );

    this.game.matchStats.add(player, { recepcoes: 1 });
    this.game.matchStats.add(this.game.quarterback, { passesCompletos: 1 });

    this.addDownInfoMoment(room, "reception");

    room.send({
      message: translate("BALL_RECEIVED", player.name),
      color: Global.Color.Yellow,
      style: "bold",
    });
  }

  public handleFirstDownLine(room: Room) {
    if (this.isFirstDownLineInsideEndZone() || this.goalMode) {
      this.resetFirstDownLine(room);
    } else {
      this.setFirstDownLine(room);
    }
  }

  public isFirstDownLineInsideEndZone() {
    const firstDownLinePos = StadiumUtils.addYardsToFieldPosition(
      this.game.ballPosition,
      this.game.distance,
      this.game.teamWithBall,
      true,
    );

    if (firstDownLinePos.yards < 1) {
      return true;
    } else {
      return false;
    }
  }

  private getDownEmoji(down: number) {
    let emoji = "";

    switch (down) {
      case 0 | 1:
        emoji = "1️⃣";
        break;
      case 2:
        emoji = "2️⃣";
        break;
      case 3:
        emoji = "3️⃣";
        break;
      case 4:
        emoji = "4️⃣";
        break;
      default:
        emoji = "*️⃣";
        break;
    }

    return emoji;
  }

  private playerTouchBallHike(room: Room, player: Player) {
    if (this.game.playerWithBall) return;

    const hikeTimeStatus = this.game.getHikeTimeStatus();
    const isWaitingHike = this.game.mode === this.waitingHikeMode;

    if (player.getTeam() !== this.game.teamWithBall) {
      if (isWaitingHike || !hikeTimeStatus.isOver) {
        const formattedTime = this.game.getHikeTimeRemainingFormatted(
          hikeTimeStatus.time,
        );

        let penalty = this.illegalTouchPenalty;

        if (
          StadiumUtils.isInRedZone(
            this.game.ballPosition,
            this.game.invertTeam(this.game.teamWithBall),
          )
        ) {
          this.game.redZonePenalties++;

          if (this.game.redZonePenalties >= this.maxPenaltiesInRedZone) {
            const message = isWaitingHike
              ? translate("ILLEGAL_TOUCH_OF", player.name)
              : translate("ILLEGAL_TOUCH_OF_AT", player.name, formattedTime);

            this.setRedZoneTouchdown(
              room,
              this.game.teamWithBall,
              [player],
              message,
            );

            return;
          } else {
            penalty = this.game.getPenaltyValueInRedZone(
              this.illegalTouchPenalty,
            );

            const message = isWaitingHike
              ? translate(
                  "ILLEGAL_TOUCH_REDZONE_OF_PENALTY",
                  player.name,
                  this.game.redZonePenalties,
                  this.maxPenaltiesInRedZone,
                  penalty,
                )
              : translate(
                  "ILLEGAL_TOUCH_REDZONE_OF_AT_PENALTY",
                  player.name,
                  formattedTime,
                  this.game.redZonePenalties,
                  this.maxPenaltiesInRedZone,
                  penalty,
                );

            room.send({ message, color: Global.Color.Orange, style: "bold" });
          }
        } else {
          const message = isWaitingHike
            ? translate("ILLEGAL_TOUCH_OF_PENALTY", player.name, penalty)
            : translate(
                "ILLEGAL_TOUCH_OF_AT_PENALTY",
                player.name,
                formattedTime,
                penalty,
              );

          room.send({ message, color: Global.Color.Orange, style: "bold" });
        }

        if (!isWaitingHike) this.game.matchStats.add(player, { faltas: 1 });

        this.game.adjustGameTimeAfterDefensivePenalty(
          room,
          this.downSetTime - this.game.tickCount,
        );

        this.set({ room, decrement: penalty, countDown: false });
      } else {
        this.game.setPlayerWithBall(
          room,
          this.game.quarterback,
          PlayerWithBallState.QbRunnerSacking,
          true,
        );

        this.sack = true;

        room.send({
          message: translate(
            "SACK_ATTEMPT",
            player.name,
            this.game.quarterback.name,
          ),
          color: Global.Color.DeepSkyBlue,
          style: "bold",
        });
      }
    } else if (this.game.quarterback) {
      room.send({
        message: translate("ILLEGAL_TOUCH_OF", player.name),
        color: Global.Color.Orange,
        style: "bold",
      });

      this.game.matchStats.add(player, { faltas: 1 });

      if (!this.game.conversion) {
        this.set({ room, decrement: this.attackIllegalTouchPenalty });
      } else {
        this.game.resetToKickoff(room);
      }
    }
  }

  private handleInterception(room: Room, player: Player) {
    this.game.interceptAttemptPlayer = player;

    this.game.lockBall(room);

    const ballPos = room.getBall().getPosition();
    const ballSpeedX = room.getBall().getVelocityX();

    this.game.interceptionTimeout = new Timer(() => {
      const ballPath = MathUtils.getBallPathFromPosition(
        ballPos,
        room.getBall().getPosition(),
        2000,
      );

      // const multiplierRed = player.getTeam() === Team.Red ? 1.3 : 1.1;
      // const multiplierBlue = player.getTeam() === Team.Blue ? 1.3 : 1.1;

      const multiplier = 1.1;

      let pointOfIntersection;

      if (ballSpeedX < 0) {
        pointOfIntersection = MathUtils.getPointOfIntersection(
          ballPath[0].x,
          ballPath[0].y,
          ballPath[1].x,
          ballPath[1].y,
          MapMeasures.RedGoalLine[0].x,
          MapMeasures.RedGoalLine[0].y * multiplier,
          MapMeasures.RedGoalLine[1].x,
          MapMeasures.RedGoalLine[1].y * multiplier,
        );
      } else {
        pointOfIntersection = MathUtils.getPointOfIntersection(
          ballPath[0].x,
          ballPath[0].y,
          ballPath[1].x,
          ballPath[1].y,
          MapMeasures.BlueGoalLine[0].x,
          MapMeasures.BlueGoalLine[0].y * multiplier,
          MapMeasures.BlueGoalLine[1].x,
          MapMeasures.BlueGoalLine[1].y * multiplier,
        );
      }

      if (!this.game.playerWithBall || (this.sack && !this.sackBallTouched)) {
        try {
          if (pointOfIntersection === false) throw "Missed interception";

          room.send({
            message: translate("INTERCEPTION_ATTEMPT_DETECTED", player.name),
            color: Global.Color.Yellow,
            style: "bold",
          });

          if (room.getBall().getVelocity() < this.minimumIntVelocity) {
            this.game.setBallDamping(room, Global.BallDamping.Highest);
          } else {
            this.game.setBallDamping(room, Global.BallDamping.High);
          }
        } catch (err) {
          this.game.interceptAttemptPlayer = null;

          if (!this.sack) {
            this.game.blockPass(room, player);
          } else {
            this.sackBallTouched = true;
          }
        }
      }
    }, 0);
  }

  private isBallOutsideField(room: Room) {
    return StadiumUtils.isOutOfMap(
      room.getBall().getPosition(),
      -room.getBall().getRadius(),
    );
  }

  private handleBallOutsideField(room: Room) {
    if (!this.game.conversion) {
      room.send({
        message: translate("BALL_OUTSIDE_FIELD"),
        color: Global.Color.Orange,
        style: "bold",
      });

      this.set({ room });
    } else {
      room.send({
        message: translate("BALL_OUTSIDE_FIELD_CONVERSION"),
        color: Global.Color.Orange,
        style: "bold",
      });

      this.game.resetToKickoff(room);
    }
  }

  private hasQBBallPassedScrimmageLine(room: Room) {
    if (!this.game.quarterback) return false;

    const ballLinePos = StadiumUtils.getCoordinateFromYards(
      this.game.ballPosition,
    );
    const ballPos = room.getBall().getPosition();

    return (
      (this.game.quarterback.getTeam() === Team.Red &&
        ballPos.x > ballLinePos.x) ||
      (this.game.quarterback.getTeam() === Team.Blue &&
        ballPos.x < ballLinePos.x)
    );
  }

  private handleQBBallPassedScrimmageLine(room: Room) {
    this.game.matchStats.add(this.game.quarterback, { faltas: 1 });

    if (!this.game.conversion) {
      room.send({
        message: translate("BALL_PASSED_SCRIMMAGE_LINE"),
        color: Global.Color.Orange,
        style: "bold",
      });

      this.set({ room });
    } else {
      room.send({
        message: translate("BALL_PASSED_SCRIMMAGE_LINE_CONVERSION"),
        color: Global.Color.Orange,
        style: "bold",
      });

      this.game.resetToKickoff(room);
    }
  }

  private hasQBPassedScrimmageLine(room: Room) {
    if (!this.game.quarterback) return false;

    const ballPos = StadiumUtils.getCoordinateFromYards(this.game.ballPosition);

    return (
      (this.game.quarterback.getTeam() === Team.Red &&
        this.game.quarterback.getX() > ballPos.x) ||
      (this.game.quarterback.getTeam() === Team.Blue &&
        this.game.quarterback.getX() < ballPos.x)
    );
  }

  private handleQBPassedScrimmageLine(
    room: Room,
    hikeTimeStatus: HikeTimeStatus,
    hikeTimeFormatted: string,
  ) {
    if (!hikeTimeStatus.isOver) {
      this.game.matchStats.add(this.game.quarterback, { faltas: 1 });

      if (!this.game.conversion) {
        room.send({
          message: translate("QUARTERBACK_BLITZ", hikeTimeFormatted),
          color: Global.Color.Orange,
          style: "bold",
        });

        this.set({
          room,
          decrement: this.qbPassedScrimmageLinePenalty,
        });
      } else {
        room.send({
          message: translate("QUARTERBACK_BLITZ_CONVERSION", hikeTimeFormatted),
          color: Global.Color.Orange,
          style: "bold",
        });

        this.game.resetToKickoff(room);
      }
    } else {
      this.handleQBAttemptingRun(room);
    }
  }

  private qbIsAttemptingRun(room: Room) {
    const isHikeTimeOver = this.game.getHikeTimeStatus().isOver;

    return (
      !this.game.qbKickedBall &&
      isHikeTimeOver &&
      this.game.quarterback.distanceTo(room.getBall()) > 100
    );
  }

  private handleQBAttemptingRun(room: Room) {
    this.game.setPlayerWithBall(
      room,
      this.game.quarterback,
      PlayerWithBallState.QbRunner,
      true,
    );

    room.send({
      message: translate("QUARTERBACK_RUN", this.game.quarterback.name),
      color: Global.Color.DeepSkyBlue,
      style: "bold",
    });

    this.game.updatePlayersPosition(room);

    this.game.matchStats.add(this.game.quarterback, { corridasQb: 1 });
  }

  private isQBCarryingBall(room: Room) {
    const ball = room.getBall();
    const ballPos = StadiumUtils.getCoordinateFromYards(
      this.game.ballPosition.team,
      this.game.ballPosition.yards,
    );

    return (
      (this.game.quarterback &&
        this.game.quarterback.distanceTo(ball) > 5 &&
        (Math.abs(ball.getX() - ballPos.x) > 2 ||
          Math.abs(ball.getY() - ballPos.y) > 2)) ||
      ball.distanceTo(Object.assign(ballPos, { radius: ball.getRadius() })) >
        this.hikeMaxDistanceMoveBall
    );
  }

  private checkInterceptionFailed(room: Room) {
    if (MathUtils.getBallSpeed(room.getBall()) < 0.1) {
      return true;
    }

    return false;
  }

  private handleInterceptionFailed(room: Room) {
    this.game.setBallDamping(room, Global.BallDamping.Default);

    if (!this.sack) {
      room.send({
        message: translate(
          "INTERCEPTION_FAILED",
          this.game.interceptAttemptPlayer.name,
          this.game.interceptAttemptPlayer.name,
        ),
        color: Global.Color.Orange,
        style: "bold",
      });

      this.game.blockPass(room, this.game.interceptAttemptPlayer, false);
    } else {
      room.send({
        message: translate(
          "INTERCEPTION_FAILED_SACK",
          this.game.interceptAttemptPlayer.name,
          this.game.interceptAttemptPlayer.name,
        ),
        color: Global.Color.Orange,
        style: "bold",
      });

      this.sackBallTouched = true;
    }

    this.game.interceptAttemptPlayer = null;
  }

  private handleInterceptionSuccess(room: Room) {
    const ball = room.getBall();

    if (
      ball.getDamping() === Global.BallDamping.Highest &&
      ball.getVelocity() > this.maximumHighestDampingIntVelocity
    ) {
      this.game.setBallDamping(room, Global.BallDamping.High);
    }
  }

  private addDownInfoMoment(room: Room, type: DownMoment) {
    this.downInfo?.addMomentInfo(type, {
      ballPosition: room.getBall().getPosition(),
      time: this.game.tickCount,
      players: room
        .getPlayers()
        .teams()
        .map((p) => {
          const getType = (p: Player) => {
            if (p.id === this.game.quarterback.id) return "qb";
            if (p.getTeam() === this.game.teamWithBall) return "wr";
            return "def";
          };

          return {
            player: p,
            withBall: this.game.playerWithBall?.id === p.id,
            type: getType(p),
          };
        }),
    });
  }

  private getHoldingPlayers(room: Room) {
    const isHikeTimeOver = this.game.getHikeTimeStatus().isOver;

    if (this.game.playerWithBall || isHikeTimeOver || this.game.qbKickedBall)
      return;

    for (const player of this.game.getTeamWithoutBall(room)) {
      let ballLinePos = StadiumUtils.getCoordinateFromYards(
        this.game.ballPosition,
      ).x;

      if (
        (this.game.teamWithBall === Team.Red && player.getX() > ballLinePos) ||
        (this.game.teamWithBall === Team.Blue && player.getX() < ballLinePos)
      )
        continue;

      const minimumVelocity = 0;

      const holdingPlayers = this.game
        .getTeamWithBall(room)
        .filter(
          (attacker) =>
            attacker.id !== this.game.quarterback.id &&
            attacker.distanceTo(player) < 1.5 &&
            (player.getTeam() === Team.Blue
              ? player.getVelocityX() < 0
              : player.getVelocityX() > 0) &&
            ((attacker.getTeam() === Team.Red &&
              attacker.getX() > player.getX() &&
              attacker.getVelocityX() < -minimumVelocity) ||
              (attacker.getTeam() === Team.Blue &&
                attacker.getX() < player.getX() &&
                attacker.getVelocityX() > minimumVelocity)),
        );

      return holdingPlayers.length > 0 ? holdingPlayers : undefined;
    }
  }

  private handleHoldingPlayers(room: Room, holdingPlayers: Player[]) {
    holdingPlayers.forEach((p) => {
      this.game.matchStats.add(p, { faltas: 1 });
      this.game.customAvatarManager.setPlayerAvatar(p, "🤡", 3000);
    });

    if (!this.game.conversion) {
      room.send({
        message: translate(
          "HOLDING",
          Utils.getPlayersNames(holdingPlayers),
          Math.abs(this.holdingPenalty),
        ),
        color: Global.Color.Orange,
        style: "bold",
      });

      this.set({ room, decrement: this.holdingPenalty });
    } else {
      room.send({
        message: translate(
          "HOLDING_CONVERSION",
          Utils.getPlayersNames(holdingPlayers),
        ),
        color: Global.Color.Orange,
        style: "bold",
      });

      this.game.resetToKickoff(room);
    }

    return;
  }

  private getDefensePlayersTrespassing(room: Room) {
    const isHikeTimeOver = this.game.getHikeTimeStatus().isOver;

    for (const player of this.game.getTeamWithoutBall(room)) {
      if (!this.game.qbKickedBall) {
        let ballLinePos = StadiumUtils.getCoordinateFromYards(
          this.game.ballPosition,
        ).x;

        if (
          ((this.game.teamWithBall === Team.Red &&
            player.getX() < ballLinePos) ||
            (this.game.teamWithBall === Team.Blue &&
              player.getX() > ballLinePos)) &&
          (!this.game.playerWithBall || !isHikeTimeOver)
        ) {
          return player;
        }
      }
    }
  }

  private handleIllegalTrespassing(
    room: Room,
    trespassingDefender: Player,
    hikeTimeFormatted: string,
  ) {
    let penalty = this.defenseTrespasserPenalty;

    this.game.matchStats.add(trespassingDefender, { faltas: 1 });

    if (
      StadiumUtils.isInRedZone(
        this.game.ballPosition,
        this.game.invertTeam(this.game.teamWithBall),
      )
    ) {
      this.game.redZonePenalties++;

      if (this.game.redZonePenalties >= this.maxPenaltiesInRedZone) {
        this.setRedZoneTouchdown(
          room,
          this.game.teamWithBall,
          this.game.invasionPlayers,
          translate(
            "AUTO_TOUCHDOWN_BLITZ",
            trespassingDefender.name,
            hikeTimeFormatted,
          ),
        );

        this.game.adjustGameTimeAfterDefensivePenalty(room);

        this.game.redZonePenalties = 0;

        return;
      } else {
        penalty = this.game.getPenaltyValueInRedZone(this.trespassingPenalty);

        room.send({
          message: translate(
            "REDZONE_BLITZ",
            trespassingDefender.name,
            hikeTimeFormatted,
            this.game.redZonePenalties,
            this.maxPenaltiesInRedZone,
            penalty,
          ),
          color: Global.Color.Orange,
          style: "bold",
        });
      }
    } else {
      room.send({
        message: translate(
          "BLITZ",
          trespassingDefender.name,
          hikeTimeFormatted,
          penalty,
        ),
        color: Global.Color.Orange,
        style: "bold",
      });
    }

    this.game.adjustGameTimeAfterDefensivePenalty(room);

    this.set({ room, decrement: penalty, countDown: false });
  }

  private handleSackAttempt(room: Room, trespassingDefender: Player) {
    this.game.setPlayerWithBall(
      room,
      this.game.quarterback,
      PlayerWithBallState.QbRunnerSacking,
      true,
    );

    this.sack = true;

    room.send({
      message: translate(
        "SACK_ATTEMPT",
        trespassingDefender.name,
        this.game.quarterback.name,
      ),
      color: Global.Color.DeepSkyBlue,
      style: "bold",
    });
  }

  private getPlayerTouchingBall(room: Room) {
    for (const player of room.getPlayers().teams()) {
      if (player.id === this.game.quarterback.id) continue;

      if (GameUtils.isPlayerTouchingBall(player, room.getBall())) return player;
    }
  }

  private getRunningBackAttemptingRun(room: Room) {
    for (const player of this.game.getTeamWithBall(room)) {
      if (player.id === this.game.quarterback.id) continue;

      if (player.distanceTo(this.game.quarterback) <= 0.1) {
        return { valid: true, player };
      }
    }

    return;
  }

  private handleRunningBackAttemptingRun(
    room: Room,
    run: { valid: boolean; player: Player },
  ) {
    if (run.valid) {
      room.send({
        message: translate("RUN", run.player.name),
        color: Global.Color.DeepSkyBlue,
        style: "bold",
      });

      this.game.matchStats.add(run.player, { corridas: 1 });

      this.game.updatePlayersPosition(room);

      this.game.setPlayerWithBall(
        room,
        run.player,
        PlayerWithBallState.Runner,
        true,
      );
    } else {
      this.game.matchStats.add(run.player, { faltas: 1 });

      if (!this.game.conversion) {
        room.send({
          message: translate("ILLEGAL_RUN_HIKE", run.player.name),
          color: Global.Color.Orange,
          style: "bold",
        });

        this.set({ room });
      } else {
        room.send({
          message: translate("ILLEGAL_RUN_CONVERSION", run.player.name),
          color: Global.Color.Orange,
          style: "bold",
        });

        this.game.resetToKickoff(room);
      }
    }
  }

  private getWideReceiverCatchingBall(room: Room) {
    if (this.game.qbKickedBall) {
      for (const player of this.game.getTeamWithBall(room)) {
        if (GameUtils.isPlayerTouchingBall(player, room.getBall())) {
          return player;
        }
      }
    }
  }

  private handleWideReceiverCatchingBall(
    room: Room,
    wideReceiverCatchingBall: Player,
  ) {
    if (!StadiumUtils.isOutOfMap(wideReceiverCatchingBall.getPosition(), 0)) {
      this.qbPassedInSack();

      this.setReceiver(room, wideReceiverCatchingBall);
    } else {
      if (!this.game.conversion) {
        room.send({
          message: "❌ Recepção fora de campo • Perde a descida",
          color: Global.Color.Orange,
          style: "bold",
        });

        this.set({ room });
      } else {
        room.send({
          message: "❌ Recepção fora de campo • Perde a conversão",
          color: Global.Color.Orange,
          style: "bold",
        });

        this.game.resetToKickoff(room);
      }
    }
  }

  private getDefenderBlockingBall(room: Room) {
    for (const player of this.game.getTeamWithoutBall(room)) {
      if (player.distanceTo(room.getBall()) < 0.2) {
        return player;
      }
    }
  }

  private handleDefenderBlockingBall(room: Room, defenderBlockingBall: Player) {
    this.defenderBlockingBall = defenderBlockingBall;
    this.game.blockedPass = true;

    setTimeout(() => {
      if (
        !this.game.interceptAttemptPlayer &&
        !this.game.intercept &&
        this.game.mode === this.mode &&
        (this.sack ? !this.sackBallTouched : true)
      ) {
        if (this.sack) {
          this.sackBallTouched = true;
        } else {
          this.game.blockPass(room, defenderBlockingBall);
        }
      }
    }, 100);
  }

  private checkPlayerWithBallInAdvantage(room: Room) {
    const playerWithBallIsInAdvantage = room
      .getPlayers()
      .filter((p) => p.getTeam() !== this.game.teamWithBall)
      .every((p) => {
        const radius =
          p.distanceTo(this.game.playerWithBall) < p.getRadius() * 2
            ? p.getRadius()
            : 0;

        return this.game.playerWithBall.getTeam() === Team.Red
          ? p.getX() + radius < this.game.playerWithBall.getX()
          : p.getX() - radius > this.game.playerWithBall.getX();
      });

    return playerWithBallIsInAdvantage;
  }

  private handlePlayerWithBallInAdvantage(room: Room) {
    this.addDownInfoMoment(room, "advantage");
  }

  @Command({
    name: "clearhiketime",
    aliases: ["cht"],
  })
  resetHikeTimeCommand($: CommandInfo, room: Room) {
    if (!$.caller.isAdmin()) {
      $.caller.reply({
        message: translate("NOT_ADMIN"),
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    if (!room.isGameInProgress()) {
      $.caller.reply({
        message: translate("GAME_NOT_IN_PROGRESS"),
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if (this.game.mode !== this.waitingHikeMode) {
      $.caller.reply({
        message: translate("CANNOT_USE_COMMAND_IN_PLAY"),
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    const arg = $.args[0];

    if (arg === "disable") {
      this.hikeTimeEnabled = false;
      this.game.clearHikeTime();

      room.send({
        message: translate("COMMAND_CHT_DISABLE_ALL", $.caller.name),
        color: Global.Color.Pink,
        style: "bold",
      });
    } else if (arg === "enable") {
      this.hikeTimeEnabled = true;

      room.send({
        message: translate("COMMAND_CHT_ENABLE", $.caller.name),
        color: Global.Color.Pink,
        style: "bold",
      });
    } else {
      this.game.clearHikeTime();

      room.send({
        message: translate("COMMAND_CHT_DISABLE_THIS", $.caller.name),
        color: Global.Color.Pink,
        style: "bold",
      });
    }

    return false;
  }
}
