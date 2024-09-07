import Module from "../core/Module";
import { Team } from "../core/Global";

import * as Global from "../Global";

import type Room from "../core/Room";
import type Player from "../core/Player";

import BFL from "../maps/BFL.json";

import { Down } from "./modes/Down";
import { FieldGoal } from "./modes/FieldGoal";
import { Punt } from "./modes/Punt";
import { KickOff } from "./modes/KickOff";
import Timer from "../utils/Timer";
import StadiumUtils from "../utils/StadiumUtils";
import Utils from "../utils/Utils";
import GameCommands from "./GameCommands";
import CustomTeams from "./CustomTeams";
import MatchStats from "./MatchStats";
import { ExtraPoint } from "./modes/ExtraPoint";
import translate from "../utils/Translate";
import { Safety } from "./modes/Safety";
import MapMeasures from "../utils/MapMeasures";
import { CustomAvatarManager } from "./CustomAvatarManager";
import MathUtils from "../utils/MathUtils";

const BALL_AVATAR = "🏈";

export enum PlayerWithBallState {
  Receiver = 1,
  Runner = 2,
  QbRunner = 3,
  QbRunnerSacking = 4,
  PuntReturner = 5,
  KickoffReturner = 6,
  Intercepter = 7,
  Sack = 8,
}

export enum GameModes {
  Down = 1,
  FieldGoal = 2,
  Punt = 3,
  Kickoff = 4,
  ExtraPoint = 5,
  Safety = 6,
  WaitingHike = 7,
}

class Game extends Module {
  public down: Down;
  public fieldGoal: FieldGoal;
  public punt: Punt;
  public kickOff: KickOff;
  public extraPoint: ExtraPoint;
  public safety: Safety;
  public gameCommands: GameCommands;
  public customTeams: CustomTeams;
  public customAvatarManager: CustomAvatarManager;
  public mode: GameModes;
  public teamWithBall: Team;
  public playerWithBall: Player;
  public playerWithBallState?: PlayerWithBallState;
  public playerWithBallTackleCount = 0;
  public playerWithBallInitialPosition: Position;
  public playerWithBallFinalPosition: Position;
  public quarterback: Player;
  public qbKickedBall = false;
  public hikeTime: number;
  public running = false;
  public inRedZone = false;
  public interceptAttemptPlayer: Player;
  public interceptPlayer: Player;
  public interceptPlayerLeftEndZone = false;
  public blockedPass = false;
  public conversion = false;
  public intercept = false;
  public ballPosition: Global.FieldPosition;
  public downCount = 0;
  public distance = 20;
  public yardsBallBehind = 2;
  public hikeTimeout: Timer;
  public interceptionTimeout: Timer;
  public kickOffReset: Timer;
  public extraPointTimeout: Timer;
  public touchdownExtraPointTimeout: Timer;
  public failedFielGoalTimeout: Timer;
  public fieldGoalTimeout: Timer;
  public redZonePenalties = 0;
  public invasionPlayers: Player[] = [];
  public invasionTimeout: Timer;
  public teamPlayersHistory: Global.TeamPlayersHistory = [];
  public ballMovedTimeFG: number;
  public overtime = false;
  public gameStopped = false;
  public lastPlayMessageSent = false;
  public timeLimit = 10;
  public hikeTimeSeconds = 12;
  public carryBallSackTime = 4;
  public finalSeconds = 10;
  public isStoppageTime = false;
  public stadium = this.getDefaultMap();
  public gameTime: number;
  public gameTimeSecondsToSendRec = 1 * 60;
  public endGameTime: number;
  public firstKickoff = true;
  public matchStats: MatchStats;
  public tickCount = 0;
  public firstTackleTick: number;
  public timeToSendTackleMessageSeconds = 0.5;
  public playerWithBallSetTick: number;
  public canChangeMap = false;
  public shouldResetMap = false;
  public lastPlayerPositions: Map<number, number> = new Map();

  private scoreRed = 0;
  private scoreBlue = 0;
  private stoppageTimeMs = 0;
  private playerLineLengthForEvenlyPositiong = 110;
  private playerCbPositionY = 100;
  private offensiveDistanceSpawnYardsHike = 12;
  private defensiveDistanceSpawnYardsHike = 10;
  private cbDistanceSpawnYardsHike = 6;

  constructor(room: Room) {
    super();

    this.matchStats = new MatchStats(room);

    this.run(room);
  }

  private run(room: Room) {
    room.lockTeams();
    room.setScoreLimit(0);
    room.setTimeLimit(this.timeLimit);
    room.setStadium(this.stadium);

    this.down = room.module(Down, this) as Down;
    this.punt = room.module(Punt, this) as Punt;
    this.fieldGoal = room.module(FieldGoal, this) as FieldGoal;
    this.kickOff = room.module(KickOff, this) as KickOff;
    this.extraPoint = room.module(ExtraPoint, this) as ExtraPoint;
    this.safety = room.module(Safety, this) as Safety;

    this.gameCommands = room.module(GameCommands, this) as GameCommands;
    this.customTeams = room.module(CustomTeams, this) as CustomTeams;
    this.customAvatarManager = new CustomAvatarManager(room);

    room.on("playerBallKick", (player: Player) => {
      this.setBallMoveable(room);
    });

    /* Mover isso aqui pras classes */
    room.on("playerLeave", (player: Player) => {
      if (!room.isGameInProgress()) return;

      if (player.id === this.playerWithBall?.id) {
        this.playerWithBallLeft(room, player);
      } else if (player.id === this.quarterback?.id) {
        this.qbLeft(room);
      }

      const playerHist = this.teamPlayersHistory.find(
        (p) => p.id === player.id && p.timeLeft == null,
      );

      if (playerHist) {
        playerHist.timeLeft = room.getScores().time;
      }

      if (player.getTeam() !== Team.Spectators) room.pause();
    });

    room.on("playerTeamChanged", (changedPlayer, byPlayer) => {
      if (!room.isGameInProgress()) return;

      if (changedPlayer.id === this.playerWithBall?.id) {
        this.playerWithBallLeft(room, changedPlayer);
      } else if (changedPlayer.id === this.quarterback?.id) {
        this.qbLeft(room);
      }

      if (changedPlayer.getTeam() !== Team.Spectators) {
        this.matchStats.add(changedPlayer);
      }

      this.customAvatarManager.clearPlayerAvatar(changedPlayer.id);

      const playerHist = this.teamPlayersHistory.find(
        (p) => p.id === changedPlayer.id && p.timeLeft == null,
      );

      if (playerHist) {
        if (playerHist.team !== changedPlayer.getTeam()) {
          playerHist.timeLeft = room.getScores().time;

          if (changedPlayer.getTeam() !== Team.Spectators) {
            this.addPlayerToTeamHistory(changedPlayer, room);
          }
        }
      } else {
        this.addPlayerToTeamHistory(changedPlayer, room);
      }
    });

    room.on("gameStop", (byPlayer: Player) => {
      this.mode = null;

      this.customAvatarManager.clearAll();

      const rec = room.stopRecording();

      if (this.gameTime >= this.gameTimeSecondsToSendRec) {
        this.matchStats.sendToDiscord(
          rec,
          this,
          this.teamPlayersHistory.map((p) => {
            if (p.timeLeft == null) p.timeLeft = this.gameTime;

            return {
              ...p,
              points: this.matchStats.calculatePointsPlayer(p.id) ?? 0,
            };
          }),
        );
      }

      if (this.scoreBlue !== this.scoreRed) {
        const teamWon = this.scoreBlue > this.scoreRed ? Team.Blue : Team.Red;

        if (byPlayer) {
          room.send({
            message: translate(
              "GAME_STOPPED_BY",
              byPlayer.name,
              this.scoreRed,
              this.scoreBlue,
            ),
            color: Global.Color.LimeGreen,
            style: "bold",
            sound: 2,
          });
        } else {
          room.send({
            message: translate(
              "GAME_WIN",
              this.getCustomTeamName(teamWon),
              this.scoreRed,
              this.scoreBlue,
            ),
            color: Global.Color.LimeGreen,
            style: "bold",
            sound: 2,
          });
        }

        this.customTeams.setTeamToMaintainUniform(teamWon);
      } else {
        this.customTeams.setTeamToMaintainUniform(null);
      }

      this.teamPlayersHistory = [];

      this.gameTime = null;
      this.teamWithBall = null;
      this.downCount = 0;
      this.distance = 20;

      this.scoreBlue = 0;
      this.scoreRed = 0;

      this.stoppageTimeMs = 0;

      this.tickCount = 0;

      this.overtime = false;
      this.gameStopped = false;
      this.lastPlayMessageSent = false;
      this.isStoppageTime = false;
      this.firstKickoff = true;

      this.lastPlayerPositions = new Map();

      const mvp = this.matchStats.getMVP();

      this.matchStats.clear();

      if (mvp)
        room.send({
          message: `🏆 MVP: ${mvp.name} (${mvp.points} pontos)`,
          color: Global.Color.Gold,
          style: "bold",
        });

      this.reset(room);
      this.resetPlay(room);

      if (this.shouldResetMap) {
        room.setStadium(BFL);
        this.shouldResetMap = false;
      }
    });

    room.on("gameStart", (byPlayer: Player) => {
      this.endGameTime = room.getScores().timeLimit;

      this.kickOff.set({ room, forTeam: Team.Red });

      room.startRecording();

      this.matchStats.clear();

      this.overtime = false;

      this.teamPlayersHistory = [
        ...room
          .getPlayers()
          .teams()
          .map((p) => {
            return {
              id: p.id,
              name: p.name,
              timeJoin: 0,
              auth: p.auth,
              registered: p.roles.includes(Global.loggedRole),
              team: p.getTeam(),
            };
          }),
      ];

      room
        .getPlayers()
        .forEach((p) => this.customAvatarManager.clearPlayerAvatar(p.id));
    });

    room.on("gameTick", () => {
      if (this.gameStopped) return;

      this.matchStats.setTick(++this.tickCount);

      this.customAvatarManager.run();

      this.gameTime = room.getScores().time;

      if (
        this.gameTime > this.endGameTime &&
        !this.kickOff.isBallToBeKicked &&
        this.stoppageTimeMs !== 0 &&
        !this.isStoppageTime
      ) {
        Utils.sendSoundTeamMessage(room, {
          message: `​⏰​ Acréscimos de jogo: +${Utils.getFormattedSeconds(parseInt((this.stoppageTimeMs / 1000).toFixed(2)))} • Novo tempo limite: ${Utils.fancyTimeFormat(this.stoppageTimeMs / 1000 + this.endGameTime)}`,
          color: Global.Color.Yellow,
          style: "bold",
        });

        this.isStoppageTime = true;
      }

      const stoppageTimeEnded =
        this.isStoppageTime &&
        this.stoppageTimeMs / 1000 + this.endGameTime < this.gameTime;

      if (
        this.gameTime > this.endGameTime &&
        this.endGameTime !== 0 &&
        (stoppageTimeEnded || this.stoppageTimeMs === 0)
      ) {
        if (
          this.mode !== this.down.mode &&
          this.mode !== this.fieldGoal.mode &&
          this.mode !== this.extraPoint.mode &&
          !this.conversion &&
          this.scoreRed !== this.scoreBlue &&
          !this.playerWithBall &&
          this.mode !== this.kickOff.mode
        ) {
          this.gameStopped = true;

          const teamWon = this.scoreRed > this.scoreBlue ? Team.Red : Team.Blue;
          const teamLost = this.invertTeam(teamWon);

          const losingPlayers = room
            .getPlayers()
            .filter((p) => p.getTeam() === teamLost);

          room.stop();

          setTimeout(() => {
            losingPlayers.forEach((p) => {
              p.setTeam(Team.Spectators);
            });
          }, 500);
        } else if (!this.lastPlayMessageSent) {
          if (this.scoreRed === this.scoreBlue) {
            Utils.sendSoundTeamMessage(room, {
              message: translate("OVERTIME"),
              color: Global.Color.Yellow,
              style: "bold",
            });

            this.overtime = true;
          } else {
            Utils.sendSoundTeamMessage(room, {
              message: translate("LAST_PLAY"),
              color: Global.Color.Yellow,
              style: "bold",
            });
          }

          this.lastPlayMessageSent = true;
        }
      }
    });

    room.on("stadiumChange", (newStadiumName, byPlayer) => {
      if (!byPlayer) return;
      if (this.canChangeMap) {
        this.canChangeMap = false;
        this.shouldResetMap = true;
        return;
      }

      byPlayer.reply({
        message: translate("CANNOT_CHANGE_MAP"),
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      room.setStadium(this.stadium);
    });

    room.on("gamePause", (byPlayer) => {
      this.kickOffReset?.pause();
      this.touchdownExtraPointTimeout?.pause();
      this.extraPointTimeout?.pause();
      this.failedFielGoalTimeout?.pause();
      this.fieldGoalTimeout?.pause();
    });

    room.on("gameUnpause", (byPlayer) => {
      this.kickOffReset?.resume();
      this.touchdownExtraPointTimeout?.resume();
      this.extraPointTimeout?.resume();
      this.failedFielGoalTimeout?.resume();
      this.fieldGoalTimeout?.resume();
    });
  }

  public setScore(props: { [Team.Red]?: number; [Team.Blue]?: number }) {
    if (props[Team.Red]) this.scoreRed = props[Team.Red];
    if (props[Team.Blue]) this.scoreBlue = props[Team.Blue];

    this.matchStats.emit("score", { red: this.scoreRed, blue: this.scoreBlue });
  }

  public incrementScore(props: { [Team.Red]?: number; [Team.Blue]?: number }) {
    if (props[Team.Red]) this.scoreRed += props[Team.Red];
    if (props[Team.Blue]) this.scoreBlue += props[Team.Blue];

    this.matchStats.emit("score", { red: this.scoreRed, blue: this.scoreBlue });
  }

  public getScore() {
    return {
      red: this.scoreRed,
      blue: this.scoreBlue,
    };
  }

  public isPlayerBehindLineOfScrimmage(player: Player) {
    const ballLinePos = StadiumUtils.getCoordinateFromYards(
      this.ballPosition,
    ).x;

    if (
      (this.teamWithBall === Team.Red && player.getX() < ballLinePos) ||
      (this.teamWithBall === Team.Blue && player.getX() > ballLinePos)
    ) {
      return true;
    }

    return false;
  }

  public getTeamWithBall(room: Room) {
    if (this.teamWithBall === Team.Red) return room.getPlayers().red();
    if (this.teamWithBall === Team.Blue) return room.getPlayers().blue();

    return null;
  }

  public getTeamWithoutBall(room: Room) {
    if (this.teamWithBall === Team.Red) return room.getPlayers().blue();
    if (this.teamWithBall === Team.Blue) return room.getPlayers().red();

    return null;
  }

  public getTeamName(team: Team) {
    return team === Team.Red ? "Red" : "Blue";
  }

  public getCustomTeamName(team: Team) {
    return team === Team.Red
      ? `${this.customTeams.getTeams().red.name} (Red)`
      : `${this.customTeams.getTeams().blue.name} (Blue)`;
  }

  public getStateOfMatch() {
    return `${this.downCount} & ${this.down.goalMode ? "Goal" : this.distance} @ ${this.getTeamName(this.ballPosition.team)} ${this.ballPosition.yards}`;
  }

  public getScoreMessage() {
    return `Red ${this.scoreRed} • ${this.scoreBlue} Blue`;
  }

  public getDefaultMap() {
    return JSON.parse(JSON.stringify(BFL));
  }

  public getBallStartPos() {
    const ballPos = StadiumUtils.getCoordinateFromYards(
      this.ballPosition.team,
      this.ballPosition.yards,
    );
    ballPos.x =
      ballPos.x +
      MapMeasures.Yard *
        this.yardsBallBehind *
        (this.teamWithBall === Team.Red ? -1 : 1);

    return ballPos;
  }

  public addPlayerToTeamHistory(player: Player, room: Room) {
    this.teamPlayersHistory.push({
      id: player.id,
      name: player.name,
      timeJoin: room.getScores().time,
      team: player.getTeam(),
      auth: player.auth,
      registered: player.roles.includes(Global.loggedRole),
    });
  }

  public clearHikeTime() {
    this.hikeTimeout?.stop();
    this.hikeTimeout = null;
  }

  public clearInvasion() {
    this.invasionTimeout?.stop();
    this.invasionTimeout = null;
  }

  public adjustGameTimeAfterDefensivePenalty(room: Room) {
    if (
      this.endGameTime - this.gameTime < this.finalSeconds &&
      this.endGameTime !== 0 &&
      !this.overtime
    ) {
      const newEndGame =
        this.endGameTime + (10 - (this.endGameTime - this.gameTime));

      if (this.endGameTime !== parseInt(newEndGame + "")) {
        this.endGameTime = newEndGame;

        Utils.sendSoundTeamMessage(room, {
          message: translate(
            "END_GAME_TIME_ADJUSTED_AFTER_PENALTY",
            Utils.fancyTimeFormat(this.endGameTime),
          ),
          color: Global.Color.Yellow,
          style: "bold",
        });

        this.lastPlayMessageSent = false;
      }
    }
  }

  public playerReturnedBall(room: Room, player: Player) {
    if (player.getTeam() === Team.Spectators) return;

    if (this.playerWithBall == null) {
      if (player.getTeam() !== this.teamWithBall) {
        const state =
          this.mode === this.punt.mode
            ? PlayerWithBallState.PuntReturner
            : PlayerWithBallState.KickoffReturner;

        this.setPlayerWithBall(room, player, state, true);

        if (this.mode === this.punt.mode)
          room.send({
            message: translate("RETURNED_PUNT", player.name),
            color: Global.Color.MediumSeaGreen,
            style: "bold",
          });
        else if (this.mode === this.kickOff.mode)
          room.send({
            message: translate("RETURNED_KICKOFF", player.name),
            color: Global.Color.MediumSeaGreen,
            style: "bold",
          });
      } else if (this.qbKickedBall) {
        room.send({
          message: translate("ILLEGAL_TOUCH_SAME_TEAM", player.name),
          color: Global.Color.Orange,
          style: "bold",
        });

        this.down.set({
          room,
          pos: StadiumUtils.getYardsFromXCoord(player.getX()),
          forTeam: this.invertTeam(this.teamWithBall),
          countDistanceFromNewPos: false,
          positionPlayersEvenly: true,
        });
      }
    }
  }

  public playerWithBallLeft(room: Room, player: Player) {
    const team = this.invertTeam(this.teamWithBall);
    const xCoord = player.getLastPosition().x;

    this.clearPlayerWithBall();

    if (this.mode === this.punt.mode || this.mode === this.kickOff.mode) {
      room.send({
        message: translate(
          "RECEIVER_LEFT_IN_KICK",
          this.mode === this.punt.mode ? "Punt" : "Kick Off",
        ),
        color: Global.Color.Orange,
        style: "bold",
      });
    } else {
      room.send({
        message: translate("RECEIVER_LEFT_IN_HIKE"),
        color: Global.Color.Orange,
        style: "bold",
      });
    }

    this.down.set({
      room,
      pos: StadiumUtils.getYardsFromXCoord(xCoord),
      forTeam: team,
    });
  }

  public qbLeft(room: Room) {
    if (this.mode === this.down.mode) {
      room.send({
        message: translate("QUARTERBACK_LEFT_IN_HIKE"),
        color: Global.Color.Orange,
        style: "bold",
      });

      this.down.set({ room, countDown: false });
    }
  }

  public setPlayerWithBall(
    room: Room,
    player: Player,
    state: PlayerWithBallState,
    running: boolean,
  ) {
    this.playerWithBallInitialPosition = player.getPosition();

    if (this.playerWithBall)
      this.customAvatarManager.clearPlayerAvatar(this.playerWithBall.id);
    this.customAvatarManager.setPlayerAvatar(player, BALL_AVATAR);

    this.unlockBall(room);
    this.setBallMoveable(room);

    this.playerWithBall = player;
    this.playerWithBallState = state;

    this.playerWithBallSetTick = this.tickCount;

    if (running) this.running = running;
  }

  public clearPlayerWithBall() {
    if (
      this.playerWithBall &&
      this.customAvatarManager.getPlayer(this.playerWithBall)?.avatar ===
        BALL_AVATAR
    ) {
      this.customAvatarManager.clearPlayerAvatar(this.playerWithBall.id);
    }

    this.playerWithBall = null;
    this.playerWithBallState = null;
    this.playerWithBallInitialPosition = null;
  }

  public setPlayerWithBallStats() {
    const yardsGain = StadiumUtils.getYardDifferenceBetweenPositions(
      StadiumUtils.getCoordinateFromYards(this.ballPosition),
      this.playerWithBallFinalPosition,
      this.playerWithBall.getTeam(),
    );
    const yac = StadiumUtils.getYardDifferenceBetweenPositions(
      this.playerWithBallInitialPosition,
      this.playerWithBallFinalPosition,
      this.playerWithBall.getTeam(),
    );

    switch (this.playerWithBallState) {
      case PlayerWithBallState.Receiver:
        this.matchStats.add(this.playerWithBall, {
          jardasRecebidas: yardsGain,
        });
        this.matchStats.add(this.playerWithBall, { yac: yac });

        if (this.quarterback)
          this.matchStats.add(this.quarterback, { jardasLancadas: yardsGain });
        break;
      case PlayerWithBallState.QbRunner:
      case PlayerWithBallState.QbRunnerSacking:
      case PlayerWithBallState.Runner:
        this.matchStats.add(this.playerWithBall, { jardasCorridas: yardsGain });
        break;
      case PlayerWithBallState.Sack:
        this.matchStats.add(this.playerWithBall, {
          jardasPerdidasSack: yardsGain,
        });
        break;
      case PlayerWithBallState.KickoffReturner:
      case PlayerWithBallState.PuntReturner:
        this.matchStats.add(this.playerWithBall, {
          jardasRetornadas: yac,
          retornos: 1,
        });
        break;
      default:
        break;
    }
  }

  public blockPass(room: Room, player: Player, message = true) {
    if (message)
      room.send({
        message:
          translate("INCOMPLETE_PASS", player.name) +
          (this.conversion
            ? " " + translate("INCOMPLETE_PASS_CONVERSION_FAILED")
            : ""),
        color: Global.Color.Yellow,
        style: "bold",
      });

    this.unlockBall(room);

    this.customAvatarManager.setPlayerAvatar(player, "🚧", 3000);

    this.matchStats.add(player, { passesBloqueados: 1 });

    this.mode = null;

    if (this.conversion) {
      this.mode = null;
      this.kickOffReset = new Timer(() => {
        this.kickOff.set({ room });
      }, 3000);
    } else {
      setTimeout(
        () => room.isGameInProgress() && this.down.set({ room }),
        1500,
      );
    }
  }

  public resetToKickoff(
    room: Room,
    forTeam: Team = !(this.intercept && this.conversion)
      ? this.teamWithBall
      : this.invertTeam(this.teamWithBall),
  ) {
    if (this.conversion) {
      Utils.sendSoundTeamMessage(room, {
        message: translate(
          "CONVERSION_FAILED",
          this.getTeamName(forTeam).toUpperCase(),
        ),
        color: Global.Color.Yellow,
        style: "bold",
      });
    }

    this.mode = null;
    this.reset(room);
    this.kickOffReset = new Timer(
      () => this.kickOff.set({ room, forTeam }),
      3000,
    );
  }

  public getHikeTimeRemainingFormatted(time: number) {
    return Utils.getFormattedSeconds(
      parseFloat((time / 1000).toFixed(1)),
    ).replace(".", ",");
  }

  public getHikeTimeStatus() {
    let time = this.hikeTime + this.hikeTimeSeconds * 1000;

    if (this.down.qbCarriedBallTime)
      time = Math.min(
        time,
        this.down.qbCarriedBallTime + this.carryBallSackTime * 1000,
      );

    return {
      isOver: Date.now() > time,
      time: Date.now() - this.hikeTime,
      timeOver: time,
    };
  }

  public invertTeam(team: Team) {
    return team === Team.Red ? Team.Blue : Team.Red;
  }

  public setBallDamping(room: Room, damping: Global.BallDamping) {
    room.getBall().setDamping(damping);
  }

  public lockBall(room: Room) {
    room.getBall()?.setInvMass(0.000001);
  }

  public unlockBall(room: Room) {
    room.getBall()?.setInvMass(1);
  }

  public setBallKickForce(room: Room, value: number) {
    room.getBall()?.setInvMass(value);
  }

  public setBallUnmoveable(room: Room) {
    room.getPlayers().forEach((p) => p.setInvMass(1e26));
  }

  public setBallMoveable(room: Room) {
    room.getPlayers().forEach((p) => p.setInvMass(0.5));
  }

  public getDistanceToEndZone() {
    return StadiumUtils.getDifferenceBetweenFieldPositions(this.ballPosition, {
      yards: 0,
      team: this.invertTeam(this.teamWithBall),
    });
  }

  public getPenaltyValueInRedZone(maxPenalty?: number) {
    const penalty = parseInt("" + (1 / 2) * this.getDistanceToEndZone());

    if (penalty < 1) return 1;
    if (penalty > maxPenalty) return maxPenalty;

    return penalty;
  }

  public setBallUnkickable(room: Room) {
    room.getBall().setcGroup(room.CollisionFlags.wall);
  }

  public setBallKickable(room: Room) {
    room
      .getBall()
      .setcGroup(room.CollisionFlags.ball | room.CollisionFlags.kick);
  }

  public blockTeam(room: Room, team: Team) {
    if (team === Team.Red) {
      room
        .getPlayers()
        .red()
        .forEach((p) => p.setcGroup(p.getcGroup() | room.CollisionFlags.c0));
    } else {
      room
        .getPlayers()
        .blue()
        .forEach((p) => p.setcGroup(p.getcGroup() | room.CollisionFlags.c1));
    }
  }

  public unblockTeams(room: Room) {
    room
      .getPlayers()
      .blue()
      .forEach((p) => p.setcGroup(room.CollisionFlags.blue));
    room
      .getPlayers()
      .red()
      .forEach((p) => p.setcGroup(room.CollisionFlags.red));
  }

  public ghostTeam(room: Room, team: Team) {
    room
      .getPlayers()
      .filter((p) => p.getTeam() === team)
      .forEach((p) => p.setcGroup(0));
  }

  public unghostTeam(room: Room, team: Team) {
    if (team === Team.Red) {
      room
        .getPlayers()
        .red()
        .forEach((p) => p.setcGroup(room.CollisionFlags.red));
    } else {
      room
        .getPlayers()
        .blue()
        .forEach((p) => p.setcGroup(room.CollisionFlags.blue));
    }
  }

  public unghostAll(room: Room) {
    this.unblockTeams(room);
  }

  public blockMiddleKickoff(room: Room, team: Team) {
    if (team === Team.Red) {
      room
        .getPlayers()
        .red()
        .forEach((p) => {
          p.setcGroup(p.getcGroup() | room.CollisionFlags.c2);
        });
    } else {
      room
        .getPlayers()
        .blue()
        .forEach((p) => {
          p.setcGroup(p.getcGroup() | room.CollisionFlags.c3);
        });
    }
  }

  public addToStoppage(timeMs: number) {
    if (!this.isStoppageTime) {
      this.stoppageTimeMs += timeMs;
    }
  }

  public getStoppage() {
    return this.stoppageTimeMs;
  }

  public updatePlayersPosition(room: Room) {
    const defensiveTeam = this.getTeamWithoutBall(room);

    this.lastPlayerPositions = new Map(
      defensiveTeam.map((p) => [p.id, p.getY()]),
    );
  }

  public resetPlayersPosition(room: Room) {
    const ballPos = StadiumUtils.getCoordinateFromYards(
      this.ballPosition.team,
      this.ballPosition.yards,
    );

    const offensiveTeam = this.getTeamWithBall(room);
    const defensiveTeam = this.getTeamWithoutBall(room);

    const getSinal = (player: Player) =>
      player.getTeam() === Team.Red ? -1 : 1;

    for (const player of offensiveTeam) {
      player.setX(
        ballPos.x +
          MapMeasures.Yard *
            this.offensiveDistanceSpawnYardsHike *
            getSinal(player),
      );
    }

    for (const player of defensiveTeam) {
      player.setX(
        ballPos.x +
          MapMeasures.Yard *
            this.defensiveDistanceSpawnYardsHike *
            getSinal(player),
      );
    }
  }

  public resetPlayersPositionEvenly(room: Room) {
    const ballPos = StadiumUtils.getCoordinateFromYards(
      this.ballPosition.team,
      this.ballPosition.yards,
    );

    const getSinal = (player: Player) =>
      player.getTeam() === Team.Red ? -1 : 1;
    const isOutsideField = (y: number) =>
      Math.abs(y) > Math.abs(MapMeasures.OuterField[0].y);
    const setPosition = (player: Player, distanceX: number, y: number) => {
      player.setPosition({
        x: ballPos.x + MapMeasures.Yard * distanceX * getSinal(player),
        y,
      });

      player.setVelocityX(0);
      player.setVelocityY(0);
    };
    const filterAndPositionOutsidePlayer = (player: Player) => {
      if (!isOutsideField(player.getY())) return true;

      setPosition(player, this.cbDistanceSpawnYardsHike, player.getY());

      return false;
    };

    const offensiveTeam = this.getTeamWithBall(room)
      .sort((a, b) => b.getY() - a.getY())
      .filter((player) => filterAndPositionOutsidePlayer(player));

    const defensiveTeam = this.getTeamWithoutBall(room)
      .sort(
        (a, b) =>
          (this.lastPlayerPositions.get(b.id) ?? b.getY()) -
          (this.lastPlayerPositions.get(a.id) ?? a.getY()),
      )
      .filter((player) => filterAndPositionOutsidePlayer(player));

    const hasCbs = defensiveTeam.length >= 3;

    const positionsOffense = MathUtils.getPointsAlongLine(
      { x: 0, y: this.playerLineLengthForEvenlyPositiong },
      { x: 0, y: -this.playerLineLengthForEvenlyPositiong },
      offensiveTeam.length,
    );

    const positionsDefense = MathUtils.getPointsAlongLine(
      { x: 0, y: this.playerLineLengthForEvenlyPositiong },
      { x: 0, y: -this.playerLineLengthForEvenlyPositiong },
      defensiveTeam.length - (hasCbs ? 2 : 0),
    );

    for (let i = 0; i < offensiveTeam.length; i++) {
      const player = offensiveTeam[i];
      const position = positionsOffense[i];

      setPosition(player, this.offensiveDistanceSpawnYardsHike, position.y);
    }

    if (defensiveTeam.length >= 3) {
      const topCb = defensiveTeam.pop();
      const bottomCb = defensiveTeam.shift();

      setPosition(
        topCb,
        this.cbDistanceSpawnYardsHike,
        -this.playerCbPositionY,
      );
      setPosition(
        bottomCb,
        this.cbDistanceSpawnYardsHike,
        this.playerCbPositionY,
      );
    }

    for (let i = 0; i < defensiveTeam.length; i++) {
      const player = defensiveTeam[i];
      const position = positionsDefense[i];

      setPosition(player, this.defensiveDistanceSpawnYardsHike, position.y);
    }
  }

  public resetPlay(room: Room) {
    this.redZonePenalties = 0;
    this.down.goalMode = false;
  }

  public reset(room: Room) {
    if (room.isGameInProgress()) {
      this.setBallUnmoveable(room);
      this.unlockBall(room);
      this.setBallKickable(room);
      this.unghostAll(room);
      this.setBallDamping(room, Global.BallDamping.Default);
      this.playerWithBall?.setbCoeff(0.5);
    }

    this.down.reset();
    this.fieldGoal.reset();
    this.kickOff.reset();
    this.punt.reset();

    this.interceptAttemptPlayer = null;

    this.clearHikeTime();
    this.clearInvasion();

    this.interceptionTimeout?.stop();
    this.kickOffReset?.stop();
    this.touchdownExtraPointTimeout?.stop();
    this.extraPointTimeout?.stop();
    this.failedFielGoalTimeout?.stop();
    this.fieldGoalTimeout?.stop();
    this.interceptionTimeout = null;
    this.extraPointTimeout = null;
    this.kickOffReset = null;
    this.touchdownExtraPointTimeout = null;
    this.failedFielGoalTimeout = null;
    this.fieldGoalTimeout = null;

    this.down.defenderBlockingBall = null;

    this.invasionPlayers = [];

    this.playerWithBallSetTick = null;
    this.firstTackleTick = null;
    this.interceptPlayer = null;
    this.intercept = false;
    this.conversion = false;
    this.running = false;
    this.ballMovedTimeFG = null;
    this.blockedPass = false;
    this.quarterback = null;
    this.qbKickedBall = false;
    this.interceptPlayerLeftEndZone = false;
    this.playerWithBallTackleCount = 0;

    this.clearPlayerWithBall();
  }
}

export default Game;
