import type Game from "../Game";

import Module from "../../core/Module";

export abstract class Mode extends Module {
    abstract mode: string;
    abstract name: string;

    constructor(protected game: Game) {
        super();
    }

    public abstract reset(): void;
}