import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DEFAULTS = {
	input: "public/assets",
	output: "public/assets-mobile-70x100",
	sourceCardWidth: 161,
	sourceCardHeight: 196,
	targetCardWidth: 70,
	targetCardHeight: 100,
	scaleMode: "xy",
	fit: "fill"
};

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function parseArgs(argv) {
	const options = { ...DEFAULTS };

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		const next = argv[i + 1];

		if (arg === "--input" && next) {
			options.input = next;
			i += 1;
		} else if (arg === "--output" && next) {
			options.output = next;
			i += 1;
		} else if (arg === "--source-card-width" && next) {
			options.sourceCardWidth = Number.parseInt(next, 10);
			i += 1;
		} else if (arg === "--source-card-height" && next) {
			options.sourceCardHeight = Number.parseInt(next, 10);
			i += 1;
		} else if (arg === "--target-card-width" && next) {
			options.targetCardWidth = Number.parseInt(next, 10);
			i += 1;
		} else if (arg === "--target-card-height" && next) {
			options.targetCardHeight = Number.parseInt(next, 10);
			i += 1;
		} else if (arg === "--scale-mode" && next) {
			options.scaleMode = next;
			i += 1;
		} else if (arg === "--fit" && next) {
			options.fit = next;
			i += 1;
		}
	}

	if (!Number.isFinite(options.sourceCardWidth) || options.sourceCardWidth <= 0) {
		throw new Error(`Invalid --source-card-width value: ${options.sourceCardWidth}`);
	}

	if (!Number.isFinite(options.sourceCardHeight) || options.sourceCardHeight <= 0) {
		throw new Error(`Invalid --source-card-height value: ${options.sourceCardHeight}`);
	}

	if (!Number.isFinite(options.targetCardWidth) || options.targetCardWidth <= 0) {
		throw new Error(`Invalid --target-card-width value: ${options.targetCardWidth}`);
	}

	if (!Number.isFinite(options.targetCardHeight) || options.targetCardHeight <= 0) {
		throw new Error(`Invalid --target-card-height value: ${options.targetCardHeight}`);
	}

	if (!["xy", "uniform-width", "uniform-height", "uniform-min", "uniform-max", "uniform-average"].includes(options.scaleMode)) {
		throw new Error(`Invalid --scale-mode value: ${options.scaleMode}`);
	}

	if (!["fill", "contain", "cover", "inside", "outside"].includes(options.fit)) {
		throw new Error(`Invalid --fit value: ${options.fit}`);
	}

	return options;
}

async function collectImages(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectImages(fullPath)));
			continue;
		}

		if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
			files.push(fullPath);
		}
	}

	return files;
}

function getScaleFactors(options) {
	const scaleX = options.targetCardWidth / options.sourceCardWidth;
	const scaleY = options.targetCardHeight / options.sourceCardHeight;

	if (options.scaleMode === "xy") {
		return { scaleX, scaleY };
	}

	let uniformScale = scaleY;
	if (options.scaleMode === "uniform-width") {
		uniformScale = scaleX;
	} else if (options.scaleMode === "uniform-min") {
		uniformScale = Math.min(scaleX, scaleY);
	} else if (options.scaleMode === "uniform-max") {
		uniformScale = Math.max(scaleX, scaleY);
	} else if (options.scaleMode === "uniform-average") {
		uniformScale = (scaleX + scaleY) / 2;
	}

	return { scaleX: uniformScale, scaleY: uniformScale };
}

async function downscaleImage(sourcePath, options) {
	const relativePath = path.relative(options.input, sourcePath);
	const outputPath = path.join(options.output, relativePath);
	await mkdir(path.dirname(outputPath), { recursive: true });

	const metadata = await sharp(sourcePath).metadata();
	const { scaleX, scaleY } = getScaleFactors(options);
	const width = Math.max(1, Math.round((metadata.width ?? 1) * scaleX));
	const height = Math.max(1, Math.round((metadata.height ?? 1) * scaleY));

	await sharp(sourcePath)
		.resize({
			width,
			height,
			fit: options.fit
		})
		.toFile(outputPath);

	console.log(
		`[downscale-assets] ${relativePath} ${metadata.width ?? "?"}x${metadata.height ?? "?"} -> ${width}x${height}`
	);
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const inputDir = path.resolve(process.cwd(), options.input);
	const outputDir = path.resolve(process.cwd(), options.output);
	options.input = inputDir;
	options.output = outputDir;

	const files = await collectImages(inputDir);
	if (files.length === 0) {
		console.log(`[downscale-assets] No images found in ${options.input}`);
		return;
	}

	const { scaleX, scaleY } = getScaleFactors(options);
	console.log(
		`[downscale-assets] Scale mode=${options.scaleMode} x=${scaleX.toFixed(4)} y=${scaleY.toFixed(4)}`
	);

	for (const file of files) {
		await downscaleImage(file, options);
	}

	console.log(`[downscale-assets] Wrote ${files.length} files to ${options.output}`);
}

main().catch((error) => {
	console.error("[downscale-assets] Failed:", error);
	process.exitCode = 1;
});
