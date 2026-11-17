// The Events page search and a click while typing. The search reaches the address after a short
// pause (#320); a card clicked during that pause must still open its event, and Back must bring
// the search back.

import { expect, seededEvents, test } from '../fixtures/index.js';

test('a card clicked right after typing opens its event, and Back returns to the search', async ({ page }) => {
  // The event page answers slowly, like on a slow connection, so the click is still on its way
  // when the search's pause ends
  await page.route('**/events/**', async (route) => {
    if (route.request().headers()['rsc']) await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });

  await page.goto('/');
  const card = page.getByRole('link', { name: new RegExp(seededEvents.gala.title) });
  await expect(card).toBeVisible();

  await page.getByLabel('Search events').fill('Gala');
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/events/${seededEvents.gala.apiId}$`));
  await expect(page.getByRole('heading', { level: 1, name: seededEvents.gala.title })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/\?q=Gala$/);
  await expect(page.getByLabel('Search events')).toHaveValue('Gala');
});
