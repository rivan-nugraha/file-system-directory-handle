import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Barang from './pages/Barang';
import Jual from './pages/Jual';
import Beli from './pages/Beli';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/barang" replace />} />
          <Route path="/barang" element={<Barang />} />
          <Route path="/jual" element={<Jual />} />
          <Route path="/beli" element={<Beli />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
