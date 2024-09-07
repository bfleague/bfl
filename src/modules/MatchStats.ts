import * as Discord from "discord.js";
import { Team } from "../core/Global";
import Player from "../core/Player";
import Room from "../core/Room";
import { Color, TeamPlayersHistory } from "../Global";
import Game from "./Game";
import * as Global from "../Global";
import translate from "../utils/Translate";
import Utils from "../utils/Utils";
import Database from "../Database";
import { json2csv } from "json-2-csv";

require("dotenv").config();

enum StatCategory {
  Quarterback,
  WideReceiver,
  Defense,
  SpecialTeams,
  Misc,
}

interface Stats {
  // Receiving
  jardasRecebidas: number;
  jardasCorridas: number;
  recepcoes: number;
  corridas: number;
  touchdownRecebidos: number;
  touchdownCorridos: number;
  fumbles: number;
  yac: number;

  // Special Teams
  retornos: number;
  jardasRetornadas: number;
  touchdownRetornados: number;
  fieldGoalJardas: number;
  fieldGoalCompletos: number;
  fieldGoalPerdidos: number;
  extraPoints: number;
  extraPointPerdidos: number;

  // Defense
  passesBloqueados: number;
  tackles: number;
  sacks: number;
  interceptacoes: number;
  pickSix: number;
  fumblesForcados: number;

  // Passing
  corridasQb: number;
  jardasLancadas: number;
  passesTentados: number;
  passesCompletos: number;
  passesPraTouchdown: number;
  interceptacoesLancadas: number;
  jardasPerdidasSack: number;
  sacksRecebidos: number;
  stripSackRecebidos: number;
  fumblesLancados: number;

  // Misc
  faltas: number;
  invasoes: number;
  invasoesAcumuladas: number;
}

export const STAT_POINTS: Partial<Stats> = {
  // Receiving
  recepcoes: 1.5,
  jardasRecebidas: 0.3,
  yac: 0.1,
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
  fumblesLancados: -6,
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
  fieldGoalJardas: 0.1,
};

export const STAT_NAMES: Record<
  keyof Stats,
  [string, string, StatCategory, number]
> = {
  // Receiving
  recepcoes: ["Recepções", "Rec", StatCategory.WideReceiver, 1],
  jardasRecebidas: ["Jardas Recebidas", "J Rec", StatCategory.WideReceiver, 2],
  jardasCorridas: ["Jardas Corridas", "J Run", StatCategory.WideReceiver, 3],
  touchdownRecebidos: [
    "Touchdowns Recebidos",
    "TD Rec",
    StatCategory.WideReceiver,
    4,
  ],
  touchdownCorridos: [
    "Touchdowns Corridos",
    "TD Run",
    StatCategory.WideReceiver,
    5,
  ],
  pickSix: ["Pick Six", "P Six", StatCategory.WideReceiver, 6],
  corridas: ["Corridas", "Run", StatCategory.WideReceiver, 7],
  fumbles: ["Fumbles", "Fum", StatCategory.WideReceiver, 8],
  yac: ["Jardas Pós-Recepção", "YAC", StatCategory.WideReceiver, 9],

  // Passing
  passesTentados: ["Passes Tentados", "Pass Ten", StatCategory.Quarterback, 20],
  passesCompletos: [
    "Passes Completos",
    "Pass Cmp",
    StatCategory.Quarterback,
    21,
  ],
  jardasLancadas: ["Jardas Lançadas", "J Lanc", StatCategory.Quarterback, 22],
  passesPraTouchdown: [
    "Passes para Touchdown",
    "Pass TD",
    StatCategory.Quarterback,
    23,
  ],
  interceptacoesLancadas: [
    "Interceptações Lançadas",
    "Int Lanc",
    StatCategory.Quarterback,
    24,
  ],
  sacksRecebidos: ["Sacks Recebidos", "Sac Rec", StatCategory.Quarterback, 25],
  corridasQb: [
    "Corridas de Quarterback",
    "QB Run",
    StatCategory.Quarterback,
    26,
  ],
  jardasPerdidasSack: [
    "Jardas Perdidas em Sack",
    "J Sac",
    StatCategory.Quarterback,
    27,
  ],
  stripSackRecebidos: [
    "Strip Sacks Recebidos",
    "St Sac",
    StatCategory.Quarterback,
    28,
  ],
  fumblesLancados: [
    "Fumbles Lançados",
    "Fum Lanc",
    StatCategory.Quarterback,
    29,
  ],

  // Defense
  passesBloqueados: [
    "Passes Bloqueados",
    "Pass Block",
    StatCategory.Defense,
    40,
  ],
  tackles: ["Tackles", "Tackle", StatCategory.Defense, 41],
  sacks: ["Sacks", "Sack", StatCategory.Defense, 42],
  interceptacoes: ["Interceptações", "Int", StatCategory.Defense, 43],
  fumblesForcados: ["Fumbles Forçados", "Fum Forc", StatCategory.Defense, 44],

  // Misc
  faltas: ["Faltas", "Faltas", StatCategory.Misc, 60],
  invasoes: ["Invasões", "Inv", StatCategory.Misc, 61],
  invasoesAcumuladas: ["Invasões acumuladas", "Inv Acc", StatCategory.Misc, 62],

  // Special Teams
  retornos: ["Retornos", "Ret", StatCategory.SpecialTeams, 80],
  jardasRetornadas: [
    "Jardas Retornadas",
    "J Ret",
    StatCategory.SpecialTeams,
    81,
  ],
  touchdownRetornados: [
    "Touchdowns Retornados",
    "TD Ret",
    StatCategory.SpecialTeams,
    82,
  ],
  fieldGoalJardas: [
    "Jardas de Field Goal",
    "J FG",
    StatCategory.SpecialTeams,
    83,
  ],
  fieldGoalCompletos: [
    "Field Goals Completos",
    "FG Cmp",
    StatCategory.SpecialTeams,
    84,
  ],
  fieldGoalPerdidos: [
    "Field Goals Perdidos",
    "FG Perd",
    StatCategory.SpecialTeams,
    85,
  ],
  extraPoints: [
    "Extra Points Tentados",
    "Ep Att",
    StatCategory.SpecialTeams,
    86,
  ],
  extraPointPerdidos: [
    "Extra Points Perdidos",
    "EP Perd",
    StatCategory.SpecialTeams,
    87,
  ],
};

const IGNORE_STATS = [
  "invasoesAcumuladas",
  "extraPoints",
  "extraPointPerdidos",
];

function getId() {
  return Math.random().toString(36).substr(2, 7).toUpperCase();
}

export default class MatchStats {
  private list: {
    playerName: string;
    playerId: number;
    registered: boolean;
    stats: Partial<Stats>;
  }[] = [];
  private stats: [number, number, number, number][] = [];
  private events: { type: string; time: number; payload: any }[] = [];
  private id = getId();
  private room: Room;
  private db = new Database();
  private tick = 0;

  constructor(room: Room) {
    this.room = room;
  }

  public calculatePointsPlayer(stats: Partial<Stats>): number;
  public calculatePointsPlayer(playerId: number): number;
  public calculatePointsPlayer(playerIdOrStats: number | Partial<Stats>) {
    const playerStats =
      typeof playerIdOrStats === "number"
        ? this.list.find((p) => p.playerId === playerIdOrStats)?.stats
        : playerIdOrStats;

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
      .map(
        (p) =>
          [p.playerName, this.calculatePointsPlayer(p.stats)] as [
            string,
            number,
          ],
      )
      .sort((a, b) => b[1] - a[1])
      .at(0);

    return { name: playerStats[0], points: playerStats[1] };
  }

  public sendStatsMsg(player: Player) {
    const playerStats = this.list.find((p) => p.playerId === player.id)?.stats;

    if (!playerStats) {
      player.reply({
        message: `⚠️ Você ainda não tem nenhum stats nessa partida!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return;
    }

    let qbCat: [string, number][] = [];
    let wrCat: [string, number][] = [];
    let defCat: [string, number][] = [];
    let miscCat: [string, number][] = [];

    Object.entries(playerStats).forEach(([statName, n]) => {
      if (IGNORE_STATS.includes(statName)) return;

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
      return cat
        .filter((a: any) => a)
        .map((a: any) => `${a[0]} (${a[1]})`)
        .join(", ");
    };

    let qbCatStr = stringifyCat(qbCat);
    let wrCatStr = stringifyCat(wrCat);
    let defCatStr = stringifyCat(defCat);
    let miscCatStr = stringifyCat(miscCat);

    let isStartMsgSet = false;

    const getStartMsg = () => {
      if (!isStartMsgSet) {
        isStartMsgSet = true;
        return ` ${player.name} (${this.calculatePointsPlayer(player.id)}) •`;
      }

      return "";
    };

    if (qbCat.length)
      player.reply({
        message: `🔴 𝐏𝐀𝐒 •${getStartMsg()} ${qbCatStr}`,
        style: "bold",
        color: Global.Color.Tomato,
        sound: 2,
      });
    if (wrCat.length)
      player.reply({
        message: `🟢 𝐑𝐄𝐂 •${getStartMsg()} ${wrCatStr}`,
        style: "bold",
        color: Global.Color.LimeGreen,
        sound: 2,
      });
    if (defCat.length)
      player.reply({
        message: `🔵 𝐃𝐄𝐅 •${getStartMsg()} ${defCatStr}`,
        style: "bold",
        color: 0x3bbdc4,
        sound: 2,
      });
    if (miscCat.length)
      player.reply({
        message: `🟡 𝐌𝐈𝐒𝐂 •${getStartMsg()} ${miscCatStr}`,
        style: "bold",
        color: 0xf2cc00,
        sound: 2,
      });
  }

  public emit(type: string, payload: any) {
    this.events.push({ type, time: this.tick, payload });
  }

  public add(player: Player, stats?: Partial<Stats>) {
    if (!player) return;

    const p = this.list.find((p) => p.playerId === player.id);

    if (!stats) {
      if (!p)
        this.list.push({
          playerId: player.id,
          playerName: player.name,
          registered: player.roles.includes(Global.loggedRole),
          stats: {},
        });

      return;
    }

    if (p) {
      for (const [key, value] of Object.entries(stats)) {
        this.stats.push([player.id, this.tick, STAT_NAMES[key][3], value]);

        if (p.stats[key] != null) {
          p.stats[key] += value;
        } else {
          p.stats[key] = value;
        }
      }
    } else {
      this.list.push({
        playerId: player.id,
        playerName: player.name,
        registered: player.roles.includes(Global.loggedRole),
        stats,
      });
    }
  }

  public clear() {
    this.list = [];
    this.id = getId();
    this.tick = 0;
    this.stats = [];
    this.events = [];
  }

  public setTick(t: number) {
    this.tick = t;
  }

  public async sendToDiscord(
    recording: Uint8Array,
    game: Game,
    teamsHistory: TeamPlayersHistory,
  ) {
    const client = new Discord.Client({
      intents: [Discord.GatewayIntentBits.Guilds],
    });

    const redName = game.getCustomTeamName(Team.Red);
    const blueName = game.getCustomTeamName(Team.Blue);

    const stats = this.list.map((l) => {
      return {
        id: l.playerId,
        name: l.playerName,
        confirmed: l.registered,
        points: this.calculatePointsPlayer(l.stats),
        ...l.stats,
      };
    });

    const players = teamsHistory.filter(
      (p, i, self) => self.findIndex((v) => v.id === p.id) === i,
    );

    const getNames = (p: typeof players) =>
      p.map(
        (p) =>
          `${p.name} #${p.id} (${
            stats.find((p2) => p2.id === p.id)?.points ?? 0
          })`,
      );

    const red = players.filter((p) => p.team === Team.Red);
    const blue = players.filter((p) => p.team === Team.Blue);

    const playersRed = getNames(red);
    const playersBlue = getNames(blue);
    const score = game.getScore();

    const data = {
      size: this.tick,
      id: this.id,
      time: Date.now(),
      players: stats.map((l) => ({
        id: l.id,
        name: l.name,
        confirmed: l.confirmed,
        points: l.points,
      })),
      stats: this.stats,
      events: this.events,
      teams: {
        red: {
          name: redName,
          score: score.red,
          playersIds: red.map((p) => p.id),
        },
        blue: {
          name: blueName,
          score: score.blue,
          playersIds: blue.map((p) => p.id),
        },
      },
    };

    const statsCSV = json2csv(stats, { emptyFieldValue: 0 });

    const files = [
      new Discord.AttachmentBuilder(Buffer.from(recording), {
        name: `${this.id}.hbr2`,
      }),
      new Discord.AttachmentBuilder(Buffer.from(statsCSV), {
        name: "stats.csv",
      }),
      new Discord.AttachmentBuilder(Buffer.from(JSON.stringify(data)), {
        name: "data.json",
      }),
    ];

    this.db.addMatch(this.id, {
      size: this.tick,
      players: stats.map((l) => ({
        id: l.id,
        name: l.name,
        confirmed: l.confirmed,
        points: l.points,
      })),
      stats: this.stats,
      events: this.events,
      teams: {
        red: {
          name: redName,
          score: score.red,
          playersIds: red.map((p) => p.id),
        },
        blue: {
          name: blueName,
          score: score.blue,
          playersIds: blue.map((p) => p.id),
        },
      },
    });

    const embed = new Discord.EmbedBuilder()
      .setTitle(`${redName} ${score.red} x ${score.blue} ${blueName}`)
      .setDescription(
        `[Clique aqui para ver as stats](https://bflstats.fun/match?id=${this.id})`,
      )
      .setColor(0x0099ff)
      .addFields(
        {
          name: "Red",
          value: playersRed.length ? playersRed.join("\n") : "-",
          inline: true,
        },
        {
          name: "Blue",
          value: playersBlue.length ? playersBlue.join("\n") : "-",
          inline: true,
        },
      );

    client.once(Discord.Events.ClientReady, (c) => {
      const guild = c.guilds.cache.get(process.env.GUILD_ID.toString());

      if (!guild) {
        console.log(
          "Warning: could not find guild, guild ID = ",
          process.env.GUILD_ID.toString(),
        );
        c.destroy();
        return;
      }

      const channel = guild.channels.cache.get(
        process.env.REC_CHANNEL_ID.toString(),
      ) as Discord.TextChannel;

      channel
        .send({ embeds: [embed], files })
        .then(() => {
          this.room.send({
            message: translate("GAME_RECORDED", this.id),
            color: Color.LightPink,
            style: "bold",
          });
          c.destroy();
        })
        .catch((err) => {
          console.log(`Warning: could not send message to Discord: ${err}`);
          c.destroy();
        });
    });

    client.login(process.env.DISCORD_TOKEN).catch((err) => {
      console.log(`Warning: could not login to Discord: ${err}`);
      client.destroy();
    });
  }
}
