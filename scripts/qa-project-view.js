// View controls live in an explicit title menu in both project workspaces.
module.exports = async function switchProjectView(page, view) {
 const menu = page.locator('.project-view-menu');
 if (await menu.getAttribute('open') === null) await menu.locator('summary').click();
 await page.locator('[data-project-view="' + view + '"]').click();
 await page.locator('#projectShell[data-view="' + view + '"]').waitFor();
};
