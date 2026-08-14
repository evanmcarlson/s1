/**
 * THREE.JS ShaderMaterial that removes a specified color (e.g. greens screen)
 * from a texture. Shader code by https://github.com/Mugen87 on THREE.js forum:
 * https://discourse.threejs.org/t/production-ready-green-screen-with-three-js/23113/2
 */
// import {ColorRepresentation} from 'three/src/utils';

import {VERTEX_SHADER, FRAGMENT_SHADER} from './shaders'

// eslint-disable-next-line new-cap
class ChromaKeyMaterial extends THREE.ShaderMaterial {
  /**
   *
   * @param {string} url Image or video to load into material's texture
   * @param {ColorRepresentation} keyColor
   * @param {number} width
   * @param {number} height
   * @param {number} similarity
   * @param {number} smoothness
   * @param {number} spill
   * @param {boolean} lumaKey Key on brightness instead of chrominance
   *   (needed for black & white / grayscale footage, which has no color
   *   to key on).
   */
  constructor(
    url, keyColor, width, height, similarity = 0.01, smoothness = 0.18,
    spill = 0.1, lumaKey = false
  ) {
    super()

    this.video = document.querySelector(url)
    this.video.play()

    this.texture = new THREE.VideoTexture(this.video)

    const chromaKeyColor = new THREE.Color(keyColor)

    this.setValues({
      uniforms: {
        tex: {
          value: this.texture,
        },
        keyColor: {value: chromaKeyColor},
        texWidth: {value: width},
        texHeight: {value: height},
        similarity: {value: similarity},
        smoothness: {value: smoothness},
        spill: {value: spill},
        lumaKey: {value: lumaKey ? 1 : 0},

      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
    })
  }
}

export {ChromaKeyMaterial}