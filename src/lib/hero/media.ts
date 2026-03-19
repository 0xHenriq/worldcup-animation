export type FrameTier = "thumb" | "medium" | "large";
export type DesiredFrameTier = Exclude<FrameTier, "thumb">;
export type DecodedFrame = ImageBitmap | HTMLImageElement;

const TIER_LONG_EDGE: Record<FrameTier, number> = {
  thumb: 480,
  medium: 960,
  large: 1920,
};

let generationCounter = 0;

function isFinitePositiveNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function getRuntimeDevicePixelRatio(): number {
  if (typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio)) {
    return window.devicePixelRatio;
  }

  const fallbackDevicePixelRatio = (globalThis as { devicePixelRatio?: unknown }).devicePixelRatio;

  return typeof fallbackDevicePixelRatio === "number" && Number.isFinite(fallbackDevicePixelRatio)
    ? fallbackDevicePixelRatio
    : 1;
}

function getRuntimeDeviceMemory(): number | undefined {
  if (typeof navigator !== "undefined") {
    const deviceMemory = (navigator as Navigator & { deviceMemory?: unknown }).deviceMemory;

    if (typeof deviceMemory === "number" && Number.isFinite(deviceMemory)) {
      return deviceMemory;
    }
  }

  return undefined;
}

function createAbortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("The operation was aborted.", "AbortError");
  }

  const abortError = new Error("The operation was aborted.");
  abortError.name = "AbortError";

  return abortError;
}

function throwIfAborted(abortSignal?: AbortSignal): void {
  if (abortSignal?.aborted) {
    throw createAbortError();
  }
}

function canCreateImageBitmap(): boolean {
  return typeof globalThis.createImageBitmap === "function";
}

function canCreateImageElement(): boolean {
  return typeof Image !== "undefined";
}

export async function warmFrameSource(url: string, abortSignal?: AbortSignal): Promise<void> {
  throwIfAborted(abortSignal);

  if (canCreateImageElement()) {
    const image = new Image();
    image.decoding = "async";

    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        image.onload = null;
        image.onerror = null;
        abortSignal?.removeEventListener("abort", onAbort);
      };

      const onAbort = () => {
        cleanup();
        image.src = "";
        reject(createAbortError());
      };

      image.onload = () => {
        cleanup();
        image.src = "";
        resolve();
      };

      image.onerror = () => {
        cleanup();
        reject(new Error(`Failed to warm frame source: ${url}`));
      };

      abortSignal?.addEventListener("abort", onAbort, { once: true });
      image.src = url;
    });
  }

  if (typeof fetch === "function") {
    const response = await fetch(url, {
      cache: "force-cache",
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`Failed to warm frame source: ${response.status} ${response.statusText}`);
    }

    await response.arrayBuffer();
    throwIfAborted(abortSignal);
    return;
  }

  throw new Error("Frame source warming is unavailable in this environment.");
}

async function decodeFrameWithImageElement(
  url: string,
  abortSignal?: AbortSignal,
): Promise<HTMLImageElement> {
  if (!canCreateImageElement()) {
    throw new Error("Image element decoding is unavailable in this environment.");
  }

  throwIfAborted(abortSignal);

  const image = new Image();
  image.decoding = "async";

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      abortSignal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cleanup();
      image.src = "";
      reject(createAbortError());
    };

    image.onload = async () => {
      try {
        if (typeof image.decode === "function") {
          await image.decode();
        }
        throwIfAborted(abortSignal);
        cleanup();
        resolve(image);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    image.onerror = () => {
      cleanup();
      reject(new Error(`Failed to decode frame: ${url}`));
    };

    abortSignal?.addEventListener("abort", onAbort, { once: true });
    image.src = url;
  });
}

export function getDesiredTier(
  viewportWidth: number,
  viewportHeight: number,
  devicePixelRatio = getRuntimeDevicePixelRatio(),
  deviceMemory = getRuntimeDeviceMemory(),
): DesiredFrameTier {
  if (!isFinitePositiveNumber(viewportWidth) || !isFinitePositiveNumber(viewportHeight)) {
    return "medium";
  }

  const effectiveLongEdge =
    Math.max(viewportWidth, viewportHeight) * Math.min(Math.max(devicePixelRatio, 1), 2);

  if (effectiveLongEdge <= 1100) {
    return "medium";
  }

  if (deviceMemory !== undefined && deviceMemory <= 4 && effectiveLongEdge <= 1400) {
    return "medium";
  }

  return "large";
}

export function getActiveTierLongEdge(tier: FrameTier): number {
  return TIER_LONG_EDGE[tier];
}

export function computeCanvasScale(
  viewportWidth: number,
  viewportHeight: number,
  activeTierLongEdge: number,
  devicePixelRatio = getRuntimeDevicePixelRatio(),
): number {
  if (
    !isFinitePositiveNumber(viewportWidth) ||
    !isFinitePositiveNumber(viewportHeight) ||
    !isFinitePositiveNumber(activeTierLongEdge)
  ) {
    return 1;
  }

  return Math.min(
    2,
    Math.max(devicePixelRatio, 1),
    activeTierLongEdge / Math.max(viewportWidth, viewportHeight),
  );
}

export async function decodeFrame(url: string, abortSignal?: AbortSignal): Promise<DecodedFrame> {
  throwIfAborted(abortSignal);

  if (typeof fetch === "function") {
    const response = await fetch(url, { signal: abortSignal });

    if (!response.ok) {
      throw new Error(`Failed to fetch frame: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    throwIfAborted(abortSignal);

    if (canCreateImageBitmap()) {
      return globalThis.createImageBitmap(blob);
    }
  }

  return decodeFrameWithImageElement(url, abortSignal);
}

export function makeGenerationToken(): number {
  generationCounter += 1;

  return generationCounter;
}
