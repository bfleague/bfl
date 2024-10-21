import type Room from "../../core/Room";
import { Team } from "../../core/Global";

import * as Global from "../../Global";

import Game, { PlayerWithBallState } from "../Game";

import MapMeasures from "../../utils/MapMeasures";
import Player from "../../core/Player";
import Timer from "../../utils/Timer";
import StadiumUtils from "../../utils/StadiumUtils";
import Utils from "../../utils/Utils";
import { Mode } from "./Mode";
import GameUtils, { Tackle } from "../../utils/GameUtils";

export abstract class LandPlay extends Mode {
  public readonly touchesToTackleRunner = 2;
  public readonly touchesToTackleQBRunner = 1;
  public readonly safetyPoints = 2;
  public readonly touchdownPoints = 6;
  public readonly ballLineDiscsIndex = [7, 8];
  public readonly clownEmojiTime = 15 * 1000;
  public readonly touchbackYardLine = 25;
  public readonly timeToFumbleSeconds = 0.1;

  public firstTackle: Tackle;
  public wasPlayerWithBallOutsideOfRedZone: number | false = false;

  constructor(room: Room, game: Game) {
    super(game);

    room.on("gameTick", () => {
      if (this.game.mode !== this.mode) return;

      if (this.game.playerWithBall) {
        if (
          this.wasPlayerWithBallOutsideOfRedZone !== false &&
          this.wasPlayerWithBallOutsideOfRedZone !== this.game.playerWithBall.id
        ) {
          this.wasPlayerWithBallOutsideOfRedZone = false;
        }

        if (
          !StadiumUtils.isInRedZone(
            StadiumUtils.getYardsFromXCoord(this.game.playerWithBall.getX()),
            this.game.playerWithBall.getTeam(),
          )
        ) {
          this.wasPlayerWithBallOutsideOfRedZone = this.game.playerWithBall.id;
        }

        if (
          StadiumUtils.isOutOfMap(this.game.playerWithBall.getPosition(), 0)
        ) {
          this.handlePlayerWithBallOutsideField(room);
        } else {
          if (
            this.hasPlayerPassedEndZoneLine(
              this.game.playerWithBall,
              this.game.invertTeam(this.game.playerWithBall.getTeam()),
            )
          ) {
            this.handleTouchdown(room);

            return;
          }

          if (this.game.interceptPlayer)
            this.handleInterceptPlayerLeftEndZone(this.game.interceptPlayer);

          const tackle = GameUtils.getTackle({
            room,
            game: this.game,
          });

          if (tackle.players.length > 0) this.handleTackle(room, tackle);

          if (
            this.game.firstTackleTick &&
            this.game.tickCount >
              this.game.firstTackleTick +
                Global.TICKS_PER_SECOND *
                  this.game.timeToSendTackleMessageSeconds
          ) {
            this.game.firstTackleTick = null;
            room.send({
              message: `💪 ${Utils.getPlayersNames(this.firstTackle.players)} ${this.firstTackle.players.length > 1 ? "tentaram" : "tentou"} derrubar ${this.game.playerWithBall.name} mas ele continua!`,
              color: Global.Color.Yellow,
              style: "bold",
            });
          }
        }
      }

      if (
        !this.game.playerWithBall ||
        (this.game.down.sack && !this.game.down.sackBallTouched)
      ) {
        const ball = room.getBall();

        if (
          StadiumUtils.isOutOfMap(ball.getPosition(), ball.getRadius()) &&
          this.game.qbKickedBall
        )
          this.handleFailedPass(room);
      }
    });
  }

  public setBallLine(
    room: Room,
    pos: Global.FieldPosition = this.game.ballPosition,
  ) {
    const x = StadiumUtils.getCoordinateFromYards(pos.team, pos.yards).x;

    const d1 = room.getDisc(this.ballLineDiscsIndex[0]);
    const d2 = room.getDisc(this.ballLineDiscsIndex[1]);

    if (!d1 || !d2) return;

    d1.setPosition({ x, y: MapMeasures.OuterField[0].y });
    d2.setPosition({ x, y: MapMeasures.OuterField[1].y });
  }

  public resetBallLine(room: Room) {
    const d1 = room.getDisc(this.ballLineDiscsIndex[0]);
    const d2 = room.getDisc(this.ballLineDiscsIndex[1]);

    if (!d1 || !d2) return;

    d1.setPosition({ x: 0, y: 0 });
    d2.setPosition({ x: 0, y: 0 });
  }

  protected setTouchdown(room: Room, forTeam: Team, automatic = false) {
    this.game.mode = null;

    if (!automatic && this.game.playerWithBall) {
      this.game.playerWithBallFinalPosition =
        this.game.playerWithBall.getPosition();

      if (!this.game.conversion) {
        switch (this.game.playerWithBallState) {
          case PlayerWithBallState.Receiver:
            this.game.matchStats.add(this.game.quarterback, {
              passesPraTouchdown: 1,
            });
            this.game.matchStats.add(this.game.playerWithBall, {
              touchdownRecebidos: 1,
            });
            break;
          case PlayerWithBallState.Runner:
          case PlayerWithBallState.QbRunner:
          case PlayerWithBallState.QbRunnerSacking:
            this.game.matchStats.add(this.game.playerWithBall, {
              touchdownCorridos: 1,
            });
            break;
          case PlayerWithBallState.PuntReturner:
          case PlayerWithBallState.KickoffReturner:
            this.game.matchStats.add(this.game.playerWithBall, {
              touchdownRetornados: 1,
            });
            break;
          case PlayerWithBallState.Intercepter:
            this.game.matchStats.add(this.game.playerWithBall, { pickSix: 1 });
            break;
          default:
            break;
        }
      }

      this.game.setPlayerWithBallStats();
    }

    if (!this.game.conversion) {
      this.game.touchdownExtraPointTimeout = new Timer(
        () => this.game.extraPoint.set({ room, forTeam }),
        2000,
      );

      this.game.incrementScore({ [forTeam]: this.touchdownPoints });
    } else {
      let points = !this.game.intercept
        ? this.game.extraPoint.conversionPoints
        : this.game.extraPoint.intConversionPoints;

      this.game.kickOffReset = new Timer(
        () =>
          this.game.kickOff.set({
            room,
            forTeam: this.game.intercept
              ? this.game.invertTeam(forTeam)
              : forTeam,
          }),
        2000,
      );

      this.game.conversion = false;

      this.game.incrementScore({ [forTeam]: points });
    }
  }

  public setRedZoneTouchdown(
    room: Room,
    forTeam: Team,
    players: Player[],
    desc: string,
  ) {
    const isConversion = this.game.conversion;

    this.setTouchdown(room, forTeam, true);

    if (!isConversion) {
      Utils.sendSoundTeamMessage(room, {
        message: `🙌 TOUCHDOWN AUTOMÁTICO!!! • ${desc} • ${this.game.getScoreMessage()}`,
        color: Global.Color.LimeGreen,
        style: "bold",
      });
    } else {
      Utils.sendSoundTeamMessage(room, {
        message: `🙌 CONVERSÃO AUTOMÁTICA!!! • ${desc} • ${this.game.getScoreMessage()}`,
        color: Global.Color.LimeGreen,
        style: "bold",
      });
    }

    for (const player of players) {
      this.game.customAvatarManager.setPlayerAvatar(
        player,
        "🤡",
        this.clownEmojiTime,
      );
    }
  }

  private hasPlayerPassedEndZoneLine(player: Player, team: Team) {
    return (
      (team === Team.Red &&
        player.getX() - player.getRadius() <=
          MapMeasures.RedEndZoneStartPositionX) ||
      (team === Team.Blue &&
        player.getX() + player.getRadius() >=
          MapMeasures.BlueEndZoneStartPositionX)
    );
  }

  private handleInterceptPlayerLeftEndZone(player: Player) {
    if (
      !this.game.interceptPlayerLeftEndZone &&
      !this.hasPlayerPassedEndZoneLine(player, player.getTeam())
    ) {
      this.game.interceptPlayerLeftEndZone = true;
    }
  }

  private handleFailedPass(room: Room) {
    if (this.game.mode !== this.game.down.mode) {
      let yards: number;
      let teamPos: Team;
      let team: Team;
      let msg: string;

      const ballPos = room.getBall().getPosition();

      const name = this.name[0].toLocaleUpperCase() + this.name.slice(1);

      if (
        this.mode === this.game.safety.mode ||
        this.mode === this.game.punt.mode
      ) {
        if (
          ballPos.x > MapMeasures.EndZoneBlue[1].x ||
          ballPos.x < MapMeasures.EndZoneRed[1].x
        ) {
          const team =
            ballPos.x > MapMeasures.EndZoneBlue[1].x ? Team.Blue : Team.Red;

          this.setTouchback(
            room,
            this.game.invertTeam(this.game.teamWithBall),
            `${name} chutado para a end zone`,
            null,
            { team, yards: this.touchbackYardLine },
          );

          return;
        }

        team = this.game.invertTeam(this.game.teamWithBall);

        const pos = StadiumUtils.getYardsFromXCoord(room.getBall().getX());

        yards = pos.yards;
        teamPos = pos.team;
        msg = `Bola colocada na linha em que saiu`;
      } else if (this.mode === this.game.onsideKick.mode) {
        yards = 25;
        team = this.game.invertTeam(this.game.teamWithBall);
        teamPos = this.game.teamWithBall;
      } else {
        yards = 40;
        team = this.game.invertTeam(this.game.teamWithBall);
        teamPos = team;
      }

      room.send({
        message:
          `❌ ${name} chutado para fora de campo • ` +
          (msg ?? `Bola na linha de ${yards} jardas`),
        color: Global.Color.Orange,
        style: "bold",
      });

      this.game.down.set({
        room,
        pos: { team: teamPos, yards },
        forTeam: team,
        countDistanceFromNewPos: false,
        positionPlayersEvenly: true,
      });

      return;
    } else {
      const ball = room.getBall();

      const ballWithinGoalLine =
        StadiumUtils.ballWithinGoalLine(ball, Team.Red) ||
        StadiumUtils.ballWithinGoalLine(ball, Team.Blue);

      const ballOutsideField = StadiumUtils.isOutOfMap(
        ball.getPosition(),
        ball.getRadius(),
      );

      if (
        (this.game.interceptAttemptPlayer || this.game.intercept) &&
        ballWithinGoalLine
      ) {
        room.send({
          message: `🏈 INTERCEPTAÇÃO de ${this.game.interceptAttemptPlayer.name}!!! • Bola para o ${this.game.getTeamName(this.game.interceptAttemptPlayer.getTeam())}`,
          color: 0x00ffff,
          style: "bold",
        });

        this.game.setBallDamping(room, Global.BallDamping.Default);

        if (this.game.down.sack) {
          this.game.down.qbPassedInSack();
          this.game.down.sackBallTouched = true;
        }

        this.game.matchStats.add(this.game.quarterback, {
          interceptacoesLancadas: 1,
        });
        this.game.matchStats.add(this.game.interceptAttemptPlayer, {
          interceptacoes: 1,
        });

        this.handleInterceptPlayerLeftEndZone(this.game.interceptAttemptPlayer);

        this.game.intercept = true;

        this.game.setPlayerWithBall(
          room,
          this.game.interceptAttemptPlayer,
          PlayerWithBallState.Intercepter,
          true,
        );

        this.game.interceptPlayer = this.game.interceptAttemptPlayer;
        this.game.interceptAttemptPlayer = null;

        this.game.downCount = 0;
        this.game.distance = 20;
        this.game.teamWithBall = this.game.invertTeam(this.game.teamWithBall);

        return;
      } else if (ballOutsideField) {
        if (this.game.down.sack || this.game.down.sackBallTouched) return;

        if (this.game.interceptAttemptPlayer) {
          room.send({
            message: `❌ Interceptação falhou • ${this.game.interceptAttemptPlayer.name} errou o gol`,
            color: Global.Color.Orange,
            style: "bold",
          });
        } else {
          room.send({
            message: `❌ Passe incompleto • Bola fora de campo`,
            color: Global.Color.Orange,
            style: "bold",
          });
        }

        if (!this.game.conversion) {
          this.game.down.set({ room });
        } else {
          this.game.resetToKickoff(room);
        }

        return;
      }
    }
  }

  private setSafety(
    room: Room,
    player: Player,
    tacklers?: Player[],
    message?: string,
  ) {
    this.game.incrementScore({
      [player.getTeam() === Team.Red ? Team.Blue : Team.Red]: this.safetyPoints,
    });

    this.game.playerWithBallFinalPosition = player.getPosition();

    this.game.setPlayerWithBallStats();

    if (tacklers == null) {
      Utils.sendSoundTeamMessage(room, {
        message: `❌ ${player.name} saiu de campo dentro da End Zone • Safety • ${this.safetyPoints} pontos para o ${this.game.getTeamName(this.game.invertTeam(player.getTeam()))} • ${this.game.getScoreMessage()}`,
        color: Global.Color.LimeGreen,
        style: "bold",
      });

      this.game.matchStats.add(player, { faltas: 1 });
      this.game.safety.set({ room, forTeam: player.getTeam() });
    } else if (!this.game.conversion) {
      Utils.sendSoundTeamMessage(room, {
        message: `💪 ${player.name} derrubado por ${Utils.getPlayersNames(tacklers)} • Dentro da End Zone • ${message ? `${message} • ` : ""}Safety • ${this.safetyPoints} pontos para o ${this.game.getTeamName(this.game.invertTeam(player.getTeam()))} • ${this.game.getScoreMessage()}`,
        color: Global.Color.LimeGreen,
        style: "bold",
      });

      this.game.matchStats.add(player, { faltas: 1 });
      this.game.safety.set({ room, forTeam: player.getTeam() });
    } else {
      Utils.sendSoundTeamMessage(room, {
        message: `💪 ${player.name} derrubado por ${Utils.getPlayersNames(tacklers)} • Conversão falhou`,
        color: Global.Color.LimeGreen,
        style: "bold",
      });

      this.game.resetToKickoff(room);
    }
  }

  private setTouchback(
    room: Room,
    forTeam: Team,
    message: string,
    player?: Player,
    pos?: Global.FieldPosition,
  ) {
    room.send({
      message: `🔙 ${message} • Touchback • ${this.game.conversion ? "Conversão falhou" : "Bola na linha de 25"}`,
      color: Global.Color.Yellow,
      style: "bold",
    });

    this.game.playerWithBallFinalPosition =
      this.game.playerWithBall?.getPosition();

    if (this.game.playerWithBall) this.game.setPlayerWithBallStats();

    if (!this.game.conversion) {
      this.game.down.set({
        room,
        pos: pos ?? { team: forTeam, yards: this.touchbackYardLine },
        forTeam: forTeam,
        countDistanceFromNewPos: false,
      });
    } else {
      this.game.resetToKickoff(room);
    }
  }

  protected handleTackle(room: Room, tackle: Tackle) {
    if (
      tackle.tackleCount === 1 &&
      this.game.running &&
      !this.game.firstTackleTick
    ) {
      this.game.firstTackleTick = this.game.tickCount;
      this.firstTackle = tackle;

      return;
    }

    if (
      tackle.tackleCount >= this.touchesToTackleRunner ||
      (this.game.playerWithBall.id === this.game.quarterback?.id &&
        tackle.tackleCount >= this.touchesToTackleQBRunner) ||
      !this.game.running
    ) {
      if (
        this.hasPlayerPassedEndZoneLine(
          this.game.playerWithBall,
          this.game.playerWithBall.getTeam(),
        ) &&
        !this.game.conversion
      ) {
        if (this.game.intercept) {
          tackle.players.forEach((p) =>
            this.game.matchStats.add(p, { tackles: 1 }),
          );

          if (this.game.interceptPlayerLeftEndZone) {
            this.game.playerWithBallFinalPosition =
              this.game.playerWithBall.getPosition();
            this.setSafety(
              room,
              this.game.playerWithBall,
              tackle.players,
              "Voltou para a End Zone durante a interceptação",
            );
          } else {
            this.game.playerWithBallFinalPosition =
              this.game.playerWithBall.getPosition();
            this.setTouchback(
              room,
              this.game.playerWithBall.getTeam(),
              `Interceptador derrubado na End Zone`,
              this.game.playerWithBall,
            );
          }
        } else {
          this.setSafety(room, this.game.playerWithBall, tackle.players);
        }
      } else {
        tackle.players.forEach((p) => {
          this.game.customAvatarManager.setPlayerAvatar(p, "💪", 3000);
        });

        const fumble =
          tackle.players.length >= 2 &&
          !this.game.conversion &&
          (this.game.playerWithBallState === PlayerWithBallState.Receiver ||
            this.game.playerWithBallState ===
              PlayerWithBallState.QbRunnerSacking) &&
          (this.game.down.sack ||
            this.game.playerWithBallSetTick +
              this.timeToFumbleSeconds * Global.TICKS_PER_SECOND >=
              this.game.tickCount);

        if (
          this.game.down.sack &&
          this.game.quarterback &&
          this.game.isPlayerBehindLineOfScrimmage(this.game.quarterback)
        ) {
          if (fumble) {
            room.send({
              message: `😵 FUMBLE DE ${this.game.playerWithBall.name}!!! Strip sack por ${Utils.getPlayersNames(tackle.players)}`,
              color: 0x00ffff,
              style: "bold",
            });

            tackle.players.forEach((p) =>
              this.game.matchStats.add(p, {
                tackles: 1,
                sacks: 1,
                fumblesForcados: 1,
              }),
            );
            this.game.matchStats.add(this.game.quarterback, {
              stripSackRecebidos: 1,
              fumbles: 1,
              sacksRecebidos: 1,
            });

            this.game.customAvatarManager.setPlayerAvatar(
              this.game.quarterback,
              "😵",
              3000,
            );
          } else {
            room.send({
              message: `💪 ${this.game.playerWithBall.name} foi sackado por ${Utils.getPlayersNames(tackle.players)}`,
              color: Global.Color.Yellow,
              style: "bold",
            });

            tackle.players.forEach((p) =>
              this.game.matchStats.add(p, { tackles: 1, sacks: 1 }),
            );
            this.game.matchStats.add(this.game.quarterback, {
              sacksRecebidos: 1,
            });
          }

          this.game.playerWithBallState = PlayerWithBallState.Sack;
        } else {
          if (fumble) {
            room.send({
              message: `😵 FUMBLE DE ${this.game.playerWithBall.name}!!! Forçado por ${Utils.getPlayersNames(tackle.players)}`,
              color: 0x00ffff,
              style: "bold",
            });

            tackle.players.forEach((p) =>
              this.game.matchStats.add(p, { tackles: 1, fumblesForcados: 1 }),
            );
            this.game.matchStats.add(this.game.playerWithBall, { fumbles: 1 });
            this.game.matchStats.add(this.game.quarterback, {
              fumblesLancados: 1,
            });

            this.game.customAvatarManager.setPlayerAvatar(
              this.game.playerWithBall,
              "😵",
              3000,
            );
          } else {
            room.send({
              message: `💪 ${this.game.playerWithBall.name} foi derrubado por ${Utils.getPlayersNames(tackle.players)}`,
              color: Global.Color.Yellow,
              style: "bold",
            });

            tackle.players.forEach((p) =>
              this.game.matchStats.add(p, { tackles: 1 }),
            );
          }
        }

        this.game.playerWithBallFinalPosition =
          this.game.playerWithBall.getPosition();

        this.game.setPlayerWithBallStats();

        if (!this.game.conversion) {
          if (fumble) {
            this.game.downCount = 0;
            this.game.distance = 20;

            this.game.down.set({
              room,
              pos: StadiumUtils.getYardsFromXCoord(
                this.game.playerWithBall.getX(),
              ),
              countDistanceFromNewPos: false,
              forTeam: this.game.invertTeam(this.game.playerWithBall.getTeam()),
            });
          } else {
            const ballHolder = this.game.playerWithBall;

            const posX = ballHolder.getX();

            this.game.down.set({
              room,
              pos: StadiumUtils.getYardsFromXCoord(posX),
              forTeam: this.game.playerWithBall.getTeam(),
              countDistanceFromNewPos:
                this.game.mode === this.game.down.mode && !this.game.intercept,
            });
          }
        } else {
          this.game.resetToKickoff(room);
        }
      }
    }
  }

  private handleTouchdown(room: Room) {
    this.game.mode = null;

    const teamName = this.game.getTeamName(this.game.playerWithBall.getTeam());

    const isConversion = this.game.conversion;

    this.setTouchdown(room, this.game.playerWithBall.getTeam());

    if (!isConversion) {
      Utils.sendSoundTeamMessage(room, {
        message: `🙌 ${this.game.intercept ? "PICK SIX" : "TOUCHDOWN"} de ${this.game.playerWithBall.name}!!! • +${this.touchdownPoints} pontos para o ${teamName} • ${this.game.getScoreMessage()}`,
        color: Global.Color.LimeGreen,
        style: "bold",
      });
    } else {
      Utils.sendSoundTeamMessage(room, {
        message: `🙌 ${this.game.intercept ? "RETORNO DE INTERCEPTAÇÃO" : "CONVERSÃO"} de ${this.game.playerWithBall.name}!!! • +${this.game.extraPoint.conversionPoints} pontos para o ${teamName} • ${this.game.getScoreMessage()}`,
        color: Global.Color.LimeGreen,
        style: "bold",
      });
    }

    this.game.customAvatarManager.setPlayerAvatar(
      this.game.playerWithBall,
      "🔥",
      3000,
    );
  }

  private handlePlayerWithBallOutsideField(room: Room) {
    const playerPos = this.game.playerWithBall.getPosition();

    if (
      playerPos.x > Math.abs(MapMeasures.EndZoneRed[1].x) ||
      playerPos.x < -Math.abs(MapMeasures.EndZoneBlue[1].x) ||
      (playerPos.x > Math.abs(MapMeasures.RedZoneRed[1].x) &&
        playerPos.x < -Math.abs(MapMeasures.RedZoneBlue[1].x) &&
        (playerPos.y < -Math.abs(MapMeasures.EndZoneBlue[1].y) ||
          playerPos.y > Math.abs(MapMeasures.EndZoneBlue[1].y)) &&
        this.mode !== this.game.down.mode)
    ) {
      this.setSafety(room, this.game.playerWithBall);
    } else {
      room.send({
        message: `❌ ${this.game.playerWithBall.name} pisou fora de campo`,
        color: Global.Color.Orange,
        style: "bold",
      });

      this.game.playerWithBallFinalPosition =
        this.game.playerWithBall.getPosition();

      this.game.setPlayerWithBallStats();

      if (!this.game.conversion) {
        this.game.down.set({
          room,
          pos: StadiumUtils.getYardsFromXCoord(this.game.playerWithBall.getX()),
          forTeam: this.game.playerWithBall.getTeam(),
          countDistanceFromNewPos:
            this.game.mode === this.game.down.mode && !this.game.intercept,
        });
      } else {
        this.game.resetToKickoff(room);
      }
    }
  }
}
