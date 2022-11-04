import Command, { CommandInfo } from "../../core/Command";
import Module from "../../core/Module";
import PlayerList from "../../core/PlayerList";
import Room from "../../core/Room";
import * as Global from "../../Global";
import Utils from "../../utils/Utils";

type BanList = { id: number, name: string, reason?: string, byPlayer: string }[];

export class Admin extends Module {
    adminsAuth: string[] = [];
    players = new PlayerList();
    bans: BanList = [];
    blackBanneds: string[] = [];
    restrictNonRegisteredPlayers = !!window["CustomSettings"]?.nivel;

    constructor(room: Room) { 
        super();

        room.on("playerJoin", (player) => {
            this.updateAdmins(room);
        });

        room.on("playerLeave", (player) => {
            this.updateAdmins(room);
        });

        room.on("playerAdminChange", (changedPlayer, byPlayer) => {
            if (!changedPlayer.auth) return;
            
            if (this.restrictNonRegisteredPlayers && !changedPlayer.roles.includes(Global.loggedRole)) {
                changedPlayer.setAdmin(false);
            } else if (this.adminsAuth.includes(changedPlayer.auth) && !changedPlayer.isAdmin() && byPlayer && byPlayer.id !== changedPlayer.id) {
                changedPlayer.setAdmin(true);
            } else {
                this.updateAdmins(room);
            }
        });

        room.on("afk", () => {
            this.updateAdmins(room);
        });

        room.on("playerKicked", (kickedPlayer, reason, ban, byPlayer) => {
            if (!ban) return;
            
            if (byPlayer && !this.adminsAuth.includes(byPlayer.auth) && kickedPlayer.roles.includes(Global.loggedRole)) {
                byPlayer.kick("Você não pode banir registrados sem ser um admin oficial!");
    
                room.clearBan(kickedPlayer.id);
            } else {
                this.bans.push({ id: kickedPlayer.id, name: kickedPlayer.name, reason: reason, byPlayer: byPlayer?.name });
            }
        });

        room.on("playerJoin", (player) => {
            if (player.roles.includes(Global.adminAccountRole)) {
                this.adminsAuth.push(player.auth);
            }
        });
    }

    private updateAdmins(room: Room) {
        if (!room.getPlayers().find(p => p.isAdmin() && !p.settings.afk)) {
            const player = room.getPlayers().filter(p => !p.isAdmin() && !p.settings.afk && (this.restrictNonRegisteredPlayers ? p.roles.includes(Global.loggedRole) : true))[0];

            if (player) {
                player.setAdmin(true);
            }
        }
    }

    @Command({
        name: "admin"
    })
    adminCommand($: CommandInfo, room: Room) {
        if (this.adminsAuth.includes($.caller.auth)) {
            $.caller.setAdmin(!$.caller.isAdmin());

            return false;
        }
        
        $.caller.reply({ message: `⚠️ Somente administradores oficiais podem utilizar esse comando!`, color: Global.Color.Tomato, style: "bold" });

        return false;
    }

    @Command({
        name: "limparbans"
    })
    limparbansCommand($: CommandInfo, room: Room) {
        if (!this.adminsAuth.includes($.caller.auth)) {
            $.caller.reply({ message: `⚠️ Somente administradores oficiais podem utilizar esse comando!`, color: Global.Color.Tomato, style: "bold" });
            
            return false;
        }

        if (this.bans.length === 0 && $.args[0] !== "force") {
            $.caller.reply({ message: `⚠️ Não há ninguém banido!\n❌ Se você acha que isso é um erro, digite "${room.prefix}limparbans force" para desbanir mesmo assim.`, color: Global.Color.Tomato, style: "bold" });
            
            return false;
        }

        room.clearBans();
        room.send({ message: `🕊️ Todos os bans (${this.bans.length}) foram removidos por ${$.caller.name}!`, color: Global.Color.HotPink, style: "bold" });
        
        this.bans = [];
    }

    @Command({
        name: "desbanir",
    })
    desbanirCommand($: CommandInfo, room: Room) {
        if (!this.adminsAuth.includes($.caller.auth)) {
            $.caller.reply({ message: `⚠️ Somente administradores oficiais podem utilizar esse comando!`, color: Global.Color.Tomato, style: "bold" });
            
            return false;
        }
        
        const idOrName = $.args[0];
        const bannedPlayers = this.bans.filter(p => p.id === parseInt(idOrName) || p.name === idOrName);

        if (bannedPlayers.length) {
            let names: string[] = [];
            let message = "";

            bannedPlayers.forEach(bP => {
                names.push(bP.name);
                room.clearBan(bP.id);
                this.bans = this.bans.filter(p => p.id !== bP.id);
            });

            if (names.length > 1) {
                if (names.every((value, index, array) => value === array[0])) {
                    message = `${names.length} jogadores com o nome ${names[0]} foram desbanidos`;
                } else {
                    message = `${Utils.getPlayersNames(bannedPlayers)} foram desbanidos`;
                }
            } else {
                message = `${names[0]} foi desbanido`;
            }

            room.send({ message: `🕊️ ${message} por ${$.caller.name}`, color: Global.Color.HotPink, style: "bold" })
        } else {
            $.caller.reply({ message: `⚠️ Não foi encontrado nenhum jogador banido com esse nome ou ID!`, color: Global.Color.Tomato, style: "bold" });
        }
    }

    @Command({
        name: "banidos"
    })
    banidosCommand($: CommandInfo, room: Room) {
        if (!this.adminsAuth.includes($.caller.auth)) {
            $.caller.reply({ message: `⚠️ Somente administradores oficiais podem utilizar esse comando!`, color: Global.Color.Tomato, style: "bold" });
            
            return false;
        }

        if (this.bans.length) {
            const banned = this.bans.slice(0, 20);

            $.caller.reply({ message: `🚫 Lista de banidos (${this.bans.length}): ${Utils.getPlayersNames(banned.map(p => { return { name: `${p.name} (${p.id})` }}))}${this.bans.length > 20 ? `\n🚫 ...e mais outros ${this.bans.length - banned.length}.` : ""}`, color: Global.Color.HotPink, style: "bold" });
        } else {
            $.caller.reply({ message: `⚠️ Não há ninguém banido!`, color: Global.Color.Tomato, style: "bold" });
        }
    }
}