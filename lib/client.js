/**
 * dsh-plugin-custom-profile — browser half.
 *
 * This file is served verbatim by the client module loader, so it is already in
 * the `window.__ModuleLoader__.load({ id, factory })` form and needs no build.
 * Only `react` is required; the shell seeds it as a platform module.
 *
 * Two pieces:
 *   1. A `settings.section` page where the user edits a local name and avatar.
 *   2. A DOM adapter for the sidebar account launcher, which paints the saved
 *      values over the shipped account name and avatar.
 *
 * The account launcher is owned by @deepseek-ai/dsh-client-ui-settings-account
 * and has no extension slot. This file therefore writes through the launcher's
 * existing text node and paints the avatar as a background image; it never
 * removes or replaces a React-owned node. Every probe fails soft: a changed
 * selector means "no override", never a thrown error.
 */
window.__ModuleLoader__.load({
  id: "dsh-plugin-custom-profile",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    "use strict";

    var React = require("react");

    // --------------------------------------------------------------- constants

    var PLUGIN_ID = "plugin-custom-profile";
    var STORAGE_KEY = "dsh.plugin-profile.v1";
    var LEGACY_ALIAS_KEY = "dsh.account-display-name-edit.alias";
    var LEGACY_AVATAR_KEY = "dsh.account-display-name-edit.avatar";

    var MAX_NAME_CODE_POINTS = 32;
    var MAX_NAME_INPUT = 64;
    var AVATAR_SIZE = 128;
    var MAX_FILE_BYTES = 10 * 1024 * 1024;
    var MAX_SOURCE_PIXELS = 40 * 1024 * 1024;
    var MAX_STORED_CHARS = 512 * 1024;

    var TRIGGER_SELECTOR = 'button[aria-haspopup="menu"][data-signed-out]';
    var TRIGGER_FALLBACK = 'button[aria-haspopup="menu"][data-collapsed]';

    var LABEL_ATTR = "data-dsh-plugin-custom-profile-label";
    var AVATAR_ATTR = "data-dsh-plugin-custom-profile-avatar";
    var STYLE_ATTR = "data-dsh-plugin-custom-profile-style";

    var ALLOWED_TYPES = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/gif",
      "image/avif"
    ];

    var TEXT = {
      zh: {
        nav: "个人资料",
        title: "个人资料",
        description: "只改这台设备上左下角的显示名称和头像，不会修改或同步账号资料。",
        change: "更换",
        defaultAvatar: "默认头像",
        avatarLabel: "头像",
        choose: "选择图片…",
        clear: "清除头像",
        processing: "处理中…",
        avatarHint: "PNG / JPG / WebP / GIF / AVIF，最大 10 MB；自动居中裁成正方形并缩小到 128×128。",
        nameLabel: "显示名称",
        placeholder: "你的显示名称",
        nameHint: "留空保存即恢复账号原名。",
        nameTooLong: "名称最多 32 个字符，保存时会截取前 32 个。",
        reset: "恢复默认",
        cancel: "取消",
        save: "保存",
        saved: "已保存",
        resetHint: "点击保存后恢复默认显示。",
        saveFailed: "保存失败：本地存储已满或被禁用，刚才的改动没有写进去。",
        avatarType: "只支持 PNG、JPG、WebP、GIF、AVIF 图片。",
        avatarTooLarge: "图片太大，请换一张 10 MB 以内、尺寸小一些的。",
        avatarFailed: "这张图片读不出来，换一张试试。",
        signedOutHint: "仅在登录状态下替换左下角显示。",
        legacy: "检测到旧插件的自定义配置；本插件不会导入。建议停用旧插件，避免两边同时覆盖左下角。"
      },
      en: {
        nav: "Profile",
        title: "Profile",
        description: "Changes the name and avatar shown in this device's sidebar. Your account is not modified or synced.",
        change: "Change",
        defaultAvatar: "Default avatar",
        avatarLabel: "Avatar",
        choose: "Choose image…",
        clear: "Remove avatar",
        processing: "Processing…",
        avatarHint: "PNG, JPG, WebP, GIF or AVIF, up to 10 MB. Cropped square and resized to 128×128.",
        nameLabel: "Display name",
        placeholder: "Your display name",
        nameHint: "Save an empty value to show the account name again.",
        nameTooLong: "Names are limited to 32 characters; saving keeps the first 32.",
        reset: "Reset",
        cancel: "Cancel",
        save: "Save",
        saved: "Saved",
        resetHint: "Save to apply the reset.",
        saveFailed: "Could not save: local storage is full or disabled, so nothing was written.",
        avatarType: "Only PNG, JPG, WebP, GIF and AVIF images are supported.",
        avatarTooLarge: "That image is too large. Pick one under 10 MB and with fewer pixels.",
        avatarFailed: "That image could not be read. Try another one.",
        signedOutHint: "Applied to the sidebar only while signed in.",
        legacy: "An older plugin's custom profile was found. It is not imported; disable that plugin to avoid both plugins painting the sidebar."
      }
    };

    // ------------------------------------------------------------------ helpers

    /** Run `fn`, returning `fallback` if it throws. */
    function safe(fn, fallback) {
      try {
        return fn();
      } catch (_error) {
        return fallback;
      }
    }

    function requestFrame(callback) {
      return safe(function () {
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          return window.requestAnimationFrame(callback);
        }
        return setTimeout(callback, 16);
      }, 0);
    }

    function cancelFrame(handle) {
      safe(function () {
        if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(handle);
          return;
        }
        clearTimeout(handle);
      }, null);
    }

    function directSpans(element) {
      var spans = [];
      var children = element.children;
      if (children === undefined || children === null) return spans;
      for (var i = 0; i < children.length; i++) {
        if (children[i].tagName === "SPAN") spans.push(children[i]);
      }
      return spans;
    }

    // -------------------------------------------------------------------- locale

    var locale = null;
    var localeCtx = null;
    var logger = null;

    // The immediate bundle tier can apply before the locale service exists;
    // resolve it lazily as well, because the settings section reads it later.
    function localeService() {
      if (locale === null && localeCtx !== null) {
        locale =
          safe(function () {
            return localeCtx.get("locale");
          }, null) || null;
      }
      return locale;
    }

    function localeIdOf(snapshot) {
      if (typeof snapshot === "string") return snapshot;
      if (snapshot === null || typeof snapshot !== "object") return "";
      // The shipped LocaleRuntime snapshot is `{ active, locales, revision }`.
      // `id` / `locale` cover older or alternate faces.
      return String(snapshot.active || snapshot.id || snapshot.locale || "");
    }

    function currentLocaleId() {
      var service = localeService();
      var snapshot = null;
      safe(function () {
        if (service === null) return;
        snapshot =
          typeof service.getLocale === "function" ? service.getLocale() : service.getSnapshot();
      }, null);
      var id = localeIdOf(snapshot).toLowerCase();
      return id.indexOf("en") === 0 ? "en" : "zh";
    }

    function copy() {
      return TEXT[currentLocaleId()];
    }

    function subscribeLocale(listener) {
      var stopped = false;
      var innerDispose = function () {};
      var retry = 0;
      var attempts = 0;

      function attach() {
        var service = localeService();
        if (service === null || typeof service.subscribe !== "function") return false;
        var next = safe(function () {
          return service.subscribe(listener);
        }, null);
        innerDispose = typeof next === "function" ? next : function () {};
        return true;
      }

      // The settings page can mount before the locale service exists. Retry for
      // about two seconds, then stop; a later navigation subscribes again.
      function attempt(notify) {
        if (stopped) return;
        if (attach()) {
          if (notify) listener();
          return;
        }
        attempts += 1;
        if (attempts >= 120) return;
        retry = requestFrame(function () {
          retry = 0;
          attempt(true);
        });
      }

      attempt(false);
      return function () {
        stopped = true;
        if (retry !== 0) cancelFrame(retry);
        innerDispose();
      };
    }

    function useLocaleId() {
      return React.useSyncExternalStore(subscribeLocale, currentLocaleId, currentLocaleId);
    }

    function useCopy() {
      useLocaleId();
      return copy();
    }

    // ------------------------------------------------------------------- storage

    /**
     * Normalize a display name: drop control characters, collapse whitespace,
     * trim, and cap the result by Unicode code point so emoji count as one.
     */
    function sanitizeName(value) {
      if (typeof value !== "string") return "";
      var text = value.replace(/[\r\n\t]+/g, " ");
      text = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
      // Bidi overrides and zero-width characters. ZWJ (U+200D) and ZWNJ stay, so
      // emoji sequences are kept.
      text = text.replace(/[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, "");
      text = text.replace(/\s+/g, " ").trim();
      var points = Array.from(text);
      if (points.length > MAX_NAME_CODE_POINTS) points = points.slice(0, MAX_NAME_CODE_POINTS);
      return points.join("");
    }

    /**
     * Accept only the raster formats this plugin writes. A canvas-produced WebP
     * or PNG data URL is base64; the length check keeps a tampered record from
     * filling localStorage.
     */
    function isAvatarDataUrl(value) {
      if (typeof value !== "string" || value.length === 0 || value.length > MAX_STORED_CHARS) {
        return false;
      }
      return /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
    }

    function parseRecord(raw) {
      if (typeof raw !== "string" || raw.length === 0) return null;
      var value = safe(function () {
        return JSON.parse(raw);
      }, null);
      if (value === null || typeof value !== "object" || value.v !== 1) return null;
      var name = sanitizeName(value.name);
      var avatar = isAvatarDataUrl(value.avatar) ? value.avatar : "";
      if (name === "" && avatar === "") return null;
      return { name: name, avatar: avatar };
    }

    function readRecord() {
      var raw = safe(function () {
        return window.localStorage.getItem(STORAGE_KEY);
      }, null);
      return parseRecord(raw);
    }

    /**
     * Persist one record in one operation. Returns false when the write throws
     * (quota, disabled storage) or when a non-empty avatar is malformed, so the
     * caller can keep the form open and leave the previous display untouched.
     */
    function writeRecord(record) {
      var name = sanitizeName(record === undefined ? "" : record.name);
      var avatar = record === undefined ? "" : record.avatar;
      if (avatar !== "" && !isAvatarDataUrl(avatar)) return false;
      var raw = JSON.stringify({ v: 1, name: name, avatar: avatar });
      return safe(function () {
        if (name === "" && avatar === "") window.localStorage.removeItem(STORAGE_KEY);
        else window.localStorage.setItem(STORAGE_KEY, raw);
        return true;
      }, false);
    }

    function hasLegacyConfig() {
      return safe(function () {
        return (
          window.localStorage.getItem(LEGACY_ALIAS_KEY) !== null ||
          window.localStorage.getItem(LEGACY_AVATAR_KEY) !== null
        );
      }, false);
    }

    // ------------------------------------------------------------ in-memory state

    var state = { name: "", avatar: "" };
    var listeners = [];

    function getState() {
      return state;
    }

    function subscribeState(listener) {
      listeners.push(listener);
      return function () {
        var index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    }

    function emit() {
      var current = listeners.slice();
      for (var i = 0; i < current.length; i++) {
        safe(current[i], null);
      }
    }

    function loadState() {
      var record = readRecord();
      state = record === null ? { name: "", avatar: "" } : { name: record.name, avatar: record.avatar };
    }

    function saveState(next) {
      if (!writeRecord(next)) return false;
      state = { name: sanitizeName(next.name), avatar: isAvatarDataUrl(next.avatar) ? next.avatar : "" };
      emit();
      reconcile();
      return true;
    }

    // --------------------------------------------------------- sidebar DOM adapter

    var cachedTrigger = null;
    var observedTrigger = null;
    var triggerObserver = null;
    var bodyObserver = null;
    var styleTag = null;
    var frame = 0;
    var domAlive = false;
    var deferredDispose = null;
    var labelWritten = null;
    var labelShipped = null;
    var avatarApplied = null;
    var originalBackground = new WeakMap();
    var warned = {};

    function warnOnce(message) {
      if (warned[message] === true) return;
      warned[message] = true;
      safe(function () {
        if (logger !== null && typeof logger.warn === "function") {
          logger.warn(PLUGIN_ID + ": " + message);
        }
      }, null);
    }

    function findTrigger() {
      if (cachedTrigger !== null && cachedTrigger.isConnected) return cachedTrigger;
      cachedTrigger = safe(function () {
        return document.querySelector(TRIGGER_SELECTOR) || document.querySelector(TRIGGER_FALLBACK);
      }, null);
      return cachedTrigger;
    }

    /**
     * The account plugin writes `data-signed-out` on the launcher in both states.
     * `"false"` is the signed-in value; anything else (including an empty value)
     * means the launcher is signed out and must keep its shipped "more" label.
     */
    function isSignedOut(trigger) {
      var value = trigger.getAttribute("data-signed-out");
      if (value !== null) return value !== "false";
      return avatarNode(trigger) === null;
    }

    function labelNode(trigger) {
      var named = safe(function () {
        return trigger.querySelector(':scope > span[class*="_label"]');
      }, null);
      if (named !== null) return named;
      var spans = directSpans(trigger);
      var candidates = [];
      for (var i = 0; i < spans.length; i++) {
        var span = spans[i];
        if (span.getAttribute("data-avatar-status") !== null) continue;
        if (/_avatar/.test(String(span.className || ""))) continue;
        // A text-only span is a label; never fall back to a span that holds an
        // avatar image or icon, even if a future build drops the class suffix.
        if (safe(function () { return span.querySelector("img, svg"); }, null) !== null) continue;
        candidates.push(span);
      }
      return candidates.length > 0 ? candidates[candidates.length - 1] : null;
    }

    /**
     * Prefer the account plugin's own avatar markers. The old positional guess
     * ("the first span") can write into a label when a future build reorders
     * children, so the fallback requires an image or icon inside the span.
     */
    function avatarNode(trigger) {
      var named = safe(function () {
        return trigger.querySelector(':scope > span[data-avatar-status]');
      }, null);
      if (named !== null) return named;
      named = safe(function () {
        return trigger.querySelector(':scope > span[class*="_avatar"]');
      }, null);
      if (named !== null) return named;
      var spans = directSpans(trigger);
      for (var i = 0; i < spans.length; i++) {
        var span = spans[i];
        if (span.getAttribute(LABEL_ATTR) !== null) continue;
        if (safe(function () {
          return span.querySelector("img, svg");
        }, null) !== null) {
          return span;
        }
      }
      return null;
    }

    /**
     * Write through React's own text node. If the label ever grows element
     * children, leave it alone rather than destroying them.
     */
    function writeText(node, text) {
      var only = node.childNodes.length === 1 ? node.firstChild : null;
      if (only !== null && only.nodeType === 3) {
        only.nodeValue = text;
        return true;
      }
      if (node.children.length === 0) {
        node.textContent = text;
        return true;
      }
      return false;
    }

    function applyLabel(trigger) {
      var node = labelNode(trigger);
      if (node === null) {
        labelWritten = null;
        labelShipped = null;
        return;
      }

      if (isSignedOut(trigger)) {
        if (labelWritten !== null && node.textContent === labelWritten && labelShipped !== null) {
          writeText(node, labelShipped);
        }
        node.removeAttribute(LABEL_ATTR);
        labelWritten = null;
        labelShipped = null;
        return;
      }

      var current = node.textContent === null ? "" : String(node.textContent);

      if (state.name === "") {
        if (labelWritten !== null && current === labelWritten && labelShipped !== null) {
          writeText(node, labelShipped);
        }
        node.removeAttribute(LABEL_ATTR);
        labelWritten = null;
        labelShipped = null;
        return;
      }

      // A value different from what this plugin last wrote is React's current
      // shipped text (a refreshed profile, a different account, a sign-in).
      if (current !== labelWritten) labelShipped = current;

      if (current !== state.name) {
        if (!writeText(node, state.name)) {
          warnOnce("the sidebar label has unexpected children; custom name not applied");
          return;
        }
      }

      labelWritten = state.name;
      node.setAttribute(LABEL_ATTR, "1");
    }

    function clearAvatarPaint(node) {
      if (node === null || node.getAttribute(AVATAR_ATTR) !== "1") return;
      node.removeAttribute(AVATAR_ATTR);
      var original = originalBackground.get(node);
      node.style.backgroundImage = typeof original === "string" ? original : "";
    }

    function applyAvatar(trigger) {
      var node = avatarNode(trigger);
      if (node === null) {
        avatarApplied = null;
        return;
      }

      // A signed-out launcher keeps the shipped account chrome, even if a
      // future build reuses the avatar node instead of swapping in its icon.
      if (isSignedOut(trigger) || state.avatar === "") {
        clearAvatarPaint(node);
        avatarApplied = null;
        return;
      }

      if (node.getAttribute(AVATAR_ATTR) === "1" && avatarApplied === state.avatar) return;

      if (!originalBackground.has(node)) {
        originalBackground.set(node, node.style.backgroundImage || "");
      }
      node.setAttribute(AVATAR_ATTR, "1");
      node.style.backgroundImage = 'url("' + state.avatar + '")';
      avatarApplied = state.avatar;
    }

    var CSS_TEXT =
      "[" + AVATAR_ATTR + '="1"]>*{display:none !important}' +
      "[" + AVATAR_ATTR + '="1"]{background-size:cover !important;background-position:50% 50% !important;background-repeat:no-repeat !important}' +
      "[" + LABEL_ATTR + '="1"]{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      ".dsh-pp-root{width:100%;max-width:680px;min-width:0;font:inherit;color:var(--dsw-alias-label-primary,inherit)}" +
      ".dsh-pp-root *{box-sizing:border-box}" +
      ".dsh-pp-title{margin:0 0 10px;font-size:22px;line-height:28px;font-weight:600}" +
      ".dsh-pp-desc{margin:0;font-size:14px;line-height:22px;color:var(--dsw-alias-label-secondary,#808080)}" +
      ".dsh-pp-avatar-field{margin-top:30px}" +
      ".dsh-pp-avatar-row{display:flex;align-items:center;gap:20px;margin-top:12px}" +
      ".dsh-pp-avatar{flex:none;width:76px;height:76px;border-radius:50%;background-color:var(--dsw-alias-bg-skeleton,rgba(128,128,128,.18));background-position:50% 50%;background-size:cover;background-repeat:no-repeat;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary,#808080)}" +
      ".dsh-pp-avatar svg{width:32px;height:32px}" +
      ".dsh-pp-label{display:block;font-size:14px;line-height:20px;font-weight:500}" +
      ".dsh-pp-name-field{margin-top:28px}" +
      ".dsh-pp-name-box{display:block;border:1px solid var(--dsw-alias-border-l4,#808080);border-radius:16px;padding:15px 18px 13px;background:transparent}" +
      ".dsh-pp-name-box:focus-within{outline:2px solid var(--dsw-focus-ring-color,#4d6bfe);outline-offset:2px}" +
      ".dsh-pp-name-box .dsh-pp-label{font-size:13px;line-height:18px}" +
      ".dsh-pp-input{display:block;width:100%;margin:9px 0 0;padding:0;font:inherit;font-size:20px;line-height:28px;color:inherit;background:transparent;border:0;border-radius:0;outline:none;box-shadow:none}" +
      ".dsh-pp-input::placeholder{color:color-mix(in srgb, currentColor 42%, transparent)}" +
      ".dsh-pp-hint{margin:12px 0 0;font-size:12px;line-height:19px;color:var(--dsw-alias-label-secondary,#808080)}" +
      ".dsh-pp-name-field .dsh-pp-hint{margin-top:10px}" +
      ".dsh-pp-actions{display:flex;align-items:center;gap:12px;margin-top:30px}" +
      ".dsh-pp-spacer{flex:1 1 auto}" +
      ".dsh-pp-btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:8px 14px;border:0;border-radius:10px;cursor:pointer;font:inherit;font-size:14px;line-height:22px;color:inherit;background:transparent}" +
      ".dsh-pp-btn:disabled{cursor:default;opacity:.4}" +
      ".dsh-pp-btn:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#4d6bfe);outline-offset:2px}" +
      ".dsh-pp-btn--primary{min-width:70px;background:var(--dsw-alias-label-primary,#29292c);color:var(--dsw-alias-bg-base,#fff);font-weight:500}" +
      ".dsh-pp-btn--primary:hover:not(:disabled){opacity:.88}" +
      ".dsh-pp-btn--primary:disabled{background:var(--dsw-alias-bg-skeleton,rgba(128,128,128,.18));color:inherit;opacity:1}" +
      ".dsh-pp-btn--ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.18))}" +
      ".dsh-pp-reset{margin-left:-14px}" +
      ".dsh-pp-change-wrap{position:relative}" +
      ".dsh-pp-change{min-height:40px;padding:9px 18px;border-radius:12px;background:var(--dsw-alias-bg-skeleton,rgba(128,128,128,.18));font-weight:500}" +
      ".dsh-pp-menu{position:absolute;top:calc(100% + 8px);left:0;z-index:10;min-width:168px;padding:5px;border:1px solid var(--dsw-alias-border-l3,#808080);border-radius:10px;background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#29292c);box-shadow:0 8px 24px #0002}" +
      ".dsh-pp-menu .dsh-pp-btn{width:100%;justify-content:flex-start;padding:8px 10px;border-radius:6px;font-size:13px}" +
      ".dsh-pp-error{margin-top:12px;font-size:12px;line-height:19px;color:var(--dsw-alias-state-error-primary,#e5484d)}" +
      ".dsh-pp-status,.dsh-pp-note{margin-top:12px;font-size:12px;line-height:19px;color:var(--dsw-alias-label-secondary,#808080)}" +
      ".dsh-pp-file{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}";

    function injectStyles() {
      var existing = safe(function () {
        return document.querySelector("style[" + STYLE_ATTR + "]");
      }, null);
      if (existing !== null && existing.parentNode !== null) existing.parentNode.removeChild(existing);
      var tag = document.createElement("style");
      tag.setAttribute(STYLE_ATTR, "1");
      tag.textContent = CSS_TEXT;
      safe(function () {
        (document.head || document.documentElement).appendChild(tag);
      }, null);
      return tag;
    }

    function reconcile() {
      if (!domAlive) return;
      var trigger = findTrigger();
      observeTrigger(trigger);
      if (trigger === null) return;
      applyLabel(trigger);
      applyAvatar(trigger);
    }

    function schedule() {
      if (!domAlive || frame !== 0) return;
      frame = requestFrame(function () {
        frame = 0;
        reconcile();
      });
    }

    /**
     * React can write text identical to the custom name — most importantly when
     * the account's own display name equals it. After the plugin's write, a
     * same-value update is invisible to a text comparison, so read the mutation
     * record instead: replacing the custom text with the same string reports
     * that string as `oldValue`. Recording it lets restore and dispose put back
     * the account name instead of an earlier placeholder.
     */
    function noteSameTextWrites(trigger, records) {
      if (labelWritten === null) return;
      var node = labelNode(trigger);
      if (node === null || node.textContent !== labelWritten) return;
      for (var i = 0; i < records.length; i++) {
        var record = records[i];
        if (record.type !== "characterData") continue;
        if (record.target.parentNode !== node) continue;
        if (record.oldValue === labelWritten) labelShipped = labelWritten;
      }
    }

    function observeTrigger(trigger) {
      if (trigger === observedTrigger) return;
      if (triggerObserver !== null) {
        triggerObserver.disconnect();
        triggerObserver = null;
      }
      observedTrigger = trigger;
      if (trigger === null) return;
      triggerObserver = safe(function () {
        var observer = new MutationObserver(function (records) {
          if (observedTrigger !== null && observedTrigger.isConnected) {
            // This runs after React's commit but before the frame paints, so a
            // replaced label or avatar never shows the shipped value for a frame.
            noteSameTextWrites(observedTrigger, records);
            applyLabel(observedTrigger);
            applyAvatar(observedTrigger);
          } else {
            schedule();
          }
        });
        observer.observe(trigger, {
          childList: true,
          characterData: true,
          characterDataOldValue: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["data-signed-out", "data-avatar-status"]
        });
        return observer;
      }, null);
    }

    function onStorage(event) {
      if (event.key !== null && event.key !== STORAGE_KEY) return;
      var record = readRecord();
      state = record === null ? { name: "", avatar: "" } : { name: record.name, avatar: record.avatar };
      emit();
      reconcile();
    }

    function mountBody() {
      domAlive = true;
      styleTag = injectStyles();
      bodyObserver = safe(function () {
        var observer = new MutationObserver(function () {
          if (!domAlive) return;
          // The launcher itself can be replaced, taking its own observer with
          // it. This O(1) identity check catches exactly that; the trigger
          // observer owns every change inside a connected launcher.
          if (cachedTrigger === null || !cachedTrigger.isConnected) schedule();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        return observer;
      }, null);
      if (typeof window !== "undefined") {
        window.addEventListener("storage", onStorage, false);
      }
      reconcile();
      return function dispose() {
        domAlive = false;
        if (frame !== 0) {
          cancelFrame(frame);
          frame = 0;
        }
        if (bodyObserver !== null) {
          bodyObserver.disconnect();
          bodyObserver = null;
        }
        if (triggerObserver !== null) {
          triggerObserver.disconnect();
          triggerObserver = null;
        }
        if (typeof window !== "undefined") {
          window.removeEventListener("storage", onStorage, false);
        }

        var trigger = findTrigger();
        if (trigger !== null) {
          var label = labelNode(trigger);
          if (label !== null) {
            if (labelWritten !== null && label.textContent === labelWritten && labelShipped !== null) {
              writeText(label, labelShipped);
            }
            label.removeAttribute(LABEL_ATTR);
          }
          var avatar = avatarNode(trigger);
          if (avatar !== null && avatar.getAttribute(AVATAR_ATTR) === "1") {
            avatar.removeAttribute(AVATAR_ATTR);
            var original = originalBackground.get(avatar);
            avatar.style.backgroundImage = typeof original === "string" ? original : "";
          }
        }

        if (styleTag !== null && styleTag.parentNode !== null) styleTag.parentNode.removeChild(styleTag);
        styleTag = null;
        cachedTrigger = null;
        observedTrigger = null;
        labelWritten = null;
        labelShipped = null;
        avatarApplied = null;
      };
    }

    function mountDom() {
      if (typeof document === "undefined") return null;
      if (document.body !== null) return mountBody();
      if (document.readyState !== "loading") return null;
      var onReady = function () {
        document.removeEventListener("DOMContentLoaded", onReady);
        if (domAlive) return;
        var dispose = mountBody();
        if (typeof dispose === "function") deferredDispose = dispose;
      };
      document.addEventListener("DOMContentLoaded", onReady);
      return function () {
        document.removeEventListener("DOMContentLoaded", onReady);
        if (deferredDispose !== null) {
          deferredDispose();
          deferredDispose = null;
        }
      };
    }

    // -------------------------------------------------------------- image pipeline

    function allowedType(type) {
      return ALLOWED_TYPES.indexOf(String(type || "").toLowerCase()) >= 0;
    }

    function processAvatarFile(file, done) {
      if (file === null || typeof file !== "object") {
        done(null, "avatarFailed");
        return;
      }
      if (!allowedType(file.type)) {
        done(null, "avatarType");
        return;
      }
      if (typeof file.size === "number" && file.size > MAX_FILE_BYTES) {
        done(null, "avatarTooLarge");
        return;
      }
      if (typeof FileReader === "undefined") {
        done(null, "avatarFailed");
        return;
      }

      var reader;
      try {
        reader = new FileReader();
      } catch (_error) {
        done(null, "avatarFailed");
        return;
      }
      reader.onerror = function () {
        done(null, "avatarFailed");
      };
      reader.onload = function () {
        var dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (dataUrl === "" || dataUrl.indexOf("data:image/") !== 0) {
          done(null, "avatarFailed");
          return;
        }
        cropAndEncode(dataUrl, done);
      };
      try {
        reader.readAsDataURL(file);
      } catch (_error) {
        done(null, "avatarFailed");
      }
    }

    function cropAndEncode(dataUrl, done) {
      var image;
      try {
        image = new Image();
      } catch (_error) {
        done(null, "avatarFailed");
        return;
      }

      var settled = false;
      function finish(result, failure) {
        if (settled) return;
        settled = true;
        done(result, failure);
      }

      image.onerror = function () {
        finish(null, "avatarFailed");
      };
      image.onload = function () {
        var width = Number(image.naturalWidth || image.width || 0);
        var height = Number(image.naturalHeight || image.height || 0);
        if (!(width > 0) || !(height > 0)) {
          finish(null, "avatarFailed");
          return;
        }
        if (width * height > MAX_SOURCE_PIXELS) {
          finish(null, "avatarTooLarge");
          return;
        }

        var canvas;
        try {
          canvas = document.createElement("canvas");
        } catch (_error) {
          finish(null, "avatarFailed");
          return;
        }
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;

        var context = null;
        try {
          context = canvas.getContext("2d");
        } catch (_error) {
          context = null;
        }
        if (context === null) {
          finish(null, "avatarFailed");
          return;
        }

        var scale = Math.max(AVATAR_SIZE / width, AVATAR_SIZE / height);
        var drawWidth = Math.round(width * scale);
        var drawHeight = Math.round(height * scale);
        safe(function () {
          if ("imageSmoothingEnabled" in context) context.imageSmoothingEnabled = true;
          if ("imageSmoothingQuality" in context) context.imageSmoothingQuality = "high";
        }, null);

        try {
          context.drawImage(
            image,
            Math.round((AVATAR_SIZE - drawWidth) / 2),
            Math.round((AVATAR_SIZE - drawHeight) / 2),
            drawWidth,
            drawHeight
          );
        } catch (_error) {
          finish(null, "avatarFailed");
          return;
        }

        var encoded = "";
        try {
          encoded = canvas.toDataURL("image/webp", 0.9);
        } catch (_error) {
          encoded = "";
        }
        if (encoded === "" || encoded.indexOf("data:image/") !== 0) {
          try {
            encoded = canvas.toDataURL("image/png");
          } catch (_error) {
            encoded = "";
          }
        }
        if (!isAvatarDataUrl(encoded)) {
          finish(null, "avatarTooLarge");
          return;
        }
        finish(encoded);
      };

      try {
        image.src = dataUrl;
      } catch (_error) {
        finish(null, "avatarFailed");
      }
    }

    // ------------------------------------------------------------- settings page

    function UserIcon() {
      return React.createElement(
        "svg",
        {
          viewBox: "0 0 24 24",
          width: 20,
          height: 20,
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.6,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true"
        },
        React.createElement("circle", { cx: "12", cy: "8", r: "4" }),
        React.createElement("path", { d: "M4 21c.8-4.6 3.8-7 8-7s7.2 2.4 8 7" })
      );
    }

    function ProfileSection() {
      var saved = React.useSyncExternalStore(subscribeState, getState, getState);
      var text = useCopy();

      var nameState = React.useState(saved.name);
      var draftName = nameState[0];
      var setDraftName = nameState[1];

      var avatarState = React.useState(saved.avatar);
      var draftAvatar = avatarState[0];
      var setDraftAvatar = avatarState[1];

      var errorState = React.useState(null);
      var error = errorState[0];
      var setError = errorState[1];

      var statusState = React.useState(null);
      var status = statusState[0];
      var setStatus = statusState[1];

      var processingState = React.useState(false);
      var processing = processingState[0];
      var setProcessing = processingState[1];

      var menuState = React.useState(false);
      var menuOpen = menuState[0];
      var setMenuOpen = menuState[1];
      var changeRef = React.useRef(null);
      var menuRef = React.useRef(null);
      var changeWrapRef = React.useRef(null);
      var sectionId = React.useId();
      var fileRef = React.useRef(null);
      var generationRef = React.useRef(0);
      var mountedRef = React.useRef(true);
      var lastSavedRef = React.useRef(saved);

      var legacyState = React.useState(function () {
        return hasLegacyConfig();
      });
      var legacy = legacyState[0];

      React.useEffect(function () {
        mountedRef.current = true;
        return function () {
          mountedRef.current = false;
          generationRef.current += 1;
        };
      }, []);

      React.useEffect(function () {
        if (!menuOpen) return;
        var first = menuRef.current.querySelector("button:not(:disabled)");
        if (first !== null) first.focus();
        function dismissOutside(event) {
          if (changeWrapRef.current !== null && !changeWrapRef.current.contains(event.target)) {
            setMenuOpen(false);
          }
        }
        document.addEventListener("pointerdown", dismissOutside);
        document.addEventListener("focusin", dismissOutside);
        return function () {
          document.removeEventListener("pointerdown", dismissOutside);
          document.removeEventListener("focusin", dismissOutside);
        };
      }, [menuOpen]);

      function closeMenu() {
        setMenuOpen(false);
        if (changeRef.current !== null) changeRef.current.focus();
      }

      function onMenuKeyDown(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeMenu();
          return;
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].indexOf(event.key) === -1) return;
        event.preventDefault();
        var buttons = Array.from(menuRef.current.querySelectorAll("button:not(:disabled)"));
        var index = buttons.indexOf(document.activeElement);
        var next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
          (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        if (buttons[next]) buttons[next].focus();
      }

      // Another window's storage event can change `saved` while this page is
      // open. Adopt it only when the form has no unsaved edits and no image is
      // still being processed; otherwise the user's draft wins.
      React.useEffect(function () {
        var previous = lastSavedRef.current;
        var wasClean =
          !processing && draftName === previous.name && draftAvatar === previous.avatar;
        lastSavedRef.current = saved;
        if (wasClean && (saved.name !== previous.name || saved.avatar !== previous.avatar)) {
          generationRef.current += 1;
          setDraftName(saved.name);
          setDraftAvatar(saved.avatar);
          setProcessing(false);
          setError(null);
          setStatus(null);
        } else if (
          !processing &&
          sanitizeName(draftName) === saved.name &&
          draftAvatar === saved.avatar
        ) {
          // Another window stored exactly this draft after a failed write here;
          // the form is clean now, so a "save failed" message would be stale.
          if (error !== null) setError(null);
        }
      }, [saved]);

      var normalizedName = sanitizeName(draftName);
      var nameCount = Array.from(draftName).length;
      var tooLong = nameCount > MAX_NAME_CODE_POINTS;
      var dirty = normalizedName !== saved.name || draftAvatar !== saved.avatar;
      var canSave = dirty && !processing;
      var canCancel = dirty || error !== null || status !== null;
      var canReset = draftName !== "" || draftAvatar !== "";

      function chooseAvatar() {
        if (processing) return;
        closeMenu();
        var input = fileRef.current;
        if (input === null) return;
        safe(function () {
          input.click();
        }, null);
      }

      function clearAvatar() {
        closeMenu();
        generationRef.current += 1;
        setDraftAvatar("");
        setProcessing(false);
        setError(null);
        setStatus(null);
      }

      function onAvatarFile(event) {
        var input = event.target;
        var file = input !== null && input.files !== null && input.files.length > 0 ? input.files[0] : null;
        safe(function () {
          input.value = "";
        }, null);
        if (file === null) return;

        var generation = generationRef.current + 1;
        generationRef.current = generation;
        setProcessing(true);
        setError(null);
        setStatus(null);
        var activeText = text;

        processAvatarFile(file, function (result, failure) {
          if (!mountedRef.current || generation !== generationRef.current) return;
          setProcessing(false);
          if (result === null) {
            setError(activeText[failure] || activeText.avatarFailed);
            return;
          }
          setDraftAvatar(result);
          setError(null);
          setStatus(null);
        });
      }

      function onNameChange(event) {
        setDraftName(event.target.value);
        setError(null);
        setStatus(null);
      }

      function onNameKeyDown(event) {
        if (event.key !== "Enter" || event.shiftKey) return;
        var native = event.nativeEvent || event;
        if (native.isComposing === true || event.isComposing === true || native.keyCode === 229) {
          return;
        }
        event.preventDefault();
        save();
      }

      function save() {
        if (processing) return;
        var nextName = sanitizeName(draftName);
        var nextAvatar = draftAvatar;
        if (nextName === saved.name && nextAvatar === saved.avatar) {
          setDraftName(nextName);
          // A failed write can be overtaken by another window before this
          // Enter press; the draft is now what is stored, so the error is stale.
          if (error !== null) setError(null);
          return;
        }
        if (!saveState({ name: nextName, avatar: nextAvatar })) {
          setError(text.saveFailed);
          return;
        }
        setDraftName(nextName);
        setDraftAvatar(nextAvatar);
        setError(null);
        setStatus("saved");
      }

      function cancel() {
        generationRef.current += 1;
        setDraftName(saved.name);
        setDraftAvatar(saved.avatar);
        setProcessing(false);
        setError(null);
        setStatus(null);
      }

      function reset() {
        generationRef.current += 1;
        setDraftName("");
        setDraftAvatar("");
        setProcessing(false);
        setError(null);
        setStatus("reset");
      }

      var avatarStyle =
        draftAvatar === "" ? undefined : { backgroundImage: 'url("' + draftAvatar + '")' };

      return React.createElement(
        "div",
        { className: "dsh-pp-root" },
        React.createElement(
          "div",
          null,
          React.createElement("div", { className: "dsh-pp-title" }, text.title),
          React.createElement("div", { className: "dsh-pp-desc" }, text.description)
        ),
        React.createElement(
          "section",
          { className: "dsh-pp-avatar-field", "aria-labelledby": sectionId + "-avatar" },
          React.createElement("div", { className: "dsh-pp-label", id: sectionId + "-avatar" }, text.avatarLabel),
          React.createElement(
            "div",
            { className: "dsh-pp-avatar-row" },
            React.createElement(
              "div",
              { className: "dsh-pp-avatar", style: avatarStyle, role: "img", "aria-label": draftAvatar === "" ? text.defaultAvatar : text.avatarLabel },
              draftAvatar === "" ? React.createElement(UserIcon, null) : null
            ),
            React.createElement(
              "div",
              { className: "dsh-pp-change-wrap", ref: changeWrapRef },
              React.createElement(
                "button",
                {
                  ref: changeRef,
                  type: "button",
                  className: "dsh-pp-btn dsh-pp-change dsh-pp-btn--ghost",
                  onClick: function () { setMenuOpen(!menuOpen); },
                  onKeyDown: function (event) {
                    if (event.key === "Escape" && menuOpen) {
                      event.preventDefault();
                      event.stopPropagation();
                      setMenuOpen(false);
                      return;
                    }
                    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                    event.preventDefault();
                    if (menuOpen && menuRef.current !== null) {
                      var buttons = menuRef.current.querySelectorAll("button:not(:disabled)");
                      var target = event.key === "ArrowUp" ? buttons[buttons.length - 1] : buttons[0];
                      if (target) target.focus();
                      return;
                    }
                    setMenuOpen(true);
                  },
                  disabled: processing,
                  "aria-haspopup": "menu",
                  "aria-expanded": menuOpen,
                  "aria-controls": menuOpen ? sectionId + "-menu" : undefined,
                  "aria-describedby": sectionId + "-avatar-hint"
                },
                processing ? text.processing : text.change
              ),
              menuOpen ? React.createElement(
                "div",
                { className: "dsh-pp-menu", id: sectionId + "-menu", ref: menuRef, role: "menu", "aria-label": text.avatarLabel, onKeyDown: onMenuKeyDown },
                React.createElement(
                  "button",
                  { type: "button", role: "menuitem", className: "dsh-pp-btn dsh-pp-btn--ghost", onClick: chooseAvatar },
                  text.choose
                ),
                React.createElement(
                  "button",
                  { type: "button", role: "menuitem", className: "dsh-pp-btn dsh-pp-btn--ghost", onClick: clearAvatar, disabled: draftAvatar === "" },
                  text.clear
                )
              ) : null
            )
          ),
          React.createElement("input", {
            ref: fileRef,
            type: "file",
            className: "dsh-pp-file",
            accept: "image/png,image/jpeg,image/webp,image/gif,image/avif",
            onChange: onAvatarFile,
            tabIndex: -1,
            "aria-label": text.choose
          }),
          React.createElement("div", { className: "dsh-pp-hint", id: sectionId + "-avatar-hint" }, text.avatarHint)
        ),
        React.createElement(
          "div",
          { className: "dsh-pp-name-field" },
          React.createElement(
            "label",
            { className: "dsh-pp-name-box", htmlFor: sectionId + "-name" },
            React.createElement("span", { className: "dsh-pp-label" }, text.nameLabel),
            React.createElement("input", {
              id: sectionId + "-name",
              className: "dsh-pp-input",
              type: "text",
              value: draftName,
              maxLength: MAX_NAME_INPUT,
              spellCheck: false,
              autoComplete: "off",
              placeholder: text.placeholder,
              "aria-describedby": sectionId + "-name-hint" + (tooLong ? " " + sectionId + "-name-limit" : ""),
              onChange: onNameChange,
              onKeyDown: onNameKeyDown
            })
          ),
          React.createElement("div", { className: "dsh-pp-hint", id: sectionId + "-name-hint" }, text.nameHint + " " + text.signedOutHint),
          tooLong ? React.createElement("div", { className: "dsh-pp-error", id: sectionId + "-name-limit", role: "status" }, text.nameTooLong) : null
        ),
        legacy
          ? React.createElement("div", { className: "dsh-pp-note" }, text.legacy)
          : null,
        error !== null
          ? React.createElement("div", { className: "dsh-pp-error", role: "alert" }, error)
          : null,
        status !== null
          ? React.createElement(
              "div",
              { className: "dsh-pp-status", role: "status" },
              status === "saved" ? text.saved : text.resetHint
            )
          : null,
        React.createElement(
          "div",
          { className: "dsh-pp-actions" },
          React.createElement(
            "button",
            {
              type: "button",
              className: "dsh-pp-btn dsh-pp-btn--ghost dsh-pp-reset",
              onClick: reset,
              disabled: !canReset || processing
            },
            text.reset
          ),
          React.createElement("span", { className: "dsh-pp-spacer" }),
          React.createElement(
            "button",
            {
              type: "button",
              className: "dsh-pp-btn dsh-pp-btn--ghost",
              onClick: cancel,
              disabled: !canCancel || processing
            },
            text.cancel
          ),
          React.createElement(
            "button",
            {
              type: "button",
              className: "dsh-pp-btn dsh-pp-btn--primary",
              onClick: save,
              disabled: !canSave
            },
            text.save
          )
        )
      );
    }

    // ------------------------------------------------------------------ plugin face

    var name = "plugin-custom-profile";
    var inject = ["slots"];

    function apply(ctx) {
      localeCtx = ctx;
      locale =
        safe(function () {
          return ctx.get("locale");
        }, null) || null;
      logger =
        safe(function () {
          return ctx.logger;
        }, null) || null;
      loadState();

      var slotDispose = null;
      safe(function () {
        slotDispose = ctx.slots.inject("settings.section", function () {
          return ctx.slots.register(
            {
              name: "settings.section",
              id: PLUGIN_ID,
              order: 5,
              label: function () {
                return copy().nav;
              },
              inject: function () {
                return {};
              }
            },
            ProfileSection
          );
        });
      }, null);

      var mountDispose = safe(function () {
        return mountDom();
      }, null);

      if (typeof ctx.effect === "function") {
        ctx.effect(function () {
          return function () {
            safe(mountDispose, null);
            safe(slotDispose, null);
          };
        }, "dsh-plugin-custom-profile: sidebar display override and settings section");
      }
    }

    module.exports = { name: name, inject: inject, apply: apply };
    return module.exports;
  }
});
