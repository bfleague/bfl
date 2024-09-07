import Module from "../../core/Module";
import Room from "../../core/Room";
import net from "net";

export default class AntiFake extends Module {
  private confirmationLevel = "NOT_FAKE";
  private ipCache: { ip: string; org: string; city: string }[] = [];
  private blockedLocations: { org: string; city: string }[] = [];

  constructor(room: Room) {
    super();

    this.blockedLocations.push({ org: "TIM SA", city: "BRASÍLIA" });

    room.addConfirmLevel(this.confirmationLevel);

    room.on("playerNeedsConfirmation", (player) => {
      const originalPlayer = room
        .getPlayers()
        .find((p) => p.ip === player.ip && player.id !== p.id);

      if (originalPlayer)
        return player.kick(`Você reentrou na sala [${originalPlayer.name}]!`);

      player.addConfirmLevel(this.confirmationLevel);
    });

    room.getNative()["onBeforeEstablishConnection"] = (ip: string) => {
      return new Promise<void>((resolve, reject) => {
        if (!net.isIPv4(ip)) resolve();

        const findAndCache = async (ip: string, ipCache: any) => {
          const found = ipCache.find((i: any) => i.ip === ip);
          if (found) return found;

          const request = await fetch(`https://ipapi.co/${ip}/json/`);
          const response = await request.json();

          const loc = {
            ip: response.ip,
            org: response.org?.toUpperCase(),
            city: response.city?.toUpperCase(),
          };
          ipCache.push(loc);

          return loc;
        };

        findAndCache(ip, this.ipCache).then((loc) => {
          const isBlocked = !!this.blockedLocations.find(
            (l) => l.org === loc.org && l.city === loc.city,
          );

          if (isBlocked) reject();

          resolve();
        });
      });
    };
  }
}
