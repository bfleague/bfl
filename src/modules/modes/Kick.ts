import type Room from "../../core/Room";
import type Player from "../../core/Player";
import { Team } from "../../core/Global";

import * as Global from "../../Global";

import Game from "../Game";
import { LandPlay } from "./LandPlay";

export abstract class Kick extends LandPlay {
  puntPlayerInvadedOtherFieldDistancePenalty = 80;
  puntPlayerInvadedOtherFieldSpeedPenalty = 5;

  constructor(room: Room, game: Game) {
    super(room, game);

    room.on("gameTick", () => {
      if (this.game.mode !== this.mode) return;

      this.handleBallReturn(room);
    });

    room.on("playerBallKick", (player: Player) => {
      if (this.game.mode !== this.mode) return;

      this.game.playerReturnedBall(room, player);
      this.game.unblockTeams(room);

      if (!this.game.qbKickedBall) {
        this.game.qbKickedBall = true;

        this.handleDefenderFieldInvasionBeforeHike(room);
      }
    });
  }

  private handleBallReturn(room: Room) {
    if (!this.game.playerWithBall) {
      for (const player of room.getPlayers().teams()) {
        if (player.distanceTo(room.getBall()) < 0.5) {
          this.game.playerReturnedBall(room, player);

          return;
        }
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
}
