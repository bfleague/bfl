import type Room from "../../core/Room";
import type Player from "../../core/Player";
import { Team } from "../../core/Global";

import * as Global from "../../Global";

import { Kick } from "./Kick";

import MapMeasures from "../../utils/MapMeasures";
import Game, { GameModes } from "../Game";
import MathUtils from "../../utils/MathUtils";
import StadiumUtils from "../../utils/StadiumUtils";

export class Safety extends Kick {
    name = "safety";
    mode = GameModes.Safety;

    playerLineLengthSafetyTeam = 100;
    playerLineLengthReceivingTeam = 200;
    playerBackDistanceSafety = 100;

    safetyYardLine = 20;

    constructor(room: Room, game: Game) {
        super(room, game);
    }

    set({ room, forTeam = this.game.teamWithBall }:
        { room: Room, forTeam?: Team, pos?: Global.FieldPosition }) {
        this.game.mode = null;

        this.game.reset(room);
        this.game.resetPlay(room);

        this.game.teamWithBall = forTeam;
        this.game.ballPosition = { team: this.game.teamWithBall, yards: this.safetyYardLine };
        this.game.downCount = 0;
        this.game.distance = 20;

        room.send({ message: `🤾 Safety para o ${this.game.getTeamName(forTeam)}`, color: Global.Color.LightGreen, style: "bold" });

        const ballPosInMap = StadiumUtils.getCoordinateFromYards(forTeam, this.safetyYardLine);
        const ball = room.getBall()
        
        ball.setVelocityX(0);
        ball.setVelocityY(0);
        ball.setPosition(ballPosInMap);

        let red = room.getPlayers().red();
        let blue = room.getPlayers().blue();

        let safetyTeam = (forTeam === Team.Red ? red : blue);
        let receivingTeam = forTeam === Team.Red ? blue : red;

        this.game.teamWithBall = forTeam;

        const setPuntingTeamPositions = (team: Player[]) => {
            const positions = MathUtils.getPointsAlongLine({ x: 0, y: this.playerLineLengthSafetyTeam }, { x: 0, y: -this.playerLineLengthSafetyTeam }, team.length);

            for (let i = 0; i < team.length; i++) {
                const player = team[i];
                    
                player.setPosition({ x: ballPosInMap.x + (forTeam === Team.Red ? -this.playerBackDistanceSafety : this.playerBackDistanceSafety), y: positions[i].y });
            }
        }

        const setReceivingTeamPositions = (team: Player[]) => {
            const positions = MathUtils.getPointsAlongLine({ x: 0, y: this.playerLineLengthReceivingTeam }, { x: 0, y: -this.playerLineLengthReceivingTeam }, team.length);

            let xPos = forTeam === Team.Red ? MapMeasures.PuntBluePositionX : MapMeasures.PuntRedPositionX;

            for (let i = 0; i < team.length; i++) {
                const player = team[i];
                    
                player.setPosition({ x: xPos, y: positions[i].y });
            }
        }

        setPuntingTeamPositions(safetyTeam);
        setReceivingTeamPositions(receivingTeam);

        this.setBallLine(room);
        this.game.down.resetFirstDownLine(room);

        this.game.blockTeam(room, this.game.invertTeam(forTeam));

        this.game.mode = this.mode;
    }

    public reset() {}
}