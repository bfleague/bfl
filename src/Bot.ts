import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import Haxball from "./haxball/Haxball.js";

import Room from "./core/Room";
import { AFK } from "./modules/administration/AFK";
import Game from "./modules/Game";

import Register from "./modules/administration/Register";
import Help from "./modules/administration/Help";
import { BetterChat } from "./modules/administration/BetterChat";
import { Admin } from "./modules/administration/Admin";
import Version from "./modules/administration/Version";
import Discord from "./modules/administration/Discord";
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
  room.module(Discord);
  room.module(Tutorial);

  room.on("roomLink", (link) => console.log(link));

  console.log("https://github.com/haxfootballbrazil/hfb-bot");
}
