const MODULE_ID = "player-token-bar";
const BAR_ID = "player-token-bar";

const SETTINGS = {
  COLOR: "barColor",
  OPACITY: "barOpacity",
  HIDE_IN_COMBAT: "hideInCombat",
  REMEMBER_POSITION: "rememberPosition",
  POSITION: "barPosition"
};

let previousHealth = new Map();
let pendingShakeIds = new Set();
let dragState = null;

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTINGS.COLOR, {
    name: "Bar Color",
    hint: "The background color of the player token bar.",
    scope: "client",
    config: true,
    type: String,
    default: "#111827",
    onChange: renderTokenBar
  });

  game.settings.register(MODULE_ID, SETTINGS.OPACITY, {
    name: "Bar Opacity",
    hint: "The opacity of the bar background only. Token images remain fully opaque.",
    scope: "client",
    config: true,
    type: Number,
    default: 0.82,
    range: { min: 0, max: 1, step: 0.05 },
    onChange: renderTokenBar
  });

  game.settings.register(MODULE_ID, SETTINGS.HIDE_IN_COMBAT, {
    name: "Hide During Combat",
    hint: "Hide the player token bar while combat is active.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: renderTokenBar
  });

  game.settings.register(MODULE_ID, SETTINGS.REMEMBER_POSITION, {
    name: "Remember Bar Position",
    hint: "Keep the dragged bar position when changing scenes or reloading Foundry.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: renderTokenBar
  });

  game.settings.register(MODULE_ID, SETTINGS.POSITION, {
    name: "Saved Bar Position",
    scope: "client",
    config: false,
    type: Object,
    default: { left: null, top: 8 }
  });
});

Hooks.once("ready", renderTokenBar);
Hooks.on("canvasReady", renderTokenBar);
Hooks.on("createToken", renderTokenBar);
Hooks.on("deleteToken", renderTokenBar);
Hooks.on("updateToken", (tokenDocument, changes) => {
  if (tokenDocument.parent?.id !== canvas.scene?.id) return;
  detectHealthChanges(tokenDocument);
  renderTokenBar();
});
Hooks.on("updateActor", (actor) => {
  const affectedTokens = canvas.tokens?.placeables?.filter(token => token.actor?.id === actor.id) ?? [];
  for (const token of affectedTokens) detectHealthChanges(token.document);
  renderTokenBar();
});
Hooks.on("createCombat", renderTokenBar);
Hooks.on("deleteCombat", renderTokenBar);
Hooks.on("combatStart", renderTokenBar);
Hooks.on("combatEnd", renderTokenBar);
Hooks.on("updateCombat", renderTokenBar);
Hooks.on("updateUser", renderTokenBar);
Hooks.on("closeSettingsConfig", renderTokenBar);

function getSceneTokens() {
  if (!canvas?.ready || !canvas.scene) return [];

  return canvas.tokens.placeables
    .filter(token => token.actor && isOwnedByAPlayer(token.actor))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function isOwnedByAPlayer(actor) {
  return game.users.some(user => {
    if (user.isGM) return false;
    const level = actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
    return Boolean(level);
  });
}

function getHealth(actor) {
  const candidates = [
    actor.system?.attributes?.hp,
    actor.system?.health,
    actor.system?.resources?.health,
    actor.system?.stats?.health,
    actor.system?.hp
  ];

  for (const hp of candidates) {
    if (!hp || typeof hp !== "object") continue;
    const value = numericValue(hp.value ?? hp.current);
    const max = numericValue(hp.max ?? hp.maximum);
    if (value !== null || max !== null) return { value, max };
  }

  return { value: null, max: null };
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function detectHealthChanges(tokenDocument) {
  const health = getHealth(tokenDocument.actor);
  const oldValue = previousHealth.get(tokenDocument.id);

  if (oldValue !== undefined && health.value !== null && health.value < oldValue) {
    pendingShakeIds.add(tokenDocument.id);
  }

  if (health.value !== null) previousHealth.set(tokenDocument.id, health.value);
}

function combatIsActive() {
  return Boolean(game.combat?.started);
}

function shouldHideBar() {
  return game.settings.get(MODULE_ID, SETTINGS.HIDE_IN_COMBAT) && combatIsActive();
}

function rgbaFromHex(hex, alpha) {
  const normalized = String(hex).replace("#", "").trim();
  const expanded = normalized.length === 3
    ? normalized.split("").map(char => char + char).join("")
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return `rgba(17, 24, 39, ${alpha})`;

  const integer = Number.parseInt(expanded, 16);
  const red = (integer >> 16) & 255;
  const green = (integer >> 8) & 255;
  const blue = integer & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getStartingPosition(bar) {
  const remember = game.settings.get(MODULE_ID, SETTINGS.REMEMBER_POSITION);
  const saved = game.settings.get(MODULE_ID, SETTINGS.POSITION) ?? {};

  if (remember && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
    return clampPosition(saved.left, saved.top, bar);
  }

  const left = Math.max(8, (window.innerWidth - bar.offsetWidth) / 2);
  return clampPosition(left, 8, bar);
}

function clampPosition(left, top, bar) {
  const maxLeft = Math.max(0, window.innerWidth - bar.offsetWidth);
  const maxTop = Math.max(0, window.innerHeight - bar.offsetHeight);
  return {
    left: Math.min(Math.max(0, left), maxLeft),
    top: Math.min(Math.max(0, top), maxTop)
  };
}

function renderTokenBar() {
  document.getElementById(BAR_ID)?.remove();
  if (!game?.ready || shouldHideBar()) return;

  const tokens = getSceneTokens();
  if (!tokens.length) return;

  const bar = document.createElement("div");
  bar.id = BAR_ID;
  bar.className = "player-token-bar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Player-owned scene tokens");

  const color = game.settings.get(MODULE_ID, SETTINGS.COLOR);
  const opacity = game.settings.get(MODULE_ID, SETTINGS.OPACITY);
  bar.style.backgroundColor = rgbaFromHex(color, opacity);

  for (const token of tokens) {
    const health = getHealth(token.actor);
    if (health.value !== null) previousHealth.set(token.id, health.value);

    const item = document.createElement("button");
    item.type = "button";
    item.className = "player-token-bar__token";
    item.dataset.tokenId = token.id;
    item.title = tooltipText(token, health);
    item.setAttribute("aria-label", item.title);

    const image = document.createElement("img");
    image.src = token.document.texture?.src || token.actor.img;
    image.alt = token.name;
    image.draggable = false;
    item.appendChild(image);

    item.addEventListener("dblclick", event => {
      event.preventDefault();
      event.stopPropagation();
      centerOnToken(token.id);
    });

    bar.appendChild(item);
  }

  document.body.appendChild(bar);
  const position = getStartingPosition(bar);
  setBarPosition(bar, position.left, position.top);
  attachDragHandlers(bar);

  for (const tokenId of pendingShakeIds) {
    const item = bar.querySelector(`[data-token-id="${CSS.escape(tokenId)}"]`);
    if (!item) continue;
    item.classList.remove("player-token-bar__token--shake");
    void item.offsetWidth;
    item.classList.add("player-token-bar__token--shake");
  }
  pendingShakeIds.clear();
}

function tooltipText(token, health) {
  if (health.value === null && health.max === null) return token.name;
  if (health.max === null) return `${token.name}\nHealth: ${health.value}`;
  if (health.value === null) return `${token.name}\nHealth: ? / ${health.max}`;
  return `${token.name}\nHealth: ${health.value} / ${health.max}`;
}

function centerOnToken(tokenId) {
  const token = canvas.tokens?.get(tokenId);
  if (!token) return;

  const center = token.center ?? {
    x: token.document.x + token.w / 2,
    y: token.document.y + token.h / 2
  };

  canvas.animatePan({ x: center.x, y: center.y, duration: 250 });
}

function attachDragHandlers(bar) {
  bar.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.target.closest(".player-token-bar__token")) return;

    const rect = bar.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };

    bar.setPointerCapture(event.pointerId);
    bar.classList.add("player-token-bar--dragging");
    event.preventDefault();
  });

  bar.addEventListener("pointermove", event => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const position = clampPosition(
      event.clientX - dragState.offsetX,
      event.clientY - dragState.offsetY,
      bar
    );
    setBarPosition(bar, position.left, position.top);
  });

  const finishDrag = async event => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragState = null;
    bar.classList.remove("player-token-bar--dragging");

    if (bar.hasPointerCapture(event.pointerId)) bar.releasePointerCapture(event.pointerId);

    if (game.settings.get(MODULE_ID, SETTINGS.REMEMBER_POSITION)) {
      await game.settings.set(MODULE_ID, SETTINGS.POSITION, {
        left: Number.parseFloat(bar.style.left),
        top: Number.parseFloat(bar.style.top)
      });
    }
  };

  bar.addEventListener("pointerup", finishDrag);
  bar.addEventListener("pointercancel", finishDrag);
}

function setBarPosition(bar, left, top) {
  bar.style.left = `${left}px`;
  bar.style.top = `${top}px`;
}

window.addEventListener("resize", () => {
  const bar = document.getElementById(BAR_ID);
  if (!bar) return;
  const rect = bar.getBoundingClientRect();
  const position = clampPosition(rect.left, rect.top, bar);
  setBarPosition(bar, position.left, position.top);
});
