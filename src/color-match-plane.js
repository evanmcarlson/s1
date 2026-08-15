import {install as installColorSampler, sampleAtNdc, isReady} from './camera-color-sampler'

// Makes a plane "disappear" by continuously repainting it with colors sampled live from the
// camera feed at its own corners, so it tracks ambient lighting instead of using a fixed color.
//
// Must be a child of <xrextras-named-image-target>. On 'xrextrasimagegeometry' it sizes itself
// to the tracked image's real-world dimensions (see xrextras' xrextras-target-mesh for the same
// pattern), then every frame re-samples the camera feed at its (inset) corners and interpolates
// a soft gradient across the surface, so directional lighting isn't flattened into one color.

const VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAGMENT_SHADER = `
uniform vec3 colorTL;
uniform vec3 colorTR;
uniform vec3 colorBL;
uniform vec3 colorBR;
uniform float feather;
uniform float grain;
uniform float time;
varying vec2 vUv;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec3 top = mix(colorTL, colorTR, vUv.x);
  vec3 bottom = mix(colorBL, colorBR, vUv.x);
  vec3 color = mix(bottom, top, vUv.y);

  color += (rand(gl_FragCoord.xy + time) - 0.5) * grain;

  float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float alpha = feather > 0.0 ? smoothstep(0.0, feather, edge) : 1.0;

  gl_FragColor = vec4(color, alpha);
}
`

const DEFAULT_COLOR = [0.85, 0.85, 0.85]

AFRAME.registerComponent('color-match-plane', {
  schema: {
    // 8th Wall's image target cropping forces the tracked geometry into whatever aspect the
    // crop left it at (e.g. sticker2 is cropped narrower than tall), even for a physically
    // square sticker. We size the plane off the larger of scaledWidth/scaledHeight (the less-
    // cropped, more accurate dimension) so it comes out square, then scale it up so it slightly
    // overhangs the tracked crop, since that crop itself sits close to/inside the QR's black
    // modules on this sticker.
    sizeMultiplier: {type: 'number', default: 1.1}, // plane size vs. the (square-ified) tracked size
    sampleInset: {type: 'number', default: 0}, // fraction inward from each tracked-image corner, independent of sizeMultiplier
    smoothing: {type: 'number', default: 0.2}, // EMA factor per frame, higher = snappier
    feather: {type: 'number', default: 0.06}, // fraction of the plane's edge that fades to alpha 0
    grain: {type: 'number', default: 0.035}, // amplitude of per-pixel noise added to hide flatness
    maxDimension: {type: 'number', default: 160}, // CameraPixelArray downsample size
    debug: {type: 'boolean', default: true},
  },

  init() {
    installColorSampler({maxDimension: this.data.maxDimension})

    this.active = false
    this.geometrySize = {width: 1, height: 1}
    this.baseSize = 1 // tracked-image size before sizeMultiplier; sample points are inset off this
    this.colors = {
      TL: [...DEFAULT_COLOR], TR: [...DEFAULT_COLOR], BL: [...DEFAULT_COLOR], BR: [...DEFAULT_COLOR],
    }

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        colorTL: {value: new THREE.Color(...DEFAULT_COLOR)},
        colorTR: {value: new THREE.Color(...DEFAULT_COLOR)},
        colorBL: {value: new THREE.Color(...DEFAULT_COLOR)},
        colorBR: {value: new THREE.Color(...DEFAULT_COLOR)},
        feather: {value: this.data.feather},
        grain: {value: this.data.grain},
        time: {value: 0},
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      side: THREE.DoubleSide,
    })

    this.onGeometry = ({detail}) => {
      if (detail.type !== 'FLAT') {
        return
      }
      this.baseSize = Math.max(detail.scaledWidth, detail.scaledHeight)
      const size = this.baseSize * this.data.sizeMultiplier
      this.geometrySize = {width: size, height: size}
      this.el.setAttribute('geometry', {primitive: 'plane', width: size, height: size})
    }
    this.onFound = () => { this.active = true }
    this.onLost = () => { this.active = false }

    this.el.parentNode.addEventListener('xrextrasimagegeometry', this.onGeometry)
    this.el.parentNode.addEventListener('xrextrasfound', this.onFound)
    this.el.parentNode.addEventListener('xrextraslost', this.onLost)

    if (this.data.debug) {
      this.debugMarkers = [0, 1, 2, 3].map(() => {
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.01, 8, 8),
          new THREE.MeshBasicMaterial({color: 0xff00ff})
        )
        this.el.object3D.add(marker)
        return marker
      })
    }

    this.corner = new THREE.Vector3()
    this.camera = null
  },

  tick(time) {
    const mesh = this.el.getObject3D('mesh')
    if (!mesh) {
      return
    }
    if (mesh.material !== this.material) {
      mesh.material = this.material
    }
    this.material.uniforms.time.value = time * 0.001

    if (!this.active || !isReady()) {
      return
    }

    this.camera = this.camera || this.el.sceneEl.camera
    const canvas = this.el.sceneEl.renderer && this.el.sceneEl.renderer.domElement
    if (!this.camera || !canvas || !canvas.width || !canvas.height) {
      return
    }
    const canvasAspect = canvas.height / canvas.width

    const inset = this.data.sampleInset
    const hx = (this.baseSize / 2) * (1 - inset)
    const hy = (this.baseSize / 2) * (1 - inset)

    const corners = {
      TL: [-hx, hy], TR: [hx, hy], BL: [-hx, -hy], BR: [hx, -hy],
    }

    Object.keys(corners).forEach((key, i) => {
      const [x, y] = corners[key]
      this.corner.set(x, y, 0)
      this.el.object3D.localToWorld(this.corner)
      const ndc = this.corner.clone().project(this.camera)

      const sample = sampleAtNdc(ndc.x, ndc.y, canvasAspect)
      if (sample) {
        const c = this.colors[key]
        const s = this.data.smoothing
        c[0] += (sample[0] - c[0]) * s
        c[1] += (sample[1] - c[1]) * s
        c[2] += (sample[2] - c[2]) * s
        this.material.uniforms[`color${key}`].value.setRGB(c[0], c[1], c[2])
      }

      if (this.debugMarkers) {
        this.debugMarkers[i].position.set(x, y, 0.001)
        if (sample) {
          this.debugMarkers[i].material.color.setRGB(...sample)
        }
      }
    })
  },

  remove() {
    this.el.parentNode.removeEventListener('xrextrasimagegeometry', this.onGeometry)
    this.el.parentNode.removeEventListener('xrextrasfound', this.onFound)
    this.el.parentNode.removeEventListener('xrextraslost', this.onLost)
    this.material.dispose()
  },
})
