import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import Haxball from "./haxball/Haxball.js";

import Room from "./core/Room";
import { AFK } from "./modules/administration/AFK";
import Game from "./modules/Game";
import * as Discord from "discord.js";

import Register from "./modules/administration/Register";
import Help from "./modules/administration/Help";
import { BetterChat } from "./modules/administration/BetterChat";
import { Admin } from "./modules/administration/Admin";
import Version from "./modules/administration/Version";
import DiscordMod from "./modules/administration/Discord";
import AntiFake from "./modules/administration/AntiFake";
import Log from "./modules/administration/Log";
import Tutorial from "./modules/administration/Tutorial";

yargs(hideBin(process.argv))
  .command(
    "open <token>",
    "Open the room",
    {
      geo: {
        alias: "g",
        type: "array",
      },
      test: {
        alias: "t",
        type: "boolean",
      },
      proxy: {
        alias: "p",
        type: "string",
      },
      closed: {
        alias: "c",
        type: "boolean",
      },
    },
    (argv) => {
      Haxball.then((HBInit: any) => {
        run(
          HBInit,
          argv.token as string,
          argv.closed,
          argv.test,
          argv.geo as string[],
          argv.proxy,
        );
      });
    },
  )
  .demandCommand(1)
  .parse();

function run(
  HBInit: any,
  token: string,
  isClosed?: boolean,
  testMode?: boolean,
  geo?: string[],
  proxy?: string,
) {
  const room = new Room(HBInit, {
    roomName: ` 🔰 🏈 𝗕𝗙𝗟 • Futebol Americano 🏈`,
    maxPlayers: 20,
    public: !testMode && !isClosed,
    geo: geo
      ? { code: geo[0], lat: parseFloat(geo[1]), lon: parseFloat(geo[2]) }
      : undefined,
    token,
    proxy,
  });

  room.setPlayerChat(false);

  if (!testMode) {
    room.module(AntiFake);
  }

  if (process.env.ENABLE_LOG == "true") {
    room.module(Log);
  }

  room.module(Register);
  room.module(Game);
  room.module(AFK);
  room.module(Help);
  room.module(BetterChat);
  room.module(Admin);
  room.module(Version);
  room.module(DiscordMod);
  room.module(Tutorial);

  let sent = false;

  room.on("roomLink", (link) => {
    console.log(link);

    if (process.env.DISCORD_PUB_LINK_CHANNEL_ID) {
      if (sent) {
        return;
      }

      sendDiscordLink(link);
    }
  });

  console.log("https://github.com/haxfootballbrazil/hfb-bot");
}

function sendDiscordLink(link: string) {
  const embed = new Discord.EmbedBuilder()
    .setTitle(`Sala aberta`)
    .setDescription(`[Clique aqui para entrar na sala](${link})`)
    .setColor(0x0099ff);

  const client = new Discord.Client({
    intents: [Discord.GatewayIntentBits.Guilds],
  });

  client.login(process.env.DISCORD_TOKEN).catch((err) => {
    console.log(`Warning: could not login to Discord: ${err}`);
    client?.destroy();
  });

  client.on("ready", (c) => {
    const guild = c.guilds.cache.get(process.env.GUILD_ID);

    if (!guild) {
      console.log(
        "Warning: could not find guild, guild ID = ",
        process.env.GUILD_ID,
      );
      c?.destroy();
      return;
    }

    const channel = guild.channels.cache.get(
      process.env.DISCORD_PUB_LINK_CHANNEL_ID,
    ) as Discord.TextChannel;

    channel
      .send({ embeds: [embed] })
      .then(() => c?.destroy())
      .catch((err) => {
        console.log(`Warning: could not send message to Discord: ${err}`);
        c?.destroy();
      });
  });
}
