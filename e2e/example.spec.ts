/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';

test.describe('Sessions UI', () => {
	test('should load successfully', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/.+/);
	});

	test('should render without errors', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', err => errors.push(err.message));
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		expect(errors).toHaveLength(0);
	});
});