import { config } from "../config/app-config.js";

export function explainStartupError(error) {
  if (error?.code === "ECONNREFUSED") {
    return `O MySQL não respondeu em DB_HOST=${config.database.host} e DB_PORT=${config.database.port}. Confirme no Serviços do Windows se o serviço MySQL está iniciado.`;
  }
  if (error?.code === "ER_ACCESS_DENIED_ERROR") {
    return `O MySQL recusou DB_USER=${config.database.user}. Corrija DB_USER e DB_PASSWORD no arquivo .env.`;
  }
  if (error?.code === "ENOTFOUND") {
    return `O endereço DB_HOST=${config.database.host} não foi encontrado. Corrija DB_HOST no arquivo .env.`;
  }
  if (["ER_BAD_DB_ERROR", "ER_DBACCESS_DENIED_ERROR"].includes(error?.code)) {
    return `Não foi possível acessar DB_NAME=${config.database.name}. Verifique se DB_USER=${config.database.user} possui permissão para criar e usar esse banco.`;
  }
  if (error?.code === "EADDRINUSE") {
    return `A PORT=${config.port} já está em uso. Encerre o programa que ocupa essa porta ou altere PORT e APP_URL no arquivo .env.`;
  }
  return error?.message || "Ocorreu um erro sem mensagem durante a inicialização.";
}
