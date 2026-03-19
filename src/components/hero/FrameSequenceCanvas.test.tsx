import { describe, expect, it } from "vitest";

import { HERO_RUNTIME_FRAME_EVENT } from "../../hooks/useHeroRuntime";

describe("FrameSequenceCanvas runtime contract", () => {
  it("uses a stable runtime frame event name", () => {
    expect(HERO_RUNTIME_FRAME_EVENT).toBe("hero:runtimeframe");
  });
});
