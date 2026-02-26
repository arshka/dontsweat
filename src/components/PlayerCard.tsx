import { useState } from 'react';
import type { Player } from '../store/usePlayerStore';
import { getPlayerColor, usePlayerStore } from '../store/usePlayerStore';
import styles from './PlayerCard.module.css';

interface Props {
  player: Player;
  index: number;
}

export function PlayerCard({ player, index }: Props) {
  const removePlayer = usePlayerStore((s) => s.removePlayer);
  const updateName = usePlayerStore((s) => s.updateName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(player.name);

  const color = getPlayerColor(index);
  const bpm = player.bpm;

  // Glow intensity based on BPM (brighter at higher HR)
  const glowIntensity = bpm > 0 ? Math.min((bpm - 40) / 140, 1) : 0;
  const glowSize = 8 + glowIntensity * 20;

  const isRenamed = player.name !== player.deviceName;

  const startEditing = () => {
    setDraft(player.name);
    setEditing(true);
  };

  const commitName = () => {
    const trimmed = draft.trim();
    if (trimmed) updateName(player.id, trimmed);
    else setDraft(player.name);
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft(player.name);
    setEditing(false);
  };

  return (
    <div
      className={styles.card}
      style={{
        '--player-color': color,
        '--glow-size': `${glowSize}px`,
      } as React.CSSProperties}
    >
      <div className={styles.top}>
        <div className={styles.nameBlock}>
          {editing ? (
            <div className={styles.editRow}>
              <input
                className={styles.nameInput}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitName();
                  if (e.key === 'Escape') cancelEdit();
                }}
                autoFocus
              />
              <button className={styles.confirmBtn} onClick={commitName} title="Confirm">
                &#10003;
              </button>
              <button className={styles.cancelBtn} onClick={cancelEdit} title="Cancel">
                &#10005;
              </button>
            </div>
          ) : (
            <div className={styles.nameRow}>
              <span className={styles.name}>{player.name}</span>
              <button
                className={styles.editBtn}
                onClick={startEditing}
              >
                rename
              </button>
            </div>
          )}
          {isRenamed && !editing && (
            <span className={styles.deviceName}>{player.deviceName}</span>
          )}
        </div>
        <button
          className={styles.remove}
          onClick={() => removePlayer(player.id)}
          title="Remove device"
        >
          &times;
        </button>
      </div>

      <div className={styles.bpmArea}>
        <span className={styles.bpmValue}>
          {bpm > 0 ? bpm : '--'}
        </span>
        <span className={styles.bpmLabel}>BPM</span>
      </div>

      <div className={styles.status}>
        <span
          className={
            player.connected
              ? styles.dotConnected
              : player.reconnecting
                ? styles.dotReconnecting
                : styles.dotDisconnected
          }
        />
        <span className={styles.statusText}>
          {player.connected
            ? 'Connected'
            : player.reconnecting
              ? 'Reconnecting…'
              : 'Disconnected'}
        </span>
      </div>
    </div>
  );
}
