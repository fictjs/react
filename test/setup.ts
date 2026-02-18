import { TextDecoder, TextEncoder } from 'node:util'

import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
})

const { window } = dom

const install = (key: string, value: unknown) => {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  })
}

install('window', window)
install('document', window.document)
install('navigator', window.navigator)
install('Node', window.Node)
install('Element', window.Element)
install('HTMLElement', window.HTMLElement)
install('DocumentFragment', window.DocumentFragment)
install('Event', window.Event)
install('MouseEvent', window.MouseEvent)
install('CustomEvent', window.CustomEvent)
install('MutationObserver', window.MutationObserver)
install('IntersectionObserver', window.IntersectionObserver)
install('TextEncoder', TextEncoder)
install('TextDecoder', TextDecoder)
