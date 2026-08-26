import { AppError } from "../utils/app-error.js";
import { booleanValue, requiredString } from "../validators/common.js";

export const defaultReservationSources = ["Direta", "Telefone", "WhatsApp", "Instagram", "Booking.com", "Expedia", "Agência / empresa"];

export const defaultStayPrint = {
  institutionalLabel: "Documento institucional",
  documentTitle: "Termo de Hospedagem",
  documentSubtitle: "Registro institucional da hospedagem",
  declaration: "Declaro que conferi os dados acima e estou ciente do período, da acomodação, das condições da hospedagem e dos valores registrados neste termo.",
  footerNote: "Documento interno da hospedagem; não substitui o registro na FNRH Digital quando aplicável.",
  showGuestContact: true,
  showValues: true,
  showCharges: true,
  showPayments: true,
  showOperational: true,
  showTerms: true,
  showPrivacy: true,
  showSignatures: true,
};

export function normalizeReservationSources(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) {
    throw new AppError("VALIDATION_ERROR", "Informe de 1 a 40 origens de reserva.");
  }
  const normalized = value.map((item) => requiredString(item, "Origem da reserva", { min: 2, max: 80 }));
  return [...new Set(normalized)];
}

export function normalizeStayPrint(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("VALIDATION_ERROR", "As configurações de impressão não são válidas.");
  }
  return {
    institutionalLabel: requiredString(value.institutionalLabel || defaultStayPrint.institutionalLabel, "Identificação institucional", { min: 2, max: 80 }),
    documentTitle: requiredString(value.documentTitle || defaultStayPrint.documentTitle, "Título do documento", { min: 2, max: 100 }),
    documentSubtitle: requiredString(value.documentSubtitle || defaultStayPrint.documentSubtitle, "Subtítulo do documento", { min: 2, max: 180 }),
    declaration: requiredString(value.declaration || defaultStayPrint.declaration, "Declaração do termo", { min: 10, max: 1800 }),
    footerNote: requiredString(value.footerNote || defaultStayPrint.footerNote, "Nota de rodapé", { min: 5, max: 600 }),
    showGuestContact: booleanValue(value.showGuestContact, true),
    showValues: booleanValue(value.showValues, true),
    showCharges: booleanValue(value.showCharges, true),
    showPayments: booleanValue(value.showPayments, true),
    showOperational: booleanValue(value.showOperational, true),
    showTerms: booleanValue(value.showTerms, true),
    showPrivacy: booleanValue(value.showPrivacy, true),
    showSignatures: booleanValue(value.showSignatures, true),
  };
}
