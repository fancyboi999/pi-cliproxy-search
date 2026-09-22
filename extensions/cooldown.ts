import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface CooldownInfo {
  active: boolean;
  cooldownUntil: number; // Expiration epoch timestamp in ms
  resetSeconds: number;
  resetTimeStr?: string;
  reason?: string;
  recordedAt: number;
}

const PRIMARY_COOLDOWN_PATH = path.join(os.homedir(), ".pi", "agent", "cliproxy-cooldown.json");

let memoryCooldown: CooldownInfo | null = null;

function getCooldownFilePath(): string {
  const dir = path.dirname(PRIMARY_COOLDOWN_PATH);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      return path.join(os.tmpdir(), "pi-cliproxy-cooldown.json");
    }
  }
  return PRIMARY_COOLDOWN_PATH;
}

function loadPersistedCooldown(): CooldownInfo | null {
  const filePath = getCooldownFilePath();
  if (!fs.existsSync(filePath)) return null;

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content) as CooldownInfo;
    if (parsed && typeof parsed.cooldownUntil === "number") {
      if (Date.now() < parsed.cooldownUntil) {
        return parsed;
      }
      // Expired: prune the file
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }
  } catch {}

  return null;
}

function savePersistedCooldown(info: CooldownInfo | null): void {
  const filePath = getCooldownFilePath();
  try {
    if (!info) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return;
    }
    fs.writeFileSync(filePath, JSON.stringify(info, null, 2), { mode: 0o600 });
  } catch {}
}

/**
 * Formats milliseconds remaining into human-readable strings.
 */
export function formatCooldownTime(cooldownUntil: number): {
  absolute: string;
  relative: string;
  remainingSeconds: number;
} {
  const now = Date.now();
  const diffMs = Math.max(0, cooldownUntil - now);
  const totalSeconds = Math.round(diffMs / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let relative = "";
  if (hours > 0) {
    relative = `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    relative = `${minutes}m ${seconds}s`;
  } else {
    relative = `${seconds}s`;
  }

  // Format absolute local time (e.g., "14:25:30")
  const dateObj = new Date(cooldownUntil);
  const pad = (n: number) => String(n).padStart(2, "0");
  const absolute = `${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}`;

  return {
    absolute,
    relative,
    remainingSeconds: totalSeconds,
  };
}

/**
 * Returns current Codex cooldown state, automatically expiring old cooldowns.
 */
export function getCodexCooldown(): CooldownInfo {
  const now = Date.now();

  // Check memory cache first
  if (memoryCooldown) {
    if (now < memoryCooldown.cooldownUntil) {
      return memoryCooldown;
    }
    // Expired
    memoryCooldown = null;
    savePersistedCooldown(null);
  }

  // Check persisted cache
  const loaded = loadPersistedCooldown();
  if (loaded && now < loaded.cooldownUntil) {
    memoryCooldown = loaded;
    return loaded;
  }

  return {
    active: false,
    cooldownUntil: 0,
    resetSeconds: 0,
    recordedAt: now,
  };
}

/**
 * Records a Codex cooldown period from response status, headers, or body text.
 */
export function recordCodexCooldown(
  status: number,
  headers?: Headers | Record<string, string | string[] | undefined>,
  bodyText?: string
): CooldownInfo {
  let resetSeconds = 0;
  let resetTimeStr = "";
  let reason = "";

  if (bodyText) {
    try {
      let parsed = JSON.parse(bodyText);
      // CLIProxyAPI wraps internal errors in a JSON string under parsed.error
      if (typeof parsed.error === "string") {
        try {
          parsed = JSON.parse(parsed.error);
        } catch {}
      }
      const errObj = parsed.error || parsed;
      if (errObj.reset_seconds) {
        resetSeconds = Number(errObj.reset_seconds);
      }
      if (errObj.reset_time) {
        resetTimeStr = String(errObj.reset_time);
      }
      if (errObj.last_upstream_error || errObj.message) {
        reason = String(errObj.last_upstream_error || errObj.message);
      }
    } catch {}
  }

  if (!resetSeconds && headers) {
    let retryAfterHeader: string | undefined;
    if (typeof (headers as Headers).get === "function") {
      retryAfterHeader = (headers as Headers).get("retry-after") || undefined;
    } else {
      const raw = (headers as Record<string, any>)["retry-after"] || (headers as Record<string, any>)["Retry-After"];
      retryAfterHeader = Array.isArray(raw) ? raw[0] : raw;
    }

    if (retryAfterHeader) {
      const parsedHeader = Number(retryAfterHeader);
      if (!Number.isNaN(parsedHeader) && parsedHeader > 0) {
        resetSeconds = parsedHeader;
      } else {
        const parsedDate = new Date(retryAfterHeader).getTime();
        if (!Number.isNaN(parsedDate) && parsedDate > Date.now()) {
          resetSeconds = Math.max(0, Math.round((parsedDate - Date.now()) / 1000));
        }
      }
    }
  }

  // If HTTP 429 but no explicit seconds returned, apply a safe 5-minute fallback
  if (!resetSeconds && status === 429) {
    resetSeconds = 300;
  }

  const now = Date.now();
  const cooldownUntil = now + resetSeconds * 1000;

  const info: CooldownInfo = {
    active: resetSeconds > 0,
    cooldownUntil,
    resetSeconds,
    resetTimeStr: resetTimeStr || undefined,
    reason: reason || undefined,
    recordedAt: now,
  };

  memoryCooldown = info;
  savePersistedCooldown(info);

  return info;
}

/**
 * Manually clears current Codex cooldown state.
 */
export function clearCodexCooldown(): void {
  memoryCooldown = null;
  savePersistedCooldown(null);
}
