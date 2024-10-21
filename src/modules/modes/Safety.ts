import type Room from "../../core/Room";
import type Player from "../../core/Player";
import { Team } from "../../core/Global";

import * as Global from "../../Global";

import MapMeasures from "../../utils/MapMeasures";
import Game, { GameModes, PlayerWithBallState } from "../Game";
import MathUtils from "../../utils/MathUtils";
import StadiumUtils from "../../utils/StadiumUtils";
import GameUtils from "../../utils/GameUtils";
import translate from "../../utils/Translate";
import { LandPlay } from "./LandPlay";

export class Safety extends LandPlay {
  public readonly name = "safety";
  public readonly mode = GameModes.Safety;

  public readonly playerLineLengthSafetyTeam = 100;
  public readonly playerLineLengthReceivingTeam = 200;
  public readonly playerBackDistanceSafety = 100;
  public readonly maxOnsideKickTime = 60 * 5;

  public returning = false;
  public safetyYardLine = 20;
  public setTick: number = null;

  constructor(room: Room, game: Game) {
    room.on("gameTick", () => {
      if (this.game.mode !== this.mode) return;

      if (
        this.setTick &&
        this.game.tickCount - this.setTick > this.maxOnsideKickTime &&
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

    super(room, game);
  }

  set({
    room,
    forTeam = this.game.teamWithBall,
  }: {
    room: Room;
    forTeam?: Team;
    pos?: Global.FieldPosition;
  }) {
    this.game.mode = null;

    this.game.reset(room);
    this.game.resetPlay(room);

    this.game.teamWithBall = forTeam;
    this.game.ballPosition = {
      team: this.game.teamWithBall,
      yards: this.safetyYardLine,
    };
    this.game.downCount = 0;
    this.game.distance = 20;

    room.send({
      message: `🤾 Safety para o ${this.game.getTeamName(forTeam)}`,
      color: Global.Color.LightGreen,
      style: "bold",
    });

    const ballPosInMap = StadiumUtils.getCoordinateFromYards(
      forTeam,
      this.safetyYardLine,
    );
    const ball = room.getBall();

    ball.setVelocityX(0);
    ball.setVelocityY(0);
    ball.setPosition(ballPosInMap);

    let red = room.getPlayers().red();
    let blue = room.getPlayers().blue();

    let safetyTeam = forTeam === Team.Red ? red : blue;
    let receivingTeam = forTeam === Team.Red ? blue : red;

    this.game.teamWithBall = forTeam;

    const setPuntingTeamPositions = (team: Player[]) => {
      const positions = MathUtils.getPointsAlongLine(
        { x: 0, y: this.playerLineLengthSafetyTeam },
        { x: 0, y: -this.playerLineLengthSafetyTeam },
        team.length,
      );

      for (let i = 0; i < team.length; i++) {
        const player = team[i];

        player.setPosition({
          x:
            ballPosInMap.x +
            (forTeam === Team.Red
              ? -this.playerBackDistanceSafety
              : this.playerBackDistanceSafety),
          y: positions[i].y,
        });
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
          ? MapMeasures.PuntBluePositionX
          : MapMeasures.PuntRedPositionX;

      for (let i = 0; i < team.length; i++) {
        const player = team[i];

        player.setPosition({ x: xPos, y: positions[i].y });
      }
    };

    setPuntingTeamPositions(safetyTeam);
    setReceivingTeamPositions(receivingTeam);

    this.setTick = this.game.tickCount;

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
        message: translate("RETURNED_SAFETY", player.name),
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
  }
}
