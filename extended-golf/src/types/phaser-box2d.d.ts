declare module 'phaser-box2d' {
	export class b2Vec2 {
		x: number;
		y: number;
		constructor(x?: number, y?: number);
		copy(v: b2Vec2): this;
		clone(): b2Vec2;
	}

	export class b2Rot {
		c: number;
		s: number;
		constructor(c?: number, s?: number);
		copy(r: b2Rot): this;
		clone(): b2Rot;
	}

	export enum b2BodyType {
		b2_staticBody = 0,
		b2_kinematicBody = 1,
		b2_dynamicBody = 2,
	}

	export function b2CreateWorldArray(): void;
	export function b2DefaultWorldDef(): any;
	export function b2CreateWorld(def: any): any;
	export function b2DestroyWorld(worldId: any): void;

	export function b2DefaultBodyDef(): any;
	export function b2CreateBody(worldId: any, def: any): any;
	export function b2DestroyBody(bodyId: any): void;

	export function b2DefaultShapeDef(): any;
	export function b2CreateCircleShape(bodyId: any, def: any, circle: any): any;
	export function b2CreatePolygonShape(bodyId: any, def: any, polygon: any): any;

	export function b2DefaultChainDef(): any;
	export function b2CreateChain(bodyId: any, def: any): any;

	export function b2MakeOffsetBox(hx: number, hy: number, center: b2Vec2, angle: number): any;

	export function b2Body_GetPosition(bodyId: any): b2Vec2;
	export function b2Body_GetLinearVelocity(bodyId: any): b2Vec2;
	export function b2Body_SetLinearVelocity(bodyId: any, velocity: b2Vec2): void;
	export function b2Body_SetAngularVelocity(bodyId: any, angularVelocity: number): void;
	export function b2Body_SetTransform(bodyId: any, position: b2Vec2, rotation: b2Rot | { c: number, s: number }): void;
	export function b2Body_SetGravityScale(bodyId: any, gravityScale: number): void;
	export function b2Body_SetLinearDamping(bodyId: any, linearDamping: number): void;
	export function b2Body_GetRotation(bodyId: any): b2Rot;

	export function b2Rot_GetAngle(rot: b2Rot): number;

	export function b2World_GetContactEvents(worldId: any): any;
	export function b2World_GetSensorEvents(worldId: any): any;

	export function b2Shape_GetUserData(shapeId: any): any;

	export function WorldStep(data: {
		worldId: any;
		deltaTime: number;
		fixedTimeStep: number;
		subStepCount: number;
	}): void;
}
