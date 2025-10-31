import { BrowserRouter, Routes, Route } from "react-router-dom";
// importe seus componentes/páginas
import Login from "./login";
//import Carrinho from "./Carrinho";
import Cardapio from "./cardapio";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<h1>Home</h1>} />
        <Route path="/login" element={<Login />} />
        {/*<Route path="/carrinho" element={<Carrinho />} />*/}
        <Route path="/cardapio" element={<Cardapio />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
