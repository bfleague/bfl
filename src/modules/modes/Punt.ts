import type Room from "../../core/Room";
import type Player from "../../core/Player";
import { Team } from "../../core/Global";
import Command, { CommandInfo } from "../../core/Command";

import * as Global from "../../Global";

import MapMeasures from "../../utils/MapMeasures";
import Game, { GameModes, PlayerWithBallState } from "../Game";
import MathUtils from "../../utils/MathUtils";
import StadiumUtils from "../../utils/StadiumUtils";
import { LandPlay } from "./LandPlay";
import translate from "../../utils/Translate";
import GameUtils from "../../utils/GameUtils";

export class Punt extends LandPlay {
  public readonly name = "punt";
  public readonly mode = GameModes.Punt;

  public readonly playerLineLengthPuntPuntingTeam = 100;
  public readonly playerLineLengthPuntReceivingTeam = 200;
  public readonly playerBackDistancePunt = 100;
  public readonly maxKickTime = 60 * 5;

  public returning = false;
  public setTick: number = null;
  public overrideMaxKickTime: number = null;

  constructor(room: Room, game: Game) {
    super(room, game);

    room.on("gameTick", () => {
      if (this.game.mode !== this.mode) return;

      if (
        this.setTick &&
        this.game.tickCount - this.setTick >
          (this.overrideMaxKickTime ?? this.maxKickTime) &&
        !this.game.qbKickedBall
      ) {
        room.send({
          message: `⏰ O tempo para chutar o PUNT esgotou!`,
          color: Global.Color.Tomato,
          style: "bold",
        });

        this.game.down.set({
          room,
          forTeam: this.game.invertTeam(this.game.teamWithBall),
          countDistanceFromNewPos: false,
        });

        return;
      }

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
          this.game.qbKickedBall = true;
          this.game.unblockTeams(room);

          GameUtils.handleDefenderFieldInvasionBeforeHike({
            room,
            game: this.game,
            kicker: player,
            name: this.name,
          });
        }
      }
    });
  }

  set({
    room,
    forTeam = this.game.teamWithBall,
    pos = this.game.ballPosition,
    sendMessage = true,
    timeToKick = this.maxKickTime,
  }: {
    room: Room;
    forTeam?: Team;
    pos?: Global.FieldPosition;
    sendMessage?: boolean;
    timeToKick?: number;
  }) {
    this.game.mode = null;

    this.game.reset(room);
    this.game.resetPlay(room);

    this.game.teamWithBall = forTeam;
    this.game.ballPosition = pos;
    this.game.downCount = 0;
    this.game.distance = 20;
    this.overrideMaxKickTime = timeToKick;

    if (sendMessage) {
      room.send({
        message: `🤾 Punt para o ${this.game.getTeamName(forTeam)}`,
        color: Global.Color.LightGreen,
        style: "bold",
      });
    }

    const ballPosInMap = StadiumUtils.getCoordinateFromYards(
      pos.team,
      pos.yards,
    );
    const ball = room.getBall();

    ball.setVelocityX(0);
    ball.setVelocityY(0);
    ball.setPosition(ballPosInMap);

    this.game.setBallKickForce(room, 1.2);

    let red = room.getPlayers().red();
    let blue = room.getPlayers().blue();

    let puntingTeam = (forTeam === Team.Red ? red : blue).filter(
      GameUtils.filterPlayerOutsideField(room),
    );
    let receivingTeam = (forTeam === Team.Red ? blue : red).filter(
      GameUtils.filterPlayerOutsideField(room),
    );

    this.game.teamWithBall = forTeam;

    const setPuntingTeamPositions = (team: Player[]) => {
      const positions = MathUtils.getPointsAlongLine(
        { x: 0, y: this.playerLineLengthPuntPuntingTeam },
        { x: 0, y: -this.playerLineLengthPuntPuntingTeam },
        team.length,
      );

      for (let i = 0; i < team.length; i++) {
        const player = team[i];

        player.setPosition({
          x:
            ballPosInMap.x +
            (forTeam === Team.Red
              ? -this.playerBackDistancePunt
              : this.playerBackDistancePunt),
          y: positions[i].y,
        });
      }
    };

    const setReceivingTeamPositions = (team: Player[]) => {
      const positions = MathUtils.getPointsAlongLine(
        { x: 0, y: this.playerLineLengthPuntReceivingTeam },
        { x: 0, y: -this.playerLineLengthPuntReceivingTeam },
        team.length,
      );

      let xPos =
        forTeam === Team.Red
          ? MapMeasures.PuntBluePositionX
          : MapMeasures.PuntRedPositionX;

      for (let i = 0; i < team.length; i++) {
        const player = team[i];

        player.setPosition({ x: xPos, y: positions[i].y });
      }
    };

    this.setTick = this.game.tickCount;

    setPuntingTeamPositions(puntingTeam);
    setReceivingTeamPositions(receivingTeam);
    this.setBallLine(room);
    this.game.down.resetFirstDownLine(room);
    this.game.blockTeam(room, this.game.invertTeam(forTeam));
    this.game.mode = this.mode;
  }

  private playerReturnedBall(room: Room, player: Player) {
    if (player.getTeam() !== this.game.teamWithBall) {
      this.returning = true;
      this.game.setPlayerWithBall(
        room,
        player,
        PlayerWithBallState.PuntReturner,
        true,
      );

      room.send({
        message: translate("RETURNED_PUNT", player.name),
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

  public reset() {
    this.returning = false;
    this.setTick = null;
    this.overrideMaxKickTime = null;
  }

  @Command({
    name: "punt",
  })
  puntCommand($: CommandInfo, room: Room) {
    if (!room.isGameInProgress()) {
      $.caller.reply({
        message: `⚠️ Não há um jogo em progresso!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if ($.caller.getTeam() === Team.Spectators) {
      $.caller.reply({
        message: `⚠️ Você não está em nenhum time!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if ($.caller.getTeam() !== this.game.teamWithBall) {
      $.caller.reply({
        message: `⚠️ Seu time não está com a posse da bola!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if (this.game.mode !== this.game.down.waitingHikeMode) {
      $.caller.reply({
        message: `⚠️ Você não pode pedir punt agora!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if ($.caller.distanceTo(room.getBall()) > 50) {
      $.caller.reply({
        message: `⚠️ Você está longe demais da bola!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if (
      StadiumUtils.isInRedZone(
        this.game.ballPosition,
        this.game.invertTeam($.caller.getTeam()),
      )
    ) {
      $.caller.reply({
        message: `⚠️ Você não pode pedir punt na red zone!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    room.send({
      message: `🦵 ${$.caller.name} solicitou PUNT!`,
      color: Global.Color.Yellow,
      style: "bold",
    });

    this.set({ room });

    return false;
  }
}
