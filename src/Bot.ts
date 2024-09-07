// @ts-ignore
import HaxballJS from "./core/Haxball.js";
import readline from "readline";

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

const prod = true; //process.env.MODE === "production" ? true : false;

function run(HBInit: any, token: string) {
    console.log(`This process is pid ${process.pid}`);
    
    const room = new Room(HBInit, {
        public: false,
        noPlayer: true,
        maxPlayers: 20,
        roomName: `🏈 Futebol Americano 🏈`,
        token
    });

    room.setPlayerChat(false);

    if (prod) {
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

HaxballJS.then((HBInit: any) => {
    const io = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    if (process.argv[2]) {
        run(HBInit, process.argv[2]);
    } else {
        io.question('Haxball headless token: ', token => {
            run(HBInit, token);
            io.close();
        });    
    }
});