const transitions = {
  pending: new Set(["confirmed", "awaiting_checkin", "cancelled", "no_show"]),
  confirmed: new Set(["pending", "awaiting_checkin", "checked_in", "cancelled", "no_show"]),
  awaiting_checkin: new Set(["pending", "confirmed", "checked_in", "cancelled", "no_show"]),
  checked_in: new Set(["completed"]),
  completed: new Set(),
  cancelled: new Set(),
  no_show: new Set(),
};

export function canTransitionReservation(from, to) {
  return from === to || Boolean(transitions[from]?.has(to));
}
