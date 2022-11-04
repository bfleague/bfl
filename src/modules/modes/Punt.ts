import type Room from "../../core/Room";
import type Player from "../../core/Player";
import { Team } from "../../core/Global";
import Command, { CommandInfo } from "../../core/Command";

import * as Global from "../../Global";

import { Kick } from "./Kick";

import MapMeasures from "../../utils/MapMeasures";
import Game from "../Game";
import MathUtils from "../../utils/MathUtils";
import StadiumUtils from "../../utils/StadiumUtils";

export class Punt extends Kick {
    name = "punt";
    mode = "punt";

    playerLineLengthPuntPuntingTeam = 100;
    playerLineLengthPuntReceivingTeam = 200;
    playerBackDistancePunt = 100;

    constructor(room: Room, game: Game) {
        super(room, game);
    }

    set({ room, forTeam = this.game.teamWithBall, pos = this.game.ballPosition }:
        { room: Room, forTeam?: Team, pos?: Global.FieldPosition }) {
        this.game.mode = null;

        this.game.reset(room);
        this.game.resetPlay(room);

        this.game.teamWithBall = forTeam;
        this.game.ballPosition = pos;
        this.game.downCount = 0;
        this.game.distance = 20;

        room.send({ message: `🤾 Punt para o ${this.game.getTeamName(forTeam)}`, color: Global.Color.LightGreen, style: "bold" });

        const ballPosInMap = StadiumUtils.getCoordinateFromYards(pos.team, pos.yards);
        const ball = room.getBall();
        
        ball.setVelocityX(0);
        ball.setVelocityY(0);
        ball.setPosition(ballPosInMap);
        
        this.game.setBallKickForce(room, 1.2);

        let red = room.getPlayers().red();
        let blue = room.getPlayers().blue();

        let puntingTeam = (forTeam === Team.Red ? red : blue);
        let receivingTeam = forTeam === Team.Red ? blue : red;

        this.game.teamWithBall = forTeam;

        const setPuntingTeamPositions = (team: Player[]) => {
            const positions = MathUtils.getPointsAlongLine({ x: 0, y: this.playerLineLengthPuntPuntingTeam }, { x: 0, y: -this.playerLineLengthPuntPuntingTeam }, team.length);

            for (let i = 0; i < team.length; i++) {
                const player = team[i];
                    
                player.setPosition({ x: ballPosInMap.x + (forTeam === Team.Red ? -this.playerBackDistancePunt : this.playerBackDistancePunt), y: positions[i].y });
            }
        }

        const setReceivingTeamPositions = (team: Player[]) => {
            const positions = MathUtils.getPointsAlongLine({ x: 0, y: this.playerLineLengthPuntReceivingTeam }, { x: 0, y: -this.playerLineLengthPuntReceivingTeam }, team.length);

            let xPos = forTeam === Team.Red ? MapMeasures.PuntBluePositionX : MapMeasures.PuntRedPositionX;

            for (let i = 0; i < team.length; i++) {
                const player = team[i];
                    
                player.setPosition({ x: xPos, y: positions[i].y });
            }
        }

        setPuntingTeamPositions(puntingTeam);
        setReceivingTeamPositions(receivingTeam);

        this.setBallLine(room);
        this.game.down.resetFirstDownLine(room);

        this.game.blockTeam(room, this.game.invertTeam(forTeam));

        this.game.mode = this.mode;
    }

    public reset() {}
    
    @Command({
        name: "punt"
    })
    puntCommand($: CommandInfo, room: Room) {
        if (!room.isGameInProgress()) {
            $.caller.reply({ message: `⚠️ Não há um jogo em progresso!`, sound: 2, color: Global.Color.Tomato, style: "bold" });

            return false;
        }

        if ($.caller.getTeam() === Team.Spectators) {
            $.caller.reply({ message: `⚠️ Você não está em nenhum time!`, sound: 2, color: Global.Color.Tomato, style: "bold" });

            return false;
        }

        if ($.caller.getTeam() !== this.game.teamWithBall) {
            $.caller.reply({ message: `⚠️ Seu time não está com a posse da bola!`, sound: 2, color: Global.Color.Tomato, style: "bold" });

            return false;
        }

        if (this.game.mode !== this.game.down.waitingHikeMode) {
            $.caller.reply({ message: `⚠️ Você não pode pedir punt agora!`, sound: 2, color: Global.Color.Tomato, style: "bold" });

            return false;
        }

        if ($.caller.distanceTo(room.getBall()) > 50) {
            $.caller.reply({ message: `⚠️ Você está longe demais da bola!`, sound: 2, color: Global.Color.Tomato, style: "bold" });

            return false;
        }

        room.send({ message: `🦵 ${$.caller.name} solicitou PUNT!`, color: Global.Color.Yellow, style: "bold" });

        this.set({ room });

        return false;
    }
}