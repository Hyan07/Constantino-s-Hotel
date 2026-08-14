# Operação, monitoramento e recuperação

## Rotina diária

- confira `/health` e dashboard;
- trate chegadas, saídas, saldo e quartos pendentes;
- não compartilhe contas de usuário;
- desative acessos de ex-colaboradores imediatamente;
- registre consumos e pagamentos no momento da operação.

## Logs

Logs estruturados incluem horário, nível, request ID, rota, status e duração. Senhas, tokens e cabeçalhos sensíveis são redigidos. Em produção, use Runtime Logs do hPanel; localmente veja o terminal do `npm run dev`.

## Backup

- backup automático conforme o plano Hostinger;
- backup manual antes de migration em produção;
- cópia externa periódica do banco;
- teste de restauração trimestral em ambiente isolado;
- documente responsável, data, duração e resultado do teste.

## Incidente

1. preserve logs e horário;
2. coloque novas operações em pausa se houver risco de inconsistência;
3. verifique `/health`, runtime logs e status MySQL;
4. identifique o último deploy/migration;
5. reverta código via PR; não apague schema;
6. restaure banco somente com autorização e backup validado;
7. troque segredos se houver suspeita de exposição;
8. registre causa, impacto e prevenção.

## Retenção e privacidade

CPF só aparece completo quando necessário no perfil autorizado e fica mascarado em listagens. Auditoria e histórico operacional não devem ser apagados por rotinas comuns. Pedidos de privacidade precisam seguir a política jurídica do hotel: preferir anonimização controlada e preservar registros cuja retenção seja obrigatória.
