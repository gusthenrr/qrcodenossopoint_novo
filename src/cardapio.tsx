import React, { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Utensils, Beer, Wine, Plus, Minus, X, Trash2, ChevronUp, Hamburger, ChefHat, Bell, Menu } from 'lucide-react';
import { io, Socket } from "socket.io-client";
import { replace, useNavigate,useSearchParams } from 'react-router-dom';

// Dados simulados do cardápio, que seriam recebidos via Socket.IO
// Agora com uma estrutura mais detalhada para as opções de customização


const App = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [menu, setMenu] = useState([]);
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
  const keyParams = 'niohi---f--f3k3kk-3fk-3k-k3c03fk30fkm3h8gh3f43whiohoweimxomwomxowmowndioocwniocjwcwj~sdsddw';

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [orderHistory, setOrderHistory] = useState(() => {
    // carrega do localStorage ao iniciar
  try {
    const raw = localStorage.getItem('orderHistory');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
  });

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
  
  const isMultiKey = (key: string) =>
  key === 'Complementos' || key === 'Adicionais' || key === 'Frutas';

  const maxSelectionsForKey = (key: string) => (key === 'Frutas' ? 2 : Infinity);

  // parse de extra: "morango +30"
  const parseExtra = (option: string): number => {
    const m = option.match(/\+(\d+(?:[\.,]\d+)*)/); // aceita 30 ou 30.50
    return m ? parseFloat(m[1].replace(',', '.')) : 0;
  };

  // normaliza options para string[] (mesmo que seja single)
  const normToArray = (v: any): string[] =>
    Array.isArray(v) ? v : (v ? [v] : []);

  const minSelectionsForKey = (key: string) => (key === 'Frutas' ? 1 : 0);

  const toggleOption = (
    prevOptions: any,
    key: string,
    option: string,
    allOptionsForKey: string[]
  ) => {
    const isMulti = isMultiKey(key);
    const limit = maxSelectionsForKey(key);
    const minSel = minSelectionsForKey(key);

    const isNone = option.toLowerCase() === 'nenhum';
    let current = normToArray(prevOptions[key] ?? []);
    const hasNone = current.some(o => o.toLowerCase() === 'nenhum');

    // REGRA: 'nenhum' não é válido para Frutas (Frutas exige >=1 real)
    if (key === 'Frutas' && isNone) {
      return prevOptions; // ignora clique em 'nenhum' para Frutas
    }

    if (isNone) {
      // 'nenhum' é exclusivo nas outras keys
      return { ...prevOptions, [key]: ['nenhum'] };
    }

    // se tinha 'nenhum' e clicou outra, remove 'nenhum'
    if (hasNone) current = [];

    const already = current.includes(option);

    if (isMulti) {
      if (already) {
        // desmarcar
        const next = current.filter(o => o !== option);
        // GARANTE mínimo para Frutas
        if (key === 'Frutas' && next.length < minSel) {
          return prevOptions; // não deixa remover a última
        }
        current = next;
      } else {
        // adicionar respeitando limite
        if (current.length < limit) {
          current = [...current, option];
        } else {
          // estourou limite: substitui o último pelo novo
          current = [...current.slice(0, limit - 1), option];
        }
      }
    } else {
      // single-select
      current = [option];
    }

    // se ficar vazio e existir 'nenhum', pode setar 'nenhum' (exceto Frutas)
    if (
      current.length === 0 &&
      key !== 'Frutas' &&
      allOptionsForKey.some(o => o.toLowerCase() === 'nenhum')
    ) {
      current = ['nenhum'];
    }

    return { ...prevOptions, [key]: isMulti ? current : current[0] };
  };


  // soma extras considerando string | string[]
  const computeExtrasFromOptions = (optionsObj: any): number => {
    return Object.values(optionsObj || {}).reduce((sum, v: any) => {
      const arr = normToArray(v);
      return sum + arr.reduce((s, opt) => s + parseExtra(String(opt)), 0);
    }, 0);
  };

  // gera ID estável para o carrinho (ordena arrays)
  const stableOptionsJson = (optionsObj: any) => {
    const sorted: Record<string, any> = {};
    Object.keys(optionsObj || {}).sort().forEach(k => {
      const v = optionsObj[k];
      sorted[k] = Array.isArray(v) ? [...v].sort() : v;
    });
    return JSON.stringify(sorted);
  };
  useEffect(()=>{
    const token = localStorage.getItem("authToken");  
    if (!token) {
      navigate(`/login${keyParams}=${params.get(keyParams)}`,{replace:true}); // volta se não estiver logado
}

  })
  useEffect(() => {
    const timer = setTimeout(() => setShowAttendantBtn(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('orderHistory', JSON.stringify(orderHistory));
    } catch {}
  }, [orderHistory]);

  useEffect(() => {
    const numero = params.get(keyParams);
    const fator = 1440068
    const menos = 7493274
    
    if (numero){
    const mesa = (Number(numero)-menos)/fator
    if (!mesa && !isNaN(Number(mesa)) && Number(mesa) >= 81 && Number(mesa) <= -1){
      navigate('/login',{replace:true})
    }
    else{
      setComanda(String(mesa))
    }
    }
    else{
      navigate('/login',{replace:true})
    }
    
  },[params,navigate])
  useEffect(() => {
    // cria a conexão com o servidor (ajuste a URL para o seu backend Flask/Node)
     if (!socketRef.current) {
    socketRef.current = io("https://flask-backend-server-yxom.onrender.com", {
      transports: ["websocket"],
    });
    }
    // Exemplo: escutar um evento chamado "menuData"
    socketRef.current?.on("menuData", (menuData) => {
      console.log('entrou',menuData)
      setMenu(menuData);
      setFilteredMenu(menuData);
      setIsLoading(false);
    });
    socketRef.current?.emit('buscar_menu_data',false)

    // cleanup para fechar a conexão quando desmontar o componente
    return () => {
      socketRef.current?.disconnect()
      socketRef.current = null
    };
  }, []);

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


  const handleOpenModal = (item) => {
    setSelectedItem(item);

    const initialOptions = item.options
      ? Object.keys(item.options).reduce((acc, key) => {
          const opts: string[] = item.options[key] || [];
          const hasNone = opts.some(o => o.toLowerCase() === 'nenhum');

          if (isMultiKey(key)) {
            // multi começa vazio (ou 'nenhum' se existir)
            acc[key] = hasNone ? ['nenhum'] : [];
          } else {
            // single começa na primeira opção (ou vazio)
            acc[key] = opts[0] ?? '';
          }
          return acc;
        }, {} as Record<string, any>)
      : {};

    setCustomization({
      quantity: 1,
      observations: '',
      options: initialOptions
    });
    setShowModal(true);
  };


  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedItem(null);
  };

  const handleAddToCartFromModal = () => {
  if (!selectedItem) return;

  const extras = computeExtrasFromOptions(customization.options);
  const normalizedOptions = customization.options || {};
  const uniqueId = `${selectedItem.id}-${stableOptionsJson(normalizedOptions)}`;

  setCart(prevCart => {
    const existingItem = prevCart.find(cartItem => cartItem.uniqueId === uniqueId);
    if (existingItem) {
      return prevCart.map(cartItem =>
        cartItem.uniqueId === uniqueId
          ? { ...cartItem, quantity: cartItem.quantity + customization.quantity }
          : cartItem
      );
    } else {
      return [
        ...prevCart,
        {
          ...selectedItem,
          uniqueId,
          quantity: customization.quantity,
          selectedOptions: normalizedOptions, // pode ser string ou string[]
          observations: customization.observations,
          price: selectedItem.price + extras // base + extras já calculados
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
      socketRef.current?.emit('enviar_pedido_on_qr',cart,comanda)
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
      setOrderHistory(prev => [order, ...prev]);
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

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
        <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto transform transition-all duration-300 scale-100">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-800">{selectedItem.name.toLowerCase().split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")}</h2>
            <button onClick={handleCloseModal} className="p-2 rounded-full hover:bg-gray-200 transition-colors">
              <X size={24} />
            </button>
          </div>
          <img src={selectedItem.image} alt={selectedItem.name.toLowerCase().split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")} className="w-full h-48 object-cover rounded-xl mb-4" />
          
          <div className="space-y-4 mb-6">
            {selectedItem.options && Object.keys(selectedItem.options).map(key => (
            <div key={key}>
              <h4 className="font-semibold text-gray-700 capitalize mb-2">{key}:</h4>
              <div className="flex flex-wrap gap-2">
                {selectedItem.options[key].map(option => {
                  const isMulti = isMultiKey(key);
                  const current = customization.options?.[key];
                  const selected = isMulti
                    ? normToArray(current).includes(option)
                    : current === option;

                  return (
                    <button
                      key={option}
                      onClick={() => setCustomization(prev => ({
                        ...prev,
                        options: toggleOption(prev.options || {}, key, option, selectedItem.options[key])
                      }))}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors
                        ${selected ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

            
            {/* Bloco de Observações */}
            <div>
              <h4 className="font-semibold text-gray-700 mb-2">Observações:</h4>
              <textarea
                value={customization.observations}
                onChange={(e) => setCustomization(prev => ({ ...prev, observations: e.target.value }))}
                placeholder="Ex: sem açúcar ..."
                rows="3"
                className="w-full p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-600 transition-all"
              ></textarea>
            </div>

            {/* Contador de Quantidade */}
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
            className="w-full py-4 px-6 bg-green-600 text-white font-semibold rounded-2xl shadow-xl hover:bg-green-700 transition-all duration-300"
          >
           {(() => {
              const extras = computeExtrasFromOptions(customization.options);
              const finalPrice = (selectedItem.price + extras) * customization.quantity;
              return <>Adicionar ao Pedido (R$ {finalPrice.toFixed(2).replace('.', ',')})</>;
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
                        {Object.values(item.selectedOptions)
                          .map(v => normToArray(v).join(', '))
                          .join(' | ')}
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
        onClick={() => setIsHistoryOpen(true)}
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
                </div>
                <div className="p-3 flex flex-col">
                  <h3 className="text-sm font-bold">{item.name.toLowerCase().split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")}</h3>
                  <p className="text-gray-600 text-xs mt-1">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(item.price))}
                  </p>
                  <div className="mt-2">
                    <button className="w-full py-2 px-3 bg-green-600 text-white text-xs font-semibold rounded-xl shadow hover:bg-green-700 transition-colors">
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
          className="fixed bottom-0 left-0 right-0 bg-white shadow-2xl rounded-t-3xl p-4 sm:p-6 transition-transform duration-300 transform translate-y-0 cursor-pointer"
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
              <button className="w-full sm:w-auto px-6 py-3 bg-black text-white font-semibold rounded-xl hover:opacity-80 transition-opacity">
                Pagar no App
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation(); 
                  setShowOrderConfirmation(true);
                }}
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
    {orderHistory.length === 0 ? (
      <p className="text-gray-500 text-sm">Você ainda não fez pedidos.</p>
    ) : (
      orderHistory.map(order => (
        <div key={order.id} className="border rounded-xl p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">
                {new Date(order.createdAt).toLocaleString('pt-BR')}
              </p>
              <p className="text-xs text-gray-500">Comanda: <span className="font-medium">{order.comanda || '-'}</span></p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-semibold">
              {order.status}
            </span>
          </div>

          <ul className="mt-3 space-y-2">
            {order.items.map((it, idx) => (
              <li key={it.uniqueId || idx} className="flex justify-between items-start">
                <div className="pr-2">
                  <p className="text-sm font-semibold text-gray-800">{it.name}</p>
                  {it.selectedOptions && Object.keys(it.selectedOptions).length > 0 && (
                    <p className="text-xs text-gray-500">
                      {Object.values(it.selectedOptions).map(v => normToArray(v).join(', ')).join(' | ')}
                    </p>
                  )}
                  {it.observations && (
                    <p className="text-xs text-gray-500">Obs: {it.observations}</p>
                  )}
                  <p className="text-xs text-gray-500">Qtd: {it.quantity}</p>
                </div>
                <p className="text-sm font-semibold">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
                    .format(Number(it.price) * it.quantity)}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex justify-between items-center border-t pt-2">
            <span className="text-sm text-gray-600">Total</span>
            <span className="text-base font-bold">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
                .format(order.total)}
            </span>
          </div>
        </div>
      ))
    )}
  </div>
  </div>
    </div>
    
  );
};

export default App;
