import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import { parseXmind } from "../../scripts/parse-xmind";
import { modernZip } from "../fixtures";
import type { Catalog, Mindmap } from "../../src/types/mindmap";

let catalog: Catalog;
let lipid: Mindmap;
let multi: Mindmap;
test.beforeAll(async () => {
  catalog = JSON.parse(await fs.readFile("public/data/index.json", "utf8"));
  lipid = JSON.parse(
    await fs.readFile(
      `public/${catalog.maps.find((m) => m.name.includes("第五章脂质"))!.dataUrl}`,
      "utf8",
    ),
  );
  multi = (await parseXmind(modernZip(), "测试/多画布.xmind")).map;
});
async function ready(page: Page) {
  await expect(page.getByLabel("思维导图画布")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
}
async function openLipid(page: Page) {
  await page.goto(`#/map/${lipid.id}`);
  await ready(page);
}
test("目录搜索、分类、排序、主题与全屏宽度", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "学习导图库." }),
  ).toBeVisible();
  await expect(page.locator(".map-row")).toHaveCount(18);
  await page.getByLabel("搜索导图名称").fill("脂质");
  await expect(page.locator(".map-row")).toHaveCount(1);
  await expect(page.locator(".map-row")).not.toContainText("完结");
  await page.getByLabel("搜索导图名称").fill("");
  await page.getByRole("button", { name: "食品微生物学 10" }).click();
  await expect(page.locator(".map-row")).toHaveCount(10);
  await page.getByLabel("导图排序").selectOption("desc");
  await page.getByLabel("页面主题").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `test-results/library-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("真实导图：展开、概要、隐藏节点搜索、节点全文、缩放与刷新", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openLipid(page);
  const tools = page.getByLabel("更多导图工具");
  await tools.click();
  await page
    .getByRole("button", { name: "全部展开", exact: true })
    .last()
    .click();
  await ready(page);
  await expect(page.getByTestId("canvas-status")).toContainText("334 / 334");
  await expect(page.locator("[data-summary-id]")).toHaveCount(7);
  const fullStatus = await page.getByTestId("canvas-status").textContent();
  await test
    .info()
    .attach("full-layout-metrics", {
      body: JSON.stringify({ file: lipid.name, status: fullStatus }),
      contentType: "application/json",
    });
  for (const s of lipid.sheets[0].summaries)
    await expect(page.locator(`[data-summary-id="${s.id}"]`)).toHaveAttribute(
      "data-covered-ids",
      s.coveredNodeIds.join(","),
    );
  await page.getByLabel("折叠到指定层级").selectOption("0");
  await ready(page);
  await expect(page.getByTestId("canvas-status")).toContainText("1 / 334");
  await expect(page.locator("[data-summary-id]")).toHaveCount(0);
  const summary = lipid.sheets[0].summaries[0];
  const title = lipid.sheets[0].topics[summary.topicId].title;
  await page.getByLabel("搜索节点内容").fill(title);
  await ready(page);
  const target = page.locator(`[data-topic-id="${summary.topicId}"]`);
  await expect(target).toBeVisible();
  await expect(target).toHaveClass(/is-focused/);
  await target.locator(".node-title").click();
  await expect(page.getByLabel("节点阅读面板")).toContainText(title);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByLabel("关闭节点面板").click();
  await page.screenshot({
    path: `test-results/summary-${test.info().project.name}.png`,
  });
  await page.getByLabel("清除搜索").click();
  await ready(page);
  await expect(page.getByTestId("canvas-status")).toContainText("1 / 334");
  await page.getByLabel("放大导图").click();
  await page.getByLabel("缩小导图").click();
  await page.getByLabel("定位根节点").click();
  await page.getByLabel("页面主题").selectOption("light");
  await page.reload();
  await ready(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(errors).toEqual([]);
  await page.screenshot({
    path: `test-results/reader-${test.info().project.name}.png`,
  });
});
test("原图查看器缩放、关闭及节点分享深链", async ({ page }) => {
  await openLipid(page);
  const topic = Object.values(lipid.sheets[0].topics).find((t) => t.image)!;
  await page.goto(`#/map/${lipid.id}?node=${encodeURIComponent(topic.id)}`);
  await ready(page);
  const card = page.locator(`[data-topic-id="${topic.id}"]`);
  await expect(card).toBeVisible();
  const img = card.locator("img");
  await expect(img).toBeVisible();
  await expect
    .poll(() =>
      img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0),
    )
    .toBe(true);
  await card.getByRole("button", { name: /放大图片/ }).click();
  await expect(page.getByRole("dialog", { name: "图片查看器" })).toBeVisible();
  await page.getByLabel("放大图片", { exact: true }).click();
  await expect(page.locator(".image-zoom")).toHaveText("125%");
  await page.getByLabel("重置图片").click();
  await expect(page.locator(".image-zoom")).toHaveText("100%");
  await page.getByLabel("关闭图片").click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await ready(page);
  await expect(page.locator(`[data-topic-id="${topic.id}"]`)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("多画布、跨画布搜索、直接画布链接和安全文本", async ({ page }) => {
  multi.sheets[1].topics.a.title = "安全文字 <script>window.evil=true</script>";
  const custom = {
    ...catalog,
    maps: [
      ...catalog.maps,
      {
        id: multi.id,
        name: multi.name,
        folder: multi.folder,
        nodeCount: 15,
        sheetCount: 2,
        imageCount: 1,
        summaryCount: 3,
        maxDepth: 4,
        bytes: 1000,
        warningCount: 0,
        dataUrl: "data/test-multi.json",
      },
    ],
  };
  await page.route("**/data/index.json", (r) => r.fulfill({ json: custom }));
  await page.route("**/data/test-multi.json", (r) =>
    r.fulfill({ json: multi }),
  );
  await page.goto(`#/map/${multi.id}?sheet=sheet-two`);
  await ready(page);
  await expect(page.getByLabel("切换画布")).toHaveValue("sheet-two");
  await page.getByLabel("搜索节点内容").fill("隐藏节点");
  await expect(page.getByLabel("切换画布")).toHaveValue("sheet-one");
  await ready(page);
  await expect(page.locator('[data-topic-id="a1"]')).toBeVisible();
  await page.getByLabel("清除搜索").click();
  await page.getByLabel("切换画布").selectOption("sheet-two");
  await page.reload();
  await ready(page);
  await expect(page.getByLabel("切换画布")).toHaveValue("sheet-two");
  await expect(page.locator('[data-topic-id="a"] .node-title')).toHaveText(
    "安全文字 <script>window.evil=true</script>",
  );
  expect(await page.evaluate(() => Object.hasOwn(window, "evil"))).toBe(false);
});
test("手机触控平移与画布保持左右布局", async ({ page }, info) => {
  test.skip(info.project.name !== "android");
  await openLipid(page);
  const before = await page
    .locator(".react-flow__viewport")
    .getAttribute("style");
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 160, y: 240 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 230, y: 290 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator(".react-flow__viewport")).not.toHaveAttribute(
    "style",
    before!,
  );
  const oldZoom = await page.locator(".zoom-controls>span").textContent();
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: 140, y: 340, id: 1 },
      { x: 240, y: 340, id: 2 },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: 110, y: 340, id: 1 },
      { x: 270, y: 340, id: 2 },
    ],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator(".zoom-controls>span")).not.toHaveText(oldZoom!);
  const positions = await page
    .locator(".react-flow__node")
    .evaluateAll((elements) =>
      elements.map((e) => ({
        id: e.getAttribute("data-id")!,
        x: parseFloat(
          (e as HTMLElement).style.transform.match(
            /translate\(([-.\d]+)/,
          )?.[1] || "0",
        ),
      })),
    );
  const rootX = positions.find((p) => p.id === lipid.sheets[0].rootId)?.x;
  if (rootX !== undefined)
    for (const p of positions)
      if (p.id !== lipid.sheets[0].rootId) expect(p.x).toBeGreaterThan(rootX);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("复制目录、画布、节点链接及完整节点文字", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("./");
  await page.getByLabel(`复制 ${catalog.maps[0].name} 分享链接`).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain(`#/map/${catalog.maps[0].id}`);
  await openLipid(page);
  await page.getByLabel("复制当前导图分享链接").click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain(`sheet=${lipid.sheets[0].id}`);
  const title = lipid.sheets[0].topics[lipid.sheets[0].rootId].title;
  await page.locator(".kind-root .node-title").click();
  await page.getByRole("button", { name: "复制全文" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(title);
  await page.getByRole("button", { name: "分享节点", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain(`node=${lipid.sheets[0].rootId}`);
});
