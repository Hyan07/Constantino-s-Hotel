-- Simplifica o ciclo de vida das reservas para cinco situações operacionais.
-- O histórico permanece intacto; apenas o estado atual é normalizado.

UPDATE reservations
SET status = 'confirmed'
WHERE status = 'awaiting_checkin';

UPDATE reservations
SET status = 'checked_in'
WHERE status = 'completed';

ALTER TABLE reservations
  MODIFY COLUMN status ENUM('pending','confirmed','cancelled','no_show','checked_in')
  NOT NULL DEFAULT 'pending';
