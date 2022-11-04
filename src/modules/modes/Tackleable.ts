import type Room from "../../core/Room";
import { Team } from "../../core/Global";

import Game from "../Game";
import { Mode } from "./Mode";

import Player from "../../core/Player";

export type Tackle = { tackleCount: number, players: Player[] };

export abstract class Tackleable extends Mode {
    constructor(game: Game) {
        super(game);
    }

    protected abstract handleTackle(room: Room, tackle: Tackle): void;

    protected getTackle(room: Room, playerBeingTackled = this.game.playerWithBall): Tackle {
        const teamAgainstPlayerWithBall = playerBeingTackled.getTeam() === Team.Red ? room.getPlayers().blue() : room.getPlayers().red();

        const tackles: Tackle = { tackleCount: playerBeingTackled.id === this.game.playerWithBall?.id ? this.game.playerWithBallTackleCount : 0, players: [] };

        for (const player of teamAgainstPlayerWithBall) {
            if (playerBeingTackled.distanceTo(player) < 0.5) {
                tackles.players.push(player);

                if (playerBeingTackled.id === this.game.playerWithBall?.id) {
                    tackles.tackleCount = ++this.game.playerWithBallTackleCount
                } else {
                    tackles.tackleCount++;
                }
            }
        }

        return tackles;
    }
}