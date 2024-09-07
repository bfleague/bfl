import type Room from "../../core/Room";
import { Team } from "../../core/Global";

import * as Global from "../../Global";

import { Kick } from "./Kick";
import Game, { GameModes } from "../Game";

import MapMeasures from "../../utils/MapMeasures";
import MathUtils from "../../utils/MathUtils";
import StadiumUtils from "../../utils/StadiumUtils";
import Player from "../../core/Player";
import Timer from "../../utils/Timer";
import Utils from "../../utils/Utils";

export class KickOff extends Kick {
    mode = GameModes.Kickoff;
    name = "kick off";

    playerLineLengthKickoff = 200;

    kickoffSecondsToAddExtra = 10;
    kickoffTimePenalty = 10;
    kickoffTimer: Timer; 
    kickoffPenaltyStartedAt: number;

    isBallToBeKicked = false;

    constructor(room: Room, game: Game) {
        super(room, game);

        room.on("playerTeamChanged", (changedPlayer, byPlayer) => {
            if (this.game.mode !== this.mode) return;
            
            if (!this.game.qbKickedBall) {
                this.game.blockTeam(room, this.game.invertTeam(this.game.teamWithBall));
                this.game.blockMiddleKickoff(room, this.game.teamWithBall);
            }
        });

        room.on("playerBallKick", (player: Player) => {
            if (this.game.mode !== this.mode) return;

            if (this.kickoffPenaltyStartedAt) {
                const kickoffStallExtraTime = Date.now() - this.kickoffPenaltyStartedAt;

                this.game.addToStoppage(kickoffStallExtraTime);

                room.send({ message: `​⏰​ Foram adicionados ${Utils.getFormattedSeconds(parseInt(((kickoffStallExtraTime/1000) + 10).toFixed(2)))} de acréscimos devido à demora em chutar o kickoff`, color: Global.Color.Yellow, style: "bold" });
            }

            this.isBallToBeKicked = false;
            this.kickoffPenaltyStartedAt = 0;
            
            this.resetStallCounter();
        });

        room.on("gamePause", () => {
            this.kickoffTimer?.pause();
        });

        room.on("gameUnpause", () => {
            this.kickoffTimer?.resume();
        });
    }

    set({ room, forTeam = this.game.teamWithBall, pos }: {room: Room, forTeam?: Team, pos?: Global.FieldPosition}) {
        this.game.mode = null;

        this.game.reset(room);
        this.game.resetPlay(room);

        if (!pos) {
            this.game.ballPosition = { team: forTeam, yards: 50 };
            pos = this.game.ballPosition;
        } else {
            this.game.ballPosition = pos;
        }

        this.game.teamWithBall = forTeam;
        this.game.downCount = 0;
        this.game.distance = 20;
        this.isBallToBeKicked = true;

        if (!this.game.firstKickoff && this.game.endGameTime > 0 && room.getScores().time > 1) this.kickoffTimer = new Timer(() => {
            this.kickoffPenaltyStartedAt = Date.now();
            this.game.addToStoppage(10 * 1000);
        }, this.kickoffSecondsToAddExtra * 1000);

        room.send({ message: `​🤾‍♂️​ Kickoff para o ${this.game.getTeamName(forTeam)}`, color: Global.Color.Yellow, style: "bold" });

        const ballPosInMap = StadiumUtils.getCoordinateFromYards(pos.team, pos.yards);
        const ball = room.getBall();
        
        ball.setVelocityX(0);
        ball.setVelocityY(0);
        ball.setPosition(ballPosInMap);
        this.game.setBallKickForce(room, 1.2);
        
        this.game.down.resetFirstDownLine(room);
        this.game.down.resetBallLine(room);

        let red = room.getPlayers().red();
        let blue = room.getPlayers().blue();

        const filterPlayerOutsideField = (p: Player) => Math.abs(p.getY()) < Math.abs(MapMeasures.OuterField[0].y);
        const getSignal = (p: Player) => p.getTeam() === Team.Red ? -1 : 1;

        let kickingTeam = (forTeam === Team.Red ? red : blue)
            .filter(filterPlayerOutsideField);
        let receivingTeam = (forTeam === Team.Red ? blue : red)
            .filter(filterPlayerOutsideField);

        const kickingPositions = MathUtils.getPointsAlongLine({ x: 0, y: this.playerLineLengthKickoff }, { x: 0, y: -this.playerLineLengthKickoff }, kickingTeam.length);
        const receivingPositions = MathUtils.getPointsAlongLine({ x: 0, y: this.playerLineLengthKickoff }, { x: 0, y: -this.playerLineLengthKickoff }, receivingTeam.length);

        for (let i = 0; i < kickingPositions.length; i++) {
            const player = kickingTeam[i];
                
            player.setPosition({
                x: room.getScores().time === 0 ?
                    Math.abs(MapMeasures.InnerField[0].x) * getSignal(player) :
                    MapMeasures.KickoffKickingPositionX * getSignal(player),
                y: kickingPositions[i].y
            });
        }

        for (let i = 0; i < receivingTeam.length; i++) {
            const player = receivingTeam[i];
                
            player.setPosition({
                x: MapMeasures.KickoffReceivingPositionX * getSignal(player),
                y: receivingPositions[i].y
            });
        }

        this.game.blockTeam(room, this.game.invertTeam(forTeam));
        this.game.blockMiddleKickoff(room, forTeam);

        this.game.mode = this.mode;
    }

    private resetStallCounter() {
        this.kickoffPenaltyStartedAt = null;
        this.kickoffTimer?.stop();
        this.kickoffTimer = null;
    }

    public reset() {
        this.resetStallCounter();
        this.isBallToBeKicked = false;
        this.game.firstKickoff = false;
    }
}