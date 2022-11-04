import Command, { CommandInfo } from "../core/Command";
import { Team } from "../core/Global";
import Module from "../core/Module";

import type Room from "../core/Room";

import teams from "../teams.json";
import * as Global from "../Global";
import translate from "../utils/Translate";

type CustomTeam = {
    name: string,
    category: string,
    angle: number,
    textColor: number,
    colors: number[]
}

class CustomTeams extends Module {
    private teamList = teams;
    private teams: { red: CustomTeam, blue: CustomTeam };
    private maintainTeam: Team;

    constructor(room: Room) {
        super();

        this.setNextGameTeams();

        room.on("gameStop", () => this.setNextGameTeams());
        room.on("gameStart", () => this.setUniforms(room));
    }

    private setNextGameTeams() {
        const randomTeamSelection = this.getRandomTeams(2);

        this.teams = {
            red: this.maintainTeam === Team.Red ? this.teams.red : randomTeamSelection[0],
            blue: this.maintainTeam === Team.Blue ? this.teams.red : randomTeamSelection[1]
        };

        this.maintainTeam = null;
    }

    private getRandomTeams(count: number) {
        return this.teamList.sort(() => Math.random() - Math.random()).slice(0, count);
    }

    private setUniforms(room: Room) {
        room.setTeamColors(Team.Red, this.teams.red);
        room.setTeamColors(Team.Blue, this.teams.blue);
    }

    public getTeams() {
        return this.teams;
    }

    public setTeam(teamID: Team, customTeam: CustomTeam) {
        if (teamID === Team.Red) {
            this.teams.red = customTeam;
        } else if (teamID === Team.Blue) {
            this.teams.blue = customTeam;
        }
    }

    public setTeamToMaintainUniform(team: Team) {
        this.maintainTeam = team;
    }

    @Command({
        name: "setteam"
    })
    setteamCommand($: CommandInfo, room: Room) {
        if (!$.caller.isAdmin()) {
            $.caller.reply({ message: translate("NOT_ADMIN"), sound: 2, color: Global.Color.Orange, style: "bold" });

            return false;
        }

        if (!room.isGameInProgress()) {
            $.caller.reply({ message: translate("GAME_NOT_IN_PROGRESS"), sound: 2, color: Global.Color.Tomato, style: "bold" });

            return false;
        }

        const teamStr = $.args[0];
        const customTeamStr = $.args[1];

        let team;
        let customTeam = this.teamList.find(team => team.name.toLowerCase().replace(/[^\S ]+/, "").toLowerCase().replace(/[^\S ]+/, "") === customTeamStr?.toLowerCase()?.replace(/[^\S ]+/, ""));

        if (customTeamStr === "rand" || customTeamStr === "random") {
            customTeam = this.getRandomTeams(1)[0];
        }
        
        if (teamStr === "red") {
            team = Team.Red;
        } else if (teamStr === "blue") {
            team = Team.Blue;
        } else {
            $.caller.reply({ message: translate("INVALID_TEAM", room.prefix), sound: 2, color: Global.Color.Tomato, style: "bold" });

            return false;
        }

        if (!customTeam) {
            $.caller.reply({ message: translate("TEAM_NOT_FOUND", room.prefix), sound: 2, color: Global.Color.Tomato, style: "bold" });

            return false;
        }

        room.send({ message: translate("CHANGED_TEAM_COLORS", $.caller.name, team === Team.Red ? "Red" : "Blue", customTeam.name), color: Global.Color.Pink, style: "bold" });

        this.setTeam(team, customTeam);
        this.setUniforms(room);

        return false;
    }

    @Command({
        name: "teamlist"
    })
    teamlistCommand($: CommandInfo, room: Room) {
        $.caller.reply({ message: translate("TEAM_LIST", this.teamList.length, this.teamList.map(p => p.name).join(", ")), color: Global.Color.Tomato, style: "bold" });
    
        return false;
    }
}

export default CustomTeams;