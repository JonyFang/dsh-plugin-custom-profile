import test from "node:test";
import assert from "node:assert/strict";
import {
  makeWorld,
  launcherHtml,
  PNG,
  STORAGE_KEY
} from "./harness.mjs";

function labelOf(world) {
  return world.document.querySelector('span[class*="_label"]');
}

function avatarOf(world) {
  return world.document.querySelector('span[class*="_avatar"]');
}

function freshLauncher(world, options = {}) {
  const holder = world.document.createElement("div");
  holder.innerHTML = launcherHtml(options);
  return holder.firstElementChild;
}

test("applies the saved name and avatar without removing React nodes", async () => {
  const world = makeWorld({ record: { v: 1, name: "Alice", avatar: PNG } });
  await world.settle();

  const label = labelOf(world);
  const avatar = avatarOf(world);
  assert.equal(label.textContent, "Alice");
  assert.equal(label.getAttribute("data-dsh-plugin-custom-profile-label"), "1");
  assert.equal(avatar.getAttribute("data-dsh-plugin-custom-profile-avatar"), "1");
  assert.match(avatar.style.backgroundImage, /data:image\/png;base64,QUJD/);
  assert.ok(avatar.querySelector("img"), "the shipped avatar node stays in the tree");
  assert.ok(
    world.document.querySelector("style[data-dsh-plugin-custom-profile-style]"),
    "one scoped stylesheet is installed"
  );
  world.disposeAll();
});

test("the shipped hashed account-row classes are matched", async () => {
  const world = makeWorld({
    body:
      '<div class="hjANda_root"><button type="button" class="hjANda_trigger" ' +
      'data-collapsed="false" data-signed-out="false" aria-label="菜单" ' +
      'aria-haspopup="menu" aria-expanded="false">' +
      '<span class="hjANda_avatar" data-avatar-status="ready"><img class="native" src="native.png" alt=""></span>' +
      '<span class="hjANda_label">181******40</span></button></div>',
    record: { v: 1, name: "Alice", avatar: PNG }
  });
  await world.settle();

  assert.equal(labelOf(world).textContent, "Alice");
  assert.match(avatarOf(world).style.backgroundImage, /data:image\/png;base64,QUJD/);
  world.disposeAll();
});

test("signed-out launcher keeps its shipped label and has no avatar to paint", async () => {
  const world = makeWorld({
    body: launcherHtml({ signedOut: true }),
    record: { v: 1, name: "Alice", avatar: PNG }
  });
  await world.settle();

  assert.equal(labelOf(world).textContent, "更多");
  assert.equal(world.document.querySelector("[data-dsh-plugin-custom-profile-avatar]"), null);
  world.disposeAll();
});

test("collapsed rail paints the avatar and never invents a label", async () => {
  const world = makeWorld({
    body: launcherHtml({ collapsed: true }),
    record: { v: 1, name: "Alice", avatar: PNG }
  });
  await world.settle();

  const avatar = avatarOf(world);
  assert.equal(avatar.getAttribute("data-dsh-plugin-custom-profile-avatar"), "1");
  assert.equal(world.document.querySelector("[data-dsh-plugin-custom-profile-label]"), null);
  assert.equal(avatar.textContent.includes("Alice"), false);
  world.disposeAll();
});

test("a replaced label is repainted before another frame", async () => {
  const world = makeWorld({ record: { v: 1, name: "Alice", avatar: PNG } });
  await world.settle();

  const old = labelOf(world);
  const next = world.document.createElement("span");
  next.className = "abc_label";
  next.textContent = "Refreshed account name";
  old.replaceWith(next);
  await world.settle();

  assert.equal(next.textContent, "Alice");
  assert.equal(next.getAttribute("data-dsh-plugin-custom-profile-label"), "1");
  world.disposeAll();
});

test("a text-node update from React is repainted", async () => {
  const world = makeWorld({ record: { v: 1, name: "Carol", avatar: "" } });
  await world.settle();
  const label = labelOf(world);

  label.firstChild.nodeValue = "A refreshed account label";
  await world.settle();

  assert.equal(label.textContent, "Carol");
  assert.equal(label.getAttribute("data-dsh-plugin-custom-profile-label"), "1");
  world.disposeAll();
});

test("clearing the override keeps the account name when it equals the custom name", async () => {
  const world = makeWorld({
    body:
      '<div class="abc_root"><button type="button" aria-haspopup="menu" ' +
      'data-signed-out="false" data-collapsed="false">' +
      '<span class="abc_avatar" data-avatar-status="ready"><img src="native.png" alt=""></span>' +
      '<span class="abc_label"></span></button></div>',
    record: { v: 1, name: "Alice", avatar: "" }
  });
  await world.settle();
  const label = labelOf(world);
  assert.equal(label.textContent, "Alice");

  // The shipped label loads empty, then shows the signed-in placeholder, then
  // the account name — which happens to be the saved custom name as well.
  label.firstChild.nodeValue = "已登录";
  await world.settle();
  assert.equal(label.textContent, "Alice");
  label.firstChild.nodeValue = "Alice";
  await world.settle();

  world.storage.removeItem(STORAGE_KEY);
  world.dispatchStorage();
  await world.settle();

  assert.equal(label.textContent, "Alice", "the real account name is restored");
  assert.equal(label.getAttribute("data-dsh-plugin-custom-profile-label"), null);
  world.disposeAll();
});

test("dispose keeps the account name when it equals the custom name", async () => {
  const world = makeWorld({
    body:
      '<div class="abc_root"><button type="button" aria-haspopup="menu" ' +
      'data-signed-out="false" data-collapsed="false">' +
      '<span class="abc_avatar" data-avatar-status="ready"><img src="native.png" alt=""></span>' +
      '<span class="abc_label"></span></button></div>',
    record: { v: 1, name: "Alice", avatar: "" }
  });
  await world.settle();
  const label = labelOf(world);
  label.firstChild.nodeValue = "已登录";
  await world.settle();
  label.firstChild.nodeValue = "Alice";
  await world.settle();

  world.disposeAll();

  assert.equal(label.textContent, "Alice");
  assert.equal(label.getAttribute("data-dsh-plugin-custom-profile-label"), null);
});

test("a replaced launcher is found again and repainted", async () => {
  const world = makeWorld({ record: { v: 1, name: "Alice", avatar: PNG } });
  await world.settle();

  const button = world.document.querySelector("button");
  button.replaceWith(freshLauncher(world));
  await world.settle();

  assert.equal(labelOf(world).textContent, "Alice");
  assert.equal(avatarOf(world).getAttribute("data-dsh-plugin-custom-profile-avatar"), "1");
  world.disposeAll();
});

test("a replaced avatar span receives the custom image", async () => {
  const world = makeWorld({ record: { v: 1, name: "Alice", avatar: PNG } });
  await world.settle();

  const old = avatarOf(world);
  const next = world.document.createElement("span");
  next.className = "abc_avatar";
  next.setAttribute("data-avatar-status", "ready");
  next.innerHTML = '<img class="abc_image" src="fresh.png" alt="">';
  old.replaceWith(next);
  await world.settle();

  assert.equal(next.getAttribute("data-dsh-plugin-custom-profile-avatar"), "1");
  assert.match(next.style.backgroundImage, /data:image\/png;base64,QUJD/);
  world.disposeAll();
});

test("clearing the record restores the shipped name and avatar", async () => {
  const world = makeWorld({ record: { v: 1, name: "Alice", avatar: PNG } });
  await world.settle();
  const label = labelOf(world);
  const avatar = avatarOf(world);

  world.storage.removeItem(STORAGE_KEY);
  world.dispatchStorage();
  await world.settle();

  assert.equal(label.textContent, "181******40");
  assert.equal(label.getAttribute("data-dsh-plugin-custom-profile-label"), null);
  assert.equal(avatar.getAttribute("data-dsh-plugin-custom-profile-avatar"), null);
  assert.equal(avatar.style.backgroundImage, "");
  world.disposeAll();
});

test("a storage event updates both the label and the avatar", async () => {
  const world = makeWorld({ record: { v: 1, name: "Alice", avatar: "" } });
  await world.settle();
  assert.equal(labelOf(world).textContent, "Alice");

  world.storage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, name: "Bob", avatar: PNG }));
  world.dispatchStorage();
  await world.settle();

  assert.equal(labelOf(world).textContent, "Bob");
  assert.match(avatarOf(world).style.backgroundImage, /data:image\/png;base64,QUJD/);
  world.disposeAll();
});

test("a signed-out transition gives the label back", async () => {
  const world = makeWorld({ record: { v: 1, name: "Alice", avatar: PNG } });
  await world.settle();
  const button = world.document.querySelector("button");
  const label = labelOf(world);

  button.setAttribute("data-signed-out", "true");
  label.textContent = "更多";
  await world.settle();

  assert.equal(label.textContent, "更多");
  assert.equal(label.getAttribute("data-dsh-plugin-custom-profile-label"), null);
  assert.equal(avatarOf(world).getAttribute("data-dsh-plugin-custom-profile-avatar"), null);
  assert.equal(avatarOf(world).style.backgroundImage, "");
  world.disposeAll();
});

test("names are normalized and capped at 32 code points", async () => {
  const world = makeWorld({
    record: { v: 1, name: "  A\n\tB  ", avatar: "" }
  });
  await world.settle();
  assert.equal(labelOf(world).textContent, "A B");
  world.disposeAll();

  const long = "x".repeat(40);
  const second = makeWorld({ record: { v: 1, name: long, avatar: "" } });
  await second.settle();
  assert.equal(labelOf(second).textContent, "x".repeat(32));
  second.disposeAll();

  const spoofed = makeWorld({
    record: { v: 1, name: "\u202E" + "x".repeat(32) + "\u200B", avatar: "" }
  });
  await spoofed.settle();
  assert.equal(labelOf(spoofed).textContent, "x".repeat(32));
  spoofed.disposeAll();

  const emoji = makeWorld({ record: { v: 1, name: "A\u200DB", avatar: "" } });
  await emoji.settle();
  assert.equal(labelOf(emoji).textContent, "A\u200DB");
  emoji.disposeAll();
});

test("a malformed record is ignored and a bad avatar is dropped", async () => {
  const broken = makeWorld({ raw: "{" });
  await broken.settle();
  assert.equal(labelOf(broken).textContent, "181******40");
  broken.disposeAll();

  const badAvatar = makeWorld({
    record: { v: 1, name: "Alice", avatar: "not-an-image" }
  });
  await badAvatar.settle();
  assert.equal(labelOf(badAvatar).textContent, "Alice");
  assert.equal(avatarOf(badAvatar).getAttribute("data-dsh-plugin-custom-profile-avatar"), null);
  badAvatar.disposeAll();
});

test("a label with element children is left alone", async () => {
  const world = makeWorld({
    body:
      '<div class="abc_root"><button type="button" aria-haspopup="menu" data-signed-out="false" data-collapsed="false">' +
      '<span class="abc_avatar" data-avatar-status="ready"><img src="native.png" alt=""></span>' +
      '<span class="abc_label"><b>Real</b></span></button></div>',
    record: { v: 1, name: "Alice", avatar: "" }
  });
  await world.settle();

  assert.equal(labelOf(world).textContent, "Real");
  assert.equal(labelOf(world).getAttribute("data-dsh-plugin-custom-profile-label"), null);
  world.disposeAll();
});

test("dispose restores the shipped display and disconnects observers", async () => {
  const world = makeWorld({ record: { v: 1, name: "Alice", avatar: PNG } });
  await world.settle();
  const label = labelOf(world);
  const avatar = avatarOf(world);

  world.disposeAll();

  assert.equal(label.textContent, "181******40");
  assert.equal(label.getAttribute("data-dsh-plugin-custom-profile-label"), null);
  assert.equal(avatar.getAttribute("data-dsh-plugin-custom-profile-avatar"), null);
  assert.equal(world.document.querySelector("style[data-dsh-plugin-custom-profile-style]"), null);

  label.textContent = "Changed after dispose";
  await world.settle();
  assert.equal(label.textContent, "Changed after dispose");
});

test("a page without the account launcher does nothing and does not throw", async () => {
  const world = makeWorld({ body: "<div>empty shell</div>", record: { v: 1, name: "Alice", avatar: PNG } });
  await world.settle();
  assert.equal(world.document.querySelector("[data-dsh-plugin-custom-profile-avatar]"), null);
  assert.ok(world.document.querySelector("style[data-dsh-plugin-custom-profile-style]"));
  world.disposeAll();
});
