import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, it } from "vitest";

import { FRAME_MANIFEST } from "@/lib/hero/generated/frameManifest";
import { PORTAL_GEOMETRY } from "@/lib/hero/generated/portalGeometry";

type ClipName = keyof typeof FRAME_MANIFEST;
type TierName = (typeof FRAME_MANIFEST)[ClipName]["tiers"][number];

type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const EXPECTED_TIERS = ["thumb", "medium", "large"] as const;
const FILE_NAME_PATTERN = /^\d{4}\.webp$/;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const framesRoot = path.join(repoRoot, "public", "hero", "frames");

function getTierDirectory(clip: ClipName, tier: TierName): string {
  return path.join(framesRoot, clip, tier);
}

function getFrameFiles(clip: ClipName, tier: TierName): string[] {
  return fs
    .readdirSync(getTierDirectory(clip, tier), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

function expectEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function expectTrue(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function expectExactTierNames(clip: ClipName): void {
  const actual = FRAME_MANIFEST[clip].tiers.join(",");
  const expected = EXPECTED_TIERS.join(",");

  if (actual !== expected) {
    throw new Error(`FRAME_MANIFEST.${clip}.tiers must equal ${expected}, got ${actual}`);
  }
}

function expectFrameNaming(files: string[], clip: ClipName, tier: TierName): void {
  for (const fileName of files) {
    expectTrue(FILE_NAME_PATTERN.test(fileName), `${clip}/${tier} contains invalid frame name: ${fileName}`);
  }
}

function expectSequential(files: string[], clip: ClipName, tier: TierName): void {
  for (const [index, fileName] of files.entries()) {
    const expected = `${String(index + 1).padStart(4, "0")}.webp`;

    if (fileName !== expected) {
      throw new Error(
        `${clip}/${tier} must be sequential with no gaps: expected ${expected}, got ${fileName}`,
      );
    }
  }
}

function expectBoundsWithinArtboard(name: string, bounds: Bounds): void {
  expectTrue(bounds.width > 0, `${name}.width must be > 0`);
  expectTrue(bounds.height > 0, `${name}.height must be > 0`);
  expectTrue(bounds.x >= 0, `${name}.x must stay within the artboard`);
  expectTrue(bounds.y >= 0, `${name}.y must stay within the artboard`);
  expectTrue(
    bounds.x + bounds.width <= PORTAL_GEOMETRY.artboardWidth,
    `${name} must stay within the artboard width`,
  );
  expectTrue(
    bounds.y + bounds.height <= PORTAL_GEOMETRY.artboardHeight,
    `${name} must stay within the artboard height`,
  );
}

function haveIdenticalBounds(left: Bounds, right: Bounds): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

describe("pipeline output validation", () => {
  it("dynamically imports the generated modules without throwing", async () => {
    const frameManifestModule = await import(
      pathToFileURL(path.join(repoRoot, "src/lib/hero/generated/frameManifest.ts")).href
    );
    const portalGeometryModule = await import(
      pathToFileURL(path.join(repoRoot, "src/lib/hero/generated/portalGeometry.ts")).href
    );

    expectTrue(
      "FRAME_MANIFEST" in frameManifestModule,
      "Generated frameManifest module must export FRAME_MANIFEST",
    );
    expectTrue(
      "PORTAL_GEOMETRY" in portalGeometryModule,
      "Generated portalGeometry module must export PORTAL_GEOMETRY",
    );
  });

  it("keeps frame counts, tier names, file naming, and manifest counts aligned", () => {
    for (const clip of Object.keys(FRAME_MANIFEST) as ClipName[]) {
      expectExactTierNames(clip);

      const tierCounts = FRAME_MANIFEST[clip].tiers.map((tier) => {
        const files = getFrameFiles(clip, tier);

        expectFrameNaming(files, clip, tier);
        expectSequential(files, clip, tier);

        return { tier, files, count: files.length };
      });

      const baselineCount = tierCounts[0]?.count;
      expectTrue(
        typeof baselineCount === "number" && baselineCount > 0,
        `${clip} must contain at least one frame in its first tier`,
      );

      for (const { tier, count } of tierCounts) {
        expectEqual(count, baselineCount, `${clip}/${tier} frame count must match ${clip}/${tierCounts[0]?.tier}`);
      }

      expectEqual(
        FRAME_MANIFEST[clip].count,
        baselineCount,
        `FRAME_MANIFEST.${clip}.count must match on-disk frame count`,
      );

      console.info(
        `VALIDATION: ${clip} has ${baselineCount} frames across ${FRAME_MANIFEST[clip].tiers.join(", ")} tiers. frameManifest.${clip}.count = ${FRAME_MANIFEST[clip].count}. Match: yes`,
      );
    }
  });

  it("keeps portal geometry bounded and internally consistent", () => {
    expectEqual(PORTAL_GEOMETRY.artboardWidth, 1920, "PORTAL_GEOMETRY.artboardWidth");
    expectEqual(PORTAL_GEOMETRY.artboardHeight, 1080, "PORTAL_GEOMETRY.artboardHeight");

    expectTrue(PORTAL_GEOMETRY.hole.diameter > 0, "PORTAL_GEOMETRY.hole.diameter must be > 0");
    expectTrue(PORTAL_GEOMETRY.hole.cx >= 0, "PORTAL_GEOMETRY.hole.cx must stay within the artboard");
    expectTrue(PORTAL_GEOMETRY.hole.cy >= 0, "PORTAL_GEOMETRY.hole.cy must stay within the artboard");
    expectTrue(
      PORTAL_GEOMETRY.hole.cx <= PORTAL_GEOMETRY.artboardWidth,
      "PORTAL_GEOMETRY.hole.cx must stay within the artboard width",
    );
    expectTrue(
      PORTAL_GEOMETRY.hole.cy <= PORTAL_GEOMETRY.artboardHeight,
      "PORTAL_GEOMETRY.hole.cy must stay within the artboard height",
    );

    expectBoundsWithinArtboard("PORTAL_GEOMETRY.leftArm", PORTAL_GEOMETRY.leftArm);
    expectBoundsWithinArtboard("PORTAL_GEOMETRY.rightArm", PORTAL_GEOMETRY.rightArm);
    expectTrue(
      !haveIdenticalBounds(PORTAL_GEOMETRY.leftArm, PORTAL_GEOMETRY.rightArm),
      "Portal arm bounds must stay distinct",
    );
  });
});
