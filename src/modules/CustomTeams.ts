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
    private teamList: CustomTeam[];
    private teams: { red: CustomTeam, blue: CustomTeam };
    private maintainTeam: Team;

    constructor(room: Room) {
        super();

        this.teamList = Object.entries(teams).map(([name, uniform]) => {
            const uniformColor = uniform.color.replace("/colors red ", "").split(" ");

            const toColor = (str: string) => Number("0x" + str);

            return {
                name,
                category: uniform.category,
                angle: Number(uniformColor[0]),
                textColor: toColor(uniformColor[1]),
                colors: [uniformColor[2], uniformColor[3], uniformColor[4]].map(c => toColor(c))
            };
        });

        this.setNextGameTeams();

        room.on("gameStart", () => {
            this.setNextGameTeams();
            this.setUniforms(room);
            room.send({ message: `​🏈​ ${this.teams.red.name} x ${this.teams.blue.name}`, color: Global.Color.LimeGreen, style: "bold" });
        });
    }

    private setNextGameTeams() {
        const maintainTeam = this.maintainTeam ? (this.maintainTeam === Team.Red ? this.teams.red : this.teams.blue) : null;
        const randomTeamSelection = this.getRandomTeams(2, maintainTeam?.category);

        this.teams = {
            red: this.maintainTeam === Team.Red ? maintainTeam : randomTeamSelection[0],
            blue: this.maintainTeam === Team.Blue ? maintainTeam : randomTeamSelection[1]
        };

        this.maintainTeam = null;
    }

    private getRandomTeams(count: number, categoryFilter?: string) {
        return this.teamList.filter(t => t.category !== categoryFilter)
            .sort(() => Math.random() - Math.random()).reduce((acc, current) => {
                if (!acc.some(obj => obj.label === current.category)) acc.push(current);
                return acc;
            }, [])
            .slice(0, count);
    }

    private setUniforms(room: Room) {
        room.setTeamColors(Team.Red, this.teams.red);
        room.setTeamColors(Team.Blue, this.teams.blue);
    }

    public swapTeams(room: Room) {
        const red = JSON.parse(JSON.stringify(this.teams.red));
        const blue = JSON.parse(JSON.stringify(this.teams.blue));

        this.teams.red = blue;
        this.teams.blue = red;

        if (this.maintainTeam) this.maintainTeam = this.maintainTeam === Team.Red ? Team.Blue : Team.Red;

        this.setUniforms(room);
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