import { expect, test } from 'claude-code/testing'

import { mountBand, texts, weather } from './helpers'

test('with no prompts the band shows only what is beneath', async ($, on) => {
  weather(on)
  const ui = await mountBand($)
  expect(await texts(ui)).toEqual(['WEATHER'])
})
