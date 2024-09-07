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

type Line = { x1: number, y1: number, x2: number, y2: number };

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
    ];
    innerInvasionLinesIndexes = [
        [37, 38],
        [39, 40],
        [41, 42],
        [43, 44],
        [45, 46],
        [47, 48],
    ];
    innerInvasionDiscsIndexes = [
        49, 50
    ];

    outerInvasionWidthYards = 9;
    invasionLinesTimeout: Timer;
    
    innerInvasionWidthYards = 2;
    innerInvasionHeightYards = 4;

    playerRadius = 15;

    crowdingPlayers: [number, number][] = []; // id, tick
    crowdingPlayersHistory: [number, number][] = []; // id, tick

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
        this.crowdingPlayersHistory.length = 0;
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

            if (this.isInnerInvasionValid()) {
                const player = room.getPlayer(p[0]);
            
                if (player && this.isInsideInnerInvasion(player)) {
                    p[1]++;
                }
            }

            const crowdingPlayerHistoryIndex = this.crowdingPlayersHistory.findIndex(a => a[0] === p[0]);
            if (crowdingPlayerHistoryIndex !== -1) this.crowdingPlayersHistory[crowdingPlayerHistoryIndex][1]++;
            
            return p;
        }).filter(p => p);

        crowdingDefendersIds.forEach(id => {
            if (!oldCrowdersIds.includes(id)) {
                this.crowdingPlayers.push([id, 1]);

                const playerHistoryIndex = this.crowdingPlayersHistory.findIndex(p => p[0] === id);
             
                if (playerHistoryIndex === -1) {
                    this.crowdingPlayersHistory.push([id, 1]);
                } else {
                    this.crowdingPlayersHistory[playerHistoryIndex][1]++;
                }
            }
        });

        // Check crowding time

        if (this.crowdingPlayers.every(p => p[1] < this.invasionTimeSeconds * Global.TICKS_PER_SECOND)) return false;

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

                room.send({ message: `⛔ Invasão de ${this.getInvasionPlayersString(room)} na Red Zone • ${this.game.redZonePenalties}/${this.game.down.maxPenaltiesInRedZone} para Touchdown Automático • ${penalty} jardas de penalidade`, color: Global.Color.Orange, style: "bold" });
            }
        } else {
            room.send({ message: `⛔ Invasão de ${this.getInvasionPlayersString(room)} • ${penalty} jardas de penalidade`, color: Global.Color.Orange, style: "bold" });
        }

        const sum = this.crowdingPlayersHistory.reduce((previous, current) => previous + current[1], 0);

        for (const p of defendersCrowding) {
            p.reply({ message: `😡 Você não pode ficar no meio por mais que 3 segundos, a não ser que tenha jogadores do outro time também!`, color: Global.Color.Red, style: "bold", sound: 2 });
            
            const acc = parseFloat((this.crowdingPlayersHistory.find(pl => pl[0] === p.id)[1] / sum).toFixed(2));

            this.game.matchStats.add(p, { faltas: 1 });
            this.game.matchStats.add(p, { invasoes: 1 });
            this.game.matchStats.add(p, { invasoesAcumuladas: acc });
        };

        this.game.adjustGameTimeAfterDefensivePenalty(room);

        this.handleInvasionLines(room, () => {
            this.game.down.set({ room, increment: penalty, countDown: false });
        });

        return true;
    }

    public isInnerInvasionValid() {
        return this.game.ballPosition.yards > 5;
    }

    public isInsideInnerInvasion(player: Player) {
        const ballPos = StadiumUtils.getCoordinateFromYards(this.game.ballPosition);

        const circleX = player.getX();
        const circleY = player.getY();
        const circleR = player.getRadius();

        const rectW = this.innerInvasionWidthYards * MapMeasures.Yard;
        const rectH = this.innerInvasionHeightYards * MapMeasures.Yard;

        const rectY = (this.innerInvasionHeightYards / 2) * MapMeasures.Yard * -1;
        const rectX = this.game.teamWithBall === Team.Red ? ballPos.x :
            Math.max(ballPos.x - rectW, MapMeasures.RedZoneRed[0].x);

        const distX = Math.abs(circleX - rectX - rectW / 2);
        const distY = Math.abs(circleY - rectY - rectH / 2);

        if (distX > (rectW / 2 + circleR)) return false;
        if (distY > (rectH / 2 + circleR)) return false;

        if (distX <= (rectW / 2)) return true;
        if (distY <= (rectH / 2)) return true;

        const dx = distX - rectW / 2;
        const dy = distY - rectH / 2;

        return (dx * dx + dy * dy <= (circleR * circleR));
    }

    private getInvasionPlayersString(room: Room) {
        const sum = this.crowdingPlayersHistory.reduce((previous, current) => previous + current[1], 0);

        return Utils.getPlayersNames(this.crowdingPlayersHistory.sort((a, b) => b[1] - a[1]).map(p => {
            const player = room.getPlayer(p[0]);

            if (!player) return;

            return { name: `${player.name} (${((p[1] / sum) * 100).toFixed(1)}%)` };
        }).filter(p => p != null));
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

            for (const index of this.innerInvasionLinesIndexes) {
                const d1 = room.getDisc(index[0]);
                const d2 = room.getDisc(index[1]);

                d1.setPosition(d2.getPosition());
            }

            for (const index of [...this.invasionDiscsIndexes, ...this.innerInvasionDiscsIndexes]) {
                room.getDisc(index).setPosition({ x: 9999, y: 9999 });
            }

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

    private getOuterBoxWidth() {
        const ballPos = this.game.getBallStartPos();

        const rectMaxW = this.outerInvasionWidthYards * MapMeasures.Yard;

        const distanceToEndzone = this.game.teamWithBall === Team.Blue ?
            Math.abs(Math.abs(ballPos.x) - Math.abs(MapMeasures.RedZoneRed[0].x + MapMeasures.Yard)) :
            Math.abs(Math.abs(ballPos.x) - Math.abs(MapMeasures.RedZoneBlue[0].x - MapMeasures.Yard));
        
        const rectW = Math.min(rectMaxW, distanceToEndzone);

        return rectW;
    }

    private getCrowdingPlayers(room: Room) {
        const crowdingPlayers = [];

        for (const player of room.getPlayers().teams()) {
            if (this.game.quarterback.id === player.id) continue;

            const ballPos = this.game.getBallStartPos();

            const circleX = player.getX();
            const circleY = player.getY();
            const circleR = player.getRadius();
    
            const rectMaxW = this.outerInvasionWidthYards * MapMeasures.Yard;

            const rectLimitRed = MapMeasures.RedZoneRed[0].x + MapMeasures.Yard;

            const rectY = MapMeasures.HashesHeight.y1 + MapMeasures.SingleHashHeight;
            const rectX = this.game.teamWithBall === Team.Red ? ballPos.x :
                Math.max(ballPos.x - rectMaxW, rectLimitRed);
                
            const rectW = this.getOuterBoxWidth();
            const rectH = MapMeasures.HashesHeight.y2 * 2 - MapMeasures.SingleHashHeight * 2;
    
            const distX = Math.abs(circleX - rectX - rectW / 2);
            const distY = Math.abs(circleY - rectY - rectH / 2);
    
            if (distX > (rectW / 2 + circleR)) continue;
            if (distY > (rectH / 2 + circleR)) continue;
    
            if (distX <= (rectW / 2) || distY <= (rectH / 2)) {
                crowdingPlayers.push(player);
            } else {
                const dx = distX - rectW / 2;
                const dy = distY - rectH / 2;
        
                if (dx * dx + dy * dy <= (circleR * circleR)) {
                    crowdingPlayers.push(player);
                }
            }
        }

        return crowdingPlayers;
    }

    private arrangeLines(room: Room, measures: {
        topLine?: Line,
        bottomLine?: Line,
        frontLine?: Line,
        backLine?: Line,
        invasionLinesIndexes: number[][],
        numberOfPoints: number
    }) {
        const topLine = !measures.topLine ? [] : MathUtils.getPointsAlongLine(
            {
                x: measures.topLine.x1,
                y: measures.topLine.y1
            },
            {
                x: measures.topLine.x2,
                y: measures.topLine.y2
            },
            measures.numberOfPoints
        );

        const bottomLine = !measures.bottomLine ? [] : MathUtils.getPointsAlongLine(
            {
                x: measures.bottomLine.x1,
                y: measures.bottomLine.y1
            },
            {
                x: measures.bottomLine.x2,
                y: measures.bottomLine.y2
            },
            measures.numberOfPoints
        );

        const frontLine = !measures.frontLine ? [] : MathUtils.getPointsAlongLine(
            {
                x: measures.frontLine.x1,
                y: measures.frontLine.y1
            },
            {
                x: measures.frontLine.x2,
                y: measures.frontLine.y2
            },
            measures.numberOfPoints
        );

        const backLine = !measures.backLine ? [] : MathUtils.getPointsAlongLine(
            {
                x: measures.backLine.x1,
                y: measures.backLine.y1
            },
            {
                x: measures.backLine.x2,
                y: measures.backLine.y2
            },
            measures.numberOfPoints
        );

        const halfRectangle = [...topLine, ...bottomLine, ...frontLine, ...backLine];

        let count = 0;
        let invasionLineIndex = 0;
        let resetDiscs: Disc[] = [];

        for (let i = 0; i < halfRectangle.length; i++) {
            const discIndex = measures.invasionLinesIndexes[invasionLineIndex][i % 2 === 0 ? 0 : 1];

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
    }

    private setInvasionLines(room: Room) {
        const ballPos = this.game.getBallStartPos();
        const scrimmagePos = StadiumUtils.getCoordinateFromYards(this.game.ballPosition);

        let maxHorizontalX = this.game.teamWithBall === Team.Blue ?
            ballPos.x - this.getOuterBoxWidth() :
            ballPos.x + this.getOuterBoxWidth();

        const signal = (this.game.teamWithBall === Team.Red ? -1 : 1);

        const numberOfPoints = 2 * 3;
        const behindBallPosX = ballPos.x + (signal * 0 * MapMeasures.Yard);

        const hashHeightY1 = MapMeasures.HashesHeight.y1 + MapMeasures.SingleHashHeight;
        const hashHeightY2 = MapMeasures.HashesHeight.y2 - MapMeasures.SingleHashHeight;

        room.getDisc(this.invasionDiscsIndexes[0]).setPosition({ x: behindBallPosX, y: hashHeightY1 });
        room.getDisc(this.invasionDiscsIndexes[1]).setPosition({ x: maxHorizontalX, y: hashHeightY1 });
        room.getDisc(this.invasionDiscsIndexes[2]).setPosition({ x: behindBallPosX, y: hashHeightY2 });
        room.getDisc(this.invasionDiscsIndexes[3]).setPosition({ x: maxHorizontalX, y: hashHeightY2 });

        this.arrangeLines(room, {
            topLine: {
                x1: behindBallPosX,
                y1: hashHeightY1,
                x2: maxHorizontalX,
                y2: hashHeightY1
            },
            bottomLine: {
                x1: behindBallPosX,
                y1: hashHeightY2,
                x2: maxHorizontalX,
                y2: hashHeightY2
            },
            frontLine: {
                x1: maxHorizontalX,
                y1: hashHeightY1,
                x2: maxHorizontalX,
                y2: hashHeightY2
            },
            backLine: {
                x1: behindBallPosX,
                y1: hashHeightY1,
                x2: behindBallPosX,
                y2: hashHeightY2
            },
            invasionLinesIndexes: this.invasionLinesIndexes,
            numberOfPoints
        });

        if (this.isInnerInvasionValid()) {
            const innerTopLineY = (this.innerInvasionHeightYards / 2) * MapMeasures.Yard * -1;
            const innerBottomLineY = -innerTopLineY;
            const innerFrontX = scrimmagePos.x + (this.innerInvasionWidthYards * MapMeasures.Yard * -signal);
            const innerBottomX = ballPos.x;

            room.getDisc(this.innerInvasionDiscsIndexes[0]).setPosition({ x: innerFrontX, y: innerTopLineY });
            room.getDisc(this.innerInvasionDiscsIndexes[1]).setPosition({ x: innerFrontX, y: innerBottomLineY });

            this.arrangeLines(room, {
                topLine: {
                    x1: innerBottomX,
                    y1: innerTopLineY,
                    x2: innerFrontX,
                    y2: innerTopLineY
                },
                bottomLine: {
                    x1: innerBottomX,
                    y1: innerBottomLineY,
                    x2: innerFrontX,
                    y2: innerBottomLineY
                },
                frontLine: {
                    x1: innerFrontX,
                    y1: innerTopLineY,
                    x2: innerFrontX,
                    y2: innerBottomLineY
                },
                invasionLinesIndexes: this.innerInvasionLinesIndexes,
                numberOfPoints: 2 * 2
            });
        }

        room.pause();
        room.unpause();
    }
}