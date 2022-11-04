import type Room from "../../core/Room";
import type Player from "../../core/Player";
import { Team } from "../../core/Global";

import * as Global from "../../Global";

import Game from "../Game";

import MapMeasures from "../../utils/MapMeasures";
import MathUtils from "../../utils/MathUtils";
import Timer from "../../utils/Timer";
import Disc from "../../core/Disc";
import StadiumUtils from "../../utils/StadiumUtils";
import Utils from "../../utils/Utils";
import { DownPlay } from "./DownPlay";

const TICKS_PER_SECOND = 60;

export default class Invasion extends DownPlay {
    invasionPenalty = 10;
    invasionTimeSeconds = 3;
    nonInvasionStartTime = 1 * 1000;

    invasionLinesIndexes = [
        [9, 10],
        [11, 12],
        [13, 14],
        [15, 16],
        [17, 18],
        [19, 20],
        [21, 22],
        [23, 24],
        [25, 26],
        [27, 28],
        [29, 30],
        [31, 32]
    ];
    invasionDiscsIndexes = [
        33, 34, 35, 36
    ]

    invasionHorizontalDistanceYards = 10;
    invasionLinesTimeout: Timer;

    playerRadius = 15;

    crowdingPlayers: [number, number][] = []; // id, tick

    constructor(room: Room, game: Game) {
        super(game);

        room.on("gamePause", (byPlayer: Player) => {
            if (byPlayer) this.invasionLinesTimeout?.pause();

            if (this.game.mode === this.game.down.mode && this.game.invasionTimeout && room.isGameInProgress()) {
                this.game.invasionTimeout?.pause();
            }
        });

        room.on("gameStartTicking", (byPlayer) => {
            this.invasionLinesTimeout?.resume();
            
            if (this.game.mode === this.game.down.mode && this.game.invasionTimeout && room.isGameInProgress()) {
                this.game.invasionTimeout?.resume();
            }
        });
    }

    public clear() {
        this.crowdingPlayers.length = 0;
    }

    public handle(room: Room) {
        if (Date.now() < this.game.hikeTime + this.nonInvasionStartTime) return false;

        const { defendersCrowding, attackersCrowding } = this.getPlayersInvadingMid(room);

        // Clear crowding players array if not crowding

        if (defendersCrowding.length === 0 || attackersCrowding.length > 0) {
            this.clear();

            return false;
        }

        // Update crowding players array

        const crowdingDefendersIds = defendersCrowding.map(p => p.id);
        const oldCrowdersIds: number[] = [];

        this.crowdingPlayers = this.crowdingPlayers.map(p => {
            if (!crowdingDefendersIds.includes(p[0])) return;
                
            oldCrowdersIds.push(p[0]);

            p[1]++;
                
            return p;
        }).filter(p => p);

        crowdingDefendersIds.forEach(id => !oldCrowdersIds.includes(id) && this.crowdingPlayers.push([id, 1]));

        // Check crowding time

        if (this.crowdingPlayers.every(p => p[1] < this.invasionTimeSeconds * TICKS_PER_SECOND)) return false;

        // Check if receivers are bodying defense

        if (!defendersCrowding.every(invader => {
            for (const player of this.game.getTeamWithBall(room)) {
                if (invader.distanceTo(player) < 1) return false;
            }

            return true;
        })) return false;

        // Execute crowding penalty
            
        this.game.invasionPlayers = defendersCrowding;
        let penalty = this.invasionPenalty;

        if (StadiumUtils.isInRedZone(this.game.ballPosition, this.game.invertTeam(this.game.teamWithBall))) {
            this.game.redZonePenalties++;

            if (this.game.redZonePenalties >= this.game.down.maxPenaltiesInRedZone) {
                this.handleInvasionLines(room, () => {
                    this.game.down.setRedZoneTouchdown(room, this.game.teamWithBall, this.game.invasionPlayers, `Invasão de ${Utils.getPlayersNames(this.game.invasionPlayers)}`);
                });

                return true;
            } else {
                penalty = this.game.getPenaltyValueInRedZone(this.invasionPenalty);

                room.send({ message: `⛔ Invasão de ${Utils.getPlayersNames(this.game.invasionPlayers)} na Red Zone • ${this.game.redZonePenalties}/${this.game.down.maxPenaltiesInRedZone} para Touchdown Automático • ${penalty} jardas de penalidade`, color: Global.Color.Orange, style: "bold" });
            }
        } else {
            room.send({ message: `⛔ Invasão de ${Utils.getPlayersNames(this.game.invasionPlayers)} • ${penalty} jardas de penalidade`, color: Global.Color.Orange, style: "bold" });
        }

        defendersCrowding.forEach(p => {
            p.reply({ message: `😡 Você não pode ficar no meio por mais que 3 segundos, a não ser que tenha jogadores do outro time também!`, color: Global.Color.Red, style: "bold", sound: 2 });
            
            this.game.matchStats.add(p, { faltas: 1 });
        });

        this.game.adjustGameTimeAfterDefensivePenalty(room);

        this.handleInvasionLines(room, () => {
            this.game.down.set({ room, increment: penalty, countDown: false });
        });

        return true;
    }

    private handleInvasionLines(room: Room, callback: Function) {
        this.game.mode = null;

        this.setInvasionLines(room);

        this.invasionLinesTimeout = new Timer(() => {
            for (const index of this.invasionLinesIndexes) {
                const d1 = room.getDisc(index[0]);
                const d2 = room.getDisc(index[1]);

                d1.setPosition(d2.getPosition());
            }

            for (let i = 0; i < 4; i++) room.getDisc(this.invasionDiscsIndexes[i]).setPosition({ x: 9999, y: 9999 });

            callback();

            this.invasionLinesTimeout = null;
        }, 1000);
    }

    private getPlayersInvadingMid(room: Room) {
        const crowdingPlayers = this.getCrowdingPlayers(room);
        const defendersCrowding = crowdingPlayers.filter(p => p.getTeam() !== this.game.teamWithBall);
        const attackersCrowding = crowdingPlayers.filter(p => p.getTeam() === this.game.teamWithBall);

        return { crowdingPlayers, defendersCrowding, attackersCrowding };
    }

    private getCrowdingPlayers(room: Room) {
        const crowdingPlayers = [];

        for (const player of room.getPlayers().teams()) {
            if (this.game.quarterback.id === player.id) continue;

            const ballPos = this.game.getBallStartPos();

            const y1 = MapMeasures.HashesHeight.y1;
            const y2 = MapMeasures.HashesHeight.y2;

            const x1 = ballPos.x + (this.invasionHorizontalDistanceYards * MapMeasures.Yard * (this.game.teamWithBall === Team.Blue ? -1 : 1));
            const x2 = ballPos.x + (this.playerRadius * (this.game.teamWithBall === Team.Blue ? 1 : -1));

            const x = player.getX();
            const y = player.getY();

            if (
                (this.game.teamWithBall === Team.Blue && (x > Math.max(x1, MapMeasures.RedZoneRed[0].x) && x < x2) && (y > y1 && y < y2))
                ||
                (this.game.teamWithBall === Team.Red && (x < Math.min(x1, MapMeasures.RedZoneBlue[0].x) && x > x2) && (y > y1 && y < y2))
            ) {
                crowdingPlayers.push(player);
            }
        }

        return crowdingPlayers;
    }

    private setInvasionLines(room: Room) {
        const ballPos = this.game.getBallStartPos();

        let maxHorizontalX;

        if (this.game.teamWithBall === Team.Blue) {
            maxHorizontalX = Math.max(
                MapMeasures.RedZoneRed[0].x,
                ballPos.x - (this.invasionHorizontalDistanceYards * MapMeasures.Yard)
            );
        } else {
            maxHorizontalX = Math.min(
                MapMeasures.RedZoneBlue[0].x,
                ballPos.x + (this.invasionHorizontalDistanceYards * MapMeasures.Yard)
            );
        }

        const numberOfPoints = 2 * 3;
        const behindBallPosX = ballPos.x + ((this.game.teamWithBall === Team.Red ? -1 : 1) * 0 * MapMeasures.Yard);

        const topLine = MathUtils.getPointsAlongLine(
            {
                x: behindBallPosX,
                y: MapMeasures.HashesHeight.y1
            },
            {
                x: maxHorizontalX,
                y: MapMeasures.HashesHeight.y1
            },
            numberOfPoints
        );

        const bottomLine = MathUtils.getPointsAlongLine(
            {
                x: behindBallPosX,
                y: MapMeasures.HashesHeight.y2
            },
            {
                x: maxHorizontalX,
                y: MapMeasures.HashesHeight.y2
            },
            numberOfPoints
        );

        const frontLine = MathUtils.getPointsAlongLine(
            {
                x: maxHorizontalX,
                y: MapMeasures.HashesHeight.y1
            },
            {
                x: maxHorizontalX,
                y: MapMeasures.HashesHeight.y2
            },
            numberOfPoints
        );

        const backLine = MathUtils.getPointsAlongLine(
            {
                x: behindBallPosX, // test
                y: MapMeasures.HashesHeight.y1
            },
            {
                x: behindBallPosX,
                y: MapMeasures.HashesHeight.y2
            },
            numberOfPoints
        );

        const halfRectangle = [...topLine, ...bottomLine, ...frontLine, ...backLine];

        let count = 0;
        let invasionLineIndex = 0;
        let resetDiscs: Disc[] = [];

        room.getDisc(this.invasionDiscsIndexes[0]).setPosition({ x: behindBallPosX, y: MapMeasures.HashesHeight.y1 });
        room.getDisc(this.invasionDiscsIndexes[1]).setPosition({ x: maxHorizontalX, y: MapMeasures.HashesHeight.y1 });
        room.getDisc(this.invasionDiscsIndexes[2]).setPosition({ x: behindBallPosX, y: MapMeasures.HashesHeight.y2 });
        room.getDisc(this.invasionDiscsIndexes[3]).setPosition({ x: maxHorizontalX, y: MapMeasures.HashesHeight.y2 });

        for (let i = 0; i < halfRectangle.length; i++) {
            const discIndex = this.invasionLinesIndexes[invasionLineIndex][i % 2 === 0 ? 0 : 1];

            const disc = room.getDisc(discIndex);
            const point = halfRectangle[i];

            disc.setPosition({ x: point.x, y: point.y });

            resetDiscs.push(disc);

            if (count === 1) {
                count = 0;
                invasionLineIndex++;
            } else {
                count++;
            }
        }

        room.pause();
        room.unpause();
    }
}