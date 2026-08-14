import { settingsRepository } from "../repositories/settings.repository.js";
import { defaultReservationSources, defaultStayPrint } from "./configuration-options.js";

function objectValue(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

export const settingsService = {
  async getPublic() {
    const values = await settingsRepository.publicSettings();
    return {
      hotel: objectValue(values.hotel, {}),
      paymentMethods: objectValue(values.payment_methods, ["Pix", "Dinheiro", "Cartão de crédito", "Cartão de débito"]),
      reservationSources: objectValue(values.reservation_sources, defaultReservationSources),
      stayPrint: { ...defaultStayPrint, ...objectValue(values.stay_print, {}) },
    };
  },
};
