import busObjSource from './assets/devilsworkshop-cars/obj/Low_Poly_Vehicles_bus.obj?raw';
import car01ObjSource from './assets/devilsworkshop-cars/obj/Low_Poly_Vehicles_car01.obj?raw';
import car02ObjSource from './assets/devilsworkshop-cars/obj/Low_Poly_Vehicles_car02.obj?raw';
import car03ObjSource from './assets/devilsworkshop-cars/obj/Low_Poly_Vehicles_car03.obj?raw';
import carPoliceObjSource from './assets/devilsworkshop-cars/obj/Low_Poly_Vehicles_carPolice.obj?raw';
import pickupTruck01ObjSource from './assets/devilsworkshop-cars/obj/Low_Poly_Vehicles_pickupTruck01.obj?raw';
import pickupTruck02ObjSource from './assets/devilsworkshop-cars/obj/Low_Poly_Vehicles_pickupTruck02.obj?raw';

import busTextureUrl from './assets/devilsworkshop-cars/textures/bus01.png';
import car01TextureUrl from './assets/devilsworkshop-cars/textures/car01.png';
import car02TextureUrl from './assets/devilsworkshop-cars/textures/car02.png';
import car03TextureUrl from './assets/devilsworkshop-cars/textures/car03.png';
import carPoliceTextureUrl from './assets/devilsworkshop-cars/textures/carPolice.png';
import pickupTruck01TextureUrl from './assets/devilsworkshop-cars/textures/pickupTruck01.png';
import pickupTruck02TextureUrl from './assets/devilsworkshop-cars/textures/pickupTruck02.png';

export const DEVILSWORKSHOP_VEHICLE_FILES = {
  bus: { objSource: busObjSource, textureUrl: busTextureUrl },
  car01: { objSource: car01ObjSource, textureUrl: car01TextureUrl },
  car02: { objSource: car02ObjSource, textureUrl: car02TextureUrl },
  car03: { objSource: car03ObjSource, textureUrl: car03TextureUrl },
  carPolice: { objSource: carPoliceObjSource, textureUrl: carPoliceTextureUrl },
  pickupTruck01: { objSource: pickupTruck01ObjSource, textureUrl: pickupTruck01TextureUrl },
  pickupTruck02: { objSource: pickupTruck02ObjSource, textureUrl: pickupTruck02TextureUrl },
};
