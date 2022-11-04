import Room from "./Room";
import Settings from "./Settings";

export default abstract class AbstractDisc {
    abstract settings: Settings;

    constructor(protected _room: Room) { }

    protected abstract getDiscObject(): DiscPropertiesObject;
    protected abstract setDiscObject(properties: DiscPropertiesObject): void;

    public distanceTo(disc: AbstractDisc | { x: number, y: number, radius: number }): number | null {
        if (!disc) return null;

        let discX, discY, discRadius;

        if (disc instanceof AbstractDisc) {
            discX = disc.getX();
            discY = disc.getY();
            discRadius = disc.getRadius();
        } else {
            discX = disc.x;
            discY = disc.y;
            discRadius = disc.radius;
        }

        if (isNaN(parseInt(this.getX() + "")) || isNaN(parseInt(this.getY() + ""))) return null;
        if (isNaN(parseInt(discX + "")) || isNaN(parseInt(discY + ""))) return null;
        if (isNaN(parseInt(this.getRadius() + "")) || isNaN(parseInt(discX + ""))) return null;

        const x1 = this.getX() as number;
        const y1 = this.getY() as number;
        const r1 = this.getRadius() as number;

        const x2 = discX as number;
        const y2 = discY as number;
        const r2 = discRadius as number;

        const dx = x1 - x2;
        const dy = y1 - y2;

        const c = Math.sqrt(dx * dx + dy * dy);
		
		return Math.max(0, c - r1 - r2);
    }

    public isCollidingWith(disc: AbstractDisc): boolean {
        const distance = this.distanceTo(disc);
        return distance ? distance <= 0 : false;
    }

    public getPosition(): { x: number, y: number } {
        return { x: this.getDiscObject()?.x, y: this.getDiscObject()?.y };
    }

    public setPosition(pos: { x: number, y: number }) {
        this.setDiscObject(pos);
    }

    public getX(): number | null | undefined {
        return this.getDiscObject()?.x;
    }

    public setX(value: number | null | undefined) {
        this.setDiscObject({ x: value });
    }

    public getY(): number | null | undefined {
        return this.getDiscObject()?.y;
    }

    public setY(value: number | null | undefined) {
        this.setDiscObject({ y: value });
    }

    public getVelocity() {
        return Math.sqrt(this.getVelocityX() * this.getVelocityX() + this.getVelocityY() * this.getVelocityY());
    }

    public getVelocityX(): number | null | undefined {
        return this.getDiscObject()?.xspeed;
    }

    public setVelocityX(value: number | null | undefined) {
        this.setDiscObject({ xspeed: value });
    }

    public getVelocityY(): number | null | undefined {
        return this.getDiscObject()?.yspeed;
    }

    public setVelocityY(value: number | null | undefined) {
        this.setDiscObject({ yspeed: value });
    }

    public getGravityX(): number | null | undefined {
        return this.getDiscObject()?.xgravity;
    }

    public setGravityX(value: number | null | undefined) {
        this.setDiscObject({ xgravity: value });
    }

    public getGravityY(): number | null | undefined {
        return this.getDiscObject()?.ygravity;
    }

    public setGravityY(value: number | null | undefined) {
        this.setDiscObject({ ygravity: value });
    }

    public getRadius(): number | null | undefined {
        return this.getDiscObject()?.radius;
    }

    public setRadius(value: number | null | undefined) {
        this.setDiscObject({ radius: value });
    }

    public getbCoeff(): number | null | undefined {
        return this.getDiscObject()?.bCoeff;
    }

    public setbCoeff(value: number | null | undefined) {
        this.setDiscObject({ bCoeff: value });
    }
    
    public getInvMass(): number | null | undefined {
        return this.getDiscObject()?.invMass;
    }
    
    public setInvMass(value: number | null | undefined) {
        this.setDiscObject({ invMass: value });
    }

    public getDamping(): number | null | undefined {
        return this.getDiscObject()?.damping;
    }

    public setDamping(value: number | null | undefined) {
        this.setDiscObject({ damping: value });
    }

    public getcMask(): number | null | undefined {
        return this.getDiscObject()?.cMask;
    }

    public setcMask(value: number | null | undefined) {
        this.setDiscObject({ cMask: value });
    }

    public getcGroup(): number | null | undefined {
        return this.getDiscObject()?.cGroup;
    }

    public setcGroup(value: number | null | undefined) {
        this.setDiscObject({ cGroup: value });
    }
}