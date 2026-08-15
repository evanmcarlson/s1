// Samples RGB color from the live camera feed (not the composited AR scene) at a given point
// in normalized device coordinates, via 8th Wall's XR8.CameraPixelArray pipeline module.
//
// Coordinate mapping: XR8.CameraPixelArray downsamples the *full, uncropped* camera sensor
// frame (videoWidth x videoHeight), while the on-screen canvas shows a "cover" crop of that
// frame (see xrextras' fullwindowcanvas module, which this mirrors). To turn an NDC point from
// three.js' camera.project() into a grid cell, we invert that same cover-crop math.
//
// NOTE: the cover-crop is assumed to be centered (standard object-fit: cover behavior), and the
// sensor-vs-canvas rotation is inferred by normalizing both to portrait (larger dimension =
// height) the same way fullwindowcanvas does. This has not been verified on-device — use
// `debugSample()` / the `debug` flag on xrextras-color-match-plane to confirm sample points land
// where expected before trusting the sampled colors.

let grid_ = null // {pixels, rows, cols, rowBytes?}
let bytesPerPixel_ = 4 // luminance: false -> RGBA; recomputed from real data once available
let video_ = {w: 0, h: 0}
let installed_ = false
let loggedGrid_ = false

const install = ({maxDimension = 160} = {}) => {
  if (installed_) {
    return
  }
  installed_ = true

  const doInstall = () => {
    XR8.addCameraPipelineModule(
      XR8.CameraPixelArray.pipelineModule({luminance: false, maxDimension})
    )

    XR8.addCameraPipelineModule({
      name: 'camera-color-sampler',
      onCameraStatusChange: ({status, video}) => {
        if (status === 'hasVideo' && video) {
          video_ = {w: video.videoWidth, h: video.videoHeight}
        }
      },
      onVideoSizeChange: ({videoWidth, videoHeight}) => {
        video_ = {w: videoWidth, h: videoHeight}
      },
      // CameraPixelArray does its readback during the GPU phase; its result only becomes
      // readable once the pipeline reaches the CPU phase (see 8thwall/archive's
      // camera-qrcode example, which reads it the same way: `onProcessCpu: ({processGpuResult})`).
      onProcessCpu: ({processGpuResult}) => {
        const cpa = processGpuResult && processGpuResult.camerapixelarray
        if (!cpa || !cpa.pixels || !cpa.rows || !cpa.cols) {
          return
        }
        grid_ = cpa
        bytesPerPixel_ = cpa.rowBytes
          ? cpa.rowBytes / cpa.cols
          : cpa.pixels.length / (cpa.rows * cpa.cols)

        if (!loggedGrid_) {
          loggedGrid_ = true
          console.log('[color-sampler] camerapixelarray ready:', {
            keys: Object.keys(cpa), rows: cpa.rows, cols: cpa.cols,
            rowBytes: cpa.rowBytes, pixelsLength: cpa.pixels.length, bytesPerPixel: bytesPerPixel_,
          })
        }
      },
    })
  }

  window.XR8 ? doInstall() : window.addEventListener('xrloaded', doInstall, {once: true})
}

// Inverts the "cover" crop full-window-canvas-module.ts applies, to map a point in the
// currently-displayed (canvas) frame back into the full raw video frame.
const canvasPointToVideoPoint = (u, v, canvasAspect) => {
  const pvw = Math.min(video_.w, video_.h)
  const pvh = Math.max(video_.w, video_.h)
  const portrait = video_.h >= video_.w

  let ch = pvh
  let cw = Math.round(pvh / canvasAspect)
  if (cw > pvw) {
    cw = pvw
    ch = Math.round(pvw * canvasAspect)
  }

  const cropX = (pvw - cw) / 2
  const cropY = (pvh - ch) / 2

  const px = cropX + u * cw
  const py = cropY + v * ch

  // px/py are in portrait-normalized (pvw x pvh) space; map back to raw video_.w x video_.h.
  return portrait ? {x: px / pvw, y: py / pvh} : {y: px / pvw, x: py / pvh}
}

// ndcX, ndcY: three.js NDC coordinates (-1..1), canvasAspect: canvas.height / canvas.width (i.e.
// tall/portrait canvases have aspect > 1), matching how full-window-canvas-module computes `pa`.
const sampleAtNdc = (ndcX, ndcY, canvasAspect) => {
  if (!grid_ || !video_.w) {
    return null
  }

  const u = ndcX * 0.5 + 0.5
  const v = 1 - (ndcY * 0.5 + 0.5)
  const {x, y} = canvasPointToVideoPoint(u, v, canvasAspect)

  const {pixels, rows, cols} = grid_
  const rowBytes = grid_.rowBytes || (cols * bytesPerPixel_)
  const col = Math.min(cols - 1, Math.max(0, Math.floor(x * cols)))
  const row = Math.min(rows - 1, Math.max(0, Math.floor(y * rows)))
  const idx = (row * rowBytes) + (col * bytesPerPixel_)

  if (idx + 2 >= pixels.length) {
    return null
  }

  return [pixels[idx] / 255, pixels[idx + 1] / 255, pixels[idx + 2] / 255]
}

const isReady = () => !!(grid_ && video_.w)

export {
  install,
  sampleAtNdc,
  isReady,
}
