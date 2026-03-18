function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

export function easeInCubic(t: number): number {
  return t * t * t;
}

export function easeOutCubic(t: number): number {
  const inverse = 1 - t;

  return 1 - inverse * inverse * inverse;
}

export function bellCurve(t: number): number {
  return Math.sin(clamp(t, 0, 1) * Math.PI);
}

export function clamp(value: number, min: number, max: number): number {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) {
    return value;
  }

  const lowerBound = Math.min(min, max);
  const upperBound = Math.max(min, max);

  if (!isFiniteNumber(value)) {
    return lowerBound;
  }

  return Math.min(Math.max(value, lowerBound), upperBound);
}

export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (
    !isFiniteNumber(value) ||
    !isFiniteNumber(inMin) ||
    !isFiniteNumber(inMax) ||
    !isFiniteNumber(outMin) ||
    !isFiniteNumber(outMax) ||
    inMin === inMax
  ) {
    return outMin;
  }

  const progress = (value - inMin) / (inMax - inMin);

  return outMin + progress * (outMax - outMin);
}

export function mapRangeClamped(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  const mappedValue = mapRange(value, inMin, inMax, outMin, outMax);

  return clamp(mappedValue, Math.min(outMin, outMax), Math.max(outMin, outMax));
}
