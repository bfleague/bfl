import { Team } from "../../core/Global";
import Module from "../../core/Module";
import Room from "../../core/Room";
import Database, { ResponseType } from "../../Database";
import Utils from "../../utils/Utils";
import * as Global from "../../Global";
import Player from "../../core/Player";
import Command, { CommandInfo } from "../../core/Command";

export default class Register extends Module {
    private database = new Database();
    private confirmationLevel = "CONFIRMED";
    private kickTime = 30000;
    private restrictNonRegisteredPlayers = false;
    private disableAfterInitialPingFailed = true;
    private disabled = false;

    private playersWaitingConfirmation: { player: Player, password: string }[] = [];

    constructor(room: Room) {
        super();

        if (this.disableAfterInitialPingFailed) {
            this.database.ping().then(req => {
                if (req.type !== ResponseType.Success) {
                    this.disabled = true;

                    console.log("%cAttention: Ping to database service failed. The login system will be disabled.", "font-size: 20px; color: red;");
                }
            });
        }

        if (this.restrictNonRegisteredPlayers) {
            setInterval(() => {
                if (this.disabled) return;

                for (const player of room.getPlayers()) {
                    if (!player.roles.includes(Global.loggedRole)) {
                        player.reply({ message: `❌ Você não está registrado! Registre-se no nosso !discord${this.restrictNonRegisteredPlayers ? " para poder jogar" : ""}.`, color: Global.Color.Tomato, style: "bold", sound: 2 });
                    }
                }
            }, 0.5 * 60 * 1000)
        }

        room.addConfirmLevel(this.confirmationLevel);

        room.on("playerNeedsConfirmation", (player) => {
            if (this.disabled) {
                player.reply({ message: `👋 E aí, ${player.name}! Seja bem-vindo!`, color: Global.Color.LimeGreen, style: "bold", sound: 2 });
                player.reply({ message: `👾 Discord: ${process.env.DISCORD_INVITE}`, color: Global.Color.LimeGreen, style: "bold", sound: 2 });

                player.roles.push(Global.notRegistered, Global.bypassRegisterRole);
                player.addConfirmLevel(this.confirmationLevel);

                return;
            }

            this.database.getPlayer(player.name).then(req => {
                if (req.type === ResponseType.Success) {
                    if (req.message.admin || req.message.faadmin) {
                        player.roles.push(Global.adminAccountRole);
                    }

                    if (req.message.auth === player.auth) {
                        player.reply({ message: `👋 E aí, ${player.name}! Seja bem-vindo de volta à BFL!`, color: Global.Color.LimeGreen, style: "bold", sound: 2 });
                        player.reply({ message: `👾 Discord: ${process.env.DISCORD_INVITE}`, color: Global.Color.LimeGreen, style: "bold", sound: 2 });
                        player.reply({ message: `✅ Você foi logado automaticamente!`, color: Global.Color.LimeGreen, style: "bold", sound: 2 });
                        
                        player.roles.push(Global.loggedRole);
                    } else {
                        player.reply({
                            message: `Não foi possível verificar seu login. Você tem ${Utils.getFormattedSeconds(this.kickTime / 1000)} para se logar.\nPor favor, digite sua senha abaixo (somente a senha, sem !).\nEsqueceu sua senha? Entre no nosso Discord para alterá-la.\nDiscord: ${process.env.DISCORD_INVITE}`,
                            color: Global.Color.Tomato,
                            sound: 2,
                            style: "bold"
                        });

                        player.canUseCommands = false;

                        this.playersWaitingConfirmation.push({ player, password: req.message.password });

                        setTimeout(() => {
                            if (!player.isConfirmed()) {
                                player?.kick("Não se logou a tempo!");
                            }
                        }, this.kickTime);

                        return;
                    }
                } else {
                    player.reply({ message: `👋 E aí, ${player.name}! Seja bem-vindo!`, color: Global.Color.LimeGreen, style: "bold", sound: 2 });
                    player.reply({ message: `👾 Discord: ${process.env.DISCORD_INVITE}`, color: Global.Color.LimeGreen, style: "bold", sound: 2 });
                }
                
                if (req.type === ResponseType.InternalError) {
                    player.reply({ message: `❌ Um erro aconteceu ao conectar aos nossos servidores! Não pudemos confirmar seu registro.`, color: Global.Color.Tomato, style: "bold" });
                    player.roles.push(Global.notRegistered);
                } else if (req.type === ResponseType.Error) {
                    player.reply({ message: `❌ Você não está registrado! Registre-se no nosso Discord${this.restrictNonRegisteredPlayers ? " para poder jogar" : ""}.`, color: Global.Color.Tomato, style: "bold" });
                    player.roles.push(Global.notRegistered);
                }

                player.addConfirmLevel(this.confirmationLevel);
            }).catch(err => {
                console.error(err);

                player.reply({ message: `❌ Um erro aconteceu ao conectar aos nossos servidores!`, color: Global.Color.Tomato, style: "bold" });
                
                player.roles.push(Global.notRegistered);
                player.addConfirmLevel(this.confirmationLevel);
            });
        });

        room.on("playerLeave", (player) => {
            this.removeFromWaitingList(player);
        });

        room.on("playerChat", (player, message) => {
            const info = this.playersWaitingConfirmation.find(p => p.player.id === player.id);

            if (!info) return;
            
            if (message !== info.password) {
                player.reply({ message: `❌ Senha incorreta! Tente novamente.`, color: Global.Color.Tomato, sound: 2, style: "bold" });
            } else {
                setTimeout(() => {
                    this.removeFromWaitingList(player);

                    for (const p of room.getPlayers()) {
                        if (player.id === p.id) continue;
        
                        p.reply({ message: `✅ ${player.name} se logou com sucesso!`, color: Global.Color.LimeGreen, style: "bold" });
                    }

                    player.reply({ message: `✅ Você se logou com sucesso! Seja bem-vindo de volta, ${player.name}.`, color: Global.Color.LimeGreen, sound: 2, style: "bold" });
            
                    player.roles.push(Global.loggedRole);
                    player.addConfirmLevel(this.confirmationLevel);
                    player.canUseCommands = true;

                    if (player.auth) this.database.updateAuth(player.name, player.auth);
                }, 0);
            }

            return false;
        });

        room.on("playerTeamChanged", (changedPlayer, byPlayer) => {
            if (changedPlayer.getTeam() === Team.Spectators) return;

            if (!changedPlayer.isConfirmed()) {
                if (byPlayer) {
                    byPlayer.reply({ message: `⚠️ Você não pode mover ${changedPlayer.name} porque ele ainda não se logou!`, color: Global.Color.LimeGreen, style: "bold", sound: 2 });
                }

                changedPlayer.setTeam(Team.Spectators);

                return;
            }

            if (this.restrictNonRegisteredPlayers && !changedPlayer.roles.includes(Global.loggedRole)) {
                room.send({ message: `⚠️ ${changedPlayer.name} não está registrado e não pode jogar! Registre-se em nosso !discord`, color: Global.Color.Tomato, style: "bold" });
            
                changedPlayer.setTeam(Team.Spectators);

                return;
            }
        });

        room.on("playerAdminChange", (changedPlayer) => {
            if (!changedPlayer.isConfirmed()) changedPlayer.setAdmin(false);
        });
    }

    private removeFromWaitingList(player: Player) {
        return this.playersWaitingConfirmation = this.playersWaitingConfirmation.filter(p => p.player.id !== player.id);
    }

    @Command({
        name: "comoregistrar",
        aliases: ["comoregistra"]
    })
    comoRegistarCommand($: CommandInfo, room: Room) {
        $.caller.reply({ message: `🔐 Entre no nosso Discord para registrar-se: ${process.env.DISCORD_INVITE}`, sound: 2, color: Global.Color.LimeGreen, style: "bold" });
    }
}