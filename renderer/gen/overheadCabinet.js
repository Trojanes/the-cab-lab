// Generated from generators/overheadCabinet/generator.ts - do not edit.

// generators/overheadCabinet/geometry.ts
var DEFAULT_ROUTER_DIAMETER_MM = 10;
var DIVIDER_THICKNESS_MM = 15;
var FEATURE_CLEARANCE_MM = 1;
var FEATURE_GROOVE_WIDTH_MM = DIVIDER_THICKNESS_MM + FEATURE_CLEARANCE_MM;
var SCREW_HOLE_DIAMETER_MM = 3;
var SCREW_HOLE_DEPTH_MM = 15;
var BOTTOM_THICKNESS_MM = 15;
var DIVIDER_TONGUE_HEIGHT_MM = DIVIDER_THICKNESS_MM / 2 - 0.5;
var T1_HEIGHT_MM = 40;
var T3_DEPTH_MM = 90;
var T3_THICKNESS_MM = 15;
var T3_NOTCH_DEPTH_MM = 20;
var T4_THICKNESS_MM = 15;
var T4_HEIGHT_MM = 50;
var T4_NOTCH_HEIGHT_MM = 20;
var T4_SCREW_HOLE_NOTCH_CLEARANCE_MM = 8;
var T4_SCREW_HOLE_UP_SHIFT_MM = 10;
var FRONT_TOP_NOTCH_Y_OFFSET_MM = 70;
var FRONT_TOP_STEP_Y_MM = 10;
var FRONT_TOP_STEP_DROP_MM = FEATURE_GROOVE_WIDTH_MM;
var REAR_TOP_NOTCH_HEIGHT_MM = T4_HEIGHT_MM - 15;
function dedupePoints(points) {
  const out = [];
  for (const point of points) {
    if (out.length > 0 && out[out.length - 1][0] === point[0] && out[out.length - 1][1] === point[1]) {
      continue;
    }
    out.push(point);
  }
  return out;
}
function edgeDividerCenterlines(cabinetWidth, featureWidth = DIVIDER_THICKNESS_MM) {
  const halfWidth = featureWidth / 2;
  return [halfWidth, cabinetWidth - halfWidth];
}
function dividerCenterlines(cabinetWidth, internalCenterlines, featureWidth = DIVIDER_THICKNESS_MM) {
  const [left, right] = edgeDividerCenterlines(cabinetWidth, featureWidth);
  return [left, ...internalCenterlines, right];
}
function clampRange(range, min, max) {
  return [Math.max(min, range[0]), Math.min(max, range[1])];
}
function featureXRange(centerlineX, featureSlotWidth = FEATURE_GROOVE_WIDTH_MM) {
  const halfWidth = featureSlotWidth / 2;
  return [centerlineX - halfWidth, centerlineX + halfWidth];
}
function boardXRange(centerlineX, boardThickness = DIVIDER_THICKNESS_MM) {
  const halfWidth = boardThickness / 2;
  return [centerlineX - halfWidth, centerlineX + halfWidth];
}
function bpGrooveYRange(cabinetDepth) {
  return [cabinetDepth / 3, 2 * cabinetDepth / 3];
}
function bpGrooveLength(cabinetDepth) {
  return cabinetDepth / 3;
}
function screwHolePositions(centerlineX, cabinetDepth, diameter = SCREW_HOLE_DIAMETER_MM) {
  return [
    { x: centerlineX, y: cabinetDepth / 6, diameter },
    { x: centerlineX, y: 5 * cabinetDepth / 6, diameter }
  ];
}
function panelScrewHoles(part, centers, localMidline, diameter = SCREW_HOLE_DIAMETER_MM, depth = SCREW_HOLE_DEPTH_MM) {
  return centers.map((centerlineX, index) => ({
    id: `${part}SH_D${index}`,
    part,
    for_divider: `D${index}`,
    center: [centerlineX, localMidline],
    diameter,
    depth,
    axis: "thickness"
  }));
}
function dividerTongueYRange(cabinetDepth, _routerDiameter = DEFAULT_ROUTER_DIAMETER_MM) {
  const sideInset = 5;
  return [
    cabinetDepth / 3 + sideInset,
    2 * cabinetDepth / 3 - sideInset
  ];
}
function dividerTongueLength(cabinetDepth, _routerDiameter = DEFAULT_ROUTER_DIAMETER_MM) {
  return cabinetDepth / 3 - 10;
}
function t3NotchYRange(t3Depth = T3_DEPTH_MM, notchDepth = T3_NOTCH_DEPTH_MM) {
  return [t3Depth - notchDepth, t3Depth];
}
function t4NotchZRange(notchHeight = T4_NOTCH_HEIGHT_MM) {
  return [0, notchHeight];
}
function bpGroove(dividerId, centerlineX, cabinetDepth, featureSlotWidth = FEATURE_GROOVE_WIDTH_MM, tongueHeight, cabinetWidth) {
  const z1 = tongueHeight !== void 0 ? -tongueHeight : 0;
  const [rawX0, rawX1] = featureXRange(centerlineX, featureSlotWidth);
  const [x0, x1] = cabinetWidth === void 0 ? [rawX0, rawX1] : clampRange([rawX0, rawX1], 0, cabinetWidth);
  const [y0, y1] = bpGrooveYRange(cabinetDepth);
  const depthZ = tongueHeight ?? 0;
  return {
    id: `BG_${dividerId}`,
    part: "BP",
    for_divider: dividerId,
    x: [x0, x1],
    y: [y0, y1],
    z: [0, z1],
    width_x: x1 - x0,
    length_y: bpGrooveLength(cabinetDepth),
    depth_z: depthZ
  };
}
function t3Notch(dividerId, centerlineX, featureSlotWidth = FEATURE_GROOVE_WIDTH_MM, cabinetWidth) {
  const [rawX0, rawX1] = featureXRange(centerlineX, featureSlotWidth);
  const x = cabinetWidth === void 0 ? [rawX0, rawX1] : clampRange([rawX0, rawX1], 0, cabinetWidth);
  return {
    id: `T3N_${dividerId}`,
    part: "T3",
    for_divider: dividerId,
    x,
    y: t3NotchYRange(),
    z: [0, -DIVIDER_THICKNESS_MM],
    width_x: x[1] - x[0],
    depth_y: T3_NOTCH_DEPTH_MM
  };
}
function t4Notch(dividerId, centerlineX, featureSlotWidth = FEATURE_GROOVE_WIDTH_MM, cabinetWidth) {
  const [rawX0, rawX1] = featureXRange(centerlineX, featureSlotWidth);
  const x = cabinetWidth === void 0 ? [rawX0, rawX1] : clampRange([rawX0, rawX1], 0, cabinetWidth);
  return {
    id: `T4N_${dividerId}`,
    part: "T4",
    for_divider: dividerId,
    x,
    y: [0, DIVIDER_THICKNESS_MM],
    z: t4NotchZRange(),
    width_x: x[1] - x[0],
    height_z: T4_NOTCH_HEIGHT_MM
  };
}
function t3TrimmedOutlinePoints(cabinetWidth, notchXRanges, t3Depth = T3_DEPTH_MM, notchDepth = T3_NOTCH_DEPTH_MM) {
  const rearY = t3Depth;
  const notchY = t3Depth - notchDepth;
  const ranges = [...notchXRanges].sort((a, b) => b[0] - a[0]);
  const points = [
    [0, 0],
    [cabinetWidth, 0]
  ];
  let currentX = cabinetWidth;
  if (ranges.length > 0 && ranges[0][1] >= cabinetWidth) {
    const [x0] = ranges.shift();
    points.push([cabinetWidth, notchY], [x0, notchY], [x0, rearY]);
    currentX = x0;
  } else {
    points.push([cabinetWidth, rearY]);
    currentX = cabinetWidth;
  }
  while (ranges.length > 0) {
    const [x0, x1] = ranges.shift();
    if (x0 <= 0) {
      points.push([x1, rearY], [x1, notchY], [0, notchY], [0, 0]);
      return dedupePoints(points);
    }
    points.push([x1, rearY], [x1, notchY], [x0, notchY], [x0, rearY]);
    currentX = x0;
  }
  if (currentX > 0) {
    points.push([0, rearY], [0, 0]);
  }
  return dedupePoints(points);
}
function t4TrimmedOutlinePoints(cabinetWidth, notchXRanges, t4Height = T4_HEIGHT_MM, notchHeight = T4_NOTCH_HEIGHT_MM) {
  const ranges = [...notchXRanges].sort((a, b) => b[0] - a[0]);
  const points = [
    [0, t4Height],
    [cabinetWidth, t4Height]
  ];
  let currentX = cabinetWidth;
  if (ranges.length > 0 && ranges[0][1] >= cabinetWidth) {
    const [x0] = ranges.shift();
    points.push([cabinetWidth, notchHeight], [x0, notchHeight], [x0, 0]);
    currentX = x0;
  } else {
    points.push([cabinetWidth, 0]);
    currentX = cabinetWidth;
  }
  while (ranges.length > 0) {
    const [x0, x1] = ranges.shift();
    if (x0 <= 0) {
      points.push([x1, 0], [x1, notchHeight], [0, notchHeight], [0, t4Height]);
      return dedupePoints(points);
    }
    points.push([x1, 0], [x1, notchHeight], [x0, notchHeight], [x0, 0]);
    currentX = x0;
  }
  if (currentX > 0) {
    points.push([0, 0], [0, t4Height]);
  }
  return dedupePoints(points);
}
function dividerSideTrimmedOutlinePoints(cabinetDepth, cabinetHeight, fgWidth = DIVIDER_THICKNESS_MM, tongueHeight, routerDiameter = DEFAULT_ROUTER_DIAMETER_MM, featureSlotWidth = FEATURE_GROOVE_WIDTH_MM, topClearanceHeight = T1_HEIGHT_MM, style = "style_1", frontPanelThickness = 16) {
  if (cabinetHeight == null) {
    return [];
  }
  const resolvedTongueHeight = tongueHeight ?? fgWidth / 2 - 0.5;
  const dividerHeight = cabinetHeight - fgWidth;
  const [tongueY0, tongueY1] = dividerTongueYRange(cabinetDepth, routerDiameter);
  const tongueZ0 = -resolvedTongueHeight;
  const frontY0 = style === "style_2" ? frontPanelThickness + fgWidth : FRONT_TOP_NOTCH_Y_OFFSET_MM;
  const frontZ0 = dividerHeight - topClearanceHeight;
  const rearY0 = cabinetDepth - featureSlotWidth;
  const rearZ0 = dividerHeight - (T4_HEIGHT_MM - fgWidth);
  const frontStepY1 = FRONT_TOP_NOTCH_Y_OFFSET_MM + FRONT_TOP_STEP_Y_MM;
  const frontStepZ1 = frontZ0 - featureSlotWidth;
  return dedupePoints([
    [0, 0],
    [tongueY0, 0],
    [tongueY0, tongueZ0],
    [tongueY1, tongueZ0],
    [tongueY1, 0],
    [cabinetDepth, 0],
    [cabinetDepth, rearZ0],
    [rearY0, rearZ0],
    [rearY0, dividerHeight],
    [frontY0, dividerHeight],
    [frontY0, frontZ0],
    [frontStepY1, frontZ0],
    [frontStepY1, frontStepZ1],
    [frontStepY1 - (T3_DEPTH_MM - 10), frontStepZ1],
    [0, 0]
  ]);
}
function bottomPanel(inputs) {
  const bottomThickness = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  return {
    origin: "left-top-front",
    global_origin: [0, 0, bottomThickness],
    size: [inputs.cabinetWidth, inputs.cabinetDepth, bottomThickness],
    local_bounds: {
      x: [0, inputs.cabinetWidth],
      y: [0, inputs.cabinetDepth],
      z: [-bottomThickness, 0]
    }
  };
}
function dividerFeature(dividerId, centerlineX, inputs) {
  const fgWidth = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  const featureSlotWidth = fgWidth + FEATURE_CLEARANCE_MM;
  const dividerTongueHeight = inputs.dividerTongueHeight ?? fgWidth / 2 - 0.5;
  const bpGrooveDepth = fgWidth / 2;
  const routerDiameter = inputs.routerDiameter ?? DEFAULT_ROUTER_DIAMETER_MM;
  return {
    id: dividerId,
    XDi: centerlineX,
    bp_groove: bpGroove(
      dividerId,
      centerlineX,
      inputs.cabinetDepth,
      featureSlotWidth,
      bpGrooveDepth,
      inputs.cabinetWidth
    ),
    screw_holes: screwHolePositions(centerlineX, inputs.cabinetDepth),
    divider_tongue: {
      length_y: dividerTongueLength(inputs.cabinetDepth, routerDiameter),
      y: dividerTongueYRange(inputs.cabinetDepth, routerDiameter),
      z: [-dividerTongueHeight, 0]
    },
    t3_notch: t3Notch(dividerId, centerlineX, featureSlotWidth, inputs.cabinetWidth),
    t4_notch: t4Notch(dividerId, centerlineX, featureSlotWidth, inputs.cabinetWidth)
  };
}
function normalizeStyle(style) {
  return style === "style_2" ? "style_2" : "style_1";
}
function resolveZones(inputs) {
  if (Array.isArray(inputs.zones) && inputs.zones.length > 0) {
    let x = 0;
    return inputs.zones.map((zone, index) => {
      const width = Number(zone.width) || 0;
      const out = {
        id: zone.id || `zone-${index + 1}`,
        type: zone.type || "up_flap",
        width,
        x0: x,
        x1: x + width
      };
      x += width;
      return out;
    });
  }
  const centers = inputs.internalDividerCenterlines ?? [];
  const boundaries = [0, ...centers, inputs.cabinetWidth];
  return boundaries.slice(0, -1).map((x0, index) => ({
    id: `zone-${index + 1}`,
    type: index % 2 === 0 ? "up_flap" : "fixed_panel",
    width: boundaries[index + 1] - x0,
    x0,
    x1: boundaries[index + 1]
  }));
}
function frontPanels(inputs, zones, centers) {
  const fgWidth = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  const clearance = inputs.clearance ?? 2.5;
  const fpThickness = inputs.frontPanelThickness ?? 16;
  const topClearanceHeight = inputs.topClearanceHeight ?? T1_HEIGHT_MM;
  const functionZoneHeight = (inputs.cabinetHeight ?? topClearanceHeight) - topClearanceHeight;
  const halfClearance = clearance / 2;
  return zones.map((zone, index) => {
    if (zone.type === "open") return null;
    const openingX0 = centers[index] + fgWidth / 2;
    const openingX1 = centers[index + 1] - fgWidth / 2;
    const leftClearance = zone.x0 <= 0 ? clearance : halfClearance;
    const rightClearance = zone.x1 >= inputs.cabinetWidth ? clearance : halfClearance;
    const x0 = zone.x0 + leftClearance;
    const x1 = zone.x1 - rightClearance;
    const z0 = -30;
    const z1 = functionZoneHeight - 1;
    return {
      id: `FP${index}`,
      zoneId: zone.id,
      zoneIndex: index,
      type: zone.type,
      x: [x0, x1],
      y: [-fpThickness, 0],
      z: [z0, z1],
      width: x1 - x0,
      height: z1 - z0,
      thickness: fpThickness,
      clearance,
      opening: {
        x: [openingX0, openingX1],
        width: openingX1 - openingX0
      }
    };
  }).filter((panel) => panel !== null);
}
function hingeHoles(panels, inputs) {
  const holeDiameter = inputs.hingeHoleDiameter ?? 35;
  const holeDepth = inputs.hingeHoleDepth ?? 12;
  const holeFromTop = inputs.hingeHoleFromTop ?? 22.5;
  const holeFromSide = inputs.hingeHoleFromSide ?? 100;
  return panels.filter((panel) => panel.type === "up_flap" || panel.type === "rangehood_flap").flatMap((panel) => {
    const z = panel.height - holeFromTop;
    return [holeFromSide, panel.width - holeFromSide].map((x, index) => ({
      id: `${panel.id}_HINGE_${index + 1}`,
      boardId: panel.id,
      center: [x, z],
      diameter: holeDiameter,
      depth: holeDepth,
      axis: "Y",
      purpose: "hinge",
      face: "back"
    }));
  });
}
function buildLegacyGeometry(inputs, centers) {
  const fgWidth = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  const featureSlotWidth = fgWidth + FEATURE_CLEARANCE_MM;
  const routerDiameter = inputs.routerDiameter ?? DEFAULT_ROUTER_DIAMETER_MM;
  const style = normalizeStyle(inputs.style);
  const topClearanceHeight = inputs.topClearanceHeight ?? T1_HEIGHT_MM;
  const frontPanelThickness = inputs.frontPanelThickness ?? 16;
  const dntgH = inputs.dividerTongueHeight ?? fgWidth / 2 - 0.5;
  const zones = resolveZones(inputs);
  const panels = frontPanels(inputs, zones, centers);
  const dividerIds = centers.map((_, index) => `D${index}`);
  return {
    cabinet: {
      Cw: inputs.cabinetWidth,
      Cd: inputs.cabinetDepth,
      Ch: inputs.cabinetHeight ?? null
    },
    manufacturing: {
      Crd: routerDiameter,
      Crr: routerDiameter / 2,
      FGw: fgWidth,
      FGh: fgWidth / 2,
      FPt: frontPanelThickness,
      TCH: topClearanceHeight,
      FZH: (inputs.cabinetHeight ?? topClearanceHeight) - topClearanceHeight,
      FitClearance: FEATURE_CLEARANCE_MM,
      FeatureSlotWidth: featureSlotWidth,
      Dntg_h: dntgH,
      style
    },
    bottom_panel: bottomPanel(inputs),
    divider_features: dividerIds.map(
      (dividerId, index) => dividerFeature(dividerId, centers[index], inputs)
    ),
    front_panels: panels,
    hinge_holes: hingeHoles(panels, inputs),
    panel_screw_holes: {
      T2: panelScrewHoles("T2", centers, topClearanceHeight / 2),
      T3: panelScrewHoles("T3", centers, T3_DEPTH_MM / 2),
      T4: panelScrewHoles(
        "T4",
        centers,
        T4_NOTCH_HEIGHT_MM + T4_SCREW_HOLE_NOTCH_CLEARANCE_MM + T4_SCREW_HOLE_UP_SHIFT_MM
      )
    },
    trimmed_vectors: {
      T3: t3TrimmedOutlinePoints(
        inputs.cabinetWidth,
        centers.map((centerlineX) => clampRange(featureXRange(centerlineX, featureSlotWidth), 0, inputs.cabinetWidth))
      ),
      T4: t4TrimmedOutlinePoints(
        inputs.cabinetWidth,
        centers.map((centerlineX) => clampRange(featureXRange(centerlineX, featureSlotWidth), 0, inputs.cabinetWidth))
      ),
      DividerSide: dividerSideTrimmedOutlinePoints(
        inputs.cabinetDepth,
        inputs.cabinetHeight,
        fgWidth,
        dntgH,
        routerDiameter,
        featureSlotWidth,
        topClearanceHeight,
        style,
        frontPanelThickness
      )
    }
  };
}
function calculateOverheadGeometry(inputs) {
  const fgWidth = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  const zones = resolveZones(inputs);
  const internalCenters = Array.isArray(inputs.zones) && inputs.zones.length > 0 ? zones.slice(0, -1).map((zone) => zone.x1) : inputs.internalDividerCenterlines ?? [];
  const centers = dividerCenterlines(inputs.cabinetWidth, internalCenters, fgWidth);
  return buildLegacyGeometry(inputs, centers);
}
function calculateOverheadGeometryFromXds(cabinetWidth, cabinetDepth, cabinetHeight, xds, bottomThickness = BOTTOM_THICKNESS_MM, dividerTongueHeight = DIVIDER_TONGUE_HEIGHT_MM, routerDiameter = DEFAULT_ROUTER_DIAMETER_MM, featureWidth = DIVIDER_THICKNESS_MM) {
  const inputs = {
    cabinetWidth,
    cabinetDepth,
    cabinetHeight,
    bottomThickness,
    dividerTongueHeight,
    routerDiameter,
    featureWidth,
    internalDividerCenterlines: xds.slice(1, -1)
  };
  return buildLegacyGeometry(inputs, xds);
}
function calculateOverheadGeometryFromInternalXds(cabinetWidth, cabinetDepth, cabinetHeight, internalXds, bottomThickness = BOTTOM_THICKNESS_MM, dividerTongueHeight, routerDiameter = DEFAULT_ROUTER_DIAMETER_MM, featureWidth = DIVIDER_THICKNESS_MM) {
  const resolvedTongueHeight = dividerTongueHeight ?? featureWidth / 2 - 0.5;
  const [leftXd, rightXd] = edgeDividerCenterlines(cabinetWidth, featureWidth);
  return calculateOverheadGeometryFromXds(
    cabinetWidth,
    cabinetDepth,
    cabinetHeight,
    [leftXd, ...internalXds, rightXd],
    bottomThickness,
    resolvedTongueHeight,
    routerDiameter,
    featureWidth
  );
}
function testCase001Geometry() {
  return calculateOverheadGeometryFromInternalXds(
    500,
    300,
    null,
    [125, 250, 375],
    BOTTOM_THICKNESS_MM,
    void 0,
    10,
    16
  );
}

// generators/overheadCabinet/svgPreview.ts
function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmt(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}
function panelFill(type) {
  if (type === "rangehood_flap") return "#f3e8ff";
  if (type === "fixed_panel") return "#eef8ea";
  if (type === "open") return "#fff7dc";
  return "#e5f2ff";
}
function generateOHCSvgPreview(geometry, options = {}) {
  const width = options.width ?? 760;
  const height = options.height ?? 390;
  const showDimensions = options.showDimensions ?? true;
  const selectedZoneIndex = options.selectedZoneIndex ?? -1;
  const cw = geometry.cabinet.Cw;
  const ch = geometry.cabinet.Ch ?? geometry.manufacturing.TCH;
  const fg = geometry.manufacturing.FGw;
  const fpThickness = geometry.manufacturing.FPt;
  const tch = geometry.manufacturing.TCH;
  const fzh = geometry.manufacturing.FZH;
  const clearance = geometry.front_panels[0]?.clearance ?? 0;
  const padLeft = 46;
  const padTop = 36;
  const scale = Math.min((width - padLeft - 30) / Math.max(cw, 1), (height - padTop - 96) / Math.max(ch, 1));
  const ox = padLeft;
  const oy = padTop;
  const bodyW = cw * scale;
  const bodyH = ch * scale;
  const toX = (x) => ox + x * scale;
  const toY = (z) => oy + (ch - z) * scale;
  const rectFromXZ = (x0, z0, x1, z1) => ({
    x: toX(x0),
    y: toY(z1),
    w: Math.max((x1 - x0) * scale, 1),
    h: Math.max((z1 - z0) * scale, 1)
  });
  const dividerRects = geometry.divider_features.map((feature, index) => {
    const x0 = feature.XDi - fg / 2;
    const x1 = feature.XDi + fg / 2;
    const clampedX0 = Math.max(0, x0);
    const clampedX1 = Math.min(cw, x1);
    const r = rectFromXZ(clampedX0, 0, clampedX1, ch);
    const isEdge = index === 0 || index === geometry.divider_features.length - 1;
    const centerX = toX(feature.XDi);
    const labelY = oy + bodyH + 56 + index % 2 * 14;
    return `
      <rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.w)}" height="${fmt(r.h)}" fill="rgba(92,75,55,0.45)" stroke="#6e5a42"></rect>
      ${isEdge ? `<text x="${fmt(centerX)}" y="${fmt(oy - 11)}" text-anchor="middle" fill="#6e5a42" font-size="10">edge divider</text>` : `
        <line x1="${fmt(centerX)}" y1="${fmt(oy - 8)}" x2="${fmt(centerX)}" y2="${fmt(oy + bodyH + 12)}" stroke="#e5484d" stroke-dasharray="5 4"></line>
        <text x="${fmt(centerX)}" y="${fmt(oy - 11)}" text-anchor="middle" fill="#e5484d" font-size="10">drag boundary</text>`}
      ${showDimensions ? `
        <line x1="${fmt(r.x)}" y1="${fmt(labelY)}" x2="${fmt(r.x + r.w)}" y2="${fmt(labelY)}" stroke="#6e5a42"></line>
        <line x1="${fmt(r.x)}" y1="${fmt(labelY - 4)}" x2="${fmt(r.x)}" y2="${fmt(labelY + 4)}" stroke="#6e5a42"></line>
        <line x1="${fmt(r.x + r.w)}" y1="${fmt(labelY - 4)}" x2="${fmt(r.x + r.w)}" y2="${fmt(labelY + 4)}" stroke="#6e5a42"></line>
        <text x="${fmt(r.x + r.w / 2)}" y="${fmt(labelY - 4)}" text-anchor="middle" fill="#6e5a42" font-size="10">D${index} ${fmt(fg)} mm</text>` : ""}
    `;
  }).join("");
  const openingRects = geometry.front_panels.map((panel) => {
    const opening = rectFromXZ(panel.opening.x[0], 0, panel.opening.x[1], fzh);
    const selected = panel.zoneIndex === selectedZoneIndex;
    const dimensionY = oy + bodyH + 20 + panel.zoneIndex % 2 * 15;
    return `
      <rect x="${fmt(opening.x)}" y="${fmt(opening.y)}" width="${fmt(opening.w)}" height="${fmt(opening.h)}" fill="${panelFill(panel.type)}" stroke="${selected ? "#0f6bff" : "#9db6d5"}" stroke-width="${selected ? 2 : 1}"></rect>
      ${showDimensions ? `
        <line x1="${fmt(opening.x)}" y1="${fmt(dimensionY)}" x2="${fmt(opening.x + opening.w)}" y2="${fmt(dimensionY)}" stroke="#0f6bff"></line>
        <line x1="${fmt(opening.x)}" y1="${fmt(dimensionY - 4)}" x2="${fmt(opening.x)}" y2="${fmt(dimensionY + 4)}" stroke="#0f6bff"></line>
        <line x1="${fmt(opening.x + opening.w)}" y1="${fmt(dimensionY - 4)}" x2="${fmt(opening.x + opening.w)}" y2="${fmt(dimensionY + 4)}" stroke="#0f6bff"></line>
        <text x="${fmt(opening.x + opening.w / 2)}" y="${fmt(dimensionY - 3)}" text-anchor="middle" fill="#0f6bff" font-size="10">opening ${fmt(panel.opening.width)} mm</text>` : ""}
    `;
  }).join("");
  const frontPanelRects = geometry.front_panels.map((panel) => {
    const r = rectFromXZ(panel.x[0], panel.z[0], panel.x[1], panel.z[1]);
    const label = panel.type === "fixed_panel" ? "Fixed Panel" : panel.type === "rangehood_flap" ? "Rangehood Flap" : "Up Flap";
    return `
      <rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.w)}" height="${fmt(r.h)}" fill="none" stroke="#66758a" stroke-width="1.2"></rect>
      <text x="${fmt(r.x + r.w / 2)}" y="${fmt(r.y + r.h / 2 - 4)}" text-anchor="middle" fill="#22344d" font-size="12">${esc(label)}</text>
      <text x="${fmt(r.x + r.w / 2)}" y="${fmt(r.y + r.h / 2 + 13)}" text-anchor="middle" fill="#22344d" font-size="11">${esc(panel.id)}</text>
    `;
  }).join("");
  const hingeHoles2 = geometry.hinge_holes.map((hole) => {
    const panel = geometry.front_panels.find((candidate) => candidate.id === hole.boardId);
    if (!panel) return "";
    const x = panel.x[0] + hole.center[0];
    const z = panel.z[0] + hole.center[1];
    return `<circle cx="${fmt(toX(x))}" cy="${fmt(toY(z))}" r="${fmt(Math.max(hole.diameter / 2 * scale, 4))}" fill="none" stroke="#66758a" stroke-dasharray="4 2"></circle>`;
  }).join("");
  const bp = rectFromXZ(0, 0, cw, fg);
  const topArea = rectFromXZ(0, ch - tch, cw, ch);
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="OHC front elevation geometry preview">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#f8fbff"></rect>
      ${showDimensions ? `
        <line x1="${fmt(ox)}" y1="${fmt(oy - 14)}" x2="${fmt(ox + bodyW)}" y2="${fmt(oy - 14)}" stroke="#222"></line>
        <text x="${fmt(ox + bodyW / 2)}" y="${fmt(oy - 18)}" text-anchor="middle" fill="#222" font-size="11">${fmt(cw)}</text>
        <line x1="${fmt(ox - 14)}" y1="${fmt(oy)}" x2="${fmt(ox - 14)}" y2="${fmt(oy + bodyH)}" stroke="#222"></line>
        <text x="${fmt(ox - 20)}" y="${fmt(oy + bodyH / 2)}" text-anchor="middle" fill="#222" font-size="11" transform="rotate(-90 ${fmt(ox - 20)} ${fmt(oy + bodyH / 2)})">${fmt(ch)}</text>` : ""}
      <rect x="${fmt(ox)}" y="${fmt(oy)}" width="${fmt(bodyW)}" height="${fmt(bodyH)}" fill="#f4f0e6" stroke="#5c4b37" stroke-width="2"></rect>
      <rect x="${fmt(topArea.x)}" y="${fmt(topArea.y)}" width="${fmt(topArea.w)}" height="${fmt(topArea.h)}" fill="rgba(15,107,255,0.06)" stroke="#85b5ff" stroke-dasharray="5 3"></rect>
      <text x="${fmt(topArea.x + topArea.w - 6)}" y="${fmt(topArea.y + 14)}" text-anchor="end" fill="#0b57d0" font-size="10">T1/T2 / TCH ${fmt(tch)}</text>
      ${openingRects}
      ${frontPanelRects}
      <rect x="${fmt(bp.x)}" y="${fmt(bp.y)}" width="${fmt(bp.w)}" height="${fmt(bp.h)}" fill="#c7b9a2" stroke="#6e5a42"></rect>
      <text x="${fmt(bp.x + 6)}" y="${fmt(bp.y - 4)}" fill="#6e5a42" font-size="10">BP ${fmt(fg)} mm</text>
      ${dividerRects}
      ${hingeHoles2}
      <text x="${fmt(ox + 4)}" y="${fmt(oy + bodyH + 18)}" fill="#6d7a8d" font-size="11">FGw ${fmt(fg)} mm, FPt/T1 ${fmt(fpThickness)} mm, clearance ${fmt(clearance)} mm</text>
    </svg>`;
}

// generators/overheadCabinet/relationshipDeclarations.ts
var OVERHEAD_RELATIONSHIP_DECLARATIONS = [
  {
    declarationId: "oh_bp_d0_back_to_divider",
    generator: "overhead",
    panelAId: "BP",
    panelBId: "D0",
    relationshipType: "structural_butt_joint",
    geometryType: "edge_to_surface",
    hostPanelId: "BP",
    targetPanelId: "D0",
    ruleId: "overhead_back_divider_v1",
    allowedHardware: ["screw_hole"]
  },
  {
    declarationId: "oh_bp_fp0_back_to_front",
    generator: "overhead",
    panelAId: "BP",
    panelBId: "FP0",
    relationshipType: "structural_butt_joint",
    geometryType: "edge_to_surface",
    hostPanelId: "BP",
    targetPanelId: "FP0",
    ruleId: "overhead_back_front_v1",
    allowedHardware: ["screw_hole"]
  },
  {
    declarationId: "oh_d0_fp0_divider_to_front",
    generator: "overhead",
    panelAId: "D0",
    panelBId: "FP0",
    relationshipType: "structural_butt_joint",
    geometryType: "edge_to_surface",
    hostPanelId: "D0",
    targetPanelId: "FP0",
    ruleId: "overhead_divider_front_v1",
    allowedHardware: ["screw_hole"]
  },
  {
    declarationId: "oh_t1_t2_top_rail_stack",
    generator: "overhead",
    panelAId: "T1",
    panelBId: "T2",
    relationshipType: "face_contact",
    geometryType: "surface_to_surface",
    hostPanelId: "T1",
    targetPanelId: "T2",
    ruleId: "overhead_top_rail_stack_v1",
    allowedHardware: []
  }
];
function relationshipDeclarationsForBoards(boards) {
  const boardIds = new Set(boards.map((board) => board.id));
  return OVERHEAD_RELATIONSHIP_DECLARATIONS.filter((item) => {
    const required = /* @__PURE__ */ new Set([item.panelAId, item.panelBId, item.hostPanelId, item.targetPanelId]);
    for (const boardId of required) {
      if (!boardIds.has(boardId)) {
        return false;
      }
    }
    return true;
  });
}

// generators/overheadCabinet/generator.ts
var LED_GROOVE_WIDTH = 14.5;
var LED_GROOVE_DEPTH = 6.5;
var LED_GROOVE_FRONT_LAND_MM = 18;
var LED_GROOVE_FRONT_OFFSET = LED_GROOVE_FRONT_LAND_MM + LED_GROOVE_WIDTH / 2;
var LED_GROOVE_BRANCH_END_INSET = 80;
var T3_LED_BOARD_DEPTH_FALLBACK = 90;
var RANGEHOOD_PRESET_NCE = "NCE";
var RANGEHOOD_CUTOUT_WIDTH_MM = 555;
var RANGEHOOD_CUTOUT_DEPTH_MM = 285;
var RANGEHOOD_MIN_EDGE_MM = 40;
var RANGEHOOD_DEFAULT_CLEAR_HEIGHT_MM = 75;
function toInputs(params) {
  return {
    cabinetWidth: Number(params.cabinetWidth),
    cabinetDepth: Number(params.cabinetDepth),
    cabinetHeight: params.cabinetHeight,
    style: params.style,
    topClearanceHeight: params.topClearanceHeight ?? 40,
    frontPanelThickness: params.frontPanelThickness ?? 16,
    clearance: params.clearance ?? 2.5,
    hingeHoleDiameter: params.hingeHoleDiameter ?? 35,
    hingeHoleDepth: params.hingeHoleDepth ?? 12,
    hingeHoleFromTop: params.hingeHoleFromTop ?? 22.5,
    hingeHoleFromSide: params.hingeHoleFromSide ?? 100,
    bottomThickness: params.featureWidth ?? params.bottomThickness ?? DIVIDER_THICKNESS_MM,
    dividerTongueHeight: params.dividerTongueHeight ?? (params.featureWidth ?? DIVIDER_THICKNESS_MM) / 2 - 0.5,
    routerDiameter: params.routerDiameter ?? DEFAULT_ROUTER_DIAMETER_MM,
    featureWidth: params.featureWidth ?? DIVIDER_THICKNESS_MM,
    internalDividerCenterlines: Array.isArray(params.internalDividerCenterlines) ? params.internalDividerCenterlines.map(Number) : [],
    zones: params.zones
  };
}
function resolvedZones(params) {
  const zones = Array.isArray(params.zones) ? params.zones : [];
  let x = 0;
  return zones.map((zone, index) => {
    const width = Number(zone.width) || 0;
    const resolved = {
      id: String(zone.id || `zone-${index + 1}`),
      type: String(zone.type || "up_flap"),
      width,
      x0: x,
      x1: x + width
    };
    x += width;
    return resolved;
  });
}
function resolveRangehoodGroup(params, geometry, validation) {
  const zones = resolvedZones(params);
  const indices = zones.map((zone, index) => zone.type === "rangehood_flap" ? index : -1).filter((index) => index >= 0);
  if (indices.length === 0) return null;
  const firstZoneIndex = indices[0];
  const lastZoneIndex = indices[indices.length - 1];
  if (indices.some((index, offset) => index !== firstZoneIndex + offset)) {
    validation.errors.push("Only one contiguous rangehood group is allowed per overhead cabinet.");
    return null;
  }
  const preset = String(params.rangehoodPreset || RANGEHOOD_PRESET_NCE).toUpperCase();
  if (preset !== RANGEHOOD_PRESET_NCE) {
    validation.errors.push(`Unsupported rangehood preset: ${preset}.`);
  }
  const alignmentRaw = String(params.rangehoodAlignment || "left").toLowerCase();
  if (alignmentRaw !== "left" && alignmentRaw !== "right") {
    validation.errors.push("rangehoodAlignment must be left or right.");
  }
  const alignment = alignmentRaw === "right" ? "right" : "left";
  const edgeOffsetX = Number(params.rangehoodEdgeOffsetX ?? RANGEHOOD_MIN_EDGE_MM);
  const clearHeight = Number(params.rangehoodClearHeight ?? RANGEHOOD_DEFAULT_CLEAR_HEIGHT_MM);
  const cpt = geometry.manufacturing.FGw;
  const leftDivider = geometry.divider_features[firstZoneIndex];
  const rightDivider = geometry.divider_features[lastZoneIndex + 1];
  if (!leftDivider || !rightDivider) {
    validation.errors.push("Rangehood group boundary dividers could not be resolved.");
    return null;
  }
  const x0 = leftDivider.XDi + cpt / 2;
  const x1 = rightDivider.XDi - cpt / 2;
  const clearWidth = x1 - x0;
  if (!Number.isFinite(clearHeight) || clearHeight <= 0) {
    validation.errors.push("rangehoodClearHeight must be a positive number.");
  }
  if (!Number.isFinite(edgeOffsetX) || edgeOffsetX < RANGEHOOD_MIN_EDGE_MM) {
    validation.errors.push(`NCE rangehood edge offset must be at least ${RANGEHOOD_MIN_EDGE_MM} mm.`);
  }
  if (geometry.cabinet.Cd < RANGEHOOD_CUTOUT_DEPTH_MM + RANGEHOOD_MIN_EDGE_MM * 2) {
    validation.errors.push(
      `NCE rangehood requires BP depth >= ${RANGEHOOD_CUTOUT_DEPTH_MM + RANGEHOOD_MIN_EDGE_MM * 2} mm.`
    );
  }
  if (clearWidth < RANGEHOOD_CUTOUT_WIDTH_MM + RANGEHOOD_MIN_EDGE_MM * 2) {
    validation.errors.push(
      `NCE rangehood requires clear width between outer D inner faces >= ${RANGEHOOD_CUTOUT_WIDTH_MM + RANGEHOOD_MIN_EDGE_MM * 2} mm.`
    );
  }
  if (Number.isFinite(edgeOffsetX) && clearWidth - RANGEHOOD_CUTOUT_WIDTH_MM - edgeOffsetX < RANGEHOOD_MIN_EDGE_MM) {
    validation.errors.push("NCE rangehood cutout must leave at least 40 mm on the opposite X side.");
  }
  const cabinetHeight = Number(geometry.cabinet.Ch ?? 0);
  const functionalTop = cabinetHeight - geometry.manufacturing.TCH;
  if (3 * cpt + clearHeight > functionalTop) {
    validation.errors.push("Rangehood insert collides with the overhead top-clearance structure.");
  }
  return {
    firstZoneIndex,
    lastZoneIndex,
    leftDividerIndex: firstZoneIndex,
    rightDividerIndex: lastZoneIndex + 1,
    internalDividerIndices: Array.from(
      { length: Math.max(0, lastZoneIndex - firstZoneIndex) },
      (_, offset) => firstZoneIndex + offset + 1
    ),
    x0,
    x1,
    clearWidth,
    clearHeight,
    alignment,
    edgeOffsetX
  };
}
function rangehoodTopProfile(clearWidth, cabinetDepth, tongueProjection) {
  const y0 = cabinetDepth / 3 + 5;
  const y1 = cabinetDepth * 2 / 3 - 5;
  const rightMain = tongueProjection + clearWidth;
  const total = rightMain + tongueProjection;
  return [
    { x: tongueProjection, y: 0 },
    { x: rightMain, y: 0 },
    { x: rightMain, y: y0 },
    { x: total, y: y0 },
    { x: total, y: y1 },
    { x: rightMain, y: y1 },
    { x: rightMain, y: cabinetDepth },
    { x: tongueProjection, y: cabinetDepth },
    { x: tongueProjection, y: y1 },
    { x: 0, y: y1 },
    { x: 0, y: y0 },
    { x: tongueProjection, y: y0 },
    { x: tongueProjection, y: 0 }
  ];
}
function internalRangehoodDividerProfile(inputs, clearHeight) {
  const cpt = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  const effectiveCabinetHeight = (inputs.cabinetHeight ?? 0) - cpt - clearHeight;
  return dividerSideTrimmedOutlinePoints(
    inputs.cabinetDepth,
    effectiveCabinetHeight,
    cpt,
    inputs.dividerTongueHeight,
    inputs.routerDiameter,
    cpt + 1,
    inputs.topClearanceHeight,
    inputs.style === "style_2" ? "style_2" : "style_1",
    inputs.frontPanelThickness
  );
}
var OVERHEAD_BOARD_FRAME = "final";
function legacyToBoards(geometry, inputs, rangehood = null) {
  const { cabinetWidth, cabinetDepth, cabinetHeight, bottomThickness, featureWidth, topClearanceHeight, frontPanelThickness, clearance } = {
    cabinetWidth: inputs.cabinetWidth,
    cabinetDepth: inputs.cabinetDepth,
    cabinetHeight: inputs.cabinetHeight,
    bottomThickness: inputs.featureWidth ?? DIVIDER_THICKNESS_MM,
    featureWidth: inputs.featureWidth ?? DIVIDER_THICKNESS_MM,
    topClearanceHeight: inputs.topClearanceHeight ?? 40,
    frontPanelThickness: inputs.frontPanelThickness ?? 16,
    clearance: inputs.clearance ?? 2.5
  };
  const height = cabinetHeight ?? topClearanceHeight;
  const topRailY0 = topClearanceHeight - 1;
  const boards = [
    {
      id: "BP",
      name: "Bottom Panel",
      category: "panel",
      boardType: "BP",
      materialThickness: bottomThickness,
      profilePlane: "XY",
      thicknessAxis: "Z",
      x0: 0,
      x1: cabinetWidth,
      y0: 0,
      y1: cabinetDepth,
      z0: 0,
      z1: bottomThickness,
      source: "overhead_geometry"
    }
  ];
  boards.push({
    id: "T1",
    name: "Top Front Rail T1",
    category: "rail",
    boardType: "T1",
    materialThickness: frontPanelThickness,
    profilePlane: "XZ",
    thicknessAxis: "Y",
    x0: 0,
    x1: cabinetWidth,
    y0: topRailY0,
    y1: topRailY0 + frontPanelThickness,
    z0: height - topClearanceHeight,
    z1: height,
    source: "overhead_geometry_v7"
  });
  boards.push({
    id: "T2",
    name: "Top Front Rail T2",
    category: "rail",
    boardType: "T2",
    materialThickness: featureWidth,
    profilePlane: "XZ",
    thicknessAxis: "Y",
    x0: 0,
    x1: cabinetWidth,
    y0: topRailY0 + frontPanelThickness,
    y1: topRailY0 + frontPanelThickness + featureWidth,
    z0: height - topClearanceHeight,
    z1: height,
    source: "overhead_geometry_v7"
  });
  if (geometry.trimmed_vectors.T3.length > 0) {
    const t3Depth = Math.max(...geometry.trimmed_vectors.T3.map(([, y]) => y));
    const t3Top = height - topClearanceHeight - 1;
    boards.push({
      id: "T3",
      name: "Top Rear Panel",
      category: "panel",
      boardType: "T3",
      materialThickness: featureWidth,
      profilePlane: "XY",
      thicknessAxis: "Z",
      x0: 0,
      x1: cabinetWidth,
      y0: 0,
      y1: t3Depth,
      z0: t3Top - featureWidth,
      z1: t3Top,
      source: "overhead_geometry",
      profileVector: geometry.trimmed_vectors.T3.map(([x, y]) => ({ x, y }))
    });
  }
  if (geometry.trimmed_vectors.T4.length > 0) {
    const t4Height = Math.max(...geometry.trimmed_vectors.T4.map(([, z]) => z));
    const t4Y1 = cabinetDepth - featureWidth - clearance;
    boards.push({
      id: "T4",
      name: "Top Front Panel",
      category: "panel",
      boardType: "T4",
      materialThickness: featureWidth,
      profilePlane: "XZ",
      thicknessAxis: "Y",
      x0: 0,
      x1: cabinetWidth,
      y0: t4Y1 - featureWidth,
      y1: t4Y1,
      z0: height - t4Height,
      z1: height,
      source: "overhead_geometry",
      profileVector: geometry.trimmed_vectors.T4.map(([x, z]) => ({ x, z }))
    });
  }
  for (let dividerIndex = 0; dividerIndex < geometry.divider_features.length; dividerIndex += 1) {
    const feature = geometry.divider_features[dividerIndex];
    const [x0, x1] = clampRange(boardXRange(feature.XDi, featureWidth), 0, cabinetWidth);
    const isInternalRangehoodDivider = Boolean(rangehood?.internalDividerIndices.includes(dividerIndex));
    const dividerZ0 = isInternalRangehoodDivider ? featureWidth * 2 + (rangehood?.clearHeight ?? 0) : featureWidth;
    const dividerTopZ = cabinetHeight ?? bottomThickness + 1;
    const dividerProfile = isInternalRangehoodDivider ? internalRangehoodDividerProfile(inputs, rangehood?.clearHeight ?? 0) : geometry.trimmed_vectors.DividerSide;
    boards.push({
      id: feature.id,
      name: `Divider ${feature.id}`,
      category: "divider",
      boardType: "divider",
      materialThickness: featureWidth,
      profilePlane: "YZ",
      thicknessAxis: "X",
      x0,
      x1,
      y0: 0,
      y1: cabinetDepth,
      z0: dividerZ0,
      z1: dividerTopZ,
      source: "overhead_geometry",
      cutProfileVector: dividerProfile.length > 0 ? dividerProfile.map(([y, z]) => ({ y, z })) : void 0,
      profileFeatures: [
        ...isInternalRangehoodDivider ? [] : [feature.bp_groove],
        feature.divider_tongue,
        feature.t3_notch,
        feature.t4_notch
      ],
      notes: isInternalRangehoodDivider ? ["Rangehood internal divider starts on RGHD_TOP; BP groove suppressed."] : void 0
    });
  }
  if (rangehood) {
    const tongueProjection = featureWidth / 2 - 0.5;
    const bpTopZ = featureWidth;
    const topBottomZ = bpTopZ + rangehood.clearHeight;
    const topX0 = rangehood.x0 - tongueProjection;
    const topX1 = rangehood.x1 + tongueProjection;
    boards.push({
      id: "RGHD_TOP",
      name: "Rangehood Top",
      category: "rangehood",
      boardType: "RGHD_TOP",
      materialThickness: featureWidth,
      profilePlane: "XY",
      thicknessAxis: "Z",
      x0: topX0,
      x1: topX1,
      y0: 0,
      y1: cabinetDepth,
      z0: topBottomZ,
      z1: topBottomZ + featureWidth,
      source: "overhead_rangehood",
      profileVector: rangehoodTopProfile(rangehood.clearWidth, cabinetDepth, tongueProjection),
      notes: ["NCE rangehood top with side tongues."]
    });
    boards.push({
      id: "RGHD_FRONT",
      name: "Rangehood Front",
      category: "rangehood",
      boardType: "RGHD_FRONT",
      materialThickness: featureWidth,
      profilePlane: "XZ",
      thicknessAxis: "Y",
      x0: rangehood.x0,
      x1: rangehood.x1,
      y0: 0,
      y1: featureWidth,
      z0: bpTopZ,
      z1: topBottomZ,
      source: "overhead_rangehood"
    });
    boards.push({
      id: "RGHD_BACK",
      name: "Rangehood Back",
      category: "rangehood",
      boardType: "RGHD_BACK",
      materialThickness: featureWidth,
      profilePlane: "XZ",
      thicknessAxis: "Y",
      x0: rangehood.x0,
      x1: rangehood.x1,
      y0: cabinetDepth - featureWidth,
      y1: cabinetDepth,
      z0: bpTopZ,
      z1: topBottomZ,
      source: "overhead_rangehood"
    });
  }
  for (const panel of geometry.front_panels) {
    boards.push({
      id: panel.id,
      name: `Front Panel ${panel.zoneIndex + 1}`,
      category: "front_panel",
      boardType: panel.type,
      materialThickness: panel.thickness,
      profilePlane: "XZ",
      thicknessAxis: "Y",
      x0: panel.x[0],
      x1: panel.x[1],
      y0: panel.y[0],
      y1: panel.y[1],
      z0: panel.z[0],
      z1: panel.z[1],
      source: "overhead_geometry_v7",
      profileVector: [
        { x: 0, z: 0 },
        { x: panel.width, z: 0 },
        { x: panel.width, z: panel.height },
        { x: 0, z: panel.height },
        { x: 0, z: 0 }
      ]
    });
  }
  return boards;
}
function generateRangehoodFeatures(geometry, rangehood) {
  if (!rangehood) return [];
  const cpt = geometry.manufacturing.FGw;
  const depth = geometry.cabinet.Cd;
  const bpTopZ = cpt;
  const grooveZ0 = bpTopZ + rangehood.clearHeight;
  const grooveY = [depth / 3, depth * 2 / 3];
  const cutoutY0 = (depth - RANGEHOOD_CUTOUT_DEPTH_MM) / 2;
  const cutoutX0 = rangehood.alignment === "left" ? rangehood.x0 + rangehood.edgeOffsetX : rangehood.x1 - rangehood.edgeOffsetX - RANGEHOOD_CUTOUT_WIDTH_MM;
  const cutoutX1 = cutoutX0 + RANGEHOOD_CUTOUT_WIDTH_MM;
  const features = [
    {
      id: "RGHD_GROUP",
      type: "rangehood_group",
      preset: RANGEHOOD_PRESET_NCE,
      firstZoneIndex: rangehood.firstZoneIndex,
      lastZoneIndex: rangehood.lastZoneIndex,
      clearWidth: rangehood.clearWidth,
      clearHeight: rangehood.clearHeight,
      alignment: rangehood.alignment,
      edgeOffsetX: rangehood.edgeOffsetX,
      boundaryDividerIds: [
        `D${rangehood.leftDividerIndex}`,
        `D${rangehood.rightDividerIndex}`
      ],
      internalDividerIds: rangehood.internalDividerIndices.map((index) => `D${index}`)
    },
    {
      id: "BP_NCE_RANGEHOOD_CUTOUT",
      type: "rangehood_bp_cutout",
      targetBoardId: "BP",
      preset: RANGEHOOD_PRESET_NCE,
      through: true,
      shape: "rectangle",
      x: [cutoutX0, cutoutX1],
      y: [cutoutY0, cutoutY0 + RANGEHOOD_CUTOUT_DEPTH_MM],
      width: RANGEHOOD_CUTOUT_WIDTH_MM,
      depth: RANGEHOOD_CUTOUT_DEPTH_MM,
      alignment: rangehood.alignment,
      edgeOffsetX: rangehood.edgeOffsetX
    },
    {
      id: `RGHD_D${rangehood.leftDividerIndex}_SIDE_GROOVE`,
      type: "rangehood_divider_side_groove",
      targetBoardId: `D${rangehood.leftDividerIndex}`,
      face: "+X",
      y: grooveY,
      z: [grooveZ0, grooveZ0 + cpt + 1],
      depth: cpt / 2,
      widthY: depth / 3
    },
    {
      id: `RGHD_D${rangehood.rightDividerIndex}_SIDE_GROOVE`,
      type: "rangehood_divider_side_groove",
      targetBoardId: `D${rangehood.rightDividerIndex}`,
      face: "-X",
      y: grooveY,
      z: [grooveZ0, grooveZ0 + cpt + 1],
      depth: cpt / 2,
      widthY: depth / 3
    }
  ];
  for (const dividerIndex of rangehood.internalDividerIndices) {
    const divider = geometry.divider_features[dividerIndex];
    if (!divider) continue;
    features.push({
      id: `RGHD_TOP_D${dividerIndex}_GROOVE`,
      type: "rangehood_top_divider_groove",
      targetBoardId: "RGHD_TOP",
      dividerBoardId: `D${dividerIndex}`,
      face: "top",
      x: [divider.XDi - (cpt + 1) / 2, divider.XDi + (cpt + 1) / 2],
      y: grooveY,
      depth: cpt / 2
    });
  }
  return features;
}
function buildInsertBoardLedGroovePath(boardWidth, boardDepth, boardId, warnings, frontOffset = LED_GROOVE_FRONT_OFFSET) {
  const halfWidth = LED_GROOVE_WIDTH / 2;
  if (boardWidth <= LED_GROOVE_BRANCH_END_INSET * 2 + LED_GROOVE_WIDTH) {
    warnings.push(
      `${boardId} LED groove skipped: board width ${boardWidth.toFixed(1)} too narrow for 80 mm end insets.`
    );
    return null;
  }
  const mainYCenter = frontOffset;
  const main = {
    x0: 0,
    x1: boardWidth,
    y0: mainYCenter - halfWidth,
    y1: mainYCenter + halfWidth
  };
  if (main.y0 < -1e-6 || main.y1 > boardDepth + 1e-6) {
    warnings.push(
      `${boardId} LED groove skipped: main channel y=${main.y0.toFixed(2)}..${main.y1.toFixed(2)} leaves board depth ${boardDepth.toFixed(1)} (frontOffset=${frontOffset}).`
    );
    return null;
  }
  const branchY0 = main.y1;
  const branchY1 = boardDepth;
  const branchLength = branchY1 - branchY0;
  if (branchLength <= 1e-6) {
    warnings.push(
      `${boardId} LED groove T-branches skipped: no remaining depth behind main channel (y=${branchY0.toFixed(2)}).`
    );
    return null;
  }
  const branchCenters = [
    LED_GROOVE_BRANCH_END_INSET,
    boardWidth - LED_GROOVE_BRANCH_END_INSET
  ];
  const branches = branchCenters.map((centerX) => ({
    x0: centerX - halfWidth,
    x1: centerX + halfWidth,
    y0: branchY0,
    y1: branchY1
  }));
  return { main, branches, branchLength };
}
function t3LedBoardExtents(board) {
  const width = board.x1 - board.x0;
  const profileYs = (board.profileVector || []).map((point) => Number(point.y)).filter((value) => Number.isFinite(value));
  if (profileYs.length >= 2) {
    return { width, depth: Math.max(...profileYs) - Math.min(...profileYs) };
  }
  return {
    width,
    depth: Math.min(T3_LED_BOARD_DEPTH_FALLBACK, Math.max(0, board.y1 - board.y0))
  };
}
function generateT3LedGrooveFeatures(boards, warnings, params) {
  if (params.ledGroove === false) return [];
  const t3 = boards.find((board) => board.id === "T3" && board.boardType === "T3");
  if (!t3) {
    warnings.push("T3 LED groove skipped: T3 board missing.");
    return [];
  }
  const frontOffset = LED_GROOVE_FRONT_OFFSET;
  const { width, depth } = t3LedBoardExtents(t3);
  const path = buildInsertBoardLedGroovePath(width, depth, "T3", warnings);
  if (!path) return [];
  t3.notes = [
    ...(t3.notes ?? []).filter((note) => !note.toLowerCase().includes("led groove")),
    `T3 LED groove path on top face (${LED_GROOVE_FRONT_LAND_MM} mm front land)`
  ];
  return [
    {
      id: "T3_led_groove",
      type: "t3_groove",
      targetBoardId: "T3",
      face: "top",
      width: LED_GROOVE_WIDTH,
      depth: LED_GROOVE_DEPTH,
      frontOffset,
      frontLand: LED_GROOVE_FRONT_LAND_MM,
      branchCount: path.branches.length,
      branchLength: path.branchLength,
      branchWidth: LED_GROOVE_WIDTH,
      branchEndInset: LED_GROOVE_BRANCH_END_INSET,
      main: path.main,
      branches: path.branches,
      source: "T3",
      notes: [
        "T3 LED groove on top face (opens upward)",
        `Main channel along X, ${LED_GROOVE_FRONT_LAND_MM} mm land from T3 front then ${LED_GROOVE_WIDTH} mm groove (centerline ${frontOffset} mm)`,
        "Two rear T-branches parallel to Y, extend to T3 back edge, centers inset 80 mm from each X end"
      ]
    }
  ];
}
function resolveCarcassColor(params) {
  const raw = String(params.carcassColor || params.carcassColorName || "white_stipple").trim();
  const tag = raw.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "white_stipple";
  const name = String(params.carcassColorName || (tag === "white_stipple" ? "White Stipple" : raw)).trim() || "White Stipple";
  return { carcassColor: tag, carcassColorName: name };
}
function generateOverheadCabinet(rawParams) {
  const inputs = toInputs(rawParams);
  const carcassColor = resolveCarcassColor(rawParams);
  const validation = { errors: [], warnings: [] };
  if (!Number.isFinite(inputs.cabinetWidth) || inputs.cabinetWidth <= 0) {
    validation.errors.push("cabinetWidth must be a positive number.");
  }
  if (!Number.isFinite(inputs.cabinetDepth) || inputs.cabinetDepth <= 0) {
    validation.errors.push("cabinetDepth must be a positive number.");
  }
  if (inputs.cabinetHeight != null && (!Number.isFinite(inputs.cabinetHeight) || inputs.cabinetHeight <= 0)) {
    validation.errors.push("cabinetHeight must be a positive number when provided.");
  }
  const geometry = validation.errors.length === 0 ? calculateOverheadGeometry(inputs) : null;
  const rangehood = geometry ? resolveRangehoodGroup(rawParams, geometry, validation) : null;
  const centerlines = geometry ? geometry.divider_features.map((f) => f.XDi) : [];
  if (validation.errors.length > 0) {
    return {
      params: {
        cabinetWidth: inputs.cabinetWidth,
        cabinetDepth: inputs.cabinetDepth,
        cabinetHeight: inputs.cabinetHeight ?? 0,
        style: inputs.style ?? "style_1",
        topClearanceHeight: inputs.topClearanceHeight ?? 40,
        frontPanelThickness: inputs.frontPanelThickness ?? 16,
        clearance: inputs.clearance ?? 2.5,
        hingeHoleDiameter: inputs.hingeHoleDiameter ?? 35,
        hingeHoleDepth: inputs.hingeHoleDepth ?? 12,
        hingeHoleFromTop: inputs.hingeHoleFromTop ?? 22.5,
        hingeHoleFromSide: inputs.hingeHoleFromSide ?? 100,
        bottomThickness: inputs.featureWidth ?? DIVIDER_THICKNESS_MM,
        dividerTongueHeight: inputs.dividerTongueHeight ?? (inputs.featureWidth ?? DIVIDER_THICKNESS_MM) / 2 - 0.5,
        routerDiameter: inputs.routerDiameter ?? DEFAULT_ROUTER_DIAMETER_MM,
        featureWidth: inputs.featureWidth ?? DIVIDER_THICKNESS_MM,
        internalDividerCenterlines: inputs.internalDividerCenterlines ?? [],
        rangehoodPreset: String(rawParams.rangehoodPreset || RANGEHOOD_PRESET_NCE),
        rangehoodClearHeight: Number(rawParams.rangehoodClearHeight ?? RANGEHOOD_DEFAULT_CLEAR_HEIGHT_MM),
        rangehoodAlignment: String(rawParams.rangehoodAlignment || "left"),
        rangehoodEdgeOffsetX: Number(rawParams.rangehoodEdgeOffsetX ?? RANGEHOOD_MIN_EDGE_MM),
        ...carcassColor
      },
      boards: [],
      features: [],
      relationshipDeclarations: [],
      validation,
      debug: {
        phase: "geometry_v1",
        boardFrame: OVERHEAD_BOARD_FRAME,
        legacyReference: "fusion360-cabinet-generator/core/overhead_geometry.py",
        dividerCenterlines: centerlines
      }
    };
  }
  if (!geometry) {
    throw new Error("Overhead geometry was not resolved after validation.");
  }
  const boards = legacyToBoards(geometry, inputs, rangehood);
  const relationshipDeclarations = relationshipDeclarationsForBoards(boards);
  const ledFeatures = generateT3LedGrooveFeatures(boards, validation.warnings, rawParams);
  const rangehoodFeatures = generateRangehoodFeatures(geometry, rangehood);
  const dividerFeatures = geometry.divider_features.map((feature, index) => {
    if (!rangehood?.internalDividerIndices.includes(index)) return feature;
    return { ...feature, bp_groove: void 0 };
  });
  return {
    params: {
      cabinetWidth: inputs.cabinetWidth,
      cabinetDepth: inputs.cabinetDepth,
      cabinetHeight: inputs.cabinetHeight ?? 0,
      style: inputs.style ?? "style_1",
      topClearanceHeight: inputs.topClearanceHeight ?? 40,
      frontPanelThickness: inputs.frontPanelThickness ?? 16,
      clearance: inputs.clearance ?? 2.5,
      hingeHoleDiameter: inputs.hingeHoleDiameter ?? 35,
      hingeHoleDepth: inputs.hingeHoleDepth ?? 12,
      hingeHoleFromTop: inputs.hingeHoleFromTop ?? 22.5,
      hingeHoleFromSide: inputs.hingeHoleFromSide ?? 100,
      bottomThickness: inputs.featureWidth ?? DIVIDER_THICKNESS_MM,
      dividerTongueHeight: inputs.dividerTongueHeight ?? (inputs.featureWidth ?? DIVIDER_THICKNESS_MM) / 2 - 0.5,
      routerDiameter: inputs.routerDiameter ?? DEFAULT_ROUTER_DIAMETER_MM,
      featureWidth: inputs.featureWidth ?? DIVIDER_THICKNESS_MM,
      internalDividerCenterlines: inputs.internalDividerCenterlines ?? [],
      rangehoodPreset: String(rawParams.rangehoodPreset || RANGEHOOD_PRESET_NCE),
      rangehoodClearHeight: Number(rawParams.rangehoodClearHeight ?? RANGEHOOD_DEFAULT_CLEAR_HEIGHT_MM),
      rangehoodAlignment: String(rawParams.rangehoodAlignment || "left"),
      rangehoodEdgeOffsetX: Number(rawParams.rangehoodEdgeOffsetX ?? RANGEHOOD_MIN_EDGE_MM),
      ...carcassColor
    },
    boards,
    features: [
      ...dividerFeatures,
      ...geometry.front_panels,
      ...geometry.hinge_holes,
      ...rangehoodFeatures,
      ...ledFeatures
    ],
    relationshipDeclarations,
    validation,
    debug: {
      phase: "geometry_v1",
      boardFrame: OVERHEAD_BOARD_FRAME,
      legacyReference: "fusion360-cabinet-generator/core/overhead_geometry.py",
      dividerCenterlines: centerlines,
      legacyGeometry: geometry,
      svgPreview: generateOHCSvgPreview(geometry, {
        selectedZoneIndex: Number(rawParams.selectedZoneIndex ?? -1)
      })
    }
  };
}
export {
  BOTTOM_THICKNESS_MM,
  DEFAULT_ROUTER_DIAMETER_MM,
  DIVIDER_THICKNESS_MM,
  DIVIDER_TONGUE_HEIGHT_MM,
  FEATURE_CLEARANCE_MM,
  FEATURE_GROOVE_WIDTH_MM,
  FRONT_TOP_NOTCH_Y_OFFSET_MM,
  FRONT_TOP_STEP_DROP_MM,
  FRONT_TOP_STEP_Y_MM,
  OVERHEAD_BOARD_FRAME,
  REAR_TOP_NOTCH_HEIGHT_MM,
  SCREW_HOLE_DEPTH_MM,
  SCREW_HOLE_DIAMETER_MM,
  T1_HEIGHT_MM,
  T3_DEPTH_MM,
  T3_NOTCH_DEPTH_MM,
  T3_THICKNESS_MM,
  T4_HEIGHT_MM,
  T4_NOTCH_HEIGHT_MM,
  T4_SCREW_HOLE_NOTCH_CLEARANCE_MM,
  T4_SCREW_HOLE_UP_SHIFT_MM,
  T4_THICKNESS_MM,
  boardXRange,
  bpGroove,
  bpGrooveLength,
  bpGrooveYRange,
  calculateOverheadGeometry,
  calculateOverheadGeometryFromInternalXds,
  calculateOverheadGeometryFromXds,
  clampRange,
  dividerCenterlines,
  dividerSideTrimmedOutlinePoints,
  dividerTongueLength,
  dividerTongueYRange,
  edgeDividerCenterlines,
  featureXRange,
  generateOHCSvgPreview,
  generateOverheadCabinet,
  panelScrewHoles,
  screwHolePositions,
  t3Notch,
  t3NotchYRange,
  t3TrimmedOutlinePoints,
  t4Notch,
  t4NotchZRange,
  t4TrimmedOutlinePoints,
  testCase001Geometry
};
