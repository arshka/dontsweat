import { usePlayerStore, MAX_PLAYERS } from '../store/usePlayerStore';
import { isBLESupported } from '../services/heartRateService';
import styles from './Header.module.css';

export function Header() {
  const playerCount = usePlayerStore((s) => s.players.length);
  const addPlayer = usePlayerStore((s) => s.addPlayer);
  const bleSupported = isBLESupported();

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.logo}>&#9829;</span>
        <h1 className={styles.title}>GameHR</h1>
      </div>

      <div className={styles.actions}>
        <span className={styles.count}>
          {playerCount}/{MAX_PLAYERS}
        </span>
        {!bleSupported ? (
          <span className={styles.warning}>
            Web Bluetooth not supported — use Chrome or Edge
          </span>
        ) : (
          <button
            className={styles.addButton}
            onClick={addPlayer}
            disabled={playerCount >= MAX_PLAYERS}
          >
            + Add Device
          </button>
        )}
      </div>
    </header>
  );
}
