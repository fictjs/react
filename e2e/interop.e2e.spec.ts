import { expect, test } from '@playwright/test'

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

test('installReactIslands mounts static host and re-renders on attr update', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('loader-value')).toHaveText('loader:1')

  await page.click('#loader-inc')
  await expect(page.getByTestId('loader-value')).toHaveText('loader:2')
})
