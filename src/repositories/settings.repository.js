import { getPool } from "../database/pool.js";

export const settingsRepository = {
  async publicSettings() {
    const [rows] = await getPool().query(
      "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('hotel','payment_methods')",
    );
    return Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
  },
};
