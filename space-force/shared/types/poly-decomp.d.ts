declare module "poly-decomp" {
  type Point = [number, number];
  type Polygon = Point[];

  interface PolyDecompModule {
    makeCCW(polygon: Polygon): boolean;
    removeCollinearPoints(polygon: Polygon, threshold?: number): number;
    removeDuplicatePoints(polygon: Polygon, threshold?: number): number;
    quickDecomp(
      polygon: Polygon,
      result?: Polygon[],
      reflexVertices?: Point[],
      steinerPoints?: Point[],
      delta?: number,
      maxlevel?: number,
      level?: number,
    ): Polygon[];
    decomp(polygon: Polygon): Polygon[];
    isSimple(polygon: Polygon): boolean;
  }

  const polyDecomp: PolyDecompModule;
  export default polyDecomp;
}
