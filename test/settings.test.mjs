import test from "node:test";
import assert from "node:assert/strict";
import {
  act,
  makeWorld,
  renderSection,
  findSlot,
  click,
  typeInto,
  buttonByText,
  storedRecord,
  stubImagePipeline,
  chooseFile,
  PNG,
  STORAGE_KEY,
  LEGACY_ALIAS_KEY,
  LEGACY_AVATAR_KEY
} from "./harness.mjs";

function labelOf(world) {
  return world.document.querySelector('span[class*="_label"]');
}

function avatarOf(world) {
  return world.document.querySelector('span[class*="_avatar"]');
}

test("registers a settings section and renders the empty form", async () => {
  const world = makeWorld();
  const entry = findSlot(world);
  assert.ok(entry, "settings.section is registered");
  assert.equal(entry.options.id, "plugin-custom-profile");
  assert.equal(entry.options.order, 5);
  assert.equal(entry.options.label(), "个人资料");

  const { root, container } = await renderSection(world);
  assert.match(container.textContent, /个人资料/);
  assert.doesNotMatch(container.textContent, /左下角预览/);
  const input = container.querySelector('input[type="text"]');
  assert.equal(input.value, "");
  assert.equal(input.placeholder, "你的显示名称");
  assert.equal(container.querySelector(".dsh-pp-avatar").getAttribute("aria-label"), "默认头像");
  assert.equal(container.querySelector('[role="menu"]'), null);
  assert.equal(buttonByText(container, "保存").disabled, true);

  await click(world, buttonByText(container, "更换"));
  const menu = container.querySelector('[role="menu"]');
  assert.ok(menu, "Change opens the avatar menu");
  assert.equal(buttonByText(menu, "选择图片…").disabled, false);
  assert.equal(buttonByText(menu, "清除头像").disabled, true);

  await act(async () => root.unmount());
  world.disposeAll();
});

test("saving a name writes one record and updates the sidebar", async () => {
  const world = makeWorld();
  const { root, container } = await renderSection(world);
  const input = container.querySelector('input[type="text"]');

  await typeInto(world, input, "Alice");
  assert.equal(input.value, "Alice");
  const save = buttonByText(container, "保存");
  assert.equal(save.disabled, false);
  await click(world, save);

  assert.deepEqual(storedRecord(world), { v: 1, name: "Alice", avatar: "" });
  assert.equal(labelOf(world).textContent, "Alice");
  assert.match(container.textContent, /已保存/);

  await act(async () => root.unmount());
  world.disposeAll();
});

test("cancel discards the draft without touching storage", async () => {
  const world = makeWorld({ record: { v: 1, name: "Alice", avatar: "" } });
  const { root, container } = await renderSection(world);
  const input = container.querySelector('input[type="text"]');

  await typeInto(world, input, "Bob");
  await click(world, buttonByText(container, "取消"));

  assert.equal(input.value, "Alice");
  assert.deepEqual(storedRecord(world), { v: 1, name: "Alice", avatar: "" });
  assert.equal(labelOf(world).textContent, "Alice");

  await act(async () => root.unmount());
  world.disposeAll();
});

test("reset clears both drafts; save restores the shipped display", async () => {
  const world = makeWorld({ record: { v: 1, name: "Alice", avatar: PNG } });
  const { root, container } = await renderSection(world);
  const input = container.querySelector('input[type="text"]');

  await click(world, buttonByText(container, "恢复默认"));
  assert.equal(input.value, "");
  assert.match(container.textContent, /点击保存后恢复默认/);
  assert.equal(buttonByText(container, "保存").disabled, false);

  await click(world, buttonByText(container, "保存"));
  assert.equal(storedRecord(world), null);
  assert.equal(labelOf(world).textContent, "181******40");
  assert.equal(avatarOf(world).getAttribute("data-dsh-plugin-custom-profile-avatar"), null);

  await act(async () => root.unmount());
  world.disposeAll();
});

test("a storage failure is atomic: one write, no state or DOM change", async () => {
  const world = makeWorld({ record: { v: 1, name: "Alice", avatar: PNG } });
  const { root, container } = await renderSection(world);
  const input = container.querySelector('input[type="text"]');
  await typeInto(world, input, "Bob");

  let writes = 0;
  const storageProto = world.window.Storage.prototype;
  const originalSetItem = storageProto.setItem;
  storageProto.setItem = () => {
    writes += 1;
    throw new Error("QuotaExceededError");
  };

  try {
    await click(world, buttonByText(container, "保存"));
  } finally {
    storageProto.setItem = originalSetItem;
  }

  assert.equal(writes, 1, "the record is written as one value");
  assert.deepEqual(JSON.parse(world.storage.getItem(STORAGE_KEY)), {
    v: 1,
    name: "Alice",
    avatar: PNG
  });
  assert.equal(labelOf(world).textContent, "Alice");
  assert.match(avatarOf(world).style.backgroundImage, /data:image\/png;base64,QUJD/);
  assert.equal(input.value, "Bob");
  assert.match(container.textContent, /保存失败/);

  await act(async () => root.unmount());
  world.disposeAll();
});

test("Enter during IME composition does not save", async () => {
  const world = makeWorld();
  const { root, container } = await renderSection(world);
  const input = container.querySelector('input[type="text"]');
  await typeInto(world, input, "Alice");

  await act(async () => {
    input.dispatchEvent(
      new world.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true })
    );
  });
  assert.equal(storedRecord(world), null);
  assert.equal(labelOf(world).textContent, "181******40");

  await act(async () => {
    input.dispatchEvent(
      new world.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: false })
    );
  });
  assert.deepEqual(storedRecord(world), { v: 1, name: "Alice", avatar: "" });
  assert.equal(labelOf(world).textContent, "Alice");

  await act(async () => root.unmount());
  world.disposeAll();
});

test("a chosen image is cropped to 128 square, encoded, saved and painted", async () => {
  const world = makeWorld();
  const { root, container } = await renderSection(world);
  const pipeline = stubImagePipeline(world);

  const file = new world.window.File([new Uint8Array([1, 2, 3])], "avatar.png", {
    type: "image/png"
  });
  await chooseFile(world, container, file);

  assert.equal(pipeline.draws.length, 1);
  const args = pipeline.draws[0];
  assert.equal(args[3], 171, "drawn width fills the square");
  assert.equal(args[4], 128, "drawn height fills the square");
  assert.match(container.querySelector(".dsh-pp-avatar").style.backgroundImage, /data:image\/webp/);

  await click(world, buttonByText(container, "保存"));
  assert.deepEqual(storedRecord(world), {
    v: 1,
    name: "",
    avatar: "data:image/webp;base64,QUJD"
  });
  assert.match(avatarOf(world).style.backgroundImage, /data:image\/webp;base64,QUJD/);

  await act(async () => root.unmount());
  world.disposeAll();
});

test("an unsupported type is rejected before reading the file", async () => {
  const world = makeWorld();
  const { root, container } = await renderSection(world);

  await chooseFile(world, container, { type: "image/svg+xml", size: 100 });
  assert.match(container.textContent, /只支持 PNG、JPG、WebP、GIF、AVIF/);
  assert.equal(storedRecord(world), null);

  await act(async () => root.unmount());
  world.disposeAll();
});

test("an oversized source is rejected before reading the file", async () => {
  const world = makeWorld();
  const { root, container } = await renderSection(world);

  await chooseFile(world, container, { type: "image/png", size: 11 * 1024 * 1024 });
  assert.match(container.textContent, /图片太大/);
  assert.equal(storedRecord(world), null);

  await act(async () => root.unmount());
  world.disposeAll();
});

test("locale changes update the section and its nav label", async () => {
  const world = makeWorld();
  const { root, container } = await renderSection(world);
  assert.match(container.textContent, /个人资料/);

  await act(async () => {
    world.localeService.set("en");
    await Promise.resolve();
  });

  assert.match(container.textContent, /Profile/);
  assert.match(container.textContent, /Display name/);
  assert.equal(container.querySelector('input[type="text"]').placeholder, "Your display name");
  assert.equal(buttonByText(container, "Change").textContent, "Change");
  assert.equal(findSlot(world).options.label(), "Profile");

  await act(async () => root.unmount());
  world.disposeAll();
});

test("a plain locale id from getLocale is understood", async () => {
  const world = makeWorld();
  world.localeService.getLocale = () => "en-US";
  const { root, container } = await renderSection(world);
  assert.match(container.textContent, /Profile/);
  assert.equal(findSlot(world).options.label(), "Profile");

  await act(async () => root.unmount());
  world.disposeAll();
});

test("resolves a locale service that arrives after apply", async () => {
  const world = makeWorld({ lateLocale: true, locale: "en" });
  assert.equal(findSlot(world).options.label(), "个人资料");

  world.enableLocale();
  assert.equal(findSlot(world).options.label(), "Profile");

  const { root, container } = await renderSection(world);
  assert.match(container.textContent, /Profile/);

  await act(async () => root.unmount());
  world.disposeAll();
});

test("an open page picks up a locale service that arrives later", async () => {
  const world = makeWorld({ lateLocale: true, locale: "en" });
  const { root, container } = await renderSection(world);
  assert.match(container.textContent, /个人资料/);
  assert.doesNotMatch(container.textContent, /Display name/);

  await act(async () => {
    world.enableLocale();
    await world.flushFrames(1);
  });

  assert.match(container.textContent, /Profile/);
  assert.match(container.textContent, /Display name/);
  assert.equal(findSlot(world).options.label(), "Profile");

  await act(async () => root.unmount());
  world.disposeAll();
});

test("arrow keys move into an already-open avatar menu", async () => {
  const world = makeWorld();
  const { root, container } = await renderSection(world);
  const change = buttonByText(container, "更换");

  await click(world, change);
  const menu = container.querySelector('[role="menu"]');
  assert.ok(menu, "Change opens the avatar menu");

  change.focus();
  await act(async () => {
    change.dispatchEvent(new world.window.KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true
    }));
  });
  assert.equal(world.document.activeElement, buttonByText(menu, "选择图片…"));

  change.focus();
  await act(async () => {
    change.dispatchEvent(new world.window.KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true
    }));
  });
  assert.equal(container.querySelector('[role="menu"]'), null);

  await act(async () => root.unmount());
  world.disposeAll();
});

test("the legacy plugin's keys are reported, never imported", async () => {
  const world = makeWorld({ legacy: true });
  const { root, container } = await renderSection(world);

  assert.match(container.textContent, /检测到旧插件/);
  assert.equal(world.storage.getItem(LEGACY_ALIAS_KEY), "Old name");
  assert.equal(world.storage.getItem(LEGACY_AVATAR_KEY), PNG);
  assert.equal(storedRecord(world), null);

  await act(async () => root.unmount());
  world.disposeAll();
});

test("a storage event from another window adopts only when the form is clean", async () => {
  const world = makeWorld({ record: { v: 1, name: "Alice", avatar: "" } });
  const { root, container } = await renderSection(world);
  const input = container.querySelector('input[type="text"]');
  assert.equal(input.value, "Alice");

  await act(async () => {
    world.storage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, name: "Bob", avatar: "" }));
    world.dispatchStorage();
    await Promise.resolve();
  });

  assert.equal(input.value, "Bob");
  assert.equal(labelOf(world).textContent, "Bob");

  await typeInto(world, input, "Carol");
  await act(async () => {
    world.storage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, name: "Dave", avatar: "" }));
    world.dispatchStorage();
    await Promise.resolve();
  });

  assert.equal(input.value, "Carol", "a dirty draft is never overwritten");
  assert.equal(labelOf(world).textContent, "Dave");
  assert.equal(buttonByText(container, "保存").disabled, false);
  assert.equal(buttonByText(container, "取消").disabled, false);

  await act(async () => root.unmount());
  world.disposeAll();
});

test("a storage event during image processing keeps the draft", async () => {
  const world = makeWorld({ record: { v: 1, name: "Alice", avatar: "" } });
  const { root, container } = await renderSection(world);
  const input = container.querySelector('input[type="text"]');
  stubImagePipeline(world, { delay: 200 });

  const file = new world.window.File([new Uint8Array([1, 2, 3])], "avatar.png", {
    type: "image/png"
  });
  await chooseFile(world, container, file);
  assert.match(container.textContent, /处理中/);

  await act(async () => {
    world.storage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, name: "Bob", avatar: "" }));
    world.dispatchStorage();
    await Promise.resolve();
  });

  assert.equal(input.value, "Alice", "the in-flight draft is not replaced");
  assert.match(container.textContent, /处理中/);
  assert.equal(labelOf(world).textContent, "Bob");

  await act(async () => root.unmount());
  world.disposeAll();
  await new Promise((resolve) => setTimeout(resolve, 220));
});

test("a failed save clears once another window stores the same draft", async () => {
  const world = makeWorld({ record: { v: 1, name: "Alice", avatar: "" } });
  const { root, container } = await renderSection(world);
  const input = container.querySelector('input[type="text"]');
  await typeInto(world, input, "Bob");

  const storageProto = world.window.Storage.prototype;
  const originalSetItem = storageProto.setItem;
  storageProto.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  try {
    await click(world, buttonByText(container, "保存"));
  } finally {
    storageProto.setItem = originalSetItem;
  }
  assert.match(container.textContent, /保存失败/);
  assert.equal(input.value, "Bob");

  await act(async () => {
    world.storage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, name: "Bob", avatar: "" }));
    world.dispatchStorage();
    await Promise.resolve();
  });

  assert.deepEqual(storedRecord(world), { v: 1, name: "Bob", avatar: "" });
  assert.equal(input.value, "Bob");
  assert.doesNotMatch(container.textContent, /保存失败/, "the error no longer describes storage");
  assert.equal(buttonByText(container, "保存").disabled, true);
  assert.equal(buttonByText(container, "取消").disabled, true);

  await act(async () => {
    input.dispatchEvent(
      new world.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
  });
  assert.doesNotMatch(container.textContent, /保存失败/);

  await act(async () => root.unmount());
  world.disposeAll();
});

test("an image that cannot be decoded shows an error and keeps the draft", async () => {
  const world = makeWorld();
  const { root, container } = await renderSection(world);
  stubImagePipeline(world, { fail: true });

  const file = new world.window.File([new Uint8Array([1, 2, 3])], "broken.png", {
    type: "image/png"
  });
  await chooseFile(world, container, file);

  assert.match(container.textContent, /这张图片读不出来/);
  assert.equal(container.querySelector("input[type=file]").value, "");
  assert.equal(storedRecord(world), null);

  await click(world, buttonByText(container, "保存"));
  assert.equal(storedRecord(world), null, "a failed decode never writes an avatar");

  await act(async () => root.unmount());
  world.disposeAll();
});

test("a source above the pixel cap is rejected before drawing", async () => {
  const world = makeWorld();
  const { root, container } = await renderSection(world);
  const pipeline = stubImagePipeline(world, { width: 8000, height: 6000 });

  const file = new world.window.File([new Uint8Array([1, 2, 3])], "huge.png", {
    type: "image/png"
  });
  await chooseFile(world, container, file);

  assert.equal(pipeline.draws.length, 0);
  assert.match(container.textContent, /图片太大/);
  assert.equal(storedRecord(world), null);

  await act(async () => root.unmount());
  world.disposeAll();
});

test("an empty WebP encode falls back to PNG", async () => {
  const world = makeWorld();
  const { root, container } = await renderSection(world);
  stubImagePipeline(world, {
    encode(type) {
      return type === "image/webp" ? "" : "data:image/png;base64,QUJD";
    }
  });

  const file = new world.window.File([new Uint8Array([1, 2, 3])], "avatar.png", {
    type: "image/png"
  });
  await chooseFile(world, container, file);

  assert.match(container.querySelector(".dsh-pp-avatar").style.backgroundImage, /data:image\/png/);
  await click(world, buttonByText(container, "保存"));
  assert.deepEqual(storedRecord(world), {
    v: 1,
    name: "",
    avatar: "data:image/png;base64,QUJD"
  });

  await act(async () => root.unmount());
  world.disposeAll();
});

test("disposing the plugin removes its settings section", () => {
  const world = makeWorld();
  assert.ok(findSlot(world), "the section is registered while the plugin runs");

  world.disposeAll();

  assert.equal(findSlot(world), null, "no section survives the plugin lifecycle");
});

test("a malformed stored value renders an empty form without throwing", async () => {
  const world = makeWorld({ raw: "{" });
  const { root, container } = await renderSection(world);
  assert.equal(container.querySelector('input[type="text"]').value, "");
  assert.equal(buttonByText(container, "保存").disabled, true);

  await act(async () => root.unmount());
  world.disposeAll();
});
