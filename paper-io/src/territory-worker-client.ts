import type { PolygonBooleanGeom } from "./polygon-ops.ts";

type PendingRequest = {
  resolve: (value: PolygonBooleanGeom) => void;
  reject: (error: unknown) => void;
};

type RequestMessage = {
  id: number;
  type: "difference";
  subject: PolygonBooleanGeom;
  clip: PolygonBooleanGeom;
};

type ResponseMessage =
  | {
      id: number;
      ok: true;
      result: PolygonBooleanGeom;
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

export class TerritoryWorkerClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();

  constructor() {
    this.worker = new Worker(
      new URL("./territory-worker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    this.worker.addEventListener(
      "message",
      (event: MessageEvent<ResponseMessage>) => {
        const message = event.data;
        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id);
        if (message.ok) request.resolve(message.result);
        else request.reject(new Error(message.error));
      },
    );
  }

  difference(
    subject: PolygonBooleanGeom,
    clip: PolygonBooleanGeom,
  ): Promise<PolygonBooleanGeom> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      const message: RequestMessage = {
        id,
        type: "difference",
        subject,
        clip,
      };
      this.worker.postMessage(message);
    });
  }

  dispose(): void {
    this.worker.terminate();
    for (const request of this.pending.values()) {
      request.reject(new Error("Territory worker disposed"));
    }
    this.pending.clear();
  }
}
