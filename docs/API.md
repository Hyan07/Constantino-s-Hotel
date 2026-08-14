# API

Base: mesma origem da interface, prefixo `/api`. Todas as rotas, exceto autenticação pública, exigem cookie de sessão. Métodos mutáveis também exigem `X-CSRF-Token`.

Resposta de sucesso:

```json
{ "success": true, "data": {} }
```

Resposta de erro:

```json
{
  "success": false,
  "error": {
    "code": "ROOM_NOT_AVAILABLE",
    "message": "O quarto 101 já possui uma reserva nesse período.",
    "requestId": "..."
  }
}
```

## Rotas principais

| Método e rota | Finalidade |
|---|---|
| `POST /api/auth/login` | entrar com CPF e senha |
| `POST /api/auth/forgot-password` | solicitar recuperação |
| `POST /api/auth/reset-password` | redefinir por token |
| `GET /api/dashboard` | resumo operacional |
| `GET/POST /api/guests` | listar/criar hóspedes |
| `GET/PUT /api/guests/:id` | consultar/editar hóspede |
| `GET/POST /api/reservations` | listar/criar reservas |
| `GET/PUT /api/reservations/:id` | consultar/editar reserva |
| `GET /api/reservations/available` | disponibilidade por datas/capacidade |
| `GET /api/reservations/calendar` | calendário hoteleiro |
| `POST /api/reservations/:id/check-in` | check-in transacional |
| `POST /api/reservations/:id/cancel` | cancelar reserva |
| `GET /api/stays` | hospedagens ativas |
| `POST /api/stays/:id/charges` | lançar consumo |
| `POST /api/stays/:id/extend` | estender estadia |
| `POST /api/stays/:id/check-out` | check-out transacional |
| `POST /api/payments` | registrar pagamento |
| `GET /api/rooms` | mapa de quartos |
| `POST /api/rooms/:id/cleaning/start` | iniciar limpeza |
| `POST /api/rooms/:id/cleaning/complete` | concluir limpeza |
| `POST /api/rooms/:id/maintenance` | abrir manutenção |
| `GET /api/admin/*` | administração e auditoria |
| `GET /api/search?q=` | pesquisa global |

Listagens volumosas retornam `{items, pagination}` e aceitam `page`/`pageSize`. SQL usa parâmetros e valores monetários são números decimais em BRL.
