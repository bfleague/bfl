import type Room from "../../core/Room";
import type Player from "../../core/Player";

import * as Global from "../../Global";

import Game, { GameModes, PlayerWithBallState } from "../Game";
import { LandPlay } from "./LandPlay";
import translate from "../../utils/Translate";

export class FakeFieldGoal extends LandPlay {
  public readonly name = "fake field goal";
  public readonly mode = GameModes.FakeFieldGoal;

  constructor(room: Room, game: Game) {
    super(room, game);
  }

  set({ room, runner }: { room: Room; runner: Player }) {
    this.game.mode = null;

    this.game.reset(room);
    this.game.resetPlay(room);

    room.send({
      message: translate("RUN", runner.name),
      color: Global.Color.DeepSkyBlue,
      style: "bold",
    });

    this.game.setBallMoveable(room);
    this.game.teamWithBall = runner.getTeam();
    this.game.setPlayerWithBall(
      room,
      runner,
      PlayerWithBallState.QbRunner,
      true,
    );

    this.game.mode = this.mode;
  }

  public reset() {}
}
