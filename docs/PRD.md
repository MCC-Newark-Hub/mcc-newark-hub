# PRD — MCC Newark Hub

**Versão:** 1.0 (a primeira versão é o que já está no ar) · **Data:** 17/10/2026 · **Dono do produto:** Leonard Alves
**Endereço:** https://mcc-newark-hub.vercel.app

> Como ler: ✅ pronto e em uso · ⚠️ existe, mas incompleto · ❌ não existe. Itens marcados com **(proposta)** foram sugeridos por quem escreveu o documento e ainda precisam da sua validação.

---

## 1. Resumo

O MCC Newark Hub nasceu para **tirar as inscrições dos seminários das planilhas** e dar aos secretários das igrejas uma ferramenta única, confiável e rápida. Das inscrições ele cresceu para um portal da Área Newark, Texas e Costa Oeste, com cadastro de membros, escalas, lista de louvores e organograma.

**O núcleo da v1 é Inscrições.** Tudo o mais é expansão que aproveita o mesmo cadastro.

---

## 2. Problema

As inscrições dos seminários eram feitas em **planilha**. O que dava errado:

| Dor | Consequência |
|---|---|
| Era difícil controlar o que foi atualizado | A quantidade de inscritos **não batia** |
| Não havia como saber **quem** alterou a planilha | Erros sem responsável, sem como corrigir a causa |
| No fechamento, o dinheiro arrecadado **não batia** com a planilha | Retrabalho e desconfiança nos números |
| Quando o pastor perguntava, achar a resposta era difícil: quantos inscritos, quanto arrecadado, quantos pagaram e quantos faltam, quantos por igreja, por classe e por grupo | Demora e respostas diferentes para a mesma pergunta |
| A planilha nem sempre estava atualizada e demorava a ser atualizada | Decisões com dado velho |
| Só os secretários faziam inscrições | **Sobrecarga** nos secretários, que viravam o gargalo |

**Quem sofre mais:** os secretários de igreja. **Quem paga o preço:** os participantes (espera, erro de cobrança) e os pastores (sem número confiável).

---

## 3. Para quem é

| Perfil | Papel no produto | Prioridade |
|---|---|---|
| **Secretário(a) de igreja** | Foco do produto: dar baixa em pagamentos, cancelar, reativar, corrigir dados, registrar quem não usou o portal. Vê só a sua igreja | **Foco** |
| **Participante** (membro ou visitante, e a família) | Se inscreve sozinho no portal. Facilidade é o objetivo | **Prioridade da experiência** |
| **Pastor** | Consulta os números sem precisar perguntar ao secretário (extra que alivia o secretário). Aprova exceções | Extra |
| **Líder de grupo (GA) e de equipe** | Acompanha a sua gente e a sua equipe | Apoio |
| **Tesoureiro(a)** | Fecha as contas do evento | Apoio |
| **Administrador** | Configura eventos, usuários, listas e acessos | Apoio |

---

## 4. Objetivos e como saber que deu certo **(proposta)**

1. **Os números batem.** O total arrecadado no sistema é igual ao caixa no fechamento, com zero divergência.
2. **Cada alteração tem dono.** Toda mudança fica registrada com o **nome da pessoa** (auditoria).
3. **O secretário deixa de ser o gargalo.** A maioria das inscrições é feita pelo próprio participante, e a pergunta do pastor se responde sozinha na tela.
4. **Dar baixa leva segundos.** O secretário confirma um pagamento na hora, sem planilha.
5. **Resposta rápida ao pastor:** inscritos, pagantes, pendentes, arrecadado e vagas, por igreja, classe e grupo, em uma tela.

*Ainda sem medição: hoje não há contador de tempo nem de origem da inscrição. Se esses números importam, precisam ser acrescentados.*

---

## 5. Fluxo ideal × o que existe hoje

| # | Passo ideal | Hoje |
|---|---|---|
| 1 | O participante entra no portal e inicia a inscrição | ✅ Portal público (`/events/register`), em português e inglês, também no celular |
| 2 | Preenche seus dados e os da família | ✅ Inscrição individual e por família, com busca de quem já está no cadastro |
| 3 | Recebe o comprovante, de preferência por e-mail | ⚠️ O comprovante aparece **na tela**. O e-mail só sai quando o **secretário clica em "reenviar"**; não sai sozinho |
| 4 | O portal diz que o pagamento é com o secretário, listando o da sua igreja | ⚠️ Diz que o pagamento é **presencial, com a equipe autorizada**, mas **não lista o secretário de cada igreja** |
| 5 | O participante paga | ✅ Presencial (dinheiro ou transferência registrada pela equipe). Online: ❌ ainda não é possível |
| 6 | O secretário atualiza na hora: pago | ✅ Dar baixa, marcar isento, cancelar, reativar |
| 7 | O participante recebe o comprovante de pagamento por e-mail | ❌ Não existe. Só o reenvio manual da confirmação, que já mostra o status "Pago" |

---

## 6. Funções da primeira versão (o que já está pronto)

### 6.1 Núcleo: Inscrições ✅

- **Portal do participante:** inscrição individual ou familiar, categorias por idade (0-3, Criança, Intermediário, Adolescente, Jovem, Adulto), taxa por categoria, aceite dos termos, número de inscrição, **consulta da própria inscrição** (`/events/lookup`).
- **Painel do secretário:** lista de inscrições com filtros; registrar alguém que não usou o portal; **dar baixa** (pago/isento); **cancelar e reativar**; corrigir dados; reenviar a confirmação por e-mail; aba de atrasados.
- **Regras do evento:** capacidade, **lista de espera** (promoção manual pelo secretário), **vaga excedente** com aprovação do pastor, prazo de pagamento com aviso e aceite, isenção automática de Pastor e Ungido, isenção de prazo para obreiros, equipes e suas famílias.
- **Aprovações do pastor:** inscrição fora do prazo, evento lotado, isenção, reativação e prorrogação de prazo.
- **Números:** resumo do evento (inscritos, pagantes, pendentes, arrecadado, espera), relatórios por igreja, classe e grupo, e painel de inscrições.
- **Tesouraria:** balanço (previsto × arrecadado), despesas, outras entradas, com acesso restrito.

### 6.2 No dia do evento ✅
Check-in por QR code (pelo atendente ou autoatendimento), crachás em PDF, planejamento da cozinha, equipes e escalas de trabalho.

### 6.3 Cadastro (Diretório) ✅
Membros (com filtros, inclusive por gênero), famílias, igrejas, polos e áreas, grupos de assistência (agrupados por igreja), funções, instrumentos e vozes, **importação por planilha**, **Organograma** (Área › Polo › Igreja, com responsáveis, desenho e exportação em imagem e PDF) e **Visão Geral** do cadastro, com acesso limitado por igreja.

### 6.4 Escalas e louvores ✅
Escala de portaria (calendário público por mês), agenda de oração 24h (pública, por lista) e **Lista de Louvores** do culto (catálogo, histórico, página pública para o Grupo de Louvor, exportação em imagem e PDF).

### 6.5 Acesso e controle ✅
- Login por **PIN de 4 dígitos**; perfis: administrador, secretaria, pastor, líder de GA, líder de equipe, tesoureiro; uma pessoa pode ter vários perfis.
- **Escopo por igreja** (o secretário e alguns pastores veem só as suas).
- **Auditoria:** toda alteração fica registrada com autor, ação e data; contas podem ser **desativadas** sem apagar o histórico.
- **Backup diário automático** do banco e **modo manutenção** para mudanças maiores.

---

## 7. O que fica de fora da v1

**Decidido:**
- ❌ **Pagamento online.** Hoje só presencial; é um desejo futuro, sem solução definida.

**Existe parcialmente e fica para depois:**
- ⚠️ **E-mail automático** de inscrição e de pagamento (hoje só o reenvio manual).
- ⚠️ **Indicar o secretário da igreja** no comprovante e na tela de confirmação.
- ⚠️ **Mudança automática para a lista de espera** quando o prazo vence. O código existe, mas **não está agendado**; hoje é manual.
- ⚠️ **Login por pessoa em todo o sistema:** já existem contas nominais, mas ainda restam contas compartilhadas em aposentadoria.

**Não existe e não é prioridade da v1:**
- ❌ Aplicativo nativo de celular (o portal funciona no navegador).
- ❌ Calendário de eventos e frequência de culto.
- ❌ Programação/agenda do seminário.
- ❌ Notificações por WhatsApp ou SMS.

*(Itens de "fora" além do pagamento online são uma proposta; confirme ou ajuste.)*

---

## 8. Requisitos não funcionais

- **Acessível em qualquer aparelho** (celular, tablet, computador), em **português e inglês**.
- **Rápido para o secretário:** as ações gravam na hora e a tela responde sem esperar o servidor.
- **Rastreável:** nenhuma alteração sem autor.
- **Resiliente:** backup diário; migrações versionadas no repositório.
- **Tecnologia:** React (Vite), Supabase (banco), Vercel (publicação e funções), e-mail pelo Resend.

---

## 9. Riscos e dívidas conhecidas

| Risco | Gravidade | Situação |
|---|---|---|
| Os **PINs podem ser lidos** por quem tem a chave pública do site (a verificação é feita no navegador e o banco não restringe a leitura) | **Alta** | Aberto. Exige verificar o PIN no servidor |
| O código-fonte (**repositório público**) contém **PINs de teste que ainda entram no sistema**, inclusive o de administrador | **Alta** | Aberto. Correção simples: desligar esse acesso de reserva fora do desenvolvimento |
| Contas compartilhadas (Secretaria por igreja, Admin) tiram o nome da auditoria | Média | Em andamento: contas nominais criadas, aposentadoria em curso |
| Modo manutenção ligado: só administrador e o Pr Nairon entram | Média | Precisa ser desligado para o lançamento |
| Algumas tabelas e funções existiam só no código, sem migração (já corrigido para três listas e o escopo por igreja) | Baixa | Revisar o restante |
| Dados incompletos (situação imigratória em 5 de 454 membros; 163 sem grupo) | Baixa | Acompanhar pela Visão Geral |

---

## 10. Próximos passos sugeridos **(proposta)**

1. **Segurança do login:** desligar os PINs de reserva do código e planejar a verificação do PIN no servidor.
2. **E-mail automático** de confirmação de inscrição e de confirmação de pagamento (passos 3 e 7 do fluxo ideal).
3. **Mostrar o secretário da igreja** no comprovante (passo 4).
4. **Concluir a troca para logins nominais** e desativar as contas compartilhadas.
5. **Agendar a mudança automática para a lista de espera** após validar o modo de teste.
6. **Desligar o modo manutenção** e abrir o app aos secretários.
7. Estudar uma forma de **pagamento online** que atenda às igrejas.

---

## 11. Perguntas em aberto

- Como medir o sucesso (item 4)? Há uma meta de tempo ou de percentual de inscrições feitas pelo participante?
- Quais itens da seção 7 realmente ficam fora da v1, além do pagamento online?
- O comprovante de pagamento por e-mail deve incluir quem recebeu o pagamento?
- O portal será usado também para eventos que não sejam seminários (batismo, retiros)?
