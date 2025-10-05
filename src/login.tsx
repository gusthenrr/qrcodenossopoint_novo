import React, { useState, useEffect, useRef } from "react";
import { Phone, UserCircle, CheckCircle2, QrCode, LogIn, Loader, XCircle, ChevronDown } from "lucide-react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";

// Lista de países principais com seus códigos e emojis de bandeira.
const mainCountries = [
  { code: "+55", name: "Brasil", flag: "🇧🇷" },
  { code: "+1", name: "Estados Unidos", flag: "🇺🇸" },
  { code: "+54", name: "Argentina", flag: "🇦🇷" },
  { code: "+34", name: "Espanha", flag: "🇪🇸" },
  { code: "+351", name: "Portugal", flag: "🇵🇹" },
];

// Adiciona a opção 'Outro' com um identificador único.
const allCountries = [...mainCountries, { code: "", name: "Outro", flag: "" }];

type Country = { code: string; name: string; flag: string };
type View = "login" | "verify" | "success";

function SuccessView({numero}) {
  const navigate = useNavigate();
  const [params] = useSearchParams()
  const [tableNumber, setTableNumber] = useState('');

useEffect(() => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  (async () => {
    const KEY =
      'niohi---f--f3k3kk-3fk-3k-k3c03fk30fkm3h8gh3f43whiohoweimxomwomxowmowndioocwniocjwcwj~sdsddw';

    const encoded = params.get(KEY);
    if (!encoded) {
      alert('URL inválida');
      navigate('/erro', { replace: true });
      return;
    }

    const FATOR = 1440068;
    const MENOS = 7493274;

    // 1) validar número
    const n = Number(encoded);
    if (!Number.isFinite(n)) {
      alert('URL inválida');
      navigate('/erro', { replace: true });
      return;
    }

    // 2) decodificar mesa e garantir que é inteiro no range
    const mesa = (n - MENOS) / FATOR;
    if (!Number.isInteger(mesa) || mesa < 0 || mesa > 80) {
      alert('URL inválida');
      navigate('/erro', { replace: true });
      return;
    }

    setTableNumber(String(mesa));

    try {
      const resp = await fetch('https://flask-backend-server-yxom.onrender.com/guardar_login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero }),
      });

      const data = await resp.json(); // <— faltava `await` no seu código

      if (!resp.ok) {
        throw new Error(data?.error || 'Falha no login');
      }

      // Se seu backend retorna JWT:
      if (data?.authToken) {
        localStorage.setItem('authToken', data.authToken);
      }

      timeoutId = setTimeout(() => {
        navigate(`/cardapio?${KEY}=${encoded}`, { replace: true });
      }, 2000);
    } catch (e) {
      alert('Ocorreu um erro com o seu login');
      navigate('/erro', { replace: true });
    }
  })();

  // cleanup do setTimeout deve ser retornado SEMPRE do effect
  return () => {
    if (timeoutId) clearTimeout(timeoutId);
  };
}, [navigate, params]);

  return (
    <div className="flex flex-col items-center justify-center text-center p-6 bg-white bg-opacity-80 rounded-2xl shadow-2xl">
      <CheckCircle2 size={64} className="text-green-600 mb-4 animate-bounce" />
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Sucesso!</h2>
      <p className="text-gray-600 mb-6">Bem-vindo ao NossoPoint. Seu login foi realizado com sucesso.</p>
      <div className="bg-green-100 text-green-800 p-4 rounded-xl font-semibold w-full">
        Você está na {tableNumber}.
      </div>
    </div>
  );
}

// Componente principal
const App = () => {
  const [view, setView] = useState<View>("login");
  const [selectedCountry, setSelectedCountry] = useState<Country>(allCountries.find(c => c.code === "+55") as Country);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [tableNumber, setTableNumber] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [cooldown, setCooldown] = useState(0);   
  const navigate = useNavigate(); 
  const [params] = useSearchParams()
  const [nomeCliente, setNomeCliente] = useState('')
  
  useEffect(()=>{
    const tokenAuth = localStorage.getItem('authToken')
    if (tokenAuth){
      const KEY = 'niohi---f--f3k3kk-3fk-3k-k3c03fk30fkm3h8gh3f43whiohoweimxomwomxowmowndioocwniocjwcwj~sdsddw';
      navigate(`/cardapio?${KEY}=${params.get(KEY)}`, {replace:true})
    }
    
  },[navigate,params])

  useEffect(() => {

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);
 
  const isValidPhone = (p: string) => /^\+\d{10,15}$/.test(p);
  // Simula o processo de login.
  const handleLogin = async (e: React.FormEvent) => {
   e.preventDefault();
    setError("");
    const numberWithPrefix = '+55'+phoneNumber
    if (!isValidPhone(numberWithPrefix)) {
      setError("Informe um telefone válido em formato E.164 (ex.: +5511999999999).");
      return;
    }
    try {
      const code = true
      if (code){  
      setIsLoading(true);
      const resp = await fetch(`https://flask-backend-server-yxom.onrender.com/auth/sms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify({ phone:numberWithPrefix }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        // mensagens comuns
        if (resp.status === 429) throw new Error("Muitas tentativas. Aguarde um pouco e tente novamente.");
        if (data?.detail) throw new Error(data.detail);
        throw new Error(`Erro ao enviar SMS (${resp.status}).`);
      }

      // Twilio Verify costuma retornar status "pending" quando enviado
      if (data?.status !== "pending") {
        throw new Error("Não foi possível iniciar a verificação. Tente novamente.");
      }
    }

      setView("verify");
      setCooldown(60); // 60s p/ reenvio
    } catch (err: any) {
      setError(err.message || "Falha ao enviar SMS.");
    } finally {
      setIsLoading(false);
    }
  };

  // Simula a verificação do código.
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!verificationCode.trim()) {
      setError("Digite o código recebido por SMS.");
      return;
    }

    try {
      const code = true
      if (code){
      setIsLoading(true);
      const numberWithPrefix = '+55'+phoneNumber
      const resp = await fetch(`https://flask-backend-server-yxom.onrender.com/auth/sms/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: numberWithPrefix, code:  verificationCode }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (data?.detail) throw new Error(data.detail);
        throw new Error(`Erro na verificação (${resp.status}).`);
      }
      }
      // Backend retorna { status: "approved" } quando o código está certo
      //if (data?.status === "approved") {
      if (1){
        setView("success");
      } else {
        setError("Código de verificação incorreto ou expirado. Tente novamente.");
      }
    } catch (err: any) {
      setError(err.message || "Falha ao verificar código.");
    } finally {
      setIsLoading(false);
    }
  };

  const renderLoginView = () => (
  <form onSubmit={handleLogin} className="w-full flex flex-col items-center">
    {/* INPUT: NOME — mesmo tamanho/padding do telefone */}
    <div className="relative w-full mb-4" ref={dropdownRef}>
      <div className="flex items-center w-full h-14 bg-white bg-opacity-80 rounded-2xl p-4 shadow-lg group focus-within:ring-2 focus-within:ring-green-600 transition-all duration-300">
        <UserCircle size={40} />
        <input
          type="text"
          value={nomeCliente}
          onChange={e => setNomeCliente(e.target.value)}
          placeholder="Seu nome ou apelido"
          className="flex-1 ml-3 text-gray-800 bg-transparent outline-none placeholder-gray-500 text-base leading-6"
        />
      </div>

      {showDropdown && (
        <ul className="absolute z-10 w-full mt-2 bg-white rounded-2xl shadow-xl overflow-hidden animate-fade-in-down">
          {allCountries.map(country => (
            <li
              key={country.code + country.name}
              onClick={() => {
                setSelectedCountry(country as Country);
                setPhoneNumber("");
                setShowDropdown(false);
              }}
              className="flex items-center p-3 cursor-pointer hover:bg-gray-100 transition-colors duration-200"
            >
              {country.flag && <span className="text-xl mr-3">{country.flag}</span>}
              <span className="flex-grow text-gray-700">{country.name}</span>
              <span className="font-medium text-gray-500">{country.code}</span>
            </li>
          ))}
        </ul>
      )}
    </div>

    {/* INPUT: TELEFONE — altura/padding idênticos ao de cima */}
    <div className="flex items-center w-full h-14 bg-white bg-opacity-80 rounded-2xl p-4 shadow-lg group focus-within:ring-2 focus-within:ring-green-600 transition-all duration-300">
      <div
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center space-x-2 px-3 py-2 h-10 cursor-pointer transition-colors duration-200 hover:bg-gray-100 rounded-xl"
      >
        {selectedCountry.flag && <span className="text-2xl">{selectedCountry.flag}</span>}
        <span className="font-semibold text-gray-800">{selectedCountry.code || "+"}</span>
        <ChevronDown
          size={16}
          className={`text-gray-500 transition-transform duration-200 ${showDropdown ? "rotate-180" : "rotate-0"}`}
        />
      </div>

      <input
        type="tel"
        value={phoneNumber}
        onChange={e => setPhoneNumber(e.target.value)}
        placeholder={selectedCountry.code === "" ? "Código do País + Número" : "Número de Telefone"}
        className="flex-1 ml-3 text-gray-800 bg-transparent outline-none placeholder-gray-500 text-base leading-6"
      />
    </div>

    <button
      type="submit"
      className="w-full mt-4 py-4 px-6 bg-green-600 text-white font-semibold rounded-2xl shadow-xl hover:bg-green-700 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-2xl flex items-center justify-center space-x-2"
      disabled={isLoading}
    >
      {isLoading ? <Loader className="animate-spin text-white" /> : (<><LogIn size={20} /><span>Entrar</span></>)}
    </button>
  </form>
);

  const renderVerifyView = () => (
    <form onSubmit={handleVerify} className="w-full flex flex-col items-center">
      <p className="text-sm text-gray-600 mb-6 text-center">Um código de verificação foi enviado para o seu telefone.</p>
      <div className="flex items-center w-full bg-white bg-opacity-80 rounded-2xl mb-6 p-4 shadow-lg group focus-within:ring-2 focus-within:ring-green-600 transition-all duration-300">
        <CheckCircle2 className="text-gray-500 group-focus-within:text-green-600 transition-colors" />
        <input
          type="tel"
          value={verificationCode}
          onChange={e => setVerificationCode(e.target.value)}
          placeholder="Código de Verificação"
          className="flex-grow ml-3 text-gray-800 bg-transparent outline-none placeholder-gray-500 text-center tracking-widest"
          maxLength={6} // número, não string
        />
      </div>
      <button
        type="submit"
        className="w-full py-4 px-6 bg-green-600 text-white font-semibold rounded-2xl shadow-xl hover:bg-green-700 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-2xl flex items-center justify-center space-x-2"
        disabled={isLoading}
      >
        {isLoading ? <Loader className="animate-spin text-white" /> : (<><CheckCircle2 size={20} /><span>Confirmar</span></>)}
      </button>
    </form>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-green-300 via-white to-orange-200 font-sans">
      <div className="w-full max-w-sm bg-white bg-opacity-90 backdrop-blur-sm rounded-3xl p-8 shadow-2xl transform transition-all duration-500 scale-100 hover:scale-105">
        <div className="flex flex-col items-center mb-6">
          <QrCode size={48} className="text-green-600 mb-2" />
          <h1 className="text-4xl font-extrabold text-black">NossoPoint</h1>
          {tableNumber && <div className="mt-2 text-xl fon  t-bold text-green-800">{tableNumber}</div>}
        </div>

        {error && (
          <div className="bg-red-100 text-red-700 p-3 rounded-xl mb-4 flex items-center space-x-2 animate-fade-in">
            <XCircle size={18} />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {view === "login" && renderLoginView()}
        {view === "verify" && renderVerifyView()}
        {view === "success" && <SuccessView numero={phoneNumber} />}
      </div>
    </div>
  );
};

export default App;
