# Fluxo Git e GitHub

## Branches permanentes

- `main`: código aprovado que alimenta a aplicação Hostinger de produção.
- `develop`: integração validada que alimenta a aplicação Hostinger DEV.

Proteja ambas no GitHub: exija pull request e CI verde; proíba push direto em `main`.

## Uma alteração comum

```bash
git switch develop
git pull --ff-only
git switch -c feature/calendario-melhorado
# editar e testar
npm run lint
npm test
git add caminho/dos/arquivos
git commit -m "feat: melhora calendário hoteleiro"
git push -u origin feature/calendario-melhorado
```

1. Abra PR de `feature/calendario-melhorado` para `develop`.
2. Aguarde CI, revisão e deploy automático no Hostinger DEV.
3. Valide usando somente dados fictícios do banco DEV.
4. Faça merge em `develop`.
5. Para uma versão, abra PR de `develop` para `main`.
6. Revise migrations, backup e checklist; depois faça merge.
7. O Hostinger de produção recebe `main`.

## Migrations

- inclua toda mudança de schema em um novo arquivo numerado;
- não altere migration que já chegou a DEV ou produção;
- mudanças devem ser retrocompatíveis durante o deploy;
- nunca inclua `DROP TABLE`, limpeza ampla ou seed de DEV em produção;
- confira `npm run migrate:status` nos ambientes.

## Correção urgente

Crie `hotfix/descricao` a partir de `main`, abra PR para `main`, valide CI e produção; depois faça merge equivalente em `develop` para evitar divergência.

## Rollback

Não reescreva histórico publicado. Reverta o commit ou merge problemático:

```bash
git switch main
git pull --ff-only
git switch -c revert/falha-versao
git revert SHA_DO_COMMIT
git push -u origin revert/falha-versao
```

Abra PR para `main`. Se a versão criou schema novo, preserve as colunas/tabelas e reverta apenas o comportamento; faça uma migration corretiva posterior. Restaure banco somente quando a análise confirmar corrupção e houver backup verificado.
