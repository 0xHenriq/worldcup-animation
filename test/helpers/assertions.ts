import { expect } from "vitest";

type SampleFunction = (sample: number, index: number) => number;

export function expectCloseToZero(value: number, epsilon = 1e-9, context = "value"): void {
  const distance = Math.abs(value);

  expect(
    distance <= epsilon,
    `${context} expected to be within +/-${epsilon} of 0, but received ${value} (abs=${distance}).`,
  ).toBe(true);
}

export function expectWithinRange(
  value: number,
  min: number,
  max: number,
  context = "value",
): void {
  expect(
    value >= min && value <= max,
    `${context} expected to be within [${min}, ${max}], but received ${value}.`,
  ).toBe(true);
}

export function expectMonotonicallyIncreasing(
  fn: SampleFunction,
  samples: number[],
  context = "function",
): void {
  if (samples.length < 2) {
    throw new Error(
      `${context} monotonicity check requires at least 2 samples, but received ${samples.length}.`,
    );
  }

  const firstSample = samples[0];
  if (firstSample === undefined) {
    throw new Error(`${context} could not read the first sample from the provided input list.`);
  }

  let previousInput = firstSample;
  let previousOutput = fn(previousInput, 0);

  expect(
    Number.isFinite(previousOutput),
    `${context} produced a non-finite value for sample ${previousInput}: ${previousOutput}.`,
  ).toBe(true);

  for (let index = 1; index < samples.length; index += 1) {
    const currentInput = samples[index];
    if (currentInput === undefined) {
      throw new Error(`${context} could not read sample at index ${index}.`);
    }
    const currentOutput = fn(currentInput, index);

    expect(
      Number.isFinite(currentOutput),
      `${context} produced a non-finite value for sample ${currentInput}: ${currentOutput}.`,
    ).toBe(true);

    expect(
      currentOutput >= previousOutput,
      `${context} is not monotonically increasing: input ${previousInput} -> ${currentInput}, output ${previousOutput} -> ${currentOutput}.`,
    ).toBe(true);

    previousInput = currentInput;
    previousOutput = currentOutput;
  }
}
