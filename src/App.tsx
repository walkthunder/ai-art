import { Routes, Route } from "react-router-dom";
import LandingPage from "@/pages/LandingPage";
import GeneratorPage from "@/pages/GeneratorPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/generator" element={<GeneratorPage />} />
    </Routes>
  );
}
