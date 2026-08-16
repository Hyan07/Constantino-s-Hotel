const transitions = {
  pending: new Set(["confirmed", "cancelled"]),
  confirmed: new Set(["pending", "checked_in", "cancelled", "no_show"]),
  checked_in: new Set(),
  cancelled: new Set(),
  no_show: new Set(),
};

export function canTransitionReservation(from, to) {
  return from === to || Boolean(transitions[from]?.has(to));
}
