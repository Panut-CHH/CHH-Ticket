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
let writableCandidates = []; // [{uuid, serviceUuid, characteristic, props}]
let notifyChars = []; // [{uuid, characteristic}]

function bytesToHex(view) {
  const arr = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

function propsToList(p) {
  const keys = [
    "broadcast",
    "read",
    "writeWithoutResponse",
    "write",
    "notify",
    "indicate",
    "authenticatedSignedWrites",
    "reliableWrite",
    "writableAuxiliaries",
  ];
  return keys.filter((k) => p[k]);
}

export function isSupported() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

export async function requestAndConnect({ namePrefix, log } = {}) {
  if (!isSupported()) throw new Error("Web Bluetooth ไม่รองรับใน browser นี้");

  const filters = namePrefix
    ? [{ namePrefix }]
    : [
        { namePrefix: "LuckP" },
        { namePrefix: "Luck" },
        { namePrefix: "L2X" },
        { namePrefix: "L2" },
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

  // Some Android BT stacks drop the GATT session if probed too fast.
  // Retry getPrimaryServices a few times with backoff.
  let server = await device.gatt.connect();
  log?.("gatt connected, probing services…");

  let services = null;
  let lastErr = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await new Promise((r) => setTimeout(r, 300 * attempt));
      if (!device.gatt.connected) {
        log?.(`  reconnecting (attempt ${attempt})…`);
        server = await device.gatt.connect();
      }
      services = await server.getPrimaryServices();
      break;
    } catch (e) {
      lastErr = e;
      log?.(`  attempt ${attempt} failed: ${e.message}`);
    }
  }
  if (!services) throw lastErr || new Error("ไม่สามารถอ่าน services ได้");
  log?.(`found ${services.length} primary service(s)`);

  writableCandidates = [];
  notifyChars = [];
  for (const svc of services) {
    const chars = await svc.getCharacteristics();
    for (const ch of chars) {
      const propList = propsToList(ch.properties);
      const canWrite = ch.properties.write || ch.properties.writeWithoutResponse;
      log?.(`  svc ${svc.uuid} / ch ${ch.uuid} [${propList.join(",") || "none"}]`);
      if (canWrite) {
        writableCandidates.push({
          uuid: ch.uuid,
          serviceUuid: svc.uuid,
          characteristic: ch,
          props: propList,
        });
      }
      if (ch.properties.notify || ch.properties.indicate) {
        notifyChars.push({ uuid: ch.uuid, characteristic: ch });
      }
    }
  }

  // Auto-subscribe all notify chars so we can see responses from the printer.
  for (const { uuid, characteristic } of notifyChars) {
    try {
      await characteristic.startNotifications();
      characteristic.addEventListener("characteristicvaluechanged", (ev) => {
        const v = ev.target.value;
        log?.(`← notify ${uuid.slice(4, 8)}: ${bytesToHex(v)}`);
      });
      log?.(`✓ subscribed notify ${uuid}`);
    } catch (e) {
      log?.(`⚠ subscribe ${uuid} failed: ${e.message}`);
    }
  }

  if (writableCandidates.length === 0) {
    throw new Error("ไม่พบ writable characteristic");
  }

  // Prefer 0x2af0 (data channel on many Chinese BLE printers), else first writable.
  const preferred =
    writableCandidates.find((c) => c.uuid.startsWith("00002af0")) ||
    writableCandidates[0];
  currentDevice = device;
  currentCharacteristic = preferred.characteristic;
  log?.(
    `→ using write char ${preferred.uuid} ` +
      `(${writableCandidates.length} writable total, use setActiveCharacteristic() to switch)`,
  );

  return { device, characteristic: preferred.characteristic };
}

export function listWritableCandidates() {
  return writableCandidates.map(({ uuid, serviceUuid, props }) => ({
    uuid,
    serviceUuid,
    props,
  }));
}

export function setActiveCharacteristic(uuid, { log } = {}) {
  const found = writableCandidates.find((c) => c.uuid === uuid);
  if (!found) throw new Error(`characteristic not found: ${uuid}`);
  currentCharacteristic = found.characteristic;
  log?.(`→ switched write char to ${uuid}`);
  return found.characteristic;
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
    writableCandidates = [];
    notifyChars = [];
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
