import { create } from 'zustand';
import type { BLEConnection } from '../services/heartRateService';
import {
  connectToHRMonitor,
  disconnectDevice,
  reconnectToDevice,
} from '../services/heartRateService';

export const MAX_PLAYERS = 8;
const MAX_HISTORY = 300; // 5 minutes at ~1 reading/sec

export interface HRDataPoint {
  time: number; // epoch seconds
  bpm: number;
}

export interface Player {
  id: string;
  name: string;
  deviceName: string; // original BLE device name
  bpm: number;
  connected: boolean;
  reconnecting: boolean;
  history: HRDataPoint[];
  connection: BLEConnection | null;
  device: BluetoothDevice | null; // persists across disconnects for reconnect
}

// 8 distinct colors for players
const PLAYER_COLORS = [
  '#ff006e',
  '#00f5d4',
  '#fee440',
  '#8338ec',
  '#fb5607',
  '#3a86ff',
  '#06d6a0',
  '#ef476f',
];

export function getPlayerColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

export const TIME_WINDOWS = [
  { label: '1m', seconds: 60 },
  { label: '2m', seconds: 120 },
  { label: '5m', seconds: 300 },
  { label: 'All', seconds: Infinity },
] as const;

// Track active reconnect timers so we can cancel on removal
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelReconnect(playerId: string) {
  const timer = reconnectTimers.get(playerId);
  if (timer) {
    clearTimeout(timer);
    reconnectTimers.delete(playerId);
  }
}

interface PlayerStore {
  players: Player[];
  timeWindowSeconds: number;
  addPlayer: () => Promise<void>;
  removePlayer: (id: string) => Promise<void>;
  updateName: (id: string, name: string) => void;
  setTimeWindow: (seconds: number) => void;
  clearHistory: () => void;
}

let nextId = 1;
let isAdding = false;

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  players: [],
  timeWindowSeconds: 300,

  addPlayer: async () => {
    if (isAdding) return;
    isAdding = true;
    try {
    if (get().players.length >= MAX_PLAYERS) return;

    const playerId = String(nextId++);
    const defaultName = `Player ${playerId}`;

    // Shared HR callback
    const onHeartRate = (bpm: number) => {
      set((state) => ({
        players: state.players.map((p) => {
          if (p.id !== playerId) return p;
          const now = Date.now() / 1000;
          const history = [
            ...(p.history.length >= MAX_HISTORY ? p.history.slice(1) : p.history),
            { time: now, bpm },
          ];
          return { ...p, bpm, history };
        }),
      }));
    };

    // Auto-reconnect with exponential backoff
    const attemptReconnect = (device: BluetoothDevice, attempt = 0) => {
      // Don't reconnect if player was removed
      const player = get().players.find((p) => p.id === playerId);
      if (!player) return;

      const delay = Math.min(1000 * 2 ** attempt, 30000); // 1s, 2s, 4s, ... 30s max

      set((state) => ({
        players: state.players.map((p) =>
          p.id === playerId ? { ...p, reconnecting: true } : p,
        ),
      }));

      const timer = setTimeout(async () => {
        reconnectTimers.delete(playerId);
        // Check again — player might have been removed during the wait
        if (!get().players.find((p) => p.id === playerId)) return;

        try {
          const connection = await reconnectToDevice(
            device,
            onHeartRate,
            onDisconnect,
          );
          set((state) => ({
            players: state.players.map((p) =>
              p.id === playerId
                ? { ...p, connected: true, reconnecting: false, connection }
                : p,
            ),
          }));
        } catch {
          // Retry with next backoff step
          attemptReconnect(device, attempt + 1);
        }
      }, delay);

      reconnectTimers.set(playerId, timer);
    };

    // Disconnect handler — triggers auto-reconnect
    const onDisconnect = () => {
      const player = get().players.find((p) => p.id === playerId);
      if (!player) return;

      set((state) => ({
        players: state.players.map((p) =>
          p.id === playerId
            ? { ...p, connected: false, connection: null }
            : p,
        ),
      }));

      // Only auto-reconnect if we still have the device ref
      if (player.device) {
        attemptReconnect(player.device);
      }
    };

    // Add a placeholder player immediately
    set((state) => ({
      players: [
        ...state.players,
        {
          id: playerId,
          name: defaultName,
          deviceName: defaultName,
          bpm: 0,
          connected: false,
          reconnecting: false,
          history: [],
          connection: null,
          device: null,
        },
      ],
    }));

    try {
      const connection = await connectToHRMonitor(onHeartRate, onDisconnect);

      const deviceName = connection.device.name || defaultName;
      const deviceId = connection.device.id;

      // If this same BLE device is already connected under another player, remove the old one
      const existing = get().players.find(
        (p) => p.id !== playerId && p.device?.id === deviceId,
      );
      if (existing) {
        cancelReconnect(existing.id);
        // Don't disconnect or stop notifications — Chrome shares the
        // underlying BLE characteristic across connections to the same
        // device, so touching it would kill the new connection too.
        // Just remove the old player; its callbacks become no-ops.
        set((state) => ({
          players: state.players.filter((p) => p.id !== existing.id),
        }));
      }

      set((state) => ({
        players: state.players.map((p) =>
          p.id === playerId
            ? {
                ...p,
                name: deviceName,
                deviceName,
                connected: true,
                connection,
                device: connection.device,
              }
            : p,
        ),
      }));
    } catch {
      // User cancelled the picker or connection failed — remove placeholder
      set((state) => ({
        players: state.players.filter((p) => p.id !== playerId),
      }));
    }
    } finally {
      isAdding = false;
    }
  },

  removePlayer: async (id) => {
    cancelReconnect(id);
    const player = get().players.find((p) => p.id === id);
    set((state) => ({
      players: state.players.filter((p) => p.id !== id),
    }));
    if (player?.connection) {
      await disconnectDevice(player.connection);
    }
  },

  updateName: (id, name) => {
    set((state) => ({
      players: state.players.map((p) =>
        p.id === id ? { ...p, name } : p,
      ),
    }));
  },

  setTimeWindow: (seconds) => {
    set({ timeWindowSeconds: seconds });
  },

  clearHistory: () => {
    set((state) => ({
      players: state.players.map((p) => ({ ...p, history: [] })),
    }));
  },
}));
