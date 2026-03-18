export interface PortalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PortalHoleGeometry {
  cx: number;
  cy: number;
  diameter: number;
}

export interface PortalGeometry {
  artboardWidth: number;
  artboardHeight: number;
  hole: PortalHoleGeometry;
  leftArm: PortalRect;
  rightArm: PortalRect;
}

export interface PortalPoint {
  x: number;
  y: number;
}

export interface PortalLayout {
  scale: number;
  artboard: PortalRect;
  cosmos: PortalRect;
  leftArm: PortalRect;
  rightArm: PortalRect;
  holeCenter: PortalPoint;
  holeRadius: number;
  transformOrigin: string;
}

function isPositiveFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function scaleRect(rect: PortalRect, scale: number, offsetX: number, offsetY: number): PortalRect {
  return {
    x: offsetX + rect.x * scale,
    y: offsetY + rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

function computeCoverRect(
  sourceWidth: number,
  sourceHeight: number,
  containerWidth: number,
  containerHeight: number,
): { scale: number; rect: PortalRect } {
  if (
    !isPositiveFiniteNumber(sourceWidth) ||
    !isPositiveFiniteNumber(sourceHeight) ||
    !isPositiveFiniteNumber(containerWidth) ||
    !isPositiveFiniteNumber(containerHeight)
  ) {
    return {
      scale: 0,
      rect: {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      },
    };
  }

  const scale = Math.max(containerWidth / sourceWidth, containerHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;

  return {
    scale,
    rect: {
      x: (containerWidth - width) / 2,
      y: (containerHeight - height) / 2,
      width,
      height,
    },
  };
}

export function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (
    !isPositiveFiniteNumber(sourceWidth) ||
    !isPositiveFiniteNumber(sourceHeight) ||
    !isPositiveFiniteNumber(canvasWidth) ||
    !isPositiveFiniteNumber(canvasHeight)
  ) {
    ctx.clearRect(0, 0, Math.max(canvasWidth, 0), Math.max(canvasHeight, 0));
    return;
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const canvasAspect = canvasWidth / canvasHeight;

  let drawWidth: number;
  let drawHeight: number;

  if (canvasAspect > sourceAspect) {
    drawWidth = canvasWidth;
    drawHeight = canvasWidth / sourceAspect;
  } else {
    drawHeight = canvasHeight;
    drawWidth = canvasHeight * sourceAspect;
  }

  const drawX = (canvasWidth - drawWidth) / 2;
  const drawY = (canvasHeight - drawHeight) / 2;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);
}

export function computePortalLayout(
  viewportWidth: number,
  viewportHeight: number,
  portalGeometry: PortalGeometry,
): PortalLayout {
  const {
    scale,
    rect: artboard,
  } = computeCoverRect(
    portalGeometry.artboardWidth,
    portalGeometry.artboardHeight,
    viewportWidth,
    viewportHeight,
  );

  const holeCenter = {
    x: artboard.x + portalGeometry.hole.cx * scale,
    y: artboard.y + portalGeometry.hole.cy * scale,
  };
  const holeRadius = (portalGeometry.hole.diameter * scale) / 2;

  return {
    scale,
    artboard,
    cosmos: artboard,
    leftArm: scaleRect(portalGeometry.leftArm, scale, artboard.x, artboard.y),
    rightArm: scaleRect(portalGeometry.rightArm, scale, artboard.x, artboard.y),
    holeCenter,
    holeRadius,
    transformOrigin: `${holeCenter.x}px ${holeCenter.y}px`,
  };
}

export function computeMaxScale(
  renderedHoleCenter: PortalPoint,
  renderedHoleRadius: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (
    !isPositiveFiniteNumber(renderedHoleRadius) ||
    !isPositiveFiniteNumber(viewportWidth) ||
    !isPositiveFiniteNumber(viewportHeight)
  ) {
    return 1;
  }

  const cornerDistances = [
    Math.hypot(renderedHoleCenter.x, renderedHoleCenter.y),
    Math.hypot(viewportWidth - renderedHoleCenter.x, renderedHoleCenter.y),
    Math.hypot(renderedHoleCenter.x, viewportHeight - renderedHoleCenter.y),
    Math.hypot(viewportWidth - renderedHoleCenter.x, viewportHeight - renderedHoleCenter.y),
  ];
  const farthestCornerDistance = Math.max(...cornerDistances);

  return (farthestCornerDistance / renderedHoleRadius) * 1.05;
}
