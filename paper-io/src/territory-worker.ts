import polygonClipping from "polygon-clipping";
import type { PolygonBooleanGeom } from "./polygon-ops.ts";

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

self.onmessage = (event: MessageEvent<RequestMessage>) => {
  const message = event.data;

  try {
    switch (message.type) {
      case "difference": {
        const result = polygonClipping.difference(
          message.subject,
          message.clip,
        );
        const response: ResponseMessage = {
          id: message.id,
          ok: true,
          result,
        };
        self.postMessage(response);
        break;
      }
    }
  } catch (error) {
    const response: ResponseMessage = {
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
