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
import Disc from "../../core/Disc";
import Utils from "../../utils/Utils";

export class OnsideKick extends LandPlay {
  public readonly name = "onside kick";
  public readonly mode = GameModes.OnsideKick;

  public readonly playerLineLengthKickingTeam = 100;
  public readonly playerLineLengthReceivingTeam = 200;
  public readonly playerBackDistance = 100;
  public readonly yardsBall = 10;
  public readonly yardsBehind = 5;
  public readonly maxOnsideKickTime = 60 * 5;
  public readonly yardsBallOnsideFailed = 40;

  public returning = false;
  public kicker: Player = null;
  public setTick: number = null;
  public kickTick: number = null;

  constructor(room: Room, game: Game) {
    super(room, game);

    room.on("gameTick", () => {
      if (this.game.mode !== this.mode) return;

      if (
        this.setTick &&
        this.game.tickCount - this.setTick > this.maxOnsideKickTime &&
        !this.game.qbKickedBall
      ) {
        room.send({
          message: `⏰ O tempo para chutar o ONSIDE KICK esgotou!`,
          color: Global.Color.Tomato,
          style: "bold",
        });

        this.handleOnsideFailed(room);

        return;
      }

      if (
        this.game.qbKickedBall &&
        !this.game.playerWithBall &&
        this.game.tickCount - this.kickTick < 10 &&
        Math.sign(room.getBall().getVelocityX()) ===
          (this.game.teamWithBall === Team.Red ? -1 : 1)
      ) {
        room.send({
          message: `⚠️ O ONSIDE KICK foi chutado para trás!`,
          color: Global.Color.Tomato,
          style: "bold",
        });

        this.handleOnsideFailed(room);
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
          this.kickTick = this.game.tickCount;
          this.game.qbKickedBall = true;
          this.game.unblockTeams(room);
        }
      }
    });
  }

  set({
    room,
    forTeam = this.game.teamWithBall,
    pos = this.game.ballPosition,
    kicker,
  }: {
    room: Room;
    forTeam?: Team;
    pos?: Global.FieldPosition;
    kicker: Player;
  }) {
    this.game.mode = null;

    this.game.reset(room);
    this.game.resetPlay(room);

    this.game.teamWithBall = forTeam;
    this.game.ballPosition = pos;
    this.game.downCount = 0;
    this.game.distance = 20;

    room.send({
      message: `🤾 Onside kick para o ${this.game.getTeamName(forTeam)}`,
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

    this.game.setBallKickForce(room, 1.2);

    let red = room.getPlayers().red();
    let blue = room.getPlayers().blue();

    let kickingTeam = (forTeam === Team.Red ? red : blue).filter(
      (p) => p.id !== kicker.id,
    );

    let receivingTeam = forTeam === Team.Red ? blue : red;

    this.game.teamWithBall = forTeam;

    const setKickingTeamPositions = (team: Player[]) => {
      const positions = MathUtils.getPointsAlongLine(
        { x: 0, y: this.playerLineLengthReceivingTeam },
        { x: 0, y: -this.playerLineLengthReceivingTeam },
        team.length,
      );

      let xPos =
        forTeam === Team.Red
          ? MapMeasures.OnsideKickBluePositionX - MapMeasures.Yard * 10
          : MapMeasures.OnsideKickRedPositionX + MapMeasures.Yard * 10;

      for (let i = 0; i < team.length; i++) {
        const player = team[i];

        player.setPosition({
          x: xPos,
          y: positions[i].y,
        });

        player.setRadius(player.getRadius() * 1.2);
      }
    };

    const setReceivingTeamPositions = (team: Player[]) => {
      const positions = MathUtils.getPointsAlongLine(
        { x: 0, y: this.playerLineLengthReceivingTeam },
        { x: 0, y: -this.playerLineLengthReceivingTeam },
        team.length,
      );

      let xPos =
        forTeam === Team.Red
          ? MapMeasures.OnsideKickBluePositionX
          : MapMeasures.OnsideKickRedPositionX;

      for (let i = 0; i < team.length; i++) {
        const player = team[i];

        player.setPosition({ x: xPos, y: positions[i].y });
      }
    };

    this.setBallPosition(ball, forTeam);

    this.setBallLine(room, {
      team: forTeam,
      yards: this.yardsBall,
    });

    kicker.setX(
      StadiumUtils.getCoordinateFromYards(
        forTeam,
        this.yardsBall - this.yardsBehind,
      ).x,
    );

    this.kicker = kicker;
    this.setTick = this.game.tickCount;

    setKickingTeamPositions(kickingTeam);
    setReceivingTeamPositions(receivingTeam);
    this.game.down.resetFirstDownLine(room);
    this.game.blockTeam(room, this.game.invertTeam(forTeam));
    this.game.mode = this.mode;
  }

  private playerReturnedBall(room: Room, player: Player) {
    this.returning = true;

    if (player.getTeam() !== this.game.teamWithBall) {
      Utils.sendSoundTeamMessage(room, {
        message: translate("RETURNED_ONSIDE", player.name),
        color: Global.Color.MediumSeaGreen,
        style: "bold",
      });

      this.handleOnsideFailed(room);

      return;
    }

    if (player.id !== this.kicker.id) {
      Utils.sendSoundTeamMessage(room, {
        message: translate("ILLEGAL_TOUCH_SAME_TEAM", player.name),
        color: Global.Color.Orange,
        style: "bold",
      });

      this.handleOnsideFailed(room);

      return;
    }

    this.game.setPlayerWithBall(
      room,
      this.kicker,
      PlayerWithBallState.PuntReturner,
      true,
    );

    Utils.sendSoundTeamMessage(room, {
      message: `🏈 ${player.name} RECUPEROU O ONSIDE KICK!!!`,
      color: Global.Color.Cyan,
      style: "bold",
    });
  }

  private setBallPosition(ball: Disc, forTeam: Team) {
    const ballPos = StadiumUtils.getCoordinateFromYards(
      forTeam,
      this.yardsBall,
    );

    ball.setPosition(ballPos);
  }

  private handleOnsideFailed(room: Room) {
    this.game.down.set({
      room,
      pos: {
        team: this.game.teamWithBall,
        yards: this.yardsBallOnsideFailed,
      },
      forTeam: this.game.invertTeam(this.game.teamWithBall),
      countDistanceFromNewPos: false,
      positionPlayersEvenly: true,
    });
  }

  public reset() {
    this.returning = false;
    this.kicker = null;
    this.setTick = null;
  }

  @Command({
    name: "onside",
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

    if (this.game.mode !== this.game.kickOff.mode) {
      $.caller.reply({
        message: `⚠️ Você não pode pedir onside kick fora de um kick off!`,
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

    room.send({
      message: `🦵 ${$.caller.name} solicitou ONSIDE KICK!`,
      color: Global.Color.Yellow,
      style: "bold",
    });

    this.game.kickOff.addStoppageTime(room);
    this.set({ room, kicker: $.caller });

    return false;
  }
}
