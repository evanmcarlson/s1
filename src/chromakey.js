import {ChromaKeyMaterial} from './chromakey-material'
import {install as installColorSampler, sampleDarkestInRegion, isReady} from './camera-color-sampler'

const chromaKeyComponent = {
  schema: {
    'src': {type: 'string'},
    'color': {type: 'color', default: '#19ae31'},
    'width': {default: 1920},
    'height': {default: 1080},
    'similarity': {default: 0.159},
    'smoothness': {default: 0.082},
    'spill': {default: 0.214},
    'lumaKey': {default: false},
    // Regrades the video's black point live to match the physical marker's real (camera-observed)
    // black, instead of the source video's literal (often too-vivid) black. Each frame, samples
    // the darkest pixel found in the tracked image's footprint on the raw camera feed (not the
    // composited AR scene) and feeds it into the shader as matchedBlack.
    'matchBlack': {type: 'boolean', default: false},
    'blackSampleInset': {default: 0.08}, // fraction inward from tracked corners for the scan region
    'blackSmoothing': {default: 0.12}, // EMA factor per frame, higher = snappier
    'maxDimension': {default: 160}, // CameraPixelArray downsample size
  },
  init() {
    const {
      src, color, width, height, similarity, smoothness, spill, lumaKey, matchBlack,
    } = this.data
    if (src === '') {
      console.error('No video src')
    }

    this.material = new ChromaKeyMaterial(
      src, color, width, height, similarity, smoothness, spill, lumaKey, matchBlack
    )
    this.el.getObject3D('mesh').material = this.material

    if (!matchBlack) {
      return
    }

    installColorSampler({maxDimension: this.data.maxDimension})

    this.active = false
    this.baseSize = 1
    this.blackColor = [0, 0, 0]
    this.corner = new THREE.Vector3()
    this.camera = null

    this.onGeometry = ({detail}) => {
      if (detail.type !== 'FLAT') {
        return
      }
      this.baseSize = Math.max(detail.scaledWidth, detail.scaledHeight)
    }
    this.onFound = () => { this.active = true }
    this.onLost = () => { this.active = false }

    this.el.parentNode.addEventListener('xrextrasimagegeometry', this.onGeometry)
    this.el.parentNode.addEventListener('xrextrasfound', this.onFound)
    this.el.parentNode.addEventListener('xrextraslost', this.onLost)
  },

  tick() {
    if (!this.data.matchBlack || !this.active || !isReady()) {
      return
    }

    this.camera = this.camera || this.el.sceneEl.camera
    const canvas = this.el.sceneEl.renderer && this.el.sceneEl.renderer.domElement
    if (!this.camera || !canvas || !canvas.width || !canvas.height) {
      return
    }
    const canvasAspect = canvas.height / canvas.width

    const inset = this.data.blackSampleInset
    const h = (this.baseSize / 2) * (1 - inset)
    const ndcCorners = [[-h, h], [h, h], [-h, -h], [h, -h]].map(([x, y]) => {
      this.corner.set(x, y, 0)
      this.el.object3D.localToWorld(this.corner)
      return this.corner.clone().project(this.camera).toArray()
    })

    const sample = sampleDarkestInRegion(ndcCorners, canvasAspect)
    if (!sample) {
      return
    }

    const c = this.blackColor
    const s = this.data.blackSmoothing
    c[0] += (sample[0] - c[0]) * s
    c[1] += (sample[1] - c[1]) * s
    c[2] += (sample[2] - c[2]) * s
    this.material.uniforms.matchedBlack.value.setRGB(c[0], c[1], c[2])
  },

  remove() {
    if (this.onGeometry) {
      this.el.parentNode.removeEventListener('xrextrasimagegeometry', this.onGeometry)
      this.el.parentNode.removeEventListener('xrextrasfound', this.onFound)
      this.el.parentNode.removeEventListener('xrextraslost', this.onLost)
    }
    this.material.dispose()
  },
}
export {chromaKeyComponent}
