import { Team } from "../core/Global";
import Room from "../core/Room";
import Game from "../modules/Game";
import * as Global from "../Global";
import Player from "../core/Player";

export type Tackle = { tackleCount: number; players: Player[] };

export default class GameUtils {
  static handleDefenderFieldInvasionBeforeHike({
    room,
    game,
    name,
    penaltyDistance = 80,
    penaltyVelocity = 5,
    kicker,
  }: {
    room: Room;
    game: Game;
    name: string;
    penaltyDistance?: number;
    penaltyVelocity?: number;
    kicker: Player;
  }) {
    for (const player of game.getTeamWithBall(room)) {
      const ballXPos = room.getBall().getX();
      const playerX = player.getX();

      if (
        kicker.id !== player.id &&
        (game.teamWithBall === Team.Red
          ? playerX > ballXPos
          : playerX < ballXPos)
      ) {
        player.setX(
          ballXPos + penaltyDistance * (player.getTeam() === Team.Red ? -1 : 1),
        );

        const y = player.getY();

        if (y > 100 || y < -100) player.setY(100 * Math.sign(y));

        player.setVelocityX(
          penaltyVelocity * (game.teamWithBall === Team.Red ? -1 : 1),
        );

        player.reply({
          message: `🚨 Você não pode ficar no campo adversário durante o ${name}!`,
          sound: 2,
          color: Global.Color.Red,
          style: "bold",
        });
      }
    }
  }

  static getTackle({
    room,
    game,
    playerBeingTackled = game.playerWithBall,
    distanceToTackle = 0.5,
  }: {
    room: Room;
    game: Game;
    playerBeingTackled?: Player;
    distanceToTackle?: number;
  }): Tackle {
    const teamAgainstPlayerWithBall =
      playerBeingTackled.getTeam() === Team.Red
        ? room.getPlayers().blue()
        : room.getPlayers().red();

    const tackles: Tackle = {
      tackleCount:
        playerBeingTackled.id === game.playerWithBall?.id
          ? game.playerWithBallTackleCount
          : 0,
      players: [],
    };

    for (const player of teamAgainstPlayerWithBall) {
      if (playerBeingTackled.distanceTo(player) < distanceToTackle) {
        tackles.players.push(player);

        if (playerBeingTackled.id === game.playerWithBall?.id) {
          tackles.tackleCount = ++game.playerWithBallTackleCount;
        } else {
          tackles.tackleCount++;
        }
      }
    }

    return tackles;
  }
}
