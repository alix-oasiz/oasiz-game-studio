export interface Point {
    x: number;
    y: number;
}

function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag === 0) {
        return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
    }
    return Math.abs(dx * (lineStart.y - point.y) - (lineStart.x - point.x) * dy) / mag;
}

export function douglasPeucker(points: Point[], epsilon: number): Point[] {
    if (points.length < 3) return points;

    let maxDist = 0;
    let maxIndex = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
        const dist = perpendicularDistance(points[i], points[0], points[end]);
        if (dist > maxDist) {
            maxDist = dist;
            maxIndex = i;
        }
    }

    if (maxDist > epsilon) {
        const left = douglasPeucker(points.slice(0, maxIndex + 1), epsilon);
        const right = douglasPeucker(points.slice(maxIndex), epsilon);
        return [...left.slice(0, -1), ...right];
    }

    return [points[0], points[end]];
}

function angleBetween(a: Point, b: Point, c: Point): number {
    const ax = a.x - b.x;
    const ay = a.y - b.y;
    const cx = c.x - b.x;
    const cy = c.y - b.y;
    const dot = ax * cx + ay * cy;
    const magA = Math.sqrt(ax * ax + ay * ay);
    const magC = Math.sqrt(cx * cx + cy * cy);
    if (magA === 0 || magC === 0) return 180;
    const cos = Math.max(-1, Math.min(1, dot / (magA * magC)));
    return (Math.acos(cos) * 180) / Math.PI;
}

export function countCorners(simplified: Point[], threshold = 110): number {
    let corners = 0;
    for (let i = 1; i < simplified.length - 1; i++) {
        const angle = angleBetween(simplified[i - 1], simplified[i], simplified[i + 1]);
        if (angle < threshold) {
            corners++;
        }
    }
    return corners;
}

export function isClosed(points: Point[]): boolean {
    if (points.length < 3) return false;
    const first = points[0];
    const last = points[points.length - 1];
    const dist = Math.sqrt((last.x - first.x) ** 2 + (last.y - first.y) ** 2);

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    const diagonal = Math.sqrt(w * w + h * h);

    return dist < diagonal * 0.25;
}

export function detectShape(points: Point[]): string {
    if (points.length < 5) return "none";

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const width = maxX - minX;
    const height = maxY - minY;

    if (width < 15 && height < 15) return "none";

    const aspectRatio = width / (height || 1);

    const simplified = douglasPeucker(points, 12);
    const corners = countCorners(simplified, 110);
    const closed = isClosed(points);

    // Circle: closed, near-1 aspect, low corners, low radius variance
    if (closed && corners <= 2 && aspectRatio > 0.6 && aspectRatio < 1.6) {
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        let sum = 0;
        let sumSq = 0;
        for (const p of points) {
            const d = Math.hypot(p.x - cx, p.y - cy);
            sum += d;
            sumSq += d * d;
        }
        const mean = sum / points.length;
        const variance = sumSq / points.length - mean * mean;
        const std = Math.sqrt(Math.max(0, variance));
        if (mean > 8 && std / mean < 0.22) {
            return "Circle";
        }
    }

    // Vertical line
    if (aspectRatio < 0.28 && height > 40 && corners < 2) {
        return "Vertical Line";
    }

    // Horizontal line
    if (corners < 2 && aspectRatio > 3.5 && width > 40) {
        return "Horizontal Line";
    }

    // Slash / Backslash
    if (corners < 2 && width > 35 && height > 35) {
        const start = points[0];
        const end = points[points.length - 1];
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const slope = dy / (dx || 0.0001);
        const slopeAbs = Math.abs(slope);
        if (slopeAbs > 0.6 && slopeAbs < 1.6) {
            return slope < 0 ? "/" : "\\";
        }
    }

    // 3 corners + closed: square vs triangle
    if (corners === 3 && closed) {
        if (aspectRatio > 0.6 && aspectRatio < 1.6) {
            return "Square";
        }
        return "Triangle";
    }

    // Triangle: 2 or 3 corners
    if (corners === 2 || corners === 3) {
        return "Triangle";
    }

    // Square: 3+ corners, mid aspect ratio
    if (corners >= 3 && aspectRatio > 0.4 && aspectRatio < 2.5) {
        return "Square";
    }

    // V: open, two arms down to a point
    if (!closed && corners >= 1 && corners <= 2 && aspectRatio > 0.5 && aspectRatio < 2.2) {
        const cx = (minX + maxX) / 2;
        const hasTopLeft = points.some(p => p.x < cx - width * 0.15 && p.y < minY + height * 0.45);
        const hasTopRight = points.some(p => p.x > cx + width * 0.15 && p.y < minY + height * 0.45);
        const hasBottom = points.some(p => Math.abs(p.x - cx) < width * 0.2 && p.y > minY + height * 0.65);
        if (hasTopLeft && hasTopRight && hasBottom) {
            return "V";
        }
    }

    return "none";
}
