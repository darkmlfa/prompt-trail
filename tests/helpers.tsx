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
