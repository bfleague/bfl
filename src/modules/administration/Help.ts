import Command, { CommandInfo } from "../../core/Command";
import Module from "../../core/Module";
import { Color } from "../../Global";
import * as Global from "../../Global";

class Help extends Module {
    @Command({
        name: "help",
        aliases: ["ajuda", "comojogar", "regras"]
    })
    helpCommand($: CommandInfo) {
        $.caller.reply({ message: `📖 Comandos: !help !afk !score !dd !bb !to !versao !comoregistrar !teamlist !acrescimos !parcial`, sound: 2, color: Color.LimeGreen, style: "bold" });
        if ($.caller.isAdmin()) $.caller.reply({ message: `🔨 Comandos de admin: !set !team !gfi !distance !down !unhike !banidos !limparbans !desbanir !editmap !clearhiketime !setmaxtimeout !setscore !setteam !swap`, sound: 2, color: Color.LimeGreen, style: "bold" });
        $.caller.reply({ message: `🙋 Veja nosso tutorial: https://bfleague.online/`, sound: 2, color: Color.LimeGreen, style: "bold" });
        $.caller.reply({ message: `👾 Entre no nosso Discord: ${process.env.DISCORD_INVITE}`, sound: 2, color: Color.LimeGreen, style: "bold" });
    }
}

export default Help;