import type { On, PromptOrigin } from 'claude-code'
import type { ElementQuery, Engine, FoundElement } from 'claude-code/testing'

export const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 20,
  bodyColumns: 50,
  scroll: { offset: 0, bodyRows: 20 },
  view: {},
}

// Stands in for token-weather: the plugin beneath that draws one line in the band.
export function weather(on: On): void {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>WEATHER</Text>
  })
}

export function passPrompts(on: On): void {
  on('prompt.submit', ($, e) => ({ text: e.text }))
}

export function mountBand($: Engine, props = PROPS, surface: 'terminal' | 'desktop' = 'terminal') {
  return $.ui.mount({ plugin: 'prompt-trail', surface, component: 'AbovePrompt', props, requestId: 'band' })
}

export async function texts(ui: { findAll: (query: ElementQuery) => Promise<FoundElement[]> }): Promise<string[]> {
  return (await ui.findAll({ type: 'Text' })).map(t => t.text)
}

export async function submit($: Engine, text: string, kind = 'composer'): Promise<void> {
  await $.prompt.submit({ text, origin: { kind } as PromptOrigin, wait: false })
}

// The band as drawn, one string per screen line: each child of the root Box
// with its Texts and Button labels joined (a row's border pieces included).
export async function lines(ui: { drawn: () => Promise<unknown> }): Promise<string[]> {
  const textOf = (node: unknown): string => {
    if (typeof node === 'string') return node
    if (!node || typeof node !== 'object') return ''
    const element = node as { type?: string; props?: { label?: unknown }; children?: unknown[] }
    if (element.type === 'Button') return String(element.props?.label ?? '')
    return (element.children ?? []).map(textOf).join('')
  }
  const root = (await ui.drawn()) as { type?: string; children?: unknown[] }
  return root.type === 'Box' ? (root.children ?? []).map(textOf) : [textOf(root)]
}
