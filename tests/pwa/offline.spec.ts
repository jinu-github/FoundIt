import { test, expect } from "@playwright/test";
import { writeFile, unlink } from "node:fs/promises";
test.afterEach(async () => {
  await unlink(".pwa-test-mode.json").catch(() => {});
});
test("offline shell, local data, lazy backup, and conservative update preserve a draft", async ({
  page,
  context,
}) => {
  const external: string[] = [];
  context.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      !request.url().startsWith("http://127.0.0.1:5173/")
    )
      external.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByText(/Offline files prepared/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Offline files verified/)).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/Offline files verified/)).toBeVisible();
  await page.getByRole("button", { name: /Add item/ }).click();
  await page.getByRole("button", { name: "note", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Offline note");
  await page.getByLabel("Note", { exact: true }).fill("quartz lighthouse");
  await page.getByRole("button", { name: "Save to library" }).click();
  await page.getByRole("searchbox").fill("lighthouse");
  await expect(
    page.getByRole("button", { name: /Offline note quartz lighthouse/ }),
  ).toBeVisible();
  await page.getByText("Backup and restore", { exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(window, "showSaveFilePicker", {
      value: undefined,
      configurable: true,
    });
  });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const backup = await download;
  const backupPath = await backup.path();
  expect(backupPath).toBeTruthy();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await page.getByLabel("Choose backup to validate").setInputFiles(backupPath!);
  await page.getByLabel("Restore mode").selectOption("empty");
  await page.getByRole("button", { name: "Restore validated backup" }).click();
  await expect(page.getByText(/1 added/)).toBeVisible();
  await page
    .getByRole("button", { name: /Offline note quartz lighthouse/ })
    .click();
  await page.getByLabel("Choose backup to validate").setInputFiles(backupPath!);
  await expect(
    page.getByRole("button", { name: "Restore validated backup" }),
  ).toBeVisible();
  await page.getByLabel("Restore mode").selectOption("merge");
  await page.getByRole("button", { name: "Restore validated backup" }).click();
  await expect(page.getByText(/0 added/)).toBeVisible();
  await page.getByRole("button", { name: "Edit item" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Unsaved draft");
  await context.setOffline(false);
  await writeFile(".pwa-test-mode.json", JSON.stringify({ version: "B" }));
  await page.getByRole("button", { name: "Check offline files" }).click();
  await expect(page.getByText(/Update ready\./)).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Unsaved draft",
  );
  expect(
    await page.evaluate(
      async () => !!(await navigator.serviceWorker.getRegistration())?.waiting,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/");
  await expect(reopened.getByText(/Offline files verified/)).toBeVisible();
  await expect(
    reopened.getByRole("button", { name: /Unsaved draft quartz lighthouse/ }),
  ).toBeVisible();
  expect(external).toEqual([]);
});
test("missing required asset fails preparation without false readiness", async ({
  page,
}) => {
  await writeFile(".pwa-test-mode.json", JSON.stringify({ fail: true }));
  await page.goto("/");
  await expect(
    page.getByText(/Offline preparation could not be verified/),
  ).toBeVisible();
  await expect(page.getByText(/Offline files verified/)).toHaveCount(0);
  await writeFile(".pwa-test-mode.json", "{}");
  await page.getByRole("button", { name: "Check offline files" }).click();
  await expect(page.getByText(/Offline files prepared/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Offline files verified/)).toBeVisible();
});
test("fresh OCR and OCR search work offline; missing cache is detected", async ({
  page,
  context,
}) => {
  const external: string[] = [];
  context.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      !request.url().startsWith("http://127.0.0.1:5173/")
    )
      external.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByText(/Offline files prepared/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Offline files verified/)).toBeVisible();
  await context.setOffline(true);
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 180;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 900, 180);
    ctx.fillStyle = "black";
    ctx.font = "60px Arial";
    ctx.fillText("QUARTZ LIGHTHOUSE", 25, 100);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByRole("button", { name: /Add item/ }).click();
  await page
    .getByLabel(/Image file/)
    .setInputFiles({
      name: "sample.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await page.getByRole("button", { name: "Save to library" }).click();
  await expect(
    page.getByText("QUARTZ LIGHTHOUSE", { exact: true }).first(),
  ).toBeVisible({ timeout: 90000 });
  await page.getByRole("searchbox").fill("lighthouse");
  await expect(
    page.getByRole("button", { name: /sample.png.*LIGHTHOUSE/ }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("searchbox").fill("lighthouse");
  await expect(
    page.getByRole("button", { name: /sample.png.*LIGHTHOUSE/ }),
  ).toBeVisible();
  await page.evaluate(async () => {
    for (const name of await caches.keys())
      if (name.startsWith("foundit-pwa-precache-")) {
        const cache = await caches.open(name);
        for (const key of await cache.keys())
          if (key.url.includes("eng.traineddata.gz")) await cache.delete(key);
      }
  });
  await page.getByRole("button", { name: "Check offline files" }).click();
  await expect(
    page.getByText(/Offline preparation could not be verified/),
  ).toBeVisible();
  expect(external).toEqual([]);
});
