import { NetworkManager } from "../network/NetworkManager";
import { GamePhase, PlayerData, PLAYER_COLORS } from "../types";

export class PlayerManager {
  readonly players: Map<string, PlayerData> = new Map();

  constructor(private network: NetworkManager) {}

  addPlayer(
    playerId: string,
    playerIndex: number,
    phase: GamePhase,
    onPlayersUpdate: (() => void) | null,
    onRestartCountdown: (() => void) | null,
  ): void {
    // Don't add players during active gameplay - they missed the start
    if (phase === "PLAYING" || phase === "GAME_END") {
      console.log(
        "[Game] Player tried to join during active game, setting as spectator",
      );
      const color = this.network.getPlayerColor(playerId);
      const player: PlayerData = {
        id: playerId,
        name: this.network.getPlayerName(playerId),
        color,
        kills: 0,
        roundWins: 0,
        score: 0,
        state: "SPECTATING",
      };
      this.players.set(playerId, player);
      onPlayersUpdate?.();
      return;
    }

    // If joining during countdown and we are simulation authority, restart countdown
    if (phase === "COUNTDOWN" && this.network.isSimulationAuthority()) {
      console.log(
        "[Game] Player joined during countdown, restarting countdown",
      );
      onRestartCountdown?.();
    }

    const color = this.network.getPlayerColor(playerId);
    const player: PlayerData = {
      id: playerId,
      name: this.network.getPlayerName(playerId),
      color,
      kills: 0,
      roundWins: 0,
      score: 0,
      state: "ACTIVE",
    };
    this.players.set(playerId, player);
    onPlayersUpdate?.();
  }

  removePlayer(playerId: string, onPlayersUpdate: (() => void) | null): void {
    this.players.delete(playerId);
    onPlayersUpdate?.();
  }

  rebuildPlayersFromOrder(
    playerOrder: string[],
    onPlayersUpdate: (() => void) | null,
  ): void {
    const orderedIds = new Set(playerOrder);
    for (const playerId of [...this.players.keys()]) {
      if (!orderedIds.has(playerId)) {
        this.players.delete(playerId);
      }
    }

    playerOrder.forEach((playerId) => {
      const existingPlayer = this.players.get(playerId);
      if (existingPlayer) {
        existingPlayer.color = this.network.getPlayerColor(playerId);
        existingPlayer.name = this.network.getPlayerName(playerId);
      } else {
        const color = this.network.getPlayerColor(playerId);
        const player: PlayerData = {
          id: playerId,
          name: this.network.getPlayerName(playerId),
          color,
          kills: 0,
          roundWins: 0,
          score: 0,
          state: "ACTIVE",
        };
        this.players.set(playerId, player);
      }
    });

    onPlayersUpdate?.();
  }

  getPlayers(): PlayerData[] {
    const playerIds = this.network.getPlayerIds();
    const orderedPlayers: PlayerData[] = [];
    for (const id of playerIds) {
      const player = this.players.get(id);
      if (player) {
        orderedPlayers.push(player);
      }
    }
    return orderedPlayers;
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  clear(): void {
    this.players.clear();
  }

  resetScores(): void {
    this.players.forEach((player) => {
      player.kills = 0;
      player.roundWins = 0;
      player.score = 0;
      player.state = "ACTIVE";
    });
  }
}
