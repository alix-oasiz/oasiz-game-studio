declare module 'phaser-box2d' {
  export const STATIC: number;
  export const DYNAMIC: number;
  export const KINEMATIC: number;

  export class b2Vec2 {
    x: number;
    y: number;
    constructor(x: number, y: number);
  }

  export function b2DefaultWorldDef(): any;
  export function b2DefaultBodyDef(): any;
  export function b2DefaultShapeDef(): any;

  export function SetWorldScale(scale: number): void;
  export function GetWorldScale(): number;
  export function pxm(pixels: number): number;
  export function mpx(meters: number): number;
  export function pxmVec2(x: number, y: number): b2Vec2;

  export interface WorldResult { worldId: any; }
  export function CreateWorld(data: { worldDef?: any }): WorldResult;
  export function WorldStep(data: { worldId: any; deltaTime: number; subStepCount?: number }): void;

  export interface BodyResult { bodyId: any; shapeId?: any; }
  export function CreateCircle(data: {
    worldId: any; type?: number; bodyDef?: any; position?: b2Vec2;
    radius?: number; density?: number; friction?: number; restitution?: number;
    groupIndex?: number; categoryBits?: number; maskBits?: number;
  }): BodyResult;

  export function CreatePolygon(data: {
    worldId: any; type?: number; bodyDef?: any; position?: b2Vec2;
    vertices: b2Vec2[]; density?: number; friction?: number; restitution?: number;
  }): BodyResult | null;

  export function CreateBoxPolygon(data: {
    worldId: any; type?: number; bodyDef?: any; position?: b2Vec2;
    size?: b2Vec2 | number; friction?: number; restitution?: number; density?: number;
  }): BodyResult;

  export function b2Body_GetPosition(bodyId: any): b2Vec2;
  export function b2Body_GetLinearVelocity(bodyId: any): b2Vec2;
  export function b2Body_SetLinearVelocity(bodyId: any, velocity: b2Vec2): void;
  export function b2Body_ApplyForceToCenter(bodyId: any, force: b2Vec2, wake: boolean): void;
  export function b2Body_ApplyForce(bodyId: any, force: b2Vec2, point: b2Vec2, wake: boolean): void;
  export function b2Body_GetAngle(bodyId: any): number;
  export function b2DestroyWorld(worldId: any): void;
}
