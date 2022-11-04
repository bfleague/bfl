import type Game from "../Game";

import Module from "../../core/Module";
import Room from "../../core/Room";

export abstract class DownPlay extends Module {
    constructor(protected game: Game) {
        super();
    }

    public abstract handle(room: Room): boolean;
}