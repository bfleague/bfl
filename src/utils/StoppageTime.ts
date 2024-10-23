import Utils from "./Utils";

export default class StoppageTime {
  private stoppageTime: number;
  private isStoppageTimeEnabled: boolean;
  private initialStoppageTime: number;

  constructor() {
    this.stoppageTime = 0;
  }

  public static ticksToStr(ticks: number, incrementWithS: number = 0): string {
    return Utils.getFormattedSeconds(
      parseInt((ticks / 60 + incrementWithS).toFixed(2)),
    );
  }

  public addStoppageTime(ticks: number): void {
    this.stoppageTime += ticks;
  }

  public getStoppageTimeTicks(): number {
    return this.stoppageTime;
  }

  public setStoppageTime(ticks: number): void {
    this.stoppageTime = ticks;
  }

  public getStoppageTimeStr(): string {
    return StoppageTime.ticksToStr(this.stoppageTime);
  }

  public getGameEndingTimeStr(endGameTime: number): string {
    return Utils.fancyTimeFormat(this.stoppageTime / 60 + endGameTime);
  }

  public getGameEndingTimeSeconds(endGameTimeSeconds: number): number {
    return this.stoppageTime / 60 + endGameTimeSeconds;
  }

  public enableStoppageTime(isStoppageTime: boolean): void {
    this.isStoppageTimeEnabled = isStoppageTime;
  }

  public isStoppageTime(): boolean {
    return this.isStoppageTimeEnabled;
  }

  public thereIsStoppageTime(): boolean {
    return this.stoppageTime > 0;
  }

  public setInitialStoppageTime(): void {
    this.initialStoppageTime = this.stoppageTime;
  }

  public getInitialStoppageTime(): number {
    return this.initialStoppageTime || 0;
  }
}
