import type Room from "../../core/Room";
import type Player from "../../core/Player";
import { Team } from "../../core/Global";

import * as Global from "../../Global";

import Game, { PlayerWithBallState } from "../Game";
import { LandPlay } from "./LandPlay";
import translate from "../../utils/Translate";
import StadiumUtils from "../../utils/StadiumUtils";

export abstract class Kick extends LandPlay {
  puntPlayerInvadedOtherFieldDistancePenalty = 80;
  puntPlayerInvadedOtherFieldSpeedPenalty = 5;
  returning = false;

  constructor(room: Room, game: Game) {
    super(room, game);

    room.on("gameTick", () => {
      if (this.game.mode !== this.mode) return;

      if (
        this.game.qbKickedBall &&
        !this.game.playerWithBall &&
        !this.returning
      ) {
        this.handleBallReturn(room);
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
          this.handleDefenderFieldInvasionBeforeHike(room);
        }
      }
    });
  }

  private handleBallReturn(room: Room) {
    for (const player of room.getPlayers().teams()) {
      if (player.distanceTo(room.getBall()) < 0.5) {
        this.playerReturnedBall(room, player);

        return;
      }
    }
  }

  private handleDefenderFieldInvasionBeforeHike(room: Room) {
    for (const player of this.game.getTeamWithBall(room)) {
      const ballXPos = room.getBall().getX();
      const playerX = player.getX();

      if (
        this.game.teamWithBall === Team.Red
          ? playerX > ballXPos
          : playerX < ballXPos
      ) {
        player.setX(
          ballXPos +
            this.puntPlayerInvadedOtherFieldDistancePenalty *
              (player.getTeam() === Team.Red ? -1 : 1),
        );

        if (player.getY() > 100 || player.getY() < -100) player.setY(100);

        player.setVelocityX(
          this.puntPlayerInvadedOtherFieldSpeedPenalty *
            (this.game.teamWithBall === Team.Red ? -1 : 1),
        );

        player.reply({
          message: `🚨 Você não pode ficar no campo adversário durante o ${this.name}!`,
          sound: 2,
          color: Global.Color.Red,
          style: "bold",
        });
      }
    }
  }

  private playerReturnedBall(room: Room, player: Player) {
    if (player.getTeam() === Team.Spectators) return;

    if (player.getTeam() !== this.game.teamWithBall) {
      const state =
        this.game.mode === this.game.punt.mode
          ? PlayerWithBallState.PuntReturner
          : PlayerWithBallState.KickoffReturner;

      this.game.setPlayerWithBall(room, player, state, true);
      this.returning = true;

      if (this.game.mode === this.game.punt.mode)
        room.send({
          message: translate("RETURNED_PUNT", player.name),
          color: Global.Color.MediumSeaGreen,
          style: "bold",
        });
      else if (this.game.mode === this.game.kickOff.mode)
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
}
