import './styles/prompt.css'
import './styles/index.css'

//custom xrextras
import {XRExtras} from './myxrextras/xrextras.js'
window.XRExtras = XRExtras

import {chromaKeyComponent} from './chromakey'
AFRAME.registerComponent('chromakey-video', chromaKeyComponent)

import './color-match-plane.js'

// custom ios motion sensor prompt content
let inDom = false
const observer = new MutationObserver(() => {
  if (document.querySelector('.prompt-box-8w')) {
    if (!inDom) {
      document.querySelector('.prompt-box-8w p').innerHTML = 'augmented reality requires access to device motion sensors'
      document.querySelector('.prompt-button-8w').innerHTML = 'cancel'
      document.querySelector('.button-primary-8w').innerHTML = 'continue'
    }
    inDom = true
  } else if (inDom) {
    inDom = false
    observer.disconnect()
  }
})

observer.observe(document.body, {childList: true})

// load image targets
const onxrloaded = () => {
  XR8.XrController.configure({
    imageTargetData: [
      require('../image-targets/sticker1.json'),
      require('../image-targets/sticker2.json'),
    ],
  })
}
window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)