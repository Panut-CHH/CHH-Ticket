// Web Bluetooth wrapper for mini BLE thermal/label printers (POC).
// Tested target: Zhuyitao L2X. UUIDs below are the common set used by many
// Chinese BLE thermal printers — if L2X reports different UUIDs in the
// connect log, swap them here.

export const COMMON_PRINTER_UUIDS = {
  // Vendor-specific primary services seen on similar BLE mini printers.
  services: [
    "0000ff00-0000-1000-8000-00805f9b34fb",
    "000018f0-0000-1000-8000-00805f9b34fb",
    "0000ae30-0000-1000-8000-00805f9b34fb",
  ],
  // Write characteristics (host -> printer).
  writeChars: [
    "0000ff02-0000-1000-8000-00805f9b34fb",
    "00002af1-0000-1000-8000-00805f9b34fb",
    "0000ae01-0000-1000-8000-00805f9b34fb",
  ],
};

const BLE_CHUNK_SIZE = 180; // safe under typical BLE MTU (185) after ATT overhead

let currentDevice = null;
let currentCharacteristic = null;

export function isSupported() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

export async function requestAndConnect({ namePrefix, log } = {}) {
  if (!isSupported()) throw new Error("Web Bluetooth ไม่รองรับใน browser นี้");

  const filters = namePrefix
    ? [{ namePrefix }]
    : [
        { namePrefix: "L2X" },
        { namePrefix: "ZJT" },
        { namePrefix: "Printer" },
        { namePrefix: "MPT" },
        { namePrefix: "BT" },
      ];

  log?.(`requesting device (filters: ${JSON.stringify(filters)})`);
  const device = await navigator.bluetooth.requestDevice({
    filters,
    optionalServices: COMMON_PRINTER_UUIDS.services,
  });
  log?.(`selected: ${device.name} (${device.id})`);

  device.addEventListener("gattserverdisconnected", () => {
    log?.("⚠ gatt disconnected");
    currentDevice = null;
    currentCharacteristic = null;
  });

  const server = await device.gatt.connect();
  log?.("gatt connected, probing services…");

  const services = await server.getPrimaryServices();
  log?.(`found ${services.length} primary service(s)`);

  let writable = null;
  for (const svc of services) {
    const chars = await svc.getCharacteristics();
    for (const ch of chars) {
      const canWrite = ch.properties.write || ch.properties.writeWithoutResponse;
      log?.(
        `  svc ${svc.uuid} / ch ${ch.uuid} ` +
          `[${Object.entries(ch.properties)
            .filter(([, v]) => v)
            .map(([k]) => k)
            .join(",")}]`,
      );
      if (canWrite && !writable) writable = ch;
    }
  }

  if (!writable) throw new Error("ไม่พบ writable characteristic");
  log?.(`→ using write char ${writable.uuid}`);

  currentDevice = device;
  currentCharacteristic = writable;
  return { device, characteristic: writable };
}

export async function writeBytes(bytes, { log } = {}) {
  if (!currentCharacteristic) throw new Error("ยังไม่ได้ connect printer");
  const ch = currentCharacteristic;
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  for (let i = 0; i < data.length; i += BLE_CHUNK_SIZE) {
    const chunk = data.slice(i, i + BLE_CHUNK_SIZE);
    if (ch.properties.writeWithoutResponse) {
      await ch.writeValueWithoutResponse(chunk);
    } else {
      await ch.writeValue(chunk);
    }
  }
  log?.(`wrote ${data.length} bytes`);
}

export function disconnect({ log } = {}) {
  try {
    currentDevice?.gatt?.disconnect();
    log?.("disconnected");
  } finally {
    currentDevice = null;
    currentCharacteristic = null;
  }
}

export function getStatus() {
  return {
    connected: !!currentCharacteristic,
    deviceName: currentDevice?.name || null,
    characteristicUuid: currentCharacteristic?.uuid || null,
  };
}

// Parse "1B 40 0A ..." / "1b400a" / "0x1b,0x40" into Uint8Array.
export function parseHex(input) {
  const cleaned = (input || "").replace(/0x/gi, "").replace(/[^0-9a-f]/gi, "");
  if (cleaned.length % 2 !== 0) throw new Error("hex length ต้องเป็นเลขคู่");
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(cleaned.substr(i * 2, 2), 16);
  }
  return out;
}
