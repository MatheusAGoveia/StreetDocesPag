import { useState, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Plus, ShoppingBag } from 'lucide-react';
import { formatPrice, products as initialProducts, type Category, type Product } from './catalog';
import { useExperienceMotion } from './useExperienceMotion';
import './experience.css';
import './organic.css';

type Filter = 'Todos' | Category;

type Props = {
  filter: Filter;
  setFilter: Dispatch<SetStateAction<Filter>>;
  visible: Product[];
  products: Product[];
  onAdd: (id: string) => void;
  onSelect: (product: Product) => void;
  onCartOpen: () => void;
  cartCount: number;
};

const sceneDefinitions = [
  {
    small: 'MORANGO + CHOCOLATE',
    headline: <>DOCE<br />QUE <i>MARCA.</i></>,
    line: 'O encontro do morango com o chocolate. Uma pausa que pede replay.',
  },
  {
    small: 'PALHA ITALIANA DE CHOCOLATE',
    headline: <>PEQUENA<br />NA MÃO.<br /><i>GIGANTE</i><br />NA VONTADE.</>,
    line: 'Cremosa, intensa, feita para aquele momento só seu.',
  },
  {
    small: 'MARACUJÁ + CHOCOLATE',
    headline: <>AZEDINHO<br />QUE <i>VIRA</i><br />DESEJO.</>,
    line: 'Maracujá e chocolate em uma mistura que muda o clima.',
  },
];

function EditorialProductCard({ product, index, onSelect, onAdd }: { product: Product; index: number; onSelect: (product: Product) => void; onAdd: (id: string) => void }) {
  const soldOut = product.trackStock && (product.stock || 0) < 1;
  return (
    <article className="product-card editorial-product" style={{ '--accent': product.accent } as CSSProperties}>
      <button type="button" className="product-image-button" onClick={() => onSelect(product)} aria-label={`Ver detalhes de ${product.name}`}>
        <img src={product.image} alt={`${product.name}, ${product.flavor}`} loading="lazy" />
        <span className="editorial-product-index">SD / {String(index + 1).padStart(2, '0')}</span>
        <span className="editorial-product-view">VER DOCE <ArrowUpRight size={20} /></span>
      </button>
      <div className="product-info">
        <div>
          <span className="eyebrow dark">{product.category} <span className="small-star">✳</span> {product.flavor}</span>
          <h3>{product.name}</h3>
        </div>
        <div className="product-bottom">
          <span className="price">{formatPrice(product.priceCents)}</span>
          <button type="button" className="round-add" onClick={() => onAdd(product.id)} aria-label={soldOut ? `${product.name} esgotado` : `Adicionar ${product.name} ao carrinho`} disabled={soldOut}>{soldOut ? <span className="sold-out-mark">×</span> : <Plus size={20} strokeWidth={1.8} />}</button>
        </div>
      </div>
    </article>
  );
}

export default function ExperiencePage({ filter, setFilter, visible, products, onAdd, onSelect, onCartOpen, cartCount }: Props) {
  const [activeScene, setActiveScene] = useState(0);
  const scenes = sceneDefinitions.map((scene, index) => ({ ...scene, product: products.find((product) => product.id === initialProducts[index].id) || initialProducts[index] }));
  const filters: Filter[] = ['Todos', ...new Set(products.map((product) => product.category))];
  useExperienceMotion(setActiveScene);

  return (
    <main>
      <section className="cinema-hero" aria-label="Street Doces, doces artesanais">
        <div className="cinema-hero-photo"><img src="/images/hero.webp" alt="Doces artesanais com chocolate, mousse e brownie" fetchPriority="high" /></div>
        <div className="cinema-hero-shade" />
        <div className="cinema-hero-grid" aria-hidden="true" />
        <div className="cinema-hero-content container">
          <span className="cinema-overline"><span className="pulse-dot" /> STREET DOCES / BETIM, MG / DESDE AGORA</span>
          <h1 className="cinema-title"><span>DOCE</span><span>DE RUA<span className="cinema-period">.</span></span><span className="cinema-title-last">VONTADE DE FICAR.</span></h1>
          <div className="cinema-hero-details"><p>Palhas, mousses e brownies artesanais. Uma dose de atitude para transformar qualquer pausa.</p><a className="button button-coral cinema-primary" href="#cardapio">ESCOLHER MEUS DOCES <ArrowUpRight size={19} /></a></div>
        </div>
        <div className="cinema-edge-label" aria-hidden="true">DOCES QUE RESTAURAM SUA ESSÊNCIA ✳</div>
        <div className="cinema-bottom container"><span>01 — A EXPERIÊNCIA COMEÇA AQUI</span><span>CONTINUE DESCENDO <ArrowDown size={17} /></span></div>
        <svg className="cinema-portal" viewBox="0 0 120 120" aria-hidden="true"><path d="M60 4C80 2 92 16 98 29c7 14 20 19 18 37-3 18-16 25-22 39-7 16-20 13-36 12-18-1-22-13-39-17C4 96 4 76 6 61 8 44 20 41 26 25 33 10 44 6 60 4Z" /></svg>
      </section>

      <section className="manifesto-scene" id="sobre" aria-labelledby="manifesto-title">
        <div className="manifesto-frame container">
          <span className="scene-index">01 / A ESSÊNCIA</span>
          <div className="manifesto-composition">
            <h2 id="manifesto-title" className="manifesto-title"><span>O DIA</span><span>PEDE UMA</span><span className="manifesto-accent">PAUSA<span className="manifesto-dot">.</span></span></h2>
            <div className="manifesto-photo"><img src="/images/mano-brownie.webp" alt="Brownie de chocolate em detalhe" loading="lazy" /><span>UMA MORDIDA DE CADA VEZ ↗</span></div>
            <div className="manifesto-note"><span className="manifesto-note-star">✳</span><p>É o presente que acerta. A recompensa depois do corre. A vontade de repetir antes da última mordida.</p><strong>FEITO À MÃO EM BETIM<br />PRA SER LEMBRADO.</strong></div>
          </div>
          <div className="manifesto-baseline"><span>STREET DOCES / FEITO COM CARINHO</span><span>DESCE MAIS UM POUCO <ArrowDown size={16} /></span></div>
        </div>
        <svg className="manifesto-wave" viewBox="0 0 1440 170" preserveAspectRatio="none" aria-hidden="true"><path d="M0 170v-32c144 10 211-26 348-58 167-39 260 54 418 16 159-38 204-91 352-55 144 34 224-7 322-41v170H0Z" /></svg>
      </section>

      <section className="taste-sequence" aria-label="Três cenas de sabor">
        <div className="taste-stage">
          <div className="taste-heading"><span className="taste-mini-star">✳</span><span>02 / CENAS DE SABOR</span><span className="taste-heading-rule" /></div>
          <div className="taste-visual-disc" aria-hidden="true" />
          <div className="taste-stage-visual" aria-hidden="true">
            {scenes.map(({ product }, index) => <div className={`taste-frame taste-frame-${index + 1}`} key={product.id}><img src={product.image} alt="" /></div>)}
          </div>
          <div className="taste-stage-copy">
            {scenes.map(({ product, small, headline, line }, index) => <article className={`taste-copy taste-copy-${index + 1}`} key={product.id} aria-hidden={activeScene !== index}>
              <div className="taste-copy-top"><span>{String(index + 1).padStart(2, '0')} / 03</span><span>{small}</span></div>
              <h2>{headline}</h2>
              <p>{line}</p>
              <div className="taste-product-line"><div><span>O DOCE DA VEZ</span><strong>{product.name}</strong></div><span>{formatPrice(product.priceCents)}</span></div>
              <button type="button" className="taste-add" onClick={() => onAdd(product.id)} tabIndex={activeScene === index ? 0 : -1} disabled={!products.some((entry) => entry.id === product.id) || Boolean(product.trackStock && (product.stock || 0) < 1)}>{!products.some((entry) => entry.id === product.id) || (product.trackStock && (product.stock || 0) < 1) ? 'INDISPONÍVEL' : 'ADICIONAR AO CARRINHO'} <Plus size={19} /></button>
            </article>)}
          </div>
          <div className="taste-stage-bottom"><span>SCROLL PARA MUDAR A CENA</span><div className="taste-progress"><div className="taste-progress-fill" /></div><span>STREET DOCES</span></div>
          <svg className="taste-outro-wave" viewBox="0 0 1440 230" preserveAspectRatio="none" aria-hidden="true"><path d="M0 230V93c179-69 258 72 438 24 192-52 224-119 424-91 177 25 189 108 377 42 74-26 135-49 201-51v213H0Z" /></svg>
        </div>
      </section>

      <section className="rail-section" aria-label="Vitrine de sabores">
        <div className="rail-stage">
          <div className="rail-track">
            <div className="rail-intro"><span className="scene-index">03 / NO CORRE</span><h2>MAIS<br />UMA<br /><i>MORDIDA.</i></h2><p>Cada doce tem seu momento. <span className="rail-desktop-copy">Continue rolando para encontrar o seu.</span><span className="rail-mobile-copy">Arraste para o lado e encontre o seu.</span></p><div className="rail-arrow" aria-hidden="true"><ArrowRight size={31} /></div></div>
            {products.map((product, index) => <article className="rail-card" key={product.id}>
              <div className="rail-card-image"><img src={product.image} alt={`${product.name}, ${product.flavor}`} loading="lazy" /></div><span className="rail-card-index">{String(index + 1).padStart(2, '0')} / 05</span>
              <div className="rail-card-bottom"><div><span>{product.category} / {product.flavor}</span><h3>{product.name}</h3></div><strong>{formatPrice(product.priceCents)}</strong></div>
              <button className="rail-card-add" type="button" onClick={() => onAdd(product.id)} disabled={product.trackStock && (product.stock || 0) < 1}>{product.trackStock && (product.stock || 0) < 1 ? 'ESGOTADO' : 'COLOCAR NO CARRINHO'} <Plus size={18} /></button>
            </article>)}
            <div className="rail-outro"><span>CURTIU?</span><h2>O PRÓXIMO<br />É SEU.</h2><a href="#cardapio">VER CARDÁPIO COMPLETO <ArrowUpRight size={24} /></a></div>
          </div>
          <div className="rail-bottom-label"><span>STREET DOCES / TODOS OS SABORES</span><span className="rail-desktop-copy">↳ CONTINUE DESCENDO</span><span className="rail-mobile-copy">↳ ARRASTE PARA O LADO</span></div>
        </div>
      </section>

      <section className="shop-section" id="cardapio" aria-labelledby="shop-title">
        <svg className="shop-wave" viewBox="0 0 1440 150" preserveAspectRatio="none" aria-hidden="true"><path d="M0 150V68c129-40 207 21 336-10 140-34 233-58 377-4 145 53 253-49 397-38 137 10 226 69 330 25v109H0Z" /></svg>
        <div className="shop-layout container">
          <div className="shop-aside"><div className="shop-aside-inner"><span className="scene-index">04 / O CARDÁPIO</span><h2 id="shop-title">LEVA<br />PRA<br /><i>CASA.</i></h2><p>Seu doce favorito está por aqui. Veja os detalhes, escolha a quantidade e monte o pedido do seu jeito.</p><div className="shop-filter-label">ENCONTRE SEU SABOR <span>↙</span></div><div className="filter-row" role="group" aria-label="Filtrar produtos">{filters.map((entry) => <button type="button" key={entry} className={`filter-chip ${filter === entry ? 'active' : ''}`} onClick={() => setFilter(entry)}>{entry}<span>{entry === 'Todos' ? products.length : products.filter((product) => product.category === entry).length}</span></button>)}</div><span className="shop-aside-foot">FEITO À MÃO EM BETIM ✳</span></div></div>
          <div className="shop-products"><div className="product-grid">{visible.map((product) => <EditorialProductCard key={product.id} product={product} index={products.indexOf(product)} onSelect={onSelect} onAdd={onAdd} />)}</div><p className="image-disclaimer">* Imagens ilustrativas. Apresentação e disponibilidade podem variar. Consulte a loja ao pedir.</p></div>
        </div>
        <svg className="shop-exit-wave" viewBox="0 0 1440 160" preserveAspectRatio="none" aria-hidden="true"><path d="M0 160V95c168-22 235 69 413 7 176-62 250-60 415-4 161 55 230-45 409-59 75-6 135 12 203 45v76H0Z" /></svg>
      </section>

      <section className="epilogue-scene" id="como-funciona" aria-labelledby="epilogue-title">
        <div className="epilogue-photo"><img src="/images/ninho-abravanel.webp" alt="Palha italiana de leite ninho" loading="lazy" /></div>
        <div className="epilogue-overlay" />
        <div className="epilogue-content container"><span className="scene-index">05 / SUA VEZ</span><h2 id="epilogue-title">AGORA<br />É COM<br /><i>VOCÊ.</i></h2><div className="epilogue-side"><p>Escolheu? O resto a gente resolve com você. Retire em Betim ou informe seu endereço para combinarmos a entrega.</p><div className="epilogue-steps"><div><b>01</b><span>MONTE SEU CARRINHO</span></div><div><b>02</b><span>RETIRE OU RECEBA</span></div><div><b>03</b><span>CONFIRME COM A STREET</span></div></div>{cartCount > 0 ? <button type="button" className="button button-coral" onClick={onCartOpen}>VER MEU PEDIDO <ShoppingBag size={19} /></button> : <a href="#cardapio" className="button button-coral">ESCOLHER MEUS DOCES <ArrowUpRight size={19} /></a>}</div></div>
        <div className="epilogue-star" aria-hidden="true">✳</div>
      </section>
    </main>
  );
}
