import { Suspense } from "react";
import { RadarGlyph } from "@/components/radar-glyph";
import { LoginForm } from "./login-form";

export const metadata = { title: "Logga in – GRODT" };

export default function LoginPage() {
  return (
    <div className="login-screen">
      <div className="login-rings" aria-hidden="true">
        <svg width="720" height="720" viewBox="0 0 720 720" fill="none">
          <circle cx="360" cy="360" r="340" stroke="#2A4437" strokeWidth="1" />
          <circle cx="360" cy="360" r="250" stroke="#2A4437" strokeWidth="1" />
          <circle cx="360" cy="360" r="160" stroke="#2A4437" strokeWidth="1" />
          <circle cx="510" cy="240" r="4" fill="#C9921A" />
          <circle cx="250" cy="480" r="3" fill="#6FA293" />
        </svg>
      </div>
      <div className="login-card">
        <div className="brandline">
          <span style={{ color: "#1E252B" }}>
            <RadarGlyph size={34} live />
          </span>
          <span className="wordmark">GRODT</span>
        </div>
        <p className="tagline">Get rich or die trying</p>
        <Suspense>
          <LoginForm />
        </Suspense>
        <p className="foot">Internt verktyg. Konton skapas av administratör.</p>
      </div>
    </div>
  );
}
