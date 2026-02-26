const HR_SERVICE_UUID = 0x180d;
const HR_MEASUREMENT_UUID = 0x2a37;

export type HRCallback = (bpm: number) => void;
export type DisconnectCallback = () => void;

export interface BLEConnection {
  device: BluetoothDevice;
  server: BluetoothRemoteGATTServer;
  characteristic: BluetoothRemoteGATTCharacteristic;
}

export function isBLESupported(): boolean {
  return !!navigator.bluetooth;
}

/**
 * Parse heart rate from the BLE Heart Rate Measurement characteristic.
 * Spec: https://www.bluetooth.com/specifications/gatt/characteristics/
 * Byte 0 flags: bit 0 = HR format (0 = uint8, 1 = uint16)
 */
function parseHeartRate(value: DataView): number {
  const flags = value.getUint8(0);
  const is16Bit = flags & 0x01;
  return is16Bit ? value.getUint16(1, true) : value.getUint8(1);
}

function assertGatt(
  device: BluetoothDevice,
): BluetoothRemoteGATTServer {
  if (!device.gatt) {
    throw new Error(
      `Bluetooth device "${device.name ?? device.id}" does not support GATT`,
    );
  }
  return device.gatt;
}

async function setupConnection(
  device: BluetoothDevice,
  onHeartRate: HRCallback,
  onDisconnect: DisconnectCallback,
): Promise<BLEConnection> {
  const gatt = assertGatt(device);
  const server = await gatt.connect();
  const service = await server.getPrimaryService(HR_SERVICE_UUID);
  const characteristic = await service.getCharacteristic(HR_MEASUREMENT_UUID);

  characteristic.addEventListener(
    'characteristicvaluechanged',
    (event: Event) => {
      const target = event.target as BluetoothRemoteGATTCharacteristic;
      if (target.value) {
        onHeartRate(parseHeartRate(target.value));
      }
    },
  );

  await characteristic.startNotifications();

  device.addEventListener('gattserverdisconnected', () => {
    onDisconnect();
  }, { once: true });

  return { device, server, characteristic };
}

export async function connectToHRMonitor(
  onHeartRate: HRCallback,
  onDisconnect: DisconnectCallback,
): Promise<BLEConnection> {
  const device = await navigator.bluetooth.requestDevice({
    filters: [
      { services: [HR_SERVICE_UUID] },
      { namePrefix: 'Garmin' },
      { namePrefix: 'HRM-' },
    ],
    optionalServices: [HR_SERVICE_UUID],
  });

  return setupConnection(device, onHeartRate, onDisconnect);
}

/**
 * Reconnect to an already-paired device (no user gesture needed).
 * Returns a new BLEConnection with fresh server/characteristic refs.
 */
export async function reconnectToDevice(
  device: BluetoothDevice,
  onHeartRate: HRCallback,
  onDisconnect: DisconnectCallback,
): Promise<BLEConnection> {
  return setupConnection(device, onHeartRate, onDisconnect);
}

export async function disconnectDevice(connection: BLEConnection) {
  try {
    await connection.characteristic.stopNotifications();
  } catch {
    // already disconnected
  }
  connection.server.disconnect();
}
