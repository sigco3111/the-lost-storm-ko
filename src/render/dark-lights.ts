import { ShaderChunk } from 'three';

export const DIRECT_CALL: string = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
export const GUARDED_CALL: string = `if ( directLight.visible ) ${DIRECT_CALL}`;

export function skipDarkLights(chunk: string): string {
  if (chunk.includes(GUARDED_CALL)) return chunk;
  if (!chunk.includes(DIRECT_CALL)) throw new Error('The lights chunk has no direct light call to guard; dark lights cannot be skipped');
  return chunk.split(DIRECT_CALL).join(GUARDED_CALL);
}

export function installDarkLightSkip(): void {
  ShaderChunk.lights_fragment_begin = skipDarkLights(ShaderChunk.lights_fragment_begin);
}
