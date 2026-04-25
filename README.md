# casa-finder

CLI em TypeScript pra buscar imóveis no [InfoImóveis](https://www.infoimoveis.com.br) bate **direto na API JSON** do site, gera **relatório HTML com fotos** pra triar visualmente, **persiste o histórico** entre runs e **cacheia tudo localmente** (a primeira run leva 2-3 min, runs subsequentes ficam abaixo de 1s).

Otimizado pro fluxo de quem precisa achar uma casa pra alugar **rápido** (em dias, não meses).

## Workflow recomendado

```bash
# 1) Setup
npm install

# 2) Definir os bairros que você NÃO quer ver (persiste entre runs)
npm run dev -- --block "Periférico"
npm run dev -- --block "Bairro Y"
npm run dev -- --blocked-list   # confere a lista

# 3) Primeira passada — popula cache + gera relatório (~2-3 min)
npm run dev -- \
  --price-min 2000 --price-max 4500 \
  --bedrooms-min 3 --parking-min 1 \
  --prefer casa-terrea \
  --max-pages 5 \
  --format html --output casas.html

# 4) Iterar filtros é INSTANTÂNEO (cache hit, <1s)
npm run dev -- --price-max 3500 --format html --output casas-baratas.html
npm run dev -- --bedrooms-min 4 --format html --output casas-grandes.html

# 5) Abre casas.html no browser
#    - Marca ⭐ os que gostou, ❓ talvez, ❌ os ruins (persiste no localStorage)
#    - Botões de sort: Score / Bairro / Preço / R$/m² / Área
#    - Filtros: Só favoritos / Talvez / Não marcados / Mostrar ocultos

# 6) Próximo dia — refresh pra pegar imóveis novos
npm run dev -- --price-min 2000 --price-max 4500 --bedrooms-min 3 \
  --refresh --only-new --format html --output casas-novas.html
```

## Flags

### Filtros
| Flag                         | Descrição                                  |
| ---------------------------- | ------------------------------------------ |
| `--transaction`              | `aluguel` ou `venda` (default: aluguel)    |
| `--property`                 | `casa`, `apartamento`, `sobrado`, etc.     |
| `--state`                    | UF (default: `ms`)                         |
| `--city`                     | slug da cidade (default: `campo-grande`)   |
| `--price-min` / `--price-max`| faixa de preço                             |
| `--area-min` / `--area-max`  | faixa de área construída (m²)              |
| `--bedrooms-min`             | quartos mínimos                            |
| `--parking-min`              | vagas mínimas                              |
| `--keyword`                  | palavra-chave em título/descrição          |
| `--neighborhoods`            | whitelist em ordem de preferência (CSV)    |
| `--exclude-neighborhoods`    | blacklist ad-hoc (CSV) — soma com persistida |
| `--max-pages`                | (no-op — a API não pagina de fato; mantido pra retrocompat) |
| `--limit`                    | top N resultados                           |

### Ranking
| Flag                         | Descrição                                  |
| ---------------------------- | ------------------------------------------ |
| `--prefer <type>`            | tipo preferido — bônus +8 no score (não filtra) |
| `--sort-by <key>`            | `score` (default), `neighborhood`, `price`, `area`, `ppsm` |

### Cache & estado
| Flag                         | Descrição                                  |
| ---------------------------- | ------------------------------------------ |
| `--refresh`                  | ignora cache e refaz todas as requests     |
| `--cache-clear`              | apaga `cache/` e sai                       |
| `--block <neighborhood>`     | adiciona bairro à blacklist persistida e sai |
| `--unblock <neighborhood>`   | remove bairro da blacklist e sai           |
| `--blocked-list`             | lista bairros bloqueados e sai             |
| `--blocked-clear`            | zera blacklist persistida e sai            |
| `--only-new`                 | só imóveis ainda não vistos em runs        |
| `--reset-seen`               | zera o histórico de vistos                 |

### Output
| Flag                         | Descrição                                  |
| ---------------------------- | ------------------------------------------ |
| `--no-enrich`                | pula fetch de detalhe (rápido, score raso) |
| `--format`                   | `terminal`, `json`, `csv`, `html`          |
| `--output`                   | arquivo de saída                           |

## Tipos de propriedade aceitos

`casa`, `casa-terrea`, `casa-condominio`, `apartamento`, `sobrado`, `kitnet`, `sitio`, `chacara`, `terreno`, `imovel-comercial`.

`casa` expande pra todos os tipos da API que são casa: `Casa-Térrea`, `Casa-Térrea-Condomínio`, `Sobrado`, `Sobrado-Condomínio` (uma request por tipo, mesclados no resultado).

## Como o score funciona (v2)

Cada imóvel ganha um score 0–100 com **breakdown por categoria**:

| Categoria      | Max  | Como pontua                                          |
| -------------- | ---- | ---------------------------------------------------- |
| **Preço**      | 30   | Custo total mensal (aluguel+cond+IPTU/12) vs `--price-max` |
| **R$/m²**      | 15   | Posição no ranking de R$/m² do conjunto retornado    |
| **Layout**     | 20   | Quartos / vagas / suítes acima do mínimo pedido      |
| **Bairro**     | 20   | Match na lista de bairros preferidos (peso pela posição) |
| **Área**       | 10   | Quão acima do `--area-min` está                      |
| **Amenidades** | 10   | Keywords positivas (quintal, churrasqueira, suíte, pet, etc.) em descrição/características |
| **Completude** | 5    | Tem foto, descrição rica, características listadas   |
| **Preferência**| 8    | Bônus quando `--prefer <tipo>` bate com o tipo da API |
| **Penalidades**| —    | "Sob consulta" (-25), sem foto (-8), sem área (-6), cond+IPTU > 40% do aluguel (-8) |

Ordenação default: score desc, desempate por menor custo total mensal. Use `--sort-by` pra outras chaves.

O HTML mostra o breakdown completo em "Mais detalhes" pra você ver exatamente por que cada imóvel pontuou X.

## Enriquecimento de detalhes

Por padrão o script faz **uma request extra por imóvel filtrado** pra pegar:

- Descrição completa (`informacoes` da API)
- IPTU (parseado do formato "R$ 88,28")
- Características estruturadas ("Suíte", "Churrasqueira", "Quintal"...)
- Infraestrutura próxima ("Supermercado", "Escola"...)
- Coordenadas (lat/lng) — gera link pro Google Maps no relatório
- Múltiplas fotos (até ~24 por imóvel)
- Anunciante (imobiliária)

Esses dados alimentam o score (categorias **Amenidades** e **Completude**) e o relatório HTML. Se quiser pular pra ir mais rápido, use `--no-enrich`.

Tempo estimado: ~1.5s por imóvel enriquecido (delay incluído pra não martelar a API).

## Relatório HTML

Visual de cards em grid responsivo, dark theme. Cada card tem:

- Foto principal + galeria expansível
- Score badge color-coded (>=80 verde, 65-79 verde-amarelado, 50-64 amarelo, <50 cinza)
- Layout (qtos / suítes / banhos / vagas / m²)
- Custo: aluguel + cond + IPTU = total mensal
- R$/m²
- Bairro + endereço
- Razões do score em uma linha
- "Mais detalhes" expande com descrição completa, características, infraestrutura, gallery, anunciante, breakdown completo do score
- Botões "Abrir anúncio" e "Mapa" (Google Maps via lat/lng)

**Triagem no browser** (estado persistido em `localStorage` do browser):
- ⭐ Gostei (borda dourada)
- ❓ Talvez (borda roxa)
- ❌ Esconder (cinza, escondido por padrão)

Toolbar permite filtrar por marca e ordenar por score / preço / R$/m² / área.

## Histórico (state.json)

`state.json` (ao lado do `package.json`) guarda:
- **`seen[]`** — IDs de todos os imóveis que já passaram pelos filtros em runs anteriores. Use `--only-new` pra ver só novos. `--reset-seen` zera.
- **`excludedNeighborhoods[]`** — bairros que você bloqueou via `--block`. Persiste entre runs e soma com `--exclude-neighborhoods` ad-hoc.

O estado de marcas (⭐❓❌) do HTML é independente — fica no `localStorage` do browser, persistido por origem.

## Cache (cache/)

Toda response da API (listagem e detalhe) é salva em `cache/<namespace>-<hash>.json`. Sem TTL — invalidação só via `--refresh` (ignora pra esta run e re-popula) ou `--cache-clear` (apaga tudo).

- Primeira run: ~2-3 min (popula cache, ~3MB pra 60 imóveis enriquecidos)
- Runs subsequentes: <1s (cache hit total)
- Cada run mostra `📦 cache: X hits / Y fresh` por fase

Exemplo de fluxo: rode uma vez de manhã com `--refresh`, depois itere filtros à vontade (`--price-max`, `--bedrooms-min`, `--prefer`, `--sort-by`) sem encostar na API.

## Por que não é mais scraping de HTML?

A v0.1 tentava parsear o HTML do site, mas a página é uma shell Next.js — os imóveis vêm via XHR de `apiw.infoimoveis.com.br`. Bater na API direto é muito mais robusto: dados estruturados, sem regex frágil, e o site pode mudar layout sem quebrar nada aqui.

## Quirks da API

A API `/imoveis` retorna **no máximo 20 imóveis por request**, mesmo declarando `total: 329` no response. Os parâmetros `page` e `limit` são ignorados silenciosamente. Pra extrair tudo, o código faz **bisecção por faixa de preço**: quando o total declarado é maior que o retornado, divide o range em duas metades e repete recursivamente até cada slice caber em ≤20 (granularidade mínima R$50).

Por isso `--price-min` e `--price-max` viraram essenciais — sem eles, a busca pega só os 20 do topo. Com eles, varremos a faixa toda em ~25-50 sub-requests (cacheadas individualmente).

## Por que `curl` em vez de `fetch` do Node?

O `undici` (HTTP client interno do Node) tem fingerprint TLS/HTTP distinto de browser real, e o site retorna 403 antes de qualquer header chegar. Curl tem fingerprint largamente whitelisted. Se em algum momento isso parar de funcionar, alternativas:

1. Trocar User-Agent em [fetcher.ts](fetcher.ts)
2. Usar `curl-impersonate` (binding TLS de Chrome real)
3. Último caso: Playwright com stealth plugin

## Aviso

Esse script faz scraping respeitoso (delay entre requests, User-Agent realista, sem paralelismo). É pra **uso pessoal**. Não distribua, não rode em servidor cloud (vai pegar ban rápido), não monte serviço público em cima disso.
