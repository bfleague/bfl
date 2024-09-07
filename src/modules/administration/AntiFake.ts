import Module from "../../core/Module";
import Room from "../../core/Room";

export default class AntiFake extends Module {
    private confirmationLevel = "NOT_FAKE";

    constructor(room: Room) {
        super();

        room.addConfirmLevel(this.confirmationLevel);

        room.on("playerJoin", (player) => {
            if (player.name.toLowerCase().includes("ld")) {
                setTimeout(() => player?.ban(), 3000);
            }
        }); 

        room.on("playerNeedsConfirmation", (player) => {
            const originalPlayer = room.getPlayers().find(p => p.ip === player.ip && player.id !== p.id);

            if (originalPlayer) return player.kick(`Você reentrou na sala [${originalPlayer.name}]!`);

            player.addConfirmLevel(this.confirmationLevel);
        });
    }
}