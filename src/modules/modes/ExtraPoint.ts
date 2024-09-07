import type Room from "../../core/Room";
import type Player from "../../core/Player";
import { Team } from "../../core/Global";

import * as Global from "../../Global";

import Game from "../Game";
import { Mode } from "./Mode";

import MapMeasures from "../../utils/MapMeasures";
import MathUtils from "../../utils/MathUtils";
import Timer from "../../utils/Timer";
import StadiumUtils from "../../utils/StadiumUtils";
import Utils from "../../utils/Utils";

export class ExtraPoint extends Mode {
    name = "extra point";
    mode = "extraPoint";

    epPoints = 1;
    conversionPoints = 2;
    intConversionPoints = 2;
    epTimeLimit = 8 * 1000;
    playerLineLengthExtraPointKickingTeam = 100;
    playerLineLengthExtraPointOtherTeam = 100;
    playerBackDistanceExtraPoint = 100;
    maxTimeEPMoveBallPenalty = 1 * 1000;
    epMaxDistanceMoveBall = 8.5;
    maxDistanceYardsEP = 47 + 10;
    extraPointYards = 10;
    conversionYards = 10;

    epKicker: Player;
    
    constructor(room: Room, game: Game) {
        super(game);

        room.on("playerBallKick", (player: Player) => {
            if (this.game.mode !== this.mode) return;

            this.game.extraPointTimeout?.stop();
            this.game.extraPointTimeout = null;

            if (player.getTeam() !== this.game.teamWithBall) {
                this.handleIllegalTouchByEnemyTeam(room);

                return;
            }
            
            if (!this.game.qbKickedBall) {
                this.game.qbKickedBall = true;
                this.epKicker = player;

                this.game.setBallUnmoveable(room);
                this.game.lockBall(room);
                this.game.setBallUnkickable(room);
                this.game.unghostAll(room);

                const ballPos = room.getBall().getPosition();

                setTimeout(() => {
                    if (this.detectFailedExtraPoint(room, player, ballPos)) this.handleMissedExtraPointBallWrongDirection(room);
                }, 0);
            } else {
                this.handleIllegalBallKick(room);
            }
        });

        room.on("gameTick", () => {
            if (this.game.conversion && this.game.playerWithBall && !this.game.intercept) {
                const player = this.game.playerWithBall;

                if (this.game.teamWithBall === Team.Red ? player.getX() < MapMeasures.RedZoneBlue[1].x : player.getX() > MapMeasures.RedZoneRed[1].x) {
                    room.send({ message: `❌ Tentativa de deixar a red zone por ${player.name} com a bola durante conversão • Perde a conversão`, color: Global.Color.Orange, style: "bold" });    
                    
                    this.game.resetToKickoff(room);
                }

                return;
            }

            if (this.game.mode !== this.mode) return;

            if (!this.game.qbKickedBall) {
                if (this.game.ballMovedTimeFG == null && this.didBallMove(room)) this.game.ballMovedTimeFG = Date.now();

                //if (this.didBallIlegallyMoveDuringEP(room)) this.handleIllegalBallMove(room);

                //if (this.getTeamPlayerTouchingBall(room, this.game.invertTeam(this.game.teamWithBall))) this.handleIllegalTouchByEnemyTeam(room);
            } else {
                if (this.didBallPassedGoalLine(room)) {
                    this.handleSuccessfulExtraPoint(room);
                } else if (MathUtils.getBallSpeed(room.getBall()) < 0.5) {
                    this.handleMissedExtraPointBallStopped(room);
                }
            }
        });

        room.on("playerChat", (player: Player, message: string) => {
            if (message === "hike" && player.getTeam() === this.game.teamWithBall && this.game.mode === this.mode && !this.game.conversion) {
                this.game.conversion = true;

                this.game.mode = this.game.down.mode;
                this.game.down.setHike(player, room);
            }
        });
    }

    public set({ room, forTeam = this.game.teamWithBall, silent, yards }:
        { room: Room, forTeam?: Team, silent?: boolean, yards?: number }) {
        this.game.mode = null;

        this.game.reset(room);
        this.game.resetPlay(room);

        this.game.teamWithBall = forTeam;
        this.game.ballPosition = { team: this.game.invertTeam(forTeam), yards: yards ?? this.extraPointYards };
        this.game.downCount = 0;
        this.game.distance = 20;

        const ballPosInMap = StadiumUtils.getCoordinateFromYards(this.game.ballPosition.team, this.game.ballPosition.yards);
        const ball = room.getBall()
        
        ball.setVelocityX(0);
        ball.setVelocityY(0);
        ball.setPosition(ballPosInMap);
        this.game.unlockBall(room);
        this.game.setBallUnmoveable(room);

        this.game.down.setBallPositionForHike(ball, forTeam);

        this.game.down.resetFirstDownLine(room);
        this.game.down.setBallLine(room);

        if (!silent) {
            room.send({ message: `🥅 Extra Point para o ${this.game.getTeamName(forTeam)} • ${Utils.getFormattedSeconds(this.epTimeLimit / 1000)} para chutar extra point`, color: Global.Color.LightGreen, style: "bold" });
            
            const red = room.getPlayers().red();
            const blue = room.getPlayers().blue();

            let kickingTeam = (forTeam === Team.Red ? red : blue);
            let otherTeam = (forTeam === Team.Red ? blue : red);

            this.game.teamWithBall = forTeam;

            for (let i = 0; i < kickingTeam.length; i++) {
                const player = kickingTeam[i];
                        
                player.setX(ballPosInMap.x + (forTeam === Team.Red ? -this.playerBackDistanceExtraPoint : this.playerBackDistanceExtraPoint));
            }

            for (let i = 0; i < otherTeam.length; i++) {
                const player = otherTeam[i];
                        
                player.setX(forTeam === Team.Red ? 900 : -900);
            }
        }
        
        this.game.mode = this.mode;

        if (!this.game.extraPointTimeout) this.game.extraPointTimeout = new Timer(() => {
            room.send({ message: `❌ Demorou demais pra chutar, perde o extra point!`, color: Global.Color.Orange, style: "bold" });

            this.resetToKickoff(room, forTeam);
        }, this.epTimeLimit);
    }

    public reset() {
        this.epKicker = null;
    }
    
    private scoreExtraPoint(room: Room, forTeam: Team, points: number) {    
        if (forTeam === Team.Red) this.game.scoreRed += points;
        else this.game.scoreBlue += points;

        this.resetToKickoff(room, forTeam);
    }

    private resetToKickoff(room: Room, forTeam: Team) {
        this.game.mode = null;
        this.game.kickOffReset = new Timer(() => this.game.kickOff.set({ room, forTeam }), 3000);
    }

    private didBallMove(room: Room) {
        const ballPos = StadiumUtils.getCoordinateFromYards(this.game.ballPosition.team, this.game.ballPosition.yards);
        const ball = room.getBall(); 

        return (Math.abs(ball.getX() - ballPos.x) > 0.01 || Math.abs(ball.getY() - ballPos.y) > 0.01)
    }

    private didBallIlegallyMoveDuringEP(room: Room) {
        const ballPos = StadiumUtils.getCoordinateFromYards(this.game.ballPosition.team, this.game.ballPosition.yards);
        const ball = room.getBall(); 

        return ((ball.distanceTo({ ...ballPos, radius: ball.getRadius() }) > this.epMaxDistanceMoveBall) ||
        (this.game.ballMovedTimeFG != null && !this.game.qbKickedBall && Date.now() > this.game.ballMovedTimeFG + this.maxTimeEPMoveBallPenalty));
    }

    private didBallPassedGoalLine(room: Room) {
        return StadiumUtils.isOutOfMap(room.getBall().getPosition()) && StadiumUtils.ballWithinGoalLine(room.getBall(), this.game.invertTeam(this.game.teamWithBall));
    }

    private detectFailedExtraPoint(room: Room, player: Player, ballPos: { x: number, y: number }) {
        const ballPath = MathUtils.getBallPathFromPosition(ballPos, room.getBall().getPosition(), 2000);

        const goalLine = player.getTeam() === Team.Red ? MapMeasures.BlueGoalLine : MapMeasures.RedGoalLine;

        const pointOfIntersection = MathUtils.getPointOfIntersection(
            ballPath[0].x, ballPath[0].y, ballPath[1].x, ballPath[1].y,
            goalLine[0].x, goalLine[0].y * 1.1, goalLine[1].x, goalLine[1].y * 1.1
        );

        if (!this.game.playerWithBall) {
            if (pointOfIntersection === false) return true;
        }
    }

    private handleIllegalBallMove(room: Room) {
        room.send({ message: `❌ Condução ilegal da bola durante o Extra Point • Perde o EP`, color: Global.Color.Orange, style: "bold" });

        this.resetToKickoff(room, this.game.teamWithBall);
    }

    private handleIllegalBallKick(room: Room) {
        room.send({ message: `❌ Dois toques na bola pelo time que chutou • Ilegal • EP falhou`, color: Global.Color.Orange, style: "bold" });

        this.resetToKickoff(room, this.game.teamWithBall);
    }

    private handleIllegalTouchByEnemyTeam(room: Room) {
        this.scoreExtraPoint(room, this.game.teamWithBall, this.conversionPoints);

        Utils.sendSoundTeamMessage(room, { message: `🙌 Toque ilegal da equipe adversária durante o Extra Point • +${this.conversionPoints} pontos para o ${this.game.getTeamName(this.game.teamWithBall)} • ${this.game.getScoreMessage()}`, color: Global.Color.LimeGreen, style: "bold" });
    }

    private handleSuccessfulExtraPoint(room: Room) {
        this.scoreExtraPoint(room, this.game.teamWithBall, this.epPoints);

        Utils.sendSoundTeamMessage(room, { message: `🙌 EXTRA POINT DO ${this.game.getTeamName(this.game.teamWithBall).toUpperCase()}!!! • +${this.epPoints} pontos para o ${this.game.getTeamName(this.game.teamWithBall)} • ${this.game.getScoreMessage()}`, color: Global.Color.LimeGreen, style: "bold" });
    }
    
    private handleMissedExtraPointBallWrongDirection(room: Room) {
        room.send({ message: `🤖 Detectado Extra Point falho • Kickoff`, color: Global.Color.Yellow, style: "bold" });

        this.game.mode = null;

        this.resetToKickoff(room, this.game.teamWithBall);
    }

    private handleMissedExtraPointBallStopped(room: Room) {
        this.game.mode = null;

        room.send({ message: `🥅 Errou Extra Point • Bola parou antes de chegar no gol`, color: Global.Color.Yellow, style: "bold" });

        this.resetToKickoff(room, this.game.teamWithBall);
    }
}