import Module from "../core/Module";
import { Team } from "../core/Global";
import * as Global from "../Global";
import type Room from "../core/Room";
import Command, { CommandInfo } from "../core/Command";
import StadiumUtils from "../utils/StadiumUtils";
import Game from "./Game";
import Utils from "../utils/Utils";
import Timer from "../utils/Timer";

type MapProperties = {
  [key: string]: { type: string; func: (stadium: any, value: any) => void };
};

class GameCommands extends Module {
  private maxTimeoutTime = 30;
  private minTimeoutTime = 5;
  private defaultTimeoutTime = 20;

  private pauseTimer: Timer;

  private maxGameTimeout: {
    mode: "tempo" | "uso";
    value: number;
  };

  private timeoutUse = {
    red: 0,
    blue: 0,
  };

  private timeoutTimeSeconds = {
    red: 0,
    blue: 0,
  };

  private editableMapProperties: MapProperties = {
    mode: {
      type: "string",
      func: (stadium, value) => {
        const newStadium = this.game.getDefaultMap();

        if (value === "futsal") {
          newStadium.bg.type = "hockey";

          newStadium["ballPhysics"] = {
            pos: [0, 0],
            radius: 6.25,
            bCoef: 0.4,
            invMass: 1.5,
            color: "FFCC00",
          };

          newStadium["playerPhysics"] = {
            bCoef: 0,
            acceleration: 0.11,
            kickingAcceleration: 0.083,
          };
        } else if (value === "bounce") {
          for (const segment of newStadium["segments"]) {
            if (segment["bCoef"] == null) segment["bCoef"] = 0.1;
          }

          for (const plane of newStadium["planes"]) {
            if (plane["bCoef"] == null) {
              plane["bCoef"] = 0;
            } else {
              plane["bCoef"] = 0.1;
            }
          }

          newStadium["playerPhysics"] = {
            bCoef: 1.5,
            invMass: 0.5,
            damping: 0.9995,
            acceleration: 0.025,
            kickingAcceleration: 0.0175,
            kickingDamping: 0.9995,
            kickStrength: 5,
          };

          newStadium["ballPhysics"] = {
            radius: 10,
            bCoef: 0.5,
            invMass: 1,
            damping: 0.99,
            color: "FFFFFF",
          };
        } else if (value === "spaceball") {
          newStadium["playerPhysics"] = {
            damping: 0.9995,
            acceleration: 0.025,
            kickingAcceleration: 0.0175,
            kickingDamping: 0.9995,
          };

          newStadium["ballPhysics"] = {
            damping: 1,
            color: "CCFF33",
          };
        } else {
          throw new Error(
            "Valor inválido. Valores disponíveis: futsal, bounce, spaceball",
          );
        }

        Object.assign(stadium, newStadium);
      },
    },
    bg: {
      type: "string",
      func: (stadium, value) => {
        if (value === "grass") {
          stadium.bg.type = "grass";
          delete stadium.bg["color"];
        } else if (value === "hockey" || value === "futsal") {
          stadium.bg.type = "hockey";
          delete stadium.bg["color"];
        } else {
          stadium.bg.type = "none";
          stadium.bg["color"] = value.replace("0x", "").replace("#", "");
        }
      },
    },
    ballsize: {
      type: "number",
      func: (stadium, value) => {
        stadium.ballPhysics.radius = parseInt(value);
      },
    },
    ballcolor: {
      type: "number",
      func: (stadium, value) => {
        stadium.ballPhysics.color = value;
      },
    },
    ballbcoef: {
      type: "number",
      func: (stadium, value) => {
        stadium.ballPhysics["bCoef"] = value;
      },
    },
    playerdamping: {
      type: "number",
      func: (stadium, value) => {
        stadium.playerPhysics["damping"] = value;
      },
    },
    playeracceleration: {
      type: "number",
      func: (stadium, value) => {
        stadium.playerPhysics["acceleration"] = value;
      },
    },
    playerbcoef: {
      type: "number",
      func: (stadium, value) => {
        stadium.playerPhysics["bCoef"] = value;
      },
    },
    playerkickstrength: {
      type: "number",
      func: (stadium, value) => {
        stadium.playerPhysics["kickStrength"] = value;
      },
    },
    camerafollow: {
      type: "string",
      func: (stadium, value) => {
        stadium.cameraFollow = value;
      },
    },
  };

  constructor(
    room: Room,
    private game: Game,
  ) {
    super();

    room.on("gameUnpause", (byPlayer) => {
      if (this.pauseTimer) {
        this.pauseTimer.stop();
        this.pauseTimer = null;

        room.send({
          message: `⏸️ Tempo de timeout encerrado por ${byPlayer.name}`,
          color: Global.Color.Pink,
          style: "bold",
        });
      }
    });

    room.on("gameStop", () => {
      this.timeoutUse.blue = 0;
      this.timeoutUse.red = 0;
      this.timeoutTimeSeconds.red = 0;
      this.timeoutTimeSeconds.blue = 0;

      this.pauseTimer?.stop();
      this.pauseTimer = null;
    });
  }

  @Command({
    name: "dd",
  })
  ddCommand($: CommandInfo, room: Room) {
    if (!room.isGameInProgress()) {
      $.caller.reply({
        message: `⚠️ Não há nenhum jogo em progresso!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    $.caller.reply({
      message: `📍 ${this.game.getStateOfMatch()} • Bola do ${this.game.getTeamName(this.game.teamWithBall)}`,
      color: Global.Color.Pink,
      style: "bold",
    });

    return false;
  }

  @Command({
    name: "score",
  })
  scoreCommand($: CommandInfo, room: Room) {
    if (!room.isGameInProgress()) {
      $.caller.reply({
        message: `⚠️ Não há nenhum jogo em progresso!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    const score = this.game.getScore();

    $.caller.reply({
      message: `🎲 Red ${score.red} • ${score.blue} Blue`,
      color: Global.Color.Pink,
      style: "bold",
    });

    return false;
  }

  @Command({
    name: "unhike",
  })
  unhikeCommand($: CommandInfo, room: Room) {
    if (!$.caller.isAdmin()) {
      $.caller.reply({
        message: `⚠️ Você não é admin!`,
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    if (!room.isGameInProgress()) {
      $.caller.reply({
        message: `⚠️ Não há nenhum jogo em progresso!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if (this.game.mode !== this.game.down.mode || this.game.conversion) {
      $.caller.reply({
        message: `⚠️ Não há uma descida em andamento!`,
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    this.game.down.set({
      room,
      countDown: false,
      countDistanceFromNewPos: false,
    });

    room.send({
      message: `⚙️ ${$.caller.name} resetou a descida`,
      color: Global.Color.Pink,
      style: "bold",
    });

    return false;
  }

  @Command({
    name: "team",
  })
  teamCommand($: CommandInfo, room: Room) {
    if (!$.caller.isAdmin()) {
      $.caller.reply({
        message: `⚠️ Você não é admin!`,
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    if (!room.isGameInProgress()) {
      $.caller.reply({
        message: `⚠️ Não há nenhum jogo em progresso!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if (
      this.game.mode !== this.game.down.waitingHikeMode ||
      this.game.conversion
    ) {
      $.caller.reply({
        message: `⚠️ Este comando não pode ser utilizado no meio de uma jogada!`,
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    const teamArg = $.args[0];

    if (teamArg === "red") {
      this.game.teamWithBall = Team.Red;
    } else if (teamArg === "blue") {
      this.game.teamWithBall = Team.Blue;
    } else if (teamArg == null) {
      this.game.teamWithBall = this.game.invertTeam(this.game.teamWithBall);
    } else {
      $.caller.reply({
        message: `⚠️ Time inválido! Use ${room.prefix}team <red/blue> ou não especifique nenhum time caso queira alternar a posse`,
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    room.send({
      message: `⚙️ ${$.caller.name} mudou a posse da bola para o ${this.game.getTeamName(this.game.teamWithBall)}`,
      color: Global.Color.Pink,
      style: "bold",
    });

    this.game.down.goalMode = false;
    this.game.down.handleFirstDownLine(room);
    this.game.down.setBallForHike(room, this.game.teamWithBall);

    return false;
  }

  @Command({
    name: "distance",
  })
  distanceCommand($: CommandInfo, room: Room) {
    if (!$.caller.isAdmin()) {
      $.caller.reply({
        message: `⚠️ Você não é admin!`,
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    if (!room.isGameInProgress()) {
      $.caller.reply({
        message: `⚠️ Não há nenhum jogo em progresso!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if (
      (this.game.mode !== this.game.down.mode &&
        this.game.mode !== this.game.down.waitingHikeMode) ||
      this.game.conversion
    ) {
      $.caller.reply({
        message: `⚠️ Este comando não pode ser utilizado fora de uma descida!`,
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    const distanceArg = parseInt($.args[0]);

    if (!Number.isInteger(distanceArg) || distanceArg < 1 || distanceArg > 20) {
      $.caller.reply({
        message: `⚠️ Distância inválida!`,
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    room.send({
      message: `⚙️ ${$.caller.name} mudou a distância de ${this.game.distance} para ${distanceArg}`,
      color: Global.Color.Pink,
      style: "bold",
    });

    this.game.distance = distanceArg;

    if (
      !StadiumUtils.isInRedZone(
        this.game.ballPosition,
        this.game.invertTeam(this.game.teamWithBall),
      )
    ) {
      this.game.down.setFirstDownLine(room);
    }

    return false;
  }

  @Command({
    name: "down",
  })
  downCommand($: CommandInfo, room: Room) {
    if (!$.caller.isAdmin()) {
      $.caller.reply({
        message: `⚠️ Você não é admin!`,
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    if (!room.isGameInProgress()) {
      $.caller.reply({
        message: `⚠️ Não há nenhum jogo em progresso!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if (
      (this.game.mode !== this.game.down.mode &&
        this.game.mode !== this.game.down.waitingHikeMode) ||
      this.game.conversion
    ) {
      $.caller.reply({
        message: `⚠️ Este comando não pode ser utilizado fora de uma descida!`,
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    const downArg = parseInt($.args[0]);

    if (!Number.isInteger(downArg) || downArg < 1 || downArg > 4) {
      $.caller.reply({
        message: `⚠️ Número de descida inválida!`,
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    room.send({
      message: `⚙️ ${$.caller.name} mudou a descida da ${this.game.downCount}ª para a ${downArg}ª`,
      color: Global.Color.Pink,
      style: "bold",
    });

    this.game.downCount = downArg;

    return false;
  }

  @Command({
    name: "setscore",
  })
  setscoreCommand($: CommandInfo, room: Room) {
    if (!$.caller.isAdmin()) {
      $.caller.reply({
        message: `⚠️ Você não é admin!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if (!room.isGameInProgress()) {
      $.caller.reply({
        message: `⚠️ Não há nenhum jogo em progresso!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    const teamArg = $.args[0];
    const scoreArg = $.args[1];

    let team, score;

    if (teamArg == null || scoreArg == null) {
      $.caller.reply({
        message: `⚠️ Comando inválido! Use: ${room.prefix}setscore <red/blue> <score>`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if (teamArg === "red") {
      team = Team.Red;
    } else if (teamArg === "blue") {
      team = Team.Blue;
    } else {
      $.caller.reply({
        message: `⚠️ Time inválido! Use: ${room.prefix}setscore <red/blue> <score>`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    score = parseInt(scoreArg);

    if (!Number.isInteger(score) || score < 0) {
      $.caller.reply({
        message: `⚠️ Score inválido! Use: ${room.prefix}setscore <red/blue> <score>`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    const oldScore = this.game.getScore();

    room.send({
      message: `⚙️ ${$.caller.name} alterou o score do ${this.game.getTeamName(team)} • ${team === Team.Red ? oldScore.red : oldScore.blue} → ${score}`,
      color: Global.Color.Pink,
      style: "bold",
    });

    this.game.setScore({ [team]: score });

    return false;
  }

  @Command({
    name: "gfi",
  })
  gfiCommand($: CommandInfo, room: Room) {
    if (!$.caller.isAdmin()) {
      $.caller.reply({
        message: `⚠️ Você não é admin!`,
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    if (!room.isGameInProgress()) {
      $.caller.reply({
        message: `⚠️ Não há nenhum jogo em progresso!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if (this.game.mode !== this.game.down.waitingHikeMode) {
      $.caller.reply({
        message: `⚠️ Este comando não pode ser utilizado no meio de uma jogada!`,
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    room.send({
      message: `⚙️ ${$.caller.name} resetou a posição dos jogadores`,
      color: Global.Color.Pink,
      style: "bold",
    });

    this.game.resetPlayersPosition(room);

    return false;
  }

  @Command({
    name: "set",
  })
  setCommand($: CommandInfo, room: Room) {
    if (!$.caller.isAdmin()) {
      $.caller.reply({
        message: `⚠️ Você não é admin!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if (!room.isGameInProgress()) {
      $.caller.reply({
        message: `⚠️ Não há nenhum jogo em progresso!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if (this.game.mode !== this.game.down.waitingHikeMode) {
      $.caller.reply({
        message: `⚠️ Este comando não pode ser utilizado no meio de uma jogada!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    const teamArg = $.args[0];
    const yardsArg = $.args[1];

    let team, yards;

    if (teamArg == null || yardsArg == null) {
      $.caller.reply({
        message: `⚠️ Comando inválido! Use: ${room.prefix}set <red/blue> <jardas>`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if (teamArg === "red") {
      team = Team.Red;
    } else if (teamArg === "blue") {
      team = Team.Blue;
    } else {
      $.caller.reply({
        message: `⚠️ Time inválido! Use: ${room.prefix}set <red/blue> <jardas>`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    yards = parseInt(yardsArg);

    if (!Number.isInteger(yards) || yards < 1 || yards > 50) {
      $.caller.reply({
        message: `⚠️ Jardas inválidas! Use: ${room.prefix}set <red/blue> <jardas>`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    room.send({
      message: `⚙️ ${$.caller.name} alterou a posição da bola`,
      color: Global.Color.Pink,
      style: "bold",
    });

    this.game.ballPosition = { team, yards };

    this.game.down.set({
      room,
      countDown: false,
      countDistanceFromNewPos: false,
    });

    return false;
  }

  @Command({
    name: "to",
    aliases: ["timeout"],
  })
  toCommand($: CommandInfo, room: Room) {
    if ($.caller.getTeam() === Team.Spectators) {
      $.caller.reply({
        message: `⚠️ Você não está em um time!`,
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    if (!room.isGameInProgress()) {
      $.caller.reply({
        message: `⚠️ Não há nenhum jogo em progresso!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if (
      this.game.mode !== this.game.down.waitingHikeMode &&
      this.game.mode !== this.game.kickOff.mode
    ) {
      $.caller.reply({
        message: `⚠️ Este comando não pode ser utilizado no meio de uma jogada!`,
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    const timeStr = $.args[0];
    const timeInt = parseInt(timeStr);

    let time =
      timeInt == null || isNaN(timeInt) ? this.defaultTimeoutTime : timeInt;

    if (
      !Number.isInteger(time) ||
      time < this.minTimeoutTime ||
      time > this.maxTimeoutTime
    ) {
      $.caller.reply({
        message: `⚠️ Valor inválido! Valor precisa ser um número válido (em segundos) a partir de ${this.minTimeoutTime} e não maior que ${this.maxTimeoutTime}`,
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    if (room.isGamePaused()) {
      $.caller.reply({
        message: `⚠️ O jogo já está pausado!`,
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    const team = $.caller.getTeam() === Team.Red ? "red" : "blue";

    if (this.maxGameTimeout) {
      if (this.maxGameTimeout.mode === "tempo") {
        if (this.timeoutTimeSeconds[team] + time > this.maxGameTimeout.value) {
          $.caller.reply({
            message: `⚠️ Erro! O tempo de timeout (${time}) é maior que o máximo permitido (${this.timeoutTimeSeconds[team]}/${this.maxGameTimeout.value})`,
            sound: 2,
            color: Global.Color.Orange,
            style: "bold",
          });

          return false;
        }
      } else {
        if (this.timeoutUse[team] >= this.maxGameTimeout.value) {
          $.caller.reply({
            message: `⚠️ Erro! Você atingiu seu limite máximo de timeouts durante a partida (${this.timeoutUse[team]}/${this.maxGameTimeout.value})`,
            sound: 2,
            color: Global.Color.Orange,
            style: "bold",
          });

          return false;
        }
      }
    }

    this.timeoutTimeSeconds[team] += time;
    this.timeoutUse[team]++;

    room.pause();

    room.send({
      message: `⏸️ Timeout pedido por ${$.caller.name} • Jogo ficará pausado por ${Utils.getFormattedSeconds(time)}`,
      color: Global.Color.Pink,
      style: "bold",
    });

    this.pauseTimer = new Timer(() => {
      room.send({
        message: `⏸️ Tempo de timeout encerrado`,
        color: Global.Color.Pink,
        style: "bold",
      });
      room.unpause();

      this.pauseTimer = null;
    }, time * 1000);

    return false;
  }

  @Command({
    name: "setmaxtimeout",
  })
  setMaxTimeoutCommand($: CommandInfo, room: Room) {
    if (!$.caller.isAdmin()) {
      $.caller.reply({
        message: `⚠️ Você não é admin!`,
        sound: 2,
        color: Global.Color.Orange,
        style: "bold",
      });

      return false;
    }

    const mode = $.args[0];
    const valueStr = $.args[1];
    const value = parseInt(valueStr);

    if (mode === "disable") {
      this.maxGameTimeout = null;

      room.send({
        message: `⚙️ ${$.caller.name} desativou o limite de timeout`,
        color: Global.Color.Pink,
        style: "bold",
      });

      return false;
    }

    if (
      mode == null ||
      valueStr == null ||
      valueStr == "" ||
      !Number.isInteger(value) ||
      value < 1 ||
      (mode !== "tempo" && mode !== "uso")
    ) {
      $.caller.reply({
        message: `⚠️ Você precisa definir um modo (tempo/uso) e um valor válido!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    this.maxGameTimeout = { mode, value };

    room.send({
      message: `⚙️ ${$.caller.name} mudou as configurações de timeout (${mode} / ${value})`,
      color: Global.Color.Pink,
      style: "bold",
    });

    return false;
  }

  @Command({
    name: "editmap",
  })
  editMapCommand($: CommandInfo, room: Room) {
    if (!$.caller.isAdmin()) {
      $.caller.reply({
        message: `⚠️ Você não é admin!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if (room.isGameInProgress()) {
      $.caller.reply({
        message: `⚠️ Você não pode usar esse comando durante uma partida!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    const propertyStr = $.args[0];

    if (propertyStr === "list") {
      const propList = Object.keys(this.editableMapProperties);

      $.caller.reply({
        message: `📙 Lista de propriedades (${propList.length}): ${propList.join(", ")}`,
        sound: 2,
        color: Global.Color.LimeGreen,
        style: "bold",
      });

      return false;
    } else if (propertyStr === "reset") {
      room.setStadium(this.game.getDefaultMap());

      room.send({
        message: `⚙️ ${$.caller.name} resetou o mapa`,
        color: Global.Color.Pink,
        style: "bold",
      });

      return false;
    }

    const property = this.editableMapProperties[propertyStr];
    const value = $.message.split(propertyStr)[1]?.trim();

    if (
      propertyStr == null ||
      value == null ||
      value == "" ||
      property == null
    ) {
      $.caller.reply({
        message: `⚠️ Você precisa definir uma propriedade e um valor válidos! Use ${room.prefix}editmap list para ver a lista de propriedades`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    let typedValue: any = value;
    let validType = true;

    if (property.type === "number") {
      if (!/^[+-]?((\d+(\.\d*)?)|(\.\d+))$/.test(value)) {
        validType = false;
      } else {
        typedValue = parseFloat(value);
      }
    } else if (property.type === "boolean") {
      if (value !== "true" && value !== "false") {
        validType = false;
      } else {
        typedValue = JSON.parse(value);
      }
    }

    if (!validType) {
      $.caller.reply({
        message: `⚠️ Valor inválido! Esperado: ${property.type}`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    const mapNow = JSON.parse(JSON.stringify(this.game.stadium));

    try {
      property.func(this.game.stadium, typedValue);
    } catch (err) {
      $.caller.reply({
        message: `⚠️ Erro: ${err}`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      this.game.stadium = mapNow;

      return false;
    }

    room.setStadium({
      ...this.game.stadium,
      name: this.game.stadium.name + " Personalizado",
    });

    room.send({
      message: `⚙️ ${$.caller.name} alterou o mapa`,
      color: Global.Color.Pink,
      style: "bold",
    });
  }

  @Command({
    name: "acrescimos",
  })
  acrescimosCommand($: CommandInfo, room: Room) {
    if (!room.isGameInProgress()) {
      $.caller.reply({
        message: `⚠️ Não há nenhum jogo em progresso!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    $.caller.reply({
      message: `​⏰​ Acréscimos acumulados: ${Utils.getFormattedSeconds(parseInt((this.game.getStoppage() / 1000).toFixed(2)))}`,
      color: Global.Color.Yellow,
      style: "bold",
    });

    return false;
  }

  @Command({
    name: "parcial",
  })
  parcialCommand($: CommandInfo, room: Room) {
    if (!room.isGameInProgress()) {
      $.caller.reply({
        message: `⚠️ Não há nenhum jogo em progresso!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    this.game.matchStats.sendStatsMsg($.caller);

    return false;
  }

  @Command({
    name: "swap",
  })
  swapCommand($: CommandInfo, room: Room) {
    if (!$.caller.isAdmin()) {
      $.caller.reply({
        message: `⚠️ Você não é admin!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if (room.isGameInProgress()) {
      $.caller.reply({
        message: `⚠️ Esse comando não pode ser utilizado durante o jogo!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    this.game.customTeams.swapTeams(room);

    const red = room.getPlayers().red();
    const blue = room.getPlayers().blue();

    red.forEach((p) => p.setTeam(Team.Blue));
    blue.forEach((p) => p.setTeam(Team.Red));

    room.send({
      message: `⚙️ ${$.caller.name} alternou os times`,
      color: Global.Color.Pink,
      style: "bold",
    });

    return false;
  }

  @Command({
    name: "freemap",
  })
  freemapCommand($: CommandInfo, room: Room) {
    if (!$.caller.roles.includes(Global.adminAccountRole)) {
      $.caller.reply({
        message: `⚠️ Você não é um admin oficial!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    if (room.isGameInProgress()) {
      $.caller.reply({
        message: `⚠️ Esse comando não pode ser utilizado durante o jogo!`,
        sound: 2,
        color: Global.Color.Tomato,
        style: "bold",
      });

      return false;
    }

    this.game.canChangeMap = true;

    room.send({
      message: `⚙️ ${$.caller.name} retirou a restrição de mapa para a próxima partida`,
      color: Global.Color.Pink,
      style: "bold",
    });

    return false;
  }
}

export default GameCommands;
