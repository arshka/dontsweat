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
        <h1 className={styles.title}>dontsweat</h1>
      </div>

      <div className={styles.actions}>
        <a
          href="https://github.com/arshka/dontsweat"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.starLink}
          title="Star on GitHub"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z" />
          </svg>
          Star
        </a>
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
