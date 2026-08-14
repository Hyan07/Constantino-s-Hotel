const state = {
  user: null,
  environment: "development",
  currentRoute: "dashboard",
};

const listeners = new Set();

export function getState() { return state; }

export function setState(patch) {
  Object.assign(state, patch);
  for (const listener of listeners) listener(state);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function hasPermission(permission) {
  return Boolean(state.user?.permissions?.includes(permission));
}
