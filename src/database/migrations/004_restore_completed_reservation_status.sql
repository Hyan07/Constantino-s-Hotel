-- Restaura o estado final usado pelo fluxo de check-out.
-- A migration 003 pode ter convertido reservas finalizadas em checked_in;
-- o estado correto e reconstituido a partir da hospedagem concluida.

ALTER TABLE reservations
  MODIFY COLUMN status ENUM('pending','confirmed','cancelled','no_show','checked_in','completed')
  NOT NULL DEFAULT 'pending';

UPDATE reservations r
JOIN stays s ON s.reservation_id = r.id
SET r.status = 'completed'
WHERE s.status = 'completed'
  AND r.status <> 'completed';
