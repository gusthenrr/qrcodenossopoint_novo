import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ShoppingCart, Utensils, Beer, Wine, Plus, Minus, X, Trash2, ChevronUp, Hamburger, ChefHat, Bell, Menu,QrCode,Copy, ArrowLeft } from 'lucide-react';
import { io, Socket } from "socket.io-client";
import { useNavigate,useSearchParams } from 'react-router-dom';

const API_URL = 'http://192.168.15.16:8000'

// Dados simulados do cardápio, que seriam recebidos via Socket.IO
// Agora com uma estrutura mais detalhada para as opções de customização
// === Tipos para as opções ===
type OptionItem = { nome: string; valor_extra: number; esgotado?: boolean };
type OptionGroup = {
  nome: string;
  ids?: string;
  options: OptionItem[];
  max_selected?: number; // default: 1 (single)
  obrigatorio?: boolean; // 👈 NOV
};
const formatBRL = (n: any) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(Number(n || 0));

  // Normaliza campos vindos do backend
const getPrice = (it: any) =>
  Number(it?.price ?? it?.preco ?? it?.valor ?? 0);

const getOriginalPrice = (it: any) =>
  Number(it?.original_price ?? it?.originalPrice ?? it?.preco_original ?? it?.precoOriginal ?? 0);

const hasPromo = (it: any) => {
  const p = getPrice(it);
  const op = getOriginalPrice(it);
  return op > 0 && p < op;
};


// Capitaliza cada palavra, preservando hífen (ex: "leite-condensado" -> "Leite-Condensado")
const toTitleCase = (s: string = ""): string => {
  return s
    .trim()
    .split(/\s+/)                      // divide por espaço(s)
    .map(word =>
      word
        .split("-")                    // trata partes com hífen
        .map(part => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part)
        .join("-")
    )
    .join(" ");
};
// Retorna true se alguma option tiver valor_extra >= 5
const hasAnyExtra = (rawOptions: any): boolean => {
  const groups = parseItemOptions(rawOptions);
  for (const g of groups) {
    if ((g?.options || []).some(o => (Number(o?.valor_extra) || 0) >= 5)) {
      return true;
    }
  }
  return false;
};
// Converte item.options (string JSON ou array) -> OptionGroup[]
// Converte qualquer formato comum em OptionGroup[]
// Converte qualquer formato comum em OptionGroup[]
const parseItemOptions = (raw: any): OptionGroup[] => {
  const toBool = (v: any): boolean => {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      return s === "1" || s === "true" || s === "sim";
    }
    return false;
  };

  const normalizeOption = (o: any): OptionItem => {
    if (o == null) return { nome: "", valor_extra: 0, esgotado: false };
    const nome = o.nome ?? o.name ?? String(o?.label ?? o ?? "");
    const extraRaw = o.valor_extra ?? o.extra ?? o.valor ?? 0;
    const valor_extra = Number(
      typeof extraRaw === "string" ? extraRaw.replace(",", ".") : extraRaw
    ) || 0;
    const soldRaw = o.esgotado ?? o.sold_out ?? o.indisponivel ?? 0;
    const esgotado = toBool(soldRaw);
    return { nome, valor_extra, esgotado };
  };

  const normalizeGroup = (g: any): OptionGroup | null => {
    if (!g) return null;
    const nome = g.nome ?? g.name ?? "Opções";
    const ids = g.ids ?? g.id ?? "";
    const maxRaw = g.max_selected ?? g.maxSelected ?? (g.multi ? Infinity : 1);
    const max_selected =
      Number.isFinite(maxRaw) && Number(maxRaw) > 0 ? Number(maxRaw) : 1;

    const obrigatorio = toBool(g.obrigatorio ?? g.required ?? g.isRequired ?? 0); // 👈 NOVO

    const optsArr = Array.isArray(g.options)
      ? g.options
      : Array.isArray(g.opcoes)
      ? g.opcoes
      : [];

    const options: OptionItem[] = optsArr.map(normalizeOption).filter(o => o.nome);
    if (options.length === 0) return null;

    return { nome, ids, options, max_selected, obrigatorio }; // 👈 NOVO
  };

  const toArray = (data: any): any[] => {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.groups)) return data.groups;
    if (data && typeof data === "object") return [data];
    return [];
  };

  if (raw == null || raw === "") return [];
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return toArray(data).map(normalizeGroup).filter(Boolean) as OptionGroup[];
  } catch {
    if (typeof raw === "string") {
      try {
        const data2 = JSON.parse(raw.replace(/'/g, '"'));
        return toArray(data2).map(normalizeGroup).filter(Boolean) as OptionGroup[];
      } catch {}
    }
    return [];
  }
};




// Seleção é sempre array de OptionItem por grupo (uniformiza single e multi)
type Selections = Record<string, OptionItem[]>;

// Gera uma string estável a partir das seleções (ordena grupos e opções,
// e usa só campos relevantes para identificar a combinação)
const stableOptionsJson = (sel: Selections | undefined): string => {
  if (!sel) return "noopts";
  const orderedGroups = Object.keys(sel).sort(); // ordena nomes dos grupos

  const norm = orderedGroups.map((g) => {
    const arr = sel[g] || [];
    // normaliza e ordena opções por nome e extra
    const opts = arr
      .map(o => ({
        n: o?.nome ?? "",
        x: Number(o?.valor_extra) || 0
      }))
      .sort((a, b) => {
        const byName = a.n.localeCompare(b.n);
        return byName !== 0 ? byName : a.x - b.x;
      });

    return { g, opts };
  });

  return JSON.stringify(norm);
};


// Soma dos extras com base nas seleções
const computeExtrasFromSelections = (sel: Selections | undefined): number => {
  if (!sel) return 0;
  return Object.values(sel).reduce((acc, arr) => {
    return acc + (arr || []).reduce((s, o) => s + (Number(o?.valor_extra) || 0), 0);
  }, 0);
};

// ID estável para o carrinho (ordena grupos e nomes das opções)


// Formata as seleções para exibir no carrinho/histórico
const formatSelections = (sel: Selections | undefined): string => {
  if (!sel) return '';
  const parts: string[] = [];
  for (const [group, arr] of Object.entries(sel)) {
    if (!arr || arr.length === 0) continue;
    parts.push(arr.map(o => o.nome).join(', '));
  }
  return parts.join(' | ');
};


const App = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [menu, setMenu] = useState([]);

    // === ESTADOS NOVOS ===
  const [showPayChoice, setShowPayChoice] = useState(false);
  const [showPixCheckout, setShowPixCheckout] = useState(false);

  const [pixLoading, setPixLoading] = useState(false);
  const [pixQR, setPixQR] = useState<string | null>(null);
  const [pixPayload, setPixPayload] = useState<string | null>(null);

  const currentOrderId = useMemo(() => `WEB${Date.now().toString(36).toUpperCase()}`, []);

  const [filteredMenu, setFilteredMenu] = useState([]);
  const [selectedMainCategory, setSelectedMainCategory] = useState('all');
  const [selectedSubCategory, setSelectedSubCategory] = useState('all');
  const [cart, setCart] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [customization, setCustomization] = useState({ quantity: 1, observations: '', options: {} });
  const [showOrderConfirmation, setShowOrderConfirmation] = useState(false);
  const [showAttendantBtn, setShowAttendantBtn] = useState(false);
  const [comanda,setComanda] = useState('')
  const subStripRef = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const keyParams = 'comanda'; 

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  // ⬇️ RESUMO DA COMANDA (vindo do backend via socket)
  const [comandaResumo, setComandaResumo] = useState<null | {
    preco_total: number;
    preco_pago: number;
    preco_a_pagar: number;
    dados: Array<any>;
    nomes: Array<{ nome: string }>;
    comanda: string;
  }>(null);

  const [isFetchingResumo, setIsFetchingResumo] = useState(false);



  const socketRef = useRef<Socket | null>(null);

  const subFilters = selectedMainCategory === 'comida'
      ? [
          { key: 'all', label: 'Tudo', icon: <Utensils size={18} /> },
          { key: 'aperitivo', label: 'Aperitivos', icon: <Utensils size={18} /> },
          { key: 'porcoes', label: 'Porções', icon: <Utensils size={18} /> },
          { key: 'hamburgueres', label: 'Hamburgueres', icon: <Hamburger size={18} /> },
          { key: 'acai', label: 'Açaí', icon: <Utensils size={18} /> },
          { key: 'combos', label: 'Combos', icon: <Utensils size={18} /> }
          
        ]
      : [
          { key: 'all', label: 'Tudo', icon: <Utensils size={18} /> },
          { key: 'drinks-alcoolicos', label: 'Drinks Alcoólicos', icon: <Wine size={18} /> },
          { key: 'drinks-sem-alcool', label: 'Drinks Sem Álcool', icon: <X size={18} /> },
          { key: 'cervejas', label: 'Cervejas', icon: <Beer size={18} /> },
          { key: 'outros', label: 'Outros', icon: <Utensils size={18} /> }
        ];

  const mainFilters = [
    { key: 'bebida', label: 'Bebida', icon: <Wine size={18} /> },
    { key: 'comida', label: 'Comida', icon: <Utensils size={18} /> }
  ];
  
  useEffect(() => {
    if (socketRef.current) return;
  
    const s = io(API_URL, {
      transports: ["websocket"], // pode adicionar ['websocket', 'polling'] se quiser buffer automático
      autoConnect: true,
    });
  
    socketRef.current = s;
  
    // logs úteis
    s.on("connect", () => {
      console.log("[socket] connected", s.id);
      // ✅ só emite após conectar

    });
  
    s.on("connect_error", (err) => {
      console.error("[socket] connect_error", err?.message, err);
    });
  
    s.on("error", (err) => {
      console.error("[socket] error", err);
    });
  
    s.on("disconnect", (reason) => {
      console.warn("[socket] disconnect", reason);
    });
  
    // recebe o menu
    s.on("menuData", (menuData) => {
      console.log("menuData recebido", menuData?.[0]);
      setMenu(menuData);
      setFilteredMenu(menuData);
      setIsLoading(false);
    });
  
    // cleanup
    return () => {
      try {
        s.off("menuData");
        s.off("connect");
        s.off("connect_error");
        s.off("error");
        s.off("disconnect");
        s.disconnect();
      } finally {
        socketRef.current = null;
      }
    };
  }, []);
  

  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;
  
    const handlePreco = (payload: any) => {
      console.log('payload',payload)
      if (!payload) return;
      
  
      // Se o backend mandar outra comanda, descartamos
      if (payload.comanda && String(payload.comanda) !== String(comanda)) {
        return;
      }
  
      setComandaResumo({
        preco_total: Number(payload.preco_total ?? 0),
        preco_pago: Number(payload.preco_pago ?? 0),
        preco_a_pagar: Number(payload.preco_a_pagar ?? 0),
        dados: Array.isArray(payload.dados) ? payload.dados : [],
        nomes: Array.isArray(payload.nomes) ? payload.nomes : [],
        comanda: String(payload.comanda ?? comanda ?? ''),
      });
      setIsFetchingResumo(false);
    };
  
    s.on("preco", handlePreco);
    return () => {
      s.off("preco", handlePreco);
    };
  }, [comanda]);

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      navigate(`/login?${keyParams}=${params.get(keyParams)}`, { replace: true });
    }
    else{
      fetch(`${API_URL}/validate_token_on_qr`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      })
      .then(response => response.json())
      .then(data => {
        if (!data.valid) {
          localStorage.removeItem("authToken");
          navigate(`/login?${keyParams}=${params.get(keyParams)}`, { replace: true });
        }
        else{
          setAuthToken(token)
          console.log('Token válido');
        }
      })
    }
    // se tiver token, não faz nada
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ✅ roda só uma vez
  
  useEffect(() => {
    const timer = setTimeout(() => setShowAttendantBtn(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isHistoryOpen) {
      setIsFetchingResumo(true);
      setComandaResumo(null);
      socketRef.current?.emit("get_cardapio", String(comanda));
    }
  }, [isHistoryOpen, comanda]);


  useEffect(() => {
    const numero = params.get(keyParams);
    if (numero){
    fetch(`${API_URL}/validate_table_number_on_qr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ numero }),
    })
    .then(response => response.json())
    .then(data => {
      if (!data.valid) {
        navigate('/error',{replace:true})
      }
      else{
        setComanda(String(data.tableNumber))
        socketRef.current?.emit('buscar_menu_data',false)
      }
    })
  }
    else{
      navigate('/error',{replace:true})
    }
    
  },[params,navigate])
  
  

  useEffect(() => {
    let newFilteredMenu = menu;
    if (selectedMainCategory !== 'all') {
      newFilteredMenu = newFilteredMenu.filter(item => item.categoria === selectedMainCategory);
    }
    if (selectedSubCategory !== 'all') {
      newFilteredMenu = newFilteredMenu.filter(item => item.subCategoria === selectedSubCategory);
    }
    setFilteredMenu(newFilteredMenu);
  }, [selectedMainCategory, selectedSubCategory, menu]);

  useEffect(() => {
  const el = subStripRef.current;
  if (!el) return;
  updateArrows();
  nudgeOnce();

  const onScroll = () => updateArrows();
  el.addEventListener('scroll', onScroll, { passive: true });

  const onResize = () => updateArrows();
  window.addEventListener('resize', onResize);

  // pequeno delay pro layout assentar
  const id = setTimeout(updateArrows, 200);

  return () => {
    clearTimeout(id);
    el.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
  };
}, [selectedMainCategory, subFilters.length]);



// Alterna seleção de uma opção dentro de um grupo
const toggleSelection = (
  prev: Selections,
  group: OptionGroup,
  opt: OptionItem
): Selections => {
  if (opt?.esgotado) return prev; // bloqueia seleção de esgotado

  const key = group.nome;
  const max = Number.isFinite(group.max_selected) && (group.max_selected as number) > 0
    ? (group.max_selected as number)
    : 1;

  const current = [...(prev[key] || [])];
  const idx = current.findIndex(o => o.nome === opt.nome);

  if (idx >= 0) {
    current.splice(idx, 1);
  } else {
    if (max === 1) {
      current.splice(0, current.length, opt);
    } else {
      if (current.length < max) {
        current.push(opt);
      } else {
        current.splice(current.length - 1, 1, opt);
      }
    }
  }

  return { ...prev, [key]: current };
};

  const updateArrows = () => {
    const el = subStripRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanLeft(scrollLeft > 2);
    setCanRight(scrollLeft + clientWidth < scrollWidth - 2);
};

  const nudgeOnce = () => {
  const key = 'subcatSwipeHintShown';
  try {
    if (!localStorage.getItem(key)) {
      const el = subStripRef.current;
      if (!el) return;
      setShowSwipeHint(true);
      el.scrollBy({ left: 60, behavior: 'smooth' });
      setTimeout(() => el.scrollBy({ left: -60, behavior: 'smooth' }), 500);
      setTimeout(() => setShowSwipeHint(false), 2500);
      localStorage.setItem(key, '1');
    }
  } catch {}
};


const handleOpenModal = (item: any) => {
  setSelectedItem(item);

  const groups: OptionGroup[] = parseItemOptions(item.options);
  const initial: Selections = {};

  for (const g of groups) {
    const available = (g.options || []).filter(o => !o.esgotado);
    const zeroExtras = available.filter(o => (Number(o?.valor_extra) || 0) === 0);

    // ✅ Só pré-seleciona quando houver UMA única opção com extra 0
    if (zeroExtras.length === 1) {
      initial[g.nome] = [zeroExtras[0]];
    } else {
      initial[g.nome] = []; // começa sem seleção
    }
  }

  setCustomization({
    quantity: 1,
    observations: '',
    options: initial
  });

  setShowModal(true);
};

const openResumoDrawer = () => {
  setIsHistoryOpen(true);
  setIsFetchingResumo(true);
  setComandaResumo(null);
  // ⬇️ Dispara o pedido do resumo para esta comanda
  socketRef.current?.emit("get_cardapio", String(comanda));
};

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedItem(null);
  };


  const renderPayChoiceModal = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
    <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Como você quer continuar?</h2>
        <button onClick={() => setShowPayChoice(false)} className="p-2 rounded-full hover:bg-gray-200">
          <X size={20}/>
        </button>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => setShowPayChoice(false)}
          className="w-full py-3 px-4 rounded-xl border border-gray-300 hover:bg-gray-50 font-semibold"
        >
          Continuar comprando
        </button>
      </div>
    </div>
  </div>
);

const renderPixCheckoutModal = () => (
  <div className="fixed inset-0 z-[60] bg-white">
    {/* Header */}
    <div className="flex items-center justify-between p-4 border-b">
      <button onClick={() => setShowPixCheckout(false)} className="flex items-center gap-2 font-semibold">
        <ArrowLeft size={18} /> Voltar
      </button>
      <div className="font-bold">Pix</div>
      <button onClick={() => setShowPixCheckout(false)} className="p-2 rounded-full hover:bg-gray-100">
        <X size={18} />
      </button>
    </div>

    {/* Conteúdo */}
    <div className="max-w-screen-sm mx-auto p-6 space-y-6">
      {/* Total */}
      <div className="mb-2">
        <div className="text-sm text-gray-600">Total</div>
        <div className="text-3xl font-extrabold">R$ {total.toFixed(2).replace('.', ',')}</div>
      </div>

      {/* Resumo do pedido (somente leitura) */}
      <div>
        <h3 className="text-lg font-bold text-gray-800 mb-3">Seu Pedido</h3>
        <ul className="space-y-3">
          {cart.map((item) => (
            <li
              key={item.uniqueId}
              className="flex items-center justify-between bg-gray-50 p-3 rounded-lg"
            >
              <div className="flex items-center space-x-3 flex-grow">
                <img
                  src={item.image}
                  alt={item.name
                    .toLowerCase()
                    .split(' ')
                    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ')}
                  className="w-12 h-12 object-cover rounded-md"
                />
                <div className="flex flex-col">
                  <span className="font-semibold text-gray-800">
                    {item.name
                      .toLowerCase()
                      .split(' ')
                      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(' ')}
                  </span>

                  {item.selectedOptions && Object.keys(item.selectedOptions).length > 0 && (
                    <span className="text-xs text-gray-500">
                      {formatSelections(item.selectedOptions)}
                    </span>
                  )}

                  {item.observations && (
                    <span className="text-xs text-gray-500 mt-1">Obs: {item.observations}</span>
                  )}

                  <span className="text-sm text-gray-500 mt-1">
                    R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>

              {/* Somente exibição da quantidade (sem ações) */}
              <div className="ml-3">
                <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded-full bg-green-100 text-green-700 text-sm font-bold">
                  {item.quantity}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Gerar QR */}
      {!pixQR && (
        <button
          onClick={generatePix}
          disabled={pixLoading}
          className="w-full py-4 px-6 bg-black text-white font-semibold rounded-2xl shadow hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {pixLoading ? 'Gerando QR...' : (<><QrCode size={20} /> Gerar QR Code</>)}
        </button>
      )}

      {/* QR & Copia e Cola */}
      {pixQR && (
        <div className="mt-2 flex flex-col items-center">
          <img src={pixQR} alt="QR Pix" className="w-56 h-56 rounded-lg shadow" />
          <div className="w-full mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Pix Copia e Cola</label>
            <textarea
              readOnly
              value={pixPayload || ''}
              className="w-full h-28 p-3 border rounded-xl bg-gray-50 text-sm"
            />
            <div className="mt-3 flex gap-3">
              <button
                onClick={copyPixCode}
                className="flex-1 py-3 rounded-xl border font-semibold flex items-center justify-center gap-2 hover:bg-gray-50"
              >
                <Copy size={18} /> Copiar código
              </button>
              <a
                href={pixQR}
                download={`pix_${currentOrderId}.png`}
                className="flex-1 py-3 rounded-xl bg-black text-white font-semibold text-center hover:opacity-90"
              >
                Baixar QR
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
);



  const handleAddToCartFromModal = () => {
    if (!selectedItem) return;
  
    const groups: OptionGroup[] = parseItemOptions(selectedItem.options);
  
    // 🔒 Verifica grupos obrigatórios sem seleção
    const faltando = groups
      .filter(g => g.obrigatorio)
      .filter(g => !((customization.options as Selections)?.[g.nome]?.length));
  
    if (faltando.length > 0) {
      // Mostra aviso e bloqueia
      alert(
        `Selecione ao menos uma opção nos grupos obrigatórios: ${faltando
          .map(g => g.nome)
          .join(", ")}`
      );
      return;
    }
  
    const extras = computeExtrasFromSelections(customization.options as Selections);
    const normalizedSelections = (customization.options || {}) as Selections;
    const uniqueId = `${selectedItem.id}-${stableOptionsJson(normalizedSelections)}`;
  
    setCart(prevCart => {
      const existingItem = prevCart.find((ci: any) => ci.uniqueId === uniqueId);
      if (existingItem) {
        return prevCart.map((ci: any) =>
          ci.uniqueId === uniqueId
            ? { ...ci, quantity: ci.quantity + customization.quantity }
            : ci
        );
      } else {
        return [
          ...prevCart,
          {
            ...selectedItem,
            uniqueId,
            quantity: customization.quantity,
            selectedOptions: normalizedSelections,
            observations: customization.observations,
            price: Number(selectedItem.price) + extras
          }
        ];
      }
    });
  
    handleCloseModal();
  };
  
  





  const handleUpdateQuantity = (change) => {
    setCustomization(prev => ({
      ...prev,
      quantity: Math.max(1, prev.quantity + change)
    }));
  };

  const handleRemoveFromCart = (uniqueId) => {
    setCart(prevCart => {
      const newCart = prevCart.filter(item => item.uniqueId !== uniqueId);
      if (newCart.length === 0) {
        setShowOrderConfirmation(false);
      }
      return newCart;
    });
  };

  const handleDecrementQuantity = (uniqueId) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(cartItem => cartItem.uniqueId === uniqueId);
      if (!existingItem) return prevCart;

      if (existingItem.quantity === 1) {
        const newCart = prevCart.filter(item => item.uniqueId !== uniqueId);
        if (newCart.length === 0) {
          setShowOrderConfirmation(false);
        }
        return newCart;
      } else {
        return prevCart.map(cartItem =>
          cartItem.uniqueId === uniqueId
            ? { ...cartItem, quantity: cartItem.quantity - 1 }
            : cartItem
        );
      }
    });
  };

  const handleIncrementQuantity = (uniqueId) => {
    setCart(prevCart => {
      return prevCart.map(cartItem =>
        cartItem.uniqueId === uniqueId
          ? { ...cartItem, quantity: cartItem.quantity + 1 }
          : cartItem
      );
    });
  };

  const handleConfirmOrder = () => {
      console.log("Pedido confirmado:", cart);
      socketRef.current?.emit('enviar_pedido_on_qr',cart,comanda,authToken)
      const totalNow = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const order = {
        id: Date.now(),
        comanda,
        createdAt: new Date().toISOString(),
        items: cart,
        total: totalNow,
        status: 'enviado', // você pode atualizar depois via socket
      };

      setCart([])
      setShowOrderConfirmation(false);
      alert('Pedido Enviado ✅')
  };

  const handleCallAttendant = () => {
      // Simulação da chamada do atendente.
      alert("Atendente a caminho! Aguarde por favor.");
      // Em uma aplicação real, você faria um `socket.emit('callAttendant', { table: 'Mesa 12' })`
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);


  const renderFilters = () => (
    <div className="flex flex-col items-center">
      <div className="w-full flex justify-center items-center space-x-2 md:space-x-4 mb-4 overflow-x-auto pb-2 px-4 md:px-0 whitespace-nowrap overscroll-x-contain">
        {mainFilters.map(filter => (
          <button
            key={filter.key}
            onClick={() => {
              setSelectedMainCategory(filter.key);
              setSelectedSubCategory('all');
            }}
            className={`flex items-center space-x-2 px-6 py-3 rounded-full font-semibold transition-all duration-300 ${
              selectedMainCategory === filter.key
                ? 'bg-green-600 text-white shadow-lg'
                : 'bg-white text-gray-700 hover:bg-green-100'
            }`}
          >
            {filter.icon}
            <span>{filter.label}</span>
          </button>
        ))}
      </div>
      
      {selectedMainCategory !== 'all' && (
  <div className="relative w-full mb-8 px-4 md:px-0">
    {/* faixa horizontal com scroll */}
    <div
      ref={subStripRef}
      className="w-full flex items-center space-x-2 md:space-x-4 overflow-x-auto pb-2
                 whitespace-nowrap overscroll-x-contain scroll-smooth"
      style={{ scrollbarWidth: 'thin' }}
      onScroll={updateArrows}
    >
      {subFilters.map(filter => (
        <button
          key={filter.key}
          onClick={() => setSelectedSubCategory(filter.key)}
          className={`shrink-0 inline-flex items-center space-x-2 px-3 py-2 md:px-4 md:py-2
                      rounded-full font-semibold transition-all duration-300 text-sm
                      ${selectedSubCategory === filter.key
                        ? 'bg-green-600 text-white shadow-lg'
                        : 'bg-white text-gray-700 hover:bg-green-100'}`}
        >
          <span className="max-w-[14ch] md:max-w-none truncate">{filter.label}</span>
        </button>
      ))}
    </div>

    {/* FADE esquerdo */}
    {canLeft && (
      <div className="pointer-events-none absolute inset-y-0 left-0 w-10
                      bg-gradient-to-r from-white to-transparent" />
    )}
    {/* FADE direito */}
    {canRight && (
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10
                      bg-gradient-to-l from-white to-transparent" />
    )}

    {/* SETA esquerda */}
    {canLeft && (
      <button
        onClick={() => subStripRef.current?.scrollBy({ left: -220, behavior: 'smooth' })}
        className="absolute left-1 top-1/2 -translate-y-1/2 z-10
                   rounded-full bg-white/90 shadow p-2 hover:bg-white"
        aria-label="Ver anteriores"
      >
        <ChevronUp className="-rotate-90" size={18} />
      </button>
    )}

    {/* SETA direita */}
    {canRight && (
      <button
        onClick={() => subStripRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
        className="absolute right-1 top-1/2 -translate-y-1/2 z-10
                   rounded-full bg-white/90 shadow p-2 hover:bg-white"
        aria-label="Ver mais"
      >
        <ChevronUp className="rotate-90" size={18} />
      </button>
    )}

    {/* DICA “deslize →” só na primeira visita */}
    {showSwipeHint && canRight && (
      <div className="absolute right-4 -bottom-1 text-xs text-gray-600 bg-white/80
                      px-2 py-1 rounded-full shadow animate-pulse select-none">
        deslize →
      </div>
    )}
  </div>
)}


    </div>
  );

  const renderCustomizationModal = () => {
  if (!selectedItem) return null;
  const groups: OptionGroup[] = parseItemOptions(selectedItem.options);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto transform transition-all duration-300 scale-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800">
            {selectedItem.name.toLowerCase().split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
          </h2>
          <button onClick={handleCloseModal} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
            <X size={24} />
          </button>
        </div>

        <img
          src={selectedItem.image}
          alt={selectedItem.name}
          className="w-full h-48 object-cover rounded-xl mb-4"
        />

        <div className="space-y-4 mb-6">
        {groups.map((group) => {
            const selectedArr = customization.options?.[group.nome] || [];
            const max = Number.isFinite(group.max_selected) && (group.max_selected as number) > 0
              ? (group.max_selected as number)
              : 1;

            const isMissingRequired = !!group.obrigatorio && selectedArr.length === 0; // 👈 NOVO

            return (
              <div key={group.nome} className="mb-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-gray-700 capitalize mb-2 flex items-center gap-2">
                    {group.nome}
                    {group.obrigatorio && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        obrigatório
                      </span>
                    )}
                  </h4>
                  <span className={`text-xs ${isMissingRequired ? 'text-red-600' : 'text-gray-500'}`}>
                    {selectedArr.length}/{max} selecionado{max > 1 ? 's' : ''}
                  </span>
                </div>


                <div className="flex flex-wrap gap-2">
                {group.options.map((opt) => {
                  const selected = selectedArr.some(o => o.nome === opt.nome);
                  const extra = Number(opt.valor_extra) || 0;
                  const labelExtra = extra > 0
                    ? ` (+ R$ ${extra.toFixed(2).replace('.', ',')})`
                    : '';
                  const soldOut = !!opt.esgotado;

                  return (
                    <button
                      key={opt.nome}
                      disabled={soldOut}
                      onClick={() => setCustomization(prev => ({
                        ...prev,
                        options: toggleSelection(prev.options as Selections, group, opt)
                      }))}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors
                        ${soldOut
                          ? 'bg-gray-200 text-gray-400 line-through cursor-not-allowed opacity-60'
                          : selected
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      title={soldOut ? 'Opção esgotada' : undefined}
                    >
                      {toTitleCase(opt.nome)}{labelExtra}
                      {soldOut && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 align-middle">
                          Esgotado
                        </span>
                      )}
                    </button>
                  );
                })}


                </div>
              </div>
            );
          })}

          {/* Observações */}
          <div>
            <h4 className="font-semibold text-gray-700 mb-2">Observações:</h4>
            <textarea
              value={customization.observations}
              onChange={(e) => setCustomization(prev => ({ ...prev, observations: e.target.value }))}
              placeholder="Ex: sem açúcar ..."
              rows={3}
              className="w-full p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-600 transition-all"
            />
          </div>

          {/* Quantidade */}
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-700">Quantidade:</span>
            <div className="flex items-center space-x-2">
              <button onClick={() => handleUpdateQuantity(-1)} className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors">
                <Minus size={16} />
              </button>
              <span className="font-bold text-lg">{customization.quantity}</span>
              <button onClick={() => handleUpdateQuantity(1)} className="p-2 rounded-full bg-green-200 hover:bg-green-300 transition-colors">
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={handleAddToCartFromModal}
          disabled={(() => {
            const groupsReq = groups.filter(g => g.obrigatorio);
            return groupsReq.some(g => !(customization.options as Selections)?.[g.nome]?.length);
          })()}
          className={`w-full py-4 px-6 rounded-2xl shadow-xl transition-all duration-300
            ${
              (() => {
                const groupsReq = groups.filter(g => g.obrigatorio);
                const pend = groupsReq.some(g => !(customization.options as Selections)?.[g.nome]?.length);
                return pend ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700';
              })()
            }`}
        >
          {(() => {
            const groupsReq = groups.filter(g => g.obrigatorio);
            const pend = groupsReq.some(g => !(customization.options as Selections)?.[g.nome]?.length);

            if (pend) {
              return <>Selecione as opções obrigatórias</>;
            } else {
              const extras = computeExtrasFromSelections(customization.options as Selections);
              const finalPrice = (Number(selectedItem.price) + extras) * customization.quantity;
              return <>Adicionar ao Pedido (R$ {finalPrice.toFixed(2).replace('.', ',')})</>;
            }
          })()}
        </button>

      </div>
    </div>
  );
};


  const renderOrderConfirmationModal = () => {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
        <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto transform transition-all duration-300 scale-100">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-800">Seu Pedido</h2>
            <button onClick={() => setShowOrderConfirmation(false)} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
              <X size={24} /> 
            </button>
          </div>
          
          <div className="space-y-4 mb-6">
            {cart.map(item => (
              <li key={item.uniqueId} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center space-x-3 flex-grow">
                  <img src={item.image} alt={item.name.toLowerCase().split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")} className="w-12 h-12 object-cover rounded-md" />
                  <div className="flex flex-col">
                    <span className="font-semibold text-gray-800">{item.name.toLowerCase().split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")}</span>
                    {item.selectedOptions && Object.keys(item.selectedOptions).length > 0 && (
                    <span className="text-xs text-gray-500">
                      {formatSelections(item.selectedOptions)}
                    </span>
                  )}

                    {item.observations && (
                      <span className="text-xs text-gray-500 mt-1">Obs: {item.observations}</span>
                    )}
                    <span className="text-sm text-gray-500 mt-1">R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button onClick={() => handleDecrementQuantity(item.uniqueId)} className="p-1 rounded-full text-green-600 bg-green-100 hover:bg-green-200"><Minus size={16} /></button>
                  <span className="font-bold">{item.quantity}</span>
                  <button onClick={() => handleIncrementQuantity(item.uniqueId)} className="p-1 rounded-full text-green-600 bg-green-100 hover:bg-green-200"><Plus size={16} /></button>
                  <button onClick={() => handleRemoveFromCart(item.uniqueId)} className="p-1 rounded-full text-red-600 bg-red-100 hover:bg-red-200 ml-2"><Trash2 size={16} /></button>
                </div>
              </li>
            ))}
          </div>

          <div className="flex justify-between items-center font-bold text-xl mb-6">
            <span>Total:</span>
            <span>R$ {total.toFixed(2).replace('.', ',')}</span>
          </div>

          <button
            onClick={handleConfirmOrder}
            className="w-full py-4 px-6 bg-green-600 text-white font-semibold rounded-2xl shadow-xl hover:bg-green-700 transition-all duration-300"
          >
            Confirmar Pedido
          </button>
        </div>
      </div>
    );
  };

  
  return (
  <div className="min-h-screen flex flex-col bg-gradient-to-br from-green-100 to-white font-sans text-gray-800 overflow-x-hidden">
     <header className="p-6 md:p-8 bg-gradient-to-r from-green-600 via-green-700 to-green-800 text-white text-center shadow-lg relative">
     <button
        onClick={openResumoDrawer}
        className="absolute top-6 left-6 bg-white/20 backdrop-blur-sm px-3 py-2 rounded-full text-white hover:bg-white/30 transition-colors duration-300 shadow-lg flex items-center space-x-2"
        aria-label="Abrir histórico de pedidos"
      >
        <Menu size={24} />
      </button>
     
      <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">NossoPoint</h1>
      <p className="mt-2 text-base md:text-lg opacity-80">Seu pedido na areia da praia.</p>

      {/* DESKTOP/TABLET: continua no header */}
      <button
        onClick={handleCallAttendant}
        className="hidden md:flex absolute top-6 right-6 bg-white/20 backdrop-blur-sm px-3 py-2 rounded-full text-white hover:bg-white/30 transition-colors duration-300 shadow-lg items-center space-x-2"
      >
        <Bell size={24} />
        <span className="font-medium">Chamar Atendente</span>
      </button>
    </header>

    {/* MOBILE: FAB (fora do header, com animação de entrada) */}
    <button
      onClick={handleCallAttendant}
      className={`
        md:hidden fixed z-50 top-3 right-4
        rounded-full shadow-xl px-4 py-3 bg-green-600 text-white
        flex items-center space-x-2
        transition-all duration-500 ease-out
        ${showAttendantBtn ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'}
      `}
      aria-label="Chamar atendente"
    >
      <Bell size={20} />
      <span className="font-semibold">Atendente</span>
    </button>


      <main className="flex-grow p-4 md:p-8">
        {renderFilters()}
        
        {isLoading ? (
          <div className="flex justify-center items-center h-64 text-gray-500">
            <p>Carregando cardápio...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredMenu.map(item => (
              <div
                key={item.id}
                className="bg-white rounded-2xl shadow-md overflow-hidden transform transition-all duration-300 hover:scale-[1.02] cursor-pointer"
                onClick={() => handleOpenModal(item)}
              >
                <div className="relative w-full h-32 sm:h-40 overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.name.toLowerCase().split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")}
                    className="w-full h-full object-cover transition-transform duration-300 hover:scale-110"
                  />
                  <div className="absolute top-2 right-2 bg-green-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md">
                    {item.subCategoria ? item.subCategoria.toUpperCase().replace('-', ' ') : 'ITEM'}
                  </div>
                  {hasPromo(item) && (
                  <div className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-md">
                    Promo
                  </div>
                )}

                </div>
                <div className="p-3 flex flex-col">
                  <h3 className="text-sm font-bold">{item.name.toLowerCase().split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")}</h3>
                  
                  {(() => {
                  const promo = hasPromo(item);
                  const apartir = hasAnyExtra(item.options); // 👈 novo
                  const prefix = apartir ? 'A partir de ' : '';

                  return promo ? (
                    <div className="text-xs mt-1 flex items-baseline gap-1">
                      <span className="text-gray-400 line-through">
                        {formatBRL(getOriginalPrice(item))}
                      </span>
                      <span className="text-gray-900 font-semibold">
                        {prefix}{formatBRL(getPrice(item))}
                      </span>
                    </div>
                  ) : (
                    <p className="text-gray-600 text-xs mt-1">
                      {prefix}{formatBRL(getPrice(item))}
                    </p>
                  );
})()}




                  <div className="mt-2">
                  <button
                      className="w-full py-2 px-3 bg-green-600 text-white text-xs font-semibold rounded-xl shadow hover:bg-green-700 transition-colors"
                      onClick={(e) => { e.stopPropagation(); handleOpenModal(item); }}
                    >
                      Escolher
                    </button>

                  </div>
                </div>
              </div>
            ))}
          </div>

        )}
      </main>

      {/* Barra de Carrinho Flutuante */}
      {cart.length > 0 && (
  <div
    onClick={() => setShowOrderConfirmation(true)}
    className="fixed bottom-0 left-0 right-0 bg-white shadow-2xl rounded-t-3xl p-4 sm:p-6 transition-transform duration-300 transform translate-y-0 cursor-pointer z-40"
  >
    <div className="max-w-screen-lg mx-auto flex justify-between items-center">
      <div className="flex-1 flex items-center space-x-4">
        <ShoppingCart size={28} className="text-green-600" />
        <div className="flex flex-col">
          <span className="text-sm text-gray-600">Total do Pedido:</span>
          <span className="text-2xl font-bold text-gray-900">R$ {total.toFixed(2).replace('.', ',')}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col sm:flex-row justify-end items-center space-y-2 sm:space-y-0 sm:space-x-4">

        {/* FAZER PEDIDO -> mantém fluxo atual */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowOrderConfirmation(true); }}
          className="w-full sm:w-auto px-6 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors"
        >
          Fazer Pedido
        </button>
      </div>
    </div>
  </div>
)}



      
      {showModal && renderCustomizationModal()}
      {showOrderConfirmation && renderOrderConfirmationModal()}
      {showPayChoice && renderPayChoiceModal()}
      {showPixCheckout && renderPixCheckoutModal()}
      {isHistoryOpen && (
        <div
          onClick={() => setIsHistoryOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        />
      )}
      <div
  className={`fixed z-50 top-0 left-0 h-full w-80 max-w-[85vw] bg-white shadow-2xl transition-transform duration-300
    ${isHistoryOpen ? 'translate-x-0' : '-translate-x-full'}`}
  style={{ willChange: 'transform' }}
>
  <div className="p-4 border-b flex items-center justify-between">
    <h3 className="text-xl font-bold text-gray-800">Meus Pedidos</h3>
    <button
      onClick={() => setIsHistoryOpen(false)}
      className="p-2 rounded-full hover:bg-gray-100 transition-colors"
      aria-label="Fechar histórico"
    >
      <X size={20} />
    </button>
  </div>

  <div className="h-[calc(100%-64px)] overflow-y-auto p-4 space-y-4">
  <div className="h-[calc(100%-64px)] overflow-y-auto p-4 space-y-4">
  {/* Cabeçalho da comanda */}
  <div className="rounded-xl p-3 bg-gray-50">
    <p className="text-sm text-gray-600">
      Comanda: <span className="font-semibold">{comanda || "-"}</span>
    </p>

    {isFetchingResumo && (
      <p className="text-sm text-gray-500 mt-2">Carregando consumo...</p>
    )}

    {comandaResumo && (
      <>
        {/* Totais */}
        <div className="grid grid-cols-3 gap-2 mt-3 text-sm">
          <div className="p-2 rounded-lg bg-white border">
            <div className="text-gray-500">Total</div>
            <div className="font-semibold">
              {formatBRL(comandaResumo.preco_total)}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-white border">
            <div className="text-gray-500">Pago</div>
            <div className="font-semibold">
              {formatBRL(comandaResumo.preco_pago)}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-white border">
            <div className="text-gray-500">A pagar</div>
            <div className="font-semibold">
              {formatBRL(comandaResumo.preco_a_pagar)}
            </div>
          </div>
        </div>

        {/* Nomes associados (se houver) */}
        {comandaResumo.nomes?.length > 0 && (
          <p className="text-xs text-gray-500 mt-2">
            Pessoas na comanda:{" "}
            <span className="font-medium">
              {comandaResumo.nomes.map(n => n?.nome).filter(Boolean).join(", ")}
            </span>
          </p>
        )}
      </>
    )}
  </div>

  {/* Lista dos itens abertos */}
  {comandaResumo && comandaResumo.dados?.length > 0 ? (
    <ul className="divide-y rounded-xl bg-white border">
      {comandaResumo.dados.map((row: any) => {
        const nome = row?.pedido || "Item";
        const extra = row?.extra ? ` (${row.extra})` : "";
        const qtd = Number(row?.quantidade || 0);
        const qtdPaga = Number(row?.quantidade_paga || 0);
        const restante = Math.max(0, qtd - qtdPaga);
        const preco = Number(row?.preco || 0);

        return (
          <li
            key={`${row?.pedido}-${row?.id}-${row?.preco}`}
            className="py-2 px-3 flex items-center justify-between"
          >
            <div className="pr-3">
              <div className="text-sm font-medium">
                {toTitleCase(nome)}
                {extra}
              </div>
              <div className="text-xs text-gray-500">
                Qtd: {qtd}
                {qtdPaga > 0 && (
                  <> • Pago: {qtdPaga} • Restante: {restante}</>
                )}
              </div>
            </div>
            <div className="text-sm font-semibold">
              {formatBRL(preco)}
            </div>
          </li>
        );
      })}
    </ul>
  ) : (
    !isFetchingResumo && (
      <p className="text-sm text-gray-500">
        Nenhum consumo aberto encontrado para esta comanda.
      </p>
    )
  )}
</div>

  </div>
  </div>
    </div>
    
  );
};

export default App;
