#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const repoRoot = process.cwd();
const generatedDir = path.join(repoRoot, 'src', 'lib', 'hero', 'generated');
const frameRoot = path.join(repoRoot, 'public', 'hero', 'frames');
const clipNames = ['celebration', 'sparkle'];
const tiers = ['thumb', 'medium', 'large'];
const whiteThreshold = 245;
const armBackgroundThreshold = 240;
const opaqueThreshold = 8;

const imageCandidates = {
  portalComposite: [path.join(repoRoot, 'public', 'hero', 'portal-composite.webp')],
  cosmos: [
    path.join(repoRoot, 'public', 'hero', 'portal-cosmos.webp'),
    path.join(repoRoot, 'universe with hole.png'),
  ],
  leftArm: [
    path.join(repoRoot, 'public', 'hero', 'arm-left.webp'),
    path.join(repoRoot, 'left arm.png'),
  ],
  rightArm: [
    path.join(repoRoot, 'public', 'hero', 'arm-right.webp'),
    path.join(repoRoot, 'right arm.png'),
  ],
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdout = [];
    const stderr = [];

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr).toString('utf8'),
        });
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(' ')} failed with code ${code}\n${Buffer.concat(stderr).toString('utf8')}`,
        ),
      );
    });
  });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveImage(kind) {
  for (const candidate of imageCandidates[kind]) {
    if (await exists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Could not find an image for ${kind}`);
}

async function getImageDimensions(filePath) {
  const { stdout } = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0:s=x',
    filePath,
  ]);
  const [widthText, heightText] = stdout.toString('utf8').trim().split('x');
  const width = Number(widthText);
  const height = Number(heightText);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Invalid dimensions for ${filePath}`);
  }

  return { width, height };
}

async function getRgbaFrame(filePath, width, height) {
  const { stdout } = await run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    filePath,
    '-frames:v',
    '1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    'pipe:1',
  ]);
  const expectedSize = width * height * 4;

  if (stdout.length !== expectedSize) {
    throw new Error(`Unexpected RGBA byte length for ${filePath}: ${stdout.length} !== ${expectedSize}`);
  }

  return stdout;
}

function scaleBounds(bounds, fromDimensions, toDimensions) {
  const scaleX = toDimensions.width / fromDimensions.width;
  const scaleY = toDimensions.height / fromDimensions.height;

  return {
    x: Math.round(bounds.x * scaleX),
    y: Math.round(bounds.y * scaleY),
    width: Math.round(bounds.width * scaleX),
    height: Math.round(bounds.height * scaleY),
  };
}

function scalePoint(x, y, fromDimensions, toDimensions) {
  return {
    x: Math.round((x * toDimensions.width) / fromDimensions.width),
    y: Math.round((y * toDimensions.height) / fromDimensions.height),
  };
}

function findLargestComponent(width, height, matches) {
  const visited = new Uint8Array(width * height);
  let best = null;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIndex = y * width + x;
      if (visited[startIndex] || !matches(startIndex)) {
        continue;
      }

      const queueX = [x];
      const queueY = [y];
      visited[startIndex] = 1;
      let cursor = 0;
      let count = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;

      while (cursor < queueX.length) {
        const currentX = queueX[cursor];
        const currentY = queueY[cursor];
        cursor += 1;
        count += 1;

        if (currentX < minX) minX = currentX;
        if (currentY < minY) minY = currentY;
        if (currentX > maxX) maxX = currentX;
        if (currentY > maxY) maxY = currentY;

        const neighbors = [
          [currentX - 1, currentY],
          [currentX + 1, currentY],
          [currentX, currentY - 1],
          [currentX, currentY + 1],
        ];

        for (const [nextX, nextY] of neighbors) {
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
            continue;
          }

          const nextIndex = nextY * width + nextX;
          if (visited[nextIndex] || !matches(nextIndex)) {
            continue;
          }

          visited[nextIndex] = 1;
          queueX.push(nextX);
          queueY.push(nextY);
        }
      }

      const component = {
        count,
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      };

      if (!best || component.count > best.count) {
        best = component;
      }
    }
  }

  if (!best) {
    throw new Error('Could not find a matching connected component');
  }

  return best;
}

function findSubjectBounds(width, height, rgbaBuffer) {
  return findLargestComponent(width, height, (pixelIndex) => {
    const offset = pixelIndex * 4;
    const r = rgbaBuffer[offset];
    const g = rgbaBuffer[offset + 1];
    const b = rgbaBuffer[offset + 2];
    const a = rgbaBuffer[offset + 3];
    const usesAlpha = a < 255;
    const isWhiteBackground =
      r >= armBackgroundThreshold && g >= armBackgroundThreshold && b >= armBackgroundThreshold;

    return usesAlpha ? a > opaqueThreshold : !isWhiteBackground;
  });
}

function findHoleGeometry(width, height, rgbaBuffer) {
  const component = findLargestComponent(width, height, (pixelIndex) => {
    const offset = pixelIndex * 4;
    const r = rgbaBuffer[offset];
    const g = rgbaBuffer[offset + 1];
    const b = rgbaBuffer[offset + 2];
    const a = rgbaBuffer[offset + 3];

    if (a < opaqueThreshold) {
      return true;
    }

    return r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold;
  });

  return {
    cx: component.x + component.width / 2,
    cy: component.y + component.height / 2,
    diameter: Math.max(component.width, component.height),
  };
}

async function listExistingFrames(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.webp'))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function buildFrameManifest() {
  const manifest = {};

  for (const clipName of clipNames) {
    const availableTiers = [];
    const counts = [];

    for (const tier of tiers) {
      const files = await listExistingFrames(path.join(frameRoot, clipName, tier));
      if (files.length > 0) {
        availableTiers.push(tier);
        counts.push(files.length);
      }
    }

    const uniqueCounts = [...new Set(counts)];
    if (uniqueCounts.length > 1) {
      throw new Error(`Mismatched frame counts for ${clipName}: ${uniqueCounts.join(', ')}`);
    }

    manifest[clipName] = {
      count: uniqueCounts[0] ?? 0,
      tiers: availableTiers,
    };
  }

  return manifest;
}

function toTsModule(identifier, value) {
  return [
    '// Generated by scripts/emit-generated-hero-metadata.mjs. Do not edit manually.',
    `export const ${identifier} = ${JSON.stringify(value, null, 2)} as const;`,
    '',
  ].join('\n');
}

function pickFallbackArtboard(dimensionsList) {
  return dimensionsList.reduce((largest, current) => {
    const largestArea = largest.width * largest.height;
    const currentArea = current.width * current.height;
    return currentArea > largestArea ? current : largest;
  });
}

async function main() {
  const cosmosPath = await resolveImage('cosmos');
  const leftArmPath = await resolveImage('leftArm');
  const rightArmPath = await resolveImage('rightArm');

  const cosmosDimensions = await getImageDimensions(cosmosPath);
  const leftArmDimensions = await getImageDimensions(leftArmPath);
  const rightArmDimensions = await getImageDimensions(rightArmPath);
  const portalCompositePath = (await exists(imageCandidates.portalComposite[0]))
    ? imageCandidates.portalComposite[0]
    : null;
  const artboardDimensions = portalCompositePath
    ? await getImageDimensions(portalCompositePath)
    : pickFallbackArtboard([cosmosDimensions, leftArmDimensions, rightArmDimensions]);

  const [cosmosRgba, leftArmRgba, rightArmRgba] = await Promise.all([
    getRgbaFrame(cosmosPath, cosmosDimensions.width, cosmosDimensions.height),
    getRgbaFrame(leftArmPath, leftArmDimensions.width, leftArmDimensions.height),
    getRgbaFrame(rightArmPath, rightArmDimensions.width, rightArmDimensions.height),
  ]);

  const hole = findHoleGeometry(cosmosDimensions.width, cosmosDimensions.height, cosmosRgba);
  const leftArmBounds = findSubjectBounds(leftArmDimensions.width, leftArmDimensions.height, leftArmRgba);
  const rightArmBounds = findSubjectBounds(rightArmDimensions.width, rightArmDimensions.height, rightArmRgba);
  const scaledHoleCenter = scalePoint(hole.cx, hole.cy, cosmosDimensions, artboardDimensions);

  const portalGeometry = {
    artboardWidth: artboardDimensions.width,
    artboardHeight: artboardDimensions.height,
    hole: {
      cx: scaledHoleCenter.x,
      cy: scaledHoleCenter.y,
      diameter: Math.round(hole.diameter * (artboardDimensions.width / cosmosDimensions.width)),
    },
    leftArm: scaleBounds(leftArmBounds, leftArmDimensions, artboardDimensions),
    rightArm: scaleBounds(rightArmBounds, rightArmDimensions, artboardDimensions),
  };

  const frameManifest = await buildFrameManifest();

  await fs.mkdir(generatedDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(generatedDir, 'portalGeometry.ts'), toTsModule('PORTAL_GEOMETRY', portalGeometry)),
    fs.writeFile(path.join(generatedDir, 'frameManifest.ts'), toTsModule('FRAME_MANIFEST', frameManifest)),
  ]);

  console.log(`Wrote ${path.relative(repoRoot, generatedDir)}/portalGeometry.ts`);
  console.log(`Wrote ${path.relative(repoRoot, generatedDir)}/frameManifest.ts`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
