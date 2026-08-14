# Testes e validação

## Comandos locais

```powershell
npm run lint
npm test
npm run test:e2e
npm run check
```

Sem `RUN_E2E=true`, o E2E é marcado como ignorado para não tocar acidentalmente em um banco local. Nunca habilite E2E em produção.

## E2E com banco descartável

Crie um banco exclusivo, preencha `.env` com `APP_ENV=test`, rode `npm run setup:local` e então:

```powershell
$env:RUN_E2E="true"
npm run test:e2e
Remove-Item Env:RUN_E2E
```

O teste cria dados únicos e percorre login, hóspede, reserva, calendário, check-in, consumo, pagamento, check-out e limpeza.

## Checklist manual de aceite

1. instalar do zero com `npm ci`;
2. executar `setup:local` em banco vazio;
3. login e logout;
4. recuperação de senha com SMTP de teste;
5. dashboard e busca global;
6. CRUD de hóspede;
7. mapa de quartos;
8. reserva em cinco etapas e sem quarto;
9. lista, cards e calendário;
10. duas tentativas concorrentes para o mesmo quarto/período: somente uma deve vencer;
11. check-in antes da data deve falhar;
12. pagamento acima do saldo deve falhar;
13. check-out com saldo deve falhar;
14. check-out pago cria tarefa de limpeza;
15. iniciar/concluir limpeza libera quarto;
16. abrir/concluir manutenção;
17. Recepção não acessa Administração;
18. administrador acessa auditoria;
19. responsividade em 1366×768, 1024×768, 768×1024 e 390×844;
20. recarregar, reiniciar processo e confirmar persistência.

## CI

`.github/workflows/ci.yml` roda em PRs para `develop`/`main`. O job usa MySQL efêmero, variáveis exclusivas de teste, `npm ci`, setup, lint, testes e E2E. Nenhum segredo real aparece no workflow.
