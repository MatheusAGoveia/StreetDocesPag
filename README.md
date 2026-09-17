# Street Doces — loja e gestão

Loja online da Street Doces com catálogo, carrinho, pedido por retirada ou entrega, acompanhamento em `/acompanhar`, pagamento Pix no site e painel administrativo em `/admin`. O visual da vitrine usa React, GSAP e ScrollTrigger. A API valida preços e grava cada solicitação antes de mostrar o número do pedido.

## Rodar localmente

```bash
npm install
npm run admin:setup -- --generate
npm run dev
```

O comando de configuração cria `.env.local` com e-mail, hash da senha e segredo de sessão. Ele mostra a senha gerada uma única vez; guarde-a. Para escolher sua própria senha, rode `npm run admin:setup -- --email=seu@email.com` e digite uma senha de pelo menos 12 caracteres. Reinicie o servidor depois de alterar as credenciais. Abra `http://127.0.0.1:5173/admin` para entrar.

O ambiente local guarda catálogo, configurações, pedidos e fotos em uma pasta de dados fora da raiz servida pelo Vite, em `~/.street-doces/<identificador-do-projeto>`. O caminho pode ser definido com `STREET_DATA_DIR`. Não apague essa pasta sem antes fazer backup dos pedidos.
Os dados locais são separados dos dados do Netlify; publicar o site não transfere pedidos locais automaticamente.

## O que o painel faz

- **Visão geral:** pedidos em andamento, faturamento registrado, movimento dos últimos sete dias e alertas de estoque.
- **Pedidos:** busca, filtro, detalhes, itens, contato, histórico, status, avisos de Pix para conferir, parceiro e frete; exportação CSV.
- **Produtos:** criação e edição de nome, categoria, descrição, preço, cor, etiqueta, visibilidade e imagem. Aceita upload JPG, PNG e WebP de até 3 MB ou URL HTTPS.
- **Estoque:** controle opcional por produto, quantidade e limite de alerta. O pedido é uma solicitação e não baixa unidades automaticamente; confirme disponibilidade antes de aceitar.
- **Clientes:** lista derivada de pedidos, com telefone, frequência e histórico de valores solicitados.
- **Configurações:** identidade, Instagram, WhatsApp, chave Pix, endereço, retirada, entrega e pausa dos novos pedidos.

O painel recarrega pedidos automaticamente enquanto a aba de operação está aberta. A autenticação usa senha com `scrypt`, cookie assinado `HttpOnly` e sessão com duração de oito horas. A API exige login para ler dados de clientes ou alterar produtos, pedidos e configurações. O preço recebido do navegador nunca é usado para calcular o pedido.

## Acompanhamento e Pix

Depois de registrar o pedido, o cliente recebe um link privado salvo no navegador. Também pode recuperá-lo em `/acompanhar` com o número do pedido e o mesmo telefone informado no checkout. A página mostra status, histórico, itens, forma de recebimento e valor. O link contém um token aleatório; pedidos e dados de clientes não ficam públicos por número ou ID.

Quando a equipe confirma o pedido, o Pix fica disponível. Para entrega, a equipe precisa informar o frete no painel antes disso. O valor do QR Code e do código Copia e Cola é calculado no servidor a partir dos itens e do frete. A chave inicial é `matheusaagd2@gmail.com` e pode ser alterada em **Configurações**. A chave usada fica registrada em cada pedido novo; confira se ela está cadastrada na conta que deve receber antes de divulgar a loja.

O botão **Já fiz o Pix** coloca o pagamento em **Pix a conferir**. Isso é apenas um aviso do cliente: a equipe precisa confirmar o crédito na instituição financeira e marcar **Pago** no painel. Sem integração com um provedor de pagamentos, o site não consegue detectar, validar ou estornar transações automaticamente. O valor do frete fica bloqueado após o aviso de pagamento para evitar divergência de valor.

## Publicar no Netlify

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

Os testes cobrem autenticação, preços calculados no servidor, registro e atualização de pedidos, acesso privado ao acompanhamento, geração do BR Code Pix, aviso e conferência de pagamento, alterações de catálogo, pausa de pedidos, upload de imagem e regra de cotação de entrega.
