// @see https://discourse.threejs.org/t/production-ready-green-screen-with-three-js/23113/2

const VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`
const FRAGMENT_SHADER = `
uniform sampler2D tex;
uniform float texWidth;
uniform float texHeight;

uniform vec3 keyColor;
uniform float similarity;
uniform float smoothness;
uniform float spill;
uniform float lumaKey;

// Regrades the source video as a black-to-white ramp, remapping literal black to matchedBlack
// (a color sampled live from the real world) instead of the video's own often too-vivid black.
uniform vec3 matchedBlack;
uniform float matchBlack;

varying vec2 vUv;

// From https://github.com/libretro/glsl-shaders/blob/master/nnedi3/shaders/rgb-to-yuv.glsl
vec2 RGBtoUV(vec3 rgb) {
  return vec2(
    rgb.r * -0.169 + rgb.g * -0.331 + rgb.b *  0.5    + 0.5,
    rgb.r *  0.5   + rgb.g * -0.419 + rgb.b * -0.081  + 0.5
  );
}

float Luma(vec3 rgb) {
  return rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722;
}

vec4 ProcessChromaKey(vec2 texCoord) {
  vec4 rgba = texture2D(tex, texCoord);
  float luma = Luma(rgba.rgb);

  // Grayscale (black & white) footage has no chrominance, so a UV-space
  // distance can't distinguish it from the key color regardless of
  // brightness. For that footage, key on luma (brightness) instead.
  float chromaDist = lumaKey > 0.5
    ? abs(luma - Luma(keyColor))
    : distance(RGBtoUV(rgba.rgb), RGBtoUV(keyColor));

  float baseMask = chromaDist - similarity;
  float fullMask = pow(clamp(baseMask / smoothness, 0., 1.), 1.5);
  rgba.a = fullMask;

  // Fully-opaque pixels would otherwise pass the source video's literal color straight through
  // (spillVal == 1 there), which is where the video's too-vivid black was showing. Regrade the
  // whole ramp so black lands on matchedBlack before spill suppression runs on top of it.
  vec3 sourceColor = matchBlack > 0.5 ? mix(matchedBlack, vec3(1.0), luma) : rgba.rgb;

  float spillVal = pow(clamp(baseMask / spill, 0., 1.), 1.5);
  float desat = clamp(sourceColor.r * 0.2126 + sourceColor.g * 0.7152 + sourceColor.b * 0.0722, 0., 1.);
  rgba.rgb = mix(vec3(desat, desat, desat), sourceColor, spillVal);

  return rgba;
}

void main(void) {
  vec2 texCoord = vUv;
  gl_FragColor = ProcessChromaKey(texCoord);
}
`

export {
  VERTEX_SHADER,
  FRAGMENT_SHADER,
}