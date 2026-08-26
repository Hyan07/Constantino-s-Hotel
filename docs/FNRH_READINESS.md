# Preparação para FNRH Digital

Este projeto administra reservas, hospedagens, hóspedes, quartos, pagamentos e auditoria do hotel. Ele **não envia dados para a FNRH Digital atualmente**.

## Limite atual

- O termo interno de hospedagem não substitui a FNRH Digital quando o registro federal for aplicável.
- Nenhuma chave, token ou credencial da FNRH deve ser salva no repositório.
- Uma integração real deve usar somente a API e as credenciais oficiais disponibilizadas para o meio de hospedagem.

## Estrutura já preparada

- Dados de identificação e contato do hóspede.
- Reserva, período, ocupação, quarto e hospedagem.
- Check-in e check-out registrados com data/hora.
- Horários padrão do hotel e tempo estimado de limpeza/organização.
- Aviso resumido de privacidade configurável.
- Trilha de auditoria para operações sensíveis.

## Próxima etapa quando houver credencial oficial

1. Criar um adaptador de integração isolado do domínio de reservas/hospedagens.
2. Mapear os campos exigidos pela especificação oficial vigente, sem reutilizar textos livres quando houver domínio padronizado.
3. Registrar o identificador da transmissão, situação, tentativa, data/hora e erro técnico sem gravar segredos em logs.
4. Implementar reenvio idempotente para evitar duplicidade.
5. Manter o funcionamento normal do PMS quando o serviço externo estiver indisponível, deixando a pendência visível para um usuário autorizado.
6. Validar o fluxo em ambiente de homologação antes de habilitar em produção.

## Segurança e privacidade

- Dados pessoais devem aparecer apenas onde necessários para a operação.
- Listagens devem continuar mascarando documentos; documentos operacionais autorizados podem usar a identificação completa quando necessária.
- Logs técnicos não devem registrar CPF, e-mail, telefone, endereço, senhas, tokens ou cookies.
