import { usePlayerStore } from '../store/usePlayerStore';
import { PlayerCard } from './PlayerCard';
import styles from './PlayerCardGrid.module.css';

export function PlayerCardGrid() {
  const players = usePlayerStore((s) => s.players);

  if (players.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No devices connected</p>
        <p className={styles.hint}>
          Click <strong>+ Add Device</strong> to pair a Bluetooth heart rate monitor
        </p>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {players.map((player, i) => (
        <PlayerCard key={player.id} player={player} index={i} />
      ))}
    </div>
  );
}
