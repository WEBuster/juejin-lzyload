import {
  on,
  getViewportSize,
  loadIamge,
  throttle,
  debounce,
  isInArea,
  getPlaceholderDataUrl
} from './util'

const DEFAULT_OPTIONS = {
  threshold: 0,
  interval: 200,
  debounce: false,
  reactive: true,
  eagerShowing: false,
  infoGetter: null,
  visibleAreaGetter: null,
  onStateChange: null
}

const INFO_PROP_NAME = '__JUEJIN_LAZYLOAD'
const META_CHECK_INTERVAL = 300

export default class JuejinLazyload {

  constructor (elementList, options) {
    this.setOptions(options)
    this.addOrUpdateElement(elementList)
    this.initEventListener()
  }

  setOptions (options) {
    this.options = Object.assign({}, DEFAULT_OPTIONS, options)
  }

  initEventListener () {
    if (this.options.reactive) {
      const onStateChange = this.options.debounce
        ? debounce(() => this.updateState(), this.options.interval)
        : throttle(() => this.updateState(), this.options.interval)
      this.removeScrollEventListener = on(window, 'scroll', onStateChange)
      this.removeResizeEventListener = on(window, 'resize', onStateChange)
    }
  }

  removeEventListener () {
    this.removeScrollEventListener && this.removeScrollEventListener()
    this.removeResizeEventListener && this.removeResizeEventListener()
  }

  addOrUpdateElement (elementList) {
    const list = this.getElementList(elementList)
    const newList = list.filter(element => !element[INFO_PROP_NAME])
    this.elementList = (this.elementList || []).concat(newList)
    list.forEach(this.initElement.bind(this))
    this.updateState()
  }

  removeElement (elementList) {
    const list = this.getElementList(elementList)
    this.elementList = this.elementList.filter(element => (
      list.indexOf(element) === -1
    ))
    list.forEach(this.removeInfo.bind(this))
  }

  clean () {
    this.elementList.forEach(this.removeInfo.bind(this))
    this.elementList = []
  }

  getElementList (descriptor) {
    if (!descriptor) {
      return []
    } else if (typeof descriptor === 'string') {
      return [].slice.call(document.querySelectorAll(descriptor))
    } else if (typeof descriptor.length === 'number') {
      return [].slice.call(descriptor)
    } else {
      return [descriptor]
    }
  }

  initElement (element) {
    this.attachInfo(element)
    this.setPlaceholder(element)
    this.updateElementClassByState('inited', element)
    this.invokeStateHook('inited', element)
  }

  attachInfo (element) {
    const imgInfo = this.options.infoGetter && this.options.infoGetter(element)
    const info = Object.assign({}, imgInfo, {
      loading: false
    })
    element[INFO_PROP_NAME] = info
  }

  setPlaceholder (element) {
    const info = element[INFO_PROP_NAME]
    const isImg = element.nodeName === 'IMG'
    if (isImg && info.width && info.height) {
      element.src = getPlaceholderDataUrl(info.width, info.height)
    }
  }

  removeInfo (element) {
    if (element[INFO_PROP_NAME]) {
      element[INFO_PROP_NAME] = null
    }
  }

  updateState () {
    if (!this.elementList.length) { return }
    const activeArea = this.getActiveArea()
    this.elementList.forEach(element => {
      const { loading } = element[INFO_PROP_NAME]
      const rect = element.getBoundingClientRect()
      const isInActiveArea = isInArea(activeArea, rect)
      if (!loading && isInActiveArea) {
        this.loadIamge(element)
      }
    })
  }

  getActiveArea () {
    const visibleArea = this.getVisibleArea()
    const threshold = this.options.threshold || 0
    return {
      top: visibleArea.top - threshold,
      left: visibleArea.left - threshold,
      right: visibleArea.right + threshold,
      bottom: visibleArea.bottom + threshold
    }
  }

  
  getVisibleArea () {
    if (this.options.visibleAreaGetter) {
      return this.options.visibleAreaGetter()
    } else {
      const { width, height } = getViewportSize()
      return {
        top: 0,
        left: 0,
        right: width,
        bottom: height
      }
    }
  }

  loadIamge (element) {
    const info = element[INFO_PROP_NAME]
    const { url } = info
    info.loading = true
    this.updateElementClassByState('loading', element)
    this.invokeStateHook('loading', element)
    loadIamge(url, {
      onStart: (url, image) => {
        if (this.options.eagerShowing) {
          this.onMetaLoaded(image, () => {
            element.removeAttribute('src')  // necessary
            element.setAttribute('src', url)
          })
        }
      },
      onLoaded: () => {
        this.setElementWithImageUrl(url, element)
        this.updateElementClassByState('loaded', element)
        this.invokeStateHook('loaded', element)
        this.removeElement(element)
      },
      onError: () => {
        this.updateElementClassByState('error', element)
        this.invokeStateHook('error', element)
        this.removeElement(element)
      }
    })
  }

  updateElementClassByState (state, element) {
    switch (state) {
      case 'inited':
        element.classList.add('inited')
        element.classList.remove('loading')
        element.classList.remove('loaded')
        element.classList.remove('error')
        break
      case 'loading':
        element.classList.add('loading')
        break
      case 'loaded':
        element.classList.remove('loading')
        element.classList.add('loaded')
        break
      case 'error':
        element.classList.remove('loading')
        element.classList.add('error')
        break
      default:
        // do nothing
    }
  }

  invokeStateHook (state, element) {
    if (this.options.onStateChange) {
      const { url } = element[INFO_PROP_NAME]
      this.options.onStateChange(state, url, element, this)
    }
  }

  setElementWithImageUrl (url, element) {
    if (element.nodeName === 'IMG') {
      element.src = url
    } else {
      element.style.backgroundImage = `url(${url})`
    }
  }

  onMetaLoaded (image, callback) {
    const token = setInterval(() => {
      if (image.naturalWidth) {
        stop()
        callback()
      }
    }, META_CHECK_INTERVAL)
    const stop = () => clearInterval(token)
    on(image, 'load', stop)
    on(image, 'error', stop)
  }

  destroy () {
    this.removeEventListener()
    this.clean()
    this.setOptions({})
  }

}
