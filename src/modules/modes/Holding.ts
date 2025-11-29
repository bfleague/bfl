import type Player from "../../core/Player";
import type Room from "../../core/Room";

import Game from "../Game";

import { Team } from "../../core/Global";
import * as Global from "../../Global";
import MapMeasures from "../../utils/MapMeasures";
import MathUtils from "../../utils/MathUtils";
import Timer from "../../utils/Timer";
import StadiumUtils from "../../utils/StadiumUtils";
import translate from "../../utils/Translate";
import { DownPlay } from "./DownPlay";

type Line = { x1: number; y1: number; x2: number; y2: number };

export default class Holding extends DownPlay {
  public readonly holdingLinesIndexes = [
    [9, 10],
    [11, 12],
    [13, 14],
    [15, 16],
    [17, 18],
    [19, 20],
    [21, 22],
    [23, 24],
    [25, 26],
    [27, 28],
    [29, 30],
    [31, 32],
  ];
  public readonly holdingDiscsIndexes = [33, 34, 35, 36];
  public readonly holdingZoneWidthYards = 7;
  public readonly holdingAdvanceYards = 5;
  public readonly illegalHoldingPenalty = -5;
  public readonly illegalHoldingMaxContactTime = 3 * 1000;
  public readonly illegalHoldingTouchDistance = 5;

  private holdingLinesTimeout: Timer;
  private illegalHoldingContacts = new Map<string, number>();

  public handle(room: Room): boolean {
    return this.handleIllegalHolding(room);
  }

  constructor(room: Room, game: Game) {
    super(game);

    room.on("gamePause", (byPlayer: Player) => {
      if (byPlayer) this.holdingLinesTimeout?.pause();
    });

    room.on("gameStartTicking", () => {
      this.holdingLinesTimeout?.resume();
    });
  }

  public clear(room?: Room) {
    this.holdingLinesTimeout?.stop();
    this.holdingLinesTimeout = null;
    this.clearIllegalHoldingContacts();

    if (room) {
      this.clearHoldingLines(room);
    }
  }

  public isPlayerInsideHoldingBox(player: Player) {
    const { rectX, rectY, rectW, rectH } = this.getHoldingBox();

    const circleX = player.getX();
    const circleY = player.getY();
    const circleR = player.getRadius();

    const distX = Math.abs(circleX - rectX - rectW / 2);
    const distY = Math.abs(circleY - rectY - rectH / 2);

    if (distX > rectW / 2 + circleR) return false;
    if (distY > rectH / 2 + circleR) return false;

    if (distX <= rectW / 2 || distY <= rectH / 2) {
      return true;
    }

    const dx = distX - rectW / 2;
    const dy = distY - rectH / 2;

    return dx * dx + dy * dy <= circleR * circleR;
  }

  public contactIntersectsHoldingBox(attacker: Player, defender: Player) {
    const box = this.getHoldingBox();
    const a = { x: attacker.getX(), y: attacker.getY() };
    const d = { x: defender.getX(), y: defender.getY() };

    if (this.isPointInsideBox(a, box) || this.isPointInsideBox(d, box)) {
      return true;
    }

    return this.segmentIntersectsRect(a, d, box);
  }

  private clearHoldingLines(room: Room) {
    for (const index of this.holdingLinesIndexes) {
      const d1 = room.getDisc(index[0]);
      const d2 = room.getDisc(index[1]);

      d1.setPosition(d2.getPosition());
    }

    for (const index of this.holdingDiscsIndexes) {
      room.getDisc(index).setPosition({ x: 9999, y: 9999 });
    }
  }

  private getHoldingBox() {
    const scrimmagePos = StadiumUtils.getCoordinateFromYards(
      this.game.ballPosition,
    );

    const advanceOffset =
      this.holdingAdvanceYards *
      MapMeasures.Yard *
      (this.game.teamWithBall === Team.Red ? 1 : -1);

    const baseX = scrimmagePos.x + advanceOffset;

    const rectMaxW = this.holdingZoneWidthYards * MapMeasures.Yard;

    const distanceToEndzone =
      this.game.teamWithBall === Team.Blue
        ? Math.abs(
            Math.abs(baseX) -
              Math.abs(MapMeasures.RedZoneRed[0].x + MapMeasures.Yard),
          )
        : Math.abs(
            Math.abs(baseX) -
              Math.abs(MapMeasures.RedZoneBlue[0].x - MapMeasures.Yard),
          );

    const rectW = Math.min(rectMaxW, distanceToEndzone);

    const rectX = this.game.teamWithBall === Team.Red ? baseX : baseX - rectW;

    const rectY = MapMeasures.HashesHeight.y1 + MapMeasures.SingleHashHeight;
    const rectH =
      MapMeasures.HashesHeight.y2 * 2 - MapMeasures.SingleHashHeight * 2;

    const backX = this.game.teamWithBall === Team.Red ? rectX : rectX + rectW;
    const frontX = this.game.teamWithBall === Team.Red ? rectX + rectW : rectX;

    return { rectX, rectY, rectW, rectH, backX, frontX };
  }

  private isPointInsideBox(
    point: { x: number; y: number },
    box: ReturnType<Holding["getHoldingBox"]>,
  ) {
    const minX = Math.min(box.rectX, box.rectX + box.rectW);
    const maxX = Math.max(box.rectX, box.rectX + box.rectW);
    const minY = Math.min(box.rectY, box.rectY + box.rectH);
    const maxY = Math.max(box.rectY, box.rectY + box.rectH);

    return (
      point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY
    );
  }

  private segmentIntersectsRect(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    box: ReturnType<Holding["getHoldingBox"]>,
  ) {
    const rect = {
      minX: Math.min(box.rectX, box.rectX + box.rectW),
      maxX: Math.max(box.rectX, box.rectX + box.rectW),
      minY: Math.min(box.rectY, box.rectY + box.rectH),
      maxY: Math.max(box.rectY, box.rectY + box.rectH),
    };

    const edges = [
      [
        { x: rect.minX, y: rect.minY },
        { x: rect.maxX, y: rect.minY },
      ],
      [
        { x: rect.maxX, y: rect.minY },
        { x: rect.maxX, y: rect.maxY },
      ],
      [
        { x: rect.maxX, y: rect.maxY },
        { x: rect.minX, y: rect.maxY },
      ],
      [
        { x: rect.minX, y: rect.maxY },
        { x: rect.minX, y: rect.minY },
      ],
    ];

    return edges.some(([a, b]) => this.segmentsIntersect(p1, p2, a, b));
  }

  private segmentsIntersect(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    p4: { x: number; y: number },
  ) {
    const orientation = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      c: { x: number; y: number },
    ) => (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);

    const onSegment = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      c: { x: number; y: number },
    ) =>
      Math.min(a.x, c.x) <= b.x &&
      b.x <= Math.max(a.x, c.x) &&
      Math.min(a.y, c.y) <= b.y &&
      b.y <= Math.max(a.y, c.y);

    const o1 = orientation(p1, p2, p3);
    const o2 = orientation(p1, p2, p4);
    const o3 = orientation(p3, p4, p1);
    const o4 = orientation(p3, p4, p2);

    if (o1 !== o2 && o3 !== o4) return true;

    if (o1 === 0 && onSegment(p1, p3, p2)) return true;
    if (o2 === 0 && onSegment(p1, p4, p2)) return true;
    if (o3 === 0 && onSegment(p3, p1, p4)) return true;
    if (o4 === 0 && onSegment(p3, p2, p4)) return true;

    return false;
  }

  public isPlayerIntersectingEndZone(player: Player) {
    const circle = {
      x: player.getX(),
      y: player.getY(),
      r: player.getRadius(),
    };

    const endzones = [MapMeasures.EndZoneRed, MapMeasures.EndZoneBlue] as const;

    return endzones.some(([p1, p2]) =>
      this.circleIntersectsRect(circle, {
        minX: Math.min(p1.x, p2.x),
        maxX: Math.max(p1.x, p2.x),
        minY: Math.min(p1.y, p2.y),
        maxY: Math.max(p1.y, p2.y),
      }),
    );
  }

  public clearIllegalHoldingContacts() {
    this.illegalHoldingContacts.clear();
  }

  public handleIllegalHolding(room: Room): boolean {
    if (!this.game.quarterback) return false;

    const now = Date.now();
    const defenders = this.game.getTeamWithoutBall(room);
    const attackers = this.game
      .getTeamWithBall(room)
      .filter((player) => player.id !== this.game.quarterback?.id);

    if (!defenders.length || !attackers.length) return false;

    const touchingPairs = new Set<string>();

    for (const attacker of attackers) {
      const defendersInRange = [];

      for (const defender of defenders) {
        if (attacker.distanceTo(defender) > this.illegalHoldingTouchDistance)
          continue;

        if (
          this.isPlayerIntersectingEndZone(attacker) ||
          this.isPlayerIntersectingEndZone(defender)
        )
          continue;

        if (!this.contactIntersectsHoldingBox(attacker, defender)) continue;

        defendersInRange.push(defender);
      }

      if (defendersInRange.length >= 2) {
        defendersInRange.forEach((defender) => {
          const key = `${attacker.id}:${defender.id}`;
          this.illegalHoldingContacts.delete(key);
        });

        continue;
      }

      for (const defender of defendersInRange) {
        const key = `${attacker.id}:${defender.id}`;
        touchingPairs.add(key);

        if (!this.illegalHoldingContacts.has(key)) {
          this.illegalHoldingContacts.set(key, now);
          continue;
        }

        const start = this.illegalHoldingContacts.get(key);

        if (start && now - start >= this.illegalHoldingMaxContactTime) {
          this.applyIllegalHolding(room, attacker, defender);
          return true;
        }
      }
    }

    for (const key of Array.from(this.illegalHoldingContacts.keys())) {
      if (!touchingPairs.has(key)) {
        this.illegalHoldingContacts.delete(key);
      }
    }

    return false;
  }

  private circleIntersectsRect(
    circle: { x: number; y: number; r: number },
    rect: { minX: number; maxX: number; minY: number; maxY: number },
  ) {
    const nearestX = Math.max(rect.minX, Math.min(circle.x, rect.maxX));
    const nearestY = Math.max(rect.minY, Math.min(circle.y, rect.maxY));

    const dx = circle.x - nearestX;
    const dy = circle.y - nearestY;

    return dx * dx + dy * dy <= circle.r * circle.r;
  }

  private applyIllegalHolding(room: Room, attacker: Player, defender: Player) {
    this.clearIllegalHoldingContacts();
    this.game.matchStats.add(attacker, { faltas: 1 });
    this.game.customAvatarManager.setPlayerAvatar(attacker, "🤡", 3000);

    const applyPenalty = () => {
      if (!this.game.conversion) {
        this.game.down.set({ room, decrement: this.illegalHoldingPenalty });
      } else {
        this.game.resetToKickoff(room);
      }
    };

    if (!this.game.conversion) {
      room.send({
        message: translate(
          "ILLEGAL_HOLDING",
          attacker.name,
          defender.name,
          Math.abs(this.illegalHoldingPenalty),
        ),
        color: Global.Color.Orange,
        style: "bold",
      });
    } else {
      room.send({
        message: translate(
          "ILLEGAL_HOLDING_CONVERSION",
          attacker.name,
          defender.name,
        ),
        color: Global.Color.Orange,
        style: "bold",
      });
    }

    this.showHoldingLines(room, applyPenalty);
  }

  private showHoldingLines(room: Room, callback: Function = () => {}) {
    this.game.mode = null;

    this.setHoldingLines(room);

    this.holdingLinesTimeout = new Timer(() => {
      this.clearHoldingLines(room);

      callback();

      this.holdingLinesTimeout = null;
    }, 1000);
  }

  private arrangeLines(
    room: Room,
    measures: {
      topLine?: Line;
      bottomLine?: Line;
      frontLine?: Line;
      backLine?: Line;
      holdingLinesIndexes: number[][];
      numberOfPoints: number;
    },
  ) {
    const topLine = !measures.topLine
      ? []
      : MathUtils.getPointsAlongLine(
          {
            x: measures.topLine.x1,
            y: measures.topLine.y1,
          },
          {
            x: measures.topLine.x2,
            y: measures.topLine.y2,
          },
          measures.numberOfPoints,
        );

    const bottomLine = !measures.bottomLine
      ? []
      : MathUtils.getPointsAlongLine(
          {
            x: measures.bottomLine.x1,
            y: measures.bottomLine.y1,
          },
          {
            x: measures.bottomLine.x2,
            y: measures.bottomLine.y2,
          },
          measures.numberOfPoints,
        );

    const frontLine = !measures.frontLine
      ? []
      : MathUtils.getPointsAlongLine(
          {
            x: measures.frontLine.x1,
            y: measures.frontLine.y1,
          },
          {
            x: measures.frontLine.x2,
            y: measures.frontLine.y2,
          },
          measures.numberOfPoints,
        );

    const backLine = !measures.backLine
      ? []
      : MathUtils.getPointsAlongLine(
          {
            x: measures.backLine.x1,
            y: measures.backLine.y1,
          },
          {
            x: measures.backLine.x2,
            y: measures.backLine.y2,
          },
          measures.numberOfPoints,
        );

    const halfRectangle = [
      ...topLine,
      ...bottomLine,
      ...frontLine,
      ...backLine,
    ];

    let count = 0;
    let holdingLineIndex = 0;

    for (let i = 0; i < halfRectangle.length; i++) {
      const discIndex =
        measures.holdingLinesIndexes[holdingLineIndex][i % 2 === 0 ? 0 : 1];

      const disc = room.getDisc(discIndex);
      const point = halfRectangle[i];

      disc.setPosition({ x: point.x, y: point.y });

      if (count === 1) {
        count = 0;
        holdingLineIndex++;
      } else {
        count++;
      }
    }
  }

  private setHoldingLines(room: Room) {
    const { backX, frontX, rectY, rectH } = this.getHoldingBox();

    const numberOfPoints = 2 * 3;
    const hashHeightY1 = rectY;
    const hashHeightY2 = rectY + rectH;

    room
      .getDisc(this.holdingDiscsIndexes[0])
      .setPosition({ x: backX, y: hashHeightY1 });
    room
      .getDisc(this.holdingDiscsIndexes[1])
      .setPosition({ x: frontX, y: hashHeightY1 });
    room
      .getDisc(this.holdingDiscsIndexes[2])
      .setPosition({ x: backX, y: hashHeightY2 });
    room
      .getDisc(this.holdingDiscsIndexes[3])
      .setPosition({ x: frontX, y: hashHeightY2 });

    this.arrangeLines(room, {
      topLine: {
        x1: backX,
        y1: hashHeightY1,
        x2: frontX,
        y2: hashHeightY1,
      },
      bottomLine: {
        x1: backX,
        y1: hashHeightY2,
        x2: frontX,
        y2: hashHeightY2,
      },
      frontLine: {
        x1: frontX,
        y1: hashHeightY1,
        x2: frontX,
        y2: hashHeightY2,
      },
      backLine: {
        x1: backX,
        y1: hashHeightY1,
        x2: backX,
        y2: hashHeightY2,
      },
      holdingLinesIndexes: this.holdingLinesIndexes,
      numberOfPoints,
    });

    room.pause();
    room.unpause();
  }
}
