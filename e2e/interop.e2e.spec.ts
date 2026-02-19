import { expect, test, type Page } from '@playwright/test'

interface E2EState {
  lifecycleMounts: number
  lifecycleUnmounts: number
  actionCalls: string[]
  hydrationNativeClicks: number
}

async function readE2EState(page: Page): Promise<E2EState> {
  return page.evaluate(() => {
    const host = window as Window & { __FICT_E2E__?: E2EState }
    return (
      host.__FICT_E2E__ ?? {
        lifecycleMounts: 0,
        lifecycleUnmounts: 0,
        actionCalls: [],
        hydrationNativeClicks: 0,
      }
    )
  })
}

test('eager reactify works in browser', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('eager-value')).toHaveText('eager:0')

  await page.click('#eager-inc')
  await expect(page.getByTestId('eager-value')).toHaveText('eager:1')
})

test('reactify$ mounts and reacts to prop updates', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('qrl-value')).toHaveText('qrl:0')

  await page.click('#qrl-inc')
  await expect(page.getByTestId('qrl-value')).toHaveText('qrl:1')
})

test('ReactIsland getter props update correctly', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('react-island-value')).toHaveText('alpha')

  await page.click('#react-island-swap')
  await expect(page.getByTestId('react-island-value')).toHaveText('beta')
})

test('signal strategy mounts only after signal flips true', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('signal-strategy-value')).toHaveCount(0)

  await page.click('#signal-mount')
  await expect(page.getByTestId('signal-strategy-value')).toHaveText('signal-mounted')
})

test('hover strategy mounts on mouseover', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('hover-strategy-value')).toHaveCount(0)

  const hoverHost = page.locator('[data-fict-react-client="hover"]').first()
  await hoverHost.dispatchEvent('mouseover')
  await expect(page.getByTestId('hover-strategy-value')).toHaveText('hover-mounted')
})

test('event strategy mounts on configured event', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('event-strategy-value')).toHaveCount(0)

  const eventHost = page.locator(
    '[data-fict-react-client="event"][data-fict-react-event="dblclick"]',
  )
  await eventHost.dispatchEvent('dblclick')
  await expect(page.getByTestId('event-strategy-value')).toHaveText('event-mounted')
})

test('visible strategy mounts when host enters viewport', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('visible-strategy-value')).toHaveCount(0)

  await page.locator('#visible-root').scrollIntoViewIfNeeded()
  await expect(page.getByTestId('visible-strategy-value')).toHaveText('visible-mounted')
})

test('idle strategy mounts only after idle callback flush', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('idle-strategy-value')).toHaveCount(0)

  await page.click('#idle-flush')
  await expect(page.getByTestId('idle-strategy-value')).toHaveText('idle-mounted')
})

test('only strategy disables SSR marker on host', async ({ page }) => {
  await page.goto('/')

  const host = page.locator('[data-fict-react-client="only"]').first()
  await expect(host).toHaveAttribute('data-fict-react-ssr', '0')
  await expect(page.getByTestId('only-strategy-value')).toHaveText('only-mounted')
})

test('reactAction$ callback is materialized and invoked through reactify$', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('action-call-count')).toHaveText('0')
  await expect(page.getByTestId('action-widget-trigger')).toBeVisible()

  await page.click('#action-widget-trigger')
  await expect(page.getByTestId('action-call-count')).toHaveText('1')
  await expect.poll(async () => (await readE2EState(page)).actionCalls).toEqual(['action:main'])
})

test('installReactIslands mounts static host and re-renders on attr update', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('loader-value')).toHaveText('loader:1')

  await page.click('#loader-inc')
  await expect(page.getByTestId('loader-value')).toHaveText('loader:2')
})

test('loader rebuilds runtime when qrl attribute changes', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('loader-value')).toHaveText('loader:1')

  await page.click('#loader-switch-qrl')
  await expect(page.getByTestId('loader-value')).toHaveText('ALT-loader:1')
})

test('loader hydrates pre-rendered SSR host and reuses existing DOM node', async ({ page }) => {
  await page.goto('/')

  const hydrationHost = page.locator('#hydration-loader-island')
  await expect(hydrationHost).toHaveAttribute('data-fict-react-ssr', '1')
  await expect(page.getByTestId('hydration-value')).toHaveText('hydrated')

  await page.getByTestId('hydration-value').click()
  await expect.poll(async () => (await readE2EState(page)).hydrationNativeClicks).toBe(1)
})

test('loader observer mounts added hosts and disposes removed hosts', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('loader-lifecycle-value')).toHaveCount(0)

  await page.click('#loader-add-dynamic')
  await expect(page.getByTestId('loader-lifecycle-value')).toHaveText('dynamic')
  await expect.poll(async () => (await readE2EState(page)).lifecycleMounts).toBe(1)

  await page.click('#loader-remove-dynamic')
  await expect(page.getByTestId('loader-lifecycle-value')).toHaveCount(0)
  await expect.poll(async () => (await readE2EState(page)).lifecycleUnmounts).toBe(1)
})

test('loader warns in browser when immutable host attrs are mutated in dev', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'warning') return
    warnings.push(message.text())
  })

  await page.goto('/')
  await page.click('#loader-mutate-immutable')
  await expect.poll(() => warnings.length).toBeGreaterThanOrEqual(1)
  expect(warnings.some((text) => text.includes('Ignored runtime mutation'))).toBe(true)
})
