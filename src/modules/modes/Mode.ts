import type Game from "../Game";

import Module from "../../core/Module";
import { GameModes } from "../Game";

export abstract class Mode extends Module {
  protected abstract mode: GameModes;
  protected abstract name: string;

  constructor(protected game: Game) {
    super();
  }

  public abstract reset(): void;
}
