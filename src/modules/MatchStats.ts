import * as Discord from "discord.js";
import { Team } from "../core/Global";
import Player from "../core/Player";
import Room from "../core/Room";
import { Color, TeamPlayersHistory } from "../Global";
import Game from "./Game";
import * as Global from "../Global";
import translate from "../utils/Translate";
import Utils from "../utils/Utils";

require('dotenv').config();

enum StatCategory {
    Quarterback,
    WideReceiver,
    Defense,
    SpecialTeams,
    Misc
}

interface Stats {
    // Receiving
    jardasRecebidas: number,
    jardasCorridas: number,
    recepcoes: number,
    corridas: number,
    touchdownRecebidos: number,
    touchdownCorridos: number,
    fumbles: number,

    // Special Teams
    retornos: number,
    jardasRetornadas: number,
    touchdownRetornados: number,
    fieldGoalJardas: number,
    fieldGoalCompletos: number,
    fieldGoalPerdidos: number,

    // Defense
    passesBloqueados: number,
    tackles: number,
    sacks: number,
    interceptacoes: number,
    pickSix: number,
    fumblesForcados: number,

    // Passing
    corridasQb: number,
    jardasLancadas: number,
    passesTentados: number,
    passesCompletos: number,
    passesPraTouchdown: number,
    interceptacoesLancadas: number,
    jardasPerdidasSack: number,
    sacksRecebidos: number,
    stripSackRecebidos: number,

    // Misc
    faltas: number
}

export const STAT_POINTS: Partial<Stats> = {
    // Receiving
    recepcoes: 1.5,
    jardasRecebidas: 0.3,
    jardasCorridas: 0.5,
    touchdownRecebidos: 6,
    touchdownCorridos: 6,
    pickSix: 6,
    fumbles: -6,

    // Passing
    passesTentados: 0,
    passesCompletos: 2,
    jardasLancadas: 0.1,
    passesPraTouchdown: 4,
    interceptacoesLancadas: -6,
    sacksRecebidos: -1,
    /*
     * jardasPerdidasSack is positive because lost yards are already negative,
     * otherwise multiplying them would result in a positive score
     */
    jardasPerdidasSack: 0.5,
    stripSackRecebidos: -4,

    // Defense
    passesBloqueados: 3,
    tackles: 1.5,
    sacks: 6,
    interceptacoes: 12,
    fumblesForcados: 8,

    // Misc
    faltas: -3,

    // Special Teams
    retornos: 0,
    touchdownRetornados: 6,
    fieldGoalPerdidos: -2,
    fieldGoalJardas: 0.1
};

export const STAT_NAMES: Record<keyof Stats, [string, string, StatCategory]> = {
    // Receiving
    recepcoes: ["Recepções", "Rec", StatCategory.WideReceiver],
    jardasRecebidas: ["Jardas Recebidas", "J Rec", StatCategory.WideReceiver],
    jardasCorridas: ["Jardas Corridas", "J Run", StatCategory.WideReceiver],
    touchdownRecebidos: ["Touchdowns Recebidos", "TD Rec", StatCategory.WideReceiver],
    touchdownCorridos: ["Touchdowns Corridos", "TD Run", StatCategory.WideReceiver],
    pickSix: ["Pick Six", "P Six", StatCategory.WideReceiver],
    corridas: ["Corridas", "Run", StatCategory.WideReceiver],
    fumbles: ["Fumbles", "Fum", StatCategory.WideReceiver],

    // Passing
    passesTentados: ["Passes Tentados", "Pass Ten", StatCategory.Quarterback],
    passesCompletos: ["Passes Completos", "Pass Cmp", StatCategory.Quarterback],
    jardasLancadas: ["Jardas Lançadas", "J Lanc", StatCategory.Quarterback],
    passesPraTouchdown: ["Passes para Touchdown", "Pass TD", StatCategory.Quarterback],
    interceptacoesLancadas: ["Interceptações Lançadas", "Int Lanc", StatCategory.Quarterback],
    sacksRecebidos: ["Sacks Recebidos", "Sac Rec", StatCategory.Quarterback],
    corridasQb: ["Corridas de Quarterback", "QB Run", StatCategory.Quarterback],
    jardasPerdidasSack: ["Jardas Perdidas em Sack", "J Sac", StatCategory.Quarterback],
    stripSackRecebidos: ["Strip Sacks Recebidos", "St Sac", StatCategory.WideReceiver],

    // Defense
    passesBloqueados: ["Passes Bloqueados", "Pass Block", StatCategory.Defense],
    tackles: ["Tackles", "Tackle", StatCategory.Defense],
    sacks: ["Sacks", "Sack", StatCategory.Defense],
    interceptacoes: ["Interceptações", "Int", StatCategory.Defense],
    fumblesForcados: ["Fumbles Forçados", "Fum Forc", StatCategory.Defense],

    // Misc
    faltas: ["Faltas", "Faltas", StatCategory.Misc],

    // Special Teams
    retornos: ["Retornos", "Ret", StatCategory.SpecialTeams],
    jardasRetornadas: ["Jardas Retornadas", "J Ret", StatCategory.SpecialTeams],
    touchdownRetornados: ["Touchdowns Retornados", "TD Ret", StatCategory.SpecialTeams],
    fieldGoalJardas: ["Jardas de Field Goal", "J FG", StatCategory.SpecialTeams],
    fieldGoalCompletos: ["Field Goals Completos", "FG Cmp", StatCategory.SpecialTeams],
    fieldGoalPerdidos: ["Field Goals Perdidos", "FG Perd", StatCategory.SpecialTeams],
};

function getId() {
    return Math.random().toString(36).substr(2, 5).toUpperCase();
}

export default class MatchStats {
    private list: { playerName: string, playerId: number, registered: boolean, stats: Partial<Stats> }[] = [];
    private id = getId();
    private room: Room;

    constructor(room: Room) {
        this.room = room;
    }

    public calculatePointsPlayer(stats: Partial<Stats>): number;
    public calculatePointsPlayer(playerId: number): number;
    public calculatePointsPlayer(playerIdOrStats: number | Partial<Stats>) {
        const playerStats = typeof playerIdOrStats === "number" ? this.list.find(p => p.playerId === playerIdOrStats)?.stats : playerIdOrStats;

        if (!playerStats) return 0;

        let points = 0;

        for (const [statName, score] of Object.entries(playerStats)) {
            const multiplier = STAT_POINTS[statName] ?? 0;

            points += score * multiplier;
        }

        return Number(points.toFixed(1));
    }

    public getMVP() {
        if (!this.list.length) return;

        const playerStats = this.list
            .map(p => [p.playerName, this.calculatePointsPlayer(p.stats)] as [string, number])
            .sort((a, b) => b[1] - a[1])
            .at(0);

        return { name: playerStats[0], points: playerStats[1] };
    }

    public sendStatsMsg(player: Player) {
        const playerStats = this.list.find(p => p.playerId === player.id)?.stats;
        
        if (!playerStats) {
            player.reply({ message: `⚠️ Você ainda não tem nenhum stats nessa partida!`, sound: 2, color: Global.Color.Tomato, style: "bold" });
        
            return;
        }

        let qbCat: [string, number][] = [];
        let wrCat: [string, number][] = [];
        let defCat: [string, number][] = [];
        let miscCat: [string, number][] = [];

        Object.entries(playerStats).forEach(([statName, n]) => {
            const statInfo = STAT_NAMES[statName];
            const statCat = statInfo[2];

            const stat: [string, number] = [statInfo[1], n];

            switch (statCat) {
                case StatCategory.Quarterback:
                    qbCat.push(stat);
                    break;
                case StatCategory.WideReceiver:
                    wrCat.push(stat);
                    break;
                case StatCategory.Defense:
                    defCat.push(stat);
                    break;
                default:
                    miscCat.push(stat);
                    break;
            }
        });

        const stringifyCat = (cat: any) => {
            return cat.filter((a: any) => a).map((a: any) => `${a[0]} (${a[1]})`).join(", ");
        }

        let qbCatStr = stringifyCat(qbCat);
        let wrCatStr = stringifyCat(wrCat);
        let defCatStr = stringifyCat(defCat);
        let miscCatStr = stringifyCat(miscCat);

        let isStartMsgSet = false;

        const getStartMsg = () => {
            if (!isStartMsgSet) {
                isStartMsgSet = true;
                return ` ${player.name} (${this.calculatePointsPlayer(player.id)}) •`;;
            }

            return "";
        };

        if(qbCat.length) player.reply({ message: `🔴 𝐏𝐀𝐒 •${getStartMsg()} ${qbCatStr}`, style: "bold", color: Global.Color.Tomato, sound: 2 });
        if(wrCat.length) player.reply({ message: `🟢 𝐑𝐄𝐂 •${getStartMsg()} ${wrCatStr}`, style: "bold", color: Global.Color.LimeGreen, sound: 2 });
        if(defCat.length) player.reply({ message: `🔵 𝐃𝐄𝐅 •${getStartMsg()} ${defCatStr}`, style: "bold", color: 0x3bbdc4, sound: 2 });
        if(miscCat.length) player.reply({ message: `🟡 𝐌𝐈𝐒𝐂 •${getStartMsg()} ${miscCatStr}`, style: "bold", color: 0xf2cc00, sound: 2 });
    }

    public add(player: Player, stats: Partial<Stats>) {
        if (!player) return;

        const p = this.list.find(p => p.playerId === player.id);

        if (p) {
            for (const [key, value] of Object.entries(stats)) {
                if (p.stats[key] != null) {
                    p.stats[key] += value;
                } else {
                    p.stats[key] = value;
                }
            }
        } else {
            this.list.push({ playerId: player.id, playerName: player.name, registered: player.roles.includes(Global.loggedRole), stats });
        }
    }

    public clear() {
        this.list = [];
        this.id = getId();
    }
    
    public async sendToDiscord(recording: Uint8Array, game: Game, teamsHistory: TeamPlayersHistory) {
        const client = new Discord.Client({ intents: [Discord.GatewayIntentBits.Guilds] });

        const redName = game.getCustomTeamName(Team.Red);
        const blueName = game.getCustomTeamName(Team.Blue);

        const stats = this.list.map(l => {
            return {
                id: l.playerId,
                name: l.playerName,
                points: this.calculatePointsPlayer(l.stats),
                ...l.stats
            };
        });

        const players = teamsHistory.filter((p, i, self) =>
            self.findIndex(v => v.id === p.id) === i
        );

        const getNames = (p: typeof players) => p.map(p => `${p.name} #${p.id} (${stats.find(p2 => p2.id === p.id)?.points ?? 0})`);

        const playersRed = getNames(players.filter(p => p.team === Team.Red));
        const playersBlue = getNames(players.filter(p => p.team === Team.Blue));

        const statsCSV = Utils.objectsToCSV(stats, ["id", "name", "points", ...Object.keys(STAT_NAMES)]);

        const files = [
            new Discord.AttachmentBuilder(Buffer.from(recording), { name: `${this.id}.hbr2` }),
            new Discord.AttachmentBuilder(Buffer.from(statsCSV), { name: "stats.csv" })
        ];

        const embed = new Discord.EmbedBuilder()
            .setTitle(`${redName} ${game.scoreRed} x ${game.scoreBlue} ${blueName}`)
            .setColor(0x0099FF)
            .addFields(
                { name: "Red", value: playersRed.length ? playersRed.join("\n") : "-", inline: true },
                { name: "Blue", value: playersBlue.length ? playersBlue.join("\n") : "-", inline: true }
            );

        client.once(Discord.Events.ClientReady, c => {
            const guild = c.guilds.cache.get(process.env.GUILD_ID);
            const channel = guild.channels.cache.get(process.env.RECS_CHANNEL_ID) as Discord.TextChannel;
            
            channel.send({ embeds: [embed], files }).then(() => {
                this.room.send({message: translate("GAME_RECORDED", this.id), color: Color.LightPink, style: "bold" });
                c.destroy();
            });
        });

        client.login(process.env.DISCORD_TOKEN)
        .catch(err => {
            console.log(`Warning: could not login to Discord: ${err}`);
            client.destroy();
        });
    }
}