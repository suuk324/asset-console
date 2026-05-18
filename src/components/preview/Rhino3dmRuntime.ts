import { ACESFilmicToneMapping, SRGBColorSpace } from 'three/src/constants.js'
import { Object3D } from 'three/src/core/Object3D.js'
import { PerspectiveCamera } from 'three/src/cameras/PerspectiveCamera.js'
import { GridHelper } from 'three/src/helpers/GridHelper.js'
import { DirectionalLight } from 'three/src/lights/DirectionalLight.js'
import { Box3 } from 'three/src/math/Box3.js'
import { Color } from 'three/src/math/Color.js'
import { Vector3 } from 'three/src/math/Vector3.js'
import { Group } from 'three/src/objects/Group.js'
import { WebGLRenderer } from 'three/src/renderers/WebGLRenderer.js'
import { Scene } from 'three/src/scenes/Scene.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js'

const RHINO_LIBRARY_PATH = new URL('/vendor/rhino3dm/', window.location.origin).toString()

function disposeGroup(group: Group) {
  group.traverse((child: Object3D) => {
    const mesh = child as {
      geometry?: { dispose?: () => void }
      material?: { dispose?: () => void } | Array<{ dispose?: () => void }>
    }

    mesh.geometry?.dispose?.()

    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => material.dispose?.())
    } else {
      mesh.material?.dispose?.()
    }
  })
}

interface RhinoPreviewCallbacks {
  onReady: () => void
  onError: () => void
}

export function mountRhino3dmRuntime(
  host: HTMLDivElement,
  src: string,
  callbacks: RhinoPreviewCallbacks,
  theme: 'light' | 'dark' = 'light',
) {
  let frameId = 0
  let disposed = false
  let objectGroup: Group | null = null

  const scene = new Scene()
  scene.background = new Color(theme === 'dark' ? '#171b21' : '#f7f3ec')

  const renderer = new WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  host.replaceChildren(renderer.domElement)

  const camera = new PerspectiveCamera(42, 1, 0.1, 2000)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08

  const keyLight = new DirectionalLight('#ffffff', 3.2)
  keyLight.position.set(12, 16, 10)
  scene.add(keyLight)

  const fillLight = new DirectionalLight(theme === 'dark' ? '#85a6ff' : '#ffd8b2', theme === 'dark' ? 1.2 : 1.5)
  fillLight.position.set(-10, 8, -6)
  scene.add(fillLight)

  const ground = new GridHelper(
    24,
    24,
    theme === 'dark' ? '#5872a1' : '#d7c4ab',
    theme === 'dark' ? '#2b3240' : '#eadfce',
  )
  scene.add(ground)

  const resize = () => {
    const width = host.clientWidth || 1
    const height = host.clientHeight || 1
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()

  const renderLoop = () => {
    frameId = window.requestAnimationFrame(renderLoop)
    controls.update()
    renderer.render(scene, camera)
  }

  const loader = new Rhino3dmLoader()
  loader.setLibraryPath(RHINO_LIBRARY_PATH)
  loader.setWorkerLimit(1)

  loader.load(
    src,
    (object: Object3D) => {
      if (disposed) {
        return
      }

      objectGroup = new Group()
      objectGroup.add(object)

      const bounds = new Box3().setFromObject(objectGroup)
      const center = bounds.getCenter(new Vector3())
      const size = bounds.getSize(new Vector3())
      const maxAxis = Math.max(size.x, size.y, size.z, 1)
      const verticalOffset = size.y * 0.5

      objectGroup.position.sub(center)
      objectGroup.position.y += verticalOffset * 0.08
      scene.add(objectGroup)

      ground.position.y = -(size.y * 0.5) - maxAxis * 0.03

      const distance = maxAxis * 1.8
      camera.position.set(distance, distance * 0.92, distance * 1.18)
      controls.target.set(0, 0, 0)
      controls.minDistance = maxAxis * 0.35
      controls.maxDistance = maxAxis * 6
      controls.update()

      callbacks.onReady()
      renderLoop()
    },
    undefined,
    (error) => {
      console.error('Failed to load 3DM preview', error)
      if (!disposed) {
        callbacks.onError()
      }
    },
  )

  return () => {
    disposed = true
    observer.disconnect()
    window.cancelAnimationFrame(frameId)
    loader.dispose()
    controls.dispose()
    if (objectGroup) {
      disposeGroup(objectGroup)
    }
    renderer.dispose()
    host.replaceChildren()
  }
}
