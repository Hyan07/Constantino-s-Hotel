const transitions = {
  pending: new Set(["confirmed", "cancelled", "no_show"]),
  confirmed: new Set(["pending", "checked_in", "cancelled", "no_show"]),
  checked_in: new Set(),
  cancelled: new Set(["pending", "confirmed"]),
  no_show: new Set(["pending", "confirmed"]),
};

export function canTransitionReservation(from, to) {
  return from === to || Boolean(transitions[from]?.has(to));
}
