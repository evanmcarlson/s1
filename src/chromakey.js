import {ChromaKeyMaterial} from './chromakey-material'

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
  },
  init() {
    const {src, color, width, height, similarity, smoothness, spill, lumaKey} = this.data
    if (src === '') {
      console.error('No video src')
    }

    const greenScreenMaterial = new ChromaKeyMaterial(src, color, width, height, similarity, smoothness, spill, lumaKey)
    this.el.getObject3D('mesh').material = greenScreenMaterial
  },
}
export {chromaKeyComponent}
