# Relatório de validação

Data: 13/08/2026

## Executado neste pacote

| Verificação | Resultado |
|---|---|
| ESLint em todo JavaScript | aprovado, 0 erros |
| Testes unitários e integração HTTP | 8 aprovados, 0 falhas |
| Estrutura e scripts obrigatórios | aprovado |
| Sintaxe/importação dos módulos | aprovada pelo ESLint e Node Test Runner |
| Segurança HTTP sem sessão | API retorna 401 padronizado |
| Helmet/CSP/noindex local | cabeçalhos confirmados por teste HTTP |
| Política e hash de senha | aprovados |
| CPF, datas e transições de reserva | aprovados |
| Permissão administrativa | acesso e bloqueio aprovados |
| Primeiro uso do `setup:local` sem `.env` | cria o modelo e explica exatamente a próxima ação |
| Falha de conexão MySQL | mensagem em português identifica `DB_HOST` e `DB_PORT` |
| E2E completo | implementado e configurado na CI; não executado neste contêiner porque não há servidor MySQL instalado |

## E2E preparado para CI

O workflow cria MySQL efêmero, roda setup e testa:

1. login;
2. criação de categoria, quartos e hóspedes;
3. duas reservas concorrentes para o mesmo quarto — uma deve receber `201` e a outra `409`;
4. reserva e presença no calendário;
5. check-in;
6. consumo;
7. pagamento integral;
8. check-out;
9. início e conclusão de limpeza;
10. retorno do quarto para disponível.

## Validação necessária no computador/Hostinger com MySQL

Após preencher `.env`, execute:

```powershell
npm run setup:local
npm run dev
```

Em seguida, siga o checklist de `docs/TESTING.md`. A ausência de MySQL neste ambiente de geração impediu somente a execução material das migrations e do E2E; os testes correspondentes estão prontos para rodar no primeiro ambiente com MySQL e automaticamente no GitHub Actions.
