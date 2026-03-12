import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

interface ManifestSkin {
  file: string;
  renderScale?: number;
  slotDefaults?: Record<string, string>;
}

type Manifest = Record<string, ManifestSkin>;

interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

type ValidationMode = "strict" | "warn" | "off";

interface ValidationIssue {
  severity: "error" | "warn";
  message: string;
}

const CANONICAL_SHIP_VISUAL_TRANSFORM =
  "scale(1 0.8) rotate(90) scale(0.35) translate(-0.25 -4.5)";
const REQUIRED_PRIMARY_ROLES = ["hull-main", "wing-left", "wing-right"] as const;
const HARDPOINT_GUIDE_GROUP_ID = "editor-hardpoints";

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null = regex.exec(tag);

  while (match) {
    attrs[match[1]] = match[3] ?? match[4] ?? "";
    match = regex.exec(tag);
  }

  return attrs;
}

function parseViewBox(svg: string, fileName: string): ViewBox {
  const svgTagMatch = svg.match(/<svg\b[^>]*>/i);
  if (!svgTagMatch) {
    throw new Error("[generate-ship-skins] Missing <svg> tag in " + fileName);
  }

  const attrs = parseAttributes(svgTagMatch[0]);
  const rawViewBox = attrs.viewBox;
  if (!rawViewBox) {
    throw new Error("[generate-ship-skins] Missing viewBox in " + fileName);
  }

  const parts = rawViewBox
    .trim()
    .split(/[\s,]+/)
    .map((value) => Number.parseFloat(value));

  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    throw new Error(
      "[generate-ship-skins] Invalid viewBox in " + fileName + ": " + rawViewBox,
    );
  }

  return {
    minX: parts[0],
    minY: parts[1],
    width: parts[2],
    height: parts[3],
  };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizePathData(path: string): string {
  return normalizeWhitespace(path.replace(/,/g, " "));
}

function extractTagById(
  svg: string,
  tagName: string,
  id: string,
): { tag: string; attrs: Record<string, string> } | null {
  const tagRegex = new RegExp("<" + tagName + "\\b[^>]*>", "gi");
  let match: RegExpExecArray | null = tagRegex.exec(svg);
  while (match) {
    const tag = match[0];
    const attrs = parseAttributes(tag);
    if (attrs.id === id) {
      return { tag, attrs };
    }
    match = tagRegex.exec(svg);
  }
  return null;
}

function extractPathById(svg: string, pathId: string, fileName: string): string {
  const pathRegex = /<path\b[^>]*>/gi;
  let match: RegExpExecArray | null = pathRegex.exec(svg);

  while (match) {
    const tag = match[0];
    const attrs = parseAttributes(tag);
    if (attrs.id === pathId) {
      if (!attrs.d || attrs.d.trim().length === 0) {
        throw new Error(
          "[generate-ship-skins] Path #" + pathId + " has no d attribute in " + fileName,
        );
      }
      return attrs.d.trim();
    }
    match = pathRegex.exec(svg);
  }

  throw new Error("[generate-ship-skins] Missing path #" + pathId + " in " + fileName);
}

function parseSvgRootAttributes(svg: string, fileName: string): Record<string, string> {
  const svgTagMatch = svg.match(/<svg\b[^>]*>/i);
  if (!svgTagMatch) {
    throw new Error("[generate-ship-skins] Missing <svg> tag in " + fileName);
  }
  return parseAttributes(svgTagMatch[0]);
}

function resolveValidationMode(): ValidationMode {
  const rawMode = process.env.SHIP_SKIN_VALIDATION?.trim().toLowerCase();
  if (rawMode === "strict" || rawMode === "warn" || rawMode === "off") {
    return rawMode;
  }

  return "strict";
}

function findExternalHrefRefs(svg: string): string[] {
  const refs: string[] = [];
  const hrefRegex = /\b(?:href|xlink:href)\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null = hrefRegex.exec(svg);
  while (match) {
    const value = (match[2] ?? match[3] ?? "").trim();
    if (!value) {
      match = hrefRegex.exec(svg);
      continue;
    }
    if (
      value.startsWith("#") ||
      value.startsWith("data:") ||
      value.startsWith("url(#")
    ) {
      match = hrefRegex.exec(svg);
      continue;
    }
    refs.push(value);
    match = hrefRegex.exec(svg);
  }
  return refs;
}

function stripHardpointGuideLayer(svg: string): string {
  const groupRegex = new RegExp(
    `<g\\b[^>]*\\bid=(["'])${HARDPOINT_GUIDE_GROUP_ID}\\1[^>]*>[\\s\\S]*?<\\/g>`,
    "i",
  );
  const groupMatch = svg.match(groupRegex);
  if (!groupMatch) {
    return svg;
  }
  return svg
    .replace(groupMatch[0], "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectPrimaryFillClasses(svg: string): ReadonlySet<string> {
  const classes = new Set<string>();
  const styleBlockRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let styleBlockMatch: RegExpExecArray | null = styleBlockRegex.exec(svg);

  while (styleBlockMatch) {
    const css = styleBlockMatch[1];
    const classRuleRegex = /\.([a-zA-Z_][\w-]*)\s*\{([\s\S]*?)\}/g;
    let classRuleMatch: RegExpExecArray | null = classRuleRegex.exec(css);
    while (classRuleMatch) {
      const className = classRuleMatch[1];
      const body = classRuleMatch[2];
      if (/\bfill\s*:\s*var\(--slot-primary\b/i.test(body)) {
        classes.add(className);
      }
      classRuleMatch = classRuleRegex.exec(css);
    }
    styleBlockMatch = styleBlockRegex.exec(svg);
  }

  return classes;
}

function collectPrimaryStopClasses(svg: string): ReadonlySet<string> {
  const classes = new Set<string>();
  const styleBlockRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let styleBlockMatch: RegExpExecArray | null = styleBlockRegex.exec(svg);

  while (styleBlockMatch) {
    const css = styleBlockMatch[1];
    const classRuleRegex = /\.([a-zA-Z_][\w-]*)\s*\{([\s\S]*?)\}/g;
    let classRuleMatch: RegExpExecArray | null = classRuleRegex.exec(css);
    while (classRuleMatch) {
      const className = classRuleMatch[1];
      const body = classRuleMatch[2];
      if (/\bstop-color\s*:\s*var\(--slot-primary\b/i.test(body)) {
        classes.add(className);
      }
      classRuleMatch = classRuleRegex.exec(css);
    }
    styleBlockMatch = styleBlockRegex.exec(svg);
  }

  return classes;
}

function extractClassNames(value: string | undefined): string[] {
  return (value ?? "")
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function collectPrimaryGradientIds(
  svg: string,
  primaryStopClasses: ReadonlySet<string>,
): ReadonlySet<string> {
  const ids = new Set<string>();
  const gradientRegex = /<(linearGradient|radialGradient)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let gradientMatch: RegExpExecArray | null = gradientRegex.exec(svg);

  while (gradientMatch) {
    const attrs = parseAttributes("<" + gradientMatch[1] + gradientMatch[2] + ">");
    const gradientId = attrs.id;
    if (!gradientId) {
      gradientMatch = gradientRegex.exec(svg);
      continue;
    }

    const gradientBody = gradientMatch[3];
    const directlyUsesPrimary = /\bvar\(--slot-primary\b/i.test(gradientBody);
    if (directlyUsesPrimary) {
      ids.add(gradientId);
      gradientMatch = gradientRegex.exec(svg);
      continue;
    }

    const classRegex = /\bclass\s*=\s*("([^"]*)"|'([^']*)')/gi;
    let classMatch: RegExpExecArray | null = classRegex.exec(gradientBody);
    let hasPrimaryStopClass = false;
    while (classMatch) {
      const classValue = classMatch[2] ?? classMatch[3] ?? "";
      if (extractClassNames(classValue).some((className) => primaryStopClasses.has(className))) {
        hasPrimaryStopClass = true;
        break;
      }
      classMatch = classRegex.exec(gradientBody);
    }

    if (hasPrimaryStopClass) {
      ids.add(gradientId);
    }

    gradientMatch = gradientRegex.exec(svg);
  }

  return ids;
}

function extractElementsByDataRole(
  svg: string,
  role: string,
): Array<{ tag: string; attrs: Record<string, string> }> {
  const elements: Array<{ tag: string; attrs: Record<string, string> }> = [];
  const tagRegex = /<([a-zA-Z][\w:-]*)\b[^>]*>/g;
  let match: RegExpExecArray | null = tagRegex.exec(svg);
  while (match) {
    const tag = match[0];
    const attrs = parseAttributes(tag);
    if (attrs["data-role"] === role) {
      elements.push({ tag, attrs });
    }
    match = tagRegex.exec(svg);
  }
  return elements;
}

function usesSlotPrimaryFill(
  attrs: Record<string, string>,
  primaryFillClasses: ReadonlySet<string>,
  primaryGradientIds: ReadonlySet<string>,
): boolean {
  if (/\bvar\(--slot-primary\b/i.test(attrs.fill ?? "")) {
    return true;
  }
  const fillGradientMatch = (attrs.fill ?? "").match(/url\(#([^)]+)\)/i);
  if (fillGradientMatch && primaryGradientIds.has(fillGradientMatch[1])) {
    return true;
  }
  if (/\bfill\s*:\s*var\(--slot-primary\b/i.test(attrs.style ?? "")) {
    return true;
  }
  const styleGradientMatch = (attrs.style ?? "").match(/\bfill\s*:\s*url\(#([^)]+)\)/i);
  if (styleGradientMatch && primaryGradientIds.has(styleGradientMatch[1])) {
    return true;
  }

  const classNames = extractClassNames(attrs.class);
  return classNames.some((className) => primaryFillClasses.has(className));
}

function validateShipSkin(
  skinId: string,
  fileName: string,
  svg: string,
  canonicalColliderPath: string,
  validationMode: ValidationMode,
): void {
  if (validationMode === "off") {
    return;
  }

  const issues: ValidationIssue[] = [];
  const rootAttrs = parseSvgRootAttributes(svg, fileName);

  const viewBox = rootAttrs.viewBox;
  if (viewBox !== "-20 -20 40 40") {
    issues.push({
      severity: "error",
      message: "Root viewBox must be exactly \"-20 -20 40 40\"",
    });
  }

  const visualGroup = extractTagById(svg, "g", "visual");
  if (!visualGroup) {
    issues.push({
      severity: "error",
      message: "Missing required <g id=\"visual\"> group",
    });
  } else {
    const rawTransform = visualGroup.attrs.transform ?? "";
    const normalizedTransform = normalizeWhitespace(rawTransform);
    if (normalizedTransform !== CANONICAL_SHIP_VISUAL_TRANSFORM) {
      issues.push({
        severity: "error",
        message:
          "g#visual transform must be \"" + CANONICAL_SHIP_VISUAL_TRANSFORM + "\"",
      });
    }
  }

  let colliderPath = "";
  try {
    colliderPath = extractPathById(svg, "collider", fileName);
  } catch (error) {
    issues.push({
      severity: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  if (
    colliderPath &&
    normalizePathData(colliderPath) !== normalizePathData(canonicalColliderPath)
  ) {
    issues.push({
      severity: "error",
      message: "Collider path must match canonical shared/assets/entities/ship.svg",
    });
  }

  if (!/\brole=(["'])img\1/i.test(svg)) {
    issues.push({
      severity: "warn",
      message: "Missing role=\"img\" on <svg>",
    });
  }
  if (!/\baria-label=(["']).+?\1/i.test(svg)) {
    issues.push({
      severity: "warn",
      message: "Missing aria-label on <svg>",
    });
  }

  const primaryRefs = (svg.match(/var\(--slot-primary\b/gi) ?? []).length;
  const secondaryRefs = (svg.match(/var\(--slot-secondary\b/gi) ?? []).length;
  const strokeRefs = (svg.match(/var\(--slot-stroke\b/gi) ?? []).length;
  const primaryFillClasses = collectPrimaryFillClasses(svg);
  const primaryStopClasses = collectPrimaryStopClasses(svg);
  const primaryGradientIds = collectPrimaryGradientIds(svg, primaryStopClasses);

  if (primaryRefs < 1) {
    issues.push({
      severity: "error",
      message:
        "Missing required slot color usage: expected at least one var(--slot-primary, ...)",
    });
  }
  if (secondaryRefs < 1) {
    issues.push({
      severity: "warn",
      message:
        "Recommended slot color usage missing: var(--slot-secondary, ...)",
    });
  }
  if (strokeRefs < 1) {
    issues.push({
      severity: "warn",
      message: "Recommended slot color usage missing: var(--slot-stroke, ...)",
    });
  }

  for (const role of REQUIRED_PRIMARY_ROLES) {
    const roleElements = extractElementsByDataRole(svg, role);
    if (roleElements.length <= 0) {
      issues.push({
        severity: "error",
        message: "Missing required major-surface role marker: data-role=\"" + role + "\"",
      });
      continue;
    }

    roleElements.forEach((entry, index) => {
      if (!usesSlotPrimaryFill(entry.attrs, primaryFillClasses, primaryGradientIds)) {
        issues.push({
          severity: "error",
          message:
            "Element tagged data-role=\"" +
            role +
            "\" must use var(--slot-primary, ...) fill (entry " +
            (index + 1).toString() +
            ")",
        });
      }
    });
  }

  if (/<script\b/i.test(svg)) {
    issues.push({
      severity: "error",
      message: "Forbidden <script> tag detected",
    });
  }

  const externalRefs = findExternalHrefRefs(svg);
  if (externalRefs.length > 0) {
    issues.push({
      severity: "error",
      message: "External href references are not allowed: " + externalRefs.join(", "),
    });
  }

  const warnPrefix = "[generate-ship-skins] WARN " + skinId + " (" + fileName + "): ";
  for (const issue of issues) {
    if (issue.severity === "warn") {
      console.warn(warnPrefix + issue.message);
    }
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length <= 0) {
    return;
  }

  if (validationMode === "warn") {
    for (const issue of errors) {
      console.warn(
        "[generate-ship-skins] WARN (validation bypassed) " +
          skinId +
          " (" +
          fileName +
          "): " +
          issue.message,
      );
    }
    return;
  }

  const details = errors
    .map((issue, index) => "  " + (index + 1).toString() + ". " + issue.message)
    .join("\n");
  throw new Error(
    "[generate-ship-skins] Validation failed for " +
      skinId +
      " (" +
      fileName +
      "):\n" +
      details,
  );
}

function main(): void {
  const projectRoot = resolve(import.meta.dirname, "..");
  const skinsDir = join(projectRoot, "shared", "assets", "ships", "skins");
  const manifestPath = join(skinsDir, "manifest.json");
  const canonicalShipPath = join(projectRoot, "shared", "assets", "entities", "ship.svg");
  const outPath = join(projectRoot, "shared", "geometry", "generated", "ShipSkinSvgData.ts");
  const validationMode = resolveValidationMode();

  const manifestText = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText) as Manifest;
  const skinIds = Object.keys(manifest);
  if (skinIds.length <= 0) {
    throw new Error("[generate-ship-skins] manifest has no skins");
  }

  if (validationMode !== "strict") {
    console.warn(
      "[generate-ship-skins] Validation mode = " + validationMode + " (strict checks relaxed)",
    );
  }

  const canonicalShipSvg = readFileSync(canonicalShipPath, "utf8");
  const canonicalColliderPath = extractPathById(
    canonicalShipSvg,
    "collider",
    "shared/assets/entities/ship.svg",
  );

  const outEntries: Array<Record<string, unknown>> = [];
  for (const skinId of skinIds) {
    const entry = manifest[skinId];
    const filePath = resolve(skinsDir, entry.file);
    const sourceSvg = readFileSync(filePath, "utf8").replace(/\r\n/g, "\n").trim();
    const svg = stripHardpointGuideLayer(sourceSvg);
    validateShipSkin(
      skinId,
      entry.file,
      svg,
      canonicalColliderPath,
      validationMode,
    );
    const viewBox = parseViewBox(svg, entry.file);

    outEntries.push({
      id: skinId,
      svgTemplate: svg,
      viewBox,
      renderScale: entry.renderScale ?? 1.5,
      slotDefaults: entry.slotDefaults ?? {},
    });
  }

  const header =
    "// AUTO-GENERATED FILE. DO NOT EDIT.\n" +
    "// Source: shared/assets/ships/skins/*.svg + shared/assets/ships/skins/manifest.json\n" +
    "// Run: bun run generate:ship-skins\n\n";

  const body =
    "export interface GeneratedShipSkinSvgData {\n" +
    "  id: string;\n" +
    "  svgTemplate: string;\n" +
    "  viewBox: { minX: number; minY: number; width: number; height: number };\n" +
    "  renderScale: number;\n" +
    "  slotDefaults: Readonly<Record<string, string>>;\n" +
    "}\n\n" +
    "export const GENERATED_SHIP_SKIN_SVG_DATA = " +
    JSON.stringify(outEntries, null, 2) +
    " as const;\n";

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, header + body, "utf8");
  console.log("[generate-ship-skins] Wrote " + outPath);
}

main();
