import { dashboardRepository } from "../repositories/dashboard.repository.js";
import { addDays, toSqlDate } from "../utils/dates.js";

export const dashboardService = {
  async get() {
    const today = toSqlDate();
    const data = await dashboardRepository.summary(today);
    const total = Number(data.rooms.total || 0);
    const occupancy = total ? Math.round((Number(data.rooms.occupied || 0) / total) * 100) : 0;
    const rhythm = [];
    for (let index = 0; index < 7; index += 1) {
      const date = addDays(today, index);
      const occupied = new Set(
        data.calendarReservations
          .filter((row) => row.check_in_date <= date && row.check_out_date > date)
          .map((row) => row.room_id),
      ).size;
      rhythm.push({ date, occupancy: total ? Math.round((occupied / total) * 100) : 0 });
    }
    const pending = [
      ...data.roomPending.map((item) => ({
        type: "room", id: item.id, roomNumber: item.number, status: item.status,
        title: item.status === "maintenance" ? `Manutenção no quarto ${item.number}` : `Quarto ${item.number} · ${item.status === "cleaning" ? "Em limpeza" : "Aguardando limpeza"}`,
        description: item.maintenance_description || "Atualize a situação assim que a acomodação estiver pronta.",
      })),
      ...data.unassigned.map((item) => ({
        type: "reservation", id: item.id, title: "Reserva sem quarto definido",
        description: `${item.code} · entrada ${item.check_in_date}`,
      })),
      ...data.overdueBalances.map((item) => ({
        type: "reservation", id: item.id, title: "Pagamento pendente",
        description: `${item.code} · saldo de R$ ${Number(item.balance).toFixed(2).replace(".", ",")}`,
      })),
    ].slice(0, 8);
    return {
      occupancy: {
        percentage: occupancy,
        total,
        occupied: Number(data.rooms.occupied || 0),
        available: Number(data.rooms.available || 0),
        unavailable: Number(data.rooms.unavailable || 0),
      },
      arrivals: data.arrivals,
      departures: data.departures.map((item) => ({ ...item, balance: Number(item.total_amount) - Number(item.paid_amount) })),
      pending,
      rhythm,
    };
  },
};
