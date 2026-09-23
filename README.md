# Street Doces — loja e gestão

Loja online da Street Doces com catálogo, carrinho, conta de cliente, pedido por retirada ou entrega, acompanhamento em `/acompanhar`, pagamento Pix no site e painel administrativo em `/admin`. O visual da vitrine usa React, GSAP e ScrollTrigger. A API valida preços e grava cada solicitação antes de mostrar o número do pedido.

## Rodar localmente

```bash
npm install
npm run admin:setup -- --generate
npm run dev
```

O comando de configuração cria `.env.local` com e-mail, hash da senha e segredo de sessão. Ele mostra a senha gerada uma única vez; guarde-a. Para escolher sua própria senha, rode `npm run admin:setup -- --email=seu@email.com` e digite uma senha de pelo menos 12 caracteres. Reinicie o servidor depois de alterar as credenciais. Abra `http://127.0.0.1:5173/admin` para entrar.

O ambiente local guarda catálogo, configurações, pedidos e fotos em uma pasta de dados fora da raiz servida pelo Vite, em `~/.street-doces/<identificador-do-projeto>`. O caminho pode ser definido com `STREET_DATA_DIR`. Não apague essa pasta sem antes fazer backup dos pedidos.
Os dados locais são separados dos dados publicados na Vercel ou no Netlify; publicar o site não transfere pedidos locais automaticamente.

## O que o painel faz

- **Visão geral:** pedidos em andamento, faturamento registrado, movimento dos últimos sete dias e alertas de estoque.
- **Pedidos:** busca, filtro, detalhes, itens, contato, histórico, status, avisos de Pix para conferir, parceiro e frete; exportação CSV.
- **Produtos:** criação e edição de nome, categoria, descrição, preço, cor, etiqueta, visibilidade e imagem. Aceita upload JPG, PNG e WebP de até 3 MB ou URL HTTPS.
- **Estoque:** controle opcional por produto, quantidade e limite de alerta. O pedido é uma solicitação e não baixa unidades automaticamente; confirme disponibilidade antes de aceitar.
- **Clientes:** lista derivada de pedidos, agrupada pela conta nos novos pedidos, com e-mail, telefone, frequência e histórico de valores solicitados.
- **Finanças:** resultado por período, receita recebida, custo dos produtos vendidos, entregas, despesas, compras de insumos, fluxo líquido e margem por produto; exportação CSV. A visão geral mostra um atalho com o resultado do mês.
- **Custos e margens:** custo unitário direto ou ficha técnica por insumos. A ficha usa o custo médio ponderado das compras; o painel calcula lucro e margem sobre o preço atual.
- **Compras e insumos:** cadastro de insumos em gramas, mililitros ou unidades, entradas vinculadas a fornecedor, quantidade e valor pagos, histórico e exportação CSV.
- **Fornecedores:** contato, observações, situação ativa e total de compras por fornecedor.
- **Distribuição:** cada entrega mostra parceiro, endereço, frete cobrado e custo real. A diferença do frete entra no resultado quando o pedido foi pago.
- **Despesas:** lançamentos operacionais por categoria, data e fornecedor opcional. Compras e despesas podem ser anuladas com motivo; o registro continua no histórico.
- **Configurações:** identidade, Instagram, WhatsApp, chave Pix, endereço, retirada, entrega e pausa dos novos pedidos.

O painel recarrega pedidos automaticamente enquanto a aba de operação está aberta. A autenticação usa senha com `scrypt`, cookie assinado `HttpOnly` e sessão com duração de oito horas. A API exige login para ler dados de clientes ou alterar produtos, pedidos e configurações. O preço recebido do navegador nunca é usado para calcular o pedido.

### Como o resultado é calculado

O período usa a data de pagamento em Betim (`America/Sao_Paulo`). Somente pedidos marcados como **Pago** e não cancelados entram na receita. O lucro operacional é **receita dos produtos e fretes − custo dos produtos vendidos − custo real das entregas − despesas operacionais**. O fluxo líquido do período desconta **compras de insumos** no lugar do custo dos produtos vendidos, pois a compra é saída de caixa e o custo vendido é competência; descontar ambos no lucro contaria o mesmo insumo duas vezes. Esses números representam a operação registrada no painel, não saldo bancário nem demonstração fiscal.

O custo unitário calculado é gravado em cada novo pedido. Se um pedido antigo não tiver esse valor, o painel usa a ficha atual como **estimativa** e sinaliza a ocorrência. Se faltar custo de algum produto vendido ou de uma entrega paga, o lucro aparece como **A apurar**. Lance o custo real do parceiro em **Distribuição** e confira o crédito do Pix antes de marcar **Pago**. Compras mostram quantidade **adquirida**, não estoque disponível ou consumo automático; a aba **Estoque** continua sendo o controle de disponibilidade dos produtos.

## Acompanhamento e Pix

Antes de finalizar o primeiro pedido, o cliente cria uma conta com nome, WhatsApp, e-mail e senha (mínimo 12 caracteres), ou entra em uma conta existente. O cadastro inicia uma sessão automaticamente. A senha é guardada como hash `scrypt`; a sessão usa um token aleatório em cookie `HttpOnly`, `SameSite=Lax`, válido por 14 dias e revogado no logout. Novos pedidos recebem o ID da conta no servidor; a página `/acompanhar` lista somente os pedidos daquele cliente, inclusive em outro dispositivo após o login. O número e o ID isolados não dão acesso ao pedido.

Pedidos antigos, feitos antes das contas, mantêm seus links privados. Depois de entrar, o cliente pode vinculá-los à conta em `/acompanhar` com o número e telefone usados na compra. A página de acompanhamento mostra status, histórico, itens, forma de recebimento e valor. O cadastro não verifica o controle do e-mail e ainda não oferece recuperação de senha; configure um canal de suporte para esses casos antes de divulgar as contas.

O cliente pode cancelar o próprio pedido em `/pedido/...` enquanto ele estiver **Recebido** ou **Confirmado** e nenhum Pix tiver sido informado. O cancelamento exige um motivo, é registrado no histórico e interrompe o pagamento. Depois que o preparo começa ou o pagamento é informado, o site orienta o cliente a falar com a loja para que a equipe avalie produção e eventual reembolso.

Quando a equipe confirma o pedido, o Pix fica disponível. Para entrega, a equipe precisa informar o frete no painel antes disso. O valor do QR Code e do código Copia e Cola é calculado no servidor a partir dos itens e do frete. A chave inicial é `matheusaagd2@gmail.com` e pode ser alterada em **Configurações**. A chave usada fica registrada em cada pedido novo; confira se ela está cadastrada na conta que deve receber antes de divulgar a loja.

O botão **Já fiz o Pix** coloca o pagamento em **Pix a conferir**. Isso é apenas um aviso do cliente: a equipe precisa confirmar o crédito na instituição financeira e marcar **Pago** no painel. Sem integração com um provedor de pagamentos, o site não consegue detectar, validar ou estornar transações automaticamente. O valor do frete fica bloqueado após o aviso de pagamento para evitar divergência de valor.

## Publicar na Vercel

O site em `street-doces-pag.vercel.app` usa a função em `api/handler.mjs`. O `vercel.json` encaminha `/api/*` para essa função e as páginas `/admin`, `/acompanhar` e `/pedido/...` para o aplicativo React. O frontend sempre chama `/api/...` no próprio domínio; não há endpoint de `localhost` no código publicado.

No projeto da Vercel, abra **Storage → Create Database → Neon Postgres** e conecte o banco ao projeto, incluindo o ambiente **Production**. A integração fornece `DATABASE_URL`. Se você já tiver um PostgreSQL compatível, pode configurar `DATABASE_URL` manualmente em **Settings → Environment Variables**. A API cria automaticamente a tabela `street_doces_data` na primeira requisição, desde que o usuário do banco tenha permissão para criar tabelas. Ela guarda catálogo, configurações, contas, hashes de senha, sessões, pedidos e imagens em linhas JSONB privadas, com versão para impedir alterações concorrentes. Sem `DATABASE_URL`, a API informa erro 503 e não recebe pedidos.

Configure também estas três variáveis em **Settings → Environment Variables** para **Production**:

```text
ADMIN_EMAIL
ADMIN_PASSWORD_HASH
SESSION_SECRET
```

Gere os valores com `npm run admin:setup -- --email=seu@email.com`. Copie apenas os valores para a Vercel; não publique `.env.local` nem a URL de conexão. Após conectar o PostgreSQL e configurar as variáveis, faça um novo deploy, entre em `/admin`, confirme a chave Pix e realize um pedido de teste. Configure backups no provedor PostgreSQL. Os dados da Vercel são independentes dos dados locais e dos dados do Netlify.

## Publicar no Netlify (alternativa)

O `netlify.toml` já define a compilação, as rotas `/api/*` e a função de servidor. Em produção, os dados ficam em um armazenamento persistente [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/) associado ao site, incluindo os novos pedidos e fotos. Configure estas três variáveis em **Project configuration → Environment variables** antes do deploy:

```text
ADMIN_EMAIL
ADMIN_PASSWORD_HASH
SESSION_SECRET
```

Antes de publicar, execute `npm run admin:setup -- --email=seu@email.com` com uma senha nova e privada. Use os valores resultantes de `.env.local`; não publique esse arquivo. Faça um backup periódico dos dados no Netlify. Depois do deploy, entre em `/admin`, confirme os dados da loja e faça um pedido de teste antes de divulgar a URL.

O número de WhatsApp informado na conversa tinha oito dígitos após o DDD, então ele não foi ativado. Quando houver o número completo, configure-o na aba **Configurações** com 13 dígitos (`55` + DDD + número). Até lá, os pedidos são registrados no painel e o cliente acompanha pelo próprio site.

## Pendências de integração

- **InfinitePay:** adiada a pedido da loja. O Pix com QR Code estático e valor exato funciona diretamente no site; confirmação automática ainda depende da integração com um provedor de pagamentos.
- **99/Uber:** a escolha de parceiro e o valor do frete são registrados manualmente no pedido. A regra de comparação de cotações em `src/lib/shipping.mjs` está pronta, mas consulta e despacho dependem das credenciais e da disponibilidade das APIs dos parceiros.
- **Fotos oficiais:** as imagens atuais são ilustrativas. Substitua pelo upload no painel assim que houver fotografia da Street Doces.

## Verificar

```bash
npm test
npm run build
```

Os testes cobrem autenticação, preços calculados no servidor, registro e atualização de pedidos, cancelamento pelo cliente, acesso privado ao acompanhamento, geração do BR Code Pix, aviso e conferência de pagamento, alterações de catálogo, pausa de pedidos, upload de imagem e regra de cotação de entrega.
